-- Canal des messages sortants, et rappels devenus optionnels.
--
-- Deux décisions de fond.
--
-- 1. WhatsApp devient un canal de plein droit, pas un cas particulier du SMS.
--    À 150 GNF le segment, le SMS ne peut pas être le canal par défaut d'une
--    plateforme de rendez-vous : deux SMS par consultation, c'est 300 GNF de
--    notification par acte, plus que ne rapporte l'abonnement d'un médecin qui
--    en fait 200 par mois. `sms_envoyes` devient donc `messages_envoyes`, avec
--    une colonne `canal`. La table est née à la migration 0034 et n'a jamais
--    porté une ligne réelle : le renommage ne coûte rien aujourd'hui, il
--    coûterait un historique demain.
--
-- 2. Le rappel SMS devient un choix du PROFESSIONNEL, désactivé par défaut.
--    C'est son quota qui est débité : le lui consommer sans qu'il l'ait
--    demandé revient à lui facturer un service qu'il n'a pas choisi. Le
--    patient garde son mot à dire — il l'avait déjà (`pref_rappels_sms`,
--    migration 0004) — mais son accord ne suffit plus, il faut les deux.

-- ---------- 1 · Le canal ----------
create type canal_message as enum ('sms', 'whatsapp');

alter table sms_envoyes rename to messages_envoyes;
alter table messages_envoyes add column canal canal_message not null default 'sms';
alter index sms_envoyes_titulaire_mois rename to messages_envoyes_titulaire_mois;
alter type statut_sms rename to statut_message;

-- Le quota ne concerne QUE le SMS : un message WhatsApp coûte une fraction du
-- prix et n'a pas à consommer une enveloppe dimensionnée sur le SMS. Il est
-- journalisé et facturé, mais hors quota.
create or replace function sms_consommes(p_titulaire uuid, p_mois date default current_date)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(segments), 0)::integer
  from messages_envoyes
  where titulaire_id = p_titulaire
    and canal = 'sms'
    and statut <> 'echec'
    and envoye_le >= date_trunc('month', p_mois)
    and envoye_le < date_trunc('month', p_mois) + interval '1 month';
$$;

/*
 * `enregistrer_sms` doit être RECRÉÉE, pas seulement renommée : Postgres garde
 * le corps d'une fonction sous forme de texte et n'en résout les noms qu'à
 * l'exécution. Après le renommage de la table, son `insert into sms_envoyes`
 * échouerait au premier appel — silencieusement jusque-là. Les vues, elles,
 * stockent des dépendances analysées et suivent le renommage toutes seules.
 *
 * Elle devient `enregistrer_message`, avec le canal. Seul le SMS est soumis au
 * quota.
 */
drop function if exists enregistrer_sms(uuid, text, text, smallint, integer, statut_message, text, text);

