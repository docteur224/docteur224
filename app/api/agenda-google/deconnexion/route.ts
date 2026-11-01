import { NextResponse } from "next/server";
import { verifierPatient } from "@/lib/gardes-serveur";
import { revoquer } from "@/lib/agenda-google/oauth";
import { dechiffrer } from "@/lib/agenda-google/chiffrement";

/*
 * Déconnexion de Google Agenda (patient uniquement) : on révoque le jeton chez
 * Google puis on efface la ligne. Effacer plutôt que marquer « révoqué » : pas
 * de ligne = pas connecté, c'est la même règle que la fonction de statut.
 */
export async function POST() {
  const garde = await verifierPatient();
  if ("refus" in garde) return garde.refus;
  const { admin, patientId } = garde.acces;

  const { data } = await admin
    .from("agenda_google_comptes")
    .select("refresh_token_chiffre")
    .eq("utilisateur_id", patientId)
    .maybeSingle();

  if (data?.refresh_token_chiffre) {
    try {
      await revoquer(dechiffrer(data.refresh_token_chiffre));
    } catch {
      /* jeton illisible ou Google injoignable : on efface tout de même la ligne */
    }
  }
  await admin.from("agenda_google_comptes").delete().eq("utilisateur_id", patientId);
  return NextResponse.json({ ok: true });
}
