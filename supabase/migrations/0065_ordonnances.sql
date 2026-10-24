-- ============================================================
-- Docteur 224 — Ordonnances et documents (fiche patient, étape 3)
--
--   1. BASE DE MÉDICAMENTS : un référentiel interrogeable (DCI, dosage,
--      forme, voie, classe), amorcé sur la Liste modèle OMS des médicaments
--      essentiels et tenu à jour par l'administration (écran + import /
--      export Excel). La CLASSE sert à l'alerte allergie : « allergique à la
--      pénicilline » doit alerter sur l'amoxicilline, qui ne s'écrit pas
--      pareil ;
--
--   2. MODÈLES D'ORDONNANCE : les prescriptions fréquentes d'un médecin,
--      à lui seul ;
--
--   3. SIGNATURE ÉLECTRONIQUE : le tracé du médecin, en vecteurs, apposé
--      sur les documents générés ;
--
--   4. VÉRIFICATION : chaque document généré porte un code unique, imprimé
--      avec un QR. Une page publique dit, à partir du seul code : valide,
--      annulé ou corrigé, la date et le médecin — rien sur le patient.
--      C'est ce qui rend la signature opposable : l'image seule ne prouve
--      rien, la vérification en ligne, si ;
--
--   5. ARRÊT DE TRAVAIL : nouveau type de document.
--
-- Migration additive, sauf `corriger_document`, recréée pour reconduire la
-- prescription et recevoir le code de la nouvelle version.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Type de document « arrêt de travail »
-- ------------------------------------------------------------
-- Posé seul et en tête : une valeur d'enum ajoutée ne s'utilise pas dans la
-- transaction qui l'ajoute — rien ci-dessous ne s'en sert.
alter type type_doc_patient add value if not exists 'arret_travail';

-- ------------------------------------------------------------
-- 1. Base de médicaments
-- ------------------------------------------------------------
create table if not exists medicaments (
  id uuid primary key default gen_random_uuid(),
  -- Dénomination commune internationale : ce qu'on prescrit, ce que le
  -- pharmacien délivre quelle que soit la marque en rayon.
  dci text not null check (length(trim(dci)) between 2 and 160),
  nom_commercial text check (nom_commercial is null or length(nom_commercial) <= 120),
  dosage text check (dosage is null or length(dosage) <= 60),
  forme text check (forme is null or length(forme) <= 60),
  voie text check (voie is null or length(voie) <= 40),
  -- Famille pharmacologique (« pénicillines », « AINS »…) : clé de l'alerte
  -- allergie. Texte libre, en minuscules, au pluriel.
  classe text check (classe is null or length(classe) <= 80),
  -- 'oms' pour l'amorçage, 'admin' pour une saisie ou un import.
  origine text not null default 'admin' check (origine in ('oms', 'admin')),
  -- Retiré plutôt que supprimé : une ordonnance passée peut le citer.
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  maj_par uuid references utilisateurs (id)
);

-- Un médicament = une DCI, un dosage, une forme. La casse ne fait pas un
-- second médicament.
create unique index if not exists idx_medicaments_unique
  on medicaments (lower(dci), lower(coalesce(dosage, '')), lower(coalesce(forme, '')));
create index if not exists idx_medicaments_recherche
  on medicaments (lower(dci)) where actif;

alter table medicaments enable row level security;

