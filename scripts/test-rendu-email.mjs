/**
 * Tests du rendu des e-mails — phase 3.
 *
 *   node scripts/test-rendu-email.mjs
 *
 * Il appelle `composer` de `lib/emails`, la fonction même qu'utilise le drain,
 * compilée à chaque exécution. Il écrit aussi chaque message rendu dans le
 * dossier `apercus-email/` pour qu'on puisse les ouvrir dans un navigateur :
 * un test peut dire qu'une balise existe, il ne peut pas dire que c'est beau.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const ici = path.dirname(fileURLToPath(import.meta.url));
const racine = path.join(ici, "..");

const env = Object.fromEntries(
  readFileSync(path.join(racine, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
for (const [c, v] of Object.entries(env)) process.env[c] ??= v;

const sortie = path.join(ici, ".tmp-messagerie");
rmSync(sortie, { recursive: true, force: true });
const requerir = createRequire(import.meta.url);
execFileSync(process.execPath, [
  requerir.resolve("typescript/bin/tsc"),
  "lib/emails/contenu.ts", "--outDir", "scripts/.tmp-messagerie",
  "--module", "commonjs", "--target", "es2022", "--esModuleInterop",
  "--skipLibCheck", "--moduleResolution", "node",
], { cwd: racine, stdio: "inherit" });

const charger = async (f) =>
  (await import(`file://${path.join(sortie, f).replace(/\\/g, "/")}`)).default;
const { composer } = await charger("emails/contenu.js");
const { fichierCalendrier } = await charger("emails/ics.js");
const { construireHtml, echapperHtml } = await charger("emails/gabarit.js");
const { createClient } = await import("@supabase/supabase-js");

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let ok = 0, ko = 0;
const verifier = (nom, cond, detail = "") => {
  if (cond) { ok++; console.log(`  ✓ ${nom}`); }
  else { ko++; console.log(`  ✗ ${nom}${detail ? " — " + detail : ""}`); }
};

// ---------------------------------------------------------------- calendrier
console.log("\n1. Le fichier d'agenda (.ics)");
const ics = fichierCalendrier({
  rdvId: "11111111-2222-3333-4444-555555555555",
  debut: new Date("2027-03-15T09:30:00Z"),
  creeLe: new Date("2027-03-01T08:00:00Z"),
  titre: "Rendez-vous — Dr Mamadou Diallo",
  description: "Dr Mamadou Diallo, cardiologue\nMotif : contrôle annuel ; à jeun",
  lieu: "Clinique Ambroise Paré — Route du Niger, Conakry",
});
const lignesIcs = ics.contenu.split("\r\n");
verifier("les lignes sont séparées par CRLF", ics.contenu.includes("\r\n"));
verifier("aucun LF isolé", !/[^\r]\n/.test(ics.contenu));
verifier("commence et finit comme un calendrier",
  lignesIcs[0] === "BEGIN:VCALENDAR" && lignesIcs.filter(Boolean).at(-1) === "END:VCALENDAR");
verifier("l'heure de fin est 30 min après le début", ics.contenu.includes("DTEND:20270315T100000Z"));
verifier("l'heure de début est exacte", ics.contenu.includes("DTSTART:20270315T093000Z"));
verifier("l'UID est stable et rattaché au rendez-vous",
  ics.contenu.includes("UID:rdv-11111111-2222-3333-4444-555555555555@docteur224.com"));
verifier("les virgules de la description sont échappées",
  ics.contenu.includes("Diallo\\, cardiologue"));
verifier("les points-virgules aussi", ics.contenu.includes("contr\\;") || ics.contenu.includes("annuel \\;"));
verifier("les retours à la ligne deviennent \\n", ics.contenu.includes("\\nMotif"));
verifier("la séquence est un entier positif", /SEQUENCE:\d+/.test(ics.contenu));
verifier("le type MIME porte la méthode", ics.type.includes("method=PUBLISH"));

/*
 * Le pliage est la règle qu'on casse sans s'en rendre compte : une ligne trop
 * longue est refusée par une partie des agendas, et le français la dépasse
 * vite. On mesure en OCTETS, comme la RFC.
 */
const tropLongues = lignesIcs.filter((l) => Buffer.byteLength(l, "utf8") > 75);
verifier("aucune ligne ne dépasse 75 octets", tropLongues.length === 0,
  tropLongues.map((l) => `${Buffer.byteLength(l)} o`).join(", "));
