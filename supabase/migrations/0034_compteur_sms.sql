-- Compteur de consommation SMS.
--
-- `tarifs_plateforme.quota_sms` et `abonnements.quota_sms` existaient depuis le
-- premier schéma, mais RIEN ne les lisait : aucune table d'envois, aucun
-- décompte, aucune remise à zéro. Le quota était une promesse commerciale sans
-- garde-fou — le jour où l'envoi est branché, la facture de l'agrégateur est
-- illimitée. Cette migration pose le compteur AVANT le premier envoi.
--
-- Le quota s'entend PAR MOIS CALENDAIRE, pour tout le monde, y compris les
-- abonnements annuels : il découle du prix mensuel (0033), et un compteur qui
-- se remet à zéro le 1er est le seul que l'utilisateur comme l'admin savent
-- lire sans explication. Aucune colonne à maintenir pour ça : le mois se
-- déduit de `envoye_le`.

create type statut_sms as enum ('envoye', 'echec', 'simule');

create table sms_envoyes (
  id uuid primary key default gen_random_uuid(),
  -- Le professionnel dont le quota est débité : titulaire de l'abonnement,
  -- donc le médecin lui-même ou le gestionnaire de l'établissement.
  titulaire_id uuid not null references utilisateurs (id) on delete cascade,
  destinataire text not null,
  -- « confirmation », « rappel », « annulation »… texte libre : la liste des
  -- motifs bougera plus vite qu'une migration.
  motif text not null,
  statut statut_sms not null default 'envoye',
  -- Coût facturé par l'agrégateur, figé À L'ENVOI : il ne doit pas suivre les
  -- variations du tarif, sinon l'historique de facturation se réécrit tout
  -- seul à chaque renégociation.
  cout_gnf integer not null default 0,
  -- Segments réels : un SMS de plus de 160 caractères est facturé plusieurs
  -- fois par l'agrégateur. Sans ce compte, un long rappel coûte le triple
  -- d'un court et le compteur ne le voit pas.
  segments smallint not null default 1 check (segments >= 1),
  reference_externe text,
  erreur text,
  envoye_le timestamptz not null default now()
);

-- Le compteur interroge toujours « ce titulaire, ce mois » : sans cet index,
-- chaque vérification de quota balaie toute la table.
create index sms_envoyes_titulaire_mois on sms_envoyes (titulaire_id, envoye_le desc);

-- ---------- Décompte ----------

/*
 * Consommation d'un titulaire sur un mois donné.
 *
 * Compte les SEGMENTS, pas les lignes : c'est ce que l'agrégateur facture.
 * Les échecs ne sont pas décomptés — un SMS non délivré n'est pas dû, et
 * débiter le quota dessus ferait payer au professionnel une panne réseau.
 */
create or replace function sms_consommes(p_titulaire uuid, p_mois date default current_date)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(segments), 0)::integer
  from sms_envoyes
  where titulaire_id = p_titulaire
    and statut <> 'echec'
    and envoye_le >= date_trunc('month', p_mois)
    and envoye_le < date_trunc('month', p_mois) + interval '1 month';
$$;

/*
 * Ce qu'il reste à un titulaire ce mois-ci. Négatif impossible : on borne à 0
 * pour que l'appelant n'ait pas à s'en soucier.
 *
 * Le quota lu est celui de l'ABONNEMENT, pas celui du tarif : il est figé à
 * l'ouverture, donc un professionnel garde le quota qu'on lui a vendu même si
 * l'admin retouche la grille en cours de mois.
 */
create or replace function sms_restants(p_titulaire uuid)
returns integer language sql stable security definer set search_path = public as $$
  select greatest(
    0,
    coalesce((select quota_sms from abonnements where titulaire_id = p_titulaire limit 1), 0)
      - sms_consommes(p_titulaire)
  );
$$;

/*
 * Enregistre un envoi et rend l'identifiant de la ligne — ou lève si le quota
 * est épuisé.
 *
 * C'est le point de passage obligé : tant que l'écriture dans `sms_envoyes`
 * n'est possible que par ici (voir la policy plus bas), aucun chemin de code
 * ne peut envoyer sans être compté. Le contrôle vit en base plutôt que dans
 * l'application, parce qu'un oubli côté application se paie en factures.
 */
create or replace function enregistrer_sms(
  p_titulaire uuid,
  p_destinataire text,
  p_motif text,
  p_segments smallint default 1,
  p_cout_unitaire integer default 150,
  p_statut statut_sms default 'envoye',
  p_reference text default null,
  p_erreur text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  -- Un échec ne consomme rien : il doit pouvoir être journalisé même à quota
  -- épuisé, sinon on perd la trace de ce qui s'est mal passé.
  if p_statut <> 'echec' and sms_restants(p_titulaire) < p_segments then
    raise exception 'Quota SMS épuisé pour ce mois (% segments demandés, % restants).',
      p_segments, sms_restants(p_titulaire)
      using errcode = 'check_violation';
  end if;

  insert into sms_envoyes (titulaire_id, destinataire, motif, statut, cout_gnf, segments, reference_externe, erreur)
  values (p_titulaire, p_destinataire, p_motif, p_statut,
          p_segments * p_cout_unitaire, p_segments, p_reference, p_erreur)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------- Lecture par l'admin : consommation du mois ----------

/*
 * Un professionnel = une ligne, avec son quota, sa consommation et ce qu'elle
 * coûte réellement. C'est ce que l'admin doit voir pour anticiper la facture
 * de l'agrégateur, et pour repérer un palier dont le quota est mal calibré.
 */
create or replace view consommation_sms_mois as
select
  a.titulaire_id,
  a.type_titulaire,
  a.formule,
  a.quota_sms,
  sms_consommes(a.titulaire_id) as consommes,
  greatest(0, a.quota_sms - sms_consommes(a.titulaire_id)) as restants,
  coalesce((
    select sum(s.cout_gnf) from sms_envoyes s
    where s.titulaire_id = a.titulaire_id
      and s.statut <> 'echec'
      and s.envoye_le >= date_trunc('month', current_date)
  ), 0)::integer as cout_gnf
from abonnements a;

-- ---------- RLS ----------

alter table sms_envoyes enable row level security;

-- Le professionnel voit sa propre consommation ; l'admin Finance voit tout,
-- comme pour le reste des données financières (spec C.7.10).
create policy sel_sms_titulaire on sms_envoyes for select
  using (titulaire_id = auth.uid() or est_admin_finance());

-- Aucune policy d'INSERT, d'UPDATE ni de DELETE : l'écriture passe
-- exclusivement par enregistrer_sms() (SECURITY DEFINER), qui vérifie le
-- quota. Une policy d'insert ouverte au titulaire suffirait à contourner le
-- contrôle depuis la console du navigateur — c'est exactement l'erreur
-- corrigée sur `abonnements` par la 0019.

grant execute on function sms_consommes(uuid, date) to authenticated;
grant execute on function sms_restants(uuid) to authenticated;
-- enregistrer_sms n'est PAS accordée à `authenticated` : seul le service_role
-- (routes serveur) écrit des envois. Un client qui pourrait l'appeler
-- pourrait débiter le quota d'autrui en passant son id.
