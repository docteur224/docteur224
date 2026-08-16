import type { Canal } from "./types";

/*
 * Fournisseurs proposés par canal.
 *
 * Fichier séparé et volontairement sans dépendance : l'écran d'administration
 * est un composant client, et importer `fournisseurs.ts` depuis le navigateur
 * embarquerait le code d'appel des agrégateurs dans le paquet public. Il ne
 * contient pas de secret, mais il n'a rien à y faire non plus.
 */
export const FOURNISSEURS_PAR_CANAL: Record<Canal, { valeur: string; label: string }[]> = {
  sms: [
    { valeur: "simule", label: "Simulé — rien n'est envoyé" },
    { valeur: "http", label: "Agrégateur HTTP (POST JSON)" },
  ],
  whatsapp: [
    { valeur: "simule", label: "Simulé — rien n'est envoyé" },
    { valeur: "http", label: "WhatsApp Business (POST JSON)" },
  ],
  email: [
    { valeur: "simule", label: "Simulé — rien n'est envoyé" },
    { valeur: "http-email", label: "E-mail transactionnel (Resend, Brevo, Postmark…)" },
  ],
};
