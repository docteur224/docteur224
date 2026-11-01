-- ============================================================
-- Docteur 224 — Une TROISIÈME couleur, facultative, pour la campagne
--
-- La 0079 rangeait deux couleurs : la principale (fond des bandeaux) et
-- l'accent (boutons, liens). Deux suffisent à une cause qui tient dans une
-- teinte — Octobre Rose. Elles ne suffisent pas à un drapeau : la Guinée en a
-- trois, et le jaune n'est ni un fond lisible ni un lien lisible. Il lui faut
-- un endroit à lui.
--
-- Cet endroit est le FILET DE CAMPAGNE : un bandeau de six pixels en haut des
-- pages publiques, posé sur la couleur principale, où ne s'écrit aucun texte.
-- D'où une colonne NULLABLE et SANS influence sur le reste de la palette :
-- elle ne se dérive pas, elle se montre. Une campagne à deux couleurs la
-- laisse nulle, et le filet n'a que deux segments.
--
-- Même garde qu'en 0079 sur le format : cette valeur finit dans une feuille
-- de style servie à des visiteurs anonymes.
-- ============================================================

alter table charte_publique
  add column if not exists secondaire text;

alter table charte_publique
  drop constraint if exists charte_pub_secondaire_hex;
alter table charte_publique
  add constraint charte_pub_secondaire_hex
  check (secondaire is null or secondaire ~ '^#[0-9a-f]{6}$');
