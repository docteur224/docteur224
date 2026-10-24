"use client";

import { useEffect, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";
import type { OptionsActes } from "@/lib/prescription-actes";

/*
 * Modèles d'ordonnance : les prescriptions fréquentes d'un médecin, à lui
 * seul (migration 0065, RLS `modeles_proprietaire`).
 *
 * Un seul jeu de fonctions pour les trois domaines — médicament, biologie,
 * imagerie —, parce qu'un modèle, c'est toujours « un nom, des lignes, un
 * commentaire ». Seule la FORME des lignes change, d'où le paramètre de
 * type.
 *
 * Le `domaine` n'est pas facultatif : sans lui, « bilan hépatique »
 * remonterait dans la liste de l'ordonnance de médicaments et s'y
 * chargerait en lignes sans posologie.
 */

export type DomaineModele = "medicament" | "biologie" | "imagerie";

export interface ModeleOrdonnance<L> {
  id: string;
  nom: string;
  lignes: L[];
  /** Remarques (médicament) ou renseignements cliniques (actes). */
  remarques: string;
  /** « à jeun », « urgent » — null pour un modèle de médicaments. */
  options: OptionsActes | null;
}

interface LigneModele {
  id: string;
  nom: string;
  lignes: unknown[] | null;
  remarques: string | null;
  options: OptionsActes | null;
}

export function useModelesOrdonnance<L>(
  domaine: DomaineModele,
  revision: number
): { modeles: ModeleOrdonnance<L>[]; chargement: boolean } {
  const [resultat, setResultat] = useState<{ cle: string; modeles: ModeleOrdonnance<L>[] } | null>(null);
  const cle = `${domaine}:${revision}`;

  useEffect(() => {
    let actif = true;
    creerClientNavigateur()
      .from("modeles_ordonnance")
      .select("id, nom, lignes, remarques, options")
      .eq("domaine", domaine)
      .order("nom")
      .then(({ data }) => {
        if (!actif) return;
        setResultat({
          cle,
          modeles: ((data ?? []) as LigneModele[]).map((m) => ({
            id: m.id,
            nom: m.nom,
            lignes: (m.lignes ?? []) as L[],
            remarques: m.remarques ?? "",
            options: m.options,
          })),
        });
      });
    return () => {
      actif = false;
    };
  }, [cle, domaine]);

  return { modeles: resultat?.cle === cle ? resultat.modeles : [], chargement: resultat?.cle !== cle };
}

/** Enregistre la prescription courante comme modèle ; même nom = mise à jour. */
export async function enregistrerModele<L>(
  domaine: DomaineModele,
  nom: string,
  lignes: L[],
  remarques: string,
  existant?: string,
  options?: OptionsActes | null
): Promise<{ erreur?: string }> {
  const propre = nom.trim();
  if (!propre) return { erreur: "Donnez un nom au modèle." };
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erreur: "Session expirée — reconnectez-vous." };
  const corps = {
    nom: propre,
    lignes,
    remarques: remarques.trim() || null,
    options: options ?? null,
    maj_le: new Date().toISOString(),
  };
  const { error } = existant
    ? await supabase.from("modeles_ordonnance").update(corps).eq("id", existant)
    : await supabase.from("modeles_ordonnance").insert({ ...corps, domaine, medecin_id: auth.user.id });
  return error ? { erreur: error.message } : {};
}

export async function supprimerModele(id: string): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur().from("modeles_ordonnance").delete().eq("id", id);
  return error ? { erreur: error.message } : {};
}
