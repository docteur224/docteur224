import { CHARTE_DEFAUT, charteVersCss, normaliserHex } from "@/lib/charte-couleurs";

/**
 * Applique la charte de couleurs d'un espace connecté.
 *
 * Rendu côté serveur, dans le HTML initial : les couleurs sont là dès la
 * première image affichée, sans le clignotement qu'on obtient en posant les
 * variables depuis un effet React.
 *
 * Le sélecteur est `html:root` et non `:root` : même spécificité de base, mais
 * un élément de plus, donc il l'emporte sans dépendre de l'ordre d'arrivée des
 * feuilles de style — ordre sur lequel on n'a pas la main, le framework étant
 * libre de regrouper ou d'inliner le CSS. Pas de `!important` pour autant :
 * une surcharge locale reste possible.
 *
 * La portée vient de l'endroit où ce composant est monté, pas du DOM : seuls
 * les layouts des espaces connectés le rendent. Le site public et les
 * documents remis gardent la charte Docteur 224.
 */
export default function CharteGraphique({
  principale = CHARTE_DEFAUT.principale,
  accent = CHARTE_DEFAUT.accent,
}: {
  principale?: string;
  accent?: string;
}) {
  // Charte par défaut : rien à injecter, globals.css fait déjà foi. Évite
  // d'alourdir chaque page d'un bloc de style qui ne changerait rien.
  if (
    (normaliserHex(principale) ?? CHARTE_DEFAUT.principale) === CHARTE_DEFAUT.principale &&
    (normaliserHex(accent) ?? CHARTE_DEFAUT.accent) === CHARTE_DEFAUT.accent
  ) {
    return null;
  }

  return (
    <style
      // Sans risque d'injection : le moteur ne restitue que des couleurs
      // reconstruites chiffre par chiffre, jamais la chaîne reçue.
      dangerouslySetInnerHTML={{
        __html: `html:root{${charteVersCss(principale, accent)}}`,
      }}
    />
  );
}
