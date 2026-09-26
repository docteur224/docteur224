/**
 * Tests de la migration 0059 — assistants, administrateurs, désabonnement.
 *
 *   node scripts/test-couverture-emails.mjs
 *
 * Tout ce qu'il crée est supprimé à la fin, y compris les notifications :
 * sinon elles s'accumulent dans la cloche des comptes de démo.
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

let ok = 0, ko = 0;
const verifier = (nom, cond, detail = "") => {
  if (cond) { ok++; console.log(`  ✓ ${nom}`); }
  else { ko++; console.log(`  ✗ ${nom}${detail ? " — " + detail : ""}`); }
};

const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const bdd = new Client({
  host: `db.${ref}.supabase.co`, user: "postgres", port: 5432,
  password: env.SUPABASE_DB_PASSWORD, database: "postgres",
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
});
const q = async (sql, params = []) => (await bdd.query(sql, params)).rows;
const fileDu = (rdv) =>
  q(`select type, categorie, jeton, destinataire_id, adresse from emails_en_attente
     where source_type = 'rendez_vous' and source_id = $1`, [rdv]);

let rdvId = null;
let assistantId = null;
let droitInitial = null;
const debut = new Date().toISOString();
await bdd.connect();

try {
  const [patient] = await q("select id from utilisateurs where email = 'patient1@test.docteur224.com'");
  /*
   * On part de l'ASSISTANT du jeu de démo, et on prend SON médecin — plutôt
   * que de créer un assistant de toutes pièces : `utilisateurs.id` référence
   * `auth.users`, un compte ne s'invente donc pas en SQL. Le droit
   * `peut_voir_agenda` est relevé puis rendu tel qu'il était.
   */
  const [assistant] = await q(
    `select s.id, s.medecin_id, s.peut_voir_agenda
     from assistants s join utilisateurs u on u.id = s.id
     where u.statut = 'actif' limit 1`);
  if (!assistant) { console.log("✗ Aucun assistant en base."); process.exit(1); }
  const medecin = { id: assistant.medecin_id };
  droitInitial = assistant.peut_voir_agenda;

  console.log("\n1. La colonne d'origine a bien disparu");
  const [{ reste }] = await q(
    `select count(*)::int as reste from information_schema.columns
     where table_name = 'patients' and column_name = 'pref_rappels_email'`);
  verifier("`patients.pref_rappels_email` est supprimée", reste === 0,
    "elle subsiste : deux réglages commanderaient la même chose");
  const [{ n: prefs }] = await q("select count(*)::int as n from preferences_email");
  verifier("chaque compte actif a sa ligne de préférences", prefs > 0, String(prefs));

  console.log("\n2. Service, rappel ou résumé");
  for (const [type, attendu] of [
    ["rdv_reserve", "service"], ["rdv_annule", "service"],
    ["rappel_j1", "rappel"], ["rappel_h5", "rappel"], ["resume_admin", "resume"],
  ]) {
    const [{ c }] = await q("select categorie_email($1) as c", [type]);
    verifier(`${type} → ${attendu}`, c === attendu, c);
  }

  console.log("\n3. Un e-mail de service ne se refuse pas");
  await q("update preferences_email set rappels = false, resumes = false where utilisateur_id = $1", [patient.id]);
  const [{ s }] = await q("select email_autorise($1, 'rdv_reserve') as s", [patient.id]);
  const [{ r }] = await q("select email_autorise($1, 'rappel_j1') as r", [patient.id]);
  verifier("la confirmation part malgré tout", s === true);
  verifier("le rappel, lui, est retenu", r === false);

  console.log("\n4. …et la cloche annonce exactement ce qui partira");
  const [creneau] = await q(
    `select d::date as jour, h::time as heure
     from generate_series(current_date + 20, current_date + 60, interval '1 day') d
     cross join generate_series(timestamp '2000-01-01 08:00', timestamp '2000-01-01 16:00', interval '30 min') h
     where creneau_ouvert_medecin($1, d::date, h::time) limit 1`, [medecin.id]);
  const jour = creneau.jour.toISOString().slice(0, 10);
  await q("delete from rendez_vous where medecin_id = $1 and date = $2 and heure = $3",
    [medecin.id, jour, creneau.heure]);
  const [rdv] = await q(
    `insert into rendez_vous (medecin_id, date, heure, reserve_par, reserve_par_role,
                              patient_id, statut, source)
     values ($1, $2, $3, $4, 'patient', $4, 'en_attente', 'en_ligne') returning id`,
    [medecin.id, jour, creneau.heure, patient.id]);
  rdvId = rdv.id;

  const file = await fileDu(rdvId);
  verifier("aucun rappel n'est mis en file", !file.some((f) => f.type.startsWith("rappel_")));
  verifier("la confirmation y est", file.some((f) => f.type === "rdv_reserve"));
  const [notif] = await q(
    "select canaux from notifications where source_id = $1 and type = 'rdv_reserve' and destinataire_id = $2",
    [rdvId, patient.id]);
  verifier("`canaux` annonce bien l'e-mail", notif.canaux.includes("email"), String(notif.canaux));

  // Remise à l'endroit avant la suite.
  await q("update preferences_email set rappels = true, resumes = true where utilisateur_id = $1", [patient.id]);

  console.log("\n5. Chaque ligne porte de quoi se désabonner");
  verifier("la catégorie est renseignée", file.every((f) => !!f.categorie));
  verifier("le jeton aussi", file.every((f) => !!f.jeton));

  console.log("\n6. L'assistant est prévenu — s'il a le droit de voir l'agenda");
  assistantId = assistant.id;
  await q("update assistants set peut_voir_agenda = false where id = $1", [assistantId]);

  await q("delete from emails_en_attente where source_id = $1", [rdvId]);
  await q("delete from notifications where source_id = $1", [rdvId]);
  await q("delete from rendez_vous where id = $1", [rdvId]);
  const [rdv2] = await q(
    `insert into rendez_vous (medecin_id, date, heure, reserve_par, reserve_par_role,
                              patient_id, statut, source)
     values ($1, $2, $3, $4, 'patient', $4, 'en_attente', 'en_ligne') returning id`,
    [medecin.id, jour, creneau.heure, patient.id]);
  rdvId = rdv2.id;
  const [{ n: sansDroit }] = await q(
    "select count(*)::int as n from notifications where destinataire_id = $1 and cree_le >= $2",
    [assistantId, debut]);
  verifier("sans `peut_voir_agenda`, il ne reçoit RIEN", sansDroit === 0,
    "lui écrire lui apprendrait ce que l'application lui cache");

  await q("update assistants set peut_voir_agenda = true where id = $1", [assistantId]);
  await q("delete from emails_en_attente where source_id = $1", [rdvId]);
  await q("delete from notifications where source_id = $1", [rdvId]);
  await q("delete from rendez_vous where id = $1", [rdvId]);
  const [rdv3] = await q(
    `insert into rendez_vous (medecin_id, date, heure, reserve_par, reserve_par_role,
                              patient_id, statut, source)
     values ($1, $2, $3, $4, 'patient', $4, 'en_attente', 'en_ligne') returning id`,
    [medecin.id, jour, creneau.heure, patient.id]);
  rdvId = rdv3.id;
  const notifsAssistant = await q(
    "select type, corps from notifications where destinataire_id = $1 and cree_le >= $2",
    [assistantId, debut]);
  verifier("avec le droit, il est prévenu", notifsAssistant.length === 1, String(notifsAssistant.length));
  verifier("le message ne nomme pas le patient",
    !/[Pp]atient1|Aminata|Mamadou/.test(notifsAssistant[0]?.corps ?? ""),
    notifsAssistant[0]?.corps);

  console.log("\n7. L'établissement ne reçoit toujours rien sur un rendez-vous");
  const [{ n: versEtabs }] = await q(
    `select count(*)::int as n from emails_en_attente e
     join utilisateurs u on u.id = e.destinataire_id
     where u.role = 'etablissement' and e.source_type = 'rendez_vous'`);
  verifier("aucun e-mail de rendez-vous vers un établissement", versEtabs === 0,
    "cela contournerait le cloisonnement de la 0054");

  console.log("\n8. Le résumé de l'administrateur");
  await q("delete from emails_en_attente where type = 'resume_admin'");
  const [{ programmer_resume_admin: envois }] = await q("select programmer_resume_admin()");
  const resumes = await q(
    `select e.destinataire_id, e.corps, u.sous_roles_admin, u.admin_principal
     from emails_en_attente e join utilisateurs u on u.id = e.destinataire_id
     where e.type = 'resume_admin'`);
  verifier("un résumé est produit", envois >= 1, `${envois} envoi(s)`);
  verifier("un seul par administrateur",
    new Set(resumes.map((r) => r.destinataire_id)).size === resumes.length);
  verifier("le corps porte des chiffres", resumes.every((r) => /\s:\s\d+/.test(r.corps)),
    resumes[0]?.corps);
  verifier("personne ne reçoit une file qu'il n'a pas le droit de traiter",
    resumes.every((r) =>
      r.admin_principal ||
      (!/Signalements/.test(r.corps) || r.sous_roles_admin.includes("moderation"))));

  const [{ programmer_resume_admin: second }] = await q("select programmer_resume_admin()");
  const [{ n: apresRejeu }] = await q(
    "select count(*)::int as n from emails_en_attente where type = 'resume_admin'");
  verifier("le rejouer le même jour n'ajoute rien", apresRejeu === resumes.length,
    `${resumes.length} → ${apresRejeu} (retour ${second})`);

  console.log("\n9. Le désabonnement en un clic");
  const [{ jeton }] = await q("select jeton from preferences_email where utilisateur_id = $1", [patient.id]);
  const [{ desinscrire_email: coupe }] = await q("select desinscrire_email($1, 'rappel', false)", [jeton]);
  const [apres] = await q("select rappels, resumes from preferences_email where utilisateur_id = $1", [patient.id]);
  verifier("le jeton est accepté", coupe === true);
  verifier("les rappels sont coupés", apres.rappels === false);
  verifier("les résumés ne le sont PAS", apres.resumes === true,
    "une catégorie ne doit pas en emporter une autre");

  const [{ desinscrire_email: remis }] = await q("select desinscrire_email($1, 'rappel', true)", [jeton]);
  verifier("on peut se réabonner", remis === true);

  const [{ desinscrire_email: inconnu }] = await q(
    "select desinscrire_email('00000000-0000-0000-0000-000000000000'::uuid, 'rappel', false)");
  verifier("un jeton inconnu rend false, sans rien révéler", inconnu === false);
  const [{ desinscrire_email: categorieFolle }] = await q(
    "select desinscrire_email($1, 'tout-couper', false)", [jeton]);
  verifier("une catégorie inventée est refusée", categorieFolle === false);

  console.log("\n10. Le jeton n'ouvre rien d'autre");
  const [{ n: droits }] = await q(
    `select count(*)::int as n from information_schema.role_routine_grants
     where routine_name = 'desinscrire_email' and grantee in ('anon','authenticated')`);
  verifier("`desinscrire_email` est bien accordée au visiteur anonyme", droits >= 1);
  for (const f of ["programmer_email", "email_autorise", "programmer_resume_admin", "reserver_emails"]) {
    const [{ n }] = await q(
      `select count(*)::int as n from information_schema.role_routine_grants
       where routine_name = $1 and grantee in ('anon','authenticated','PUBLIC')`, [f]);
    verifier(`\`${f}\` reste fermée au client`, n === 0, `${n} droit(s)`);
  }

  console.log(`\n${ko === 0 ? "✅" : "❌"} ${ok}/${ok + ko}`);
} finally {
  console.log("\nRemise en état…");
  if (rdvId) {
    await q("delete from emails_en_attente where source_id = $1", [rdvId]).catch(() => {});
    await q("delete from notifications where source_id = $1", [rdvId]).catch(() => {});
    await q("delete from rendez_vous where id = $1", [rdvId]).catch(() => {});
  }
  await q("delete from emails_en_attente where type = 'resume_admin'").catch(() => {});
  /*
   * L'assistant appartient au jeu de démo : son droit doit être RENDU tel
   * qu'il était, pas remis à `true`. Le laisser ouvert modifierait les données
   * de démonstration à chaque exécution du test.
   */
  if (assistantId !== null && droitInitial !== null) {
    await q("update assistants set peut_voir_agenda = $2 where id = $1",
      [assistantId, droitInitial]).catch(() => {});
    await q("delete from notifications where destinataire_id = $1 and cree_le >= $2",
      [assistantId, debut]).catch(() => {});
  }
  await q(`update preferences_email set rappels = true, resumes = true`).catch(() => {});
  await bdd.end();
}
process.exit(ko === 0 ? 0 : 1);
