import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { creerClientServeur } from "@/lib/supabase/server";
import { supprimerCompte, type RoleSupprimable } from "@/lib/suppression-compte";

/*
 * Fermeture d'un compte par l'administrateur (/espace-admin/utilisateurs).
 *
 * Côté serveur parce que l'opération touche l'API auth admin (changement
 * d'e-mail et bannissement), qui exige la clé service_role : la RLS seule
 * ne suffit pas, un administrateur ne peut pas bannir depuis le navigateur.
 *
 * Deux garde-fous, sans lesquels l'écran se retourne contre son
 * utilisateur : on ne ferme ni son propre compte — l'administrateur se
 * bannirait lui-même, sans recours dans l'interface — ni celui d'un autre
 * administrateur, qui relève d'une décision hors application.
 */

const ROLES_SUPPRIMABLES = new Set<RoleSupprimable>([
  "patient",
  "medecin",
  "etablissement",
  "assistant",
]);

export async function POST(request: Request) {
  const session = await creerClientServeur();
  const { data: auth } = await session.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ erreur: "Session expirée — reconnectez-vous." }, { status: 401 });
  }

  const { id } = await request.json().catch(() => ({ id: null }));
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ erreur: "Compte à supprimer non précisé." }, { status: 400 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Le rôle est relu en base, jamais déduit de ce que poste l'appelant.
  const { data: appelant } = await admin
    .from("utilisateurs")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (appelant?.role !== "admin") {
    return NextResponse.json({ erreur: "Réservé aux administrateurs." }, { status: 403 });
  }

  if (id === auth.user.id) {
    return NextResponse.json(
      { erreur: "Vous ne pouvez pas supprimer votre propre compte administrateur." },
      { status: 400 }
    );
  }

  const { data: cible } = await admin
    .from("utilisateurs")
    .select("role, statut")
    .eq("id", id)
    .maybeSingle();
  if (!cible) {
    return NextResponse.json({ erreur: "Compte introuvable." }, { status: 404 });
  }
  if (cible.role === "admin") {
    return NextResponse.json(
      { erreur: "Un compte administrateur ne se supprime pas depuis cet écran." },
      { status: 403 }
    );
  }
  if (!ROLES_SUPPRIMABLES.has(cible.role as RoleSupprimable)) {
    return NextResponse.json({ erreur: `Rôle non pris en charge : ${cible.role}.` }, { status: 400 });
  }
  if (cible.statut === "supprime") {
    return NextResponse.json({ erreur: "Ce compte est déjà supprimé." }, { status: 409 });
  }

  const { erreur } = await supprimerCompte(admin, id, cible.role as RoleSupprimable);
  if (erreur) return NextResponse.json({ erreur }, { status: 400 });

  // Écriture directe plutôt que la RPC `ecrire_audit` : celle-ci renseigne
  // l'acteur avec auth.uid(), nul sous service_role, ce qui effacerait
  // justement l'information la plus importante — qui a fermé le compte.
  await admin.from("journal_audit").insert({
    action: "A supprimé un compte",
    acteur_id: auth.user.id,
    cible_type: "utilisateur",
    cible_id: id,
    details: { cible: `${cible.role} · ${id}` },
  });

  return NextResponse.json({ ok: true });
}