create or replace function enregistrer_message(
  p_titulaire uuid,
  p_destinataire text,
  p_motif text,
  p_canal canal_message default 'sms',
  p_segments smallint default 1,
  p_cout_unitaire integer default 150,
  p_statut statut_message default 'envoye',
  p_reference text default null,
  p_erreur text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_canal = 'sms' and p_statut <> 'echec' and sms_restants(p_titulaire) < p_segments then
    raise exception 'Quota SMS épuisé pour ce mois (% segments demandés, % restants).',
      p_segments, sms_restants(p_titulaire)
      using errcode = 'check_violation';
  end if;

  insert into messages_envoyes
    (titulaire_id, destinataire, motif, canal, statut, cout_gnf, segments, reference_externe, erreur)
  values (p_titulaire, p_destinataire, p_motif, p_canal, p_statut,
          p_segments * p_cout_unitaire, p_segments, p_reference, p_erreur)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function enregistrer_message(uuid, text, text, canal_message, smallint, integer, statut_message, text, text) from public;
revoke execute on function enregistrer_message(uuid, text, text, canal_message, smallint, integer, statut_message, text, text) from authenticated;
revoke execute on function enregistrer_message(uuid, text, text, canal_message, smallint, integer, statut_message, text, text) from anon;

-- La vue a suivi le renommage ; on la recrée pour n'imputer au quota que le
-- SMS, tout en gardant le coût total des deux canaux.
create or replace view consommation_sms_mois
with (security_invoker = on) as
select
  a.titulaire_id,
  a.type_titulaire,
  a.formule,
  a.quota_sms,
  coalesce(c.segments_sms, 0)::integer as consommes,
  greatest(0, a.quota_sms - coalesce(c.segments_sms, 0))::integer as restants,
  coalesce(c.cout, 0)::integer as cout_gnf,
  coalesce(c.messages_whatsapp, 0)::integer as whatsapp
from abonnements a
left join lateral (
  select
    sum(m.segments) filter (where m.canal = 'sms') as segments_sms,
    count(*) filter (where m.canal = 'whatsapp') as messages_whatsapp,
    sum(m.cout_gnf) as cout
  from messages_envoyes m
  where m.titulaire_id = a.titulaire_id
    and m.statut <> 'echec'
    and m.envoye_le >= date_trunc('month', current_date)
    and m.envoye_le < date_trunc('month', current_date) + interval '1 month'
) c on true;

revoke all on consommation_sms_mois from anon;
grant select on consommation_sms_mois to authenticated;

-- ---------- 2 · Préférences de rappel du professionnel ----------
/*
 * Une ligne par titulaire d'abonnement — le médecin lui-même ou le
 * gestionnaire de l'établissement, c'est-à-dire exactement qui paie.
 *
 * `sms_autorise` est à false par défaut : c'est tout l'objet de la migration.
 * Un professionnel qui veut du SMS le demande ; sinon ses patients sont
 * prévenus par WhatsApp et dans l'application, sans qu'il paie.
 */
create table preferences_rappels (
  titulaire_id uuid primary key references utilisateurs (id) on delete cascade,
  rappels_actifs boolean not null default true,
  sms_autorise boolean not null default false,
  whatsapp_autorise boolean not null default true,
  -- Délai avant le rendez-vous, en heures. 24 h est le compromis habituel :
  -- assez tôt pour que le patient se libère, assez tard pour qu'il s'en
  -- souvienne.
  delai_heures smallint not null default 24 check (delai_heures between 1 and 168),
  maj_le timestamptz not null default now()
);

alter table preferences_rappels enable row level security;
create policy sel_pref_rappels on preferences_rappels for select
  using (titulaire_id = auth.uid() or est_admin());
create policy ins_pref_rappels on preferences_rappels for insert
  with check (titulaire_id = auth.uid());
create policy upd_pref_rappels on preferences_rappels for update
  using (titulaire_id = auth.uid()) with check (titulaire_id = auth.uid());

-- ---------- 3 · Préférence WhatsApp du patient ----------
-- `pref_rappels_sms` existait depuis la 0004 ; WhatsApp lui manquait. Activé
-- par défaut : c'est le canal le moins cher et le plus utilisé en Guinée.
alter table patients add column if not exists pref_rappels_whatsapp boolean not null default true;

-- ---------- 4 · Le choix des canaux à la création d'une notification ----------
/*
 * Ordre de préférence : WhatsApp d'abord, SMS seulement s'il est autorisé des
 * DEUX CÔTÉS — le professionnel qui paie et le patient qui reçoit.
 *
 * `p_titulaire` est le professionnel dont le quota serait débité. Quand il est
 * nul (notification interne, sans coût), aucun canal payant n'est retenu :
 * sans cette borne, une notification système partirait en SMS sans que
 * personne ne la paie ni ne l'ait demandée.
 *
 * L'ancienne version à 7 arguments doit être SUPPRIMÉE et pas seulement
 * remplacée : Postgres identifie une fonction par son nom ET ses types
 * d'arguments. En ajoutant un 8e paramètre à valeur par défaut, on créerait
 * une surcharge — et les appels existants, qui passent 7 arguments, iraient
 * chercher l'ancienne signature en correspondance exacte. Ils continueraient
 * donc à s'exécuter avec l'ancien comportement, sans la moindre erreur pour
 * le signaler.
 */
drop function if exists creer_notification(uuid, text, text, text, text, text, uuid);

create or replace function creer_notification(
  p_destinataire uuid,
  p_type text,
  p_titre text,
  -- `default null` conservé de la 0013 : le retirer casserait tout appel à
  -- trois arguments, sans que rien ne le signale avant l'exécution.
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
    -- Pas de ligne = réglages par défaut de la table : rappels actifs,
    -- WhatsApp oui, SMS non.
    if v_pref.titulaire_id is null or v_pref.rappels_actifs then
      select
        coalesce(v_pref.whatsapp_autorise, true) and p.pref_rappels_whatsapp,
        coalesce(v_pref.sms_autorise, false) and p.pref_rappels_sms
      into v_whatsapp, v_sms
      from patients p where p.id = p_destinataire;

      -- Un seul canal payant : WhatsApp s'il est possible, le SMS en repli.
      -- Les cumuler doublerait la facture pour un même message.
      if v_whatsapp then
        v_canaux := v_canaux || array['whatsapp'];
      elsif v_sms then
        v_canaux := v_canaux || array['sms'];
      end if;
    end if;
  end if;

  -- L'e-mail ne coûte rien : il suit la seule préférence du patient.
  if v_role = 'patient' then
    select v_canaux || case when p.pref_rappels_email then array['email'] else '{}' end
      into v_canaux from patients p where p.id = p_destinataire;
  end if;

  insert into notifications
    (destinataire_id, type, titre, corps, lien, source_type, source_id, canaux)
  values
    (p_destinataire, p_type, p_titre, p_corps, p_lien, p_source_type, p_source_id,
     coalesce(v_canaux, array['in_app']));
end;
$$;

-- ---------- 5 · Qui paie le message d'un patient ----------
/*
 * Le quota débité est celui du TITULAIRE de l'abonnement, qui n'est pas
 * toujours le médecin : rattaché à un établissement abonné, il est couvert par
 * le plan de celui-ci et ne paie pas en plus (règle affichée dans
 * /espace-admin/abonnements). Le message part alors sur le quota du
 * gestionnaire.
 *
 * Repli sur le médecin lui-même quand il n'est rattaché à rien, ou quand son
 * établissement n'a pas d'abonnement ouvert.
 */
create or replace function titulaire_abonnement_medecin(p_medecin uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select e.gestionnaire_id
       from medecins m
       join etablissements e on e.id = m.etablissement_id
      where m.id = p_medecin
        and e.gestionnaire_id is not null
        and exists (select 1 from abonnements a where a.titulaire_id = e.gestionnaire_id)),
    p_medecin
  );
$$;

-- ---------- 6 · Les notifications patient portent leur payeur ----------
/*
 * Sans ce passage, `creer_notification` reçoit un titulaire nul et ne retient
 * aucun canal payant : les rappels resteraient cantonnés à l'application, et
 * tout le travail des canaux serait inerte. Les notifications destinées AU
 * MÉDECIN, elles, ne passent pas de titulaire — le prévenir d'un rendez-vous
 * dans sa propre application n'a pas à consommer son quota.
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
    end if;
  elsif new.date is distinct from old.date or new.heure is distinct from old.heure then
    perform creer_notification(
      new.patient_id, 'rdv_reprogramme', 'Rendez-vous déplacé',
      v_medecin || ' — désormais le ' || v_quand || '.', v_lien, 'rendez_vous', new.id, v_titulaire);
  end if;
  return null;
end;
$$;
