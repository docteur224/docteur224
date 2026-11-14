/*
 * Petite mémoire locale de la bannière d'installation. Tout est protégé :
 * `localStorage` peut lever (navigation privée, cookies bloqués) ou revenir
 * vide — la PWA doit rester correcte dans tous les cas.
 */

const CLE_REFUS = "d224-pwa-refus"; // horodatage du dernier « Plus tard »

/* Important : on NE mémorise PAS « déjà installée » de façon permanente. La
   désinstallation d'une PWA n'efface pas le localStorage du site : un tel
   drapeau empêcherait de reproposer l'installation après une désinstallation.
   Le fait de tourner en mode installé est déjà détecté en direct par
   `display-mode: standalone` (voir usePWADisplayMode), ce qui suffit. */

/** Durée du silence après un refus : 2 jours. */
const TTL_REFUS_MS = 2 * 24 * 60 * 60 * 1000;

function lire(cle: string): string | null {
  try {
    return window.localStorage.getItem(cle);
  } catch {
    return null;
  }
}

function ecrire(cle: string, valeur: string): void {
  try {
    window.localStorage.setItem(cle, valeur);
  } catch {
    // Silencieux : l'absence de mémoire ne doit jamais casser l'affichage.
  }
}

/** Mémorise un refus « Plus tard » (horodaté). */
export function memoriserRefus(): void {
  ecrire(CLE_REFUS, String(Date.now()));
}

/** Vrai si l'utilisateur a refusé il y a moins de 2 jours. */
export function refusRecemment(): boolean {
  const brut = lire(CLE_REFUS);
  if (!brut) return false;
  const quand = Number(brut);
  if (!Number.isFinite(quand)) return false;
  return Date.now() - quand < TTL_REFUS_MS;
}

/** Efface la mémoire du refus (ex. après installation ou pour un test). */
export function oublierRefus(): void {
  try {
    window.localStorage.removeItem(CLE_REFUS);
  } catch {
    // Silencieux.
  }
}
