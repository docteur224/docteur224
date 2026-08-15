-- ============================================================
-- Docteur 224 — « Mon compte » : sécurité, suspension, abonnement
--
-- Trois manques, les mêmes pour tous les rôles :
--
--   1. Le MOT DE PASSE ne se changeait que depuis /patient/parametres.
--      Un médecin, un(e) assistant(e), un établissement ou un
--      administrateur n'avait aucun écran pour le faire.
--   2. FERMER SON COMPTE était réservé aux patients (la route le refusait
--      aux autres rôles), et SUSPENDRE n'existait nulle part — alors que
--      c'est le geste le plus demandé : un praticien qui part six mois ne
--      veut pas effacer son historique, il veut disparaître des recherches.
--   3. L'ABONNEMENT n'avait AUCUN historique. `abonnements` porte une seule
--      ligne par titulaire, mise à jour en place : chaque changement de
--      formule écrasait le précédent. Personne — pas même l'admin Finance —
--      ne pouvait dire ce qui avait été souscrit, ni quand.
--
-- Cette migration pose ce qui manque EN BASE ; les écrans s'y branchent.
-- ============================================================

-- Un professionnel suspendu n'est ni validé, ni refusé, ni supprimé.
-- Valeur ajoutée seule : elle n'est utilisée qu'à l'exécution des fonctions
-- plpgsql ci-dessous, jamais dans cette transaction.
alter type statut_validation add value if not exists 'suspendu';

-- ---------- 1. Historique des abonnements ----------
/*
 * Un abonnement est un ÉTAT (`abonnements`, une ligne par titulaire) ; son
 * histoire est une suite d'ÉVÉNEMENTS. D'où cette table, alimentée par
 * trigger et non par le code applicatif : l'abonnement est écrit depuis
 * quatre endroits (parcours d'inscription, changement de formule,
 * confirmation de paiement, résiliation par l'admin), et une écriture
 * oubliée quelque part ferait un trou dans l'historique.
 *
 * Aucune policy d'écriture : la table est en lecture seule pour tout le
 * monde, y compris l'admin. Seul le trigger, SECURITY DEFINER, y écrit.
 */
create table if not exists historique_abonnements (
  id uuid primary key default gen_random_uuid(),
  abonnement_id uuid references abonnements (id) on delete set null,
  titulaire_id uuid not null references utilisateurs (id) on delete cascade,
  -- ouverture | changement_formule | changement_periode | activation |
  -- expiration | resiliation | renouvellement | mise_a_jour
  evenement text not null,
  formule formule_abonnement not null,
  periode periode_abonnement not null,
  statut statut_abonnement not null,
  date_debut date,
  date_fin date,
  quota_sms integer not null default 0,
  /** Phrase prête à afficher : « Standard mensuel → Premium mensuel ». */
  detail text,
  /** Nul quand l'écriture vient du serveur (clé service_role) : « Système ». */
  auteur_id uuid references utilisateurs (id),
  cree_le timestamptz not null default now()
);

create index if not exists historique_abonnements_titulaire
  on historique_abonnements (titulaire_id, cree_le desc);

alter table historique_abonnements enable row level security;

drop policy if exists sel_historique_abonnements on historique_abonnements;
create policy sel_historique_abonnements on historique_abonnements for select
  using (titulaire_id = auth.uid() or est_admin_finance());

create or replace function tracer_abonnement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_evenement text;
  v_detail text;
