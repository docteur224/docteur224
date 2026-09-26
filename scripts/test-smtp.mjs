/**
 * Test de bout en bout du canal e-mail — phase 1.
 *
 * Il n'imite RIEN : il appelle `envoyerMessage` de `lib/messagerie`, la même
 * fonction que les routes de production, compilée telle quelle. Un test qui
 * recopierait la logique d'envoi ne prouverait que sa propre exactitude.
 *
 *   node scripts/test-smtp.mjs [destinataire]
 *
 * Le mode est basculé le temps du test puis RENDU TEL QU'IL ÉTAIT. Le script
 * refuse d'ailleurs de tourner sur une plateforme déjà en service : il écrit
 * dans la configuration de messagerie et envoie de vrais messages.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const ici = path.dirname(fileURLToPath(import.meta.url));

const env = Object.fromEntries(
  readFileSync(path.join(ici, "..", ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
for (const [c, v] of Object.entries(env)) process.env[c] ??= v;

// L'antivirus de ce poste (Avast Mail Shield) substitue son propre certificat
// au serveur SMTP : sans cela le test échoue ici et réussirait en production,
// ce qui est le pire des deux mondes. Le serveur Vercel n'en a pas besoin.
process.env.EMAIL_TLS_NON_VERIFIE ??= "1";

/*
 * GARDE-FOU, placé avant tout le reste : ce script écrit dans la configuration
 * de messagerie et envoie de vrais messages. Sur une plateforme EN SERVICE, il
 * couperait les envois en partant — il remettait autrefois le mode sur
 * « simulé » sans regarder celui qu'il avait trouvé. Il refuse donc une base
 * dont le mode est « réel », sauf exigence explicite, et rend dans tous les
 * cas le mode TEL QU'IL L'A TROUVÉ.
 *
 * Interrogé par `fetch` et non par le client Supabase, et avant la
 * compilation : quitter alors que le client garde des connexions ouvertes fait
 * échouer Node sur une assertion libuv sous Windows, et le refus sortait avec
 * un code d'erreur trompeur.
 */
const reponse = await fetch(
  `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/config_messagerie?id=eq.1&select=mode`,
  {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  }
);
const modeInitial = (await reponse.json())[0]?.mode ?? "simule";
if (modeInitial === "reel" && !process.argv.includes("--forcer")) {
  console.error(
    "✗ La plateforme est en mode RÉEL : ce test modifie la configuration et enverrait\n" +
    "  de vrais messages. Lancez-le sur une base de développement, ou ajoutez --forcer\n" +
    "  si vous savez ce que vous faites."
  );
  // Node 24 sous Windows fait suivre cette sortie d'une assertion libuv et
  // rend 127 au lieu de 1. C'est un bruit de l'environnement, pas du script :
  // le refus s'affiche et la configuration n'est pas touchée.
  process.exit(1);
}

const { createClient } = await import("@supabase/supabase-js");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/*
 * `lib/messagerie` est du TypeScript ; on le compile à chaque exécution plutôt
 * que de garder un dossier produit à côté. Sans cela le test finirait par
 * s'exécuter sur une version périmée de la bibliothèque et donnerait un feu
 * vert sur du code qui n'est plus celui de la production.
 */
const sortie = path.join(ici, ".tmp-messagerie");
rmSync(sortie, { recursive: true, force: true });
// `node <chemin de tsc>` plutôt que `npx` : sous Windows, npx est un `.cmd`
// que `execFileSync` ne sait pas lancer sans shell, et passer par un shell
// pour exécuter un binaire local n'apporte rien d'autre qu'un échappement de
// plus à se tromper.
const requerir = createRequire(import.meta.url);
execFileSync(
  process.execPath,
  [requerir.resolve("typescript/bin/tsc"),
   "lib/messagerie/index.ts", "--outDir", "scripts/.tmp-messagerie",
   "--module", "commonjs", "--target", "es2022", "--esModuleInterop",
   "--skipLibCheck", "--moduleResolution", "node"],
  { cwd: path.join(ici, ".."), stdio: "inherit" }
);

// La bibliothèque est compilée en CommonJS : `import()` la charge très bien,
// mais range ses exports sous `default`.
const messagerie = (await import(`file://${path.join(sortie, "index.js").replace(/\\/g, "/")}`)).default;
const { envoyerMessage, lireConfigMessagerie, configComplete } = messagerie;

let ok = 0;
let ko = 0;
const verifier = (nom, condition, detail = "") => {
  if (condition) {
    ok++;
    console.log(`  ✓ ${nom}`);
  } else {
    ko++;
    console.log(`  ✗ ${nom}${detail ? " — " + detail : ""}`);
  }
};

const modeVers = (mode) => admin.from("config_messagerie").update({ mode }).eq("id", 1);

