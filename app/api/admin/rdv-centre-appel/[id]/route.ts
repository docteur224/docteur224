import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { creerClientServeur } from "@/lib/supabase/server";
import { envoyerMessageRdv } from "@/lib/rdv-messages";

/*
 * Reprendre un rendez-vous posé au téléphone : le déplacer (PUT) ou l'annuler
 * (PATCH). Les deux gestes préviennent le patient — c'est précisément ce qui
 * les distingue d'une modification silencieuse en base, et ce qui justifie
 * qu'ils passent par le serveur (voir la route parente).
 *
 * La SUPPRESSION n'est pas ici : elle ne concerne qu'un rendez-vous déjà
 * annulé, donc déjà notifié. Il n'y a rien à annoncer, l'écran appelle
 * directement `supprimer_rdv_centre_appel`.
 */

async function sessionAdmin() {
  const session = await creerClientServeur();
  const { data: auth } = await session.auth.getUser();
  if (!auth.user) {
    return {
      refus: NextResponse.json({ erreur: "Session expirée — reconnectez-vous." }, { status: 401 }),
    };
  }
  return { session };
}

/** Les refus des fonctions SQL sont rédigés en français : on les rend tels quels. */
function refusSql(error: { code?: string; message: string }) {
  return NextResponse.json({ erreur: error.message }, {
    status: error.code === "42501" ? 403 : 400,
  });
}

/** Déplacer le rendez-vous. */
export async function PUT(
  requete: NextRequest,
  ctx: RouteContext<"/api/admin/rdv-centre-appel/[id]">
) {
  const acces = await sessionAdmin();
  if ("refus" in acces) return acces.refus;
  const { id } = await ctx.params;

  let corps: { date?: string; heure?: string; motif?: string };
  try {
    corps = await requete.json();
  } catch {
    return NextResponse.json({ erreur: "Requête illisible." }, { status: 400 });
  }
  if (!corps.date || !corps.heure) {
    return NextResponse.json({ erreur: "Date et heure sont exigées." }, { status: 400 });
  }

  const { error } = await acces.session.rpc("reprogrammer_rdv_centre_appel", {
    p_rdv: id,
    p_date: corps.date,
    p_heure: corps.heure,
    p_motif: corps.motif || null,
  });
  if (error) return refusSql(error);

  const envoi = await envoyerMessageRdv(id, "deplacement");
  return NextResponse.json({ ok: true, envoi });
}

/** Annuler le rendez-vous. Le motif est exigé par la fonction SQL. */
export async function PATCH(
  requete: NextRequest,
  ctx: RouteContext<"/api/admin/rdv-centre-appel/[id]">
) {
  const acces = await sessionAdmin();
  if ("refus" in acces) return acces.refus;
  const { id } = await ctx.params;

  let corps: { motif?: string };
  try {
    corps = await requete.json();
  } catch {
    return NextResponse.json({ erreur: "Requête illisible." }, { status: 400 });
  }

  const { error } = await acces.session.rpc("annuler_rdv_centre_appel", {
    p_rdv: id,
    p_motif: corps.motif ?? "",
  });
  if (error) return refusSql(error);

  const envoi = await envoyerMessageRdv(id, "annulation");
  return NextResponse.json({ ok: true, envoi });
}
