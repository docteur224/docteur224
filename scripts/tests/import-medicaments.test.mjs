/*
 * Tests unitaires : lecture d'un .xlsx (aller-retour avec lib/xlsx.ts),
 * lecture CSV, analyse d'import de la base de médicaments.
 *
 * Usage : node --test "scripts/tests/*.test.mjs"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { construireClasseur } from "../../lib/xlsx.ts";
import { lireClasseur, lireCsv } from "../../lib/xlsx-lecture.ts";
import { analyserImport, cle } from "../../lib/import-medicaments.ts";

test("xlsx : aller-retour écriture → lecture, accents et caractères spéciaux compris", () => {
  const octets = construireClasseur({
    nomFeuille: "Médicaments",
    colonnes: [{ titre: "DCI", largeur: 30 }, { titre: "Dosage", largeur: 12 }, { titre: "Classe", largeur: 20 }],
    lignes: [
      ["Amoxicilline + acide clavulanique", "1 g/125 mg", "pénicillines"],
      ["Hydroxyde d'aluminium & magnésium <test>", null, "antiacides"],
    ],
  });
  const lignes = lireClasseur(Buffer.from(octets));
  assert.deepEqual(lignes, [
    ["DCI", "Dosage", "Classe"],
    ["Amoxicilline + acide clavulanique", "1 g/125 mg", "pénicillines"],
    ["Hydroxyde d'aluminium & magnésium <test>", "", "antiacides"],
  ]);
});

test("xlsx : un fichier qui n’en est pas un est refusé clairement", () => {
  assert.throws(() => lireClasseur(Buffer.from("ceci n'est pas un zip")), /classeur Excel/);
});

test("csv : séparateur deviné, guillemets", () => {
  assert.deepEqual(lireCsv('DCI;Dosage\n"Paracétamol";500 mg\n"Sirop ""spécial""";5 %\n'), [
    ["DCI", "Dosage"],
    ["Paracétamol", "500 mg"],
    ['Sirop "spécial"', "5 %"],
  ]);
  assert.deepEqual(lireCsv("dci,forme\r\nIbuprofène,comprimé"), [["dci", "forme"], ["Ibuprofène", "comprimé"]]);
});

const existants = [
  { id: "a", dci: "Paracétamol", nom_commercial: null, dosage: "500 mg", forme: "comprimé", voie: "orale", classe: "antalgiques", actif: true },
  { id: "b", dci: "Ibuprofène", nom_commercial: null, dosage: "400 mg", forme: "comprimé", voie: "orale", classe: "ains", actif: true },
];

test("import : création, modification champ par champ, inchangé", () => {
  const r = analyserImport(
    [
      ["Molécule", "Dosage", "Forme", "Famille", "Actif"],
      ["Paracétamol", "500 mg", "comprimé", "antalgiques", "oui"],
      ["IBUPROFÈNE", "400 MG", "Comprimé", "AINS", "non"],
      ["Cétirizine", "10 mg", "comprimé", "antihistaminiques", ""],
    ],
    existants
  );
  assert.deepEqual(r.erreurs, []);
  assert.equal(r.inchanges, 1);
  assert.equal(r.creations.length, 1);
  assert.equal(r.creations[0].dci, "Cétirizine");
  assert.equal(r.creations[0].actif, true, "colonne Actif vide = actif");
  assert.equal(r.modifications.length, 1, "la clé ignore la casse : Ibuprofène est retrouvé");
  const champs = r.modifications[0].champs.map((c) => c.champ).sort();
  assert.deepEqual(champs, ["actif", "dci", "dosage", "forme"].sort());
  assert.ok(r.colonnesReconnues.includes("Classe"), "« Famille » reconnu comme Classe");
});

test("import : une colonne absente ne vide pas la base", () => {
  const r = analyserImport([["DCI", "Dosage", "Forme"], ["Paracétamol", "500 mg", "comprimé"]], existants);
  assert.equal(r.inchanges, 1, "pas de colonne Classe ni Voie : rien à comparer dessus");
  assert.equal(r.modifications.length, 0);
});

test("import : erreurs numérotées comme dans Excel", () => {
  const r = analyserImport(
    [
      ["DCI", "Dosage", "Forme", "Actif"],
      ["", "5 mg", "comprimé", "oui"],
      ["Amlodipine", "5 mg", "comprimé", "peut-être"],
      ["Amlodipine", "10 mg", "comprimé", "oui"],
      ["amlodipine", "10 MG", "COMPRIMÉ", "oui"],
    ],
    []
  );
  assert.deepEqual(
    r.erreurs.map((e) => e.ligne),
    [2, 3, 5]
  );
  assert.match(r.erreurs[1].message, /oui ou non/);
  assert.match(r.erreurs[2].message, /Doublon de la ligne 4/);
  assert.equal(r.creations.length, 1);
});

test("import : sans colonne DCI, rien n’est analysé", () => {
  const r = analyserImport([["Nom", "Prix"], ["X", "1"]], existants);
  assert.equal(r.erreurs.length, 1);
  assert.match(r.erreurs[0].message, /DCI/);
});

test("clé d’unicité alignée sur l’index de la base", () => {
  assert.equal(cle({ dci: " Paracétamol ", dosage: "500 MG", forme: null }), "paracétamol|500 mg|");
});
