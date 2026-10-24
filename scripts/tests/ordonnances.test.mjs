/*
 * Tests unitaires de l'étape 3 : allergies, prescription, code de
 * vérification, modèles de certificats. node:test, sans dépendance.
 *
 * Usage : node --test "scripts/tests/*.test.mjs"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { allergiesConcernees, normaliser } from "../../lib/allergies.ts";
import { libelleMedicament, problemePrescription, resumePrescription, texteOrdonnance, LIGNE_VIDE } from "../../lib/prescription.ts";
import { genererCode, normaliserCode, ALPHABET } from "../../lib/code-verification.ts";
import { joursArret, remplirModele, dateLongue } from "../../lib/modeles-certificats.ts";

const amox = { libelle: "Amoxicilline 500 mg — gélule", dci: "Amoxicilline", classe: "pénicillines" };
const augmentin = { libelle: "Amoxicilline + acide clavulanique 1 g/125 mg — comprimé", dci: "Amoxicilline + acide clavulanique", classe: "pénicillines" };
const aspirine = { libelle: "Acide acétylsalicylique 500 mg — comprimé", dci: "Acide acétylsalicylique", classe: "ains" };
const ibu = { libelle: "Ibuprofène 400 mg — comprimé", dci: "Ibuprofène", classe: "ains" };
const bactrim = { libelle: "Sulfaméthoxazole + triméthoprime 800 mg/160 mg — comprimé", dci: "Sulfaméthoxazole + triméthoprime", classe: "sulfamides" };
const ceftri = { libelle: "Ceftriaxone 1 g — poudre", dci: "Ceftriaxone", classe: "céphalosporines" };
const para = { libelle: "Paracétamol 1 g — comprimé", dci: "Paracétamol", classe: "antalgiques" };

test("allergie : la pénicilline alerte sur l’amoxicilline (classe)", () => {
  const r = allergiesConcernees(amox, ["Pénicilline"]);
  assert.equal(r.length, 1);
  assert.match(r[0].raison, /classe : pénicillines/);
  assert.equal(allergiesConcernees(augmentin, ["penicillines"]).length, 1, "pluriel, sans accent");
});

test("allergie : même molécule, quelle que soit la casse", () => {
  assert.equal(allergiesConcernees(amox, ["AMOXICILLINE"])[0].raison, "même molécule");
  assert.equal(allergiesConcernees(para, ["paracetamol"])[0].raison, "même molécule");
});

test("allergie : synonymes usuels", () => {
  assert.equal(allergiesConcernees(aspirine, ["Aspirine"]).length, 1);
  assert.equal(allergiesConcernees(ibu, ["Aspirine"]).length, 1, "l’aspirine alerte sur les AINS");
  assert.equal(allergiesConcernees(bactrim, ["Sulfamides"]).length, 1);
  assert.equal(allergiesConcernees(bactrim, ["Bactrim"]).length, 1);
  assert.equal(allergiesConcernees(ceftri, ["bêta-lactamines"]).length, 1);
});

test("allergie : pas de fausse alerte", () => {
  assert.deepEqual(allergiesConcernees(para, ["Pénicilline", "Arachide", "Aspirine"]), []);
  assert.deepEqual(allergiesConcernees(amox, ["Iode", "Latex", "Sulfamides"]), []);
  assert.deepEqual(allergiesConcernees(amox, ["", "  ", "ab"]), [], "allergies vides ou trop courtes ignorées");
});

test("allergie : produit saisi à la main, sans classe", () => {
  const libre = { libelle: "Augmentin 1 g", dci: null, classe: null };
  assert.deepEqual(allergiesConcernees(libre, ["Pénicilline"]), [], "sans classe connue, rien à déduire");
  assert.equal(allergiesConcernees(libre, ["Augmentin"]).length, 1, "le nom tapé reste comparé");
});

test("normalisation", () => {
  assert.equal(normaliser("  Bêta-Lactamines "), "beta lactamines");
});

test("prescription : libellé et texte de l’ordonnance", () => {
  assert.equal(
    libelleMedicament({ dci: "Amoxicilline", nomCommercial: null, dosage: "500 mg", forme: "gélule" }),
    "Amoxicilline 500 mg — gélule"
  );
  const lignes = [
    { ...LIGNE_VIDE, libelle: "Amoxicilline 500 mg — gélule", posologie: "1 gélule 3 fois par jour", duree: "7 jours", quantite: "21 gélules" },
    { ...LIGNE_VIDE, libelle: "Paracétamol 1 g — comprimé", posologie: "1 comprimé si douleur, 3 par jour au maximum" },
    { ...LIGNE_VIDE },
  ];
  assert.equal(
    texteOrdonnance(lignes, "Revoir si fièvre persistante"),
    "AMOXICILLINE 500 MG — gélule\n1 gélule 3 fois par jour, pendant 7 jours. Quantité : 21 gélules\n\n" +
      "PARACÉTAMOL 1 G — comprimé\n1 comprimé si douleur, 3 par jour au maximum\n\n" +
      "Remarques : Revoir si fièvre persistante"
  );
  assert.equal(resumePrescription(lignes), "Amoxicilline 500 mg, Paracétamol 1 g");
});

test("prescription : validation", () => {
  assert.match(problemePrescription([{ ...LIGNE_VIDE }]), /au moins un/);
  assert.match(problemePrescription([{ ...LIGNE_VIDE, libelle: "Amoxicilline 500 mg — gélule" }]), /posologie de Amoxicilline/);
  assert.equal(problemePrescription([{ ...LIGNE_VIDE, libelle: "X", posologie: "1/j" }]), null);
});

test("code : format, alphabet sans ambiguïté, unicité", () => {
  const codes = new Set();
  for (let i = 0; i < 2000; i++) {
    const c = genererCode();
    assert.match(c, /^D224-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    codes.add(c);
  }
  assert.equal(codes.size, 2000);
  assert.ok(!/[IO01]/.test(ALPHABET));
});

test("code : recopié à la main", () => {
  assert.equal(normaliserCode("d224 abcd efgh jkmn"), "D224-ABCD-EFGH-JKMN");
  assert.equal(normaliserCode("ABCDEFGHJKMN"), "D224-ABCD-EFGH-JKMN");
  assert.equal(normaliserCode("D224-ABCD-EFGH-JKM0"), null, "0 n’existe pas dans l’alphabet");
  assert.equal(normaliserCode("trop court"), null);
});

test("certificats : arrêt de travail, jours bornes comprises", () => {
  assert.equal(joursArret("2026-10-24", "2026-10-26"), 3);
  assert.equal(joursArret("2026-10-24", "2026-10-24"), 1);
  assert.equal(joursArret("2026-10-26", "2026-10-24"), 0);
  const { titre, texte } = remplirModele("arret", {
    medecin: "Pr Mamadou Diallo", specialite: "Médecine générale", patient: "Alpha Condé",
    naissance: "1990-03-14", genre: "M", aujourdhui: "2026-10-24", debut: "2026-10-24", fin: "2026-10-26", sortiesAutorisees: false,
  });
  assert.equal(titre, "Arrêt de travail du 24/10/2026 au 26/10/2026");
  assert.match(texte, /de 3 jours, du 24 octobre 2026 au 26 octobre 2026 inclus/);
  assert.match(texte, /Alpha Condé, né le 14 mars 1990/);
  assert.match(texte, /Sorties non autorisées/);
  assert.match(texte, /l’intéressé et remis/);
});

test("certificats : accords et pré-remplissage", () => {
  const c = { medecin: "Dr Fatou Bah", specialite: "Pédiatrie", patient: "Aïcha Sow", naissance: "2015-01-01", genre: "F", aujourdhui: "2026-10-01" };
  const sport = remplirModele("sport", { ...c, sport: "football", competition: true });
  assert.match(sport.texte, /née le 1er janvier 2015/);
  assert.match(sport.texte, /football, y compris en compétition/);
  assert.match(remplirModele("constatation", c).texte, /l’intéressée/);
  assert.equal(dateLongue("2026-10-01"), "1er octobre 2026");
});
