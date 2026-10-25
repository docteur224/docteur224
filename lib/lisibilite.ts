/**
 * Contrôle de lisibilité d'une charte : ce qui se lit, ce qui se devine, ce
 * qui disparaît.
 *
 * Deux mesures distinctes, parce que deux problèmes distincts :
 *
 * 1. Le TEXTE suit le contraste WCAG, fondé sur la seule clarté. C'est la
 *    bonne mesure pour des lettres : on lit une forme sombre sur un fond
 *    clair, la teinte n'y change presque rien.
 *
 * 2. Les ICÔNES ne peuvent pas être jugées ainsi. Ce sont des emoji, aux
 *    couleurs fixes qu'aucune feuille de style ne modifie, et elles sont
 *    multicolores. Mesurées au contraste WCAG, toutes les icônes posées sur
 *    les boutons actuels seraient déclarées illisibles — alors qu'on les voit
 *    parfaitement : un cœur rouge se détache d'un fond teal de même clarté
 *    par sa teinte. On mesure donc un écart perceptuel complet (OKLab), qui
 *    tient compte de la teinte autant que de la clarté.
 *
 * Les couleurs des emoji ci-dessous ont été relevées sur un rendu réel plutôt
 * que supposées. Réserve à garder en tête : chaque système dessine ses propres
 * emoji (Microsoft, Apple, Google). Le verdict sur les icônes est donc un bon
 * indicateur, pas une garantie valable sur tous les appareils.
 */

import {
  contraste, hexVersOklch, normaliserHex, construireCharte, CHARTE_DEFAUT,
} from "./charte-couleurs.ts";

export type Verdict = "lisible" | "moyen" | "illisible";

/* ------------------------------------------------------------------ */
/* Texte et éléments d'interface                                       */
/* ------------------------------------------------------------------ */

/** Seuils WCAG 2.1 pour du texte courant : 4,5 pour AA, 3 pour du gros texte. */
export function verdictTexte(ratio: number): Verdict {
  return ratio >= 4.5 ? "lisible" : ratio >= 3 ? "moyen" : "illisible";
}

/** Bordures, pastilles, traits : WCAG demande 3:1 pour un élément d'interface. */
export function verdictElement(ratio: number): Verdict {
  return ratio >= 3 ? "lisible" : ratio >= 2 ? "moyen" : "illisible";
}

/**
 * Juge une mesure en la comparant à ce que donne la charte Docteur 224.
 *
 * Un seuil absolu seul ne vaut rien ici : appliqué tel quel, il déclare
 * illisibles la totalité des chartes — y compris celle d'aujourd'hui, dont
 * les bordures de carte sont à 1,2:1 et le texte des boutons à 3,1:1. Un
 * verdict qui ne varie jamais ne renseigne sur rien, et ces choix-là sont
 * délibérés : un filet de carte discret est voulu discret.
 *
 * La question posée par l'écran de personnalisation n'est pas « cette
 * interface est-elle irréprochable ? » mais « mon choix de couleurs
 * abîme-t-il quelque chose ? ». D'où deux critères :
 *
 *  - un PLANCHER absolu, en deçà duquel plus rien ne se lit, quelle que soit
 *    l'habitude ;
 *  - une DÉGRADATION : en dessous de la cible, on n'alerte que si le choix
 *    fait moins bien que la charte d'origine.
 *
 * Ce qui était déjà imparfait et ne s'aggrave pas reste silencieux : c'est
 * une dette de l'interface, pas la faute de l'utilisateur.
 */
function juger(
  mesure: number, reference: number, plancher: number, cible: number, marge: number,
): Verdict {
  // Là où la charte d'origine passe déjà sous le plancher — du texte accentué
  // sur encart clair est à 2,76:1 — c'est elle qui fait plancher. Sans cela
  // l'outil condamnerait sa propre référence, et tous les verdicts
  // redeviendraient identiques. Faire pire reste sanctionné : le plancher
  // descend, il ne disparaît pas.
  if (mesure < Math.min(plancher, reference) - marge) return "illisible";
  if (mesure >= cible) return "lisible";
  return mesure < reference - marge ? "moyen" : "lisible";
}

/* ------------------------------------------------------------------ */
/* Icônes                                                              */
/* ------------------------------------------------------------------ */

