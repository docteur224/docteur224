-- ============================================================
-- Docteur 224 — Le lien « mot de passe oublié » n'est pas un résumé
--
-- La 0059 a borné le résumé quotidien à un par administrateur et par jour,
-- avec un index partiel dont le PRÉDICAT, lui, ne parle pas de résumé :
--
--   unique (destinataire_id, type, date(programme_pour))
--     where notification_id is null and source_id is null
--
-- « Pas de notification d'origine, pas de source » décrivait le résumé à
-- l'époque où il était seul dans ce cas. Ce n'est plus vrai : le courriel de
-- réinitialisation du mot de passe n'a lui non plus ni notification — il n'y a
-- rien à faire sonner dans la cloche d'un compte dont on a perdu l'accès — ni
-- rendez-vous d'origine. Il tombait donc sous la même unicité, et la deuxième
-- demande de la journée était avalée en silence par le `on conflict do
-- nothing` de `programmer_email`.
--
-- Or c'est précisément la demande qui compte : la première arrive quand le
-- message s'est perdu, quand le lien a expiré au bout d'une heure, ou quand on
-- s'y est repris à deux fois. Un écran qui promet un courriel et n'en envoie
-- aucun, sans le dire, est la pire des réponses.
--
-- L'index est donc ramené à ce qu'il a toujours voulu dire : un résumé par
-- jour. Le plafond des demandes de mot de passe n'a pas sa place ici — il est
-- de trois par quart d'heure, posé par la route qui les reçoit
-- (app/api/mot-de-passe/demander), là où l'on sait distinguer le titulaire
-- pressé de celui qui s'amuse à faire sonner la boîte d'un autre.
-- ============================================================

drop index if exists emails_resume_unique;

create unique index if not exists emails_resume_unique
  on emails_en_attente
     (destinataire_id, type, ((programme_pour at time zone 'UTC')::date))
  -- `resume_%` plutôt que « ni notification ni source » : la règle nomme
  -- désormais ce qu'elle borne, et le prochain type d'e-mail sans source ne
  -- viendra pas s'y faire prendre par ressemblance.
  where notification_id is null and source_id is null and type like 'resume\_%';
