-- ============================================================
-- Docteur 224 — La file d'attente des e-mails
--
-- `notifications.canaux` annonce depuis la 0013 quels canaux DEVRAIENT partir.
-- Pour le téléphone, `lib/rdv-messages.ts` s'en charge côté serveur. Pour
-- l'e-mail, rien ne partait : une réservation faite par le patient lui-même
-- s'écrit depuis le navigateur, aucun code serveur ne tourne, et un trigger ne
-- peut pas appeler un serveur SMTP — il bloquerait la transaction qui l'a
-- déclenché, c'est-à-dire la réservation du patient.
--
-- D'où une file. Le trigger y dépose une ligne — une écriture locale,
-- instantanée — et une route serveur la vide de son côté. Trois bénéfices que
-- l'envoi direct n'aurait pas : le réessai, la trace de ce qui n'est pas
-- parti, et surtout `programme_pour`, qui fait des rappels J-1 et H-5 des
-- lignes ordinaires de la même file plutôt qu'un second mécanisme à écrire,
-- à surveiller et à déboguer.
--
-- Aucune policy RLS, comme `config_messagerie` : la file porte des adresses
-- e-mail et ne regarde que le serveur. Elle n'est lue que par la service_role.
-- ============================================================

-- ---------- 1 · États ----------
/*
 * `en_cours` n'est pas un état décoratif : sans lui, deux exécutions du drain
 * qui se chevauchent enverraient le même message deux fois. Une ligne est
 * réservée avant l'envoi, et une ligne réservée depuis trop longtemps — le
 * processus est tombé entre la réservation et le verdict — retourne d'elle-même
 * à `a_envoyer`.
 */
do $$ begin
  create type etat_email as enum ('a_envoyer', 'en_cours', 'envoye', 'echec', 'abandonne');
exception when duplicate_object then null;
end $$;

-- ---------- 2 · La file ----------
create table if not exists emails_en_attente (
  id uuid primary key default gen_random_uuid(),

  /*
   * La notification dont cet e-mail est le prolongement. NULLE pour un rappel :
   * un rappel n'est pas un événement qui vient de se produire, c'est une
   * échéance posée à l'avance — il n'a donc rien à afficher dans la cloche au
   * moment où on le programme.
   *
   * UNIQUE : c'est la garantie d'idempotence. Le trigger peut être rejoué, la
   * route appelée deux fois, un même événement ne partira jamais en double.
   */
  notification_id uuid unique references notifications (id) on delete cascade,

  destinataire_id uuid not null references utilisateurs (id) on delete cascade,
  -- Figée au moment du dépôt : si le destinataire change d'adresse ensuite, le
  -- message part à celle qu'il avait quand l'événement s'est produit, et un
  -- compte anonymisé n'expédie rien vers son adresse de remplacement.
  adresse text not null,

  -- Le type porte le sens de l'événement (`rdv_reserve`, `rappel_j1`…). C'est
  -- lui que la phase 3 lira pour choisir le gabarit du message.
  type text not null,
  titre text not null,
  corps text,
  lien text,
  source_type text,
  source_id uuid,

  -- Quand l'envoyer. `now()` pour tout ce qui suit un événement ; une date
  -- future pour un rappel.
  programme_pour timestamptz not null default now(),

  etat etat_email not null default 'a_envoyer',
  tentatives smallint not null default 0,
  derniere_erreur text,
  reserve_le timestamptz,
  envoye_le timestamptz,
  cree_le timestamptz not null default now()
);

/*
 * Idempotence des rappels. `notification_id` est nul pour eux, donc la
 * contrainte d'unicité ci-dessus ne les couvre pas : sans cet index, replacer
 * deux fois un rendez-vous laisserait deux rappels J-1 en file.
 */
create unique index if not exists emails_rappel_unique
  on emails_en_attente (source_type, source_id, type)
  where notification_id is null;

