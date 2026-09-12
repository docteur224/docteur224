/*
 * Tests RLS — critère de validation de l'Étape 2.
 * Chaque test se connecte avec un vrai compte (clé anon, JWT réel) et
 * vérifie qu'un accès interdit échoue et qu'un accès légitime réussit.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const lire = (cle) => env.match(new RegExp(`^${cle}=(.*)$`, "m"))?.[1].trim();
const URL_SB = lire("NEXT_PUBLIC_SUPABASE_URL");
const ANON = lire("NEXT_PUBLIC_SUPABASE_ANON_KEY");

const resultats = [];
const test = (nom, ok, detail) => {
  resultats.push({ nom, ok });
  console.log(`${ok ? "✅" : "❌"} ${nom}${detail ? ` — ${detail}` : ""}`);
};

async function clientPour(email, mdp = "test1234") {
  const c = createClient(URL_SB, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: mdp });
  if (error) throw new Error(`connexion ${email}: ${error.message}`);
  return c;
}

const anon = createClient(URL_SB, ANON, { auth: { persistSession: false } });
const patient = await clientPour("patient1@test.docteur224.com");
const patient2 = await clientPour("patient2@test.docteur224.com");
const medecin = await clientPour("medecin1@test.docteur224.com");
const assistant1 = await clientPour("assistant1@test.docteur224.com"); // agenda + créer RDV seulement
const admin = await clientPour("admin@docteur224.com", "alpha2308");

// 1. Un patient ne peut PAS lire documents_validation
{
  const { data } = await patient.from("documents_validation").select("*");
  test("Patient → documents_validation : refusé", (data ?? []).length === 0, `${data?.length ?? 0} ligne(s)`);
}
// 2. L'admin PEUT lire documents_validation
{
  const { data } = await admin.from("documents_validation").select("*");
  test("Admin → documents_validation : autorisé", (data ?? []).length >= 1, `${data?.length} ligne(s)`);
}
// 3. Un autre médecin ne voit pas les documents du médecin 8
{
  const { data } = await medecin.from("documents_validation").select("*");
  test("Médecin → documents d'un autre médecin : refusé", (data ?? []).length === 0);
}
// 4. Un patient ne peut PAS lire le journal d'audit
{
  const { data } = await patient.from("journal_audit").select("*");
  test("Patient → journal_audit : refusé", (data ?? []).length === 0);
}
// 5. Un patient ne peut PAS écrire dans le journal d'audit
{
  const { error } = await patient.from("journal_audit").insert({ action: "piratage" });
  test("Patient → INSERT journal_audit : refusé", !!error, error?.code);
}
// 6. L'assistant ne peut PAS lire les abonnements (données financières, C.7.10)
{
  const { data } = await assistant1.from("abonnements").select("*");
  test("Assistant → abonnements : refusé", (data ?? []).length === 0);
}
// 7. Le médecin voit son propre abonnement
{
  const { data } = await medecin.from("abonnements").select("*");
  test("Médecin → son abonnement : autorisé", (data ?? []).length === 1, `${data?.length} ligne(s)`);
}
/*
 * 8-10, 13-14, 16 : ces tests comptaient des lignes — « patient1 voit
 * exactement 2 rendez-vous », « l'anonyme voit exactement 7 médecins ». Le
 * jeu d'essai grossit à chaque scénario joué, si bien qu'ils tombaient en
 * échec alors que le cloisonnement, lui, tenait : six fausses alertes qui
 * masquaient les vraies. On vérifie désormais À QUI APPARTIENT ce qui
 * ressort, ce qui est la question posée — et qui, elle, ne dépend pas de la
 * taille de la base.
 */
