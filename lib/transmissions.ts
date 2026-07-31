"use client";

import { useEffect, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";

/*
 * Adressage confraternel (migration 0017) : un médecin transmet le dossier
 * d'un patient à un confrère.
 *
 * Les lectures passent par des RPC plutôt que par PostgREST : la table a
 * DEUX clés étrangères vers `medecins` (émetteur et destinataire), ce qui
 * rendrait toute jointure ambiguë (PGRST201) — le même piège que
 * `partages_document`. Les RPC nomment les praticiens côté SQL, il n'y a
 * plus rien à désambiguïser.
 */

export type StatutTransmission = "envoyee" | "lue" | "revoquee";
export type NiveauUrgence = "normale" | "prioritaire";

export interface PieceJointe {
  id: string;
  titre: string;
  type: string;
  contenu: string | null;
  fichierPath: string | null;
  fichierNom: string | null;
  creeLe: string;
  redigePar: string | null;
}

export interface Transmission {
  id: string;
  /** « recue » ou « envoyee », du point de vue du médecin connecté. */
  sens: "recue" | "envoyee";
  /** L'autre praticien : destinataire si envoyée, émetteur si reçue. */
  confrere: string;
  patientNom: string;
  pourQui: string;
  motif: string;
  note: string | null;
  urgence: NiveauUrgence;
  statut: StatutTransmission;
  creeLe: string;
  lueLe: string | null;
  revoqueeLe: string | null;
  documents: PieceJointe[];
}

interface LigneTransmission {
  id: string;
  sens: "recue" | "envoyee";
  confrere: string;
  patient_nom: string;
  pour_qui: string;
  motif: string;
  note: string | null;
  urgence: NiveauUrgence;
  statut: StatutTransmission;
  cree_le: string;
  lue_le: string | null;
  revoquee_le: string | null;
  documents: PieceJointe[];
}

const versTransmission = (l: LigneTransmission): Transmission => ({
  id: l.id,
  sens: l.sens,
  confrere: l.confrere,
  patientNom: l.patient_nom ?? "",
  pourQui: l.pour_qui,
  motif: l.motif,
  note: l.note,
  urgence: l.urgence,
  statut: l.statut,
  creeLe: l.cree_le,
  lueLe: l.lue_le,
  revoqueeLe: l.revoquee_le,
  documents: l.documents ?? [],
});

/** Transmissions du médecin connecté, reçues ou envoyées. */
export function useTransmissions(sens: "recues" | "envoyees"): {
  transmissions: Transmission[];
  chargement: boolean;
  recharger: () => void;
} {
  // La clé de requête vit dans l'état : `chargement` s'en déduit sans
  // setState en tête d'effet (interdit par le linter React).
  const [resultat, setResultat] = useState<{ cle: string; liste: Transmission[] } | null>(null);
  const [version, setVersion] = useState(0);
  const cle = `${sens}#${version}`;

  useEffect(() => {
    let actif = true;
    creerClientNavigateur()
      .rpc("transmissions_medecin", { p_sens: sens })
      .then(({ data }) => {
        if (!actif) return;
        setResultat({
          cle,
          liste: ((data ?? []) as LigneTransmission[]).map(versTransmission),
        });
      });
    return () => {
      actif = false;
    };
  }, [cle, sens]);

  const aJour = resultat?.cle === cle;
  return {
    transmissions: aJour ? resultat.liste : [],
    chargement: !aJour,
    recharger: () => setVersion((v) => v + 1),
  };
}

/* ===== Vue du patient : ce qui a circulé à son sujet ===== */

export interface TransmissionPatient {
  id: string;
  emetteur: string;
  destinataire: string;
  pourQui: string;
  motif: string;
  note: string | null;
  urgence: NiveauUrgence;
  statut: StatutTransmission;
  creeLe: string;
  lueLe: string | null;
  revoqueeLe: string | null;
  nbDocuments: number;
}

export function useTransmissionsMeConcernant(): {
  transmissions: TransmissionPatient[];
  chargement: boolean;
  recharger: () => void;
} {
  const [transmissions, setTransmissions] = useState<TransmissionPatient[]>([]);
  const [chargement, setChargement] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let actif = true;
    creerClientNavigateur()
      .rpc("transmissions_patient")
      .then(({ data }) => {
        if (!actif) return;
        setTransmissions(
          (
            (data ?? []) as {
              id: string;
              emetteur: string;
              destinataire: string;
              pour_qui: string;
              motif: string;
              note: string | null;
              urgence: NiveauUrgence;
              statut: StatutTransmission;
              cree_le: string;
              lue_le: string | null;
              revoquee_le: string | null;
              nb_documents: number;
            }[]
          ).map((l) => ({
            id: l.id,
            emetteur: l.emetteur,
            destinataire: l.destinataire,
            pourQui: l.pour_qui,
            motif: l.motif,
            note: l.note,
            urgence: l.urgence,
            statut: l.statut,
            creeLe: l.cree_le,
            lueLe: l.lue_le,
            revoqueeLe: l.revoquee_le,
            nbDocuments: Number(l.nb_documents),
          }))
        );
        setChargement(false);
      });
    return () => {
      actif = false;
    };
  }, [version]);

  return { transmissions, chargement, recharger: () => setVersion((v) => v + 1) };
}

