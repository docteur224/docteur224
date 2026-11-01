import { NextResponse } from "next/server";
import { verifierAdmin } from "@/lib/gardes-serveur";
import { supprimerCompte } from "@/lib/suppression-compte";
import { versTelephoneInternational } from "@/lib/telephone";

/*
 * Numéro de test de la connexion par téléphone (migration 0078).
 *
 *   GET    — le réglage, et le compte déjà ouvert avec ce numéro s'il existe ;
 *   POST   — coche / décoche, numéro, code ;
 *   DELETE — ferme le compte ouvert avec le numéro de test, pour pouvoir
 *            rejouer l'inscription. Même fermeture que partout ailleurs
 *            (`supprimerCompte`) : anonymisé, numéro libéré, historique gardé.
 *
 * Même permission que l'écran qui l'héberge : « Messagerie ».
 */

async function garde() {
  const g = await verifierAdmin("messagerie");
  if ("refus" in g) return { refus: g.refus };
  return { admin: g.acces.admin, appelantId: g.acces.appelantId };
}

export async function GET() {
  const g = await garde();
  if (g.refus) return g.refus;
  const { data: test } = await g.admin.from("telephone_test").select("actif, numero, code, maj_le").eq("id", 1).maybeSingle();
  let compte: { nom: string; creeLe: string } | null = null;
  if (test) {
    const { data: ident } = await g.admin
      .from("identifiants_telephone")
      .select("utilisateur_id, cree_le, utilisateurs ( nom, prenom )")
      .eq("telephone", test.numero)
      .maybeSingle();
    if (ident) {
      const u = ident.utilisateurs as unknown as { nom: string | null; prenom: string | null } | null;
      compte = { nom: `${u?.prenom ?? ""} ${u?.nom ?? ""}`.trim() || "Sans nom", creeLe: ident.cree_le };
    }
  }
  return NextResponse.json({ test, compte });
}

export async function POST(requete: Request) {
  const g = await garde();
  if (g.refus) return g.refus;
  const corps = await requete.json().catch(() => null);
  const numero = versTelephoneInternational(String(corps?.numero ?? ""));
  const code = String(corps?.code ?? "");
  if (!numero) {
    return NextResponse.json({ erreur: "Le numéro de test doit être un mobile guinéen (6XX XX XX XX)." }, { status: 400 });
  }
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ erreur: "Le code de test doit comporter 6 chiffres." }, { status: 400 });
  }
  const actif = corps?.actif === true;
  const { error } = await g.admin
    .from("telephone_test")
    .update({ actif, numero, code, maj_le: new Date().toISOString(), maj_par: g.appelantId })
    .eq("id", 1);
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  await g.admin.rpc("ecrire_audit", {
    p_action: actif ? "A activé le numéro de test" : "A désactivé le numéro de test",
    p_cible_type: null,
    p_cible_id: null,
    p_details: { numero },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const g = await garde();
  if (g.refus) return g.refus;
  const { data: test } = await g.admin.from("telephone_test").select("numero").eq("id", 1).maybeSingle();
  if (!test) return NextResponse.json({ erreur: "Réglage introuvable." }, { status: 404 });
  const { data: ident } = await g.admin
    .from("identifiants_telephone")
    .select("utilisateur_id, utilisateurs ( role )")
    .eq("telephone", test.numero)
    .maybeSingle();
  if (!ident) return NextResponse.json({ erreur: "Aucun compte n’est ouvert avec ce numéro." }, { status: 404 });
  // Seul un patient s'inscrit par téléphone ; on ne ferme rien d'autre ici.
  const role = (ident.utilisateurs as unknown as { role: string } | null)?.role;
  if (role !== "patient") return NextResponse.json({ erreur: "Ce compte n’est pas un compte patient." }, { status: 409 });

  const { erreur } = await supprimerCompte(g.admin, ident.utilisateur_id, "patient");
  if (erreur) return NextResponse.json({ erreur }, { status: 500 });
  await g.admin.rpc("ecrire_audit", {
    p_action: "A fermé le compte du numéro de test",
    p_cible_type: "utilisateur",
    p_cible_id: ident.utilisateur_id,
    p_details: { numero: test.numero },
  });
  return NextResponse.json({ ok: true });
}
