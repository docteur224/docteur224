-- ============================================================
-- Docteur 224 — Fiche patient (espace médecin), deuxième version
--
-- Trois manques que l'écran ne pouvait pas combler tout seul :
--
--   1. un rendez-vous passé restait « En attente » indéfiniment. Ce n'est
--      pas un état : la date est passée, il a eu lieu ou non. Il devient
--      « à qualifier » — un état DÉDUIT, jamais écrit — et le praticien
--      tranche en un clic : honoré ou absent. D'où la valeur 'absent', qui
--      manquait à l'enum ;
--
--   2. une ordonnance remise se corrigeait EN PLACE et se SUPPRIMAIT. Les
--      deux sont inacceptables pour une pièce qu'un patient a emportée chez
--      le pharmacien : la version lue au comptoir disparaissait sans trace,
--      et plus rien ne permettait de savoir ce qui avait été prescrit. Une
--      correction crée désormais une VERSION ; une annulation laisse la
--      pièce en place, barrée, avec son motif ;
--
--   3. les informations médicales (groupe sanguin, allergies, antécédents,
--      traitements) n'existaient nulle part en base, alors que ce sont
--      exactement celles qu'on relit avant de prescrire.
--
-- Tout ce qui touche à ces trois points passe par des fonctions
-- SECURITY DEFINER : elles sont le seul endroit où la règle est écrite, et
-- elles journalisent. Les policies, elles, se contentent de refuser le
-- chemin direct.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Rendez-vous : la valeur qui manquait
-- ------------------------------------------------------------
-- Posée en tête et seule : PostgreSQL interdit d'UTILISER une valeur d'enum
-- dans la transaction qui l'ajoute. Les fonctions ci-dessous sont donc en
-- plpgsql (corps analysé à la première exécution, pas à la création) et
-- reçoivent le statut en texte, converti au moment de l'écriture.
alter type statut_rdv add value if not exists 'absent';

-- ------------------------------------------------------------
-- 2. Documents : versions et annulation
-- ------------------------------------------------------------
alter table documents_patient
  add column if not exists version integer not null default 1,
  -- Racine de la chaîne : toutes les versions d'une même pièce la partagent.
  -- La v1 porte null, c'est elle la racine.
  add column if not exists document_parent_id uuid references documents_patient (id) on delete set null,
  -- Posé sur l'ANCIENNE version quand une correction paraît : une pièce dont
  -- ce champ est null est la version en cours, et c'est ce que liste l'écran.
  add column if not exists remplace_par_id uuid references documents_patient (id) on delete set null,
  add column if not exists annule_le timestamptz,
  add column if not exists annule_par uuid references utilisateurs (id),
  add column if not exists motif_annulation text;

comment on column documents_patient.version is
  'Numéro de version dans la chaîne de corrections (1 pour la pièce d''origine).';
comment on column documents_patient.remplace_par_id is
  'Version suivante. Null = version en cours, la seule que listent les écrans.';
comment on column documents_patient.annule_le is
  'Annulation : la pièce reste lisible, barrée, et n''est plus valable.';

create index if not exists idx_docs_chaine
  on documents_patient (document_parent_id) where document_parent_id is not null;
create index if not exists idx_docs_en_cours
  on documents_patient (medecin_id, cree_le desc) where remplace_par_id is null;

-- ---- Les droits directs se referment ----
-- Corriger et annuler passent par les fonctions ci-dessous. Laisser l'UPDATE
-- ouvert au médecin, c'est laisser ouverte la réécriture silencieuse qu'on
-- vient d'interdire.
drop policy if exists upd_docs on documents_patient;
create policy upd_docs on documents_patient for update
  using (depose_par = auth.uid() and origine = 'patient')
  with check (depose_par = auth.uid() and origine = 'patient');

-- Le patient retire ce qu'il a envoyé — c'est à lui. Une pièce remise par un
-- praticien, elle, ne se supprime plus : elle s'annule.
drop policy if exists del_docs on documents_patient;
create policy del_docs on documents_patient for delete
  using (depose_par = auth.uid() and origine = 'patient');

