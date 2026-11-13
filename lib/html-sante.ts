import sanitizeHtml from "sanitize-html";

/**
 * Nettoyage du HTML éditorial des conseils santé.
 *
 * Le corps d'une fiche est rédigé dans un éditeur de texte riche et stocké en
 * HTML. Ce HTML finit servi à des visiteurs ANONYMES : même si seuls des
 * administrateurs l'écrivent, on le repasse par une liste blanche STRICTE au
 * rendu — une seule porte, côté serveur, qui ne dépend pas de ce que le
 * navigateur a bien voulu produire. Aucune balise de script, aucun attribut
 * d'événement, aucun lien ni source : rien que de la mise en forme de texte.
 *
 * La taille de police est le seul style toléré, et seulement sur un jeu de
 * valeurs connues (les tailles proposées par l'éditeur) : une valeur libre
 * serait écartée.
 */

const TAILLES_AUTORISEES = [/^0\.88em$/, /^1\.3em$/];

// L'éditeur peut porter la mise en forme soit par des balises (<b>, <i>…),
// soit par des styles en ligne (`font-weight: bold`…) selon le navigateur et
// le mode. On accepte donc AUSSI ces styles, bornés à des valeurs sûres (aucune
// url, aucun script possible), pour que le gras/italique/souligné/barré
// survivent dans les deux cas — y compris sur les fiches déjà enregistrées.
const STYLES_AUTORISES = {
  "font-size": TAILLES_AUTORISEES,
  "font-weight": [/^(bold|[5-9]00)$/],
  "font-style": [/^italic$/],
  "text-decoration": [/^(underline|line-through)( (underline|line-through))?$/],
  "text-decoration-line": [/^(underline|line-through)( (underline|line-through))?$/],
};

export function nettoyerHtmlConseil(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "s",
      "h2",
      "h3",
      "ul",
      "ol",
      "li",
      "span",
      "div",
    ],
    allowedAttributes: { span: ["style"], p: ["style"], li: ["style"] },
    allowedStyles: { "*": STYLES_AUTORISES },
    // L'éditeur peut produire des variantes (b/i/strike, div de ligne) : on les
    // ramène aux balises sémantiques retenues plutôt que de les perdre.
    transformTags: {
      b: "strong",
      i: "em",
      strike: "s",
      div: "p",
    },
    // Un conseil n'est jamais vide de sens : on laisse tomber les éléments sans
    // texte plutôt que d'empiler des <p></p> au rendu.
    exclusiveFilter: (frame) =>
      ["p", "h2", "h3", "li", "span"].includes(frame.tag) && !frame.text.trim(),
  });
}
