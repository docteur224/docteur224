/* Pose un cas de depassement reel, temporaire et reversible. */
import { readFileSync } from "node:fs";
import { Client } from "pg";
const env = readFileSync("./.env.local", "utf8");
const lire = (c) => env.match(new RegExp(`^${c}=(.*)$`, "m"))?.[1].trim();
const ref = new URL(lire("NEXT_PUBLIC_SUPABASE_URL")).hostname.split(".")[0];
const cl = new Client({ host: `db.${ref}.supabase.co`, user: "postgres", port: 5432,
  password: lire("SUPABASE_DB_PASSWORD"), database: "postgres", ssl: { rejectUnauthorized: false } });
await cl.connect();

// L'etablissement valide qui a le plus de medecins.
const { rows: [cible] } = await cl.query(`
  select e.id, e.nom, e.gestionnaire_id, count(m.id)::int as medecins
  from etablissements e left join medecins m on m.etablissement_id = e.id
  where e.statut = 'valide' and e.gestionnaire_id is not null
  group by e.id order by count(m.id) desc limit 1`);
console.log("Cible :", cible);

const { rows: [abo] } = await cl.query(`
  insert into abonnements (titulaire_id, type_titulaire, formule, periode, statut, quota_sms)
  values ($1, 'etablissement', 'clinique', 'mensuel', 'essai', 5000) returning id`,
  [cible.gestionnaire_id]);
// Plafond clinique abaisse sous l'effectif : le depassement devient reel.
await cl.query(`update tarifs_plateforme set medecins_max = 1 where formule = 'clinique'`);
console.log(JSON.stringify({ aboTemporaire: abo.id, etablissement: cible.nom, medecins: cible.medecins }));
await cl.end();
