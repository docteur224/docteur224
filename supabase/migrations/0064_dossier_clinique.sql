-- ============================================================
-- Docteur 224 — Dossier clinique (fiche patient, étape 2)
--
-- Trois choses que le praticien ne pouvait consigner nulle part :
--
--   1. ses NOTES DE CONSULTATION, au modèle Motif / Examen / Diagnostic /
--      Conduite à tenir. Privées au sens fort : seul le médecin qui les a
--      écrites les lit — ni le patient, ni l'assistant, ni l'établissement,
--      ni un confrère à qui le dossier a été adressé, ni l'administration.
--      Une note ne se réécrit pas : la modifier crée une VERSION, et les
--      précédentes restent lisibles, avec leur auteur et leur date — le même
--      principe que les pièces remises (migration 0063) ;
--
--   2. les CONSTANTES : poids, tension, glycémie. Une mesure erronée ne
--      s'efface pas, elle est marquée « saisie erronée » avec un motif et
--      sort des courbes — sinon une valeur absurde corrigée en silence
--      fausserait l'historique sur lequel on a peut-être déjà décidé ;
--
--   3. une CHRONOLOGIE qui rassemble rendez-vous, documents, notes et
--      constantes en une requête.
--
-- Écritures : uniquement par des fonctions SECURITY DEFINER, qui vérifient
-- que le médecin suit bien ce patient (`medecin_suit_beneficiaire`, 0063)
-- et journalisent. Le journal d'audit est lu par l'administration : il dit
-- QUI a écrit QUOI et QUAND, jamais le contenu médical.
--
-- Migration additive : aucune table existante n'est modifiée.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Notes de consultation
-- ------------------------------------------------------------
create table if not exists notes_consultation (
  id uuid primary key default gen_random_uuid(),
  -- Auteur, et seul lecteur.
  medecin_id uuid not null references medecins (id),
  -- Bénéficiaire : l'un des trois, comme rendez_vous et infos_medicales.
  patient_id uuid references patients (id) on delete cascade,
  proche_id uuid references proches (id) on delete cascade,
  patient_sans_compte_id uuid references patients_sans_compte (id) on delete cascade,
  -- La consultation dont la note rend compte, quand il y en a une.
  rendez_vous_id uuid references rendez_vous (id) on delete set null,
  version_courante integer not null default 1,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  constraint notes_un_beneficiaire
    check (num_nonnulls(patient_id, proche_id, patient_sans_compte_id) = 1)
);

create index if not exists idx_notes_medecin_patient
  on notes_consultation (medecin_id, patient_id) where patient_id is not null;
create index if not exists idx_notes_medecin_proche
  on notes_consultation (medecin_id, proche_id) where proche_id is not null;
create index if not exists idx_notes_medecin_sans_compte
  on notes_consultation (medecin_id, patient_sans_compte_id) where patient_sans_compte_id is not null;
create index if not exists idx_notes_rdv
  on notes_consultation (rendez_vous_id) where rendez_vous_id is not null;

/*
 * Le contenu vit dans les versions, jamais dans la note : une ligne par
 * enregistrement, que rien ne modifie ni ne supprime ensuite.
 */
create table if not exists notes_consultation_versions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references notes_consultation (id) on delete cascade,
  version integer not null,
  motif text,
  examen text,
  diagnostic text,
  conduite text,
  auteur_id uuid not null references utilisateurs (id),
  cree_le timestamptz not null default now(),
  constraint notes_version_unique unique (note_id, version),
  constraint notes_version_non_vide
    check (num_nonnulls(motif, examen, diagnostic, conduite) >= 1)
);

alter table notes_consultation enable row level security;
alter table notes_consultation_versions enable row level security;

-- Lecture : l'auteur, et lui seul. Aucune policy d'écriture : tout passe
-- par `enregistrer_note`.
drop policy if exists sel_notes_auteur on notes_consultation;
create policy sel_notes_auteur on notes_consultation for select
  using (medecin_id = auth.uid());

