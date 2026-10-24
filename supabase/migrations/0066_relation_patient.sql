-- ============================================================
-- Docteur 224 — Relation patient (fiche patient, étape 4)
--
--   1. MESSAGERIE patient ↔ médecin. La table `messages` existe depuis la
--      0001 mais aucun écran ne s'en servait. Elle gagne :
--        · le proche concerné (une mère écrit au pédiatre pour son enfant),
--        · une pièce jointe (bucket privé `messages`),
--        · l'heure de lecture ;
--      et des règles qui manquaient :
--        · n'écrit que qui a une RELATION de soins : un rendez-vous entre ce
--          médecin et ce patient (ou l'un de ses proches) — sans quoi la
--          messagerie servirait à démarcher n'importe quel praticien ;
--        · un message ne se réécrit pas ; seul son DESTINATAIRE le marque lu ;
--        · 30 messages par heure au plus, par expéditeur ;
--        · une notification au destinataire — sans le CONTENU, qui peut être
--          médical et partirait aussi par e-mail — et une seule tant que la
--          précédente n'est pas lue (au plus une par demi-heure).
--
--   2. RAPPELS DE RENDEZ-VOUS par SMS ou WhatsApp. Jusqu'ici seuls les
--      rappels e-mail partaient (0057) ; `preferences_rappels.delai_heures`
--      était enregistré et lu par personne. Désormais :
--        · plusieurs délais par professionnel (J-1 et H-2 par défaut) ;
--        · une file `rappels_programmes`, remplie par trigger à la création,
--          au déplacement et à l'annulation d'un rendez-vous ;
--        · le CANAL est décidé à l'envoi, pas à la programmation : un patient
--          qui retire son consentement entre-temps n'est pas relancé ;
--        · tout ce qui n'est pas parti reste en file avec son motif
--          (pas de consentement, fiche sans compte, rendez-vous annulé…).
--      L'envoi lui-même passe par lib/messagerie : en mode simulé tant
--      qu'aucun fournisseur SMS/WhatsApp n'est configuré.
--
-- Les rappels e-mail J-1 / H-5 existants (0057) ne changent pas.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Messagerie
-- ------------------------------------------------------------
alter table messages
  add column if not exists proche_id uuid references proches (id) on delete set null,
  add column if not exists piece_path text,
  add column if not exists piece_nom text check (piece_nom is null or length(piece_nom) <= 200),
  add column if not exists lu_le timestamptz;

-- Un message peut n'être qu'une pièce jointe.
alter table messages alter column contenu drop not null;
do $$ begin
  alter table messages add constraint messages_non_vide
    check (nullif(trim(coalesce(contenu, '')), '') is not null or piece_path is not null);
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table messages add constraint messages_longueur check (contenu is null or length(contenu) <= 4000);
exception when duplicate_object then null;
end $$;

create index if not exists idx_messages_conversation on messages (patient_id, medecin_id, cree_le desc);
create index if not exists idx_messages_non_lus on messages (medecin_id, patient_id) where not lu;

-- Écriture : il faut une relation de soins (un rendez-vous, même passé).
drop policy if exists ins_messages on messages;
create policy ins_messages on messages for insert
  with check (
    compte_actif()
    and expediteur_id = auth.uid()
    and medecin_a_rdv_avec_patient(medecin_id, patient_id)
    and (proche_id is null or exists (select 1 from proches p where p.id = proche_id and p.patient_id = messages.patient_id))
    and (
      patient_id = auth.uid()
      or medecin_id = auth.uid()
      or (medecin_id = medecin_de_assistant() and assistant_a_permission('peut_messagerie'))
    )
  );

/*
 * Garde des mises à jour : seul l'état de lecture change, et seul le
 * DESTINATAIRE le change. La policy `upd_messages_lu` (0002) laisse les deux
 * parties écrire sur la ligne ; sans ce trigger, l'expéditeur pourrait
 * réécrire après coup ce qu'il a envoyé.
 */
create or replace function messages_garde_maj() returns trigger
language plpgsql as $$
begin
  if new.contenu is distinct from old.contenu
     or new.piece_path is distinct from old.piece_path
     or new.piece_nom is distinct from old.piece_nom
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
drop trigger if exists trg_messages_garde_maj on messages;
create trigger trg_messages_garde_maj before update on messages
  for each row execute function messages_garde_maj();

-- Débit : au-delà de 30 messages en une heure, c'est un abus ou un incident.
create or replace function messages_debit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from messages m
       where m.expediteur_id = new.expediteur_id and m.cree_le > now() - interval '1 hour') >= 30 then
    raise exception 'Trop de messages envoyés en peu de temps. Réessayez dans un moment.';
  end if;
  new.lu := false;
  new.lu_le := null;
  new.cree_le := now();
  return new;
