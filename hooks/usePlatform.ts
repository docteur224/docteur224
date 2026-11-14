"use client";

import { useSyncExternalStore } from "react";

/*
 * Détection de plateforme, utile pour choisir le bon parcours d'installation :
 * Android/Chromium a `beforeinstallprompt` (bannière native pilotable), iOS/
 * Safari ne l'a pas et exige un guide « Partager → Sur l'écran d'accueil ».
 *
 * Lue comme un état externe du navigateur via `useSyncExternalStore` (sans
 * effet ni setState) : « non prête » au rendu serveur, résultat réel après
 * hydratation. La valeur est mise en cache (objet stable) pour ne pas boucler.
 */

export interface Plateforme {
  estIOS: boolean;
  estAndroid: boolean;
  estSafari: boolean;
  /** Détection terminée (faux au rendu serveur / avant hydratation). */
  prete: boolean;
}

const SERVEUR: Plateforme = { estIOS: false, estAndroid: false, estSafari: false, prete: false };

let cache: Plateforme | null = null;

function snapshot(): Plateforme {
  if (cache) return cache;
  if (typeof navigator === "undefined") return SERVEUR;
  const ua = navigator.userAgent || "";
  // iPadOS récent se déclare « Macintosh » mais a un écran tactile.
  const iPadOS =
    /Macintosh/.test(ua) && typeof document !== "undefined" && "ontouchend" in document;
  const estIOS = /iPad|iPhone|iPod/.test(ua) || iPadOS;
  const estAndroid = /Android/.test(ua);
  const estSafari = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua);
  cache = { estIOS, estAndroid, estSafari, prete: true };
  return cache;
}

const souscrire = () => () => {};

export function usePlatform(): Plateforme {
  return useSyncExternalStore(souscrire, snapshot, () => SERVEUR);
}
