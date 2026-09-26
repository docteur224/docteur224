/**
 * Tests de la migration 0057 — la file d'e-mails et son drain.
 *
 *   node scripts/test-file-emails.mjs
 *
 * Il exige qu'un serveur réponde sur http://127.0.0.1:3007 (`npx next start
 * -p 3007`) : le drain se teste par sa ROUTE, pas en réimplémentant son
 * contenu — c'est l'authentification, le mode et le verdict qu'on veut voir à
 * l'œuvre, pas une copie de leur logique.
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
const BASE = process.env.BASE_TEST || "http://127.0.0.1:3007";

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

const drainer = async () => {
  const r = await fetch(`${BASE}/api/emails/drainer`, {
    method: "POST",
    headers: { "x-cle-drain": env.EMAIL_CLE_DRAIN },
  });
  return { statut: r.status, corps: await r.json().catch(() => ({})) };
};

const fileDu = (rdv) =>
  q(`select type, etat, adresse, programme_pour, notification_id, tentatives, derniere_erreur
     from emails_en_attente where source_type = 'rendez_vous' and source_id = $1
     order by programme_pour`, [rdv]);

(async () => {
  await bdd.connect();

  const [{ id: patientId, email: emailPatient }] = await q(
    "select id, email from utilisateurs where email = 'patient1@test.docteur224.com'");
  const [{ id: medecinId }] = await q(
    "select id from utilisateurs where email = 'medecin1@test.docteur224.com'");

  /*
   * Un créneau réellement ouvert : depuis la 0053, `rendez_vous` refuse tout
   * autre couple (date, heure). On le DEMANDE à la base plutôt que de le
   * deviner — un horaire codé en dur casserait au premier changement
   * d'horaires du praticien.
   */
  const [creneau] = await q(
    `select d::date as jour, h::time as heure
     from generate_series(current_date + 20, current_date + 60, interval '1 day') d
     cross join generate_series(timestamp '2000-01-01 08:00', timestamp '2000-01-01 16:00', interval '30 min') h
     where creneau_ouvert_medecin($1, d::date, h::time)
     limit 1`, [medecinId]);
  if (!creneau) { console.log("✗ Aucun créneau ouvert trouvé pour le médecin de test."); process.exit(1); }
  const { jour, heure } = creneau;
  const jourISO = jour.toISOString().slice(0, 10);

  await q(`delete from rendez_vous where medecin_id = $1 and date = $2 and heure = $3`,
    [medecinId, jourISO, heure]);

  console.log(`\nCréneau de test : ${jourISO} à ${heure}\n`);
  console.log("1. Une réservation remplit la file");
  const [rdv] = await q(
    `insert into rendez_vous (medecin_id, date, heure, reserve_par, reserve_par_role,
                              patient_id, statut, source)
     values ($1, $2, $3, $4, 'patient', $4, 'en_attente', 'en_ligne') returning id`,
    [medecinId, jourISO, heure, patientId]);

  const file = await fileDu(rdv.id);
  const types = file.map((f) => f.type);
  verifier("confirmation en file pour le patient", types.includes("rdv_reserve"));
  verifier("le médecin est prévenu lui aussi", types.includes("rdv_nouveau"));
  verifier("un rappel J-1 est programmé", types.includes("rappel_j1"));
  verifier("un rappel H-5 est programmé", types.includes("rappel_h5"));
  verifier("l'adresse du patient est figée en file",
    file.find((f) => f.type === "rdv_reserve")?.adresse === emailPatient);
  verifier("la confirmation est rattachée à sa notification",
    !!file.find((f) => f.type === "rdv_reserve")?.notification_id);
  verifier("un rappel n'est rattaché à aucune notification",
    file.find((f) => f.type === "rappel_j1")?.notification_id === null);

  console.log("\n2. Les rappels tombent à la bonne heure");
  const [{ moment }] = await q("select moment_rdv($1::date, $2::time) as moment", [jourISO, heure]);
  const ecart = (type, heures) => {
    const l = file.find((f) => f.type === type);
    return l && Math.abs((moment - l.programme_pour) / 3600000 - heures) < 0.01;
  };
  verifier("J-1 = 24 h avant le rendez-vous", ecart("rappel_j1", 24));
  verifier("H-5 = 5 h avant le rendez-vous", ecart("rappel_h5", 5));
  /*
   * Tolérance de 5 s, et non une comparaison stricte à `new Date()` :
   * `programme_pour` vient de l'horloge de la BASE, qui n'est pas celle de ce
   * poste (mesuré : 91 ms d'avance). Une comparaison au millième transforme un
   * décalage d'horloges en échec de test, ce qui n'apprend rien sur le code.
   */
  const confirmation = file.find((f) => f.type === "rdv_reserve");
  verifier("la confirmation part tout de suite",
    confirmation.programme_pour.getTime() - Date.now() < 5000,
    `${confirmation.programme_pour.toISOString()} vs maintenant`);

  console.log("\n3. Rejouer l'événement ne crée pas de doublon");
  const notif = file.find((f) => f.type === "rdv_reserve").notification_id;
  await q(`select programmer_email($1, 'rdv_reserve', 'Doublon', null, null,
           'rendez_vous', $2, $3, now())`, [patientId, rdv.id, notif]);
  await q(`select programmer_rappels_rdv($1)`, [rdv.id]);
  const apresRejeu = await fileDu(rdv.id);
  verifier("la file n'a pas grossi", apresRejeu.length === file.length,
    `${file.length} → ${apresRejeu.length}`);

  console.log("\n4. Le drain ne touche à rien en mode simulé");
  await q("update config_messagerie set mode = 'simule' where id = 1");
  const simule = await drainer();
  verifier("la route répond 200", simule.statut === 200, String(simule.statut));
  verifier("elle se déclare inactive", !!simule.corps.inactif, JSON.stringify(simule.corps));
  const intacte = await fileDu(rdv.id);
  verifier("aucune tentative n'a été consommée",
    intacte.every((f) => f.tentatives === 0));
  verifier("tout est encore à envoyer",
    intacte.every((f) => f.etat === "a_envoyer"));

  console.log("\n5. Sans preuve d'identité, la route refuse");
  const nu = await fetch(`${BASE}/api/emails/drainer`, { method: "POST" });
  verifier("401 sans clé ni session", nu.status === 401, String(nu.status));
  const fausse = await fetch(`${BASE}/api/emails/drainer`, {
    method: "POST", headers: { "x-cle-drain": "x".repeat(env.EMAIL_CLE_DRAIN.length) },
  });
  verifier("401 avec une clé de même longueur mais fausse", fausse.status === 401, String(fausse.status));

  console.log("\n6. Déplacer le rendez-vous remplace les rappels");
  const [creneau2] = await q(
    `select d::date as jour, h::time as heure
     from generate_series(current_date + 61, current_date + 90, interval '1 day') d
     cross join generate_series(timestamp '2000-01-01 08:00', timestamp '2000-01-01 16:00', interval '30 min') h
     where creneau_ouvert_medecin($1, d::date, h::time) limit 1`, [medecinId]);
  const jour2 = creneau2.jour.toISOString().slice(0, 10);
  await q("update rendez_vous set date = $2, heure = $3 where id = $1",
    [rdv.id, jour2, creneau2.heure]);
  const apresDeplacement = await fileDu(rdv.id);
  const [{ moment: moment2 }] = await q("select moment_rdv($1::date, $2::time) as moment",
    [jour2, creneau2.heure]);
  const j1 = apresDeplacement.find((f) => f.type === "rappel_j1");
  verifier("il n'y a toujours qu'un rappel J-1",
    apresDeplacement.filter((f) => f.type === "rappel_j1").length === 1);
  verifier("il vise la NOUVELLE date",
    Math.abs((moment2 - j1.programme_pour) / 3600000 - 24) < 0.01);
  verifier("le patient est prévenu du déplacement",
    apresDeplacement.some((f) => f.type === "rdv_reprogramme"));

  console.log("\n7. Annuler supprime les rappels, pas la trace");
  await q("update rendez_vous set statut = 'annule' where id = $1", [rdv.id]);
  const apresAnnulation = await fileDu(rdv.id);
  verifier("plus aucun rappel en attente",
    !apresAnnulation.some((f) => ["rappel_j1", "rappel_h5"].includes(f.type)));
  verifier("l'annulation est annoncée au patient",
    apresAnnulation.some((f) => f.type === "rdv_annule"));
  verifier("la confirmation déjà en file reste",
    apresAnnulation.some((f) => f.type === "rdv_reserve"));

  console.log("\n8. On n'écrit pas à n'importe qui");
  const [supprime] = await q("select id from utilisateurs where statut = 'supprime' limit 1");
  await q(`select programmer_email($1, 'test', 'Ne doit pas partir', null, null, 'test', $2, null, now())`,
    [supprime.id, rdv.id]);
  const [{ n: versSupprime }] = await q(
    "select count(*)::int as n from emails_en_attente where destinataire_id = $1", [supprime.id]);
  verifier("un compte supprimé ne reçoit rien", versSupprime === 0);
  const [{ vide }] = await q("select email_destinataire($1) is null as vide", [supprime.id]);
  verifier("`email_destinataire` le refuse explicitement", vide === true);

  console.log("\n9. Une échéance passée n'est pas programmée");
  await q(`select programmer_email($1, 'rappel_passe', 'Trop tard', null, null,
           'rendez_vous', $2, null, now() - interval '2 days')`, [patientId, rdv.id]);
  verifier("rien n'est mis en file",
    !(await fileDu(rdv.id)).some((f) => f.type === "rappel_passe"));

  console.log("\n10. Deux drains simultanés se partagent le travail");
  const [{ n: dus }] = await q(
    `select count(*)::int as n from emails_en_attente
     where etat = 'a_envoyer' and programme_pour <= now()`);
  const [a, b] = await Promise.all([
    q("select id from reserver_emails(100)"),
    q("select id from reserver_emails(100)"),
  ]);
  const ids = [...a, ...b].map((r) => r.id);
  verifier("aucune ligne réservée deux fois", new Set(ids).size === ids.length,
    `${ids.length} lignes, ${new Set(ids).size} distinctes`);
  verifier("les deux lots couvrent tout ce qui était dû", ids.length === dus,
    `${ids.length} / ${dus}`);
  // Remise en file : ce lot n'a pas été envoyé.
  await q("update emails_en_attente set etat = 'a_envoyer', tentatives = 0 where etat = 'en_cours'");

  console.log("\n11. Trois échecs et la ligne est abandonnée");
  const [essai] = await q(
    `insert into emails_en_attente (destinataire_id, adresse, type, titre, source_type, source_id)
     values ($1, 'essai@docteur224.com', 'test_abandon', 'Essai', 'rendez_vous', $2) returning id`,
    [patientId, rdv.id]);
  for (let i = 1; i <= 3; i++) {
    await q("update emails_en_attente set tentatives = $2 where id = $1", [essai.id, i]);
    await q("select marquer_email($1, false, 'panne simulée')", [essai.id]);
  }
  const [apres3] = await q("select etat, derniere_erreur from emails_en_attente where id = $1", [essai.id]);
  verifier("l'état devient « abandonne »", apres3.etat === "abandonne", apres3.etat);
  verifier("le motif est conservé", apres3.derniere_erreur === "panne simulée");

  console.log("\n12. En mode réel, la file se vide pour de bon");
  await q("update config_messagerie set mode = 'reel' where id = 1");
  // On ne garde qu'une ligne, adressée à la boîte de la plateforme : le test
  // ne doit écrire ni aux comptes de démo ni à de vraies personnes.
  await q(`delete from emails_en_attente where etat in ('a_envoyer','en_cours')`);
  const [reel] = await q(
    `insert into emails_en_attente (destinataire_id, adresse, type, titre, corps, lien, source_type, source_id)
     values ($1, $2, 'test_drain', 'Test du drain', 'La file fonctionne.', '/mes-rendez-vous',
             'rendez_vous', $3) returning id`,
    [patientId, env.EMAIL_SERVER_USER, rdv.id]);
  const vidange = await drainer();
  verifier("la route répond 200", vidange.statut === 200, String(vidange.statut));
  verifier("un message est parti", vidange.corps.envoyes === 1, JSON.stringify(vidange.corps));
  const [ligne] = await q("select etat, envoye_le from emails_en_attente where id = $1", [reel.id]);
  verifier("la ligne passe à « envoye »", ligne.etat === "envoye", ligne.etat);
  verifier("elle est horodatée", !!ligne.envoye_le);
  const [{ n: journalise }] = await q(
    `select count(*)::int as n from messages_envoyes
     where motif = 'test_drain' and canal = 'email' and statut = 'envoye'`);
  verifier("l'envoi est journalisé comme les autres", journalise >= 1);

  console.log("\n13. Remise en état");
  await q("update config_messagerie set mode = 'simule' where id = 1");
  await q("delete from emails_en_attente where source_id = $1", [rdv.id]);
  await q("delete from messages_envoyes where motif in ('test_drain','test_abandon')");
  await q("delete from notifications where source_id = $1", [rdv.id]);
  await q("delete from rendez_vous where id = $1", [rdv.id]);
  const [{ mode }] = await q("select mode from config_messagerie where id = 1");
  verifier("mode revenu à « simulé »", mode === "simule", mode);
  const [{ n: reste }] = await q(
    "select count(*)::int as n from emails_en_attente where source_id = $1", [rdv.id]);
  verifier("la file de test est vide", reste === 0);

  console.log(`\n${ko === 0 ? "✅" : "❌"} ${ok}/${ok + ko}`);
  await bdd.end();
  process.exit(ko === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error("\nERREUR:", e.message);
  try { await bdd.query("update config_messagerie set mode = 'simule' where id = 1"); } catch {}
  try { await bdd.end(); } catch {}
  process.exit(1);
});
