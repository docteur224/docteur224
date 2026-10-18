import { NextResponse } from "next/server";
import { creerClientServeur } from "@/lib/supabase/server";
import { envoyerMessageRdv } from "@/lib/rdv-messages";

/*
 * Confirmation d'un rendez-vous par le praticien (ou son assistant), avec
 * l'avis au patient.
 *
 * Jusqu'ici la confirmation se faisait par un UPDATE depuis le navigateur :
 * le statut passait bien, le trigger `rdv_notifie` posait une notification
 * dans l'application — et c'était tout. Un patient qui n'ouvre pas
 * l'application entre deux rendez-vous n'apprenait donc jamais que le sien
 * était confirmé. Le centre d'appel, lui, envoyait un SMS depuis le début
 * (app/api/admin/rdv-centre-appel). Cette route met les deux chemins au même
 * niveau.
 *
 * Côté serveur par nécessité : `lib/messagerie` lit des secrets et appelle
 * `enregistrer_message`, qui n'est accordée qu'à la service_role.
 *
 * Le statut, lui, s'écrit avec la session de l'appelant : c'est la RLS
 * (upd_rdv_medecin / upd_rdv_assistant) qui décide s'il en a le droit, et
 * non cette route. Un rendez-vous qui n'est pas le sien ne bouge pas.
 */

export async function POST(_requete: Request, ctx: RouteContext<"/api/medecin/rdv/[id]/confirmer">) {
  const supabase = await creerClientServeur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ erreur: "Session expirée — reconnectez-vous." }, { status: 401 });
  }
  const { id } = await ctx.params;

  // Relu avant d'écrire : confirmer un rendez-vous dont l'heure est passée
  // n'a pas de sens — à ce stade il se qualifie (honoré ou absent).
  const { data: rdv } = await supabase
    .from("rendez_vous")
    .select("id, date, heure, statut")
    .eq("id", id)
    .maybeSingle();
  if (!rdv) {
    return NextResponse.json({ erreur: "Rendez-vous introuvable." }, { status: 404 });
  }
  if (rdv.statut === "annule") {
    return NextResponse.json({ erreur: "Ce rendez-vous est annulé." }, { status: 400 });
  }
  if (`${rdv.date} ${String(rdv.heure).slice(0, 5)}` <= horodatageLocal()) {
    return NextResponse.json(
      { erreur: "Ce rendez-vous est passé : qualifiez-le plutôt (honoré ou absent)." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("rendez_vous")
    .update({ statut: "confirme" })
    .eq("id", id)
    .select("id");
  if (error) return NextResponse.json({ erreur: error.message }, { status: 400 });
  // Un UPDATE bloqué par la RLS ne lève pas : il ne touche aucune ligne.
  if (!data?.length) {
    return NextResponse.json({ erreur: "Ce rendez-vous n’est pas le vôtre." }, { status: 403 });
  }

  // L'envoi ne lève jamais et ne conditionne pas la réponse : le rendez-vous
  // est confirmé même si l'agrégateur est en panne. L'écran dit simplement
  // si le patient a été prévenu.
  const envoi = await envoyerMessageRdv(id, "confirmation");
  return NextResponse.json({
    ok: true,
    previenu: !!envoi.canalTelephone || envoi.emailEnvoye,
    envoi,
  });
}

/** « AAAA-MM-JJ HH:MM » — la Guinée est à UTC+0, le serveur aussi. */
function horodatageLocal(): string {
  const d = new Date();
  const p = (n: number) => `${n}`.padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    ` ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
  );
}
