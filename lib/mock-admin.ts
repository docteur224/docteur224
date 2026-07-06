import {
  horodatage,
  simulerNotification,
  type CanalNotification,
} from "@/lib/mock-notifications";
import { creerMagasinLocal, useMagasinLocal } from "@/lib/stockage-local";

/*
 * Données de l'espace administrateur (mocks) : validations de professionnels,
 * modération, journal d'audit, réglages de la plateforme, annonces,
 * configuration des abonnements. Principe transversal de la maquette :
 * chaque décision sensible (validation, modération, remboursement, réglage)
 * est horodatée et tracée dans le journal d'audit — reproduit ici en direct.
 * Hooks client uniquement : ne jamais importer dans un composant serveur.
 */

/* ===== Journal d'audit (lecture seule, alimenté par les décisions) ===== */

export interface EntreeAudit {
  id: string;
  date: string;
  acteur: string;
  action: string;
  cible: string;
}

const AUDIT_DEFAUT: EntreeAudit[] = [
  { id: "aud-1", date: "12 juin · 14:02", acteur: "Admin · Fatou", action: "A approuvé un médecin", cible: "Dr S. Konaté" },
  { id: "aud-2", date: "12 juin · 11:48", acteur: "Admin · Fatou", action: "A rejeté un établissement", cible: "Centre de santé de Coyah" },
  { id: "aud-3", date: "11 juin · 16:20", acteur: "Admin · Mariam", action: "A masqué un avis", cible: "Avis sur Dr A. Barry" },
  { id: "aud-4", date: "11 juin · 09:05", acteur: "Admin · Sékou", action: "A validé un remboursement", cible: "Mariama Sow · 25 000 GNF" },
  { id: "aud-5", date: "10 juin · 18:33", acteur: "Admin · Fatou", action: "A modifié un réglage", cible: "Mode maintenance · OFF" },
];

const magasinAudit = creerMagasinLocal<EntreeAudit[]>(
  "docteur224.admin-audit",
  AUDIT_DEFAUT,
  (json) => (Array.isArray(json) ? (json as EntreeAudit[]) : AUDIT_DEFAUT)
);

export function useJournalAudit(): EntreeAudit[] {
  return useMagasinLocal(magasinAudit);
}

/** Trace une action sensible ; l'admin connecté de démonstration est Fatou. */
export function tracerAudit(action: string, cible: string): void {
  magasinAudit.ecrire([
    { id: `aud-${Date.now()}`, date: horodatage(), acteur: "Admin · Fatou", action, cible },
    ...magasinAudit.lire(),
  ]);
}

/* ===== Validations (spec : vérifier les pièces avant d'approuver) ===== */

export interface DossierValidation {
  id: string;
  nom: string;
  detail: string;
  initiales: string;
  /** true = établissement (avatar 🏥), false = médecin (initiales) */
  etablissement: boolean;
}

const MEDECINS_ATTENTE_DEFAUT: DossierValidation[] = [
  { id: "val-konate", nom: "Dr Sékou Konaté", detail: "Médecine générale · Conakry", initiales: "SK", etablissement: false },
  { id: "val-conde", nom: "Dr Mariam Condé", detail: "Gynécologie · Kankan", initiales: "MC", etablissement: false },
  { id: "val-diallo", nom: "Dr Alpha Diallo", detail: "Dermatologie · Labé", initiales: "AD", etablissement: false },
];

const ETABS_ATTENTE_DEFAUT: DossierValidation[] = [
  { id: "val-ratoma", nom: "Polyclinique de Ratoma", detail: "Clinique privée · Conakry", initiales: "🏥", etablissement: true },
  { id: "val-coyah", nom: "Centre de santé de Coyah", detail: "Centre de santé · Coyah", initiales: "🏥", etablissement: true },
];

const magasinMedecinsAttente = creerMagasinLocal<DossierValidation[]>(
  "docteur224.admin-val-medecins",
  MEDECINS_ATTENTE_DEFAUT,
  (json) => (Array.isArray(json) ? (json as DossierValidation[]) : MEDECINS_ATTENTE_DEFAUT)
);

const magasinEtabsAttente = creerMagasinLocal<DossierValidation[]>(
  "docteur224.admin-val-etabs",
  ETABS_ATTENTE_DEFAUT,
  (json) => (Array.isArray(json) ? (json as DossierValidation[]) : ETABS_ATTENTE_DEFAUT)
);

export function useMedecinsEnAttente(): DossierValidation[] {
  return useMagasinLocal(magasinMedecinsAttente);
}

export function useEtablissementsEnAttente(): DossierValidation[] {
  return useMagasinLocal(magasinEtabsAttente);
}

function retirerDossier(dossier: DossierValidation): void {
  const magasin = dossier.etablissement ? magasinEtabsAttente : magasinMedecinsAttente;
  magasin.ecrire(magasin.lire().filter((d) => d.id !== dossier.id));
}

