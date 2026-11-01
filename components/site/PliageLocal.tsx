import { CLE_PLIAGE } from "@/lib/pliage-menu";

/**
 * Pose l'état plié / déplié de la barre latérale avant la première peinture.
 *
 * Même rôle que ModeLocal pour le mode clair/sombre : rendu côté serveur et
 * exécuté pendant l'analyse du document, il pose l'attribut `data-sidebar` sur
 * <html> avant toute peinture, pour que la largeur de la colonne (pilotée par
 * cet attribut en CSS) soit la bonne dès le départ, sans saut de largeur.
 *
 * Défaut « déplié » : en l'absence de choix explicite, la barre reste celle
 * qu'on connaît.
 */
export default function PliageLocal() {
  const script = `(function(){try{
var e=localStorage.getItem(${JSON.stringify(CLE_PLIAGE)});
if(e!=="plie")e="deplie";
document.documentElement.setAttribute("data-sidebar",e);
}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
