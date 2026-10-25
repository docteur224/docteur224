/*
 * Tests unitaires : charte de couleurs personnalisable.
 *
 *   Fidélité : réinjecter les deux couleurs d'origine redonne la palette
 *     actuelle, token par token. C'est ce qui rend exact le « retour à la
 *     charte par défaut » — sans quoi un clic sur « Réinitialiser »
 *     rendrait une apparence seulement ressemblante.
 *   Étanchéité : aucune saisie ne ressort autrement qu'en six chiffres
 *     hexadécimaux. Le résultat part dans une feuille de style : une chaîne
 *     reprise telle quelle laisserait écrire `red;}html{display:none`.
 *   Structure : quelles que soient les couleurs choisies, le fond reste
 *     clair et l'encre sombre. C'est le rôle du mode « teinte », qui garde
 *     la clarté d'origine et n'emprunte que la teinte.
 *   Icônes : les emoji gardent leurs couleurs, aucune feuille de style ne
 *     les change. Mesurées au contraste WCAG — qui ne regarde que la clarté
 *     — toutes celles posées sur les boutons actuels seraient déclarées
 *     illisibles, alors qu'on les voit. D'où un écart perceptuel complet.
 *
 * Usage : node --test "scripts/tests/*.test.mjs"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  construireCharte, CHARTE_DEFAUT, charteVersCss, normaliserHex, contraste,
} from "../../lib/charte-couleurs.ts";
import {
  controlerCharte, verdictGlobal, verdictTexte, verdictIcone, partVisible,
  accentPlusSombre, ecartPerceptuel, COULEURS_EMOJI, ICONES_PLACEES,
} from "../../lib/lisibilite.ts";
import { CHARTES_PRETES } from "../../lib/chartes-pretes.ts";

const RACINE = fileURLToPath(new URL("../../", import.meta.url));

/** La palette telle qu'elle est écrite dans globals.css aujourd'hui. */
const PALETTE_ACTUELLE = {
  blue: "#15506b", "blue-deep": "#0e3b50", "blue-line": "#bfd3f6", teal: "#2e9cca",
  "teal-hover": "#2790bc", "teal-soft": "#e3f1f8", "teal-line": "#cde6f2",
  bg: "#eaf1f6", ink: "#16242e", "ink-soft": "#3f5360", muted: "#647a89",
  "muted-soft": "#9aa8b2", line: "#e2ebf0",
};

const EXTREMES = [
  ["terracotta", "#7a2e1e", "#c56a4a"],
  ["jaune vif", "#f2e205", "#341f97"],
  ["noir & or", "#000000", "#d4af37"],
  ["gris pur", "#444444", "#999999"],
  ["blanc sur blanc", "#ffffff", "#eeeeee"],
  ["fuchsia saturé", "#ff00aa", "#ff66cc"],
];

test("la charte par défaut restitue la palette actuelle, token par token", () => {
  const c = construireCharte(CHARTE_DEFAUT.principale, CHARTE_DEFAUT.accent);
  for (const [nom, attendu] of Object.entries(PALETTE_ACTUELLE)) {
    assert.equal(c[nom], attendu, `--${nom}`);
  }
});

