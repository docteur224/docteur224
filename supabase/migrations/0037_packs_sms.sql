-- Vente de SMS au-delà du quota.
--
-- Le quota mensuel couvre l'usage normal ; au-delà, le professionnel achète
-- des segments. C'est ce qui transforme le gros consommateur — jusqu'ici une
-- perte sèche, puisqu'un dépassement se payait sur la marge — en client.
--
-- Prix de vente supérieur au coût d'achat (150 GNF chez l'agrégateur) : la
-- marge sur le hors-forfait est ce qui finance les quotas inclus.
--
-- Aucun encaissement automatique : il n'existe pas de passerelle de paiement
-- branchée. Un achat naît « en attente » et c'est l'admin Finance qui le
-- valide après réception, exactement comme les abonnements aujourd'hui.

create type statut_achat_sms as enum ('en_attente', 'paye', 'annule');

-- ---------- Catalogue ----------
create table packs_sms (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  segments integer not null check (segments > 0),
  prix_gnf integer not null check (prix_gnf >= 0),
  actif boolean not null default true,
  ordre smallint not null default 0
);

-- Prix dégressifs : 250 GNF le segment à l'unité, 200 en gros. À 150 GNF
-- d'achat, la marge va de 25 % à 67 %.
insert into packs_sms (nom, segments, prix_gnf, ordre) values
  ('Recharge 100 SMS',   100,   25000, 1),
  ('Recharge 500 SMS',   500,  112500, 2),
  ('Recharge 2 000 SMS', 2000, 420000, 3),
  ('Recharge 10 000 SMS',10000,2000000, 4);

alter table packs_sms enable row level security;
-- Le catalogue est public pour un professionnel connecté : il doit voir ce
-- qu'il peut acheter. Seul l'admin Finance le modifie.
create policy sel_packs_sms on packs_sms for select using (actif or est_admin_finance());
create policy mod_packs_sms on packs_sms for all
  using (est_admin_finance()) with check (est_admin_finance());

-- ---------- Achats ----------
create table achats_sms (
  id uuid primary key default gen_random_uuid(),
  titulaire_id uuid not null references utilisateurs (id) on delete cascade,
  pack_id uuid references packs_sms (id),
  -- Segments et prix FIGÉS à l'achat : un pack retarifé plus tard ne doit pas
  -- réécrire ce que le professionnel a payé, ni le crédit qu'il a acquis.
  segments integer not null check (segments > 0),
  prix_gnf integer not null check (prix_gnf >= 0),
  statut statut_achat_sms not null default 'en_attente',
  moyen_paiement text,
  reference_paiement text,
  cree_le timestamptz not null default now(),
  valide_le timestamptz,
  valide_par uuid references utilisateurs (id)
);

create index achats_sms_titulaire on achats_sms (titulaire_id, statut);

alter table achats_sms enable row level security;
create policy sel_achats_sms on achats_sms for select
  using (titulaire_id = auth.uid() or est_admin_finance());
-- Un professionnel demande un achat, il ne se l'accorde pas : le `statut` est
-- laissé à sa valeur par défaut par la contrainte ci-dessous, et seul l'admin
-- Finance peut le faire passer à « payé ». Sans cela, n'importe qui
-- s'attribuerait 10 000 segments depuis la console de son navigateur — c'est
-- l'erreur corrigée sur `abonnements` par la 0019.
create policy ins_achats_sms on achats_sms for insert
  with check (titulaire_id = auth.uid() and statut = 'en_attente');
create policy upd_achats_sms on achats_sms for update
  using (est_admin_finance()) with check (est_admin_finance());

-- ---------- Imputation ----------
/*
 * Un message consomme d'abord le quota du mois, et bascule sur les crédits
 * quand celui-ci est épuisé. `sur_credit` note lequel des deux a payé — sans
 * cette colonne, impossible de savoir ce qu'il reste de crédits : on ne
 * saurait pas distinguer un mois où le quota a suffi d'un mois où il a été
 * dépassé.
 *
 * L'imputation ne se partage pas : un message de 3 segments dont le quota ne
 * couvre que 2 part entièrement sur le crédit. Découper le coût d'un même
 * message entre deux enveloppes compliquerait la lecture d'une facture pour
 * quelques segments par mois.
 */
alter table messages_envoyes add column sur_credit boolean not null default false;

/** Segments achetés et payés, moins ceux déjà imputés aux crédits. */
create or replace function credits_sms(p_titulaire uuid)
returns integer language sql stable security definer set search_path = public as $$
  select greatest(0,
    coalesce((select sum(segments) from achats_sms
               where titulaire_id = p_titulaire and statut = 'paye'), 0)
    - coalesce((select sum(segments) from messages_envoyes
                 where titulaire_id = p_titulaire and canal = 'sms'
                   and statut <> 'echec' and sur_credit), 0)
  )::integer;
$$;

/*
 * Ce qu'il reste à envoyer : le quota du mois non consommé, plus les crédits
 * achetés. Les crédits ne se périment pas au changement de mois — ils ont été
 * payés, les reprendre serait du vol.
 */
create or replace function sms_restants(p_titulaire uuid)
returns integer language sql stable security definer set search_path = public as $$
  select greatest(0,
    coalesce((select quota_sms from abonnements where titulaire_id = p_titulaire limit 1), 0)
      - sms_consommes(p_titulaire)
  ) + credits_sms(p_titulaire);
$$;

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
declare
  v_id uuid;
  v_quota_restant integer;
  v_sur_credit boolean := false;
begin
  if p_canal = 'sms' and p_statut <> 'echec' then
    v_quota_restant := greatest(0,
      coalesce((select quota_sms from abonnements where titulaire_id = p_titulaire limit 1), 0)
        - sms_consommes(p_titulaire));
    if v_quota_restant < p_segments then
      v_sur_credit := true;
      if credits_sms(p_titulaire) < p_segments then
        raise exception 'Quota SMS épuisé et crédit insuffisant (% segments demandés, % restants).',
          p_segments, sms_restants(p_titulaire)
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  insert into messages_envoyes
    (titulaire_id, destinataire, motif, canal, statut, cout_gnf, segments,
     reference_externe, erreur, sur_credit)
  values (p_titulaire, p_destinataire, p_motif, p_canal, p_statut,
          p_segments * p_cout_unitaire, p_segments, p_reference, p_erreur, v_sur_credit)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function enregistrer_message(uuid, text, text, canal_message, smallint, integer, statut_message, text, text) from public;
revoke execute on function enregistrer_message(uuid, text, text, canal_message, smallint, integer, statut_message, text, text) from authenticated;
revoke execute on function enregistrer_message(uuid, text, text, canal_message, smallint, integer, statut_message, text, text) from anon;
revoke execute on function credits_sms(uuid) from public;
revoke execute on function credits_sms(uuid) from authenticated;
revoke execute on function credits_sms(uuid) from anon;

-- La vue expose le crédit à côté du quota : sans lui, un professionnel qui a
-- rechargé verrait « 0 restant » alors qu'il peut encore envoyer.
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
  coalesce(c.messages_whatsapp, 0)::integer as whatsapp,
  greatest(0,
    coalesce((select sum(ac.segments) from achats_sms ac
               where ac.titulaire_id = a.titulaire_id and ac.statut = 'paye'), 0)
    - coalesce((select sum(m2.segments) from messages_envoyes m2
                 where m2.titulaire_id = a.titulaire_id and m2.canal = 'sms'
                   and m2.statut <> 'echec' and m2.sur_credit), 0)
  )::integer as credits
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
