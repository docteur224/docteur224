/*
 * Tests unitaires du suivi d'absence (lib/suivi-absence.ts) : la règle des
 * seuils, et elle seule.
 *
 * C'est le seul endroit où un patient devient « à surveiller » ou « à
 * risque ». La base rend des comptes bruts ; si cette fonction se trompe,
 * tous les signaux de l'application se trompent ensemble — pastille du
 * tableau de bord, bloc de la fiche patient, liste et compteurs du menu.
 *
 * Ce qui est vérifié n'est pas que les fonctions répondent, mais que les
 * garde-fous tiennent quand on essaie de passer à côté :
 *
 *   - un patient sans absence n'a AUCUN signal, quel que soit son historique ;
 *   - le nombre d'absences et le TAUX déclenchent indépendamment — c'est
 *     toute la raison d'avoir deux chemins (3 sur 40 ≠ 3 sur 4) ;
 *   - le taux ne déclenche pas en deçà du minimum de rendez-vous, sinon une
 *     absence sur une suffirait à crier au loup ;
 *   - des seuils réglés par le praticien sont RÉELLEMENT pris en compte ;
 *   - un mois sans rendez-vous terminé n'a pas de taux (null), et non 0 %.
 *
 * node:test, sans dépendance ni base.
 *
 * Usage : node --test "scripts/tests/*.test.mjs"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  niveauRisque,
  tauxNoShow,
  tauxPresence,
  tauxNoShowMois,
  formatPourcent,
  estSignale,
  detailAbsences,
  remplirModele,
  manqueAGagner,
  SEUILS_DEFAUT,
  APPARENCE_NIVEAU,
  MODELE_AVERTISSEMENT_DEFAUT,
} from "../../lib/suivi-absence.ts";

/* ========== Les comptes ========== */

test("le taux de no-show est le rapport des absences aux rendez-vous terminés", () => {
  assert.equal(tauxNoShow({ absences: 3, termines: 12 }), 0.25);
  assert.equal(tauxNoShow({ absences: 0, termines: 10 }), 0);
  assert.equal(tauxNoShow({ absences: 2, termines: 2 }), 1);
});

test("sans rendez-vous terminé, le taux vaut zéro et ne divise pas par zéro", () => {
  assert.equal(tauxNoShow({ absences: 0, termines: 0 }), 0);
  assert.ok(Number.isFinite(tauxNoShow({ absences: 5, termines: 0 })));
});

test("présence et no-show sont les deux faces du même chiffre", () => {
  const c = { absences: 3, termines: 12 };
  assert.equal(tauxPresence(c) + tauxNoShow(c), 1);
  // C'est la cohérence que le tableau de bord et le menu doivent afficher :
  // 25 % de no-show, donc 75 % de présence. Jamais deux chiffres indépendants.
  assert.equal(formatPourcent(tauxPresence(c)), "75 %");
});

test("un mois sans rendez-vous terminé n'a pas de taux du tout", () => {
  // null, et non 0 : « personne ne m'a fait faux bond » et « je n'ai rien à
  // compter » ne se disent pas de la même façon.
  assert.equal(tauxNoShowMois({ honores: 0, absents: 0 }), null);
  assert.equal(tauxNoShowMois(undefined), null);
  assert.equal(tauxNoShowMois({ honores: 9, absents: 1 }), 0.1);
});

test("le taux d'un mois ignore ce qui n'est pas terminé", () => {
  // Les annulés ne sont pas passés à cette fonction : la série mensuelle les
  // rend à part, précisément pour qu'ils n'alourdissent aucun des deux taux.
  const mois = { honores: 18, absents: 2, annules: 30, total: 50 };
  assert.equal(tauxNoShowMois(mois), 0.1);
});

/* ========== Les trois niveaux ========== */

test("aucune absence, aucun signal — même sur un gros historique", () => {
  assert.equal(niveauRisque({ absences: 0, termines: 0 }), "correct");
  assert.equal(niveauRisque({ absences: 0, termines: 300 }), "correct");
  assert.equal(estSignale("correct"), false);
});

test("le seuil bas fait passer « à surveiller »", () => {
  // 1 absence sur 40 : un accident, pas un comportement.
  assert.equal(niveauRisque({ absences: 1, termines: 40 }), "correct");
  assert.equal(niveauRisque({ absences: 2, termines: 40 }), "a_surveiller");
});

test("le seuil haut fait passer « à risque », quel que soit le volume", () => {
  // Le cas du prompt : 3 absences sur 40 est un signal, mais le nombre seul
  // suffit à le poser.
  assert.equal(niveauRisque({ absences: 3, termines: 40 }), "a_risque");
  assert.equal(niveauRisque({ absences: 12, termines: 200 }), "a_risque");
});

test("le TAUX déclenche aussi, indépendamment du nombre", () => {
  // 2 absences sur 4 = 50 % : le compteur seul dirait « à surveiller », le
  // taux dit « à risque ». C'est le second chemin, et il doit gagner.
  assert.equal(niveauRisque({ absences: 2, termines: 4 }), "a_risque");
});

test("le minimum de rendez-vous empêche une absence unique de crier au loup", () => {
  // 1 sur 1 = 100 % de no-show, mais 1 seul rendez-vous terminé : en deçà de
  // `miniRdv`, le taux ne déclenche rien. Sans ce garde-fou, tout nouveau
  // patient absent une fois serait « à risque ».
  assert.equal(niveauRisque({ absences: 1, termines: 1 }), "correct");
  assert.equal(niveauRisque({ absences: 1, termines: 2 }), "correct");
  // À 3 rendez-vous terminés, 1 absence fait 33 % : le taux s'applique. C'est
  // la règle demandée ; elle se desserre en relevant miniRdv ou tauxHaut.
  assert.equal(niveauRisque({ absences: 1, termines: 3 }), "a_risque");
});

