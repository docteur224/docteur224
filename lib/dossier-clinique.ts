"use client";

import { useEffect, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";
import type { ContexteGlycemie } from "@/lib/normes-constantes";
import { lirePatientCle } from "@/lib/pro";

/*
 * Dossier clinique (migration 0064) : notes de consultation, constantes,
 * chronologie.
 *
 * Toutes les écritures passent par des fonctions de la base, qui vérifient
 * que le médecin suit ce patient et journalisent. Les lectures se font sous
 * la RLS : notes et constantes ne remontent QUE pour leur auteur — il n'y a
 * aucun filtre « par médecin » à ajouter ici, la base l'impose.
 */

/** Le patient de la fiche, sous les trois formes qu'il peut prendre. */
export interface Beneficiaire {
  patientId: string | null;
  procheId: string | null;
  sansCompteId: string | null;
}

export function beneficiaireDeCle(cle: string): Beneficiaire {
  const { type, id } = lirePatientCle(cle);
  return {
    patientId: type === "compte" ? id : null,
    procheId: type === "proche" ? id : null,
    sansCompteId: type === "sans_compte" ? id : null,
  };
}

const parametres = (b: Beneficiaire) => ({
  p_patient_id: b.patientId,
  p_proche_id: b.procheId,
  p_sans_compte_id: b.sansCompteId,
});

/** Filtre PostgREST sur la colonne du bénéficiaire. */
function colonne(b: Beneficiaire): [string, string] {
  if (b.patientId) return ["patient_id", b.patientId];
  if (b.procheId) return ["proche_id", b.procheId];
  return ["patient_sans_compte_id", b.sansCompteId ?? ""];
}

/** Traduit les refus de la base en phrases utilisables à l'écran. */
function messageErreur(message: string): string {
  if (message.includes("constantes_poids")) return "Poids hors des valeurs possibles (0,5 à 400 kg).";
  if (message.includes("constantes_tension_bornes")) {
    return "Tension impossible : la systolique doit dépasser la diastolique (ex. 120/80).";
  }
  if (message.includes("constantes_glycemie")) return "Glycémie hors des valeurs possibles (0,1 à 9,99 g/L).";
  if (message.includes("constantes_une_mesure")) return "Renseignez au moins une mesure.";
  if (message.includes("permission denied")) return "Session expirée — reconnectez-vous.";
  return message;
}

/* ===================== Notes de consultation ===================== */

export interface VersionNote {
  version: number;
  motif: string | null;
  examen: string | null;
  diagnostic: string | null;
  conduite: string | null;
  creeLe: string;
}

export interface NoteConsultation {
  id: string;
  rendezVousId: string | null;
  versionCourante: number;
  creeLe: string;
  majLe: string;
  /** Toutes les versions, de la plus récente à la plus ancienne. */
  versions: VersionNote[];
}

/** La version en cours d'une note : la première de la liste. */
export const derniere = (n: NoteConsultation): VersionNote => n.versions[0];

interface LigneNote {
  id: string;
  rendez_vous_id: string | null;
  version_courante: number;
  cree_le: string;
  maj_le: string;
  notes_consultation_versions: {
    version: number;
    motif: string | null;
    examen: string | null;
    diagnostic: string | null;
    conduite: string | null;
    cree_le: string;
  }[];
}

/**
 * Notes du patient, la plus récemment modifiée en tête. `revision` : changé
 * après une écriture pour relire.
 */
export function useNotes(b: Beneficiaire, revision: number) {
  const [col, val] = colonne(b);
  const cle = `${col}|${val}|${revision}`;
  const [resultat, setResultat] = useState<{ cle: string; notes: NoteConsultation[]; erreur?: string } | null>(null);

  useEffect(() => {
    let actif = true;
    creerClientNavigateur()
      .from("notes_consultation")
      .select(
        "id, rendez_vous_id, version_courante, cree_le, maj_le, notes_consultation_versions ( version, motif, examen, diagnostic, conduite, cree_le )"
      )
      .eq(col, val)
      .order("maj_le", { ascending: false })
      .then(({ data, error }) => {
        if (!actif) return;
        const notes = ((data ?? []) as LigneNote[]).map((l) => ({
          id: l.id,
          rendezVousId: l.rendez_vous_id,
          versionCourante: l.version_courante,
          creeLe: l.cree_le,
          majLe: l.maj_le,
          versions: [...l.notes_consultation_versions]
            .sort((a, b) => b.version - a.version)
            .map((v) => ({
              version: v.version,
              motif: v.motif,
              examen: v.examen,
              diagnostic: v.diagnostic,
              conduite: v.conduite,
              creeLe: v.cree_le,
            })),
        }));
        setResultat({ cle, notes, erreur: error?.message });
      });
    return () => {
      actif = false;
    };
  }, [cle, col, val]);

  return {
    notes: resultat?.cle === cle ? resultat.notes : (resultat?.notes ?? []),
    chargement: resultat === null,
    erreur: resultat?.erreur,
  };
}

export interface ChampsNote {
  motif: string;
  examen: string;
  diagnostic: string;
  conduite: string;
  rendezVousId: string | null;
}

/** Crée une note, ou en enregistre une nouvelle version si `noteId` est fourni. */
export async function enregistrerNote(
  b: Beneficiaire,
  champs: ChampsNote,
  noteId?: string
): Promise<{ id?: string; erreur?: string }> {
  const { data, error } = await creerClientNavigateur().rpc("enregistrer_note", {
    p_note_id: noteId ?? null,
    ...(noteId ? {} : parametres(b)),
    p_rendez_vous_id: champs.rendezVousId,
    p_motif: champs.motif,
    p_examen: champs.examen,
    p_diagnostic: champs.diagnostic,
    p_conduite: champs.conduite,
  });
  return error ? { erreur: messageErreur(error.message) } : { id: data as string };
}

/* ===================== Constantes ===================== */

export interface Constante {
  id: string;
  /** Date de la mesure (ISO). */
  le: string;
  poidsKg: number | null;
  sys: number | null;
  dia: number | null;
  glycemie: number | null;
  contexte: ContexteGlycemie | null;
  rendezVousId: string | null;
  erronee: boolean;
  motifInvalidation: string | null;
}

interface LigneConstante {
  id: string;
  mesure_le: string;
  poids_kg: number | string | null;
  tension_sys: number | null;
  tension_dia: number | null;
  glycemie_gl: number | string | null;
  glycemie_contexte: ContexteGlycemie | null;
  rendez_vous_id: string | null;
  invalide_le: string | null;
  motif_invalidation: string | null;
}

// PostgREST rend les `numeric` en texte : « 72.5 ».
const nombre = (v: number | string | null) => (v === null ? null : Number(v));

/** Mesures du patient, la plus récente en tête. */
export function useConstantes(b: Beneficiaire, revision: number) {
  const [col, val] = colonne(b);
  const cle = `${col}|${val}|${revision}`;
  const [resultat, setResultat] = useState<{ cle: string; mesures: Constante[]; erreur?: string } | null>(null);

  useEffect(() => {
    let actif = true;
    creerClientNavigateur()
      .from("constantes")
      .select(
        "id, mesure_le, poids_kg, tension_sys, tension_dia, glycemie_gl, glycemie_contexte, rendez_vous_id, invalide_le, motif_invalidation"
      )
      .eq(col, val)
      .order("mesure_le", { ascending: false })
      .then(({ data, error }) => {
        if (!actif) return;
        const mesures = ((data ?? []) as LigneConstante[]).map((l) => ({
          id: l.id,
          le: l.mesure_le,
          poidsKg: nombre(l.poids_kg),
          sys: l.tension_sys,
          dia: l.tension_dia,
          glycemie: nombre(l.glycemie_gl),
          contexte: l.glycemie_contexte,
          rendezVousId: l.rendez_vous_id,
          erronee: !!l.invalide_le,
          motifInvalidation: l.motif_invalidation,
        }));
        setResultat({ cle, mesures, erreur: error?.message });
      });
    return () => {
      actif = false;
    };
  }, [cle, col, val]);

  return {
    mesures: resultat?.cle === cle ? resultat.mesures : (resultat?.mesures ?? []),
    chargement: resultat === null,
    erreur: resultat?.erreur,
  };
}

export interface SaisieConstantes {
  le: string | null;
  poidsKg: number | null;
  sys: number | null;
  dia: number | null;
  glycemie: number | null;
  contexte: ContexteGlycemie | null;
  rendezVousId: string | null;
}

export async function ajouterConstantes(
  b: Beneficiaire,
  s: SaisieConstantes
): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur().rpc("ajouter_constantes", {
    ...parametres(b),
    p_rendez_vous_id: s.rendezVousId,
    p_mesure_le: s.le,
    p_poids_kg: s.poidsKg,
    p_tension_sys: s.sys,
    p_tension_dia: s.dia,
    p_glycemie_gl: s.glycemie,
    p_glycemie_contexte: s.glycemie === null ? null : s.contexte,
  });
  return error ? { erreur: messageErreur(error.message) } : {};
}