(async () => {
  const destinataire = process.argv[2] || env.EMAIL_SERVER_USER;

  console.log("\n1. Configuration lue en base");
  const config = await lireConfigMessagerie(admin);
  verifier("fournisseur e-mail = smtp", config.email.fournisseur === "smtp", String(config.email.fournisseur));
  verifier("serveur renseigné", !!config.email.hote, String(config.email.hote));
  verifier("port renseigné", !!config.email.port, String(config.email.port));
  verifier("mot de passe présent côté serveur", !!config.email.cle);
  verifier("configuration jugée complète", configComplete("email", config));

  /*
   * Le garde-fou compte autant que l'envoi : une configuration incomplète ne
   * doit JAMAIS partir en mode réel, sinon le professionnel paie des messages
   * que personne ne reçoit. On le vérifie en retirant le serveur.
   */
  console.log("\n2. Garde-fou de configuration incomplète");
  verifier(
    "sans serveur SMTP, la configuration est refusée",
    !configComplete("email", { ...config, email: { ...config.email, hote: null } })
  );
  verifier(
    "sans mot de passe, la configuration est refusée",
    !configComplete("email", { ...config, email: { ...config.email, cle: null } })
  );

  const { data: titulaire } = await admin
    .from("utilisateurs")
    .select("id, email")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  if (!titulaire) {
    console.log("\n✗ Aucun compte admin en base : impossible d'imputer le message.");
    process.exit(1);
  }

  console.log("\n3. Envoi simulé (mode « simulé »)");
  await modeVers("simule");
  const simule = await envoyerMessage({
    titulaireId: titulaire.id,
    destinataire,
    motif: "test_smtp",
    texte: "Ce message ne doit PAS arriver : le mode est simulé.",
    canal: "email",
    sujet: "Docteur 224 — ne doit pas partir",
  });
  verifier("aucun envoi réel", simule.simule === true);
  verifier("aucune erreur", !simule.erreur, String(simule.erreur));

  console.log("\n4. Envoi réel (mode « réel »)");
  await modeVers("reel");
  const avant = new Date().toISOString();
  const reel = await envoyerMessage({
    titulaireId: titulaire.id,
    destinataire,
    motif: "test_smtp",
    texte:
      "Docteur 224 — test du canal e-mail.\n\n" +
      "Ce message a été envoyé par le circuit de notification de la plateforme " +
      "(lib/messagerie, fournisseur SMTP Hostinger). Aucune action requise.",
    canal: "email",
    sujet: "Docteur 224 — test du canal e-mail",
  });
  verifier("l'envoi est réel et non simulé", reel.simule === false);
  verifier("aucune erreur remontée", !reel.erreur, String(reel.erreur));
  verifier("le serveur a rendu une référence", !!reel.reference, String(reel.reference));

  console.log("\n5. Journalisation");
  const { data: journal } = await admin
    .from("messages_envoyes")
    .select("canal, statut, motif, destinataire, reference_externe, erreur")
    .eq("motif", "test_smtp")
    .gte("envoye_le", avant)
    .order("envoye_le", { ascending: false })
    .limit(1)
    .maybeSingle();
  verifier("le message est journalisé", !!journal);
  verifier("canal = email", journal?.canal === "email", String(journal?.canal));
  verifier("statut = envoye", journal?.statut === "envoye", String(journal?.statut));
  verifier("la référence du serveur est conservée", !!journal?.reference_externe);

  console.log("\n6. Un mot de passe erroné doit échouer, pas passer");
  const { data: sauvegarde } = await admin
    .from("config_messagerie")
    .select("email_cle")
    .eq("id", 1)
    .maybeSingle();
  await admin.from("config_messagerie").update({ email_cle: "mauvais-mot-de-passe" }).eq("id", 1);
  const refus = await envoyerMessage({
    titulaireId: titulaire.id,
    destinataire,
    motif: "test_smtp_refus",
    texte: "Ce message ne doit pas partir.",
    canal: "email",
    sujet: "Docteur 224 — refus attendu",
  });
  verifier("l'envoi échoue", !!refus.erreur, "aucune erreur remontée !");
  verifier(
    "le motif du refus est lisible",
    /535|EAUTH|credential|password|authenticat/i.test(refus.erreur ?? ""),
    String(refus.erreur)
  );
  const { data: trace } = await admin
    .from("messages_envoyes")
    .select("statut, erreur")
    .eq("motif", "test_smtp_refus")
    .order("envoye_le", { ascending: false })
    .limit(1)
    .maybeSingle();
  // Ce qui n'est pas parti doit laisser une trace : c'est ce qu'un patient qui
  // ne s'est pas présenté viendra réclamer.
  verifier("l'échec est journalisé", trace?.statut === "echec", String(trace?.statut));
  await admin.from("config_messagerie").update({ email_cle: sauvegarde.email_cle }).eq("id", 1);

  console.log("\n7. Remise en état");
  await modeVers("simule");
  const { data: fin } = await admin
    .from("config_messagerie")
    .select("mode, email_cle")
    .eq("id", 1)
    .maybeSingle();
  verifier("le mode est rendu tel qu il était", fin?.mode === modeInitial, String(fin?.mode));
  verifier("mot de passe restauré", fin?.email_cle === sauvegarde.email_cle);

  await admin.from("messages_envoyes").delete().in("motif", ["test_smtp", "test_smtp_refus"]);

  console.log(`\n${ko === 0 ? "✅" : "❌"} ${ok}/${ok + ko}`);
  if (!reel.erreur) console.log(`\n📬 Un message réel a été envoyé à ${destinataire} — vérifiez la boîte.`);
  process.exit(ko === 0 ? 0 : 1);
})();
