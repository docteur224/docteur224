"use client";

import { useEffect, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";

/*
 * Grille tarifaire d'un médecin (table `tarifs_medecin`, migration 0023).
 *
 * Un praticien n'a jamais un prix unique : consultation, consultation le
 * dimanche, suivi, urgence… `medecins.tarif_consultation` reste la valeur
 * lue par la recherche, les cartes de résultat et le panneau de
 * réservation, mais elle est désormais DÉRIVÉE du premier tarif de la
 * grille par un trigger : rien à synchroniser ici, et les deux ne peuvent
 * plus diverger.
 */

/** Plafond aligné sur le trigger `tarifs_medecin_limite`. */
export const MAX_TARIFS = 20;

/** Où s'applique une ligne : au cabinet, à domicile, ou les deux. */
export type LieuTarif = "cabinet" | "domicile" | "tous";

export const LIBELLES_LIEU: Record<LieuTarif, string> = {
  cabinet: "Au cabinet",
  domicile: "À domicile",
  tous: "Les deux",
};

export interface TarifMedecin {
  id: string;
  libelle: string;
  montant: number;
  position: number;
  lieu: LieuTarif;
}

interface Ligne {
  id: string;
  libelle: string;
  montant: number;
  position: number;
  lieu: LieuTarif;
}

export function useTarifsMedecin(medecinId: string | undefined): {
  tarifs: TarifMedecin[];
  chargement: boolean;
  recharger: () => void;
} {
  const [etat, setEtat] = useState<{ cle: string; tarifs: TarifMedecin[] }>({ cle: "", tarifs: [] });
  const [version, setVersion] = useState(0);
  const cle = medecinId ? `${medecinId}:${version}` : "";

  useEffect(() => {
    if (!medecinId) return;
    let actif = true;
    (async () => {
      const { data } = await creerClientNavigateur()
        .from("tarifs_medecin")
        .select("id, libelle, montant, position, lieu")
        .eq("medecin_id", medecinId)
        .order("position")
        .order("cree_le");
      if (!actif) return;
      setEtat({ cle, tarifs: (data ?? []) as Ligne[] });
    })();
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medecinId, version]);

  return {
    tarifs: etat.cle === cle ? etat.tarifs : [],
    chargement: !!medecinId && etat.cle !== cle,
    recharger: () => setVersion((v) => v + 1),
  };
}

export async function ajouterTarif(
  libelle: string,
  montant: number,
  position: number,
  lieu: LieuTarif = "cabinet"
): Promise<{ erreur?: string }> {
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { erreur: "Session expirée." };
  const { error } = await supabase
    .from("tarifs_medecin")
    .insert({ medecin_id: auth.user.id, libelle, montant, position, lieu });
  return error ? { erreur: error.message } : {};
}

/**
 * Un UPDATE bloqué par la RLS ne lève aucune erreur : il touche zéro
 * ligne. On le détecte par le `.select()` de retour, sinon l'écran
 * afficherait « enregistré » sur une modification jamais partie.
 */
export async function modifierTarif(
  id: string,
  maj: { libelle?: string; montant?: number; position?: number; lieu?: LieuTarif }
): Promise<{ erreur?: string }> {
  const { data, error } = await creerClientNavigateur()
    .from("tarifs_medecin")
    .update(maj)
    .eq("id", id)
    .select("id");
  if (error) return { erreur: error.message };
  if (!data || data.length === 0) return { erreur: "Modification refusée." };
  return {};
}

export async function supprimerTarif(id: string): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur().from("tarifs_medecin").delete().eq("id", id);
  return error ? { erreur: error.message } : {};
}
