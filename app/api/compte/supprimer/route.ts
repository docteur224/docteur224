import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { creerClientServeur } from "@/lib/supabase/server";

/*
 * Suppression du compte patient (écran /patient/parametres).
 *
 * Ce n'est volontairement PAS un DELETE : `rendez_vous.patient_id` référence
 * `patients` sans cascade, et les consultations déjà honorées appartiennent au
 * dossier du médecin. On procède donc par anonymisation + désactivation :
 *   1. les rendez-vous à venir sont annulés (les créneaux sont rendus) ;
 *   2. les proches sans historique sont supprimés, les autres anonymisés ;
 *   3. les données personnelles (nom, prénom, e-mail, téléphone, naissance,
 *      ville) sont effacées, le compte passe au statut `supprime` ;
 *   4. le compte d'authentification est banni : plus aucune connexion.
 *
 * Réservé aux patients : un médecin ou un établissement a une fiche publique
 * et un abonnement, sa clôture passe par le support.
 */

const BANNISSEMENT_PERMANENT = "876000h"; // 100 ans

export async function POST() {
  const supabase = await creerClientServeur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ erreur: "Session expirée — reconnectez-vous." }, { status: 401 });
  }
  const id = auth.user.id;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: utilisateur } = await admin
    .from("utilisateurs")
    .select("role")
    .eq("id", id)
    .single();
  if (!utilisateur) {
    return NextResponse.json({ erreur: "Compte introuvable." }, { status: 404 });
  }
  if (utilisateur.role !== "patient") {
    return NextResponse.json(
      { erreur: "Seuls les comptes patients se suppriment ici. Contactez le support." },
      { status: 403 }
    );
  }

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const aVenir = ["en_attente", "confirme"];

  // 1. Libérer les créneaux à venir (les rendez-vous passés restent au dossier).
  await admin
    .from("rendez_vous")
    .update({ statut: "annule" })
    .eq("patient_id", id)
    .in("statut", aVenir)
    .gte("date", aujourdhui);

  const { data: proches } = await admin.from("proches").select("id").eq("patient_id", id);
  const idsProches = (proches ?? []).map((p) => p.id as string);

  if (idsProches.length) {
    await admin
      .from("rendez_vous")
      .update({ statut: "annule" })
      .in("proche_id", idsProches)
      .in("statut", aVenir)
      .gte("date", aujourdhui);

    // 2. Un proche référencé par un rendez-vous ne peut pas être supprimé
    //    (clé étrangère sans cascade) : on l'anonymise à la place.
    const { data: rdvProches } = await admin
      .from("rendez_vous")
      .select("proche_id")
      .in("proche_id", idsProches);
    const avecHistorique = new Set((rdvProches ?? []).map((r) => r.proche_id as string));
    const sansHistorique = idsProches.filter((p) => !avecHistorique.has(p));

    if (sansHistorique.length) {
      await admin.from("proches").delete().in("id", sansHistorique);
    }
    if (avecHistorique.size) {
      await admin
        .from("proches")
        .update({ nom: "Proche", prenom: "supprimé", date_naissance: null, genre: null })
        .in("id", [...avecHistorique]);
    }
  }

  // 3. Effacer les données personnelles.
  const emailAnonyme = `supprime-${id}@docteur224.com`;

  const { error: eAuth } = await admin.auth.admin.updateUserById(id, {
    email: emailAnonyme,
    email_confirm: true,
  });
  if (eAuth) {
    return NextResponse.json({ erreur: eAuth.message }, { status: 400 });
  }

  await admin.from("notifications").delete().eq("destinataire_id", id);
  await admin
    .from("patients")
    .update({ date_naissance: null, genre: null, ville_id: null, quartier: null })
    .eq("id", id);
  const { error: eUtilisateur } = await admin
    .from("utilisateurs")
    .update({
      nom: "Compte",
      prenom: "supprimé",
      email: emailAnonyme,
      telephone: null,
      statut: "supprime",
    })
    .eq("id", id);
  if (eUtilisateur) {
    return NextResponse.json({ erreur: eUtilisateur.message }, { status: 400 });
  }

  // 4. En dernier : le bannissement, seule étape vraiment irréversible.
  await admin.auth.admin.updateUserById(id, { ban_duration: BANNISSEMENT_PERMANENT });

  return NextResponse.json({ ok: true });
}
