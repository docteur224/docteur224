-- ============================================================
-- 0028 — Le libellé retenu est celui de la PREMIÈRE ligne
--
-- Correction de `soins_depuis_tarifs` (0027). Quand un même acte a
-- deux lignes — « Consultation » au cabinet et « consultation » à
-- domicile — la fonction n'en annonçait qu'une, c'était bien le but,
-- mais elle choisissait le libellé par `min()`, donc le plus petit
-- alphabétiquement. Sur ce cas réel, la fiche publique aurait affiché
-- « consultation » en minuscule alors que le praticien avait écrit
-- « Consultation » sur la ligne qui vient en tête de sa grille.
--
-- Le libellé annoncé doit être celui de la première occurrence dans
-- l'ordre de la grille : c'est celui que le médecin a soigné, et
-- l'ordre est déjà ce qui décide du reste (prix de référence).
-- ============================================================

create or replace function soins_depuis_tarifs(p_medecin uuid)
returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(libelle order by rang), '{}'::text[])
  from (
    select (array_agg(libelle order by rang))[1] as libelle, min(rang) as rang
    from (
      select libelle, row_number() over (order by position, cree_le) as rang
      from tarifs_medecin
      where medecin_id = p_medecin
    ) lignes
    group by normaliser_libelle_tarif(libelle)
  ) uniques;
$$;

-- Réalignement de l'existant : seuls les praticiens ayant deux lignes
-- de même libellé à la casse près étaient concernés, mais la requête
-- ne coûte rien et vaut mieux qu'un doute.
update medecins m
set soins_et_actes = soins_depuis_tarifs(m.id)
where exists (select 1 from tarifs_medecin t where t.medecin_id = m.id);
