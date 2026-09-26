/*
 * Gabarit des e-mails.
 *
 * Un message électronique ne se met pas en page comme une page web. Les
 * clients de messagerie sont restés très en arrière — Outlook rend le HTML
 * avec le moteur de Word, Gmail retire les feuilles de style, et aucun ne
 * garantit `flex` ni `grid`. D'où trois règles qui expliquent tout le fichier
 * et qui, prises pour de la maladresse, seront « corrigées » un jour au prix
 * d'une mise en page cassée chez la moitié des destinataires :
 *
 *   1. la structure est faite de TABLEAUX imbriqués, pas de div ;
 *   2. chaque style est EN LIGNE, aucun n'est déclaré en tête ;
 *   3. les couleurs sont écrites en toutes lettres, jamais en `var(--…)` —
 *      les variables CSS n'existent pas dans un courriel.
 *
 * Les valeurs reprennent la palette de `app/globals.css`, recopiées à la main
 * pour cette raison.
 */

/*
 * Le site est composé en Plus Jakarta Sans, mais une police distante n'a pas
 * sa place ici : Gmail retire les `@font-face`, et Outlook rend le message
 * avec le moteur de Word, qui n'en télécharge aucune. Sans déclaration du
 * tout, les messageries retombent sur du Times — vérifié, l'effet est celui
 * d'un courrier administratif des années 1990. On donne donc une pile de
 * polices système, présentes partout, qui garde l'allure sans rien charger.
 *
 * Elle est répétée sur CHAQUE élément portant du texte : Outlook n'hérite pas
 * de `font-family` dans les tableaux imbriqués.
 */
const POLICE =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

const BLEU = "#15506b";
const BLEU_PROFOND = "#0e3b50";
const TEAL = "#2e9cca";
const TEAL_DOUX = "#e3f1f8";
const FOND = "#eaf1f6";
const ENCRE = "#16242e";
const GRIS = "#647a89";
const TRAIT = "#e2ebf0";

