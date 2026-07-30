-- ============================================================
-- Docteur 224 — Notifications
--
-- La cloche de la barre haute mobile n'avait rien à afficher : aucune table
-- ne gardait trace des événements. Cette migration :
--   1. crée `notifications` (une ligne = un événement destiné à un compte) ;
--   2. l'alimente par des triggers, jamais par le client : personne ne peut
--      s'inventer une notification, ni en écrire une à quelqu'un d'autre ;
--   3. n'autorise le destinataire qu'à la marquer lue.
--
-- Les canaux SMS / e-mail restent hors sujet ici : `canaux` note seulement ce
-- qui *devrait* partir, selon les préférences du patient, pour qu'un envoi
-- réel puisse s'y brancher plus tard sans retoucher les triggers.
-- ============================================================

-- ---------- 1. Table ----------
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  destinataire_id uuid not null references utilisateurs (id) on delete cascade,
  type text not null,
  titre text not null,
  corps text,
  -- Écran à ouvrir au clic (chemin interne, ex. /mes-rendez-vous/<id>).
  lien text,
  -- Ce qui a déclenché la notification, pour tracer sans jointure obligatoire.
  source_type text,
  source_id uuid,
  canaux text[] not null default '{in_app}',
  lu_le timestamptz,
  cree_le timestamptz not null default now()
);

-- Le seul accès réel : « mes notifications, les plus récentes d'abord ».
create index if not exists idx_notifications_destinataire
  on notifications (destinataire_id, cree_le desc);
-- Compteur de la pastille : index partiel, les lues ne pèsent pas.
create index if not exists idx_notifications_non_lues
  on notifications (destinataire_id) where lu_le is null;

alter table notifications enable row level security;

