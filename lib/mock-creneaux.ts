/*
 * Créneaux fictifs de 30 minutes pour le parcours patient.
 * Les statuts sont générés de façon DÉTERMINISTE (même médecin + même date
 * + même heure → toujours le même statut), afin que le rendu serveur et le
 * rendu client coïncident et que la démo soit stable entre deux rechargements.
 * Sera remplacé par la table « creneaux » de la base de données plus tard.
 */

/** Heures proposées aux patients (matin + après-midi), comme dans les maquettes. */
export const HEURES_PATIENT = [
  "08:30",
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
];

function empreinte(texte: string): number {
  let h = 0;
  for (let i = 0; i < texte.length; i++) {
    h = (Math.imul(h, 31) + texte.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export interface CreneauPublic {
  heure: string;
  /** Côté patient, seuls « ouvert » et « reserve » existent (les fermés sont masqués). */
  statut: "ouvert" | "reserve";
}

/** Créneaux d'un médecin pour une date donnée (~1 créneau sur 4 déjà réservé). */
export function creneauxDuJour(medecinId: string, dateISO: string): CreneauPublic[] {
  return HEURES_PATIENT.map((heure) => ({
    heure,
    statut: empreinte(`${medecinId}|${dateISO}|${heure}`) % 4 === 0 ? "reserve" : "ouvert",
  }));
}

/** Les premières heures libres d'une date (mini-créneaux des cartes de résultats). */
export function premiersCreneauxOuverts(medecinId: string, dateISO: string, nb = 4): string[] {
  return creneauxDuJour(medecinId, dateISO)
    .filter((c) => c.statut === "ouvert")
    .slice(0, nb)
    .map((c) => c.heure);
}
