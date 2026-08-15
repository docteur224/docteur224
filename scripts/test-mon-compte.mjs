/*
 * Tests de « Mon compte » (migration 0045) : mot de passe, suspension,
 * fermeture et dossier d'abonnement — pour les CINQ rôles.
 *
 * Ce qui est vérifié n'est pas seulement que les boutons répondent, mais
 * que la suspension a des CONSÉQUENCES : un médecin suspendu quitte la
 * recherche, un patient suspendu ne réserve plus, un(e) assistant(e)
 * suspendu(e) perd l'agenda du cabinet.
 *
 * Les comptes du seed sont suspendus puis remis en service ; les fermetures,
 * elles, portent sur des comptes créés pour l'occasion — c'est irréversible.
 *
 * Prérequis : `npx next build && npx next start -p 3001`.
 * Usage : node scripts/test-mon-compte.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const lire = (cle) => env.match(new RegExp(`^${cle}=(.*)$`, "m"))?.[1].trim();
const URL_SB = lire("NEXT_PUBLIC_SUPABASE_URL");
const ANON = lire("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const APP = process.env.APP ?? "http://localhost:3001";

const service = createClient(URL_SB, lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anonyme = createClient(URL_SB, ANON, { auth: { persistSession: false } });

let echecs = 0;
const test = (nom, ok, detail) => {
  if (!ok) echecs++;
  console.log(`${ok ? "✅" : "❌"} ${nom}${detail ? ` — ${detail}` : ""}`);
};

async function ouvrirSession(email, motDePasse) {
  const bocal = new Map();
  const client = createServerClient(URL_SB, ANON, {
    cookies: {
      getAll: () => [...bocal].map(([name, value]) => ({ name, value })),
      setAll: (liste) => liste.forEach(({ name, value }) => bocal.set(name, value)),
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: motDePasse });
  if (error) throw new Error(`connexion ${email} : ${error.message}`);
  const cookie = [...bocal].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");
  const appel = (chemin, init = {}) =>
    fetch(`${APP}${chemin}`, {
      ...init,
      headers: { "Content-Type": "application/json", cookie, ...(init.headers ?? {}) },
    });
  return { client, appel, email };
}

const COMPTES = {
  patient: { email: "patient1@test.docteur224.com", mdp: "test1234" },
  medecin: { email: "medecin1@test.docteur224.com", mdp: "test1234" },
  assistant: { email: "assistant1@test.docteur224.com", mdp: "test1234" },
  etablissement: { email: "etab.clinique-ambroise@test.docteur224.com", mdp: "test1234" },
  admin: { email: "admin@docteur224.com", mdp: "alpha2308" },
};

/* ---------- 1. Le mot de passe se change, quel que soit le rôle ---------- */
for (const [role, { email, mdp }] of Object.entries(COMPTES)) {
  const nouveau = `Provisoire${Date.now()}`;
  const c = createClient(URL_SB, ANON, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email, password: mdp });
  const { error } = await c.auth.updateUser({ password: nouveau });
  const { error: eConnexion } = await createClient(URL_SB, ANON, { auth: { persistSession: false } })
    .auth.signInWithPassword({ email, password: nouveau });
  test(`Mot de passe changé — ${role}`, !error && !eConnexion, error?.message ?? eConnexion?.message);
  // Remise en état : les comptes du seed gardent leur mot de passe connu.
  await service.auth.admin.updateUserById(
    (await service.from("utilisateurs").select("id").eq("email", email).single()).data.id,
    { password: mdp }
  );
}

/* ---------- 2. Le dossier d'abonnement ---------- */
{
  const medecin = await ouvrirSession(COMPTES.medecin.email, COMPTES.medecin.mdp);
  const { data: courant } = await medecin.client.rpc("mon_abonnement");
  const a = (courant ?? [])[0];
  test("Le médecin voit son abonnement courant", !!a && a.formule === "standard", a?.formule);
  test("Le tarif du jour est joint", (a?.prix_mensuel ?? 0) > 0, `${a?.prix_mensuel} GNF`);
  test("Les places d'assistant(e) figurent au détail", (a?.assistants_inclus ?? 0) >= 1, `${a?.assistants_inclus}`);

  const { data: histo } = await medecin.client
    .from("historique_abonnements")
    .select("evenement, formule, detail")
    .order("cree_le", { ascending: false });
  test("Son historique est lisible", (histo ?? []).length >= 1, `${histo?.length} événement(s)`);
  test("La souscription d'origine y figure", (histo ?? []).some((h) => h.evenement === "ouverture"));

  // Un changement de formule laisse une trace, sans que personne ne l'écrive.
  const avant = (histo ?? []).length;
  const { data: abo } = await service
    .from("abonnements")
    .select("id, formule")
    .eq("titulaire_id", (await medecin.client.auth.getUser()).data.user.id)
    .single();
  await service.from("abonnements").update({ formule: "premium" }).eq("id", abo.id);
  const { data: apres } = await medecin.client
    .from("historique_abonnements")
    .select("evenement, detail")
    .order("cree_le", { ascending: false });
  test("Un changement de formule est tracé par la base", (apres ?? []).length === avant + 1);
  test(
    "L'événement dit ce qui a changé",
    apres?.[0]?.evenement === "changement_formule" && /standard.*premium/.test(apres?.[0]?.detail ?? ""),
    apres?.[0]?.detail
  );
  // Remise en état : le va-et-vient de formule laisse deux traces, qui
  // n'ont rien à faire dans l'historique réel de ce compte.
  await service.from("abonnements").update({ formule: abo.formule }).eq("id", abo.id);
  await service
    .from("historique_abonnements")
    .delete()
    .eq("abonnement_id", abo.id)
    .eq("evenement", "changement_formule");

  // Le voisin ne voit pas cet historique.
  const patient = await ouvrirSession(COMPTES.patient.email, COMPTES.patient.mdp);
  const { data: chezLautre } = await patient.client.from("historique_abonnements").select("id");
  test("L'historique d'un autre reste fermé", (chezLautre ?? []).length === 0);

  const { data: sansAbo } = await patient.client.rpc("mon_abonnement");
  test("Un patient n'a pas d'abonnement", (sansAbo ?? []).length === 0);
}

