/*
 * Applique un fichier de migration SQL sur la base Supabase distante.
 * Usage : node scripts/migrer.mjs supabase/migrations/0010_photo_medecin.sql
 *
 * Passe par l'API Postgres directe (clé service_role). Les migrations sont
 * écrites pour être rejouables sans casse quand c'est possible, mais ce
 * script ne tient pas de journal : vérifiez ce que vous appliquez.
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";

const fichier = process.argv[2];
if (!fichier) {
  console.error("Usage : node scripts/migrer.mjs <fichier.sql>");
  process.exit(1);
}

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const lire = (cle) => env.match(new RegExp(`^${cle}=(.*)$`, "m"))?.[1].trim();

const url = new URL(lire("NEXT_PUBLIC_SUPABASE_URL"));
const ref = url.hostname.split(".")[0];
const motDePasse = lire("SUPABASE_DB_PASSWORD");

// La connexion directe (db.<ref>.supabase.co) n'est pas toujours joignable
// en IPv4 ; on tente donc aussi les pools régionaux jusqu'à ce que l'un
// réponde, plutôt que de coder une région en dur.
const HOTES = [
  { host: `db.${ref}.supabase.co`, user: "postgres", port: 5432 },
  ...["eu-west-3", "eu-central-1", "eu-west-1", "us-east-1"].map((r) => ({
    host: `aws-0-${r}.pooler.supabase.com`,
    user: `postgres.${ref}`,
    port: 5432,
  })),
];

const sql = readFileSync(fichier, "utf8");
let applique = false;
for (const cible of HOTES) {
  const client = new Client({
    ...cible,
    password: motDePasse,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });
  try {
    await client.connect();
  } catch {
    continue; // hôte injoignable : on essaie le suivant
  }
  try {
    await client.query(sql);
    console.log(`✅ ${fichier} appliqué (via ${cible.host}).`);
    applique = true;
  } finally {
    await client.end();
  }
  break;
}
if (!applique) {
  console.error("❌ Aucun hôte Postgres joignable. Appliquez le SQL depuis l'éditeur Supabase.");
  process.exit(1);
}
