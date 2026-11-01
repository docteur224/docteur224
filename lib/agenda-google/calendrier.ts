import { SCOPE_AGENDA } from "./oauth";

/*
 * Appels à l'API Google Calendar — SERVEUR UNIQUEMENT.
 *
 * Trois gestes, et rien de plus : poser un événement, le corriger, le
 * retirer. Le jeton d'accès est obtenu à la demande depuis le jeton de
 * rafraîchissement (il ne vit qu'une heure, on ne le range donc pas en base)
 * et n'est jamais journalisé.
 *
 * FUSEAU. La Guinée est à UTC+0 toute l'année. On envoie malgré tout
 * `timeZone: "Africa/Conakry"` avec une heure locale plutôt qu'un « Z » :
 * l'événement s'affiche alors à la bonne heure pour un patient dont le
 * téléphone est réglé sur un autre fuseau — un Guinéen en voyage garde un
 * rendez-vous à 9 h à Conakry, pas à 9 h heure de Paris.
 */

const URL_JETON = "https://oauth2.googleapis.com/token";
const BASE_API = "https://www.googleapis.com/calendar/v3";

/** Fuseau du cabinet : tous les rendez-vous ont lieu en Guinée. */
export const FUSEAU = "Africa/Conakry";

/** Durée d'une consultation, faute d'information en base (cf. lib/rdv-utils). */
const DUREE_MINUTES = 30;

/**
 * Erreur d'appel à Google, avec le code HTTP — le drainer en a besoin :
 * un 404/410 veut dire « l'événement n'est plus là » et se rattrape, un 401
 * veut dire « accès révoqué » et ne se rattrape pas.
 */
export class ErreurGoogle extends Error {
  constructor(
    message: string,
    readonly statut: number,
  ) {
    super(message);
    this.name = "ErreurGoogle";
  }
}

/** Vrai si l'événement visé n'existe plus chez Google (il faut le recréer). */
export function evenementIntrouvable(e: unknown): boolean {
  return e instanceof ErreurGoogle && (e.statut === 404 || e.statut === 410);
}

/** Vrai si le patient a retiré son autorisation (inutile de réessayer). */
export function accesRevoque(e: unknown): boolean {
  return e instanceof ErreurGoogle && (e.statut === 400 || e.statut === 401 || e.statut === 403);
}

/**
 * Un jeton d'accès, à partir du jeton de rafraîchissement.
 *
 * Google refuse ici dès que le patient a retiré l'autorisation depuis son
 * compte Google (`invalid_grant`) : c'est un refus définitif, qu'on remonte
 * tel quel pour que le drainer abandonne au lieu d'insister.
 */
export async function jetonAcces(refreshToken: string): Promise<string> {
  const reponse = await fetch(URL_JETON, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_AGENDA_CLIENT_ID?.trim() || "",
      client_secret: process.env.GOOGLE_AGENDA_CLIENT_SECRET?.trim() || "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!reponse.ok) {
    const detail = (await reponse.text()).slice(0, 200);
    throw new ErreurGoogle(`Jeton d'accès refusé par Google : ${detail}`, reponse.status);
  }
  const data = (await reponse.json()) as { access_token?: string; scope?: string };
  if (!data.access_token) throw new ErreurGoogle("Google n'a pas renvoyé de jeton d'accès.", 500);
  /*
   * Le patient peut avoir décoché l'agenda sur l'écran de consentement : le
   * jeton est alors valide mais sans le droit d'écrire. Autant le dire ici
   * que récolter un 403 obscur à l'appel suivant.
   */
  if (data.scope && !data.scope.split(" ").includes(SCOPE_AGENDA)) {
    throw new ErreurGoogle("L'autorisation d'écrire dans l'agenda n'a pas été accordée.", 403);
  }
  return data.access_token;
}

export interface Evenement {
  rendezVousId: string;
  date: string; // AAAA-MM-JJ
  heure: string; // HH:MM[:SS]
  medecin: string;
  specialite: string | null;
  lieu: string | null;
  pourQui: string | null; // prénom du proche, si le RDV n'est pas pour soi
  statut: string;
}

function base(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
}

