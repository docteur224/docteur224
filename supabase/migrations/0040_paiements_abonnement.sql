-- ============================================================
-- Docteur 224 — Règlement d'un abonnement
--
-- Jusqu'ici, choisir une formule depuis /espace-medecin/abonnement écrivait
-- une intention dans `abonnements` et s'arrêtait là : rien ne disait au
-- professionnel COMMENT payer, et l'admin Finance n'avait aucune trace à
-- rapprocher d'un versement reçu. Cette migration ouvre le chaînon manquant.
--
-- DEUX PRINCIPES, hérités de la 0019 et de la 0037 :
--
--   1. Le montant ne vient JAMAIS du client. Un professionnel dit ce qu'il
--      veut acheter (formule, période, moyen) ; le prix est relu dans
--      `tarifs_plateforme` par la fonction ci-dessous. Sans cela on paierait
--      son abonnement 1 GNF depuis la console du navigateur.
--   2. Un paiement naît « en attente » et personne ne se le confirme à
--      soi-même. Seul l'admin Finance le passe à « confirmé », et c'est CE
--      geste — pas le clic du professionnel — qui active l'abonnement.
--
-- Aucune passerelle n'est branchée : l'encaissement réel se fait par un
-- versement Mobile Money vers le compte marchand de la plateforme, que le
-- professionnel déclare avec l'identifiant de transaction reçu par SMS. Le
-- jour où Orange Money / MTN exposeront une API, seule la confirmation
-- devient automatique — la table et les écrans ne bougent pas.
-- ============================================================

create type moyen_paiement as enum ('orange_money', 'mtn_momo', 'carte');
create type statut_paiement as enum ('en_attente', 'confirme', 'refuse', 'annule');

-- ---------- 1. Où verser ----------
/*
 * Coordonnées d'encaissement de la plateforme. Ce que cette table dit :
 * « voici où l'argent doit arriver ». Ce qu'elle ne dit PAS : « ce moyen est
 * proposé » — cet interrupteur existe déjà dans `parametres_plateforme`
 * (clés `orange_money` / `mtn_momo`, éditées depuis /espace-admin/abonnements
 * bien avant cette migration). Deux sources pour une même question, c'est le
 * piège de la période gratuite qui écrasait l'essai : on n'en refait pas une.
 *
 * Les numéros marchands sont volontairement laissés VIDES à l'amorçage. Un
 * numéro plausible mais faux enverrait de l'argent réel chez un inconnu ;
 * l'écran affiche « coordonnées non renseignées » tant que l'admin Finance
 * n'a pas saisi les vraies.
 */