drop policy if exists sel_notes_versions_auteur on notes_consultation_versions;
create policy sel_notes_versions_auteur on notes_consultation_versions for select
  using (exists (
    select 1 from notes_consultation n
    where n.id = note_id and n.medecin_id = auth.uid()
  ));

/*
 * Vérifications communes aux écritures du dossier clinique : un médecin, qui
 * suit ce bénéficiaire, et — si une consultation est citée — que ce soit la
 * SIENNE, avec CE bénéficiaire. Sans ce dernier contrôle, une note pourrait
 * se rattacher au rendez-vous d'un autre patient.
 */
create or replace function verifier_ecriture_clinique(
  p_patient_id uuid,
  p_proche_id uuid,
  p_sans_compte_id uuid,
  p_rendez_vous_id uuid
) returns void
language plpgsql stable security definer set search_path = public as $$
declare
  v_role role_utilisateur;
begin
  select role into v_role from utilisateurs where id = auth.uid();
  if v_role is distinct from 'medecin' then
    raise exception 'Seul le médecin renseigne le dossier clinique.';
  end if;
  if num_nonnulls(p_patient_id, p_proche_id, p_sans_compte_id) <> 1 then
    raise exception 'Désignez un patient, et un seul.';
  end if;
  if not medecin_suit_beneficiaire(auth.uid(), p_patient_id, p_proche_id, p_sans_compte_id) then
    raise exception 'Ce patient n''est pas dans votre patientèle.';
  end if;
  if p_rendez_vous_id is not null and not exists (
    select 1 from rendez_vous r
    where r.id = p_rendez_vous_id
      and r.medecin_id = auth.uid()
      and r.patient_id is not distinct from p_patient_id
      and r.proche_id is not distinct from p_proche_id
      and r.patient_sans_compte_id is not distinct from p_sans_compte_id
  ) then
    raise exception 'Cette consultation ne concerne pas ce patient.';
  end if;
end;
$$;

/*
 * Création (p_note_id nul) ou nouvelle version d'une note.
 *
 * Champs vides ramenés à null ; au moins un doit rester. Chaque champ est
 * borné à 5 000 caractères : au-delà, ce n'est plus une note mais un
 * document, qui a sa place dans l'onglet Ordonnances et documents.
 */
