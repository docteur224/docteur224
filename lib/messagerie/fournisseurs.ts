import type { ConfigCanal, Fournisseur, ResultatFournisseur } from "./types";

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

const CATALOGUE: Record<string, Fournisseur> = {
  simule: simule,
  http: httpGenerique,
  "http-email": httpEmail,
};

/** Repli sur `simule` : un nom inconnu ne doit pas faire tomber un envoi. */
export function fournisseur(nom: string | null | undefined): Fournisseur {
  return CATALOGUE[nom ?? ""] ?? simule;
}
