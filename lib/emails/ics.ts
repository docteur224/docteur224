import type { PieceJointe } from "../messagerie/types";

/*
 * Fichier iCalendar (RFC 5545), écrit à la main.
 *
 * Aucune dépendance : un `.ics` est un format texte de trente lignes, et les
 * bibliothèques qui le produisent pèsent des centaines de kilo-octets pour
 * cacher exactement ce qu'on veut contrôler ici — l'UID, la séquence et la
 * méthode, dont dépend le fait qu'un déplacement METTE À JOUR l'événement du
 * patient au lieu d'en créer un second. Même parti pris que `lib/pdf.ts`.
 */

/** Un créneau dure 30 minutes (spec C.4.2, `lib/donnees.ts`). */
const DUREE_MINUTES = 30;

export interface EvenementRdv {
  rdvId: string;
  /** Instant du rendez-vous. Conakry étant à UTC+0, c'est `date + heure`. */
  debut: Date;
  /** Date de création du rendez-vous, qui sert de repère à la séquence. */
  creeLe: Date;
  titre: string;
  description: string;
  lieu: string;
  annule?: boolean;
}

/**
 * Échappement des caractères que le format réserve. Omettre la virgule est
 * l'erreur classique : « Dr Diallo, cardiologue » couperait la description en
 * deux valeurs, et la moitié disparaîtrait de l'agenda.
 */
function echapper(valeur: string): string {
  return valeur
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** `20260315T093000Z` — la forme UTC, la seule qui n'exige aucun fuseau. */
function horodater(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Pliage à 75 OCTETS, pas 75 caractères : la RFC compte en octets, et un
 * accent en pèse deux. Compter en caractères produit des lignes trop longues
 * que certains agendas refusent — sur un texte français, c'est-à-dire
 * presque toujours.
 *
 * Une ligne repliée reprend après une espace, qui ne fait pas partie de la
 * valeur.
 */
function plier(ligne: string): string {
  const octets = Buffer.from(ligne, "utf8");
  if (octets.length <= 75) return ligne;

  const morceaux: string[] = [];
  let debut = 0;
  while (debut < octets.length) {
    // La première ligne tient 75 octets, les suivantes 74 : l'espace de
    // continuation en occupe un.
    const taille = morceaux.length === 0 ? 75 : 74;
    let fin = Math.min(debut + taille, octets.length);
    // Ne jamais couper au milieu d'un caractère multi-octets : on recule
    // jusqu'au début du caractère (les octets de continuation valent 10xxxxxx).
    while (fin < octets.length && (octets[fin] & 0xc0) === 0x80) fin--;
    morceaux.push(octets.subarray(debut, fin).toString("utf8"));
    debut = fin;
  }
  return morceaux.join("\r\n ");
}

/**
 * Le fichier à joindre, ou `null` quand il n'y a rien d'utile à joindre.
 *
 * Choix de méthode : `PUBLISH`, et non `REQUEST`. `REQUEST` fait apparaître
 * les boutons « Accepter / Refuser » dans Gmail et Outlook, donc une réponse
 * qui partirait vers une boîte que personne ne dépouille. Le rendez-vous est
 * déjà pris ; ce que le patient veut, c'est le poser dans son agenda.
 *
 * L'UID est stable d'un message à l'autre pour le même rendez-vous, et la
 * séquence augmente : c'est ce couple qui fait qu'un déplacement remplace
 * l'événement existant. La séquence se déduit du temps écoulé depuis la
 * création du rendez-vous — elle n'a qu'à croître, et rien en base ne la
 * compte.
 */
export function fichierCalendrier(e: EvenementRdv): PieceJointe {
  const fin = new Date(e.debut.getTime() + DUREE_MINUTES * 60_000);
  const sequence = Math.max(0, Math.floor((Date.now() - e.creeLe.getTime()) / 60_000));

  const lignes = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Docteur 224//Rendez-vous//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:rdv-${e.rdvId}@docteur224.com`,
    `DTSTAMP:${horodater(new Date())}`,
    `DTSTART:${horodater(e.debut)}`,
    `DTEND:${horodater(fin)}`,
    `SEQUENCE:${sequence}`,
    `STATUS:${e.annule ? "CANCELLED" : "CONFIRMED"}`,
    `SUMMARY:${echapper(e.titre)}`,
    `DESCRIPTION:${echapper(e.description)}`,
    `LOCATION:${echapper(e.lieu)}`,
    // Un rappel de l'agenda lui-même, en plus des nôtres : le patient qui a
    // refusé nos courriels garde au moins celui-là.
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Rappel de rendez-vous",
    "TRIGGER:-PT2H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return {
    nom: "rendez-vous.ics",
    // Les fins de ligne sont imposées par la RFC : un `.ics` en LF seul est
    // refusé par une partie des agendas.
    contenu: lignes.map(plier).join("\r\n") + "\r\n",
    type: "text/calendar; charset=utf-8; method=PUBLISH",
  };
}
