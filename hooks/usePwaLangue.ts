"use client";

import { useSyncExternalStore } from "react";
import { detecterLangue, type LanguePwa } from "@/lib/pwa/i18n";

/*
 * Langue des surfaces PWA, lue comme un état externe du navigateur (sans effet
 * ni setState) : `useSyncExternalStore` renvoie « fr » au rendu serveur puis la
 * langue détectée côté client après hydratation. La langue ne change pas en
 * direct, d'où un abonnement vide.
 */
const souscrire = () => () => {};
const snapshotServeur = (): LanguePwa => "fr";

export function usePwaLangue(): LanguePwa {
  return useSyncExternalStore(souscrire, detecterLangue, snapshotServeur);
}