end;
$$;
drop trigger if exists trg_messages_debit on messages;
create trigger trg_messages_debit before insert on messages
  for each row execute function messages_debit();

/*
 * Notification du destinataire. Le titre dit QUI écrit, jamais CE QU'il
 * écrit : la notification part aussi par e-mail, et un message de patient
 * peut être médical. Tant qu'une notification de la même conversation n'est
 * pas lue, et pendant 30 minutes, on n'en crée pas d'autre.
 */
create or replace function messages_notifier() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_vers_patient boolean := new.expediteur_id <> new.patient_id;
  v_dest uuid;
  v_source uuid;
  v_titre text;
  v_corps text;
  v_lien text;
  v_nom text;
begin
  if v_vers_patient then
    v_dest := new.patient_id;
    v_source := new.medecin_id;
    v_titre := 'Nouveau message de ' || nom_medecin(new.medecin_id);
    v_corps := 'Votre médecin vous a écrit sur Docteur 224. Ouvrez votre messagerie pour lire son message.';
    v_lien := '/patient/messages?medecin=' || new.medecin_id;
  else
    v_dest := new.medecin_id;
    v_source := new.patient_id;
    select trim(coalesce(u.prenom, '') || ' ' || coalesce(u.nom, '')) into v_nom from utilisateurs u where u.id = new.patient_id;
    v_titre := 'Nouveau message de ' || coalesce(nullif(v_nom, ''), 'un patient');
    v_corps := 'Un patient vous a écrit. Ouvrez sa fiche, onglet Relation patient, pour lire le message.';
    v_lien := '/espace-medecin/patients/c-' || new.patient_id || '?tab=relation';
  end if;

  if exists (
    select 1 from notifications n
    where n.destinataire_id = v_dest and n.type = 'message' and n.source_type = 'conversation'
      and n.source_id = v_source and n.lu_le is null and n.cree_le > now() - interval '30 minutes'
  ) then
    return new;
  end if;

  perform creer_notification(v_dest, 'message', v_titre, v_corps, v_lien, 'conversation', v_source);
  return new;
end;
$$;
drop trigger if exists trg_messages_notifier on messages;
create trigger trg_messages_notifier after insert on messages
  for each row execute function messages_notifier();

/*
 * Conversations du patient connecté : un médecin par ligne, le dernier
 * message, le nombre de non-lus. SECURITY DEFINER pour nommer le médecin ;
 * le filtre `patient_id = auth.uid()` est écrit ici, en dur.
 */
create or replace function conversations_patient()
returns table (
  medecin_id uuid,
  medecin text,
  specialite text,
  dernier_message text,
  dernier_le timestamptz,
  dernier_de_moi boolean,
  non_lus bigint
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
         (select count(*) from mes x where x.medecin_id = d.medecin_id and not x.lu and x.expediteur_id <> auth.uid())
  from derniers d
  order by d.cree_le desc;
$$;
revoke execute on function conversations_patient() from public, anon;
grant execute on function conversations_patient() to authenticated;

-- ---- Pièces jointes : bucket privé ----
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('messages', 'messages', false, 8388608,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists depot_messages on storage.objects;
create policy depot_messages on storage.objects for insert to authenticated
  with check (bucket_id = 'messages' and (storage.foldername(name))[1] = auth.uid()::text);

-- Lecture : l'auteur, et les deux parties du message qui cite le fichier.
drop policy if exists lecture_messages on storage.objects;
create policy lecture_messages on storage.objects for select to authenticated
  using (
    bucket_id = 'messages'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from messages m
        where m.piece_path = storage.objects.name
          and (m.patient_id = auth.uid() or m.medecin_id = auth.uid()
               or (m.medecin_id = medecin_de_assistant() and assistant_a_permission('peut_messagerie')))
      )
    )
  );

-- Un fichier déposé mais jamais rattaché (envoi interrompu) se retire.
drop policy if exists suppression_messages on storage.objects;
create policy suppression_messages on storage.objects for delete to authenticated
  using (
    bucket_id = 'messages' and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (select 1 from messages m where m.piece_path = storage.objects.name)
  );