// 8. Patient1 ne voit que SES rendez-vous et ceux de ses proches
{
  const uid = (await patient.auth.getUser()).data.user.id;
  const { data: proches } = await patient.from("proches").select("id");
  const siens = new Set((proches ?? []).map((p) => p.id));
  const { data } = await patient.from("rendez_vous").select("*");
  const etrangers = (data ?? []).filter(
    (r) => r.patient_id !== uid && !siens.has(r.proche_id) && r.reserve_par !== uid
  );
  test("Patient → uniquement ses RDV et ceux de ses proches", etrangers.length === 0, `${data?.length} RDV visibles, ${etrangers.length} d'autrui`);
}
// 9. Patient2 ne voit pas les RDV de patient1
{
  const uid = (await patient2.auth.getUser()).data.user.id;
  const { data: proches } = await patient2.from("proches").select("id");
  const siens = new Set((proches ?? []).map((p) => p.id));
  const { data } = await patient2.from("rendez_vous").select("*");
  const etrangers = (data ?? []).filter(
    (r) => r.patient_id !== uid && !siens.has(r.proche_id) && r.reserve_par !== uid
  );
  test("Patient2 → isolé des RDV des autres", etrangers.length === 0, `${data?.length} RDV visibles, ${etrangers.length} d'autrui`);
}
// 10. Le médecin1 ne voit que ses propres RDV
{
  const { data } = await medecin.from("rendez_vous").select("*");
  const medecinUid = (await medecin.auth.getUser()).data.user.id;
  const autres = (data ?? []).filter((r) => r.medecin_id !== medecinUid);
  test("Médecin → uniquement ses RDV", (data ?? []).length > 0 && autres.length === 0, `${data?.length} RDV visibles, ${autres.length} d'un confrère`);
}
// 11. Assistant1 (peut_voir_agenda) voit les RDV de SON médecin
{
  const { data } = await assistant1.from("rendez_vous").select("*");
  test("Assistant (permission agenda) → RDV de son médecin : autorisé", (data ?? []).length >= 3, `${data?.length} RDV`);
}
// 12. Assistant1 n'a PAS la permission confirmer/annuler → update refusé
{
  const { data: rdvs } = await assistant1.from("rendez_vous").select("id,statut").eq("statut", "en_attente").limit(1);
  const { data: maj } = await assistant1.from("rendez_vous").update({ statut: "confirme" }).eq("id", rdvs[0].id).select();
  test("Assistant sans permission → confirmer un RDV : refusé", (maj ?? []).length === 0);
}
// 13. Visiteur anonyme : voit les médecins validés, et eux seuls
{
  const { data } = await anon.from("medecins").select("id,statut");
  const nonValides = (data ?? []).filter((m) => m.statut !== "valide");
  test("Anonyme → seulement médecins validés", nonValides.length === 0, `${data?.length} visibles, ${nonValides.length} non validés`);
}
// 14. L'admin voit aussi les dossiers qui ne sont pas encore validés
{
  const { data } = await admin.from("medecins").select("id, statut");
  const { data: publics } = await anon.from("medecins").select("id");
  test(
    "Admin → tous les médecins, validés ou non",
    (data ?? []).length > (publics ?? []).length,
    `${data?.length} pour l'admin, ${publics?.length} pour un visiteur`
  );
}
// 15. Un patient ne peut pas s'auto-promouvoir admin (trigger)
{
  const { error } = await patient.from("utilisateurs").update({ role: "admin" }).eq("id", (await patient.auth.getUser()).data.user.id);
  test("Patient → changer son rôle : refusé", !!error, error?.message?.slice(0, 60));
}
// 16. Un patient ne voit pas les proches d'un autre patient
{
  const uid = (await patient2.auth.getUser()).data.user.id;
  const { data } = await patient2.from("proches").select("*");
  const etrangers = (data ?? []).filter((p) => p.patient_id !== uid);
  test("Patient2 → proches d'autrui : refusé", etrangers.length === 0, `${data?.length} visibles, ${etrangers.length} d'autrui`);
}
// 17. Écriture réelle : patient1 réserve un RDV puis l'annule (nettoyé ensuite)
{
  const uid = (await patient.auth.getUser()).data.user.id;
  const medecinsPublics = await anon.from("medecins").select("id").limit(1);
  const { data: rdv, error } = await patient.from("rendez_vous").insert({
    medecin_id: medecinsPublics.data[0].id, date: "2026-08-01", heure: "10:30",
    reserve_par: uid, reserve_par_role: "patient", patient_id: uid,
    motif: "Test RLS écriture", source: "en_ligne",
  }).select().single();
  const { data: annule } = await patient.from("rendez_vous").update({ statut: "annule" }).eq("id", rdv?.id).select();
  test("Patient → réserver puis annuler son RDV : autorisé", !error && annule?.length === 1);
  if (rdv) await admin.from("rendez_vous").delete().eq("id", rdv.id);
}
// 18. Un professionnel ne s'octroie pas son propre abonnement (migration 0019).
//     Les policies autorisaient titulaire_id = auth.uid() en insert ET en
//     update : n'importe quel médecin pouvait se passer un abonnement actif
//     expirant en 2099 depuis la console de son navigateur, soit le
//     contournement complet du paiement. Seul le service_role écrit
//     désormais, via /api/inscription/finaliser.
{
  const uid = (await medecin.auth.getUser()).data.user.id;
  const { error } = await medecin.from("abonnements").insert({
    titulaire_id: uid, type_titulaire: "medecin", formule: "premium",
    periode: "annuel", statut: "actif", date_fin: "2099-12-31", quota_sms: 99999,
  });
  test("Médecin → INSERT son propre abonnement : refusé", !!error, error?.code);
  if (!error) await admin.from("abonnements").delete().eq("titulaire_id", uid).eq("formule", "premium");
}
// 19. Ni ne prolonge celui que le serveur lui a posé. L'abonnement est
//     créé ici par l'admin finance : sans ligne à modifier, l'UPDATE ne
//     porterait sur rien et le test passerait à vide.
{
  const uid = (await medecin.auth.getUser()).data.user.id;
  const { data: pose } = await admin.from("abonnements").insert({
    titulaire_id: uid, type_titulaire: "medecin", formule: "standard",
    periode: "mensuel", statut: "essai", date_fin: "2030-01-01", quota_sms: 0,
  }).select().single();
  await medecin.from("abonnements").update({ statut: "actif", date_fin: "2099-12-31" }).eq("id", pose.id);
  const { data: apres } = await admin
    .from("abonnements").select("statut, date_fin").eq("id", pose.id).single();
  test(
    "Médecin → UPDATE son abonnement : sans effet",
    apres.statut === "essai" && apres.date_fin === "2030-01-01",
    `essai/2030-01-01 → ${apres.statut}/${apres.date_fin}`
  );
  await admin.from("abonnements").delete().eq("id", pose.id);
}

