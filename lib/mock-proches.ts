import { creerMagasinLocal, useMagasinLocal } from "@/lib/stockage-local";

/*
 * Stockage local (navigateur) des proches du patient — mock de la future
 * table « proches » (spec C.3 : un proche n'a pas besoin de compte).
 */

export interface ProcheLocal {
  id: string;
  prenom: string;
  nom: string;
  /** Mon fils, Ma fille, Mon conjoint, Ma conjointe, Mon parent, Autre */
  lien: string;
  /** Format AAAA-MM-JJ */
  dateNaissance: string;
  genre: "Femme" | "Homme";
  /** Dégradé CSS de l'avatar */
  gradient: string;
}

export const LIENS_PROCHE = [
  "Mon fils",
  "Ma fille",
  "Mon conjoint",
  "Ma conjointe",
  "Mon parent",
  "Autre",
];

/** Dégradés attribués aux avatars des proches (repris des maquettes). */
const GRADIENTS = [
  "linear-gradient(135deg,#E08E45,#C0392B)",
  "linear-gradient(135deg,#6C5CE7,#341F97)",
  "linear-gradient(135deg,#16A085,#0E6655)",
  "linear-gradient(135deg,#7A5BB5,#15506B)",
  "linear-gradient(135deg,#2E9CCA,#15506B)",
];

/** Proches de démonstration (mêmes personnages fictifs que les maquettes). */
const PROCHES_DEFAUT: ProcheLocal[] = [
  {
    id: "proche-ibrahim",
    prenom: "Ibrahim",
    nom: "Sow",
    lien: "Mon fils",
    dateNaissance: "2024-03-12",
    genre: "Homme",
    gradient: GRADIENTS[0],
  },
  {
    id: "proche-aicha",
    prenom: "Aïcha",
    nom: "Sow",
    lien: "Ma fille",
    dateNaissance: "2021-07-04",
    genre: "Femme",
    gradient: GRADIENTS[1],
  },
  {
    id: "proche-ousmane",
    prenom: "Ousmane",
    nom: "Sow",
    lien: "Mon conjoint",
    dateNaissance: "1992-01-15",
    genre: "Homme",
    gradient: GRADIENTS[2],
  },
];

const magasinProches = creerMagasinLocal<ProcheLocal[]>(
  "docteur224.proches",
  PROCHES_DEFAUT,
  (json) => (Array.isArray(json) ? (json as ProcheLocal[]) : PROCHES_DEFAUT)
);

/** Lecture réactive : les écrans se mettent à jour à chaque ajout/modification. */
export function useProchesLocaux(): ProcheLocal[] {
  return useMagasinLocal(magasinProches);
}

export function lireProchesLocaux(): ProcheLocal[] {
  return magasinProches.lire();
}

export function ajouterProcheLocal(
  proche: Omit<ProcheLocal, "id" | "gradient">
): ProcheLocal {
  const liste = magasinProches.lire();
  const nouveau: ProcheLocal = {
    ...proche,
    id: `proche-${Date.now()}`,
    gradient: GRADIENTS[liste.length % GRADIENTS.length],
  };
  magasinProches.ecrire([...liste, nouveau]);
  return nouveau;
}

export function mettreAJourProcheLocal(proche: ProcheLocal): void {
  magasinProches.ecrire(
    magasinProches.lire().map((p) => (p.id === proche.id ? proche : p))
  );
}

export function initialesProche(proche: Pick<ProcheLocal, "prenom" | "nom">): string {
  return `${proche.prenom.charAt(0)}${proche.nom.charAt(0)}`.toUpperCase();
}
