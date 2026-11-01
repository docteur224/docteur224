/*
 * Vérification du chantier « Synchro Google Agenda » (migrations 0083 et 0084).
 *
 * Contrôle l'état de la base — tables, fonctions de service, cloisonnement —
 * et la configuration, sans jamais afficher de secret ni rien écrire.
 *
 *   node scripts/verif-agenda-google.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const lire = (cle) => env.match(new RegExp(`^${cle}=(.*)$`, "m"))?.[1].trim();
const URL_SB = lire("NEXT_PUBLIC_SUPABASE_URL");
const admin = createClient(URL_SB, lire("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const anon = createClient(URL_SB, lire("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false } });

let echecs = 0;
const dire = (ok, nom, detail) => {
  if (!ok) echecs++;
  console.log(`${ok ? "✅" : "❌"} ${nom}${detail ? ` — ${detail}` : ""}`);
};

/*
 * Attention : `select("*", { head: true })` NE remonte PAS l'absence de table
 * (il rend un compte nul sans erreur). On demande donc des colonnes précises,
 * ce qui vérifie du même coup que la migration est à jour.
 */
const tables = {
  agenda_google_comptes: "utilisateur_id, email_google, refresh_token_chiffre, calendar_id, connecte_le",
  rdv_google: "rendez_vous_id, utilisateur_id, google_event_id, calendar_id",
  agenda_sync_programmes: "id, rendez_vous_id, utilisateur_id, action, etat, tentatives, derniere_erreur",
};

/*
 * La configuration D'ABORD : c'est le renseignement utile même quand les
 * migrations manquent, et le contrôle s'arrête juste après si elles manquent.
 */
console.log("— Configuration —");
for (const cle of ["GOOGLE_AGENDA_CLIENT_ID", "GOOGLE_AGENDA_CLIENT_SECRET", "GOOGLE_AGENDA_CLE_CHIFFREMENT"]) {
  const v = lire(cle);
  dire(true, cle, v ? `renseignée (${v.length} caractères)` : "absente → MODE SIMULÉ (rien ne part vers Google)");
}
// La clé de chiffrement doit faire exactement 32 octets une fois décodée,
// sinon chiffrement.ts la rejette et la plateforme reste en mode simulé.
const cleBrute = lire("GOOGLE_AGENDA_CLE_CHIFFREMENT");
if (cleBrute) {
  const octets = Buffer.from(cleBrute, "base64").length;
  dire(octets === 32, "clé de chiffrement de 32 octets", `${octets} octets décodés`);
}
const uri = `${(lire("NEXT_PUBLIC_SITE_URL") || "").replace(/\/+$/, "")}/api/agenda-google/retour`;
console.log(`ℹ️  URI de redirection à déclarer chez Google : ${uri}`);

console.log("\n— Tables (0083 + 0084) —");
let baseEnPlace = true;
for (const [table, colonnes] of Object.entries(tables)) {
  const { error } = await admin.from(table).select(colonnes).limit(1);
  if (error) baseEnPlace = false;
  dire(!error, `table ${table}`, error?.message);
}

/*
 * Sans les migrations, les contrôles qui suivent passeraient tout seuls — un
 * refus d'accès à une table qui n'existe pas ne prouve rien. On s'arrête donc
 * ici plutôt que d'afficher une rangée de ✅ rassurants et faux.
 */
if (!baseEnPlace) {
  console.log(
    "\n⏸  Migrations 0083/0084 non appliquées : le reste du contrôle n'aurait aucune valeur.\n" +
      "   Appliquez-les dans l'éditeur SQL Supabase, puis relancez ce script.",
  );
  process.exit(1);
}

/*
 * Fonctions de service : elles doivent EXISTER (appel service_role) et être
 * REFUSÉES au navigateur. On les appelle avec des paramètres inoffensifs —
 * `reserver_agenda_sync` avec une limite de 0, qui ne réserve rien.
 */
console.log("\n— Fonctions de service —");
const { error: eRes } = await admin.rpc("reserver_agenda_sync", { p_limite: 0 });
dire(!eRes, "reserver_agenda_sync(0) accessible à la service_role", eRes?.message);

const { error: eMarq } = await admin.rpc("marquer_agenda_sync", {
  p_id: "00000000-0000-0000-0000-000000000000",
  p_etat: "ignore",
  p_erreur: null,
  p_event_id: null,
  p_supprime: false,
});
dire(!eMarq, "marquer_agenda_sync (id inconnu, sans effet)", eMarq?.message);

console.log("\n— Cloisonnement —");
for (const [fn, args] of [
  ["reserver_agenda_sync", { p_limite: 1 }],
  ["programmer_sync_agenda", { p_rdv: "00000000-0000-0000-0000-000000000000" }],
  ["titulaire_du_rdv", { p_rdv: "00000000-0000-0000-0000-000000000000" }],
]) {
  const { error } = await anon.rpc(fn, args);
  dire(Boolean(error), `${fn} refusée au navigateur`, error ? "refus confirmé" : "ACCESSIBLE — à corriger");
}

for (const table of Object.keys(tables)) {
  const { data, error } = await anon.from(table).select("*").limit(1);
  // Sans policy, la lecture rend une liste vide plutôt qu'une erreur : les
  // deux conviennent, tant qu'aucune ligne ne sort.
  dire(Boolean(error) || (data?.length ?? 0) === 0, `${table} illisible sans session`, error ? "refus" : "aucune ligne");
}

console.log(`\n${echecs === 0 ? "✅ Tout est en place." : `❌ ${echecs} point(s) à régler.`}`);
process.exit(echecs === 0 ? 0 : 1);
