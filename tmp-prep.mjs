import { readFileSync } from "node:fs";
import { Client } from "pg";
const env = readFileSync("./.env.local", "utf8");
const lire = (c) => env.match(new RegExp(`^${c}=(.*)$`, "m"))?.[1].trim();
const ref = new URL(lire("NEXT_PUBLIC_SUPABASE_URL")).hostname.split(".")[0];
const cl = new Client({ host: `db.${ref}.supabase.co`, user: "postgres", port: 5432,
  password: lire("SUPABASE_DB_PASSWORD"), database: "postgres", ssl: { rejectUnauthorized: false } });
await cl.connect();
await cl.query(`delete from abonnements where id = '6a44875e-131f-490c-83e8-cac62eac96a6'`);
// min a 0 d'abord : la contrainte refuse max < min.
await cl.query(`update tarifs_plateforme set medecins_min = 0, medecins_max = 1 where formule = 'clinique'`);
console.log("Cas pose. Abonnement temporaire restant : d1ef7b5a. Clinique bornee 0-1.");
console.table((await cl.query(`select formule, medecins_min, medecins_max from tarifs_plateforme order by prix_mensuel`)).rows);
await cl.end();