-- ------------------------------------------------------------
-- 2. Rappels SMS / WhatsApp
-- ------------------------------------------------------------
/*
 * Plusieurs délais par professionnel. Valeurs proposées à l'écran ; la base
 * s'en tient à une liste close pour qu'un rappel « 1 000 heures avant » ne
 * puisse pas exister.
 */
alter table preferences_rappels
  add column if not exists delais_heures smallint[] not null default '{24,2}';
do $$ begin
  alter table preferences_rappels add constraint pref_delais_valides
    check (cardinality(delais_heures) between 1 and 4
           and delais_heures <@ array[1, 2, 3, 6, 12, 24, 48, 72]::smallint[]);
exception when duplicate_object then null;
end $$;
-- L'ancien délai unique devient la liste : 24 h (la valeur par défaut, que
-- personne n'avait donc choisie) passe au nouveau défaut J-1 + H-2.
update preferences_rappels
   set delais_heures = case when delai_heures = 24 then '{24,2}'::smallint[] else array[delai_heures]::smallint[] end
 where delais_heures = '{24,2}' and delai_heures <> 24;

do $$ begin
  create type etat_rappel as enum ('programme', 'en_cours', 'envoye', 'simule', 'echec', 'abandonne', 'annule', 'ignore');
exception when duplicate_object then null;
end $$;

create table if not exists rappels_programmes (
  id uuid primary key default gen_random_uuid(),
  rendez_vous_id uuid not null references rendez_vous (id) on delete cascade,
  delai_heures smallint not null,
  programme_pour timestamptz not null,
  -- Canal PRÉVU à la programmation (affichage) ; recalculé à l'envoi.
  canal canal_message,
  etat etat_rappel not null default 'programme',
  tentatives smallint not null default 0,
  derniere_erreur text,
  reserve_le timestamptz,
  envoye_le timestamptz,
  cree_le timestamptz not null default now(),
  -- Un déplacement crée de nouvelles échéances ; les anciennes restent,
  -- annulées, pour l'historique.
  constraint rappels_unique unique (rendez_vous_id, delai_heures, programme_pour)
);

create index if not exists idx_rappels_dus on rappels_programmes (programme_pour) where etat in ('programme', 'en_cours');
create index if not exists idx_rappels_rdv on rappels_programmes (rendez_vous_id);

alter table rappels_programmes enable row level security;
-- Lecture : le médecin du rendez-vous (et son assistant), l'administration.
-- Aucune écriture depuis le navigateur : triggers et serveur seulement.
drop policy if exists sel_rappels on rappels_programmes;
create policy sel_rappels on rappels_programmes for select
  using (
    est_admin()
    or exists (
      select 1 from rendez_vous r
      where r.id = rendez_vous_id
        and (r.medecin_id = auth.uid() or r.medecin_id = medecin_de_assistant())
    )
  );

/*
 * Le canal d'un rappel, ou la raison de n'en envoyer aucun. Une seule
 * fonction pour la programmation (affichage) et l'envoi (décision) :
 *   - fiche cabinet sans compte → aucun consentement enregistré ;
 *   - rappels coupés par le professionnel ;
 *   - WhatsApp si le professionnel l'autorise ET le patient y consent ;
 *     sinon SMS aux mêmes conditions ; sinon rien ;
 *   - pas de numéro → rien.
 * Pour un proche, c'est le titulaire du compte qui reçoit et qui consent.
 */
create or replace function canal_rappel(p_rdv uuid)
returns table (canal canal_message, motif text, telephone text, patient_id uuid, titulaire uuid)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  r rendez_vous;
  v_patient uuid;
  v_titulaire uuid;
  v_pref preferences_rappels;
  v_pat patients;
  v_tel text;
