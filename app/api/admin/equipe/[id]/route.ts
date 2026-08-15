import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tracerAuditServeur, verifierAdmin } from "@/lib/garde-admin";

/*
 * Désactivation, réactivation et fermeture d'un compte administrateur.
 *
 * Ces trois gestes passent par le serveur : ils touchent l'API auth admin
 * (bannissement, changement d'adresse), qui exige la clé service_role.
 *
 * Trois refus systématiques, sans lesquels l'écran se retourne contre son
 * utilisateur ou contre la plateforme :
 *   - son propre compte : on se fermerait la porte sans recours ;
 *   - le compte principal : c'est le dernier recours quand plus personne
 *     ne peut rendre la main ;
 *   - un compte qui n'est pas administrateur : les comptes membres se
 *     ferment depuis /espace-admin/utilisateurs, avec ses propres règles
 *     (rendez-vous à annuler, dossiers à conserver).
 */

const BANNISSEMENT_PERMANENT = "876000h"; // 100 ans

/** Contrôles communs à la modification et à la fermeture. */
async function cible(
  admin: SupabaseClient,
  appelantId: string,
  id: string
): Promise<{ erreur: NextResponse } | { compte: { nom: string; email: string } }> {
  if (id === appelantId) {
    return {
      erreur: NextResponse.json(
        { erreur: "Vous ne pouvez pas agir sur votre propre compte administrateur." },
        { status: 400 }
      ),
    };
  }
  const { data } = await admin
    .from("utilisateurs")
    .select("role, statut, nom, prenom, email, admin_principal")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { erreur: NextResponse.json({ erreur: "Compte introuvable." }, { status: 404 }) };
  if (data.role !== "admin") {
    return {
      erreur: NextResponse.json(
        { erreur: "Ce compte n’est pas un compte administrateur." },
        { status: 400 }
      ),
    };
  }
  if (data.admin_principal) {
    return {
      erreur: NextResponse.json(
        { erreur: "Le compte administrateur principal ne peut être ni désactivé ni supprimé." },
        { status: 403 }
      ),
    };
  }
  if (data.statut === "supprime") {
    return { erreur: NextResponse.json({ erreur: "Ce compte est déjà fermé." }, { status: 409 }) };
  }
  return {
    compte: {
      nom: `${data.prenom ?? ""} ${data.nom ?? ""}`.trim() || data.email,
      email: data.email,
    },
  };
}

/** Activer ou désactiver le compte : `{ actif: boolean }`. */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/admin/equipe/[id]">) {
  const garde = await verifierAdmin("equipe");
  if ("refus" in garde) return garde.refus;
  const { admin, appelantId } = garde.acces;
  const { id } = await ctx.params;

  const corps = await request.json().catch(() => null);
  if (typeof corps?.actif !== "boolean") {
    return NextResponse.json({ erreur: "État demandé non précisé." }, { status: 400 });
  }
  const actif = corps.actif as boolean;

  const controle = await cible(admin, appelantId, id);
  if ("erreur" in controle) return controle.erreur;

  const { error } = await admin
    .from("utilisateurs")
    .update({ statut: actif ? "actif" : "suspendu" })
    .eq("id", id);
  if (error) return NextResponse.json({ erreur: error.message }, { status: 400 });

  /*
   * Le bannissement ferme la session en cours. Sans lui, un administrateur
   * désactivé garderait sa console ouverte jusqu'à expiration de son jeton —
   * la base refuserait ses écritures (`est_admin()` exige `statut = 'actif'`),
   * mais il continuerait de LIRE ce qu'il n'a plus à voir.
   */
  const { error: eAuth } = await admin.auth.admin.updateUserById(id, {
    ban_duration: actif ? "none" : BANNISSEMENT_PERMANENT,
  });
  if (eAuth) return NextResponse.json({ erreur: eAuth.message }, { status: 400 });

  await tracerAuditServeur(
    admin,
    appelantId,
    actif ? "A réactivé un compte administrateur" : "A désactivé un compte administrateur",
    controle.compte.nom,
    id
  );
  return NextResponse.json({ ok: true });
}

/**
 * Fermeture définitive.
 *
 * Ce n'est volontairement pas un DELETE : `journal_audit.acteur_id`
 * référence `utilisateurs` sans cascade, et effacer la ligne effacerait la
 * trace de toutes les décisions prises par cette personne. On anonymise,
 * on retire les droits, on bannit — dans cet ordre, l'irréversible en
 * dernier.
 */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/admin/equipe/[id]">) {
  const garde = await verifierAdmin("equipe");
  if ("refus" in garde) return garde.refus;
  const { admin, appelantId } = garde.acces;
  const { id } = await ctx.params;

  const controle = await cible(admin, appelantId, id);
  if ("erreur" in controle) return controle.erreur;

  // L'adresse doit changer côté auth aussi, sinon elle reste prise et le
  // compte ne pourra jamais être recréé.
  const emailAnonyme = `supprime-${id}@docteur224.com`;
  const { error: eAuth } = await admin.auth.admin.updateUserById(id, {
    email: emailAnonyme,
    email_confirm: true,
  });
  if (eAuth) return NextResponse.json({ erreur: eAuth.message }, { status: 400 });

  await admin.from("notifications").delete().eq("destinataire_id", id);

  const { error } = await admin
    .from("utilisateurs")
    .update({
      nom: "Compte",
      prenom: "supprimé",
      email: emailAnonyme,
      telephone: null,
      statut: "supprime",
      sous_roles_admin: [],
    })
    .eq("id", id);
  if (error) return NextResponse.json({ erreur: error.message }, { status: 400 });

  await admin.auth.admin.updateUserById(id, { ban_duration: BANNISSEMENT_PERMANENT });

  await tracerAuditServeur(
    admin,
    appelantId,
    "A supprimé un compte administrateur",
    `${controle.compte.nom} · ${controle.compte.email}`,
    id
  );
  return NextResponse.json({ ok: true });
}
