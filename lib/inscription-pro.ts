"use client";

import { useEffect, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";
import { versISO } from "@/lib/dates";

/*
 * Parcours d'inscription professionnel multi-étapes.
 *
 * Le compte est créé dès la première étape (« Compte ») ; chaque étape
 * suivante écrit directement dans les tables réelles (`medecins`,
 * `etablissements`, `documents_validation`, `horaires_types`…), si bien
 * que le parcours est reprenable à tout moment et que le profil de
 * l'espace pro est déjà rempli à la fin. La colonne `etape_inscription`
 * (migration 0018) mémorise l'étape courante ; null = parcours terminé.
 */

export type RoleInscription = "medecin" | "etablissement";

export interface DefinitionEtape {
  /** Valeur stockée dans etape_inscription et segment d'URL. */
  id: string;
  label: string;
}

export const ETAPES_PRATICIEN: DefinitionEtape[] = [
  { id: "compte", label: "Compte" },
  { id: "profil", label: "Profil médical" },
  { id: "lieu", label: "Lieu d'exercice" },
  { id: "documents", label: "Documents" },
  { id: "horaires", label: "Horaires" },
  { id: "recap", label: "Récap" },
  { id: "confirmation", label: "Confirmation" },
];

export const ETAPES_ETABLISSEMENT: DefinitionEtape[] = [
  { id: "compte", label: "Compte" },
  { id: "fiche", label: "Fiche établissement" },
  { id: "documents", label: "Documents" },
  { id: "recap", label: "Récap" },
  { id: "confirmation", label: "Confirmation" },
];

export function etapesPour(role: RoleInscription): DefinitionEtape[] {
  return role === "medecin" ? ETAPES_PRATICIEN : ETAPES_ETABLISSEMENT;
}

export interface ParcoursInscription {
  chargement: boolean;
  connecte: boolean;
  role: RoleInscription | null;
  /** Étape courante stockée en base ; null = parcours terminé. */
  etape: string | null;
  /** Id de la ligne `etablissements` quand role = etablissement. */
  etabId: string | null;
  recharger: () => void;
}

export function useParcoursInscription(): ParcoursInscription {
  const [etat, setEtat] = useState<Omit<ParcoursInscription, "recharger">>({
    chargement: true,
    connecte: false,
    role: null,
    etape: null,
    etabId: null,
  });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let actif = true;
    (async () => {
      const supabase = creerClientNavigateur();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        if (actif) setEtat({ chargement: false, connecte: false, role: null, etape: null, etabId: null });
        return;
      }
      const { data: u } = await supabase
        .from("utilisateurs")
        .select("role")
        .eq("id", auth.user.id)
        .single();
      if (u?.role === "medecin") {
        const { data: m } = await supabase
          .from("medecins")
          .select("etape_inscription")
          .eq("id", auth.user.id)
          .maybeSingle();
        if (actif)
          setEtat({
            chargement: false,
            connecte: true,
            role: "medecin",
            etape: m?.etape_inscription ?? null,
            etabId: null,
          });
      } else if (u?.role === "etablissement") {
        const { data: e } = await supabase
          .from("etablissements")
          .select("id, etape_inscription")
          .eq("gestionnaire_id", auth.user.id)
          .maybeSingle();
        if (actif)
          setEtat({
            chargement: false,
            connecte: true,
            role: "etablissement",
            etape: e?.etape_inscription ?? null,
            etabId: e?.id ?? null,
          });
      } else if (actif) {
        setEtat({ chargement: false, connecte: !!u, role: null, etape: null, etabId: null });
      }
    })();
    return () => {
      actif = false;
    };
  }, [version]);

  return { ...etat, recharger: () => setVersion((v) => v + 1) };
}

/** Avance (ou remet à null) l'étape mémorisée. */
export async function poserEtape(
  role: RoleInscription,
  etabId: string | null,
  etape: string | null
): Promise<{ erreur?: string }> {
  const supabase = creerClientNavigateur();
  if (role === "medecin") {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { erreur: "Session expirée." };
    const { error } = await supabase
      .from("medecins")
      .update({ etape_inscription: etape })
      .eq("id", auth.user.id);
    return error ? { erreur: error.message } : {};
  }
  if (!etabId) return { erreur: "Établissement introuvable." };
  const { error } = await supabase
    .from("etablissements")
    .update({ etape_inscription: etape })
    .eq("id", etabId);
  return error ? { erreur: error.message } : {};
}

/**
 * Avance vers l'étape `suivante`, sauf si le parcours a déjà atteint le
 * récap (retour « Modifier ») : dans ce cas l'étape stockée ne bouge pas
 * et la cible est le récap. L'étape stockée est relue au moment du clic —
 * l'état du layout peut être périmé après plusieurs navigations.
 */
