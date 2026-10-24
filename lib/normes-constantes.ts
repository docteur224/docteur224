/*
 * Lecture des constantes : unités, seuils, périodes des courbes.
 *
 * Module PUR — aucune dépendance, aucun « use client » : importable côté
 * serveur, et testé par `node --test scripts/tests/` sans navigateur.
 *
 * Les seuils sont les repères adultes usuels (OMS, sociétés savantes
 * d'hypertension et de diabétologie). Ils servent à SIGNALER une valeur, pas
 * à poser un diagnostic : l'écran le dit, et le médecin reste juge — une
 * tension à 150 chez un patient qui sort d'un escalier n'a pas le sens
 * qu'elle a au repos.
 */

export type Niveau = "normal" | "attention" | "alerte";

export interface Evaluation {
  niveau: Niveau;
  libelle: string;
}

export type ContexteGlycemie = "a_jeun" | "apres_repas" | "au_hasard";

export const UNITES = { poids: "kg", tension: "mmHg", glycemie: "g/L" } as const;

export const LIBELLES_CONTEXTE: Record<ContexteGlycemie, string> = {
  a_jeun: "à jeun",
  apres_repas: "après repas",
  au_hasard: "au hasard",
};

/**
 * Tension artérielle (mmHg). Le chiffre le plus défavorable des deux décide :
 * 135/95 est une tension élevée, même si la systolique est normale.
 */
export function evaluerTension(sys: number, dia: number): Evaluation {
  if (sys >= 180 || dia >= 110) return { niveau: "alerte", libelle: "Très élevée" };
  if (sys >= 140 || dia >= 90) return { niveau: "attention", libelle: "Élevée" };
  if (sys < 90 || dia < 60) return { niveau: "attention", libelle: "Basse" };
  return { niveau: "normal", libelle: "Normale" };
}

/**
 * Glycémie (g/L). Le contexte change tout : 1,30 g/L est le seuil du diabète
 * à jeun, une valeur ordinaire deux heures après un repas. Une hypoglycémie
 * est une alerte quel que soit le contexte.
 */
export function evaluerGlycemie(g: number, contexte: ContexteGlycemie): Evaluation {
  if (g < 0.7) return { niveau: "alerte", libelle: "Hypoglycémie" };
  if (contexte === "a_jeun") {
    if (g >= 1.26) return { niveau: "alerte", libelle: "Élevée (seuil du diabète)" };
    if (g >= 1.1) return { niveau: "attention", libelle: "Hyperglycémie modérée" };
    return { niveau: "normal", libelle: "Normale" };
  }
  if (g >= 2) return { niveau: "alerte", libelle: "Très élevée" };
  if (g >= 1.4) return { niveau: "attention", libelle: "Élevée" };
  return { niveau: "normal", libelle: "Normale" };
}

/**
 * Variation de poids entre deux pesées, en pourcentage du premier. Signalée
 * au-delà de 5 % en moins de trois mois : c'est le repère d'une perte de
 * poids involontaire significative, à ne pas laisser passer.
 */
export function variationPoids(
  avant: { kg: number; le: string },
  apres: { kg: number; le: string }
): { pourcentage: number; signalee: boolean } {
  const pourcentage = ((apres.kg - avant.kg) / avant.kg) * 100;
  const jours = (Date.parse(apres.le) - Date.parse(avant.le)) / 86_400_000;
  return {
    // Arrondi au plus loin de zéro : Math.round seul arrondit −6,25 à −6,2
    // (vers +∞), là où l'usage écrit −6,3.
    pourcentage: (Math.sign(pourcentage) * Math.round(Math.abs(pourcentage) * 10)) / 10,
    signalee: Math.abs(pourcentage) >= 5 && jours <= 92,
  };
}

/* ---------- Périodes des courbes ---------- */

export type Periode = "3m" | "6m" | "1a" | "tout";

export const PERIODES: { valeur: Periode; libelle: string; mois: number | null }[] = [
  { valeur: "3m", libelle: "3 mois", mois: 3 },
  { valeur: "6m", libelle: "6 mois", mois: 6 },
  { valeur: "1a", libelle: "1 an", mois: 12 },
  { valeur: "tout", libelle: "Tout", mois: null },
];

/** Début de la période, `null` pour « tout ». Mois calendaires, pas 30 jours. */
export function debutPeriode(periode: Periode, maintenant: Date): Date | null {
  const mois = PERIODES.find((p) => p.valeur === periode)?.mois ?? null;
  if (mois === null) return null;
  const d = new Date(maintenant);
  d.setMonth(d.getMonth() - mois);
  return d;
}

/** Points d'une période, du plus ancien au plus récent (sens de lecture d'une courbe). */
export function dansPeriode<T extends { le: string }>(
  points: T[],
  periode: Periode,
  maintenant: Date
): T[] {
  const debut = debutPeriode(periode, maintenant);
  return points
    .filter((p) => !debut || Date.parse(p.le) >= debut.getTime())
    .sort((a, b) => Date.parse(a.le) - Date.parse(b.le));
}

/* ---------- Écriture française des nombres ---------- */

/** « 72,5 », « 1,32 » : virgule décimale, sans zéros inutiles. */
export function nombreFr(n: number, decimales = 1): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: decimales });
}

/**
 * Lit une saisie française (« 72,5 », « 1.32 », « 72 ») ; `null` si vide,
 * `NaN` si illisible. Le clavier numérique d'un téléphone en français tape
 * une virgule : refuser la virgule, c'est refuser le clavier.
 */
export function lireNombre(saisie: string): number | null {
  const t = saisie.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : Number.NaN;
}
