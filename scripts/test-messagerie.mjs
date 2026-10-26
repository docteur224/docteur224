/*
 * Logique de la messagerie patient ↔ médecin ↔ assistant(e) (migrations
 * 0066 et 0074), EN BASE, avec de vraies sessions.
 *
 *   Aller-retour : le patient écrit, le médecin reçoit et répond, le patient
 *     reçoit la réponse. Puis l'assistant(e) — avec la permission — répond au
 *     NOM du médecin, et le patient le reçoit aussi.
 *   Objet : porté par le premier message, il titre la conversation et
 *     remonte dans les deux listes (`conversations_patient`,
 *     `conversations_medecin`).
 *   Non-lus : chaque côté ne compte que ce que l'AUTRE lui a envoyé.
 *   Marquage « lu » : lire côté soignant ne doit marquer que les messages
 *     du patient — jamais ceux du médecin, que le patient n'a pas encore vus.
 *
 * Tout ce qui est écrit porte un marqueur et est effacé à la fin.
 * Usage : node scripts/test-messagerie.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const envVar = (c) => env.match(new RegExp(`^${c}=(.*)$`, "m"))?.[1].trim();
const URL_SB = envVar("NEXT_PUBLIC_SUPABASE_URL");
const ANON = envVar("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const admin = createClient(URL_SB, envVar("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const MARQUEUR = "[TEST-MSG-" + Date.now() + "]";
const resultats = [];
const test = (nom, ok, detail = "") => {
  resultats.push({ nom, ok });
  console.log(`${ok ? "✅" : "❌"} ${nom}${detail ? ` — ${detail}` : ""}`);
};

async function session(email, mdp = "test1234") {
  const c = createClient(URL_SB, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: mdp });
  if (error) throw new Error(`${email}: ${error.message}`);
  return { c, id: data.user.id };
}

const idDe = async (email) => (await admin.from("utilisateurs").select("id").eq("email", email).single()).data.id;

/** Marque lus les messages que l'AUTRE partie a envoyés dans ce fil. */
async function lire(cli, patientId, medecinId, moiId) {
  const cible = moiId === patientId ? medecinId : patientId;
  await cli.from("messages").update({ lu: true })
    .eq("patient_id", patientId).eq("medecin_id", medecinId)
    .eq("expediteur_id", cible).eq("lu", false);
}

const patient = await session("patient1@test.docteur224.com");
const medecin = await session("medecin1@test.docteur224.com");
const pid = patient.id, mid = medecin.id;

const assistant = await session("assistant1@test.docteur224.com");

const nettoyer = async () => {
  await admin.from("messages").delete().eq("patient_id", pid).eq("medecin_id", mid).like("contenu", `%${MARQUEUR}%`);
  await admin.from("assistants").update({ peut_messagerie: false }).eq("id", assistant.id);
};

