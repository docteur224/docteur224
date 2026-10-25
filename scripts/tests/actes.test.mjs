/*
 * Tests unitaires : ordonnances d'actes (biologie, imagerie) — normalisation
 * de la recherche, texte imprimé, options, et analyse d'import du
 * référentiel.
 *
 * Usage : node --test "scripts/tests/*.test.mjs"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  classerActes,
  normaliserRecherche,
  optionsEnBase,
  problemeActes,
  rangCorrespondance,
  texteOrdonnanceActes,
} from "../../lib/prescription-actes.ts";
import { analyserImport, cle, lireSynonymes } from "../../lib/import-actes.ts";

/* ===================== Normalisation ===================== */

test("recherche : accents, ligatures et casse", () => {
  assert.equal(normaliserRecherche("Créatininémie"), "creatininemie");
  assert.equal(normaliserRecherche("  HÉMOGRAMME  "), "hemogramme");
  assert.equal(normaliserRecherche("Œstradiol"), "oestradiol");
  assert.equal(normaliserRecherche("Transit œso-gastro-duodénal"), "transit oeso-gastro-duodenal");
  assert.equal(normaliserRecherche("æquo"), "aequo");
  // Un texte déjà normalisé ne bouge plus : la fonction est idempotente.
  assert.equal(normaliserRecherche(normaliserRecherche("Électrophorèse")), "electrophorese");
});

/*
 * LE test de ce fichier. La colonne `actes_prescriptibles.recherche` est
 * normalisée par PostgreSQL, la saisie du médecin l'est en JavaScript. Si
 * les deux cessaient de se correspondre, la recherche ne rendrait plus rien
 * — sans erreur, sans trace, et seulement en production.
 *
 * On relit donc les DEUX chaînes de `translate` dans la migration elle-même
 * et on vérifie que le JavaScript rend bien, caractère par caractère, ce que
 * le SQL rendrait.
 */
test("recherche : le JavaScript reproduit exactement la fonction SQL", () => {
  const sql = readFileSync(
    fileURLToPath(new URL("../../supabase/migrations/0068_ordonnances_biologie.sql", import.meta.url)),
    "utf8"
  );
  const bloc = sql.match(/create or replace function normaliser_recherche[\s\S]*?\$\$;/);
  assert.ok(bloc, "fonction normaliser_recherche introuvable dans la migration 0068");

  // Gourmand À DESSEIN : non gourmand, le motif s'arrêterait sur le
  // `replace('œ', 'oe')` imbriqué au lieu des deux chaînes de `translate`.
  const translate = bloc[0].match(/translate\([\s\S]*,\s*'([^']+)',\s*'([^']+)'\s*\)/);
  assert.ok(translate, "les deux chaînes de translate() sont introuvables");
  const [, accentues, sansAccent] = translate;
  assert.equal(
    accentues.length,
    sansAccent.length,
    "les deux chaînes de translate() doivent avoir la même longueur, sinon Postgres tronque"
  );

  for (let i = 0; i < accentues.length; i++) {
    assert.equal(
      normaliserRecherche(accentues[i]),
      sansAccent[i],
      `« ${accentues[i]} » : le JavaScript et le SQL ne s’accordent pas`
    );
  }

  // Les ligatures, elles, passent par `replace` et non par `translate`.
  for (const [avant, apres] of [["œ", "oe"], ["æ", "ae"]]) {
    assert.ok(bloc[0].includes(`'${avant}', '${apres}'`), `le replace de « ${avant} » manque au SQL`);
    assert.equal(normaliserRecherche(avant), apres);
  }
});

/* ===================== Classement des résultats ===================== */

/** Tel que la base le construit : libellé + code + synonymes, normalisé. */
const acte = (libelle, ...synonymes) => ({
  libelle,
  recherche: normaliserRecherche([libelle, ...synonymes].join(" ")),
});

/* Tous repris tels quels du référentiel (migration 0068) : un fixture qui
   invente un synonyme teste une donnée qui n'existe pas. */
const NFS = acte("NFS (hémogramme)", "nfs", "hemogramme", "numeration formule sanguine", "numeration");
const HEMOCULTURE = acte("Hémoculture", "hemoculture");
const ELECTRO = acte("Électrophorèse de l'hémoglobine", "electrophorese", "drepanocytose", "hemoglobinopathie");
const SCANNER = acte("Scanner cérébral sans injection", "tdm cerebrale", "scanner cerebral", "scanner crane");
const ANGIOSCANNER = acte("Angioscanner pulmonaire", "angioscanner", "embolie pulmonaire");

test("classement : rangs selon l’endroit de la correspondance", () => {
  // Le libellé commence par la saisie.
  assert.equal(rangCorrespondance(HEMOCULTURE.libelle, HEMOCULTURE.recherche, "hemo"), 0);
  assert.equal(rangCorrespondance(SCANNER.libelle, SCANNER.recherche, "scanner"), 0);
  // Un mot du libellé ou d’un synonyme commence par la saisie.
  assert.equal(rangCorrespondance(NFS.libelle, NFS.recherche, "hemo"), 1);
  // La saisie n’apparaît qu’au milieu d’un mot : « angioSCANNER ».
  assert.equal(rangCorrespondance(ANGIOSCANNER.libelle, ANGIOSCANNER.recherche, "scanner"), 2);
});

