import { NextResponse } from "next/server";
import { tracerAuditServeur, verifierAdmin } from "@/lib/gardes-serveur";

/*
 * Réinitialisation de la 2FA d'un administrateur, par l'administrateur PRINCIPAL.
 *
 * Le recours quand un membre de l'équipe perd son téléphone : on retire ses
 * facteurs côté Supabase, et sa prochaine connexion n'exige plus de code (il
 * devra s'enrôler de nouveau si l'interrupteur « 2FA obligatoire » est posé).
 *
 * Réservé au compte principal — comme le reste des gestes sensibles sur
 * l'équipe. Le principal lui-même, s'il se verrouille, passe par le script de
 * secours `scripts/reinitialiser-2fa.mjs` (clé de service, hors application).
 *
 * `verifierAdmin()` impose déjà au principal une session AAL2 : on ne
 * réinitialise pas la 2FA d'autrui depuis une session elle-même non vérifiée.
 */
export async function POST(request: Request) {
  const garde = await verifierAdmin();
  if ("refus" in garde) return garde.refus;
  const { admin, appelantId, principal } = garde.acces;

  if (!principal) {
    return NextResponse.json(
      { erreur: "Seul l’administrateur principal peut réinitialiser la 2FA d’un compte." },
      { status: 403 }
    );
  }

  const { utilisateurId } = await request.json().catch(() => ({}));
  if (typeof utilisateurId !== "string" || !utilisateurId) {
    return NextResponse.json({ erreur: "Requête invalide." }, { status: 400 });
  }
  if (utilisateurId === appelantId) {
    return NextResponse.json(
      { erreur: "Pour votre propre compte, utilisez le script de secours." },
      { status: 400 }
    );
  }

  const { data: cible } = await admin
    .from("utilisateurs")
    .select("role, nom, prenom, email")
    .eq("id", utilisateurId)
    .maybeSingle();
  if (!cible || cible.role !== "admin") {
    return NextResponse.json({ erreur: "Compte administrateur introuvable." }, { status: 404 });
  }

  const { data: facteurs, error: eList } = await admin.auth.admin.mfa.listFactors({
    userId: utilisateurId,
  });
  if (eList) {
    return NextResponse.json({ erreur: "Lecture des facteurs impossible." }, { status: 500 });
  }
  for (const f of facteurs?.factors ?? []) {
    await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: utilisateurId });
  }

  const nom = `${cible.prenom ?? ""} ${cible.nom ?? ""}`.trim() || cible.email;
  await tracerAuditServeur(
    admin,
    appelantId,
    "A réinitialisé la vérification en deux étapes d’un administrateur",
    `${nom} · admin`,
    utilisateurId
  );

  return NextResponse.json({ ok: true });
}
