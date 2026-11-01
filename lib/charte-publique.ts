/**
 * La charte du SITE PUBLIC — avance locale et application, sans Supabase.
 *
 * Pendant de `charte-stockage` pour la charte d'espace, mais pour les pages
 * publiques et avec une FENÊTRE DE DATES : l'administration habille le site
 * aux couleurs d'une cause (Octobre Rose…) entre deux dates, et passé le
 * terme le site revient de lui-même à la charte Docteur 224.
 *
 * Pas de directive « use client » et AUCUNE dépendance à Supabase : ce module
 * est lu par le script de démarrage (`CharteLocalePublique`, rendu côté
 * serveur) qui a besoin d'y lire les constantes et la règle de route. La
 * vérité vit en base (`charte-publique-compte`) ; ceci n'en est que l'avance,
 * pour poser la charte avant le premier affichage sans attendre le réseau.
 *
 * Les fonctions qui touchent au navigateur ne s'appellent que depuis un
 * composant client.
 */

// Chemin relatif avec extension, comme `lisibilite.ts` : c'est ce qui rend
// `estRoutePublique`/`estActive` vérifiables tels quels par `node --test`.
import { charteVersCss, normaliserHex } from "./charte-couleurs.ts";

export const CLE_CHARTE_PUBLIQUE = "docteur224.charte-publique";
/** Identifiant de la balise de style posée sur les pages publiques. */
export const ID_STYLE_PUBLIQUE = "charte-publique";
/**
 * Attribut posé sur <html> quand une campagne est en cours, et seulement
 * alors. Il vaut "2" ou "3" selon le nombre de couleurs choisies. C'est lui
 * qui allume le FILET DE CAMPAGNE (globals.css) : un bandeau de quelques
 * pixels en haut des pages publiques, qui montre les couleurs de la cause
 * là où aucun texte ne vient se poser dessus. Même mécanique que
 * `data-theme` pour le mode sombre — un attribut, des règles en CSS, aucun
 * rendu conditionnel côté serveur.
 */
export const ATTRIBUT_CAMPAGNE = "data-campagne";

/**
 * Préfixes des espaces connectés. La charte publique ne s'y applique JAMAIS :
 * chaque compte y a la sienne (ou celle d'origine). Source unique, lue par le
 * script de démarrage et par `SuivreChartePublique`.
 */
export const PREFIXES_ESPACE = [
  "/espace-admin",
  "/espace-medecin",
  "/espace-assistant",
  "/espace-etablissement",
  "/patient",
] as const;

/** Une page publique est tout ce qui n'est pas un espace connecté. */
export function estRoutePublique(chemin: string): boolean {
  return !PREFIXES_ESPACE.some(
    (p) => chemin === p || chemin.startsWith(p + "/"),
  );
}

export type ChartePublique = {
  principale: string;
  accent: string;
  /** Troisième couleur, FACULTATIVE : la touche du filet de campagne. */
  secondaire: string | null;
  debut: string | null;
  fin: string | null;
};

/** La campagne est-elle en cours à l'instant `maintenant` (ms epoch) ? */
export function estActive(c: ChartePublique | null, maintenant = Date.now()): boolean {
  if (!c) return false;
  if (c.debut && maintenant < Date.parse(c.debut)) return false;
  if (c.fin && maintenant > Date.parse(c.fin)) return false;
  return true;
}

export function instantane(): string | null {
  try { return localStorage.getItem(CLE_CHARTE_PUBLIQUE); } catch { return null; }
}

export function analyser(brut: string | null): ChartePublique | null {
  try {
    if (!brut) return null;
    const o = JSON.parse(brut);
    const principale = normaliserHex(o?.principale ?? "");
    const accent = normaliserHex(o?.accent ?? "");
    if (!principale || !accent) return null;
    return {
      principale,
      accent,
      // Une troisième couleur mal formée est simplement ignorée : la campagne
      // reste valable à deux couleurs plutôt que de disparaître.
      secondaire: normaliserHex(o?.secondaire ?? ""),
      debut: typeof o?.debut === "string" ? o.debut : null,
      fin: typeof o?.fin === "string" ? o.fin : null,
    };
  } catch {
    return null;
  }
}

export function enregistrerCharte(charte: ChartePublique): void {
  const principale = normaliserHex(charte.principale);
  const accent = normaliserHex(charte.accent);
  if (!principale || !accent) return;
  const secondaire = normaliserHex(charte.secondaire ?? "");
  try {
    localStorage.setItem(
      CLE_CHARTE_PUBLIQUE,
      JSON.stringify({
        principale, accent, secondaire, debut: charte.debut, fin: charte.fin,
        css: charteVersCss(principale, accent, secondaire),
      }),
    );
  } catch { /* stockage indisponible : la charte vaut pour la session */ }
}

export function effacerCache(): void {
  try { localStorage.removeItem(CLE_CHARTE_PUBLIQUE); } catch { /* rien à retirer */ }
}

/** Retire la balise de charte publique de la page déjà affichée. */
export function retirer(): void {
  document.getElementById(ID_STYLE_PUBLIQUE)?.remove();
  document.documentElement.removeAttribute(ATTRIBUT_CAMPAGNE);
}

/**
 * Pose ou retire la charte publique dans la page affichée, selon qu'elle est
 * active maintenant. Appelée sur les pages publiques uniquement.
 */
export function appliquer(charte: ChartePublique | null): void {
  const existante = document.getElementById(ID_STYLE_PUBLIQUE);
  if (!estActive(charte)) {
    existante?.remove();
    document.documentElement.removeAttribute(ATTRIBUT_CAMPAGNE);
    return;
  }
  const secondaire = normaliserHex(charte!.secondaire ?? "");
  const style = existante ?? document.createElement("style");
  style.id = ID_STYLE_PUBLIQUE;
  style.textContent =
    `html:root{${charteVersCss(charte!.principale, charte!.accent, secondaire)}}`;
  if (!existante) document.head.appendChild(style);
  document.documentElement.setAttribute(ATTRIBUT_CAMPAGNE, secondaire ? "3" : "2");
}