-- L'unique accès du drain : « ce qui est dû, le plus ancien d'abord ». Index
-- partiel — une file vidée ne pèse rien, et les lignes envoyées, qui forment
-- l'essentiel du volume avec le temps, n'y entrent jamais.
create index if not exists emails_a_envoyer
  on emails_en_attente (programme_pour)
  where etat in ('a_envoyer', 'en_cours');

alter table emails_en_attente enable row level security;
-- Aucune policy : voir l'en-tête. Seule la service_role y accède.

-- ---------- 3 · À qui peut-on écrire ----------
/*
 * Une fonction et non un `where` recopié : la règle « à qui la plateforme
 * s'autorise-t-elle à écrire » doit avoir UN seul endroit où on la lit et où
 * on la corrige.
 *
 * Un compte supprimé porte une adresse de remplacement `supprime-<id>@…` qui
 * n'existe chez personne : lui écrire ne ferait qu'accumuler des rebonds et
 * abîmer la réputation d'expéditeur du domaine. Un compte suspendu, lui, n'a
 * plus accès au service ; lui envoyer des notifications de rendez-vous serait
 * au mieux incohérent.
 */
create or replace function email_destinataire(p_utilisateur uuid)
returns text
language sql stable security definer set search_path = public as $$
  select u.email
  from utilisateurs u
  where u.id = p_utilisateur
    and u.statut = 'actif'
    and not u.suspendu_par_admin
    and u.email is not null
    and u.email <> ''
    and u.email not like 'supprime-%'
$$;

-- ---------- 4 · Le dépôt en file ----------
/*
 * Une fabrique, exactement comme `creer_notification` en est une pour la
 * cloche. Tout ce qui part par courriel passe par ici : un seul endroit décide
 * de l'idempotence, et un destinataire à qui l'on n'écrit pas est ignoré en
 * silence plutôt que de faire échouer l'événement qui l'a déclenché.
 */
