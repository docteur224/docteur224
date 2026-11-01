import { NextResponse } from "next/server";
import { creerClientServeur } from "@/lib/supabase/server";
import { oauthConfigure } from "@/lib/agenda-google/oauth";

/*
 * Statut de MA connexion Google Agenda, pour l'écran Paramètres.
 *
 * `configure` dit si la plateforme est prête (identifiants Google présents) ;
 * tant qu'elle ne l'est pas, l'écran affiche « bientôt disponible ». Le statut
 * lui-même vient de la fonction `etat_agenda_google` (auth.uid()), qui ne rend
 * jamais le jeton — seulement connecté oui/non et l'adresse Google.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await creerClientServeur();
  const { data: auth } = await session.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ erreur: "Session expirée — reconnectez-vous." }, { status: 401 });
  }

  const { data } = await session.rpc("etat_agenda_google");
  const ligne = (data as { connecte: boolean; email: string | null }[] | null)?.[0];
  return NextResponse.json({
    configure: oauthConfigure(),
    connecte: Boolean(ligne?.connecte),
    email: ligne?.email ?? null,
  });
}
