-- ============================================================
-- Docteur 224 — Étape 2 : Row Level Security
-- Règles issues de la spec : cloisonnement C.4.4 (assistants),
-- C.7.10 (sous-rôles admin / finances), documents de validation
-- visibles uniquement par l'admin.
-- ============================================================

-- ---------- Correctif : patients sans compte (réservation au cabinet) ----------
create table patients_sans_compte (
  id uuid primary key default gen_random_uuid(),
  medecin_id uuid not null references medecins (id) on delete cascade,
  nom text not null,
  prenom text not null,
  telephone text,
  cree_le timestamptz not null default now()
);

alter table rendez_vous add column patient_sans_compte_id uuid references patients_sans_compte (id);
alter table rendez_vous drop constraint rendez_vous_check;
alter table rendez_vous add constraint rendez_vous_beneficiaire_check
  check (patient_id is not null or proche_id is not null or patient_sans_compte_id is not null);

-- ---------- Fonctions d'aide (SECURITY DEFINER pour éviter la récursion RLS) ----------
create or replace function role_courant() returns role_utilisateur
language sql stable security definer set search_path = public as $$
  select role from utilisateurs where id = auth.uid();
$$;

create or replace function est_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from utilisateurs where id = auth.uid() and role = 'admin');
$$;

-- Sous-rôle Finance (spec C.7.10) : seul un admin Finance lit les données financières.
create or replace function est_admin_finance() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from utilisateurs
    where id = auth.uid() and role = 'admin' and 'finance' = any (sous_roles_admin)
  );
$$;

-- Médecin auquel l'assistant connecté est rattaché (null sinon).
create or replace function medecin_de_assistant() returns uuid
language sql stable security definer set search_path = public as $$
  select medecin_id from assistants where id = auth.uid();
$$;

