-- Docteur 224 — Interrupteur : 2FA obligatoire pour les administrateurs
--
-- Un seul réglage booléen, dans la table clé/valeur `parametres_plateforme`
-- (migration 0008), lu et écrit comme les autres interrupteurs de l'écran
-- « Paramètres ». Il est à FALSE au départ : poser l'exigence d'enrôlement se
-- fait DÉLIBÉRÉMENT, une fois que les administrateurs se sont enrôlés.
--
-- Ce drapeau ne commande QUE l'obligation de s'enrôler pour un compte qui n'a
-- pas encore de facteur. L'autre règle — un administrateur QUI A un facteur
-- doit présenter son code (niveau AAL2) pour agir — ne dépend pas de ce
-- drapeau : elle s'applique dès qu'un facteur existe.
--
-- La table a déjà sa policy de lecture (ouverte) et d'écriture (admins) depuis
-- 0008 : rien à ajouter côté droits. Additif, rejouable.

insert into parametres_plateforme (cle, valeur)
values ('mfa_admin_obligatoire', false)
on conflict (cle) do nothing;
