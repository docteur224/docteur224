-- ============================================================
-- Docteur 224 — Suivi des appels traités + configuration e-mail
--
-- Deux sujets, un seul aller-retour de migration :
--   1. la console doit pouvoir REVENIR sur ce qu'elle a posé (reprogrammer,
--      annuler, supprimer) et joindre l'appelant — donc voir son téléphone et
--      son e-mail ;
--   2. l'e-mail devient un canal d'envoi à part entière (l'énumération a été
--      étendue en 0047, qui doit être committée avant qu'on s'en serve).
-- ============================================================

-- ---------- 1. Motif d'annulation ----------
/*
 * Une annulation sans motif est ingérable au téléphone : l'opérateur suivant
 * ne sait pas si le patient s'est décommandé, si le praticien était absent, ou
 * si c'est une erreur de saisie. La colonne est libre et facultative pour les
 * annulations qui n'en passent pas par la console (le patient depuis son
 * espace), obligatoire côté console via la fonction ci-dessous.
 */
alter table rendez_vous add column if not exists motif_annulation text;

-- ---------- 2. Configuration du canal e-mail ----------
alter table config_messagerie
  add column if not exists email_fournisseur text,
  add column if not exists email_url text,
  add column if not exists email_cle text,
  -- Adresse d'expédition (« Docteur 224 <rdv@docteur224.com> »).
  add column if not exists email_expediteur text,
  -- Un e-mail ne coûte rien chez la plupart des fournisseurs, mais la colonne
  -- existe pour que la comptabilité reste homogène entre les trois canaux.
  add column if not exists cout_email_gnf integer not null default 0;

alter table config_messagerie drop constraint if exists cout_email_positif;
alter table config_messagerie add constraint cout_email_positif check (cout_email_gnf >= 0);

-- La vue est refaite et non remplacée : `create or replace view` n'accepte
-- que l'ajout de colonnes EN FIN de liste, et on veut garder les colonnes
-- d'un même canal groupées.
drop view if exists config_messagerie_publique;
create view config_messagerie_publique as
select
  id, mode, canal_defaut,
  sms_fournisseur, sms_url, sms_identifiant, sms_expediteur, cout_sms_gnf,
  whatsapp_fournisseur, whatsapp_url, whatsapp_numero_id, cout_whatsapp_gnf,
  email_fournisseur, email_url, email_expediteur, cout_email_gnf,
  sms_cle is not null and sms_cle <> '' as sms_cle_posee,
  whatsapp_jeton is not null and whatsapp_jeton <> '' as whatsapp_jeton_pose,
  email_cle is not null and email_cle <> '' as email_cle_posee,
  maj_le, maj_par
from config_messagerie;
alter view config_messagerie_publique set (security_invoker = on);

-- ---------- 3. La liste des appels traités ----------
/*
 * Tout ce que l'opérateur doit avoir sous les yeux pour rappeler quelqu'un :
 * le rendez-vous, le bénéficiaire, et surtout SON TÉLÉPHONE et SON E-MAIL.
 * Trois formes de bénéficiaire, trois provenances de contact — pour un
 * proche, c'est le titulaire du compte qu'on joint, jamais l'enfant.
 *
 * `p_portee` :
 *   'console' — seulement les rendez-vous pris par l'administration (défaut) ;
 *   'tous'    — tous les rendez-vous de la plateforme. Cela n'ouvre aucun
 *               droit nouveau (`sel_rdv_admin` les donne déjà) mais évite à
 *               l'opérateur de changer d'écran quand l'appelant veut annuler
 *               un rendez-vous qu'il avait pris lui-même en ligne.
 */
