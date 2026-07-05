import { creerMagasinLocal, useMagasinLocal } from "@/lib/stockage-local";

/*
 * Stockage local (navigateur) des rendez-vous réservés pendant la phase mocks.
 * Joue le rôle de la future table « rendez_vous » : quand la base de données
 * sera branchée, seules ces fonctions changeront, pas les écrans.
 */

export interface RendezVousLocal {
  id: string;
  medecinId: string;
  medecinNom: string;
  specialite: string;
  etablissementNom: string;
  ville: string;
  /** Format AAAA-MM-JJ */
  date: string;
  /** Format HH:MM */
  heure: string;
  tarif: number;
  motif: string;
  pourQui: string;
  /** « moi » pour le titulaire du compte, sinon l'id du proche */
  pourQuiId?: string;
  statut: "confirme" | "annule";
  /** Réservation en ligne par le patient, ou déléguée par le cabinet (spec C.2.3) */
  reservePar: "patient" | "medecin";
  creeLe: string;
}

const AUCUN_RDV: RendezVousLocal[] = [];

const magasinRdv = creerMagasinLocal<RendezVousLocal[]>(
  "docteur224.rendezvous",
  AUCUN_RDV,
  (json) => (Array.isArray(json) ? (json as RendezVousLocal[]) : AUCUN_RDV)
);

/** Lecture réactive : l'écran se met à jour à chaque réservation/annulation. */
export function useRendezVousLocaux(): RendezVousLocal[] {
  return useMagasinLocal(magasinRdv);
}

export function lireRendezVousLocaux(): RendezVousLocal[] {
  return magasinRdv.lire();
}

export function ajouterRendezVousLocal(rdv: RendezVousLocal): void {
  magasinRdv.ecrire([...magasinRdv.lire(), rdv]);
}

/** Annulation par le patient : le rendez-vous est conservé avec le statut « annulé ». */
export function annulerRendezVousLocal(id: string): void {
  magasinRdv.ecrire(
    magasinRdv.lire().map((rdv) => (rdv.id === id ? { ...rdv, statut: "annule" as const } : rdv))
  );
}
