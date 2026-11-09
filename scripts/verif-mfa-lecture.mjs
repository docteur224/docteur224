/*
 * Vérifie le verrou 2FA des LECTURES admin (migration 0088).
 *
 *   node scripts/verif-mfa-lecture.mjs
 *
 * Tout se passe dans une TRANSACTION ANNULÉE : le facteur de test inséré dans
 * `auth.mfa_factors` n'est jamais conservé. On vérifie les trois cas sur un
 * vrai compte administrateur, sans rien modifier en base.
 *
 * À lancer APRÈS avoir appliqué 0088. Sans elle, le script le signale et sort.
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const lire = (c) => env.match(new RegExp(`^${c}=(.*)$`, "m"))?.[1].trim();
const ref = new URL(lire("NEXT_PUBLIC_SUPABASE_URL")).hostname.split(".")[0];

const client = new Client({
  host: `db.${ref}.supabase.co`,
  user: "postgres",
  port: 5432,
  password: lire("SUPABASE_DB_PASSWORD"),
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 8000,
});

let ok = 0,
  ko = 0;
const verifier = (nom, cond) => {
  if (cond) {
    ok++;
    console.log(`  ✓ ${nom}`);
  } else {
    ko++;
    console.log(`  ✗ ${nom}`);
  }
};

const claims = (id, aal) =>
  client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, aal })]);
const estAdmin = async () => (await client.query("select est_admin() as v")).rows[0].v;

async function main() {
  await client.connect();

  const existe = (
    await client.query("select 1 from pg_proc where proname = 'admin_mfa_satisfaite'")
  ).rowCount;
  if (!existe) {
    console.log("⏭️  Migration 0088 non appliquée — rien à vérifier pour l'instant.");
    console.log("    node scripts/migrer.mjs supabase/migrations/0088_mfa_lectures.sql");
    return;
  }

  const admin = (
    await client.query("select id from utilisateurs where role='admin' and statut='actif' limit 1")
  ).rows[0];
  if (!admin) {
    console.log("Aucun administrateur actif pour le test.");
    ko++;
    return;
  }

  await client.query("begin");
  try {
    // 1. Sans facteur, AAL1 : l'administrateur garde l'accès (non-régression).
    await claims(admin.id, "aal1");
    verifier("sans facteur, AAL1 → est_admin reste vrai", (await estAdmin()) === true);

    // On pose un facteur VÉRIFIÉ de test (annulé en fin de transaction).
    await client.query(
      `insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
       values (gen_random_uuid(), $1, 'Test 2FA', 'totp', 'verified', now(), now(), 'TESTSECRET')`,
      [admin.id]
    );

    // 2. Facteur + AAL1 : la lecture admin est refusée.
    await claims(admin.id, "aal1");
    verifier("avec facteur, AAL1 → est_admin devient faux (lecture bloquée)", (await estAdmin()) === false);

    // 3. Facteur + AAL2 : la lecture admin repasse.
    await claims(admin.id, "aal2");
    verifier("avec facteur, AAL2 → est_admin de nouveau vrai", (await estAdmin()) === true);
  } finally {
    await client.query("rollback");
    console.log("  (facteur de test annulé — rien conservé)");
  }

  console.log(`\n${ko === 0 ? "✅" : "❌"} ${ok} vérifié(s), ${ko} échec(s)`);
  if (ko > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("Erreur :", e.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => client.end());
