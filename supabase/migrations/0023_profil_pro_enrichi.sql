-- ============================================================
-- 0023 — Enrichissement du profil professionnel
--
-- Quatre manques signalés sur le parcours d'inscription :
--
--   1. Commune. L'adresse s'arrêtait à la ville et au quartier ; en
--      Guinée la commune est l'échelon que tout le monde donne en
--      premier (« Ratoma », « Matoto »). Colonne libre sur `medecins`
--      et `etablissements`, adossée à un référentiel `communes` qui
--      alimente le menu déroulant — libre, parce qu'un référentiel
--      incomplet ne doit jamais empêcher une inscription.
--   2. Numéro d'ordre médical, absent de la base alors qu'il est la
--      première chose qu'un patient vérifie.
--   3. Tarifs multiples. `medecins.tarif_consultation` ne portait
--      qu'un prix unique, or un praticien affiche plusieurs lignes
--      (« Consultation », « Consultation le dimanche », « Suivi »…).
--      Nouvelle table `tarifs_medecin` ; la colonne historique
--      devient une valeur DÉRIVÉE (premier tarif de la liste),
--      maintenue par trigger — toute la recherche, les cartes de
--      résultat et le panneau de réservation continuent de la lire
--      sans rien changer, et les deux ne peuvent plus diverger.
--   4. Rien ne garantissait que le téléphone saisi soit guinéen ;
--      la contrainte vit côté formulaire (message clair) et n'est
--      pas rejouée ici pour ne pas invalider les comptes existants.
-- ============================================================

-- ---------- 1. Commune ----------
alter table medecins add column if not exists commune text;
alter table etablissements add column if not exists commune text;

comment on column medecins.commune is
  'Commune du lieu d''exercice (texte libre, suggéré par le référentiel communes).';

create table if not exists communes (
  id uuid primary key default gen_random_uuid(),
  ville_id uuid not null references villes (id) on delete cascade,
  nom text not null,
  unique (ville_id, nom)
);

create index if not exists idx_communes_ville on communes (ville_id, nom);

alter table communes enable row level security;

drop policy if exists sel_communes on communes;
create policy sel_communes on communes for select using (true);

drop policy if exists adm_communes on communes;
create policy adm_communes on communes for all using (est_admin()) with check (est_admin());

-- Référentiel de départ : les communes de Conakry, seules à être
-- universellement connues sous ce nom. Les autres villes gardent une
-- saisie libre tant que leur découpage n'est pas renseigné — mieux
-- vaut un champ ouvert qu'une liste fausse.
insert into communes (ville_id, nom)
select v.id, c.nom
from villes v
cross join (values
  ('Kaloum'), ('Dixinn'), ('Matam'), ('Ratoma'), ('Matoto'),
  ('Gbessia'), ('Lambanyi'), ('Sonfonia'), ('Kagbelen'), ('Manéah')
) as c(nom)
where v.nom = 'Conakry'
on conflict (ville_id, nom) do nothing;

-- ---------- 2. Numéro d'ordre médical ----------
alter table medecins add column if not exists numero_ordre text;

comment on column medecins.numero_ordre is
  'Numéro d''inscription à l''Ordre national des médecins de Guinée, affiché sur la fiche publique.';

-- ---------- 3. Tarifs multiples ----------
create table if not exists tarifs_medecin (
  id uuid primary key default gen_random_uuid(),
  medecin_id uuid not null references medecins (id) on delete cascade,
  libelle text not null,
  montant integer not null check (montant >= 0),
  position integer not null default 0,
  cree_le timestamptz not null default now()
);

create index if not exists idx_tarifs_medecin on tarifs_medecin (medecin_id, position, cree_le);

alter table tarifs_medecin enable row level security;

-- Même règle que photos_pro : la grille tarifaire n'a de sens que sur
-- une fiche visible, donc lecture publique pour les médecins validés.
drop policy if exists sel_tarifs_publics on tarifs_medecin;
create policy sel_tarifs_publics on tarifs_medecin for select using (
  exists (select 1 from medecins m where m.id = tarifs_medecin.medecin_id and m.statut = 'valide')
);

drop policy if exists sel_tarifs_proprietaire on tarifs_medecin;
create policy sel_tarifs_proprietaire on tarifs_medecin for select using (
  medecin_id = auth.uid()
);

drop policy if exists sel_tarifs_admin on tarifs_medecin;
create policy sel_tarifs_admin on tarifs_medecin for select using (est_admin());

drop policy if exists ins_tarifs on tarifs_medecin;
create policy ins_tarifs on tarifs_medecin for insert with check (medecin_id = auth.uid());

drop policy if exists upd_tarifs on tarifs_medecin;
create policy upd_tarifs on tarifs_medecin for update
  using (medecin_id = auth.uid()) with check (medecin_id = auth.uid());

drop policy if exists del_tarifs on tarifs_medecin;
create policy del_tarifs on tarifs_medecin for delete
  using (medecin_id = auth.uid() or est_admin());

-- Plafond : l'écran limite déjà la saisie, mais seule la base empêche
-- un client bavard d'insérer une grille tarifaire de mille lignes.
create or replace function trg_limite_tarifs_medecin()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_total integer;
begin
  select count(*) into v_total from tarifs_medecin where medecin_id = new.medecin_id;
  if v_total >= 20 then
    raise exception 'Grille tarifaire limitée à 20 lignes.';
  end if;
  return new;
end;
$$;

drop trigger if exists tarifs_medecin_limite on tarifs_medecin;
create trigger tarifs_medecin_limite
before insert on tarifs_medecin
for each row execute function trg_limite_tarifs_medecin();

-- `medecins.tarif_consultation` devient dérivé : c'est le premier
-- tarif de la grille. Sans ce trigger, la carte de résultat et le
-- panneau de réservation afficheraient un prix que le médecin croit
-- avoir changé — la divergence la plus coûteuse pour un patient.
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
  order by position, cree_le
  limit 1;

  -- Grille vidée : on garde le dernier prix connu plutôt que d'afficher
  -- « 0 GNF » sur la fiche publique.
  if v_montant is not null then
    update medecins set tarif_consultation = v_montant where id = v_medecin;
  end if;
  return null;
end;
$$;

drop trigger if exists tarifs_medecin_synchro on tarifs_medecin;
create trigger tarifs_medecin_synchro
after insert or update or delete on tarifs_medecin
for each row execute function trg_synchroniser_tarif_principal();

-- Reprise de l'existant : chaque médecin déjà tarifé reçoit sa
-- première ligne, sinon sa grille apparaîtrait vide sur sa fiche.
insert into tarifs_medecin (medecin_id, libelle, montant, position)
select m.id, 'Consultation', m.tarif_consultation, 0
from medecins m
where m.tarif_consultation is not null
  and m.tarif_consultation > 0
  and not exists (select 1 from tarifs_medecin t where t.medecin_id = m.id);
