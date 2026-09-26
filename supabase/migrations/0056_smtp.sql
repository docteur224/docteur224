-- ============================================================
-- Docteur 224 — L'e-mail par SMTP
--
-- Le canal e-mail existe depuis la 0047, mais son seul fournisseur réel est
-- une API HTTP (Resend, Brevo…) : `email_url` + `email_cle`. Or la plateforme
-- démarre sur une boîte Hostinger, qui ne parle que SMTP — un protocole qui
-- n'a pas d'URL, mais un hôte, un port, un identifiant et un mot de passe.
--
-- Trois colonnes suffisent. Elles sont NULL pour qui reste sur une API HTTP :
-- les deux fournisseurs cohabitent, et passer de l'un à l'autre se fait par le
-- menu déroulant de /espace-admin/messagerie, sans redéploiement. C'est la
-- raison d'être de cette table depuis la 0038.
--
-- Pourquoi l'identifiant est une colonne à part et non l'adresse d'expédition
-- réutilisée : chez la plupart des hébergeurs les deux coïncident, mais rien
-- ne l'impose — on s'authentifie couramment avec un compte technique pour
-- écrire au nom d'une adresse de service. Les confondre marcherait aujourd'hui
-- et bloquerait le jour où elles diffèrent, sans message d'erreur qui le dise.
-- ============================================================

alter table config_messagerie
  add column if not exists email_hote text,
  -- 465 (TLS implicite) ou 587 (STARTTLS) : ce sont les deux seuls ports que
  -- proposent les hébergeurs. Le mode de chiffrement se déduit du port, il n'y
  -- a donc pas de quatrième colonne à régler — ni à régler de travers.
  add column if not exists email_port integer,
  add column if not exists email_identifiant text;

alter table config_messagerie drop constraint if exists email_port_valide;
alter table config_messagerie add constraint email_port_valide
  check (email_port is null or email_port between 1 and 65535);

/*
 * La vue publique gagne les trois champs non secrets. Le mot de passe SMTP
 * reste dans `email_cle`, déjà exposée en simple « posée / absente » : c'est
 * un secret au même titre qu'un jeton d'API, et il ne redescend jamais vers un
 * navigateur.
 *
 * Elle est refaite et non remplacée, pour la raison inscrite dans la 0048 :
 * `create or replace view` n'accepte que des colonnes ajoutées EN FIN de
 * liste, et les colonnes d'un même canal restent groupées.
 */
drop view if exists config_messagerie_publique;
create view config_messagerie_publique as
select
  id, mode, canal_defaut,
  sms_fournisseur, sms_url, sms_identifiant, sms_expediteur, cout_sms_gnf,
  whatsapp_fournisseur, whatsapp_url, whatsapp_numero_id, cout_whatsapp_gnf,
  email_fournisseur, email_url, email_expediteur, cout_email_gnf,
  email_hote, email_port, email_identifiant,
  sms_cle is not null and sms_cle <> '' as sms_cle_posee,
  whatsapp_jeton is not null and whatsapp_jeton <> '' as whatsapp_jeton_pose,
  email_cle is not null and email_cle <> '' as email_cle_posee,
  maj_le, maj_par
from config_messagerie;

alter view config_messagerie_publique set (security_invoker = on);
