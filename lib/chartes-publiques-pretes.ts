// Chemin relatif avec extension, comme les autres modules testables par
// `node --test` (qui ne connaît pas l'alias @/).
import { CHARTE_DEFAUT } from "./charte-couleurs.ts";

/**
 * Les habillages de campagne proposés pour le SITE PUBLIC.
 *
 * À la différence des chartes d'espace (`chartes-pretes.ts`), celles-ci
 * habillent les pages publiques, où les emoji de spécialité sont posés sur des
 * cartes BLANCHES, pas sur l'accent : un rose vif, exclu côté espace parce
 * qu'il effaçait le ✔️ des boutons, passe donc ici sans gêne.
 *
 * Chaque combinaison a été vérifiée sur les surfaces réelles des pages
 * publiques — texte blanc sur le héros (principale), texte blanc sur les
 * boutons (accent), accent en lien sur blanc — au niveau AA quand c'est
 * possible, au minimum au seuil des éléments d'interface (3:1). Le test
 * `scripts/tests/charte-publique.test.mjs` refait ces mesures : une couleur
 * retouchée à vue ne passera pas sans que la mesure le dise.
 *
 * POURQUOI LES COULEURS NE SONT PAS CELLES DU RUBAN. Un drapeau ou un ruban
 * de cause n'est pas une charte d'interface : le jaune guinéen (#fcd116) ou
 * l'or d'un Ramadan n'ont aucun contraste sur blanc, et un lien peint de
 * cette couleur disparaît. On garde donc la teinte et on déplace le rôle :
 *   · principale — la teinte de la cause, assombrie pour porter du texte blanc ;
 *   · accent     — la teinte qui reste lisible en lien et en bouton (≥ 4,5:1) ;
 *   · secondaire — la couleur vive, qui ne sert qu'au filet de campagne, posé
 *                  sur la principale : là, et là seulement, un jaune éclate.
 * La Guinée en est l'exemple : vert en principale, rouge en accent (5,6:1 sur
 * blanc), jaune en filet.
 *
 * Les CAUSES d'abord, dans l'ordre du calendrier, puis les familles neutres
 * (Océan, Émeraude…) pour une campagne sans date arrêtée.
 */
export type ChartePubliquePrete = {
  nom: string;
  /** Repère visuel du bouton — jamais injecté dans la page publique. */
  emoji: string;
  principale: string;
  accent: string;
  /** Facultative : la touche du filet. null = campagne à deux couleurs. */
  secondaire: string | null;
  /**
   * Date fixe de la cause, pour pré-remplir la période. `debut` est un
   * « MM-JJ » (l'année est celle de la prochaine occurrence), `jours` la
   * durée en jours, bornes comprises. Absente pour les causes mobiles
   * (Ramadan, Aïd), dont la date suit le calendrier lunaire : à l'admin de
   * la poser chaque année.
   */
  periode: { debut: string; jours: number } | null;
};

export const CHARTES_PUBLIQUES_PRETES: ChartePubliquePrete[] = [
  {
    nom: "Journée mondiale contre le cancer", emoji: "🎗️",
    principale: "#4a1d6b", accent: "#7c3aed", secondaire: "#d8b4fe",
    periode: { debut: "02-04", jours: 1 },
  },
  {
    nom: "Contre les mutilations génitales", emoji: "👧",
    principale: "#7c2d12", accent: "#c2410c", secondaire: "#fdba74",
    periode: { debut: "02-06", jours: 1 },
  },
  {
    nom: "Droits des femmes", emoji: "🌸",
    principale: "#6b1b52", accent: "#be185d", secondaire: "#f9a8d4",
    periode: { debut: "03-08", jours: 1 },
  },
  {
    nom: "Lutte contre la tuberculose", emoji: "🫁",
    principale: "#7f1d1d", accent: "#b91c1c", secondaire: "#fca5a5",
    periode: { debut: "03-24", jours: 1 },
  },
  {
    // Vert et or, sans date : le mois lunaire avance d'une dizaine de jours
    // chaque année, l'admin pose les siennes.
    nom: "Ramadan", emoji: "🌙",
    principale: "#0b4a35", accent: "#0f766e", secondaire: "#d4a017",
    periode: null,
  },
  {
    nom: "Aïd el-Fitr", emoji: "🌙",
    principale: "#14532d", accent: "#15803d", secondaire: "#d4af37",
    periode: null,
  },
  {
    nom: "Journée mondiale de la santé", emoji: "🩺",
    principale: "#0c4a6e", accent: "#0369a1", secondaire: "#4ade80",
    periode: { debut: "04-07", jours: 1 },
  },
  {
    // Les trois couleurs du drapeau, redistribuées : vert en fond, rouge en
    // accent lisible, jaune au filet.
    nom: "Fête nationale de Guinée", emoji: "🇬🇳",
    principale: "#0a5c3f", accent: "#ce1126", secondaire: "#fcd116",
    periode: { debut: "10-01", jours: 3 },
  },
  {
    // En tête des causes d'octobre : c'est la campagne qui a motivé la
    // fonction.
    nom: "Octobre Rose", emoji: "🎀",
    principale: "#8a1246", accent: "#db2777", secondaire: "#f9a8d4",
    periode: { debut: "10-01", jours: 31 },
  },

  /* ---- familles neutres, pour une cause sans couleurs imposées ---- */
  { nom: "Océan", emoji: "🌊", principale: "#0b3f4a", accent: "#0097aa", secondaire: null, periode: null },
  { nom: "Émeraude", emoji: "🌿", principale: "#0a4030", accent: "#109d7b", secondaire: null, periode: null },
  { nom: "Terracotta", emoji: "🧱", principale: "#5a2a14", accent: "#c25400", secondaire: null, periode: null },
  { nom: "Nuit & or", emoji: "✨", principale: "#232323", accent: "#9c7400", secondaire: null, periode: null },
];

/** Les couleurs d'origine du site, pour détecter « pas de campagne ». */
export const CHARTE_PUBLIQUE_DEFAUT = CHARTE_DEFAUT;

/**
 * La prochaine occurrence d'une période fixe, en jours locaux « aaaa-mm-jj »
 * prêts pour un <input type="date">.
 *
 * On vise l'occurrence de CETTE année tant que sa fin n'est pas passée, et
 * celle de l'an prochain ensuite : en novembre, cliquer « Octobre Rose » doit
 * proposer octobre prochain, pas un mois déjà écoulé qui n'habillerait jamais
 * le site. Fonction pure — la date de référence est passée en argument.
 */
export function prochaineOccurrence(
  periode: { debut: string; jours: number },
  maintenant: Date = new Date(),
): { debut: string; fin: string } {
  const [mois, jour] = periode.debut.split("-").map(Number);
  const p = (n: number) => String(n).padStart(2, "0");
  const jourLocal = (d: Date) =>
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;

  const bornes = (annee: number) => {
    const debut = new Date(annee, mois - 1, jour);
    const fin = new Date(annee, mois - 1, jour + periode.jours - 1);
    return { debut, fin };
  };

  const aujourdhui = new Date(
    maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate(),
  );
  let b = bornes(maintenant.getFullYear());
  if (b.fin < aujourdhui) b = bornes(maintenant.getFullYear() + 1);
  return { debut: jourLocal(b.debut), fin: jourLocal(b.fin) };
}