verifier("les lignes repliées commencent par une espace",
  lignesIcs.every((l, i) => i === 0 || !l.startsWith(" ") || l.length > 1));

console.log("\n2. Pliage d'une valeur longue et accentuée");
const long = fichierCalendrier({
  rdvId: "aaaa", debut: new Date("2027-03-15T09:30:00Z"), creeLe: new Date("2027-03-01T08:00:00Z"),
  titre: "Rendez-vous", lieu: "Conakry",
  description: "Établissement hospitalier spécialisé en médecine générale — " +
    "présentez-vous à l’accueil muni de votre carte et de vos résultats antérieurs, " +
    "nécessaires à la consultation.",
});
const lignesLong = long.contenu.split("\r\n");
verifier("aucune ligne ne dépasse 75 octets",
  lignesLong.every((l) => Buffer.byteLength(l, "utf8") <= 75));
verifier("le texte replié se recompose à l'identique",
  lignesLong.join("\r\n").replace(/\r\n /g, "").includes("nécessaires à la consultation."));

// ---------------------------------------------------------------------- HTML
console.log("\n3. Le gabarit HTML");
const injection = construireHtml({
  titre: 'Titre <script>alert("x")</script>',
  apercu: "aperçu & co",
  paragraphes: ['Motif : "douleur" <b>aiguë</b> & fièvre'],
  faits: [{ intitule: "Lieu", valeur: "<img src=x onerror=alert(1)>" }],
  bouton: { libelle: "Voir", url: 'https://ex.com/?a=1&b="2"' },
});
verifier("le HTML injecté est neutralisé", !injection.includes("<script>"));
verifier("les esperluettes sont encodées", injection.includes("&amp;"));
verifier("les guillemets d'attribut sont encodés", injection.includes("&quot;"));
verifier("l'image piégée ne devient pas une balise", !injection.includes("<img src=x"));
verifier("`echapperHtml` traite les quatre caractères",
  echapperHtml('<>&"') === "&lt;&gt;&amp;&quot;");
verifier("aucune variable CSS n'a survécu", !injection.includes("var(--"));
verifier("la mise en page repose sur des tableaux", injection.includes("<table"));
verifier("les styles sont en ligne, pas en feuille", !/<style[\s>]/.test(injection));
verifier("l'aperçu de boîte de réception est masqué",
  /display:none;max-height:0/.test(injection));

// ------------------------------------------------------- message de bout en bout
console.log("\n4. Un message réel, pour chaque type d'événement");
const { data: rdvs } = await admin
  .from("rendez_vous")
  .select("id, patient_id, medecin_id")
  .not("patient_id", "is", null)
  .limit(1);
if (!rdvs?.length) { console.log("✗ Aucun rendez-vous en base pour composer un aperçu."); process.exit(1); }
const rdv = rdvs[0];

const dossier = path.join(racine, "apercus-email");
rmSync(dossier, { recursive: true, force: true });
mkdirSync(dossier, { recursive: true });

const TYPES = [
  "rdv_reserve", "rdv_confirme", "rdv_reprogramme", "rdv_annule",
  "rdv_nouveau", "rappel_j1", "rappel_h5",
];
const AVEC_ICS = ["rdv_reserve", "rdv_confirme", "rdv_reprogramme"];

for (const type of TYPES) {
  const compose = await composer({
    id: "x", destinataire_id: rdv.patient_id, adresse: "essai@docteur224.com",
    type, titre: "Repli", corps: "Corps de repli.", lien: `/mes-rendez-vous/${rdv.id}`,
    source_type: "rendez_vous", source_id: rdv.id,
  }, admin);

  writeFileSync(path.join(dossier, `${type}.html`), compose.extras.html, "utf8");
  const attendu = AVEC_ICS.includes(type);
  verifier(`${type} — objet propre au type`, compose.sujet !== "Repli", compose.sujet);
  verifier(`${type} — HTML et texte produits`,
    !!compose.extras.html && compose.texte.length > 80);
  verifier(`${type} — calendrier ${attendu ? "joint" : "absent"}`,
    (compose.extras.pieces?.length ?? 0) === (attendu ? 1 : 0));
  verifier(`${type} — le texte dit la même chose que le HTML`,
    compose.texte.includes(compose.sujet));
}

