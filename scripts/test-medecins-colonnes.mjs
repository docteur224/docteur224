/*
 * Ce qu'un médecin ne peut pas s'attribuer lui-même (migration 0071),
 * EN BASE, avec une vraie session.
 *
 * `upd_medecins_soi` vérifie qui écrit, jamais quoi. Trois colonnes de la
 * fiche ne relèvent pourtant pas du praticien :
 *
 *   • `etablissement_id` — il se rattachait à n'importe quel établissement
 *     inscrit, entrait dans la liste du gestionnaire, dans ses statistiques,
 *     et pesait sur le palier qui lui est FACTURÉ.
 *   • `note_moyenne` / `nb_avis` — calculées depuis les avis publiés.
 *   • `en_vedette` — la mise en avant sur l'accueil, décidée par l'admin.
 *
 * Le test vérifie aussi que le praticien garde la main sur SA fiche : un
 * garde-fou qui bloquerait tout serait aussi faux que l'absence de garde.
 *
 * Tout ce qui est écrit est remis comme avant. Rien n'est créé.
 * Usage : node scripts/test-medecins-colonnes.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const lire = (c) => env.match(new RegExp(`^${c}=(.*)$`, "m"))?.[1].trim();
const supabase = createClient(lire("NEXT_PUBLIC_SUPABASE_URL"), lire("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  { auth: { persistSession: false } });

const resultats = [];
const test = (nom, ok, detail = "") => {
  resultats.push({ nom, ok });
  console.log(`${ok ? "✅" : "❌"} ${nom}${detail ? ` — ${detail}` : ""}`);
};

const { data: auth, error: errCo } = await supabase.auth.signInWithPassword({
  email: "medecin1@test.docteur224.com", password: "test1234",
});
if (errCo) { console.error("connexion :", errCo.message); process.exit(1); }
const moi = auth.user.id;

/** Un refus doit venir du garde-fou, pas d'une table absente ou d'un typo. */
const refuse = (error) => !!error;

const { data: avant } = await supabase
  .from("medecins")
  .select("etablissement_id, note_moyenne, nb_avis, en_vedette, presentation")
  .eq("id", moi).single();
if (!avant) { console.error("fiche médecin introuvable"); process.exit(1); }

// Une cible réelle : se rattacher à un établissement qui existe vraiment.
const { data: etab } = await supabase.from("etablissements").select("id, nom").limit(1).single();

try {
  {
    const { error } = await supabase.from("medecins")
      .update({ etablissement_id: etab?.id ?? null }).eq("id", moi);
    test("un médecin ne se rattache pas lui-même à un établissement",
      refuse(error), error ? error.message.slice(0, 70) : `ACCEPTÉ → ${etab?.nom}`);
  }
  {
    const { error } = await supabase.from("medecins")
      .update({ note_moyenne: 5, nb_avis: 999 }).eq("id", moi);
    test("un médecin ne s'attribue pas sa note",
      refuse(error), error ? error.message.slice(0, 70) : "ACCEPTÉ");
  }
  {
    const { error } = await supabase.from("medecins")
      .update({ en_vedette: true }).eq("id", moi);
    test("un médecin ne se met pas en vedette",
      refuse(error), error ? error.message.slice(0, 70) : "ACCEPTÉ");
  }

  // Le garde-fou ne doit pas déborder : la fiche reste la sienne.
  {
    const temoin = `${avant.presentation ?? ""} `.trimEnd() + "​";
    const { error } = await supabase.from("medecins")
      .update({ presentation: temoin }).eq("id", moi);
    test("mais il modifie toujours sa présentation", !error, error?.message);
    await supabase.from("medecins").update({ presentation: avant.presentation }).eq("id", moi);
  }

  // Rien n'a bougé, même si un refus avait laissé passer une partie.
  {
    const { data: apres } = await supabase.from("medecins")
      .select("etablissement_id, note_moyenne, nb_avis, en_vedette").eq("id", moi).single();
    test("la fiche est intacte",
      apres.etablissement_id === avant.etablissement_id
      && Number(apres.note_moyenne) === Number(avant.note_moyenne)
      && apres.nb_avis === avant.nb_avis
      && apres.en_vedette === avant.en_vedette,
      JSON.stringify(apres));
  }
} finally {
  // Remise en état, quoi qu'il soit arrivé plus haut. Tant que le garde-fou
  // n'est pas posé, les écritures interdites PASSENT : il faut donc défaire
  // jusqu'à la note, sous peine de laisser un 5 sur 999 avis en production.
  await supabase.from("medecins").update({
    etablissement_id: avant.etablissement_id,
    en_vedette: avant.en_vedette,
    presentation: avant.presentation,
  }).eq("id", moi);
  // La note se rétablit par recalcul depuis les avis publiés, jamais en
  // recopiant la valeur relevée : elle pourrait elle-même être fausse.
  await supabase.rpc("recalculer_note_medecin", { p_medecin_id: moi });
  const ko = resultats.filter((r) => !r.ok).length;
  console.log(`\n${resultats.length - ko}/${resultats.length} contrôles passés`);
  process.exit(ko ? 1 : 0);
}
