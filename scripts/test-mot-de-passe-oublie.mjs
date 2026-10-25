/**
 * Tests de « Mot de passe oublié ».
 *
 *   node scripts/test-mot-de-passe-oublie.mjs
 *
 * RIEN N'EST ENVOYÉ, et rien n'est laissé derrière : tout ce qui touche à la
 * base se fait dans une transaction terminée par ROLLBACK. C'est une précaution
 * nécessaire, pas une coquetterie — `pg_cron` vide la file toutes les minutes,
 * une ligne déposée pour de bon serait donc réellement expédiée, vers une
 * adresse inventée pour le test.
 *
 * Les deux moitiés du dispositif sont vérifiées séparément :
 *   • la base — catégorie du type, dépôt en file, refus des comptes qui n'ont
 *     plus le droit d'entrer ;
 *   • la rédaction — le message rendu porte bien le lien, et rien d'autre qui
 *     désigne son destinataire.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const ici = path.dirname(fileURLToPath(import.meta.url));
const racine = path.join(ici, "..");

const env = Object.fromEntries(
  readFileSync(path.join(racine, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

let ok = 0, ko = 0;
const verifier = (nom, cond, detail = "") => {
  if (cond) { ok++; console.log(`  ✓ ${nom}`); }
  else { ko++; console.log(`  ✗ ${nom}${detail ? " — " + detail : ""}`); }
};

const JETON = "pkce_essai_de_jeton_0123456789";
const LIEN = `/mot-de-passe-oublie/nouveau?jeton=${JETON}`;

// =====================================================================
// 1 · La base
// =====================================================================
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const bdd = new Client({
  host: `db.${ref}.supabase.co`, user: "postgres", port: 5432,
  password: env.SUPABASE_DB_PASSWORD, database: "postgres",
  ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
});
const q = async (sql, params = []) => (await bdd.query(sql, params)).rows;

await bdd.connect();
try {
  await q("begin");

  console.log("\n1. Un courriel de service, donc jamais refusé");
  const [{ c }] = await q("select categorie_email('mot_de_passe_oublie') as c");
  verifier("la catégorie est « service »", c === "service", c);

  /*
   * On emprunte un compte de démonstration plutôt que d'en inventer un :
   * `utilisateurs.id` référence `auth.users`, un compte ne se fabrique pas en
   * SQL. Son adresse est remplacée le temps de la transaction, parce que les
   * adresses `@test.docteur224.com` sont exclues des envois (migration 0060)
   * et qu'on veut justement voir une ligne se déposer.
   */
  const [compte] = await q(
    `select id from utilisateurs
     where statut = 'actif' and not suspendu_par_admin and role = 'patient' limit 1`);
  if (!compte) { console.log("✗ Aucun compte patient actif en base."); process.exit(1); }
  const adresse = `oubli-essai-${Date.now()}@exemple.invalid`;
  await q("update utilisateurs set email = $2 where id = $1", [compte.id, adresse]);

  await q("update preferences_email set rappels = false, resumes = false where utilisateur_id = $1",
    [compte.id]);
  const [{ a }] = await q("select email_autorise($1, 'mot_de_passe_oublie') as a", [compte.id]);
  verifier("un compte qui a coupé rappels et résumés le reçoit quand même", a === true);

  console.log("\n2. Le dépôt en file");
  await q(
    `select programmer_email($1, 'mot_de_passe_oublie', 'Réinitialisation de votre mot de passe',
                             null, $2)`, [compte.id, LIEN]);
  const file = await q(
    "select adresse, categorie, jeton, lien, etat from emails_en_attente where destinataire_id = $1 and type = 'mot_de_passe_oublie'",
    [compte.id]);
  verifier("une ligne, et une seule", file.length === 1, String(file.length));
  verifier("elle part à l'adresse du compte", file[0]?.adresse === adresse, file[0]?.adresse);
  verifier("le lien emporte le jeton", file[0]?.lien === LIEN, file[0]?.lien);
  verifier("la catégorie est posée", file[0]?.categorie === "service", file[0]?.categorie);
  verifier("le jeton de désabonnement aussi", !!file[0]?.jeton);
  verifier("elle est en attente d'envoi", file[0]?.etat === "a_envoyer", file[0]?.etat);

  console.log("\n3. Deux demandes font deux messages");
  /*
   * L'index des résumés (0059) bornait « un par destinataire, par type et par
   * jour » tout ce qui n'a ni notification ni source — ce qui décrit aussi ce
   * courriel-ci. La 0072 le ramène aux seuls résumés. Le prédicat est vérifié
   * en base avant le comportement : lui seul dit si la migration est passée,
   * là où la collision, elle, se produit en silence.
   */
  const [{ indexdef }] = await q(
    "select indexdef from pg_indexes where tablename = 'emails_en_attente' and indexname = 'emails_resume_unique'");
  verifier("l'index des résumés ne borne que les résumés",
    /resume/.test(indexdef.split("WHERE")[1] ?? ""), "migration 0072 non appliquée");
  await q(
    `select programmer_email($1, 'mot_de_passe_oublie', 'Réinitialisation de votre mot de passe',
                             null, $2)`, [compte.id, `${LIEN}bis`]);
  const [{ n: deux }] = await q(
    "select count(*)::int as n from emails_en_attente where destinataire_id = $1 and type = 'mot_de_passe_oublie'",
    [compte.id]);
  // Un second lien demandé depuis une autre boîte ne doit pas être avalé par
  // l'idempotence prévue pour les rappels : c'est le dernier reçu qui sert.
  verifier("le second lien n'est pas confondu avec le premier", deux === 2, String(deux));

  console.log("\n4. Un compte suspendu ou fermé n'en reçoit pas");
  await q("delete from emails_en_attente where destinataire_id = $1", [compte.id]);
  await q("update utilisateurs set suspendu_par_admin = true where id = $1", [compte.id]);
  const [{ d: suspendu }] = await q("select email_destinataire($1) as d", [compte.id]);
  verifier("aucune adresse pour un compte suspendu", suspendu === null, String(suspendu));
  await q("update utilisateurs set suspendu_par_admin = false, statut = 'supprime' where id = $1",
    [compte.id]);
  const [{ d: ferme }] = await q("select email_destinataire($1) as d", [compte.id]);
  verifier("ni pour un compte fermé", ferme === null, String(ferme));
  await q(
    `select programmer_email($1, 'mot_de_passe_oublie', 'Réinitialisation de votre mot de passe',
                             null, $2)`, [compte.id, LIEN]);
  const [{ n: rien }] = await q(
    "select count(*)::int as n from emails_en_attente where destinataire_id = $1", [compte.id]);
  verifier("et rien n'est déposé pour eux", rien === 0, String(rien));
} finally {
  // Toujours : même un test qui échoue en son milieu ne doit rien laisser.
  await q("rollback").catch(() => {});
  await bdd.end();
}

