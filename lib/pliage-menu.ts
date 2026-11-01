/**
 * Pliage de la barre latérale — préférence GLOBALE aux cinq espaces connectés
 * (patient, médecin, assistant, établissement, administrateur).
 *
 * Même mécanique que le mode clair/sombre (lib/mode-affichage) et pour les
 * mêmes raisons : la vérité d'affichage est l'attribut `data-sidebar` sur
 * <html>, posé dès le chargement par le script PliageLocal (avant la première
 * peinture, donc sans clignotement de la largeur). `localStorage` ne retient
 * que le choix explicite ; son absence signifie « déplié », l'état par défaut
 * demandé (barre identique à l'existant).
 *
 * Pas de directive « use client » : le script serveur PliageLocal n'a besoin
 * que de la clé. Les fonctions touchant au navigateur ne s'appellent que côté
 * client.
 */

export const CLE_PLIAGE = "docteur224.menu";

export type EtatPliage = "deplie" | "plie";

/** Événement interne : le stockage natif n'émet rien pour l'onglet courant. */
const EVENEMENT = "docteur224:pliage";

/** Le choix explicite enregistré, ou null si l'utilisateur n'a rien choisi. */
export function pliageStocke(): EtatPliage | null {
  try {
    const v = localStorage.getItem(CLE_PLIAGE);
    return v === "plie" || v === "deplie" ? v : null;
  } catch {
    return null;
  }
}

/** Ce qui doit réellement s'afficher : choix explicite, sinon déplié. */
export function pliageEffectif(): EtatPliage {
  return pliageStocke() ?? "deplie";
}

/** Pose l'état sur le document déjà affiché. */
export function appliquerPliage(e: EtatPliage): void {
  document.documentElement.setAttribute("data-sidebar", e);
}

/** Enregistre un choix explicite, l'applique et prévient les abonnés. */
export function definirPliage(e: EtatPliage): void {
  try {
    localStorage.setItem(CLE_PLIAGE, e);
  } catch {
    /* stockage indisponible : le choix vaut pour la session */
  }
  appliquerPliage(e);
  window.dispatchEvent(new Event(EVENEMENT));
}

export function basculerPliage(): void {
  definirPliage(pliageEffectif() === "plie" ? "deplie" : "plie");
}

/* ---- Abonnement pour useSyncExternalStore ------------------------------ */

export function sAbonnerPliage(rappel: () => void): () => void {
  window.addEventListener("storage", rappel);
  window.addEventListener(EVENEMENT, rappel);
  return () => {
    window.removeEventListener("storage", rappel);
    window.removeEventListener(EVENEMENT, rappel);
  };
}

/**
 * Instantané = l'attribut posé sur <html>. On lit le DOM et non le stockage :
 * React compare par identité de chaîne (pas d'objet reconstruit à chaque
 * lecture).
 */
export function instantanePliage(): EtatPliage {
  const v = document.documentElement.getAttribute("data-sidebar");
  return v === "plie" ? "plie" : "deplie";
}

/** Au rendu serveur, pas de DOM : on affiche l'état déplié (défaut demandé). */
export const instantanePliageServeur = (): EtatPliage => "deplie";
