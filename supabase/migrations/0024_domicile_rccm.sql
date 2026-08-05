-- ============================================================
-- 0024 — Visites à domicile, RCCM et communes administrées
--
--   1. RCCM (Registre du Commerce et du Crédit Mobilier) : mention
--      légale d'un professionnel, absente du modèle. Sur `medecins` ET
--      `etablissements` — une clinique en a un au moins autant qu'un
--      praticien.
--
--   2. Visites à domicile. Un médecin peut consulter au cabinet, à
--      domicile, ou les deux ; le patient choisit à la réservation. Trois
--      décisions structurantes :
--
--      a. Le lieu vit sur CHAQUE LIGNE de la grille tarifaire
--         (`tarifs_medecin.lieu`) plutôt que dans un « supplément de
--         déplacement » à part : le patient voit un prix, pas une
--         addition à faire, et il n'existe toujours qu'un seul endroit
--         où les prix sont saisis.
--      b. `medecins.tarif_consultation` — le prix de référence dérivé,
--         affiché sur les cartes de résultat — ne doit plus prendre
--         n'importe quelle première ligne, mais la première ligne
--         VALABLE AU CABINET. Sinon un médecin dont la grille commence
--         par une visite à domicile s'annoncerait partout au prix le
--         plus cher.
--      c. Les règles métier du rendez-vous sont posées en TRIGGER et pas
--         seulement à l'écran : réserver à domicile chez un médecin qui
--         ne le propose pas, ou sans adresse, doit être impossible même
--         par un POST forgé. La RLS dit qui peut écrire, elle ne dit pas
--         ce qui est cohérent.
--
--   3. Les communes deviennent administrables (aucune donnée nouvelle :
--      la table `communes` de 0023 avait déjà sa policy `adm_communes`,
--      il ne manquait que l'écran — voir /espace-admin/parametres).
-- ============================================================

-- ---------- 1. Mentions légales ----------
alter table medecins add column if not exists rccm text;
alter table etablissements add column if not exists rccm text;

comment on column medecins.rccm is
  'Numéro au Registre du Commerce et du Crédit Mobilier, affiché sur la fiche publique.';

-- ---------- 2. Visites à domicile ----------
alter table medecins
  add column if not exists visite_domicile boolean not null default false,
  add column if not exists zone_domicile text;

comment on column medecins.visite_domicile is
  'Le praticien se déplace-t-il au domicile du patient ?';
comment on column medecins.zone_domicile is
  'Communes ou quartiers desservis pour les visites à domicile (texte libre).';

-- Lieu d'application d'une ligne tarifaire.
alter table tarifs_medecin add column if not exists lieu text not null default 'cabinet';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tarifs_medecin_lieu_check'
  ) then
    alter table tarifs_medecin
      add constraint tarifs_medecin_lieu_check check (lieu in ('cabinet', 'domicile', 'tous'));
  end if;
end $$;

-- Lieu retenu pour un rendez-vous, et adresse de la visite le cas échéant.
alter table rendez_vous
  add column if not exists lieu text not null default 'cabinet',
  add column if not exists adresse_domicile text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rendez_vous_lieu_check'
  ) then
    alter table rendez_vous
      add constraint rendez_vous_lieu_check check (lieu in ('cabinet', 'domicile'));
  end if;
end $$;

-- Le prix de référence suit la première ligne valable AU CABINET ; à
-- défaut (praticien exclusivement à domicile), la première tout court.
create or replace function trg_synchroniser_tarif_principal()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_medecin uuid := coalesce(new.medecin_id, old.medecin_id);
  v_montant integer;
begin
  select montant into v_montant
  from tarifs_medecin
  where medecin_id = v_medecin and lieu in ('cabinet', 'tous')
  order by position, cree_le
  limit 1;

  if v_montant is null then
    select montant into v_montant
    from tarifs_medecin
    where medecin_id = v_medecin
    order by position, cree_le
    limit 1;
  end if;

  -- Grille vidée : on garde le dernier prix connu plutôt que d'afficher
  -- « 0 GNF » sur la fiche publique.
  if v_montant is not null then
    update medecins set tarif_consultation = v_montant where id = v_medecin;
  end if;
  return null;
end;
$$;

-- Cohérence d'un rendez-vous à domicile. Posée en base parce que ni
-- l'écran ni la RLS ne l'assurent : une policy vérifie QUI écrit, pas si
-- la ligne a du sens.
create or replace function trg_rdv_lieu_coherent()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.lieu = 'domicile' then
    if not exists (
      select 1 from medecins m where m.id = new.medecin_id and m.visite_domicile
    ) then
      raise exception 'Ce praticien ne propose pas de visite à domicile.';
    end if;
    if coalesce(btrim(new.adresse_domicile), '') = '' then
      raise exception 'Une visite à domicile exige une adresse.';
    end if;
  else
    -- Repasser au cabinet efface l'adresse : la conserver laisserait une
    -- donnée personnelle sans usage dans le dossier.
    new.adresse_domicile := null;
  end if;
  return new;
end;
$$;

drop trigger if exists rendez_vous_lieu_coherent on rendez_vous;
create trigger rendez_vous_lieu_coherent
before insert or update on rendez_vous
for each row execute function trg_rdv_lieu_coherent();
