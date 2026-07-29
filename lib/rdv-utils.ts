/**
 * Aides de l'écran de détail d'un rendez-vous : lien cartographique,
 * numéro composable et export calendrier (.ics).
 * Pur TypeScript — aucune dépendance, aucun appel réseau.
 */

import { depuisISO } from "@/lib/dates";

/** Une valeur `localisation` de la forme « 9.5092, -13.7122 ». */
const COORDONNEES = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/;

/**
 * Lien « Ouvrir la carte ». Ordre de préférence : les coordonnées ou l'URL
 * saisies par le médecin, sinon une recherche Google Maps sur l'adresse
 * postale. Renvoie une chaîne vide si on n'a rien à pointer — l'appelant
 * masque alors le bouton plutôt que d'ouvrir une carte vide.
 */
export function lienCarte(parties: {
  localisation?: string;
  etablissementNom?: string;
  adresse?: string;
  quartier?: string;
  ville?: string;
}): string {
  const loc = (parties.localisation ?? "").trim();
  if (COORDONNEES.test(loc)) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.replace(/\s/g, ""))}`;
  }
  if (/^https?:\/\//i.test(loc)) return loc;

  const requete = [parties.etablissementNom, parties.adresse, parties.quartier, parties.ville]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
  return requete ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(requete)}` : "";
}

/** Numéro prêt pour un lien `tel:` (espaces et séparateurs retirés). */
export function numeroComposable(telephone: string): string {
  return telephone.replace(/[^\d+]/g, "");
}

/** « +224622000000 » → « +224 622 00 00 00 » (lisible, sans rien inventer). */
export function formatTelephone(telephone: string): string {
  const brut = numeroComposable(telephone);
  const m = /^\+224(\d{3})(\d{2})(\d{2})(\d{2})$/.exec(brut);
  return m ? `+224 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : telephone;
}

/** Échappement des caractères réservés du format iCalendar (RFC 5545). */
function echapperICS(texte: string): string {
  return texte.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Date locale → « AAAAMMJJTHHMMSS » (heure locale, sans indicateur de fuseau). */
function horodatageICS(d: Date): string {
  const p = (n: number) => `${n}`.padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `T${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

/** Durée par défaut d'une consultation, faute d'information en base. */
export const DUREE_CONSULTATION_MINUTES = 30;

/**
 * Contenu d'un fichier .ics pour un rendez-vous.
 *
 * Les horodatages sont écrits en heure locale « flottante » (sans Z ni
 * TZID) : la Guinée est à UTC+0 toute l'année, et cela évite d'embarquer
 * une définition VTIMEZONE pour un décalage nul. Un rappel de 24 h est
 * ajouté, comme l'annonce l'écran de confirmation.
 */
export function construireICS(rdv: {
  id: string;
  date: string;
  heure: string;
  titre: string;
  lieu: string;
  description: string;
}): string {
  const debut = depuisISO(rdv.date);
  const [h, min] = rdv.heure.split(":").map(Number);
  debut.setHours(h, min, 0, 0);
  const fin = new Date(debut.getTime() + DUREE_CONSULTATION_MINUTES * 60000);

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Docteur 224//Rendez-vous//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${rdv.id}@docteur224`,
    `DTSTAMP:${horodatageICS(new Date())}`,
    `DTSTART:${horodatageICS(debut)}`,
    `DTEND:${horodatageICS(fin)}`,
    `SUMMARY:${echapperICS(rdv.titre)}`,
    rdv.lieu ? `LOCATION:${echapperICS(rdv.lieu)}` : "",
    rdv.description ? `DESCRIPTION:${echapperICS(rdv.description)}` : "",
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    "DESCRIPTION:Rappel de rendez-vous",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

/** Déclenche le téléchargement du .ics (navigateur uniquement). */
export function telechargerICS(nomFichier: string, contenu: string): void {
  const url = URL.createObjectURL(new Blob([contenu], { type: "text/calendar;charset=utf-8" }));
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  URL.revokeObjectURL(url);
}