/** Fin de créneau, en heure locale, sans passer par un objet Date (UTC+0). */
function finCreneau(heure: string): string {
  const [h, m] = heure.split(":").map(Number);
  const total = h * 60 + m + DUREE_MINUTES;
  const p = (n: number) => `${n}`.padStart(2, "0");
  return `${p(Math.floor(total / 60) % 24)}:${p(total % 60)}:00`;
}

/**
 * Le contenu de l'événement.
 *
 * PAS DE MOTIF DE CONSULTATION. Google est un tiers ; la plateforme ne fait
 * pas voyager de contenu médical hors d'elle-même (même règle que les SMS et
 * les notifications, 0066). Le praticien, sa spécialité, le lieu et l'heure
 * suffisent à tenir un agenda ; le reste se lit en suivant le lien.
 */
export function corpsEvenement(e: Evenement): Record<string, unknown> {
  const heure = e.heure.slice(0, 5);
  const titre = e.pourQui
    ? `RDV – ${e.pourQui} · ${e.medecin}`
    : `RDV – ${e.medecin}`;

  return {
    summary: titre,
    location: e.lieu || undefined,
    description: [
      e.specialite ? `${e.specialite} · ${e.medecin}` : e.medecin,
      e.pourQui ? `Rendez-vous pour ${e.pourQui}` : null,
      e.statut === "en_attente" ? "Statut : en attente de confirmation" : null,
      "",
      `Détail et annulation : ${base()}/mes-rendez-vous/${e.rendezVousId}`,
      "Ajouté automatiquement par Docteur 224.",
    ]
      .filter((l) => l !== null)
      .join("\n"),
    start: { dateTime: `${e.date}T${heure}:00`, timeZone: FUSEAU },
    end: { dateTime: `${e.date}T${finCreneau(e.heure)}`, timeZone: FUSEAU },
    /*
     * Rappels PORTÉS PAR L'ÉVÉNEMENT, en plus des rappels Docteur 224
     * (SMS/e-mail, file 0066). Ce sont deux canaux distincts et voulus :
     * celui-ci prévient sur l'appareil où le patient tient son agenda.
     */
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 24 * 60 },
        { method: "popup", minutes: 60 },
      ],
    },
    source: { title: "Docteur 224", url: `${base()}/mes-rendez-vous/${e.rendezVousId}` },
    /*
     * Marque privée : elle permet de retrouver l'événement d'un rendez-vous
     * dans l'agenda du patient même si la liaison en base était perdue.
     */
    extendedProperties: { private: { docteur224_rdv: e.rendezVousId } },
  };
}

async function appeler(
  jeton: string,
  chemin: string,
  methode: "POST" | "PATCH" | "DELETE",
  corps?: Record<string, unknown>,
): Promise<unknown> {
  const reponse = await fetch(`${BASE_API}${chemin}`, {
    method: methode,
    headers: {
      authorization: `Bearer ${jeton}`,
      ...(corps ? { "content-type": "application/json" } : {}),
    },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  // Une suppression rend 204 sans corps ; un événement déjà retiré rend 410.
  if (reponse.status === 204) return null;
  if (!reponse.ok) {
    throw new ErreurGoogle(
      `Google Calendar a refusé l'appel (${reponse.status}) : ${(await reponse.text()).slice(0, 200)}`,
      reponse.status,
    );
  }
  return reponse.json();
}

const cal = (calendarId: string) => encodeURIComponent(calendarId);

/** Pose l'événement et rend son identifiant Google. */
export async function creerEvenement(jeton: string, calendarId: string, e: Evenement): Promise<string> {
  const data = (await appeler(jeton, `/calendars/${cal(calendarId)}/events`, "POST", corpsEvenement(e))) as {
    id?: string;
  };
  if (!data?.id) throw new ErreurGoogle("Google n'a pas renvoyé d'identifiant d'événement.", 500);
  return data.id;
}

/** Corrige un événement existant (déplacement, changement de praticien…). */
export async function majEvenement(
  jeton: string,
  calendarId: string,
  eventId: string,
  e: Evenement,
): Promise<void> {
  await appeler(
    jeton,
    `/calendars/${cal(calendarId)}/events/${encodeURIComponent(eventId)}`,
    "PATCH",
    corpsEvenement(e),
  );
}

/** Retire l'événement (rendez-vous annulé). */
export async function supprimerEvenement(
  jeton: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  await appeler(jeton, `/calendars/${cal(calendarId)}/events/${encodeURIComponent(eventId)}`, "DELETE");
}