create or replace function assistant_a_permission(p_permission text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare ok boolean;
begin
  execute format('select %I from assistants where id = $1', p_permission)
    into ok using auth.uid();
  return coalesce(ok, false);
end;
$$;

-- Le patient connecté est-il titulaire de ce proche ?
create or replace function proche_du_patient(p_proche_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from proches where id = p_proche_id and patient_id = auth.uid());
$$;

-- Le médecin (ou l'assistant via son médecin) a-t-il un RDV avec ce patient ?
create or replace function medecin_a_rdv_avec_patient(p_medecin_id uuid, p_patient_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from rendez_vous rv
    where rv.medecin_id = p_medecin_id
      and (rv.patient_id = p_patient_id
           or rv.proche_id in (select id from proches where patient_id = p_patient_id))
  );
$$;

-- ---------- Garde-fou : interdiction de changer soi-même son rôle ----------
create or replace function bloquer_escalade_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.sous_roles_admin is distinct from old.sous_roles_admin)
     and not est_admin() then
    raise exception 'Modification du rôle interdite';
  end if;
  return new;
end;
$$;

create trigger trg_bloquer_escalade_role
  before update on utilisateurs
  for each row execute function bloquer_escalade_role();

-- ---------- Activation de RLS sur toutes les tables ----------
alter table specialites enable row level security;
alter table villes enable row level security;
alter table assurances enable row level security;
alter table utilisateurs enable row level security;
alter table patients enable row level security;
alter table patients_sans_compte enable row level security;
alter table proches enable row level security;
alter table etablissements enable row level security;
alter table medecins enable row level security;
alter table medecin_assurances enable row level security;
alter table assistants enable row level security;
alter table horaires_types enable row level security;
alter table creneaux_exceptions enable row level security;
alter table rendez_vous enable row level security;
alter table documents_validation enable row level security;
alter table abonnements enable row level security;
alter table tarifs_plateforme enable row level security;
alter table avis enable row level security;
alter table signalements enable row level security;
alter table annonces enable row level security;
alter table messages enable row level security;
alter table journal_audit enable row level security;

-- ---------- Référentiels : lecture publique, écriture admin ----------
create policy sel_specialites on specialites for select using (true);
create policy adm_specialites on specialites for all using (est_admin()) with check (est_admin());
create policy sel_villes on villes for select using (true);
create policy adm_villes on villes for all using (est_admin()) with check (est_admin());
create policy sel_assurances on assurances for select using (true);
create policy adm_assurances on assurances for all using (est_admin()) with check (est_admin());

-- ---------- utilisateurs ----------
-- Lecture : sa propre ligne ; fiches des médecins validés (nom public pour la recherche) ;
-- un médecin voit les patients avec qui il a un RDV ; un assistant idem via son médecin
-- (si permission agenda) ; l'admin voit tout.
create policy sel_utilisateurs_soi on utilisateurs for select using (id = auth.uid());
create policy sel_utilisateurs_medecins_publics on utilisateurs for select
  using (role = 'medecin' and exists (select 1 from medecins m where m.id = utilisateurs.id and m.statut = 'valide'));
create policy sel_utilisateurs_par_medecin on utilisateurs for select
  using (role = 'patient' and medecin_a_rdv_avec_patient(auth.uid(), id));
create policy sel_utilisateurs_par_assistant on utilisateurs for select
  using (role = 'patient' and assistant_a_permission('peut_voir_agenda')
         and medecin_a_rdv_avec_patient(medecin_de_assistant(), id));
create policy sel_utilisateurs_admin on utilisateurs for select using (est_admin());
-- Un médecin voit le profil de ses assistants ; un assistant voit son médecin.
create policy sel_utilisateurs_equipe on utilisateurs for select
  using (exists (select 1 from assistants a where a.id = utilisateurs.id and a.medecin_id = auth.uid())
         or id = medecin_de_assistant());
-- Écriture : création de sa propre ligne à l'inscription ; modification de sa ligne
-- (le trigger bloque tout changement de rôle) ; l'admin peut tout.
create policy ins_utilisateurs_soi on utilisateurs for insert with check (id = auth.uid());
create policy upd_utilisateurs_soi on utilisateurs for update using (id = auth.uid()) with check (id = auth.uid());
create policy adm_utilisateurs on utilisateurs for all using (est_admin()) with check (est_admin());

-- ---------- patients ----------
create policy sel_patients_soi on patients for select using (id = auth.uid());
create policy sel_patients_medecin on patients for select
  using (medecin_a_rdv_avec_patient(auth.uid(), id));
create policy sel_patients_assistant on patients for select
  using (assistant_a_permission('peut_voir_agenda')
         and medecin_a_rdv_avec_patient(medecin_de_assistant(), id));
create policy sel_patients_admin on patients for select using (est_admin());
create policy ins_patients_soi on patients for insert with check (id = auth.uid());
create policy upd_patients_soi on patients for update using (id = auth.uid()) with check (id = auth.uid());
create policy adm_patients on patients for all using (est_admin()) with check (est_admin());

-- ---------- patients_sans_compte (fiches créées au cabinet) ----------
create policy sel_psc on patients_sans_compte for select
  using (medecin_id = auth.uid()
         or (medecin_id = medecin_de_assistant() and assistant_a_permission('peut_voir_agenda'))
         or est_admin());
create policy ins_psc on patients_sans_compte for insert
  with check (medecin_id = auth.uid()
              or (medecin_id = medecin_de_assistant() and assistant_a_permission('peut_creer_rdv'))
              or est_admin());
create policy upd_psc on patients_sans_compte for update
  using (medecin_id = auth.uid() or est_admin());
create policy del_psc on patients_sans_compte for delete using (est_admin());

-- ---------- proches ----------
create policy sel_proches_titulaire on proches for select using (patient_id = auth.uid());
create policy sel_proches_medecin on proches for select
  using (exists (select 1 from rendez_vous rv where rv.proche_id = proches.id and rv.medecin_id = auth.uid()));
create policy sel_proches_assistant on proches for select
  using (assistant_a_permission('peut_voir_agenda')
         and exists (select 1 from rendez_vous rv where rv.proche_id = proches.id and rv.medecin_id = medecin_de_assistant()));
create policy sel_proches_admin on proches for select using (est_admin());
create policy ins_proches on proches for insert with check (patient_id = auth.uid());
create policy upd_proches on proches for update using (patient_id = auth.uid()) with check (patient_id = auth.uid());
create policy del_proches on proches for delete using (patient_id = auth.uid());

-- ---------- etablissements ----------
create policy sel_etablissements_public on etablissements for select using (statut = 'valide');
create policy sel_etablissements_gestionnaire on etablissements for select using (gestionnaire_id = auth.uid());
create policy sel_etablissements_admin on etablissements for select using (est_admin());
create policy ins_etablissements on etablissements for insert
  with check (gestionnaire_id = auth.uid() or est_admin());
create policy upd_etablissements on etablissements for update
  using (gestionnaire_id = auth.uid() or est_admin());
create policy del_etablissements on etablissements for delete using (est_admin());

-- ---------- medecins ----------
create policy sel_medecins_public on medecins for select using (statut = 'valide');
create policy sel_medecins_soi on medecins for select using (id = auth.uid());
create policy sel_medecins_assistant on medecins for select using (id = medecin_de_assistant());
create policy sel_medecins_gestionnaire on medecins for select
  using (exists (select 1 from etablissements e where e.id = medecins.etablissement_id and e.gestionnaire_id = auth.uid()));
create policy sel_medecins_admin on medecins for select using (est_admin());
create policy ins_medecins_soi on medecins for insert with check (id = auth.uid());
create policy upd_medecins_soi on medecins for update using (id = auth.uid()) with check (id = auth.uid());
create policy adm_medecins on medecins for all using (est_admin()) with check (est_admin());

-- ---------- medecin_assurances ----------
create policy sel_medecin_assurances on medecin_assurances for select using (true);
create policy mod_medecin_assurances on medecin_assurances for all
  using (medecin_id = auth.uid() or est_admin())
  with check (medecin_id = auth.uid() or est_admin());

-- ---------- assistants ----------
create policy sel_assistants on assistants for select
  using (id = auth.uid() or medecin_id = auth.uid() or est_admin());
create policy mod_assistants_medecin on assistants for all
  using (medecin_id = auth.uid() or est_admin())
  with check (medecin_id = auth.uid() or est_admin());

-- ---------- horaires_types / creneaux_exceptions ----------
-- Lecture publique : nécessaire pour afficher les disponibilités côté patient.
create policy sel_horaires_types on horaires_types for select using (true);
create policy mod_horaires_types on horaires_types for all
  using (medecin_id = auth.uid()
         or (medecin_id = medecin_de_assistant() and assistant_a_permission('peut_gerer_creneaux'))
         or est_admin())
  with check (medecin_id = auth.uid()
              or (medecin_id = medecin_de_assistant() and assistant_a_permission('peut_gerer_creneaux'))
              or est_admin());

create policy sel_creneaux_exceptions on creneaux_exceptions for select using (true);
create policy mod_creneaux_exceptions on creneaux_exceptions for all
  using (medecin_id = auth.uid()
         or (medecin_id = medecin_de_assistant() and assistant_a_permission('peut_gerer_creneaux'))
         or est_admin())
  with check (medecin_id = auth.uid()
              or (medecin_id = medecin_de_assistant() and assistant_a_permission('peut_gerer_creneaux'))
              or est_admin());

-- ---------- rendez_vous ----------
create policy sel_rdv_patient on rendez_vous for select
  using (patient_id = auth.uid() or proche_du_patient(proche_id) or reserve_par = auth.uid());
create policy sel_rdv_medecin on rendez_vous for select using (medecin_id = auth.uid());
create policy sel_rdv_assistant on rendez_vous for select
  using (medecin_id = medecin_de_assistant() and assistant_a_permission('peut_voir_agenda'));
create policy sel_rdv_admin on rendez_vous for select using (est_admin());

create policy ins_rdv_patient on rendez_vous for insert
  with check (reserve_par = auth.uid() and reserve_par_role = 'patient'
              and (patient_id = auth.uid() or proche_du_patient(proche_id)));
create policy ins_rdv_medecin on rendez_vous for insert
  with check (reserve_par = auth.uid() and reserve_par_role = 'medecin' and medecin_id = auth.uid());
create policy ins_rdv_assistant on rendez_vous for insert
  with check (reserve_par = auth.uid() and reserve_par_role = 'assistant'
              and medecin_id = medecin_de_assistant() and assistant_a_permission('peut_creer_rdv'));
create policy ins_rdv_admin on rendez_vous for insert with check (est_admin());

-- Modification : le patient peut annuler son RDV ; le médecin gère les siens ;
-- l'assistant selon ses permissions confirmer/annuler ou reprogrammer.
create policy upd_rdv_patient on rendez_vous for update
  using (patient_id = auth.uid() or proche_du_patient(proche_id));
create policy upd_rdv_medecin on rendez_vous for update using (medecin_id = auth.uid());
create policy upd_rdv_assistant on rendez_vous for update
  using (medecin_id = medecin_de_assistant()
         and (assistant_a_permission('peut_confirmer_annuler') or assistant_a_permission('peut_reprogrammer')));
create policy upd_rdv_admin on rendez_vous for update using (est_admin());
create policy del_rdv_admin on rendez_vous for delete using (est_admin());

-- ---------- documents_validation ----------
-- Lecture : l'admin, et le professionnel pour SES propres documents uniquement.
-- Jamais les patients, jamais un autre médecin (spec).
create policy sel_docs_admin on documents_validation for select using (est_admin());
create policy sel_docs_proprietaire on documents_validation for select using (professionnel_id = auth.uid());
create policy ins_docs_proprietaire on documents_validation for insert with check (professionnel_id = auth.uid());
create policy upd_docs_admin on documents_validation for update using (est_admin());
create policy del_docs_admin on documents_validation for delete using (est_admin());

-- ---------- abonnements (données financières — C.7.10) ----------
-- Interdit aux assistants ; lecture admin réservée au sous-rôle Finance.
create policy sel_abonnements_titulaire on abonnements for select using (titulaire_id = auth.uid());
create policy sel_abonnements_admin_finance on abonnements for select using (est_admin_finance());
create policy ins_abonnements on abonnements for insert
  with check (titulaire_id = auth.uid() or est_admin_finance());
create policy upd_abonnements on abonnements for update
  using (titulaire_id = auth.uid() or est_admin_finance());
create policy del_abonnements on abonnements for delete using (est_admin_finance());

-- ---------- tarifs_plateforme ----------
create policy sel_tarifs on tarifs_plateforme for select using (true);
create policy mod_tarifs on tarifs_plateforme for all
  using (est_admin_finance()) with check (est_admin_finance());

-- ---------- avis ----------
create policy sel_avis_publies on avis for select using (statut = 'publie');
create policy sel_avis_auteur on avis for select using (patient_id = auth.uid());
create policy sel_avis_admin on avis for select using (est_admin());
create policy ins_avis on avis for insert with check (patient_id = auth.uid());
create policy upd_avis_admin on avis for update using (est_admin());
create policy del_avis on avis for delete using (patient_id = auth.uid() or est_admin());

-- ---------- signalements ----------
create policy sel_signalements on signalements for select using (auteur_id = auth.uid() or est_admin());
create policy ins_signalements on signalements for insert with check (auteur_id = auth.uid());
create policy upd_signalements on signalements for update using (est_admin());
create policy del_signalements on signalements for delete using (est_admin());

-- ---------- annonces ----------
create policy sel_annonces_envoyees on annonces for select
  using (statut = 'envoyee' and auth.uid() is not null);
create policy adm_annonces on annonces for all using (est_admin()) with check (est_admin());

-- ---------- messages (conversation patient ↔ cabinet — l'admin n'y a pas accès) ----------
create policy sel_messages on messages for select
  using (patient_id = auth.uid() or medecin_id = auth.uid()
         or (medecin_id = medecin_de_assistant() and assistant_a_permission('peut_messagerie')));
create policy ins_messages on messages for insert
  with check (expediteur_id = auth.uid()
              and (patient_id = auth.uid() or medecin_id = auth.uid()
                   or (medecin_id = medecin_de_assistant() and assistant_a_permission('peut_messagerie'))));
create policy upd_messages_lu on messages for update
  using (patient_id = auth.uid() or medecin_id = auth.uid()
         or (medecin_id = medecin_de_assistant() and assistant_a_permission('peut_messagerie')));

-- ---------- journal_audit ----------
-- INSERT uniquement via la fonction ecrire_audit() (SECURITY DEFINER).
-- Aucune policy INSERT/UPDATE/DELETE : table inviolable depuis le frontend.
create policy sel_audit_admin on journal_audit for select using (est_admin());