/* ---------- 3. Suspendre a des conséquences ---------- */
{
  const medecin = await ouvrirSession(COMPTES.medecin.email, COMPTES.medecin.mdp);
  const medecinId = (await medecin.client.auth.getUser()).data.user.id;

  const { data: avant } = await anonyme.from("medecins").select("id").eq("id", medecinId);
  test("Le médecin est visible avant suspension", (avant ?? []).length === 1);

  const { error } = await medecin.client.rpc("basculer_suspension_compte", { p_suspendre: true });
  test("Le médecin suspend son compte", !error, error?.message);

  const { data: u } = await service.from("utilisateurs").select("statut").eq("id", medecinId).single();
  test("Le compte passe à « suspendu »", u.statut === "suspendu", u.statut);

  const { data: fiche } = await service.from("medecins").select("statut").eq("id", medecinId).single();
  test("Sa fiche est suspendue en même temps", fiche.statut === "suspendu", fiche.statut);

  const { data: apres } = await anonyme.from("medecins").select("id").eq("id", medecinId);
  test("Il disparaît de la recherche publique", (apres ?? []).length === 0);

  const { error: eRdv } = await medecin.client.from("rendez_vous").insert({
    medecin_id: medecinId,
    patient_id: medecinId,
    date: "2027-01-04",
    heure: "09:00",
    reserve_par: medecinId,
    reserve_par_role: "medecin",
  });
  test("Un compte suspendu ne crée plus de rendez-vous", !!eRdv, eRdv?.code);

  const { error: eRetour } = await medecin.client.rpc("basculer_suspension_compte", { p_suspendre: false });
  test("Il réactive son compte lui-même", !eRetour, eRetour?.message);
  const { data: rendu } = await anonyme.from("medecins").select("id, statut").eq("id", medecinId);
  test("Sa fiche revient dans la recherche", (rendu ?? []).length === 1 && rendu[0].statut === "valide");
}

{
  const patient = await ouvrirSession(COMPTES.patient.email, COMPTES.patient.mdp);
  const patientId = (await patient.client.auth.getUser()).data.user.id;
  const { data: medecin } = await service.from("medecins").select("id").eq("statut", "valide").limit(1).single();

  await patient.client.rpc("basculer_suspension_compte", { p_suspendre: true });
  const { error } = await patient.client.from("rendez_vous").insert({
    medecin_id: medecin.id,
    patient_id: patientId,
    date: "2027-01-05",
    heure: "10:00",
    reserve_par: patientId,
    reserve_par_role: "patient",
  });
  test("Un patient suspendu ne réserve plus", !!error, error?.code);
  await patient.client.rpc("basculer_suspension_compte", { p_suspendre: false });

  const { data: rdv, error: eApres } = await patient.client
    .from("rendez_vous")
    .insert({
      medecin_id: medecin.id,
      patient_id: patientId,
      date: "2027-01-05",
      heure: "10:00",
      reserve_par: patientId,
      reserve_par_role: "patient",
    })
    .select("id");
  test("Réactivé, il réserve de nouveau", !eApres && (rdv ?? []).length === 1, eApres?.message);
  if (rdv?.[0]) await service.from("rendez_vous").delete().eq("id", rdv[0].id);
}

