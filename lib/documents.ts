"use client";

import { useEffect, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";

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
  { valeur: "autre", libelle: "Autre", icone: "📎" },
] as const;

export type TypeDocument = (typeof TYPES_DOCUMENT)[number]["valeur"];

export const libelleType = (t: string) =>
  TYPES_DOCUMENT.find((x) => x.valeur === t)?.libelle ?? "Document";
export const iconeType = (t: string) =>
  TYPES_DOCUMENT.find((x) => x.valeur === t)?.icone ?? "📎";

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
});

/**
 * Documents visibles par l'utilisateur connecté (la RLS filtre le reste).
 * `pour` restreint au dossier d'un patient précis, pour l'espace médecin.
 */
export function useMesDocuments(pour?: {
  patientId?: string;
  procheId?: string;
}): {
  documents: DocumentPatient[];
  chargement: boolean;
  recharger: () => void;
} {
  const [documents, setDocuments] = useState<DocumentPatient[]>([]);
  const [chargement, setChargement] = useState(true);
  const [version, setVersion] = useState(0);
  const filtre = `${pour?.patientId ?? ""}|${pour?.procheId ?? ""}`;

  useEffect(() => {
    let actif = true;
    let requete = creerClientNavigateur()
      .from("documents_patient")
      .select(SELECTION)
      .order("cree_le", { ascending: false });
    const [patientId, procheId] = filtre.split("|");
    if (patientId) requete = requete.eq("patient_id", patientId);
    if (procheId) requete = requete.eq("proche_id", procheId);

    requete.then(({ data }) => {
      if (!actif) return;
      setDocuments(((data ?? []) as unknown as LigneDocument[]).map(versDocument));
      setChargement(false);
    });
    return () => {
      actif = false;
    };
  }, [version, filtre]);

  return { documents, chargement, recharger: () => setVersion((v) => v + 1) };
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
}

/**
 * Demande au serveur le PDF composé à partir du type et du texte saisis.
 *
 * La mise en page n'est pas faite ici : l'en-tête engage l'identité du
 * praticien, elle doit être relue en base à partir de la session et non
 * fournie par le navigateur (voir app/api/document-pdf/route.ts).
 */
export async function genererPdf(d: {
  patientId?: string;
  procheId?: string;
  type: TypeDocument;
  titre: string;
  contenu: string;
}): Promise<{ fichier?: File; erreur?: string }> {
  const reponse = await fetch("/api/document-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(d),
  });
  if (!reponse.ok) {
    const { erreur } = await reponse
      .json()
      .catch(() => ({ erreur: "La génération du document a échoué." }));
    return { erreur };
  }
  const octets = await reponse.blob();
  const nom = `${d.titre.replace(/[^\w\s.\-]+/g, "").trim() || d.type}.pdf`.replace(/\s+/g, "-");
  return { fichier: new File([octets], nom, { type: "application/pdf" }) };
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
  });

  if (error) {
    // La ligne a été refusée : ne pas laisser le fichier orphelin dans le bucket.
    if (fichierPath) await supabase.storage.from(BUCKET).remove([fichierPath]);
    return { erreur: messageErreur(error.message) };
  }
  return {};
}

/**
 * Correction d'un document déjà remis. Réservé au déposant par la policy
 * `upd_docs` : un médecin ne réécrit pas la pièce d'un patient, et
 * réciproquement. Un nouveau fichier remplace l'ancien, qui est supprimé —
 * sinon chaque correction laisserait une pièce jointe orpheline dans le
 * bucket, toujours facturée et toujours lisible par son chemin.
 */
export async function modifierDocument(
  id: string,
  d: {
    type: TypeDocument;
    titre: string;
    contenu: string;
    /** Nouveau fichier ; `null` = on garde l'existant. */
    fichier?: File | null;
    /** Chemin du fichier actuel, à retirer s'il est remplacé. */
    fichierActuel?: string | null;
    /** Retirer la pièce jointe sans la remplacer. */
    retirerFichier?: boolean;
  }
): Promise<{ erreur?: string }> {
  if (!d.titre.trim()) return { erreur: "Donnez un titre au document." };
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erreur: "Session expirée — reconnectez-vous." };

  const champs: Record<string, unknown> = {
    type: d.type,
    titre: d.titre.trim(),
    contenu: d.contenu.trim() || null,
  };

  let ancien: string | null = null;
  if (d.fichier) {
    const envoi = await televerser(d.fichier, auth.user.id);
    if (envoi.erreur) return { erreur: envoi.erreur };
    champs.fichier_path = envoi.path;
    champs.fichier_nom = envoi.nom;
    ancien = d.fichierActuel ?? null;
  } else if (d.retirerFichier) {
    if (!d.contenu.trim()) {
      return { erreur: "Un document doit garder du texte ou un fichier." };
    }
    champs.fichier_path = null;
    champs.fichier_nom = null;
    ancien = d.fichierActuel ?? null;
  }

  const { data, error } = await supabase
    .from("documents_patient")
    .update(champs)
    .eq("id", id)
    .select("id");
  if (error) return { erreur: messageErreur(error.message) };
  // Un update RLS-bloqué ne remonte pas d'erreur, il ne touche aucune ligne.
  if (!data?.length) return { erreur: "Vous ne pouvez modifier que vos propres dépôts." };

  if (ancien) await supabase.storage.from(BUCKET).remove([ancien]);
  return {};
}

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
