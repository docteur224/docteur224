-- ============================================================
-- Docteur 224 — Présence aux rendez-vous
--
-- Le cycle d'un rendez-vous manquait d'un maillon. On savait dire qu'un
-- patient avait été « honoré » ou « absent » APRÈS coup (migration 0063),
-- mais rien ne marquait le moment où il ARRIVE au cabinet — l'instant que le
-- secrétariat vit en premier. D'où la valeur 'present', posée à l'accueil,
-- entre « confirmé » et « honoré ».
--
--   confirmé / en attente → présent → honoré
--                         → absent
--                         → annulé (chemin inchangé, géré ailleurs)
--
-- Trois points, tous au même endroit — la fonction `qualifier_rdv`, qui
-- reste le SEUL chemin d'écriture d'un statut de présence :
--
--   1. la valeur 'present' ;
--   2. des transitions CONTRÔLÉES — on ne déclare pas honoré ce qui n'a pas
--      eu lieu, on ne requalifie pas une annulation, et on ne repart pas d'un
--      état déjà tranché SANS se corriger explicitement. La correction lève la
--      garde, et elle seule, en journalisant l'ancien → le nouveau ;
--   3. la notification au patient quand il est marqué « absent » — la cloche
--      in-app part d'ici (trigger), le courriel part de la route serveur, qui
--      ne peut pas vivre dans une transaction.
-- ============================================================

-- ------------------------------------------------------------
-- 1. La valeur qui manquait
-- ------------------------------------------------------------
-- Comme pour 'absent' (0063) : posée en tête et seule. PostgreSQL interdit
-- d'UTILISER une valeur d'enum dans la transaction qui l'ajoute ; les
-- fonctions ci-dessous sont en plpgsql (corps analysé à la première
-- exécution) et reçoivent le statut en texte, converti au moment de l'écriture.
alter type statut_rdv add value if not exists 'present';

-- ------------------------------------------------------------
-- 2. Qualification : présence, honoré, absent — et correction
-- ------------------------------------------------------------
/*
 * L'ancienne signature (p_rdv_id, p_statut) est remplacée par une version qui
 * accepte 'present' et porte deux paramètres optionnels : `p_correction` pour
 * revenir sur une erreur de saisie, `p_motif` pour en garder la raison. Les
 * appels à deux arguments existants continuent de fonctionner — les nouveaux
 * paramètres ont une valeur par défaut.
 *
 * On DROP d'abord : `create or replace` ne peut pas changer la liste des
 * arguments, il créerait une seconde fonction au lieu de remplacer la première.
 */
drop function if exists qualifier_rdv(uuid, text);

