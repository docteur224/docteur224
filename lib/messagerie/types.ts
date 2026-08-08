/*
 * Contrat d'un fournisseur d'envoi.
 *
 * Aucun agrégateur n'est encore branché. Tout le circuit — choix du canal,
 * décompte du quota, imputation sur les crédits, journalisation — fonctionne
 * sans, en mode « simulé ». Brancher un fournisseur réel consiste à écrire un
 * seul fichier qui satisfait `Fournisseur`, et à le déclarer dans
 * `lib/messagerie/index.ts`. Rien d'autre ne bouge.
 *
 * Le fournisseur ne connaît ni le quota, ni le coût, ni le titulaire : il
 * envoie un texte à un numéro et dit ce qui s'est passé. Tout le reste est
 * décidé en amont, pour qu'un fournisseur mal écrit ne puisse pas contourner
 * la comptabilité.
 */

export type Canal = "sms" | "whatsapp";
export type ModeMessagerie = "simule" | "reel";

export interface ConfigCanal {
  fournisseur: string | null;
  url: string | null;
  identifiant: string | null;
  /** Secret : ne quitte jamais le serveur. */
  cle: string | null;
  /** Expéditeur SMS, ou identifiant du numéro WhatsApp. */
  expediteur: string | null;
  coutGnf: number;
}

export interface ConfigMessagerie {
  mode: ModeMessagerie;
  canalDefaut: Canal;
  sms: ConfigCanal;
  whatsapp: ConfigCanal;
}

export interface ResultatFournisseur {
  /** Identifiant rendu par l'agrégateur, pour rapprocher sa facture. */
  reference?: string;
  erreur?: string;
}

export interface Fournisseur {
  nom: string;
  envoyer(destinataire: string, texte: string, config: ConfigCanal): Promise<ResultatFournisseur>;
}

/** Une configuration incomplète ne doit jamais partir en mode réel. */
export function configComplete(canal: Canal, config: ConfigMessagerie): boolean {
  const c = canal === "sms" ? config.sms : config.whatsapp;
  return !!(c.url && c.cle && (canal === "sms" ? c.expediteur : c.identifiant));
}