export function approuverDossier(dossier: DossierValidation): void {
  retirerDossier(dossier);
  tracerAudit(
    dossier.etablissement ? "A approuvé un établissement" : "A approuvé un médecin",
    dossier.nom
  );
  simulerNotification(
    ["SMS", "E-mail"],
    dossier.nom,
    "Félicitations ! Votre profil Docteur 224 est validé — vous avez le badge Vérifié."
  );
}

export function rejeterDossier(dossier: DossierValidation, motif?: string): void {
  retirerDossier(dossier);
  tracerAudit(
    dossier.etablissement ? "A rejeté un établissement" : "A rejeté un médecin",
    motif ? `${dossier.nom} · ${motif}` : dossier.nom
  );
  simulerNotification(
    ["E-mail"],
    dossier.nom,
    `Votre dossier Docteur 224 a été rejeté${motif ? ` — motif : ${motif}` : ""}.`
  );
}

export function demanderComplement(dossier: DossierValidation): void {
  tracerAudit("A demandé un complément de dossier", dossier.nom);
  simulerNotification(
    ["E-mail"],
    dossier.nom,
    "Votre dossier Docteur 224 est incomplet — merci d'ajouter les pièces demandées."
  );
}

/* ===== Modération : signalements et avis ===== */

export interface Signalement {
  id: string;
  titre: string;
  detail: string;
  /** Libellé du second bouton (« Suspendre » ou « Avertir ») */
  sanction: "Suspendre" | "Avertir";
}

const SIGNALEMENTS_DEFAUT: Signalement[] = [
  { id: "sig-camara", titre: "Dr Ibrahima Camara — absences répétées", detail: "Signalé par 2 patients · 8–10 juin", sanction: "Suspendre" },
  { id: "sig-toure", titre: "Profil aux informations erronées", detail: "Adresse et tarif incohérents · Dr K. Touré", sanction: "Avertir" },
  { id: "sig-noshow", titre: "Patient — no-show répétés", detail: "Signalé par la Clinique Ambroise Paré", sanction: "Avertir" },
];

const magasinSignalements = creerMagasinLocal<Signalement[]>(
  "docteur224.admin-signalements",
  SIGNALEMENTS_DEFAUT,
  (json) => (Array.isArray(json) ? (json as Signalement[]) : SIGNALEMENTS_DEFAUT)
);

export function useSignalements(): Signalement[] {
  return useMagasinLocal(magasinSignalements);
}

export function traiterSignalement(
  signalement: Signalement,
  decision: "examiné" | "suspendu" | "averti"
): void {
  magasinSignalements.ecrire(
    magasinSignalements.lire().filter((s) => s.id !== signalement.id)
  );
  const actions = {
    examiné: "A classé un signalement après examen",
    suspendu: "A suspendu un compte",
    averti: "A averti un utilisateur",
  } as const;
  tracerAudit(actions[decision], signalement.titre);
}

export interface AvisAModerer {
  id: string;
  titre: string;
  etiquette: "Signalé" | "Suspect";
  extrait: string;
}

const AVIS_DEFAUT: AvisAModerer[] = [
  { id: "avis-barry", titre: "★☆☆☆☆ — sur Dr A. Barry", etiquette: "Signalé", extrait: "« Commentaire insultant, hors sujet et sans rapport avec la consultation… »" },
  { id: "avis-diallo", titre: "★☆☆☆☆ — sur Dr M. Diallo", etiquette: "Suspect", extrait: "« Avis possiblement faux (compte créé le jour même)… »" },
];

const magasinAvis = creerMagasinLocal<AvisAModerer[]>(
  "docteur224.admin-avis",
  AVIS_DEFAUT,
  (json) => (Array.isArray(json) ? (json as AvisAModerer[]) : AVIS_DEFAUT)
);

export function useAvisAModerer(): AvisAModerer[] {
  return useMagasinLocal(magasinAvis);
}

export function modererAvis(
  avis: AvisAModerer,
  decision: "conservé" | "masqué" | "supprimé"
): void {
  magasinAvis.ecrire(magasinAvis.lire().filter((a) => a.id !== avis.id));
  const actions = {
    conservé: "A conservé un avis",
    masqué: "A masqué un avis",
    supprimé: "A supprimé un avis",
  } as const;
  tracerAudit(actions[decision], avis.titre);
}

/* ===== Remboursements & litiges (finances) ===== */

export interface Remboursement {
  id: string;
  titre: string;
  detail: string;
  initiales: string;
  gradient: string;
}

