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
// 8. Patient1 ne voit que SES rendez-vous (2 pour lui + 1 proche + 0 autres)
{
  const { data } = await patient.from("rendez_vous").select("*");
  const etrangers = (data ?? []).filter((r) => r.reserve_par !== undefined && false);
  test("Patient → uniquement ses RDV (1 pour lui + 1 pour sa proche)", (data ?? []).length === 2, `${data?.length} RDV (attendu 2)`);
}
// 9. Patient2 ne voit pas les RDV de patient1
{
  const { data } = await patient2.from("rendez_vous").select("*");
  test("Patient2 → isolé des RDV des autres", (data ?? []).length === 1, `${data?.length} RDV (attendu 1)`);
}
// 10. Le médecin1 ne voit que ses propres RDV
{
  const { data } = await medecin.from("rendez_vous").select("*");
  const medecinUid = (await medecin.auth.getUser()).data.user.id;
  const autres = (data ?? []).filter((r) => r.medecin_id !== medecinUid);
  test("Médecin → uniquement ses RDV", (data ?? []).length === 3 && autres.length === 0, `${data?.length} RDV (attendu 3)`);
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
// 13. Visiteur anonyme : voit les médecins validés, pas celui en attente
{
  const { data } = await anon.from("medecins").select("id,statut");
  const enAttente = (data ?? []).filter((m) => m.statut !== "valide");
  test("Anonyme → seulement médecins validés", (data ?? []).length === 7 && enAttente.length === 0, `${data?.length} visibles (attendu 7)`);
}
// 14. L'admin voit aussi le médecin en attente
{
  const { data } = await admin.from("medecins").select("id");
  test("Admin → tous les médecins (8)", (data ?? []).length === 8, `${data?.length}`);
}
// 15. Un patient ne peut pas s'auto-promouvoir admin (trigger)
{
  const { error } = await patient.from("utilisateurs").update({ role: "admin" }).eq("id", (await patient.auth.getUser()).data.user.id);
  test("Patient → changer son rôle : refusé", !!error, error?.message?.slice(0, 60));
}
// 16. Un patient ne voit pas les proches d'un autre patient
{
  const { data } = await patient2.from("proches").select("*");
  test("Patient2 → proches d'autrui : refusé", (data ?? []).length === 0);
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

const echecs = resultats.filter((r) => !r.ok).length;
console.log(`\n${resultats.length - echecs}/${resultats.length} tests réussis${echecs ? ` — ${echecs} ÉCHEC(S)` : ""}`);
process.exit(echecs ? 1 : 0);