/*
 * 20-23. La suspension prononcée par l'administration (migration 0051).
 *
 * Elle ne tenait pas : l'écran écrivait `statut` depuis le navigateur, et la
 * policy `upd_utilisateurs_soi` laissait la personne suspendue repasser
 * « actif » d'une requête. Le compte de sonde est créé puis effacé ici même,
 * pour ne pas dépendre d'un compte du jeu d'essai.
 */
{
  const sr = createClient(URL_SB, lire("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const mail = `rls-suspension-${Date.now()}@test.docteur224.com`;
  const { data: cree } = await sr.auth.admin.createUser({ email: mail, password: "test1234", email_confirm: true });
  const uid = cree.user.id;
  await sr.from("utilisateurs").insert({ id: uid, role: "patient", email: mail, prenom: "RLS", nom: "Suspension" });
  await sr.from("patients").insert({ id: uid });

  const sonde = await clientPour(mail);
  const statut = async () =>
    (await sr.from("utilisateurs").select("statut, suspendu_par_admin").eq("id", uid).single()).data;

  // 20. La pause volontaire, elle, doit continuer de s'ouvrir et de se lever.
  await sonde.rpc("basculer_suspension_compte", { p_suspendre: true });
  const enPause = await statut();
  await sonde.rpc("basculer_suspension_compte", { p_suspendre: false });
  const reprise = await statut();
  test(
    "Compte → pause volontaire puis reprise : autorisé",
    enPause.statut === "suspendu" && !enPause.suspendu_par_admin && reprise.statut === "actif",
    `${enPause.statut} → ${reprise.statut}`
  );

  // L'administration prononce la sanction (ce que fait /api/admin/utilisateurs/statut).
  await sr.from("utilisateurs").update({ statut: "suspendu", suspendu_par_admin: true }).eq("id", uid);

  // 21. Elle ne se lève pas d'un UPDATE direct…
  await sonde.from("utilisateurs").update({ statut: "actif" }).eq("id", uid);
  test("Compte suspendu → se réactiver par UPDATE : refusé", (await statut()).statut === "suspendu");

  // 22. …ni par la porte de la pause volontaire.
  const { error: eRpc } = await sonde.rpc("basculer_suspension_compte", { p_suspendre: false });
  test(
    "Compte suspendu par l'admin → se réactiver par la RPC : refusé",
    !!eRpc && (await statut()).statut === "suspendu",
    eRpc?.message?.slice(0, 50)
  );

  // 23. Et il ne laisse plus de trace publique en attendant.
  const { data: cible } = await anon.from("medecins").select("id").limit(1);
  const { error: eAvis } = await sonde
    .from("avis")
    .insert({ patient_id: uid, medecin_id: cible[0].id, note: 5, commentaire: "test RLS" });
  const { error: eMsg } = await sonde
    .from("messages")
    .insert({ patient_id: uid, medecin_id: cible[0].id, expediteur_id: uid, contenu: "test RLS" });
  test("Compte suspendu → déposer un avis ou écrire au cabinet : refusé", !!eAvis && !!eMsg);

  /*
   * `journal_audit.acteur_id` référence `utilisateurs` SANS cascade — c'est
   * voulu, la trace d'une décision ne doit pas disparaître avec son auteur.
   * Mais `basculer_suspension_compte` en écrit une, si bien que le compte de
   * test ne s'effaçait pas : chaque exécution en laissait un de plus en base.
   */
  await sr.from("journal_audit").delete().eq("acteur_id", uid);
  await sr.from("journal_audit").delete().eq("cible_id", uid);
  await sr.from("patients").delete().eq("id", uid);
  await sr.from("utilisateurs").delete().eq("id", uid);
  await sr.auth.admin.deleteUser(uid);
}

/*
 * 24-28. Congés et absences (migrations 0052-0053).
 *
 * Le bloc « Congés et absences » était une maquette : deux lignes écrites en
 * dur, un bouton désactivé, rien en base. Un praticien parti trois semaines
 * continuait de recevoir des rendez-vous. Ces tests tiennent les quatre
 * promesses de la fonctionnalité : le congé ferme les créneaux, il ne se lit
 * pas de l'extérieur, il ne se pose pas chez autrui, et il n'est pas
 * contournable par une requête forgée.
 */
{
  const sr = createClient(URL_SB, lire("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const uidMed = (await medecin.auth.getUser()).data.user.id;
  const uidPat = (await patient.auth.getUser()).data.user.id;

  const { data: plages } = await sr
    .from("horaires_types")
    .select("jour_semaine")
    .eq("medecin_id", uidMed);
  const ouverts = new Set((plages ?? []).map((p) => p.jour_semaine));
  // Loin devant, pour ne croiser aucun rendez-vous du jeu d'essai.
  let d = new Date(Date.now() + 120 * 86400000);
  while (!ouverts.has(d.getDay())) d = new Date(d.getTime() + 86400000);
  const jour = d.toISOString().slice(0, 10);

  await sr.from("absences").delete().like("motif", "Test RLS%");
  const fermes = async () => {
    const { data } = await anon.rpc("heures_indisponibles", {
      p_medecin_id: uidMed,
      p_debut: jour,
      p_fin: jour,
    });
    return (data ?? []).filter((l) => l.etat === "ferme").length;
  };
  const avant = await fermes();

  // 24. Le praticien pose un congé, et les créneaux se ferment.
  const { data: pose } = await medecin
    .from("absences")
    .insert({ medecin_id: uidMed, motif: "Test RLS congé", date_debut: jour, date_fin: jour })
    .select("id")
    .maybeSingle();
  const apres = await fermes();
  test("Médecin → poser un congé ferme ses créneaux", !!pose && apres > avant, `${avant} → ${apres}`);

  // 25. Le motif ne sort pas : ce n'est pas une information publique.
  const { data: vuePatient } = await patient.from("absences").select("id");
  const { data: vueAnon } = await anon.from("absences").select("id");
  test(
    "Patient et visiteur → motifs des congés : refusé",
    (vuePatient ?? []).length === 0 && (vueAnon ?? []).length === 0,
    `${vuePatient?.length ?? 0} / ${vueAnon?.length ?? 0} ligne(s)`
  );

  // 26. On ne pose pas un congé dans l'agenda d'un confrère.
  const { data: vol } = await patient
    .from("absences")
    .insert({ medecin_id: uidMed, motif: "Test RLS intrusion", jour_semaine: 3 })
    .select("id");
  test("Patient → poser un congé chez un médecin : refusé", !vol?.length);

  // 27. Le congé n'est pas contournable par une requête forgée.
  const { data: force, error: eForce } = await patient
    .from("rendez_vous")
    .insert({
      medecin_id: uidMed, date: jour, heure: "14:00",
      reserve_par: uidPat, reserve_par_role: "patient", patient_id: uidPat,
      motif: "Test RLS créneau fermé", source: "en_ligne",
    })
    .select("id");
  test("Patient → réserver pendant un congé : refusé", !!eForce || !force?.length, eForce?.message?.slice(0, 40));

  // 28. Annuler le congé rouvre les créneaux.
  await medecin.from("absences").delete().eq("id", pose.id);
  test("Médecin → annuler le congé rouvre ses créneaux", (await fermes()) === avant);

  await sr.from("absences").delete().like("motif", "Test RLS%");
  await sr.from("rendez_vous").delete().like("motif", "Test RLS%");
}

const echecs = resultats.filter((r) => !r.ok).length;
console.log(`\n${resultats.length - echecs}/${resultats.length} tests réussis${echecs ? ` — ${echecs} ÉCHEC(S)` : ""}`);
process.exit(echecs ? 1 : 0);
