-- Recalage des prix des paliers établissement.
--
-- CORRECTION PONCTUELLE — à n'appliquer qu'une fois. Elle écrase des prix
-- commerciaux : rejouée après un changement depuis /espace-admin/abonnements,
-- elle annulerait ce changement.
--
-- Deux dérives à corriger.
--
-- 1. Les prix ANNUELS des paliers n'ont jamais suivi les mensuels : l'écran
--    admin ne proposait de saisie que pour le mensuel, alors que « annuel »
--    est une période valide pour un établissement. Les annuels étaient donc
--    restés aux valeurs d'amorçage (8 000 000 en face d'un mensuel à 150 000,
--    soit plus de quatre ans de mensualités). L'écran gagne la colonne
--    manquante dans le même lot ; ici on repart d'une base saine, à dix mois
--    de mensualités — deux mois offerts pour l'engagement à l'année.
--
-- 2. Le palier « structure » avait été amorcé à 300 000 par la 0030, valeur
--    calculée sur une grille qui n'est pas celle retenue : il se retrouvait
--    au-dessus des paliers cabinet et clinique, donc le palier d'entrée était
--    le plus cher des trois. Ramené à 75 000, sous le palier cabinet.
update tarifs_plateforme set prix_mensuel = 75000 where formule = 'structure';

update tarifs_plateforme
set prix_annuel = prix_mensuel * 10
where formule in ('structure', 'cabinet', 'clinique', 'hopital');
