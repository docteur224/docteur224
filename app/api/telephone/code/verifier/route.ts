import { NextResponse } from "next/server";
import { clientServiceRole } from "@/lib/gardes-serveur";
import { versTelephoneInternational } from "@/lib/telephone";
import { LONGUEUR_CODE, type ObjetCode } from "@/lib/pin";
import { empreinte, empreinteCode, tirerJeton } from "@/lib/auth-telephone-serveur";

/*
 * Vérification du code reçu.
 *
 * Le code reconnu est échangé contre un JETON à usage unique (vingt minutes) :
 * c'est lui qui autorise ensuite la création du compte ou le nouveau PIN. Le
 * code ne sert donc qu'une fois, et l'étape finale n'a pas à le redemander.
 *
 * Cinq essais par code, réservés en base avant la comparaison (voir
 * `reserver_essai_code`, migration 0077).
 */

const OBJETS = new Set<ObjetCode>(["inscription", "pin_oublie"]);
const MESSAGE_INCORRECT = "Code incorrect ou expiré.";

export async function POST(requete: Request) {
  const corps = await requete.json().catch(() => null);
  const telephone = versTelephoneInternational(String(corps?.telephone ?? ""));
  const objet = corps?.objet as ObjetCode;
  const code = String(corps?.code ?? "");

  if (!telephone || !OBJETS.has(objet)) {
    return NextResponse.json({ erreur: "Requête invalide." }, { status: 400 });
  }
  if (!new RegExp(`^\\d{${LONGUEUR_CODE}}$`).test(code)) {
    return NextResponse.json({ erreur: "Saisissez les 6 chiffres du code reçu." }, { status: 400 });
  }

  const admin = clientServiceRole();
  const { data } = await admin.rpc("reserver_essai_code", { p_telephone: telephone, p_objet: objet });
  const essai = (data as { o_id: string; o_code_hash: string }[] | null)?.[0];
  if (!essai || empreinteCode(essai.o_id, code) !== essai.o_code_hash) {
    return NextResponse.json(
      { erreur: essai ? MESSAGE_INCORRECT : "Code expiré ou trop d’essais. Demandez un nouveau code." },
      { status: 400 }
    );
  }

  const jeton = tirerJeton();
  await admin
    .from("codes_telephone")
    .update({ verifie_le: new Date().toISOString(), jeton_hash: empreinte(jeton) })
    .eq("id", essai.o_id);

  return NextResponse.json({ jeton });
}
