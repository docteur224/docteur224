import { NextResponse } from "next/server";
import { clientServiceRole, tracerAuditServeur } from "@/lib/gardes-serveur";
import { creerClientServeur } from "@/lib/supabase/server";
import { supprimerCompte, type RoleSupprimable } from "@/lib/suppression-compte";

/*
 * Fermeture de SON PROPRE compte, depuis « Mon compte ».
 *
 * Les règles — anonymisation, annulation des rendez-vous à venir, sort des
 * proches, bannissement — vivent dans lib/suppression-compte.ts, partagées
 * avec la fermeture prononcée par l'administrateur.
 *
 * La route était réservée aux patients : un médecin, un(e) assistant(e), un
 * établissement ou un administrateur n'avait aucun moyen de partir. Elle est
 * ouverte à tous les rôles, avec deux refus qui tiennent à la structure de
 * la plateforme :
 *
 *   - le SUPER-ADMINISTRATEUR (compte principal, ou détenteur de toutes les
 *     permissions) : c'est le dernier recours quand plus personne ne peut
 *     rendre la main. Son compte se ferme depuis /espace-admin/equipe, par
 *     un pair — jamais par lui-même, sans témoin ;
 *   - un GESTIONNAIRE dont la structure emploie encore des médecins : les
 *     effacer par ricochet leur retirerait leur fiche et leurs rendez-vous.
 *     Il doit d'abord les détacher.
 */

export async function POST() {
  const supabase = await creerClientServeur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ erreur: "Session expirée — reconnectez-vous." }, { status: 401 });
  }
  const id = auth.user.id;
  const admin = clientServiceRole();

  const { data: utilisateur } = await admin
    .from("utilisateurs")
    .select("role, statut, admin_principal, sous_roles_admin")
    .eq("id", id)
    .maybeSingle();
  if (!utilisateur) {
    return NextResponse.json({ erreur: "Compte introuvable." }, { status: 404 });
  }
  if (utilisateur.statut === "supprime") {
    return NextResponse.json({ erreur: "Ce compte est déjà fermé." }, { status: 409 });
  }

  if (utilisateur.role === "admin") {
    // Le catalogue est lu en base : le jour où une permission s'ajoute, la
    // définition de « super-administrateur » suit toute seule.
    const { data: catalogue } = await admin.rpc("permissions_admin");
    const toutes = ((catalogue ?? []) as string[]).length;
    const siennes = ((utilisateur.sous_roles_admin ?? []) as string[]).length;
    if (utilisateur.admin_principal || (toutes > 0 && siennes >= toutes)) {
      return NextResponse.json(
        {
          erreur:
            "Un super-administrateur ne ferme pas son propre compte : demandez-le à un administrateur en charge de l’équipe.",
        },
        { status: 403 }
      );
    }
  }

  if (utilisateur.role === "etablissement") {
    const { data: etab } = await admin
      .from("etablissements")
      .select("id, medecins ( id )")
      .eq("gestionnaire_id", id)
      .maybeSingle();
    const rattaches = ((etab?.medecins ?? []) as { id: string }[]).length;
    if (rattaches > 0) {
      return NextResponse.json(
        {
          erreur: `${rattaches} médecin(s) sont encore rattaché(s) à votre établissement. Détachez-les depuis « Médecins » avant de fermer le compte.`,
        },
        { status: 409 }
      );
    }
  }

  const { erreur } = await supprimerCompte(admin, id, utilisateur.role as RoleSupprimable);
  if (erreur) return NextResponse.json({ erreur }, { status: 400 });

  // Un(e) assistant(e) qui part libère sa place dans l'équipe de son médecin
  // (le plafond de la formule compte les rattachements, migration 0044).
  if (utilisateur.role === "assistant") {
    await admin.from("assistants").delete().eq("id", id);
  }

  await tracerAuditServeur(admin, id, "A fermé son propre compte", utilisateur.role, id);

  return NextResponse.json({ ok: true });
}
