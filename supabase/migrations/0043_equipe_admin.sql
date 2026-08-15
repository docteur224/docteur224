-- ============================================================
-- Docteur 224 — Équipe admin : comptes, permissions, compte principal
--
-- L'écran /espace-admin/equipe promettait trois choses qu'aucune ligne de
-- code ne tenait : ajouter un administrateur (bouton désactivé), le gérer
-- (bouton désactivé), et régler ses permissions — la grille écrivait bien
-- `sous_roles_admin`, mais SUR LE PREMIER ADMIN DE LA LISTE, quel qu'il
-- soit, et ces sous-rôles ne commandaient rien d'autre que les écrans
-- financiers.
--
-- Cette migration pose les trois pièces qui manquaient :
--
--   1. un CATALOGUE de permissions fermé (une par section de la console),
--      validé en base : une permission mal orthographiée ne donne rien et
--      ne se voit pas — elle est désormais refusée à l'écriture ;
--   2. un COMPTE PRINCIPAL, indéboulonnable : il détient toutes les
--      permissions, ne peut être ni rétrogradé, ni désactivé, ni supprimé.
--      Sans lui, deux administrateurs pouvaient se retirer mutuellement la
--      permission « Équipe admin » et fermer la console à tout le monde ;
--   3. l'APPLICATION de ces permissions dans la RLS : jusqu'ici tout
--      administrateur pouvait tout écrire, `est_admin()` étant le seul
--      verrou. La lecture reste ouverte à tout administrateur (les écrans
--      se recoupent), les ÉCRITURES sont désormais cloisonnées.
--
-- Règle inchangée et rappelée ici : aucun administrateur, principal ou non,
-- n'accède aux dossiers médicaux des patients.
-- ============================================================

-- ---------- 1. Compte principal ----------
alter table utilisateurs add column if not exists admin_principal boolean not null default false;

-- Un seul, jamais deux : l'index partiel l'impose en base plutôt que dans
-- l'application, où la règle finirait par se contourner.
create unique index if not exists utilisateurs_admin_principal_unique
  on utilisateurs (admin_principal) where admin_principal;

-- ---------- 2. Catalogue des permissions ----------
-- Une permission par section de la console (voir lib/permissions-admin.ts,
-- qui porte les libellés affichés). Le tableau de bord n'y figure pas : il
-- est ouvert à tout administrateur.
create or replace function permissions_admin() returns text[]
language sql immutable set search_path = public as $$
  select array[
    'validations',   -- approuver / rejeter les professionnels
    'moderation',    -- signalements et avis
    'utilisateurs',  -- comptes patients et professionnels
    'etablissements',-- structures inscrites
    'pilotage',      -- pilotage, vedettes, annonces
    'finance',       -- revenus, abonnements, remboursements
    'messagerie',    -- configuration SMS / e-mail
    'parametres',    -- réglages et référentiels
    'equipe',        -- comptes administrateurs (cette page)
    'audit'          -- journal d'audit
  ]::text[];
$$;

-- ---------- 3. Reprise de l'existant ----------
-- Le trigger d'escalade tombe le temps de la reprise : il interdit toute
-- écriture sur `sous_roles_admin` hors session administrateur, et une
-- migration s'exécute sans session.
drop trigger if exists trg_bloquer_escalade_role on utilisateurs;

-- Les administrateurs déjà en place gardent tous leurs pouvoirs : la
-- migration ne doit retirer de droit à personne. Leurs anciens sous-rôles
-- ('support', hors catalogue) sont remplacés par le catalogue complet.
update utilisateurs set sous_roles_admin = permissions_admin()
  where role = 'admin' and statut <> 'supprime';

-- Le doyen des administrateurs devient le compte principal.
update utilisateurs set admin_principal = true
  where id = (
    select id from utilisateurs
    where role = 'admin' and statut <> 'supprime'
    order by cree_le limit 1
  )
  and not exists (select 1 from utilisateurs where admin_principal);

-- ---------- 4. Fonctions d'aide ----------
/*
 * Un administrateur SUSPENDU n'est plus administrateur. C'est ce qui donne
 * son sens au bouton « Désactiver le compte » : sans ce `statut = 'actif'`,
 * le compte désactivé continuait à passer toutes les policies de la base.
 */
create or replace function est_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from utilisateurs
    where id = auth.uid() and role = 'admin' and statut = 'actif'
  );
$$;

