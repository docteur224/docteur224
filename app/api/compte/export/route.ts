import { NextResponse } from "next/server";
import { creerClientServeur } from "@/lib/supabase/server";

/*
 * Export des données du compte, contrepartie de la suppression.
 *
 * Volontairement sur la session de l'utilisateur (clé anon) et NON sur la
 * service_role : c'est la RLS qui décide de ce qui sort, exactement comme
 * dans l'application. Un export bâti avec la clé de service exporterait ce
 * que l'utilisateur n'a jamais eu le droit de lire, et une erreur de filtre
 * y passerait inaperçue.
 */

export async function GET() {
  const supabase = await creerClientServeur();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ erreur: "Session expirée — reconnectez-vous." }, { status: 401 });
  }
  const id = auth.user.id;

  const [profil, patient, proches, rendezVous, avis, documents, favoris, notifications] =
    await Promise.all([
      supabase
        .from("utilisateurs")
        .select("nom, prenom, email, telephone, role, cree_le")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("patients")
        .select("date_naissance, genre, quartier, pref_rappels_sms, pref_rappels_email, pref_offres, villes ( nom )")
        .eq("id", id)
        .maybeSingle(),
      supabase.from("proches").select("nom, prenom, lien, date_naissance, genre, cree_le"),
      supabase
        .from("rendez_vous")
        .select(
          `date, heure, motif, statut, source, cree_le,
           medecins ( civilite, utilisateurs ( nom, prenom ), specialites ( nom ) ),
           proches ( nom, prenom )`
        )
        .order("date", { ascending: false }),
      supabase
        .from("avis")
        .select("note, commentaire, statut, cree_le, reponse_medecin, medecins ( utilisateurs ( nom, prenom ) )")
        .eq("patient_id", id),
      supabase
        .from("documents_patient")
        // Chemin de jointure explicite : `partages_document` crée un second
        // lien documents_patient → medecins, PostgREST refuse d'arbitrer.
        .select(
          "type, titre, contenu, fichier_nom, cree_le, origine, medecins!documents_patient_medecin_id_fkey ( utilisateurs ( nom, prenom ) )"
        ),
      supabase.from("favoris").select("cree_le, medecins ( utilisateurs ( nom, prenom ), specialites ( nom ) )"),
      supabase.from("notifications").select("type, titre, corps, cree_le, lu_le").order("cree_le", { ascending: false }),
    ]);

  const contenu = {
    exporteLe: new Date().toISOString(),
    aPropos:
      "Export des données de votre compte Docteur 224. Les fichiers joints à vos documents ne sont pas inclus : ils se téléchargent un par un depuis « Mes documents ».",
    profil: profil.data,
    patient: patient.data,
    proches: proches.data ?? [],
    rendezVous: rendezVous.data ?? [],
    avis: avis.data ?? [],
    documents: documents.data ?? [],
    favoris: favoris.data ?? [],
    notifications: notifications.data ?? [],
  };

  const nom = `docteur224-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(contenu, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nom}"`,
      // Un export de données personnelles n'a rien à faire dans un cache.
      "Cache-Control": "no-store",
    },
  });
}
