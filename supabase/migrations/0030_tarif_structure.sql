-- Tarif du palier « structure » ajouté par 0029. À appliquer après elle.
--
-- 300 000 GNF/mois : aligné sur la formule médecin standard (250 000), le
-- seuil au-dessous duquel une petite structure ne s'inscrira pas. Le prix
-- reste modifiable depuis /espace-admin/abonnements comme les autres.
--
-- Contrairement aux lignes à 0 posées par 0019 en filet de sécurité, celle-ci
-- porte une vraie valeur commerciale : sans elle, une structure qui s'inscrit
-- se verrait proposer un palier à 0 GNF, ce qui n'est pas « gratuit » mais
-- « non tarifé ».
insert into tarifs_plateforme (formule, prix_mensuel, prix_annuel, quota_sms, essai_jours)
values ('structure', 300000, 3000000, 300, 15)
on conflict (formule) do nothing;