/**
 * Couleurs dominantes des emoji posés sur un aplat de la charte, relevées sur
 * leur rendu réel : chaque entrée donne une couleur et la part du glyphe
 * qu'elle occupe. Seuls les emoji concernés figurent ici — ceux posés sur du
 * blanc ou sur une couleur de statut ne bougent pas avec la charte.
 */
const COULEURS_EMOJI: Record<string, [string, number][]> = {
  "ℹ️": [["#55a1f2", 0.83], ["#447adc", 0.09], ["#f4eeff", 0.07]],
  "↩️": [["#56a1f2", 0.70], ["#f7f0ff", 0.20], ["#447adc", 0.09]],
  "⚠️": [["#fbaf55", 0.66], ["#ffcc5a", 0.24], ["#534951", 0.09]],
  "✅": [["#58d38d", 0.70], ["#46a976", 0.13], ["#f7f1fc", 0.10]],
  "✉️": [["#e6daee", 0.91], ["#d7bbe0", 0.09]],
  "✔️": [["#6859a4", 0.43], ["#7957cc", 0.27], ["#8556db", 0.13], ["#9589ce", 0.07], ["#6f3dce", 0.06]],
  "🎯": [["#dd396a", 0.33], ["#54b4ea", 0.13], ["#c9bad4", 0.10], ["#ccc2dd", 0.10], ["#d64876", 0.09]],
  "🏠": [["#d79d70", 0.27], ["#926456", 0.15], ["#e3b28b", 0.13], ["#e85839", 0.13]],
  "🏥": [["#a69cb1", 0.30], ["#e8d9f8", 0.20], ["#d0b1ec", 0.16], ["#89759d", 0.16], ["#b7a7cb", 0.06]],
  "💬": [["#eae2f1", 0.81], ["#c7b8dc", 0.09], ["#b4a7d4", 0.09]],
  "💾": [["#d9cde7", 0.35], ["#5b5297", 0.31], ["#322657", 0.12], ["#4f3774", 0.07], ["#d62c5d", 0.05]],
  "📅": [["#e0d3ee", 0.55], ["#329efa", 0.20], ["#a69db5", 0.09], ["#cfb6e5", 0.07]],
  "📋": [["#e5dcef", 0.49], ["#e19d69", 0.27], ["#99919d", 0.15]],
  "📜": [["#ffd095", 0.64], ["#e39362", 0.19], ["#fec97a", 0.07], ["#f8b382", 0.06]],
  "📞": [["#e2345e", 0.38], ["#e43593", 0.21], ["#e54571", 0.13], ["#d351a1", 0.12], ["#b04492", 0.07]],
  "📢": [["#da356c", 0.42], ["#ccc7d4", 0.16], ["#bbacd1", 0.14], ["#c3b8d3", 0.08], ["#f14f87", 0.07]],
  "🔄": [["#56a0f2", 0.71], ["#f8f0ff", 0.18], ["#447adc", 0.09]],
  "🔍": [["#62ceea", 0.49], ["#63538b", 0.24], ["#8e5b91", 0.11], ["#4eb3e5", 0.07]],
  "🔎": [["#62ceea", 0.49], ["#62528b", 0.24], ["#905a93", 0.11], ["#4eb3e6", 0.07]],
  "🔒": [["#f8a34e", 0.59], ["#fdc750", 0.14], ["#e77558", 0.07]],
  "🕐": [["#d9d6db", 0.52], ["#6b676f", 0.36], ["#969499", 0.07]],
  "🗣️": [["#4a2e74", 0.54], ["#59398a", 0.30], ["#644299", 0.16]],
  "🗺️": [["#4ba1eb", 0.27], ["#53d394", 0.15], ["#2687d1", 0.14], ["#c4b4cf", 0.14], ["#dbcee4", 0.10]],
  "🚩": [["#ee376d", 0.62], ["#f2b293", 0.14], ["#fcc7ad", 0.10], ["#e1926d", 0.10]],
  "🛠️": [["#d1cadc", 0.40], ["#92636c", 0.16], ["#c7bad5", 0.13], ["#aca6b5", 0.12], ["#bab5c6", 0.09]],
  "🛡️": [["#378bed", 0.36], ["#52c9ff", 0.32], ["#b5aebd", 0.17], ["#50aff0", 0.06]],
  "🧑": [["#efa52e", 0.46], ["#fbd138", 0.34], ["#e7964e", 0.09]],
  "🧭": [["#dbcedd", 0.31], ["#dfa349", 0.21], ["#afa2ac", 0.14], ["#c7bac6", 0.10], ["#dc9238", 0.07]],
  "🧾": [["#ded7e7", 0.77], ["#9c98a3", 0.15]],
};

