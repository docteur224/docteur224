-- ============================================================
-- 0068 — Ordonnances de biologie (et le référentiel d'actes)
--
-- Une ordonnance n'est pas toujours une ordonnance de médicaments. Le
-- praticien prescrit aussi des ANALYSES (biologie) et des EXAMENS
-- D'IMAGERIE — des actes qu'il ne réalise pas lui-même et qui partent au
-- laboratoire ou au centre d'imagerie.
--
-- Ce qui se réutilise de l'ordonnance médicale (0065), tel quel : le PDF à
-- l'en-tête du praticien, la signature électronique, le code et le QR de
-- vérification, le versionnage et l'annulation. Rien de tout cela n'est
-- touché ici.
--
-- Ce qui NE se réutilise pas : posologie, durée, quantité et alerte
-- allergie n'ont de sens que pour un médicament. Une ligne d'analyse, c'est
-- l'acte, et rien d'autre ; le contexte clinique se dit une fois, pour
-- l'ordonnance entière.
--
--   1. ACTES PRESCRIPTIBLES : un référentiel unique pour la biologie ET
--      l'imagerie, distinguées par leur `domaine`. Deux domaines dans une
--      table plutôt que deux tables : la forme d'une ligne est la même, et
--      l'écran d'administration, l'import et l'export le sont aussi ;
--
--   2. MODÈLES : « bilan préopératoire », « bilan hépatique » sont des
--      modèles au même titre que « angine de l'adulte ». Les modèles
--      existants reçoivent un domaine, sans quoi un modèle de biologie
--      remonterait dans l'ordonnance médicale ;
--
--   3. OPTIONS DE PRESCRIPTION : « à jeun », « urgent ». Elles portent sur
--      l'ordonnance entière et doivent SURVIVRE à une correction — d'où une
--      colonne, et non une relecture du texte imprimé.
--
-- Migration additive, SAUF `corriger_document`, recréée pour reconduire les
-- options de prescription dans la version suivante. Aucune colonne,
-- contrainte ni index existants ne sont modifiés ni supprimés ; seul le
-- COMMENTAIRE de `modeles_ordonnance.lignes` est réécrit, pour décrire les
-- deux formes de ligne que cette colonne accueille désormais.
--
-- L'IMAGERIE est amorcée ici (référentiel et actes), mais son type de
-- document n'existe pas encore : elle reste invisible des médecins jusqu'à
-- la migration qui l'ouvrira. Semer maintenant évite un second import.
--
-- ------------------------------------------------------------
-- ⚠ APPLICATION À LA MAIN (éditeur SQL) : EN DEUX FOIS
-- ------------------------------------------------------------
-- La section 0 ci-dessous doit être exécutée SEULE, sans rien autour.
-- `ALTER TYPE … ADD VALUE` ne supporte pas d'être encadré par un
-- BEGIN/ROLLBACK : l'éditeur refuse le script entier avec un « syntax error
-- at or near "alter" ». Donc :
--
--   1. exécuter la SECTION 0 seule (une ligne, idempotente) ;
--   2. exécuter TOUT LE RESTE, à partir de la section 1 — celui-là accepte
--      sans problème un essai à blanc entre BEGIN; et ROLLBACK;.
--
-- Une valeur d'enum ajoutée ne se retire pas : l'étape 1 est définitive.
-- Elle est sans effet tant que personne ne l'emploie.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Type de document « ordonnance de biologie »
-- ------------------------------------------------------------
-- Posé seul et en tête : une valeur d'enum ajoutée ne s'utilise pas dans la
-- transaction qui l'ajoute (même raison qu'en 0065 pour 'arret_travail').
-- RIEN, plus bas, ne s'en sert — c'est volontaire, et à vérifier avant
-- d'ajouter quoi que ce soit à cette migration.
alter type type_doc_patient add value if not exists 'ordonnance_biologie';

-- ------------------------------------------------------------
-- 1. Normalisation pour la recherche
-- ------------------------------------------------------------
/*
 * Même translittération que `normaliser_libelle_tarif` (0027), mais fonction
 * distincte À DESSEIN : celle-là dédoublonne des libellés de tarifs, celle-ci
 * prépare une recherche plein texte. Les deux doivent pouvoir diverger sans
 * que l'une casse l'autre.
 *
 * `translate` plutôt que l'extension `unaccent`, absente du projet.
 *
 * Les ligatures passent par `replace` AVANT : `translate` associe un
 * caractère à UN caractère et ne sait pas rendre « œ » par « oe ». Sans ce
 * passage, « Œstradiol » resterait « œstradiol » dans l'index et ne se
 * trouverait jamais en tapant « oestradiol » — le cas se présente dès
 * l'amorçage (œstradiol, transit œso-gastro-duodénal).
 */
