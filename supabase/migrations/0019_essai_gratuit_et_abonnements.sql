-- Phase A — l'essai gratuit devient réellement pilotable par l'admin.
-- Phase B — plus aucune écriture client sur `abonnements`.

-- ---------- A.1 · Réglages lus par l'admin mais jamais amorcés ----------
-- /espace-admin/abonnements lit ces quatre clés. Aucune n'existait en
-- base : lireReglagesBool renvoyait {} et chaque composant retombait sur
-- sa propre valeur par défaut, donc l'écran affichait « activé » pour des
-- réglages qui n'étaient stockés nulle part. On amorce aux valeurs que
-- l'interface montrait déjà, pour ne rien changer à l'existant.
insert into parametres_plateforme (cle, valeur) values
  ('periode_gratuite', true),
  ('essai_gratuit', true),
  ('orange_money', true),
  ('mtn_momo', true)
on conflict (cle) do nothing;

-- ---------- A.2 · Durée d'essai par défaut ----------
-- Le schéma disait 0 (un essai expirant le jour même), le code applicatif
-- retombait sur 30. Les deux « défauts » se contredisaient : on aligne sur
-- celui que l'écran admin annonce depuis toujours.
alter table tarifs_plateforme alter column essai_jours set default 30;

-- ---------- A.3 · Filet de sécurité sur les formules ----------
-- scripts/seed.mjs amorce déjà les cinq formules avec leurs vrais tarifs
-- (250 000 à 4 000 000 GNF/mois) : le ON CONFLICT ci-dessous n'y touche
-- pas. Ces lignes ne servent qu'aux bases montées sans le seed, où
-- l'écran admin afficherait 0 partout sans jamais pouvoir enregistrer —
-- son bouton fait un UPDATE, qui ne crée pas la ligne manquante.
-- Les prix y restent à 0 : ce sont des valeurs commerciales, à saisir
-- depuis /espace-admin/abonnements.
insert into tarifs_plateforme (formule, prix_mensuel, prix_annuel, quota_sms, essai_jours)
values
  ('standard', 0, 0, 0, 30),
  ('premium',  0, 0, 0, 30),
  ('cabinet',  0, 0, 0, 30),
  ('clinique', 0, 0, 0, 30),
  ('hopital',  0, 0, 0, 30)
on conflict (formule) do nothing;

-- ---------- B · Abonnements : lecture client, écriture serveur ----------
-- Les anciennes policies autorisaient `titulaire_id = auth.uid()` en
-- insert ET en update : n'importe quel professionnel connecté pouvait
-- s'attribuer un abonnement « actif » expirant en 2099 depuis la console
-- de son navigateur. Sans conséquence tant que tout est gratuit, mais
-- c'est le contournement complet du paiement à venir.
-- Désormais seuls l'admin finance et le service_role (routes API, qui
-- ignorent la RLS) écrivent ; le titulaire garde la lecture.
drop policy if exists ins_abonnements on abonnements;
drop policy if exists upd_abonnements on abonnements;

create policy ins_abonnements on abonnements for insert
  with check (est_admin_finance());
create policy upd_abonnements on abonnements for update
  using (est_admin_finance()) with check (est_admin_finance());
