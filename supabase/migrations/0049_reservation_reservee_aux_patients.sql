-- ============================================================
-- Docteur 224 — La réservation en ligne est réservée aux patients
--
-- `rendez_vous.patient_id` référence `patients`, une table sous-type qui
-- n'a de ligne que pour les comptes de rôle `patient`. Un médecin, un
-- assistant ou un établissement connecté a bien une session et une ligne
-- dans `utilisateurs`, mais aucune dans `patients` : le parcours public
-- /reservation échouait donc sur la contrainte de clé étrangère, et le
-- message brut de Postgres remontait jusqu'à l'écran du praticien.
--
-- La clé étrangère disait déjà la bonne règle ; elle la disait mal, et
-- trop tard. On la double d'une vérification explicite, qui ferme au
-- passage un vrai trou : la policy `ins_rdv_patient` compare la COLONNE
-- `reserve_par_role` à 'patient', jamais le rôle réel du compte. N'importe
-- quel professionnel pouvait donc s'annoncer patient — seule la clé
-- étrangère l'arrêtait, et seulement pour un rendez-vous pris pour
-- soi-même. Réserver pour le proche d'un patient passait sans rien heurter.
--
-- Un professionnel qui veut se soigner ouvre un compte patient distinct,
-- comme dans la vraie vie. Pour poser un rendez-vous à son propre agenda,
-- il garde son écran « Nouveau rendez-vous ».
-- ============================================================

-- ---------- 1. Le rôle déclaré doit être le rôle réel ----------
/*
 * SECURITY DEFINER : la lecture de `utilisateurs` est cloisonnée par RLS,
 * et un patient ne lit pas la ligne d'un autre compte. Le trigger doit
 * pourtant relire celle de `reserve_par` — qui est toujours l'appelant,
 * puisque les policies d'insertion exigent `reserve_par = auth.uid()`.
 */
create or replace function trg_reserve_par_role_reel() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_role role_utilisateur;
begin
  select role into v_role from utilisateurs where id = new.reserve_par;
  if v_role is null then
    raise exception 'Compte introuvable — reconnectez-vous.';
  end if;
  if v_role <> new.reserve_par_role then
    -- Le seul cas qu'un utilisateur peut réellement provoquer, et le seul
    -- qui mérite une consigne plutôt qu'un constat.
    if new.reserve_par_role = 'patient' then
      raise exception 'La réservation en ligne est réservée aux comptes patients. Créez un compte patient pour prendre rendez-vous pour vous-même.';
    end if;
    raise exception 'Rôle de réservation incohérent avec le compte.';
  end if;
  return new;
end;
$$;

/*
 * `update of` et non `update` tout court : reprogrammer, confirmer ou
 * annuler ne touche ni au réservateur ni à son rôle, et n'a aucune raison
 * de repayer une lecture de `utilisateurs`.
 */
drop trigger if exists reserve_par_role_reel on rendez_vous;
create trigger reserve_par_role_reel
  before insert or update of reserve_par, reserve_par_role on rendez_vous
  for each row execute function trg_reserve_par_role_reel();

-- ---------- 2. Même règle pour les proches ----------
/*
 * `proches.patient_id` référence lui aussi `patients` : ajouter un proche
 * depuis l'écran de réservation cassait de la même façon, avec le même
 * message illisible. Le trigger s'exécute AVANT la clé étrangère, c'est
 * donc sa phrase que l'utilisateur voit.
 */
create or replace function trg_proche_titulaire_patient() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from patients where id = new.patient_id) then
    raise exception 'Seuls les comptes patients peuvent enregistrer des proches.';
  end if;
  return new;
end;
$$;

drop trigger if exists proche_titulaire_patient on proches;
create trigger proche_titulaire_patient
  before insert or update of patient_id on proches
  for each row execute function trg_proche_titulaire_patient();
