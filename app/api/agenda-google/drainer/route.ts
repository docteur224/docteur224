import { NextResponse } from "next/server";
import { appelantLegitime } from "@/lib/drain-acces";
import { drainerAgendaGoogle } from "@/lib/agenda-google/drain";

/*
 * Vidange de la file de synchronisation Google Agenda (migration 0084), seule.
 *
 * En production, la route des e-mails la déclenche déjà chaque minute
 * (/api/emails/drainer), comme celle des rappels : un seul travail pg_cron
 * suffit. Celle-ci existe pour la déclencher À PART — vérification,
 * diagnostic — sans toucher aux autres files.
 *
 * Même garde que les autres drainers (`appelantLegitime`) : la clé du
 * planificateur, ou la session d'un utilisateur connecté. Sans danger, car
 * la route N'ACCEPTE AUCUN CONTENU : elle ne fait que vider une file que
 * seuls des triggers remplissent.
 */
export const maxDuration = 60;

export async function POST(requete: Request) {
  if (!(await appelantLegitime(requete))) {
    return NextResponse.json(
      { erreur: "Appel non autorisé.", cleConfiguree: !!process.env.EMAIL_CLE_DRAIN },
      { status: 401 },
    );
  }
  return NextResponse.json(await drainerAgendaGoogle());
}
