"use client";

/**
 * La charte du site public, côté base (table `charte_publique`).
 *
 * C'est ici la vérité ; `charte-publique` n'en garde qu'une avance locale.
 * Lecture anonyme (le site public est servi à des visiteurs non connectés),
 * écriture réservée à l'administration habilitée aux « Paramètres ».
 *
 * La campagne est GLOBALE (la même pour tout le monde) : on la lit une fois
 * par chargement de page, on la range en cache, et les navigations internes
 * suivantes repartent du cache. Une campagne activée pendant qu'un visiteur
 * navigue n'apparaît qu'au prochain chargement — sans conséquence pour un
 * habillage purement décoratif.
 */

import { creerClientNavigateur } from "@/lib/supabase/client";
import { normaliserHex } from "@/lib/charte-couleurs";
import {
  analyser, appliquer, effacerCache, enregistrerCharte, instantane,
  type ChartePublique,
} from "@/lib/charte-publique";

const TABLE = "charte_publique";

/**
 * La charte publique enregistrée, ou null si le site s'en tient à l'origine.
 *
 * Lève en cas d'erreur de lecture, pour que la réconciliation DISTINGUE
 * « pas de campagne » (on nettoie) d'un échec réseau passager (on garde
 * l'avance locale) : sans quoi un simple hoquet effacerait une campagne en
 * cours jusqu'au rechargement.
 */
export async function lireChartePublique(): Promise<ChartePublique | null> {
  const supabase = creerClientNavigateur();
  const { data, error } = await supabase
    .from(TABLE)
    .select("principale, accent, debut, fin")
    .eq("id", "site")
    .maybeSingle();
  if (error) throw error;

  const principale = normaliserHex(data?.principale ?? "");
  const accent = normaliserHex(data?.accent ?? "");
  if (!principale || !accent) return null;
  return { principale, accent, debut: data?.debut ?? null, fin: data?.fin ?? null };
}

/**
 * Enregistre (ou efface) la charte publique, et met le cache à jour.
 *
 * Revenir aux couleurs d'origine efface la ligne plutôt que d'y écrire des
 * valeurs par défaut : si la charte Docteur 224 évolue, le site doit la
 * suivre (même intention qu'en 0070). Réservé à l'admin par la RLS.
 */
export async function ecrireChartePublique(charte: ChartePublique | null): Promise<boolean> {
  const supabase = creerClientNavigateur();

  if (!charte) {
    const { error } = await supabase.from(TABLE).delete().eq("id", "site");
    if (error) return false;
    effacerCache();
    return true;
  }

  const principale = normaliserHex(charte.principale);
  const accent = normaliserHex(charte.accent);
  if (!principale || !accent) return false;

  const { error } = await supabase.from(TABLE).upsert(
    {
      id: "site",
      principale, accent,
      debut: charte.debut, fin: charte.fin,
      maj_le: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) return false;

  // On met le cache à jour, PAS la page affichée : cet écran vit dans un
  // espace connecté, où la charte publique ne doit pas apparaître. Elle sera
  // posée par `SuivreChartePublique` dès qu'on passe sur une page publique.
  enregistrerCharte({ principale, accent, debut: charte.debut, fin: charte.fin });
  return true;
}

/**
 * Remet le cache d'accord avec la base, puis repose la charte sur la page.
 * Appelée à l'ouverture d'une page publique (voir `SuivreChartePublique`).
 */
export async function reconcilierChartePublique(): Promise<void> {
  const distante = await lireChartePublique();
  if (distante) enregistrerCharte(distante);
  else effacerCache();
  appliquer(distante);
}

/** Relit le cache local (pour une pose immédiate avant la réconciliation). */
export function chartePubliqueEnCache(): ChartePublique | null {
  return analyser(instantane());
}
