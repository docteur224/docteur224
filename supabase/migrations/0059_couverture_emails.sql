-- ============================================================
-- Docteur 224 — Couverture des notifications par e-mail
--
-- Trois manques, comblés ensemble parce qu'ils tiennent au même endroit :
--
--   1. Les ASSISTANTS ne recevaient rien. Ils tiennent pourtant l'agenda du
--      praticien : un rendez-vous pris en ligne leur arrivait sans qu'aucun
--      message ne les prévienne.
--   2. Les ADMINISTRATEURS non plus. Un dossier professionnel pouvait
--      attendre une semaine sans que personne ne le sache.
--   3. Personne ne pouvait SE DÉSABONNER. Une plateforme qui écrit sans
--      offrir d'arrêt finit dans les indésirables, et c'est mérité.
--
-- La décision de fond est le partage entre deux natures de courriel :
--
--   • les e-mails DE SERVICE — votre rendez-vous est confirmé, déplacé,
--     annulé — qui ne se désactivent pas : ils SONT le service ;
--   • les e-mails D'INFORMATION — rappels, résumés — qui se désactivent en
--     un clic, sans connexion, depuis le pied du message.
--
-- Conséquence assumée sur l'existant : `patients.pref_rappels_email` coupait
-- TOUT courriel. Elle devient `preferences_email.rappels` et ne coupe plus que
-- les rappels ; un patient qui l'avait décochée recevra désormais la
-- confirmation du rendez-vous qu'il vient lui-même de prendre. C'est ce que
-- son libellé a toujours promis (« rappels »), et ce qu'attend quelqu'un qui
-- réserve.
-- ============================================================

-- ---------- 1 · Les préférences, pour tous les rôles ----------
/*
 * Une table par UTILISATEUR, et non par titulaire d'abonnement comme
 * `preferences_rappels` : un assistant ou un administrateur n'est titulaire de
 * rien et doit pouvoir se désabonner comme les autres.
 *
 * `jeton` est ce qui rend le désabonnement possible depuis un courriel, sans
 * connexion. Il n'ouvre aucun accès : il ne permet que de régler ces deux
 * interrupteurs, et ne révèle ni le nom ni l'adresse de son porteur.
 */
create table if not exists preferences_email (
  utilisateur_id uuid primary key references utilisateurs (id) on delete cascade,
  rappels boolean not null default true,
  resumes boolean not null default true,
  jeton uuid not null default gen_random_uuid(),
  maj_le timestamptz not null default now()
);

create unique index if not exists preferences_email_jeton on preferences_email (jeton);

alter table preferences_email enable row level security;

drop policy if exists sel_pref_email on preferences_email;
create policy sel_pref_email on preferences_email for select
  using (utilisateur_id = auth.uid() or est_admin());
drop policy if exists ins_pref_email on preferences_email;
create policy ins_pref_email on preferences_email for insert
  with check (utilisateur_id = auth.uid());
drop policy if exists upd_pref_email on preferences_email;
create policy upd_pref_email on preferences_email for update
  using (utilisateur_id = auth.uid()) with check (utilisateur_id = auth.uid());

/*
 * Reprise de l'existant : le choix déjà exprimé par un patient ne doit pas se
 * perdre dans la migration. Tous les autres comptes partent à « oui », ce qui
 * est le réglage par défaut de la table.
 */
insert into preferences_email (utilisateur_id, rappels)
select p.id, p.pref_rappels_email from patients p
on conflict (utilisateur_id) do nothing;

insert into preferences_email (utilisateur_id)
select u.id from utilisateurs u where u.statut <> 'supprime'
on conflict (utilisateur_id) do nothing;

/*
 * La colonne d'origine est SUPPRIMÉE, pas conservée « au cas où ». Laissée en
 * place, elle resterait lisible, modifiable depuis l'écran des paramètres, et
 * silencieusement ignorée par l'envoi : la pire des situations, celle où deux
 * réglages prétendent commander la même chose.
 */
alter table patients drop column if exists pref_rappels_email;

-- ---------- 2 · Service ou information ----------
create or replace function categorie_email(p_type text)
returns text
language sql immutable set search_path = public as $$
  select case
    when p_type in ('rappel_j1', 'rappel_h5') then 'rappel'
    when p_type like 'resume_%' then 'resume'
    else 'service'
  end;
$$;

/*
 * L'autorisation d'écrire, en un seul endroit — interrogée par le dépôt en
 * file ET par `creer_notification` pour renseigner `notifications.canaux`.
 * Deux réponses différentes à la même question feraient annoncer dans la
 * cloche un envoi qui n'a pas lieu.
 *
 * La ligne de préférences est créée à la volée : un compte inscrit après
 * cette migration doit avoir son jeton de désabonnement dès son premier
 * courriel.
 */