export async function invaliderConstante(id: string, motif: string): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur().rpc("invalider_constante", { p_id: id, p_motif: motif });
  return error ? { erreur: messageErreur(error.message) } : {};
}

/* ===================== Chronologie ===================== */

export type TypeEvenement = "rdv" | "document" | "note" | "constante";

export interface Evenement {
  type: TypeEvenement;
  quand: string;
  refId: string;
  titre: string;
  detail: string | null;
  extra: Record<string, unknown>;
}

export const PAR_PAGE_CHRONOLOGIE = 10;

/**
 * Chronologie paginée par « Voir plus » : `pages` pages de 10 événements,
 * en une requête (la base renvoie le total sur chaque ligne).
 */
export function useChronologie(b: Beneficiaire, types: TypeEvenement[] | null, pages: number, revision: number) {
  const cle = `${b.patientId}|${b.procheId}|${b.sansCompteId}|${types?.join(",") ?? "tout"}|${pages}|${revision}`;
  const [resultat, setResultat] = useState<{
    cle: string;
    evenements: Evenement[];
    total: number;
    erreur?: string;
  } | null>(null);

  useEffect(() => {
    let actif = true;
    const [patientId, procheId, sansCompteId, filtre, nbPages] = cle.split("|");
    creerClientNavigateur()
      .rpc("chronologie_patient", {
        p_patient_id: patientId === "null" ? null : patientId,
        p_proche_id: procheId === "null" ? null : procheId,
        p_sans_compte_id: sansCompteId === "null" ? null : sansCompteId,
        p_types: filtre === "tout" ? null : filtre.split(","),
        p_limite: Math.min(500, Number(nbPages) * PAR_PAGE_CHRONOLOGIE),
        p_decalage: 0,
      })
      .then(({ data, error }) => {
        if (!actif) return;
        const lignes = (data ?? []) as {
          type: TypeEvenement;
          quand: string;
          ref_id: string;
          titre: string;
          detail: string | null;
          extra: Record<string, unknown>;
          total: number;
        }[];
        setResultat({
          cle,
          evenements: lignes.map((l) => ({
            type: l.type,
            quand: l.quand,
            refId: l.ref_id,
            titre: l.titre,
            detail: l.detail,
            extra: l.extra ?? {},
          })),
          total: Number(lignes[0]?.total ?? 0),
          erreur: error?.message,
        });
      });
    return () => {
      actif = false;
    };
  }, [cle]);

  const aJour = resultat?.cle === cle;
  return {
    evenements: resultat?.evenements ?? [],
    total: resultat?.total ?? 0,
    // Premier chargement seulement : un « Voir plus » garde la liste affichée.
    chargement: resultat === null,
    enCours: !aJour,
    erreur: resultat?.erreur,
  };
}
