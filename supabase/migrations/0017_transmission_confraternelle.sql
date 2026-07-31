-- ============================================================
-- Docteur 224 — Adressage confraternel
--
-- Un médecin transmet le dossier d'un patient à un confrère : orientation
-- vers un spécialiste, demande d'avis, continuité des soins.
--
-- PARTI PRIS SUR LE CONSENTEMENT. Jusqu'ici, seul le patient partageait ses
-- documents (policy `ins_partages`). Une transmission entre praticiens entame
-- ce principe, et il fallait trancher :
--   * exiger l'accord préalable du patient bloquerait une orientation urgente
--     vers un spécialiste, ce qui n'a pas de sens en pratique médicale ;
--   * ne rien exiger du tout ferait circuler un dossier à son insu.
-- Le compromis retenu : la transmission part immédiatement, mais l'émetteur
-- ATTESTE le consentement (colonne `consentement_atteste`, obligatoire à
-- l'insertion — c'est une trace opposable, pas une case décorative), le
-- patient est notifié dans la seconde avec le détail complet, et il peut
-- révoquer l'accès à tout moment. L'émetteur le peut aussi.
--
-- Rien n'est jamais supprimé : une révocation change le statut. Un dossier
-- médical transmis doit rester traçable, y compris après retrait de l'accès.
-- ============================================================

create type statut_transmission as enum ('envoyee', 'lue', 'revoquee');
create type niveau_urgence as enum ('normale', 'prioritaire');

create table if not exists transmissions_dossier (
  id uuid primary key default gen_random_uuid(),
  medecin_emetteur uuid not null references medecins (id) on delete cascade,
  medecin_destinataire uuid not null references medecins (id) on delete cascade,
  -- Le patient concerné : titulaire OU proche, même règle que partout.
  patient_id uuid references patients (id) on delete cascade,
  proche_id uuid references proches (id) on delete cascade,
  motif text not null,
  -- Courrier confraternel libre (l'équivalent de la lettre d'adressage).
  note text,
  urgence niveau_urgence not null default 'normale',
  consentement_atteste boolean not null default false,
  statut statut_transmission not null default 'envoyee',
  lue_le timestamptz,
  revoquee_le timestamptz,
  revoquee_par uuid references utilisateurs (id),
  cree_le timestamptz not null default now(),
  constraint transmission_beneficiaire check (patient_id is not null or proche_id is not null),
  constraint transmission_confreres check (medecin_emetteur <> medecin_destinataire),
  constraint transmission_motif_non_vide check (length(trim(motif)) > 0)
);

create index if not exists idx_transmissions_destinataire
  on transmissions_dossier (medecin_destinataire, cree_le desc);
create index if not exists idx_transmissions_emetteur
  on transmissions_dossier (medecin_emetteur, cree_le desc);
create index if not exists idx_transmissions_patient
  on transmissions_dossier (patient_id, cree_le desc);

-- Pièces jointes à la transmission.
create table if not exists transmission_documents (
  transmission_id uuid not null references transmissions_dossier (id) on delete cascade,
  document_id uuid not null references documents_patient (id) on delete cascade,
  primary key (transmission_id, document_id)
);

create index if not exists idx_transmission_docs_document
  on transmission_documents (document_id);

-- ---------- Fabriques réutilisées par les policies ----------

-- Le patient connecté est-il le sujet de cette transmission ?
create or replace function transmission_me_concerne(p_transmission_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from transmissions_dossier t
    where t.id = p_transmission_id
      and (t.patient_id = auth.uid()
           or t.proche_id in (select id from proches where patient_id = auth.uid()))
  );
$$;

-- Le médecin connecté est-il partie prenante (émetteur ou destinataire) ?
create or replace function transmission_me_regarde(p_transmission_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from transmissions_dossier t
    where t.id = p_transmission_id
      and (t.medecin_emetteur = auth.uid() or t.medecin_destinataire = auth.uid())
  );
$$;

-- ---------- RLS : transmissions_dossier ----------
alter table transmissions_dossier enable row level security;

