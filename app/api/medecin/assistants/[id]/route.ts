import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tracerAuditServeur, verifierMedecin } from "@/lib/gardes-serveur";
import { supprimerCompte } from "@/lib/suppression-compte";

/*
 * Désactivation, réactivation et fermeture d'un compte assistant(e).
 *
 * Ces gestes passent par le serveur : ils touchent l'API auth admin
 * (bannissement, changement d'adresse), qui exige la clé service_role.
 *
 * Un médecin n'agit que sur SES assistant(e)s — le rattachement est relu en
 * base à chaque appel, jamais déduit de ce que poste l'appelant.
 */

const BANNISSEMENT_PERMANENT = "876000h"; // 100 ans

async function cible(
  admin: SupabaseClient,
  medecinId: string,
  id: string
): Promise<{ erreur: NextResponse } | { compte: { nom: string; email: string } }> {
  const { data: rattachement } = await admin
    .from("assistants")
    .select("medecin_id")
    .eq("id", id)
    .maybeSingle();
  if (!rattachement || rattachement.medecin_id !== medecinId) {
    // Même réponse qu'un identifiant inconnu : distinguer les deux cas
    // dirait à un médecin curieux que ce compte existe ailleurs.
    return {
      erreur: NextResponse.json(
        { erreur: "Cet(te) assistant(e) ne fait pas partie de votre équipe." },
        { status: 404 }
      ),
    };
  }
  const { data } = await admin
    .from("utilisateurs")
    .select("nom, prenom, email, statut")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { erreur: NextResponse.json({ erreur: "Compte introuvable." }, { status: 404 }) };
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
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/medecin/assistants/[id]">) {
  const garde = await verifierMedecin();
  if ("refus" in garde) return garde.refus;
  const { admin, medecinId } = garde.acces;
  const { id } = await ctx.params;

  const corps = await request.json().catch(() => null);
  if (typeof corps?.actif !== "boolean") {
    return NextResponse.json({ erreur: "État demandé non précisé." }, { status: 400 });
  }
  const actif = corps.actif as boolean;

  const controle = await cible(admin, medecinId, id);
  if ("erreur" in controle) return controle.erreur;

  const { error } = await admin
    .from("utilisateurs")
    .update({ statut: actif ? "actif" : "suspendu" })
    .eq("id", id);
  if (error) return NextResponse.json({ erreur: error.message }, { status: 400 });

  // Le bannissement ferme la session en cours : sans lui, l'assistant(e)
  // désactivé(e) garderait l'agenda du cabinet ouvert sous les yeux jusqu'à
  // expiration de son jeton.
  const { error: eAuth } = await admin.auth.admin.updateUserById(id, {
    ban_duration: actif ? "none" : BANNISSEMENT_PERMANENT,
  });
  if (eAuth) return NextResponse.json({ erreur: eAuth.message }, { status: 400 });

  await tracerAuditServeur(
    admin,
    medecinId,
    actif ? "A réactivé un compte assistant(e)" : "A désactivé un compte assistant(e)",
    controle.compte.nom,
    id
  );
  return NextResponse.json({ ok: true });
}

/**
 * Fermeture définitive, et libération de la place.
 *
 * L'anonymisation et le bannissement sont ceux de `lib/suppression-compte`,
 * communs à toutes les fermetures de la plateforme. S'y ajoute la
 * suppression du RATTACHEMENT : c'est lui qui occupe une place de la
 * formule, et le médecin doit pouvoir la réattribuer tout de suite.
 *
 * La ligne `utilisateurs` survit, elle : `rendez_vous.reserve_par` la
 * référence, et l'historique doit continuer de dire qui a pris le
 * rendez-vous.
 */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/medecin/assistants/[id]">) {
  const garde = await verifierMedecin();
  if ("refus" in garde) return garde.refus;
  const { admin, medecinId } = garde.acces;
  const { id } = await ctx.params;

  const controle = await cible(admin, medecinId, id);
  if ("erreur" in controle) return controle.erreur;

  const { erreur } = await supprimerCompte(admin, id, "assistant");
  if (erreur) return NextResponse.json({ erreur }, { status: 400 });

  const { error } = await admin.from("assistants").delete().eq("id", id);
  if (error) return NextResponse.json({ erreur: error.message }, { status: 400 });

  await tracerAuditServeur(
    admin,
    medecinId,
    "A fermé un compte assistant(e)",
    `${controle.compte.nom} · ${controle.compte.email}`,
    id
  );
  return NextResponse.json({ ok: true });
}
