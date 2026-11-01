import { chiffrementConfigure } from "./chiffrement";

/*
 * OAuth Google pour l'agenda du patient — SERVEUR UNIQUEMENT.
 *
 * MODE SIMULÉ tant que les identifiants ne sont pas fournis (comme les SMS :
 * lib/messagerie simule l'envoi sans fournisseur). `oauthConfigure()` renvoie
 * alors faux, les routes répondent « non configuré », et rien n'est tenté vers
 * Google. On bascule en réel dès que ces variables sont renseignées :
 *
 *   GOOGLE_AGENDA_CLIENT_ID       — client OAuth « Web » (console Google Cloud)
 *   GOOGLE_AGENDA_CLIENT_SECRET   — son secret
 *   GOOGLE_AGENDA_CLE_CHIFFREMENT — clé de chiffrement des jetons (voir chiffrement.ts)
 *   NEXT_PUBLIC_SITE_URL          — pour construire l'URI de retour (déjà présent)
 *
 * URI de redirection à déclarer dans la console Google :
 *   <NEXT_PUBLIC_SITE_URL>/api/agenda-google/retour
 */

/** Écrire des événements dans l'agenda, et seulement cela. */
export const SCOPE_AGENDA = "https://www.googleapis.com/auth/calendar.events";
// `openid email` en plus, uniquement pour connaître l'adresse du compte relié.
const SCOPES = ["openid", "email", SCOPE_AGENDA].join(" ");

const URL_CONSENTEMENT = "https://accounts.google.com/o/oauth2/v2/auth";
const URL_JETON = "https://oauth2.googleapis.com/token";
const URL_REVOCATION = "https://oauth2.googleapis.com/revoke";

function clientId(): string { return process.env.GOOGLE_AGENDA_CLIENT_ID?.trim() || ""; }
function clientSecret(): string { return process.env.GOOGLE_AGENDA_CLIENT_SECRET?.trim() || ""; }

export function uriRetour(): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  return `${base}/api/agenda-google/retour`;
}

/** Tout est en place pour une vraie connexion (sinon : mode simulé). */
export function oauthConfigure(): boolean {
  return Boolean(
    clientId() && clientSecret() && process.env.NEXT_PUBLIC_SITE_URL && chiffrementConfigure(),
  );
}

export function urlConsentement(etat: string): string {
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: uriRetour(),
    response_type: "code",
    scope: SCOPES,
    // `offline` + `consent` : nécessaires pour obtenir un jeton de
    // rafraîchissement, et le réémettre même si l'utilisateur a déjà consenti.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: etat,
  });
  return `${URL_CONSENTEMENT}?${p.toString()}`;
}

export interface JetonsGoogle {
  refreshToken: string;
  email: string | null;
}

export async function echangerCode(code: string): Promise<JetonsGoogle> {
  const reponse = await fetch(URL_JETON, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: uriRetour(),
      grant_type: "authorization_code",
    }),
  });
  if (!reponse.ok) throw new Error(`Échange du code refusé par Google (${reponse.status}).`);
  const data = (await reponse.json()) as { refresh_token?: string; id_token?: string };
  if (!data.refresh_token) {
    // Google n'émet le jeton de rafraîchissement qu'au consentement explicite ;
    // `prompt=consent` le force, mais on le signale clairement si Google ne l'a
    // pas renvoyé (sans lui, impossible de synchroniser plus tard).
    throw new Error("Google n'a pas fourni de jeton de rafraîchissement.");
  }
  return { refreshToken: data.refresh_token, email: emailDepuisIdToken(data.id_token) };
}

/*
 * L'id_token vient d'être reçu du point de jeton de Google, par TLS, en
 * réponse directe : on peut en lire l'e-mail sans revérifier la signature.
 */
function emailDepuisIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const charge = idToken.split(".")[1];
    if (!charge) return null;
    const o = JSON.parse(Buffer.from(charge, "base64url").toString("utf8")) as { email?: string };
    return typeof o.email === "string" ? o.email : null;
  } catch {
    return null;
  }
}

/** Révocation best-effort : la ligne est effacée même si Google ne répond pas. */
export async function revoquer(refreshToken: string): Promise<void> {
  try {
    await fetch(URL_REVOCATION, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
    });
  } catch {
    /* hors ligne : on n'empêche pas la déconnexion locale pour autant */
  }
}
