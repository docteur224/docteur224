/**
 * Plafond de création de compte (migration 0086).
 *
 *   node scripts/test-plafond-inscription.mjs
 *
 * On exerce la fonction `reserver_inscription` DIRECTEMENT (service_role),
 * sans passer par /api/inscription : le test ne crée donc AUCUN compte Auth.
 * Il vérifie les deux fenêtres — 5/heure par IP, 3/jour par numéro — puis
 * efface les lignes de test qu'il a posées.
 *
 * À lancer APRÈS avoir appliqué 0086 (node scripts/migrer.mjs
 * supabase/migrations/0086_plafond_inscription.sql). Sans la migration, la
 * fonction n'existe pas encore et le test le signale au lieu d'échouer en vrac.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(path.join(racine, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let ok = 0, ko = 0;
const verifier = (nom, cond, detail = "") => {
  if (cond) { ok++; console.log(`  ✓ ${nom}`); }
  else { ko++; console.log(`  ✗ ${nom}${detail ? " — " + detail : ""}`); }
};

// Valeurs de test isolées : IP de la plage de documentation (TEST-NET-3,
// jamais routée), numéro qui n'appartient à personne. On les efface à la fin.
const IP_TEST = "203.0.113.207";
const TEL_TEST = "+224600000000";

const reserver = async (ip, tel) => {
  const { data, error } = await admin.rpc("reserver_inscription", { p_ip: ip, p_telephone: tel });
  if (error) throw error;
  return data[0];
};

const nettoyer = () =>
  admin
    .from("tentatives_inscription")
    .delete()
    .or(`ip.eq.${IP_TEST},telephone.eq.${TEL_TEST}`)
    .then(() => {}, () => {}); // table absente avant migration : sans importance

async function main() {
  // La fonction existe-t-elle ? (avant tout nettoyage, qui échouerait aussi si
  // la table n'est pas encore là.) Ce premier appel sera effacé par `nettoyer`.
  try {
    await reserver(IP_TEST, TEL_TEST);
  } catch (e) {
    if (/reserver_inscription|does not exist|schema cache/i.test(e.message ?? "")) {
      console.log("⏭️  Migration 0086 non appliquée — rien à tester pour l'instant.");
      console.log("    node scripts/migrer.mjs supabase/migrations/0086_plafond_inscription.sql");
      process.exitCode = 0;
      return;
    }
    throw e;
  }

  // Ardoise propre (le test est rejouable, et l'appel-sonde ci-dessus part).
  await nettoyer();

  // --- Fenêtre par IP : 5 passent, la 6e est refusée ---
  let bloqueIp = false;
  for (let i = 1; i <= 5; i++) {
    const r = await reserver(IP_TEST, null);
    if (r.o_trop_ip) bloqueIp = true;
  }
  verifier("les 5 premières créations par IP passent", !bloqueIp);
  const sixieme = await reserver(IP_TEST, null);
  verifier("la 6e création par IP est refusée", sixieme.o_trop_ip === true);

  // --- Fenêtre par numéro : 3 passent, la 4e est refusée ---
  // IP nulle pour isoler le compteur du numéro de celui de l'IP.
  let bloqueTel = false;
  for (let i = 1; i <= 3; i++) {
    const r = await reserver(null, TEL_TEST);
    if (r.o_trop_tel) bloqueTel = true;
  }
  verifier("les 3 premières créations par numéro passent", !bloqueTel);
  const quatrieme = await reserver(null, TEL_TEST);
  verifier("la 4e création par numéro est refusée", quatrieme.o_trop_tel === true);

  // --- Sans identifiant, aucun plafond ne s'arme ---
  const sansRien = await reserver(null, null);
  verifier("une tentative sans IP ni numéro ne bloque jamais",
    sansRien.o_trop_ip === false && sansRien.o_trop_tel === false);

  await nettoyer();

  console.log(`\n${ko === 0 ? "✅" : "❌"} ${ok} vérifié(s), ${ko} échec(s)`);
  process.exitCode = ko === 0 ? 0 : 1;
}

main().catch(async (e) => {
  await nettoyer();
  console.error("Erreur :", e.message ?? e);
  process.exitCode = 1;
});
