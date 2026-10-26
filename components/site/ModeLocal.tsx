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
  const script = `(function(){try{
var m=localStorage.getItem(${JSON.stringify(CLE_MODE)});
if(m!=="dark"&&m!=="light"){m=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}
document.documentElement.setAttribute("data-theme",m);
}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
