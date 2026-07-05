import { creerMagasinLocal, useMagasinLocal } from "@/lib/stockage-local";
import { medecinConnecte } from "@/lib/mock-data";

/*
 * Données persistées de l'espace médecin (mocks) : abonnement, permissions
 * de l'assistante, compléments du profil enrichi. Tout vit en localStorage
 * en attendant la base de données.
 */

/* ===== Abonnement (spec C.4.4) ===== */

export interface AbonnementMedecin {
  formule: "standard" | "premium";
  periode: "mensuel" | "annuel";
}

export const ABONNEMENT_DEFAUT: AbonnementMedecin = { formule: "premium", periode: "mensuel" };

const magasinAbonnement = creerMagasinLocal<AbonnementMedecin>(
  "docteur224.abonnement-medecin",
  ABONNEMENT_DEFAUT,
  (json) =>
    json && typeof json === "object"
      ? { ...ABONNEMENT_DEFAUT, ...(json as Partial<AbonnementMedecin>) }
      : ABONNEMENT_DEFAUT
);

export function useAbonnementMedecin(): AbonnementMedecin {
  return useMagasinLocal(magasinAbonnement);
}

export function enregistrerAbonnementMedecin(abonnement: AbonnementMedecin): void {
  magasinAbonnement.ecrire(abonnement);
}

/* ===== Permissions de l'assistante (spec C.4.3) ===== */

export interface PermissionsAssistante {
  voirAgenda: boolean;
  confirmerAnnuler: boolean;
  reprogrammer: boolean;
  creerRdv: boolean;
  messagerie: boolean;
  gererCreneaux: boolean;
}

export const PERMISSIONS_DEFAUT: PermissionsAssistante = {
  voirAgenda: true,
  confirmerAnnuler: true,
  reprogrammer: true,
  creerRdv: true,
  messagerie: true,
  gererCreneaux: true,
};

const magasinPermissions = creerMagasinLocal<PermissionsAssistante>(
  "docteur224.permissions-assistante",
  PERMISSIONS_DEFAUT,
  (json) =>
    json && typeof json === "object"
      ? { ...PERMISSIONS_DEFAUT, ...(json as Partial<PermissionsAssistante>) }
      : PERMISSIONS_DEFAUT
);

/** Permissions de Hawa Diallo, réutilisées par l'espace assistant(e) en Phase 7. */
export function usePermissionsAssistante(): PermissionsAssistante {
  return useMagasinLocal(magasinPermissions);
}

/** Lecture directe (pour les gardes d'actions de lib/actions-assistante.ts). */
export function lirePermissionsAssistante(): PermissionsAssistante {
  return magasinPermissions.lire();
}

export function enregistrerPermissionsAssistante(permissions: PermissionsAssistante): void {
  magasinPermissions.ecrire(permissions);
}

/* ===== Compléments du profil enrichi (spec C.4.5) ===== */

export interface DocumentValidation {
  nom: string;
  statut: "En vérification" | "Validé";
}

export interface ProfilMedecinLocal {
  /** Lien Google Maps collé par le médecin (repli de la géolocalisation) */
  lienMaps: string;
  /** Position enregistrée via la géolocalisation navigateur, ex. « 9.51234, -13.71234 » */
  positionTexte: string;
  documents: DocumentValidation[];
  soins: string[];
  langues: string[];
  /** Assurances actives parmi celles référencées par la plateforme */
  assurances: string[];
}

export const ASSURANCES_REFERENCEES = ["NSIA", "SUNU", "Ascoma", "Saham", "Olea", "MSH"];

export const PROFIL_MEDECIN_DEFAUT: ProfilMedecinLocal = {
  lienMaps: "https://maps.google.com/?q=Clinique+Ambroise+Par%C3%A9",
  positionTexte: "",
  documents: [
    { nom: "Autorisation d'exercice médical.pdf", statut: "En vérification" },
    { nom: "Diplôme d'État.pdf", statut: "Validé" },
  ],
  soins: medecinConnecte.soinsEtActes,
  langues: medecinConnecte.langues,
  assurances: medecinConnecte.assurances,
};

const magasinProfil = creerMagasinLocal<ProfilMedecinLocal>(
  "docteur224.profil-medecin",
  PROFIL_MEDECIN_DEFAUT,
  (json) =>
    json && typeof json === "object"
      ? { ...PROFIL_MEDECIN_DEFAUT, ...(json as Partial<ProfilMedecinLocal>) }
      : PROFIL_MEDECIN_DEFAUT
);

export function useProfilMedecin(): ProfilMedecinLocal {
  return useMagasinLocal(magasinProfil);
}

export function enregistrerProfilMedecin(profil: ProfilMedecinLocal): void {
  magasinProfil.ecrire(profil);
}
