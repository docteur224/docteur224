/*
 * Icône (emoji) d'une spécialité, déduite de son nom.
 *
 * La table `specialites` a une colonne `emoji` facultative : les huit
 * spécialités du seed la renseignent, mais tout ce que l'admin ajoute
 * ensuite arrivait à NULL — d'où le même stéthoscope affiché partout sur
 * l'accueil. Ce module donne une icône plausible à n'importe quel nom, sans
 * qu'on ait à maintenir une correspondance à la main.
 *
 * Trois niveaux, du plus sûr au plus approximatif :
 *   1. `devinerEmojiSpecialite` — dictionnaire de racines médicales. Instantané,
 *      hors ligne, déterministe, couvre la quasi-totalité des spécialités réelles.
 *   2. l'IA (route /api/admin/emoji-specialite), quand le dictionnaire sèche.
 *   3. `emojiDeSecours` — pastille tirée d'un jeu neutre selon le nom, pour ne
 *      jamais retomber sur une icône déjà prise par une autre spécialité.
 *
 * Aucune directive "use client" : ce fichier est importé aussi bien par le
 * navigateur (l'écran admin) que par le serveur (lecture publique, route IA).
 */

/**
 * Minuscules sans accents, tirets et apostrophes ramenés à des espaces.
 *
 * Le tiret doit devenir un espace, sinon « Sage-femme » et « Oto-rhino » ne
 * correspondraient à aucune racine composée.
 */
export function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[-–’']/g, " ");
}

/**
 * Racines médicales → emoji, dans l'ordre de priorité.
 *
 * L'ordre compte : la première racine trouvée gagne. Les termes précis passent
 * donc avant les génériques — « chirurgie dentaire » doit donner 🦷 et non le
 * bistouri, « radiothérapie » ☢️ et non l'imagerie.
 *
 * Une racine est cherchée en DÉBUT de mot (voir la regex plus bas) : « cardi »
 * attrape « cardiologie » et « cardiaque » sans jamais matcher au milieu d'un
 * autre terme.
 */
const RACINES: [racine: string, emoji: string][] = [
  // — Précisions qui doivent passer avant leur racine générique —
  ["radiotherap", "☢️"],
  ["orthopt", "👓"],
  ["orthophon", "🗣️"],
  ["orthodont", "🦷"],
  ["medecine traditionnelle", "🌿"],
  ["medecine generale", "🩺"],
  // Distincte du stéthoscope de la médecine générale : les deux se côtoient
  // en tête de l'accueil, deux vignettes identiques y feraient doublon.
  ["medecine interne", "🧑‍⚕️"],
  ["medecine du travail", "👷"],
  ["medecine du sport", "🏃"],
  ["medecine legale", "⚖️"],
  ["medecine tropicale", "🌴"],
  ["medecine nucleaire", "☢️"],
  ["sante publique", "📊"],

  // — Grandes disciplines —
  ["cardi", "❤️"],
  ["angiolog", "🩸"],
  ["phlebolog", "🩸"],
  ["hemato", "🩸"],
  ["transfus", "🩸"],
  ["pneumo", "🫁"],
  ["neuro", "🧠"],
  ["psychiatr", "💭"],
  ["psycholog", "💭"],
  ["pedopsy", "💭"],
  ["addictolog", "💭"],
  ["gastro", "🫃"],
  ["hepato", "🫃"],
  ["proctolog", "🫃"],
  ["nephro", "🫘"],
  ["urolog", "🫘"],
  ["endocrin", "🍬"],
  ["diabet", "🍬"],
  ["nutrition", "🥗"],
  ["diet", "🥗"],
  ["rhumato", "🦴"],
  ["orthoped", "🦴"],
  ["traumato", "🦴"],
  ["osteo", "🦴"],
  ["chiroprac", "🦴"],
  ["derma", "🧴"],
  ["esthetiq", "💅"],
  ["allergo", "🤧"],
  ["immuno", "🛡️"],
  ["infectiolog", "🦠"],
  ["virolog", "🦠"],
  ["parasitolog", "🦠"],
  ["microbiolog", "🔬"],
  ["bacteriolog", "🔬"],
  ["anatomo", "🔬"],
  ["pathologi", "🔬"],
  ["cytolog", "🔬"],
  ["genetiq", "🧬"],
  ["onco", "🎗️"],
  ["cancero", "🎗️"],
  ["geriatr", "🧓"],
  ["gerontolog", "🧓"],
  ["pediatr", "👶"],
  ["neonat", "👶"],
  ["nourrisson", "👶"],
  ["gyneco", "🌸"],
  ["obstetr", "🤰"],
  ["sage femme", "🤰"],
  ["maternite", "🤰"],
  ["maieutique", "🤰"],
  ["fertilit", "🤰"],
  ["procreation", "🤰"],
  ["planning familial", "🌸"],
  ["andro", "♂️"],
  ["sexolog", "❤️‍🔥"],

  // — Sens et bouche —
  ["ophtalmo", "👁️"],
  ["optomet", "👓"],
  ["opticien", "👓"],
  ["orl", "👂"],
  ["oto rhino", "👂"],
  ["audio", "🦻"],
  ["dent", "🦷"],
  ["odonto", "🦷"],
  ["stomato", "🦷"],
  ["implantolog", "🦷"],
  ["parodont", "🦷"],
  ["podolog", "🦶"],
  ["pedicur", "🦶"],

  // — Plateaux techniques —
  ["radiolog", "🩻"],
  ["imagerie", "🩻"],
  ["scanner", "🩻"],
  ["echograph", "🩻"],
  ["mammograph", "🩻"],
  ["laboratoire", "🧪"],
  ["labo", "🧪"],
  ["analyse", "🧪"],
  ["biolog", "🧪"],
  ["prelevement", "🧪"],
  ["pharma", "💊"],
  ["toxicolog", "☠️"],
  ["dialyse", "🫘"],
  ["endoscop", "🔎"],

  // — Soins et actes —
  ["urgence", "🚑"],
  ["reanimation", "🫀"],
  ["soins intensifs", "🫀"],
  ["anesthes", "💤"],
  ["algolog", "💤"],
  ["soins palliatif", "🕊️"],
  ["chirurg", "🔪"],
  ["greffe", "🫀"],
  ["transplant", "🫀"],
  ["kine", "💪"],
  ["physiother", "💪"],
  ["reeducation", "💪"],
  ["ergotherap", "🤲"],
  ["massage", "🤲"],
  ["acupunct", "🪡"],
  ["infirm", "💉"],
  ["vaccin", "💉"],
  ["ambulanc", "🚑"],
  ["secourisme", "🚑"],
  ["don du sang", "🩸"],
  ["appareillage", "🦿"],
  ["prothes", "🦿"],
  ["orthes", "🦿"],
  ["handicap", "♿"],
  ["veterinair", "🐾"],
  ["depistage", "🧫"],
  ["phytother", "🌿"],
  ["tradipratic", "🌿"],
  ["hygiene", "🧼"],
  ["epidemiolog", "📈"],
  ["nursing", "🧑‍⚕️"],
  ["consultation", "🩺"],
  ["generaliste", "🩺"],
  ["medecin", "🩺"],
];

