-- Docteur 224 — Numéro de test pour la connexion par téléphone
--
-- Tant qu'aucun agrégateur SMS ou WhatsApp n'est branché, aucun code ne peut
-- atteindre un téléphone : le parcours par téléphone est inexerçable en
-- production. Un numéro de test, réglé depuis /espace-admin/messagerie, reçoit
-- donc toujours le même code, sans rien envoyer — et les écrans de connexion
-- l'annoncent tant que l'option est cochée.
--
-- UN SEUL numéro, et non un code valable pour tous : un code fixe accepté pour
-- n'importe quel numéro permettrait d'ouvrir un compte au nom de la ligne de
-- quelqu'un d'autre. Ici, seul le numéro de test échappe à la preuve.
--
-- Aucune policy : lue et écrite par les routes serveur uniquement
-- (/api/telephone/*, /api/admin/telephone-test).

create table if not exists telephone_test (
  id smallint primary key default 1 check (id = 1),
  -- Décoché par défaut : la plateforme n'annonce pas de compte de test tant
  -- qu'un administrateur ne l'a pas décidé.
  actif boolean not null default false,
  numero text not null default '+224620000000' check (numero ~ '^\+2246[0-9]{8}$'),
  code text not null default '482913' check (code ~ '^[0-9]{6}$'),
  maj_le timestamptz not null default now(),
  maj_par uuid references utilisateurs (id) on delete set null
);

insert into telephone_test (id) values (1) on conflict do nothing;

alter table telephone_test enable row level security;