create table comptes_encaissement (
  code moyen_paiement primary key,
  libelle text not null,
  -- Numéro marchand à créditer. Null pour la carte (elle passe par un lien).
  numero_marchand text,
  -- Code à composer sur le téléphone (ex. #144#).
  code_ussd text,
  -- Consigne libre affichée au professionnel, sous les étapes.
  instructions text,
  ordre smallint not null default 0
);

insert into comptes_encaissement (code, libelle, code_ussd, instructions, ordre) values
  ('orange_money', 'Orange Money', '#144#',
   'Choisissez « Transfert d''argent », puis saisissez le montant exact. Conservez le SMS de confirmation : il porte l''identifiant de la transaction.', 1),
  ('mtn_momo', 'MTN Mobile Money', '*400#',
   'Choisissez « Envoyer de l''argent », puis saisissez le montant exact. Conservez le SMS de confirmation : il porte l''identifiant de la transaction.', 2),
  ('carte', 'Carte bancaire', null,
   'Le règlement par carte se fait sur la page sécurisée de notre prestataire. Nous vous envoyons le lien de paiement par e-mail.', 3);

alter table comptes_encaissement enable row level security;
-- Un professionnel connecté doit savoir où payer ; un visiteur anonyme non.
create policy sel_comptes_encaissement on comptes_encaissement for select
  using (auth.uid() is not null);
create policy mod_comptes_encaissement on comptes_encaissement for all
  using (est_admin_finance()) with check (est_admin_finance());

-- La carte rejoint les deux Mobile Money dans les réglages existants, pour
-- que l'admin puisse la retirer de l'écran de paiement comme les autres.
insert into parametres_plateforme (cle, valeur) values ('carte_bancaire', true)
on conflict (cle) do nothing;

-- ---------- 2. Les paiements ----------
create table paiements_abonnement (
  id uuid primary key default gen_random_uuid(),
  titulaire_id uuid not null references utilisateurs (id) on delete cascade,
  type_titulaire role_utilisateur not null
    check (type_titulaire in ('medecin', 'etablissement')),
  -- Ce qui est acheté. Figé à la commande, comme les segments d'`achats_sms` :
  -- une grille retarifée demain ne doit pas réécrire ce qui a été demandé
  -- aujourd'hui, ni le montant que le professionnel a effectivement versé.
  formule formule_abonnement not null,
  periode periode_abonnement not null,
  montant_gnf integer not null check (montant_gnf > 0),
  moyen moyen_paiement not null,
  -- Numéro Mobile Money depuis lequel part le versement, pour le
  -- rapprochement. AUCUNE donnée de carte n'est stockée ici — et il n'y en
  -- aura pas : même avec une passerelle, le numéro de carte se saisit chez le
  -- prestataire, jamais sur nos écrans.
  numero_payeur text,
  -- Référence à rappeler en payant : c'est elle qui relie un versement reçu à
  -- un compte. Lisible au téléphone, sans caractère ambigu (voir §3).
  reference text not null unique,
  -- Identifiant de transaction du SMS de l'opérateur, déclaré par le pro.
  reference_operateur text,
  statut statut_paiement not null default 'en_attente',
  motif_refus text,
  cree_le timestamptz not null default now(),
  decide_le timestamptz,
  decide_par uuid references utilisateurs (id)
);

create index paiements_abonnement_titulaire
  on paiements_abonnement (titulaire_id, cree_le desc);
-- File de l'admin Finance : les paiements à traiter, les plus anciens d'abord.
create index paiements_abonnement_en_attente
  on paiements_abonnement (cree_le) where statut = 'en_attente';

alter table paiements_abonnement enable row level security;

create policy sel_paiements_abonnement on paiements_abonnement for select
  using (titulaire_id = auth.uid() or est_admin_finance());
/*
 * AUCUNE policy INSERT. Contrairement à `achats_sms`, où le client pose la
 * ligne lui-même avec le prix qu'il annonce, une demande de paiement passe
 * obligatoirement par `creer_paiement_abonnement()` : c'est elle qui relit le
 * tarif en base. Sans cela, `montant_gnf` serait déclaratif.
 */
create policy upd_paiements_abonnement on paiements_abonnement for update
  using (est_admin_finance()) with check (est_admin_finance());

-- ---------- 3. Référence lisible au téléphone ----------
/*
 * Alphabet sans O/0 ni I/1 : cette référence est dictée à un guichetier ou
 * recopiée dans un champ USSD, où une confusion coûte un rapprochement.
 * 32^6 ≈ 1,07 milliard de combinaisons — la boucle de collision ne sert
 * qu'à garantir l'unicité, pas à rattraper une génération faible.
 */
create or replace function reference_paiement_unique()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_reference text;
  v_essais integer := 0;
begin
  loop
    v_reference := 'D224-';
    for i in 1..6 loop
      v_reference := v_reference
        || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (
      select 1 from paiements_abonnement where reference = v_reference
    );
    v_essais := v_essais + 1;
    if v_essais > 20 then
      raise exception 'Impossible de générer une référence de paiement.';
    end if;
  end loop;
  return v_reference;
end;
$$;

-- ---------- 4. Demander à payer ----------
/*
 * Le professionnel déclare ce qu'il veut acheter ; tout le reste est calculé.
 *
 * Un établissement ne choisit pas sa formule (son palier découle du type de
 * structure, décidé à l'inscription) : on relit celle de son abonnement au
 * lieu d'accepter celle du client, sinon un hôpital se facturerait au tarif
 * cabinet. Un médecin, lui, choisit entre standard et premium.
 *
 * Une seule demande vit à la fois : ouvrir un paiement annule le précédent
 * resté en attente. Sinon un professionnel qui hésite entre mensuel et annuel
 * laisserait trois lignes à rapprocher pour un seul versement.
 */
create or replace function creer_paiement_abonnement(
  p_formule text,
  p_periode text,
  p_moyen text,
  p_numero text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role role_utilisateur;
  v_formule formule_abonnement;
  v_periode periode_abonnement;
  v_moyen moyen_paiement;
  v_montant integer;
  v_reference text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Session expirée.' using errcode = '42501';
  end if;

  select role into v_role from utilisateurs where id = v_uid;
  if v_role not in ('medecin', 'etablissement') then
    raise exception 'Ce compte n''est pas un compte professionnel.' using errcode = '42501';
  end if;

  if p_periode not in ('mensuel', 'annuel') then
    raise exception 'Période inconnue.';
  end if;
  v_periode := p_periode::periode_abonnement;

  if v_role = 'medecin' then
    if p_formule not in ('standard', 'premium') then
      raise exception 'Formule inconnue.';
    end if;
    v_formule := p_formule::formule_abonnement;
  else
    -- Le palier de la structure, tel qu'il a été posé à l'inscription.
    select formule into v_formule from abonnements
      where titulaire_id = v_uid order by date_debut desc limit 1;
    if v_formule is null then
      raise exception 'Aucun abonnement à régler pour cette structure.';
    end if;
  end if;

  if p_moyen not in ('orange_money', 'mtn_momo', 'carte') then
    raise exception 'Moyen de paiement inconnu.';
  end if;
  v_moyen := p_moyen::moyen_paiement;
  -- Le moyen doit être ouvert par l'administration (/espace-admin/abonnements).
  if not coalesce((
    select valeur from parametres_plateforme
     where cle = case v_moyen
                   when 'orange_money' then 'orange_money'
                   when 'mtn_momo' then 'mtn_momo'
                   else 'carte_bancaire'
                 end
  ), false) then
    raise exception 'Ce moyen de paiement n''est pas disponible.';
  end if;

  select case v_periode when 'annuel' then prix_annuel else prix_mensuel end
    into v_montant
    from tarifs_plateforme where formule = v_formule;
  if coalesce(v_montant, 0) <= 0 then
    raise exception 'Le tarif de cette formule n''est pas renseigné.';
  end if;

  update paiements_abonnement
     set statut = 'annule', decide_le = now()
   where titulaire_id = v_uid and statut = 'en_attente';

  v_reference := reference_paiement_unique();
  insert into paiements_abonnement
    (titulaire_id, type_titulaire, formule, periode, montant_gnf, moyen,
     numero_payeur, reference)
  values
    (v_uid, v_role, v_formule, v_periode, v_montant, v_moyen,
     nullif(trim(coalesce(p_numero, '')), ''), v_reference)
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'reference', v_reference,
    'formule', v_formule,
    'periode', v_periode,
    'montant_gnf', v_montant,
    'moyen', v_moyen
  );
end;
$$;

-- ---------- 5. Déclarer le versement ----------
/*
 * Le professionnel a payé et recopie l'identifiant du SMS de l'opérateur.
 * Il ne confirme rien : le statut ne bouge pas, c'est l'admin Finance qui
 * rapproche. La fonction n'accepte que SES paiements encore en attente.
 */
create or replace function declarer_reference_paiement(p_id uuid, p_reference text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Session expirée.' using errcode = '42501';
  end if;
  update paiements_abonnement
     set reference_operateur = nullif(trim(coalesce(p_reference, '')), '')
   where id = p_id and titulaire_id = auth.uid() and statut = 'en_attente';
  if not found then
    raise exception 'Paiement introuvable ou déjà traité.';
  end if;
end;
$$;

/** Le professionnel renonce : sa demande sort de la file de l'admin Finance. */
create or replace function annuler_paiement_abonnement(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Session expirée.' using errcode = '42501';
  end if;
  update paiements_abonnement
     set statut = 'annule', decide_le = now()
   where id = p_id and titulaire_id = auth.uid() and statut = 'en_attente';
  if not found then
    raise exception 'Paiement introuvable ou déjà traité.';
  end if;
end;
$$;

-- ---------- 6. Confirmer : le seul geste qui active un abonnement ----------
/*
 * L'abonnement est PROLONGÉ, pas remis à zéro : un professionnel qui règle
 * trois semaines avant l'échéance ne doit pas perdre les jours restants. On
 * repart donc de la date de fin en cours si elle est future, sinon d'aujourd'hui.
 *
 * L'UPDATE ne cible pas une ligne mais toutes celles du titulaire : la base
 * porte des abonnements en double, hérités d'amorçages répétés (voir le
 * commentaire de `useRappelsEtSms`). Les faire converger vaut mieux que d'en
 * activer un et d'en laisser un autre expiré derrière.
 */
create or replace function confirmer_paiement_abonnement(
  p_id uuid,
  p_reference_operateur text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_p paiements_abonnement;
  v_quota integer;
  v_depart date;
  v_duree interval;
begin
  if not est_admin_finance() then
    raise exception 'Réservé à l''administration financière.' using errcode = '42501';
  end if;

  select * into v_p from paiements_abonnement where id = p_id for update;
  if not found then
    raise exception 'Paiement introuvable.';
  end if;
  if v_p.statut <> 'en_attente' then
    raise exception 'Ce paiement a déjà été traité.';
  end if;

  update paiements_abonnement
     set statut = 'confirme',
         decide_le = now(),
         decide_par = auth.uid(),
         reference_operateur = coalesce(
           nullif(trim(coalesce(p_reference_operateur, '')), ''), reference_operateur)
   where id = p_id;

  select quota_sms into v_quota from tarifs_plateforme where formule = v_p.formule;
  v_duree := case v_p.periode when 'annuel' then interval '1 year' else interval '1 month' end;

  select greatest(current_date, coalesce(max(date_fin), current_date))
    into v_depart
    from abonnements where titulaire_id = v_p.titulaire_id;

  if exists (select 1 from abonnements where titulaire_id = v_p.titulaire_id) then
    update abonnements
       set formule = v_p.formule,
           periode = v_p.periode,
           statut = 'actif',
           date_fin = (v_depart + v_duree)::date,
           quota_sms = coalesce(v_quota, quota_sms)
     where titulaire_id = v_p.titulaire_id;
  else
    insert into abonnements
      (titulaire_id, type_titulaire, formule, periode, statut, date_fin, quota_sms)
    values
      (v_p.titulaire_id, v_p.type_titulaire, v_p.formule, v_p.periode, 'actif',
       (current_date + v_duree)::date, coalesce(v_quota, 0));
  end if;

  perform creer_notification(
    v_p.titulaire_id,
    'paiement',
    'Paiement confirmé',
    -- `date_lisible()` (0013) attend une heure et rendrait « 07 mars à 00:00 » :
    -- une échéance d'abonnement se dit à la journée.
    'Votre abonnement ' || initcap(v_p.formule::text) || ' est actif jusqu''au '
      || to_char((v_depart + v_duree)::date, 'DD/MM/YYYY') || '.',
    case v_p.type_titulaire
      when 'medecin' then '/espace-medecin/abonnement'
      else '/espace-etablissement/abonnement'
    end,
    'paiement_abonnement',
    p_id
  );
end;
$$;

/*
 * Refus : le versement n'est pas arrivé, ou ne correspond pas. Le motif est
 * OBLIGATOIRE — « paiement refusé » sans raison laisse le professionnel sans
 * rien à corriger, et c'est la première chose qu'il appellera pour demander.
 */
create or replace function refuser_paiement_abonnement(p_id uuid, p_motif text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_p paiements_abonnement;
begin
  if not est_admin_finance() then
    raise exception 'Réservé à l''administration financière.' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_motif, '')), '') is null then
    raise exception 'Un motif est obligatoire pour refuser un paiement.';
  end if;

  select * into v_p from paiements_abonnement where id = p_id for update;
  if not found then
    raise exception 'Paiement introuvable.';
  end if;
  if v_p.statut <> 'en_attente' then
    raise exception 'Ce paiement a déjà été traité.';
  end if;

  update paiements_abonnement
     set statut = 'refuse', motif_refus = trim(p_motif),
         decide_le = now(), decide_par = auth.uid()
   where id = p_id;

  perform creer_notification(
    v_p.titulaire_id,
    'paiement',
    'Paiement non confirmé',
    'Référence ' || v_p.reference || ' — ' || trim(p_motif),
    case v_p.type_titulaire
      when 'medecin' then '/espace-medecin/abonnement'
      else '/espace-etablissement/abonnement'
    end,
    'paiement_abonnement',
    p_id
  );
end;
$$;

-- ---------- 7. Droits d'exécution ----------
-- `reference_paiement_unique` est un rouage interne : appelée directement,
-- elle ne ferait que consommer des références.
revoke execute on function reference_paiement_unique() from public;
revoke execute on function reference_paiement_unique() from anon;
revoke execute on function reference_paiement_unique() from authenticated;

revoke execute on function creer_paiement_abonnement(text, text, text, text) from anon;
revoke execute on function declarer_reference_paiement(uuid, text) from anon;
revoke execute on function annuler_paiement_abonnement(uuid) from anon;
revoke execute on function confirmer_paiement_abonnement(uuid, text) from anon;
revoke execute on function refuser_paiement_abonnement(uuid, text) from anon;