/*
 * Détient-il AU MOINS UNE des permissions demandées ?
 *
 * Le compte principal les a toutes, par construction : c'est le recours
 * quand plus personne d'autre ne peut rendre la main.
 */
create or replace function a_une_permission_admin(variadic p_permissions text[])
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from utilisateurs
    where id = auth.uid() and role = 'admin' and statut = 'actif'
      and (admin_principal or sous_roles_admin && p_permissions)
  );
$$;

create or replace function a_permission_admin(p_permission text) returns boolean
language sql stable security definer set search_path = public as $$
  select a_une_permission_admin(p_permission);
$$;

-- Le sous-rôle Finance (spec C.7.10) devient une permission comme les
-- autres ; la fonction reste, elle est citée par une dizaine de policies.
create or replace function est_admin_finance() returns boolean
language sql stable security definer set search_path = public as $$
  select a_permission_admin('finance');
$$;

-- ---------- 5. Garde-fou : qui modifie les droits de qui ----------
/*
 * Quatre interdits, dans cet ordre :
 *
 *   - le compte principal ne se déclare pas depuis l'application (le
 *     transférer est une opération manuelle, tracée, faite en connaissance
 *     de cause) ;
 *   - il faut la permission « Équipe admin » pour toucher aux droits ;
 *   - personne ne modifie SES PROPRES droits — sinon la permission
 *     « Équipe admin » vaudrait toutes les autres, en un clic ;
 *   - les droits du compte principal sont hors de portée.
 *
 * Sans session (clé service_role), les trois derniers contrôles sont déjà
 * faits par les routes /api/admin/equipe, qui relisent le rôle de
 * l'appelant en base avant d'agir.
 */
create or replace function bloquer_escalade_role() returns trigger
language plpgsql security definer set search_path = public as $$
declare inconnues text[];
begin
  if new.role is not distinct from old.role
     and new.sous_roles_admin is not distinct from old.sous_roles_admin
     and new.admin_principal is not distinct from old.admin_principal then
    return new; -- rien de sensible n'a bougé
  end if;

  if new.admin_principal is distinct from old.admin_principal then
    raise exception 'Le compte administrateur principal ne se transfère pas depuis l''application';
  end if;

  if auth.uid() is not null then
    if not a_permission_admin('equipe') then
      raise exception 'Modification des droits refusée : permission « Équipe admin » requise';
    end if;
    if old.id = auth.uid() then
      raise exception 'Un administrateur ne modifie pas ses propres droits';
    end if;
    if old.admin_principal then
      raise exception 'Les droits du compte administrateur principal ne se modifient pas';
    end if;
  end if;

  if new.role = 'admin' then
    select array_agg(p) into inconnues
      from unnest(new.sous_roles_admin) p
      where not (p = any (permissions_admin()));
    if inconnues is not null then
      raise exception 'Permissions inconnues : %', array_to_string(inconnues, ', ');
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_bloquer_escalade_role
  before update on utilisateurs
  for each row execute function bloquer_escalade_role();

-- ---------- 6. La liste de l'équipe ----------
/*
 * « Dernière connexion » vit dans `auth.users`, que la RLS ne donne à
 * personne : d'où cette fonction SECURITY DEFINER, qui vérifie elle-même
 * que l'appelant est administrateur avant de rendre quoi que ce soit.
 *
 * Les comptes fermés sont exclus : ils sont anonymisés et bannis, les
 * garder dans la liste ne montrerait qu'un e-mail technique.
 */
create or replace function admins_equipe()
returns table (
  id uuid,
  email text,
  nom text,
  prenom text,
  permissions text[],
  statut statut_compte,
  principal boolean,
  cree_le timestamptz,
  derniere_connexion timestamptz
)
language sql stable security definer set search_path = public as $$
  select u.id,
         u.email,
         u.nom,
         u.prenom,
         case when u.admin_principal then permissions_admin() else u.sous_roles_admin end,
         u.statut,
         u.admin_principal,
         u.cree_le,
         a.last_sign_in_at
  from utilisateurs u
  join auth.users a on a.id = u.id
  where u.role = 'admin'
    and u.statut <> 'supprime'
    and est_admin()
  order by u.admin_principal desc, u.cree_le;
$$;

revoke execute on function admins_equipe() from public;
grant execute on function admins_equipe() to authenticated;

-- ---------- 7. Application des permissions dans la RLS ----------
-- Principe : tout administrateur LIT (les écrans se recoupent : un
-- signalement porte sur un médecin, un abonnement sur une structure) ;
-- seules les ÉCRITURES sont cloisonnées.