create or replace function enregistrer_note(
  p_note_id uuid default null,
  p_patient_id uuid default null,
  p_proche_id uuid default null,
  p_sans_compte_id uuid default null,
  p_rendez_vous_id uuid default null,
  p_motif text default null,
  p_examen text default null,
  p_diagnostic text default null,
  p_conduite text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_motif text := nullif(trim(coalesce(p_motif, '')), '');
  v_examen text := nullif(trim(coalesce(p_examen, '')), '');
  v_diagnostic text := nullif(trim(coalesce(p_diagnostic, '')), '');
  v_conduite text := nullif(trim(coalesce(p_conduite, '')), '');
  n notes_consultation;
  v_id uuid;
  v_version integer;
begin
  if num_nonnulls(v_motif, v_examen, v_diagnostic, v_conduite) = 0 then
    raise exception 'Une note doit contenir au moins un champ renseigné.';
  end if;
  if greatest(length(v_motif), length(v_examen), length(v_diagnostic), length(v_conduite)) > 5000 then
    raise exception 'Chaque champ est limité à 5 000 caractères.';
  end if;

  if p_note_id is null then
    perform verifier_ecriture_clinique(p_patient_id, p_proche_id, p_sans_compte_id, p_rendez_vous_id);
    insert into notes_consultation (medecin_id, patient_id, proche_id, patient_sans_compte_id, rendez_vous_id)
    values (auth.uid(), p_patient_id, p_proche_id, p_sans_compte_id, p_rendez_vous_id)
    returning id into v_id;
    v_version := 1;
  else
    select * into n from notes_consultation where id = p_note_id for update;
    if not found or n.medecin_id <> auth.uid() then
      -- Même message dans les deux cas : on ne confirme pas l'existence
      -- d'une note qu'on n'a pas le droit de lire.
      raise exception 'Note introuvable.';
    end if;
    -- Le rattachement peut changer (oubli à la création), jamais le patient.
    perform verifier_ecriture_clinique(
      n.patient_id, n.proche_id, n.patient_sans_compte_id, p_rendez_vous_id
    );
    v_id := n.id;
    v_version := n.version_courante + 1;
    update notes_consultation
       set version_courante = v_version, maj_le = now(), rendez_vous_id = p_rendez_vous_id
     where id = v_id;
  end if;

  insert into notes_consultation_versions (note_id, version, motif, examen, diagnostic, conduite, auteur_id)
  values (v_id, v_version, v_motif, v_examen, v_diagnostic, v_conduite, auth.uid());

  -- Le journal est lu par l'administration : il dit le geste, pas le contenu.
  perform ecrire_audit(
    case when v_version = 1 then 'A rédigé une note de consultation'
         else 'A modifié une note de consultation' end,
    'notes_consultation', v_id,
    jsonb_build_object('version', v_version)
  );
  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- 2. Constantes
-- ------------------------------------------------------------
do $$ begin
  create type contexte_glycemie as enum ('a_jeun', 'apres_repas', 'au_hasard');
exception when duplicate_object then null;
end $$;

/*
 * Une ligne = une prise de constantes : une, deux ou les trois mesures.
 * Les bornes sont celles du possible physiologique, pas de la normale : une
 * tension à 230 est grave, pas impossible ; 2 300, c'est une faute de frappe.
 * Glycémie en g/L, l'unité des laboratoires guinéens.
 */
create table if not exists constantes (
  id uuid primary key default gen_random_uuid(),
  medecin_id uuid not null references medecins (id),
  patient_id uuid references patients (id) on delete cascade,
  proche_id uuid references proches (id) on delete cascade,
  patient_sans_compte_id uuid references patients_sans_compte (id) on delete cascade,
  rendez_vous_id uuid references rendez_vous (id) on delete set null,
  mesure_le timestamptz not null default now(),
  poids_kg numeric(5, 1),
  tension_sys smallint,
  tension_dia smallint,
  glycemie_gl numeric(4, 2),
  glycemie_contexte contexte_glycemie,
  saisi_par uuid not null references utilisateurs (id),
  cree_le timestamptz not null default now(),
  -- Saisie erronée : la ligne reste, barrée, et sort des courbes.
  invalide_le timestamptz,
  invalide_par uuid references utilisateurs (id),
  motif_invalidation text,
  constraint constantes_un_beneficiaire
    check (num_nonnulls(patient_id, proche_id, patient_sans_compte_id) = 1),
  constraint constantes_une_mesure
    check (num_nonnulls(poids_kg, tension_sys, glycemie_gl) >= 1),
  constraint constantes_poids check (poids_kg is null or poids_kg between 0.5 and 400),
  constraint constantes_tension_paire check ((tension_sys is null) = (tension_dia is null)),
  constraint constantes_tension_bornes check (
    tension_sys is null or (tension_sys between 40 and 300 and tension_dia between 20 and 200
                            and tension_sys > tension_dia)
  ),
  constraint constantes_glycemie check (glycemie_gl is null or glycemie_gl between 0.1 and 9.99),
  constraint constantes_glycemie_contexte check ((glycemie_gl is null) = (glycemie_contexte is null))
);

create index if not exists idx_constantes_patient
  on constantes (medecin_id, patient_id, mesure_le) where patient_id is not null;
create index if not exists idx_constantes_proche
  on constantes (medecin_id, proche_id, mesure_le) where proche_id is not null;
create index if not exists idx_constantes_sans_compte
  on constantes (medecin_id, patient_sans_compte_id, mesure_le) where patient_sans_compte_id is not null;

alter table constantes enable row level security;

drop policy if exists sel_constantes_auteur on constantes;
create policy sel_constantes_auteur on constantes for select
  using (medecin_id = auth.uid());

create or replace function ajouter_constantes(
  p_patient_id uuid default null,
  p_proche_id uuid default null,
  p_sans_compte_id uuid default null,
  p_rendez_vous_id uuid default null,
  p_mesure_le timestamptz default null,
  p_poids_kg numeric default null,
  p_tension_sys integer default null,
  p_tension_dia integer default null,
  p_glycemie_gl numeric default null,
  p_glycemie_contexte text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_quand timestamptz := coalesce(p_mesure_le, now());
  v_id uuid;
begin
  perform verifier_ecriture_clinique(p_patient_id, p_proche_id, p_sans_compte_id, p_rendez_vous_id);
  -- Cinq minutes de marge pour une horloge de téléphone en avance ; au-delà,
  -- une mesure « de demain » est une erreur de date.
  if v_quand > now() + interval '5 minutes' then
    raise exception 'La date de mesure est dans le futur.';
  end if;
  if (p_tension_sys is null) <> (p_tension_dia is null) then
    raise exception 'Une tension se note avec ses deux chiffres : systolique et diastolique.';
  end if;
  if p_glycemie_gl is not null and p_glycemie_contexte is null then
    raise exception 'Précisez si la glycémie a été mesurée à jeun, après un repas ou au hasard.';
  end if;
  if p_glycemie_contexte is not null and p_glycemie_contexte not in ('a_jeun', 'apres_repas', 'au_hasard') then
    raise exception 'Contexte de glycémie inconnu : %', p_glycemie_contexte;
  end if;

  insert into constantes (
    medecin_id, patient_id, proche_id, patient_sans_compte_id, rendez_vous_id, mesure_le,
    poids_kg, tension_sys, tension_dia, glycemie_gl, glycemie_contexte, saisi_par
  ) values (
    auth.uid(), p_patient_id, p_proche_id, p_sans_compte_id, p_rendez_vous_id, v_quand,
    p_poids_kg, p_tension_sys, p_tension_dia, p_glycemie_gl,
    case when p_glycemie_gl is null then null else p_glycemie_contexte::contexte_glycemie end,
    auth.uid()
  ) returning id into v_id;

  perform ecrire_audit('A saisi des constantes', 'constantes', v_id, null);
  return v_id;
end;
$$;

create or replace function invalider_constante(p_id uuid, p_motif text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  c constantes;
  v_motif text := nullif(trim(coalesce(p_motif, '')), '');
begin
  if v_motif is null then
    raise exception 'Indiquez pourquoi cette mesure est erronée.';
  end if;
  if length(v_motif) > 300 then
    raise exception 'Motif trop long (300 caractères au maximum).';
  end if;
  select * into c from constantes where id = p_id for update;
  if not found or c.medecin_id <> auth.uid() then
    raise exception 'Mesure introuvable.';
  end if;
  if c.invalide_le is not null then
    return;
  end if;
  update constantes
     set invalide_le = now(), invalide_par = auth.uid(), motif_invalidation = v_motif
   where id = c.id;
  perform ecrire_audit('A marqué une mesure comme erronée', 'constantes', c.id, null);
end;
$$;

-- ------------------------------------------------------------
-- 3. Chronologie
-- ------------------------------------------------------------
/*
 * Tout ce qui s'est passé pour ce patient avec ce médecin, du plus récent au
 * plus ancien, filtrable par type, paginé.
 *
 * SECURITY INVOKER, délibérément : chaque source est lue sous la RLS de
 * l'appelant. La fonction ne réécrit aucune règle d'accès — elle ne peut
 * montrer que ce que les tables montreraient une à une. Les notes et les
 * constantes ne remontent donc que pour leur auteur ; les documents, selon
 * les policies de documents_patient (remis, reçus, partagés).
 *
 * `total` est répété sur chaque ligne : une requête pour la page ET le compte.
 */
create or replace function chronologie_patient(
  p_patient_id uuid default null,
  p_proche_id uuid default null,
  p_sans_compte_id uuid default null,
  p_types text[] default null,
  p_limite integer default 30,
  p_decalage integer default 0
) returns table (
  type text,
  quand timestamptz,
  ref_id uuid,
  titre text,
  detail text,
  extra jsonb,
  total bigint
)
language sql stable security invoker set search_path = public as $$
  with evenements as (
    select 'rdv'::text as type,
           (r.date + r.heure)::timestamp at time zone 'UTC' as quand,
           r.id as ref_id,
           coalesce(nullif(r.motif, ''), 'Rendez-vous') as titre,
           null::text as detail,
           jsonb_build_object('statut', r.statut, 'date', r.date, 'heure', to_char(r.heure, 'HH24:MI')) as extra
      from rendez_vous r
     where r.medecin_id = auth.uid()
       and r.patient_id is not distinct from p_patient_id
       and r.proche_id is not distinct from p_proche_id
       and r.patient_sans_compte_id is not distinct from p_sans_compte_id
    union all
    select 'document', d.cree_le, d.id, d.titre, d.contenu,
           jsonb_build_object('type', d.type, 'origine', d.origine, 'version', d.version,
                              'annule', d.annule_le is not null, 'mien', d.medecin_id = auth.uid())
      from documents_patient d
     where d.remplace_par_id is null
       and (p_patient_id is not null or p_proche_id is not null)
       and d.patient_id is not distinct from p_patient_id
       and d.proche_id is not distinct from p_proche_id
    union all
    select 'note', v.cree_le, n.id,
           coalesce(v.motif, v.diagnostic, 'Note de consultation'),
           v.diagnostic,
           jsonb_build_object('version', v.version)
      from notes_consultation n
      join notes_consultation_versions v on v.note_id = n.id
     where n.medecin_id = auth.uid()
       and n.patient_id is not distinct from p_patient_id
       and n.proche_id is not distinct from p_proche_id
       and n.patient_sans_compte_id is not distinct from p_sans_compte_id
    union all
    select 'constante', c.mesure_le, c.id, 'Constantes', null,
           jsonb_build_object(
             'poids', c.poids_kg, 'sys', c.tension_sys, 'dia', c.tension_dia,
             'glycemie', c.glycemie_gl, 'contexte', c.glycemie_contexte,
             'erronee', c.invalide_le is not null
           )
      from constantes c
     where c.medecin_id = auth.uid()
       and c.patient_id is not distinct from p_patient_id
       and c.proche_id is not distinct from p_proche_id
       and c.patient_sans_compte_id is not distinct from p_sans_compte_id
  ),
  filtres as (
    select * from evenements e
     where p_types is null or e.type = any (p_types)
  )
  select f.type, f.quand, f.ref_id, f.titre, f.detail, f.extra, count(*) over () as total
    from filtres f
   order by f.quand desc, f.type
   limit greatest(1, least(coalesce(p_limite, 30), 500))
  offset greatest(0, coalesce(p_decalage, 0));
$$;

-- Droits d'exécution. PostgreSQL accorde EXECUTE à PUBLIC par défaut — donc
-- aussi à `anon` : retirer `anon` seul ne fermerait rien. On retire à PUBLIC,
-- puis on rend aux comptes connectés ce qui leur revient.
revoke execute on function enregistrer_note(uuid, uuid, uuid, uuid, uuid, text, text, text, text) from public, anon;
revoke execute on function ajouter_constantes(uuid, uuid, uuid, uuid, timestamptz, numeric, integer, integer, numeric, text) from public, anon;
revoke execute on function invalider_constante(uuid, text) from public, anon;
revoke execute on function chronologie_patient(uuid, uuid, uuid, text[], integer, integer) from public, anon;
grant execute on function enregistrer_note(uuid, uuid, uuid, uuid, uuid, text, text, text, text) to authenticated;
grant execute on function ajouter_constantes(uuid, uuid, uuid, uuid, timestamptz, numeric, integer, integer, numeric, text) to authenticated;
grant execute on function invalider_constante(uuid, text) to authenticated;
grant execute on function chronologie_patient(uuid, uuid, uuid, text[], integer, integer) to authenticated;
-- Contrôle interne, appelé par les fonctions ci-dessus (qui s'exécutent
-- avec les droits de leur propriétaire) : personne ne l'appelle en direct.
revoke execute on function verifier_ecriture_clinique(uuid, uuid, uuid, uuid) from public, anon, authenticated;
