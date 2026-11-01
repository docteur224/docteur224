/*
 * Durcissement de l'authentification et des accès — audit du 01/11/2026.
 *
 * L'ossature était saine : RLS active sur les 59 tables, aucune policy
 * d'écriture sans garde d'identité, stockage cloisonné par dossier, routes
 * /api qui relisent toutes le rôle en base. Cinq brèches restaient, toutes
 * de la même famille : une porte DÉRIVÉE qu'on avait oublié de fermer alors
 * que la porte principale l'était.
 *
 *   1. `creer_notification` et `email_destinataire` étaient exécutables par
 *      n'importe qui, y compris sans session. La première dépose une
 *      notification ET met un VRAI courriel en file, titre et corps au choix
 *      de l'appelant ; la seconde rend l'adresse de n'importe quel compte à
 *      partir de son identifiant — et les identifiants des praticiens sont
 *      publics. Ensemble : un relais de hameçonnage signé docteur224.com.
 *
 *   2. `utilisateurs.email` s'écrivait depuis le navigateur (`upd_utilisateurs_soi`
 *      ne cloisonne pas les colonnes). L'adresse n'est pourtant pas une
 *      préférence : c'est l'identifiant de connexion, tenu par Supabase Auth
 *      et recopié ici par `trg_synchroniser_email`. La désaligner permettait
 *      de faire partir ses propres courriels de service vers l'adresse d'un
 *      tiers.
 *
 *   3. `ins_medecins_soi` et `ins_etablissements` acceptaient une fiche de
 *      tout compte connecté, et les garde-fous des colonnes réservées
 *      (`medecins_statut_reserve`, `medecins_colonnes_reservees`,
 *      `etablissements_statut_reserve`) étaient posés BEFORE UPDATE
 *      seulement. Un compte patient pouvait donc S'INSÉRER dans l'annuaire
 *      en « valide », « en vedette », noté 5 sur 999 avis, rattaché à une
 *      clinique réelle — sans jamais passer par les validations.
 *
 *   4. `mod_assistants_medecin` ne demandait que `medecin_id = auth.uid()`.
 *      Avec (3), n'importe qui pouvait se fabriquer une fiche médecin puis
 *      déclarer le compte d'un tiers « assistant(e) » de cette fiche — ce
 *      qui ouvre `sel_utilisateurs_equipe` sur la ligne du tiers (nom,
 *      adresse, téléphone, rôle).
 *
 *   5. `upd_rdv_patient` autorise le titulaire à écrire TOUTES les colonnes
 *      de son rendez-vous. Il pouvait donc poser `statut = 'honore'`
 *      lui-même — exactement ce que la migration 0073 verrouillait côté
 *      avis, puisque `peut_noter_rdv` exige « honoré ». La qualification de
 *      présence (0075) et ses transitions ne tenaient que dans
 *      `qualifier_rdv`, qu'un UPDATE direct contournait.
 *
 * Rien ici ne change une seule règle MÉTIER : les écrans écrivent
 * aujourd'hui exactement ce qu'ils écriront demain. Les gardes refusent ce
 * que seule une requête forgée pouvait demander.
 *
 * Rejouable sans casse.
 */

/* =====================================================================
 * 1. Fonctions SECURITY DEFINER rendues au serveur
 *
 * Une fonction `security definer` traverse la RLS : la rendre exécutable
 * par `anon` revient à publier le pouvoir de son propriétaire. Celles-ci
 * ne sont appelées QUE par des déclencheurs et par d'autres fonctions
 * `security definer` (donc sous l'identité de `postgres`, qui garde son
 * droit) ou par les files côté serveur. Aucun écran ne les appelle : la
 * recherche de `.rpc("…")` dans app/, lib/ et components/ ne les cite pas.
 * ===================================================================== */