/**
 * Emojis de secours, pour un nom qu'aucune racine ne reconnaît. Tous
 * médicalement neutres : mieux vaut une croix bleue qu'un stéthoscope de
 * plus, qui laisserait croire à un doublon avec « Médecine générale ».
 */
const SECOURS = ["⚕️", "🏥", "🧑‍⚕️", "📋", "🔎", "🧰", "🫧", "📌"];

/**
 * Reconnaît la spécialité dans le dictionnaire, ou renvoie null.
 *
 * Le null est significatif : c'est lui qui décide d'aller demander l'icône à
 * l'IA plutôt que de se rabattre tout de suite sur une pastille générique.
 */
export function devinerEmojiSpecialite(nom: string): string | null {
  const cible = normaliser(nom);
  if (!cible.trim()) return null;
  for (const [racine, emoji] of RACINES) {
    // \b + racine : correspondance en début de mot. « ortho » attrape
    // « chirurgie orthopédique » (le trait d'union et l'espace sont des
    // frontières) sans se déclencher au milieu d'un mot sans rapport.
    if (new RegExp(`\\b${racine}`).test(cible)) return emoji;
  }
  return null;
}

/**
 * Pastille stable tirée du nom : deux spécialités inconnues distinctes
 * reçoivent (presque toujours) deux icônes distinctes, et la même spécialité
 * garde la sienne d'un affichage à l'autre.
 */
export function emojiDeSecours(nom: string): string {
  let empreinte = 0;
  for (const caractere of normaliser(nom)) {
    empreinte = (empreinte * 31 + caractere.charCodeAt(0)) % 100000;
  }
  return SECOURS[empreinte % SECOURS.length];
}

/** Icône utilisable sans condition — dictionnaire, sinon pastille de secours. */
export function emojiSpecialite(nom: string): string {
  return devinerEmojiSpecialite(nom) ?? emojiDeSecours(nom);
}

/** Un emoji, et rien d'autre : garde-fou sur la saisie libre et sur l'IA. */
export function estEmoji(valeur: string): boolean {
  const propre = valeur.trim();
  return (
    propre.length > 0 &&
    propre.length <= 8 &&
    /\p{Extended_Pictographic}/u.test(propre) &&
    !/[\p{L}\p{N}]/u.test(propre)
  );
}

/** Palette proposée dans l'écran admin pour corriger une icône à la main. */
export const PALETTE_EMOJIS = [
  "🩺", "❤️", "🧠", "🫁", "🦴", "🦷", "👁️", "👂", "🦻", "🌸",
  "🤰", "👶", "🧓", "🧴", "🩸", "🫘", "🫃", "🍬", "🥗", "💪",
  "🧪", "🔬", "🩻", "💊", "💉", "🚑", "🔪", "💤", "🎗️", "🧬",
  "🦠", "🛡️", "🤧", "🗣️", "🦶", "👓", "🪡", "🫀", "🦿", "♿",
  "🐾", "⚕️", "🏥", "🧑‍⚕️", "📋", "🕊️", "🤲", "☢️",
];
