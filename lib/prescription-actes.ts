/*
 * Ordonnance d'ACTES — analyses de biologie, examens d'imagerie — et le
 * texte qui en est tiré.
 *
 * Module PUR, pendant de `lib/prescription.ts` pour ce qui ne se prescrit
 * pas avec une posologie. La différence tient en une phrase : un médicament
 * se prescrit avec une dose et une durée, une analyse ne se prescrit
 * qu'elle-même. Le contexte clinique se dit UNE FOIS, pour l'ordonnance
 * entière, et non ligne à ligne — c'est ce que le laboratoire lit, et il le
 * lit une fois.
 */

export type DomaineActe = "biologie" | "imagerie";

export interface LigneActe {
  /** Référence au référentiel ; null pour un acte saisi à la main. */
  acteId: string | null;
  /** « NFS (hémogramme) » : ce qui s'imprime. */
  libelle: string;
}

export const LIGNE_ACTE_VIDE: LigneActe = { acteId: null, libelle: "" };

/**
 * Ce qui porte sur l'ordonnance ENTIÈRE, et non sur une ligne.
 *
 * Rangées à part des lignes (`documents_patient.prescription_options`) parce
 * qu'elles doivent survivre à une correction : `corriger_document` recopie
 * des colonnes, il ne relit jamais le texte imprimé.
 */
export interface OptionsActes {
  /** Prélèvement à jeun. */
  jeun?: boolean;
  /** À traiter en priorité. */
  urgent?: boolean;
  /**
   * Renseignements cliniques — ce que le laboratoire lit pour interpréter.
   *
   * Rangés ICI et non relus dans le texte imprimé, pour la même raison que
   * les deux drapeaux. Les remarques d'une ordonnance de médicaments, elles,
   * se retrouvent encore par expression régulière en fin de contenu
   * (`remarquesDe`) : c'est une fragilité qu'on ne reconduit pas.
   */
  renseignements?: string;
}

export interface ActeRef {
  id: string;
  domaine: DomaineActe;
  libelle: string;
  categorie: string | null;
}

/** Une ligne compte quand elle nomme un acte. */
export const ligneActeRemplie = (l: LigneActe) => l.libelle.trim() !== "";

/* ===================== Normalisation de la recherche ===================== */

/*
 * MIROIR EXACT de la fonction SQL `normaliser_recherche` (migration 0068),
 * et c'est tout l'enjeu : la colonne `actes_prescriptibles.recherche` est
 * normalisée par la base, la saisie du médecin l'est ici. Si les deux
 * divergeaient d'un seul caractère, la recherche ne rendrait rien sans que
 * rien ne signale l'erreur.
 *
 * D'où la reprise à l'identique des deux chaînes de `translate`, plutôt
 * qu'un `normalize("NFD")` : celui-ci dépouille BIEN PLUS de caractères que
 * la liste SQL, et les deux côtés cesseraient de se correspondre.
 *
 * Les ligatures d'abord, pour la même raison qu'en SQL : « œ » vaut deux
 * lettres, ce qu'un remplacement caractère à caractère ne sait pas faire.
 */
const ACCENTUES = "àáâãäçèéêëìíîïñòóôõöùúûüýÿ";
const SANS_ACCENT = "aaaaaceeeeiiiinooooouuuuyy";

export function normaliserRecherche(texte: string): string {
  const base = (texte ?? "").trim().toLowerCase().replace(/œ/g, "oe").replace(/æ/g, "ae");
  let sortie = "";
  for (const c of base) {
    const i = ACCENTUES.indexOf(c);
    sortie += i >= 0 ? SANS_ACCENT[i] : c;
  }
  return sortie;
}

/**
 * Le texte de l'ordonnance, tel que l'imprime le PDF.
 *
 * Les mentions « urgent » et « à jeun » sont EN TÊTE et en capitales : la
 * première s'adresse au laboratoire, la seconde au patient, et toutes deux
 * perdent leur sens si on les découvre après la liste.
 *
 * Les actes sont numérotés plutôt que mis en capitales comme les
 * médicaments : ce qu'on vérifie sur une ordonnance d'analyses, c'est qu'on
 * les a toutes, et un décompte se lit mieux qu'une casse.
 */
export function texteOrdonnanceActes(lignes: LigneActe[], options: OptionsActes = {}): string {
  const entete = [options.urgent ? "EXAMEN URGENT" : "", options.jeun ? "À JEUN" : ""].filter(Boolean);
  const actes = lignes
    .filter(ligneActeRemplie)
    .map((l, i) => `${i + 1}. ${l.libelle.trim()}`)
    .join("\n");
  const renseignements = (options.renseignements ?? "").trim();
  const fin = renseignements ? `Renseignements cliniques : ${renseignements}` : "";
  return [entete.join("\n"), actes, fin].filter(Boolean).join("\n\n");
}

/** Valide une ordonnance d'actes avant envoi : le message à afficher, ou null. */
export function problemeActes(lignes: LigneActe[]): string | null {
  if (lignes.filter(ligneActeRemplie).length === 0) return "Ajoutez au moins un acte.";
  return null;
}

/**
 * Les options telles qu'on les range en base : `null` plutôt qu'un objet
 * vide quand rien n'est coché, pour que la colonne distingue « aucune
 * option » de « pièce qui n'en porte pas ».
 */
export function optionsEnBase(options: OptionsActes): OptionsActes | null {
  const propres: OptionsActes = {};
  if (options.jeun) propres.jeun = true;
  if (options.urgent) propres.urgent = true;
  const renseignements = (options.renseignements ?? "").trim();
  if (renseignements) propres.renseignements = renseignements;
  return Object.keys(propres).length ? propres : null;
}
