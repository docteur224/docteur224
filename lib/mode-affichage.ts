/**
 * Mode d'affichage clair / sombre — GLOBAL au site, indépendant de la charte.
 *
 * Deux préférences distinctes, persistées séparément :
 *   • la CHARTE (couleurs du compte, voir lib/charte-stockage) ;
 *   • le MODE (clair/sombre, ici) — clé différente, mécanisme différent.
 * Changer l'un ne touche jamais l'autre.
 *
 * Pas de directive « use client » : ce module est lu par le script serveur
 * ModeLocal (qui n'a besoin que de la clé) comme par le bouton client
 * BasculeMode. Les fonctions touchant au navigateur ne s'appellent que côté
 * client.
 *
 * La vérité d'affichage est l'attribut `data-theme` sur <html>, posé dès le
 * chargement par ModeLocal (avant la première peinture, donc sans
 * clignotement). `localStorage` ne retient QUE les choix explicites : son
 * absence signifie « suivre le système », conformément à l'ordre de
 * résolution préférence explicite → système → clair.
 */

export const CLE_MODE = "docteur224.mode";

export type Mode = "light" | "dark";

/** Événement interne : le stockage natif n'émet rien pour l'onglet courant. */
const EVENEMENT = "docteur224:mode";

export function prefSysteme(): Mode {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

/** Le choix explicite enregistré, ou null si l'utilisateur suit le système. */
export function modeStocke(): Mode | null {
  try {
    const v = localStorage.getItem(CLE_MODE);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

/** Ce qui doit réellement s'afficher : choix explicite, sinon système. */
export function modeEffectif(): Mode {
  return modeStocke() ?? prefSysteme();
}

/** Pose le mode sur le document déjà affiché. */
export function appliquerMode(m: Mode): void {
  document.documentElement.setAttribute("data-theme", m);
}

/** Enregistre un choix explicite, l'applique et prévient les abonnés. */
export function definirMode(m: Mode): void {
  try {
    localStorage.setItem(CLE_MODE, m);
  } catch {
    /* stockage indisponible : le mode vaut pour la session */
  }
  appliquerMode(m);
  window.dispatchEvent(new Event(EVENEMENT));
}

export function basculerMode(): void {
  definirMode(modeEffectif() === "dark" ? "light" : "dark");
}

/* ---- Abonnement pour useSyncExternalStore ------------------------------ */

export function sAbonnerMode(rappel: () => void): () => void {
  const mql = (() => {
    try {
      return window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return null;
    }
  })();
  window.addEventListener("storage", rappel);
  window.addEventListener(EVENEMENT, rappel);
  mql?.addEventListener?.("change", rappel);
  return () => {
    window.removeEventListener("storage", rappel);
    window.removeEventListener(EVENEMENT, rappel);
    mql?.removeEventListener?.("change", rappel);
  };
}

/**
 * Instantané = l'attribut posé sur <html>. On lit le DOM et non le stockage :
 * c'est lui qui reflète aussi le repli système, et React compare par identité
 * de chaîne (pas d'objet reconstruit à chaque lecture).
 */
export function instantaneMode(): Mode {
  const v = document.documentElement.getAttribute("data-theme");
  return v === "dark" ? "dark" : "light";
}

/** Au rendu serveur, pas de DOM : on affiche l'état clair (repli neutre). */
export const instantaneModeServeur = (): Mode => "light";
