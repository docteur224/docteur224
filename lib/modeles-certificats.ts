/*
 * Modèles de certificats médicaux et d'arrêts de travail, pré-remplis avec
 * l'identité du patient et du médecin.
 *
 * Module PUR. Le texte produit est un POINT DE DÉPART : le médecin le relit
 * et le modifie avant de le remettre — un certificat engage sa signature,
 * aucun modèle ne décide à sa place de ce qu'il atteste.
 *
 * Formules d'usage en Afrique francophone (« pour servir et valoir ce que
 * de droit »). L'arrêt de travail ne mentionne aucun diagnostic : il est
 * destiné à l'employeur, qui n'a pas à le connaître.
 */

export type CleModele = "constatation" | "sport" | "bonne_sante" | "presence" | "arret";

export interface DefinitionModele {
  cle: CleModele;
  type: "certificat" | "arret_travail";
  libelle: string;
}

export const MODELES: DefinitionModele[] = [
  { cle: "constatation", type: "certificat", libelle: "Certificat médical (constatation)" },
  { cle: "sport", type: "certificat", libelle: "Certificat d’aptitude au sport" },
  { cle: "bonne_sante", type: "certificat", libelle: "Certificat de bonne santé" },
  { cle: "presence", type: "certificat", libelle: "Attestation de consultation" },
  { cle: "arret", type: "arret_travail", libelle: "Arrêt de travail" },
];

export interface ContexteModele {
  /** « Pr Mamadou Diallo » */
  medecin: string;
  specialite: string;
  /** « Alpha Condé » */
  patient: string;
  /** « AAAA-MM-JJ » ou null */
  naissance: string | null;
  genre: string | null;
  /** Date du jour (ISO) — passée, pour que la fonction reste pure. */
  aujourdhui: string;
  /* Champs propres à certains modèles */
  sport?: string;
  competition?: boolean;
  debut?: string;
  fin?: string;
  sortiesAutorisees?: boolean;
  prolongation?: boolean;
  heure?: string;
}

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « 24 octobre 2026 » depuis « 2026-10-24 ». */
export function dateLongue(iso: string): string {
  const [a, m, j] = iso.slice(0, 10).split("-").map(Number);
  return `${j === 1 ? "1er" : j} ${MOIS[m - 1]} ${a}`;
}

/** Jours d'arrêt, bornes comprises ; 0 si les dates sont incohérentes. */
export function joursArret(debut: string, fin: string): number {
  const d = Date.parse(`${debut.slice(0, 10)}T00:00:00Z`);
  const f = Date.parse(`${fin.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d) || Number.isNaN(f) || f < d) return 0;
  return Math.round((f - d) / 86_400_000) + 1;
}

const ne = (genre: string | null) => (genre === "F" ? "née" : genre === "M" ? "né" : "né(e)");
const interesse = (genre: string | null) => (genre === "F" ? "l’intéressée" : genre === "M" ? "l’intéressé" : "l’intéressé(e)");

function entete(c: ContexteModele): string {
  const qui = `Je soussigné(e), ${c.medecin}${c.specialite ? `, ${c.specialite.toLowerCase()}` : ""},`;
  const patient = `${c.patient}${c.naissance ? `, ${ne(c.genre)} le ${dateLongue(c.naissance)}` : ""}`;
  return `${qui} certifie avoir examiné ce jour, ${dateLongue(c.aujourdhui)}, ${patient}`;
}

const FORMULE = (c: ContexteModele) =>
  `Certificat établi à la demande de ${interesse(c.genre)} et remis en main propre pour servir et valoir ce que de droit.`;

/** Titre et texte pré-remplis d'un modèle. */
export function remplirModele(cle: CleModele, c: ContexteModele): { titre: string; texte: string } {
  switch (cle) {
    case "constatation":
      return {
        titre: "Certificat médical",
        texte: `${entete(c)}.\n\nConstatations : \n\n${FORMULE(c)}`,
      };
    case "sport": {
      const sport = c.sport?.trim() || "[sport]";
      return {
        titre: "Certificat d’aptitude au sport",
        texte:
          `${entete(c)}, et n’avoir constaté, à la date de l’examen, aucun signe clinique apparent ` +
          `contre-indiquant la pratique de : ${sport}${c.competition ? ", y compris en compétition" : ""}.` +
          `\n\n${FORMULE(c)}`,
      };
    }
    case "bonne_sante":
      return {
        titre: "Certificat de bonne santé",
        texte:
          `${entete(c)}, et atteste qu’à la date de l’examen ${interesse(c.genre).replace("l’", "l’")} ` +
          `ne présente aucun signe clinique de maladie contagieuse ni de pathologie évolutive apparente.` +
          `\n\n${FORMULE(c)}`,
      };
    case "presence":
      return {
        titre: "Attestation de consultation",
        texte:
          `Je soussigné(e), ${c.medecin}${c.specialite ? `, ${c.specialite.toLowerCase()}` : ""}, atteste que ` +
          `${c.patient} s’est présenté(e) à ma consultation le ${dateLongue(c.aujourdhui)}` +
          `${c.heure ? ` à ${c.heure}` : ""}.\n\nAttestation délivrée pour justifier de son absence.`,
      };
    case "arret": {
      const debut = c.debut ?? c.aujourdhui;
      const fin = c.fin ?? debut;
      const jours = joursArret(debut, fin);
      const court = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
      return {
        titre: `Arrêt de travail du ${court(debut)} au ${court(fin)}`,
        texte:
          `${entete(c)}, et certifie que son état de santé nécessite un arrêt de travail ` +
          `${c.prolongation ? "en prolongation " : ""}de ${jours} jour${jours > 1 ? "s" : ""}, ` +
          `du ${dateLongue(debut)} au ${dateLongue(fin)} inclus.` +
          `\n\nSorties ${c.sortiesAutorisees ? "autorisées" : "non autorisées"}.` +
          `\n\n${FORMULE(c)}`,
      };
    }
  }
}