/** Toute valeur venant de la base traverse ceci avant d'entrer dans le HTML. */
export function echapperHtml(valeur: string): string {
  return valeur
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface Fait {
  intitule: string;
  valeur: string;
}

export interface Message {
  /** Reprise dans l'objet et dans le bandeau. */
  titre: string;
  /**
   * Ligne d'aperçu, celle que la boîte de réception montre à côté de l'objet.
   * Laissée au hasard, elle affiche le début du HTML — souvent « Voir en ligne »
   * ou du vide.
   */
  apercu: string;
  paragraphes: string[];
  /** Encadré de faits saillants : praticien, date, lieu. */
  faits?: Fait[];
  bouton?: { libelle: string; url: string };
  /** Dernière ligne, en petit : ce qui explique pourquoi on écrit. */
  note?: string;
  /**
   * Lien du pied de page : se désabonner, ou régler ses notifications.
   * Il n'est jamais absent — une plateforme qui écrit sans offrir d'arrêt
   * finit dans les indésirables, et l'y range qui de droit.
   */
  lienPied?: { libelle: string; url: string };
}

/** Cellule d'un fait de l'encadré. */
function ligneFait(f: Fait): string {
  return `
              <tr>
                <td style="padding:0 0 8px 0;font-family:${POLICE};font-size:13px;color:${GRIS};width:36%;vertical-align:top;">${echapperHtml(f.intitule)}</td>
                <td style="padding:0 0 8px 0;font-family:${POLICE};font-size:14px;color:${ENCRE};font-weight:bold;vertical-align:top;">${echapperHtml(f.valeur)}</td>
              </tr>`;
}

export function construireHtml(m: Message): string {
  const paragraphes = m.paragraphes
    .map(
      (p) =>
        `<p style="margin:0 0 14px 0;font-family:${POLICE};font-size:15px;line-height:1.6;color:${ENCRE};">${echapperHtml(p)}</p>`
    )
    .join("");

  const encadre = m.faits?.length
    ? `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${TEAL_DOUX};border-radius:12px;margin:0 0 20px 0;">
            <tr><td style="padding:16px 18px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${m.faits.map(ligneFait).join("")}
              </table>
            </td></tr>
          </table>`
    : "";

  /*
   * Bouton en tableau plutôt qu'un simple lien : c'est la seule forme dont la
   * zone cliquable et les marges intérieures tiennent dans Outlook, qui ignore
   * `padding` sur une balise `a`.
   */
  const bouton = m.bouton
    ? `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;">
            <tr><td align="center" bgcolor="${TEAL}" style="border-radius:10px;">
              <a href="${echapperHtml(m.bouton.url)}" style="display:inline-block;padding:13px 26px;font-family:${POLICE};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">${echapperHtml(m.bouton.libelle)}</a>
            </td></tr>
          </table>`
    : "";

  const note = m.note
    ? `<p style="margin:0;font-family:${POLICE};font-size:12.5px;line-height:1.55;color:${GRIS};">${echapperHtml(m.note)}</p>`
    : "";

  /*
   * La carte a une largeur RELATIVE plafonnée, et non 600 px imposés.
   * L'attribut width="600" doublé d'un width:600px en ligne l'emporte sur un
   * max-width:100% dans le rendu d'un téléphone : constaté à 390 px, le
   * message sortait de l'écran et le texte était coupé en plein mot. La forme
   * retenue tient les 600 px sur un bureau et se rétrécit sur un téléphone.
   */

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${echapperHtml(m.titre)}</title>
</head>
<body style="margin:0;padding:0;background:${FOND};font-family:${POLICE};">
<!-- Aperçu de la boîte de réception : présent dans le code, invisible à l'écran. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${echapperHtml(m.apercu)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${FOND};font-family:${POLICE};">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${TRAIT};">

        <tr>
          <td style="background:${BLEU};padding:20px 28px;">
            <span style="font-family:${POLICE};font-size:19px;font-weight:bold;color:#ffffff;letter-spacing:-0.2px;">Docteur&nbsp;224</span>
            <span style="font-family:${POLICE};font-size:12.5px;color:${TEAL_DOUX};padding-left:10px;">Rendez-vous médicaux</span>
          </td>
        </tr>

        <tr>
          <td style="padding:28px 28px 8px 28px;">
            <h1 style="margin:0 0 16px 0;font-family:${POLICE};font-size:21px;line-height:1.3;color:${BLEU_PROFOND};font-weight:bold;">${echapperHtml(m.titre)}</h1>
            ${paragraphes}
          </td>
        </tr>

        <tr>
          <td style="padding:0 28px;">${encadre}${bouton}</td>
        </tr>

        <tr>
          <td style="padding:18px 28px 24px 28px;border-top:1px solid ${TRAIT};">
            ${note}
            <p style="margin:10px 0 0 0;font-family:${POLICE};font-size:12px;line-height:1.55;color:${GRIS};">
              Docteur&nbsp;224 — la plateforme guinéenne de prise de rendez-vous médicaux.<br>
              La réservation est gratuite&nbsp;; la consultation se règle sur place.${
                m.lienPied
                  ? `<br><a href="${echapperHtml(m.lienPied.url)}" style="color:${GRIS};text-decoration:underline;">${echapperHtml(m.lienPied.libelle)}</a>`
                  : ""
              }
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * La version texte, construite à partir du MÊME message.
 *
 * Elle n'est pas un pis-aller : un courriel qui ne porte que du HTML est
 * pénalisé par les filtres anti-indésirables, et c'est cette version que
 * lisent les aperçus de notification, les montres et les lecteurs d'écran.
 * La produire ici, à côté du HTML, est ce qui garantit que les deux disent la
 * même chose.
 */
export function construireTexte(m: Message): string {
  const morceaux: string[] = [m.titre, "", ...m.paragraphes.flatMap((p) => [p, ""])];
  if (m.faits?.length) {
    morceaux.push(...m.faits.map((f) => `${f.intitule} : ${f.valeur}`), "");
  }
  if (m.bouton) morceaux.push(`${m.bouton.libelle} : ${m.bouton.url}`, "");
  if (m.note) morceaux.push(m.note, "");
  if (m.lienPied) morceaux.push(`${m.lienPied.libelle} : ${m.lienPied.url}`, "");
  morceaux.push(
    "— Docteur 224",
    "La plateforme guinéenne de prise de rendez-vous médicaux.",
    "La réservation est gratuite ; la consultation se règle sur place."
  );
  return morceaux.join("\n");
}