create or replace function email_autorise(p_utilisateur uuid, p_type text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_pref preferences_email%rowtype;
  v_categorie text := categorie_email(p_type);
begin
  if email_destinataire(p_utilisateur) is null then
    return false;
  end if;
  insert into preferences_email (utilisateur_id) values (p_utilisateur)
    on conflict (utilisateur_id) do nothing;
  select * into v_pref from preferences_email where utilisateur_id = p_utilisateur;

  return case v_categorie
    when 'rappel' then v_pref.rappels
    when 'resume' then v_pref.resumes
    -- Un e-mail de service ne se refuse pas : c'est le service lui-même.
    else true
  end;
end;
$$;

-- ---------- 3 · La file porte de quoi se désabonner ----------
alter table emails_en_attente
  add column if not exists categorie text,
  add column if not exists jeton uuid;

/*
 * `programmer_email` consulte désormais la préférence et emporte le jeton.
 * Le jeton est figé au dépôt, comme l'adresse : le message part avec le lien
 * qui était valable au moment où l'événement s'est produit.
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
  v_jeton uuid;
begin
  if v_adresse is null then
    return;
  end if;
  if not email_autorise(p_destinataire, p_type) then
    return;
  end if;
  if p_quand < now() - interval '1 hour' then
    return;
  end if;

  select jeton into v_jeton from preferences_email where utilisateur_id = p_destinataire;

  insert into emails_en_attente
    (notification_id, destinataire_id, adresse, type, titre, corps, lien,
     source_type, source_id, programme_pour, categorie, jeton)
  values
    (p_notification, p_destinataire, v_adresse, p_type, p_titre, p_corps, p_lien,
     p_source_type, p_source_id, p_quand, categorie_email(p_type), v_jeton)
  on conflict do nothing;
end;
$$;

-- ---------- 4 · Le désabonnement en un clic ----------
/*
 * Accordée à `anon` : le lien est cliqué depuis une boîte mail, sans session.
 * Le jeton tient lieu de preuve. Un jeton inconnu rend `false` sans rien
 * dire de plus — on n'indique pas à qui sonde la base si une valeur existe.
 *
 * Elle ne fait QUE basculer un interrupteur : aucune donnée n'en sort, et il
 * n'y a rien à obtenir en devinant un jeton qu'on ne pourrait de toute façon
 * pas deviner.
 */
create or replace function desinscrire_email(p_jeton uuid, p_categorie text, p_actif boolean default false)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_touche integer;
begin
  if p_categorie not in ('rappel', 'resume', 'tout') then
    return false;
  end if;
  update preferences_email set
    rappels = case when p_categorie in ('rappel', 'tout') then p_actif else rappels end,
    resumes = case when p_categorie in ('resume', 'tout') then p_actif else resumes end,
    maj_le = now()
  where jeton = p_jeton;
  get diagnostics v_touche = row_count;
  return v_touche > 0;
end;
$$;

grant execute on function desinscrire_email(uuid, text, boolean) to anon, authenticated;

-- ---------- 5 · `creer_notification` suit la même règle ----------
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

      if v_whatsapp then
        v_canaux := v_canaux || array['whatsapp'];
      elsif v_sms then
        v_canaux := v_canaux || array['sms'];
      end if;
    end if;
  end if;

  -- Une seule question, une seule réponse : `canaux` annonce exactement ce
  -- que la file recevra.
  v_email := email_autorise(p_destinataire, p_type);
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

-- ---------- 6 · Les assistants ----------
/*
 * L'assistant est prévenu de ce qui touche l'agenda qu'il tient — mais
 * SEULEMENT s'il a le droit de le voir.
 *
 * `peut_voir_agenda` n'est pas une commodité d'affichage : c'est la
 * permission que le praticien lui a accordée ou refusée (spec C.4.4). Écrire
 * à un assistant qui ne l'a pas lui apprendrait par courriel ce que
 * l'application lui cache — une fuite, pas une notification. La règle de
 * l'écran et celle du message sont donc la même.
 *
 * Le contenu reste celui du praticien : la date, jamais l'identité du
 * patient.
 */
create or replace function notifier_assistants(
  p_medecin uuid,
  p_type text,
  p_titre text,
  p_corps text,
  p_lien text,
  p_source_id uuid
)
returns void
language plpgsql security definer set search_path = public as $$
declare a record;
begin
  for a in
    select s.id from assistants s
    join utilisateurs u on u.id = s.id
    where s.medecin_id = p_medecin
      and s.peut_voir_agenda
      and u.statut = 'actif'
      and not u.suspendu_par_admin
  loop
    perform creer_notification(a.id, p_type, p_titre, p_corps, p_lien, 'rendez_vous', p_source_id);
  end loop;
end;
$$;

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
    -- Celui qui a saisi le rendez-vous sait déjà qu'il existe.
    if new.reserve_par is distinct from new.medecin_id then
      perform notifier_assistants(
        new.medecin_id, 'rdv_nouveau', 'Nouveau rendez-vous',
        'Le ' || v_quand || '.', '/espace-assistant/rendez-vous', new.id);
    end if;
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
      perform notifier_assistants(
        new.medecin_id, 'rdv_annule', 'Rendez-vous annulé',
        'Le ' || v_quand || '.', '/espace-assistant/rendez-vous', new.id);
      perform annuler_rappels_rdv(new.id);
    end if;
  elsif new.date is distinct from old.date or new.heure is distinct from old.heure then
    perform creer_notification(
      new.patient_id, 'rdv_reprogramme', 'Rendez-vous déplacé',
      v_medecin || ' — désormais le ' || v_quand || '.', v_lien, 'rendez_vous', new.id, v_titulaire);
    perform notifier_assistants(
      new.medecin_id, 'rdv_reprogramme', 'Rendez-vous déplacé',
      'Désormais le ' || v_quand || '.', '/espace-assistant/rendez-vous', new.id);
    perform annuler_rappels_rdv(new.id);
    perform programmer_rappels_rdv(new.id);
  end if;
  return null;
end;
$$;

-- ---------- 7 · Le résumé quotidien des administrateurs ----------
/*
 * Un RÉSUMÉ, et non un message par événement. C'est la règle qui protège la
 * boîte : quarante inscriptions en attente doivent faire un courriel, pas
 * quarante. Un administrateur noyé cesse de lire, et le premier dossier
 * vraiment urgent passe alors inaperçu comme les autres.
 *
 * Chacun ne reçoit que ce qu'il a le droit de traiter : le responsable des
 * finances n'est pas prévenu des signalements. Le compte principal les a
 * toutes, par construction (migration 0043).
 *
 * Rien à signaler, rien à envoyer : une file vide ne produit aucune ligne.
 */
create or replace function programmer_resume_admin()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  a record;
  v_pros integer;
  v_etabs integer;
  v_signalements integer;
  v_corps text;
  v_total integer;
  v_envois integer := 0;
begin
  select count(*) into v_pros from medecins where statut = 'en_attente';
  select count(*) into v_etabs from etablissements where statut = 'en_attente';
  select count(*) into v_signalements from signalements where statut = 'nouveau';

  for a in
    select u.id, u.admin_principal, u.sous_roles_admin
    from utilisateurs u
    where u.role = 'admin' and u.statut = 'actif' and not u.suspendu_par_admin
  loop
    v_corps := '';
    v_total := 0;

    if a.admin_principal or a.sous_roles_admin && array['validations'] then
      if v_pros > 0 then
        v_corps := v_corps || 'Praticiens à valider : ' || v_pros || E'\n';
        v_total := v_total + v_pros;
      end if;
      if v_etabs > 0 then
        v_corps := v_corps || 'Établissements à valider : ' || v_etabs || E'\n';
        v_total := v_total + v_etabs;
      end if;
    end if;

    if a.admin_principal or a.sous_roles_admin && array['moderation'] then
      if v_signalements > 0 then
        v_corps := v_corps || 'Signalements à traiter : ' || v_signalements || E'\n';
        v_total := v_total + v_signalements;
      end if;
    end if;

    if v_total > 0 then
      /*
       * Le type porte la DATE du jour : c'est ce qui fait que deux exécutions
       * le même jour — une reprise, un cron rejoué — ne produisent qu'un seul
       * message, l'index d'unicité de la file refusant le second.
       */
      perform programmer_email(
        a.id,
        'resume_admin',
        'Votre résumé du jour',
        rtrim(v_corps, E'\n'),
        '/espace-admin',
        'resume',
        null,
        null,
        now());
      v_envois := v_envois + 1;
    end if;
  end loop;

  return v_envois;
end;
$$;

/*
 * Le résumé n'a pas de notification d'origine ni de source : les deux index
 * d'unicité de la 0057 ne le couvrent donc pas. Celui-ci le borne à un par
 * administrateur et par jour.
 */
-- Le fuseau est nommé explicitement : `programme_pour::date` dépendrait du
-- réglage de la session, donc ne serait pas immuable, et Postgres refuse une
-- expression non immuable dans un index. Conakry étant à UTC+0, la date UTC
-- est bien la date du jour sur place.
create unique index if not exists emails_resume_unique
  on emails_en_attente (destinataire_id, type, ((programme_pour at time zone 'UTC')::date))
  where notification_id is null and source_id is null;

revoke execute on function programmer_resume_admin() from public, anon, authenticated;
revoke execute on function email_autorise(uuid, text) from public, anon, authenticated;
revoke execute on function notifier_assistants(uuid, text, text, text, text, uuid)
  from public, anon, authenticated;
