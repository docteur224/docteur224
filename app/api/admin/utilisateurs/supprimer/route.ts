import { NextResponse } from "next/server";
import { tracerAuditServeur, verifierAdmin } from "@/lib/gardes-serveur";
import { supprimerCompte, type RoleSupprimable } from "@/lib/suppression-compte";

/*
 * Fermeture d'un compte par l'administrateur (/espace-admin/utilisateurs).
 *
 * Côté serveur parce que l'opération touche l'API auth admin (changement
 * d'e-mail et bannissement), qui exige la clé service_role : la RLS seule
 * ne suffit pas, un administrateur ne peut pas bannir depuis le navigateur.
 *
 * La garde est celle de toutes les routes d'administration
 * (`verifierAdmin`) : elle exige un compte administrateur ACTIF — un compte
 * désactivé n'est plus administrateur, c'est ce qui donne son sens au
 * bouton « Désactiver » — et la permission « Utilisateurs ». La version
 * précédente ne lisait que le rôle : un administrateur suspendu, ou un
 * administrateur n'ayant que le journal d'audit, fermait le compte de
 * n'importe quel membre.
 *
 * Deux garde-fous s'y ajoutent, sans lesquels l'écran se retourne contre son
 * utilisateur : on ne ferme ni son propre compte — l'administrateur se
 * bannirait lui-même, sans recours dans l'interface — ni celui d'un autre
 * administrateur, qui relève de /espace-admin/equipe.
 */

const ROLES_SUPPRIMABLES = new Set<RoleSupprimable>([
  "patient",
  "medecin",
  "etablissement",
  "assistant",
]);

export async function POST(request: Request) {
  const garde = await verifierAdmin("utilisateurs");
  if ("refus" in garde) return garde.refus;
  const { admin, appelantId } = garde.acces;

  const { id } = await request.json().catch(() => ({ id: null }));
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ erreur: "Compte à supprimer non précisé." }, { status: 400 });
  }

  if (id === appelantId) {
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

  await tracerAuditServeur(
    admin,
    appelantId,
    "A supprimé un compte",
    `${cible.role} · ${id}`,
    id
  );

  return NextResponse.json({ ok: true });
}
