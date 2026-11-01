-- ============================================================
-- Docteur 224 — Synchronisation Google Agenda (patient), phase 1 : connexion
--
-- Un patient peut relier son compte Google pour que ses rendez-vous
-- s'ajoutent à son agenda personnel. Cette phase pose UNIQUEMENT la
-- connexion du compte (OAuth) ; la synchronisation des rendez-vous viendra
-- dans une migration suivante, sur le modèle de la file des rappels (0066).
--
-- Deux décisions structurent cette table, exactement comme pour la connexion
-- par téléphone (0077) :
--
--   1. AUCUNE POLICY. La table garde un JETON DE RAFRAÎCHISSEMENT Google,
--      c'est-à-dire un accès durable à l'agenda du patient. Il est chiffré au
--      repos (AES-256-GCM, clé hors base) et n'est lu et écrit que par les
--      routes /api/agenda-google/* avec la clé service_role. Le navigateur
--      n'a aucune raison de voir ce jeton, même le sien : la RLS est activée
--      sans aucune policy, donc tout accès anon/authenticated est refusé.
--
--   2. LE STATUT PASSE PAR UNE FONCTION. Le patient a tout de même besoin de
--      savoir s'il est connecté, et avec quelle adresse Google. Une fonction
--      SECURITY DEFINER lui rend CE SEUL renseignement (connecté oui/non +
--      e-mail), jamais le jeton — comme les autres fonctions « sans secret »
--      (0081).
--
-- Réservé au patient : c'est la route qui l'impose (verifierPatient), la
-- seule à écrire ici. Supprimer la ligne = déconnecter (on révoque alors le
-- jeton chez Google) ; on ne stocke pas d'état « révoqué » séparé.
-- ============================================================

create table if not exists agenda_google_comptes (
  utilisateur_id uuid primary key references utilisateurs (id) on delete cascade,
  -- L'adresse du compte Google relié, pour l'afficher au patient. Peut être
  -- nulle si Google ne l'a pas transmise.
  email_google text,
  -- Jeton de rafraîchissement, chiffré : « gcm$iv$tag$chiffre » (base64url).
  refresh_token_chiffre text not null,
  -- L'agenda cible. « primary » = l'agenda principal du compte Google.
  calendar_id text not null default 'primary',
  connecte_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);

alter table agenda_google_comptes enable row level security;
-- Aucune policy : seule la service_role (routes serveur) touche cette table.

-- ------------------------------------------------------------
-- Statut de MA connexion Google, sans le jeton.
--
-- Rend toujours une ligne : (connecte, email). `connecte` est vrai dès
-- qu'une ligne existe pour le compte appelant. Appelée par le patient
-- lui-même (session), via auth.uid().
-- ------------------------------------------------------------
create or replace function etat_agenda_google()
returns table (connecte boolean, email text)
language plpgsql security definer set search_path = public as $$
begin
  return query
    select true, c.email_google
      from agenda_google_comptes c
     where c.utilisateur_id = auth.uid();
  if not found then
    return query select false, null::text;
  end if;
end;
$$;

revoke execute on function etat_agenda_google() from public, anon;
grant execute on function etat_agenda_google() to authenticated;
