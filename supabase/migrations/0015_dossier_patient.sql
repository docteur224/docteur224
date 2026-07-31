-- ============================================================
-- Docteur 224 — Dossier patient et documents dans les deux sens
--
--   1. un document peut désormais être déposé PAR LE PATIENT
--      (résultat d'analyse, ancienne ordonnance) et pas seulement
--      par le médecin ;
--   2. le patient peut PARTAGER un de ses documents avec un autre
--      médecin, et révoquer ce partage ;
--   3. recherche paginée des patients d'un médecin, côté SQL :
--      la liste était reconstruite en ramenant tous les rendez-vous,
--      ce qui ne tient pas avec plusieurs centaines de patients.
-- ============================================================

-- ---------- 1. Origine et déposant ----------
create type origine_document as enum ('medecin', 'patient');

alter table documents_patient
  add column if not exists depose_par uuid references utilisateurs (id),
  add column if not exists origine origine_document not null default 'medecin';

-- Les lignes déjà en base viennent toutes du médecin.
update documents_patient set depose_par = medecin_id where depose_par is null;

alter table documents_patient alter column depose_par set not null;
-- `medecin_id` devient le médecin CONCERNÉ : auteur s'il a rédigé le
-- document, destinataire si c'est le patient qui l'envoie.
alter table documents_patient alter column medecin_id drop not null;

comment on column documents_patient.medecin_id is
  'Médecin concerné : auteur si origine=medecin, destinataire si origine=patient.';
comment on column documents_patient.depose_par is
  'Utilisateur qui a effectivement déposé le fichier (sert aux droits de modification).';

-- ---------- 2. Partage avec un autre médecin ----------
create table if not exists partages_document (
  document_id uuid not null references documents_patient (id) on delete cascade,
  medecin_id uuid not null references medecins (id) on delete cascade,
  partage_par uuid not null references utilisateurs (id),
  cree_le timestamptz not null default now(),
  primary key (document_id, medecin_id)
);

create index if not exists idx_partages_medecin on partages_document (medecin_id, cree_le desc);

alter table partages_document enable row level security;

-- Le patient est-il titulaire du document ? (fabrique commune aux policies)
create or replace function document_du_patient(p_document_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from documents_patient d
    where d.id = p_document_id
      and (d.patient_id = auth.uid()
           or d.proche_id in (select id from proches where patient_id = auth.uid()))
  );
$$;

-- Seul le patient décide qui voit son dossier : ni le médecin auteur, ni un
-- confrère déjà destinataire ne peuvent rediffuser un document.
create policy sel_partages on partages_document for select
  using (document_du_patient(document_id) or medecin_id = auth.uid() or est_admin());
create policy ins_partages on partages_document for insert
  with check (document_du_patient(document_id) and partage_par = auth.uid());
create policy del_partages on partages_document for delete
  using (document_du_patient(document_id));

-- ---------- 3. Droits des documents, refaits ----------
drop policy if exists sel_docs_destinataire on documents_patient;
drop policy if exists sel_docs_medecin on documents_patient;
drop policy if exists ins_docs_medecin on documents_patient;
drop policy if exists upd_docs_medecin on documents_patient;
drop policy if exists del_docs_medecin on documents_patient;

-- Lecture : le patient concerné, le médecin concerné, un médecin à qui le
-- patient a partagé le document, l'assistant du médecin concerné.
create policy sel_docs on documents_patient for select
  using (
    patient_id = auth.uid()
    or proche_du_patient(proche_id)
    or medecin_id = auth.uid()
    or medecin_id = medecin_de_assistant()
    or exists (
      select 1 from partages_document p
      where p.document_id = documents_patient.id and p.medecin_id = auth.uid()
    )
  );

-- Écriture : soit le médecin pour un patient qu'il suit, soit le patient
-- pour lui-même ou l'un de ses proches. Dans les deux cas `depose_par` doit
-- être l'appelant : sans ça, on pourrait déposer sous l'identité d'un autre.
create policy ins_docs_medecin on documents_patient for insert
  with check (
    origine = 'medecin'
    and depose_par = auth.uid()
    and medecin_id = auth.uid()
    and (
      medecin_a_rdv_avec_patient(auth.uid(), patient_id)
      or exists (
        select 1 from proches p
        where p.id = documents_patient.proche_id
          and medecin_a_rdv_avec_patient(auth.uid(), p.patient_id)
      )
    )
  );

create policy ins_docs_patient on documents_patient for insert
  with check (
    origine = 'patient'
    and depose_par = auth.uid()
    and (patient_id = auth.uid() or proche_du_patient(proche_id))
  );

-- Modification et retrait : le déposant seul. Un médecin ne réécrit pas le
-- document d'un patient, un patient ne réécrit pas une ordonnance.
create policy upd_docs on documents_patient for update
  using (depose_par = auth.uid()) with check (depose_par = auth.uid());
create policy del_docs on documents_patient for delete using (depose_par = auth.uid());

-- ---------- 4. Storage : lecture élargie aux destinataires et partages ----------
drop policy if exists "lecture_documents" on storage.objects;
drop policy if exists "depot_documents_medecin" on storage.objects;

-- Chacun dépose dans son propre dossier <uid>/… : c'est vrai du médecin
-- comme du patient, la règle ne change pas de forme.
create policy "depot_documents"
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
          and (
            d.patient_id = auth.uid()
            or proche_du_patient(d.proche_id)
            or d.medecin_id = auth.uid()
            or exists (
              select 1 from partages_document p
              where p.document_id = d.id and p.medecin_id = auth.uid()
            )
          )
      )
    )
  );

