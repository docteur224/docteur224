import type { Etablissement, Medecin, Specialite } from "@/types";

/*
 * Données fictives de développement (faux médecins, faux établissements).
 * Elles imitent les données factices visibles dans les maquettes de référence
 * et seront remplacées par de vraies lectures Supabase dans une phase ultérieure.
 * Aucune donnée personnelle ou médicale réelle ne doit figurer ici.
 */

export const etablissements: Etablissement[] = [
  {
    id: "e-ambroise-pare",
    nom: "Clinique Ambroise Paré",
    type: "Clinique privée",
    quartier: "Almamya, Kaloum",
    ville: "Conakry",
    note: 4.8,
    nbMedecins: 5,
    gradient: "linear-gradient(135deg,#16A085,#0E6655)",
  },
  {
    id: "e-donka",
    nom: "Hôpital Donka",
    type: "Hôpital public",
    quartier: "Donka, Dixinn",
    ville: "Conakry",
    note: 4.6,
    nbMedecins: 28,
    gradient: "linear-gradient(135deg,#2E9CCA,#15506B)",
  },
  {
    id: "e-chu",
    nom: "CHU de Conakry",
    type: "Centre hospitalier",
    quartier: "Camayenne, Dixinn",
    ville: "Conakry",
    note: 4.7,
    nbMedecins: 40,
    gradient: "linear-gradient(135deg,#6C5CE7,#341F97)",
  },
  {
    id: "e-ignace-deen",
    nom: "Hôpital Ignace Deen",
    type: "Hôpital public",
    quartier: "Kaloum",
    ville: "Conakry",
    note: 4.5,
    nbMedecins: 18,
    gradient: "linear-gradient(135deg,#2E9CCA,#15506B)",
  },
  {
    id: "e-ratoma",
    nom: "Polyclinique de Ratoma",
    type: "Clinique privée",
    quartier: "Ratoma",
    ville: "Conakry",
    note: 4.5,
    nbMedecins: 8,
    gradient: "linear-gradient(135deg,#1E7B45,#15506B)",
  },
  {
    id: "e-matam",
    nom: "Centre de santé de Matam",
    type: "Centre de santé",
    quartier: "Matam",
    ville: "Conakry",
    note: 4.4,
    nbMedecins: 4,
    gradient: "linear-gradient(135deg,#7A5BB5,#15506B)",
  },
];

