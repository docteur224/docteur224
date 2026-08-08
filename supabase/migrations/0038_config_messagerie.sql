-- Configuration des fournisseurs SMS et WhatsApp.
--
-- Les identifiants d'API n'existent pas encore. Cette table est l'endroit où
-- ils seront posés, depuis /espace-admin/messagerie, sans redéploiement.
--
-- Elle n'a AUCUNE policy, volontairement. Une table avec RLS active et zéro
-- policy est fermée à tout le monde sauf au service_role, qui l'ignore : ni
-- `anon`, ni `authenticated`, ni même un admin connecté ne peuvent lire un
-- jeton depuis le navigateur. L'écran d'administration passe donc par une
-- route serveur, qui ne renvoie jamais les secrets — seulement s'ils sont
-- renseignés.
--
-- Une seule ligne, contrainte à l'id 1 : une configuration de plateforme n'a
-- pas de raison d'exister en plusieurs exemplaires, et « la bonne ligne » est
-- une question qu'on ne veut pas avoir à se poser à l'exécution.

create type mode_messagerie as enum ('simule', 'reel');

create table config_messagerie (
  id smallint primary key default 1 check (id = 1),

  -- « simule » journalise et décompte sans rien envoyer : tout le circuit est
  -- exerçable avant d'avoir le moindre contrat d'agrégateur, et une
  -- configuration incomplète ne peut pas partir en production par accident.
  mode mode_messagerie not null default 'simule',
  canal_defaut canal_message not null default 'whatsapp',

  -- SMS
  sms_fournisseur text,
  sms_url text,
  sms_identifiant text,
  sms_cle text,
  -- Nom court affiché à la place du numéro (« DOCTEUR224 »). Les agrégateurs
  -- guinéens exigent qu'il soit déclaré chez l'opérateur.
  sms_expediteur text,
  cout_sms_gnf integer not null default 150 check (cout_sms_gnf >= 0),

  -- WhatsApp Business
  whatsapp_fournisseur text,
  whatsapp_url text,
  whatsapp_numero_id text,
  whatsapp_jeton text,
  cout_whatsapp_gnf integer not null default 20 check (cout_whatsapp_gnf >= 0),

  maj_le timestamptz not null default now(),
  maj_par uuid references utilisateurs (id)
);

insert into config_messagerie (id) values (1) on conflict do nothing;

alter table config_messagerie enable row level security;
-- Aucune policy : voir l'en-tête. L'accès passe par /api/admin/messagerie.

/*
 * Ce que l'écran d'administration a le droit de voir : l'état de la
 * configuration, jamais les secrets. Un jeton WhatsApp qui transite une fois
 * vers un navigateur est un jeton à considérer comme divulgué — il resterait
 * dans le cache du navigateur, dans les journaux du proxy, dans l'onglet
 * réseau laissé ouvert.
 */
create or replace view config_messagerie_publique as
select
  id, mode, canal_defaut,
  sms_fournisseur, sms_url, sms_identifiant, sms_expediteur, cout_sms_gnf,
  whatsapp_fournisseur, whatsapp_url, whatsapp_numero_id, cout_whatsapp_gnf,
  sms_cle is not null and sms_cle <> '' as sms_cle_posee,
  whatsapp_jeton is not null and whatsapp_jeton <> '' as whatsapp_jeton_pose,
  maj_le, maj_par
from config_messagerie;

-- La vue hérite de l'absence de policy de sa table en `security_invoker` :
-- elle reste donc inaccessible depuis le navigateur, et n'est lue que par la
-- route serveur. Elle existe pour que cette route ne puisse pas, par
-- distraction, faire un `select *` qui embarquerait les secrets.
alter view config_messagerie_publique set (security_invoker = on);