// =====================================================================
// 2 · La rédaction du message
// =====================================================================
const sortie = path.join(ici, ".tmp-mot-de-passe");
rmSync(sortie, { recursive: true, force: true });
const requerir = createRequire(import.meta.url);
execFileSync(process.execPath, [
  requerir.resolve("typescript/bin/tsc"),
  "lib/emails/contenu.ts", "--outDir", "scripts/.tmp-mot-de-passe",
  "--module", "commonjs", "--target", "es2022", "--esModuleInterop",
  "--skipLibCheck", "--moduleResolution", "node",
], { cwd: racine, stdio: "inherit" });
const { composer } = await import(
  `file://${path.join(sortie, "emails/contenu.js").replace(/\\/g, "/")}`
);

console.log("\n5. Le message");
/*
 * `composer` ne touche à la base que pour un rendez-vous : un faux client
 * suffit ici, et garantit au passage qu'aucune requête n'est faite pour ce
 * type — un courriel de récupération n'a rien à aller chercher.
 */
const faux = { rpc: () => { throw new Error("aucune requête attendue"); } };
const compose = await composer({
  id: "00000000-0000-0000-0000-000000000001",
  destinataire_id: "00000000-0000-0000-0000-000000000002",
  adresse: "quelquun@exemple.invalid",
  type: "mot_de_passe_oublie",
  titre: "Réinitialisation de votre mot de passe",
  corps: null,
  lien: LIEN,
  source_type: null,
  source_id: null,
  categorie: "service",
  jeton: "00000000-0000-0000-0000-000000000003",
}, faux);

const site = (env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
verifier("l'objet annonce la réinitialisation", /mot de passe/i.test(compose.sujet), compose.sujet);
verifier("le bouton mène au formulaire, jeton compris",
  compose.extras.html.includes(`${site}${LIEN}`), site + LIEN);
verifier("le texte brut porte le lien aussi — certaines boîtes n'affichent que lui",
  compose.texte.includes(LIEN));
verifier("le message prévient qu'une demande non faite s'ignore",
  /ignorez ce message/i.test(compose.texte));
verifier("il rappelle qu'on ne demande jamais le mot de passe",
  /jamais votre mot de passe/i.test(compose.texte));
verifier("il ne nomme personne", !/quelquun@exemple\.invalid/.test(compose.extras.html));
verifier("le pied de page reste proposé", compose.extras.html.includes("/desinscription?j="));

rmSync(sortie, { recursive: true, force: true });

console.log(`\n${ko === 0 ? "✅" : "❌"} ${ok} réussis, ${ko} échoués`);
process.exit(ko === 0 ? 0 : 1);
