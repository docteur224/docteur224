/**
 * Programme (ou reprogramme) le planificateur qui vide la file d'e-mails.
 *
 *   node scripts/planifier-drain.mjs            → planifie sur le site déployé
 *   node scripts/planifier-drain.mjs --etat     → montre le travail et son journal
 *   node scripts/planifier-drain.mjs --retirer  → le supprime
 *
 * POURQUOI pg_cron et pas le cron de Vercel : l'offre gratuite de Vercel ne
 * déclenche qu'UNE FOIS PAR JOUR. Un rappel « 5 h avant » y serait absurde.
 * pg_cron tourne dans la base Supabase, à la minute, quelle que soit l'offre.
 *
 * À LANCER APRÈS UN DÉPLOIEMENT : le travail appelle l'URL publique du site.
 * Tant que /api/emails/drainer n'y est pas, chaque passage répondra 404 — sans
 * conséquence, la file attendra.
 *
 * `EMAIL_CLE_DRAIN` doit être posée des DEUX côtés : ici (lue dans .env.local
 * et inscrite dans le travail) et dans les variables d'environnement Vercel,
 * que le site lit pour reconnaître l'appelant. Deux valeurs différentes, et la
 * route répondra 401 à chaque passage.
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const TRAVAIL = "drainer-emails";
/*
 * Le résumé des administrateurs est un second travail, et non un ajout au
 * premier : il ne sort pas de la base (il ne fait que remplir la file) et ne
 * tourne qu'une fois par jour. Les mêler obligerait le drain, qui passe
 * chaque minute, à se demander soixante fois par heure si l'on est à 7 h.
 *
 * 7 h UTC, c'est 7 h à Conakry — la Guinée est à UTC+0 toute l'année.
 */
const TRAVAIL_RESUME = "resume-admin";
const action = process.argv[2] ?? "--planifier";

const manquants = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_DB_PASSWORD", "NEXT_PUBLIC_SITE_URL", "EMAIL_CLE_DRAIN"]
  .filter((c) => !env[c]);
if (manquants.length && action === "--planifier") {
  console.error(`✗ Manque dans .env.local : ${manquants.join(", ")}`);
  process.exit(1);
}

const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const client = new Client({
  host: `db.${ref}.supabase.co`, user: "postgres", port: 5432,
  password: env.SUPABASE_DB_PASSWORD, database: "postgres",
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
});
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

if (action === "--retirer") {
  for (const t of [TRAVAIL, TRAVAIL_RESUME]) {
    await q("select cron.unschedule($1)", [t]).catch(() => {});
    console.log(`✓ Travail « ${t} » retiré.`);
  }
} else if (action === "--etat") {
  const travaux = await q(
    "select jobid, jobname, schedule, active from cron.job where jobname = any($1) order by jobname",
    [[TRAVAIL, TRAVAIL_RESUME]]);
  console.log(travaux.length ? JSON.stringify(travaux, null, 1) : "Aucun travail planifié.");
  if (travaux.length) {
    const passages = await q(
      `select j.jobname, d.status, d.return_message, d.start_time
       from cron.job_run_details d join cron.job j on j.jobid = d.jobid
       where d.jobid = any($1) order by d.start_time desc limit 8`,
      [[travaux.map((t) => t.jobid)].flat()]);
    console.log("\nDerniers passages :");
    for (const p of passages)
      console.log(`  ${p.start_time.toISOString()}  ${p.jobname}  ${p.status}  ${p.return_message ?? ""}`);
    // La réponse HTTP est rangée par pg_net à part : le journal de cron dit
    // que l'appel est PARTI, pas ce que le site a répondu.
    const reponses = await q(
      `select status_code, created from net._http_response order by created desc limit 5`).catch(() => []);
    console.log("\nDernières réponses du site :");
    for (const r of reponses) console.log(`  ${r.created.toISOString()}  HTTP ${r.status_code}`);
  }
} else {
  const url = `${env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/api/emails/drainer`;

  /*
   * `unschedule` d'abord : `cron.schedule` sur un nom existant le remplace,
   * mais seulement si la signature correspond. Retirer puis reposer est la
   * seule façon d'être sûr de ce qui tourne après le script.
   */
  await q("select cron.unschedule($1)", [TRAVAIL]).catch(() => {});

  /*
   * Le délai de 55 s tient sous la minute qui sépare deux passages : un appel
   * ne doit jamais chevaucher le suivant. Si le lot n'est pas fini, la route
   * l'a dit dans `encore` et le passage suivant reprendra la file — les lignes
   * restent réservées et ne peuvent pas partir deux fois.
   */
  await q(
    `select cron.schedule($1, '* * * * *', $2)`,
    [TRAVAIL,
     `select net.http_post(
        url := ${literal(url)},
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cle-drain', ${literal(env.EMAIL_CLE_DRAIN)}),
        timeout_milliseconds := 55000
      );`]
  );

  /*
   * Le résumé, lui, ne sort pas de la base : pg_cron appelle directement la
   * fonction SQL, sans passer par le site. Il fonctionne donc même si le
   * déploiement n'est pas encore fait — mais les messages resteront en file
   * tant que le drain ne tourne pas, ce qui est le comportement voulu.
   */
  await q("select cron.unschedule($1)", [TRAVAIL_RESUME]).catch(() => {});
  await q("select cron.schedule($1, '0 7 * * *', $2)",
    [TRAVAIL_RESUME, "select programmer_resume_admin();"]);

  const travaux = await q(
    "select jobid, jobname, schedule from cron.job where jobname = any($1) order by jobname",
    [[TRAVAIL, TRAVAIL_RESUME]]);
  for (const t of travaux) console.log(`✓ « ${t.jobname} » planifié (jobid ${t.jobid}, ${t.schedule}).`);
  console.log(`    cible du drain  ${url}`);
  console.log(`    clé             posée (${env.EMAIL_CLE_DRAIN.length} caractères)`);
  console.log("\n⚠ Posez la MÊME valeur d'EMAIL_CLE_DRAIN dans les variables Vercel,");
  console.log("  sinon la route répondra 401 à chaque passage.");
  console.log("  Contrôle dans quelques minutes : node scripts/planifier-drain.mjs --etat");
}

await client.end();

/** Littéral SQL échappé — la clé et l'URL entrent dans le corps du travail. */
function literal(v) {
  return `'${String(v).replace(/'/g, "''")}'`;
}
