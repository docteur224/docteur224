/*
 * Géométrie de la carte des médecins — module PUR.
 *
 * Pas de directive « use client » : /resultats est un composant serveur et
 * y calcule les repères avant de les envoyer au navigateur, tandis que la
 * carte elle-même (composant client) réutilise `distanceKm` et `emprise`
 * pour le tri par distance et le bouton « Rechercher dans cette zone ».
 * Une seule définition des deux côtés, sinon les deux dérivent.
 *
 * Le problème central n'est pas de dessiner : c'est que la position d'un
 * médecin est très souvent inconnue. `medecins.localisation` est un champ
 * libre rempli à l'inscription — coordonnées relevées au GPS, lien Google
 * Maps collé, ou rien. D'où une position à trois niveaux de précision
 * (`gps` → `commune` → `ville`), toujours annoncée telle quelle à
 * l'utilisateur : un repère approximatif présenté comme exact enverrait un
 * patient à la mauvaise adresse.
 */

export interface Point {
  lat: number;
  lon: number;
}

/** D'où vient la position affichée — dit mot pour mot au patient. */
export type PrecisionPosition = "gps" | "commune" | "ville";

export interface PositionMedecin extends Point {
  precision: PrecisionPosition;
}

/*
 * Rectangle englobant la Guinée, un peu élargi (7,1°–12,7° N,
 * 15,1°–7,6° O). Il ne sert pas à valider une adresse mais à écarter les
 * relevés manifestement faux : le seed portait « 48.93, 2.21 », la position
 * du poste de développement en région parisienne, et sans ce filtre la
 * carte s'ouvrait sur la banlieue de Paris. Un praticien exerçant hors de
 * Guinée n'existe pas dans le produit ; le jour où cela change, c'est ce
 * rectangle qu'on élargit, à un seul endroit.
 */
export const BORNES_GUINEE = { latMin: 7.1, latMax: 12.7, lonMin: -15.1, lonMax: -7.6 };

export function estEnGuinee(p: Point): boolean {
  return (
    p.lat >= BORNES_GUINEE.latMin &&
    p.lat <= BORNES_GUINEE.latMax &&
    p.lon >= BORNES_GUINEE.lonMin &&
    p.lon <= BORNES_GUINEE.lonMax
  );
}

/** Centre de Conakry — vue par défaut quand aucun repère n'est plaçable. */
export const CENTRE_DEFAUT: Point = { lat: 9.5092, lon: -13.7122 };

/**
 * « 9.53795, -13.67729 » → point, ou null. Rend null aussi pour un lien
 * Google Maps : un `maps.app.goo.gl` ne se résout qu'en appelant Google, ce
 * que la carte ne fait pas — ces médecins passent au repli par commune.
 */
export function parserCoordonnees(valeur: string | null | undefined): Point | null {
  const texte = (valeur ?? "").trim();
  const m = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(texte);
  if (!m) return null;
  const point = { lat: Number(m[1]), lon: Number(m[2]) };
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return null;
  return estEnGuinee(point) ? point : null;
}

