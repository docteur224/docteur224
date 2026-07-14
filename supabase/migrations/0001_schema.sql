-- ============================================================
-- Docteur 224 — Étape 1 : schéma de la base de données
-- Basé sur la section C.11 de la spécification fonctionnelle.
-- Les comptes sont gérés par Supabase Auth (auth.users) ;
-- `utilisateurs` porte le profil applicatif (id = auth.users.id).
-- ============================================================

-- ---------- Types énumérés ----------
create type role_utilisateur as enum ('patient', 'medecin', 'assistant', 'etablissement', 'admin');
create type statut_compte as enum ('actif', 'en_attente', 'suspendu', 'supprime');
create type statut_validation as enum ('en_attente', 'valide', 'refuse');
create type statut_rdv as enum ('en_attente', 'confirme', 'annule', 'honore');
create type source_rdv as enum ('en_ligne', 'cabinet', 'telephone');
create type etat_creneau as enum ('ouvert', 'ferme', 'reserve');
create type type_document as enum ('diplome', 'carte_ordre', 'autorisation_exercice', 'identite');
create type formule_abonnement as enum ('standard', 'premium', 'cabinet', 'clinique', 'hopital');
create type periode_abonnement as enum ('mensuel', 'annuel');
create type statut_abonnement as enum ('essai', 'actif', 'expire', 'annule');
create type statut_moderation as enum ('en_attente', 'publie', 'rejete');
create type statut_signalement as enum ('nouveau', 'en_cours', 'traite', 'rejete');

-- ---------- Référentiels gérés par l'admin ----------
create table specialites (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  emoji text
);

create table villes (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique
);

create table assurances (
  id uuid primary key default gen_random_uuid(),
  libelle text not null unique
);

-- ---------- Utilisateurs et profils ----------
create table utilisateurs (
  id uuid primary key references auth.users (id) on delete cascade,
  role role_utilisateur not null,
  email text not null unique,
  telephone text, -- format +224XXXXXXXXX
  nom text,
  prenom text,
  statut statut_compte not null default 'actif',
  -- Sous-rôles admin (spec C.7.10) : ex. {finance, support, moderation}
  sous_roles_admin text[] not null default '{}',
  cree_le timestamptz not null default now()
);

create table patients (
  id uuid primary key references utilisateurs (id) on delete cascade,
  date_naissance date,
  genre text,
  ville_id uuid references villes (id),
  quartier text
);

create table proches (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  nom text not null,
  prenom text not null,
  lien text not null,
  date_naissance date,
  genre text,
  cree_le timestamptz not null default now()
);

create table etablissements (
  id uuid primary key default gen_random_uuid(),
  gestionnaire_id uuid references utilisateurs (id),
  nom text not null,
  type text not null, -- Clinique privée, Hôpital public, Centre de santé…
  description text,
  adresse text,
  ville_id uuid references villes (id),
  quartier text,
  telephone text,
  email text,
  horaires jsonb,          -- horaires d'ouverture par jour
  services text[] not null default '{}',
  statut statut_validation not null default 'en_attente',
  cree_le timestamptz not null default now()
);

create table medecins (
  id uuid primary key references utilisateurs (id) on delete cascade,
  civilite text not null default 'Dr', -- Dr / Pr
  specialite_id uuid references specialites (id),
  etablissement_id uuid references etablissements (id) on delete set null,
  ville_id uuid references villes (id),
  quartier text,
  tarif_consultation integer, -- GNF, payé sur place
  presentation text,          -- « À propos »
  soins_et_actes text[] not null default '{}',
  diplomes jsonb not null default '[]',  -- [{titre, lieu}]
  parcours jsonb not null default '[]',  -- [{lieu, duree}]
  langues text[] not null default '{}',
  annees_experience integer,
  telephone_secretariat text,
  localisation text,          -- URL Google Maps ou "lat,long"
  statut statut_validation not null default 'en_attente',
  note_moyenne numeric(3,2) not null default 0,
  nb_avis integer not null default 0
);

create table medecin_assurances (
  medecin_id uuid not null references medecins (id) on delete cascade,
  assurance_id uuid not null references assurances (id) on delete cascade,
  primary key (medecin_id, assurance_id)
);

create table assistants (
  id uuid primary key references utilisateurs (id) on delete cascade,
  medecin_id uuid not null references medecins (id) on delete cascade,
  -- Permissions accordées par le médecin (spec C.4.4).
  -- Aucune permission ne donne accès aux dossiers médicaux ni aux finances.
  peut_voir_agenda boolean not null default false,
  peut_confirmer_annuler boolean not null default false,
  peut_reprogrammer boolean not null default false,
  peut_creer_rdv boolean not null default false,
  peut_messagerie boolean not null default false,
  peut_gerer_creneaux boolean not null default false
);

-- ---------- Disponibilités ----------
create table horaires_types (
  id uuid primary key default gen_random_uuid(),
  medecin_id uuid not null references medecins (id) on delete cascade,
  jour_semaine smallint not null check (jour_semaine between 0 and 6), -- 0 = dimanche
  heure_debut time not null,
  heure_fin time not null,
  check (heure_debut < heure_fin)
);

