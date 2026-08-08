import { readFileSync } from "node:fs";
import { Client } from "pg";
const env = readFileSync("./.env.local", "utf8");
const lire = (c) => env.match(new RegExp(`^${c}=(.*)$`, "m"))?.[1].trim();
const ref = new URL(lire("NEXT_PUBLIC_SUPABASE_URL")).hostname.split(".")[0];
const cl = new Client({ host: `db.${ref}.supabase.co`, user: "postgres", port: 5432,
  password: lire("SUPABASE_DB_PASSWORD"), database: "postgres", ssl: { rejectUnauthorized: false } });
await cl.connect();
console.table((await cl.query(`
  select id, titulaire_id, formule, periode, statut, date_debut, date_fin, quota_sms
  from abonnements where id in ('6a44875e-131f-490c-83e8-cac62eac96a6','d1ef7b5a-17e1-4c95-8c30-1ec468589c64')`)).rows);
await cl.end();
