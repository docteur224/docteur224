-- ============================================================
-- Docteur 224 — Les recharges SMS se règlent comme les abonnements
--
-- La 0040 a ouvert le paiement des abonnements ; les recharges SMS étaient
-- restées au clic sec : un bouton posait une ligne « en attente » et
-- l'écran répondait « le crédit sera ajouté dès réception du règlement »,
-- sans jamais dire OÙ payer. Résultat observé en production : 15 recharges
-- en attente, qu'aucun écran d'administration ne montrait — donc que
-- personne ne pouvait ni encaisser ni clore.
--
-- Cette migration aligne les recharges sur le modèle de la 0040 :
--   1. le prix et les segments sont relus en base, plus déclarés par le
--      client (la policy d'insertion directe disparaît) ;
--   2. une référence de versement est émise, la même famille `D224-XXXXXX` ;
--   3. l'admin Finance confirme ou refuse, et c'est ce geste — pas le clic
--      du professionnel — qui crédite les segments.
-- ============================================================

-- Un refus n'est pas une annulation : l'un vient de l'administration avec un
-- motif, l'autre du professionnel qui renonce. Les confondre priverait le
-- payeur de la raison pour laquelle son versement n'a pas été retenu.
alter type statut_achat_sms add value if not exists 'refuse';

alter table achats_sms add column if not exists reference text;
alter table achats_sms add column if not exists numero_payeur text;
alter table achats_sms add column if not exists motif_refus text;
create unique index if not exists achats_sms_reference on achats_sms (reference);

/*
 * Plus d'insertion directe : `achats_sms` gardait la faille que la 0040 a
 * fermée sur les abonnements — `segments` et `prix_gnf` venaient du client,
 * donc 10 000 segments à 1 GNF étaient à portée de console. Tout passe
 * désormais par `creer_achat_sms()`.
 */
drop policy if exists ins_achats_sms on achats_sms;

/*
 * Les demandes héritées du bouton d'avant : ni moyen de paiement, ni
 * référence, ni coordonnées de versement publiées à l'époque — personne n'a
 * donc pu régler quoi que ce soit. Les laisser « en attente » encombrerait
 * la file de l'admin Finance de commandes que rien ne permet de rapprocher.
 * On les clôt en disant pourquoi, et le professionnel refait sa demande
 * depuis l'écran de recharge, qui indique maintenant où payer.
 */
update achats_sms
   set statut = 'annule',
       motif_refus = 'Demande passée avant l''ouverture du paiement en ligne — à renouveler depuis l''écran de recharge.'
 where statut = 'en_attente' and moyen_paiement is null;

-- ---------- Référence commune aux deux familles de paiement ----------
/*
 * Une référence est dictée au téléphone et recopiée dans un champ USSD : elle
 * doit être unique à travers TOUT ce qui se règle, pas seulement dans sa
 * table. Deux paiements homonymes rendraient le rapprochement ambigu au
 * moment précis où il compte.
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
    exit when not exists (select 1 from paiements_abonnement where reference = v_reference)
          and not exists (select 1 from achats_sms where reference = v_reference);
    v_essais := v_essais + 1;
    if v_essais > 20 then
      raise exception 'Impossible de générer une référence de paiement.';
    end if;
  end loop;
  return v_reference;
end;
$$;

/** Un moyen n'est proposable que si l'administration l'a ouvert. */
create or replace function moyen_paiement_ouvert(p_moyen moyen_paiement)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select valeur from parametres_plateforme
     where cle = case p_moyen
                   when 'orange_money' then 'orange_money'
                   when 'mtn_momo' then 'mtn_momo'
                   else 'carte_bancaire'
                 end
  ), false);
$$;

-- ---------- Demander une recharge ----------
/*
 * Comme pour un abonnement : le professionnel choisit un pack, le reste est
 * relu en base. Une seule demande vit à la fois — un versement unique ne doit
 * pas laisser trois lignes à rapprocher.
 */
