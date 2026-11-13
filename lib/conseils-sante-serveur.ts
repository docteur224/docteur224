/**
 * Lecture des conseils santé côté serveur (pages publiques).
 *
 * Rendu serveur, lecture anonyme : le site public est servi à des visiteurs
 * non connectés, et la RLS (0091) n'ouvre en lecture que les fiches publiées.
 *
 * Toute erreur de lecture — table absente avant la migration, réseau — bascule
 * sur `CONSEILS_DEFAUT` : la page ne doit jamais tomber en panne pour du
 * contenu éditorial. On ne distingue pas « vide » d'« en panne » : dans les
 * deux cas, montrer les fiches d'origine vaut mieux qu'un écran blanc.
 */

import { creerClientServeur } from "@/lib/supabase/server";
import {
  COLONNES_CONSEIL,
  CONSEILS_DEFAUT,
  type ConseilSante,
} from "@/lib/conseils-sante";

export async function lireConseilsPublies(): Promise<ConseilSante[]> {
  try {
    const supabase = await creerClientServeur();
    const { data, error } = await supabase
      .from("conseils_sante")
      .select(COLONNES_CONSEIL)
      .eq("publie", true)
      .order("position", { ascending: true })
      .order("cree_le", { ascending: false });
    if (error) throw error;
    const liste = (data ?? []) as ConseilSante[];
    return liste.length ? liste : CONSEILS_DEFAUT;
  } catch {
    return CONSEILS_DEFAUT;
  }
}

export async function lireConseilParSlug(slug: string): Promise<ConseilSante | null> {
  try {
    const supabase = await creerClientServeur();
    const { data, error } = await supabase
      .from("conseils_sante")
      .select(COLONNES_CONSEIL)
      .eq("slug", slug)
      .eq("publie", true)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as ConseilSante;
  } catch {
    // On retombe sur le repli ci-dessous.
  }
  return CONSEILS_DEFAUT.find((c) => c.slug === slug) ?? null;
}
