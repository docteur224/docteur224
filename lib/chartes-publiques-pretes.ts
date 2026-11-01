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
 * possible, au minimum au seuil des éléments d'interface (3:1).
 *
 * « Octobre Rose » en tête : c'est la campagne qui a motivé la fonction. Les
 * autres reprennent les familles déjà éprouvées côté espace, pour d'autres
 * causes (Journée de l'eau, environnement, etc.).
 */
export const CHARTES_PUBLIQUES_PRETES: {
  nom: string;
  principale: string;
  accent: string;
}[] = [
  { nom: "Octobre Rose", principale: "#8a1246", accent: "#db2777" },
  { nom: "Océan", principale: "#0b3f4a", accent: "#0097aa" },
  { nom: "Émeraude", principale: "#0a4030", accent: "#109d7b" },
  { nom: "Terracotta", principale: "#5a2a14", accent: "#c25400" },
  { nom: "Nuit & or", principale: "#232323", accent: "#9c7400" },
];

/** Les couleurs d'origine du site, pour détecter « pas de campagne ». */
export const CHARTE_PUBLIQUE_DEFAUT = CHARTE_DEFAUT;
