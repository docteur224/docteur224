import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { creerClientServeur } from "@/lib/supabase/server";
import { supprimerCompte } from "@/lib/suppression-compte";

/*
 * Suppression de son propre compte patient (écran /patient/parametres).
 *
 * Les règles — anonymisation, annulation des rendez-vous à venir, sort des
 * proches, bannissement — vivent dans lib/suppression-compte.ts, partagées
 * avec la fermeture de compte par l'administrateur.
 *
 * Réservé aux patients : un médecin ou un établissement a une fiche
 * publique et un abonnement, sa clôture passe par le support ou par
 * l'administrateur.
 */

export async function POST() {
  const supabase = await creerClientServeur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ erreur: "Session expirée — reconnectez-vous." }, { status: 401 });
  }
  const id = auth.user.id;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: utilisateur } = await admin
    .from("utilisateurs")
    .select("role")
    .eq("id", id)
    .single();
  if (!utilisateur) {
    return NextResponse.json({ erreur: "Compte introuvable." }, { status: 404 });
  }
  if (utilisateur.role !== "patient") {
    return NextResponse.json(
      { erreur: "Seuls les comptes patients se suppriment ici. Contactez le support." },
      { status: 403 }
    );
  }

  const { erreur } = await supprimerCompte(admin, id, "patient");
  if (erreur) return NextResponse.json({ erreur }, { status: 400 });

  return NextResponse.json({ ok: true });
}
