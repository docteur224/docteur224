/**
 * Le niveau de signal d'un patient, écrit une seule fois.
 *
 * La base rend des comptes bruts — combien d'absences, combien de
 * rendez-vous terminés, quand la dernière — et c'est ici, et nulle part
 * ailleurs, qu'on en déduit un NIVEAU. Même raison que `lib/statuts-rdv.ts`
 * pour « à qualifier » : une règle de seuils recopiée dans la SQL et dans
 * l'écran finit par dire deux choses différentes le jour où l'une des deux
 * est ajustée, et personne ne sait plus laquelle le praticien a sous les yeux.
 *
 * Pur TypeScript : ni React, ni Supabase, ni import. Utilisable des deux
 * côtés, et testable sans base.
 *
 * Ce fichier ne décide JAMAIS d'un blocage. Il n'existe pas de niveau qui
 * ferme un créneau, refuse une réservation ou empêche une confirmation : le
 * signal informe celui qui décide, il ne décide pas à sa place.
 */

/* ===== Les trois niveaux ===== */

export type NiveauAbsence = "correct" | "a_surveiller" | "a_risque";

/**
 * Le libellé porte l'information à lui seul, la couleur ne fait que la
 * renforcer : un daltonien, une impression en noir et blanc ou un écran au
 * soleil ne doivent rien enlever à la lecture. Les classes sont celles de la
 * charte, donc elles suivent les couleurs choisies par l'utilisateur.
 *
 * Ni rouge, ni langage dur. « À risque » n'est pas une accusation : c'est le
 * constat qu'un créneau a plusieurs fois été perdu.
 */
export const APPARENCE_NIVEAU: Record<
  NiveauAbsence,
  { libelle: string; court: string; classe: string; icone: "horloge" | "alerte" }
> = {
  correct: { libelle: "Assidu", court: "Assidu", classe: "bg-bg text-muted", icone: "horloge" },
  a_surveiller: {
    libelle: "À surveiller",
    court: "À surveiller",
    classe: "bg-amber-soft text-amber",
    icone: "horloge",
  },
  a_risque: {
    // Une tournure factuelle plutôt qu'un verdict : on décrit ce qui s'est
    // passé (des absences qui se répètent), on ne qualifie pas la personne.
    // « court » est la forme brève, pour les endroits où le libellé suit déjà
    // un décompte (« 3 absences · Répétées ») et où « Absences répétées »
    // ferait écho.
    libelle: "Absences répétées",
    court: "Répétées",
    classe: "bg-orange-soft text-orange",
    icone: "alerte",
  },
};

export const libelleNiveau = (n: NiveauAbsence): string =>
  APPARENCE_NIVEAU[n]?.libelle ?? "Inconnu";
export const classeNiveau = (n: NiveauAbsence): string =>
  APPARENCE_NIVEAU[n]?.classe ?? "bg-bg text-muted";

/** Un patient « correct » ne porte aucune pastille : pas de signal sans motif. */
export const estSignale = (n: NiveauAbsence): boolean => n !== "correct";

/* ===== Les seuils ===== */

export interface SeuilsAbsence {
  /** Nombre d'absences à partir duquel on surveille. */
  seuilBas: number;
  /** Nombre d'absences à partir duquel on considère le risque établi. */
  seuilHaut: number;
  /** Part de no-show qui fait aussi basculer « à risque ». 0.3 = 30 %. */
  tauxHaut: number;
  /** En deçà de ce nombre de rendez-vous terminés, le TAUX ne déclenche rien. */
  miniRdv: number;
  /** Fenêtre glissante, en mois. */
  periodeMois: number;
}

/**
 * Les valeurs d'origine, celles que voit un praticien qui n'a jamais ouvert
 * les paramètres. Elles doivent rester les mêmes qu'en base (migration
 * 0085) : c'est l'absence de ligne `suivi_absence_parametres` qui vaut
 * « réglages par défaut », et les deux côtés doivent lire la même chose.
 */
export const SEUILS_DEFAUT: SeuilsAbsence = {
  seuilBas: 2,
  seuilHaut: 3,
  tauxHaut: 0.3,
  miniRdv: 3,
  periodeMois: 12,
};

/** Bornes des réglages, alignées sur les CHECK de la table. */
export const BORNES_SEUILS = {
  seuil: { min: 1, max: 20 },
  taux: { min: 5, max: 100 },
  miniRdv: { min: 1, max: 20 },
  periode: { min: 1, max: 60 },
} as const;

/* ===== Le calcul ===== */

export interface ComptesAbsence {
  /** Rendez-vous non honorés sur la période. */
  absences: number;
  /** Rendez-vous terminés : honorés + non honorés. Les annulés n'y sont pas. */
  termines: number;
}

/**
 * Le taux de no-show, entre 0 et 1.
 *
 * Zéro quand rien n'est terminé : un patient dont le premier rendez-vous est
 * demain n'a pas « 0 % » par mérite, il n'a simplement pas d'historique. Les
 * seuils de taux ne s'appliquent de toute façon qu'à partir de `miniRdv`.
 */
export function tauxNoShow({ absences, termines }: ComptesAbsence): number {
  return termines > 0 ? absences / termines : 0;
}

/** Le taux de présence, l'autre face du même chiffre : présence = 1 − no-show. */
export function tauxPresence(c: ComptesAbsence): number {
  return 1 - tauxNoShow(c);
}