-- Lecture : les deux praticiens ET le patient concerné. La transparence du
-- patient sur ce qui circule à son sujet fait partie du dispositif.
create policy sel_transmissions on transmissions_dossier for select
  using (
    medecin_emetteur = auth.uid()
    or medecin_destinataire = auth.uid()
    or patient_id = auth.uid()
    or proche_du_patient(proche_id)
    or est_admin()
  );

-- Écriture : seul l'émetteur, pour un patient qu'il suit réellement, et
-- seulement en attestant le consentement. Le destinataire doit être un
-- praticien validé — on n'adresse pas un dossier à un compte en attente.
create policy ins_transmissions on transmissions_dossier for insert
  with check (
    medecin_emetteur = auth.uid()
    and consentement_atteste = true
    and exists (
      select 1 from medecins m
      where m.id = medecin_destinataire and m.statut = 'valide'
    )
    and (
      medecin_a_rdv_avec_patient(auth.uid(), patient_id)
      or exists (
        select 1 from proches p
        where p.id = transmissions_dossier.proche_id
          and medecin_a_rdv_avec_patient(auth.uid(), p.patient_id)
      )
    )
  );

-- Mise à jour : accusé de lecture (destinataire) et révocation (émetteur ou
-- patient). Le trigger ci-dessous verrouille ce que chacun peut changer.
create policy upd_transmissions on transmissions_dossier for update
  using (
    medecin_destinataire = auth.uid()
    or medecin_emetteur = auth.uid()
    or patient_id = auth.uid()
    or proche_du_patient(proche_id)
  );

-- Pas de policy DELETE : une transmission de dossier médical reste traçable.
create policy adm_transmissions on transmissions_dossier for all
  using (est_admin()) with check (est_admin());

-- ---------- RLS : transmission_documents ----------
alter table transmission_documents enable row level security;

create policy sel_transmission_docs on transmission_documents for select
  using (transmission_me_regarde(transmission_id) or transmission_me_concerne(transmission_id) or est_admin());

-- L'émetteur ne joint que des pièces qu'il a lui-même le droit de lire, et
-- seulement à SA transmission.
create policy ins_transmission_docs on transmission_documents for insert
  with check (
    exists (
      select 1 from transmissions_dossier t
      where t.id = transmission_id and t.medecin_emetteur = auth.uid()
    )
    and exists (
      select 1 from documents_patient d
      where d.id = document_id
        and (d.medecin_id = auth.uid()
             or exists (select 1 from partages_document p
                        where p.document_id = d.id and p.medecin_id = auth.uid()))
    )
  );

create policy adm_transmission_docs on transmission_documents for all
  using (est_admin()) with check (est_admin());

-- ---------- Garde-fou : qui peut changer quoi ----------
-- Sans ce trigger, la policy d'UPDATE laisserait le destinataire réécrire le
-- motif, ou le patient antidater une lecture.
create or replace function transmission_maj_gardee() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  est_destinataire boolean := old.medecin_destinataire = auth.uid();
  est_emetteur     boolean := old.medecin_emetteur = auth.uid();
  est_le_patient   boolean := old.patient_id = auth.uid() or proche_du_patient(old.proche_id);
begin
  if est_admin() then
    return new;
  end if;

  -- Rien d'autre que le statut et ses horodatages ne bouge, jamais.
  if new.medecin_emetteur is distinct from old.medecin_emetteur
     or new.medecin_destinataire is distinct from old.medecin_destinataire
     or new.patient_id is distinct from old.patient_id
     or new.proche_id is distinct from old.proche_id
     or new.motif is distinct from old.motif
     or new.note is distinct from old.note
     or new.urgence is distinct from old.urgence
     or new.consentement_atteste is distinct from old.consentement_atteste
     or new.cree_le is distinct from old.cree_le then
    raise exception 'Le contenu d''une transmission ne se modifie pas';
  end if;

  -- Une transmission révoquée est définitive.
  if old.statut = 'revoquee' then
    raise exception 'Cette transmission a été révoquée';
  end if;

  if new.statut = 'lue' then
    if not est_destinataire then
      raise exception 'Seul le destinataire accuse réception';
    end if;
    new.lue_le := coalesce(old.lue_le, now());
    new.revoquee_le := old.revoquee_le;
    new.revoquee_par := old.revoquee_par;
  elsif new.statut = 'revoquee' then
    if not (est_emetteur or est_le_patient) then
      raise exception 'Seuls l''émetteur et le patient peuvent révoquer';
    end if;
    new.revoquee_le := now();
    new.revoquee_par := auth.uid();
    new.lue_le := old.lue_le;
  else
    raise exception 'Changement de statut non autorisé';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_transmission_maj_gardee on transmissions_dossier;