/* ========== Les seuils paramétrables ========== */

test("des seuils réglés par le praticien sont réellement pris en compte", () => {
  const indulgents = { seuilBas: 4, seuilHaut: 8, tauxHaut: 0.5, miniRdv: 10, periodeMois: 12 };

  // Ce qui serait « à risque » par défaut redevient discret.
  assert.equal(niveauRisque({ absences: 3, termines: 40 }, indulgents), "correct");
  assert.equal(niveauRisque({ absences: 1, termines: 3 }, indulgents), "correct");
  assert.equal(niveauRisque({ absences: 4, termines: 40 }, indulgents), "a_surveiller");
  assert.equal(niveauRisque({ absences: 8, termines: 40 }, indulgents), "a_risque");

  // Le taux relevé à 50 %, applicable à partir de 10 rendez-vous.
  assert.equal(niveauRisque({ absences: 5, termines: 10 }, indulgents), "a_risque");
  assert.equal(niveauRisque({ absences: 4, termines: 10 }, indulgents), "a_surveiller");
});

test("des seuils stricts resserrent les deux chemins", () => {
  const stricts = { seuilBas: 1, seuilHaut: 2, tauxHaut: 0.15, miniRdv: 5, periodeMois: 6 };
  assert.equal(niveauRisque({ absences: 1, termines: 40 }, stricts), "a_surveiller");
  assert.equal(niveauRisque({ absences: 2, termines: 40 }, stricts), "a_risque");
  // 1 sur 5 = 20 % > 15 % : le taux prend le relais du compteur.
  assert.equal(niveauRisque({ absences: 1, termines: 5 }, stricts), "a_risque");
});

test("les valeurs par défaut sont bien celles du prompt", () => {
  assert.equal(SEUILS_DEFAUT.seuilBas, 2);
  assert.equal(SEUILS_DEFAUT.seuilHaut, 3);
  assert.equal(SEUILS_DEFAUT.tauxHaut, 0.3);
  assert.equal(SEUILS_DEFAUT.miniRdv, 3);
  assert.equal(SEUILS_DEFAUT.periodeMois, 12);
  // Le seuil haut au-dessus du bas, sinon « à surveiller » serait injoignable.
  assert.ok(SEUILS_DEFAUT.seuilHaut >= SEUILS_DEFAUT.seuilBas);
});

/* ========== Lecture sans la couleur ========== */

test("chaque niveau porte un libellé et une icône, pas seulement une teinte", () => {
  for (const niveau of ["correct", "a_surveiller", "a_risque"]) {
    const a = APPARENCE_NIVEAU[niveau];
    assert.ok(a.libelle.length > 0, `libellé manquant pour ${niveau}`);
    assert.ok(a.icone.length > 0, `icône manquante pour ${niveau}`);
    assert.ok(a.classe.includes("text-"), `teinte de texte manquante pour ${niveau}`);
  }
  // Aucun rouge : c'est la couleur des échecs ailleurs dans l'application, et
  // elle ferait lire un reproche là où il n'y a qu'un constat.
  for (const niveau of ["a_surveiller", "a_risque"]) {
    assert.ok(!APPARENCE_NIVEAU[niveau].classe.includes("red"));
  }
});

test("le détail se lit en français, au pluriel près", () => {
  assert.equal(detailAbsences({ absences: 1, termines: 4 }), "1 absence sur 4 rendez-vous");
  assert.equal(detailAbsences({ absences: 3, termines: 12 }), "3 absences sur 12 rendez-vous");
});

/* ========== Le message ========== */

test("le modèle remplace le prénom et le professionnel", () => {
  const texte = remplirModele(MODELE_AVERTISSEMENT_DEFAUT, {
    prenom: "Fatoumata",
    professionnel: "Dr Aïssata Barry",
  });
  assert.ok(texte.includes("Fatoumata"));
  assert.ok(texte.includes("Dr Aïssata Barry"));
  assert.ok(!texte.includes("["), "une marque n'a pas été remplacée");
});

test("le modèle tolère la graphie des marques et comble les manques", () => {
  assert.equal(
    remplirModele("Bonjour [prenom], chez [Professionnel].", {
      prenom: "Mamadou",
      professionnel: "Dr Camara",
    }),
    "Bonjour Mamadou, chez Dr Camara."
  );
  // Une fiche cabinet peut n'avoir qu'un nom : on ne laisse pas « Bonjour , ».
  assert.ok(
    remplirModele("Bonjour [Prénom].", { prenom: "", professionnel: "" }).includes(
      "Madame, Monsieur"
    )
  );
});

test("le modèle par défaut n'annonce aucune sanction", () => {
  const interdits = ["sanction", "bloqu", "interdi", "pénalit", "amende", "refus"];
  const texte = MODELE_AVERTISSEMENT_DEFAUT.toLowerCase();
  for (const mot of interdits) {
    assert.ok(!texte.includes(mot), `le modèle contient « ${mot} »`);
  }
});

/* ========== Le manque à gagner ========== */

test("le manque à gagner multiplie les créneaux perdus par le tarif", () => {
  assert.equal(manqueAGagner(4, 150000), 600000);
});

test("sans prix ferme, il n'y a pas de manque à gagner à afficher", () => {
  // « 0 GNF » se lirait comme « cela ne coûte rien » : on préfère ne rien dire.
  assert.equal(manqueAGagner(4, null), null);
  assert.equal(manqueAGagner(4, 0), null);
});
