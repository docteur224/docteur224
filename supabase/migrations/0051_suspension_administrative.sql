-- ============================================================
-- Docteur 224 — La suspension prononcée par un administrateur doit tenir
--
-- Le bouton « Suspendre » de /espace-admin/utilisateurs ne suspendait
-- personne. Trois pièces manquaient, et elles se complétaient l'une
-- l'autre :
--
--   1. l'écran écrivait `statut = 'suspendu'` DIRECTEMENT depuis le
--      navigateur, et la policy `upd_utilisateurs_soi` laisse tout compte
--      réécrire sa propre ligne : la personne suspendue repassait « actif »
--      d'une seule requête ;
--   2. rien ne distinguait une SANCTION d'une PAUSE VOLONTAIRE (migration
--      0045). Les deux écrivaient le même statut, si bien que l'écran
--      « Votre compte est en pause » tendait son bouton « Réactiver mon
--      compte » à la personne que l'administrateur venait de sanctionner ;
--   3. la session en cours n'était pas fermée — mais c'est l'affaire de la
--      route serveur, l'API auth admin n'étant pas joignable d'ici.
--
-- Cette migration pose les deux premières. Elle nomme la sanction
-- (`suspendu_par_admin`), ferme l'écriture directe du statut par son
-- titulaire, et réserve la réactivation à celui qui a prononcé la mesure.
--
-- Vérifié avant écriture : aucun compte n'est en statut « suspendu » à ce
-- jour, la valeur par défaut ne requalifie donc aucune situation existante.
-- ============================================================

-- ---------- 1. D'où vient la suspension ----------
alter table utilisateurs
  add column if not exists suspendu_par_admin boolean not null default false;

comment on column utilisateurs.suspendu_par_admin is
  'Vrai quand la suspension est une sanction administrative : le titulaire ne peut alors pas se réactiver lui-même.';

-- ---------- 2. Le statut ne se change plus à main nue ----------
/*
 * Pendant de `bloquer_escalade_role` pour le statut du compte.
 *
 * Quatre chemins, et eux seuls :
 *   - le contexte serveur (clé service_role, auth.uid() nul) : les routes
 *     /api ont déjà relu le rôle et les droits de l'appelant en base ;
 *   - la fonction `basculer_suspension_compte`, qui pose le drapeau
 *     ci-dessous — c'est la pause volontaire de « Mon compte » ;
 *   - un administrateur habilité agissant sur QUELQU'UN D'AUTRE : la
 *     provenance est alors inscrite d'office, l'application n'a pas à y
 *     penser ;
 *   - l'absence de changement, qui ne regarde personne.
 */
create or replace function bloquer_statut_utilisateur() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.statut is not distinct from old.statut
     and new.suspendu_par_admin is not distinct from old.suspendu_par_admin then
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if coalesce(current_setting('docteur224.bascule_suspension', true), '') = '1' then
    return new;
  end if;

  if old.id <> auth.uid() and a_une_permission_admin('utilisateurs', 'equipe') then
    -- La sanction se marque ici, pas dans l'écran : une suspension posée
    -- par un autre chemin resterait sinon indistinguable d'une pause.
    if new.statut = 'suspendu' and old.statut is distinct from 'suspendu' then
      new.suspendu_par_admin := true;
    elsif new.statut = 'actif' then
      new.suspendu_par_admin := false;
    end if;
    return new;
  end if;

  raise exception 'Le statut de ce compte ne se modifie pas directement : passez par « Mon compte », ou par l''écran d''administration.';
end;
$$;

drop trigger if exists trg_bloquer_statut_utilisateur on utilisateurs;
create trigger trg_bloquer_statut_utilisateur
  before update on utilisateurs
  for each row execute function bloquer_statut_utilisateur();

-- ---------- 3. La pause volontaire garde sa porte ----------
/*
 * Reprise de la migration 0045, avec deux ajouts :
 *
 *   - le drapeau de transaction qui ouvre le trigger ci-dessus (`true` en
 *     troisième argument : il retombe à la fin de la transaction, il ne
 *     peut donc pas servir deux fois) ;
 *   - le refus de se réactiver quand la suspension est une sanction. Le
 *     message dit quoi faire ensuite : sans cela, la personne resterait
 *     devant un bouton muet.
 */
create or replace function basculer_suspension_compte(p_suspendre boolean)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_role role_utilisateur;
  v_statut statut_compte;
  v_principal boolean;
  v_permissions text[];
  v_sanction boolean;
begin
  select role, statut, admin_principal, sous_roles_admin, suspendu_par_admin
    into v_role, v_statut, v_principal, v_permissions, v_sanction
    from utilisateurs where id = auth.uid();

  if not found then raise exception 'Compte introuvable.'; end if;
  if v_statut = 'supprime' then raise exception 'Ce compte est fermé.'; end if;

  if not p_suspendre and v_sanction then
    raise exception 'Votre compte a été suspendu par l''administration : vous ne pouvez pas le réactiver vous-même. Écrivez au support.';
  end if;

  if v_role = 'admin'
     and (v_principal or v_permissions @> permissions_admin()) then
    raise exception 'Un super-administrateur ne suspend pas son propre compte : demandez-le à un administrateur en charge de l''équipe.';
  end if;

  perform set_config('docteur224.bascule_suspension', '1', true);

  update utilisateurs
     set statut = case when p_suspendre then 'suspendu'::statut_compte else 'actif'::statut_compte end,
         suspendu_par_admin = false
   where id = auth.uid();

  if v_role = 'medecin' then
    update medecins
       set statut = case when p_suspendre then 'suspendu'::statut_validation
                         else 'valide'::statut_validation end
     where id = auth.uid()
       and statut = case when p_suspendre then 'valide'::statut_validation
                         else 'suspendu'::statut_validation end;
  elsif v_role = 'etablissement' then
    update etablissements
       set statut = case when p_suspendre then 'suspendu'::statut_validation
                         else 'valide'::statut_validation end
     where gestionnaire_id = auth.uid()
       and statut = case when p_suspendre then 'valide'::statut_validation
                         else 'suspendu'::statut_validation end;
  end if;

  perform ecrire_audit(
    case when p_suspendre then 'A suspendu son propre compte' else 'A réactivé son propre compte' end,
    'utilisateur', auth.uid(), jsonb_build_object('cible', v_role::text)
  );

  return case when p_suspendre then 'suspendu' else 'actif' end;
end;
$$;

revoke execute on function basculer_suspension_compte(boolean) from public;
grant execute on function basculer_suspension_compte(boolean) to authenticated;

-- ---------- 4. Un compte suspendu ne parle plus ----------
/*
 * `compte_actif()` fermait déjà la prise de rendez-vous et les permissions
 * d'assistant(e) (migration 0045). Deux portes restaient ouvertes à un
 * compte suspendu, et ce sont celles qui laissent une trace publique ou
 * qui atteignent quelqu'un : déposer un avis, et écrire au cabinet.
 */
drop policy if exists ins_avis on avis;
create policy ins_avis on avis for insert
  with check (compte_actif() and patient_id = auth.uid());

drop policy if exists ins_messages on messages;
create policy ins_messages on messages for insert
  with check (compte_actif() and expediteur_id = auth.uid()
              and (patient_id = auth.uid() or medecin_id = auth.uid()
                   or (medecin_id = medecin_de_assistant() and assistant_a_permission('peut_messagerie'))));
