import { readFileSync } from "node:fs";
import { Client } from "pg";
const env = readFileSync("./.env.local", "utf8");
const lire = (c) => env.match(new RegExp(`^${c}=(.*)$`, "m"))?.[1].trim();
const ref = new URL(lire("NEXT_PUBLIC_SUPABASE_URL")).hostname.split(".")[0];
const cl = new Client({ host: `db.${ref}.supabase.co`, user: "postgres", port: 5432,
  password: lire("SUPABASE_DB_PASSWORD"), database: "postgres", ssl: { rejectUnauthorized: false } });
await cl.connect();
console.log("Abonnements etablissement existants :");
console.table((await cl.query(`
  select a.id, a.formule, a.statut, e.nom, e.statut as statut_etab,
         (select count(*)::int from medecins m where m.etablissement_id = e.id) as medecins
  from abonnements a join etablissements e on e.gestionnaire_id = a.titulaire_id
  where a.type_titulaire = 'etablissement'`)).rows);
await cl.end();
