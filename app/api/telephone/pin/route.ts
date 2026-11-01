import { NextResponse } from "next/server";
import { clientServiceRole } from "@/lib/gardes-serveur";
import { creerClientServeur } from "@/lib/supabase/server";
import { versTelephoneInternational } from "@/lib/telephone";
import { LONGUEUR_PIN, MESSAGE_PIN, pinValide } from "@/lib/pin";
import {
  compteOuvrable,
  hacherPin,
  lireJeton,
  marquerJetonUtilise,
  ouvrirSession,
  pinCorrespond,
} from "@/lib/auth-telephone-serveur";

/*
 * Le code PIN d'un compte téléphone.
 *
 *   GET  — le compte connecté a-t-il un PIN ? (l'écran « Mon compte » montre
 *          alors le bloc PIN au lieu du mot de passe, qu'il ne connaît pas) ;
 *   POST — PIN oublié : le numéro vient d'être prouvé par un code (jeton), le
 *          nouveau PIN remplace l'ancien et la session s'ouvre ;
 *   PUT  — modification, connecté : l'ancien PIN est exigé, sans quoi une
 *          session laissée ouverte suffirait à s'approprier le compte.
 */

async function utilisateurConnecte(): Promise<string | null> {
  const supabase = await creerClientServeur();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function GET() {
  const id = await utilisateurConnecte();
  if (!id) return NextResponse.json({ erreur: "Session expirée." }, { status: 401 });
  const { data } = await clientServiceRole()
    .from("identifiants_telephone")
    .select("telephone, pin_modifie_le")
    .eq("utilisateur_id", id)
    .maybeSingle();
  return NextResponse.json({
    telephone: data?.telephone ?? null,
    pinModifieLe: data?.pin_modifie_le ?? null,
  });
}

export async function POST(requete: Request) {
  const corps = await requete.json().catch(() => null);
  const telephone = versTelephoneInternational(String(corps?.telephone ?? ""));
  const pin = String(corps?.pin ?? "");
  if (!telephone) return NextResponse.json({ erreur: "Requête invalide." }, { status: 400 });
  if (!pinValide(pin)) return NextResponse.json({ erreur: MESSAGE_PIN }, { status: 400 });

  const admin = clientServiceRole();
  const ligneJeton = await lireJeton(admin, corps?.jeton, telephone, "pin_oublie");
  if (!ligneJeton) {
    return NextResponse.json(
      { erreur: "La vérification a expiré. Redemandez un code.", jetonExpire: true },
      { status: 400 }
    );
  }
  const { data: identifiant } = await admin
    .from("identifiants_telephone")
    .select("utilisateur_id")
    .eq("telephone", telephone)
    .maybeSingle();
  if (!identifiant) return NextResponse.json({ erreur: "Compte introuvable." }, { status: 404 });

  const compte = await compteOuvrable(admin, identifiant.utilisateur_id);
  if (compte.erreur) return NextResponse.json({ erreur: compte.erreur }, { status: 403 });

  // Le numéro est prouvé : le verrou des échecs n'a plus lieu d'être.
  const { error } = await admin
    .from("identifiants_telephone")
    .update({
      pin_hash: await hacherPin(pin),
      echecs: 0,
      verrouille_jusqua: null,
      pin_modifie_le: new Date().toISOString(),
    })
    .eq("utilisateur_id", identifiant.utilisateur_id);
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
  await marquerJetonUtilise(admin, ligneJeton);

  const session = await ouvrirSession(admin, identifiant.utilisateur_id);
  if (session.erreur) return NextResponse.json({ ok: true, cible: "/connexion" });
  return NextResponse.json({ ok: true, cible: "/patient" });
}

export async function PUT(requete: Request) {
  const id = await utilisateurConnecte();
  if (!id) return NextResponse.json({ erreur: "Session expirée — reconnectez-vous." }, { status: 401 });

  const corps = await requete.json().catch(() => null);
  const actuel = String(corps?.actuel ?? "");
  const nouveau = String(corps?.nouveau ?? "");
  if (!new RegExp(`^\\d{${LONGUEUR_PIN}}$`).test(actuel)) {
    return NextResponse.json({ erreur: "Saisissez votre code PIN actuel." }, { status: 400 });
  }
  if (!pinValide(nouveau)) return NextResponse.json({ erreur: MESSAGE_PIN }, { status: 400 });
  if (nouveau === actuel) {
    return NextResponse.json({ erreur: "Le nouveau code PIN doit être différent de l’actuel." }, { status: 400 });
  }

  const admin = clientServiceRole();
  const { data: identifiant } = await admin
    .from("identifiants_telephone")
    .select("telephone")
    .eq("utilisateur_id", id)
    .maybeSingle();
  if (!identifiant) return NextResponse.json({ erreur: "Ce compte n’a pas de code PIN." }, { status: 404 });

  // Même compteur que la connexion : la modification ne doit pas devenir un
  // second guichet pour essayer les dix mille PIN.
  const { data } = await admin.rpc("reserver_essai_pin", { p_telephone: identifiant.telephone });
  const essai = (data as { o_pin_hash: string | null }[] | null)?.[0];
  if (!essai?.o_pin_hash) {
    return NextResponse.json({ erreur: "Trop d’essais. Réessayez dans un quart d’heure." }, { status: 429 });
  }
  if (!(await pinCorrespond(actuel, essai.o_pin_hash))) {
    return NextResponse.json({ erreur: "Code PIN actuel incorrect." }, { status: 400 });
  }

  const { error } = await admin
    .from("identifiants_telephone")
    .update({
      pin_hash: await hacherPin(nouveau),
      echecs: 0,
      verrouille_jusqua: null,
      pin_modifie_le: new Date().toISOString(),
    })
    .eq("utilisateur_id", id);
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