begin
  if tg_op = 'INSERT' then
    v_evenement := 'ouverture';
    v_detail := format('%s %s', new.formule, new.periode);
  else
    -- Un UPDATE qui ne change rien de visible ne fait pas un événement :
    -- l'historique doit se lire, pas se dérouler.
    if new.formule = old.formule and new.periode = old.periode
       and new.statut = old.statut and new.date_fin is not distinct from old.date_fin then
      return new;
    end if;

    if new.formule <> old.formule then
      v_evenement := 'changement_formule';
      v_detail := format('%s %s → %s %s', old.formule, old.periode, new.formule, new.periode);
    elsif new.periode <> old.periode then
      v_evenement := 'changement_periode';
      v_detail := format('%s : %s → %s', new.formule, old.periode, new.periode);
    elsif new.statut <> old.statut then
      v_evenement := case new.statut
        when 'actif' then 'activation'
        when 'expire' then 'expiration'
        when 'annule' then 'resiliation'
        else 'mise_a_jour'
      end;
      v_detail := format('%s : %s → %s', new.formule, old.statut, new.statut);
    else
      v_evenement := 'renouvellement';
      v_detail := format('%s : échéance au %s', new.formule, coalesce(new.date_fin::text, 'sans terme'));
    end if;
  end if;

  insert into historique_abonnements (
    abonnement_id, titulaire_id, evenement, formule, periode, statut,
    date_debut, date_fin, quota_sms, detail, auteur_id
  ) values (
    new.id, new.titulaire_id, v_evenement, new.formule, new.periode, new.statut,
    new.date_debut, new.date_fin, new.quota_sms, v_detail, auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists trg_tracer_abonnement on abonnements;
create trigger trg_tracer_abonnement
  after insert or update on abonnements
  for each row execute function tracer_abonnement();

-- Les abonnements déjà ouverts entrent dans l'historique par leur
-- ouverture : sans cela, l'écran afficherait « aucun historique » à des
-- professionnels abonnés depuis des mois.
insert into historique_abonnements (
  abonnement_id, titulaire_id, evenement, formule, periode, statut,
  date_debut, date_fin, quota_sms, detail, cree_le
)
select a.id, a.titulaire_id, 'ouverture', a.formule, a.periode, a.statut,
       a.date_debut, a.date_fin, a.quota_sms,
       format('%s %s', a.formule, a.periode),
       coalesce(a.date_debut::timestamptz, now())
  from abonnements a
 where not exists (
   select 1 from historique_abonnements h where h.titulaire_id = a.titulaire_id
 );

-- ---------- 2. Un compte suspendu n'agit plus ----------
/*
 * Sans cette fonction, « suspendre son compte » ne serait qu'un libellé :
 * la base continuerait d'accepter toutes les écritures du compte. On la
 * branche là où ça compte — la prise de rendez-vous, et l'accès des
 * assistant(e)s, qui passe par une seule porte.
 *
 * Les administrateurs sont déjà couverts : `est_admin()` exige
 * `statut = 'actif'` depuis la migration 0043.
 */
create or replace function compte_actif() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from utilisateurs where id = auth.uid() and statut = 'actif');
$$;

