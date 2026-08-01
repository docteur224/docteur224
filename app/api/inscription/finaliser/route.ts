import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { creerClientServeur } from "@/lib/supabase/server";

/*
 * Clôture du parcours d'inscription professionnel : ouverture de
 * l'abonnement puis effacement de `etape_inscription`.
 *
 * Côté serveur, et non plus dans le navigateur, parce que la migration
 * 0019 retire l'écriture client sur `abonnements` : le statut et la date
 * de fin déterminent ce que le professionnel a payé, ils ne peuvent pas
 * venir du client. Rien de ce que poste l'appelant n'est utilisé pour en
 * décider — la formule est déduite du type d'établissement lu en base, la
 * durée des réglages plateforme.
 *
 * Ordre de précédence de la gratuité (cf. /espace-admin/abonnements) :
 *   1. période gratuite de lancement  → essai sans échéance
 *   2. essai gratuit à l'inscription  → essai de `essai_jours` jours
 *   3. aucun des deux                 → aucun abonnement actif
 * Le cas 3 laissera place à l'étape Paiement (phase C) ; d'ici là il
 * produit un abonnement expiré, c'est-à-dire l'état exact que le paiement
 * viendra basculer en « actif ».
 */

const JOUR_MS = 86_400_000;
const versISO = (d: Date) => d.toISOString().slice(0, 10);

/** Formule facturée selon le type de structure saisi dans la fiche. */
function formulePour(role: string, typeEtablissement: string | null): string {
  if (role !== "etablissement") return "standard";
  const type = (typeEtablissement ?? "").toLowerCase();
  if (type.includes("hôpital") || type.includes("hopital")) return "hopital";
  if (type.includes("clinique")) return "clinique";
  return "cabinet";
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

  const formule = formulePour(role, etablissement?.type ?? null);

  // ----- Abonnement (une seule fois : on ne réouvre pas un essai) -----
  const { data: existants } = await admin
    .from("abonnements")
    .select("id")
    .eq("titulaire_id", utilisateurId)
    .limit(1);

  if (!existants || existants.length === 0) {
    const [{ data: reglages }, { data: tarif }] = await Promise.all([
      admin
        .from("parametres_plateforme")
        .select("cle, valeur")
        .in("cle", ["periode_gratuite", "essai_gratuit"]),
      admin
        .from("tarifs_plateforme")
        .select("essai_jours, quota_sms, gratuit_jusqua")
        .eq("formule", formule)
        .maybeSingle(),
    ]);

    const actif = (cle: string) => (reglages ?? []).find((r) => r.cle === cle)?.valeur === true;
    const gratuitJusqua = tarif?.gratuit_jusqua ? new Date(tarif.gratuit_jusqua) : null;
    const periodeGratuite = actif("periode_gratuite") || (gratuitJusqua !== null && gratuitJusqua > new Date());
    const essaiGratuit = actif("essai_gratuit");

    let statut: "essai" | "expire" = "essai";
    let dateFin: string | null = null;
    if (periodeGratuite) {
      // Phase pilote : aucune facturation, donc aucune échéance.
      dateFin = null;
    } else if (essaiGratuit) {
      dateFin = versISO(new Date(Date.now() + (tarif?.essai_jours ?? 30) * JOUR_MS));
    } else {
      statut = "expire";
      dateFin = versISO(new Date());
    }

    const { error } = await admin.from("abonnements").insert({
      titulaire_id: utilisateurId,
      type_titulaire: role,
      formule,
      periode: "mensuel",
      statut,
      date_fin: dateFin,
      quota_sms: tarif?.quota_sms ?? 0,
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