export async function avancerEtape(
  role: RoleInscription,
  etabId: string | null,
  suivante: string
): Promise<{ cible: string; erreur?: string }> {
  const supabase = creerClientNavigateur();
  let stockee: string | null = null;
  if (role === "medecin") {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { cible: suivante, erreur: "Session expirée." };
    const { data } = await supabase
      .from("medecins")
      .select("etape_inscription")
      .eq("id", auth.user.id)
      .maybeSingle();
    stockee = data?.etape_inscription ?? null;
  } else if (etabId) {
    const { data } = await supabase
      .from("etablissements")
      .select("etape_inscription")
      .eq("id", etabId)
      .maybeSingle();
    stockee = data?.etape_inscription ?? null;
  }
  if (stockee === "recap") return { cible: "recap" };
  const res = await poserEtape(role, etabId, suivante);
  return { cible: suivante, erreur: res.erreur };
}

/* ===== Écritures par étape — praticien ===== */

export async function enregistrerEtapeProfil(d: {
  specialiteId?: string;
  tarifConsultation?: number | null;
  anneesExperience?: number | null;
  presentation?: string;
  langues?: string[];
  soins?: string[];
  /** « femme » | « homme » | "" (non précisé). */
  genre?: string;
}): Promise<{ erreur?: string }> {
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erreur: "Session expirée." };
  const maj: Record<string, unknown> = {};
  if (d.specialiteId !== undefined) maj.specialite_id = d.specialiteId || null;
  if (d.tarifConsultation !== undefined) maj.tarif_consultation = d.tarifConsultation;
  if (d.anneesExperience !== undefined) maj.annees_experience = d.anneesExperience;
  if (d.presentation !== undefined) maj.presentation = d.presentation;
  if (d.langues !== undefined) maj.langues = d.langues;
  if (d.soins !== undefined) maj.soins_et_actes = d.soins;
  if (d.genre !== undefined) maj.genre = d.genre === "" ? null : d.genre;
  const { error } = await supabase.from("medecins").update(maj).eq("id", auth.user.id);
  return error ? { erreur: error.message } : {};
}

export async function enregistrerEtapeLieu(d: {
  quartier?: string;
  localisation?: string;
  telephoneSecretariat?: string;
}): Promise<{ erreur?: string }> {
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erreur: "Session expirée." };
  const maj: Record<string, unknown> = {};
  if (d.quartier !== undefined) maj.quartier = d.quartier;
  if (d.localisation !== undefined) maj.localisation = d.localisation;
  if (d.telephoneSecretariat !== undefined) maj.telephone_secretariat = d.telephoneSecretariat;
  const { error } = await supabase.from("medecins").update(maj).eq("id", auth.user.id);
  return error ? { erreur: error.message } : {};
}

export interface PlageHebdo {
  /** 0 = dimanche … 6 = samedi (convention de `horaires_types`). */
  jour: number;
  debut: string; // "08:00"
  fin: string; // "17:00"
}

/** Remplace les horaires type de la semaine du médecin connecté. */
export async function enregistrerHorairesHebdo(plages: PlageHebdo[]): Promise<{ erreur?: string }> {
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erreur: "Session expirée." };
  const { error: eDel } = await supabase
    .from("horaires_types")
    .delete()
    .eq("medecin_id", auth.user.id);
  if (eDel) return { erreur: eDel.message };
  if (plages.length === 0) return {};
  const { error } = await supabase.from("horaires_types").insert(
    plages.map((p) => ({
      medecin_id: auth.user.id,
      jour_semaine: p.jour,
      heure_debut: p.debut,
      heure_fin: p.fin,
    }))
  );
  return error ? { erreur: error.message } : {};
}

/* ===== Écritures par étape — établissement ===== */

export async function enregistrerEtapeFiche(
  etabId: string,
  d: {
    description?: string;
    adresse?: string;
    quartier?: string;
    telephone?: string;
    email?: string;
    services?: string[];
  }
): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur()
    .from("etablissements")
    .update(d)
    .eq("id", etabId);
  return error ? { erreur: error.message } : {};
}

/* ===== Confirmation ===== */

/**
 * Clôt le parcours : active l'essai gratuit (si aucun abonnement) puis
 * efface `etape_inscription`. La formule d'essai découle du type de compte.
 */
export async function terminerInscription(
  role: RoleInscription,
  etabId: string | null,
  typeEtablissement?: string
): Promise<{ erreur?: string }> {
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erreur: "Session expirée." };

  let formule = "standard";
  if (role === "etablissement") {
    const type = (typeEtablissement ?? "").toLowerCase();
    formule = type.includes("hôpital") || type.includes("hopital")
      ? "hopital"
      : type.includes("clinique")
        ? "clinique"
        : "cabinet";
  }

  const { data: existants } = await supabase
    .from("abonnements")
    .select("id")
    .eq("titulaire_id", auth.user.id)
    .limit(1);
  if (!existants || existants.length === 0) {
    const { data: tarif } = await supabase
      .from("tarifs_plateforme")
      .select("essai_jours, quota_sms")
      .eq("formule", formule)
      .maybeSingle();
    const essaiJours = tarif?.essai_jours ?? 30;
    const { error: eAbo } = await supabase.from("abonnements").insert({
      titulaire_id: auth.user.id,
      type_titulaire: role,
      formule,
      periode: "mensuel",
      statut: "essai",
      date_fin: versISO(new Date(Date.now() + essaiJours * 86400000)),
      quota_sms: tarif?.quota_sms ?? 0,
    });
    if (eAbo) return { erreur: eAbo.message };
  }

  return poserEtape(role, etabId, null);
}
