-- ============================================================
-- 0074 — Un objet pour chaque conversation, et la liste côté médecin
--
-- Deux ajouts à la messagerie de la 0066, tous deux additifs :
--
--   1. `messages.objet` — ce que le patient choisit en ouvrant une
--      conversation (« Déplacer un rendez-vous », « Demander un
--      document »…). Porté par le PREMIER message, il titre la
--      conversation. Nullable : les conversations déjà ouvertes n'en ont
--      pas, et les réponses n'en reçoivent pas.
--
--   2. `conversations_medecin()` — la liste des conversations vue du
--      praticien (ou de son assistant(e) avec la permission). Jusqu'ici le
--      médecin ne lisait ses messages que depuis la fiche d'un patient ;
--      il lui manquait un écran « Messages » d'ensemble, comme en a le
--      patient avec `conversations_patient()`.
--
-- Rien n'est retiré : les colonnes et politiques existantes ne bougent pas.
-- ============================================================

-- ---------- 1 · L'objet ----------
alter table messages add column if not exists objet text
  check (objet is null or objet in (
    'question_rdv', 'deplacer_rdv', 'demander_document',
    'partager_document', 'demander_avis', 'info_sante', 'autre'
  ));

/*
 * L'objet rejoint les colonnes qu'un message ne peut plus changer après
 * l'envoi : comme le contenu, il décrit ce qui a été dit et ne se réécrit
 * pas. On recrée le garde-fou de la 0066 en l'ajoutant à la liste ; tout le
 * reste est identique.
 */
create or replace function messages_garde_maj() returns trigger
language plpgsql as $$
begin
  if new.contenu is distinct from old.contenu
     or new.piece_path is distinct from old.piece_path
     or new.piece_nom is distinct from old.piece_nom
     or new.objet is distinct from old.objet
     or new.expediteur_id is distinct from old.expediteur_id
     or new.patient_id is distinct from old.patient_id
     or new.medecin_id is distinct from old.medecin_id
     or new.proche_id is distinct from old.proche_id
     or new.cree_le is distinct from old.cree_le then
    raise exception 'Un message envoyé ne se modifie pas.';
  end if;
  if new.lu is distinct from old.lu then
    if auth.uid() = old.expediteur_id then
      raise exception 'Seul le destinataire marque un message comme lu.';
    end if;
    if not new.lu then
      raise exception 'Un message lu le reste.';
    end if;
    new.lu_le := now();
  else
    new.lu_le := old.lu_le;
  end if;
  return new;
end;
$$;

-- ---------- 2 · conversations_patient : on y ajoute l'objet ----------
-- Changer le type de retour impose de supprimer puis recréer. Le corps est
-- celui de la 0066, augmenté de l'objet du tout premier message.
drop function if exists conversations_patient();
create function conversations_patient()
returns table (
  medecin_id uuid,
  medecin text,
  specialite text,
  dernier_message text,
  dernier_le timestamptz,
  dernier_de_moi boolean,
  non_lus bigint,
  objet text
)
language sql stable security definer set search_path = public as $$
  with mes as (
    select m.* from messages m where m.patient_id = auth.uid()
  ),
  derniers as (
    select distinct on (medecin_id) medecin_id, contenu, piece_nom, cree_le, expediteur_id
    from mes order by medecin_id, cree_le desc
  )
  select d.medecin_id,
         nom_medecin(d.medecin_id),
         (select s.nom from medecins md join specialites s on s.id = md.specialite_id where md.id = d.medecin_id),
         coalesce(nullif(d.contenu, ''), '📎 ' || d.piece_nom),
         d.cree_le,
         d.expediteur_id = auth.uid(),
         (select count(*) from mes x where x.medecin_id = d.medecin_id and not x.lu and x.expediteur_id <> auth.uid()),
         (select o.objet from mes o where o.medecin_id = d.medecin_id and o.objet is not null
            order by o.cree_le asc limit 1)
  from derniers d
  order by d.cree_le desc;
$$;
revoke execute on function conversations_patient() from public, anon;
grant execute on function conversations_patient() to authenticated;

-- ---------- 3 · conversations_medecin : la liste côté praticien ----------
/*
 * Le médecin regarde ses propres conversations (medecin_id = auth.uid()).
 * Une assistante regarde celles de SON médecin, et seulement si elle a la
 * permission « messagerie » — même règle que les policies de `messages`.
 * `medecin_de_assistant()` rend null pour un médecin : le coalesce retombe
 * alors sur son propre identifiant.
 *
 * Groupé par patient (le titulaire du compte) : c'est avec lui que la
 * conversation existe, un éventuel proche n'étant qu'un sujet de message.
 */
create or replace function conversations_medecin()
returns table (
  patient_id uuid,
  patient text,
  dernier_message text,
  dernier_le timestamptz,
  dernier_de_moi boolean,
  non_lus bigint,
  objet text
)
language sql stable security definer set search_path = public as $$
  with cible as (
    select case
      when medecin_de_assistant() is not null and assistant_a_permission('peut_messagerie')
        then medecin_de_assistant()
      else auth.uid()
    end as medecin_id
  ),
  mes as (
    select m.* from messages m, cible c where m.medecin_id = c.medecin_id
  ),
  derniers as (
    select distinct on (patient_id) patient_id, contenu, piece_nom, cree_le, expediteur_id
    from mes order by patient_id, cree_le desc
  )
  select d.patient_id,
         trim(coalesce(u.prenom, '') || ' ' || coalesce(u.nom, '')),
         coalesce(nullif(d.contenu, ''), '📎 ' || d.piece_nom),
         d.cree_le,
         -- « de moi » = envoyé par le côté soignant (médecin ou assistante),
         -- c'est-à-dire pas par le patient.
         d.expediteur_id <> d.patient_id,
         (select count(*) from mes x where x.patient_id = d.patient_id and not x.lu and x.expediteur_id = d.patient_id),
         (select o.objet from mes o where o.patient_id = d.patient_id and o.objet is not null
            order by o.cree_le asc limit 1)
  from derniers d
  join utilisateurs u on u.id = d.patient_id
  order by d.cree_le desc;
$$;
revoke execute on function conversations_medecin() from public, anon;
grant execute on function conversations_medecin() to authenticated;
