import nodemailer from "nodemailer";
import type { ConfigCanal, ExtrasEmail, Fournisseur, ResultatFournisseur } from "./types";

/*
 * Les fournisseurs disponibles.
 *
 * `simule` est le seul opérationnel tant qu'aucun contrat d'agrégateur n'est
 * signé. `httpGenerique` couvre la majorité des agrégateurs guinéens, qui
 * exposent tous une variante de « POST JSON avec une clé en en-tête » — il
 * suffira de renseigner l'URL et la clé dans /espace-admin/messagerie. Un
 * agrégateur au protocole exotique demandera son propre fichier ici.
 */

/**
 * N'envoie rien, réussit toujours. Le message est quand même journalisé et le
 * quota décompté : c'est tout l'intérêt — le circuit complet est exerçable, et
 * les chiffres de consommation sont réalistes avant la mise en service.
 */
export const simule: Fournisseur = {
  nom: "simule",
  async envoyer(destinataire): Promise<ResultatFournisseur> {
    return { reference: `simule-${Date.now()}-${destinataire.slice(-4)}` };
  },
};

/**
 * POST JSON générique.
 *
 * Le corps envoyé suit la forme la plus répandue ; un agrégateur qui attend
 * d'autres noms de champs se traite en ajoutant un fournisseur, pas en
 * tordant celui-ci.
 *
 * Le délai d'attente est court et volontaire : un agrégateur qui ne répond pas
 * en 10 s ne répondra pas, et une route de notification qui se bloque dessus
 * retiendrait la requête du patient qui vient de réserver.
 */
export const httpGenerique: Fournisseur = {
  nom: "http",
  async envoyer(destinataire, texte, config: ConfigCanal): Promise<ResultatFournisseur> {
    if (!config.url || !config.cle) return { erreur: "Fournisseur non configuré." };
    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), 10_000);
    try {
      const reponse = await fetch(config.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.cle}`,
        },
        body: JSON.stringify({
          to: destinataire,
          from: config.expediteur ?? config.identifiant,
          message: texte,
        }),
        signal: controleur.signal,
      });
      if (!reponse.ok) {
        // Le corps de la réponse porte le motif du refus (numéro invalide,
        // solde épuisé…) : le perdre rendrait tout diagnostic impossible.
        const detail = await reponse.text().catch(() => "");
        return { erreur: `HTTP ${reponse.status} ${detail.slice(0, 200)}`.trim() };
      }
      const donnees = (await reponse.json().catch(() => ({}))) as Record<string, unknown>;
      const reference = donnees.id ?? donnees.messageId ?? donnees.reference;
      return { reference: typeof reference === "string" ? reference : undefined };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { erreur: message === "The operation was aborted." ? "Délai dépassé (10 s)." : message };
    } finally {
      clearTimeout(minuteur);
    }
  },
};

/**
 * POST JSON vers une API d'e-mail transactionnel (Resend, Brevo, Postmark…).
 *
 * Même forme que `httpGenerique`, mais le corps porte un sujet : un e-mail
 * sans objet part en indésirable, et le patient ne le lit jamais. Les noms de
 * champs suivent la convention la plus répandue ; un fournisseur qui en attend
 * d'autres se traite en ajoutant une entrée au catalogue, pas en tordant
 * celle-ci.
 */
export const httpEmail: Fournisseur = {
  nom: "http-email",
  async envoyer(destinataire, texte, config: ConfigCanal, sujet): Promise<ResultatFournisseur> {
    if (!config.url || !config.cle) return { erreur: "Fournisseur non configuré." };
    if (!config.expediteur) return { erreur: "Adresse d’expédition manquante." };
    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), 10_000);
    try {
      const reponse = await fetch(config.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.cle}`,
        },
        body: JSON.stringify({
          from: config.expediteur,
          to: [destinataire],
          subject: sujet ?? "Docteur 224",
          text: texte,
        }),
        signal: controleur.signal,
      });
      if (!reponse.ok) {
        const detail = await reponse.text().catch(() => "");
        return { erreur: `HTTP ${reponse.status} ${detail.slice(0, 200)}`.trim() };
      }
      const donnees = (await reponse.json().catch(() => ({}))) as Record<string, unknown>;
      const reference = donnees.id ?? donnees.messageId ?? donnees.reference;
      return { reference: typeof reference === "string" ? reference : undefined };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { erreur: message === "The operation was aborted." ? "Délai dépassé (10 s)." : message };
    } finally {
      clearTimeout(minuteur);
    }
  },
};

