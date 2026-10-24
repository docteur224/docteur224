"use client";

import { useEffect, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";
import { resumePrescription, type LignePrescription } from "@/lib/prescription";

/*
 * Documents remis au patient : ordonnances, comptes rendus, résultats
 * (migration 0014). Le médecin dépose, le patient lit — la RLS s'en charge,
 * il n'y a pas de branche « selon le rôle » dans ce fichier.
 *
 * Les fichiers vivent dans le bucket privé `documents` : jamais d'URL
 * publique, on demande une URL signée à la volée au moment du clic.
 */

export const BUCKET = "documents";

export const TYPES_DOCUMENT = [
  { valeur: "ordonnance", libelle: "Ordonnance", icone: "💊" },
  { valeur: "compte_rendu", libelle: "Compte rendu", icone: "📋" },
  { valeur: "resultat", libelle: "Résultat d’examen", icone: "🧪" },
  { valeur: "certificat", libelle: "Certificat", icone: "📄" },
  { valeur: "arret_travail", libelle: "Arrêt de travail", icone: "🗓️" },
  { valeur: "autre", libelle: "Autre", icone: "📎" },
] as const;

export type TypeDocument = (typeof TYPES_DOCUMENT)[number]["valeur"];

export const libelleType = (t: string) =>
  TYPES_DOCUMENT.find((x) => x.valeur === t)?.libelle ?? "Document";
export const iconeType = (t: string) =>
  TYPES_DOCUMENT.find((x) => x.valeur === t)?.icone ?? "📎";

/* ===== Titre et résumé affichés ===== */

/** « JJ/MM/AAAA » d'un horodatage, à l'heure de Conakry (UTC+0 toute l'année). */
export function jourDe(horodatage: string): string {
  const d = new Date(horodatage);
  if (Number.isNaN(d.getTime())) return horodatage.slice(0, 10).split("-").reverse().join("/");
  return d.toLocaleDateString("fr-FR", { timeZone: "Africa/Conakry" });
}

/** « HH:MM » d'un horodatage, à l'heure de Conakry. */
export function heureDe(horodatage: string): string {
  const d = new Date(horodatage);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("fr-FR", {
    timeZone: "Africa/Conakry",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Titre d'une pièce tel qu'il s'affiche partout.
 *
 * Une ordonnance s'intitule TOUJOURS « Ordonnance du JJ/MM/AAAA », date
 * d'émission de la version. Le titre se tapait à la main, et le dossier
 * finissait par aligner « Ordo », « Ordo du 01/08 », « Ordonnance du 27/07
 * 21:16 » — trois manières de dire la même chose, dont une datée d'un autre
 * jour que l'émission.
 *
 * Le titre est RECALCULÉ ici plutôt que réécrit en base : une pièce remise
 * est immuable (migration 0063), y compris son libellé. Les autres types
 * gardent le titre choisi par le médecin — « Bilan lipidique », « Compte
 * rendu d'échographie » disent quelque chose qu'une date ne dit pas.
 */
export function titreDocument(d: { type: string; titre: string; creeLe: string }): string {
  if (d.type === "ordonnance") return `Ordonnance du ${jourDe(d.creeLe)}`;
  return d.titre?.trim() || libelleType(d.type);
}

/** Titre d'une NOUVELLE ordonnance, émise maintenant. */
export const titreOrdonnanceDuJour = () => `Ordonnance du ${jourDe(new Date().toISOString())}`;

/**
 * Premières lignes utiles d'un contenu, sur une ligne : de quoi distinguer
 * deux ordonnances émises le même jour sans les ouvrir.
 */
export function resumeDocument(d: { contenu: string | null; prescription?: LignePrescription[] | null }): string {
  return d.prescription?.length ? resumePrescription(d.prescription) : resumeContenu(d.contenu);
}

export function resumeContenu(contenu: string | null, max = 70): string {
  if (!contenu) return "";
  const lignes = contenu
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    // Une posologie (« 1 cp matin et soir ») suit son médicament : seules
    // les lignes qui commencent par une lettre portent un nom de produit.
    .filter((l) => /^\p{L}/u.test(l))
    // Le produit seul : « Amlodipine 5 mg — 1 comprimé le matin » donne
    // « Amlodipine 5 mg ». La posologie se lit en ouvrant la pièce.
    .map((l) => l.split(/\s[—–-]\s|\s?:\s|\s\(/)[0].trim());
  const texte = lignes.slice(0, 3).join(", ");
  return texte.length > max ? `${texte.slice(0, max - 1).trimEnd()}…` : texte;
}

export interface PartageDocument {
  medecinId: string;
  medecinNom: string;
  creeLe: string;
}

export interface DocumentPatient {
  id: string;
  type: string;
  titre: string;
  contenu: string | null;
  fichierPath: string | null;
  fichierNom: string | null;
  creeLe: string;
  /** 'medecin' = remis par un praticien ; 'patient' = envoyé par le patient. */
  origine: "medecin" | "patient";
  /** Qui a déposé : seul lui peut modifier ou retirer le document. */
  deposePar: string;
  medecinId: string | null;
  medecinNom: string;
  /** « Moi-même » ou le nom du proche concerné. */
  pourQui: string;
  procheId: string | null;
  patientId: string | null;
  partages: PartageDocument[];
  /* ---- Versions et annulation (migration 0063) ---- */
  /** 1 pour la pièce d’origine, 2, 3… pour chaque correction. */
  version: number;
  /** Racine de la chaîne de corrections ; null quand c’est la v1 elle-même. */
  documentParentId: string | null;
  /** Version suivante. Null = version en cours, la seule que listent les écrans. */
  remplaceParId: string | null;
  /** Annulée : la pièce reste lisible, barrée, et ne vaut plus rien. */
  annuleLe: string | null;
  motifAnnulation: string | null;
  /* ---- Ordonnance structurée et vérification (migration 0065) ---- */
  /** Lignes de prescription ; null pour une pièce saisie en texte libre. */
  prescription: LignePrescription[] | null;
  /** « D224-XXXX-XXXX-XXXX » : présent sur les documents générés depuis 0065. */
  codeVerification: string | null;
}

interface LigneDocument {
  id: string;
  type: string;
  titre: string;
  contenu: string | null;
  fichier_path: string | null;
  fichier_nom: string | null;
  cree_le: string;
  origine: "medecin" | "patient";
  depose_par: string;
  medecin_id: string | null;
  patient_id: string | null;
  proche_id: string | null;
  version: number | null;
  document_parent_id: string | null;
  remplace_par_id: string | null;
  annule_le: string | null;
  motif_annulation: string | null;
  prescription: LignePrescription[] | null;
  code_verification: string | null;
  medecins: {
    civilite: string | null;
    utilisateurs: { nom: string | null; prenom: string | null } | null;
  } | null;
  proches: { nom: string; prenom: string } | null;
  partages_document: {
    medecin_id: string;
    cree_le: string;
    medecins: {
      civilite: string | null;
      utilisateurs: { nom: string | null; prenom: string | null } | null;
    } | null;
  }[];
}

const NOM_MEDECIN = `civilite, utilisateurs ( nom, prenom )`;

/*
 * `medecins!documents_patient_medecin_id_fkey` et non `medecins` : depuis
 * l'ajout de `partages_document`, PostgREST voit DEUX chemins entre
 * `documents_patient` et `medecins` (la clé étrangère directe et la relation
 * plusieurs-à-plusieurs via les partages) et refuse la requête avec
 * PGRST201 — le tableau revient vide sans erreur visible à l'écran.
 */
const SELECTION = `
  id, type, titre, contenu, fichier_path, fichier_nom, cree_le, origine, depose_par,
  medecin_id, patient_id, proche_id,
  version, document_parent_id, remplace_par_id, annule_le, motif_annulation,
  prescription, code_verification,
  medecins!documents_patient_medecin_id_fkey ( ${NOM_MEDECIN} ),
  proches ( nom, prenom ),
  partages_document ( medecin_id, cree_le, medecins ( ${NOM_MEDECIN} ) )
`;

const nomDe = (m: { civilite: string | null; utilisateurs: { nom: string | null; prenom: string | null } | null } | null) =>
  m
    ? `${m.civilite === "Pr" ? "Pr" : "Dr"} ${m.utilisateurs?.prenom ?? ""} ${m.utilisateurs?.nom ?? ""}`.trim()
    : "";

const versDocument = (l: LigneDocument): DocumentPatient => ({
  id: l.id,
  type: l.type,
  titre: l.titre,
  contenu: l.contenu,
  fichierPath: l.fichier_path,
  fichierNom: l.fichier_nom,
  creeLe: l.cree_le,
  origine: l.origine,
  deposePar: l.depose_par,
  medecinId: l.medecin_id,
  medecinNom: nomDe(l.medecins) || "Médecin",
  pourQui: l.proches ? `${l.proches.prenom} ${l.proches.nom}` : "Moi-même",
  procheId: l.proche_id,
  patientId: l.patient_id,
  partages: (l.partages_document ?? []).map((p) => ({
    medecinId: p.medecin_id,
    medecinNom: nomDe(p.medecins) || "Médecin",
    creeLe: p.cree_le,
  })),
  version: l.version ?? 1,
  documentParentId: l.document_parent_id,
  remplaceParId: l.remplace_par_id,
  annuleLe: l.annule_le,
  motifAnnulation: l.motif_annulation,
  prescription: l.prescription,
  codeVerification: l.code_verification,
});

/**
 * Documents visibles par l'utilisateur connecté (la RLS filtre le reste).
 * `pour` restreint au dossier d'un patient précis, pour l'espace médecin.
 *
 * Par défaut, seules les versions EN COURS remontent. C'est le défaut sûr :
 * depuis la migration 0063 une correction laisse la version précédente en
 * base, et un écran qui oublierait de l'écarter montrerait deux ordonnances
 * là où il n'y en a qu'une — la périmée au-dessus, puisqu'elle est plus
 * ancienne. Seul l'aperçu de la fiche médecin demande la chaîne entière,
 * pour laisser relire ce que le patient a emporté.
 */
export function useMesDocuments(
  pour?: {
    patientId?: string;
    procheId?: string;
  },
  options?: { toutesVersions?: boolean }
): {
  documents: DocumentPatient[];
  chargement: boolean;
  recharger: () => void;
} {
  const [documents, setDocuments] = useState<DocumentPatient[]>([]);
  const [chargement, setChargement] = useState(true);
  const [version, setVersion] = useState(0);
  const filtre = `${pour?.patientId ?? ""}|${pour?.procheId ?? ""}`;
  const toutesVersions = !!options?.toutesVersions;

  useEffect(() => {
    let actif = true;
    let requete = creerClientNavigateur()
      .from("documents_patient")
      .select(SELECTION)
      .order("cree_le", { ascending: false });
    const [patientId, procheId] = filtre.split("|");
    if (patientId) requete = requete.eq("patient_id", patientId);
    if (procheId) requete = requete.eq("proche_id", procheId);
    if (!toutesVersions) requete = requete.is("remplace_par_id", null);

    requete.then(({ data }) => {
      if (!actif) return;
      setDocuments(((data ?? []) as unknown as LigneDocument[]).map(versDocument));
      setChargement(false);
    });
    return () => {
      actif = false;
    };
  }, [version, filtre, toutesVersions]);

  return { documents, chargement, recharger: () => setVersion((v) => v + 1) };
}

/*
 * Une même pastille s'affiche à plusieurs endroits (barre d'onglets, puces
 * mobiles, copie de mesure de la barre) : sans mise en commun, chacun
 * lancerait sa requête. Les demandes identiques en cours partagent la même
 * promesse, oubliée dès qu'elle a répondu — la suivante relira la base.
 */
const comptagesEnCours = new Map<string, Promise<number>>();

function compterDocuments(cle: string): Promise<number> {
  const enCours = comptagesEnCours.get(cle);
  if (enCours) return enCours;
  const [patientId, procheId] = cle.split("|");
  let requete = creerClientNavigateur()
    .from("documents_patient")
    .select("id", { count: "exact", head: true })
    .is("remplace_par_id", null);
  if (patientId) requete = requete.eq("patient_id", patientId);
  if (procheId) requete = requete.eq("proche_id", procheId);
  const promesse = Promise.resolve(requete)
    .then(({ count }) => count ?? 0)
    .finally(() => comptagesEnCours.delete(cle));
  comptagesEnCours.set(cle, promesse);
  return promesse;
}

/**
 * Nombre de pièces en cours au dossier d'un patient, sans les charger : le
 * compteur de l'onglet « Ordonnances et documents » s'affiche avant que
 * l'onglet soit ouvert. Même filtre que la liste (versions en cours, RLS),
 * donc le chiffre et la liste ne peuvent pas se contredire.
 *
 * `revision` : changé par l'onglet après un dépôt ou une annulation, pour
 * que le compteur suive sans recharger la page.
 */
export function useNombreDocuments(
  pour: { patientId?: string; procheId?: string } | undefined,
  revision = 0
): number | null {
  const cle = pour ? `${pour.patientId ?? ""}|${pour.procheId ?? ""}|${revision}` : "";
  const [resultat, setResultat] = useState<{ cle: string; n: number } | null>(null);

  useEffect(() => {
    if (!cle) return;
    let actif = true;
    compterDocuments(cle).then((n) => {
      if (actif) setResultat({ cle, n });
    });
    return () => {
      actif = false;
    };
  }, [cle]);

  // Tant que la réponse de la requête courante n'est pas là, pas de chiffre :
  // annoncer l'ancien puis se corriger se lirait comme une erreur.
  return resultat?.cle === cle ? resultat.n : null;
}

/** Médecins déjà consultés, pour le sélecteur d'envoi et de partage. */
export function useMesMedecins(): { medecins: { id: string; nom: string; specialite: string }[] } {
  const [medecins, setMedecins] = useState<{ id: string; nom: string; specialite: string }[]>([]);
  useEffect(() => {
    let actif = true;
    creerClientNavigateur()
      .rpc("medecins_du_patient")
      .then(({ data }) => {
        if (actif) {
          setMedecins(
            ((data ?? []) as { id: string; nom: string; specialite: string }[]).map((m) => ({
              id: m.id,
              nom: m.nom,
              specialite: m.specialite,
            }))
          );
        }
      });
    return () => {
      actif = false;
    };
  }, []);
  return { medecins };
}

/**
 * URL temporaire d'un fichier du bucket privé. Volontairement demandée au
 * clic et non au chargement de la liste : signer dix URL dont aucune ne sera
 * ouverte serait autant d'accès accordés pour rien.
 */
export async function urlSignee(path: string): Promise<{ url?: string; erreur?: string }> {
  const { data, error } = await creerClientNavigateur()
    .storage.from(BUCKET)
    .createSignedUrl(path, 300); // 5 minutes
  if (error) return { erreur: error.message };
  return { url: data.signedUrl };
}

/* ===== Côté médecin : dépôt ===== */

export interface NouveauDocument {
  /** Patient concerné : l'un des deux seulement, comme pour un rendez-vous. */
  patientId?: string;
  procheId?: string;
  /** Médecin destinataire — obligatoire quand c'est le patient qui envoie. */
  medecinId?: string;
  type: TypeDocument;
  titre: string;
  contenu: string;
  fichier?: File | null;
  rendezVousId?: string;
  prescription?: LignePrescription[] | null;
  /** Code tiré par le serveur à la génération du PDF définitif. */
  codeVerification?: string | null;
}

/**
 * Demande au serveur le PDF composé à partir du type et du texte saisis.
 *
 * La mise en page n'est pas faite ici : l'en-tête engage l'identité du
 * praticien, elle doit être relue en base à partir de la session et non
 * fournie par le navigateur (voir app/api/document-pdf/route.ts).
 */
export async function genererPdf(
  d: {
    patientId?: string;
    procheId?: string;
    type: TypeDocument;
    titre: string;
    contenu: string;
  },
  /** « final » : le serveur attribue un code de vérification et l'imprime en QR. */
  mode: "apercu" | "final" = "apercu"
): Promise<{ fichier?: File; code?: string; erreur?: string }> {
  const reponse = await fetch("/api/document-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...d, mode }),
  });
  if (!reponse.ok) {
    const { erreur } = await reponse
      .json()
      .catch(() => ({ erreur: "La génération du document a échoué." }));
    return { erreur };
  }
  const octets = await reponse.blob();
  const nom = `${d.titre.replace(/[^\w\s.\-]+/g, "").trim() || d.type}.pdf`.replace(/\s+/g, "-");
  return {
    fichier: new File([octets], nom, { type: "application/pdf" }),
    code: reponse.headers.get("X-Code-Verification") ?? undefined,
  };
}

const TAILLE_MAX = 8 * 1024 * 1024; // 8 Mo
const EXTENSIONS = /\.(pdf|jpe?g|png|webp)$/i;

/** Traduit les refus de la base en phrases utilisables à l'écran. */
function messageErreur(message: string): string {
  if (message.includes("doc_non_vide")) {
    return "Un document doit contenir du texte ou un fichier.";
  }
  if (message.includes("ins_docs_medecin") || message.includes("row-level security")) {
    return "Dépôt refusé : vérifiez que ce patient et vous avez bien un rendez-vous en commun.";
  }
  return message;
}

/** Téléverse le fichier dans le bucket privé et rend son chemin. */
async function televerser(
  fichier: File,
  uid: string
): Promise<{ path?: string; nom?: string; erreur?: string }> {
  if (fichier.size > TAILLE_MAX) return { erreur: "Le fichier dépasse 8 Mo." };
  if (!EXTENSIONS.test(fichier.name)) {
    return { erreur: "Formats acceptés : PDF, JPG, PNG, WEBP." };
  }
  // Le premier dossier doit être l'uid du déposant : c'est ce que vérifie la
  // policy Storage `depot_documents`, pour le patient comme pour le médecin.
  const nomSur = fichier.name.replace(/[^\w.\-]+/g, "-");
  const path = `${uid}/${crypto.randomUUID()}-${nomSur}`;
  const { error } = await creerClientNavigateur()
    .storage.from(BUCKET)
    .upload(path, fichier, { contentType: fichier.type || undefined });
  if (error) return { erreur: error.message };
  return { path, nom: fichier.name };
}

/**
 * Dépôt d'un document. `origine` décide de tout le reste :
 *  - 'medecin' : le praticien remet une pièce à son patient ;
 *  - 'patient' : le patient transmet une pièce à un praticien.
 * La base vérifie la cohérence (policies ins_docs_medecin / ins_docs_patient),
 * on ne la redouble pas ici.
 */
export async function deposerDocument(
  d: NouveauDocument & { origine?: "medecin" | "patient" }
): Promise<{ erreur?: string }> {
  const origine = d.origine ?? "medecin";
  if (!d.titre.trim()) return { erreur: "Donnez un titre au document." };
  if (!d.contenu.trim() && !d.fichier) {
    return { erreur: "Rédigez le document ou joignez un fichier." };
  }
  if (origine === "patient" && !d.medecinId) {
    return { erreur: "Choisissez le médecin destinataire." };
  }
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erreur: "Session expirée — reconnectez-vous." };

  let fichierPath: string | null = null;
  let fichierNom: string | null = null;
  if (d.fichier) {
    const envoi = await televerser(d.fichier, auth.user.id);
    if (envoi.erreur) return { erreur: envoi.erreur };
    fichierPath = envoi.path!;
    fichierNom = envoi.nom!;
  }

  // Quand c'est le patient qui envoie et qu'il ne désigne pas un proche, le
  // document le concerne lui : l'appelant n'a pas à connaître son propre uid.
  const patientId =
    d.patientId ?? (origine === "patient" && !d.procheId ? auth.user.id : null);

  const { error } = await supabase.from("documents_patient").insert({
    origine,
    depose_par: auth.user.id,
    medecin_id: origine === "medecin" ? auth.user.id : d.medecinId,
    patient_id: patientId,
    proche_id: d.procheId ?? null,
    rendez_vous_id: d.rendezVousId ?? null,
    type: d.type,
    titre: d.titre.trim(),
    contenu: d.contenu.trim() || null,
    fichier_path: fichierPath,
    fichier_nom: fichierNom,
    prescription: d.prescription ?? null,
    code_verification: d.codeVerification ?? null,
  });

  if (error) {
    // La ligne a été refusée : ne pas laisser le fichier orphelin dans le bucket.
    if (fichierPath) await supabase.storage.from(BUCKET).remove([fichierPath]);
    return { erreur: messageErreur(error.message) };
  }
  return {};
}

/* ===== Corriger, annuler : une pièce remise ne se supprime jamais ===== */

/**
 * Correction d'un document déjà remis : une NOUVELLE version, pas une
 * réécriture.
 *
 * C'était un UPDATE en place jusqu'à la migration 0063, et c'était un
 * problème de fond : le patient est peut-être déjà passé en pharmacie avec
 * la v1. Réécrire la ligne effaçait ce qu'il avait présenté au comptoir, et
 * avec, la seule trace de ce qui avait été prescrit ce jour-là. La base crée
 * désormais une v2 liée à la v1, qui reste consultable.
 *
 * L'ancien fichier n'est donc PAS retiré du bucket : il appartient maintenant
 * à la version précédente, qu'on doit pouvoir rouvrir.
 */
export async function corrigerDocument(
  id: string,
  d: {
    titre: string;
    contenu: string;
    /** Nouveau fichier ; sans lui, la version reprend celui de la précédente. */
    fichier?: File | null;
    fichierActuel?: string | null;
    fichierNomActuel?: string | null;
    prescription?: LignePrescription[] | null;
    codeVerification?: string | null;
  }
): Promise<{ erreur?: string }> {
  if (!d.titre.trim()) return { erreur: "Donnez un titre au document." };
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erreur: "Session expirée — reconnectez-vous." };

  let path = d.fichierActuel ?? null;
  let nom = d.fichierNomActuel ?? null;
  if (d.fichier) {
    const envoi = await televerser(d.fichier, auth.user.id);
    if (envoi.erreur) return { erreur: envoi.erreur };
    path = envoi.path!;
    nom = envoi.nom!;
  }
  if (!d.contenu.trim() && !path) {
    return { erreur: "Une version doit garder du texte ou un fichier." };
  }

  const { error } = await supabase.rpc("corriger_document", {
    p_document_id: id,
    p_titre: d.titre.trim(),
    p_contenu: d.contenu.trim() || null,
    p_fichier_path: path,
    p_fichier_nom: nom,
    p_prescription: d.prescription ?? null,
    p_code_verification: d.codeVerification ?? null,
  });
  return error ? { erreur: messageErreur(error.message) } : {};
}

/** Motifs d'annulation proposés. « Autre » ouvre un champ libre. */
export const MOTIFS_ANNULATION_DOCUMENT = [
  "Erreur de prescription",
  "Changement de traitement",
  "Doublon",
  "Autre",
] as const;

/**
 * Annulation d'une pièce remise. Elle reste au dossier, barrée, avec son
 * motif : le patient et la pharmacie doivent pouvoir constater qu'elle ne
 * vaut plus rien — ce qu'une suppression ne dit à personne.
 */
export async function annulerDocument(id: string, motif: string): Promise<{ erreur?: string }> {
  const propre = motif.trim();
  if (!propre) return { erreur: "Indiquez le motif de l’annulation." };
  const { error } = await creerClientNavigateur().rpc("annuler_document", {
    p_document_id: id,
    p_motif: propre,
  });
  return error ? { erreur: messageErreur(error.message) } : {};
}

/**
 * Suppression définitive — réservée au PATIENT, pour ce qu'il a lui-même
 * envoyé. Depuis la migration 0063 la base refuse la suppression d'une pièce
 * d'origine « medecin » : celle-là s'annule (voir `annulerDocument`).
 */
export async function supprimerDocument(
  id: string,
  fichierPath: string | null
): Promise<{ erreur?: string }> {
  const supabase = creerClientNavigateur();
  const { data, error } = await supabase
    .from("documents_patient")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { erreur: error.message };
  if (!data?.length) return { erreur: "Vous ne pouvez retirer que vos propres dépôts." };
  if (fichierPath) await supabase.storage.from(BUCKET).remove([fichierPath]);
  return {};
}

/* ===== Documents partagés avec le médecin connecté ===== */

export interface DocumentPartage {
  documentId: string;
  titre: string;
  type: string;
  contenu: string | null;
  fichierPath: string | null;
  fichierNom: string | null;
  creeLe: string;
  origine: "medecin" | "patient";
  redigePar: string | null;
  patientNom: string;
  pourQui: string;
  partageLe: string;
}

interface LigneDocumentPartage {
  document_id: string;
  titre: string;
  type: string;
  contenu: string | null;
  fichier_path: string | null;
  fichier_nom: string | null;
  cree_le: string;
  origine: "medecin" | "patient";
  redige_par: string | null;
  patient_nom: string;
  pour_qui: string;
  partage_le: string;
}

/**
 * Documents partagés avec le médecin connecté, quel que soit le patient —
 * y compris ceux avec qui il n'a jamais eu de rendez-vous. Un patient peut
 * partager un document qui concerne un proche (ex. son enfant) : sans cette
 * liste dédiée, la RLS autorisait la lecture mais rien n'y menait, faute de
 * fiche patient où l'afficher (RPC patients_du_medecin).
 */
export function useDocumentsPartagesAvecMoi(): {
  documents: DocumentPartage[];
  chargement: boolean;
  recharger: () => void;
} {
  const [documents, setDocuments] = useState<DocumentPartage[]>([]);
  const [chargement, setChargement] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let actif = true;
    creerClientNavigateur()
      .rpc("documents_partages_medecin")
      .then(({ data }) => {
        if (!actif) return;
        setDocuments(
          ((data ?? []) as LigneDocumentPartage[]).map((l) => ({
            documentId: l.document_id,
            titre: l.titre,
            type: l.type,
            contenu: l.contenu,
            fichierPath: l.fichier_path,
            fichierNom: l.fichier_nom,
            creeLe: l.cree_le,
            origine: l.origine,
            redigePar: l.redige_par,
            patientNom: l.patient_nom,
            pourQui: l.pour_qui,
            partageLe: l.partage_le,
          }))
        );
        setChargement(false);
      });
    return () => {
      actif = false;
    };
  }, [version]);

  return { documents, chargement, recharger: () => setVersion((v) => v + 1) };
}

/* ===== Partage avec un autre médecin (décidé par le patient seul) ===== */

export async function partagerDocument(
  documentId: string,
  medecinId: string
): Promise<{ erreur?: string }> {
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erreur: "Session expirée — reconnectez-vous." };
  const { error } = await supabase
    .from("partages_document")
    .insert({ document_id: documentId, medecin_id: medecinId, partage_par: auth.user.id });
  if (error) {
    if (error.code === "23505") return { erreur: "Ce médecin y a déjà accès." };
    return { erreur: messageErreur(error.message) };
  }
  return {};
}

export async function retirerPartage(
  documentId: string,
  medecinId: string
): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur()
    .from("partages_document")
    .delete()
    .eq("document_id", documentId)
    .eq("medecin_id", medecinId);
  return error ? { erreur: error.message } : {};
}
