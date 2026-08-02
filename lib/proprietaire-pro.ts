import type { SupabaseClient } from "@supabase/supabase-js";
import { creerClientServeur } from "@/lib/supabase/server";

/*
 * Qui est le professionnel connecté ? Partagé par les routes photo — la
 * photo de profil et la galerie doivent répondre exactement la même chose,
 * sinon un compte pourrait écrire par l'une ce que l'autre lui refuse.
 *
 * Un établissement n'est jamais désigné par un id fourni par l'appelant :
 * il est retrouvé à partir de son gestionnaire.
 */

export interface ProprietairePro {
  supabase: SupabaseClient;
  /** Id de la ligne `medecins` ou `etablissements` visée. */
  id: string;
  type: "medecin" | "etablissement";
  table: "medecins" | "etablissements";
  colonneGalerie: "medecin_id" | "etablissement_id";
}

export async function proprietaireConnecte(): Promise<ProprietairePro | null> {
  const supabase = await creerClientServeur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data: utilisateur } = await supabase
    .from("utilisateurs")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (utilisateur?.role === "medecin") {
    return {
      supabase,
      id: auth.user.id,
      type: "medecin",
      table: "medecins",
      colonneGalerie: "medecin_id",
    };
  }
  if (utilisateur?.role === "etablissement") {
    const { data } = await supabase
      .from("etablissements")
      .select("id")
      .eq("gestionnaire_id", auth.user.id)
      .maybeSingle();
    if (!data) return null;
    return {
      supabase,
      id: data.id,
      type: "etablissement",
      table: "etablissements",
      colonneGalerie: "etablissement_id",
    };
  }
  return null;
}
