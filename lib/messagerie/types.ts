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
  /** SMTP uniquement : le serveur d’envoi et son port. Nuls ailleurs. */
  hote?: string | null;
  port?: number | null;
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

export interface PieceJointe {
  nom: string;
  /** Contenu textuel du fichier (un `.ics` n'est rien d'autre que du texte). */
  contenu: string;
  /** Type MIME complet, méthode comprise pour un calendrier. */
  type: string;
}

/**
 * Ce qu'un e-mail porte en plus d'un SMS. Regroupé dans un objet plutôt
 * qu'étalé en paramètres : `texte` reste la version de repli obligatoire, et
 * tout ce qui est propre au courriel tient dans un seul argument qu'un
 * fournisseur SMS se contente d'ignorer.
 */
export interface ExtrasEmail {
  /** Version HTML. `texte` reste envoyé en parallèle, jamais à la place. */
  html?: string;
  pieces?: PieceJointe[];
}

export interface Fournisseur {
  nom: string;
  /**
   * `sujet` et `extras` n'ont de sens que pour l'e-mail ; les fournisseurs SMS
   * et WhatsApp les ignorent. Les passer à tous plutôt que d'ouvrir une
   * seconde interface garde un seul contrat à satisfaire pour brancher un
   * agrégateur.
   */
  envoyer(
    destinataire: string,
    texte: string,
    config: ConfigCanal,
    sujet?: string,
    extras?: ExtrasEmail
  ): Promise<ResultatFournisseur>;
}

/** La configuration d'un canal, sans `if` recopié dans chaque appelant. */
export function configDuCanal(canal: Canal, config: ConfigMessagerie): ConfigCanal {
  return canal === "sms" ? config.sms : canal === "email" ? config.email : config.whatsapp;
}

/**
 * Une configuration incomplète ne doit jamais partir en mode réel.
 *
 * Le SMTP est le seul fournisseur qui ne s'adresse pas par une URL : il se
 * joint par un hôte et un port, et s'authentifie par un couple
 * identifiant / mot de passe. Exiger `url` de lui refuserait toujours une
 * configuration pourtant complète — d'où le branchement sur le FOURNISSEUR et
 * pas seulement sur le canal.
 */
export function configComplete(canal: Canal, config: ConfigMessagerie): boolean {
  const c = configDuCanal(canal, config);
  if (c.fournisseur === "smtp") {
    return !!(c.hote && c.port && c.identifiant && c.cle && c.expediteur);
  }
  // WhatsApp s'identifie par son numéro d'entreprise ; le SMS par le nom court
  // déclaré chez l'opérateur ; l'e-mail par son adresse d'expédition.
  return !!(c.url && c.cle && (canal === "whatsapp" ? c.identifiant : c.expediteur));
}
