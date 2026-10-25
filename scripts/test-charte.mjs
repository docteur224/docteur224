/*
 * Tests de la charte rattachée au compte (migration 0070), EN BASE, avec de
 * vraies sessions.
 *
 *   Cloisonnement : la charte d'un compte n'est lisible que par lui. Rien à
 *     y cacher, mais rien non plus qui justifie qu'un autre la voie —
 *     l'administration comprise, contrairement aux préférences d'e-mail.
 *   Format : la base refuse elle-même ce qui n'est pas « #rrggbb ». Ces
 *     valeurs finissent dans une feuille de style ; l'applicatif filtre
 *     déjà, mais une base qui fait confiance à son client ne protège rien.
 *   Complétude : les deux couleurs ensemble, ou aucune. Une demi-charte
 *     donnerait un espace bancal que personne n'a demandé.
 *   Retour à l'origine : la ligne est effacée, et non remplie des valeurs
 *     par défaut — un compte qui n'a rien choisi doit suivre la charte
 *     Docteur 224 si elle évolue, pas rester figé sur l'ancienne.
 *
 * Tout ce qui est écrit est effacé à la fin.
 * Usage : node scripts/test-charte.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const lire = (cle) => env.match(new RegExp(`^${cle}=(.*)$`, "m"))?.[1].trim();
const URL_SB = lire("NEXT_PUBLIC_SUPABASE_URL");
const ANON = lire("NEXT_PUBLIC_SUPABASE_ANON_KEY");

const resultats = [];
const test = (nom, ok, detail = "") => {
  resultats.push({ nom, ok });
  console.log(`${ok ? "✅" : "❌"} ${nom}${detail ? ` — ${detail}` : ""}`);
};

async function clientPour(email, mdp = "test1234") {
  const c = createClient(URL_SB, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: mdp });
  if (error) throw new Error(`connexion ${email}: ${error.message}`);
  return { client: c, id: data.user.id };
}

const TABLE = "preferences_affichage";
const patient = await clientPour("patient1@test.docteur224.com");
const autre = await clientPour("patient2@test.docteur224.com");
const medecin = await clientPour("medecin1@test.docteur224.com");
const admin = await clientPour("admin@docteur224.com", "alpha2308");

try {
  // ---------- écriture et relecture ----------
  {
    const { error } = await patient.client.from(TABLE).upsert(
      { utilisateur_id: patient.id, charte_principale: "#5a2a14", charte_accent: "#c25400" },
      { onConflict: "utilisateur_id" },
    );
    test("un compte enregistre sa charte", !error, error?.message);
    const { data } = await patient.client.from(TABLE)
      .select("charte_principale, charte_accent").eq("utilisateur_id", patient.id).maybeSingle();
    test("il la relit à l'identique",
      data?.charte_principale === "#5a2a14" && data?.charte_accent === "#c25400",
      JSON.stringify(data));
  }

  // ---------- cloisonnement ----------
  {
    const { data } = await autre.client.from(TABLE).select("*").eq("utilisateur_id", patient.id);
    test("un autre compte ne voit pas sa charte", (data ?? []).length === 0, `${data?.length ?? 0} ligne(s)`);
  }
  {
    const { data } = await medecin.client.from(TABLE).select("*").eq("utilisateur_id", patient.id);
    test("un médecin non plus", (data ?? []).length === 0, `${data?.length ?? 0} ligne(s)`);
  }
  {
    const { data } = await admin.client.from(TABLE).select("*").eq("utilisateur_id", patient.id);
    test("l'administration non plus", (data ?? []).length === 0, `${data?.length ?? 0} ligne(s)`);
  }
  {
    const { error } = await autre.client.from(TABLE).upsert(
      { utilisateur_id: patient.id, charte_principale: "#000000", charte_accent: "#ffffff" },
      { onConflict: "utilisateur_id" },
    );
    test("et ne peut pas la lui changer", !!error, error ? "refusé" : "ACCEPTÉ");
    const { data } = await patient.client.from(TABLE)
      .select("charte_principale").eq("utilisateur_id", patient.id).maybeSingle();
    test("la charte d'origine est intacte", data?.charte_principale === "#5a2a14", data?.charte_principale);
  }

  // ---------- la base refuse ce qui n'est pas une couleur ----------
  for (const mauvaise of ["red;}html{display:none", "#GGGGGG", "#12345", "rgb(1,2,3)", "#ABCDEF"]) {
    const { error } = await patient.client.from(TABLE).upsert(
      { utilisateur_id: patient.id, charte_principale: mauvaise, charte_accent: "#c25400" },
      { onConflict: "utilisateur_id" },
    );
    test(`format refusé : ${JSON.stringify(mauvaise)}`, !!error, error ? "" : "ACCEPTÉ");
  }

  // ---------- les deux ou aucune ----------
  {
    const { error } = await patient.client.from(TABLE).upsert(
      { utilisateur_id: patient.id, charte_principale: "#5a2a14", charte_accent: null },
      { onConflict: "utilisateur_id" },
    );
    test("une demi-charte est refusée", !!error, error ? "" : "ACCEPTÉE");
  }
  {
    const { error } = await patient.client.from(TABLE).upsert(
      { utilisateur_id: patient.id, charte_principale: null, charte_accent: null },
      { onConflict: "utilisateur_id" },
    );
    test("les deux vides sont acceptés", !error, error?.message);
  }

  // ---------- retour aux couleurs d'origine ----------
  {
    await patient.client.from(TABLE).upsert(
      { utilisateur_id: patient.id, charte_principale: "#0b3f4a", charte_accent: "#0097aa" },
      { onConflict: "utilisateur_id" },
    );
    const { error } = await patient.client.from(TABLE).delete().eq("utilisateur_id", patient.id);
    test("revenir à l'origine efface la ligne", !error, error?.message);
    const { data } = await patient.client.from(TABLE).select("*").eq("utilisateur_id", patient.id);
    test("il ne reste rien", (data ?? []).length === 0, `${data?.length ?? 0} ligne(s)`);
  }
} finally {
  await patient.client.from(TABLE).delete().eq("utilisateur_id", patient.id);
  const ko = resultats.filter((r) => !r.ok).length;
  console.log(`\n${resultats.length - ko}/${resultats.length} contrôles passés`);
  process.exit(ko ? 1 : 0);
}
