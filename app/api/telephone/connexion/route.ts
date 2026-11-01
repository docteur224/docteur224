import { NextResponse } from "next/server";
import { clientServiceRole } from "@/lib/gardes-serveur";
import { versTelephoneInternational } from "@/lib/telephone";
import { LONGUEUR_PIN } from "@/lib/pin";
import {
  compteOuvrable,
  ouvrirSession,
  pinCorrespond,
  simulerVerificationPin,
} from "@/lib/auth-telephone-serveur";

/*
 * Connexion par numéro + code PIN. Aucun code n'est envoyé : l'OTP n'a servi
 * qu'à la création du compte (et ne resservira qu'en cas de PIN oublié).
 *
 * Numéro inconnu et PIN faux reçoivent la même réponse, au même rythme
 * (`simulerVerificationPin`). Cinq échecs verrouillent le numéro un quart
 * d'heure ; le verrou est posé en base AVANT la comparaison
 * (`reserver_essai_pin`, migration 0077).
 */

const MESSAGE_INCORRECT = "Numéro ou code PIN incorrect.";

export async function POST(requete: Request) {
  const corps = await requete.json().catch(() => null);
  const telephone = versTelephoneInternational(String(corps?.telephone ?? ""));
  const pin = String(corps?.pin ?? "");
  if (!telephone || !new RegExp(`^\\d{${LONGUEUR_PIN}}$`).test(pin)) {
    return NextResponse.json({ erreur: "Saisissez votre numéro et vos 4 chiffres." }, { status: 400 });
  }

  const admin = clientServiceRole();
  const { data } = await admin.rpc("reserver_essai_pin", { p_telephone: telephone });
  const essai = (data as { o_utilisateur: string; o_pin_hash: string | null; o_verrou: string | null }[] | null)?.[0];

  if (!essai) {
    await simulerVerificationPin(pin);
    return NextResponse.json({ erreur: MESSAGE_INCORRECT }, { status: 401 });
  }
  if (!essai.o_pin_hash) {
    const minutes = Math.max(1, Math.ceil((new Date(essai.o_verrou!).getTime() - Date.now()) / 60_000));
    return NextResponse.json(
      {
        erreur: `Trop d’essais. Réessayez dans ${minutes} min, ou réinitialisez votre code PIN.`,
        verrouille: true,
      },
      { status: 429 }
    );
  }
  if (!(await pinCorrespond(pin, essai.o_pin_hash))) {
    return NextResponse.json({ erreur: MESSAGE_INCORRECT }, { status: 401 });
  }

  await admin
    .from("identifiants_telephone")
    .update({ echecs: 0, verrouille_jusqua: null })
    .eq("utilisateur_id", essai.o_utilisateur);

  const compte = await compteOuvrable(admin, essai.o_utilisateur);
  if (compte.erreur) return NextResponse.json({ erreur: compte.erreur }, { status: 403 });

  const session = await ouvrirSession(admin, essai.o_utilisateur);
  if (session.erreur) return NextResponse.json({ erreur: session.erreur }, { status: 403 });

  // Seul un patient s’inscrit par téléphone (`/api/telephone/inscription`).
  return NextResponse.json({ ok: true, cible: "/patient" });
}
