"use client";

/**
 * La charte rattachée au compte (table `preferences_affichage`).
 *
 * C'est ici la vérité ; `charte-stockage` n'en garde qu'une avance locale.
 * Deux raisons de ne pas lire la base avant d'afficher : les pages des
 * espaces connectés sont servies statiques — le serveur ignore qui les
 * regarde —, et une requête avant le premier affichage montrerait chaque
 * page en bleu d'origine le temps de la réponse. Le cache répond tout de
 * suite, la base le corrige juste après s'il se trompe.
 *
 * Le décalage se voit donc une fois : à la première ouverture sur un
 * appareil neuf, où le cache est vide. Les suivantes sont immédiates.
 */

import { creerClientNavigateur } from "@/lib/supabase/client";
import { normaliserHex } from "@/lib/charte-couleurs";
import {
  analyser, compteEnCache, effacerCharte, enregistrerCharte, estCharteDefaut,
  instantane, type Charte,
} from "@/lib/charte-stockage";

const TABLE = "preferences_affichage";

/** La charte du compte connecté, ou null s'il s'en tient à celle d'origine. */
export async function lireCharteDuCompte(): Promise<
  { compte: string; charte: Charte | null } | null
> {
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data } = await supabase
    .from(TABLE)
    .select("charte_principale, charte_accent")
    .eq("utilisateur_id", auth.user.id)
    .maybeSingle();

  const principale = normaliserHex(data?.charte_principale ?? "");
  const accent = normaliserHex(data?.charte_accent ?? "");
  return {
    compte: auth.user.id,
    charte: principale && accent ? { principale, accent } : null,
  };
}

/**
 * Enregistre la charte du compte, et met le cache à jour dans la foulée.
 *
 * Revenir aux couleurs d'origine efface la ligne plutôt que d'y écrire les
 * valeurs par défaut : si la charte Docteur 224 évolue un jour, les comptes
 * qui n'ont rien choisi doivent la suivre, pas rester figés sur l'ancienne.
 */
export async function ecrireCharteDuCompte(charte: Charte | null): Promise<boolean> {
  const supabase = creerClientNavigateur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;
  const compte = auth.user.id;

  if (!charte || estCharteDefaut(charte)) {
    const { error } = await supabase.from(TABLE).delete().eq("utilisateur_id", compte);
    if (error) return false;
    effacerCharte();
    return true;
  }

  const principale = normaliserHex(charte.principale);
  const accent = normaliserHex(charte.accent);
  if (!principale || !accent) return false;

  const { error } = await supabase.from(TABLE).upsert(
    {
      utilisateur_id: compte,
      charte_principale: principale,
      charte_accent: accent,
      maj_le: new Date().toISOString(),
    },
    { onConflict: "utilisateur_id" },
  );
  if (error) return false;

  enregistrerCharte({ principale, accent }, compte);
  return true;
}

/**
 * Remet le cache d'accord avec le compte. Appelé à l'ouverture de chaque
 * espace : c'est ce qui fait suivre la charte d'un appareil à l'autre, et ce
 * qui évite qu'un second compte ouvert sur le même navigateur hérite des
 * couleurs du premier.
 */
export async function reconcilier(): Promise<void> {
  const lu = await lireCharteDuCompte();
  if (!lu) return; // personne de connecté : on ne touche à rien

  const brut = instantane();
  const enCache = analyser(brut);
  const memeCompte = compteEnCache(brut) === lu.compte;
  const memeCharte =
    memeCompte &&
    enCache?.principale === lu.charte?.principale &&
    enCache?.accent === lu.charte?.accent;
  if (memeCharte || (memeCompte && !enCache && !lu.charte)) return;

  if (lu.charte) enregistrerCharte(lu.charte, lu.compte);
  else effacerCharte();
}

/**
 * À la déconnexion : la charte quitte l'écran avec son propriétaire. Sans
 * cela, la page de connexion et le compte suivant garderaient ses couleurs.
 * Seule l'avance locale est effacée — le choix reste au compte, et revient
 * à la prochaine connexion.
 */
export const oublierCharte = effacerCharte;