create or replace function normaliser_recherche(p_texte text)
returns text
language sql immutable set search_path = public as $$
  select translate(
    replace(replace(lower(btrim(coalesce(p_texte, ''))), 'œ', 'oe'), 'æ', 'ae'),
    'àáâãäçèéêëìíîïñòóôõöùúûüýÿ',
    'aaaaaceeeeiiiinooooouuuuyy'
  );
$$;

-- ------------------------------------------------------------
-- 2. Référentiel des actes prescriptibles
-- ------------------------------------------------------------
create table if not exists actes_prescriptibles (
  id uuid primary key default gen_random_uuid(),
  -- Ce qui sépare une analyse d'un examen d'imagerie. Le reste est commun.
  domaine text not null check (domaine in ('biologie', 'imagerie')),
  -- Ce qui s'imprime et ce que le laboratoire lit : « NFS (hémogramme) ».
  libelle text not null check (length(trim(libelle)) between 2 and 160),
  /*
   * Noms sous lesquels le médecin cherchera l'acte sans l'écrire comme le
   * référentiel l'écrit : « hémogramme » pour la NFS, « TGO » pour les ASAT,
   * « écho » pour échographie. Sans eux, la recherche oblige à connaître
   * l'intitulé exact — et le médecin saisit alors hors base.
   */
  synonymes text[] not null default '{}',
  -- Nomenclature locale, s'il y en a une. Laissée vide à l'amorçage : il n'y
  -- a pas de codification nationale sur laquelle s'aligner.
  code text check (code is null or length(code) <= 40),
  -- « hématologie », « biochimie », « échographie »… en minuscules. Sert à
  -- grouper l'écran d'administration et la liste de choix.
  categorie text check (categorie is null or length(categorie) <= 80),
  -- Rempli par trigger : libellé + code + synonymes, sans accents ni casse.
  recherche text not null default '',
  -- 'oms' pour l'amorçage, 'admin' pour une saisie ou un import.
  origine text not null default 'admin' check (origine in ('oms', 'admin')),
  -- Retiré plutôt que supprimé : une ordonnance passée peut le citer.
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  maj_par uuid references utilisateurs (id)
);

comment on table actes_prescriptibles is
  'Analyses de biologie et examens d''imagerie prescriptibles. Référentiel '
  'global tenu par l''administration — à ne pas confondre avec '
  '`tarifs_medecin`, qui liste ce qu''un praticien RÉALISE et facture.';

-- Un acte = un domaine + un libellé. La casse ne fait pas un second acte.
create unique index if not exists idx_actes_unique
  on actes_prescriptibles (domaine, lower(libelle));

-- La recherche filtre d'abord sur le domaine ; le `ilike` qui suit balaie
-- quelques dizaines de lignes, ce qu'aucun index ne rendrait plus rapide.
create index if not exists idx_actes_domaine
  on actes_prescriptibles (domaine, categorie) where actif;

alter table actes_prescriptibles enable row level security;

