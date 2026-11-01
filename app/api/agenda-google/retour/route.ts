import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifierPatient } from "@/lib/gardes-serveur";
import { echangerCode, oauthConfigure, revoquer } from "@/lib/agenda-google/oauth";
import { chiffrer } from "@/lib/agenda-google/chiffrement";
import { COOKIE_ETAT } from "../connexion/route";

/*
 * Retour de Google après consentement (patient uniquement).
 *
 * On recompare l'état anti-CSRF posé au départ, on échange le code contre un
 * jeton de rafraîchissement, on le chiffre et on l'enregistre. Tout chemin de
 * sortie renvoie vers les paramètres avec un indicateur ?agenda=… et efface le
 * cookie d'état. Si l'enregistrement échoue, on révoque le jeton chez Google
 * pour ne pas laisser un accès actif sans ligne en base.
 */
export const dynamic = "force-dynamic";

function base(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
}

export async function GET(requete: Request) {
  const magasin = await cookies();
  const etatAttendu = magasin.get(COOKIE_ETAT)?.value;

  const sortir = (indicateur: string) => {
    const reponse = NextResponse.redirect(`${base()}/patient/parametres?agenda=${indicateur}`);
    reponse.cookies.set(COOKIE_ETAT, "", { path: "/", maxAge: 0 });
    return reponse;
  };

  const url = new URL(requete.url);
  const code = url.searchParams.get("code");
  const etat = url.searchParams.get("state");
  if (url.searchParams.get("error") || !code || !etat) return sortir("refuse");
  if (!etatAttendu || etatAttendu !== etat) return sortir("refuse");

  const garde = await verifierPatient();
  if ("refus" in garde) return sortir("refus");
  if (!oauthConfigure()) return sortir("non-configure");

  let jetons;
  try {
    jetons = await echangerCode(code);
  } catch {
    return sortir("echec");
  }

  const { error } = await garde.acces.admin.from("agenda_google_comptes").upsert(
    {
      utilisateur_id: garde.acces.patientId,
      email_google: jetons.email,
      refresh_token_chiffre: chiffrer(jetons.refreshToken),
      calendar_id: "primary",
      maj_le: new Date().toISOString(),
    },
    { onConflict: "utilisateur_id" },
  );
  if (error) {
    await revoquer(jetons.refreshToken);
    return sortir("echec");
  }
  return sortir("connecte");
}
