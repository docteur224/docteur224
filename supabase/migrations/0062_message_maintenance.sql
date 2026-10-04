-- Le mode maintenance avait un interrupteur mais aucune page : l'activer ne
-- faisait rien de visible. La page /maintenance a besoin de deux réglages
-- éditables par l'admin, en plus de l'interrupteur `mode_maintenance` :
--   · un message libre affiché aux patients ;
--   · une échéance facultative, pour un compte à rebours « de retour dans… ».
--
-- Ces deux colonnes ne concernent que la ligne `mode_maintenance` ; elles
-- restent nulles partout ailleurs. On les pose ici plutôt que dans une table
-- dédiée pour garder une source unique des réglages de plateforme (même
-- intention que le commentaire de la table en 0008).
alter table parametres_plateforme
  add column if not exists message text,
  add column if not exists jusqua timestamptz;

-- La politique de lecture (sel_parametres_plateforme : using(true)) couvre
-- déjà ces colonnes : la page de maintenance, servie à un visiteur non
-- connecté, doit pouvoir les lire. Rien à ajouter côté RLS.
