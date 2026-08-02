import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { creerClientServeur } from "@/lib/supabase/server";
import { formuleEtablissement, ouvrirAbonnement } from "@/lib/abonnement-inscription";

/*
 * Clôture du parcours d'inscription professionnel : ouverture de
 * l'abonnement puis effacement de `etape_inscription`.
 *
 * Côté serveur, et non plus dans le navigateur, parce que la migration
 * 0019 retire l'écriture client sur `abonnements` : le statut et la date
 * de fin déterminent ce que le professionnel a payé, ils ne peuvent pas
 * venir du client. Rien de ce que poste l'appelant n'est utilisé pour en
 * décider.
 *
 * L'étape « Abonnement » a normalement déjà créé la ligne avec la formule
 * choisie (/api/inscription/abonnement) : on ne la refait pas. Ce filet ne
 * sert qu'aux parcours qui ont sauté l'étape — formule par défaut, mêmes
 * règles de gratuité, partagées dans lib/abonnement-inscription.
 */

/** Formule par défaut si le professionnel n'a rien choisi. */
function formuleParDefaut(role: string, typeEtablissement: string | null): string {
  return role === "etablissement" ? formuleEtablissement(typeEtablissement) : "standard";
}

export async function POST() {
  const session = await creerClientServeur();
  const { data: auth } = await session.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ erreur: "Session expirée." }, { status: 401 });
  }
  const utilisateurId = auth.user.id;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: utilisateur } = await admin
    .from("utilisateurs")
    .select("role")
    .eq("id", utilisateurId)
    .maybeSingle();
  const role = utilisateur?.role;
  if (role !== "medecin" && role !== "etablissement") {
    return NextResponse.json({ erreur: "Ce compte n'est pas un compte professionnel." }, { status: 403 });
  }

  // L'établissement est retrouvé par son gestionnaire, jamais par un id
  // fourni par l'appelant : sinon on clôturerait le parcours d'autrui.
  let etablissement: { id: string; type: string } | null = null;
  if (role === "etablissement") {
    const { data } = await admin
      .from("etablissements")
      .select("id, type")
      .eq("gestionnaire_id", utilisateurId)
      .maybeSingle();
    if (!data) {
      return NextResponse.json({ erreur: "Établissement introuvable." }, { status: 404 });
    }
    etablissement = data;
  }

  // ----- Abonnement (une seule fois : on ne réouvre pas un essai) -----
  const { data: existants } = await admin
    .from("abonnements")
    .select("id")
    .eq("titulaire_id", utilisateurId)
    .limit(1);

  if (!existants || existants.length === 0) {
    const formule = formuleParDefaut(role, etablissement?.type ?? null);
    const { statut, dateFin, quotaSms } = await ouvrirAbonnement(admin, formule);
    const { error } = await admin.from("abonnements").insert({
      titulaire_id: utilisateurId,
      type_titulaire: role,
      formule,
      periode: "mensuel",
      statut,
      date_fin: dateFin,
      quota_sms: quotaSms,
    });
    if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
  }

  // ----- Clôture du parcours -----
  const { error: eEtape } =
    role === "medecin"
      ? await admin.from("medecins").update({ etape_inscription: null }).eq("id", utilisateurId)
      : await admin.from("etablissements").update({ etape_inscription: null }).eq("id", etablissement!.id);
  if (eEtape) return NextResponse.json({ erreur: eEtape.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
