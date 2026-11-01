import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { verifierPatient } from "@/lib/gardes-serveur";
import { oauthConfigure, urlConsentement } from "@/lib/agenda-google/oauth";

/*
 * Départ de la connexion à Google Agenda (patient uniquement).
 *
 * Navigation plein écran : le navigateur vient ici, on vérifie que c'est bien
 * un patient connecté, on pose un « état » anti-CSRF dans un cookie httpOnly,
 * puis on renvoie vers l'écran de consentement Google. Le retour se fait sur
 * /api/agenda-google/retour, qui recompare l'état.
 */
export const dynamic = "force-dynamic";

export const COOKIE_ETAT = "agenda_google_etat";

function base(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
}

export async function GET() {
  const garde = await verifierPatient();
  if ("refus" in garde) {
    // Session perdue ou compte non patient : on renvoie vers la connexion.
    return NextResponse.redirect(`${base()}/connexion`);
  }
  if (!oauthConfigure()) {
    return NextResponse.redirect(`${base()}/patient/parametres?agenda=non-configure`);
  }

  const etat = randomBytes(16).toString("base64url");
  const reponse = NextResponse.redirect(urlConsentement(etat));
  reponse.cookies.set(COOKIE_ETAT, etat, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return reponse;
}
