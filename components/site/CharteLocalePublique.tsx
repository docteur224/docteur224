import {
  CLE_CHARTE_PUBLIQUE, ID_STYLE_PUBLIQUE, PREFIXES_ESPACE,
} from "@/lib/charte-publique";

/**
 * Repose la charte de campagne du site public avant le premier affichage.
 *
 * Même rôle que `CharteLocale` pour la charte d'espace, mais pour les pages
 * PUBLIQUES : rendu côté serveur et exécuté pendant l'analyse du document,
 * avant que rien ne soit peint, donc sans clignotement. `SuivreChartePublique`
 * corrige ensuite l'avance locale depuis la base.
 *
 * Monté à la racine (app/layout), il s'exécute aussi sur les pages d'espace :
 * il s'en exclut lui-même en lisant `location.pathname`. Et il n'applique la
 * charte que si la campagne est en cours — hors de sa fenêtre de dates, le
 * site garde ses couleurs d'origine.
 *
 * Il relit un CSS déjà calculé rangé à côté des deux couleurs, après avoir
 * vérifié qu'il ne contient que des déclarations de couleur : le stockage
 * local appartient à la page, mais rien n'oblige à lui faire confiance pour
 * une chaîne qui part dans une feuille de style.
 */
export default function CharteLocalePublique() {
  const prefixes = JSON.stringify(PREFIXES_ESPACE);
  const script = `(function(){try{
var P=${prefixes},p=location.pathname;
for(var i=0;i<P.length;i++){if(p===P[i]||p.indexOf(P[i]+"/")===0)return;}
var b=localStorage.getItem(${JSON.stringify(CLE_CHARTE_PUBLIQUE)});if(!b)return;
var o=JSON.parse(b);if(!o||typeof o.css!=="string")return;
if(!/^[-a-z0-9:#;]+$/.test(o.css))return;
var n=Date.now();
if(o.debut&&n<Date.parse(o.debut))return;
if(o.fin&&n>Date.parse(o.fin))return;
var s=document.createElement("style");s.id=${JSON.stringify(ID_STYLE_PUBLIQUE)};
s.textContent="html:root{"+o.css+"}";document.head.appendChild(s);
}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
