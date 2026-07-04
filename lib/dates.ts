/** Utilitaires de dates en français pour les écrans de réservation. */

export const JOURS_LONGS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
];

export const JOURS_COURTS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export const MOIS_LONGS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** Date locale → « AAAA-MM-JJ ». */
export function versISO(d: Date): string {
  const mois = `${d.getMonth() + 1}`.padStart(2, "0");
  const jour = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${mois}-${jour}`;
}

/** « AAAA-MM-JJ » → Date locale (sans décalage de fuseau). */
export function depuisISO(iso: string): Date {
  const [annee, mois, jour] = iso.split("-").map(Number);
  return new Date(annee, mois - 1, jour);
}

/** « 2026-06-11 » → « jeudi 11 juin 2026 ». */
export function formatDateLongue(iso: string): string {
  const d = depuisISO(iso);
  return `${JOURS_LONGS[d.getDay()]} ${d.getDate()} ${MOIS_LONGS[d.getMonth()]} ${d.getFullYear()}`;
}

export function capitaliser(texte: string): string {
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

export interface JourDispo {
  iso: string;
  /** « Auj. » pour aujourd'hui, sinon « Jeu », « Ven »… */
  labelJour: string;
  numero: number;
  mois: string;
  /** true si le médecin est fermé ce jour-là (pastille grisée, non cliquable) */
  ferme: boolean;
}

/**
 * Bandeau de dates du panneau de réservation : les prochains jours à partir
 * d'aujourd'hui. Comme dans les maquettes, le dimanche n'apparaît pas dans la
 * barre et les autres jours de fermeture du médecin sont grisés.
 */
export function prochainsJours(joursFermes: number[], nb = 5): JourDispo[] {
  const resultat: JourDispo[] = [];
  const curseur = new Date();
  const aujourdhuiISO = versISO(curseur);
  while (resultat.length < nb) {
    if (curseur.getDay() !== 0) {
      const iso = versISO(curseur);
      resultat.push({
        iso,
        labelJour: iso === aujourdhuiISO ? "Auj." : JOURS_COURTS[curseur.getDay()],
        numero: curseur.getDate(),
        mois: MOIS_LONGS[curseur.getMonth()],
        ferme: joursFermes.includes(curseur.getDay()),
      });
    }
    curseur.setDate(curseur.getDate() + 1);
  }
  return resultat;
}