-- ---------- 5. Notifications ----------
-- Le trigger de 0014 prévenait toujours le patient. Il faut maintenant
-- prévenir celui qui n'a pas agi : le patient si le médecin dépose, le
-- médecin si le patient envoie.
create or replace function notifier_document() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  destinataire uuid;
begin
  if new.origine = 'medecin' then
    destinataire := coalesce(
      new.patient_id,
      (select p.patient_id from proches p where p.id = new.proche_id)
    );
    perform creer_notification(
      destinataire, 'document', 'Nouveau document',
      nom_medecin(new.medecin_id) || ' vous a remis : ' || new.titre,
      '/patient/documents'
    );
  else
    perform creer_notification(
      new.medecin_id, 'document', 'Document reçu d''un patient',
      'Un patient vous a transmis : ' || new.titre,
      '/espace-medecin/patients'
    );
  end if;
  return new;
end;
$$;

create or replace function notifier_partage() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  titre_doc text;
begin
  select titre into titre_doc from documents_patient where id = new.document_id;
  perform creer_notification(
    new.medecin_id, 'document', 'Document partagé avec vous',
    'Un patient a partagé : ' || coalesce(titre_doc, 'un document'),
    '/espace-medecin/patients'
  );
  return new;
end;
$$;

drop trigger if exists trg_notifier_partage on partages_document;
create trigger trg_notifier_partage
  after insert on partages_document
  for each row execute function notifier_partage();

