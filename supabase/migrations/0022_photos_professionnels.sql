-- ============================================================
-- Docteur 224 — Photos des professionnels
--
-- Deux manques constatés sur les écrans « Mon profil » (médecin) et
-- « Informations » (établissement) :
--
--   1. La galerie de photos n'existait pas. Les trois vignettes affichées
--      (« Salle d'attente », « Salle de soins », « Consultation ») étaient
--      un décor écrit en dur dans le JSX, identique pour tout le monde, et
--      le bouton « Ajouter une photo » ne faisait rien. La même illusion
--      était servie sur la fiche publique du médecin.
--   2. L'établissement n'avait aucune photo de profil : les colonnes
--      `photo_url`/`photo_id` n'existaient que sur `medecins` (0010).
--
-- Les images vivent sur Cloudinary ; on garde `public_id` en plus de l'URL
-- pour pouvoir détruire le fichier quand la ligne est supprimée, sinon
-- chaque retrait laisserait une image facturée derrière lui.
-- ============================================================

-- ---------- 1. Photo de profil de l'établissement ----------
alter table etablissements
  add column if not exists photo_url text,
  add column if not exists photo_id text;

comment on column etablissements.photo_url is
  'URL Cloudinary de la photo principale. NULL = pictogramme par défaut.';
comment on column etablissements.photo_id is
  'public_id Cloudinary, utilisé pour supprimer l''image remplacée.';

-- ---------- 2. Galerie ----------
-- Un propriétaire et un seul : médecin OU établissement, comme
-- `documents_patient` distingue patient et proche.
create table if not exists photos_pro (
  id uuid primary key default gen_random_uuid(),
  medecin_id uuid references medecins (id) on delete cascade,
  etablissement_id uuid references etablissements (id) on delete cascade,
  url text not null,
  public_id text not null,
  legende text,
  position integer not null default 0,
  cree_le timestamptz not null default now(),
  constraint photos_pro_proprietaire_check check (
    (medecin_id is not null and etablissement_id is null)
    or (medecin_id is null and etablissement_id is not null)
  )
);

create index if not exists idx_photos_pro_medecin on photos_pro (medecin_id, position);
create index if not exists idx_photos_pro_etablissement on photos_pro (etablissement_id, position);

alter table photos_pro enable row level security;

-- Lecture publique : la galerie n'a de sens que sur une fiche visible, donc
-- seulement pour les professionnels validés. Les patients n'ont rien à voir
-- des photos d'un dossier encore en attente.
drop policy if exists sel_photos_publiques on photos_pro;
create policy sel_photos_publiques on photos_pro for select using (
  exists (select 1 from medecins m where m.id = photos_pro.medecin_id and m.statut = 'valide')
  or exists (select 1 from etablissements e where e.id = photos_pro.etablissement_id and e.statut = 'valide')
);

-- Le propriétaire voit les siennes avant même d'être validé.
drop policy if exists sel_photos_proprietaire on photos_pro;
create policy sel_photos_proprietaire on photos_pro for select using (
  medecin_id = auth.uid()
  or exists (select 1 from etablissements e
             where e.id = photos_pro.etablissement_id and e.gestionnaire_id = auth.uid())
);

drop policy if exists sel_photos_admin on photos_pro;
create policy sel_photos_admin on photos_pro for select using (est_admin());

drop policy if exists ins_photos on photos_pro;
create policy ins_photos on photos_pro for insert with check (
  medecin_id = auth.uid()
  or exists (select 1 from etablissements e
             where e.id = etablissement_id and e.gestionnaire_id = auth.uid())
);

drop policy if exists upd_photos on photos_pro;
create policy upd_photos on photos_pro for update using (
  medecin_id = auth.uid()
  or exists (select 1 from etablissements e
             where e.id = photos_pro.etablissement_id and e.gestionnaire_id = auth.uid())
) with check (
  medecin_id = auth.uid()
  or exists (select 1 from etablissements e
             where e.id = etablissement_id and e.gestionnaire_id = auth.uid())
);

drop policy if exists del_photos on photos_pro;
create policy del_photos on photos_pro for delete using (
  medecin_id = auth.uid()
  or exists (select 1 from etablissements e
             where e.id = photos_pro.etablissement_id and e.gestionnaire_id = auth.uid())
  or est_admin()
);

-- ---------- 3. Plafond de 10 photos ----------
-- L'écran l'annonce et la route le vérifie, mais ni l'un ni l'autre n'est
-- une garantie : seule la base peut empêcher un client bavard d'en insérer
-- mille et de faire gonfler la facture Cloudinary.
create or replace function trg_limite_photos_pro()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_total integer;
begin
  if new.medecin_id is not null then
    select count(*) into v_total from photos_pro where medecin_id = new.medecin_id;
  else
    select count(*) into v_total from photos_pro where etablissement_id = new.etablissement_id;
  end if;
  if v_total >= 10 then
    raise exception 'Galerie limitée à 10 photos.';
  end if;
  return new;
end;
$$;

drop trigger if exists photos_pro_limite on photos_pro;
create trigger photos_pro_limite
before insert on photos_pro
for each row execute function trg_limite_photos_pro();
