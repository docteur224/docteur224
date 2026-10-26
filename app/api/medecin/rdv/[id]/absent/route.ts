import { NextResponse } from "next/server";
import { creerClientServeur } from "@/lib/supabase/server";
import { envoyerMessageRdv } from "@/lib/rdv-messages";

/*
 * No-show : le patient avait rendez-vous et ne s'est pas présenté.
 *
 * Calquée sur /confirmer, et pour la même raison : le statut, lui, pourrait
 * s'écrire depuis le navigateur, mais l'AVIS au patient (SMS / e-mail) ne le
 * peut pas — `lib/messagerie` lit des secrets et débite un quota. On met donc
 * les deux au même endroit : la qualification passe par la fonction
 * `qualifier_rdv` (elle seule décide des transitions et journalise), puis le
 * courriel part.
 *
 * Trois règles du cahier des charges tiennent ici :
 *   • l'échec d'envoi ne bloque JAMAIS la mise à jour du statut — l'envoi est
 *     tenté après coup et n'influe pas sur le statut déjà écrit ;
 *   • pas de double notification : si le rendez-vous est DÉJÀ « absent », on
 *     ne réécrit rien et on ne renvoie pas de message ;
 *   • une correction qui repasse un rendez-vous en « absent » (p_correction)
 *     re-notifie : c'est un nouveau constat.
 *
 * Le statut s'écrit avec la session de l'appelant : c'est `qualifier_rdv`
 * (SECURITY DEFINER) qui vérifie que le rendez-vous est bien le sien (médecin
 * ou assistant). Un rendez-vous qui n'est pas le sien lève et ne bouge pas.
 */
export async function POST(requete: Request, ctx: RouteContext<"/api/medecin/rdv/[id]/absent">) {
  const supabase = await creerClientServeur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ erreur: "Session expirée — reconnectez-vous." }, { status: 401 });
  }
  const { id } = await ctx.params;

  // Une correction explicite (ex. « honoré » marqué par erreur → « absent »)
  // lève la garde des transitions dans la fonction.
  const corps = await requete.json().catch(() => null);
  const correction = corps?.correction === true;

  const { data: rdv } = await supabase
    .from("rendez_vous")
    .select("id, statut")
    .eq("id", id)
    .maybeSingle();
  if (!rdv) {
    return NextResponse.json({ erreur: "Rendez-vous introuvable." }, { status: 404 });
  }
  // Déjà absent : ni réécriture, ni second message. On répond « ok » pour que
  // l'écran reste cohérent, sans prétendre avoir prévenu une deuxième fois.
  if (rdv.statut === "absent") {
    return NextResponse.json({ ok: true, previenu: false, dejaAbsent: true });
  }

  const { error } = await supabase.rpc("qualifier_rdv", {
    p_rdv_id: id,
    p_statut: "absent",
    p_correction: correction,
  });
  if (error) {
    return NextResponse.json({ erreur: error.message }, { status: 400 });
  }

  // Le statut est écrit ; l'envoi ne lève jamais et ne conditionne pas la
  // réponse. L'écran dit simplement si le patient a pu être prévenu.
  const envoi = await envoyerMessageRdv(id, "absence");
  return NextResponse.json({
    ok: true,
    previenu: !!envoi.canalTelephone || envoi.emailEnvoye,
    envoi,
  });
}