/**
 * Envoi par SMTP — une boîte mail ordinaire (Hostinger, OVH, Gmail…).
 *
 * C'est le fournisseur du démarrage : il ne demande aucun contrat, juste une
 * adresse qui existe déjà. Il a en contrepartie un plafond d'envois quotidien
 * bas et une réputation d'expéditeur qui n'est pas celle d'un service
 * transactionnel — sans SPF, DKIM et DMARC posés sur le domaine, les messages
 * partent en indésirables. Le jour où le volume l'exige, on bascule sur
 * `http-email` depuis le menu de /espace-admin/messagerie : rien d'autre ne
 * bouge.
 *
 * Le chiffrement se déduit du port plutôt que de s'ajouter en réglage : 465
 * est le TLS implicite, tout le reste (587 en pratique) passe par STARTTLS.
 * C'est la convention universelle, et un interrupteur de plus serait surtout
 * un interrupteur de travers.
 */
export const smtp: Fournisseur = {
  nom: "smtp",
  async envoyer(
    destinataire,
    texte,
    config: ConfigCanal,
    sujet,
    extras?: ExtrasEmail
  ): Promise<ResultatFournisseur> {
    if (!config.hote || !config.port) return { erreur: "Serveur SMTP non configuré." };
    if (!config.identifiant || !config.cle) return { erreur: "Identifiants SMTP manquants." };
    if (!config.expediteur) return { erreur: "Adresse d’expédition manquante." };

    try {
      const transporteur = nodemailer.createTransport({
        host: config.hote,
        port: config.port,
        secure: config.port === 465,
        auth: { user: config.identifiant, pass: config.cle },
        /*
         * Mêmes 10 s que les fournisseurs HTTP, et pour la même raison : une
         * route de notification qui se bloque sur un serveur muet retiendrait
         * la requête du patient qui vient de réserver. Les trois délais sont
         * distincts chez nodemailer — la connexion, la bannière d'accueil,
         * puis le dialogue — et n'en régler qu'un en laisse deux ouverts.
         */
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 10_000,
        /*
         * Échappatoire de DÉVELOPPEMENT, lisible seulement par qui a la main
         * sur les variables d'environnement du serveur — jamais depuis
         * l'écran d'administration. Un antivirus qui inspecte le courrier
         * (Avast, Kaspersky…) remplace le certificat du serveur par le sien et
         * fait échouer la vérification sur le poste du développeur. La
         * désactiver en production exposerait identifiant et mot de passe à
         * qui s'intercale sur le réseau : c'est pourquoi ce n'est pas un
         * réglage de la plateforme.
         */
        ...(process.env.EMAIL_TLS_NON_VERIFIE === "1"
          ? { tls: { rejectUnauthorized: false } }
          : {}),
      });

      const envoi = await transporteur.sendMail({
        from: config.expediteur,
        to: destinataire,
        subject: sujet ?? "Docteur 224",
        /*
         * Les deux versions partent ensemble, en `multipart/alternative`. Ce
         * n'est pas une politesse envers les vieux logiciels : un message qui
         * ne porte QUE du HTML est un signal de courrier indésirable pour la
         * plupart des filtres, et le texte est ce que lisent les montres, les
         * lecteurs d'écran et les aperçus de notification.
         */
        text: texte,
        ...(extras?.html ? { html: extras.html } : {}),
        ...(extras?.pieces?.length
          ? {
              attachments: extras.pieces.map((p) => ({
                filename: p.nom,
                content: p.contenu,
                contentType: p.type,
              })),
            }
          : {}),
      });
      /*
       * Un serveur SMTP peut accepter le message pour certains destinataires
       * et le refuser pour d'autres. Sans ce contrôle, un refus total
       * passerait pour un succès et la notification serait comptée envoyée.
       */
      if (!envoi.accepted?.length) {
        return { erreur: `Refusé par le serveur : ${envoi.response ?? "sans motif"}` };
      }
      return { reference: envoi.messageId };
    } catch (e) {
      const erreur = e as { code?: string; responseCode?: number; message?: string };
      // Le code SMTP porte le motif réel — 535 mot de passe refusé, 550
      // adresse d'expédition non autorisée. Le perdre rendrait tout
      // diagnostic impossible depuis l'écran d'administration.
      const codes = [erreur.code, erreur.responseCode].filter(Boolean).join(" ");
      return { erreur: `${codes} ${erreur.message ?? String(e)}`.trim() };
    }
  },
};

const CATALOGUE: Record<string, Fournisseur> = {
  simule: simule,
  http: httpGenerique,
  "http-email": httpEmail,
  smtp: smtp,
};

/** Repli sur `simule` : un nom inconnu ne doit pas faire tomber un envoi. */
export function fournisseur(nom: string | null | undefined): Fournisseur {
  return CATALOGUE[nom ?? ""] ?? simule;
}
