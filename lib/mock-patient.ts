import { creerMagasinLocal, useMagasinLocal } from "@/lib/stockage-local";

/*
 * Profil local du patient « connecté » — mock du futur compte utilisateur
 * (l'authentification arrivera en Phase 3 avec la base de données).
 */

export interface PatientLocal {
  prenom: string;
  nom: string;
  telephone: string;
  email: string;
  /** Format AAAA-MM-JJ */
  dateNaissance: string;
  sexe: "Féminin" | "Masculin";
  ville: string;
}

/** Valeurs de démonstration — mêmes données factices que les maquettes. */
export const PATIENT_DEFAUT: PatientLocal = {
  prenom: "Mariama",
  nom: "Sow",
  telephone: "+224 620 45 67 89",
  email: "mariama.sow@email.gn",
  dateNaissance: "1992-03-14",
  sexe: "Féminin",
  ville: "Conakry",
};

const magasinPatient = creerMagasinLocal<PatientLocal>(
  "docteur224.patient",
  PATIENT_DEFAUT,
  (json) =>
    json && typeof json === "object"
      ? { ...PATIENT_DEFAUT, ...(json as Partial<PatientLocal>) }
      : PATIENT_DEFAUT
);

/** Lecture réactive du profil patient. */
export function usePatientLocal(): PatientLocal {
  return useMagasinLocal(magasinPatient);
}

export function lirePatientLocal(): PatientLocal {
  return magasinPatient.lire();
}

export function enregistrerPatientLocal(patient: PatientLocal): void {
  magasinPatient.ecrire(patient);
}

export function initialesPatient(patient: Pick<PatientLocal, "prenom" | "nom">): string {
  return `${patient.prenom.charAt(0)}${patient.nom.charAt(0)}`.toUpperCase();
}