create trigger trg_transmission_maj_gardee
  before update on transmissions_dossier
  for each row execute function transmission_maj_gardee();

-- ---------- Accès aux documents joints ----------
-- Le destinataire lit les pièces jointes tant que la transmission n'est pas
-- révoquée. C'est ce qui donne son effet à l'adressage.
create policy sel_docs_transmission on documents_patient for select
  using (
    exists (
      select 1 from transmission_documents td
      join transmissions_dossier t on t.id = td.transmission_id
      where td.document_id = documents_patient.id
        and t.medecin_destinataire = auth.uid()
        and t.statut <> 'revoquee'
    )
  );

-- Même extension côté Storage, sinon le fichier reste inaccessible.
drop policy if exists "lecture_documents" on storage.objects;
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
            or exists (
              select 1 from transmission_documents td
              join transmissions_dossier t on t.id = td.transmission_id
              where td.document_id = d.id
                and t.medecin_destinataire = auth.uid()
                and t.statut <> 'revoquee'
            )
          )
      )
    )
  );

-- ---------- Notifications ----------
create or replace function notifier_transmission() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  titulaire uuid;
  sujet text;
begin
  titulaire := coalesce(
    new.patient_id,
    (select p.patient_id from proches p where p.id = new.proche_id)
  );
  sujet := coalesce(
    (select trim(coalesce(pr.prenom, '') || ' ' || coalesce(pr.nom, ''))
     from proches pr where pr.id = new.proche_id),
    (select trim(coalesce(u.prenom, '') || ' ' || coalesce(u.nom, ''))
     from utilisateurs u where u.id = new.patient_id)
  );

  perform creer_notification(
    new.medecin_destinataire, 'transmission',
    case when new.urgence = 'prioritaire' then 'Dossier transmis — prioritaire'
         else 'Dossier transmis par un confrère' end,
    nom_medecin(new.medecin_emetteur) || ' vous adresse ' || coalesce(sujet, 'un patient')
      || ' : ' || new.motif,
    '/espace-medecin/correspondance'
  );

  -- Le patient est prévenu du mouvement de son dossier, sans exception.
  perform creer_notification(
    titulaire, 'transmission', 'Votre dossier a été transmis',
    nom_medecin(new.medecin_emetteur) || ' a transmis votre dossier à '
      || nom_medecin(new.medecin_destinataire) || ' : ' || new.motif,
    '/patient/documents'
  );
  return new;
end;
$$;

drop trigger if exists trg_notifier_transmission on transmissions_dossier;
create trigger trg_notifier_transmission
  after insert on transmissions_dossier
  for each row execute function notifier_transmission();

