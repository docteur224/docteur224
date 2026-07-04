/*
 * Stockage local (navigateur) des rendez-vous réservés pendant la phase mocks.
 * Joue le rôle de la future table « rendez_vous » : quand la base de données
 * sera branchée, seules ces fonctions changeront, pas les écrans.
 * À n'appeler que côté client.
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
  statut: "confirme" | "annule";
  reservePar: "patient";
  creeLe: string;
}

const CLE_STOCKAGE = "docteur224.rendezvous";

export function lireRendezVousLocaux(): RendezVousLocal[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(CLE_STOCKAGE) ?? "[]") as RendezVousLocal[];
  } catch {
    return [];
  }
}

export function ajouterRendezVousLocal(rdv: RendezVousLocal): void {
  const liste = lireRendezVousLocaux();
  liste.push(rdv);
  window.localStorage.setItem(CLE_STOCKAGE, JSON.stringify(liste));
}