begin
  select * into r from rendez_vous where id = p_rdv;
  if not found then
    return query select null::canal_message, 'Rendez-vous introuvable', null::text, null::uuid, null::uuid;
    return;
  end if;
  v_patient := coalesce(r.patient_id, (select p.patient_id from proches p where p.id = r.proche_id));
  v_titulaire := titulaire_abonnement_medecin(r.medecin_id);
  if v_patient is null then
    return query select null::canal_message, 'Fiche cabinet sans compte : aucun consentement enregistré', null::text, null::uuid, v_titulaire;
    return;
  end if;
  select * into v_pref from preferences_rappels where titulaire_id = v_titulaire;
  if v_pref.titulaire_id is not null and not v_pref.rappels_actifs then
    return query select null::canal_message, 'Rappels désactivés par le professionnel', null::text, v_patient, v_titulaire;
    return;
  end if;
  select * into v_pat from patients where id = v_patient;
  select nullif(trim(u.telephone), '') into v_tel from utilisateurs u where u.id = v_patient and u.statut = 'actif';
  if v_tel is null then
    return query select null::canal_message, 'Pas de numéro de téléphone', null::text, v_patient, v_titulaire;
    return;
  end if;
  if coalesce(v_pref.whatsapp_autorise, true) and v_pat.pref_rappels_whatsapp then
    return query select 'whatsapp'::canal_message, null::text, v_tel, v_patient, v_titulaire;
  elsif coalesce(v_pref.sms_autorise, false) and v_pat.pref_rappels_sms then
    return query select 'sms'::canal_message, null::text, v_tel, v_patient, v_titulaire;
  else
    return query select null::canal_message, 'Le patient n’a consenti à aucun canal autorisé', v_tel, v_patient, v_titulaire;
  end if;
end;
$$;

/*
 * (Re)programme les rappels d'un rendez-vous : les échéances en attente sont
 * annulées, puis recréées d'après les délais du professionnel si le
 * rendez-vous est toujours actif. Une échéance déjà passée (ou à moins de
 * deux minutes) n'est pas créée : un rappel « 24 h avant » d'un rendez-vous
 * pris pour dans une heure n'a plus d'objet.
 */
