import { NextResponse } from "next/server";
import { appelantLegitime } from "@/lib/drain-acces";
import { drainerRappels } from "@/lib/rappels/drain";

/*
 * Vidange de la file des rappels SMS/WhatsApp (migration 0066), seule.
 *
 * En production, la route des e-mails la déclenche déjà chaque minute
 * (/api/emails/drainer). Celle-ci existe pour la déclencher À PART —
 * vérification, diagnostic — sans toucher à la file d'e-mails.
 */
export const maxDuration = 60;

export async function POST(requete: Request) {
  if (!(await appelantLegitime(requete))) {
    return NextResponse.json({ erreur: "Appel non autorisé." }, { status: 401 });
  }
  return NextResponse.json(await drainerRappels());
}
