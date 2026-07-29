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

/** Abréviations affichées dans les pastilles de date des cartes RDV (« 11 JUIN »). */
export const MOIS_ABREGES = [
  "JANV",
  "FÉVR",
  "MARS",
  "AVR",
  "MAI",
  "JUIN",
  "JUIL",
  "AOÛT",
  "SEPT",
  "OCT",
  "NOV",
  "DÉC",
];

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

/** « 2024-03-12 » → « 12/03/2024 ». */
export function formatDateCourte(iso: string): string {
  const [annee, mois, jour] = iso.split("-");
  return `${jour}/${mois}/${annee}`;
}

/** Âge en années révolues à partir d'une date de naissance « AAAA-MM-JJ ». */
export function calculerAge(dateNaissanceISO: string): number {
  const naissance = depuisISO(dateNaissanceISO);
  const aujourdhui = new Date();
  let age = aujourdhui.getFullYear() - naissance.getFullYear();
  const m = aujourdhui.getMonth() - naissance.getMonth();
  if (m < 0 || (m === 0 && aujourdhui.getDate() < naissance.getDate())) age--;
  return age;
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
 * Horizon de réservation : un an à partir d'aujourd'hui. Les disponibilités
 * ne sont pas chargées d'un bloc sur toute cette période — useDisponibilites
 * élargit sa fenêtre à la demande quand le patient navigue plus loin.
 */
export const HORIZON_RESERVATION_JOURS = 365;

/**
 * Délai de prévenance : on ne peut pas réserver un créneau qui commence dans
 * moins de 2 heures. Laisse une marge de préparation au médecin tout en
 * gardant le rendez-vous le jour même possible (à 13h, 15:00 reste ouvert).
 */
export const DELAI_PREVENANCE_HEURES = 2;

/**
 * Un créneau est-il encore réservable ? Faux pour le passé et pour tout ce
 * qui commence avant le délai de prévenance.
 *
 * Utilisé à la fois pour masquer les créneaux côté patient et pour refuser
 * une réservation forcée par l'URL — l'affichage ne suffit pas à protéger.
 *
 * Fuseau : la comparaison se fait en heure locale du runtime. La Guinée est à
 * UTC+0 toute l'année (pas d'heure d'été), donc le rendu serveur — en UTC sur
 * Vercel — donne le même résultat qu'un navigateur à Conakry. Un patient
 * connecté depuis un autre fuseau verra la grille filtrée selon son heure
 * locale, mais la revalidation serveur, elle, reste alignée sur Conakry.
 */
export function creneauReservable(dateISO: string, heure: string, maintenant = new Date()): boolean {
  const [h, min] = heure.split(":").map(Number);
  const debut = depuisISO(dateISO);
  debut.setHours(h, min, 0, 0);
  const limite = new Date(maintenant.getTime() + DELAI_PREVENANCE_HEURES * 3600000);
  return debut >= limite;
}

/**
 * Bandeau de dates du panneau de réservation : `nb` jours consécutifs à
 * partir d'aujourd'hui + `decalage` jours affichables. Comme dans les
 * maquettes, le dimanche n'apparaît pas dans la barre et les autres jours de
 * fermeture du médecin sont grisés.
 *
 * `decalage` permet la navigation « page suivante / précédente » du bandeau :
 * il compte en jours affichables (dimanches exclus), donc un décalage de `nb`
 * fait défiler exactement d'une page. La liste s'arrête à
 * HORIZON_RESERVATION_JOURS, ce qui borne naturellement le défilement avant.
 */
export function prochainsJours(joursFermes: number[], nb = 5, decalage = 0): JourDispo[] {
  const resultat: JourDispo[] = [];
  const curseur = new Date();
  const aujourdhuiISO = versISO(curseur);
  const limite = new Date();
  limite.setDate(limite.getDate() + HORIZON_RESERVATION_JOURS);
  let ignores = 0;

  while (resultat.length < nb && curseur <= limite) {
    if (curseur.getDay() !== 0) {
      if (ignores < decalage) {
        ignores++;
      } else {
        const iso = versISO(curseur);
        resultat.push({
          iso,
          labelJour: iso === aujourdhuiISO ? "Auj." : JOURS_COURTS[curseur.getDay()],
          numero: curseur.getDate(),
          mois: MOIS_LONGS[curseur.getMonth()],
          ferme: joursFermes.includes(curseur.getDay()),
        });
      }
    }
    curseur.setDate(curseur.getDate() + 1);
  }
  return resultat;
}

/** Nombre total de jours affichables (dimanches exclus) dans l'horizon de réservation. */
export function nbJoursAffichables(): number {
  // Sur N jours consécutifs il y a exactement un dimanche par semaine entière,
  // plus au maximum un dans le reliquat — inutile de boucler sur l'année.
  const total = HORIZON_RESERVATION_JOURS + 1; // aujourd'hui inclus
  const jourAujourdhui = new Date().getDay();
  const semainesEntieres = Math.floor(total / 7);
  const reliquat = total % 7;
  let dimanches = semainesEntieres;
  for (let i = 0; i < reliquat; i++) {
    if ((jourAujourdhui + i) % 7 === 0) dimanches++;
  }
  return total - dimanches;
}

/** Un mois proposé dans le sélecteur « aller à » du bandeau de dates. */
export interface MoisDispo {
  /** Libellé affiché : « août 2026 ». */
  label: string;
  /** Décalage en jours affichables pour atteindre le 1er jour affichable du mois. */
  decalage: number;
}

/**
 * Mois couverts par l'horizon de réservation, avec le décalage à appliquer au
 * bandeau pour sauter directement au début de chacun. Permet d'atteindre le
 * 12e mois sans enchaîner les clics sur « › ».
 *
 * Le mois courant pointe sur aujourd'hui (décalage 0), pas sur le 1er du mois,
 * puisque les dates passées ne sont pas réservables.
 */
export function moisDeLHorizon(): MoisDispo[] {
  const resultat: MoisDispo[] = [];
  const curseur = new Date();
  const limite = new Date();
  limite.setDate(limite.getDate() + HORIZON_RESERVATION_JOURS);
  let affichables = 0;
  let dernierMois = -1;

  while (curseur <= limite) {
    if (curseur.getDay() !== 0) {
      const mois = curseur.getMonth();
      if (mois !== dernierMois) {
        dernierMois = mois;
        resultat.push({
          label: `${MOIS_LONGS[mois]} ${curseur.getFullYear()}`,
          decalage: affichables,
        });
      }
      affichables++;
    }
    curseur.setDate(curseur.getDate() + 1);
  }
  return resultat;
}

/**
 * Jours à charger pour couvrir un décalage donné du bandeau : conversion
 * « jours affichables » → « jours calendaires » (6 jours affichables pour 7
 * calendaires), plus une marge d'un mois pour ne pas relancer une requête à
 * chaque clic sur « › ».
 *
 * Le plafond à HORIZON_RESERVATION_JOURS reste sûr : aucune date au-delà de
 * l'horizon n'est affichable, donc la fenêtre couvre toujours le bandeau.
 */
export function joursACharger(decalage: number, taillePage: number): number {
  const calendaires = Math.ceil(((decalage + taillePage) * 7) / 6);
  return Math.min(HORIZON_RESERVATION_JOURS, calendaires + 30);
}
