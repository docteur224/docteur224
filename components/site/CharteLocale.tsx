import { CLE_CHARTE, ID_STYLE } from "@/lib/charte-stockage";

/**
 * Repose la charte choisie avant le premier affichage.
 *
 * La préférence appartient au compte, mais les pages des espaces connectés
 * sont servies statiques : le serveur ignore qui les regarde. Interroger la
 * base, ou reposer la charte depuis un effet React, montrerait la page en
 * bleu d'origine le temps de la réponse, à chaque navigation. Ce script
 * s'exécute pendant l'analyse du document, avant que rien ne soit peint :
 * aucun clignotement. `SuivreCharte` corrige ensuite l'avance locale si le
 * compte dit autre chose.
 *
 * Il n'embarque pas le moteur de calcul — le CSS est déjà rangé tout fait à
 * côté des deux couleurs. Il se contente de le relire, après avoir vérifié
 * qu'il ne contient que des déclarations de couleur : le stockage local
 * appartient à la page, mais rien n'oblige à lui faire confiance aveuglément
 * pour une chaîne qui part dans une feuille de style.
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
