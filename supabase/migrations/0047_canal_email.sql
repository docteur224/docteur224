-- ============================================================
-- Docteur 224 — Troisième canal de messagerie : l'e-mail
--
-- `notifications.canaux` (migration 0013) annonce depuis le début un envoi
-- `email` selon les préférences du patient, mais aucun expéditeur n'existait :
-- la colonne disait ce qui DEVRAIT partir, rien ne partait. On finit la
-- promesse en ajoutant l'e-mail au circuit d'envoi déjà en place — même
-- journalisation, même coût, même mode simulé tant qu'aucun fournisseur n'est
-- configuré.
--
-- Cette migration ne contient QUE l'ajout de la valeur d'énumération.
-- PostgreSQL refuse d'utiliser une valeur d'enum dans la même transaction que
-- son ajout ; les colonnes et les fonctions qui s'en servent vivent donc dans
-- la 0048.
-- ============================================================

alter type canal_message add value if not exists 'email';