create or replace function creer_achat_sms(
  p_pack_id uuid,
  p_moyen text,
  p_numero text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_role role_utilisateur;
  v_pack packs_sms;
  v_moyen moyen_paiement;
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

  if p_moyen not in ('orange_money', 'mtn_momo', 'carte') then
    raise exception 'Moyen de paiement inconnu.';
  end if;
  v_moyen := p_moyen::moyen_paiement;
  if not moyen_paiement_ouvert(v_moyen) then
    raise exception 'Ce moyen de paiement n''est pas disponible.';
  end if;

  select * into v_pack from packs_sms where id = p_pack_id and actif;
  if not found then
    raise exception 'Recharge inconnue.';
  end if;

  update achats_sms
     set statut = 'annule'
   where titulaire_id = v_uid and statut = 'en_attente';

  v_reference := reference_paiement_unique();
  insert into achats_sms
    (titulaire_id, pack_id, segments, prix_gnf, moyen_paiement, numero_payeur, reference)
  values
    (v_uid, v_pack.id, v_pack.segments, v_pack.prix_gnf, p_moyen,
     nullif(trim(coalesce(p_numero, '')), ''), v_reference)
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'reference', v_reference,
    'segments', v_pack.segments,
    'montant_gnf', v_pack.prix_gnf,
    'moyen', v_moyen,
    'nom', v_pack.nom
  );
end;
$$;

/** Le payeur recopie l'identifiant du SMS de l'opérateur. Aucun statut ne bouge. */
create or replace function declarer_reference_achat(p_id uuid, p_reference text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Session expirée.' using errcode = '42501';
  end if;
  update achats_sms
     set reference_paiement = nullif(trim(coalesce(p_reference, '')), '')
   where id = p_id and titulaire_id = auth.uid() and statut = 'en_attente';
  if not found then
    raise exception 'Recharge introuvable ou déjà traitée.';
  end if;
end;
$$;

create or replace function annuler_achat_sms(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Session expirée.' using errcode = '42501';
  end if;
  update achats_sms
     set statut = 'annule'
   where id = p_id and titulaire_id = auth.uid() and statut = 'en_attente';
  if not found then
    raise exception 'Recharge introuvable ou déjà traitée.';
  end if;
end;
$$;

-- ---------- Confirmer : le seul geste qui crédite ----------
/*
 * Passer à « payé » suffit à créditer : `credits_sms()` (0037) somme les
 * achats payés moins les segments déjà imputés. Rien d'autre à écrire — et
 * surtout rien à ajouter à la main dans un compteur, qui divergerait.
 */
create or replace function confirmer_achat_sms(
  p_id uuid,
  p_reference_operateur text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_a achats_sms;
begin
  if not est_admin_finance() then
    raise exception 'Réservé à l''administration financière.' using errcode = '42501';
  end if;
  select * into v_a from achats_sms where id = p_id for update;
  if not found then
    raise exception 'Recharge introuvable.';
  end if;
  if v_a.statut <> 'en_attente' then
    raise exception 'Cette recharge a déjà été traitée.';
  end if;

  update achats_sms
     set statut = 'paye',
         valide_le = now(),
         valide_par = auth.uid(),
         reference_paiement = coalesce(
           nullif(trim(coalesce(p_reference_operateur, '')), ''), reference_paiement)
   where id = p_id;

  perform creer_notification(
    v_a.titulaire_id,
    'paiement',
    'Recharge SMS créditée',
    v_a.segments || ' SMS ont été ajoutés à vos crédits.',
    '/espace-medecin/abonnement',
    'achat_sms',
    p_id
  );
end;
$$;

create or replace function refuser_achat_sms(p_id uuid, p_motif text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_a achats_sms;
begin
  if not est_admin_finance() then
    raise exception 'Réservé à l''administration financière.' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_motif, '')), '') is null then
    raise exception 'Un motif est obligatoire pour refuser une recharge.';
  end if;
  select * into v_a from achats_sms where id = p_id for update;
  if not found then
    raise exception 'Recharge introuvable.';
  end if;
  if v_a.statut <> 'en_attente' then
    raise exception 'Cette recharge a déjà été traitée.';
  end if;

  update achats_sms
     set statut = 'refuse', motif_refus = trim(p_motif),
         valide_le = now(), valide_par = auth.uid()
   where id = p_id;

  perform creer_notification(
    v_a.titulaire_id,
    'paiement',
    'Recharge non confirmée',
    'Référence ' || coalesce(v_a.reference, '—') || ' — ' || trim(p_motif),
    '/espace-medecin/abonnement',
    'achat_sms',
    p_id
  );
end;
$$;

-- ---------- Droits d'exécution ----------
revoke execute on function moyen_paiement_ouvert(moyen_paiement) from anon;
revoke execute on function creer_achat_sms(uuid, text, text) from anon;
revoke execute on function declarer_reference_achat(uuid, text) from anon;
revoke execute on function annuler_achat_sms(uuid) from anon;
revoke execute on function confirmer_achat_sms(uuid, text) from anon;
revoke execute on function refuser_achat_sms(uuid, text) from anon;