try {
  // Nettoyage des éventuels résidus, PUIS on accorde la permission.
  await nettoyer();
  await admin.from("assistants").update({ peut_messagerie: true }).eq("id", assistant.id);

  // 1. Le patient ouvre une conversation avec un objet.
  {
    const { error } = await patient.c.from("messages").insert({
      patient_id: pid, medecin_id: mid, expediteur_id: pid,
      contenu: `Bonjour, pourriez-vous décaler mon rendez-vous ? ${MARQUEUR}`,
      objet: "deplacer_rdv",
    });
    test("le patient envoie un message avec objet", !error, error?.message);
  }

  // 2. Le médecin le voit dans sa liste, avec l'objet et un non-lu.
  {
    const { data } = await medecin.c.rpc("conversations_medecin");
    const conv = (data ?? []).find((c) => c.patient_id === pid);
    test("le médecin voit la conversation", !!conv, conv ? `${conv.patient}` : "absente");
    test("l'objet remonte côté médecin", conv?.objet === "deplacer_rdv", conv?.objet);
    test("le médecin a un message non lu", Number(conv?.non_lus) >= 1, `non_lus=${conv?.non_lus}`);
  }

  // 3. Le médecin lit, puis répond.
  await lire(medecin.c, pid, mid, mid);
  {
    const { data } = await medecin.c.rpc("conversations_medecin");
    const conv = (data ?? []).find((c) => c.patient_id === pid);
    test("après lecture, plus de non-lu côté médecin", Number(conv?.non_lus) === 0, `non_lus=${conv?.non_lus}`);
    const { error } = await medecin.c.from("messages").insert({
      patient_id: pid, medecin_id: mid, expediteur_id: mid,
      contenu: `Bien sûr, je vous propose jeudi 14h. ${MARQUEUR}`,
    });
    test("le médecin répond", !error, error?.message);
  }

  // 4. Le patient reçoit la réponse (non-lu), avec l'objet conservé.
  {
    const { data } = await patient.c.rpc("conversations_patient");
    const conv = (data ?? []).find((c) => c.medecin_id === mid);
    test("le patient voit un non-lu (la réponse)", Number(conv?.non_lus) >= 1, `non_lus=${conv?.non_lus}`);
    test("l'objet est conservé côté patient", conv?.objet === "deplacer_rdv", conv?.objet);
    test("le dernier message est bien du médecin", conv?.dernier_de_moi === false);
  }

  // 5. La réponse du médecin NE doit PAS avoir été marquée lue par la
  //    lecture du médecin à l'étape 3 (c'est au patient de la lire).
  {
    const { data } = await admin.from("messages").select("expediteur_id, lu")
      .eq("patient_id", pid).eq("medecin_id", mid).like("contenu", `%${MARQUEUR}%`);
    const reponseMedecin = (data ?? []).find((m) => m.expediteur_id === mid);
    test("la réponse du médecin reste non lue tant que le patient ne l'a pas vue",
      reponseMedecin && reponseMedecin.lu === false, JSON.stringify(reponseMedecin));
  }

  // 6. Le patient lit la réponse du médecin, pas l'inverse.
  await lire(patient.c, pid, mid, pid);
  {
    const { data } = await patient.c.rpc("conversations_patient");
    const conv = (data ?? []).find((c) => c.medecin_id === mid);
    test("après lecture, plus de non-lu côté patient", Number(conv?.non_lus) === 0, `non_lus=${conv?.non_lus}`);
  }

  // 7. L'assistant(e) voit la même conversation et répond au nom du médecin.
  {
    const { data } = await assistant.c.rpc("conversations_medecin");
    const conv = (data ?? []).find((c) => c.patient_id === pid);
    test("l'assistant(e) voit la conversation du médecin", !!conv, conv ? conv.patient : "absente");
    const { error } = await assistant.c.from("messages").insert({
      patient_id: pid, medecin_id: mid, expediteur_id: assistant.id,
      contenu: `Le secrétariat confirme votre créneau de jeudi 14h. ${MARQUEUR}`,
    });
    test("l'assistant(e) répond au nom du médecin", !error, error?.message);
  }

  // 8. Le patient reçoit le message de l'assistant(e) comme venant du cabinet.
  {
    const { data } = await patient.c.rpc("conversations_patient");
    const conv = (data ?? []).find((c) => c.medecin_id === mid);
    test("le patient reçoit le message de l'assistant(e)", Number(conv?.non_lus) >= 1, `non_lus=${conv?.non_lus}`);
    test("il apparaît comme reçu, pas envoyé par le patient", conv?.dernier_de_moi === false);
  }

  // 9. La base refuse un objet inconnu.
  {
    const { error } = await patient.c.from("messages").insert({
      patient_id: pid, medecin_id: mid, expediteur_id: pid,
      contenu: `objet bidon ${MARQUEUR}`, objet: "n_importe_quoi",
    });
    test("un objet hors catalogue est refusé", !!error, error ? "refusé" : "ACCEPTÉ");
  }
} finally {
  await nettoyer();
  const ko = resultats.filter((r) => !r.ok).length;
  console.log(`\n${resultats.length - ko}/${resultats.length} contrôles passés`);
  process.exit(ko ? 1 : 0);
}
