import { CLE_MODE } from "@/lib/mode-affichage";

/**
 * Pose le mode clair / sombre avant la première peinture, pour tout le site.
 *
 * Rendu côté serveur et exécuté pendant l'analyse du document : il pose
 * l'attribut `data-theme` sur <html> avant que rien ne soit peint, donc sans
 * clignotement. Ordre de résolution : choix explicite enregistré, sinon
 * préférence système, sinon clair.
 *
 * Monté à la racine (app/layout) : s'applique aux pages publiques comme aux
 * espaces connectés. N'a aucun lien avec la charte, qui a son propre script.
 */
export default function ModeLocal() {
  // L'attribut data-theme doit TOUJOURS être posé, même si localStorage lève
  // (navigateurs in-app / onglets Chrome ouverts depuis une appli, où l'accès
  // au stockage jette une exception). Sans cela, l'attribut resterait absent,
  // le repli @media(prefers-color-scheme) assombrirait les surfaces selon le
  // système, et le bouton de bascule — qui lit l'attribut — afficherait « clair »
  // à tort. On isole donc chaque accès navigateur et on sort le setAttribute de
  // tout try englobant : il s'exécute quoi qu'il arrive.
  const script = `(function(){var m;try{m=localStorage.getItem(${JSON.stringify(CLE_MODE)});}catch(e){}
if(m!=="dark"&&m!=="light"){try{m=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}catch(e){m="light";}}
try{document.documentElement.setAttribute("data-theme",m);}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
