import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * Règles de suppression d'un compte, communes au patient qui part de
 * lui-même (/patient/parametres) et à l'administrateur qui ferme un compte
 * (/espace-admin/utilisateurs).
 *
 * Ce n'est volontairement PAS un DELETE :
 *   - `rendez_vous.patient_id` et `.medecin_id` référencent leur table sans
 *     cascade, et les consultations déjà honorées appartiennent au dossier
 *     du médecin ;
 *   - le journal d'audit doit rester lisible après coup.
 * On procède donc par anonymisation + désactivation, la seule étape
 * irréversible — le bannissement — venant en dernier.
 *
 * Vaut pour TOUS les rôles, y compris administrateur : le journal d'audit
 * référence l'acteur de chaque décision, et un DELETE effacerait la trace
 * de ce qu'il a fait.
 *
 * À n'appeler qu'avec un client `service_role` : ces écritures traversent
 * la RLS et l'API auth admin.
 */

const BANNISSEMENT_PERMANENT = "876000h"; // 100 ans
const STATUTS_A_VENIR = ["en_attente", "confirme"];

export type RoleSupprimable = "patient" | "medecin" | "etablissement" | "assistant" | "admin";

/** Annule les rendez-vous futurs liés au compte ; le passé reste au dossier. */
async function annulerRendezVousAVenir(
  admin: SupabaseClient,
  colonne: "patient_id" | "medecin_id" | "proche_id",
  valeur: string | string[]
) {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const requete = admin
    .from("rendez_vous")
    .update({ statut: "annule" })
    .in("statut", STATUTS_A_VENIR)
    .gte("date", aujourdhui);
  await (Array.isArray(valeur) ? requete.in(colonne, valeur) : requete.eq(colonne, valeur));
}

/** Proches : supprimables seulement s'ils n'ont aucun rendez-vous. */
async function traiterProches(admin: SupabaseClient, patientId: string) {
  const { data: proches } = await admin.from("proches").select("id").eq("patient_id", patientId);
  const ids = (proches ?? []).map((p) => p.id as string);
  if (ids.length === 0) return;

  await annulerRendezVousAVenir(admin, "proche_id", ids);

  // Un proche référencé par un rendez-vous ne peut pas être supprimé
  // (clé étrangère sans cascade) : on l'anonymise à la place.
  const { data: rdv } = await admin.from("rendez_vous").select("proche_id").in("proche_id", ids);
  const avecHistorique = new Set((rdv ?? []).map((r) => r.proche_id as string));
  const sansHistorique = ids.filter((p) => !avecHistorique.has(p));

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

/**
 * Anonymise et désactive le compte `id`. Idempotent dans les faits : un
 * compte déjà supprimé repasse par les mêmes écritures sans effet visible.
 */
export async function supprimerCompte(
  admin: SupabaseClient,
  id: string,
  role: RoleSupprimable
): Promise<{ erreur?: string }> {
  // 1. Libérer les créneaux à venir, côté patient comme côté praticien :
  //    supprimer un médecin sans annuler ses rendez-vous laisserait des
  //    patients avec une consultation qui n'aura jamais lieu.
  if (role === "patient") {
    await annulerRendezVousAVenir(admin, "patient_id", id);
    await traiterProches(admin, id);
  }
  if (role === "medecin") {
    await annulerRendezVousAVenir(admin, "medecin_id", id);
  }

  // 2. Retirer des écrans publics, qui filtrent sur statut = 'valide'.
  if (role === "medecin") {
    await admin.from("medecins").update({ statut: "supprime" }).eq("id", id);
  }
  if (role === "etablissement") {
    await admin.from("etablissements").update({ statut: "supprime" }).eq("gestionnaire_id", id);
  }

  // 3. Effacer les données personnelles. L'e-mail doit changer côté auth
  //    aussi, sinon l'adresse reste prise et le compte ne peut pas être
  //    recréé plus tard.
  const emailAnonyme = `supprime-${id}@docteur224.com`;
  const { error: eAuth } = await admin.auth.admin.updateUserById(id, {
    email: emailAnonyme,
    email_confirm: true,
  });
  if (eAuth) return { erreur: eAuth.message };

  await admin.from("notifications").delete().eq("destinataire_id", id);
  if (role === "patient") {
    await admin
      .from("patients")
      .update({ date_naissance: null, genre: null, ville_id: null, quartier: null })
      .eq("id", id);
  }

  const { error: eUtilisateur } = await admin
    .from("utilisateurs")
    .update({
      nom: "Compte",
      prenom: "supprimé",
      email: emailAnonyme,
      telephone: null,
      statut: "supprime",
      // Un compte fermé ne garde aucun droit : si la ligne était un jour
      // rouverte, elle repartirait sans permission plutôt qu'avec les
      // siennes. Sans effet sur les autres rôles, dont la liste est vide.
      sous_roles_admin: [],
    })
    .eq("id", id);
  if (eUtilisateur) return { erreur: eUtilisateur.message };

  // 4. En dernier : le bannissement, seule étape vraiment irréversible.
  await admin.auth.admin.updateUserById(id, { ban_duration: BANNISSEMENT_PERMANENT });

  return {};
}