export const medecins: Medecin[] = [
  {
    id: "m-barry",
    civilite: "Dr",
    prenom: "Aïssata",
    nom: "Barry",
    initiales: "AB",
    gradient: "linear-gradient(135deg,#E08E45,#C0392B)",
    specialite: "Pédiatrie",
    etablissementId: "e-ambroise-pare",
    ville: "Conakry",
    anneesExperience: 12,
    tarifConsultation: 200000,
    note: 4.9,
    nbAvis: 128,
    disponibilite: { type: "aujourdhui", label: "Dispo aujourd'hui 14:30" },
    telephoneSecretariat: "+224 622 11 22 33",
    joursFermes: [0],
    aPropos:
      "Pédiatre diplômée de l'Université Gamal Abdel Nasser de Conakry, le Dr Barry accompagne les familles depuis plus de 12 ans. Elle est spécialisée dans le suivi du nourrisson, la vaccination et la prise en charge des maladies infantiles courantes.",
    soinsEtActes: [
      "Consultation de suivi",
      "Nouveau-né — Première consultation",
      "Vaccination",
      "Enfant — Consultation diététique",
      "Enfant — Consultation de suivi",
    ],
    diplomes: [
      {
        titre: "Diplôme d'État Spécialisé de docteur en médecine",
        lieu: "Université Gamal Abdel Nasser · Conakry",
      },
    ],
    parcours: [{ lieu: "Clinique Ambroise Paré", duree: "12 ans d'exercice" }],
    langues: ["Français", "Soussou", "Peul"],
    assurances: ["NSIA", "SUNU", "Ascoma"],
    horaires: { jours: "Lundi — Samedi", detail: "08:00 à 17:00 · fermé le dimanche" },
  },
  {
    id: "m-diallo",
    civilite: "Dr",
    prenom: "Mamadou",
    nom: "Diallo",
    initiales: "MD",
    gradient: "linear-gradient(135deg,#2E9CCA,#15506B)",
    specialite: "Médecine générale",
    etablissementId: "e-donka",
    ville: "Conakry",
    anneesExperience: 15,
    tarifConsultation: 150000,
    note: 4.8,
    nbAvis: 102,
    disponibilite: { type: "aujourdhui", label: "Dispo aujourd'hui" },
    telephoneSecretariat: "+224 620 33 44 55",
    joursFermes: [0, 6],
    aPropos:
      "Médecin généraliste exerçant à l'Hôpital Donka, le Dr Diallo assure les consultations de médecine générale, le suivi des maladies chroniques et la médecine préventive.",
    soinsEtActes: ["Consultation générale", "Suivi maladies chroniques", "Certificat médical", "Bilan de santé"],
    diplomes: [
      {
        titre: "Doctorat d'État en médecine",
        lieu: "Université Gamal Abdel Nasser · Conakry",
      },
    ],
    parcours: [{ lieu: "Hôpital Donka", duree: "15 ans d'exercice" }],
    langues: ["Français", "Peul", "Malinké"],
    assurances: ["NSIA", "Ascoma"],
    horaires: { jours: "Lundi — Vendredi", detail: "08:00 à 16:00 · fermé le week-end" },
  },
  {
    id: "m-camara",
    civilite: "Dr",
    prenom: "Ibrahima",
    nom: "Camara",
    initiales: "IC",
    gradient: "linear-gradient(135deg,#2E9CCA,#15506B)",
    specialite: "Pédiatrie",
    etablissementId: "e-ignace-deen",
    ville: "Conakry",
    anneesExperience: 8,
    tarifConsultation: 175000,
    note: 4.7,
    nbAvis: 94,
    disponibilite: { type: "bientot", label: "Demain 08:30" },
    telephoneSecretariat: "+224 621 55 66 77",
    joursFermes: [0],
    aPropos:
      "Pédiatre à l'Hôpital Ignace Deen, le Dr Camara prend en charge les urgences pédiatriques, le suivi de croissance et la vaccination des enfants.",
    soinsEtActes: ["Consultation de suivi", "Vaccination", "Urgences pédiatriques"],
    diplomes: [
      {
        titre: "Diplôme d'État Spécialisé de docteur en médecine",
        lieu: "Université Gamal Abdel Nasser · Conakry",
      },
    ],
    parcours: [{ lieu: "Hôpital Ignace Deen", duree: "8 ans d'exercice" }],
    langues: ["Français", "Soussou"],
    assurances: ["SUNU", "Ascoma"],
    horaires: { jours: "Lundi — Samedi", detail: "08:00 à 17:00 · fermé le dimanche" },
  },
  {
    id: "m-bah",
    civilite: "Dr",
    prenom: "Fatoumata",
    nom: "Bah",
    initiales: "FB",
    gradient: "linear-gradient(135deg,#1E7B45,#15506B)",
    specialite: "Pédiatrie",
    etablissementId: "e-ratoma",
    ville: "Conakry",
    anneesExperience: 10,
    tarifConsultation: 180000,
    note: 4.8,
    nbAvis: 61,
    disponibilite: { type: "aujourdhui", label: "Dispo aujourd'hui 16:00" },
    telephoneSecretariat: "+224 622 77 88 99",
    joursFermes: [0],
    aPropos:
      "Pédiatre à la Polyclinique de Ratoma, le Dr Bah est spécialisée dans le suivi du nouveau-né et l'accompagnement nutritionnel de l'enfant.",
    soinsEtActes: ["Consultation de suivi", "Nouveau-né — Première consultation", "Vaccination"],
    diplomes: [
      {
        titre: "Diplôme d'État Spécialisé de docteur en médecine",
        lieu: "Université Gamal Abdel Nasser · Conakry",
      },
    ],
    parcours: [{ lieu: "Polyclinique de Ratoma", duree: "10 ans d'exercice" }],
    langues: ["Français", "Peul"],
    assurances: ["NSIA", "SUNU"],
    horaires: { jours: "Lundi — Samedi", detail: "08:00 à 17:00 · fermé le dimanche" },
  },
  {
    id: "m-toure",
    civilite: "Dr",
    prenom: "Kadiatou",
    nom: "Touré",
    initiales: "KT",
    gradient: "linear-gradient(135deg,#7A5BB5,#15506B)",
    specialite: "Pédiatrie",
    etablissementId: "e-matam",
    ville: "Conakry",
    anneesExperience: 6,
    tarifConsultation: 150000,
    note: 4.6,
    nbAvis: 47,
    disponibilite: { type: "bientot", label: "Jeudi 10:00" },
    telephoneSecretariat: "+224 623 00 11 22",
    joursFermes: [0, 6],
    aPropos:
      "Pédiatre au Centre de santé de Matam, le Dr Touré assure les consultations pédiatriques de proximité et les campagnes de vaccination.",
    soinsEtActes: ["Consultation de suivi", "Vaccination"],
    diplomes: [
      {
        titre: "Diplôme d'État Spécialisé de docteur en médecine",
        lieu: "Université Gamal Abdel Nasser · Conakry",
      },
    ],
    parcours: [{ lieu: "Centre de santé de Matam", duree: "6 ans d'exercice" }],
    langues: ["Français", "Malinké"],
    assurances: ["Ascoma"],
    horaires: { jours: "Lundi — Vendredi", detail: "08:00 à 15:00 · fermé le week-end" },
  },
];

/** Spécialités mises en avant sur la page d'accueil (libellés des maquettes). */
export const specialites: Specialite[] = [
  { nom: "Généraliste", emoji: "🩺" },
  { nom: "Pédiatrie", emoji: "👶" },
  { nom: "Cardiologie", emoji: "🫀" },
  { nom: "Dentiste", emoji: "🦷" },
  { nom: "Ophtalmo.", emoji: "👁️" },
  { nom: "Neurologie", emoji: "🧠" },
  { nom: "Orthopédie", emoji: "🦴" },
];

export const villes = ["Conakry", "Kankan", "Labé", "Kindia", "N'Zérékoré", "Boké"];

export function getMedecin(id: string): Medecin | undefined {
  return medecins.find((m) => m.id === id);
}

export function getEtablissement(id: string): Etablissement | undefined {
  return etablissements.find((e) => e.id === id);
}

export function nomComplet(medecin: Medecin): string {
  return `${medecin.civilite} ${medecin.prenom} ${medecin.nom}`;
}

/** Cartes « Médecins en vedette » de l'accueil. */
export const medecinsEnVedette: Medecin[] = [
  medecins[0], // Dr Aïssata Barry
  medecins[1], // Dr Mamadou Diallo
  medecins[3], // Dr Fatoumata Bah
];

/** Cartes « Établissements en vedette » de l'accueil. */
export const etablissementsEnVedette: Etablissement[] = [
  etablissements[0], // Clinique Ambroise Paré
  etablissements[1], // Hôpital Donka
  etablissements[2], // CHU de Conakry
];