/**
 * Écart perceptuel entre deux couleurs, en OKLab (×100).
 * Au-delà de 15, deux aplats se distinguent franchement ; en deçà, les formes
 * se fondent. Seuil calibré sur les rendus actuels : il laisse passer tout ce
 * qui se voit aujourd'hui, et ne retient que ce qui disparaît réellement.
 */
export function ecartPerceptuel(a: string, b: string): number {
  const p = hexVersOklch(a), q = hexVersOklch(b);
  const rad = (d: number) => (d * Math.PI) / 180;
  const ap = [p.C * Math.cos(rad(p.H)), p.C * Math.sin(rad(p.H))];
  const aq = [q.C * Math.cos(rad(q.H)), q.C * Math.sin(rad(q.H))];
  return Math.hypot(p.L - q.L, ap[0] - aq[0], ap[1] - aq[1]) * 100;
}

const SEUIL_ECART = 15;

/** Part du glyphe (0 à 1) qui se détache nettement de ce fond. */
export function partVisible(emoji: string, fond: string): number {
  const couleurs = COULEURS_EMOJI[emoji];
  if (!couleurs) return 1; // emoji non relevé : on ne prétend rien savoir
  return couleurs.reduce(
    (s, [hex, part]) => s + (ecartPerceptuel(hex, fond) >= SEUIL_ECART ? part : 0),
    0,
  );
}

/**
 * Une icône dont plus de la moitié se détache est franche ; en dessous d'un
 * quart, il ne reste qu'une tache et le dessin n'est plus reconnaissable.
 */
export function verdictIcone(part: number): Verdict {
  return part >= 0.6 ? "lisible" : part >= 0.25 ? "moyen" : "illisible";
}

/* ------------------------------------------------------------------ */
/* Contrôle d'une charte                                               */
/* ------------------------------------------------------------------ */

export type Controle = {
  /** Ce que l'utilisateur reconnaît à l'écran, pas un nom de variable. */
  libelle: string;
  categorie: "texte" | "element" | "icone";
  verdict: Verdict;
  /** Rapport de contraste pour le texte, part visible (0-1) pour une icône. */
  mesure: number;
  /** La même mesure sous la charte Docteur 224, pour situer l'écart. */
  reference: number;
  premierPlan: string;
  fond: string;
};

/** Où chaque icône est réellement posée, dans les espaces connectés. */
const ICONES_PLACEES: { emoji: string[]; fond: "teal" | "teal-hover" | "blue"; ou: string }[] = [
  {
    fond: "teal",
    ou: "les boutons et pastilles d'action",
    emoji: ["ℹ️", "↩️", "✅", "✉️", "✔️", "🎯", "🏠", "🏥", "💬", "💾", "📅", "📋",
      "📜", "📞", "📢", "🔍", "🔎", "🔒", "🕐", "🗣️", "🗺️", "🚩", "🛠️", "🧑", "🧭", "🧾"],
  },
  { fond: "teal-hover", ou: "les boutons au survol", emoji: ["✉️", "✔️", "💾", "📢", "🔎", "🧭"] },
  { fond: "blue", ou: "les aplats de la couleur principale", emoji: ["🔄", "🛡️", "📢"] },
];

/**
 * Passe en revue les endroits où la charte décide de la lisibilité, et rend un
 * verdict par endroit. Fonction pure : ni DOM, ni réseau, ni état.
 */
