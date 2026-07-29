-- ============================================================
-- Docteur 224 — Indicateurs d'avis pour l'espace admin
--
-- Tout est calculé en base : l'admin n'a pas à rapatrier des milliers de
-- lignes pour en faire la moyenne côté navigateur. Les fonctions sont en
-- SECURITY DEFINER (elles agrègent des données de toute la plateforme) et
-- refusent explicitement tout appelant qui n'est pas administrateur.
-- ============================================================

-- ---------- Seuil de fiabilité ----------
-- Nombre d'avis à partir duquel une moyenne est jugée représentative. Sert
-- à deux choses : décider qui est « éligible récompense », et pondérer le
-- classement (voir avis_classement_medecins). Volontairement bas (3) pour
-- une plateforme qui démarre ; à relever quand le volume d'avis augmentera.
create or replace function avis_seuil_fiabilite() returns integer
language sql immutable as $$ select 3 $$;

-- ---------- Baromètre global ----------
create or replace function avis_stats_globales()
returns table (
  avis_publies bigint,
  avis_masques bigint,
  avis_ce_mois bigint,
  avis_mois_precedent bigint,
  note_moyenne numeric,
  nb_positifs bigint,       -- 4★ et 5★
  nb_neutres bigint,        -- 3★
  nb_negatifs bigint,       -- 1★ et 2★
  nb_avec_reponse bigint,
  nb_sans_reponse_7j bigint,
  medecins_valides bigint,
  medecins_notes bigint,
  signalements_ouverts bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not est_admin() then
    raise exception 'Indicateurs réservés aux administrateurs.';
  end if;

  return query
  with pub as (select * from avis where statut = 'publie')
  select
    (select count(*) from pub),
    (select count(*) from avis where statut = 'rejete'),
    (select count(*) from pub where cree_le >= date_trunc('month', now())),
    (select count(*) from pub
      where cree_le >= date_trunc('month', now()) - interval '1 month'
        and cree_le <  date_trunc('month', now())),
    (select round(avg(note)::numeric, 2) from pub),
    (select count(*) from pub where note >= 4),
    (select count(*) from pub where note = 3),
    (select count(*) from pub where note <= 2),
    (select count(*) from pub where reponse_medecin is not null),
    -- File de relance : avis publiés, sans réponse, déposés il y a plus d'une
    -- semaine. C'est ce qui donne à l'admin quelque chose à faire.
    (select count(*) from pub
      where reponse_medecin is null and cree_le < now() - interval '7 days'),
    (select count(*) from medecins where statut = 'valide'),
    (select count(*) from medecins where statut = 'valide' and nb_avis > 0),
    (select count(*) from signalements
      where cible_type = 'avis' and statut in ('nouveau', 'en_cours'));
end;
$$;

-- ---------- Répartition des notes (5★ → 1★) ----------
create or replace function avis_repartition()
returns table (etoiles integer, nb bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not est_admin() then
    raise exception 'Indicateurs réservés aux administrateurs.';
  end if;

  return query
  select e.etoiles, count(a.id)
  from generate_series(5, 1, -1) as e(etoiles)
  left join avis a on a.note = e.etoiles and a.statut = 'publie'
  group by e.etoiles
  order by e.etoiles desc;
end;
$$;

-- ---------- Classement des médecins ----------
-- `p_ordre` :
--   'meilleurs'  → les mieux notés (score pondéré décroissant)
--   'moins_bons' → les moins bien notés, à accompagner
--   'plus_avis'  → les plus commentés (volume, pas qualité)
--   'sans_avis'  → les médecins qu'aucun patient n'a encore notés
--
-- Le tri « meilleurs » / « moins_bons » n'utilise PAS la moyenne brute mais
-- une moyenne bayésienne (formule du Top 250 d'IMDb) :
--
--     score = (v / (v + m)) * R  +  (m / (v + m)) * C
--
--   v = nombre d'avis du médecin, R = sa moyenne,
--   m = seuil de fiabilité,       C = moyenne de la plateforme.
--
-- Sans cette pondération, un médecin noté 5,0 par un seul patient passerait
-- devant un médecin noté 4,8 par quarante patients — et on récompenserait du
-- bruit statistique. Ici, tant que v est petit, le score reste tiré vers la
-- moyenne générale ; il ne s'en détache qu'à mesure que les avis s'accumulent.
create or replace function avis_classement_medecins(
  p_ordre text default 'meilleurs',
  p_limite integer default 10
)
returns table (
  medecin_id uuid,
  nom_complet text,
  specialite text,
  ville text,
  note_moyenne numeric,
  nb_avis integer,
  score_pondere numeric,
  eligible_recompense boolean,
  nb_sans_reponse bigint
)
language plpgsql stable security definer set search_path = public as $$
declare
  moyenne_plateforme numeric;
  seuil integer := avis_seuil_fiabilite();
begin
  if not est_admin() then
    raise exception 'Indicateurs réservés aux administrateurs.';
  end if;

  -- Moyenne de référence (C). Sans aucun avis publié, on prend 0 : le score
  -- de tout le monde vaut alors 0, le classement est simplement vide de sens
  -- — ce que l'écran signale déjà par son état « aucun avis ».
  select coalesce(round(avg(note)::numeric, 4), 0) into moyenne_plateforme
  from avis where statut = 'publie';

  -- Le calcul passe par une CTE : les noms de colonnes du RETURNS TABLE sont
  -- aussi des variables dans la fonction, les citer dans un ORDER BY serait
  -- ambigu. Ici on trie sur les alias de la CTE, sans collision possible.
  return query
  with base as (
    select
      m.id as mid,
      trim(concat_ws(' ', m.civilite, u.prenom, u.nom)) as nom,
      coalesce(s.nom, 'Médecine générale') as spec,
      coalesce(v.nom, '') as vil,
      m.note_moyenne as moyenne,
      m.nb_avis as nb,
      case
        when m.nb_avis = 0 then 0::numeric
        else round(
          (m.nb_avis::numeric / (m.nb_avis + seuil)) * m.note_moyenne
          + (seuil::numeric / (m.nb_avis + seuil)) * moyenne_plateforme,
          2)
      end as score,
      m.nb_avis >= seuil as eligible,
      (select count(*) from avis a
        where a.medecin_id = m.id and a.statut = 'publie' and a.reponse_medecin is null)
        as sans_reponse
    from medecins m
    join utilisateurs u on u.id = m.id
    left join specialites s on s.id = m.specialite_id
    left join villes v on v.id = m.ville_id
    where m.statut = 'valide'
      -- Classer sur la qualité n'a de sens que pour un médecin déjà noté ;
      -- « sans_avis » fait au contraire l'inverse.
      and case
        when p_ordre = 'sans_avis' then m.nb_avis = 0
        else m.nb_avis > 0
      end
  )
  select b.mid, b.nom, b.spec, b.vil, b.moyenne, b.nb, b.score, b.eligible, b.sans_reponse
  from base b
  order by
    case when p_ordre = 'meilleurs'  then b.score end desc nulls last,
    case when p_ordre = 'moins_bons' then b.score end asc  nulls last,
    case when p_ordre = 'plus_avis'  then b.nb end desc nulls last,
    -- Départage stable : à score égal, le plus commenté d'abord, puis le nom.
    b.nb desc,
    b.nom
  limit greatest(p_limite, 1);
end;
$$;

grant execute on function avis_seuil_fiabilite() to authenticated;
grant execute on function avis_stats_globales() to authenticated;
grant execute on function avis_repartition() to authenticated;
grant execute on function avis_classement_medecins(text, integer) to authenticated;
