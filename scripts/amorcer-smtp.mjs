/**
 * Amorçage de la configuration SMTP depuis `.env.local`.
 *
 * La source de vérité de la messagerie, c'est `config_messagerie` en base —
 * c'est elle que lit `lireConfigMessagerie`, et elle que règle
 * /espace-admin/messagerie sans redéploiement. Ce script n'est qu'un passe-
 * plat : il recopie une fois les identifiants Hostinger du fichier
 * d'environnement vers la base, pour éviter de les ressaisir à la main.
 *
 * Il ne bascule PAS le mode en réel. Ce geste-là se fait depuis l'écran
 * d'administration, après un envoi d'essai réussi : c'est le moment où l'on
 * sait que la configuration fonctionne, et personne ne doit l'apprendre en
 * production.
 *
 *   node scripts/amorcer-smtp.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const manquants = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "EMAIL_SERVER_HOST",
  "EMAIL_SERVER_PORT",
  "EMAIL_SERVER_USER",
  "EMAIL_SERVER_PASSWORD",
  "EMAIL_FROM",
].filter((c) => !env[c]);
if (manquants.length) {
  console.error(`✗ Manque dans .env.local : ${manquants.join(", ")}`);
  process.exit(1);
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/*
 * L'adresse d'expédition porte un nom affichable : c'est lui que le patient
 * voit dans sa boîte, avant même d'ouvrir. « contact@docteur224.com » tout nu
 * a l'air d'un robot ; « Docteur 224 » a l'air de son rendez-vous.
 */
const expediteur = env.EMAIL_FROM.includes("<")
  ? env.EMAIL_FROM
  : `Docteur 224 <${env.EMAIL_FROM}>`;

const { error } = await admin
  .from("config_messagerie")
  .update({
    email_fournisseur: "smtp",
    email_hote: env.EMAIL_SERVER_HOST,
    email_port: Number(env.EMAIL_SERVER_PORT),
    email_identifiant: env.EMAIL_SERVER_USER,
    email_cle: env.EMAIL_SERVER_PASSWORD,
    email_expediteur: expediteur,
    maj_le: new Date().toISOString(),
  })
  .eq("id", 1);

if (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}

// La vue publique, justement parce qu'elle ne porte aucun secret : un script
// qui réaffiche le mot de passe qu'on vient de poser le laisse dans
// l'historique du terminal.
const { data } = await admin
  .from("config_messagerie_publique")
  .select("mode, email_fournisseur, email_hote, email_port, email_identifiant, email_expediteur, email_cle_posee")
  .eq("id", 1)
  .maybeSingle();

console.log("✓ Configuration SMTP posée en base :");
console.log(`    serveur      ${data.email_hote}:${data.email_port}`);
console.log(`    identifiant  ${data.email_identifiant}`);
console.log(`    expéditeur   ${data.email_expediteur}`);
console.log(`    mot de passe ${data.email_cle_posee ? "posé" : "ABSENT"}`);
console.log(`    mode         ${data.mode}${data.mode === "simule" ? " — rien ne partira tant qu'il n'est pas « réel »" : ""}`);