create or replace function notifier_revocation_transmission() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.statut = 'revoquee' and old.statut <> 'revoquee' then
    perform creer_notification(
      new.medecin_destinataire, 'transmission', 'Accès à un dossier retiré',
      'L''accès au dossier transmis pour « ' || new.motif || ' » a été retiré.',
      '/espace-medecin/correspondance'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notifier_revocation on transmissions_dossier;
create trigger trg_notifier_revocation
  after update on transmissions_dossier
  for each row execute function notifier_revocation_transmission();

-- ---------- Lectures ----------

-- Confrères adressables : praticiens validés, hors soi-même.
create or replace function rechercher_confreres(p_recherche text default '', p_limite int default 20)
returns table (id uuid, nom text, specialite text, etablissement text, ville text)
language sql stable security definer set search_path = public as $$
  select
    m.id,
    nom_medecin(m.id),
    coalesce(s.nom, ''),
    coalesce(e.nom, ''),
    coalesce(v.nom, '')
  from medecins m
  join utilisateurs u on u.id = m.id
  left join specialites s on s.id = m.specialite_id
  left join etablissements e on e.id = m.etablissement_id
  left join villes v on v.id = m.ville_id
  where m.statut = 'valide'
    and m.id <> auth.uid()
    and (
      coalesce(trim(p_recherche), '') = ''
      or u.nom ilike '%' || p_recherche || '%'
      or u.prenom ilike '%' || p_recherche || '%'
      or s.nom ilike '%' || p_recherche || '%'
      or e.nom ilike '%' || p_recherche || '%'
    )
  order by u.nom, u.prenom
  limit greatest(p_limite, 1);
$$;

-- Transmissions d'un médecin, dans un sens ou dans l'autre. Les pièces
-- jointes viennent en JSON pour éviter une seconde requête par ligne.
create or replace function transmissions_medecin(p_sens text default 'recues')
returns table (
  id uuid,
  sens text,
  confrere text,
  patient_nom text,
  pour_qui text,
  motif text,
  note text,
  urgence niveau_urgence,
  statut statut_transmission,
  cree_le timestamptz,
  lue_le timestamptz,
  revoquee_le timestamptz,
  documents jsonb
)
language sql stable security definer set search_path = public as $$
  select
    t.id,
    case when t.medecin_emetteur = auth.uid() then 'envoyee' else 'recue' end,
    case when t.medecin_emetteur = auth.uid()
         then nom_medecin(t.medecin_destinataire)
         else nom_medecin(t.medecin_emetteur) end,
    coalesce(
      (select trim(coalesce(u.prenom, '') || ' ' || coalesce(u.nom, ''))
       from patients p join utilisateurs u on u.id = p.id where p.id = t.patient_id),
      (select trim(coalesce(u.prenom, '') || ' ' || coalesce(u.nom, ''))
       from proches pr join patients p on p.id = pr.patient_id
       join utilisateurs u on u.id = p.id where pr.id = t.proche_id)
    ),
    case when t.proche_id is not null
         then (select trim(coalesce(pr.prenom, '') || ' ' || coalesce(pr.nom, ''))
               from proches pr where pr.id = t.proche_id)
         else 'Lui-même' end,
    t.motif, t.note, t.urgence, t.statut, t.cree_le, t.lue_le, t.revoquee_le,
    coalesce(
      (select jsonb_agg(jsonb_build_object(
         'id', d.id, 'titre', d.titre, 'type', d.type,
         'contenu', d.contenu, 'fichierPath', d.fichier_path,
         'fichierNom', d.fichier_nom, 'creeLe', d.cree_le,
         'redigePar', case when d.origine = 'medecin' then nom_medecin(d.medecin_id) else null end
       ) order by d.cree_le desc)
       from transmission_documents td
       join documents_patient d on d.id = td.document_id
       where td.transmission_id = t.id),
      '[]'::jsonb
    )
  from transmissions_dossier t
  where case
          when p_sens = 'envoyees' then t.medecin_emetteur = auth.uid()
          else t.medecin_destinataire = auth.uid()
        end
  order by t.cree_le desc;
$$;

-- Ce qui a circulé au sujet du patient connecté (ou de ses proches).
create or replace function transmissions_patient()
returns table (
  id uuid,
  emetteur text,
  destinataire text,
  pour_qui text,
  motif text,
  note text,
  urgence niveau_urgence,
  statut statut_transmission,
  cree_le timestamptz,
  lue_le timestamptz,
  revoquee_le timestamptz,
  nb_documents bigint
)
language sql stable security definer set search_path = public as $$
  select
    t.id,
    nom_medecin(t.medecin_emetteur),
    nom_medecin(t.medecin_destinataire),
    case when t.proche_id is not null
         then (select trim(coalesce(pr.prenom, '') || ' ' || coalesce(pr.nom, ''))
               from proches pr where pr.id = t.proche_id)
         else 'Moi-même' end,
    t.motif, t.note, t.urgence, t.statut, t.cree_le, t.lue_le, t.revoquee_le,
    (select count(*) from transmission_documents td where td.transmission_id = t.id)
  from transmissions_dossier t
  where t.patient_id = auth.uid()
     or t.proche_id in (select id from proches where patient_id = auth.uid())
  order by t.cree_le desc;
$$;
