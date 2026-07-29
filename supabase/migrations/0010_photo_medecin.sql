-- Photo de profil du médecin, hébergée sur Cloudinary.
--
-- Deux colonnes plutôt qu'une : `photo_url` sert à l'affichage, `photo_id`
-- est l'identifiant Cloudinary (public_id) nécessaire pour supprimer
-- l'ancienne image quand le médecin en téléverse une nouvelle. Sans lui, un
-- remplacement laisserait des fichiers orphelins facturés indéfiniment.
--
-- Nullable : la fiche retombe sur l'avatar à initiales déjà en place, qui
-- reste le rendu par défaut tant qu'aucune photo n'est ajoutée.
alter table medecins
  add column photo_url text,
  add column photo_id text;

comment on column medecins.photo_url is
  'URL Cloudinary de la photo de profil. NULL = avatar à initiales.';
comment on column medecins.photo_id is
  'public_id Cloudinary, utilisé pour supprimer l''image remplacée.';
