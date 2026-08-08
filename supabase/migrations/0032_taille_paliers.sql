-- La taille visée par un palier devient une donnée, pas du texte en dur.
--
-- « 1–3 », « 4–15 », « 16+ » étaient écrits dans le composant
-- /espace-admin/abonnements : l'admin lisait des bornes qu'il ne pouvait pas
-- corriger, et qui n'existaient nulle part ailleurs.
--
-- `medecins_max` nul = pas de plafond (le « + » de « 16+ »). Les deux colonnes
-- restent nulles pour les formules médecin, où un nombre de médecins n'a pas
-- de sens.
alter table tarifs_plateforme add column if not exists medecins_min integer;
alter table tarifs_plateforme add column if not exists medecins_max integer;

alter table tarifs_plateforme drop constraint if exists tarifs_bornes_medecins;
alter table tarifs_plateforme add constraint tarifs_bornes_medecins check (
  (medecins_min is null and medecins_max is null)
  or (medecins_min >= 0 and (medecins_max is null or medecins_max >= medecins_min))
);

-- Reprise des bornes affichées jusqu'ici.
update tarifs_plateforme set medecins_min = 0, medecins_max = 3 where formule = 'structure';
update tarifs_plateforme set medecins_min = 1, medecins_max = 3 where formule = 'cabinet';
update tarifs_plateforme set medecins_min = 4, medecins_max = 15 where formule = 'clinique';
update tarifs_plateforme set medecins_min = 16, medecins_max = null where formule = 'hopital';