create or replace function programmer_email(
  p_destinataire uuid,
  p_type text,
  p_titre text,
  p_corps text default null,
  p_lien text default null,
  p_source_type text default null,
  p_source_id uuid default null,
  p_notification uuid default null,
  p_quand timestamptz default now()
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_adresse text := email_destinataire(p_destinataire);
begin
  if v_adresse is null then
    return;
  end if;

  /*
   * Un rappel dont l'échéance est déjà passée n'a plus d'objet : prévenir
   * quelqu'un la veille d'un rendez-vous qui a lieu dans deux heures, c'est
   * lui écrire pour rien. L'appelant décide de ne pas l'appeler ; on double
   * la garde ici parce qu'une date passée est une erreur silencieuse.
   */
  if p_quand < now() - interval '1 hour' then
    return;
  end if;

  insert into emails_en_attente
    (notification_id, destinataire_id, adresse, type, titre, corps, lien,
     source_type, source_id, programme_pour)
  values
    (p_notification, p_destinataire, v_adresse, p_type, p_titre, p_corps, p_lien,
     p_source_type, p_source_id, p_quand)
  -- Rejouer un trigger ne doit jamais produire un doublon. Les deux index
  -- d'unicité (notification, et rappel par source+type) sont couverts.
  on conflict do nothing;
end;
$$;

-- ---------- 5 · L'e-mail suit la notification ----------
/*
 * Le cœur du dispositif. `creer_notification` est déjà l'entonnoir unique par
 * lequel passe chaque notification de chaque rôle : c'est donc ici, et nulle
 * part ailleurs, que se décide l'envoi d'un courriel. Conséquence voulue :
 * toute notification ajoutée plus tard partira par e-mail sans une ligne de
 * code de plus.
 *
 * Deux changements par rapport à la 0036 :
 *
 * 1. Le canal `email` n'est plus réservé au patient. Le médecin, l'assistant,
 *    l'établissement et l'administrateur en reçoivent aussi — c'est la demande
 *    même à l'origine de ce chantier. Le patient garde sa préférence
 *    (`pref_rappels_email`) ; les professionnels n'en ont pas encore, ils
 *    reçoivent donc tout. Leur donner le choix est le travail de la phase 4.
 *
 * 2. La notification insérée est reprise (`returning`) pour déposer la ligne
 *    de file qui lui correspond.
 *
 * Le reste — le choix entre WhatsApp et SMS, le titulaire qui paie — est
 * conservé mot pour mot : ce n'est pas le sujet de cette migration.
 */
create or replace function creer_notification(
  p_destinataire uuid,
  p_type text,
  p_titre text,
  p_corps text default null,
  p_lien text default null,
  p_source_type text default null,
  p_source_id uuid default null,
  p_titulaire uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_canaux text[] := array['in_app'];
  v_role role_utilisateur;
  v_pref preferences_rappels%rowtype;
  v_sms boolean := false;
  v_whatsapp boolean := false;
  v_email boolean := false;
  v_notification uuid;
begin
  if p_destinataire is null then
    return;
  end if;
  select role into v_role from utilisateurs where id = p_destinataire;
  if v_role is null then
    return;
  end if;

  if v_role = 'patient' and p_titulaire is not null then
    select * into v_pref from preferences_rappels where titulaire_id = p_titulaire;
    if v_pref.titulaire_id is null or v_pref.rappels_actifs then
      select
        coalesce(v_pref.whatsapp_autorise, true) and p.pref_rappels_whatsapp,
        coalesce(v_pref.sms_autorise, false) and p.pref_rappels_sms
      into v_whatsapp, v_sms
      from patients p where p.id = p_destinataire;

      -- Un seul canal payant : WhatsApp s'il est possible, le SMS en repli.
      if v_whatsapp then
        v_canaux := v_canaux || array['whatsapp'];
      elsif v_sms then
        v_canaux := v_canaux || array['sms'];
      end if;
    end if;
  end if;

  -- L'e-mail ne coûte rien : le patient suit sa préférence, le professionnel
  -- reçoit tant qu'il n'a pas de réglage à lui.
  if v_role = 'patient' then
    select coalesce(p.pref_rappels_email, true) into v_email
      from patients p where p.id = p_destinataire;
  else
    v_email := true;
  end if;
  if v_email then
    v_canaux := v_canaux || array['email'];
  end if;

  insert into notifications
    (destinataire_id, type, titre, corps, lien, source_type, source_id, canaux)
  values
    (p_destinataire, p_type, p_titre, p_corps, p_lien, p_source_type, p_source_id,
     coalesce(v_canaux, array['in_app']))
  returning id into v_notification;

  if v_email then
    perform programmer_email(
      p_destinataire, p_type, p_titre, p_corps, p_lien,
      p_source_type, p_source_id, v_notification, now());
  end if;
end;
$$;

-- ---------- 6 · Les rappels avant le rendez-vous ----------
/*
 * Conakry est à UTC+0 toute l'année, sans heure d'été : un `date + heure` du
 * rendez-vous est donc déjà l'instant réel, sans conversion. La fonction
 * existe quand même, et elle est la SEULE à faire ce calcul — le jour où un
 * fuseau devra être pris en compte, il y aura un endroit et un seul à changer.
 */
create or replace function moment_rdv(p_date date, p_heure time)
returns timestamptz
language sql immutable set search_path = public as $$
  select (p_date + p_heure) at time zone 'UTC'
$$;

/*
 * Deux rappels, J-1 et H-5, décidés avec l'exploitant.
 *
 * Ils sont posés à la RÉSERVATION et non balayés chaque nuit : une file avec
 * une échéance rend le balayage inutile, et surtout rend l'annulation exacte —
 * supprimer la ligne suffit, là où un balayage devrait se souvenir de ne pas
 * envoyer.
 *
 * Un rendez-vous pris pour dans trois heures ne reçoit ni l'un ni l'autre : la
 * confirmation qui vient de partir EST le rappel. `programmer_email` refuse de
 * toute façon une échéance passée, mais on s'abstient ici de la demander —
 * une garde qui se contente d'être doublée finit par être la seule.
 */
create or replace function programmer_rappels_rdv(p_rdv uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_moment timestamptz;
  v_medecin text;
  v_quand text;
  v_lien text;
begin
  select rv.id, rv.date, rv.heure, rv.patient_id, rv.medecin_id, rv.statut
    into r
  from rendez_vous rv where rv.id = p_rdv;

  -- Pas de compte à prévenir : un rendez-vous de proche est rattaché au
  -- titulaire, qui est notifié par ailleurs ; une fiche sans compte n'a pas
  -- d'adresse. Un rendez-vous annulé n'a plus de rappel à recevoir.
  if r.patient_id is null or r.statut = 'annule' then
    return;
  end if;

  v_moment := moment_rdv(r.date, r.heure);
  v_medecin := nom_medecin(r.medecin_id);
  v_quand := date_lisible(r.date, r.heure);
  v_lien := '/mes-rendez-vous/' || r.id;

  if v_moment - interval '24 hours' > now() then
    perform programmer_email(
      r.patient_id, 'rappel_j1', 'Rappel : rendez-vous demain',
      v_medecin || ' — le ' || v_quand || '.', v_lien, 'rendez_vous', r.id,
      null, v_moment - interval '24 hours');
  end if;

  if v_moment - interval '5 hours' > now() then
    perform programmer_email(
      r.patient_id, 'rappel_h5', 'Rappel : rendez-vous dans quelques heures',
      v_medecin || ' — le ' || v_quand || '.', v_lien, 'rendez_vous', r.id,
      null, v_moment - interval '5 hours');
  end if;
end;
$$;

/*
 * Un rappel qui n'a plus lieu d'être doit DISPARAÎTRE, pas être filtré à
 * l'envoi : une file qui garde des lignes mortes finit par en envoyer une.
 * Seules les lignes encore en attente sont supprimées — ce qui est déjà parti
 * reste au journal.
 */
create or replace function annuler_rappels_rdv(p_rdv uuid)
returns void
language sql security definer set search_path = public as $$
  delete from emails_en_attente
  where source_type = 'rendez_vous'
    and source_id = p_rdv
    and notification_id is null
    and etat in ('a_envoyer', 'en_cours')
$$;

-- ---------- 7 · Le trigger des rendez-vous programme les rappels ----------
/*
 * Reprise de la 0036 à l'identique pour les notifications ; s'y ajoutent les
 * rappels. Recréée en entier et non complétée : Postgres garde le corps d'une
 * fonction sous forme de texte, et une version partielle appliquée par erreur
 * laisserait le reste en place sans rien signaler.
 */
create or replace function trg_notifier_rdv()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_quand text := date_lisible(new.date, new.heure);
  v_medecin text := nom_medecin(new.medecin_id);
  v_lien text := '/mes-rendez-vous/' || new.id;
  v_titulaire uuid := titulaire_abonnement_medecin(new.medecin_id);
begin
  if tg_op = 'INSERT' then
    if new.reserve_par is distinct from new.medecin_id then
      perform creer_notification(
        new.medecin_id, 'rdv_nouveau', 'Nouveau rendez-vous',
        'Le ' || v_quand || '.', '/espace-medecin/agenda', 'rendez_vous', new.id);
    end if;
    perform creer_notification(
      new.patient_id, 'rdv_reserve', 'Rendez-vous enregistré',
      v_medecin || ' — le ' || v_quand || '.', v_lien, 'rendez_vous', new.id, v_titulaire);
    perform programmer_rappels_rdv(new.id);
    return null;
  end if;

  if new.statut is distinct from old.statut then
    if new.statut = 'confirme' then
      perform creer_notification(
        new.patient_id, 'rdv_confirme', 'Rendez-vous confirmé',
        v_medecin || ' — le ' || v_quand || '.', v_lien, 'rendez_vous', new.id, v_titulaire);
    elsif new.statut = 'annule' then
      if auth.uid() is distinct from new.patient_id then
        perform creer_notification(
          new.patient_id, 'rdv_annule', 'Rendez-vous annulé',
          v_medecin || ' — le ' || v_quand || '.', v_lien, 'rendez_vous', new.id, v_titulaire);
      end if;
      if auth.uid() is distinct from new.medecin_id then
        perform creer_notification(
          new.medecin_id, 'rdv_annule', 'Rendez-vous annulé',
          'Le ' || v_quand || '.', '/espace-medecin/agenda', 'rendez_vous', new.id);
      end if;
      -- Le rendez-vous n'aura pas lieu : les rappels n'ont plus d'objet.
      perform annuler_rappels_rdv(new.id);
    end if;
  elsif new.date is distinct from old.date or new.heure is distinct from old.heure then
    perform creer_notification(
      new.patient_id, 'rdv_reprogramme', 'Rendez-vous déplacé',
      v_medecin || ' — désormais le ' || v_quand || '.', v_lien, 'rendez_vous', new.id, v_titulaire);
    -- Les anciens rappels visaient l'ancienne date : on les remplace, sans
    -- quoi le patient serait prévenu la veille d'un rendez-vous déplacé.
    perform annuler_rappels_rdv(new.id);
    perform programmer_rappels_rdv(new.id);
  end if;
  return null;
end;
$$;

-- ---------- 8 · Réservation atomique par le drain ----------
/*
 * Le drain ne lit pas la file : il en RÉSERVE un lot. La différence fait tout.
 * Deux exécutions concurrentes — le cron et la poussée du navigateur après une
 * réservation — liraient les mêmes lignes et enverraient deux fois le même
 * message. `for update skip locked` donne à chacune un lot disjoint, sans que
 * l'une attende l'autre.
 *
 * Les lignes `en_cours` trop anciennes sont reprises : entre la réservation et
 * le verdict, le processus peut tomber (un serveur sans état peut être arrêté
 * à tout moment). Sans cette reprise, ces messages resteraient bloqués pour
 * toujours. Cinq minutes est très au-delà du délai SMTP de 10 s, donc on ne
 * reprend jamais un envoi encore en cours.
 */
create or replace function reserver_emails(p_limite integer default 20)
returns setof emails_en_attente
language sql security definer set search_path = public as $$
  update emails_en_attente
  set etat = 'en_cours',
      reserve_le = now(),
      tentatives = tentatives + 1
  where id in (
    select e.id from emails_en_attente e
    where e.programme_pour <= now()
      and (e.etat = 'a_envoyer'
           or (e.etat = 'en_cours' and e.reserve_le < now() - interval '5 minutes'))
    order by e.programme_pour
    limit p_limite
    for update skip locked
  )
  returning *;
$$;

/*
 * Le verdict. Trois tentatives puis abandon : un serveur SMTP qui refuse trois
 * fois refuse une adresse, pas un message — insister ne ferait qu'abîmer la
 * réputation d'expéditeur du domaine. La ligne reste en base avec son motif :
 * ce qui n'est pas parti doit pouvoir être expliqué.
 */
create or replace function marquer_email(
  p_id uuid,
  p_succes boolean,
  p_erreur text default null
)
returns void
language sql security definer set search_path = public as $$
  update emails_en_attente
  set etat = case
        when p_succes then 'envoye'::etat_email
        when tentatives >= 3 then 'abandonne'::etat_email
        else 'a_envoyer'::etat_email
      end,
      envoye_le = case when p_succes then now() else envoye_le end,
      derniere_erreur = case when p_succes then null else p_erreur end
  where id = p_id;
$$;

-- Ces trois fonctions écrivent sans demander la permission à la RLS : elles
-- n'appartiennent qu'au serveur.
revoke execute on function reserver_emails(integer) from public, anon, authenticated;
revoke execute on function marquer_email(uuid, boolean, text) from public, anon, authenticated;
revoke execute on function programmer_email(uuid, text, text, text, text, text, uuid, uuid, timestamptz)
  from public, anon, authenticated;
