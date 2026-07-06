import { creerMagasinLocal, useMagasinLocal } from "@/lib/stockage-local";
import { formatDateCourte, versISO } from "@/lib/dates";
import { simulerNotification } from "@/lib/mock-notifications";

/*
 * Données de l'espace établissement (mocks) : médecins rattachés, cycle
 * d'invitation (spec C.6 : envoyée → acceptée / refusée), paramètres.
 * Principe figé : un médecin = un seul établissement.
 * L'établissement fictif « connecté » est la Clinique Ambroise Paré,
 * comme dans les maquettes, en attendant l'authentification.
 */

export const ETABLISSEMENT_CONNECTE = {
  nom: "Clinique Ambroise Paré",
  nomCourt: "Clinique A. Paré",
  type: "Clinique privée",
  description:
    "Établissement pluridisciplinaire au cœur de Kaloum, équipe de spécialistes et plateau technique moderne.",
  adresse: "Almamya, Kaloum, Conakry",
  telephone: "+224 622 11 22 33",
  email: "contact@clinique-ambroisepare.gn",
  siteWeb: "www.clinique-ambroisepare.gn",
  gradient: "linear-gradient(135deg,#16A085,#0E6655)",
  gestionnaire: {
    nom: "Sékou Camara",
    role: "Administrateur de l'établissement",
    email: "s.camara@clinique-ambroisepare.gn",
    telephone: "+224 628 90 12 34",
  },
};

const GRADIENTS = [
  "linear-gradient(135deg,#2E9CCA,#15506B)",
  "linear-gradient(135deg,#6C5CE7,#341F97)",
  "linear-gradient(135deg,#E08E45,#C0392B)",
  "linear-gradient(135deg,#16A085,#0E6655)",
  "linear-gradient(135deg,#C0392B,#7B241C)",
  "linear-gradient(135deg,#7A5BB5,#15506B)",
];

/** Retire la civilité et renvoie les initiales (« Dr Sékou Konaté » → « SK »). */
export function initialesDepuisNom(nom: string): string {
  const mots = nom
    .replace(/^(Dr|Pr)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean);
  return mots
    .slice(0, 2)
    .map((m) => m.charAt(0))
    .join("")
    .toUpperCase();
}

/* ===== Médecins rattachés ===== */

export interface MedecinRattache {
  id: string;
  /** Nom complet avec civilité, ex. « Dr Aïssata Barry » */
  nom: string;
  specialite: string;
  initiales: string;
  gradient: string;
  /** Indicateur de démonstration affiché dans la liste */
  rdvSemaine: number;
}

const RATTACHES_DEFAUT: MedecinRattache[] = [
  {
    id: "rat-barry",
    nom: "Dr Aïssata Barry",
    specialite: "Pédiatrie",
    initiales: "AB",
    gradient: GRADIENTS[0],
    rdvSemaine: 18,
  },
  {
    id: "rat-diallo",
    nom: "Dr Mamadou Diallo",
    specialite: "Médecine générale",
    initiales: "MD",
    gradient: GRADIENTS[1],
    rdvSemaine: 24,
  },
  {
    id: "rat-camara",
    nom: "Dr Ibrahima Camara",
    specialite: "Cardiologie",
    initiales: "IC",
    gradient: GRADIENTS[2],
    rdvSemaine: 15,
  },
  {
    id: "rat-bah",
    nom: "Dr Fatoumata Bah",
    specialite: "Gynécologie",
    initiales: "FB",
    gradient: GRADIENTS[3],
    rdvSemaine: 12,
  },
  {
    id: "rat-toure",
    nom: "Dr Kadiatou Touré",
    specialite: "Dermatologie",
    initiales: "KT",
    gradient: GRADIENTS[4],
    rdvSemaine: 9,
  },
];

const magasinRattaches = creerMagasinLocal<MedecinRattache[]>(
  "docteur224.etab-rattaches",
  RATTACHES_DEFAUT,
  (json) => (Array.isArray(json) ? (json as MedecinRattache[]) : RATTACHES_DEFAUT)
);

export function useMedecinsRattaches(): MedecinRattache[] {
  return useMagasinLocal(magasinRattaches);
}

/* ===== Invitations (cycle : envoyée → acceptée / refusée) ===== */

export type StatutInvitation = "envoyee" | "acceptee" | "refusee";

export interface InvitationMedecin {
  id: string;
  nom: string;
  specialite: string;
  initiales: string;
  gradient: string;
  /** Date d'envoi au format JJ/MM/AAAA */
  envoyeeLe: string;
  statut: StatutInvitation;
}