-- utilisateurs : suspendre/réactiver relève d'« Utilisateurs », changer des
-- droits d'« Équipe admin ».
drop policy if exists adm_utilisateurs on utilisateurs;
create policy ins_utilisateurs_admin on utilisateurs for insert
  with check (a_une_permission_admin('utilisateurs', 'equipe'));
create policy upd_utilisateurs_admin on utilisateurs for update
  using (a_une_permission_admin('utilisateurs', 'equipe'))
  with check (a_une_permission_admin('utilisateurs', 'equipe'));
create policy del_utilisateurs_admin on utilisateurs for delete
  using (a_permission_admin('equipe'));

/*
 * medecins : une policy porte sur la LIGNE, jamais sur la colonne — la même
 * commande UPDATE sert à valider un dossier (`statut`) et à mettre en
 * vedette (`en_vedette`). Les deux permissions ouvrent donc l'écriture, et
 * c'est l'écran qui expose l'un ou l'autre geste.
 */
drop policy if exists adm_medecins on medecins;
create policy ins_medecins_admin on medecins for insert
  with check (a_une_permission_admin('validations', 'pilotage'));
create policy upd_medecins_admin on medecins for update
  using (a_une_permission_admin('validations', 'pilotage'))
  with check (a_une_permission_admin('validations', 'pilotage'));
create policy del_medecins_admin on medecins for delete
  using (a_permission_admin('validations'));

drop policy if exists ins_etablissements on etablissements;
drop policy if exists upd_etablissements on etablissements;
drop policy if exists del_etablissements on etablissements;
create policy ins_etablissements on etablissements for insert
  with check (gestionnaire_id = auth.uid()
              or a_une_permission_admin('validations', 'etablissements'));
create policy upd_etablissements on etablissements for update
  using (gestionnaire_id = auth.uid()
         or a_une_permission_admin('validations', 'etablissements'));
create policy del_etablissements on etablissements for delete
  using (a_permission_admin('etablissements'));

drop policy if exists upd_docs_admin on documents_validation;
drop policy if exists del_docs_admin on documents_validation;
create policy upd_docs_admin on documents_validation for update
  using (a_permission_admin('validations'));
create policy del_docs_admin on documents_validation for delete
  using (a_permission_admin('validations'));

drop policy if exists upd_avis_admin on avis;
drop policy if exists del_avis on avis;
create policy upd_avis_admin on avis for update using (a_permission_admin('moderation'));
create policy del_avis on avis for delete
  using (patient_id = auth.uid() or a_permission_admin('moderation'));

drop policy if exists upd_signalements on signalements;
drop policy if exists del_signalements on signalements;
create policy upd_signalements on signalements for update
  using (a_permission_admin('moderation'));
create policy del_signalements on signalements for delete
  using (a_permission_admin('moderation'));

-- annonces : lecture pour tout administrateur (les brouillons comme les
-- envois), écriture pour « Pilotage & annonces ».
drop policy if exists adm_annonces on annonces;
create policy sel_annonces_admin on annonces for select using (est_admin());
create policy mod_annonces_admin on annonces for all
  using (a_permission_admin('pilotage')) with check (a_permission_admin('pilotage'));

drop policy if exists mod_parametres_plateforme on parametres_plateforme;
create policy mod_parametres_plateforme on parametres_plateforme for all
  using (a_permission_admin('parametres')) with check (a_permission_admin('parametres'));

-- Référentiels : lecture publique (inchangée), écriture « Paramètres ».
drop policy if exists adm_specialites on specialites;
create policy adm_specialites on specialites for all
  using (a_permission_admin('parametres')) with check (a_permission_admin('parametres'));
drop policy if exists adm_villes on villes;
create policy adm_villes on villes for all
  using (a_permission_admin('parametres')) with check (a_permission_admin('parametres'));
drop policy if exists adm_assurances on assurances;
create policy adm_assurances on assurances for all
  using (a_permission_admin('parametres')) with check (a_permission_admin('parametres'));
drop policy if exists adm_communes on communes;
create policy adm_communes on communes for all
  using (a_permission_admin('parametres')) with check (a_permission_admin('parametres'));

-- Le journal d'audit est la mémoire des décisions : il se lit avec la
-- permission qui va avec, pas parce qu'on est administrateur.
drop policy if exists sel_audit_admin on journal_audit;
create policy sel_audit_admin on journal_audit for select
  using (a_permission_admin('audit'));
