-- ============================================================
-- 0027 — Un soin = une ligne tarifaire
--
-- Deux listes vivaient côte à côte sans se connaître :
--   * `medecins.soins_et_actes` (0001) : des étiquettes libres, sans
--     prix, affichées sur la fiche publique ;
--   * `tarifs_medecin` (0023, 0024) : libellé + montant + lieu, et
--     c'est ELLE que le formulaire de réservation utilise pour bâtir
--     la liste « Motif de la consultation ».
--
-- Conséquence sur les données réelles : un praticien qui déclarait
-- « Consultation, Suivi, Dépistage, Vaccination » mais ne tarifait
-- que les deux premiers annonçait quatre soins au patient et ne lui
-- en laissait réserver que deux. La réciproque était vraie aussi :
-- une ligne « Consultation le dimanche » ajoutée aux tarifs devenait
-- réservable sans jamais figurer parmi les soins annoncés.
--
-- On ne garde qu'une source : la grille tarifaire. Plutôt que de
-- supprimer `soins_et_actes` — que lisent la fiche publique, le
-- détail de dossier admin et le récapitulatif d'inscription — on la
-- rend DÉRIVÉE, comme `tarif_consultation` l'est déjà depuis la
-- 0023. Les deux listes ne peuvent alors plus diverger, et aucun
-- écran de lecture n'a à changer.
--
-- `montant` devient facultatif : tout acte n'a pas de prix ferme
-- (vaccination dont le prix suit le vaccin, dépistage sur devis).
-- Exiger un montant obligerait le praticien à inventer un chiffre ou
-- à taire l'acte — les deux sont pires qu'un « tarif sur demande ».
-- ============================================================

-- ---------- 1. Montant facultatif ----------
alter table tarifs_medecin alter column montant drop not null;

comment on column tarifs_medecin.montant is
  'Prix en GNF, ou NULL pour « tarif sur demande ». La contrainte '
  '(montant >= 0) laisse passer NULL, elle n''a pas à changer.';

comment on table tarifs_medecin is
  'Soins et actes proposés par le praticien, avec leur prix et leur '
  'lieu. Source unique : `medecins.soins_et_actes` en est dérivée.';

-- ---------- 2. Normalisation des libellés ----------
-- Sert à reconnaître « Dépistage » et « depistage » comme un même
-- acte, sans dépendre de l'extension `unaccent` (absente du projet).
create or replace function normaliser_libelle_tarif(p_texte text)
returns text
language sql immutable set search_path = public as $$
  select translate(
    lower(btrim(coalesce(p_texte, ''))),
    'àáâãäçèéêëìíîïñòóôõöùúûüýÿ',
    'aaaaaceeeeiiiinooooouuuuyy'
  );
$$;

-- ---------- 3. Les soins annoncés découlent de la grille ----------
-- Ordre de la grille, doublons de libellé écartés (un même acte peut
-- avoir deux lignes, une au cabinet et une à domicile : le patient ne
-- doit pas lire deux fois « Consultation » parmi les soins).
create or replace function soins_depuis_tarifs(p_medecin uuid)
returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(libelle order by rang), '{}'::text[])
  from (
    select min(libelle) as libelle, min(rang) as rang
    from (
      select libelle, row_number() over (order by position, cree_le) as rang
      from tarifs_medecin
      where medecin_id = p_medecin
    ) lignes
    group by normaliser_libelle_tarif(libelle)
  ) uniques;
$$;

-- ---------- 4. Trigger de synchronisation ----------
-- Il maintenait déjà `tarif_consultation` ; il maintient désormais
-- aussi `soins_et_actes`, dans la même écriture.
--
-- Le prix de référence ne peut venir que d'une ligne TARIFÉE : sans
-- le `montant is not null`, un praticien dont le premier acte est
-- « Vaccination — sur demande » verrait la recherche et le panneau de
-- réservation garder indéfiniment son ancien prix.
create or replace function trg_synchroniser_tarif_principal()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_medecin uuid := coalesce(new.medecin_id, old.medecin_id);
  v_montant integer;
begin
  select montant into v_montant
  from tarifs_medecin
  where medecin_id = v_medecin
    and montant is not null
    and lieu in ('cabinet', 'tous')
  order by position, cree_le
  limit 1;

  if v_montant is null then
    select montant into v_montant
    from tarifs_medecin
    where medecin_id = v_medecin
      and montant is not null
    order by position, cree_le
    limit 1;
  end if;

  -- Grille vidée ou entièrement « sur demande » : on garde le dernier
  -- prix connu plutôt que d'afficher « 0 GNF » sur la fiche publique.
  -- Les soins, eux, suivent la grille jusqu'au tableau vide : ne rien
  -- annoncer est exact, annoncer un acte qui n'est plus proposé ne
  -- l'est pas.
  update medecins
  set tarif_consultation = coalesce(v_montant, tarif_consultation),
      soins_et_actes = soins_depuis_tarifs(v_medecin)
  where id = v_medecin;

  return null;
end;
$$;

-- Le trigger `tarifs_medecin_synchro` (0023) reste tel quel : il
-- pointe sur la fonction que l'on vient de remplacer.

-- ---------- 5. Reprise de l'existant ----------
-- Chaque soin déclaré qui n'a pas encore de ligne tarifaire en reçoit
-- une, sans montant. Deux garde-fous :
--   * on ne recrée pas une ligne dont le libellé existe déjà (à la
--     casse et aux accents près) ;
--   * le trigger `tarifs_medecin_limite` (0023) refuse la 21e ligne —
--     la reprise se plafonne donc elle-même, sinon la migration
--     échouerait sur un praticien à la grille déjà pleine.
with a_reprendre as (
  select
    m.id                  as medecin_id,
    min(btrim(s.libelle)) as libelle,
    min(s.ord)            as ord
  from medecins m
  cross join lateral unnest(m.soins_et_actes) with ordinality as s(libelle, ord)
  where coalesce(btrim(s.libelle), '') <> ''
    and not exists (
      select 1
      from tarifs_medecin t
      where t.medecin_id = m.id
        and normaliser_libelle_tarif(t.libelle) = normaliser_libelle_tarif(s.libelle)
    )
  group by m.id, normaliser_libelle_tarif(s.libelle)
),
numerotees as (
  select
    a.medecin_id,
    a.libelle,
    (select count(*) from tarifs_medecin t where t.medecin_id = a.medecin_id) as deja,
    row_number() over (partition by a.medecin_id order by a.ord) as rang
  from a_reprendre a
)
insert into tarifs_medecin (medecin_id, libelle, montant, position, lieu)
select medecin_id, libelle, null, deja + rang - 1, 'cabinet'
from numerotees
where deja + rang <= 20;

-- Les insertions ci-dessus ont recalculé `soins_et_actes` par trigger
-- pour les praticiens concernés. Restent ceux dont tous les soins
-- avaient déjà un tarif, mais dont la grille contient des lignes
-- jamais annoncées (« Consultation le dimanche ») : on aligne tout le
-- monde. Un praticien sans aucune ligne n'est pas touché — il n'avait
-- pas de soin non plus, la reprise le lui aurait créé.
update medecins m
set soins_et_actes = soins_depuis_tarifs(m.id)
where exists (select 1 from tarifs_medecin t where t.medecin_id = m.id);