export function controlerCharte(principaleSaisie: string, accentSaisie: string): Controle[] {
  const c = construireCharte(principaleSaisie, accentSaisie) as Record<string, string>;
  const ref = construireCharte(CHARTE_DEFAUT.principale, CHARTE_DEFAUT.accent) as Record<string, string>;
  const blanc = "#ffffff";
  const controles: Controle[] = [];

  /** Les deux palettes subissent le même calcul : seul l'écart est jugé. */
  const paire = (
    libelle: string,
    categorie: "texte" | "element",
    devant: string,
    derriere: string,
  ) => {
    const lire = (p: Record<string, string>) =>
      contraste(p[devant] ?? devant, p[derriere] ?? derriere);
    const mesure = lire(c), reference = lire(ref);
    // Un texte sous 3:1 ne se lit plus ; un filet sous 1,1:1 a disparu.
    const [plancher, cible] = categorie === "texte" ? [3, 4.5] : [1.1, 3];
    controles.push({
      libelle, categorie, mesure, reference,
      verdict: juger(mesure, reference, plancher, cible, 0.15),
      premierPlan: c[devant] ?? devant,
      fond: c[derriere] ?? derriere,
    });
  };

  paire("Titres des bandeaux", "texte", "sur-principale", "blue");
  paire("Texte des boutons", "texte", "sur-accent", "teal");
  paire("Texte des boutons au survol", "texte", "sur-accent", "teal-hover");
  paire("Texte courant sur les cartes", "texte", "ink", blanc);
  paire("Texte secondaire sur les cartes", "texte", "muted", blanc);
  paire("Texte courant sur le fond de page", "texte", "ink", "bg");
  paire("Texte secondaire sur le fond de page", "texte", "muted", "bg");
  paire("Liens et titres colorés", "texte", "blue", blanc);
  // Dans les encarts clairs, le texte est bleu dans 112 cas sur 120 et
  // accentué dans les autres : ce sont ces deux couples-là qu'on vérifie,
  // pas une combinaison plausible mais absente de l'interface.
  paire("Texte des encarts clairs", "texte", "blue", "teal-soft");
  paire("Texte accentué sur encart clair", "texte", "teal", "teal-soft");
  paire("Bordures des cartes", "element", "line", blanc);
  paire("Bordures des encarts clairs", "element", "teal-line", "teal-soft");

  // Pour les icônes, retenir la pire des vingt-six ne dirait rien : sur
  // autant d'emoji multicolores, il s'en trouve toujours une qui jure avec
  // n'importe quel fond. On compte donc combien d'icônes le choix fait
  // basculer, par rapport à ce que donne la charte d'origine au même endroit.
  for (const { emoji, fond, ou } of ICONES_PLACEES) {
    const perdues = emoji.filter(
      (e) => partVisible(e, c[fond]) < 0.25 && partVisible(e, ref[fond]) >= 0.25,
    );
    const part = emoji.reduce((s, e) => s + partVisible(e, c[fond]), 0) / emoji.length;
    const partRef = emoji.reduce((s, e) => s + partVisible(e, ref[fond]), 0) / emoji.length;
    controles.push({
      libelle: perdues.length
        ? `Icônes sur ${ou} — ${perdues.length === 1
            ? "une icône devient invisible"
            : `${perdues.length} icônes deviennent invisibles`} (${perdues.slice(0, 3).join(" ")})`
        : `Icônes sur ${ou}`,
      categorie: "icone",
      mesure: part,
      reference: partRef,
      // Une icône perdue suffit à condamner : elle a bel et bien disparu.
      verdict: perdues.length >= 3 ? "illisible"
        : perdues.length >= 1 ? "moyen"
        : juger(part, partRef, 0.2, 0.5, 0.05),
      premierPlan: perdues[0] ?? "",
      fond: c[fond],
    });
  }

  return controles;
}

/**
 * Le verdict d'ensemble : celui du maillon le plus faible. Une charte dont un
 * seul endroit est illisible n'est pas « presque bonne ».
 */
export function verdictGlobal(controles: Controle[]): Verdict {
  if (controles.some((x) => x.verdict === "illisible")) return "illisible";
  if (controles.some((x) => x.verdict === "moyen")) return "moyen";
  return "lisible";
}

/**
 * L'accent doit rester plus clair que la principale : l'inverse crée des
 * bandeaux pâles et des boutons sombres, et renverse toute la hiérarchie
 * visuelle. Avertissement de composition, pas de lisibilité — d'où sa place
 * à part.
 */
export function accentPlusSombre(principale: string, accent: string): boolean {
  const p = normaliserHex(principale), a = normaliserHex(accent);
  if (!p || !a) return false;
  return hexVersOklch(a).L < hexVersOklch(p).L;
}