test("aucune saisie ne ressort autrement qu'en hexadécimal", () => {
  for (const saisie of ["red;}html{display:none}", "#fff;}*{color:red", "var(--x)",
    "url(javascript:alert(1))", "", "   ", "#12345", "rgb(1,2,3)", "#abcdeg"]) {
    const css = charteVersCss(saisie, "#2e9cca");
    assert.match(css, /^[-a-z0-9:#;]+$/, `saisie ${JSON.stringify(saisie)}`);
  }
});

test("normalisation des couleurs saisies", () => {
  assert.equal(normaliserHex("#ABC"), "#aabbcc", "forme courte");
  assert.equal(normaliserHex("  2E9CCA "), "#2e9cca", "sans dièse, avec espaces");
  assert.equal(normaliserHex("red"), null, "couleur nommée refusée");
  assert.equal(normaliserHex("#12345"), null, "longueur invalide refusée");
});

test("le texte courant reste lisible quelles que soient les couleurs", () => {
  for (const [nom, p, a] of EXTREMES) {
    const c = construireCharte(p, a);
    assert.ok(contraste(c.ink, c.bg) >= 4.5,
      `${nom} : encre sur fond de page ${contraste(c.ink, c.bg).toFixed(2)}:1`);
    assert.ok(contraste(c.ink, "#ffffff") >= 4.5,
      `${nom} : encre sur carte ${contraste(c.ink, "#ffffff").toFixed(2)}:1`);
  }
});

test("seuils de verdict", () => {
  assert.equal(verdictTexte(4.5), "lisible");
  assert.equal(verdictTexte(3.2), "moyen");
  assert.equal(verdictTexte(2.9), "illisible");
  assert.equal(verdictIcone(0.8), "lisible");
  assert.equal(verdictIcone(0.3), "moyen");
  assert.equal(verdictIcone(0.1), "illisible");
});

test("un accent plus sombre que la principale est signalé", () => {
  assert.equal(accentPlusSombre("#f2e205", "#341f97"), true, "jaune pâle + violet sombre");
  assert.equal(accentPlusSombre("#15506b", "#2e9cca"), false, "charte bien ordonnée");
});

test("une icône se juge sur la teinte autant que sur la clarté", () => {
  // Le contraste WCAG déclarerait ce cœur invisible : il a presque la clarté
  // du fond. On le voit pourtant très bien, parce que la teinte diffère.
  assert.ok(contraste("#f63d6d", "#2e9cca") < 1.6, "clartés effectivement voisines");
  assert.ok(ecartPerceptuel("#f63d6d", "#2e9cca") >= 15, "mais perceptuellement distinct");
  // Deux bleus voisins, eux, se confondent vraiment.
  assert.ok(ecartPerceptuel("#55a1f2", "#2e9cca") < 15);
});

test("une icône pâle disparaît sur un fond clair et ressort sur un fond foncé", () => {
  assert.ok(partVisible("✉️", "#ffffff") < 0.25, "enveloppe pâle sur blanc");
  assert.ok(partVisible("✉️", "#15506b") >= 0.6, "la même sur un aplat foncé");
});

test("la charte Docteur 224 se valide elle-même", () => {
  // Sans cette propriété l'outil ne sert à rien : jugée sur des seuils
  // absolus, l'interface actuelle est recalée (filets de carte à 1,2:1,
  // texte des boutons à 3,1:1), et toutes les chartes reçoivent alors le
  // même verdict. Un verdict constant ne renseigne sur rien.
  const ctrl = controlerCharte(CHARTE_DEFAUT.principale, CHARTE_DEFAUT.accent);
  const fautifs = ctrl.filter((x) => x.verdict !== "lisible").map((x) => x.libelle);
  assert.deepEqual(fautifs, [], "la référence doit passer tous ses propres contrôles");
  assert.equal(verdictGlobal(ctrl), "lisible");
});

test("un choix qui fait disparaître des icônes est signalé, avec lesquelles", () => {
  // Or sur or : les emoji dorés se fondent dans le bouton.
  const ctrl = controlerCharte("#111111", "#d4af37");
  const icones = ctrl.find((x) => x.categorie === "icone" && x.verdict !== "lisible");
  assert.ok(icones, "la perte d'icônes doit être détectée");
  assert.match(icones.libelle, /invisible/);
  assert.ok(icones.premierPlan.length > 0, "l'icône fautive doit être nommée");
});

test("là où la référence est déjà sous le plancher, c'est elle qui fait plancher", () => {
  // Le texte accentué sur encart clair est à 2,76:1 dans l'interface
  // actuelle, sous les 3:1 réglementaires. Un plancher absolu condamnerait
  // donc la charte d'origine — et, de proche en proche, toutes les autres.
  const encart = controlerCharte(CHARTE_DEFAUT.principale, CHARTE_DEFAUT.accent)
    .find((x) => x.libelle === "Texte accentué sur encart clair");
  assert.ok(encart.mesure < 3, `mesuré ${encart.mesure.toFixed(2)}:1`);
  assert.equal(encart.verdict, "lisible", "la référence ne se condamne pas elle-même");

  // Mais faire pire au même endroit reste sanctionné.
  const pire = controlerCharte("#fdf6b2", "#fefce8")
    .find((x) => x.libelle === "Texte accentué sur encart clair");
  assert.ok(pire.mesure < encart.mesure);
  assert.equal(pire.verdict, "illisible");
});

test("une dette déjà présente n'est pas imputée au choix de l'utilisateur", () => {
  // Le texte des boutons est à 3,12:1 avec la charte d'origine. Le terracotta
  // fait mieux (3,79:1) : rien à signaler de ce côté.
  const ctrl = controlerCharte("#7a2e1e", "#c56a4a");
  const boutons = ctrl.find((x) => x.libelle === "Texte des boutons");
  assert.ok(boutons.mesure > boutons.reference);
  assert.equal(boutons.verdict, "lisible");
});

test("une charte franchement illisible est recalée", () => {
  // Deux jaunes très pâles : boutons et bandeaux deviennent illisibles.
  assert.equal(verdictGlobal(controlerCharte("#fdf6b2", "#fefce8")), "illisible");
});

test("le verdict d'ensemble est celui du maillon le plus faible", () => {
  const ctrl = controlerCharte("#fdf6b2", "#fefce8");
  assert.ok(ctrl.some((x) => x.verdict === "illisible"));
  assert.equal(verdictGlobal(ctrl), "illisible");
  assert.ok(ctrl.length >= 14, "tous les endroits sensibles sont passés en revue");
});

test("chaque contrôle décrit un endroit reconnaissable, pas une variable", () => {
  for (const c of controlerCharte("#7a2e1e", "#c56a4a")) {
    assert.doesNotMatch(c.libelle, /--|var\(/, c.libelle);
    assert.ok(c.libelle.length > 8, c.libelle);
  }
});

test("chaque charte proposée passe le contrôle de lisibilité", () => {
  // Proposer une charte que notre propre outil condamne serait indéfendable.
  // Ce test est le garde-fou du jour où un seuil bougera : sans lui, un
  // préréglage se mettrait à avertir sans que rien ne le signale.
  for (const c of CHARTES_PRETES) {
    const ctrl = controlerCharte(c.principale, c.accent);
    const fautifs = ctrl.filter((x) => x.verdict !== "lisible").map((x) => x.libelle);
    assert.deepEqual(fautifs, [], `${c.nom} (${c.principale} / ${c.accent})`);
    assert.equal(accentPlusSombre(c.principale, c.accent), false, `${c.nom} : accent trop sombre`);
  }
});

test("les chartes proposées sont distinctes et valides", () => {
  const vues = new Set();
  for (const c of CHARTES_PRETES) {
    assert.ok(normaliserHex(c.principale), `${c.nom} : principale invalide`);
    assert.ok(normaliserHex(c.accent), `${c.nom} : accent invalide`);
    const cle = `${normaliserHex(c.principale)}|${normaliserHex(c.accent)}`;
    assert.ok(!vues.has(cle), `${c.nom} : doublon`);
    vues.add(cle);
  }
});

/** Les fichiers des espaces connectés, là où la charte s'applique. */
function* fichiersConnectes() {
  const zones = ["app/espace-medecin", "app/espace-admin", "app/espace-assistant",
    "app/espace-etablissement", "app/patient", "components/admin", "components/medecin",
    "components/patient", "components/assistant", "components/etablissement",
    "components/pro", "components/compte"];
  function* descendre(dir) {
    let entrees;
    try { entrees = readdirSync(dir); } catch { return; }
    for (const e of entrees) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) yield* descendre(p);
      else if (p.endsWith(".tsx")) yield p;
    }
  }
  for (const z of zones) yield* descendre(join(RACINE, z));
}

test("aucune icône posée sur un aplat de la charte n'échappe au contrôle", () => {
  /*
   * `partVisible` rend 1 pour un emoji qu'elle ne connaît pas : elle ne
   * prétend pas savoir. C'est honnête, mais silencieux — une icône ajoutée
   * demain sur un bouton passerait sans être jugée. Ce test est le rappel :
   * il relit le code et exige que toute icône posée sur une couleur de la
   * charte figure dans la table des couleurs relevées.
   */
  // La classe de fond et l'icône sont presque toujours sur des lignes
  // différentes — l'attribut d'un côté, le contenu de l'autre. Un balayage
  // ligne à ligne ne trouve donc RIEN et le test passe à vide. D'où la
  // fenêtre qui suit l'aplat, et le garde-fou de volume plus bas.
  const surCharte = /\b(bg-teal-hover|bg-teal|bg-blue)\b/g;
  const inconnues = new Map();
  let reperees = 0;

  for (const fichier of fichiersConnectes()) {
    const texte = readFileSync(fichier, "utf8");
    for (const m of texte.matchAll(surCharte)) {
      const fenetre = texte.slice(m.index, m.index + 300);
      for (const icone of fenetre.match(/\p{Extended_Pictographic}/gu) ?? []) {
        reperees++;
        if (!Object.keys(COULEURS_EMOJI).some((e) => e.startsWith(icone))) {
          inconnues.set(icone, (inconnues.get(icone) ?? 0) + 1);
        }
      }
    }
  }

  // Sans cela, une expression devenue inopérante ferait passer le test en
  // silence : c'est précisément le défaut qu'il est chargé de prévenir.
  assert.ok(reperees > 20, `le balayage ne trouve que ${reperees} icônes : il ne cherche plus au bon endroit`);
  assert.deepEqual([...inconnues.keys()], [],
    "icônes à relever puis à ajouter à COULEURS_EMOJI");
});

test("chaque icône surveillée a bien ses couleurs relevées", () => {
  // L'inverse du test précédent : la liste des emplacements ne doit pas
  // citer d'icône absente de la table, sans quoi elle serait réputée
  // visible partout et le contrôle ne dirait plus rien.
  const manquantes = [];
  for (const { emoji, ou } of ICONES_PLACEES) {
    for (const e of emoji) if (!COULEURS_EMOJI[e]) manquantes.push(`${e} (${ou})`);
  }
  assert.deepEqual(manquantes, []);
});