-- ---------- 2. RLS ----------
-- Lecture : les siennes uniquement (l'admin n'a pas à lire le courrier des
-- autres ; le journal d'audit couvre déjà la traçabilité côté plateforme).
drop policy if exists sel_notifications on notifications;
create policy sel_notifications on notifications for select
  using (destinataire_id = auth.uid());

-- Écriture : réservée aux triggers (SECURITY DEFINER). Aucune policy INSERT
-- n'est créée, donc aucune insertion par le client n'est possible.

-- Mise à jour : uniquement pour marquer lu / non lu. Un trigger de garde
-- (§3) refuse toute autre modification.
drop policy if exists upd_notifications on notifications;
create policy upd_notifications on notifications for update
  using (destinataire_id = auth.uid()) with check (destinataire_id = auth.uid());

drop policy if exists del_notifications on notifications;
create policy del_notifications on notifications for delete
  using (destinataire_id = auth.uid());

-- ---------- 3. Garde : on ne modifie que `lu_le` ----------
create or replace function trg_notification_lecture_seule()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.destinataire_id is distinct from old.destinataire_id
     or new.type is distinct from old.type
     or new.titre is distinct from old.titre
     or new.corps is distinct from old.corps
     or new.lien is distinct from old.lien
     or new.source_type is distinct from old.source_type
     or new.source_id is distinct from old.source_id
     or new.canaux is distinct from old.canaux
     or new.cree_le is distinct from old.cree_le then
    raise exception 'Une notification ne peut être que marquée lue ou non lue.';
  end if;
  return new;
end;
$$;

drop trigger if exists notification_lecture_seule on notifications;
create trigger notification_lecture_seule
before update on notifications
for each row execute function trg_notification_lecture_seule();

-- ---------- 4. Fabrique commune ----------
-- Toutes les notifications passent par ici : un seul endroit décide des
-- canaux et ignore silencieusement un destinataire inconnu (un RDV créé pour
-- un proche n'a pas de compte à prévenir).
create or replace function creer_notification(
  p_destinataire uuid,
  p_type text,
  p_titre text,
  p_corps text default null,
  p_lien text default null,
  p_source_type text default null,
  p_source_id uuid default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_canaux text[] := array['in_app'];
  v_role role_utilisateur;
begin
  if p_destinataire is null then
    return;
  end if;
  select role into v_role from utilisateurs where id = p_destinataire;
  if v_role is null then
    return;
  end if;

  -- Le patient choisit ses rappels SMS / e-mail dans ses Paramètres ; on note
  -- ici ce qui devrait partir, l'envoi réel viendra s'y brancher.
  if v_role = 'patient' then
    select v_canaux
         || case when p.pref_rappels_sms then array['sms'] else '{}' end
         || case when p.pref_rappels_email then array['email'] else '{}' end
      into v_canaux
    from patients p where p.id = p_destinataire;
  end if;

  insert into notifications
    (destinataire_id, type, titre, corps, lien, source_type, source_id, canaux)
  values
    (p_destinataire, p_type, p_titre, p_corps, p_lien, p_source_type, p_source_id,
     coalesce(v_canaux, array['in_app']));
end;
$$;

-- Nom affichable d'un médecin (« Dr Mamadou Diallo »).
create or replace function nom_medecin(p_medecin_id uuid)
returns text
language sql stable security definer set search_path = public as $$
  select trim(coalesce(m.civilite, 'Dr') || ' ' || coalesce(u.prenom, '') || ' ' || coalesce(u.nom, ''))
  from medecins m join utilisateurs u on u.id = m.id
  where m.id = p_medecin_id;
$$;

-- Date lisible en français, sans dépendre de la locale du serveur.
create or replace function date_lisible(p_date date, p_heure time)
returns text
language sql immutable set search_path = public as $$
  select to_char(p_date, 'DD') || ' '
      || (array['janvier','février','mars','avril','mai','juin','juillet',
                'août','septembre','octobre','novembre','décembre'])[extract(month from p_date)::int]
      || ' à ' || to_char(p_heure, 'HH24:MI');
$$;

-- ---------- 5. Rendez-vous ----------
create or replace function trg_notifier_rdv()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_quand text := date_lisible(new.date, new.heure);
  v_medecin text := nom_medecin(new.medecin_id);
  v_lien text := '/mes-rendez-vous/' || new.id;
begin
  if tg_op = 'INSERT' then
    -- Le médecin est prévenu de toute réservation qu'il n'a pas saisie.
    if new.reserve_par is distinct from new.medecin_id then
      perform creer_notification(
        new.medecin_id, 'rdv_nouveau', 'Nouveau rendez-vous',
        'Le ' || v_quand || '.', '/espace-medecin/agenda', 'rendez_vous', new.id);
    end if;
    -- Le patient reçoit sa confirmation de réservation — y compris quand un
    -- assistant ou le médecin a réservé pour lui. Rien pour un rendez-vous de
    -- proche : il n'a pas de compte, creer_notification ignore un nul.
    perform creer_notification(
      new.patient_id, 'rdv_reserve', 'Rendez-vous enregistré',
      v_medecin || ' — le ' || v_quand || '.', v_lien, 'rendez_vous', new.id);
    return null;
  end if;

  -- UPDATE : on ne notifie que ce qui change vraiment pour le patient.
  if new.statut is distinct from old.statut then
    if new.statut = 'confirme' then
      perform creer_notification(
        new.patient_id, 'rdv_confirme', 'Rendez-vous confirmé',
        v_medecin || ' — le ' || v_quand || '.', v_lien, 'rendez_vous', new.id);
    elsif new.statut = 'annule' then
      -- Celui qui annule n'a pas besoin d'être prévenu de sa propre annulation.
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
    end if;
  elsif new.date is distinct from old.date or new.heure is distinct from old.heure then
    perform creer_notification(
      new.patient_id, 'rdv_reprogramme', 'Rendez-vous déplacé',
      v_medecin || ' — désormais le ' || v_quand || '.', v_lien, 'rendez_vous', new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists rdv_notifie on rendez_vous;
create trigger rdv_notifie
after insert or update on rendez_vous
for each row execute function trg_notifier_rdv();

-- ---------- 6. Avis ----------
create or replace function trg_notifier_avis()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform creer_notification(
      new.medecin_id, 'avis_nouveau', 'Nouvel avis reçu',
      new.note || '/5 — vous pouvez y répondre.', '/espace-medecin/avis', 'avis', new.id);
  elsif new.reponse_medecin is distinct from old.reponse_medecin
        and new.reponse_medecin is not null then
    perform creer_notification(
      new.patient_id, 'avis_reponse', 'Réponse à votre avis',
      nom_medecin(new.medecin_id) || ' a répondu.', '/medecin/' || new.medecin_id,
      'avis', new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists avis_notifie on avis;
create trigger avis_notifie
after insert or update on avis
for each row execute function trg_notifier_avis();

-- ---------- 7. Invitations d'établissement ----------
create or replace function trg_notifier_invitation()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_etab text;
  v_gestionnaire uuid;
begin
  select nom, gestionnaire_id into v_etab, v_gestionnaire
  from etablissements where id = new.etablissement_id;

  if tg_op = 'INSERT' then
    perform creer_notification(
      new.medecin_id, 'invitation_recue', 'Invitation reçue',
      v_etab || ' souhaite vous rattacher.', '/espace-medecin/compte',
      'invitation', new.id);
  elsif new.statut is distinct from old.statut and new.statut in ('acceptee', 'refusee') then
    perform creer_notification(
      v_gestionnaire, 'invitation_reponse',
      case when new.statut = 'acceptee' then 'Invitation acceptée' else 'Invitation refusée' end,
      nom_medecin(new.medecin_id) || '.', '/espace-etablissement/medecins',
      'invitation', new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists invitation_notifie on invitations_etablissement;
create trigger invitation_notifie
after insert or update on invitations_etablissement
for each row execute function trg_notifier_invitation();

-- ---------- 8. Validation d'un compte professionnel ----------
create or replace function trg_notifier_validation_medecin()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.statut is distinct from old.statut then
    if new.statut = 'valide' then
      perform creer_notification(
        new.id, 'compte_valide', 'Compte validé',
        'Votre profil est en ligne : les patients peuvent réserver.',
        '/espace-medecin', 'medecin', new.id);
    elsif new.statut = 'refuse' then
      perform creer_notification(
        new.id, 'compte_refuse', 'Dossier à compléter',
        'Votre inscription n''a pas été validée. Vérifiez vos documents.',
        '/espace-medecin/profil', 'medecin', new.id);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists medecin_notifie_validation on medecins;
create trigger medecin_notifie_validation
after update on medecins
for each row execute function trg_notifier_validation_medecin();

-- ---------- 9. Tout marquer lu ----------
-- Un seul aller-retour plutôt qu'un UPDATE par ligne depuis le client.
create or replace function marquer_notifications_lues()
returns integer
language sql security definer set search_path = public as $$
  with maj as (
    update notifications set lu_le = now()
    where destinataire_id = auth.uid() and lu_le is null
    returning 1
  )
  select count(*)::integer from maj;
$$;
