import { NextResponse } from "next/server";
import { tracerAuditServeur, verifierAdmin } from "@/lib/gardes-serveur";

/*
 * Suspension et réactivation d'un compte membre (/espace-admin/utilisateurs).
 *
 * L'écran écrivait `statut` directement depuis le navigateur. Deux choses
 * lui échappaient, et la sanction ne valait rien :
 *
 *   - la personne suspendue gardait sa SESSION. La base refusait ses
 *     écritures sensibles, mais elle continuait de lire son espace jusqu'à
 *     l'expiration de son jeton. Fermer la session demande l'API auth admin,
 *     donc la clé service_role, donc une route serveur ;
 *   - rien ne disait que la suspension venait de l'administration : l'écran
 *     « Votre compte est en pause » offrait son bouton de réactivation à la
 *     personne sanctionnée (migration 0051, qui nomme désormais la mesure).
 *
 * Deux refus, comme à la fermeture de compte : ni son propre compte — on se
 * bannirait sans recours — ni celui d'un administrateur, qui relève de
 * /espace-admin/equipe et de ses propres règles.
 */

const BANNISSEMENT_PERMANENT = "876000h"; // 100 ans

export async function POST(request: Request) {
  const garde = await verifierAdmin("utilisateurs");
  if ("refus" in garde) return garde.refus;
  const { admin, appelantId } = garde.acces;

  const corps = await request.json().catch(() => null);
  const id = typeof corps?.id === "string" ? corps.id : "";
  if (!id || typeof corps?.actif !== "boolean") {
    return NextResponse.json({ erreur: "Compte ou état demandé non précisé." }, { status: 400 });
  }
  const actif = corps.actif as boolean;

  if (id === appelantId) {
    return NextResponse.json(
      { erreur: "Vous ne pouvez pas suspendre votre propre compte administrateur." },
      { status: 400 }
    );
  }

  const { data: cible } = await admin
    .from("utilisateurs")
    .select("role, statut, nom, prenom, email")
    .eq("id", id)
    .maybeSingle();
  if (!cible) return NextResponse.json({ erreur: "Compte introuvable." }, { status: 404 });
  if (cible.role === "admin") {
    return NextResponse.json(
      { erreur: "Un compte administrateur se gère depuis « Équipe admin »." },
      { status: 403 }
    );
  }
  if (cible.statut === "supprime") {
    return NextResponse.json({ erreur: "Ce compte est fermé." }, { status: 409 });
  }

  const { error } = await admin
    .from("utilisateurs")
    .update({
      statut: actif ? "actif" : "suspendu",
      // La provenance de la mesure : c'est elle qui interdit au titulaire de
      // se réactiver lui-même depuis « Mon compte ».
      suspendu_par_admin: !actif,
    })
    .eq("id", id);
  if (error) return NextResponse.json({ erreur: error.message }, { status: 400 });

  const { error: eAuth } = await admin.auth.admin.updateUserById(id, {
    ban_duration: actif ? "none" : BANNISSEMENT_PERMANENT,
  });
  if (eAuth) return NextResponse.json({ erreur: eAuth.message }, { status: 400 });

  const nom = `${cible.prenom ?? ""} ${cible.nom ?? ""}`.trim() || cible.email;
  await tracerAuditServeur(
    admin,
    appelantId,
    actif ? "A réactivé un compte" : "A suspendu un compte",
    `${nom} · ${cible.role}`,
    id
  );

  return NextResponse.json({ ok: true });
}
