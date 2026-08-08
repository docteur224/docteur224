-- Quatrième palier établissement : « structure ».
--
-- Les paliers s'arrêtaient à cabinet (800 000 GNF/mois), ce qui plaçait hors
-- de portée un poste de santé, un centre de santé ou un cabinet de soins
-- infirmiers — le segment le plus nombreux du pays, qui ne se serait jamais
-- inscrit. « structure » ouvre le bas de la grille.
--
-- Cette migration N'AJOUTE QUE la valeur d'enum : Postgres refuse d'utiliser
-- une valeur ajoutée dans la même transaction que son insertion. La ligne de
-- tarif correspondante vit donc dans 0030, à appliquer juste après.

alter type formule_abonnement add value if not exists 'structure' before 'standard';