-- Lecture : tout compte connecté (le médecin prescrit, l'assistant prépare).
drop policy if exists sel_actes on actes_prescriptibles;
create policy sel_actes on actes_prescriptibles for select
  using (auth.uid() is not null);

-- Écriture : l'administration, avec la permission « Paramètres ». Même
-- règle que la base de médicaments.
drop policy if exists mod_actes on actes_prescriptibles;
create policy mod_actes on actes_prescriptibles for all
  using (a_permission_admin('parametres'))
  with check (a_permission_admin('parametres'));

-- `maj_le`, `maj_par` et `recherche` posés par la base, pas par l'écran.
create or replace function actes_horodatage() returns trigger
language plpgsql set search_path = public as $$
begin
  new.maj_le := now();
  new.maj_par := coalesce(auth.uid(), new.maj_par);
  new.libelle := btrim(new.libelle);
  new.code := nullif(btrim(coalesce(new.code, '')), '');
  new.categorie := nullif(lower(btrim(coalesce(new.categorie, ''))), '');
  new.recherche := normaliser_recherche(
    new.libelle
    || ' ' || coalesce(new.code, '')
    || ' ' || array_to_string(coalesce(new.synonymes, '{}'::text[]), ' ')
  );
  return new;
end;
$$;

drop trigger if exists trg_actes_horodatage on actes_prescriptibles;
create trigger trg_actes_horodatage
  before insert or update on actes_prescriptibles
  for each row execute function actes_horodatage();

-- ------------------------------------------------------------
-- 3. Modèles : à quel type d'ordonnance ils appartiennent
-- ------------------------------------------------------------
/*
 * Sans ce domaine, « bilan hépatique » et « angine de l'adulte » tomberaient
 * dans la même liste déroulante, et charger le premier dans une ordonnance
 * de médicaments produirait des lignes sans posologie.
 *
 * Les modèles existants sont tous des modèles de médicaments : c'est ce que
 * dit le défaut, et il vaut aussi pour la reprise des lignes déjà en base.
 */
alter table modeles_ordonnance
  add column if not exists domaine text not null default 'medicament';

do $$ begin
  alter table modeles_ordonnance add constraint modeles_domaine
    check (domaine in ('medicament', 'biologie', 'imagerie'));
exception when duplicate_object then null;
end $$;

comment on column modeles_ordonnance.lignes is
  'Lignes du modèle. Leur forme suit le domaine : '
  '{ medicamentId, libelle, dci, classe, posologie, duree, quantite } pour '
  '« medicament » ; { acteId, libelle } pour « biologie » et « imagerie ».';

-- L'index `idx_modeles_medecin` (0065) est laissé tel quel : il porte sur
-- (medecin_id, nom), ce qui suffit à la requête « mes modèles de ce
-- domaine » — un praticien en compte quelques-uns, le filtre sur le domaine
-- se fait sur une poignée de lignes déjà ramenées.

-- ------------------------------------------------------------
-- 4. Options d'une ordonnance d'actes
-- ------------------------------------------------------------
/*
 * « À jeun », « urgent » : elles portent sur l'ordonnance ENTIÈRE, pas sur
 * une ligne — `prescription` est contraint à un tableau, elles ne peuvent
 * pas y tenir.
 *
 * Une colonne plutôt qu'une relecture du texte imprimé : les remarques, elles,
 * se retrouvent en fin de contenu par expression régulière, et c'est déjà une
 * fragilité qu'on ne reconduit pas ici. « Urgent » est une consigne clinique ;
 * une correction du document ne doit pas pouvoir la perdre en silence.
 *
 * Objet libre et non deux booléens : l'imagerie y ajoutera les siennes
 * (produit de contraste, grossesse en cours) sans nouvelle migration.
 */
alter table documents_patient
  add column if not exists prescription_options jsonb
    check (prescription_options is null or jsonb_typeof(prescription_options) = 'object');

alter table modeles_ordonnance
  add column if not exists options jsonb
    check (options is null or jsonb_typeof(options) = 'object');

comment on column documents_patient.prescription_options is
  'Options d''une ordonnance d''actes : { "jeun": bool, "urgent": bool }. '
  'NULL pour une ordonnance de médicaments ou une pièce en texte libre.';

-- ------------------------------------------------------------
-- 5. Corriger un document : reconduire les options
-- ------------------------------------------------------------
/*
 * `corriger_document` (0065) recopie des COLONNES de la version précédente
 * vers la suivante ; elle ne relit jamais le texte imprimé. Sans la reprise
 * ci-dessous, corriger une ordonnance de biologie produirait une v2 qui perd
 * « à jeun » et « urgent » — en silence, et sur une consigne clinique.
 *
 * NULL signifie « reprendre les options de la version précédente », ce qui
 * rend la correction sûre pour un appelant qui ignore ce paramètre (l'écran
 * de l'ordonnance de médicaments, par exemple). Pour vraiment les effacer,
 * on passe un objet vide.
 *
 * L'ancienne signature est SUPPRIMÉE et non remplacée : avec un paramètre de
 * plus, `create or replace` créerait une SURCHARGE, et les appels existants
 * continueraient d'atteindre l'ancienne version — la même chicane qu'en
 * 0065, pour la même raison.
 */
drop function if exists corriger_document(uuid, text, text, text, text, jsonb, text);

create or replace function corriger_document(
  p_document_id uuid,
  p_titre text,
  p_contenu text default null,
  p_fichier_path text default null,
  p_fichier_nom text default null,
  p_prescription jsonb default null,
  p_code_verification text default null,
  p_prescription_options jsonb default null
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
    prescription, code_verification, prescription_options
  ) values (
    a.patient_id, a.proche_id, a.medecin_id, a.rendez_vous_id, a.type,
    trim(p_titre), nullif(trim(coalesce(p_contenu, '')), ''),
    p_fichier_path, p_fichier_nom, a.origine, auth.uid(),
    a.version + 1, coalesce(a.document_parent_id, a.id),
    p_prescription, p_code_verification,
    coalesce(p_prescription_options, a.prescription_options)
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

revoke execute on function corriger_document(uuid, text, text, text, text, jsonb, text, jsonb) from public, anon;
grant execute on function corriger_document(uuid, text, text, text, text, jsonb, text, jsonb) to authenticated;

-- ------------------------------------------------------------
-- 6. Amorçage — biologie
-- ------------------------------------------------------------
/*
 * Analyses courantes, d'après la Liste modèle OMS des diagnostics in vitro
 * essentiels (EDL), restreinte à ce qui se prescrit en ville et complétée de
 * ce qui est courant en Guinée (goutte épaisse, test d'Emmel, Widal).
 *
 * Point de départ, pas référence close : l'écran d'administration et l'import
 * Excel la complètent, et un médecin peut toujours prescrire un acte absent.
 *
 * `on conflict do nothing` : rejouer la migration n'écrase pas une ligne
 * corrigée depuis par l'administration.
 */
insert into actes_prescriptibles (domaine, libelle, synonymes, categorie, origine) values
  -- Hématologie
  ('biologie', 'NFS (hémogramme)', '{"nfs","hemogramme","numeration formule sanguine","numeration"}', 'hématologie', 'oms'),
  ('biologie', 'Numération plaquettaire', '{"plaquettes","thrombocytes"}', 'hématologie', 'oms'),
  ('biologie', 'Taux d''hémoglobine', '{"hemoglobine","hb"}', 'hématologie', 'oms'),
  ('biologie', 'Hématocrite', '{"hte"}', 'hématologie', 'oms'),
  ('biologie', 'Réticulocytes', '{}', 'hématologie', 'oms'),
  ('biologie', 'Frottis sanguin', '{"frottis"}', 'hématologie', 'oms'),
  ('biologie', 'Vitesse de sédimentation (VS)', '{"vs","sedimentation"}', 'hématologie', 'oms'),
  ('biologie', 'Groupe sanguin ABO-Rhésus', '{"groupage","groupe sanguin","abo","rhesus"}', 'hématologie', 'oms'),
  ('biologie', 'Recherche d''agglutinines irrégulières (RAI)', '{"rai"}', 'hématologie', 'oms'),
  ('biologie', 'Taux de prothrombine (TP)', '{"tp","prothrombine"}', 'hématologie', 'oms'),
  ('biologie', 'Temps de céphaline activée (TCA)', '{"tca","cephaline"}', 'hématologie', 'oms'),
  ('biologie', 'INR', '{"inr"}', 'hématologie', 'oms'),
  ('biologie', 'Fibrinogène', '{}', 'hématologie', 'oms'),
  ('biologie', 'Électrophorèse de l''hémoglobine', '{"electrophorese","drepanocytose","hemoglobinopathie"}', 'hématologie', 'oms'),
  ('biologie', 'Test d''Emmel', '{"emmel","falciformation","drepanocytose"}', 'hématologie', 'oms'),
  -- Biochimie
  ('biologie', 'Glycémie à jeun', '{"glycemie","sucre","glucose"}', 'biochimie', 'oms'),
  ('biologie', 'Glycémie post-prandiale', '{"glycemie post prandiale"}', 'biochimie', 'oms'),
  ('biologie', 'Hémoglobine glyquée (HbA1c)', '{"hba1c","hemoglobine glyquee"}', 'biochimie', 'oms'),
  ('biologie', 'Créatininémie', '{"creatinine"}', 'biochimie', 'oms'),
  ('biologie', 'Clairance de la créatinine', '{"clairance","dfg"}', 'biochimie', 'oms'),
  ('biologie', 'Urée sanguine', '{"uree"}', 'biochimie', 'oms'),
  ('biologie', 'Acide urique', '{"uricemie"}', 'biochimie', 'oms'),
  ('biologie', 'Ionogramme sanguin', '{"ionogramme","natremie","kaliemie","sodium","potassium"}', 'biochimie', 'oms'),
  ('biologie', 'Calcémie', '{"calcium"}', 'biochimie', 'oms'),
  ('biologie', 'Phosphorémie', '{"phosphore"}', 'biochimie', 'oms'),
  ('biologie', 'Magnésémie', '{"magnesium"}', 'biochimie', 'oms'),
  ('biologie', 'Bilan lipidique', '{"exploration anomalie lipidique","eal","lipides"}', 'biochimie', 'oms'),
  ('biologie', 'Cholestérol total', '{"cholesterol"}', 'biochimie', 'oms'),
  ('biologie', 'HDL cholestérol', '{"hdl"}', 'biochimie', 'oms'),
  ('biologie', 'LDL cholestérol', '{"ldl"}', 'biochimie', 'oms'),
  ('biologie', 'Triglycérides', '{"tg"}', 'biochimie', 'oms'),
  ('biologie', 'Transaminases (ASAT / ALAT)', '{"transaminases","asat","alat","tgo","tgp"}', 'biochimie', 'oms'),
  ('biologie', 'Gamma-GT', '{"ggt","gamma gt"}', 'biochimie', 'oms'),
  ('biologie', 'Phosphatases alcalines', '{"pal"}', 'biochimie', 'oms'),
  ('biologie', 'Bilirubine totale et conjuguée', '{"bilirubine"}', 'biochimie', 'oms'),
  ('biologie', 'Protéines totales', '{"proteinemie"}', 'biochimie', 'oms'),
  ('biologie', 'Albuminémie', '{"albumine"}', 'biochimie', 'oms'),
  ('biologie', 'Amylasémie', '{"amylase"}', 'biochimie', 'oms'),
  ('biologie', 'Lipasémie', '{"lipase"}', 'biochimie', 'oms'),
  ('biologie', 'Protéine C-réactive (CRP)', '{"crp","proteine c reactive"}', 'biochimie', 'oms'),
  ('biologie', 'Procalcitonine', '{"pct"}', 'biochimie', 'oms'),
  ('biologie', 'Fer sérique', '{"fer","sideremie"}', 'biochimie', 'oms'),
  ('biologie', 'Ferritinémie', '{"ferritine"}', 'biochimie', 'oms'),
  ('biologie', 'Transferrine', '{"ctf","coefficient de saturation"}', 'biochimie', 'oms'),
  ('biologie', 'Créatine phosphokinase (CPK)', '{"cpk","ck"}', 'biochimie', 'oms'),
  ('biologie', 'Troponine', '{"troponine"}', 'biochimie', 'oms'),
  ('biologie', 'Lactate déshydrogénase (LDH)', '{"ldh"}', 'biochimie', 'oms'),
  -- Microbiologie
  ('biologie', 'ECBU (examen cytobactériologique des urines)', '{"ecbu","urines","uroculture"}', 'microbiologie', 'oms'),
  ('biologie', 'Coproculture', '{"selles"}', 'microbiologie', 'oms'),
  ('biologie', 'Hémoculture', '{"hemoculture"}', 'microbiologie', 'oms'),
  ('biologie', 'Prélèvement vaginal', '{"pv","prelevement vaginal"}', 'microbiologie', 'oms'),
  ('biologie', 'Prélèvement urétral', '{"pu","urethral"}', 'microbiologie', 'oms'),
  ('biologie', 'Examen cytobactériologique des crachats', '{"ecbc","crachats","expectoration"}', 'microbiologie', 'oms'),
  ('biologie', 'Recherche de BAAR', '{"baar","bacilles acido alcoolo resistants","tuberculose","ziehl"}', 'microbiologie', 'oms'),
  ('biologie', 'GeneXpert MTB/RIF', '{"genexpert","xpert","tuberculose","mtb rif"}', 'microbiologie', 'oms'),
  ('biologie', 'Culture de pus / prélèvement de plaie', '{"pus","plaie","culture"}', 'microbiologie', 'oms'),
  ('biologie', 'Examen cytobactériologique du LCR', '{"lcr","ponction lombaire","liquide cephalo rachidien"}', 'microbiologie', 'oms'),
  ('biologie', 'Antibiogramme', '{"atb","antibiogramme"}', 'microbiologie', 'oms'),
  -- Parasitologie
  ('biologie', 'Goutte épaisse et frottis mince', '{"goutte epaisse","ge","paludisme","palu"}', 'parasitologie', 'oms'),
  ('biologie', 'Test de diagnostic rapide du paludisme', '{"tdr","tdr palu","paludisme"}', 'parasitologie', 'oms'),
  ('biologie', 'Examen parasitologique des selles', '{"eps","selles","parasites","kop"}', 'parasitologie', 'oms'),
  ('biologie', 'Recherche de microfilaires', '{"microfilaires","filariose"}', 'parasitologie', 'oms'),
  ('biologie', 'Recherche de schistosomes dans les urines', '{"bilharziose","schistosomiase","schistosomes"}', 'parasitologie', 'oms'),
  ('biologie', 'Scotch test anal', '{"scotch test","oxyurose"}', 'parasitologie', 'oms'),
  -- Sérologie et immunologie
  ('biologie', 'Sérologie VIH', '{"vih","hiv","serologie vih","depistage vih"}', 'sérologie', 'oms'),
  ('biologie', 'Charge virale VIH', '{"charge virale","cv vih"}', 'sérologie', 'oms'),
  ('biologie', 'Numération des lymphocytes CD4', '{"cd4"}', 'sérologie', 'oms'),
  ('biologie', 'Antigène HBs', '{"ag hbs","hepatite b","hbs"}', 'sérologie', 'oms'),
  ('biologie', 'Anticorps anti-HBs', '{"anti hbs","hepatite b"}', 'sérologie', 'oms'),
  ('biologie', 'Anticorps anti-HBc', '{"anti hbc","hepatite b"}', 'sérologie', 'oms'),
  ('biologie', 'Sérologie hépatite C', '{"vhc","hepatite c"}', 'sérologie', 'oms'),
  ('biologie', 'Sérologie syphilis (TPHA / VDRL)', '{"tpha","vdrl","syphilis"}', 'sérologie', 'oms'),
  ('biologie', 'Sérologie toxoplasmose', '{"toxoplasmose","toxo"}', 'sérologie', 'oms'),
  ('biologie', 'Sérologie rubéole', '{"rubeole"}', 'sérologie', 'oms'),
  ('biologie', 'Sérodiagnostic de Widal et Félix', '{"widal","typhoide","salmonellose"}', 'sérologie', 'oms'),
  ('biologie', 'ASLO (antistreptolysines O)', '{"aslo"}', 'sérologie', 'oms'),
  ('biologie', 'Facteur rhumatoïde', '{"latex waaler rose","facteur rhumatoide"}', 'sérologie', 'oms'),
  -- Hormonologie
  ('biologie', 'TSH', '{"tsh","thyroide"}', 'hormonologie', 'oms'),
  ('biologie', 'T4 libre', '{"t4l","ft4"}', 'hormonologie', 'oms'),
  ('biologie', 'T3 libre', '{"t3l","ft3"}', 'hormonologie', 'oms'),
  ('biologie', 'Bêta-hCG quantitatif', '{"beta hcg","hcg","test de grossesse"}', 'hormonologie', 'oms'),
  ('biologie', 'Prolactine', '{}', 'hormonologie', 'oms'),
  ('biologie', 'FSH', '{"fsh"}', 'hormonologie', 'oms'),
  ('biologie', 'LH', '{"lh"}', 'hormonologie', 'oms'),
  ('biologie', 'Œstradiol', '{"estradiol","oestradiol"}', 'hormonologie', 'oms'),
  ('biologie', 'Testostérone', '{"testosterone"}', 'hormonologie', 'oms'),
  ('biologie', 'Cortisol', '{}', 'hormonologie', 'oms'),
  ('biologie', 'PSA (antigène prostatique spécifique)', '{"psa","prostate"}', 'hormonologie', 'oms'),
  -- Urines
  ('biologie', 'Bandelette urinaire', '{"bu","bandelette"}', 'urines', 'oms'),
  ('biologie', 'Protéinurie de 24 heures', '{"proteinurie"}', 'urines', 'oms'),
  ('biologie', 'Microalbuminurie', '{"microalbuminurie","albuminurie"}', 'urines', 'oms'),
  ('biologie', 'Ionogramme urinaire', '{"ionogramme urinaire"}', 'urines', 'oms'),
  ('biologie', 'Créatininurie', '{"creatinine urinaire"}', 'urines', 'oms')
on conflict do nothing;

-- ------------------------------------------------------------
-- 7. Amorçage — imagerie
-- ------------------------------------------------------------
/*
 * Il n'existe pas de liste OMS des examens d'imagerie aussi arrêtée que la
 * liste des médicaments essentiels : ce catalogue est CURÉ, à partir des
 * examens courants et de ce qui est disponible à Conakry. D'où `origine =
 * 'admin'` et non 'oms' — ne pas laisser croire à une référence qui n'existe
 * pas.
 *
 * Ces actes ne sont encore visibles de personne : le type de document
 * « ordonnance d'imagerie » n'existe pas.
 */
insert into actes_prescriptibles (domaine, libelle, synonymes, categorie, origine) values
  -- Radiologie conventionnelle
  ('imagerie', 'Radiographie du thorax (face)', '{"radio thorax","rx thorax","poumon","telethorax"}', 'radiologie', 'admin'),
  ('imagerie', 'Radiographie du thorax (face et profil)', '{"radio thorax profil"}', 'radiologie', 'admin'),
  ('imagerie', 'Abdomen sans préparation (ASP)', '{"asp","abdomen sans preparation"}', 'radiologie', 'admin'),
  ('imagerie', 'Radiographie du crâne', '{"radio crane"}', 'radiologie', 'admin'),
  ('imagerie', 'Radiographie des sinus', '{"radio sinus","blondeau"}', 'radiologie', 'admin'),
  ('imagerie', 'Radiographie du rachis cervical', '{"radio rachis cervical","cervicale"}', 'radiologie', 'admin'),
  ('imagerie', 'Radiographie du rachis dorsal', '{"radio rachis dorsal","dorsale"}', 'radiologie', 'admin'),
  ('imagerie', 'Radiographie du rachis lombaire', '{"radio rachis lombaire","lombaire"}', 'radiologie', 'admin'),
  ('imagerie', 'Radiographie du bassin', '{"radio bassin"}', 'radiologie', 'admin'),
  ('imagerie', 'Radiographie de l''épaule', '{"radio epaule"}', 'radiologie', 'admin'),
  ('imagerie', 'Radiographie du coude', '{"radio coude"}', 'radiologie', 'admin'),
  ('imagerie', 'Radiographie du poignet', '{"radio poignet"}', 'radiologie', 'admin'),
  ('imagerie', 'Radiographie de la main', '{"radio main"}', 'radiologie', 'admin'),
  ('imagerie', 'Radiographie de la hanche', '{"radio hanche"}', 'radiologie', 'admin'),
  ('imagerie', 'Radiographie du genou', '{"radio genou"}', 'radiologie', 'admin'),
  ('imagerie', 'Radiographie de la cheville', '{"radio cheville"}', 'radiologie', 'admin'),
  ('imagerie', 'Radiographie du pied', '{"radio pied"}', 'radiologie', 'admin'),
  ('imagerie', 'Panoramique dentaire', '{"panoramique","orthopantomogramme","dentaire"}', 'radiologie', 'admin'),
  ('imagerie', 'Mammographie', '{"mammo","sein"}', 'radiologie', 'admin'),
  ('imagerie', 'Hystérosalpingographie', '{"hsg","hysterosalpingographie"}', 'radiologie', 'admin'),
  ('imagerie', 'Urographie intraveineuse (UIV)', '{"uiv","urographie"}', 'radiologie', 'admin'),
  ('imagerie', 'Transit œso-gastro-duodénal (TOGD)', '{"togd","transit"}', 'radiologie', 'admin'),
  ('imagerie', 'Lavement baryté', '{"lavement baryte"}', 'radiologie', 'admin'),
  ('imagerie', 'Ostéodensitométrie', '{"densitometrie","osteodensitometrie","dmo"}', 'radiologie', 'admin'),
  -- Échographie
  ('imagerie', 'Échographie abdominale', '{"echo abdominale","echographie abdomen"}', 'échographie', 'admin'),
  ('imagerie', 'Échographie abdomino-pelvienne', '{"echo abdomino pelvienne"}', 'échographie', 'admin'),
  ('imagerie', 'Échographie pelvienne', '{"echo pelvienne"}', 'échographie', 'admin'),
  ('imagerie', 'Échographie obstétricale du 1er trimestre', '{"echo obstetricale","echo grossesse","datation"}', 'échographie', 'admin'),
  ('imagerie', 'Échographie obstétricale du 2e trimestre', '{"echo morphologique","echo grossesse"}', 'échographie', 'admin'),
  ('imagerie', 'Échographie obstétricale du 3e trimestre', '{"echo croissance","echo grossesse"}', 'échographie', 'admin'),
  ('imagerie', 'Échographie rénale et vésicale', '{"echo renale","echo reins","echo vesicale"}', 'échographie', 'admin'),
  ('imagerie', 'Échographie hépatique', '{"echo foie","echo hepatique"}', 'échographie', 'admin'),
  ('imagerie', 'Échographie thyroïdienne', '{"echo thyroide"}', 'échographie', 'admin'),
  ('imagerie', 'Échographie mammaire', '{"echo mammaire","echo sein"}', 'échographie', 'admin'),
  ('imagerie', 'Échographie testiculaire', '{"echo testiculaire","echo bourses"}', 'échographie', 'admin'),
  ('imagerie', 'Échographie cervicale', '{"echo cou","echo cervicale"}', 'échographie', 'admin'),
  ('imagerie', 'Échographie des parties molles', '{"echo parties molles"}', 'échographie', 'admin'),
  ('imagerie', 'Échographie transfontanellaire', '{"etf","echo transfontanellaire"}', 'échographie', 'admin'),
  ('imagerie', 'Échocardiographie transthoracique', '{"ett","echo coeur","echocardiographie"}', 'échographie', 'admin'),
  ('imagerie', 'Écho-Doppler veineux des membres inférieurs', '{"doppler veineux","echo doppler veineux","phlebite"}', 'échographie', 'admin'),
  ('imagerie', 'Écho-Doppler artériel des membres inférieurs', '{"doppler arteriel","echo doppler arteriel"}', 'échographie', 'admin'),
  ('imagerie', 'Écho-Doppler des troncs supra-aortiques', '{"doppler tsa","tsa","carotides"}', 'échographie', 'admin'),
  -- Scanner
  ('imagerie', 'Scanner cérébral sans injection', '{"tdm cerebrale","scanner cerebral","scanner crane"}', 'scanner', 'admin'),
  ('imagerie', 'Scanner cérébral avec injection', '{"tdm cerebrale injectee","scanner cerebral injecte"}', 'scanner', 'admin'),
  ('imagerie', 'Scanner thoracique', '{"tdm thoracique","scanner thorax"}', 'scanner', 'admin'),
  ('imagerie', 'Scanner abdomino-pelvien', '{"tdm abdomino pelvienne","scanner abdomen"}', 'scanner', 'admin'),
  ('imagerie', 'Scanner du rachis', '{"tdm rachis","scanner rachis"}', 'scanner', 'admin'),
  ('imagerie', 'Scanner des sinus', '{"tdm sinus","scanner sinus"}', 'scanner', 'admin'),
  ('imagerie', 'Angioscanner pulmonaire', '{"angioscanner","embolie pulmonaire"}', 'scanner', 'admin'),
  ('imagerie', 'Uroscanner', '{"uroscanner","tdm uro"}', 'scanner', 'admin'),
  -- IRM
  ('imagerie', 'IRM cérébrale', '{"irm cerebrale","irm crane"}', 'irm', 'admin'),
  ('imagerie', 'IRM du rachis cervical', '{"irm cervicale"}', 'irm', 'admin'),
  ('imagerie', 'IRM du rachis lombaire', '{"irm lombaire"}', 'irm', 'admin'),
  ('imagerie', 'IRM du genou', '{"irm genou"}', 'irm', 'admin'),
  ('imagerie', 'IRM abdominale', '{"irm abdomen"}', 'irm', 'admin'),
  ('imagerie', 'IRM pelvienne', '{"irm pelvienne"}', 'irm', 'admin')
on conflict do nothing;