create or replace function programmer_rappels_telephone(p_rdv uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r rendez_vous;
  v_pref preferences_rappels;
  v_delai smallint;
  v_quand timestamptz;
  v_canal canal_message;
begin
  update rappels_programmes set etat = 'annule', derniere_erreur = 'Rendez-vous modifié ou annulé'
   where rendez_vous_id = p_rdv and etat = 'programme';

  select * into r from rendez_vous where id = p_rdv;
  if not found or r.statut::text not in ('en_attente', 'confirme') then
    return;
  end if;
  select * into v_pref from preferences_rappels where titulaire_id = titulaire_abonnement_medecin(r.medecin_id);
  if v_pref.titulaire_id is not null and not v_pref.rappels_actifs then
    return;
  end if;
  select c.canal into v_canal from canal_rappel(p_rdv) c;

  foreach v_delai in array coalesce(v_pref.delais_heures, '{24,2}'::smallint[]) loop
    -- La base tourne en UTC, qui est l'heure de Conakry.
    v_quand := ((r.date + r.heure) at time zone 'UTC') - make_interval(hours => v_delai);
    if v_quand > now() + interval '2 minutes' then
      insert into rappels_programmes (rendez_vous_id, delai_heures, programme_pour, canal)
      values (p_rdv, v_delai, v_quand, v_canal)
      on conflict (rendez_vous_id, delai_heures, programme_pour)
        do update set etat = 'programme', canal = excluded.canal, derniere_erreur = null;
    end if;
  end loop;
end;
$$;

create or replace function rdv_programme_rappels_telephone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE'
     and new.date is not distinct from old.date
     and new.heure is not distinct from old.heure
     and new.statut is not distinct from old.statut then
    return new;
  end if;
  perform programmer_rappels_telephone(new.id);
  return new;
end;
$$;
drop trigger if exists trg_rdv_rappels_telephone on rendez_vous;
create trigger trg_rdv_rappels_telephone after insert or update of date, heure, statut on rendez_vous
  for each row execute function rdv_programme_rappels_telephone();

/*
 * Changer ses délais reprogramme les rendez-vous À VENIR du professionnel
 * (et, pour un gestionnaire d'établissement, ceux de ses médecins couverts).
 */
create or replace function preferences_reprogramment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rdv uuid;
begin
  for v_rdv in
    select r.id from rendez_vous r
    where r.date >= current_date
      and r.statut::text in ('en_attente', 'confirme')
      and titulaire_abonnement_medecin(r.medecin_id) = new.titulaire_id
  loop
    perform programmer_rappels_telephone(v_rdv);
  end loop;
  return new;
end;
$$;
drop trigger if exists trg_preferences_reprogramment on preferences_rappels;
create trigger trg_preferences_reprogramment after insert or update of delais_heures, rappels_actifs on preferences_rappels
  for each row execute function preferences_reprogramment();

/*
 * Le serveur réserve un lot de rappels dus (même principe que la file
 * d'e-mails : réserver AVANT d'envoyer, deux passages simultanés obtiennent
 * des lots disjoints), avec tout ce qu'il faut pour rédiger et décider.
 */
create or replace function reserver_rappels(p_limite integer default 20)
returns table (
  id uuid,
  rendez_vous_id uuid,
  delai_heures smallint,
  canal canal_message,
  motif text,
  telephone text,
  titulaire uuid,
  statut_rdv text,
  date_rdv date,
  heure_rdv time,
  medecin text,
  pour_qui text
)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  return query
  with reserves as (
    update rappels_programmes rp
       set etat = 'en_cours', reserve_le = now(), tentatives = rp.tentatives + 1
     where rp.id in (
       select x.id from rappels_programmes x
        where x.programme_pour <= now()
          and (x.etat = 'programme' or (x.etat = 'en_cours' and x.reserve_le < now() - interval '5 minutes'))
        order by x.programme_pour
        limit p_limite
        for update skip locked
     )
    returning rp.id, rp.rendez_vous_id, rp.delai_heures
  )
  select s.id, s.rendez_vous_id, s.delai_heures, c.canal, c.motif, c.telephone, c.titulaire,
         r.statut::text, r.date, r.heure, nom_medecin(r.medecin_id),
         (select p.prenom from proches p where p.id = r.proche_id)
    from reserves s
    join rendez_vous r on r.id = s.rendez_vous_id
    cross join lateral canal_rappel(s.rendez_vous_id) c;
end;
$$;

create or replace function marquer_rappel(p_id uuid, p_etat text, p_erreur text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update rappels_programmes
     set etat = case
           when p_etat = 'echec' and tentatives >= 3 then 'abandonne'::etat_rappel
           when p_etat = 'echec' then 'programme'::etat_rappel
           else p_etat::etat_rappel
         end,
         envoye_le = case when p_etat in ('envoye', 'simule') then now() else envoye_le end,
         derniere_erreur = p_erreur
   where id = p_id;
end;
$$;

revoke execute on function canal_rappel(uuid) from public, anon, authenticated;
revoke execute on function programmer_rappels_telephone(uuid) from public, anon, authenticated;
revoke execute on function reserver_rappels(integer) from public, anon, authenticated;
revoke execute on function marquer_rappel(uuid, text, text) from public, anon, authenticated;

/*
 * Ce que la fiche montre au médecin : le consentement du patient et le
 * canal qui partirait aujourd'hui. Réservé au médecin qui le suit.
 */
create or replace function consentement_rappels(p_patient uuid)
returns table (whatsapp boolean, sms boolean, telephone boolean, rappels_actifs boolean,
               whatsapp_autorise boolean, sms_autorise boolean, delais smallint[])
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_titulaire uuid;
  v_pref preferences_rappels;
begin
  if not (medecin_a_rdv_avec_patient(auth.uid(), p_patient)
          or medecin_a_rdv_avec_patient(medecin_de_assistant(), p_patient)) then
    raise exception 'Ce patient n''est pas dans votre patientèle.';
  end if;
  v_titulaire := titulaire_abonnement_medecin(coalesce(medecin_de_assistant(), auth.uid()));
  select * into v_pref from preferences_rappels where titulaire_id = v_titulaire;
  return query
    select p.pref_rappels_whatsapp, p.pref_rappels_sms,
           exists (select 1 from utilisateurs u where u.id = p_patient and nullif(trim(u.telephone), '') is not null),
           coalesce(v_pref.rappels_actifs, true), coalesce(v_pref.whatsapp_autorise, true),
           coalesce(v_pref.sms_autorise, false), coalesce(v_pref.delais_heures, '{24,2}'::smallint[])
      from patients p where p.id = p_patient;
end;
$$;
revoke execute on function consentement_rappels(uuid) from public, anon;
grant execute on function consentement_rappels(uuid) to authenticated;

-- ---- Rattrapage : les rendez-vous à venir reçoivent leurs échéances ----
do $$
declare
  v_rdv uuid;
begin
  for v_rdv in
    select r.id from rendez_vous r
    where r.date >= current_date and r.statut::text in ('en_attente', 'confirme')
  loop
    perform programmer_rappels_telephone(v_rdv);
  end loop;
end $$;
