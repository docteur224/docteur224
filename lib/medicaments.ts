"use client";

import { useEffect, useState } from "react";
import type { MedicamentRef } from "@/lib/prescription";
import { creerClientNavigateur } from "@/lib/supabase/client";

/*
 * Base de médicaments, modèles d'ordonnance et signature du médecin
 * (migration 0065). Lectures et écritures sous la RLS : un médecin ne voit
 * que SES modèles et SA signature, sans filtre à poser ici.
 */

/* ===================== Recherche ===================== */

interface LigneMedicament {
  id: string;
  dci: string;
  nom_commercial: string | null;
  dosage: string | null;
  forme: string | null;
  classe: string | null;
}

const versRef = (l: LigneMedicament): MedicamentRef => ({
  id: l.id,
  dci: l.dci,
  nomCommercial: l.nom_commercial,
  dosage: l.dosage,
  forme: l.forme,
  classe: l.classe,
});

/**
 * Médicaments actifs dont la DCI ou le nom commercial contient la saisie.
 * Les deux premiers caractères ne suffisent pas à cibler : on attend le
 * troisième, sinon « am » remonte la moitié de la liste.
 */
export async function rechercherMedicaments(saisie: string): Promise<MedicamentRef[]> {
  const q = saisie.trim();
  if (q.length < 3) return [];
  // Les caractères spéciaux du filtre PostgREST (virgule, parenthèses) cassent
  // la requête : on les retire de la saisie.
  const propre = q.replace(/[,()%*]/g, " ").trim();
  const { data } = await creerClientNavigateur()
    .from("medicaments")
    .select("id, dci, nom_commercial, dosage, forme, classe")
    .eq("actif", true)
    .or(`dci.ilike.%${propre}%,nom_commercial.ilike.%${propre}%`)
    .order("dci")
    .order("dosage")
    .limit(12);
  return ((data ?? []) as LigneMedicament[]).map(versRef);
}

/*
 * Les MODÈLES d'ordonnance ont déménagé dans `lib/modeles-ordonnance.ts` :
 * ils servent aux trois domaines (médicament, biologie, imagerie) et n'ont
 * plus leur place dans un fichier consacré aux médicaments.
 */

/* ===================== Signature ===================== */

export type Traits = [number, number][][];

export interface SignatureMedecin {
  traits: Traits;
  ratio: number;
  majLe: string;
}

export function useSignature(revision: number) {
  const [resultat, setResultat] = useState<{ revision: number; signature: SignatureMedecin | null } | null>(null);

  useEffect(() => {
    let actif = true;
    const supabase = creerClientNavigateur();
    supabase.auth.getUser().then(({ data: auth }) => {
      if (!auth.user) return;
      supabase
        .from("signatures_medecin")
        .select("traits, ratio, maj_le")
        .eq("medecin_id", auth.user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!actif) return;
          setResultat({
            revision,
            signature: data ? { traits: data.traits as Traits, ratio: Number(data.ratio), majLe: data.maj_le } : null,
          });
        });
    });
    return () => {
      actif = false;
    };
  }, [revision]);

  return { signature: resultat?.signature ?? null, chargement: resultat === null };
}

export async function enregistrerSignature(traits: Traits, ratio: number): Promise<{ erreur?: string }> {
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erreur: "Session expirée — reconnectez-vous." };
  // Coordonnées arrondies au millième : le tracé reste fidèle, la ligne en
  // base dix fois plus légère.
  const arrondis = traits.map((t) => t.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]));
  const { error } = await supabase
    .from("signatures_medecin")
    .upsert({ medecin_id: auth.user.id, traits: arrondis, ratio, maj_le: new Date().toISOString() });
  return error ? { erreur: error.message } : {};
}

export async function supprimerSignature(): Promise<{ erreur?: string }> {
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erreur: "Session expirée — reconnectez-vous." };
  const { error } = await supabase.from("signatures_medecin").delete().eq("medecin_id", auth.user.id);
  return error ? { erreur: error.message } : {};
}
