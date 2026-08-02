import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { creerClientServeur } from "@/lib/supabase/server";
import {
  FORMULES_MEDECIN,
  PERIODES,
  formuleEtablissement,
  lireGratuite,
  ouvrirAbonnement,
  type FormuleMedecin,
  type Periode,
} from "@/lib/abonnement-inscription";

/*
 * Étape « Abonnement » du parcours professionnel.
 *
 * GET  : ce que le professionnel doit voir — formules ouvertes, tarifs réels,
 *        état de gratuité, et son choix déjà enregistré s'il revient.
 * POST : enregistre la formule et la période choisies.
 *
 * Comme la finalisation, cette route travaille avec la service_role parce
 * que `abonnements` n'accepte plus d'écriture client (migration 0019). La
 * formule reçue est validée contre une liste blanche ; le statut et la date
 * de fin restent calculés ici, jamais reçus.
 */

async function contexte() {
  const session = await creerClientServeur();
  const { data: auth } = await session.auth.getUser();
  if (!auth.user) return { erreur: NextResponse.json({ erreur: "Session expirée." }, { status: 401 }) };

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data: utilisateur } = await admin
    .from("utilisateurs")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();
  const role = utilisateur?.role;
  if (role !== "medecin" && role !== "etablissement") {
    return { erreur: NextResponse.json({ erreur: "Ce compte n'est pas un compte professionnel." }, { status: 403 }) };
  }

  // Le palier d'une structure découle de sa fiche, jamais d'un id fourni.
  let typeEtablissement: string | null = null;
  if (role === "etablissement") {
    const { data } = await admin
      .from("etablissements")
      .select("type")
      .eq("gestionnaire_id", auth.user.id)
      .maybeSingle();
    if (!data) {
      return { erreur: NextResponse.json({ erreur: "Établissement introuvable." }, { status: 404 }) };
    }
    typeEtablissement = data.type;
  }
  return { admin, role, utilisateurId: auth.user.id, typeEtablissement };
}

export async function GET() {
  const ctx = await contexte();
  if (ctx.erreur) return ctx.erreur;
  const { admin, role, utilisateurId, typeEtablissement } = ctx;

  const formules =
    role === "medecin" ? [...FORMULES_MEDECIN] : [formuleEtablissement(typeEtablissement!)];

  const { data: tarifs } = await admin
    .from("tarifs_plateforme")
    .select("formule, prix_mensuel, prix_annuel, quota_sms, essai_jours")
    .in("formule", formules);

  const { data: existant } = await admin
    .from("abonnements")
    .select("formule, periode, statut, date_fin")
    .eq("titulaire_id", utilisateurId)
    .maybeSingle();

  const gratuite = await lireGratuite(admin, formules[0]);

  return NextResponse.json({
    role,
    choixPossible: role === "medecin",
    formules: formules.map((f) => {
      const t = (tarifs ?? []).find((x) => x.formule === f);
      return {
        formule: f,
        prixMensuel: t?.prix_mensuel ?? 0,
        prixAnnuel: t?.prix_annuel ?? 0,
        quotaSms: t?.quota_sms ?? 0,
      };
    }),
    gratuite,
    choix: existant ?? null,
  });
}

export async function POST(requete: Request) {
  const ctx = await contexte();
  if (ctx.erreur) return ctx.erreur;
  const { admin, role, utilisateurId, typeEtablissement } = ctx;

  let corps: { formule?: string; periode?: string };
  try {
    corps = await requete.json();
  } catch {
    return NextResponse.json({ erreur: "Requête illisible." }, { status: 400 });
  }

  // Liste blanche : un médecin choisit sa formule, une structure hérite de
  // son palier — accepter la formule d'un établissement depuis le client
  // permettrait de se déclarer « cabinet » en étant un hôpital.
  const formule =
    role === "medecin"
      ? FORMULES_MEDECIN.includes(corps.formule as FormuleMedecin)
        ? (corps.formule as FormuleMedecin)
        : null
      : formuleEtablissement(typeEtablissement!);
  if (!formule) {
    return NextResponse.json({ erreur: "Formule inconnue." }, { status: 400 });
  }
  const periode: Periode = PERIODES.includes(corps.periode as Periode)
    ? (corps.periode as Periode)
    : "mensuel";

  const { statut, dateFin, quotaSms } = await ouvrirAbonnement(admin, formule);

  const { data: existant } = await admin
    .from("abonnements")
    .select("id")
    .eq("titulaire_id", utilisateurId)
    .maybeSingle();

  const ligne = {
    titulaire_id: utilisateurId,
    type_titulaire: role,
    formule,
    periode,
    statut,
    date_fin: dateFin,
    quota_sms: quotaSms,
  };
  // Le professionnel peut revenir sur son choix tant que l'inscription n'est
  // pas close : on met à jour sa ligne au lieu d'en empiler une seconde.
  const { error } = existant
    ? await admin.from("abonnements").update(ligne).eq("id", existant.id)
    : await admin.from("abonnements").insert(ligne);
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, formule, periode, statut });
}