const REMBOURSEMENTS_DEFAUT: Remboursement[] = [
  { id: "remb-sow", titre: "Mariama Sow — 25 000 GNF", detail: "RDV annulé par le médecin · payé via Orange Money", initiales: "MS", gradient: "linear-gradient(135deg,#E08E45,#C0392B)" },
  { id: "remb-balde", titre: "Ousmane Baldé — 15 000 GNF", detail: "Litige : consultation non honorée", initiales: "OB", gradient: "linear-gradient(135deg,#6C5CE7,#341F97)" },
];

const magasinRemboursements = creerMagasinLocal<Remboursement[]>(
  "docteur224.admin-remboursements",
  REMBOURSEMENTS_DEFAUT,
  (json) => (Array.isArray(json) ? (json as Remboursement[]) : REMBOURSEMENTS_DEFAUT)
);

export function useRemboursements(): Remboursement[] {
  return useMagasinLocal(magasinRemboursements);
}

export function validerRemboursement(remboursement: Remboursement): void {
  magasinRemboursements.ecrire(
    magasinRemboursements.lire().filter((r) => r.id !== remboursement.id)
  );
  tracerAudit("A validé un remboursement", remboursement.titre);
}

/* ===== Réglages de la plateforme ===== */

export interface ReglagesPlateforme {
  inscriptionsOuvertes: boolean;
  paiementEnLigne: boolean;
  modeMaintenance: boolean;
}

const REGLAGES_DEFAUT: ReglagesPlateforme = {
  inscriptionsOuvertes: true,
  paiementEnLigne: true,
  modeMaintenance: false,
};

const magasinReglages = creerMagasinLocal<ReglagesPlateforme>(
  "docteur224.admin-reglages",
  REGLAGES_DEFAUT,
  (json) =>
    json && typeof json === "object"
      ? { ...REGLAGES_DEFAUT, ...(json as Partial<ReglagesPlateforme>) }
      : REGLAGES_DEFAUT
);

export function useReglagesPlateforme(): ReglagesPlateforme {
  return useMagasinLocal(magasinReglages);
}

const LIBELLES_REGLAGES: Record<keyof ReglagesPlateforme, string> = {
  inscriptionsOuvertes: "Inscriptions médecins ouvertes",
  paiementEnLigne: "Paiement en ligne",
  modeMaintenance: "Mode maintenance",
};

export function basculerReglage(cle: keyof ReglagesPlateforme, valeur: boolean): void {
  magasinReglages.ecrire({ ...magasinReglages.lire(), [cle]: valeur });
  tracerAudit("A modifié un réglage", `${LIBELLES_REGLAGES[cle]} · ${valeur ? "ON" : "OFF"}`);
}

/* ===== Listes de contenu (spécialités, villes, assurances) ===== */

function creerMagasinListe(cle: string, defaut: string[]) {
  return creerMagasinLocal<string[]>(cle, defaut, (json) =>
    Array.isArray(json) ? (json as string[]) : defaut
  );
}

const magasinSpecialites = creerMagasinListe("docteur224.admin-specialites", [
  "Médecine générale",
  "Pédiatrie",
  "Cardiologie",
  "Gynécologie",
  "Dermatologie",
  "Ophtalmologie",
]);

const magasinVilles = creerMagasinListe("docteur224.admin-villes", [
  "Conakry",
  "Kankan",
  "Labé",
  "Kindia",
  "N'Zérékoré",
  "Boké",
]);

const magasinAssurances = creerMagasinListe("docteur224.admin-assurances", [
  "NSIA",
  "SUNU",
  "Ascoma",
  "Saham Assurance",
  "Africaine des Assurances",
  "Olea",
  "MSH",
]);

export const LISTES_CONTENU = {
  specialites: magasinSpecialites,
  villes: magasinVilles,
  assurances: magasinAssurances,
} as const;

export type CleListeContenu = keyof typeof LISTES_CONTENU;

export function useListeContenu(cle: CleListeContenu): string[] {
  return useMagasinLocal(LISTES_CONTENU[cle]);
}

export function ajouterAListeContenu(cle: CleListeContenu, valeur: string): void {
  const magasin = LISTES_CONTENU[cle];
  const liste = magasin.lire();
  if (liste.includes(valeur)) return;
  magasin.ecrire([...liste, valeur]);
}

/* ===== Mises en avant (pilotage & croissance) ===== */

export interface Vedette {
  id: string;
  nom: string;
  detail: string;
  actif: boolean;
}

const VEDETTES_DEFAUT: Vedette[] = [
  { id: "ved-barry", nom: "Dr Aïssata Barry", detail: "Pédiatrie · Conakry", actif: true },
  { id: "ved-clinique", nom: "Clinique Ambroise Paré", detail: "Conakry", actif: true },
  { id: "ved-diallo", nom: "Dr Mamadou Diallo", detail: "Médecine générale · Conakry", actif: false },
];