create or replace function appels_centre_appel(
  p_recherche text default '',
  p_statut text default '',
  p_portee text default 'console',
  p_limite int default 20,
  p_decalage int default 0
)
returns table (
  id uuid,
  jour date,
  heure time,
  patient text,
  type_fiche text,
  telephone text,
  email text,
  titulaire text,
  medecin_id uuid,
  medecin text,
  medecin_telephone text,
  motif text,
  lieu text,
  adresse_domicile text,
  statut text,
  motif_annulation text,
  source text,
  pris_par text,
  pris_le timestamptz,
  total bigint
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_q text := trim(coalesce(p_recherche, ''));
  v_chiffres text := regexp_replace(coalesce(p_recherche, ''), '\D', '', 'g');
begin
  if not est_admin() then
    raise exception 'Réservé aux administrateurs.' using errcode = '42501';
  end if;

  return query
  with lignes as (
    select
      rv.id,
      rv.date as jour,
      rv.heure,
      coalesce(
        nullif(trim(coalesce(up.prenom, '') || ' ' || coalesce(up.nom, '')), ''),
        nullif(trim(pr.prenom || ' ' || pr.nom), ''),
        nullif(trim(sc.prenom || ' ' || sc.nom), ''),
        'Patient'
      ) as patient,
      case
        when rv.patient_id is not null then 'compte'
        when rv.proche_id is not null then 'proche'
        else 'sans_compte'
      end as type_fiche,
      -- Un proche n'a ni téléphone ni adresse : on joint le titulaire.
      coalesce(up.telephone, ut.telephone, sc.telephone, '') as telephone,
      coalesce(up.email, ut.email, '') as email,
      case
        when rv.proche_id is not null
          then trim(coalesce(ut.prenom, '') || ' ' || coalesce(ut.nom, ''))
        else ''
      end as titulaire,
      rv.medecin_id,
      nom_medecin(rv.medecin_id) as medecin,
      coalesce(um.telephone, m.telephone_secretariat, '') as medecin_telephone,
      coalesce(rv.motif, '') as motif,
      coalesce(rv.lieu, 'cabinet') as lieu,
      coalesce(rv.adresse_domicile, '') as adresse_domicile,
      rv.statut::text as statut,
      coalesce(rv.motif_annulation, '') as motif_annulation,
      rv.source::text as source,
      trim(coalesce(ua.prenom, '') || ' ' || coalesce(ua.nom, '')) as pris_par,
      rv.cree_le as pris_le
    from rendez_vous rv
    left join utilisateurs up on up.id = rv.patient_id
    left join proches pr on pr.id = rv.proche_id
    left join utilisateurs ut on ut.id = pr.patient_id
    left join patients_sans_compte sc on sc.id = rv.patient_sans_compte_id
    left join medecins m on m.id = rv.medecin_id
    left join utilisateurs um on um.id = rv.medecin_id
    left join utilisateurs ua on ua.id = rv.reserve_par
    where (coalesce(p_portee, 'console') <> 'console' or rv.reserve_par_role = 'admin')
  ),
  filtrees as (
    select l.* from lignes l
    where (
        p_statut is null or p_statut = ''
        or (p_statut = 'a_venir' and l.statut <> 'annule'
            and (l.jour > current_date
                 or (l.jour = current_date and l.heure >= (now() at time zone 'UTC')::time)))
        or (p_statut = 'passes' and l.statut <> 'annule'
            and (l.jour < current_date
                 or (l.jour = current_date and l.heure < (now() at time zone 'UTC')::time)))
        or l.statut = p_statut
      )
      and (
        v_q = ''
        or l.patient ilike '%' || v_q || '%'
        or l.medecin ilike '%' || v_q || '%'
        or l.motif ilike '%' || v_q || '%'
        or l.email ilike '%' || v_q || '%'
        or (v_chiffres <> ''
            and regexp_replace(l.telephone, '\D', '', 'g') like '%' || v_chiffres || '%')
      )
  )
  select
    f.id, f.jour, f.heure, f.patient, f.type_fiche, f.telephone, f.email, f.titulaire,
    f.medecin_id, f.medecin, f.medecin_telephone, f.motif, f.lieu, f.adresse_domicile,
    f.statut, f.motif_annulation, f.source, f.pris_par, f.pris_le,
    (select count(*) from filtrees) as total
  from filtrees f
  order by f.pris_le desc
  limit greatest(coalesce(p_limite, 20), 1) offset greatest(coalesce(p_decalage, 0), 0);
end;
$$;

revoke all on function appels_centre_appel(text, text, text, int, int) from public;
grant execute on function appels_centre_appel(text, text, text, int, int) to authenticated;

-- ---------- 4. Reprogrammer ----------
/*
 * Déplacer un rendez-vous, avec les mêmes règles d'agenda qu'à la prise :
 * le créneau visé doit être ouvert chez le praticien et ne pas être passé.
 * Le trigger `rdv_notifie` (0013) prévient le patient du déplacement.
 *
 * Un rendez-vous annulé ne se déplace pas : le ressusciter en le déplaçant
 * ferait réapparaître dans l'agenda du praticien un créneau qu'il croyait
 * libéré. On en reprend un nouveau.
 */
create or replace function reprogrammer_rdv_centre_appel(
  p_rdv uuid,
  p_date date,
  p_heure time,
  p_motif text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_rdv rendez_vous%rowtype;
  v_nom text;
begin
  if not est_admin() then
    raise exception 'Réservé aux administrateurs.' using errcode = '42501';
  end if;

  select * into v_rdv from rendez_vous where id = p_rdv;
  if v_rdv.id is null then
    raise exception 'Ce rendez-vous n''existe plus.';
  end if;
  if v_rdv.statut = 'annule' then
    raise exception 'Ce rendez-vous est annulé : reprenez-en un nouveau.';
  end if;

  if (p_date, p_heure) is distinct from (v_rdv.date, v_rdv.heure) then
    if (p_date + p_heure) < (now() at time zone 'UTC') then
      raise exception 'Ce créneau est déjà passé.';
    end if;
    if not creneau_ouvert_medecin(v_rdv.medecin_id, p_date, p_heure) then
      raise exception 'Ce créneau n''est pas ouvert dans l''agenda du praticien.';
    end if;
  end if;

  begin
    update rendez_vous
    set date = p_date,
        heure = p_heure,
        motif = coalesce(nullif(btrim(coalesce(p_motif, '')), ''), motif)
    where id = p_rdv;
  exception when unique_violation then
    raise exception 'Ce créneau vient d''être réservé par quelqu''un d''autre.';
  end;

  select coalesce(
    nullif(trim(coalesce(up.prenom, '') || ' ' || coalesce(up.nom, '')), ''),
    nullif(trim(pr.prenom || ' ' || pr.nom), ''),
    nullif(trim(sc.prenom || ' ' || sc.nom), ''), 'Patient')
  into v_nom
  from rendez_vous rv
  left join utilisateurs up on up.id = rv.patient_id
  left join proches pr on pr.id = rv.proche_id
  left join patients_sans_compte sc on sc.id = rv.patient_sans_compte_id
  where rv.id = p_rdv;

  perform ecrire_audit(
    'A déplacé un rendez-vous (centre d''appel)', 'rendez_vous', p_rdv,
    jsonb_build_object(
      'cible', v_nom || ' · ' || nom_medecin(v_rdv.medecin_id)
               || ' · ' || date_lisible(v_rdv.date, v_rdv.heure)
               || ' → ' || date_lisible(p_date, p_heure)
    )
  );
end;
$$;

revoke all on function reprogrammer_rdv_centre_appel(uuid, date, time, text) from public;
grant execute on function reprogrammer_rdv_centre_appel(uuid, date, time, text) to authenticated;

-- ---------- 5. Annuler ----------
/*
 * Le motif est OBLIGATOIRE. Une annulation muette est ingérable : l'opérateur
 * suivant ne sait pas si le patient s'est décommandé, si le praticien était
 * absent, ou si c'est une erreur de saisie — et c'est ce que le praticien
 * demandera en premier.
 *
 * Rien n'est effacé : le rendez-vous reste en base avec `statut = 'annule'`,
 * comme partout ailleurs dans ce projet. Le trigger prévient le patient ET le
 * praticien.
 */
create or replace function annuler_rdv_centre_appel(p_rdv uuid, p_motif text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_rdv rendez_vous%rowtype;
  v_nom text;
begin
  if not est_admin() then
    raise exception 'Réservé aux administrateurs.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'Indiquez le motif de l''annulation.';
  end if;

  select * into v_rdv from rendez_vous where id = p_rdv;
  if v_rdv.id is null then
    raise exception 'Ce rendez-vous n''existe plus.';
  end if;
  if v_rdv.statut = 'annule' then
    raise exception 'Ce rendez-vous est déjà annulé.';
  end if;
  if v_rdv.statut = 'honore' then
    raise exception 'Cette consultation a déjà eu lieu : elle ne peut plus être annulée.';
  end if;

  update rendez_vous
  set statut = 'annule', motif_annulation = btrim(p_motif)
  where id = p_rdv;

  select coalesce(
    nullif(trim(coalesce(up.prenom, '') || ' ' || coalesce(up.nom, '')), ''),
    nullif(trim(pr.prenom || ' ' || pr.nom), ''),
    nullif(trim(sc.prenom || ' ' || sc.nom), ''), 'Patient')
  into v_nom
  from rendez_vous rv
  left join utilisateurs up on up.id = rv.patient_id
  left join proches pr on pr.id = rv.proche_id
  left join patients_sans_compte sc on sc.id = rv.patient_sans_compte_id
  where rv.id = p_rdv;

  perform ecrire_audit(
    'A annulé un rendez-vous (centre d''appel)', 'rendez_vous', p_rdv,
    jsonb_build_object(
      'cible', v_nom || ' · ' || nom_medecin(v_rdv.medecin_id)
               || ' · ' || date_lisible(v_rdv.date, v_rdv.heure)
               || ' · motif : ' || btrim(p_motif)
    )
  );
end;
$$;

revoke all on function annuler_rdv_centre_appel(uuid, text) from public;
grant execute on function annuler_rdv_centre_appel(uuid, text) to authenticated;

-- ---------- 6. Supprimer ----------
/*
 * La suppression efface une ligne d'un dossier médical : elle est donc
 * étroitement bornée, et ce n'est pas de la timidité.
 *
 *   - Le rendez-vous doit d'abord être ANNULÉ. Supprimer un rendez-vous
 *     confirmé le ferait disparaître de l'agenda du praticien et de l'espace
 *     du patient sans que personne ne soit prévenu — l'annulation, elle,
 *     notifie les deux. Supprimer est fait pour la saisie erronée, pas pour se
 *     décommander.
 *   - Un rendez-vous portant un AVIS ne se supprime pas : `avis.rendez_vous_id`
 *     est en `on delete cascade` (migration 0011), la suppression emporterait
 *     l'avis du patient et le trigger recalculerait la note du praticien.
 *   - La trace d'audit est écrite AVANT, et survit : `journal_audit.cible_id`
 *     n'a pas de clé étrangère, précisément pour cela.
 */
create or replace function supprimer_rdv_centre_appel(p_rdv uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_rdv rendez_vous%rowtype;
  v_nom text;
begin
  if not est_admin() then
    raise exception 'Réservé aux administrateurs.' using errcode = '42501';
  end if;

  select * into v_rdv from rendez_vous where id = p_rdv;
  if v_rdv.id is null then
    raise exception 'Ce rendez-vous n''existe plus.';
  end if;
  if v_rdv.statut <> 'annule' then
    raise exception 'Annulez d''abord le rendez-vous : le patient et le praticien doivent en être prévenus.';
  end if;
  if exists (select 1 from avis a where a.rendez_vous_id = p_rdv) then
    raise exception 'Ce rendez-vous porte un avis de patient : le supprimer effacerait cet avis.';
  end if;

  select coalesce(
    nullif(trim(coalesce(up.prenom, '') || ' ' || coalesce(up.nom, '')), ''),
    nullif(trim(pr.prenom || ' ' || pr.nom), ''),
    nullif(trim(sc.prenom || ' ' || sc.nom), ''), 'Patient')
  into v_nom
  from rendez_vous rv
  left join utilisateurs up on up.id = rv.patient_id
  left join proches pr on pr.id = rv.proche_id
  left join patients_sans_compte sc on sc.id = rv.patient_sans_compte_id
  where rv.id = p_rdv;

  perform ecrire_audit(
    'A supprimé un rendez-vous annulé (centre d''appel)', 'rendez_vous', p_rdv,
    jsonb_build_object(
      'cible', v_nom || ' · ' || nom_medecin(v_rdv.medecin_id)
               || ' · ' || date_lisible(v_rdv.date, v_rdv.heure)
    )
  );

  -- Les notifications déjà envoyées pointent sur /mes-rendez-vous/<id> :
  -- laissées derrière, elles mèneraient le patient sur une page vide.
  delete from notifications where source_type = 'rendez_vous' and source_id = p_rdv;
  delete from rendez_vous where id = p_rdv;
end;
$$;

revoke all on function supprimer_rdv_centre_appel(uuid) from public;
grant execute on function supprimer_rdv_centre_appel(uuid) to authenticated;
