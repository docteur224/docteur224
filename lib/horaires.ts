/*
 * Horaires type de la semaine (table `horaires_types`, 0 = dimanche).
 *
 * Module pur : il est importé par des composants serveur (fiche publique)
 * comme par des hooks client, il ne doit donc rien tirer de React ni de
 * Supabase.
 *
 * Le résumé affiché sur les cartes de résultat était jusqu'ici
 * « premier jour — dernier jour » : un médecin ouvert lundi, mardi et
 * samedi s'annonçait « Lundi — Samedi », donc ouvert le mercredi. On
 * regroupe désormais les jours réellement consécutifs, et la fiche
 * détaille chaque jour avec ses heures propres.
 */

export interface PlageHoraire {
  jour_semaine: number;
  heure_debut: string;
  heure_fin: string;
}

export interface JourHoraire {
  jour: number;
  nom: string;
  plages: { debut: string; fin: string }[];
}

export const JOURS_NOMS = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
];

/** La semaine commence le lundi côté affichage, pas le dimanche. */
export const ORDRE_SEMAINE = [1, 2, 3, 4, 5, 6, 0];

const hhmm = (h: string) => h.slice(0, 5);

/** Les 7 jours dans l'ordre lundi → dimanche, plages triées, jours fermés inclus. */
export function horairesParJour(plages: PlageHoraire[]): JourHoraire[] {
  return ORDRE_SEMAINE.map((jour) => ({
    jour,
    nom: JOURS_NOMS[jour],
    plages: plages
      .filter((p) => p.jour_semaine === jour)
      .map((p) => ({ debut: hhmm(p.heure_debut), fin: hhmm(p.heure_fin) }))
      .sort((a, b) => a.debut.localeCompare(b.debut)),
  }));
}

/** Jours d'ouverture regroupés : « Lundi — Vendredi, Samedi ». */
export function resumeJours(plages: PlageHoraire[]): string {
  const ouverts = ORDRE_SEMAINE.filter((j) => plages.some((p) => p.jour_semaine === j));
  if (ouverts.length === 0) return "Sur rendez-vous";

  const groupes: number[][] = [];
  for (const jour of ouverts) {
    const dernier = groupes[groupes.length - 1];
    const precedent = dernier?.[dernier.length - 1];
    const consecutif =
      precedent !== undefined &&
      ORDRE_SEMAINE.indexOf(jour) === ORDRE_SEMAINE.indexOf(precedent) + 1;
    if (consecutif) dernier.push(jour);
    else groupes.push([jour]);
  }

  return groupes
    .map((g) =>
      g.length === 1
        ? JOURS_NOMS[g[0]]
        : `${JOURS_NOMS[g[0]]} — ${JOURS_NOMS[g[g.length - 1]]}`
    )
    .join(", ");
}

/** Amplitude d'ouverture : « 08:00 à 17:00 ». */
export function resumeHeures(plages: PlageHoraire[]): string {
  if (plages.length === 0) return "Horaires à confirmer";
  const debuts = plages.map((p) => hhmm(p.heure_debut)).sort();
  const fins = plages.map((p) => hhmm(p.heure_fin)).sort();
  return `${debuts[0]} à ${fins[fins.length - 1]}`;
}
