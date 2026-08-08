"use client";

import { useEffect, useState } from "react";
import { creerClientNavigateur } from "@/lib/supabase/client";

/*
 * Règlement d'un abonnement (migration 0040).
 *
 * Ce module ne calcule aucun montant et n'active aucun abonnement : il
 * appelle les fonctions serveur. Le prix est relu en base par
 * `creer_paiement_abonnement`, et seul l'admin Finance confirme un versement.
 * Tout ce qui est écrit ici est donc une DEMANDE, jamais une acquisition.
 */

export type CodeMoyen = "orange_money" | "mtn_momo" | "carte";
export type StatutPaiement = "en_attente" | "confirme" | "refuse" | "annule";

export interface MoyenPaiement {
  code: CodeMoyen;
  libelle: string;
  /** Numéro marchand à créditer. Vide tant que l'admin ne l'a pas saisi. */
  numeroMarchand: string;
  codeUssd: string;
  instructions: string;
}

export interface Paiement {
  id: string;
  formule: string;
  periode: string;
  montantGnf: number;
  moyen: CodeMoyen;
  /** Numéro Mobile Money déclaré comme payeur, chiffres seuls. */
  numeroPayeur: string;
  reference: string;
  referenceOperateur: string;
  statut: StatutPaiement;
  motifRefus: string;
  creeLe: string;
}

/** Habillage d'un moyen de paiement : couleur de marque et pictogramme. */
export const HABILLAGE_MOYEN: Record<CodeMoyen, { icone: string; teinte: string; bordure: string }> = {
  orange_money: { icone: "🟠", teinte: "#FF6B00", bordure: "#FFD9B8" },
  mtn_momo: { icone: "🟡", teinte: "#B8960B", bordure: "#FFE9A3" },
  carte: { icone: "💳", teinte: "#1E5F9E", bordure: "#C3DDF5" },
};

/** Les Mobile Money se règlent par USSD ; la carte passe par un lien envoyé. */
export const estMobileMoney = (code: CodeMoyen) => code !== "carte";

export const LIBELLES_STATUT: Record<StatutPaiement, string> = {
  en_attente: "En attente de confirmation",
  confirme: "Confirmé",
  refuse: "Non confirmé",
  annule: "Annulé",
};

function versPaiement(l: Record<string, unknown>): Paiement {
  return {
    id: l.id as string,
    formule: l.formule as string,
    periode: l.periode as string,
    montantGnf: l.montant_gnf as number,
    moyen: l.moyen as CodeMoyen,
    numeroPayeur: (l.numero_payeur as string) ?? "",
    reference: l.reference as string,
    referenceOperateur: (l.reference_operateur as string) ?? "",
    statut: l.statut as StatutPaiement,
    motifRefus: (l.motif_refus as string) ?? "",
    creeLe: l.cree_le as string,
  };
}

/**
 * Ce qu'il faut pour payer : les moyens réellement ouverts, l'historique du
 * professionnel, et l'état de gratuité.
 *
 * La gratuité vient de la route d'inscription, seul endroit qui applique
 * l'ordre de précédence « période gratuite > essai > à régler ». La relire
 * ici en interrogeant `parametres_plateforme` reproduirait cette règle une
 * seconde fois, et les deux finiraient par diverger.
 */
export function usePaiements(): {
  moyens: MoyenPaiement[];
  paiements: Paiement[];
  /** Demande en cours, s'il y en a une : il n'en existe jamais deux. */
  enAttente: Paiement | null;
  /** Vrai tant que rien n'est facturé — le paiement n'a alors pas lieu d'être. */
  gratuit: boolean;
  chargement: boolean;
  recharger: () => void;
} {
  const [moyens, setMoyens] = useState<MoyenPaiement[]>([]);
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [gratuit, setGratuit] = useState(false);
  const [charge, setCharge] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let actif = true;
    (async () => {
      const supabase = creerClientNavigateur();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user || !actif) return;

      const [{ data: comptes }, { data: reglages }, { data: lignes }, reponse] = await Promise.all([
        supabase.from("comptes_encaissement").select("*").order("ordre"),
        supabase
          .from("parametres_plateforme")
          .select("cle, valeur")
          .in("cle", ["orange_money", "mtn_momo", "carte_bancaire"]),
        supabase
          .from("paiements_abonnement")
          .select("*")
          .eq("titulaire_id", auth.user.id)
          .order("cree_le", { ascending: false })
          .limit(20),
        fetch("/api/inscription/abonnement").catch(() => null),
      ]);
      if (!actif) return;

      // Un moyen n'est proposé que si l'administration l'a ouvert : la clé de
      // réglage est la même que celle des interrupteurs d'/espace-admin/abonnements.
      const ouvert = (code: string) => {
        const cle = code === "carte" ? "carte_bancaire" : code;
        return (reglages ?? []).find((r) => r.cle === cle)?.valeur !== false;
      };
      setMoyens(
        (comptes ?? [])
          .filter((c) => ouvert(c.code))
          .map((c) => ({
            code: c.code as CodeMoyen,
            libelle: c.libelle,
            numeroMarchand: c.numero_marchand ?? "",
            codeUssd: c.code_ussd ?? "",
            instructions: c.instructions ?? "",
          }))
      );
      setPaiements((lignes ?? []).map(versPaiement));

      if (reponse?.ok) {
        const corps = await reponse.json().catch(() => null);
        const g = corps?.gratuite;
        setGratuit(!!g && (g.periodeGratuite || g.essaiGratuit));
      }
      setCharge(true);
    })();
    return () => {
      actif = false;
    };
  }, [version]);

  return {
    moyens,
    paiements,
    enAttente: paiements.find((p) => p.statut === "en_attente") ?? null,
    gratuit,
    chargement: !charge,
    recharger: () => setVersion((v) => v + 1),
  };
}

