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

export type Canal = "sms" | "whatsapp" | "email";
export type ModeMessagerie = "simule" | "reel";

export interface ConfigCanal {
  fournisseur: string | null;
  url: string | null;
  identifiant: string | null;
  /** Secret : ne quitte jamais le serveur. */
  cle: string | null;
  /** Expéditeur SMS, identifiant du numéro WhatsApp, ou adresse d’envoi e-mail. */
  expediteur: string | null;
  coutGnf: number;
}

export interface ConfigMessagerie {
  mode: ModeMessagerie;
  canalDefaut: Canal;
  sms: ConfigCanal;
  whatsapp: ConfigCanal;
  email: ConfigCanal;
}

export interface ResultatFournisseur {
  /** Identifiant rendu par l'agrégateur, pour rapprocher sa facture. */
  reference?: string;
  erreur?: string;
}

export interface Fournisseur {
  nom: string;
  /**
   * `sujet` n'a de sens que pour l'e-mail ; les fournisseurs SMS et WhatsApp
   * l'ignorent. Le passer à tous plutôt que d'ouvrir une seconde interface
   * garde un seul contrat à satisfaire pour brancher un agrégateur.
   */
  envoyer(
    destinataire: string,
    texte: string,
    config: ConfigCanal,
    sujet?: string
  ): Promise<ResultatFournisseur>;
}

/** La configuration d'un canal, sans `if` recopié dans chaque appelant. */
export function configDuCanal(canal: Canal, config: ConfigMessagerie): ConfigCanal {
  return canal === "sms" ? config.sms : canal === "email" ? config.email : config.whatsapp;
}

/** Une configuration incomplète ne doit jamais partir en mode réel. */
export function configComplete(canal: Canal, config: ConfigMessagerie): boolean {
  const c = configDuCanal(canal, config);
  // WhatsApp s'identifie par son numéro d'entreprise ; le SMS par le nom court
  // déclaré chez l'opérateur ; l'e-mail par son adresse d'expédition.
  return !!(c.url && c.cle && (canal === "whatsapp" ? c.identifiant : c.expediteur));
}