create table creneaux_exceptions (
  id uuid primary key default gen_random_uuid(),
  medecin_id uuid not null references medecins (id) on delete cascade,
  date date not null,
  heure time not null,
  etat etat_creneau not null,
  unique (medecin_id, date, heure)
);

-- ---------- Rendez-vous ----------
create table rendez_vous (
  id uuid primary key default gen_random_uuid(),
  medecin_id uuid not null references medecins (id),
  etablissement_id uuid references etablissements (id),
  date date not null,
  heure time not null,
  -- Qui a effectué la réservation (patient lui-même, médecin, assistant, admin)
  reserve_par uuid not null references utilisateurs (id),
  reserve_par_role role_utilisateur not null,
  -- Pour qui : un patient OU un proche (jamais les deux)
  patient_id uuid references patients (id),
  proche_id uuid references proches (id),
  motif text,
  statut statut_rdv not null default 'en_attente',
  source source_rdv not null default 'en_ligne',
  cree_le timestamptz not null default now(),
  check (patient_id is not null or proche_id is not null)
);

-- ---------- Validation des professionnels ----------
create table documents_validation (
  id uuid primary key default gen_random_uuid(),
  professionnel_id uuid not null references utilisateurs (id) on delete cascade,
  type type_document not null,
  fichier_path text not null, -- chemin dans Supabase Storage (bucket privé)
  statut statut_validation not null default 'en_attente',
  decide_par uuid references utilisateurs (id),
  decide_le timestamptz,
  cree_le timestamptz not null default now()
);

-- ---------- Abonnements & tarifs ----------
create table abonnements (
  id uuid primary key default gen_random_uuid(),
  titulaire_id uuid not null references utilisateurs (id) on delete cascade,
  type_titulaire role_utilisateur not null check (type_titulaire in ('medecin', 'etablissement')),
  formule formule_abonnement not null,
  periode periode_abonnement not null,
  statut statut_abonnement not null default 'essai',
  date_debut date not null default current_date,
  date_fin date,
  quota_sms integer not null default 0
);

create table tarifs_plateforme (
  id uuid primary key default gen_random_uuid(),
  formule formule_abonnement not null unique,
  prix_mensuel integer not null, -- GNF
  prix_annuel integer not null,  -- GNF
  quota_sms integer not null default 0,
  essai_jours integer not null default 0,
  gratuit_jusqua date -- période gratuite de lancement
);

-- ---------- Avis, signalements, annonces, messages ----------
create table avis (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  medecin_id uuid not null references medecins (id) on delete cascade,
  rendez_vous_id uuid references rendez_vous (id),
  note smallint not null check (note between 1 and 5),
  commentaire text,
  statut statut_moderation not null default 'en_attente',
  cree_le timestamptz not null default now()
);

create table signalements (
  id uuid primary key default gen_random_uuid(),
  auteur_id uuid not null references utilisateurs (id),
  cible_type text not null, -- 'medecin' | 'avis' | 'etablissement'…
  cible_id uuid not null,
  motif text not null,
  statut statut_signalement not null default 'nouveau',
  decision text,
  cree_le timestamptz not null default now()
);

create table annonces (
  id uuid primary key default gen_random_uuid(),
  segment text not null, -- ex. 'patients', 'medecins', 'tous'
  canaux text[] not null default '{}', -- ex. {notification, sms, email}
  message text not null,
  date_envoi timestamptz,
  statut text not null default 'brouillon',
  cree_le timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id) on delete cascade,
  medecin_id uuid not null references medecins (id) on delete cascade,
  expediteur_id uuid not null references utilisateurs (id),
  contenu text not null,
  lu boolean not null default false,
  cree_le timestamptz not null default now()
);

-- ---------- Journal d'audit (lecture seule) ----------
create table journal_audit (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  acteur_id uuid references utilisateurs (id),
  cible_type text,
  cible_id uuid,
  details jsonb,
  cree_le timestamptz not null default now()
);

-- Écriture uniquement via cette fonction (SECURITY DEFINER), jamais en direct.
create or replace function ecrire_audit(
  p_action text,
  p_cible_type text default null,
  p_cible_id uuid default null,
  p_details jsonb default null
) returns void
language sql security definer set search_path = public as $$
  insert into journal_audit (action, acteur_id, cible_type, cible_id, details)
  values (p_action, auth.uid(), p_cible_type, p_cible_id, p_details);
$$;

-- ---------- Index utiles ----------
create index idx_rdv_medecin_date on rendez_vous (medecin_id, date);
create index idx_rdv_patient on rendez_vous (patient_id);
create index idx_creneaux_medecin_date on creneaux_exceptions (medecin_id, date);
create index idx_medecins_specialite on medecins (specialite_id);
create index idx_medecins_ville on medecins (ville_id);
create index idx_proches_patient on proches (patient_id);
create index idx_assistants_medecin on assistants (medecin_id);
create index idx_messages_patient_medecin on messages (patient_id, medecin_id);
