-- Docteur 224 — 2FA administrateurs : verrouiller aussi les LECTURES (RLS)
--
-- La garde serveur (verifierAdmin) exige déjà l'AAL2 pour les ACTIONS passant
-- par les routes /api. Mais les écrans d'administration LISENT en direct via
-- Supabase, et la RLS n'autorisait que sur le RÔLE (est_admin = admin + actif),
-- pas sur le niveau d'authentification. Un administrateur enrôlé mais resté au
-- premier facteur pouvait donc encore LIRE. On ferme ça ici, au niveau RLS.
--
-- UNE SEULE IDÉE, ajoutée aux DEUX prédicats centraux (est_admin et
-- a_une_permission_admin, d'où héritent a_permission_admin et est_admin_finance) :
-- un administrateur ne compte comme administrateur que si sa session est AAL2,
-- OU s'il n'a pas encore de facteur vérifié. Le verrou s'arme donc COMPTE PAR
-- COMPTE au fur et à mesure des enrôlements : au déploiement, aucun compte
-- n'ayant de facteur, rien ne change. Mêmes 28 policies, corps de 2 fonctions
-- seulement — les policies ne sont pas touchées.
--
-- Rejouable sans casse. À appliquer une fois le lot 2FA déployé.

-- ---------- Le prédicat partagé ----------
/*
 * plpgsql + fail-open : si la lecture des facteurs échoue (hoquet, évolution
 * du schéma `auth`), on rend `true` plutôt que de verrouiller tous les
 * administrateurs hors de la console. Le coût de sécurité est négligeable — les
 * ACTIONS restent bloquées par la garde serveur ; seules des lectures, et
 * seulement pendant la panne, passeraient.
 *
 * `auth.jwt()` et `auth.mfa_factors` sont schéma-qualifiés : le search_path
 * fixé à public ne les gêne pas. La fonction n'est appelée que depuis
 * est_admin / a_une_permission_admin (toutes deux security definer, exécutées
 * sous postgres, qui lit `auth`).
 */
create or replace function admin_mfa_satisfaite() returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors
        where user_id = auth.uid() and status = 'verified'
      );
exception when others then
  return true;
end;
$$;

revoke execute on function admin_mfa_satisfaite() from public, anon, authenticated;
grant execute on function admin_mfa_satisfaite() to service_role;

-- ---------- est_admin() : + la 2FA ----------
-- Corps recopié de la migration 0043, à une conjonction près : une fonction
-- ne se modifie pas par morceaux.
create or replace function est_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from utilisateurs
    where id = auth.uid() and role = 'admin' and statut = 'actif'
  ) and admin_mfa_satisfaite();
$$;

-- ---------- a_une_permission_admin() : + la 2FA ----------
-- Idem : recopiée entière depuis 0043, avec la conjonction ajoutée. Les
-- écritures directes des administrateurs (policies en a_permission_admin,
-- est_admin_finance) héritent du verrou par cette fonction.
create or replace function a_une_permission_admin(variadic p_permissions text[])
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from utilisateurs
    where id = auth.uid() and role = 'admin' and statut = 'actif'
      and (admin_principal or sous_roles_admin && p_permissions)
  ) and admin_mfa_satisfaite();
$$;