-- ---------- 6. Recherche paginée des patients d'un médecin ----------
-- Reconstruire la liste en ramenant tous les rendez-vous côté client ne tient
-- pas au-delà de quelques dizaines de patients : le filtre, le tri, la
-- déduplication et la pagination se font ici.
--
-- `total` est répété sur chaque ligne : une seule requête suffit alors à
-- afficher la page et le nombre de résultats.
create or replace function patients_du_medecin(
  p_recherche text default '',
  p_limite int default 25,
  p_decalage int default 0
)
returns table (
  cle text,
  type_fiche text,
  nom text,
  prenom text,
  telephone text,
  date_naissance date,
  derniere_visite date,
  prochaine_visite date,
  nb_rdv bigint,
  total bigint
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_medecin uuid;
  v_q text := trim(coalesce(p_recherche, ''));
begin
  -- L'assistant voit les patients de son médecin, comme partout ailleurs.
  select case
    when exists (select 1 from medecins m where m.id = auth.uid()) then auth.uid()
    else medecin_de_assistant()
  end into v_medecin;

  if v_medecin is null then
    return;
  end if;

  return query
  with brut as (
    select
      'c-' || p.id                          as cle,
      'compte'                              as type_fiche,
      coalesce(u.nom, '')                   as nom,
      coalesce(u.prenom, '')                as prenom,
      coalesce(u.telephone, '')             as telephone,
      p.date_naissance                      as date_naissance,
      rv.date                               as jour
    from rendez_vous rv
    join patients p on p.id = rv.patient_id
    join utilisateurs u on u.id = p.id
    where rv.medecin_id = v_medecin

    union all

    select
      'p-' || pr.id, 'proche', pr.nom, pr.prenom, coalesce(u.telephone, ''),
      pr.date_naissance, rv.date
    from rendez_vous rv
    join proches pr on pr.id = rv.proche_id
    join utilisateurs u on u.id = pr.patient_id
    where rv.medecin_id = v_medecin

    union all

    select
      's-' || sc.id, 'sans_compte', sc.nom, sc.prenom, coalesce(sc.telephone, ''),
      null::date, rv.date
    from patients_sans_compte sc
    left join rendez_vous rv
      on rv.patient_sans_compte_id = sc.id and rv.medecin_id = v_medecin
    where sc.medecin_id = v_medecin
  ),
  groupe as (
    select
      b.cle, b.type_fiche, b.nom, b.prenom, b.telephone, b.date_naissance,
      max(b.jour) filter (where b.jour <= current_date)  as derniere_visite,
      min(b.jour) filter (where b.jour > current_date)   as prochaine_visite,
      count(b.jour)                                      as nb_rdv
    from brut b
    group by b.cle, b.type_fiche, b.nom, b.prenom, b.telephone, b.date_naissance
  ),
  filtre as (
    select g.* from groupe g
    where v_q = ''
       or g.nom ilike '%' || v_q || '%'
       or g.prenom ilike '%' || v_q || '%'
       or (g.prenom || ' ' || g.nom) ilike '%' || v_q || '%'
       or (g.nom || ' ' || g.prenom) ilike '%' || v_q || '%'
       -- Le téléphone se cherche en chiffres, quelle que soit la mise en forme.
       or (v_q ~ '[0-9]' and regexp_replace(g.telephone, '\D', '', 'g')
             like '%' || regexp_replace(v_q, '\D', '', 'g') || '%')
       -- Naissance : « 1990 », « 03/1990 » ou « 14/03/1990 » selon la saisie.
       or (g.date_naissance is not null
           and to_char(g.date_naissance, 'DD/MM/YYYY') like '%' || v_q || '%')
       or (g.date_naissance is not null and to_char(g.date_naissance, 'YYYY-MM-DD') like '%' || v_q || '%')
  )
  select
    f.cle, f.type_fiche, f.nom, f.prenom, f.telephone, f.date_naissance,
    f.derniere_visite, f.prochaine_visite, f.nb_rdv,
    (select count(*) from filtre) as total
  from filtre f
  order by f.nom, f.prenom
  limit greatest(p_limite, 1) offset greatest(p_decalage, 0);
end;
$$;

-- ---------- 7. Médecins déjà consultés par le patient ----------
-- Sert au sélecteur « à quel médecin envoyer ce document » : proposer les
-- praticiens qu'on a déjà vus est plus sûr et plus rapide qu'une recherche
-- libre dans tout l'annuaire.
create or replace function medecins_du_patient()
returns table (id uuid, nom text, specialite text, dernier_rdv date)
language sql stable security definer set search_path = public as $$
  select
    m.id,
    nom_medecin(m.id),
    coalesce(s.nom, ''),
    max(rv.date)
  from rendez_vous rv
  join medecins m on m.id = rv.medecin_id
  left join specialites s on s.id = m.specialite_id
  where rv.patient_id = auth.uid()
     or rv.proche_id in (select id from proches where patient_id = auth.uid())
  group by m.id, s.nom
  order by max(rv.date) desc;
$$;
