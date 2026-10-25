/*
 * Les conditions perdues en cours de route.
 *
 * Une policy ne se modifie pas : on la supprime et on la recrée. Celui qui
 * ajoute une condition doit donc recopier TOUTES les précédentes, et rien
 * dans PostgreSQL ne signale l'oubli. C'est ainsi que `ins_avis` a perdu
 * `peut_noter_rdv` en migration 0051 : pendant des mois, n'importe quel
 * compte actif pouvait noter n'importe quel praticien.
 *
 * Ce script relit toutes les migrations, relève pour chaque policy les
 * FONCTIONS DE GARDE qu'elle a appelées au fil de ses versions, puis
 * compare à la définition vivante en base. Une fonction autrefois exigée
 * et aujourd'hui absente est signalée.
 *
 * Il ne juge pas : une condition peut avoir été retirée volontairement, et
 * une autre l'avoir remplacée. Il montre où regarder.
 *
 * Usage : node scripts/verif-policies.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { Client } from "pg";

const RACINE = fileURLToPath(new URL("../", import.meta.url));
const env = readFileSync(join(RACINE, ".env.local"), "utf8");
const lire = (c) => env.match(new RegExp(`^${c}=(.*)$`, "m"))?.[1].trim();

/* ---------- 1. Ce que disent les migrations ---------- */

const DOSSIER = join(RACINE, "supabase", "migrations");
const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();

/** Les fonctions appelées dans une expression SQL, hors mots-clés. */
const MOTS = new Set(["select", "exists", "coalesce", "array", "in", "and", "or",
  "not", "case", "when", "then", "else", "end", "cast", "nullif", "lower",
  "upper", "count", "sum", "avg", "min", "max", "now", "any", "all",
  // Mots de la grammaire des policies, que la parenthèse suivante fait
  // passer pour des appels de fonction.
  "using", "check", "values", "on", "for", "to", "with", "where", "having",
  "row", "returning", "distinct", "filter", "over", "partition"]);