/** Empreinte stable d'une chaîne — même fonction que les dégradés d'avatar. */
function empreinte(texte: string): number {
  let h = 0;
  for (let i = 0; i < texte.length; i++) h = (Math.imul(h, 31) + texte.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Écarte un repère de repli de quelques centaines de mètres autour du centre
 * de sa commune, sinon les huit médecins de Ratoma se superposent au pixel
 * près : le groupe ne se sépare jamais, même au zoom maximal, et la carte
 * paraît n'en compter qu'un.
 *
 * Le décalage est déterministe (dérivé de l'identifiant) : un repère qui
 * saute d'un chargement à l'autre est pire qu'un repère décalé.
 */
function ecarter(centre: Point, cle: string, rayonMetres: number): Point {
  const h = empreinte(cle);
  const angle = ((h % 360) * Math.PI) / 180;
  // Racine carrée : sans elle les points s'agglutinent au centre du disque.
  const rayon = rayonMetres * Math.sqrt(((h >> 9) % 1000) / 1000);
  const dLat = (rayon * Math.cos(angle)) / 111320;
  const dLon = (rayon * Math.sin(angle)) / (111320 * Math.cos((centre.lat * Math.PI) / 180));
  return { lat: centre.lat + dLat, lon: centre.lon + dLon };
}

/** Centres de repli, indexés par nom normalisé (voir chargerReferencesGeo). */
export interface ReferencesGeo {
  /** Clé : « ville|commune » normalisé. */
  communes: Record<string, Point>;
  /** Clé : nom de ville normalisé. */
  villes: Record<string, Point>;
}

export const cleGeo = (texte: string) =>
  (texte ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

/**
 * Position à afficher pour un médecin, du plus précis au plus vague.
 * null quand même la ville est inconnue : mieux vaut un repère absent —
 * et compté comme tel — qu'un repère posé au hasard.
 */
export function positionMedecin(
  medecin: { id: string; localisation?: string; commune?: string; ville?: string },
  references: ReferencesGeo
): PositionMedecin | null {
  const gps = parserCoordonnees(medecin.localisation);
  if (gps) return { ...gps, precision: "gps" };

  const ville = cleGeo(medecin.ville ?? "");
  const commune = references.communes[`${ville}|${cleGeo(medecin.commune ?? "")}`];
  // 400 m : l'ordre de grandeur d'une commune de Conakry, assez pour séparer
  // les repères sans les envoyer dans la commune voisine.
  if (commune) return { ...ecarter(commune, medecin.id, 400), precision: "commune" };

  const centreVille = references.villes[ville];
  if (centreVille) return { ...ecarter(centreVille, medecin.id, 2500), precision: "ville" };

  return null;
}

/**
 * Un repère prêt à poser sur la carte. Calculé côté serveur dans
 * /resultats, puis sérialisé vers le composant client : la carte ne
 * refait aucune requête, elle affiche ce que la recherche a déjà trouvé.
 * D'où des champs volontairement plats et déjà formatés.
 */
export interface PointCarte extends PositionMedecin {
  id: string;
  nom: string;
  specialite: string;
  emoji: string;
  photoUrl: string | null;
  initiales: string;
  gradient: string;
  /** « Hôpital Donka · Dixinn, Conakry » */
  adresse: string;
  /** Commune ou ville qui a servi de repli — vide si position GPS. */
  lieuApproximatif: string;
  note: number;
  nbAvis: number;
  /*
   * Disponibilité telle qu'annoncée sur les cartes de la liste, déduite des
   * horaires-types. La carte ne descend volontairement pas jusqu'à l'heure
   * du prochain créneau : ce serait une requête par praticien affiché, et
   * l'écran en porte tout le résultat, pas les douze d'une page.
   */
  dispoLabel: string;
  dispoAujourdhui: boolean;
}

/** Phrase affichée sous l'adresse dans la bulle — jamais de fausse précision. */
export function mentionPrecision(precision: PrecisionPosition, lieu: string): string {
  if (precision === "gps") return "📍 Position relevée par le praticien";
  return `≈ Position approximative · ${lieu}`;
}

/** Distance à vol d'oiseau, en kilomètres (formule de haversine). */
export function distanceKm(a: Point, b: Point): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0).replace(".", ",")} km`;
}

export interface Emprise {
  sud: number;
  ouest: number;
  nord: number;
  est: number;
}

/** Rectangle contenant tous les points, ou null si la liste est vide. */
export function emprise(points: Point[]): Emprise | null {
  if (points.length === 0) return null;
  let sud = points[0].lat;
  let nord = points[0].lat;
  let ouest = points[0].lon;
  let est = points[0].lon;
  for (const p of points) {
    sud = Math.min(sud, p.lat);
    nord = Math.max(nord, p.lat);
    ouest = Math.min(ouest, p.lon);
    est = Math.max(est, p.lon);
  }
  return { sud, ouest, nord, est };
}

export function dansEmprise(p: Point, e: Emprise): boolean {
  return p.lat >= e.sud && p.lat <= e.nord && p.lon >= e.ouest && p.lon <= e.est;
}
