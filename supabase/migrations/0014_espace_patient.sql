-- ============================================================
-- Docteur 224 — Enrichissement de l'espace patient
--   1. favoris : médecins mis de côté par un patient
--   2. documents_patient : ordonnances et comptes rendus déposés
--      par le médecin, lisibles par le patient (+ bucket Storage privé)
--   3. synchronisation de utilisateurs.email quand l'adresse de
--      connexion change dans auth.users
-- ============================================================

-- ---------- 1. Médecins favoris ----------
create table if not exists favoris (
  patient_id uuid not null references patients (id) on delete cascade,
  medecin_id uuid not null references medecins (id) on delete cascade,
  cree_le timestamptz not null default now(),
  primary key (patient_id, medecin_id)
);

create index if not exists idx_favoris_patient on favoris (patient_id, cree_le desc);

alter table favoris enable row level security;

-- Strictement privé : personne d'autre que le patient, pas même le médecin
-- concerné — savoir qui vous a mis en favori n'est pas une information due.
create policy sel_favoris on favoris for select using (patient_id = auth.uid());
create policy ins_favoris on favoris for insert with check (patient_id = auth.uid());
create policy del_favoris on favoris for delete using (patient_id = auth.uid());

-- ---------- 2. Documents remis au patient ----------
create type type_doc_patient as enum ('ordonnance', 'compte_rendu', 'resultat', 'certificat', 'autre');

create table if not exists documents_patient (
  id uuid primary key default gen_random_uuid(),
  -- Le destinataire : un patient titulaire OU un proche (jamais les deux),
  -- même règle que rendez_vous.
  patient_id uuid references patients (id) on delete cascade,
  proche_id uuid references proches (id) on delete cascade,
  medecin_id uuid not null references medecins (id) on delete cascade,
  rendez_vous_id uuid references rendez_vous (id) on delete set null,
  type type_doc_patient not null default 'ordonnance',
  titre text not null,
  -- Un document est soit rédigé en clair, soit un fichier déposé dans le
  -- bucket privé `documents`, soit les deux (fichier + notes).
  contenu text,
  fichier_path text,
  fichier_nom text,
  cree_le timestamptz not null default now(),
  constraint doc_destinataire check (patient_id is not null or proche_id is not null),
  constraint doc_non_vide check (contenu is not null or fichier_path is not null)
);

create index if not exists idx_docs_patient on documents_patient (patient_id, cree_le desc);
create index if not exists idx_docs_proche on documents_patient (proche_id, cree_le desc);
create index if not exists idx_docs_medecin on documents_patient (medecin_id, cree_le desc);

alter table documents_patient enable row level security;

-- Le patient lit ce qui lui a été remis, à lui ou à un de ses proches.
create policy sel_docs_destinataire on documents_patient for select
  using (patient_id = auth.uid() or proche_du_patient(proche_id));

-- Le médecin lit et écrit ce qu'il a lui-même remis, et seulement à un
-- patient avec qui il a un rendez-vous : pas de dépôt à un inconnu.
create policy sel_docs_medecin on documents_patient for select
  using (medecin_id = auth.uid() or medecin_id = medecin_de_assistant());

create policy ins_docs_medecin on documents_patient for insert
  with check (
    medecin_id = auth.uid()
    and (
      medecin_a_rdv_avec_patient(auth.uid(), patient_id)
      or exists (
        select 1 from proches p
        where p.id = documents_patient.proche_id
          and medecin_a_rdv_avec_patient(auth.uid(), p.patient_id)
      )
    )
  );

create policy upd_docs_medecin on documents_patient for update
  using (medecin_id = auth.uid()) with check (medecin_id = auth.uid());

create policy del_docs_medecin on documents_patient for delete using (medecin_id = auth.uid());

create policy adm_docs on documents_patient for all using (est_admin()) with check (est_admin());

-- ---------- Bucket privé des documents ----------
-- Jamais public : une ordonnance ne doit pas vivre derrière une URL devinable.
-- Le médecin dépose dans <son_uid>/… ; le patient lit un objet uniquement si
-- une ligne de documents_patient qui le désigne lui est destinée.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "depot_documents_medecin"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "lecture_documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from documents_patient d
        where d.fichier_path = storage.objects.name
          and (d.patient_id = auth.uid() or proche_du_patient(d.proche_id))
      )
    )
  );

create policy "suppression_documents_medecin"
  on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Notification au patient quand un document est déposé ----------
create or replace function notifier_document() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  destinataire uuid;
begin
  destinataire := coalesce(
    new.patient_id,
    (select p.patient_id from proches p where p.id = new.proche_id)
  );
  perform creer_notification(
    destinataire,
    'document',
    'Nouveau document',
    nom_medecin(new.medecin_id) || ' vous a remis : ' || new.titre,
    '/patient/documents'
  );
  return new;
end;
$$;

create trigger trg_notifier_document
  after insert on documents_patient
  for each row execute function notifier_document();

-- ---------- 3. Synchronisation de l'adresse e-mail ----------
-- Le changement d'adresse passe par Supabase Auth (lien de confirmation) :
-- l'application n'est prévenue de rien. Sans ce trigger, utilisateurs.email
-- resterait sur l'ancienne adresse et l'écran Profil mentirait.
create or replace function synchroniser_email_utilisateur() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update utilisateurs set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_synchroniser_email on auth.users;
create trigger trg_synchroniser_email
  after update of email on auth.users
  for each row execute function synchroniser_email_utilisateur();