const fonctions = (sql) => {
  const vues = new Set();
  for (const m of sql.matchAll(/\b([a-z_][a-z0-9_]*)\s*\(/g)) {
    if (!MOTS.has(m[1])) vues.add(m[1]);
  }
  return vues;
};

/**
 * « nom|table » -> [{ fichier, fonctions }] dans l'ordre des migrations.
 * La table fait partie de la clé : un même nom de policy sert sur
 * plusieurs tables, et les confondre inventerait des conditions perdues.
 */
const histoire = new Map();
for (const f of fichiers) {
  const sql = readFileSync(join(DOSSIER, f), "utf8");
  for (const m of sql.matchAll(/create\s+policy\s+(\w+)\s+on\s+(\w+)([\s\S]*?);/gi)) {
    const [, nom, table, corps] = m;
    const cle = `${nom}|${table}`;
    if (!histoire.has(cle)) histoire.set(cle, []);
    histoire.get(cle).push({ fichier: f, nom, table, fonctions: fonctions(corps) });
  }
}

/* ---------- 2. Ce que dit la base ---------- */

const url = new URL(lire("NEXT_PUBLIC_SUPABASE_URL"));
const ref = url.hostname.split(".")[0];
const HOTES = [
  { host: `db.${ref}.supabase.co`, user: "postgres", port: 5432 },
  ...["eu-west-3", "eu-central-1", "eu-west-1", "us-east-1"].map((r) => ({
    host: `aws-0-${r}.pooler.supabase.com`, user: `postgres.${ref}`, port: 5432,
  })),
];
let client = null;
for (const cible of HOTES) {
  const essai = new Client({ ...cible, database: "postgres",
    password: lire("SUPABASE_DB_PASSWORD"), ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000 });
  try { await essai.connect(); client = essai; break; }
  catch { try { await essai.end(); } catch { /* hôte suivant */ } }
}
if (!client) { console.error("Base injoignable."); process.exit(1); }

const { rows } = await client.query(
  `select policyname, tablename, cmd, coalesce(qual,'') || ' ' || coalesce(with_check,'') expr
   from pg_policies where schemaname = 'public'`);
const vivantes = new Map(rows.map((r) => [`${r.policyname}|${r.tablename}`, r]));

/*
 * Deux états qu'aucune comparaison de versions ne révèle, et qui sont les
 * plus graves : une table dont la RLS est éteinte s'ouvre à tout porteur
 * de la clé publique ; une table protégée mais sans aucune règle se ferme
 * à tout le monde, et l'écran qui en dépend échoue en silence.
 */
const { rows: tables } = await client.query(
  `select c.relname, c.relrowsecurity,
          (select count(*) from pg_policies p
            where p.schemaname = 'public' and p.tablename = c.relname) nb
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
   order by c.relname`);
await client.end();

const ouvertes = tables.filter((t) => !t.relrowsecurity);
const murees = tables.filter((t) => t.relrowsecurity && Number(t.nb) === 0);

/* ---------- 3. Ce qui a disparu ---------- */

const suspectes = [];
const absentes = [];

for (const [cle, versions] of histoire) {
  const nom = versions[0].nom;
  const vivante = vivantes.get(cle);
  if (!vivante) {
    // Supprimée depuis, ou renommée : à vérifier une fois, pas une alerte.
    absentes.push(cle.replace("|", " sur "));
    continue;
  }
  const presentes = fonctions(vivante.expr);
  const perdues = new Map(); // fonction -> première migration qui l'exigeait
  for (const v of versions) {
    for (const fn of v.fonctions) {
      if (!presentes.has(fn) && !perdues.has(fn)) perdues.set(fn, v.fichier);
    }
  }
  if (perdues.size) {
    /*
     * `est_admin()` a souvent cédé la place aux permissions fines de la
     * 0043 : c'est un remplacement, pas une perte. On le dit, au lieu de
     * laisser relire dix-huit fois la même chose — une liste d'alertes
     * dont on sait qu'elles sont fausses finit par ne plus être lue.
     */
    const remplacee = (fn) =>
      (fn === "est_admin" || fn === "a_permission_admin")
      && /a_permission_admin|a_une_permission_admin|est_admin/.test(vivante.expr);
    const reelles = [...perdues].filter(([fn]) => !remplacee(fn));
    suspectes.push({ nom, table: vivante.tablename, cmd: vivante.cmd,
      versions: versions.length, perdues, reelles, expr: vivante.expr.trim() });
  }
}

console.log(`${histoire.size} policies relues dans ${fichiers.length} migrations.`);
console.log(`${[...histoire.values()].filter((v) => v.length > 1).length} ont été recréées au moins une fois.\n`);

const aRegarder = suspectes.filter((s) => s.reelles.length);
const remplacements = suspectes.length - aRegarder.length;

if (!aRegarder.length) {
  console.log("✅ Aucune condition de garde perdue en chemin.");
} else {
  console.log(`⚠️  ${aRegarder.length} policy(ies) à regarder — une fonction qu'elles`);
  console.log("    exigeaient autrefois n'apparaît plus, et rien ne l'a remplacée :\n");
  for (const s of aRegarder.sort((a, b) => b.reelles.length - a.reelles.length)) {
    console.log(`  ${s.nom} (${s.table}, ${s.cmd}, ${s.versions} version(s))`);
    for (const [fn, depuis] of s.reelles) console.log(`      ${fn}()  exigée par ${depuis}`);
    console.log(`      aujourd'hui : ${s.expr.replace(/\s+/g, " ").slice(0, 150)}`);
  }
}
if (remplacements) {
  console.log(`\nℹ️  ${remplacements} policy(ies) ont troqué est_admin() contre les ` +
    `permissions fines de la 0043 : remplacement, pas perte.`);
}
console.log(`\n${tables.length} tables examinées.`);
if (ouvertes.length) {
  console.log(`\n🚨 ${ouvertes.length} table(s) SANS protection par ligne — lisibles et`);
  console.log(`   modifiables par quiconque détient la clé publique :`);
  for (const t of ouvertes) console.log(`     ${t.relname}`);
} else {
  console.log("✅ Toutes les tables sont protégées par ligne.");
}
if (murees.length) {
  // Deux lectures possibles, et seul le code dit laquelle : une table que
  // seules les routes serveur touchent (la clé de service ignore la RLS)
  // est bien gardée ainsi ; une table attendue par un écran est en panne.
  console.log(`\nℹ️  ${murees.length} table(s) protégée(s) sans aucune règle — rien n'y est`);
  console.log(`   joignable depuis un navigateur. Voulu pour une table de service,`);
  console.log(`   à corriger si un écran en dépend :`);
  for (const t of murees) console.log(`     ${t.relname}`);
}

if (absentes.length) {
  console.log(`\nℹ️  ${absentes.length} policy(ies) des migrations n'existent plus en base ` +
    `(supprimées ou renommées) : ${absentes.slice(0, 12).join(", ")}${absentes.length > 12 ? "…" : ""}`);
}