const magasinVedettes = creerMagasinLocal<Vedette[]>(
  "docteur224.admin-vedettes",
  VEDETTES_DEFAUT,
  (json) => (Array.isArray(json) ? (json as Vedette[]) : VEDETTES_DEFAUT)
);

export function useVedettes(): Vedette[] {
  return useMagasinLocal(magasinVedettes);
}

export function basculerVedette(id: string, actif: boolean): void {
  magasinVedettes.ecrire(
    magasinVedettes.lire().map((v) => (v.id === id ? { ...v, actif } : v))
  );
}

/* ===== Annonces ===== */

export interface Annonce {
  id: string;
  message: string;
  detail: string;
}

const ANNONCES_DEFAUT: Annonce[] = [
  { id: "ann-momo", message: "Nouvelle fonctionnalité : paiement MTN MoMo", detail: "Tous les patients · 2 juin · SMS + e-mail" },
  { id: "ann-profil", message: "Rappel : compléter votre profil", detail: "Médecins non vérifiés · 28 mai · SMS" },
];

const magasinAnnonces = creerMagasinLocal<Annonce[]>(
  "docteur224.admin-annonces",
  ANNONCES_DEFAUT,
  (json) => (Array.isArray(json) ? (json as Annonce[]) : ANNONCES_DEFAUT)
);

export function useAnnonces(): Annonce[] {
  return useMagasinLocal(magasinAnnonces);
}

export function envoyerAnnonce(message: string, segment: string, canaux: string[]): void {
  magasinAnnonces.ecrire([
    {
      id: `ann-${Date.now()}`,
      message,
      detail: `${segment} · ${horodatage()} · ${canaux.join(" + ")}`,
    },
    ...magasinAnnonces.lire(),
  ]);
  tracerAudit("A envoyé une annonce", `${segment} · ${canaux.join(" + ")}`);
  const canauxNotification = canaux.map<CanalNotification>((canal) =>
    canal === "Notification in-app" ? "In-app" : (canal as CanalNotification)
  );
  simulerNotification(canauxNotification, segment, message);
}

/* ===== Permissions de l'équipe admin (démonstration : Mariam) ===== */

export interface PermissionsAdmin {
  validations: boolean;
  moderation: boolean;
  pilotageAnnonces: boolean;
  finances: boolean;
  parametres: boolean;
}

const PERMISSIONS_ADMIN_DEFAUT: PermissionsAdmin = {
  validations: false,
  moderation: true,
  pilotageAnnonces: true,
  finances: false,
  parametres: false,
};

const magasinPermissionsAdmin = creerMagasinLocal<PermissionsAdmin>(
  "docteur224.admin-permissions-mariam",
  PERMISSIONS_ADMIN_DEFAUT,
  (json) =>
    json && typeof json === "object"
      ? { ...PERMISSIONS_ADMIN_DEFAUT, ...(json as Partial<PermissionsAdmin>) }
      : PERMISSIONS_ADMIN_DEFAUT
);

export function usePermissionsAdmin(): PermissionsAdmin {
  return useMagasinLocal(magasinPermissionsAdmin);
}

export function enregistrerPermissionsAdmin(permissions: PermissionsAdmin): void {
  magasinPermissionsAdmin.ecrire(permissions);
}

/* ===== Configuration des abonnements (spec C.10.2) ===== */

export interface ConfigAbonnements {
  standardMensuel: string;
  standardAnnuel: string;
  premiumMensuel: string;
  premiumAnnuel: string;
  palierCabinet: string;
  palierClinique: string;
  periodeGratuite: boolean;
  essaiGratuit: boolean;
  orangeMoney: boolean;
  mtnMomo: boolean;
}

export const CONFIG_ABONNEMENTS_DEFAUT: ConfigAbonnements = {
  standardMensuel: "100 000",
  standardAnnuel: "1 000 000",
  premiumMensuel: "150 000",
  premiumAnnuel: "1 500 000",
  palierCabinet: "100 000 / mois",
  palierClinique: "250 000 / mois",
  periodeGratuite: true,
  essaiGratuit: true,
  orangeMoney: true,
  mtnMomo: true,
};

const magasinConfigAbonnements = creerMagasinLocal<ConfigAbonnements>(
  "docteur224.admin-abonnements",
  CONFIG_ABONNEMENTS_DEFAUT,
  (json) =>
    json && typeof json === "object"
      ? { ...CONFIG_ABONNEMENTS_DEFAUT, ...(json as Partial<ConfigAbonnements>) }
      : CONFIG_ABONNEMENTS_DEFAUT
);

export function useConfigAbonnements(): ConfigAbonnements {
  return useMagasinLocal(magasinConfigAbonnements);
}

export function enregistrerConfigAbonnements(config: ConfigAbonnements): void {
  magasinConfigAbonnements.ecrire(config);
  tracerAudit("A modifié la configuration des abonnements", "Formules médecin · paliers");
}
