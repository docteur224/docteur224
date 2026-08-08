-- ============================================================
-- Docteur 224 — Remboursements, résiliations et indicateurs financiers
--
-- Il manquait deux choses pour que l'argent soit suivi de bout en bout :
--
--   1. le REMBOURSEMENT n'existait nulle part. `useRemboursements()` rendait
--      une liste vide codée en dur et « Rembourser » n'écrivait qu'une ligne
--      d'audit : l'écran promettait une opération qui n'avait aucun effet.
--   2. la RÉSILIATION n'était déclenchable par personne, alors que
--      `statut_abonnement` porte 'annule' depuis la 0001.
--
-- Un remboursement est un ÉVÉNEMENT, pas un état : il a son montant, son
-- motif, son auteur et sa date, et il peut être partiel. D'où une table
-- dédiée plutôt que quatre colonnes sur chacune des deux tables de paiement —
-- qui, elles, ne portent que l'état qui en découle.
-- ============================================================

alter type statut_paiement add value if not exists 'rembourse';
alter type statut_achat_sms add value if not exists 'rembourse';

create table remboursements (
  id uuid primary key default gen_random_uuid(),
  -- L'un OU l'autre : un remboursement porte sur un versement précis, jamais
  -- sur les deux, jamais sur aucun.
  paiement_id uuid references paiements_abonnement (id) on delete cascade,
  achat_sms_id uuid references achats_sms (id) on delete cascade,
  constraint remboursement_une_source
    check (num_nonnulls(paiement_id, achat_sms_id) = 1),
  titulaire_id uuid not null references utilisateurs (id) on delete cascade,
  montant_gnf integer not null check (montant_gnf > 0),
  -- Obligatoire : une sortie de caisse sans raison est intraçable, et c'est
  -- la première question posée en révision des comptes.
  motif text not null,
  cree_le timestamptz not null default now(),
  cree_par uuid references utilisateurs (id)
);

create index remboursements_titulaire on remboursements (titulaire_id, cree_le desc);
create index remboursements_date on remboursements (cree_le desc);

alter table remboursements enable row level security;
-- Le professionnel voit ce qui lui a été rendu ; l'écriture passe par la
-- fonction ci-dessous, qui seule sait ce qu'il reste à rembourser.
create policy sel_remboursements on remboursements for select
  using (titulaire_id = auth.uid() or est_admin_finance());

/*
 * Rembourser tout ou partie d'un versement encaissé.
 *
 * Le plafond est calculé ici, jamais reçu : montant du versement moins ce qui
 * a déjà été rendu. Sans ce calcul, deux remboursements partiels successifs
 * rendraient plus que ce qui a été perçu.
 *
 * Un remboursement INTÉGRAL emporte des conséquences, un partiel non :
 *   - abonnement : le versement retourne à l'état « remboursé » et
 *     l'abonnement est résilié — on n'a pas encaissé le service ;
 *   - recharge SMS : le statut quitte « payé », donc `credits_sms()` (0037)
 *     cesse de compter ces segments. S'ils ont déjà été consommés, le solde
 *     est borné à zéro par la fonction — on ne réclame pas des SMS partis.
 * Un remboursement partiel laisse le versement « confirmé » : le service
 * reste dû, seule une part a été rendue.
 */
create or replace function rembourser_paiement(
  p_famille text,
  p_id uuid,
  p_montant integer,
  p_motif text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_titulaire uuid;
  v_encaisse integer;
  v_deja integer;
  v_reste integer;
  v_integral boolean;
begin
  if not est_admin_finance() then
    raise exception 'Réservé à l''administration financière.' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_motif, '')), '') is null then
    raise exception 'Un motif est obligatoire pour rembourser.';
  end if;
  if p_famille not in ('abonnement', 'recharge') then
    raise exception 'Famille de paiement inconnue.';
  end if;

  if p_famille = 'abonnement' then
    select titulaire_id, montant_gnf into v_titulaire, v_encaisse
      from paiements_abonnement where id = p_id and statut in ('confirme', 'rembourse')
      for update;
  else
    select titulaire_id, prix_gnf into v_titulaire, v_encaisse
      from achats_sms where id = p_id and statut in ('paye', 'rembourse')
      for update;
  end if;
  if v_titulaire is null then
    raise exception 'Versement introuvable, ou jamais encaissé.';
  end if;

  select coalesce(sum(montant_gnf), 0) into v_deja from remboursements
   where (p_famille = 'abonnement' and paiement_id = p_id)
      or (p_famille = 'recharge' and achat_sms_id = p_id);
  v_reste := v_encaisse - v_deja;
  if v_reste <= 0 then
    raise exception 'Ce versement a déjà été intégralement remboursé.';
  end if;
  if coalesce(p_montant, 0) <= 0 or p_montant > v_reste then
    raise exception 'Le montant doit être compris entre 1 et % GNF.', v_reste;
  end if;
  v_integral := p_montant = v_reste;

  insert into remboursements
    (paiement_id, achat_sms_id, titulaire_id, montant_gnf, motif, cree_par)
  values (
    case when p_famille = 'abonnement' then p_id end,
    case when p_famille = 'recharge' then p_id end,
    v_titulaire, p_montant, trim(p_motif), auth.uid()
  );

  if v_integral then
    if p_famille = 'abonnement' then
      update paiements_abonnement set statut = 'rembourse' where id = p_id;
      update abonnements set statut = 'annule' where titulaire_id = v_titulaire;
    else
      update achats_sms set statut = 'rembourse' where id = p_id;
    end if;
  end if;

  perform creer_notification(
    v_titulaire,
    'paiement',
    'Remboursement effectué',
    -- Pas de `to_char(…, 'FM999G999G999')` : le séparateur `G` dépend de
    -- `lc_numeric` et sortirait une virgule anglaise sur cette base.
    p_montant::text || ' GNF vous ont été remboursés — ' || trim(p_motif),
    '/espace-medecin/paiements',
    'remboursement',
    p_id
  );

  return jsonb_build_object('montant', p_montant, 'integral', v_integral, 'reste', v_reste - p_montant);