console.log("\n5. Repli sur un type sans rédaction propre");
const repli = await composer({
  id: "x", destinataire_id: rdv.patient_id, adresse: "essai@docteur224.com",
  type: "avis_reponse", titre: "Réponse à votre avis", corps: "Dr Diallo a répondu.",
  lien: "/patient/avis", source_type: "avis", source_id: rdv.id,
}, admin);
writeFileSync(path.join(dossier, "avis_reponse.html"), repli.extras.html, "utf8");
verifier("le titre de la notification est repris", repli.sujet === "Réponse à votre avis");
verifier("le corps est présent", repli.extras.html.includes("a répondu"));
verifier("aucun calendrier n'est joint", !repli.extras.pieces);
verifier("un bouton mène quand même à l'écran visé",
  repli.extras.html.includes("/patient/avis"));

console.log("\n6. Le pied de page permet toujours de se désabonner");
const JETON = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const pied = async (type, categorie) =>
  composer({
    id: "x", destinataire_id: rdv.patient_id, adresse: "essai@docteur224.com",
    type, titre: "T", corps: "C", lien: "/mes-rendez-vous/x",
    source_type: "rendez_vous", source_id: rdv.id, categorie, jeton: JETON,
  }, admin);

const service = await pied("rdv_reserve", "service");
verifier("un e-mail de service renvoie aux réglages", service.extras.html.includes("Gérer mes notifications"));
verifier("sans proposer de couper le service",
  !/c=service/.test(service.extras.html) && !service.extras.html.includes("Ne plus recevoir"));

const rappel = await pied("rappel_j1", "rappel");
verifier("un rappel propose de le couper", rappel.extras.html.includes("Ne plus recevoir les rappels"));
verifier("le lien porte le jeton et la catégorie",
  rappel.extras.html.includes(`/desinscription?j=${JETON}&amp;c=rappel`),
  "l'esperluette doit être encodée dans un attribut HTML");
verifier("la version texte le porte aussi", rappel.texte.includes("/desinscription?j="));

const sansJeton = await composer({
  id: "x", destinataire_id: rdv.patient_id, adresse: "essai@docteur224.com",
  type: "rappel_j1", titre: "T", corps: "C", lien: null,
  source_type: "rendez_vous", source_id: rdv.id, categorie: "rappel", jeton: null,
}, admin);
verifier("sans jeton, aucun lien mensonger n'est fabriqué",
  !sansJeton.extras.html.includes("/desinscription"));

console.log("\n7. Le résumé de l'administrateur");
const resume = await composer({
  id: "x", destinataire_id: rdv.patient_id, adresse: "essai@docteur224.com",
  type: "resume_admin", titre: "Votre résumé du jour",
  corps: "Praticiens à valider : 3\nSignalements à traiter : 12",
  lien: "/espace-admin", source_type: "resume", source_id: null,
  categorie: "resume", jeton: JETON,
}, admin);
writeFileSync(path.join(dossier, "resume_admin.html"), resume.extras.html, "utf8");
verifier("les lignes de chiffres deviennent un encadré",
  resume.extras.html.includes("Praticiens à valider") && resume.extras.html.includes(">3<"));
verifier("le second chiffre est là aussi", resume.extras.html.includes(">12<"));
verifier("l'aperçu résume les chiffres", /3 praticiens/.test(resume.extras.html));
verifier("il propose de couper le résumé", resume.extras.html.includes("c=resume"));
verifier("aucun calendrier n'est joint", !resume.extras.pieces);

console.log("\n8. Un rendez-vous effacé ne bloque pas l'envoi");
const orphelin = await composer({
  id: "x", destinataire_id: rdv.patient_id, adresse: "essai@docteur224.com",
  type: "rdv_reserve", titre: "Rendez-vous enregistré", corps: "Le 15 mars.",
  lien: "/mes-rendez-vous/x", source_type: "rendez_vous",
  source_id: "00000000-0000-0000-0000-000000000000",
}, admin);
verifier("un message est quand même produit", !!orphelin.extras.html);
verifier("il retombe sur le texte de la notification",
  orphelin.sujet === "Rendez-vous enregistré");
verifier("sans calendrier inventé", !orphelin.extras.pieces);

rmSync(sortie, { recursive: true, force: true });
console.log(`\n${ko === 0 ? "✅" : "❌"} ${ok}/${ok + ko}`);
console.log(`\n📄 Aperçus écrits dans apercus-email/ (${TYPES.length + 1} fichiers).`);
process.exit(ko === 0 ? 0 : 1);