-- Un(e) assistant(e) suspendu(e) perd toutes ses permissions d'un coup :
-- cette fonction est la porte unique par laquelle la RLS les lit.
create or replace function assistant_a_permission(p_permission text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare ok boolean;
begin
  if not compte_actif() then return false; end if;
  execute format('select %I from assistants where id = $1', p_permission)
    into ok using auth.uid();
  return coalesce(ok, false);
end;
$$;

-- Prise de rendez-vous : un compte suspendu ne réserve plus, ni pour
-- lui-même ni pour un patient. Les rendez-vous DÉJÀ pris ne bougent pas —
-- suspendre n'est pas annuler.
drop policy if exists ins_rdv_patient on rendez_vous;
create policy ins_rdv_patient on rendez_vous for insert
  with check (compte_actif() and reserve_par = auth.uid() and reserve_par_role = 'patient'
              and (patient_id = auth.uid() or proche_du_patient(proche_id)));

drop policy if exists ins_rdv_medecin on rendez_vous;
create policy ins_rdv_medecin on rendez_vous for insert
  with check (compte_actif() and reserve_par = auth.uid()
              and reserve_par_role = 'medecin' and medecin_id = auth.uid());

/*
 * Le titulaire peut mettre SA fiche en pause — et rien d'autre.
 *
 * `trg_statut_reserve_admin` (migration 0018) réserve `statut` à
 * l'administrateur : il bouchait un trou réel (un médecin se validait
 * lui-même) mais interdisait aussi la suspension, qui n'a rien d'une
 * validation. On ouvre exactement l'aller-retour valide ↔ suspendu, sur sa
 * propre fiche. Se valider soi-même reste impossible.
 *
 * Les branches sont IMBRIQUÉES et non combinées par `and` : `new.gestionnaire_id`
 * n'existe pas sur `medecins`, et PostgreSQL ne garantit pas l'ordre
 * d'évaluation des opérandes d'un booléen.
 */
create or replace function trg_statut_reserve_admin()
returns trigger
language plpgsql security definer set search_path = public as $$
declare bascule boolean;
begin
  if auth.uid() is null or est_admin() then
    return new;
  end if;
  if new.statut is not distinct from old.statut then
    return new;
  end if;

  bascule := (old.statut = 'valide' and new.statut = 'suspendu')
          or (old.statut = 'suspendu' and new.statut = 'valide');

  if tg_table_name = 'medecins' then
    if bascule and new.id = auth.uid() then return new; end if;
  elsif tg_table_name = 'etablissements' then
    if bascule and new.gestionnaire_id = auth.uid() then return new; end if;
  end if;

  raise exception 'Le statut de validation est réservé à l''administrateur.';
end;
$$;

-- ---------- 3. Suspendre / réactiver son propre compte ----------
/*
 * Un seul point d'entrée, en base, parce que le geste touche DEUX tables :
 * le compte lui-même et la fiche publique du professionnel. Fait depuis le
 * client en deux écritures, un échec au milieu laisserait un médecin
 * « suspendu » toujours visible dans la recherche.
 *
 * Le SUPER-ADMINISTRATEUR en est exclu : il détient la gestion de l'équipe,
 * et se suspendre reviendrait à fermer la console à tout le monde s'il est
 * le dernier. Il reste maître de son compte par un autre chemin — un pair
 * disposant de la permission « Équipe admin ».
 *
 * La fiche n'est touchée que si elle est VALIDE (ou suspendue au retour) :
 * un dossier encore en validation ne doit pas ressortir « validé » d'une
 * simple réactivation.
 */
create or replace function basculer_suspension_compte(p_suspendre boolean)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_role role_utilisateur;
  v_statut statut_compte;
  v_principal boolean;
  v_permissions text[];
begin
  select role, statut, admin_principal, sous_roles_admin
    into v_role, v_statut, v_principal, v_permissions
    from utilisateurs where id = auth.uid();

  if not found then raise exception 'Compte introuvable.'; end if;
  if v_statut = 'supprime' then raise exception 'Ce compte est fermé.'; end if;

  if v_role = 'admin'
     and (v_principal or v_permissions @> permissions_admin()) then
    raise exception 'Un super-administrateur ne suspend pas son propre compte : demandez-le à un administrateur en charge de l''équipe.';
  end if;

  update utilisateurs
     set statut = case when p_suspendre then 'suspendu'::statut_compte else 'actif'::statut_compte end
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

-- ---------- 4. Ce que « Mon compte » affiche ----------
/*
 * L'abonnement courant du titulaire connecté, tarif du jour compris.
 *
 * `abonnements.quota_sms` est FIGÉ à la souscription (c'est ce qui a été
 * vendu) alors que la grille, elle, bouge : on rend les deux, et l'écran
 * annonce le quota du contrat, pas celui du tarif courant.
 */
create or replace function mon_abonnement()
returns table (
  formule text,
  periode text,
  statut text,
  date_debut date,
  date_fin date,
  quota_sms integer,
  prix_mensuel integer,
  prix_annuel integer,
  assistants_inclus integer,
  jours_restants integer
)
language sql stable security definer set search_path = public as $$
  select a.formule::text,
         a.periode::text,
         a.statut::text,
         a.date_debut,
         a.date_fin,
         a.quota_sms,
         coalesce(t.prix_mensuel, 0),
         coalesce(t.prix_annuel, 0),
         coalesce(t.assistants_inclus, 0),
         case when a.date_fin is null then null
              else greatest(0, (a.date_fin - current_date))::integer end
    from abonnements a
    left join tarifs_plateforme t on t.formule = a.formule
   where a.titulaire_id = auth.uid();
$$;

revoke execute on function mon_abonnement() from public;
grant execute on function mon_abonnement() to authenticated;
