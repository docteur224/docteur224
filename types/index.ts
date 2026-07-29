/*
 * Types du noyau MVP — alignés sur le modèle de données de la spécification (section C.11).
 * Pour l'instant, ces types sont alimentés par des données fictives (lib/mock-data.ts).
 * Ils seront branchés sur les tables Supabase dans une phase ultérieure.
 */

export type StatutCreneau = "ouvert" | "ferme" | "reserve";

export type StatutRendezVous = "en_attente" | "confirme" | "annule" | "honore";

export interface Etablissement {
  id: string;
  nom: string;
  /** Clinique privée, Hôpital public, Centre hospitalier, Centre de santé… */
  type: string;
  quartier: string;
  ville: string;
  /** Note moyenne sur 5 */
  note: number;
  nbMedecins: number;
  /** Dégradé CSS de l'avatar, repris des maquettes */
  gradient: string;
}

export interface Medecin {
  id: string;
  civilite: "Dr" | "Pr";
  /** Genre du médecin (filtre « Sexe »). null tant qu'il n'est pas renseigné. */
  genre: "femme" | "homme" | null;
  prenom: string;
  nom: string;
  initiales: string;
  /** Dégradé CSS de l'avatar, repris des maquettes */
  gradient: string;
  specialite: string;
  etablissementId: string;
  ville: string;
  anneesExperience: number;
  /** Tarif de consultation en GNF, payé sur place chez le médecin */
  tarifConsultation: number;
  note: number;
  nbAvis: number;
  /** Prochaine disponibilité affichée sur les cartes (pastille verte ou ambre) */
  disponibilite: { type: "aujourdhui" | "bientot"; label: string };
  telephoneSecretariat: string;
  aPropos: string;
  soinsEtActes: string[];
  diplomes: { titre: string; lieu: string }[];
  parcours: { lieu: string; duree: string }[];
  langues: string[];
  assurances: string[];
  horaires: { jours: string; detail: string };
  /** Jours de fermeture hebdomadaires (0 = dimanche … 6 = samedi) */
  joursFermes: number[];
}

export interface Creneau {
  id: string;
  medecinId: string;
  /** Format AAAA-MM-JJ */
  date: string;
  /** Format HH:MM — créneaux de 30 minutes, de 08:00 à 20:00 */
  heure: string;
  statut: StatutCreneau;
}

export interface Proche {
  id: string;
  patientId: string;
  prenom: string;
  nom: string;
  /** Mon fils, Ma fille, Mon conjoint… */
  lien: string;
  /** Format AAAA-MM-JJ */
  dateNaissance: string;
}

export interface RendezVous {
  id: string;
  medecinId: string;
  patientId: string;
  /** Renseigné si le rendez-vous est pris pour un proche */
  procheId?: string;
  creneauId: string;
  motif: string;
  statut: StatutRendezVous;
  /** Réservation en ligne par le patient, ou réservation déléguée (spec C.2.3) */
  reservePar: "patient" | "medecin" | "assistant" | "admin";
}

export interface Specialite {
  nom: string;
  emoji: string;
}
