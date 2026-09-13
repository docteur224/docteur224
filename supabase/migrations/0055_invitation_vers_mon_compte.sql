-- ============================================================
-- Docteur 224 — La notification d'invitation mène au bon écran
--
-- `trg_notifier_invitation` (migration 0013) envoie le praticien vers
-- /espace-medecin/compte. C'est le hub MOBILE : la barre latérale du web
-- ne pointe jamais vers lui, elle propose « Mon compte » — qui est
-- /espace-medecin/mon-compte, un autre écran. Sur ordinateur, cliquer sur
-- « Invitation reçue » déposait donc le praticien sur une page qu'il
-- n'aurait trouvée par aucun autre chemin.
--
-- Le lien vise désormais /espace-medecin/mon-compte, présent dans la barre
-- latérale du web ET dans le menu mobile : le praticien peut y revenir
-- après coup, ce qu'une notification ne garantit pas (elle se marque lue,
-- et le lien disparaît de la cloche).
--
-- LES NOTIFICATIONS DÉJÀ ENVOYÉES sont réécrites, pas seulement les
-- suivantes : une invitation en attente dans une cloche renverrait sinon
-- toujours au mauvais écran, et son destinataire n'a aucun moyen de
-- deviner le bon. Il faut pour cela lever `notification_lecture_seule`
-- le temps de l'UPDATE — cette garde ne fait AUCUNE exception, pas même
-- pour service_role : c'est précisément ce qui fait qu'une notification
-- ne peut pas être réécrite depuis l'application. La migration est le
-- seul endroit légitime pour la suspendre, et elle la remet aussitôt.
-- ============================================================

-- ---------- 1. Les invitations à venir ----------
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
      v_etab || ' souhaite vous rattacher.', '/espace-medecin/mon-compte',
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

-- ---------- 2. Les invitations déjà dans les cloches ----------
alter table notifications disable trigger notification_lecture_seule;

update notifications
   set lien = '/espace-medecin/mon-compte'
 where type = 'invitation_recue'
   and lien = '/espace-medecin/compte';

alter table notifications enable trigger notification_lecture_seule;