const INVITATIONS_DEFAUT: InvitationMedecin[] = [
  {
    id: "inv-konate",
    nom: "Dr Sékou Konaté",
    specialite: "Médecine générale",
    initiales: "SK",
    gradient: "linear-gradient(135deg,#9AA8B2,#647A89)",
    envoyeeLe: "09/06/2026",
    statut: "envoyee",
  },
];

const magasinInvitations = creerMagasinLocal<InvitationMedecin[]>(
  "docteur224.etab-invitations",
  INVITATIONS_DEFAUT,
  (json) => (Array.isArray(json) ? (json as InvitationMedecin[]) : INVITATIONS_DEFAUT)
);

export function useInvitations(): InvitationMedecin[] {
  return useMagasinLocal(magasinInvitations);
}

export function inviterMedecin(nom: string, specialite: string): void {
  const liste = magasinInvitations.lire();
  magasinInvitations.ecrire([
    ...liste,
    {
      id: `inv-${Date.now()}`,
      nom,
      specialite,
      initiales: initialesDepuisNom(nom),
      gradient: GRADIENTS[liste.length % GRADIENTS.length],
      envoyeeLe: formatDateCourte(versISO(new Date())),
      statut: "envoyee",
    },
  ]);
  simulerNotification(
    ["E-mail", "In-app"],
    nom,
    `${ETABLISSEMENT_CONNECTE.nom} vous invite à rejoindre son équipe sur Docteur 224.`
  );
}

/** Le médecin accepte le rattachement : il rejoint la liste des rattachés. */
export function accepterInvitation(id: string): void {
  const invitation = magasinInvitations.lire().find((i) => i.id === id);
  if (!invitation || invitation.statut !== "envoyee") return;
  magasinInvitations.ecrire(
    magasinInvitations.lire().map((i) =>
      i.id === id ? { ...i, statut: "acceptee" as const } : i
    )
  );
  magasinRattaches.ecrire([
    ...magasinRattaches.lire(),
    {
      id: `rat-${Date.now()}`,
      nom: invitation.nom,
      specialite: invitation.specialite,
      initiales: invitation.initiales,
      gradient: invitation.gradient,
      rdvSemaine: 0,
    },
  ]);
  simulerNotification(
    ["In-app"],
    ETABLISSEMENT_CONNECTE.nom,
    `${invitation.nom} a accepté votre invitation de rattachement.`
  );
}

export function refuserInvitation(id: string): void {
  const invitation = magasinInvitations.lire().find((i) => i.id === id);
  magasinInvitations.ecrire(
    magasinInvitations.lire().map((i) =>
      i.id === id && i.statut === "envoyee" ? { ...i, statut: "refusee" as const } : i
    )
  );
  if (invitation && invitation.statut === "envoyee") {
    simulerNotification(
      ["In-app"],
      ETABLISSEMENT_CONNECTE.nom,
      `${invitation.nom} a refusé votre invitation de rattachement.`
    );
  }
}

/* ===== Paliers d'abonnement (spec C.6.1 / C.10.2) ===== */

export interface Palier {
  nom: string;
  medecins: string;
  tarif: string;
  min: number;
  max: number;
}

export const PALIERS: Palier[] = [
  { nom: "Cabinet", medecins: "1–3", tarif: "Tarif individuel", min: 1, max: 3 },
  { nom: "Clinique", medecins: "4–15", tarif: "Tarif intermédiaire", min: 4, max: 15 },
  { nom: "Hôpital / Grand centre", medecins: "16+", tarif: "Sur devis", min: 16, max: Infinity },
];

/** Palier applicable selon le nombre de médecins rattachés. */
export function palierPour(nbMedecins: number): Palier {
  return PALIERS.find((p) => nbMedecins >= p.min && nbMedecins <= p.max) ?? PALIERS[0];
}

/* ===== Paramètres de l'établissement ===== */

export interface ParametresEtablissement {
  affichagePublic: boolean;
  notifEmail: boolean;
  rappelsSms: boolean;
  premiumVedette: boolean;
}

export const PARAMETRES_ETAB_DEFAUT: ParametresEtablissement = {
  affichagePublic: true,
  notifEmail: true,
  rappelsSms: true,
  premiumVedette: false,
};

const magasinParametresEtab = creerMagasinLocal<ParametresEtablissement>(
  "docteur224.etab-parametres",
  PARAMETRES_ETAB_DEFAUT,
  (json) =>
    json && typeof json === "object"
      ? { ...PARAMETRES_ETAB_DEFAUT, ...(json as Partial<ParametresEtablissement>) }
      : PARAMETRES_ETAB_DEFAUT
);

export function useParametresEtablissement(): ParametresEtablissement {
  return useMagasinLocal(magasinParametresEtab);
}

export function enregistrerParametresEtablissement(parametres: ParametresEtablissement): void {
  magasinParametresEtab.ecrire(parametres);
}
