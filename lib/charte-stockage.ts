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
 * Ce n'est plus le lieu de la vérité — la charte appartient au compte
 * (`charte-compte`). Ceci n'en est que l'avance : les pages connectées sont
 * servies statiques, le serveur ne sait donc pas qui regarde, et interroger
 * la base avant d'afficher ferait apparaître chaque page en bleu d'origine
 * le temps de la réponse. Le cache répond, lui, immédiatement ; la base
 * corrige ensuite s'il se trompe.
 *
 * On range le CSS déjà calculé à côté des deux couleurs : le script de
 * démarrage le repose tel quel, sans embarquer le moteur de calcul.
 *
 * Le cache retient aussi À QUI il appartient. Deux comptes se succèdent sur
 * le même navigateur — un praticien et son assistant sur le poste de
 * l'accueil — et le second hériterait sinon des couleurs du premier.
 *
 * Aucune dépendance à Supabase ici : ce fichier est lu par un composant
 * serveur, qui n'a besoin que des deux identifiants ci-dessous.
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

/** À quel compte appartient ce qui est en cache, s'il le dit. */
export function compteEnCache(brut: string | null): string | null {
  try {
    const c = brut ? JSON.parse(brut)?.compte : null;
    return typeof c === "string" && c ? c : null;
  } catch {
    return null;
  }
}

export function enregistrerCharte(charte: Charte, compte?: string | null): void {
  const principale = normaliserHex(charte.principale);
  const accent = normaliserHex(charte.accent);
  if (!principale || !accent) return;
  try {
    localStorage.setItem(
      CLE_CHARTE,
      JSON.stringify({
        principale, accent, compte: compte ?? null,
        css: charteVersCss(principale, accent),
      }),
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
