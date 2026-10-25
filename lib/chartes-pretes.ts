// Chemin relatif avec extension, comme `lisibilite.ts` : c'est ce qui rend
// ce module exécutable tel quel par `node --test`, qui ne connaît pas l'alias.
import { CHARTE_DEFAUT } from "./charte-couleurs.ts";

/**
 * Les chartes proposées dans l'écran de réglage.
 *
 * Elles ne sont pas choisies à l'œil : chacune est passée au contrôle de
 * lisibilité, et un test refuse d'en laisser entrer une qui déclencherait
 * le moindre avertissement.
 *
 * Il n'y en a que cinq, et c'est le jeu d'icônes qui le décide. Les emoji
 * gardent leurs couleurs quoi qu'on fasse, et les nôtres sont très
 * majoritairement chauds ou violets : un accent cramoisi efface le 💼, un
 * accent violet le 👥 et le ✔️, un accent doré le 📜, le 🔒 et le 🧑. Les
 * seules familles qui laissent toutes les icônes visibles vont du vert au
 * bleu, plus un orange foncé et un or sombre. Une sixième charte dans les
 * rouges existe, mais il faut un accent si clair et si saturé qu'il jure
 * sur une plateforme de santé.
 *
 * Pour en proposer davantage, c'est le jeu d'icônes qu'il faudrait changer
 * — des dessins monochromes suivant la couleur du texte, plutôt que des
 * emoji figés.
 *
 * Dans un module à part, et non dans le composant : un test ne sait pas
 * importer un composant client, et une liste que personne ne peut vérifier
 * se dégrade au premier seuil déplacé.
 */
export const CHARTES_PRETES: { nom: string; principale: string; accent: string }[] = [
  { nom: "Docteur 224", principale: CHARTE_DEFAUT.principale, accent: CHARTE_DEFAUT.accent },
  { nom: "Océan", principale: "#0b3f4a", accent: "#0097aa" },
  { nom: "Émeraude", principale: "#0a4030", accent: "#109d7b" },
  { nom: "Terracotta", principale: "#5a2a14", accent: "#c25400" },
  { nom: "Nuit & or", principale: "#232323", accent: "#9c7400" },
];