revoke execute on function public.creer_notification(uuid, text, text, text, text, text, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.email_destinataire(uuid)
  from public, anon, authenticated;
revoke execute on function public.programmer_rappels_rdv(uuid)
  from public, anon, authenticated;
revoke execute on function public.annuler_rappels_rdv(uuid)
  from public, anon, authenticated;
revoke execute on function public.recalculer_note_medecin(uuid)
  from public, anon, authenticated;
revoke execute on function public.titulaire_du_document(uuid)
  from public, anon, authenticated;
revoke execute on function public.titulaire_abonnement_medecin(uuid)
  from public, anon, authenticated;
revoke execute on function public.absence_couvre(uuid, date, time)
  from public, anon, authenticated;
revoke execute on function public.creneau_ouvert_medecin(uuid, date, time)
  from public, anon, authenticated;
revoke execute on function public.soins_depuis_tarifs(uuid)
  from public, anon, authenticated;
revoke execute on function public.moyen_paiement_ouvert(moyen_paiement)
  from public, anon, authenticated;
-- Fonction de déclencheur d'événement : elle n'a rien à faire dans l'API.
revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated;

/*
 * Les suivantes servent bien aux écrans, mais à des écrans de personnes
 * CONNECTÉES. `anon` n'en tirait rien d'utile et pouvait, pour la première,
 * polluer le journal d'audit avec un acteur nul.
 */
revoke execute on function public.ecrire_audit(text, text, uuid, jsonb) from public, anon;
grant execute on function public.ecrire_audit(text, text, uuid, jsonb) to authenticated;

revoke execute on function public.enregistrer_infos_medicales(uuid, uuid, uuid, text, text[], text, text)
  from public, anon;
grant execute on function public.enregistrer_infos_medicales(uuid, uuid, uuid, text, text[], text, text)
  to authenticated;

-- La formule d'un praticien (donc ce qu'il paie) n'est pas une donnée publique.
revoke execute on function public.formule_du_medecin(uuid) from public, anon;
grant execute on function public.formule_du_medecin(uuid) to authenticated;
revoke execute on function public.assistants_inclus_du_medecin(uuid) from public, anon;
grant execute on function public.assistants_inclus_du_medecin(uuid) to authenticated;
revoke execute on function public.assistants_utilises_du_medecin(uuid) from public, anon;
grant execute on function public.assistants_utilises_du_medecin(uuid) to authenticated;


/* =====================================================================
 * 2. L'adresse e-mail appartient à Supabase Auth
 *
 * Le chemin légitime ne change pas : `supabase.auth.updateUser({ email })`
 * écrit dans `auth.users`, et `trg_synchroniser_email` recopie ici. Ce
 * déclencheur-là tourne sous le rôle du service d'authentification, sans
 * jeton : `auth.uid()` y est nul. Le drapeau le dit tout de même, pour que
 * l'exemption soit explicite et non déduite.
 * ===================================================================== */

create or replace function public.synchroniser_email_utilisateur()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.email is distinct from old.email then
    -- Vrai en troisième argument : le drapeau ne vit que dans cette
    -- transaction, comme `app.ecriture_reservee` (0071).
    perform set_config('docteur224.synchro_email', '1', true);
    update utilisateurs set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.bloquer_email_utilisateur()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.email is not distinct from old.email then
    return new;
  end if;
  -- Contextes serveur : inscription, anonymisation d'un compte fermé,
  -- ouverture d'un compte assistant(e) ou administrateur.
  if auth.uid() is null then
    return new;
  end if;
  if coalesce(current_setting('docteur224.synchro_email', true), '') = '1' then
    return new;
  end if;
  raise exception
    'L''adresse e-mail est l''identifiant de connexion : elle se change depuis « Mon compte », qui demande confirmation à la nouvelle adresse.'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_bloquer_email_utilisateur on utilisateurs;
create trigger trg_bloquer_email_utilisateur
  before update of email on utilisateurs
  for each row execute function bloquer_email_utilisateur();


/* =====================================================================
 * 3. On ne se déclare pas praticien, ni établissement
 *
 * Les fiches professionnelles naissent à l'inscription, côté serveur
 * (/api/inscription, clé service_role) : aucun écran n'insère dans
 * `medecins` ni dans `etablissements`. Les policies d'insertion peuvent
 * donc exiger le rôle correspondant — et les colonnes réservées se
 * contrôler dès l'INSERT, pas seulement à l'UPDATE.
 * ===================================================================== */

