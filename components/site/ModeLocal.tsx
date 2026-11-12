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
  // Résolution : choix explicite enregistré, SINON clair. On ne consulte plus
  // le mode du système (prefers-color-scheme) : le site démarre toujours en
  // clair tant que l'utilisateur n'a pas basculé lui-même.
  //
  // L'attribut data-theme doit TOUJOURS être posé, même si localStorage lève
  // (navigateurs in-app / raccourcis d'écran d'accueil, où l'accès au stockage
  // jette une exception). On isole donc la lecture du stockage et on sort le
  // setAttribute de tout try englobant : il s'exécute quoi qu'il arrive, et
  // vaut « light » par défaut.
  const script = `(function(){var m;try{m=localStorage.getItem(${JSON.stringify(CLE_MODE)});}catch(e){}
if(m!=="dark"&&m!=="light"){m="light";}
try{document.documentElement.setAttribute("data-theme",m);}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