-- Qui est le patient titulaire d'un document ? (sert à le prévenir)
create or replace function titulaire_du_document(p_document_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(d.patient_id, (select p.patient_id from proches p where p.id = d.proche_id))
  from documents_patient d where d.id = p_document_id;
$$;

/*
 * Correction d'une pièce remise : une NOUVELLE ligne, pas une réécriture.
 *
 * Le fichier a déjà été déposé par le navigateur dans le bucket (sous
 * « <uid>/… », c'est ce que vérifie la policy Storage) : la fonction ne
 * reçoit que son chemin. L'ancienne version garde le sien — c'est tout
 * l'intérêt, on doit pouvoir rouvrir ce que le patient a emporté.
 */
create or replace function corriger_document(
  p_document_id uuid,
  p_titre text,
  p_contenu text default null,
  p_fichier_path text default null,
  p_fichier_nom text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  a documents_patient;
  v_nouveau uuid;
begin
  select * into a from documents_patient where id = p_document_id for update;
  if not found then
    raise exception 'Document introuvable.';
  end if;
  if a.depose_par <> auth.uid() then
    raise exception 'Seul l''auteur du document peut le corriger.';
  end if;
  if a.annule_le is not null then
    raise exception 'Ce document est annulé : il ne se corrige plus.';
  end if;
  if a.remplace_par_id is not null then
    raise exception 'Une version plus récente existe déjà.';
  end if;
  if nullif(trim(coalesce(p_titre, '')), '') is null then
    raise exception 'Donnez un titre au document.';
  end if;
  if nullif(trim(coalesce(p_contenu, '')), '') is null and p_fichier_path is null then
    raise exception 'Une version doit garder du texte ou un fichier.';
  end if;

  insert into documents_patient (
    patient_id, proche_id, medecin_id, rendez_vous_id, type, titre, contenu,
    fichier_path, fichier_nom, origine, depose_par, version, document_parent_id
  ) values (
    a.patient_id, a.proche_id, a.medecin_id, a.rendez_vous_id, a.type,
    trim(p_titre), nullif(trim(coalesce(p_contenu, '')), ''),
    p_fichier_path, p_fichier_nom, a.origine, auth.uid(),
    a.version + 1, coalesce(a.document_parent_id, a.id)
  ) returning id into v_nouveau;

  update documents_patient set remplace_par_id = v_nouveau where id = a.id;

  perform ecrire_audit(
    'A corrigé un document remis à un patient',
    'documents_patient', v_nouveau,
    jsonb_build_object(
      'cible', a.titre || ' · v' || (a.version + 1),
      'version_precedente', a.id,
      'version', a.version + 1
    )
  );
  return v_nouveau;
end;
$$;

/*
 * Annulation : la pièce reste au dossier, barrée, avec son motif. Le patient
 * est prévenu — c'est la seule façon qu'il a d'apprendre que l'ordonnance
 * qu'il a en poche ne vaut plus rien.
 */
create or replace function annuler_document(p_document_id uuid, p_motif text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  a documents_patient;
  v_motif text := nullif(trim(coalesce(p_motif, '')), '');
  v_titulaire uuid;
begin
  if v_motif is null then
    raise exception 'Un motif est obligatoire pour annuler un document.';
  end if;
  if length(v_motif) > 300 then
    raise exception 'Motif trop long (300 caractères au maximum).';
  end if;

  select * into a from documents_patient where id = p_document_id for update;
  if not found then
    raise exception 'Document introuvable.';
  end if;
  if a.depose_par <> auth.uid() then
    raise exception 'Seul l''auteur du document peut l''annuler.';
  end if;
  if a.annule_le is not null then
    -- Déjà annulé : ne rien refaire, et surtout pas une deuxième notification.
    return;
  end if;

  update documents_patient
     set annule_le = now(), annule_par = auth.uid(), motif_annulation = v_motif
   where id = a.id;

  v_titulaire := titulaire_du_document(a.id);
  if v_titulaire is not null then
    perform creer_notification(
      v_titulaire, 'document', 'Document annulé',
      a.titre || ' a été annulé par ' || nom_medecin(a.medecin_id)
        || ' — motif : ' || v_motif,
      '/patient/documents'
    );
  end if;

  perform ecrire_audit(
    'A annulé un document remis à un patient',
    'documents_patient', a.id,
    jsonb_build_object('cible', a.titre || ' · v' || a.version, 'motif', v_motif)
  );
end;
$$;

-- ------------------------------------------------------------
-- 3. Qualification d'un rendez-vous passé
-- ------------------------------------------------------------
/*
 * « Honoré » ou « absent » ne se posent qu'APRÈS coup : avant l'heure, les
 * deux sont des suppositions. La fonction refuse donc un rendez-vous à venir,
 * et refuse de requalifier ce qui a été annulé — une annulation est un fait,
 * pas une attente.
 */
create or replace function qualifier_rdv(p_rdv_id uuid, p_statut text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r rendez_vous;
  v_beneficiaire text;
begin
  if p_statut not in ('honore', 'absent') then
    raise exception 'Qualification inconnue : %', coalesce(p_statut, 'néant');
  end if;

  select * into r from rendez_vous where id = p_rdv_id for update;
  if not found then
    raise exception 'Rendez-vous introuvable.';
  end if;
  if r.medecin_id <> auth.uid() and r.medecin_id is distinct from medecin_de_assistant() then
    raise exception 'Ce rendez-vous n''est pas le vôtre.';
  end if;
  -- Guinée : la base tourne en UTC, qui est l'heure locale. `localtimestamp`
  -- et non `now()` : on compare une date + une heure, sans fuseau.
  if (r.date + r.heure) > localtimestamp then
    raise exception 'Ce rendez-vous n''a pas encore eu lieu.';
  end if;
  if r.statut = 'annule' then
    raise exception 'Un rendez-vous annulé ne se qualifie pas.';
  end if;

  update rendez_vous set statut = p_statut::statut_rdv where id = r.id;

  select coalesce(
    (select u.prenom || ' ' || u.nom from utilisateurs u where u.id = r.patient_id),
    (select p.prenom || ' ' || p.nom from proches p where p.id = r.proche_id),
    (select s.prenom || ' ' || s.nom from patients_sans_compte s where s.id = r.patient_sans_compte_id),
    'Patient'
  ) into v_beneficiaire;

  perform ecrire_audit(
    case p_statut when 'honore' then 'A marqué un rendez-vous comme honoré'
                  else 'A marqué un patient absent' end,
    'rendez_vous', r.id,
    jsonb_build_object(
      'cible', v_beneficiaire || ' · ' || r.date || ' ' || to_char(r.heure, 'HH24:MI')
    )
  );
end;
$$;

-- ------------------------------------------------------------
-- 4. Informations médicales
-- ------------------------------------------------------------
/*
 * Une ligne par bénéficiaire — patient titulaire, proche, ou fiche cabinet
 * sans compte — sur le modèle de `rendez_vous` : l'un des trois, jamais deux.
 *
 * Ces champs ne sont pas des notes de consultation : ce sont les quelques
 * éléments qu'on relit AVANT de prescrire. Les allergies ont donc leur propre
 * colonne, en tableau, pour rester affichables une par une et comparables —
 * noyées dans un paragraphe d'antécédents, elles se ratent.
 */
create table if not exists infos_medicales (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients (id) on delete cascade,
  proche_id uuid references proches (id) on delete cascade,
  patient_sans_compte_id uuid references patients_sans_compte (id) on delete cascade,
  groupe_sanguin text,
  allergies text[] not null default '{}',
  antecedents text,
  traitements text,
  maj_le timestamptz not null default now(),
  maj_par uuid references utilisateurs (id),
  constraint infos_un_beneficiaire
    check (num_nonnulls(patient_id, proche_id, patient_sans_compte_id) = 1),
  constraint infos_groupe_connu check (
    groupe_sanguin is null
    or groupe_sanguin in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')
  )
);

create unique index if not exists idx_infos_patient
  on infos_medicales (patient_id) where patient_id is not null;
create unique index if not exists idx_infos_proche
  on infos_medicales (proche_id) where proche_id is not null;
create unique index if not exists idx_infos_sans_compte
  on infos_medicales (patient_sans_compte_id) where patient_sans_compte_id is not null;

alter table infos_medicales enable row level security;

-- Ce médecin suit-il ce bénéficiaire ? Même question pour les trois formes de
-- fiche, posée une seule fois.
create or replace function medecin_suit_beneficiaire(
  p_medecin_id uuid,
  p_patient_id uuid,
  p_proche_id uuid,
  p_sans_compte_id uuid
) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_medecin_id is null then false
    when p_patient_id is not null then medecin_a_rdv_avec_patient(p_medecin_id, p_patient_id)
    when p_proche_id is not null then exists (
      select 1 from rendez_vous rv
      where rv.medecin_id = p_medecin_id and rv.proche_id = p_proche_id
    )
    when p_sans_compte_id is not null then exists (
      select 1 from patients_sans_compte s
      where s.id = p_sans_compte_id and s.medecin_id = p_medecin_id
    )
    else false
  end;
$$;

-- Lecture : le patient concerné, le praticien qui le suit (et son assistant,
-- qui prépare la consultation), l'administration.
drop policy if exists sel_infos_medicales on infos_medicales;
create policy sel_infos_medicales on infos_medicales for select
  using (
    patient_id = auth.uid()
    or proche_du_patient(proche_id)
    or medecin_suit_beneficiaire(auth.uid(), patient_id, proche_id, patient_sans_compte_id)
    or medecin_suit_beneficiaire(medecin_de_assistant(), patient_id, proche_id, patient_sans_compte_id)
    or est_admin()
  );

-- Aucune policy d'écriture : tout passe par la fonction ci-dessous. Un groupe
-- sanguin ou une allergie engagent une prescription ; ils doivent porter une
-- date et un nom.
create or replace function enregistrer_infos_medicales(
  p_patient_id uuid default null,
  p_proche_id uuid default null,
  p_sans_compte_id uuid default null,
  p_groupe_sanguin text default null,
  p_allergies text[] default '{}',
  p_antecedents text default null,
  p_traitements text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role role_utilisateur;
  v_propres text[];
  v_maj integer;
begin
  select role into v_role from utilisateurs where id = auth.uid();
  if v_role is distinct from 'medecin' then
    raise exception 'Seul le médecin traitant renseigne les informations médicales.';
  end if;
  if num_nonnulls(p_patient_id, p_proche_id, p_sans_compte_id) <> 1 then
    raise exception 'Désignez un bénéficiaire, et un seul.';
  end if;
  if not medecin_suit_beneficiaire(auth.uid(), p_patient_id, p_proche_id, p_sans_compte_id) then
    raise exception 'Ce patient n''est pas dans votre patientèle.';
  end if;
  if p_groupe_sanguin is not null
     and p_groupe_sanguin not in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') then
    raise exception 'Groupe sanguin inconnu : %', p_groupe_sanguin;
  end if;

  -- Une allergie vide ou en double ne veut rien dire et brouille la lecture.
  -- Le doublon se juge SANS la casse : « Pénicilline » et « pénicilline »
  -- sont la même allergie, et deux entrées pour une seule font douter de la
  -- liste entière — c'est exactement ce qu'on ne peut pas se permettre ici.
  -- La première orthographe reçue est celle qu'on garde.
  select coalesce(array_agg(a order by a), '{}')
    into v_propres
    from (
      select distinct on (lower(trim(a))) trim(a) as a
        from unnest(coalesce(p_allergies, '{}')) with ordinality as u(a, rang)
       where nullif(trim(a), '') is not null
       order by lower(trim(a)), rang
    ) uniques;

  -- Mise à jour d'abord, insertion si rien n'existait : les trois index
  -- d'unicité sont partiels, `on conflict` ne sait pas les viser ensemble.
  update infos_medicales
     set groupe_sanguin = p_groupe_sanguin,
         allergies = v_propres,
         antecedents = nullif(trim(coalesce(p_antecedents, '')), ''),
         traitements = nullif(trim(coalesce(p_traitements, '')), ''),
         maj_le = now(),
         maj_par = auth.uid()
   where patient_id is not distinct from p_patient_id
     and proche_id is not distinct from p_proche_id
     and patient_sans_compte_id is not distinct from p_sans_compte_id;
  get diagnostics v_maj = row_count;

  if v_maj = 0 then
    insert into infos_medicales (
      patient_id, proche_id, patient_sans_compte_id,
      groupe_sanguin, allergies, antecedents, traitements, maj_par
    ) values (
      p_patient_id, p_proche_id, p_sans_compte_id,
      p_groupe_sanguin, v_propres,
      nullif(trim(coalesce(p_antecedents, '')), ''),
      nullif(trim(coalesce(p_traitements, '')), ''),
      auth.uid()
    );
  end if;

  perform ecrire_audit(
    'A mis à jour les informations médicales d''un patient',
    'infos_medicales',
    coalesce(p_patient_id, p_proche_id, p_sans_compte_id),
    jsonb_build_object(
      'cible', coalesce(p_groupe_sanguin, 'groupe inconnu')
        || ' · ' || cardinality(v_propres) || ' allergie(s)'
    )
  );
end;
$$;
