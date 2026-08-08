-- Tarif du palier « structure » ajouté par 0029. À appliquer après elle.
--
-- 75 000 GNF/mois, l'annuel à dix mois (deux offerts) comme les autres
-- paliers : le palier d'entrée doit rester sous le palier cabinet, sinon la
-- grille s'inverse. Le prix reste modifiable depuis /espace-admin/abonnements.
--
-- Contrairement aux lignes à 0 posées par 0019 en filet de sécurité, celle-ci
-- porte une vraie valeur commerciale : sans elle, une structure qui s'inscrit
-- se verrait proposer un palier à 0 GNF, ce qui n'est pas « gratuit » mais
-- « non tarifé ».
insert into tarifs_plateforme (formule, prix_mensuel, prix_annuel, quota_sms, essai_jours)
values ('structure', 75000, 750000, 300, 15)
on conflict (formule) do nothing;
