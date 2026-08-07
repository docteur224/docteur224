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

/** Où se déroule la consultation (migration 0024). */
export type LieuConsultation = "cabinet" | "domicile";

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
  /** Photo de profil (Cloudinary). null → avatar à initiales sur le dégradé. */
  photoUrl: string | null;
  specialite: string;
  etablissementId: string;
  ville: string;
  /** Commune du lieu d'exercice (échelon donné avant la ville en Guinée). */
  commune: string;
  quartier: string;
  /** Numéro d'inscription à l'Ordre national des médecins. */
  numeroOrdre: string;
  /** Registre du Commerce et du Crédit Mobilier. */
  rccm: string;
  /** Le praticien se déplace-t-il au domicile du patient ? */
  visiteDomicile: boolean;
  /** Communes ou quartiers desservis pour les visites à domicile. */
  zoneDomicile: string;
  anneesExperience: number;
  /**
   * Tarif de référence en GNF, payé sur place. Recopié depuis la première
   * ligne TARIFÉE de `tarifs` par un trigger — voir migrations 0023 et 0027.
   */
  tarifConsultation: number;
  /**
   * Soins et actes proposés, dans l'ordre choisi par le médecin : depuis la
   * 0027, cette grille est la liste unique des actes, et c'est en elle que
   * le patient choisit son motif en réservant. `lieu` dit où la ligne
   * s'applique (cabinet, domicile ou les deux) et `montant` vaut `null`
   * quand le prix n'est pas ferme (« sur demande »).
   */
  tarifs: { libelle: string; montant: number | null; lieu: LieuConsultation | "tous" }[];
  note: number;
  nbAvis: number;
  /** Prochaine disponibilité affichée sur les cartes (pastille verte ou ambre) */
  disponibilite: { type: "aujourdhui" | "bientot"; label: string };
  telephoneSecretariat: string;
  /** « lat, lon » relevé au GPS, ou lien Google Maps collé. "" si non renseigné. */
  localisation: string;
  aPropos: string;
  /**
   * Libellés de `tarifs`, dédoublonnés — valeur dérivée en base depuis la
   * 0027. Conservée pour les écrans qui n'ont besoin que des intitulés
   * (dossier admin) ; la fiche publique affiche la grille elle-même.
   */
  soinsEtActes: string[];
  diplomes: { titre: string; lieu: string }[];
  parcours: { lieu: string; duree: string }[];
  langues: string[];
  assurances: string[];
  horaires: { jours: string; detail: string };
  /** Horaires jour par jour (lundi → dimanche), pour la fiche détaillée. */
  horairesSemaine: { jour: number; nom: string; plages: { debut: string; fin: string }[] }[];
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
