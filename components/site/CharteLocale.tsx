import { CLE_CHARTE, ID_STYLE } from "@/lib/charte-stockage";

/**
 * Repose la charte choisie avant le premier affichage.
 *
 * Provisoire : la préférence vit encore dans le navigateur. Elle n'est donc
 * pas connue du serveur, et la reposer depuis un effet React ferait
 * apparaître la page en bleu d'origine une fraction de seconde à chaque
 * navigation. Ce script s'exécute pendant l'analyse du document, avant que
 * rien ne soit peint : aucun clignotement.
 *
 * Il n'embarque pas le moteur de calcul — le CSS est déjà rangé tout fait à
 * côté des deux couleurs. Il se contente de le relire, après avoir vérifié
 * qu'il ne contient que des déclarations de couleur : le stockage local
 * appartient à la page, mais rien n'oblige à lui faire confiance aveuglément
 * pour une chaîne qui part dans une feuille de style.
 *
 * Quand la préférence sera rattachée au compte, ce composant disparaît au
 * profit du rendu serveur déjà en place (voir CharteGraphique).
 */
export default function CharteLocale() {
  const script = `(function(){try{
var b=localStorage.getItem(${JSON.stringify(CLE_CHARTE)});if(!b)return;
var o=JSON.parse(b);if(!o||typeof o.css!=="string")return;
if(!/^[-a-z0-9:#;]+$/.test(o.css))return;
var s=document.createElement("style");s.id=${JSON.stringify(ID_STYLE)};
s.textContent="html:root{"+o.css+"}";document.head.appendChild(s);
}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
