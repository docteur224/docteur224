/*
 * Petite mémoire locale de la bannière d'installation. Tout est protégé :
 * `localStorage` peut lever (navigation privée, cookies bloqués) ou revenir
 * vide — la PWA doit rester correcte dans tous les cas.
 */

const CLE_REFUS = "d224-pwa-refus"; // horodatage du dernier « Plus tard »
const CLE_INSTALLEE = "d224-pwa-installee"; // installée une fois → ne plus proposer

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

/** Marque l'application comme installée (définitif). */
export function memoriserInstallee(): void {
  ecrire(CLE_INSTALLEE, "1");
}

/** Vrai si l'application a déjà été installée au moins une fois. */
export function dejaInstallee(): boolean {
  return lire(CLE_INSTALLEE) === "1";
}
