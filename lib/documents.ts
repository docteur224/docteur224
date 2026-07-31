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

export interface DocumentPatient {
  id: string;
  type: string;
  titre: string;
  contenu: string | null;
  fichierPath: string | null;
  fichierNom: string | null;
  creeLe: string;
  medecinId: string;
  medecinNom: string;
  /** « Moi-même » ou le nom du proche destinataire. */
  pourQui: string;
}

interface LigneDocument {
  id: string;
  type: string;
  titre: string;
  contenu: string | null;
  fichier_path: string | null;
  fichier_nom: string | null;
  cree_le: string;
  medecin_id: string;
  patient_id: string | null;
  medecins: {
    civilite: string | null;
    utilisateurs: { nom: string | null; prenom: string | null } | null;
  } | null;
  proches: { nom: string; prenom: string } | null;
}

const SELECTION = `
  id, type, titre, contenu, fichier_path, fichier_nom, cree_le, medecin_id, patient_id,
  medecins ( civilite, utilisateurs ( nom, prenom ) ),
  proches ( nom, prenom )
`;

const versDocument = (l: LigneDocument): DocumentPatient => ({
  id: l.id,
  type: l.type,
  titre: l.titre,
  contenu: l.contenu,
  fichierPath: l.fichier_path,
  fichierNom: l.fichier_nom,
  creeLe: l.cree_le,
  medecinId: l.medecin_id,
  medecinNom: `${l.medecins?.civilite === "Pr" ? "Pr" : "Dr"} ${
    l.medecins?.utilisateurs?.prenom ?? ""
  } ${l.medecins?.utilisateurs?.nom ?? ""}`.trim(),
  pourQui: l.proches ? `${l.proches.prenom} ${l.proches.nom}` : "Moi-même",
});

/** Documents visibles par l'utilisateur connecté (la RLS filtre le reste). */
export function useMesDocuments(): {
  documents: DocumentPatient[];
  chargement: boolean;
  recharger: () => void;
} {
  const [documents, setDocuments] = useState<DocumentPatient[]>([]);
  const [chargement, setChargement] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let actif = true;
    creerClientNavigateur()
      .from("documents_patient")
      .select(SELECTION)
      .order("cree_le", { ascending: false })
      .then(({ data }) => {
        if (!actif) return;
        setDocuments(((data ?? []) as unknown as LigneDocument[]).map(versDocument));
        setChargement(false);
      });
    return () => {
      actif = false;
    };
  }, [version]);

  return { documents, chargement, recharger: () => setVersion((v) => v + 1) };
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
  /** Destinataire : l'un des deux seulement, comme pour un rendez-vous. */
  patientId?: string;
  procheId?: string;
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
    return "Vous ne pouvez déposer un document que pour un patient avec qui vous avez un rendez-vous.";
  }
  return message;
}

export async function deposerDocument(d: NouveauDocument): Promise<{ erreur?: string }> {
  if (!d.titre.trim()) return { erreur: "Donnez un titre au document." };
  if (!d.contenu.trim() && !d.fichier) {
    return { erreur: "Rédigez le document ou joignez un fichier." };
  }
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erreur: "Session expirée — reconnectez-vous." };

  let fichierPath: string | null = null;
  let fichierNom: string | null = null;

  if (d.fichier) {
    if (d.fichier.size > TAILLE_MAX) return { erreur: "Le fichier dépasse 8 Mo." };
    if (!EXTENSIONS.test(d.fichier.name)) {
      return { erreur: "Formats acceptés : PDF, JPG, PNG, WEBP." };
    }
    // Le premier dossier doit être l'uid du déposant : c'est ce que vérifie
    // la policy Storage `depot_documents_medecin`.
    const nomSur = d.fichier.name.replace(/[^\w.\-]+/g, "-");
    fichierPath = `${auth.user.id}/${crypto.randomUUID()}-${nomSur}`;
    fichierNom = d.fichier.name;
    const { error } = await supabase.storage.from(BUCKET).upload(fichierPath, d.fichier, {
      contentType: d.fichier.type || undefined,
    });
    if (error) return { erreur: error.message };
  }

  const { error } = await supabase.from("documents_patient").insert({
    medecin_id: auth.user.id,
    patient_id: d.patientId ?? null,
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

export async function supprimerDocument(
  id: string,
  fichierPath: string | null
): Promise<{ erreur?: string }> {
  const supabase = creerClientNavigateur();
  const { error } = await supabase.from("documents_patient").delete().eq("id", id);
  if (error) return { erreur: error.message };
  if (fichierPath) await supabase.storage.from(BUCKET).remove([fichierPath]);
  return {};
}
