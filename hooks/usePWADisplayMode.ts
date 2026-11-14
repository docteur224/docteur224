"use client";

import { useSyncExternalStore } from "react";

/*
 * Indique si l'application tourne en mode « installée » (standalone), soit via
 * la media query `display-mode: standalone`, soit via `navigator.standalone`
 * (propre à iOS/Safari). Sert à NE PAS proposer l'installation quand on est
 * déjà dans l'app installée.
 *
 * Lu via `useSyncExternalStore` (booléen stable) avec abonnement réel au
 * changement de `display-mode`.
 */

function estStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const parMedia = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const iOSStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const androidApp =
    typeof document !== "undefined" && document.referrer.startsWith("android-app://");
  return parMedia || iOSStandalone || androidApp;
}

function souscrire(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia("(display-mode: standalone)");
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

export function usePWADisplayMode(): { standalone: boolean; prete: boolean } {
  const standalone = useSyncExternalStore(souscrire, estStandalone, () => false);
  return { standalone, prete: true };
}