{
  const assistant = await ouvrirSession(COMPTES.assistant.email, COMPTES.assistant.mdp);
  const moi = (await assistant.client.auth.getUser()).data.user.id;
  // Les rendez-vous qu'il/elle a pris restent visibles même suspendu(e) :
  // voir ce qu'on a fait soi-même est un droit, pas un privilège. Ce qui se
  // ferme, c'est l'agenda DU CABINET.
  const duCabinet = (lignes) => (lignes ?? []).filter((r) => r.reserve_par !== moi).length;

  const { data: avant } = await assistant.client.from("rendez_vous").select("id, reserve_par");
  test("L'assistant(e) voit l'agenda du cabinet", duCabinet(avant) > 0, `${duCabinet(avant)} RDV`);

  const { error } = await assistant.client.rpc("basculer_suspension_compte", { p_suspendre: true });
  test("L'assistant(e) suspend son compte", !error, error?.message);
  const { data: pendant } = await assistant.client.from("rendez_vous").select("id, reserve_par");
  test("Suspendu(e), l'agenda du cabinet lui est fermé", duCabinet(pendant) === 0, `${duCabinet(pendant)} RDV`);
  await assistant.client.rpc("basculer_suspension_compte", { p_suspendre: false });

  const { data: apres } = await assistant.client.from("rendez_vous").select("id, reserve_par");
  test("Réactivé(e), l'agenda revient", duCabinet(apres) > 0, `${duCabinet(apres)} RDV`);
}

/* ---------- 4. Le super-administrateur est protégé ---------- */
{
  const admin = await ouvrirSession(COMPTES.admin.email, COMPTES.admin.mdp);
  const { error } = await admin.client.rpc("basculer_suspension_compte", { p_suspendre: true });
  test("Un super-admin ne suspend pas son compte", !!error, error?.message?.slice(0, 60));

  const r = await admin.appel("/api/compte/supprimer", { method: "POST" });
  test("Un super-admin ne ferme pas son compte : 403", r.status === 403, `HTTP ${r.status}`);

  const { data: u } = await service
    .from("utilisateurs")
    .select("statut")
    .eq("email", COMPTES.admin.email)
    .single();
  test("Son compte est resté actif", u.statut === "actif", u.statut);
}

/* ---------- 5. Fermer son compte, quel que soit le rôle ---------- */
async function comptePassager(role) {
  const email = `moncompte.${role}.${Date.now()}@docteur224.com`;
  const r = await fetch(`${APP}/api/inscription`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role,
      email,
      motDePasse: "passager1234",
      nom: "Passager",
      prenom: "Test",
      telephone: "620000111",
      genre: "F",
      nomEtablissement: "Structure passagère",
      typeEtablissement: "Centre de santé",
    }),
  });
  if (!r.ok) throw new Error(`inscription ${role} : ${(await r.json()).erreur}`);
  const { data } = await service.from("utilisateurs").select("id").eq("email", email).single();
  return { email, id: data.id, session: await ouvrirSession(email, "passager1234") };
}

for (const role of ["patient", "medecin"]) {
  const c = await comptePassager(role);
  const r = await c.session.appel("/api/compte/supprimer", { method: "POST" });
  test(`Fermeture de son compte — ${role}`, r.ok, `HTTP ${r.status}`);

  const { data: u } = await service
    .from("utilisateurs")
    .select("statut, email")
    .eq("id", c.id)
    .single();
  test(
    `Le compte est anonymisé et fermé — ${role}`,
    u.statut === "supprime" && u.email.startsWith("supprime-"),
    u.email
  );

  const { error } = await createClient(URL_SB, ANON, { auth: { persistSession: false } })
    .auth.signInWithPassword({ email: c.email, password: "passager1234" });
  test(`La connexion devient impossible — ${role}`, !!error, error?.message);

  await service.from("journal_audit").delete().eq("cible_id", c.id);
  await service.from("medecins").delete().eq("id", c.id);
  await service.from("patients").delete().eq("id", c.id);
  await service.from("abonnements").delete().eq("titulaire_id", c.id);
  await service.from("historique_abonnements").delete().eq("titulaire_id", c.id);
  await service.auth.admin.deleteUser(c.id);
  await service.from("utilisateurs").delete().eq("id", c.id);
}

/* ---------- 6. Un gestionnaire ne part pas avec ses médecins ---------- */
{
  const etab = await ouvrirSession(COMPTES.etablissement.email, COMPTES.etablissement.mdp);
  const id = (await etab.client.auth.getUser()).data.user.id;
  const { data: structure } = await service
    .from("etablissements")
    .select("id, medecins ( id )")
    .eq("gestionnaire_id", id)
    .maybeSingle();
  const rattaches = (structure?.medecins ?? []).length;

  const r = await etab.appel("/api/compte/supprimer", { method: "POST" });
  if (rattaches > 0) {
    test("Un gestionnaire aux médecins rattachés ne peut pas fermer", r.status === 409, `HTTP ${r.status}`);
  } else {
    test("Structure sans médecin : la fermeture est possible", r.ok || r.status === 409, `HTTP ${r.status}`);
  }

  const { data: u } = await service.from("utilisateurs").select("statut").eq("id", id).single();
  test("Le compte du gestionnaire est intact", u.statut === "actif", u.statut);
}

console.log(echecs === 0 ? "\n✅ Tous les tests passent." : `\n❌ ${echecs} test(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