create or replace function qualifier_rdv(
  p_rdv_id uuid,
  p_statut text,
  p_correction boolean default false,
  p_motif text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  r rendez_vous;
  v_ancien statut_rdv;
  v_beneficiaire text;
  v_motif text := nullif(trim(coalesce(p_motif, '')), '');
begin
  if p_statut not in ('present', 'honore', 'absent') then
    raise exception 'Qualification inconnue : %', coalesce(p_statut, 'néant');
  end if;

  select * into r from rendez_vous where id = p_rdv_id for update;
  if not found then
    raise exception 'Rendez-vous introuvable.';
  end if;
  -- Le médecin, ou son assistant (le secrétariat). Personne d'autre.
  if r.medecin_id <> auth.uid() and r.medecin_id is distinct from medecin_de_assistant() then
    raise exception 'Ce rendez-vous n''est pas le vôtre.';
  end if;

  v_ancien := r.statut;

  -- Une annulation est un fait, pas une attente : elle ne se qualifie pas.
  -- Reprendre un rendez-vous annulé passe par une nouvelle réservation.
  if v_ancien = 'annule' then
    raise exception 'Un rendez-vous annulé ne se qualifie pas.';
  end if;

  -- « Honoré » et « absent » ne se posent qu'APRÈS l'heure : avant, les deux
  -- sont des suppositions. « Présent », lui, se pose à l'arrivée — le jour même.
  -- Guinée : la base tourne en UTC, qui est l'heure locale ; `localtimestamp`
  -- compare une date + une heure, sans fuseau.
  if p_statut in ('honore', 'absent') and (r.date + r.heure) > localtimestamp then
    raise exception 'Ce rendez-vous n''a pas encore eu lieu.';
  end if;

  -- Transitions contrôlées. La correction explicite (p_correction) lève la
  -- garde pour revenir sur une erreur — et elle seule. Hors correction, on ne
  -- repart pas d'un état déjà tranché ; seule la suite normale présent →
  -- honoré / absent reste ouverte.
  if not p_correction
     and v_ancien in ('present', 'honore', 'absent')
     and not (v_ancien = 'present' and p_statut in ('honore', 'absent')) then
    raise exception 'Transition non autorisée (% → %). Passez par la correction.',
      v_ancien, p_statut;
  end if;

  -- Statut inchangé : rien à écrire, et surtout aucune seconde notification.
  if v_ancien = p_statut::statut_rdv then
    return;
  end if;

  update rendez_vous set statut = p_statut::statut_rdv where id = r.id;

  select coalesce(
    (select u.prenom || ' ' || u.nom from utilisateurs u where u.id = r.patient_id),
    (select p.prenom || ' ' || p.nom from proches p where p.id = r.proche_id),
    (select s.prenom || ' ' || s.nom from patients_sans_compte s where s.id = r.patient_sans_compte_id),
    'Patient'
  ) into v_beneficiaire;

  perform ecrire_audit(
    case
      when p_correction then 'A corrigé le statut d''un rendez-vous'
      when p_statut = 'present' then 'A marqué un patient présent'
      when p_statut = 'honore' then 'A marqué un rendez-vous comme honoré'
      else 'A marqué un patient absent'
    end,
    'rendez_vous', r.id,
    jsonb_build_object(
      'cible', v_beneficiaire || ' · ' || r.date || ' ' || to_char(r.heure, 'HH24:MI'),
      'ancien', v_ancien,
      'nouveau', p_statut,
      'correction', p_correction,
      'motif', v_motif
    )
  );
end;
$$;

-- ------------------------------------------------------------
-- 3. Notification in-app du no-show
-- ------------------------------------------------------------
/*
 * Le trigger `rdv_notifie` (migration 0013) prévenait déjà le patient d'une
 * confirmation, d'une annulation, d'un déplacement. Il lui manquait le
 * no-show : quand son rendez-vous passe à « absent », il reçoit un mot dans la
 * cloche. Le COURRIEL, lui, ne part pas d'ici — il sort de la base (appel
 * réseau à l'agrégateur) et un trigger qui attend le réseau bloquerait la
 * transaction. Il part de la route serveur /api/medecin/rdv/[id]/absent.
 *
 * La notification ne part qu'au vrai passage à « absent » (le trigger ne se
 * déclenche que si `statut` change). Un rendez-vous corrigé qui repasse plus
 * tard en « absent » re-notifie : c'est un nouveau constat, et le patient a
 * besoin de le savoir.
 *
 * On réécrit le corps en entier pour y insérer la branche ; le reste est
 * identique à 0013.
 */
create or replace function trg_notifier_rdv()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_quand text := date_lisible(new.date, new.heure);
  v_medecin text := nom_medecin(new.medecin_id);
  v_lien text := '/mes-rendez-vous/' || new.id;
begin
  if tg_op = 'INSERT' then
    if new.reserve_par is distinct from new.medecin_id then
      perform creer_notification(
        new.medecin_id, 'rdv_nouveau', 'Nouveau rendez-vous',
        'Le ' || v_quand || '.', '/espace-medecin/agenda', 'rendez_vous', new.id);
    end if;
    perform creer_notification(
      new.patient_id, 'rdv_reserve', 'Rendez-vous enregistré',
      v_medecin || ' — le ' || v_quand || '.', v_lien, 'rendez_vous', new.id);
    return null;
  end if;

  if new.statut is distinct from old.statut then
    if new.statut = 'confirme' then
      perform creer_notification(
        new.patient_id, 'rdv_confirme', 'Rendez-vous confirmé',
        v_medecin || ' — le ' || v_quand || '.', v_lien, 'rendez_vous', new.id);
    elsif new.statut = 'annule' then
      if auth.uid() is distinct from new.patient_id then
        perform creer_notification(
          new.patient_id, 'rdv_annule', 'Rendez-vous annulé',
          v_medecin || ' — le ' || v_quand || '.', v_lien, 'rendez_vous', new.id);
      end if;
      if auth.uid() is distinct from new.medecin_id then
        perform creer_notification(
          new.medecin_id, 'rdv_annule', 'Rendez-vous annulé',
          'Le ' || v_quand || '.', '/espace-medecin/agenda', 'rendez_vous', new.id);
      end if;
    elsif new.statut = 'absent' then
      -- No-show : le patient est prévenu qu'on a constaté son absence.
      perform creer_notification(
        new.patient_id, 'rdv_absent', 'Absence constatée',
        'Vous ne vous êtes pas présenté(e) au rendez-vous avec ' || v_medecin
          || ' du ' || v_quand || '.', v_lien, 'rendez_vous', new.id);
    end if;
  elsif new.date is distinct from old.date or new.heure is distinct from old.heure then
    perform creer_notification(
      new.patient_id, 'rdv_reprogramme', 'Rendez-vous déplacé',
      v_medecin || ' — désormais le ' || v_quand || '.', v_lien, 'rendez_vous', new.id);
  end if;
  return null;
end;
$$;

-- Le trigger lui-même est inchangé ; on le laisse en place.

-- La nouvelle signature de `qualifier_rdv` doit être vue tout de suite par
-- l'API : on demande à PostgREST de relire le schéma.
notify pgrst, 'reload schema';
