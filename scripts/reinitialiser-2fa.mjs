/**
 * Bris de glace — réinitialise la 2FA d'un compte, par e-mail.
 *
 *   node scripts/reinitialiser-2fa.mjs <email>
 *
 * À N'UTILISER QUE pour débloquer un administrateur verrouillé — en premier
 * lieu le compte PRINCIPAL, qui ne peut pas être réinitialisé depuis
 * l'application (il n'a personne au-dessus de lui). Pour les autres membres,
 * l'administrateur principal dispose du bouton dans « Équipe admin ».
 *
 * Emploie la clé service_role : retire TOUS les facteurs du compte. Sa
 * prochaine connexion n'exigera plus de code (il devra se réenrôler si
 * l'interrupteur « 2FA obligatoire » est posé).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Usage : node scripts/reinitialiser-2fa.mjs <email>");
  process.exit(1);
}

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

async function main() {
  const { data: profil, error: eProfil } = await admin
    .from("utilisateurs")
    .select("id, role, nom, prenom")
    .eq("email", email)
    .maybeSingle();
  if (eProfil) throw eProfil;
  if (!profil) {
    console.error(`Aucun compte avec l'adresse ${email}.`);
    process.exitCode = 1;
    return;
  }

  const { data: liste, error: eList } = await admin.auth.admin.mfa.listFactors({ userId: profil.id });
  if (eList) throw eList;
  const facteurs = liste?.factors ?? [];
  if (facteurs.length === 0) {
    console.log(`Aucun facteur à retirer pour ${profil.prenom ?? ""} ${profil.nom ?? ""} (${email}).`);
    return;
  }

  for (const f of facteurs) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: profil.id });
    if (error) throw error;
    console.log(`  – facteur ${f.friendly_name || f.factor_type} (${f.id}) retiré`);
  }
  console.log(
    `\n✅ 2FA réinitialisée pour ${profil.prenom ?? ""} ${profil.nom ?? ""} (${email}, rôle ${profil.role}).`
  );
}

main().catch((e) => {
  console.error("Erreur :", e.message ?? e);
  process.exitCode = 1;
});
