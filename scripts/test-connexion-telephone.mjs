/**
 * Tests de la connexion par téléphone + code PIN (routes /api/telephone/*).
 *
 *   APP_URL=http://localhost:3997 node scripts/test-connexion-telephone.mjs
 *
 * Exige un serveur lancé avec OTP_CODE_VISIBLE=1 : sans agrégateur SMS ou
 * WhatsApp, c'est le seul moyen de lire le code envoyé. RIEN ne part vers un
 * vrai téléphone — les numéros sont tirés au sort dans la plage 69X, et le
 * journal `messages_envoyes` est en mode simulé pour ces canaux.
 *
 * Tout ce qui est créé est supprimé à la fin (comptes, codes, journal).
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

const numero = () => "69" + String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
const A = numero(), B = numero();
const intl = (n) => `+224${n}`;

async function post(url, corps, { methode = "POST", cookie } = {}) {
  const r = await fetch(APP + url, {
    method: methode,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(corps),
  });
  const cookies = r.headers.getSetCookie?.() ?? [];
  return { statut: r.status, corps: await r.json().catch(() => ({})), cookies };
}
const enCookie = (liste) => liste.map((c) => c.split(";")[0]).join("; ");

const crees = [];
try {
  console.log(`Numéros de test : ${A}, ${B}\n`);

  console.log("1 · Envoi du code d'inscription");
  let r = await post("/api/telephone/code", { telephone: "12345", canal: "sms", objet: "inscription" });
  verifier("numéro invalide refusé (400)", r.statut === 400);
  r = await post("/api/telephone/code", { telephone: A, canal: "fax", objet: "inscription" });
  verifier("canal inconnu refusé (400)", r.statut === 400);
  r = await post("/api/telephone/code", { telephone: A, canal: "whatsapp", objet: "inscription" });
  verifier("code WhatsApp envoyé", r.statut === 200 && /^\d{6}$/.test(r.corps.codeDemonstration ?? ""), JSON.stringify(r.corps));
  const code1 = r.corps.codeDemonstration;
  r = await post("/api/telephone/code", { telephone: A, canal: "sms", objet: "inscription" });
  verifier("renvoi immédiat refusé (429, délai 30 s)", r.statut === 429 && r.corps.renvoiDans > 0);
  const { data: journal } = await admin.from("messages_envoyes").select("canal, statut, motif").eq("destinataire", intl(A));
  verifier("envoi journalisé (canal whatsapp, simulé)", journal?.length === 1 && journal[0].canal === "whatsapp" && journal[0].statut === "simule", JSON.stringify(journal));
  const { data: ligne } = await admin.from("codes_telephone").select("code_hash").eq("telephone", intl(A)).single();
  verifier("le code n'est pas stocké en clair", ligne && !ligne.code_hash.includes(code1));

  console.log("\n2 · Vérification du code");
  r = await post("/api/telephone/code/verifier", { telephone: A, objet: "inscription", code: "12" });
  verifier("code tronqué refusé", r.statut === 400);
  const faux = code1 === "000000" ? "111111" : "000000";
  r = await post("/api/telephone/code/verifier", { telephone: A, objet: "inscription", code: faux });
  verifier("mauvais code refusé", r.statut === 400 && /incorrect/i.test(r.corps.erreur ?? ""));
  r = await post("/api/telephone/code/verifier", { telephone: A, objet: "pin_oublie", code: code1 });
  verifier("code d'inscription inutilisable pour un PIN oublié", r.statut === 400);
  r = await post("/api/telephone/code/verifier", { telephone: A, objet: "inscription", code: code1 });
  verifier("bon code → jeton", r.statut === 200 && typeof r.corps.jeton === "string");
  const jetonA = r.corps.jeton;
  r = await post("/api/telephone/code/verifier", { telephone: A, objet: "inscription", code: code1 });
  verifier("le code ne sert qu'une fois", r.statut === 400);

  console.log("\n3 · Création du compte");
  const profil = { nom: "Test", prenom: "Téléphone", genre: "F", dateNaissance: "1990-04-12", email: "" };
  r = await post("/api/telephone/inscription", { telephone: A, jeton: jetonA, pin: "1234", ...profil });
  verifier("PIN trop simple (1234) refusé", r.statut === 400);
  r = await post("/api/telephone/inscription", { telephone: A, jeton: jetonA, pin: "2580", ...profil, dateNaissance: "2999-01-01" });
  verifier("date de naissance future refusée", r.statut === 400);
  r = await post("/api/telephone/inscription", { telephone: B, jeton: jetonA, pin: "2580", ...profil });
  verifier("jeton d'un autre numéro refusé", r.statut === 400 && r.corps.jetonExpire);
  r = await post("/api/telephone/inscription", { telephone: A, jeton: jetonA, pin: "2580", ...profil });
  verifier("compte créé, session ouverte", r.statut === 200 && r.corps.cible === "/patient" && r.cookies.some((c) => c.startsWith("sb-")), JSON.stringify(r.corps));
  const sessionA = enCookie(r.cookies);
  const { data: ident } = await admin.from("identifiants_telephone").select("utilisateur_id, pin_hash").eq("telephone", intl(A)).single();
  if (ident) crees.push(ident.utilisateur_id);
  verifier("PIN haché (scrypt), jamais en clair", ident?.pin_hash.startsWith("scrypt$") && !ident.pin_hash.includes("2580"));
  const { data: u } = await admin.from("utilisateurs").select("role, email, telephone").eq("id", ident?.utilisateur_id).single();
  verifier("utilisateurs : patient, sans e-mail, numéro international", u?.role === "patient" && u.email === null && u.telephone === intl(A), JSON.stringify(u));
  const { data: pa } = await admin.from("patients").select("genre, date_naissance").eq("id", ident?.utilisateur_id).single();
  verifier("patients : genre et date de naissance", pa?.genre === "F" && pa.date_naissance === "1990-04-12");
  r = await post("/api/telephone/inscription", { telephone: A, jeton: jetonA, pin: "2580", ...profil });
  verifier("le jeton ne sert qu'une fois", r.statut === 400 || r.statut === 409);
  r = await post("/api/telephone/code", { telephone: A, canal: "sms", objet: "inscription" });
  verifier("nouvelle inscription du même numéro refusée (409)", r.statut === 409 && r.corps.compteExistant);

  console.log("\n4 · Session ouverte par l'inscription");
  r = await fetch(APP + "/api/telephone/pin", { headers: { cookie: sessionA } }).then(async (x) => ({ statut: x.status, corps: await x.json() }));
  verifier("GET /api/telephone/pin reconnaît le compte", r.statut === 200 && r.corps.telephone === intl(A));
  r = await fetch(APP + "/api/telephone/pin").then((x) => ({ statut: x.status }));
  verifier("sans session : 401", r.statut === 401);

  console.log("\n5 · Connexion numéro + PIN");
  r = await post("/api/telephone/connexion", { telephone: A, pin: "2581" });
  verifier("PIN faux refusé (401)", r.statut === 401 && /incorrect/i.test(r.corps.erreur ?? ""));
  r = await post("/api/telephone/connexion", { telephone: B, pin: "2580" });
  verifier("numéro inconnu : même réponse", r.statut === 401 && r.corps.erreur === "Numéro ou code PIN incorrect.");
  r = await post("/api/telephone/connexion", { telephone: A, pin: "2580" });
  verifier("bon PIN → session", r.statut === 200 && r.corps.cible === "/patient" && r.cookies.some((c) => c.startsWith("sb-")));
  const { data: apres } = await admin.from("identifiants_telephone").select("echecs").eq("telephone", intl(A)).single();
  verifier("la réussite remet le compteur d'échecs à zéro", apres?.echecs === 0);

  console.log("\n6 · Modification du PIN (connecté)");
  r = await post("/api/telephone/pin", { actuel: "9999", nouveau: "3691" }, { methode: "PUT", cookie: sessionA });
  verifier("PIN actuel faux refusé", r.statut === 400);
  r = await post("/api/telephone/pin", { actuel: "2580", nouveau: "1111" }, { methode: "PUT", cookie: sessionA });
  verifier("nouveau PIN trop simple refusé", r.statut === 400);
  r = await post("/api/telephone/pin", { actuel: "2580", nouveau: "3691" }, { methode: "PUT", cookie: sessionA });
  verifier("PIN modifié", r.statut === 200);
  r = await post("/api/telephone/connexion", { telephone: A, pin: "2580" });
  verifier("l'ancien PIN ne fonctionne plus", r.statut === 401);
  r = await post("/api/telephone/connexion", { telephone: A, pin: "3691" });
  verifier("le nouveau PIN fonctionne", r.statut === 200);

  console.log("\n7 · Verrou après 5 échecs");
  for (let i = 0; i < 5; i++) await post("/api/telephone/connexion", { telephone: A, pin: "4826" });
  r = await post("/api/telephone/connexion", { telephone: A, pin: "3691" });
  verifier("même le bon PIN est refusé pendant le verrou (429)", r.statut === 429 && r.corps.verrouille);
  const rafale = await Promise.all(Array.from({ length: 8 }, () => post("/api/telephone/connexion", { telephone: A, pin: "3691" })));
  verifier("une rafale parallèle ne passe pas le verrou", rafale.every((x) => x.statut === 429));

  console.log("\n8 · PIN oublié");
  r = await post("/api/telephone/code", { telephone: B, canal: "sms", objet: "pin_oublie" });
  verifier("numéro inconnu : réponse neutre, aucun code", r.statut === 200 && !r.corps.codeDemonstration);
  r = await post("/api/telephone/code", { telephone: A, canal: "sms", objet: "pin_oublie" });
  verifier("code SMS envoyé", r.statut === 200 && /^\d{6}$/.test(r.corps.codeDemonstration ?? ""));
  const code2 = r.corps.codeDemonstration;
  r = await post("/api/telephone/code/verifier", { telephone: A, objet: "pin_oublie", code: code2 });
  verifier("code reconnu → jeton", r.statut === 200 && r.corps.jeton);
  const jeton2 = r.corps.jeton;
  r = await post("/api/telephone/pin", { telephone: A, jeton: jeton2, pin: "0000" });
  verifier("nouveau PIN trop simple refusé", r.statut === 400);
  r = await post("/api/telephone/pin", { telephone: A, jeton: jeton2, pin: "7319" });
  verifier("PIN réinitialisé, verrou levé, session ouverte", r.statut === 200 && r.cookies.some((c) => c.startsWith("sb-")), JSON.stringify(r.corps));
  r = await post("/api/telephone/connexion", { telephone: A, pin: "7319" });
  verifier("connexion avec le nouveau PIN", r.statut === 200);
  r = await post("/api/telephone/pin", { telephone: A, jeton: jeton2, pin: "8524" });
  verifier("le jeton de réinitialisation ne sert qu'une fois", r.statut === 400);

  console.log("\n9 · Inscription avec e-mail facultatif");
  r = await post("/api/telephone/code", { telephone: B, canal: "sms", objet: "inscription" });
  const codeB = r.corps.codeDemonstration;
  r = await post("/api/telephone/code/verifier", { telephone: B, objet: "inscription", code: codeB });
  const jetonB = r.corps.jeton;
  r = await post("/api/telephone/inscription", { telephone: B, jeton: jetonB, pin: "5803", ...profil, email: "patient1@test.docteur224.com" });
  verifier("e-mail déjà pris : refusé sans brûler le jeton", r.statut === 400 && /existe déjà/.test(r.corps.erreur ?? ""), JSON.stringify(r.corps));
  const emailB = `tel-${B}@test.docteur224.com`;
  r = await post("/api/telephone/inscription", { telephone: B, jeton: jetonB, pin: "5803", ...profil, email: emailB.toUpperCase() });
  verifier("compte créé avec l'e-mail (mis en minuscules)", r.statut === 200, JSON.stringify(r.corps));
  const { data: identB } = await admin.from("identifiants_telephone").select("utilisateur_id").eq("telephone", intl(B)).single();
  if (identB) crees.push(identB.utilisateur_id);
  const { data: uB } = await admin.from("utilisateurs").select("email").eq("id", identB?.utilisateur_id).single();
  const { data: authB } = await admin.auth.admin.getUserById(identB?.utilisateur_id);
  verifier("même e-mail dans utilisateurs et Auth", uB?.email === emailB && authB?.user?.email === emailB);
} finally {
  console.log("\nNettoyage");
  for (const id of crees) await admin.auth.admin.deleteUser(id);
  await admin.from("codes_telephone").delete().in("telephone", [intl(A), intl(B)]);
  await admin.from("messages_envoyes").delete().in("destinataire", [intl(A), intl(B)]);
  const { count } = await admin.from("utilisateurs").select("id", { count: "exact", head: true }).in("telephone", [intl(A), intl(B)]);
  verifier("aucun compte de test ne reste", count === 0);
}

console.log(`\n${ok} réussis, ${ko} échoués`);
process.exit(ko ? 1 : 0);