test("classement : ce qui commence par la saisie passe devant", () => {
  assert.deepEqual(
    classerActes([ELECTRO, NFS, HEMOCULTURE], "hemo").map((a) => a.libelle),
    ["Hémoculture", "Électrophorèse de l'hémoglobine", "NFS (hémogramme)"]
  );
});

/*
 * À rang égal, l'ordre reste alphabétique et ne dépend pas de l'ordre
 * d'arrivée. Un classement par longueur avait été essayé puis retiré : sur
 * le référentiel réel il rendait « Radiographie du pied, du coude, du
 * crâne », que rien ne laisse prévoir.
 */
test("classement : à rang égal, alphabétique, quel que soit l’ordre d’entrée", () => {
  const attendu = ["Électrophorèse de l'hémoglobine", "NFS (hémogramme)"];
  assert.deepEqual(classerActes([NFS, ELECTRO], "hemo").map((a) => a.libelle), attendu);
  assert.deepEqual(classerActes([ELECTRO, NFS], "hemo").map((a) => a.libelle), attendu);
});

test("classement : le rang prime sur l’alphabet", () => {
  // « Angioscanner » précède « Scanner » dans l'alphabet, mais n'a la saisie
  // qu'au milieu d'un mot : le libellé qui commence par elle passe devant.
  assert.deepEqual(
    classerActes([ANGIOSCANNER, SCANNER], "scanner").map((a) => a.libelle),
    ["Scanner cérébral sans injection", "Angioscanner pulmonaire"]
  );
});

test("classement : la saisie accentuée vaut la saisie sans accent", () => {
  assert.deepEqual(
    classerActes([ELECTRO, NFS], "hémo").map((a) => a.libelle),
    classerActes([ELECTRO, NFS], "hemo").map((a) => a.libelle)
  );
});

test("classement : une saisie à métacaractères ne casse pas l’expression", () => {
  // Le « + » d'une saisie comme « c+ » serait un quantificateur invalide.
  assert.doesNotThrow(() => classerActes([NFS], "c+"));
  assert.doesNotThrow(() => classerActes([NFS], "a-b"));
  assert.doesNotThrow(() => classerActes([NFS], "["));
});

/* ===================== Texte imprimé ===================== */

const LIGNES = [
  { acteId: "1", libelle: "NFS (hémogramme)" },
  { acteId: "2", libelle: "Glycémie à jeun" },
  { acteId: null, libelle: "Dosage rare, hors référentiel" },
];

test("actes : les actes sont numérotés", () => {
  assert.equal(
    texteOrdonnanceActes(LIGNES),
    "1. NFS (hémogramme)\n2. Glycémie à jeun\n3. Dosage rare, hors référentiel"
  );
});

test("actes : les mentions urgentes passent EN TÊTE", () => {
  const texte = texteOrdonnanceActes(LIGNES.slice(0, 1), { urgent: true, jeun: true });
  assert.ok(texte.startsWith("EXAMEN URGENT\nÀ JEUN\n\n1. NFS"), texte);
});

test("actes : les renseignements cliniques closent l’ordonnance", () => {
  const texte = texteOrdonnanceActes(LIGNES.slice(0, 1), { renseignements: "  Asthénie  " });
  assert.equal(texte, "1. NFS (hémogramme)\n\nRenseignements cliniques : Asthénie");
});

test("actes : les lignes vides ne se numérotent pas", () => {
  const texte = texteOrdonnanceActes([{ acteId: null, libelle: "  " }, { acteId: "1", libelle: "VS" }]);
  assert.equal(texte, "1. VS");
});

test("actes : validation — il faut au moins un acte, nommé selon le domaine", () => {
  assert.equal(problemeActes([], "biologie"), "Ajoutez au moins une analyse.");
  assert.equal(problemeActes([], "imagerie"), "Ajoutez au moins un examen.");
  assert.equal(problemeActes([{ acteId: null, libelle: "   " }], "biologie"), "Ajoutez au moins une analyse.");
  assert.equal(problemeActes(LIGNES, "biologie"), null);
});

/*
 * La seule règle qui distingue vraiment les deux domaines : le radiologue
 * tire son protocole de l'indication, le laboratoire non.
 */
test("actes : les renseignements cliniques sont exigés en imagerie, pas en biologie", () => {
  assert.equal(problemeActes(LIGNES, "biologie", {}), null, "la biologie n’exige rien");
  assert.match(problemeActes(LIGNES, "imagerie", {}) ?? "", /renseignements cliniques/);
  assert.match(problemeActes(LIGNES, "imagerie", { renseignements: "   " }) ?? "", /renseignements cliniques/);
  assert.equal(problemeActes(LIGNES, "imagerie", { renseignements: "Traumatisme du genou" }), null);
  // L'acte manquant passe AVANT : on ne reproche pas l'indication d'une
  // ordonnance encore vide.
  assert.equal(problemeActes([], "imagerie", {}), "Ajoutez au moins un examen.");
});

