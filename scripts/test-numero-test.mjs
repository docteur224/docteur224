/**
 * Tests du numéro de test de la connexion par téléphone (migration 0078).
 *
 *   APP_URL=http://localhost:3997 node scripts/test-numero-test.mjs
 *
 * Le serveur doit tourner SANS `OTP_CODE_VISIBLE` : c'est la situation de la
 * production, où seul le numéro de test peut obtenir un code. Le réglage
 * trouvé en base est rendu à la fin, et tout compte créé est supprimé.
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
const APP = process.env.APP_URL ?? "http://localhost:3997";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let ok = 0, ko = 0;
const verifier = (nom, cond, detail = "") => {
  if (cond) { ok++; console.log(`  ✓ ${nom}`); }
  else { ko++; console.log(`  ✗ ${nom}${detail ? " — " + detail : ""}`); }
};
const post = async (url, corps) => {
  const r = await fetch(APP + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
  return { statut: r.status, corps: await r.json().catch(() => ({})), cookies: r.headers.getSetCookie?.() ?? [] };
};
const lireTest = async () => (await fetch(APP + "/api/telephone/test")).json();

const numero = "69" + String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
const autre = "69" + String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
const CODE = "135790";
const { data: origine } = await admin.from("telephone_test").select("actif, numero, code").eq("id", 1).single();

try {
  console.log("1 · Option décochée");
  await admin.from("telephone_test").update({ actif: false, numero: `+224${numero}`, code: CODE }).eq("id", 1);
  let t = await lireTest();
  verifier("la page publique ne voit ni numéro ni code", t.actif === false && !t.numero && !t.code, JSON.stringify(t));
  let r = await post("/api/telephone/code", { telephone: numero, canal: "sms", objet: "inscription" });
  verifier("numéro de test refusé comme les autres (503)", r.statut === 503);

  console.log("\n2 · Option cochée");
  await admin.from("telephone_test").update({ actif: true }).eq("id", 1);
  t = await lireTest();
  verifier("la page publique voit le numéro et le code", t.actif && t.numero === `+224${numero}` && t.code === CODE);
  r = await post("/api/telephone/code", { telephone: numero, canal: "whatsapp", objet: "inscription" });
  verifier("code fixe rendu pour le numéro de test", r.statut === 200 && r.corps.codeTest === CODE, JSON.stringify(r.corps));
  r = await post("/api/telephone/code", { telephone: numero, canal: "sms", objet: "inscription" });
  verifier("pas de délai de renvoi sur le numéro de test", r.statut === 200);
  const { count: journal } = await admin.from("messages_envoyes").select("id", { count: "exact", head: true }).eq("destinataire", `+224${numero}`);
  verifier("aucun message journalisé ni envoyé", journal === 0);
  r = await post("/api/telephone/code", { telephone: autre, canal: "sms", objet: "inscription" });
  verifier("un autre numéro reste refusé (503)", r.statut === 503);

  console.log("\n3 · Inscription, connexion, PIN oublié avec le numéro de test");
  r = await post("/api/telephone/code/verifier", { telephone: numero, objet: "inscription", code: "000001" });
  verifier("un autre code que celui de test est refusé", r.statut === 400);
  r = await post("/api/telephone/code/verifier", { telephone: numero, objet: "inscription", code: CODE });
  verifier("le code de test est accepté", r.statut === 200 && r.corps.jeton);
  r = await post("/api/telephone/inscription", {
    telephone: numero, jeton: r.corps.jeton, pin: "2580", nom: "Test", prenom: "Numéro", genre: "M", dateNaissance: "1990-01-01", email: "",
  });
  verifier("compte de test créé, session ouverte", r.statut === 200 && r.cookies.some((c) => c.startsWith("sb-")), JSON.stringify(r.corps));
  r = await post("/api/telephone/connexion", { telephone: numero, pin: "2580" });
  verifier("connexion numéro de test + PIN", r.statut === 200);
  r = await post("/api/telephone/code", { telephone: numero, canal: "sms", objet: "pin_oublie" });
  verifier("PIN oublié : code de test rendu", r.statut === 200 && r.corps.codeTest === CODE);
  r = await post("/api/telephone/code/verifier", { telephone: numero, objet: "pin_oublie", code: CODE });
  r = await post("/api/telephone/pin", { telephone: numero, jeton: r.corps.jeton, pin: "3691" });
  verifier("PIN réinitialisé", r.statut === 200);

  console.log("\n4 · Décocher coupe tout de suite");
  await admin.from("telephone_test").update({ actif: false }).eq("id", 1);
  r = await post("/api/telephone/code", { telephone: numero, canal: "sms", objet: "pin_oublie" });
  verifier("le numéro de test n'obtient plus de code (503)", r.statut === 503);
  r = await post("/api/telephone/connexion", { telephone: numero, pin: "3691" });
  verifier("le compte déjà créé se connecte toujours par PIN", r.statut === 200);
} finally {
  console.log("\nNettoyage");
  const { data: ident } = await admin.from("identifiants_telephone").select("utilisateur_id").eq("telephone", `+224${numero}`).maybeSingle();
  if (ident) await admin.auth.admin.deleteUser(ident.utilisateur_id);
  await admin.from("codes_telephone").delete().in("telephone", [`+224${numero}`, `+224${autre}`]);
  await admin.from("telephone_test").update(origine).eq("id", 1);
  const { data: rendu } = await admin.from("telephone_test").select("actif, numero, code").eq("id", 1).single();
  verifier("réglage d'origine rendu", JSON.stringify(rendu) === JSON.stringify(origine));
}

console.log(`\n${ok} réussis, ${ko} échoués`);
process.exit(ko ? 1 : 0);
