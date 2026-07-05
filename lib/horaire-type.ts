/*
 * Horaire-type déterministe (fonctions PURES, sans React) : utilisable aussi
 * bien dans les composants serveur (page de résultats) que dans le modèle
 * réactif de disponibilités côté client (lib/mock-disponibilites.ts).
 */

export type StatutCreneau = "ouvert" | "ferme" | "reserve";

/** Créneaux de 30 minutes, de 08:00 à 20:00 (spec C.4.2). */
export const HEURES_JOURNEE: string[] = (() => {
  const heures: string[] = [];
  for (let h = 8; h <= 20; h++) {
    heures.push(`${String(h).padStart(2, "0")}:00`);
    if (h < 20) heures.push(`${String(h).padStart(2, "0")}:30`);
  }
  return heures;
})();

const HEURES_DEJEUNER = ["12:00", "12:30", "13:00"];

export function empreinte(texte: string): number {
  let h = 0;
  for (let i = 0; i < texte.length; i++) {
    h = (Math.imul(h, 31) + texte.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Horaire-type + réservations de démonstration : déterministe (même médecin,
 * même date, même heure → toujours le même statut), donc stable entre le
 * rendu serveur, le rendu client et deux rechargements.
 */
export function statutBase(medecinId: string, dateISO: string, heure: string): StatutCreneau {
  if (HEURES_DEJEUNER.includes(heure)) return "ferme";
  const e = empreinte(`${medecinId}|${dateISO}|${heure}`);
  if (e % 5 === 0) return "reserve"; // rendez-vous de démonstration
  if (e % 7 === 0) return "ferme";
  return "ouvert";
}

/** Mini-créneaux des cartes de résultats (rendu serveur : horaire-type seul). */
export function premiersCreneauxOuvertsBase(
  medecinId: string,
  dateISO: string,
  nb = 4
): string[] {
  return HEURES_JOURNEE.filter((h) => statutBase(medecinId, dateISO, h) === "ouvert").slice(0, nb);
}
