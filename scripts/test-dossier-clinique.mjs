/*
 * Tests du dossier clinique (migration 0064), EN BASE, avec de vraies
 * sessions — pas l'écran. Ce qui est prouvé :
 *
 *   Notes de consultation
 *     - création, nouvelle version, versions précédentes conservées ;
 *     - une note vide est refusée ;
 *     - lecture réservée à l'AUTEUR : ni un confrère, ni le patient, ni
 *       l'assistant, ni l'anonyme ;
 *     - un confrère ne peut ni écrire dans le dossier d'un patient qu'il ne
 *       suit pas, ni versionner la note d'un autre ;
 *     - une note ne se rattache pas au rendez-vous d'un autre patient ;
 *     - le journal d'audit ne contient pas le contenu médical.
 *   Constantes
 *     - saisie valide ; tension incomplète, inversée, date future,
 *       glycémie sans contexte, poids impossible : refusés ;
 *     - « saisie erronée » : motif obligatoire, la ligne reste ;
 *     - lecture réservée à l'auteur.
 *   Chronologie
 *     - rassemble rendez-vous, documents, notes et constantes ;
 *     - le filtre par type fonctionne ; le patient n'y voit rien du médecin.
 *
 * Tout ce qui est créé est supprimé à la fin (service_role).
 * Usage : node scripts/test-dossier-clinique.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const lire = (c) => env.match(new RegExp(`^${c}=(.*)$`, "m"))?.[1].trim();
const URL_SB = lire("NEXT_PUBLIC_SUPABASE_URL");
const ANON = lire("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const service = createClient(URL_SB, lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

let echecs = 0;
let total = 0;
const check = (label, ok, detail = "") => {
  total++;
  if (!ok) echecs++;
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
};

async function session(email) {
  const c = createClient(URL_SB, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: "test1234" });
  if (error) throw new Error(`${email} : ${error.message}`);
  return c;
}

const cree = { notes: [], constantes: [], rdvs: [] };

async function main() {
  const { data: u } = await service
    .from("utilisateurs")
    .select("id, email")
    .in("email", ["medecin1@test.docteur224.com", "patient1@test.docteur224.com", "patient2@test.docteur224.com"]);
  const id = (e) => u.find((x) => x.email === e).id;
  const medecinId = id("medecin1@test.docteur224.com");
  const patientId = id("patient1@test.docteur224.com");
  const patient2Id = id("patient2@test.docteur224.com");

  // Un confrère qui ne suit PAS patient1 : aucun rendez-vous en commun.
  const { data: medecins } = await service
    .from("utilisateurs")
    .select("id, email")
    .like("email", "medecin%@test.docteur224.com")
    .neq("id", medecinId);
  let confrere = null;
  for (const m of medecins) {
    const { count } = await service
      .from("rendez_vous")
      .select("id", { count: "exact", head: true })
      .eq("medecin_id", m.id)
      .eq("patient_id", patientId);
    if (!count && m.email !== "medecin8@test.docteur224.com") {
      confrere = m;
      break;
    }
  }
  if (!confrere) throw new Error("Aucun confrère sans rendez-vous avec patient1");

  // Un assistant de medecin1, s'il en a un.
  const { data: asst } = await service.from("assistants").select("id, utilisateurs ( email )").eq("medecin_id", medecinId).limit(1);
  const emailAssistant = asst?.[0]?.utilisateurs?.email;

  // Un rendez-vous de medecin1 avec patient2 (pour le rattachement interdit).
  // Le jeu d'essai n'en garantit pas : on en pose un, ANNULÉ — le trigger
  // `bloquer_rdv_creneau_ferme` (0053) laisse passer un rendez-vous annulé,
  // qui n'occupe aucun créneau.
  let { data: rdvAutre } = await service
    .from("rendez_vous").select("id").eq("medecin_id", medecinId).eq("patient_id", patient2Id).limit(1).maybeSingle();
  if (!rdvAutre) {
    const { data, error } = await service
      .from("rendez_vous")
      .insert({
        medecin_id: medecinId, patient_id: patient2Id, date: "2026-01-15", heure: "09:00",
        reserve_par: medecinId, reserve_par_role: "medecin", motif: "TEST-CLINIQUE", statut: "annule", source: "cabinet",
      })
      .select("id")
      .single();
    if (error) throw new Error(`rendez-vous de test : ${error.message}`);
    rdvAutre = data;
    cree.rdvs.push(data.id);
  }
  const { data: rdvPropre } = await service
    .from("rendez_vous").select("id").eq("medecin_id", medecinId).eq("patient_id", patientId).limit(1).maybeSingle();

  const medecin = await session("medecin1@test.docteur224.com");
  const autre = await session(confrere.email);
  const patient = await session("patient1@test.docteur224.com");
  const anonyme = createClient(URL_SB, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  console.log(`ℹ️  confrère sans lien : ${confrere.email}${emailAssistant ? ` · assistant : ${emailAssistant}` : ""}`);

  /* ================= Notes ================= */
  const MOTIF = "Céphalées depuis 3 jours (TEST-CLINIQUE)";
  const { data: noteId, error: e1 } = await medecin.rpc("enregistrer_note", {
    p_patient_id: patientId,
    p_rendez_vous_id: rdvPropre?.id ?? null,
    p_motif: MOTIF,
    p_examen: "TA 150/95, pas de signe neurologique",
    p_diagnostic: "Céphalées de tension",
    p_conduite: "Paracétamol 1 g si douleur, contrôle TA dans 15 jours",
  });
  if (noteId) cree.notes.push(noteId);
  check("médecin : création d’une note", !e1 && !!noteId, e1?.message);

  const { error: e2 } = await medecin.rpc("enregistrer_note", {
    p_note_id: noteId,
    p_rendez_vous_id: rdvPropre?.id ?? null,
    p_motif: MOTIF,
    p_diagnostic: "Céphalées de tension — HTA à surveiller",
    p_conduite: "Paracétamol 1 g si douleur, contrôle TA dans 15 jours",
  });
  check("médecin : modification → nouvelle version", !e2, e2?.message);

  const { data: versions } = await medecin
    .from("notes_consultation_versions").select("version, diagnostic, examen").eq("note_id", noteId).order("version");
  check("deux versions conservées", versions?.length === 2, `${versions?.length}`);
  check("la v1 garde son diagnostic d’origine", versions?.[0]?.diagnostic === "Céphalées de tension");
  check("la v2 porte la modification", versions?.[1]?.diagnostic?.includes("HTA"));
  check("un champ vidé en v2 n’efface pas la v1", versions?.[0]?.examen && versions?.[1]?.examen === null);
  const { data: noteLue } = await medecin.from("notes_consultation").select("version_courante").eq("id", noteId).single();
  check("version_courante = 2", noteLue?.version_courante === 2);

  const { error: eVide } = await medecin.rpc("enregistrer_note", { p_patient_id: patientId, p_motif: "  " });
  check("note vide refusée", !!eVide, eVide?.message);

  // Lecture par d'autres
  const lit = async (c) => ((await c.from("notes_consultation_versions").select("id").eq("note_id", noteId)).data ?? []).length;
  check("confrère : ne lit pas la note", (await lit(autre)) === 0);
  check("patient : ne lit pas la note", (await lit(patient)) === 0);
  check("anonyme : ne lit pas la note", (await lit(anonyme)) === 0);
  if (emailAssistant) {
    const assistant = await session(emailAssistant);
    check("assistant du médecin : ne lit pas la note", (await lit(assistant)) === 0);
    const { error: eA } = await assistant.rpc("enregistrer_note", { p_patient_id: patientId, p_motif: "Essai assistant" });
    check("assistant : ne peut pas écrire de note", !!eA, eA?.message);
  }

  // Écritures interdites
  const { error: e3 } = await autre.rpc("enregistrer_note", { p_patient_id: patientId, p_motif: "Intrusion" });
  check("confrère : écrire dans un dossier qu’il ne suit pas est refusé", !!e3 && /patientèle/.test(e3.message), e3?.message);
  const { error: e4 } = await autre.rpc("enregistrer_note", { p_note_id: noteId, p_motif: "Réécriture" });
  check("confrère : versionner la note d’un autre est refusé", !!e4 && /introuvable/.test(e4.message), e4?.message);
  if (rdvAutre) {
    const { error: e5 } = await medecin.rpc("enregistrer_note", {
      p_patient_id: patientId, p_rendez_vous_id: rdvAutre.id, p_motif: "Mauvais rattachement",
    });
    check("rattachement au rendez-vous d’un autre patient refusé", !!e5 && /ne concerne pas/.test(e5.message), e5?.message);
  } else {
    console.log("ℹ️  pas de rendez-vous medecin1/patient2 : rattachement croisé non testé");
  }
  const { error: e6 } = await anonyme.rpc("enregistrer_note", { p_patient_id: patientId, p_motif: "Anonyme" });
  check("anonyme : appel de la fonction refusé", !!e6, e6?.message);

  // Audit sans contenu médical
  const { data: audit } = await service.from("journal_audit").select("action, details").eq("cible_id", noteId);
  check("audit : création et modification journalisées", audit?.length === 2, `${audit?.length}`);
  check(
    "audit : aucun contenu médical",
    !JSON.stringify(audit ?? []).includes("Céphalées"),
    JSON.stringify(audit?.[0]?.details)
  );

  /* ================= Constantes ================= */
  const base = { p_patient_id: patientId };
  const { data: cId, error: c1 } = await medecin.rpc("ajouter_constantes", {
    ...base, p_poids_kg: 72.5, p_tension_sys: 150, p_tension_dia: 95, p_glycemie_gl: 1.32, p_glycemie_contexte: "a_jeun",
  });
  if (cId) cree.constantes.push(cId);
  check("constantes : saisie complète acceptée", !c1 && !!cId, c1?.message);

  const { data: cId2, error: c1b } = await medecin.rpc("ajouter_constantes", {
    ...base, p_poids_kg: 73, p_mesure_le: new Date(Date.now() - 30 * 86400000).toISOString(),
  });
  if (cId2) cree.constantes.push(cId2);
  check("constantes : poids seul, daté d’il y a un mois", !c1b, c1b?.message);

  const refus = async (label, params, attendu) => {
    const { data, error } = await medecin.rpc("ajouter_constantes", { ...base, ...params });
    if (data) cree.constantes.push(data);
    check(label, !!error && (!attendu || attendu.test(error.message)), error?.message ?? "acceptée à tort");
  };
  await refus("tension sans diastolique refusée", { p_tension_sys: 130 }, /deux chiffres/);
  await refus("tension inversée refusée", { p_tension_sys: 70, p_tension_dia: 90 });
  await refus("date future refusée", { p_poids_kg: 70, p_mesure_le: new Date(Date.now() + 86400000).toISOString() }, /futur/);
  await refus("glycémie sans contexte refusée", { p_glycemie_gl: 1.1 }, /jeun/);
  await refus("poids impossible refusé", { p_poids_kg: 2000 });
  await refus("aucune mesure refusée", {});

  const { error: c2 } = await medecin.rpc("invalider_constante", { p_id: cId, p_motif: " " });
  check("saisie erronée sans motif refusée", !!c2, c2?.message);
  const { error: c3 } = await medecin.rpc("invalider_constante", { p_id: cId, p_motif: "Tensiomètre mal calibré" });
  check("saisie erronée avec motif acceptée", !c3, c3?.message);
  const { data: cLue } = await medecin.from("constantes").select("invalide_le, motif_invalidation").eq("id", cId).single();
  check("la mesure erronée reste, marquée", !!cLue?.invalide_le && cLue.motif_invalidation === "Tensiomètre mal calibré");
  const { error: c4 } = await autre.rpc("invalider_constante", { p_id: cId2, p_motif: "Intrusion" });
  check("confrère : invalider la mesure d’un autre est refusé", !!c4, c4?.message);

  const litC = async (c) => ((await c.from("constantes").select("id").in("id", cree.constantes)).data ?? []).length;
  check("patient : ne lit pas les constantes", (await litC(patient)) === 0);
  check("confrère : ne lit pas les constantes", (await litC(autre)) === 0);

  /* ================= Chronologie ================= */
  const { data: chrono, error: h1 } = await medecin.rpc("chronologie_patient", { p_patient_id: patientId, p_limite: 100 });
  check("chronologie : lisible par le médecin", !h1 && Array.isArray(chrono), h1?.message);
  const types = new Set((chrono ?? []).map((l) => l.type));
  check("chronologie : notes et constantes présentes", types.has("note") && types.has("constante"), [...types].join(", "));
  check("chronologie : rendez-vous présents", types.has("rdv"));
  check(
    "chronologie : du plus récent au plus ancien",
    (chrono ?? []).every((l, i, t) => i === 0 || new Date(t[i - 1].quand) >= new Date(l.quand))
  );
  check("chronologie : total répété sur chaque ligne", (chrono ?? []).every((l) => Number(l.total) === chrono.length));
  const { data: seulesNotes } = await medecin.rpc("chronologie_patient", { p_patient_id: patientId, p_types: ["note"] });
  check("chronologie : filtre par type", (seulesNotes ?? []).length >= 2 && seulesNotes.every((l) => l.type === "note"));
  const { data: page2 } = await medecin.rpc("chronologie_patient", { p_patient_id: patientId, p_limite: 2, p_decalage: 2 });
  check("chronologie : pagination", (page2 ?? []).length <= 2 && Number(page2?.[0]?.total) === chrono.length);
  const { data: chronoPatient } = await patient.rpc("chronologie_patient", { p_patient_id: patientId, p_limite: 100 });
  check(
    "chronologie : le patient n’y voit ni notes ni constantes",
    !(chronoPatient ?? []).some((l) => l.type === "note" || l.type === "constante")
  );
  const { error: h2 } = await anonyme.rpc("chronologie_patient", { p_patient_id: patientId });
  check("chronologie : refusée à l’anonyme", !!h2, h2?.message);
}

async function nettoyer() {
  if (cree.constantes.length) {
    await service.from("journal_audit").delete().in("cible_id", cree.constantes);
    await service.from("constantes").delete().in("id", cree.constantes);
  }
  if (cree.notes.length) {
    await service.from("journal_audit").delete().in("cible_id", cree.notes);
    await service.from("notes_consultation").delete().in("id", cree.notes);
  }
  if (cree.rdvs.length) await service.from("rendez_vous").delete().in("id", cree.rdvs);
  // Filets : ce qu'un test aurait créé malgré un refus attendu.
  await service.from("notes_consultation_versions").delete().like("motif", "%(TEST-CLINIQUE)%");
  console.log("ℹ️  données de test supprimées");
}

main()
  .catch((e) => {
    echecs++;
    console.error("❌", e.message);
  })
  .finally(async () => {
    await nettoyer();
    console.log(echecs === 0 ? `\n✅ ${total}/${total} vérifications passées.` : `\n❌ ${echecs} échec(s) sur ${total}.`);
    process.exit(echecs === 0 ? 0 : 1);
  });
