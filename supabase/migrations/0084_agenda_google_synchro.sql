-- ============================================================
-- Docteur 224 — Synchronisation Google Agenda (patient), phase 2 : les RDV
--
-- La phase 1 (0083) a posé la CONNEXION du compte Google. Celle-ci pose la
-- SYNCHRONISATION elle-même, sur le patron exact de la file des rappels
-- (0066) : un trigger remplit une file, un drainer serveur la vide.
--
-- Trois pièces :
--
--   1. `rdv_google` — la LIAISON. Un rendez-vous ↔ l'identifiant de
--      l'événement créé dans l'agenda du patient. C'est elle qui rend la
--      synchronisation IDEMPOTENTE : sans elle, un drainer rejoué créerait
--      un second événement pour le même rendez-vous, et un déplacement
--      laisserait l'ancien en place.
--
--   2. `agenda_sync_programmes` — la FILE. Remplie par trigger à la création,
--      au déplacement et à l'annulation d'un rendez-vous, et UNIQUEMENT pour
--      les patients qui ont relié leur compte Google : inutile d'accumuler du
--      travail pour les autres. Au plus une tâche en attente par rendez-vous
--      (index unique partiel) — trois modifications d'affilée avant le
--      prochain tour du drainer ne font pas trois appels à Google, elles
--      font un seul appel, avec l'état final.
--
--   3. Les fonctions de service `reserver_agenda_sync` / `marquer_agenda_sync`,
--      réservées à la service_role, comme `reserver_rappels`.
--
-- CE QUI EST DÉCIDÉ À L'ENVOI, PAS À LA PROGRAMMATION. Comme le canal d'un
-- rappel (0066), l'action réelle — créer, mettre à jour, supprimer — est
-- recalculée par le drainer d'après l'état du rendez-vous au moment où il
-- part. La colonne `action` ne sert donc qu'à l'affichage et au diagnostic :
-- un rendez-vous pris puis annulé avant le prochain tour n'est jamais ajouté
-- à l'agenda, il est simplement ignoré.
--
-- CE QUI PART VERS GOOGLE. L'événement nomme le praticien, la spécialité, le
-- lieu et l'heure. Il ne porte PAS le motif de consultation : Google est un
-- tiers, et la plateforme s'est toujours interdit de faire voyager du contenu
-- médical hors d'elle-même (c'est déjà la règle des notifications et des SMS,
-- 0066). Le patient retrouve le motif en suivant le lien vers son espace.
--
-- RÉSERVÉ AU PATIENT, jamais l'agenda du médecin, de l'assistant ou de
-- l'établissement : la file ne se remplit que pour le TITULAIRE du compte
-- (un rendez-vous pris pour un proche va dans l'agenda du titulaire).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Liaison rendez-vous ↔ événement Google
-- ------------------------------------------------------------
create table if not exists rdv_google (
  rendez_vous_id uuid primary key references rendez_vous (id) on delete cascade,
  -- Le titulaire du compte Google dans l'agenda duquel l'événement vit.
  utilisateur_id uuid not null references utilisateurs (id) on delete cascade,
  google_event_id text not null,
  calendar_id text not null default 'primary',
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

create index if not exists idx_rdv_google_utilisateur on rdv_google (utilisateur_id);

alter table rdv_google enable row level security;
-- Aucune policy : comme `agenda_google_comptes` (0083), seule la service_role
-- y touche. Un identifiant d'événement Google n'intéresse aucun écran.

-- ------------------------------------------------------------
-- 2. File de synchronisation
-- ------------------------------------------------------------
do $$ begin
  create type action_agenda as enum ('creer', 'mettre_a_jour', 'supprimer');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type etat_agenda_sync as enum
    ('programme', 'en_cours', 'fait', 'simule', 'ignore', 'echec', 'abandonne');
exception when duplicate_object then null;
end $$;

create table if not exists agenda_sync_programmes (
  id uuid primary key default gen_random_uuid(),
  rendez_vous_id uuid not null references rendez_vous (id) on delete cascade,
  -- Le titulaire : c'est SON agenda, et c'est sa connexion Google qu'on lit.
  utilisateur_id uuid not null references utilisateurs (id) on delete cascade,
  -- Action PRÉVUE à la programmation (affichage, diagnostic) ; recalculée
  -- par le drainer au moment de l'appel à Google.
  action action_agenda not null,
  etat etat_agenda_sync not null default 'programme',
  tentatives smallint not null default 0,
  derniere_erreur text,
  reserve_le timestamptz,
  traite_le timestamptz,
  cree_le timestamptz not null default now()
);

/*
 * Au plus UNE tâche en attente par rendez-vous. Un rendez-vous déplacé deux
 * fois en trente secondes ne vaut pas deux appels à Google : la tâche en
 * attente est réécrite avec la nouvelle action. Les tâches terminées restent,
 * elles, pour l'historique — d'où l'index PARTIEL.
 */
create unique index if not exists idx_agenda_sync_en_attente
  on agenda_sync_programmes (rendez_vous_id)
  where etat in ('programme', 'en_cours');

create index if not exists idx_agenda_sync_dues
  on agenda_sync_programmes (cree_le)
  where etat in ('programme', 'en_cours');

alter table agenda_sync_programmes enable row level security;
/*
 * Lecture par le patient concerné seulement : c'est son agenda, il peut voir
 * que la synchronisation a eu lieu (ou pourquoi elle a échoué). Aucune
 * écriture depuis le navigateur — triggers et serveur uniquement.
 */
drop policy if exists sel_agenda_sync on agenda_sync_programmes;
create policy sel_agenda_sync on agenda_sync_programmes for select
  using (utilisateur_id = auth.uid());

-- ------------------------------------------------------------
-- 3. Programmation (trigger)
-- ------------------------------------------------------------
/*
 * Le titulaire du compte concerné par un rendez-vous : le patient lui-même,
 * ou, pour un rendez-vous pris pour un proche, le titulaire de la fiche.
 * Rend null pour une fiche cabinet sans compte.
 */
create or replace function titulaire_du_rdv(p_rdv uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(r.patient_id, (select p.patient_id from proches p where p.id = r.proche_id))
    from rendez_vous r where r.id = p_rdv;
$$;

/*
 * Met une tâche en file pour un rendez-vous, si et seulement si son titulaire
 * a relié un compte Google. Sans compte relié : rien en file (et la liaison
 * éventuelle est effacée — ce qui arrive quand un patient s'est déconnecté).
 */
create or replace function programmer_sync_agenda(p_rdv uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r rendez_vous;
  v_titulaire uuid;
  v_action action_agenda;
  v_lie boolean;
begin
  select * into r from rendez_vous where id = p_rdv;
  if not found then
    return;
  end if;

  v_titulaire := titulaire_du_rdv(p_rdv);
  if v_titulaire is null
     or not exists (select 1 from agenda_google_comptes c where c.utilisateur_id = v_titulaire) then
    return;
  end if;

  v_lie := exists (select 1 from rdv_google g where g.rendez_vous_id = p_rdv);

  /*
   * Les statuts de SUITE de consultation — honoré, présent, absent (0063,
   * 0075) — ne changent rien à l'agenda : le rendez-vous a eu lieu, son
   * événement est déjà au bon endroit. Sans cette sortie, chaque pointage de
   * présence au cabinet déclencherait un appel à Google pour réécrire un
   * événement passé.
   */
  if r.statut not in ('en_attente', 'confirme', 'annule') then
    return;
  end if;

  /*
   * Et on ne POSE pas un événement dans le passé : un rendez-vous saisi
   * après coup au cabinet (source 'cabinet') n'a pas à encombrer l'agenda du
   * patient d'un rappel pour hier. Un événement déjà posé, lui, continue de
   * suivre son rendez-vous — déplacement comme annulation.
   */
  if not v_lie and r.statut <> 'annule' and r.date < current_date then
    return;
  end if;

  if r.statut = 'annule' then
    -- Rien dans l'agenda : rien à retirer. Et surtout rien à mettre en file,
    -- sinon chaque annulation de rendez-vous jamais synchronisé ferait un
    -- appel inutile à Google.
    if not v_lie then
      update agenda_sync_programmes
         set etat = 'ignore', derniere_erreur = 'Rendez-vous annulé avant toute synchronisation',
             traite_le = now()
       where rendez_vous_id = p_rdv and etat in ('programme', 'en_cours');
      return;
    end if;
    v_action := 'supprimer';
  elsif v_lie then
    v_action := 'mettre_a_jour';
  else
    v_action := 'creer';
  end if;

  update agenda_sync_programmes
     set action = v_action, utilisateur_id = v_titulaire, etat = 'programme',
         tentatives = 0, derniere_erreur = null, reserve_le = null, cree_le = now()
   where rendez_vous_id = p_rdv and etat in ('programme', 'en_cours');
  if not found then
    insert into agenda_sync_programmes (rendez_vous_id, utilisateur_id, action)
    values (p_rdv, v_titulaire, v_action);
  end if;
end;
$$;

/*
 * Trigger sur `rendez_vous` — comme les rappels (0066), et pour la même
 * raison : la synchronisation ne doit pas dépendre de QUI a créé le
 * rendez-vous. Un rendez-vous saisi au cabinet ou par le centre d'appel
 * (/espace-admin/nouveau-rdv) arrive dans l'agenda du patient exactement
 * comme celui qu'il a pris lui-même en ligne.
 */
create or replace function rdv_programme_sync_agenda() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE'
     and new.date is not distinct from old.date
     and new.heure is not distinct from old.heure
     and new.statut is not distinct from old.statut
     and new.medecin_id is not distinct from old.medecin_id
     and new.etablissement_id is not distinct from old.etablissement_id then
    return new;
  end if;
  perform programmer_sync_agenda(new.id);
  return new;
end;
$$;
drop trigger if exists trg_rdv_sync_agenda on rendez_vous;
create trigger trg_rdv_sync_agenda
  after insert or update of date, heure, statut, medecin_id, etablissement_id on rendez_vous
  for each row execute function rdv_programme_sync_agenda();

/*
 * RELIER SON COMPTE REMPLIT L'AGENDA. Sans ce trigger, un patient qui vient
 * de connecter Google ne verrait arriver que ses PROCHAINS rendez-vous :
 * ceux déjà pris resteraient absents, ce qui ressemble à une panne. On
 * programme donc, à la connexion, tous ses rendez-vous à venir — les siens
 * et ceux de ses proches.
 */
create or replace function agenda_google_rattrape() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rdv uuid;
begin
  for v_rdv in
    select r.id from rendez_vous r
     where r.date >= current_date
       and r.statut in ('en_attente', 'confirme')
       and titulaire_du_rdv(r.id) = new.utilisateur_id
     order by r.date, r.heure
  loop
    perform programmer_sync_agenda(v_rdv);
  end loop;
  return new;
end;
$$;
drop trigger if exists trg_agenda_google_rattrape on agenda_google_comptes;
create trigger trg_agenda_google_rattrape after insert on agenda_google_comptes
  for each row execute function agenda_google_rattrape();

/*
 * SE DÉCONNECTER ARRÊTE TOUT. La route de déconnexion révoque le jeton chez
 * Google : plus aucun appel n'est possible ensuite. Les tâches en attente
 * n'ont donc plus d'objet, et les liaisons non plus — les événements déjà
 * posés restent dans l'agenda du patient, qui en est propriétaire et peut
 * les retirer lui-même. Une reconnexion repartira de zéro.
 */
create or replace function agenda_google_deconnecte() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update agenda_sync_programmes
     set etat = 'ignore', derniere_erreur = 'Compte Google déconnecté', traite_le = now()
   where utilisateur_id = old.utilisateur_id and etat in ('programme', 'en_cours');
  delete from rdv_google where utilisateur_id = old.utilisateur_id;
  return old;
end;
$$;
drop trigger if exists trg_agenda_google_deconnecte on agenda_google_comptes;
create trigger trg_agenda_google_deconnecte after delete on agenda_google_comptes
  for each row execute function agenda_google_deconnecte();

-- ------------------------------------------------------------
-- 4. Service : réserver un lot, inscrire le verdict
-- ------------------------------------------------------------
/*
 * Le drainer réserve un lot (deux passages simultanés obtiennent des lots
 * disjoints, `for update skip locked`) avec TOUT ce qu'il faut pour écrire
 * l'événement et appeler Google — y compris le jeton de rafraîchissement
 * CHIFFRÉ, que seul le serveur peut ouvrir (clé hors base, 0083).
 *
 * `action_reelle` est recalculée ici, à la réservation, et non reprise de la
 * file : entre la programmation et le passage du drainer, le rendez-vous a pu
 * être annulé, ou l'événement avoir déjà été créé.
 */
create or replace function reserver_agenda_sync(p_limite integer default 20)
returns table (
  id uuid,
  rendez_vous_id uuid,
  utilisateur_id uuid,
  action_reelle action_agenda,
  tentatives smallint,
  -- Connexion Google du titulaire
  refresh_token_chiffre text,
  calendar_id text,
  google_event_id text,
  -- Contenu de l'événement
  statut_rdv text,
  date_rdv date,
  heure_rdv time,
  medecin text,
  specialite text,
  lieu text,
  pour_qui text
)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  return query
  with reserves as (
    update agenda_sync_programmes a
       set etat = 'en_cours', reserve_le = now(), tentatives = a.tentatives + 1
     where a.id in (
       select x.id from agenda_sync_programmes x
        where x.etat = 'programme'
           or (x.etat = 'en_cours' and x.reserve_le < now() - interval '5 minutes')
        order by x.cree_le
        limit p_limite
        for update skip locked
     )
    returning a.id, a.rendez_vous_id, a.utilisateur_id, a.tentatives
  )
  select s.id, s.rendez_vous_id, s.utilisateur_id,
         case
           when r.statut = 'annule' then 'supprimer'::action_agenda
           when g.google_event_id is not null then 'mettre_a_jour'::action_agenda
           else 'creer'::action_agenda
         end,
         s.tentatives,
         c.refresh_token_chiffre,
         coalesce(g.calendar_id, c.calendar_id, 'primary'),
         g.google_event_id,
         r.statut::text, r.date, r.heure,
         nom_medecin(r.medecin_id),
         (select sp.nom from medecins m left join specialites sp on sp.id = m.specialite_id
           where m.id = r.medecin_id),
         (select trim(concat_ws(', ', e.nom, e.adresse))
            from etablissements e
           where e.id = coalesce(r.etablissement_id,
                                 (select m2.etablissement_id from medecins m2 where m2.id = r.medecin_id))),
         (select p.prenom from proches p where p.id = r.proche_id)
    from reserves s
    join rendez_vous r on r.id = s.rendez_vous_id
    left join agenda_google_comptes c on c.utilisateur_id = s.utilisateur_id
    left join rdv_google g on g.rendez_vous_id = s.rendez_vous_id;
end;
$$;

/*
 * Le verdict. `p_event_id` enregistre (ou efface) la liaison dans le même
 * geste : un événement créé chez Google sans sa liaison en base serait
 * recréé au tour suivant, en double.
 *
 * Un échec repart en file et s'abandonne au bout de trois tentatives, comme
 * les rappels : une adresse Google qui refuse ne se règle pas en insistant.
 */
create or replace function marquer_agenda_sync(
  p_id uuid,
  p_etat text,
  p_erreur text default null,
  p_event_id text default null,
  p_supprime boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare
  a agenda_sync_programmes;
begin
  select * into a from agenda_sync_programmes where id = p_id;
  if not found then
    return;
  end if;

  if p_event_id is not null then
    insert into rdv_google (rendez_vous_id, utilisateur_id, google_event_id, calendar_id)
    values (a.rendez_vous_id, a.utilisateur_id, p_event_id,
            coalesce((select c.calendar_id from agenda_google_comptes c
                       where c.utilisateur_id = a.utilisateur_id), 'primary'))
    on conflict (rendez_vous_id)
      do update set google_event_id = excluded.google_event_id, maj_le = now();
  elsif p_supprime then
    delete from rdv_google where rendez_vous_id = a.rendez_vous_id;
  end if;

  update agenda_sync_programmes
     set etat = case
           when p_etat = 'echec' and tentatives >= 3 then 'abandonne'::etat_agenda_sync
           when p_etat = 'echec' then 'programme'::etat_agenda_sync
           else p_etat::etat_agenda_sync
         end,
         derniere_erreur = p_erreur,
         traite_le = case when p_etat = 'echec' and tentatives < 3 then null else now() end,
         reserve_le = case when p_etat = 'echec' and tentatives < 3 then null else reserve_le end
   where id = p_id;
end;
$$;

revoke execute on function titulaire_du_rdv(uuid) from public, anon, authenticated;
revoke execute on function programmer_sync_agenda(uuid) from public, anon, authenticated;
revoke execute on function reserver_agenda_sync(integer) from public, anon, authenticated;
revoke execute on function marquer_agenda_sync(uuid, text, text, text, boolean) from public, anon, authenticated;