-- Lecture : tout compte connecté (le médecin prescrit, l'assistant prépare).
drop policy if exists sel_medicaments on medicaments;
create policy sel_medicaments on medicaments for select
  using (auth.uid() is not null);

-- Écriture : l'administration, avec la permission « Paramètres ».
drop policy if exists mod_medicaments on medicaments;
create policy mod_medicaments on medicaments for all
  using (a_permission_admin('parametres'))
  with check (a_permission_admin('parametres'));

-- `maj_le` et `maj_par` posés par la base, pas par l'écran.
create or replace function medicaments_horodatage() returns trigger
language plpgsql as $$
begin
  new.maj_le := now();
  new.maj_par := coalesce(auth.uid(), new.maj_par);
  new.dci := trim(new.dci);
  new.classe := nullif(lower(trim(coalesce(new.classe, ''))), '');
  return new;
end;
$$;
drop trigger if exists trg_medicaments_horodatage on medicaments;
create trigger trg_medicaments_horodatage
  before insert or update on medicaments
  for each row execute function medicaments_horodatage();

-- ------------------------------------------------------------
-- 2. Modèles d'ordonnance
-- ------------------------------------------------------------
create table if not exists modeles_ordonnance (
  id uuid primary key default gen_random_uuid(),
  medecin_id uuid not null references medecins (id) on delete cascade,
  nom text not null check (length(trim(nom)) between 1 and 80),
  -- [{ medicamentId, libelle, dci, classe, posologie, duree, quantite }]
  lignes jsonb not null default '[]'::jsonb check (jsonb_typeof(lignes) = 'array'),
  remarques text check (remarques is null or length(remarques) <= 2000),
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  constraint modeles_taille check (pg_column_size(lignes) < 60000)
);

create index if not exists idx_modeles_medecin on modeles_ordonnance (medecin_id, nom);

alter table modeles_ordonnance enable row level security;

drop policy if exists modeles_proprietaire on modeles_ordonnance;
create policy modeles_proprietaire on modeles_ordonnance for all
  using (medecin_id = auth.uid())
  with check (medecin_id = auth.uid());

-- ------------------------------------------------------------
-- 3. Signature électronique
-- ------------------------------------------------------------
/*
 * Le tracé tel que dessiné, en coordonnées relatives (0 à 1) dans un cadre
 * de proportion connue : [[[x, y], [x, y], …], …], un tableau par trait.
 * Des vecteurs plutôt qu'une image : le PDF les redessine nets à toute
 * échelle, sans décodeur d'image à embarquer.
 */
create table if not exists signatures_medecin (
  medecin_id uuid primary key references medecins (id) on delete cascade,
  traits jsonb not null check (jsonb_typeof(traits) = 'array' and jsonb_array_length(traits) between 1 and 200),
  -- Proportion du cadre de saisie (largeur / hauteur), pour ne pas déformer.
  ratio numeric(4, 2) not null default 3 check (ratio between 1 and 6),
  maj_le timestamptz not null default now(),
  constraint signature_taille check (pg_column_size(traits) < 120000)
);

alter table signatures_medecin enable row level security;

drop policy if exists signature_proprietaire on signatures_medecin;
create policy signature_proprietaire on signatures_medecin for all
  using (medecin_id = auth.uid())
  with check (medecin_id = auth.uid());

-- ------------------------------------------------------------
-- 4. Documents : prescription structurée et code de vérification
-- ------------------------------------------------------------
alter table documents_patient
  add column if not exists prescription jsonb
    check (prescription is null or jsonb_typeof(prescription) = 'array'),
  -- « D224-XXXX-XXXX-XXXX » : 12 caractères sur un alphabet de 32 sans
  -- lettres ambiguës (ni I, O, 0, 1) — 60 bits, impossible à deviner, et
  -- recopiable à la main depuis le papier.
  add column if not exists code_verification text;

do $$ begin
  alter table documents_patient add constraint docs_code_format
    check (code_verification is null or code_verification ~ '^D224-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$');
exception when duplicate_object then null;
end $$;
-- Seul un document remis par un praticien se vérifie : une pièce envoyée par
-- le patient n'a pas d'émetteur à certifier.
do $$ begin
  alter table documents_patient add constraint docs_code_medecin
    check (code_verification is null or origine = 'medecin');
exception when duplicate_object then null;
end $$;

create unique index if not exists idx_docs_code_verification
  on documents_patient (code_verification) where code_verification is not null;

/*
 * Vérification publique d'un document, à partir de son code.
 *
 * SECURITY DEFINER et ouverte à l'anonyme : c'est le pharmacien, l'employeur
 * ou l'école qui la consultent, sans compte. Elle ne rend RIEN du patient —
 * ni nom, ni contenu, ni motif d'annulation (qui peut être médical) : le
 * statut, le type, la date, le médecin et sa structure.
 *
 * Le code se normalise ici (majuscules, sans espaces, tirets remis) : il se
 * recopie à la main depuis le papier.
 */
create or replace function verifier_document(p_code text)
returns table (
  statut text,
  type text,
  emis_le timestamptz,
  version integer,
  medecin text,
  specialite text,
  etablissement text,
  change_le timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_brut text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_code text;
begin
  -- « D224ABCD… » ou « ABCD… » (le préfixe s'oublie en recopiant).
  if v_brut like 'D224%' then v_brut := substr(v_brut, 5); end if;
  if length(v_brut) <> 12 then
    return;
  end if;
  v_code := 'D224-' || substr(v_brut, 1, 4) || '-' || substr(v_brut, 5, 4) || '-' || substr(v_brut, 9, 4);

  return query
    select
      case when d.annule_le is not null then 'annule'
           when d.remplace_par_id is not null then 'corrige'
           else 'valide' end,
      d.type::text,
      d.cree_le,
      d.version,
      nom_medecin(d.medecin_id),
      (select s.nom from medecins m join specialites s on s.id = m.specialite_id where m.id = d.medecin_id),
      (select e.nom from medecins m join etablissements e on e.id = m.etablissement_id where m.id = d.medecin_id),
      coalesce(d.annule_le, (select r.cree_le from documents_patient r where r.id = d.remplace_par_id))
    from documents_patient d
    where d.code_verification = v_code
      and d.origine = 'medecin';
end;
$$;

revoke execute on function verifier_document(text) from public;
grant execute on function verifier_document(text) to anon, authenticated;

/*
 * Correction d'une pièce remise, recréée : la nouvelle version reprend la
 * prescription structurée et reçoit son PROPRE code de vérification — le
 * QR de la version précédente doit désormais répondre « corrigée ».
 *
 * L'ancienne signature est supprimée et non seulement remplacée : avec deux
 * paramètres de plus, `create or replace` créerait une SURCHARGE, et les
 * appels existants continueraient d'atteindre l'ancienne version.
 */
drop function if exists corriger_document(uuid, text, text, text, text);

create or replace function corriger_document(
  p_document_id uuid,
  p_titre text,
  p_contenu text default null,
  p_fichier_path text default null,
  p_fichier_nom text default null,
  p_prescription jsonb default null,
  p_code_verification text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  a documents_patient;
  v_nouveau uuid;
begin
  select * into a from documents_patient where id = p_document_id for update;
  if not found then
    raise exception 'Document introuvable.';
  end if;
  if a.depose_par <> auth.uid() then
    raise exception 'Seul l''auteur du document peut le corriger.';
  end if;
  if a.annule_le is not null then
    raise exception 'Ce document est annulé : il ne se corrige plus.';
  end if;
  if a.remplace_par_id is not null then
    raise exception 'Une version plus récente existe déjà.';
  end if;
  if nullif(trim(coalesce(p_titre, '')), '') is null then
    raise exception 'Donnez un titre au document.';
  end if;
  if nullif(trim(coalesce(p_contenu, '')), '') is null and p_fichier_path is null then
    raise exception 'Une version doit garder du texte ou un fichier.';
  end if;

  insert into documents_patient (
    patient_id, proche_id, medecin_id, rendez_vous_id, type, titre, contenu,
    fichier_path, fichier_nom, origine, depose_par, version, document_parent_id,
    prescription, code_verification
  ) values (
    a.patient_id, a.proche_id, a.medecin_id, a.rendez_vous_id, a.type,
    trim(p_titre), nullif(trim(coalesce(p_contenu, '')), ''),
    p_fichier_path, p_fichier_nom, a.origine, auth.uid(),
    a.version + 1, coalesce(a.document_parent_id, a.id),
    p_prescription, p_code_verification
  ) returning id into v_nouveau;

  update documents_patient set remplace_par_id = v_nouveau where id = a.id;

  perform ecrire_audit(
    'A corrigé un document remis à un patient',
    'documents_patient', v_nouveau,
    jsonb_build_object(
      'cible', a.titre || ' · v' || (a.version + 1),
      'version_precedente', a.id,
      'version', a.version + 1
    )
  );
  return v_nouveau;
end;
$$;

revoke execute on function corriger_document(uuid, text, text, text, text, jsonb, text) from public, anon;
grant execute on function corriger_document(uuid, text, text, text, text, jsonb, text) to authenticated;

-- ------------------------------------------------------------
-- 5. Amorçage : médicaments essentiels (Liste modèle OMS)
-- ------------------------------------------------------------
/*
 * Sélection des médicaments de ville les plus prescrits, d'après la Liste
 * modèle OMS des médicaments essentiels, dans les formes et dosages courants
 * en Afrique de l'Ouest. Point de départ, pas référence close : l'écran
 * d'administration et l'import Excel la complètent, et un médecin peut
 * toujours prescrire un produit absent de la liste.
 *
 * `on conflict do nothing` : rejouer la migration n'écrase pas une ligne
 * corrigée depuis par l'administration.
 */
insert into medicaments (dci, dosage, forme, voie, classe, origine) values
  -- Antalgiques, antipyrétiques
  ('Paracétamol', '500 mg', 'comprimé', 'orale', 'antalgiques', 'oms'),
  ('Paracétamol', '1 g', 'comprimé', 'orale', 'antalgiques', 'oms'),
  ('Paracétamol', '120 mg/5 ml', 'sirop', 'orale', 'antalgiques', 'oms'),
  ('Paracétamol', '250 mg', 'suppositoire', 'rectale', 'antalgiques', 'oms'),
  ('Paracétamol', '1 g/100 ml', 'solution injectable', 'intraveineuse', 'antalgiques', 'oms'),
  ('Tramadol', '50 mg', 'gélule', 'orale', 'opioïdes', 'oms'),
  ('Morphine', '10 mg', 'comprimé', 'orale', 'opioïdes', 'oms'),
  ('Morphine', '10 mg/ml', 'solution injectable', 'injectable', 'opioïdes', 'oms'),
  ('Codéine', '30 mg', 'comprimé', 'orale', 'opioïdes', 'oms'),
  -- Anti-inflammatoires non stéroïdiens
  ('Ibuprofène', '200 mg', 'comprimé', 'orale', 'ains', 'oms'),
  ('Ibuprofène', '400 mg', 'comprimé', 'orale', 'ains', 'oms'),
  ('Ibuprofène', '100 mg/5 ml', 'suspension buvable', 'orale', 'ains', 'oms'),
  ('Diclofénac', '50 mg', 'comprimé', 'orale', 'ains', 'oms'),
  ('Diclofénac', '75 mg/3 ml', 'solution injectable', 'intramusculaire', 'ains', 'oms'),
  ('Acide acétylsalicylique', '500 mg', 'comprimé', 'orale', 'ains', 'oms'),
  ('Acide acétylsalicylique', '100 mg', 'comprimé', 'orale', 'ains', 'oms'),
  ('Kétoprofène', '100 mg', 'comprimé', 'orale', 'ains', 'oms'),
  ('Indométacine', '25 mg', 'gélule', 'orale', 'ains', 'oms'),
  -- Pénicillines
  ('Amoxicilline', '250 mg', 'gélule', 'orale', 'pénicillines', 'oms'),
  ('Amoxicilline', '500 mg', 'gélule', 'orale', 'pénicillines', 'oms'),
  ('Amoxicilline', '1 g', 'comprimé', 'orale', 'pénicillines', 'oms'),
  ('Amoxicilline', '250 mg/5 ml', 'poudre pour suspension buvable', 'orale', 'pénicillines', 'oms'),
  ('Amoxicilline + acide clavulanique', '500 mg/62,5 mg', 'comprimé', 'orale', 'pénicillines', 'oms'),
  ('Amoxicilline + acide clavulanique', '1 g/125 mg', 'comprimé', 'orale', 'pénicillines', 'oms'),
  ('Amoxicilline + acide clavulanique', '100 mg/12,5 mg/ml', 'poudre pour suspension buvable', 'orale', 'pénicillines', 'oms'),
  ('Ampicilline', '1 g', 'poudre pour solution injectable', 'injectable', 'pénicillines', 'oms'),
  ('Benzylpénicilline', '1 MUI', 'poudre pour solution injectable', 'injectable', 'pénicillines', 'oms'),
  ('Benzathine benzylpénicilline', '2,4 MUI', 'poudre pour suspension injectable', 'intramusculaire', 'pénicillines', 'oms'),
  ('Phénoxyméthylpénicilline', '250 mg', 'comprimé', 'orale', 'pénicillines', 'oms'),
  ('Cloxacilline', '500 mg', 'gélule', 'orale', 'pénicillines', 'oms'),
  -- Céphalosporines
  ('Céfalexine', '500 mg', 'gélule', 'orale', 'céphalosporines', 'oms'),
  ('Céfalexine', '250 mg/5 ml', 'poudre pour suspension buvable', 'orale', 'céphalosporines', 'oms'),
  ('Céfixime', '200 mg', 'comprimé', 'orale', 'céphalosporines', 'oms'),
  ('Céfixime', '100 mg/5 ml', 'poudre pour suspension buvable', 'orale', 'céphalosporines', 'oms'),
  ('Céfuroxime', '500 mg', 'comprimé', 'orale', 'céphalosporines', 'oms'),
  ('Ceftriaxone', '1 g', 'poudre pour solution injectable', 'injectable', 'céphalosporines', 'oms'),
  ('Ceftriaxone', '250 mg', 'poudre pour solution injectable', 'injectable', 'céphalosporines', 'oms'),
  -- Macrolides
  ('Azithromycine', '250 mg', 'comprimé', 'orale', 'macrolides', 'oms'),
  ('Azithromycine', '500 mg', 'comprimé', 'orale', 'macrolides', 'oms'),
  ('Azithromycine', '200 mg/5 ml', 'poudre pour suspension buvable', 'orale', 'macrolides', 'oms'),
  ('Érythromycine', '500 mg', 'comprimé', 'orale', 'macrolides', 'oms'),
  ('Érythromycine', '125 mg/5 ml', 'poudre pour suspension buvable', 'orale', 'macrolides', 'oms'),
  ('Clarithromycine', '500 mg', 'comprimé', 'orale', 'macrolides', 'oms'),
  -- Fluoroquinolones
  ('Ciprofloxacine', '250 mg', 'comprimé', 'orale', 'fluoroquinolones', 'oms'),
  ('Ciprofloxacine', '500 mg', 'comprimé', 'orale', 'fluoroquinolones', 'oms'),
  ('Lévofloxacine', '500 mg', 'comprimé', 'orale', 'fluoroquinolones', 'oms'),
  ('Ofloxacine', '200 mg', 'comprimé', 'orale', 'fluoroquinolones', 'oms'),
  -- Sulfamides
  ('Sulfaméthoxazole + triméthoprime', '400 mg/80 mg', 'comprimé', 'orale', 'sulfamides', 'oms'),
  ('Sulfaméthoxazole + triméthoprime', '800 mg/160 mg', 'comprimé', 'orale', 'sulfamides', 'oms'),
  ('Sulfaméthoxazole + triméthoprime', '200 mg/40 mg/5 ml', 'suspension buvable', 'orale', 'sulfamides', 'oms'),
  ('Sulfadoxine + pyriméthamine', '500 mg/25 mg', 'comprimé', 'orale', 'sulfamides', 'oms'),
  -- Autres antibiotiques
  ('Doxycycline', '100 mg', 'comprimé', 'orale', 'tétracyclines', 'oms'),
  ('Gentamicine', '80 mg/2 ml', 'solution injectable', 'injectable', 'aminosides', 'oms'),
  ('Métronidazole', '250 mg', 'comprimé', 'orale', 'nitro-imidazolés', 'oms'),
  ('Métronidazole', '500 mg', 'comprimé', 'orale', 'nitro-imidazolés', 'oms'),
  ('Métronidazole', '125 mg/5 ml', 'suspension buvable', 'orale', 'nitro-imidazolés', 'oms'),
  ('Métronidazole', '500 mg/100 ml', 'solution injectable', 'intraveineuse', 'nitro-imidazolés', 'oms'),
  ('Tinidazole', '500 mg', 'comprimé', 'orale', 'nitro-imidazolés', 'oms'),
  ('Nitrofurantoïne', '100 mg', 'gélule', 'orale', 'nitrofuranes', 'oms'),
  ('Chloramphénicol', '0,5 %', 'collyre', 'ophtalmique', 'phénicolés', 'oms'),
  ('Tétracycline', '1 %', 'pommade ophtalmique', 'ophtalmique', 'tétracyclines', 'oms'),
  -- Antipaludiques
  ('Artéméther + luméfantrine', '20 mg/120 mg', 'comprimé', 'orale', 'antipaludiques', 'oms'),
  ('Artéméther + luméfantrine', '80 mg/480 mg', 'comprimé', 'orale', 'antipaludiques', 'oms'),
  ('Artésunate + amodiaquine', '100 mg/270 mg', 'comprimé', 'orale', 'antipaludiques', 'oms'),
  ('Artésunate', '60 mg', 'poudre pour solution injectable', 'injectable', 'antipaludiques', 'oms'),
  ('Artésunate', '100 mg', 'suppositoire', 'rectale', 'antipaludiques', 'oms'),
  ('Quinine', '300 mg', 'comprimé', 'orale', 'antipaludiques', 'oms'),
  ('Quinine', '600 mg/2 ml', 'solution injectable', 'injectable', 'antipaludiques', 'oms'),
  ('Dihydroartémisinine + pipéraquine', '40 mg/320 mg', 'comprimé', 'orale', 'antipaludiques', 'oms'),
  -- Antiparasitaires
  ('Albendazole', '400 mg', 'comprimé', 'orale', 'antiparasitaires', 'oms'),
  ('Mébendazole', '100 mg', 'comprimé', 'orale', 'antiparasitaires', 'oms'),
  ('Mébendazole', '500 mg', 'comprimé', 'orale', 'antiparasitaires', 'oms'),
  ('Praziquantel', '600 mg', 'comprimé', 'orale', 'antiparasitaires', 'oms'),
  ('Ivermectine', '3 mg', 'comprimé', 'orale', 'antiparasitaires', 'oms'),
  -- Antifongiques, antiviraux
  ('Fluconazole', '150 mg', 'gélule', 'orale', 'antifongiques', 'oms'),
  ('Fluconazole', '50 mg', 'gélule', 'orale', 'antifongiques', 'oms'),
  ('Nystatine', '100 000 UI/ml', 'suspension buvable', 'orale', 'antifongiques', 'oms'),
  ('Miconazole', '2 %', 'crème', 'cutanée', 'antifongiques', 'oms'),
  ('Clotrimazole', '500 mg', 'comprimé vaginal', 'vaginale', 'antifongiques', 'oms'),
  ('Griséofulvine', '500 mg', 'comprimé', 'orale', 'antifongiques', 'oms'),
  ('Aciclovir', '200 mg', 'comprimé', 'orale', 'antiviraux', 'oms'),
  ('Aciclovir', '5 %', 'crème', 'cutanée', 'antiviraux', 'oms'),
  -- Cardiovasculaire
  ('Amlodipine', '5 mg', 'comprimé', 'orale', 'inhibiteurs calciques', 'oms'),
  ('Amlodipine', '10 mg', 'comprimé', 'orale', 'inhibiteurs calciques', 'oms'),
  ('Nifédipine', '20 mg', 'comprimé à libération prolongée', 'orale', 'inhibiteurs calciques', 'oms'),
  ('Hydrochlorothiazide', '25 mg', 'comprimé', 'orale', 'diurétiques', 'oms'),
  ('Furosémide', '40 mg', 'comprimé', 'orale', 'diurétiques', 'oms'),
  ('Furosémide', '20 mg/2 ml', 'solution injectable', 'injectable', 'diurétiques', 'oms'),
  ('Spironolactone', '25 mg', 'comprimé', 'orale', 'diurétiques', 'oms'),
  ('Énalapril', '5 mg', 'comprimé', 'orale', 'iec', 'oms'),
  ('Énalapril', '20 mg', 'comprimé', 'orale', 'iec', 'oms'),
  ('Captopril', '25 mg', 'comprimé', 'orale', 'iec', 'oms'),
  ('Lisinopril', '10 mg', 'comprimé', 'orale', 'iec', 'oms'),
  ('Losartan', '50 mg', 'comprimé', 'orale', 'sartans', 'oms'),
  ('Aténolol', '50 mg', 'comprimé', 'orale', 'bêtabloquants', 'oms'),
  ('Bisoprolol', '5 mg', 'comprimé', 'orale', 'bêtabloquants', 'oms'),
  ('Propranolol', '40 mg', 'comprimé', 'orale', 'bêtabloquants', 'oms'),
  ('Méthyldopa', '250 mg', 'comprimé', 'orale', 'antihypertenseurs centraux', 'oms'),
  ('Atorvastatine', '20 mg', 'comprimé', 'orale', 'statines', 'oms'),
  ('Simvastatine', '20 mg', 'comprimé', 'orale', 'statines', 'oms'),
  ('Warfarine', '5 mg', 'comprimé', 'orale', 'anticoagulants', 'oms'),
  ('Digoxine', '0,25 mg', 'comprimé', 'orale', 'digitaliques', 'oms'),
  ('Isosorbide dinitrate', '5 mg', 'comprimé sublingual', 'sublinguale', 'dérivés nitrés', 'oms'),
  -- Diabète, endocrinologie
  ('Metformine', '500 mg', 'comprimé', 'orale', 'biguanides', 'oms'),
  ('Metformine', '850 mg', 'comprimé', 'orale', 'biguanides', 'oms'),
  ('Metformine', '1000 mg', 'comprimé', 'orale', 'biguanides', 'oms'),
  ('Glibenclamide', '5 mg', 'comprimé', 'orale', 'sulfamides hypoglycémiants', 'oms'),
  ('Gliclazide', '80 mg', 'comprimé', 'orale', 'sulfamides hypoglycémiants', 'oms'),
  ('Gliclazide', '30 mg', 'comprimé à libération modifiée', 'orale', 'sulfamides hypoglycémiants', 'oms'),
  ('Insuline humaine rapide', '100 UI/ml', 'solution injectable', 'sous-cutanée', 'insulines', 'oms'),
  ('Insuline humaine NPH', '100 UI/ml', 'suspension injectable', 'sous-cutanée', 'insulines', 'oms'),
  ('Lévothyroxine', '50 µg', 'comprimé', 'orale', 'hormones thyroïdiennes', 'oms'),
  ('Lévothyroxine', '100 µg', 'comprimé', 'orale', 'hormones thyroïdiennes', 'oms'),
  -- Respiratoire, allergie
  ('Salbutamol', '100 µg/dose', 'aérosol doseur', 'inhalée', 'bronchodilatateurs', 'oms'),
  ('Salbutamol', '2 mg/5 ml', 'sirop', 'orale', 'bronchodilatateurs', 'oms'),
  ('Béclométasone', '100 µg/dose', 'aérosol doseur', 'inhalée', 'corticoïdes', 'oms'),
  ('Cétirizine', '10 mg', 'comprimé', 'orale', 'antihistaminiques', 'oms'),
  ('Loratadine', '10 mg', 'comprimé', 'orale', 'antihistaminiques', 'oms'),
  ('Loratadine', '5 mg/5 ml', 'sirop', 'orale', 'antihistaminiques', 'oms'),
  ('Chlorphénamine', '4 mg', 'comprimé', 'orale', 'antihistaminiques', 'oms'),
  ('Prométhazine', '25 mg', 'comprimé', 'orale', 'antihistaminiques', 'oms'),
  ('Carbocistéine', '5 %', 'sirop', 'orale', 'mucolytiques', 'oms'),
  -- Corticoïdes
  ('Prednisolone', '5 mg', 'comprimé', 'orale', 'corticoïdes', 'oms'),
  ('Prednisolone', '20 mg', 'comprimé', 'orale', 'corticoïdes', 'oms'),
  ('Dexaméthasone', '4 mg/ml', 'solution injectable', 'injectable', 'corticoïdes', 'oms'),
  ('Hydrocortisone', '100 mg', 'poudre pour solution injectable', 'injectable', 'corticoïdes', 'oms'),
  ('Hydrocortisone', '1 %', 'crème', 'cutanée', 'corticoïdes', 'oms'),
  ('Bétaméthasone', '0,1 %', 'crème', 'cutanée', 'corticoïdes', 'oms'),
  -- Digestif
  ('Oméprazole', '20 mg', 'gélule', 'orale', 'ipp', 'oms'),
  ('Ésoméprazole', '40 mg', 'comprimé', 'orale', 'ipp', 'oms'),
  ('Hydroxyde d''aluminium + hydroxyde de magnésium', '400 mg/400 mg', 'comprimé à croquer', 'orale', 'antiacides', 'oms'),
  ('Métoclopramide', '10 mg', 'comprimé', 'orale', 'antiémétiques', 'oms'),
  ('Métoclopramide', '10 mg/2 ml', 'solution injectable', 'injectable', 'antiémétiques', 'oms'),
  ('Dompéridone', '10 mg', 'comprimé', 'orale', 'antiémétiques', 'oms'),
  ('Ondansétron', '4 mg', 'comprimé', 'orale', 'antiémétiques', 'oms'),
  ('Butylscopolamine', '10 mg', 'comprimé', 'orale', 'antispasmodiques', 'oms'),
  ('Phloroglucinol', '80 mg', 'comprimé', 'orale', 'antispasmodiques', 'oms'),
  ('Lopéramide', '2 mg', 'gélule', 'orale', 'antidiarrhéiques', 'oms'),
  ('Sels de réhydratation orale', '20,5 g', 'poudre pour solution buvable', 'orale', 'réhydratation', 'oms'),
  ('Zinc (sulfate)', '20 mg', 'comprimé dispersible', 'orale', 'minéraux', 'oms'),
  ('Lactulose', '10 g/15 ml', 'solution buvable', 'orale', 'laxatifs', 'oms'),
  ('Bisacodyl', '5 mg', 'comprimé', 'orale', 'laxatifs', 'oms'),
  -- Vitamines, minéraux, hématologie
  ('Fer + acide folique', '200 mg/0,4 mg', 'comprimé', 'orale', 'antianémiques', 'oms'),
  ('Sulfate ferreux', '200 mg', 'comprimé', 'orale', 'antianémiques', 'oms'),
  ('Acide folique', '5 mg', 'comprimé', 'orale', 'vitamines', 'oms'),
  ('Vitamine B complexe', null, 'comprimé', 'orale', 'vitamines', 'oms'),
  ('Vitamine C (acide ascorbique)', '500 mg', 'comprimé', 'orale', 'vitamines', 'oms'),
  ('Vitamine A (rétinol)', '200 000 UI', 'capsule', 'orale', 'vitamines', 'oms'),
  ('Calcium + vitamine D3', '500 mg/400 UI', 'comprimé', 'orale', 'minéraux', 'oms'),
  ('Magnésium + vitamine B6', '48 mg/5 mg', 'comprimé', 'orale', 'minéraux', 'oms'),
  -- Neurologie, psychiatrie
  ('Diazépam', '5 mg', 'comprimé', 'orale', 'benzodiazépines', 'oms'),
  ('Diazépam', '10 mg/2 ml', 'solution injectable', 'injectable', 'benzodiazépines', 'oms'),
  ('Carbamazépine', '200 mg', 'comprimé', 'orale', 'antiépileptiques', 'oms'),
  ('Phénobarbital', '100 mg', 'comprimé', 'orale', 'antiépileptiques', 'oms'),
  ('Valproate de sodium', '500 mg', 'comprimé', 'orale', 'antiépileptiques', 'oms'),
  ('Amitriptyline', '25 mg', 'comprimé', 'orale', 'antidépresseurs', 'oms'),
  ('Fluoxétine', '20 mg', 'gélule', 'orale', 'antidépresseurs', 'oms'),
  ('Halopéridol', '5 mg', 'comprimé', 'orale', 'antipsychotiques', 'oms'),
  -- Gynécologie, obstétrique
  ('Misoprostol', '200 µg', 'comprimé', 'orale', 'prostaglandines', 'oms'),
  ('Ocytocine', '10 UI/ml', 'solution injectable', 'injectable', 'ocytociques', 'oms'),
  ('Lévonorgestrel', '1,5 mg', 'comprimé', 'orale', 'contraceptifs', 'oms'),
  -- Peau, antiseptiques
  ('Povidone iodée', '10 %', 'solution', 'cutanée', 'antiseptiques iodés', 'oms'),
  ('Chlorhexidine', '0,05 %', 'solution', 'cutanée', 'antiseptiques', 'oms'),
  ('Acide fusidique', '2 %', 'crème', 'cutanée', 'antibiotiques locaux', 'oms'),
  ('Perméthrine', '5 %', 'crème', 'cutanée', 'antiparasitaires', 'oms'),
  ('Benzoate de benzyle', '25 %', 'émulsion', 'cutanée', 'antiparasitaires', 'oms'),
  ('Oxyde de zinc', '10 %', 'pommade', 'cutanée', 'protecteurs cutanés', 'oms')
on conflict do nothing;