end;
$$;

/*
 * Résilier un abonnement. Distinct d'un remboursement : le service a été
 * rendu, on arrête simplement la reconduction. L'échéance en cours n'est pas
 * tronquée — le professionnel a payé jusque-là.
 */
create or replace function resilier_abonnement(p_titulaire uuid, p_motif text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not est_admin_finance() then
    raise exception 'Réservé à l''administration financière.' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_motif, '')), '') is null then
    raise exception 'Un motif est obligatoire pour résilier.';
  end if;
  update abonnements set statut = 'annule' where titulaire_id = p_titulaire;
  if not found then
    raise exception 'Aucun abonnement pour ce compte.';
  end if;
  perform creer_notification(
    p_titulaire,
    'abonnement',
    'Abonnement résilié',
    trim(p_motif),
    '/espace-medecin/abonnement',
    'abonnement',
    null
  );
end;
$$;

-- ---------- Indicateurs financiers ----------
/*
 * Tout est calculé en SQL, en un aller-retour. L'alternative — descendre
 * chaque paiement dans le navigateur pour l'y additionner — coûte de plus en
 * plus cher à mesure que la plateforme encaisse, et pour un écran d'admin
 * qui n'a besoin que des totaux.
 *
 * `revenu` est NET : encaissé moins remboursé sur la même période. Un chiffre
 * d'affaires qui ignore les remboursements se dément tout seul au premier
 * litige.
 *
 * Le MRR normalise l'annuel au douzième : c'est le seul moyen de comparer
 * deux mois dont l'un a vendu des engagements à l'année.
 */
create or replace function kpi_finances()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_debut_mois date := date_trunc('month', current_date)::date;
  v_resultat jsonb;
begin
  if not est_admin() then
    raise exception 'Réservé à l''administration.' using errcode = '42501';
  end if;

  with encaisse as (
    select decide_le as le, montant_gnf as montant from paiements_abonnement where statut = 'confirme'
    union all
    select valide_le, prix_gnf from achats_sms where statut = 'paye'
    -- Un versement remboursé a bien été encaissé : il compte au brut, et le
    -- remboursement le retranche à sa propre date.
    union all
    select decide_le, montant_gnf from paiements_abonnement where statut = 'rembourse'
    union all
    select valide_le, prix_gnf from achats_sms where statut = 'rembourse'
  ),
  attente as (
    select montant_gnf as montant from paiements_abonnement where statut = 'en_attente'
    union all
    select prix_gnf from achats_sms where statut = 'en_attente'
  ),
  mois as (
    select to_char(m, 'YYYY-MM') as cle, m as debut
      from generate_series(date_trunc('month', current_date) - interval '11 months',
                           date_trunc('month', current_date), interval '1 month') as m
  )
  select jsonb_build_object(
    'revenuMois',
      coalesce((select sum(montant) from encaisse where le >= v_debut_mois), 0)
      - coalesce((select sum(montant_gnf) from remboursements where cree_le >= v_debut_mois), 0),
    'revenuTotal',
      coalesce((select sum(montant) from encaisse), 0)
      - coalesce((select sum(montant_gnf) from remboursements), 0),
    'rembourseMois',
      coalesce((select sum(montant_gnf) from remboursements where cree_le >= v_debut_mois), 0),
    'rembourseTotal', coalesce((select sum(montant_gnf) from remboursements), 0),
    'attenteNb', (select count(*) from attente),
    'attenteMontant', coalesce((select sum(montant) from attente), 0),
    'abonnements', (
      select jsonb_object_agg(statut, n) from (
        select statut::text as statut, count(*) as n from abonnements group by statut
      ) t
    ),
    'mrr', coalesce((
      select sum(case when a.periode = 'annuel' then t.prix_annuel / 12 else t.prix_mensuel end)
        from abonnements a join tarifs_plateforme t on t.formule = a.formule
       where a.statut = 'actif'
    ), 0),
    'echeances30j', (
      select count(*) from abonnements
       where statut = 'actif' and date_fin is not null
         and date_fin between current_date and current_date + 30
    ),
    'serie', (
      select jsonb_agg(jsonb_build_object(
        'mois', mois.cle,
        'revenu',
          coalesce((select sum(e.montant) from encaisse e
                     where e.le >= mois.debut and e.le < mois.debut + interval '1 month'), 0)
          - coalesce((select sum(r.montant_gnf) from remboursements r
                       where r.cree_le >= mois.debut and r.cree_le < mois.debut + interval '1 month'), 0)
      ) order by mois.cle)
      from mois
    )
  ) into v_resultat;

  return v_resultat;
end;
$$;

revoke execute on function rembourser_paiement(text, uuid, integer, text) from anon;
revoke execute on function resilier_abonnement(uuid, text) from anon;
revoke execute on function kpi_finances() from anon;