/** Le rôle d'un compte, lisible sans dépendre de la RLS de `utilisateurs`. */
create or replace function public.role_du_compte(p_id uuid)
returns role_utilisateur
language sql
stable
security definer
set search_path to 'public'
as $$
  select role from utilisateurs where id = p_id;
$$;

revoke execute on function public.role_du_compte(uuid) from public, anon;
grant execute on function public.role_du_compte(uuid) to authenticated, service_role;

drop policy if exists ins_medecins_soi on medecins;
create policy ins_medecins_soi on medecins
  for insert
  with check (id = auth.uid() and role_courant() = 'medecin');

drop policy if exists ins_etablissements on etablissements;
create policy ins_etablissements on etablissements
  for insert
  with check (
    (gestionnaire_id = auth.uid() and role_courant() = 'etablissement')
    or a_une_permission_admin('validations', 'etablissements')
  );

/*
 * Une fiche créée depuis un navigateur part toujours « en attente », sans
 * note, sans mise en vedette et sans rattachement : ces colonnes-là sont
 * le résultat du travail de l'administration et des patients, jamais une
 * donnée d'entrée. On les RAMÈNE à leur valeur de départ plutôt que de
 * refuser l'insertion — un refus serait illisible pour un parcours
 * légitime qui, demain, créerait sa fiche depuis l'écran.
 */