/**
 * Ouvre une demande de paiement. Le montant renvoyé est celui relu en base :
 * l'écran doit afficher CELUI-LÀ, et non le prix qu'il avait calculé de son
 * côté — c'est la somme que le professionnel va réellement verser.
 */
export async function demanderPaiement(choix: {
  formule: string;
  periode: string;
  moyen: CodeMoyen;
  numero?: string;
}): Promise<{ paiement?: Paiement; erreur?: string }> {
  const { data, error } = await creerClientNavigateur().rpc("creer_paiement_abonnement", {
    p_formule: choix.formule,
    p_periode: choix.periode,
    p_moyen: choix.moyen,
    p_numero: choix.numero ?? null,
  });
  if (error) return { erreur: error.message };
  const l = data as Record<string, unknown>;
  return {
    paiement: {
      id: l.id as string,
      formule: l.formule as string,
      periode: l.periode as string,
      montantGnf: l.montant_gnf as number,
      moyen: l.moyen as CodeMoyen,
      numeroPayeur: choix.numero ?? "",
      reference: l.reference as string,
      referenceOperateur: "",
      statut: "en_attente",
      motifRefus: "",
      creeLe: new Date().toISOString(),
    },
  };
}

/** Le professionnel recopie l'identifiant du SMS de l'opérateur. */
export async function declarerReference(id: string, reference: string): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur().rpc("declarer_reference_paiement", {
    p_id: id,
    p_reference: reference,
  });
  return error ? { erreur: error.message } : {};
}

export async function annulerPaiement(id: string): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur().rpc("annuler_paiement_abonnement", {
    p_id: id,
  });
  return error ? { erreur: error.message } : {};
}

/* ===== Recharges SMS (migration 0041) ===== */

/**
 * Même modèle que l'abonnement : le client désigne un pack, le serveur relit
 * les segments et le prix. `achats_sms` n'accepte plus d'insertion directe —
 * elle laissait déclarer 10 000 segments à 1 GNF.
 */
export async function demanderRecharge(choix: {
  packId: string;
  moyen: CodeMoyen;
  numero?: string;
}): Promise<{ paiement?: Paiement; erreur?: string }> {
  const { data, error } = await creerClientNavigateur().rpc("creer_achat_sms", {
    p_pack_id: choix.packId,
    p_moyen: choix.moyen,
    p_numero: choix.numero ?? null,
  });
  if (error) return { erreur: error.message };
  const l = data as Record<string, unknown>;
  return {
    paiement: {
      id: l.id as string,
      formule: l.nom as string,
      periode: "",
      montantGnf: l.montant_gnf as number,
      moyen: l.moyen as CodeMoyen,
      numeroPayeur: choix.numero ?? "",
      reference: l.reference as string,
      referenceOperateur: "",
      statut: "en_attente",
      motifRefus: "",
      creeLe: new Date().toISOString(),
    },
  };
}

export async function declarerReferenceRecharge(
  id: string,
  reference: string
): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur().rpc("declarer_reference_achat", {
    p_id: id,
    p_reference: reference,
  });
  return error ? { erreur: error.message } : {};
}

export async function annulerRecharge(id: string): Promise<{ erreur?: string }> {
  const { error } = await creerClientNavigateur().rpc("annuler_achat_sms", { p_id: id });
  return error ? { erreur: error.message } : {};
}