/* ===== Confrères adressables ===== */

export interface Confrere {
  id: string;
  nom: string;
  specialite: string;
  etablissement: string;
  ville: string;
}

/** Praticiens validés, hors soi-même. Recherche par nom, spécialité ou établissement. */
export function useConfreres(recherche: string): { confreres: Confrere[]; chargement: boolean } {
  const [resultat, setResultat] = useState<{ cle: string; liste: Confrere[] } | null>(null);

  useEffect(() => {
    let actif = true;
    creerClientNavigateur()
      .rpc("rechercher_confreres", { p_recherche: recherche, p_limite: 20 })
      .then(({ data }) => {
        if (actif) setResultat({ cle: recherche, liste: (data ?? []) as Confrere[] });
      });
    return () => {
      actif = false;
    };
  }, [recherche]);

  return {
    confreres: resultat?.cle === recherche ? resultat.liste : [],
    chargement: resultat?.cle !== recherche,
  };
}

/* ===== Écritures ===== */

/** Traduit les refus de la base en phrases utilisables à l'écran. */
function messageErreur(message: string): string {
  if (message.includes("ins_transmissions") || message.includes("row-level security")) {
    return "Transmission refusée : vérifiez que ce patient et vous avez un rendez-vous en commun, et que le confrère choisi est un compte validé.";
  }
  if (message.includes("transmission_confreres")) {
    return "Vous ne pouvez pas vous adresser un dossier à vous-même.";
  }
  if (message.includes("transmission_motif_non_vide")) {
    return "Le motif de l'adressage est obligatoire.";
  }
  if (message.includes("révoquée")) return "Cette transmission a été révoquée.";
  return message;
}

export async function envoyerTransmission(d: {
  destinataireId: string;
  patientId?: string;
  procheId?: string;
  motif: string;
  note: string;
  urgence: NiveauUrgence;
  /** Identifiants des documents à joindre. */
  documents: string[];
}): Promise<{ erreur?: string }> {
  if (!d.destinataireId) return { erreur: "Choisissez le confrère destinataire." };
  if (!d.motif.trim()) return { erreur: "Indiquez le motif de l'adressage." };

  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erreur: "Session expirée — reconnectez-vous." };

  const { data: transmission, error } = await supabase
    .from("transmissions_dossier")
    .insert({
      medecin_emetteur: auth.user.id,
      medecin_destinataire: d.destinataireId,
      patient_id: d.patientId ?? null,
      proche_id: d.procheId ?? null,
      motif: d.motif.trim(),
      note: d.note.trim() || null,
      urgence: d.urgence,
      // Attesté explicitement par l'émetteur dans le formulaire : la base
      // refuse l'insertion sans, c'est une trace opposable.
      consentement_atteste: true,
    })
    .select("id")
    .single();

  if (error) return { erreur: messageErreur(error.message) };

  if (d.documents.length > 0) {
    const { error: eJointes } = await supabase
      .from("transmission_documents")
      .insert(d.documents.map((id) => ({ transmission_id: transmission.id, document_id: id })));
    if (eJointes) {
      // La transmission est partie mais sans ses pièces : le dire plutôt que
      // laisser croire à un envoi complet.
      return {
        erreur: `Transmission envoyée, mais les pièces jointes n'ont pas pu être attachées : ${eJointes.message}`,
      };
    }
  }
  return {};
}

/** Accusé de réception, réservé au destinataire par le trigger de garde. */
export async function marquerTransmissionLue(id: string): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur()
    .from("transmissions_dossier")
    .update({ statut: "lue" })
    .eq("id", id);
  return error ? { erreur: messageErreur(error.message) } : {};
}

/** Retrait de l'accès — par l'émetteur ou par le patient concerné. */
export async function revoquerTransmission(id: string): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur()
    .from("transmissions_dossier")
    .update({ statut: "revoquee" })
    .eq("id", id);
  return error ? { erreur: messageErreur(error.message) } : {};
}