create or replace function public.forcer_defauts_fiche_pro()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or est_admin() then
    return new;
  end if;

  new.statut := 'en_attente';

  if tg_table_name = 'medecins' then
    new.en_vedette := false;
    new.note_moyenne := 0;
    new.nb_avis := 0;
    -- Le rattachement se décide par invitation (voir 0071 pour l'UPDATE).
    new.etablissement_id := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_defauts_fiche_medecin on medecins;
create trigger trg_defauts_fiche_medecin
  before insert on medecins
  for each row execute function forcer_defauts_fiche_pro();

drop trigger if exists trg_defauts_fiche_etablissement on etablissements;
create trigger trg_defauts_fiche_etablissement
  before insert on etablissements
  for each row execute function forcer_defauts_fiche_pro();


/* =====================================================================
 * 4. Une équipe se compose entre un médecin et ses assistant(e)s
 *
 * `mod_assistants_medecin` se contentait de `medecin_id = auth.uid()`.
 * Deux conditions s'ajoutent : l'auteur du rattachement doit être un
 * compte MÉDECIN, et la personne rattachée un compte ASSISTANT(E).
 *
 * Le seul geste que les écrans portent sur cette table est la mise à jour
 * des permissions par le médecin titulaire (`majPermissionsAssistant`) ;
 * la création et la suppression passent par /api/medecin/assistants, en
 * service_role, qui n'est pas soumis à la RLS.
 * ===================================================================== */

drop policy if exists mod_assistants_medecin on assistants;
create policy mod_assistants_medecin on assistants
  for all
  using (
    (medecin_id = auth.uid() and role_courant() = 'medecin')
    or a_permission_admin('utilisateurs')
  )
  with check (
    (
      medecin_id = auth.uid()
      and role_courant() = 'medecin'
      and role_du_compte(id) = 'assistant'
    )
    or a_permission_admin('utilisateurs')
  );


/* =====================================================================
 * 5. La présence d'un rendez-vous ne s'écrit que par `qualifier_rdv`
 *
 * La migration 0075 a posé le cycle présent → honoré / non honoré et ses
 * transitions dans `qualifier_rdv` : elle seule vérifie que l'appelant est
 * le praticien (ou son secrétariat), que l'heure est passée, et elle seule
 * journalise. Mais `upd_rdv_patient` laisse le titulaire écrire toutes les
 * colonnes de SON rendez-vous : poser `statut = 'honore'` suffisait pour
 * s'ouvrir le droit de noter (`peut_noter_rdv`, 0073).
 *
 * Trois règles, et rien de plus :
 *   - présent / honoré / non honoré : par `qualifier_rdv`, jamais en direct ;
 *   - revenir sur une qualification déjà posée : au praticien, pas au patient ;
 *   - la confirmation : geste du praticien ou de son secrétariat.
 *
 * Les colonnes d'IDENTITÉ du rendez-vous (qui, chez qui, pour qui) sont
 * fixées à la réservation. Aucun écran ne les réécrit — on reprogramme une
 * date et une heure, on annule, on confirme. Les figer empêche de déplacer
 * un rendez-vous existant vers un autre praticien ou un autre bénéficiaire.
 * ===================================================================== */

create or replace function public.garde_rendez_vous()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_titulaire boolean;  -- le praticien lui-même, ou l'administration
  v_assistant boolean;  -- le secrétariat de ce praticien
  v_pro boolean;
begin
  -- Contextes serveur (clé de service) : fermeture de compte qui annule les
  -- rendez-vous à venir, drains, amorçage.
  if auth.uid() is null then
    return new;
  end if;

  v_titulaire := est_admin() or old.medecin_id = auth.uid();
  v_assistant := not v_titulaire
             and old.medecin_id is not distinct from medecin_de_assistant();
  v_pro := v_titulaire or v_assistant;

  /* -----
   * Permissions du secrétariat.
   *
   * `upd_rdv_assistant` ouvre la table à l'assistant(e) dès qu'il/elle
   * détient L'UNE des deux permissions ; les écrans, eux, distinguent bien
   * « confirmer / annuler » de « reprogrammer ». La base doit dire la même
   * chose : sans cela, la permission de déplacer un rendez-vous valait aussi
   * celle de l'annuler.
   * ----- */
  if v_assistant
     and (new.date, new.heure) is distinct from (old.date, old.heure)
     and not assistant_a_permission('peut_reprogrammer') then
    raise exception
      'La permission « Reprogrammer les rendez-vous » ne vous a pas été accordée.'
      using errcode = '42501';
  end if;

  if v_assistant
     and new.statut is distinct from old.statut
     and not assistant_a_permission('peut_confirmer_annuler') then
    raise exception
      'La permission « Confirmer / annuler les rendez-vous » ne vous a pas été accordée.'
      using errcode = '42501';
  end if;

  /* ----- Colonnes d'identité ----- */
  if (new.medecin_id, new.patient_id, new.proche_id, new.patient_sans_compte_id,
      new.reserve_par, new.reserve_par_role, new.source)
     is distinct from
     (old.medecin_id, old.patient_id, old.proche_id, old.patient_sans_compte_id,
      old.reserve_par, old.reserve_par_role, old.source)
  then
    raise exception
      'Le praticien et le bénéficiaire d''un rendez-vous ne se changent pas : annulez et reprenez un rendez-vous.'
      using errcode = '42501';
  end if;

  /* ----- Statut ----- */
  if new.statut is not distinct from old.statut then
    return new;
  end if;

  -- `qualifier_rdv` a déjà tranché qui agit et quelle transition est permise.
  if coalesce(current_setting('docteur224.qualification_rdv', true), '') = '1' then
    return new;
  end if;

  if new.statut in ('present', 'honore', 'absent') then
    raise exception
      'La présence se marque depuis l''agenda du praticien (présent, honoré, non honoré).'
      using errcode = '42501';
  end if;

  if old.statut in ('present', 'honore', 'absent') and not v_pro then
    raise exception
      'Ce rendez-vous a déjà été qualifié par le praticien : son statut ne se reprend pas ici.'
      using errcode = '42501';
  end if;

  if new.statut = 'confirme' and not v_pro then
    raise exception
      'La confirmation d''un rendez-vous revient au praticien ou à son secrétariat.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists rdv_garde_colonnes on rendez_vous;
create trigger rdv_garde_colonnes
  before update on rendez_vous
  for each row execute function garde_rendez_vous();

/*
 * `qualifier_rdv` repasse à l'identique, à une ligne près : le drapeau qui
 * dit au garde ci-dessus que la transition a déjà été examinée. Recopiée
 * en entier parce qu'une fonction ne se modifie pas par morceaux.
 */
create or replace function public.qualifier_rdv(
  p_rdv_id uuid,
  p_statut text,
  p_correction boolean default false,
  p_motif text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r rendez_vous;
  v_ancien statut_rdv;
  v_beneficiaire text;
  v_motif text := nullif(trim(coalesce(p_motif, '')), '');
begin
  if p_statut not in ('present', 'honore', 'absent') then
    raise exception 'Qualification inconnue : %', coalesce(p_statut, 'néant');
  end if;

  select * into r from rendez_vous where id = p_rdv_id for update;
  if not found then
    raise exception 'Rendez-vous introuvable.';
  end if;
  -- Le médecin, ou son assistant (le secrétariat). Personne d'autre.
  --
  -- Et l'assistant(e) seulement avec « Confirmer / annuler les rendez-vous » :
  -- la garde se contentait du rattachement, si bien qu'un secrétariat en
  -- lecture seule pouvait marquer les patients présents ou absents. Les
  -- écrans demandaient déjà cette permission (0080).
  if r.medecin_id <> auth.uid()
     and not (
       r.medecin_id is not distinct from medecin_de_assistant()
       and assistant_a_permission('peut_confirmer_annuler')
     ) then
    raise exception 'Ce rendez-vous n''est pas le vôtre.';
  end if;

  v_ancien := r.statut;

  -- Une annulation est un fait, pas une attente : elle ne se qualifie pas.
  -- Reprendre un rendez-vous annulé passe par une nouvelle réservation.
  if v_ancien = 'annule' then
    raise exception 'Un rendez-vous annulé ne se qualifie pas.';
  end if;

  -- « Honoré » et « absent » ne se posent qu'APRÈS l'heure : avant, les deux
  -- sont des suppositions. « Présent », lui, se pose à l'arrivée — le jour même.
  -- Guinée : la base tourne en UTC, qui est l'heure locale ; `localtimestamp`
  -- compare une date + une heure, sans fuseau.
  if p_statut in ('honore', 'absent') and (r.date + r.heure) > localtimestamp then
    raise exception 'Ce rendez-vous n''a pas encore eu lieu.';
  end if;

  -- Transitions contrôlées. La correction explicite (p_correction) lève la
  -- garde pour revenir sur une erreur — et elle seule. Hors correction, on ne
  -- repart pas d'un état déjà tranché ; seule la suite normale présent →
  -- honoré / absent reste ouverte.
  if not p_correction
     and v_ancien in ('present', 'honore', 'absent')
     and not (v_ancien = 'present' and p_statut in ('honore', 'absent')) then
    raise exception 'Transition non autorisée (% → %). Passez par la correction.',
      v_ancien, p_statut;
  end if;

  -- Statut inchangé : rien à écrire, et surtout aucune seconde notification.
  if v_ancien = p_statut::statut_rdv then
    return;
  end if;

  -- Le garde `rdv_garde_colonnes` (0080) refuse ces trois statuts en écriture
  -- directe : ce drapeau dit que la décision vient d'être prise ici.
  perform set_config('docteur224.qualification_rdv', '1', true);
  update rendez_vous set statut = p_statut::statut_rdv where id = r.id;
  perform set_config('docteur224.qualification_rdv', '0', true);

  select coalesce(
    (select u.prenom || ' ' || u.nom from utilisateurs u where u.id = r.patient_id),
    (select p.prenom || ' ' || p.nom from proches p where p.id = r.proche_id),
    (select s.prenom || ' ' || s.nom from patients_sans_compte s where s.id = r.patient_sans_compte_id),
    'Patient'
  ) into v_beneficiaire;

  perform ecrire_audit(
    case
      when p_correction then 'A corrigé le statut d''un rendez-vous'
      when p_statut = 'present' then 'A marqué un patient présent'
      when p_statut = 'honore' then 'A marqué un rendez-vous comme honoré'
      else 'A marqué un patient absent'
    end,
    'rendez_vous', r.id,
    jsonb_build_object(
      'cible', v_beneficiaire || ' · ' || r.date || ' ' || to_char(r.heure, 'HH24:MI'),
      'ancien', v_ancien,
      'nouveau', p_statut,
      'correction', p_correction,
      'motif', v_motif
    )
  );
end;
$$;
