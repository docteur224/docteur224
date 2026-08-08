import type { SupabaseClient } from "@supabase/supabase-js";
import { palierPourType } from "@/lib/types-etablissement";

/*
 * Règles d'ouverture de l'abonnement à l'inscription professionnelle.
 *
 * Partagées par l'étape « Abonnement » du parcours et par la finalisation :
 * les deux écrivent dans `abonnements`, elles ne peuvent pas diverger sur ce
 * que le professionnel doit.
 *
 * Ce qui vient du client : la FORMULE et la PÉRIODE, c'est-à-dire ce qu'il
 * choisit d'acheter. Ce qui n'en vient jamais : le `statut` et la `date_fin`,
 * qui disent ce qu'il a payé — sinon n'importe qui s'offrirait un abonnement
 * actif jusqu'en 2099 depuis la console de son navigateur (migration 0019).
 */

const JOUR_MS = 86_400_000;
const versISO = (d: Date) => d.toISOString().slice(0, 10);

/** Formules qu'un médecin peut choisir. Un établissement ne choisit pas : son palier découle du type de structure. */
export const FORMULES_MEDECIN = ["standard", "premium"] as const;
export type FormuleMedecin = (typeof FORMULES_MEDECIN)[number];
export const PERIODES = ["mensuel", "annuel"] as const;
export type Periode = (typeof PERIODES)[number];

/** Paliers facturés aux structures, du plus léger au plus lourd. */
export const FORMULES_ETABLISSEMENT = ["structure", "cabinet", "clinique", "hopital"] as const;
export type FormuleEtablissement = (typeof FORMULES_ETABLISSEMENT)[number];

/**
 * Palier facturé à une structure, déduit du type saisi dans sa fiche.
 *
 * La correspondance est déclarée type par type dans `lib/types-etablissement`
 * — elle n'est plus devinée par recherche de sous-chaîne, qui classait
 * « Polyclinique » en palier clinique par coïncidence et tout type inconnu en
 * palier cabinet.
 */
export function formuleEtablissement(typeEtablissement: string | null): FormuleEtablissement {
  return palierPourType(typeEtablissement);
}

export interface EtatGratuite {
  /** Phase pilote : personne n'est facturé, et l'essai ne s'applique pas. */
  periodeGratuite: boolean;
  /** Essai à l'inscription, seulement si la phase pilote est terminée. */
  essaiGratuit: boolean;
  essaiJours: number;
}

/**
 * Lit les réglages de /espace-admin/abonnements pour une formule donnée.
 * `gratuit_jusqua` d'un tarif vaut période gratuite tant qu'elle court.
 */
export async function lireGratuite(
  admin: SupabaseClient,
  formule: string
): Promise<EtatGratuite> {
  const [{ data: reglages }, { data: tarif }] = await Promise.all([
    admin.from("parametres_plateforme").select("cle, valeur").in("cle", ["periode_gratuite", "essai_gratuit"]),
    admin.from("tarifs_plateforme").select("essai_jours, quota_sms, gratuit_jusqua").eq("formule", formule).maybeSingle(),
  ]);
  const actif = (cle: string) => (reglages ?? []).find((r) => r.cle === cle)?.valeur === true;
  const gratuitJusqua = tarif?.gratuit_jusqua ? new Date(tarif.gratuit_jusqua) : null;
  return {
    periodeGratuite: actif("periode_gratuite") || (gratuitJusqua !== null && gratuitJusqua > new Date()),
    essaiGratuit: actif("essai_gratuit"),
    essaiJours: tarif?.essai_jours ?? 30,
  };
}

export interface OuvertureAbonnement {
  statut: "essai" | "expire";
  dateFin: string | null;
  quotaSms: number;
}

/**
 * Ordre de précédence :
 *   1. période gratuite de lancement → essai sans échéance
 *   2. essai gratuit à l'inscription → essai de `essai_jours` jours
 *   3. aucun des deux                → abonnement à régler (expiré d'emblée)
 * Le cas 3 est l'état exact qu'un encaissement fera basculer en « actif ».
 */
export async function ouvrirAbonnement(
  admin: SupabaseClient,
  formule: string
): Promise<OuvertureAbonnement> {
  const { data: tarif } = await admin
    .from("tarifs_plateforme")
    .select("quota_sms")
    .eq("formule", formule)
    .maybeSingle();
  const gratuite = await lireGratuite(admin, formule);
  if (gratuite.periodeGratuite) {
    return { statut: "essai", dateFin: null, quotaSms: tarif?.quota_sms ?? 0 };
  }
  if (gratuite.essaiGratuit) {
    return {
      statut: "essai",
      dateFin: versISO(new Date(Date.now() + gratuite.essaiJours * JOUR_MS)),
      quotaSms: tarif?.quota_sms ?? 0,
    };
  }
  return { statut: "expire", dateFin: versISO(new Date()), quotaSms: tarif?.quota_sms ?? 0 };
}