test("actes : rien de coché ne s’enregistre pas comme un objet vide", () => {
  assert.equal(optionsEnBase({}), null);
  assert.equal(optionsEnBase({ jeun: false, urgent: false, renseignements: "   " }), null);
  assert.deepEqual(optionsEnBase({ urgent: true, renseignements: " Fièvre " }), {
    urgent: true,
    renseignements: "Fièvre",
  });
});

/* ===================== Import ===================== */

test("synonymes : point-virgule ou barre, espaces ignorés", () => {
  assert.deepEqual(lireSynonymes(" nfs ; hemogramme |numeration "), ["nfs", "hemogramme", "numeration"]);
  assert.deepEqual(lireSynonymes(""), []);
  // La virgule n'est PAS un séparateur : des intitulés en contiennent.
  assert.deepEqual(lireSynonymes("Widal et Félix, sérodiagnostic"), ["Widal et Félix, sérodiagnostic"]);
});

const existants = [
  { id: "a", domaine: "biologie", libelle: "NFS (hémogramme)", synonymes: ["nfs"], code: null, categorie: "hématologie", actif: true },
  { id: "b", domaine: "imagerie", libelle: "Échographie abdominale", synonymes: [], code: null, categorie: "échographie", actif: true },
];

test("import : la clé est le domaine ET le libellé", () => {
  // Le même intitulé dans deux domaines fait DEUX actes.
  assert.notEqual(cle({ domaine: "biologie", libelle: "Doppler" }), cle({ domaine: "imagerie", libelle: "Doppler" }));
  assert.equal(cle({ domaine: "biologie", libelle: "  NFS (HÉMOGRAMME)  " }), cle(existants[0]));
});

test("import : création, modification, inchangé", () => {
  const a = analyserImport(
    [
      ["Domaine", "Libellé", "Synonymes", "Catégorie", "Actif"],
      ["biologie", "NFS (hémogramme)", "nfs", "hématologie", "oui"],
      ["Biologie", "Glycémie à jeun", "glycemie ; sucre", "biochimie", "oui"],
      ["imagerie", "Échographie abdominale", "", "radiologie", "oui"],
    ],
    existants
  );
  assert.deepEqual(a.erreurs, []);
  assert.equal(a.inchanges, 1, "la NFS est identique");
  assert.equal(a.creations.length, 1);
  assert.deepEqual(a.creations[0].synonymes, ["glycemie", "sucre"]);
  assert.equal(a.modifications.length, 1, "l’échographie change de catégorie");
  assert.deepEqual(
    a.modifications[0].champs.map((c) => c.champ),
    ["categorie"]
  );
});

test("import : le domaine est obligatoire et contrôlé", () => {
  const a = analyserImport(
    [
      ["Domaine", "Libellé"],
      ["", "Acte sans domaine"],
      ["chirurgie", "Domaine inconnu"],
      ["labo", "Acte accepté par synonyme"],
    ],
    []
  );
  assert.equal(a.erreurs.length, 2);
  assert.match(a.erreurs[0].message, /biologie ou imagerie/);
  assert.equal(a.erreurs[0].ligne, 2);
  assert.equal(a.creations.length, 1);
  assert.equal(a.creations[0].domaine, "biologie");
});

test("import : sans colonne Libellé, on s’arrête net", () => {
  const a = analyserImport([["Domaine", "Catégorie"], ["biologie", "hématologie"]], []);
  assert.equal(a.erreurs.length, 1);
  assert.match(a.erreurs[0].message, /Libellé/);
  assert.equal(a.creations.length, 0);
});

test("import : doublon dans le fichier", () => {
  const a = analyserImport(
    [
      ["Domaine", "Libellé"],
      ["biologie", "CRP"],
      ["biologie", "crp"],
    ],
    []
  );
  assert.equal(a.creations.length, 1);
  assert.equal(a.erreurs.length, 1);
  assert.match(a.erreurs[0].message, /Doublon de la ligne 2/);
});

test("import : une colonne absente du fichier ne vide pas la base", () => {
  // Pas de colonne « Synonymes » : ceux de la NFS doivent survivre.
  const a = analyserImport([["Domaine", "Libellé"], ["biologie", "NFS (hémogramme)"]], existants);
  assert.equal(a.inchanges, 1);
  assert.equal(a.modifications.length, 0);
});

test("import : retirer un acte se fait par la colonne Actif, jamais par omission", () => {
  const a = analyserImport(
    [
      ["Domaine", "Libellé", "Actif"],
      ["biologie", "NFS (hémogramme)", "non"],
    ],
    existants
  );
  assert.equal(a.modifications.length, 1);
  assert.equal(a.modifications[0].valeurs.actif, false);
  // L'échographie, absente du fichier, n'est NI supprimée NI modifiée.
  assert.equal(a.creations.length, 0);
});