/**
 * Le taux de no-show d'un mois, ou `null` si rien n'y est terminé.
 *
 * `null` et non zéro : un mois sans aucun rendez-vous terminé n'a pas « 0 % »
 * par mérite, il n'a pas de taux du tout. C'est la différence entre « aucun
 * patient ne m'a fait faux bond » et « je n'ai encore rien à compter », et
 * les trois écrans qui affichent ce chiffre doivent la faire.
 *
 * Partagé par le tableau de bord, la page Statistiques et le menu Suivi
 * d'absence — c'est ce qui garantit que la présence affichée quelque part ne
 * contredit pas le no-show affiché ailleurs.
 */
export function tauxNoShowMois(
  mois: { honores: number; absents: number } | undefined
): number | null {
  if (!mois) return null;
  const termines = mois.honores + mois.absents;
  return termines > 0 ? tauxNoShow({ absences: mois.absents, termines }) : null;
}

/** « 0.3157 » → « 32 % ». Un taux s'arrondit : la décimale ne décide de rien. */
export function formatPourcent(part: number): string {
  return `${Math.round(part * 100)} %`;
}

/**
 * Le niveau de signal d'un patient.
 *
 * Deux chemins mènent à « à risque », et c'est voulu : trois absences sur
 * quarante rendez-vous et trois sur quatre ne se lisent pas de la même
 * façon. Le compteur seul raterait le second cas, le taux seul affolerait
 * sur le premier.
 *
 *   • le NOMBRE d'absences atteint le seuil haut ;
 *   • ou le TAUX atteint `tauxHaut`, à condition qu'il y ait assez de
 *     rendez-vous terminés pour qu'un taux veuille dire quelque chose.
 *
 * Ce garde-fou est la raison d'être de `miniRdv` : sans lui, un patient
 * absent à son unique rendez-vous afficherait 100 % de no-show et basculerait
 * « à risque » sur un seul fait. À noter, avec les valeurs par défaut (3
 * rendez-vous minimum, 30 %) : UNE absence sur trois rendez-vous fait 33 %
 * et suffit donc. C'est la règle demandée ; un praticien qui la trouve
 * sévère relève `miniRdv` ou `tauxHaut` dans les paramètres du menu.
 */
export function niveauRisque(
  comptes: ComptesAbsence,
  seuils: SeuilsAbsence = SEUILS_DEFAUT
): NiveauAbsence {
  const { absences, termines } = comptes;
  if (absences <= 0) return "correct";
  if (absences >= seuils.seuilHaut) return "a_risque";
  if (termines >= seuils.miniRdv && tauxNoShow(comptes) >= seuils.tauxHaut) return "a_risque";
  if (absences >= seuils.seuilBas) return "a_surveiller";
  return "correct";
}

/* ===== Mise en mots ===== */

/** « 3 absences sur 12 rendez-vous » — factuel, sans adjectif. */
export function detailAbsences({ absences, termines }: ComptesAbsence): string {
  const a = `${absences} absence${absences > 1 ? "s" : ""}`;
  return `${a} sur ${termines} rendez-vous`;
}

/**
 * Le modèle d'avertissement par défaut. Respectueux et factuel : on rappelle
 * qu'un créneau manqué prive quelqu'un d'autre, on invite à annuler à
 * l'avance, on reste disponible. Aucun reproche, aucune menace, aucune
 * mention de sanction — il n'y en a pas.
 *
 * Doit rester identique au `default` de `suivi_absence_parametres.modele_message`.
 */
export const MODELE_AVERTISSEMENT_DEFAUT =
  "Bonjour [Prénom], nous avons remarqué plusieurs rendez-vous non honorés avec " +
  "[professionnel]. Les créneaux sont précieux et d'autres patients attendent. " +
  "Merci de penser à annuler à l'avance en cas d'empêchement. Nous restons " +
  "disponibles pour vous.";

/**
 * Remplace les deux marques du modèle. Tolérant sur la casse et les accents
 * de « [Prénom] » : le praticien réécrit son modèle à la main, il n'a pas à
 * deviner la graphie exacte attendue.
 */
export function remplirModele(
  modele: string,
  valeurs: { prenom: string; professionnel: string }
): string {
  return modele
    .replace(/\[\s*pr[eé]nom\s*\]/gi, valeurs.prenom || "Madame, Monsieur")
    .replace(/\[\s*professionnel\s*\]/gi, valeurs.professionnel || "votre praticien");
}

/* ===== Montants ===== */

/** « 150000 » → « 150 000 GNF ». Espace insécable fine, comme ailleurs. */
export function formatMontantGnf(montant: number): string {
  return `${Math.round(montant).toLocaleString("fr-FR").replace(/ | /g, " ")} GNF`;
}

/**
 * Le manque à gagner : des créneaux perdus multipliés par un prix.
 *
 * `null` quand le praticien n'affiche aucun prix ferme — un acte « selon le
 * cas » ne se multiplie pas. On préfère ne rien afficher plutôt que d'annoncer
 * un manque à gagner de zéro franc, qui se lirait comme « cela ne coûte rien ».
 */
export function manqueAGagner(absences: number, tarifReference: number | null): number | null {
  return tarifReference && tarifReference > 0 ? absences * tarifReference : null;
}
