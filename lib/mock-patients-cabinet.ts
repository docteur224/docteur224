import { creerMagasinLocal, useMagasinLocal } from "@/lib/stockage-local";

/*
 * Patients suivis par le cabinet du médecin connecté — mock de la future
 * liste de patients. Alimente l'écran « Mes patients » et la recherche de
 * l'écran « + Nouveau rendez-vous » (réservation déléguée, spec C.2.3 :
 * un patient peut être créé sans compte, avec une fiche minimale).
 */

export interface PatientCabinet {
  id: string;
  prenom: string;
  nom: string;
  telephone: string;
  /** Ex. « 34 ans » — vide pour une fiche minimale créée au téléphone */
  age: string;
  /** Ex. « 02 juin 2026 » — « Nouveau patient » pour une fiche créée au cabinet */
  derniereVisite: string;
  /** Dégradé CSS de l'avatar */
  gradient: string;
}

const GRADIENTS = [
  "linear-gradient(135deg,#2E9CCA,#15506B)",
  "linear-gradient(135deg,#E08E45,#C0392B)",
  "linear-gradient(135deg,#1E7B45,#15506B)",
  "linear-gradient(135deg,#7A5BB5,#15506B)",
  "linear-gradient(135deg,#16A085,#0E6655)",
];

/** Patients de démonstration (mêmes personnages fictifs que les maquettes). */
const PATIENTS_DEFAUT: PatientCabinet[] = [
  {
    id: "pc-sylla",
    prenom: "Aboubacar",
    nom: "Sylla",
    telephone: "+224 620 11 22 33",
    age: "34 ans",
    derniereVisite: "02 juin 2026",
    gradient: GRADIENTS[0],
  },
  {
    id: "pc-sow",
    prenom: "Mariama",
    nom: "Sow",
    telephone: "+224 621 00 11 22",
    age: "32 ans",
    derniereVisite: "10 mai 2026",
    gradient: GRADIENTS[1],
  },
  {
    id: "pc-konate",
    prenom: "Sékou",
    nom: "Konaté",
    telephone: "+224 622 44 55 66",
    age: "5 ans",
    derniereVisite: "28 avr. 2026",
    gradient: GRADIENTS[2],
  },
  {
    id: "pc-camara",
    prenom: "Hadja",
    nom: "Camara",
    telephone: "+224 623 77 88 99",
    age: "41 ans",
    derniereVisite: "15 avr. 2026",
    gradient: GRADIENTS[3],
  },
  {
    id: "pc-balde",
    prenom: "Ousmane",
    nom: "Baldé",
    telephone: "+224 628 77 88 99",
    age: "60 ans",
    derniereVisite: "02 avr. 2026",
    gradient: GRADIENTS[4],
  },
];

const magasinPatients = creerMagasinLocal<PatientCabinet[]>(
  "docteur224.patients-cabinet",
  PATIENTS_DEFAUT,
  (json) => (Array.isArray(json) ? (json as PatientCabinet[]) : PATIENTS_DEFAUT)
);

/** Lecture réactive de la liste des patients du cabinet. */
export function usePatientsCabinet(): PatientCabinet[] {
  return useMagasinLocal(magasinPatients);
}

/** Fiche minimale créée au cabinet (nom, prénom, téléphone). */
export function ajouterPatientCabinet(
  fiche: Pick<PatientCabinet, "prenom" | "nom" | "telephone">
): PatientCabinet {
  const liste = magasinPatients.lire();
  const nouveau: PatientCabinet = {
    ...fiche,
    id: `pc-${Date.now()}`,
    age: "—",
    derniereVisite: "Nouveau patient",
    gradient: GRADIENTS[liste.length % GRADIENTS.length],
  };
  magasinPatients.ecrire([...liste, nouveau]);
  return nouveau;
}

export function initialesPatientCabinet(p: Pick<PatientCabinet, "prenom" | "nom">): string {
  return `${p.prenom.charAt(0)}${p.nom.charAt(0)}`.toUpperCase();
}
