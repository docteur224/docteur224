/**
 * Où se range la charte choisie — version provisoire, dans le navigateur.
 *
 * Pas de directive « use client » : ce module n'est pas un composant, et le
 * script de démarrage — rendu, lui, côté serveur — a besoin d'y lire la clé
 * de stockage. La marquer client ferait de ce script une frontière client,
 * donc un rendu après coup, donc le clignotement qu'on cherche à éviter.
 * Les fonctions ci-dessous touchent au navigateur et ne s'appellent que
 * depuis un composant client.
 *
 * Volontairement réduit à quatre fonctions : quand la préférence passera en
 * base, c'est ce fichier seul qui change, pas l'écran de réglage.
 *
 * On range aussi le CSS déjà calculé à côté des deux couleurs. C'est ce qui
 * permet au petit script de démarrage de reposer la charte avant le premier
 * affichage sans embarquer le moteur de calcul, et donc sans faire clignoter
 * la page au bleu d'origine à chaque changement de page.
 */

import { CHARTE_DEFAUT, charteVersCss, normaliserHex } from "@/lib/charte-couleurs";

export const CLE_CHARTE = "docteur224.charte";
/** Identifiant de la balise de style posée par le script de démarrage. */
export const ID_STYLE = "charte-espace";

export type Charte = { principale: string; accent: string };

export const estCharteDefaut = (c: Charte) =>
  normaliserHex(c.principale) === CHARTE_DEFAUT.principale &&
  normaliserHex(c.accent) === CHARTE_DEFAUT.accent;

/** Événement interne : le stockage natif n'en émet pas pour l'onglet courant. */
const EVENEMENT = "docteur224:charte";

/**
 * Abonnement et instantané pour `useSyncExternalStore`. On expose la chaîne
 * brute et non l'objet analysé : React compare les instantanés par identité,
 * et un objet reconstruit à chaque lecture relancerait le rendu sans fin.
 */
export function sAbonner(rappel: () => void): () => void {
  window.addEventListener("storage", rappel);
  window.addEventListener(EVENEMENT, rappel);
  return () => {
    window.removeEventListener("storage", rappel);
    window.removeEventListener(EVENEMENT, rappel);
  };
}

export function instantane(): string | null {
  try { return localStorage.getItem(CLE_CHARTE); } catch { return null; }
}

/** Au rendu serveur il n'y a pas de stockage : c'est la charte d'origine. */
export const instantaneServeur = (): string | null => null;

export function analyser(brut: string | null): Charte | null {
  try {
    if (!brut) return null;
    const o = JSON.parse(brut);
    const principale = normaliserHex(o?.principale ?? "");
    const accent = normaliserHex(o?.accent ?? "");
    return principale && accent ? { principale, accent } : null;
  } catch {
    // Navigation privée, stockage refusé, contenu corrompu : on retombe sur
    // la charte Docteur 224 plutôt que de casser l'écran.
    return null;
  }
}

export function enregistrerCharte(charte: Charte): void {
  const principale = normaliserHex(charte.principale);
  const accent = normaliserHex(charte.accent);
  if (!principale || !accent) return;
  try {
    localStorage.setItem(
      CLE_CHARTE,
      JSON.stringify({ principale, accent, css: charteVersCss(principale, accent) }),
    );
  } catch { /* stockage indisponible : la charte vaut pour la session */ }
  appliquer({ principale, accent });
  window.dispatchEvent(new Event(EVENEMENT));
}

export function effacerCharte(): void {
  try { localStorage.removeItem(CLE_CHARTE); } catch { /* rien à retirer */ }
  appliquer(null);
  window.dispatchEvent(new Event(EVENEMENT));
}

/** Pose ou retire la charte dans la page déjà affichée. */
export function appliquer(charte: Charte | null): void {
  const existante = document.getElementById(ID_STYLE);
  if (!charte || estCharteDefaut(charte)) {
    existante?.remove();
    return;
  }
  const style = existante ?? document.createElement("style");
  style.id = ID_STYLE;
  style.textContent = `html:root{${charteVersCss(charte.principale, charte.accent)}}`;
  if (!existante) document.head.appendChild(style);
}
