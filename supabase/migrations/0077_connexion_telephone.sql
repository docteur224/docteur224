-- Docteur 224 — Connexion par téléphone et code PIN
--
-- Un patient peut désormais ouvrir son compte avec son seul numéro : un code
-- reçu par WhatsApp ou SMS prouve UNE FOIS qu'il détient la ligne, puis il se
-- connecte avec son numéro et un code PIN à 4 chiffres. Le parcours par e-mail
-- ne change pas.
--
-- Trois décisions structurent cette migration.
--
-- 1. LE PIN N'EST PAS LE MOT DE PASSE SUPABASE.
--    Dix mille combinaisons se parcourent en quelques minutes contre
--    l'endpoint public d'authentification, qui ne sait rien de notre
--    verrouillage. Le compte Auth reçoit donc un mot de passe aléatoire que
--    personne ne connaît ; le PIN est haché (scrypt) ici, vérifié par la route
--    serveur, et c'est elle qui ouvre la session. Le verrou après cinq échecs
--    vit sur la même ligne que le haché : on ne peut pas l'un sans l'autre.
--
-- 2. AUCUNE POLICY.
--    Les deux tables ne sont lues et écrites que par les routes
--    /api/telephone/* avec la clé service_role. Le navigateur n'a aucune
--    raison de voir un haché de PIN ou de code, même le sien.
--
-- 3. L'E-MAIL DEVIENT FACULTATIF.
--    Un compte ouvert par téléphone peut ne pas en avoir. `email_destinataire`
--    écartait déjà les adresses nulles ou vides (migration 0060) : aucun
--    courriel ne part vers un compte qui n'en a pas.

alter table utilisateurs alter column email drop not null;

-- ---------- 1 · L'identifiant téléphone d'un compte ----------
create table if not exists identifiants_telephone (
  utilisateur_id uuid primary key references utilisateurs (id) on delete cascade,
  -- Forme stockée partout ailleurs (`utilisateurs.telephone`) : +224 et 9
  -- chiffres. UNIQUE : un numéro vérifié n'ouvre qu'un seul compte.
  telephone text not null unique check (telephone ~ '^\+2246[0-9]{8}$'),
  pin_hash text not null,
  -- Échecs consécutifs ; remis à zéro à la première réussite.
  echecs smallint not null default 0,
  verrouille_jusqua timestamptz,
  pin_modifie_le timestamptz not null default now(),
  cree_le timestamptz not null default now()
);

alter table identifiants_telephone enable row level security;

-- ---------- 2 · Les codes envoyés par WhatsApp / SMS ----------
create table if not exists codes_telephone (
  id uuid primary key default gen_random_uuid(),
  telephone text not null check (telephone ~ '^\+2246[0-9]{8}$'),
  -- `inscription` : prouver la ligne avant de créer le compte ;
  -- `pin_oublie` : prouver la ligne avant de remplacer le PIN.
  objet text not null check (objet in ('inscription', 'pin_oublie')),
  canal canal_message not null,
  code_hash text not null,
  expire_le timestamptz not null,
  tentatives smallint not null default 0,
  -- Une fois le code reconnu, la route remet un jeton à usage unique : c'est
  -- lui, et non le code, qui autorise l'étape finale (création du compte,
  -- nouveau PIN). Le code ne peut donc pas resservir.
  verifie_le timestamptz,
  jeton_hash text,
  utilise_le timestamptz,
  -- Plafond par adresse IP : un formulaire public qui expédie des SMS payants
  -- est une cible (« SMS pumping »), le plafond par numéro n'y suffit pas.
  ip text,
  cree_le timestamptz not null default now()
);

create index if not exists codes_telephone_numero
  on codes_telephone (telephone, objet, cree_le desc);
create index if not exists codes_telephone_ip on codes_telephone (ip, cree_le desc);
create unique index if not exists codes_telephone_jeton
  on codes_telephone (jeton_hash) where jeton_hash is not null;

alter table codes_telephone enable row level security;

-- ---------- 3 · Les essais, réservés AVANT d'être vérifiés ----------
--
-- Compter l'échec après coup laisserait passer une rafale : cent requêtes
-- parallèles liraient toutes « pas verrouillé » avant que la première n'ait
-- incrémenté quoi que ce soit, et testeraient cent PIN. Chaque essai prend
-- donc sa place dans le compteur avant que la route ne compare le haché ; la
-- réussite remet le compteur à zéro.

/*
 * PIN : cinq essais, puis quinze minutes de verrou. Rend le haché si l'essai
 * est accordé, sinon la fin du verrou. Aucune ligne : numéro inconnu.
 */
create or replace function reserver_essai_pin(p_telephone text)
returns table (o_utilisateur uuid, o_pin_hash text, o_verrou timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  -- Un verrou échu se lève de lui-même.
  update identifiants_telephone i
     set echecs = 0, verrouille_jusqua = null
   where i.telephone = p_telephone
     and i.verrouille_jusqua is not null
     and i.verrouille_jusqua <= now();

  return query
  update identifiants_telephone i
     set echecs = i.echecs + 1,
         verrouille_jusqua = case when i.echecs + 1 >= 5
                                  then now() + interval '15 minutes' end
   where i.telephone = p_telephone
     and i.verrouille_jusqua is null
  returning i.utilisateur_id, i.pin_hash, null::timestamptz;

  if not found then
    return query
    select i.utilisateur_id, null::text, i.verrouille_jusqua
      from identifiants_telephone i
     where i.telephone = p_telephone;
  end if;
end;
$$;

/*
 * Code reçu : cinq essais sur le DERNIER code envoyé pour ce numéro et cet
 * objet, tant qu'il n'a pas expiré ni servi. Redemander un code rend donc
 * caducs les précédents.
 */
create or replace function reserver_essai_code(p_telephone text, p_objet text)
returns table (o_id uuid, o_code_hash text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  update codes_telephone c
     set tentatives = c.tentatives + 1
   where c.id = (
           select d.id from codes_telephone d
            where d.telephone = p_telephone and d.objet = p_objet
            order by d.cree_le desc
            limit 1
         )
     and c.verifie_le is null
     and c.expire_le > now()
     and c.tentatives < 5
  returning c.id, c.code_hash;
end;
$$;

revoke execute on function reserver_essai_pin(text) from public, anon, authenticated;
revoke execute on function reserver_essai_code(text, text) from public, anon, authenticated;
grant execute on function reserver_essai_pin(text) to service_role;
grant execute on function reserver_essai_code(text, text) to service_role;
