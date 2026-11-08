/*
 * Tests du suivi d'absence (migration 0085), contre la vraie base.
 *
 * Les seuils sont testés sans base dans scripts/tests/suivi-absence.test.mjs.
 * Ici on vérifie ce que seule la base peut dire :
 *
 *   - les COMPTES sont justes : absences, rendez-vous terminés, dernière date ;
 *   - un rendez-vous ANNULÉ ne compte pas comme une absence — annuler à
 *     l'avance est le geste qu'on veut encourager, pas celui qu'on reproche ;
 *   - un rendez-vous à venir, en attente ou « présent » ne compte pas non
 *     plus : rien n'est terminé ;
 *   - l'ÉTANCHÉITÉ entre praticiens : un confrère ne lit pas les absences de
 *     mes patients, et la fonction interne qui prend un médecin en paramètre
 *     ne lui est pas accessible ;
 *   - l'ASSISTANT voit les mêmes signaux que son médecin, et peut poser les
 *     deux gestes ; il ne peut pas déplacer les seuils ;
 *   - la CLÉMENCE est tracée, et elle est RESPECTÉE par le calcul : les
 *     absences antérieures sortent du compteur sans sortir du dossier ;
 *   - l'avertissement marque le patient averti et laisse une ligne d'audit ;
 *   - les RENDEZ-VOUS ne sont jamais modifiés par ces gestes.
 *
 * Aucun message n'est envoyé : la route /api/medecin/suivi-absence/avertir
 * n'est pas appelée (elle partirait pour de vrai), on appelle la fonction de
 * traçage qu'elle appelle après l'envoi. Les comptes @test.docteur224.com ne
 * reçoivent de toute façon rien.
 *
 * Les données de travail sont créées puis retirées à la fin : le script est
 * rejouable. Il ne touche à rien du seed, sauf aux rendez-vous qu'il crée.
 *
 * Usage : node scripts/test-suivi-absence.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const lire = (c) => env.match(new RegExp(`^${c}=(.*)$`, "m"))?.[1].trim();
const URL_SB = lire("NEXT_PUBLIC_SUPABASE_URL");
const ANON = lire("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const MDP = "test1234";

const service = createClient(URL_SB, lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

let echecs = 0;
const test = (nom, ok, detail = "") => {
  if (!ok) echecs++;
  console.log(`${ok ? "✅" : "❌"} ${nom}${detail ? ` — ${detail}` : ""}`);
};

async function session(email) {
  const client = createClient(URL_SB, ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: MDP });
  if (error) throw new Error(`connexion ${email} : ${error.message}`);
  return { client, id: data.user.id };
}

/** « AAAA-MM-JJ » décalé de n jours. */
const jour = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const aNettoyer = { rdvs: [], suivis: [], parametres: [] };

/*
 * Pose un rendez-vous dans un état donné.
 *
 * En deux temps, et c'est voulu : le trigger `bloquer_rdv_creneau_ferme`
 * (0053) refuse toute arrivée sur un créneau qui n'est pas ouvert — une date
 * passée en fait partie. Il laisse passer un rendez-vous ANNULÉ, puis tout
 * changement qui ne touche ni au praticien, ni à la date, ni à l'heure. On
 * crée donc annulé, puis on pose le statut voulu. La règle de production
 * n'est pas contournée : elle porte sur l'occupation d'un créneau, dont ce
 * test ne traite pas.
 */
async function poserRdv({ medecinId, patientId, procheId, date, heure, statut }) {
  const { data, error } = await service
    .from("rendez_vous")
    .insert({
      medecin_id: medecinId,
      patient_id: procheId ? null : patientId,
      proche_id: procheId ?? null,
      date,
      heure,
      reserve_par: medecinId,
      reserve_par_role: "medecin",
      motif: "Test suivi d’absence",
      statut: "annule",
      source: "cabinet",
    })
    .select("id")
    .single();
  if (error) throw new Error(`rendez-vous ${date} ${heure} : ${error.message}`);
  aNettoyer.rdvs.push(data.id);
  if (statut !== "annule") {
    const { error: errMaj } = await service
      .from("rendez_vous")
      .update({ statut })
      .eq("id", data.id);
    if (errMaj) throw new Error(`statut ${statut} : ${errMaj.message}`);
  }
  return data.id;
}

/** La ligne de `suivi_absence_liste` qui concerne une clé, vue par `qui`. */
async function ligneDe(qui, cle, mois = null) {
  const { data, error } = await qui.client.rpc("suivi_absence_liste", { p_mois: mois });
  if (error) throw new Error(`suivi_absence_liste : ${error.message}`);
  return (data ?? []).find((l) => l.cle === cle) ?? null;
}

async function main() {
  const medecin = await session("medecin1@test.docteur224.com");
  const confrere = await session("medecin2@test.docteur224.com");
  const assistant = await session("assistant1@test.docteur224.com");
  const patient = await session("patient1@test.docteur224.com");
  const cle = `c-${patient.id}`;

  console.log("\n── Préparation ──");

  // L'assistant du seed est rattaché au premier médecin : on le vérifie
  // plutôt que de le supposer, sans quoi la moitié des tests ne voudrait
  // rien dire.
  const { data: rattachement } = await service
    .from("assistants")
    .select("medecin_id")
    .eq("id", assistant.id)
    .maybeSingle();
  test(
    "assistant1 est bien rattaché à medecin1",
    rattachement?.medecin_id === medecin.id,
    rattachement?.medecin_id ?? "aucun"
  );

  // Un compteur propre : on retire d'abord une éventuelle ligne de suivi
  // laissée par une exécution précédente, puis les paramètres.
  await service.from("suivi_absence_patients").delete().eq("medecin_id", medecin.id).eq("cle_patient", cle);
  await service.from("suivi_absence_parametres").delete().eq("medecin_id", medecin.id);

  // Les absences et honorés déjà présents dans le seed pour ce couple : on
  // compte en RELATIF, le script doit rester rejouable sur une base vivante.
  const avant = await ligneDe(medecin, cle);
  const absencesAvant = Number(avant?.absences ?? 0);
  const terminesAvant = Number(avant?.termines ?? 0);
  console.log(`   état de départ : ${absencesAvant} absence(s) / ${terminesAvant} terminé(s)`);

  // Trois absences, deux honorés, et tout ce qui NE DOIT PAS compter.
  await poserRdv({ medecinId: medecin.id, patientId: patient.id, date: jour(-40), heure: "08:00", statut: "absent" });
  await poserRdv({ medecinId: medecin.id, patientId: patient.id, date: jour(-30), heure: "08:30", statut: "absent" });
  await poserRdv({ medecinId: medecin.id, patientId: patient.id, date: jour(-10), heure: "09:00", statut: "absent" });
  await poserRdv({ medecinId: medecin.id, patientId: patient.id, date: jour(-20), heure: "09:30", statut: "honore" });
  await poserRdv({ medecinId: medecin.id, patientId: patient.id, date: jour(-15), heure: "10:00", statut: "honore" });
  // Ce qui ne doit pas entrer dans le calcul :
  await poserRdv({ medecinId: medecin.id, patientId: patient.id, date: jour(-12), heure: "10:30", statut: "annule" });
  await poserRdv({ medecinId: medecin.id, patientId: patient.id, date: jour(-11), heure: "11:00", statut: "present" });
  await poserRdv({ medecinId: medecin.id, patientId: patient.id, date: jour(-9), heure: "11:30", statut: "en_attente" });
  await poserRdv({ medecinId: medecin.id, patientId: patient.id, date: jour(25), heure: "12:00", statut: "confirme" });
  // Hors période : 14 mois en arrière, invisible sur 12 mois glissants.
  await poserRdv({ medecinId: medecin.id, patientId: patient.id, date: jour(-430), heure: "12:30", statut: "absent" });

  /* ================= 1. Les comptes ================= */
  console.log("\n── Les comptes ──");

  const ligne = await ligneDe(medecin, cle);
  test("le patient figure dans la liste", !!ligne, ligne ? "" : "absent de suivi_absence_liste");
  if (!ligne) return;

  test(
    "trois absences de plus sont comptées",
    Number(ligne.absences) === absencesAvant + 3,
    `${ligne.absences} (attendu ${absencesAvant + 3})`
  );
  test(
    "cinq rendez-vous terminés de plus sont comptés",
    Number(ligne.termines) === terminesAvant + 5,
    `${ligne.termines} (attendu ${terminesAvant + 5})`
  );
  test(
    "la dernière absence est la plus récente",
    ligne.derniere_absence === jour(-10),
    `${ligne.derniere_absence} (attendu ${jour(-10)})`
  );
  test("l’identité du patient est résolue", !!ligne.nom || !!ligne.prenom, `${ligne.prenom} ${ligne.nom}`);
  test("le téléphone du patient est joint", !!ligne.telephone, ligne.telephone || "vide");

  // Le détail des exclusions, dit une par une : un compte juste par hasard
  // (une exclusion qui compense une autre) passerait le test ci-dessus.
  const { data: brut } = await service
    .from("rendez_vous")
    .select("statut")
    .eq("medecin_id", medecin.id)
    .eq("patient_id", patient.id)
    .in("id", aNettoyer.rdvs);
  const poses = (brut ?? []).reduce((acc, r) => ({ ...acc, [r.statut]: (acc[r.statut] ?? 0) + 1 }), {});
  test(
    "les statuts de travail sont bien en place",
    poses.absent === 4 && poses.honore === 2 && poses.annule === 1 && poses.present === 1,
    JSON.stringify(poses)
  );

  /* ================= 2. Période glissante ================= */
  console.log("\n── Période glissante ──");

  const surUnMois = await ligneDe(medecin, cle, 1);
  const surDeuxAns = await ligneDe(medecin, cle, 24);
  // La fenêtre filtre : une absence d'il y a 40 jours et celle de l'an
  // dernier sont hors d'un mois glissant, pas de deux ans. On compare les
  // deux plutôt qu'un nombre absolu — le seed a sa propre histoire, et la
  // limite d'un mois calendaire ne tombe pas sur un compte rond.
  test(
    "la fenêtre d’un mois exclut des absences que deux ans gardent",
    Number(surUnMois?.absences ?? 0) < Number(surDeuxAns?.absences ?? 0) &&
      Number(surUnMois?.absences ?? 0) >= 1,
    `${surUnMois?.absences ?? 0} sur 1 mois · ${surDeuxAns?.absences ?? 0} sur 24 mois`
  );
  test(
    "sur 24 mois, l’absence de l’an dernier réapparaît",
    Number(surDeuxAns?.absences ?? 0) === absencesAvant + 4,
    `${surDeuxAns?.absences ?? 0} (attendu ${absencesAvant + 4})`
  );

  /* ================= 3. Étanchéité entre praticiens ================= */
  console.log("\n── Étanchéité ──");

  const chezConfrere = await ligneDe(confrere, cle);
  test(
    "un confrère ne voit pas les absences de mes patients",
    Number(chezConfrere?.absences ?? 0) !== absencesAvant + 3,
    chezConfrere ? `il voit ${chezConfrere.absences} absence(s)` : "aucune ligne (attendu)"
  );

  const { error: errInterne } = await confrere.client.rpc("suivi_absence_comptes", {
    p_medecin: medecin.id,
    p_mois: 12,
  });
  test(
    "la fonction interne n’est pas appelable par un client",
    !!errInterne,
    errInterne?.message ?? "APPEL ACCEPTÉ — fuite"
  );

  /*
   * Le confrère et medecin1 PARTAGENT parfois un patient (le seed en a) :
   * dans ce cas, le confrère peut légitimement réinitialiser SA propre ligne
   * — elle est isolée par `medecin_id`. La vraie garantie n'est donc pas que
   * le geste échoue, mais qu'il ne touche JAMAIS le compteur de medecin1.
   */
  const avantIngerence = await ligneDe(medecin, cle);
  await confrere.client.rpc("suivi_absence_reinitialiser", { p_cle: cle, p_motif: "ingérence" });
  const apresIngerence = await ligneDe(medecin, cle);
  test(
    "la remise à zéro d’un confrère ne touche pas le compteur du médecin",
    Number(apresIngerence?.absences ?? -1) === Number(avantIngerence?.absences ?? -2),
    `${avantIngerence?.absences ?? "—"} → ${apresIngerence?.absences ?? "—"}`
  );
  // La ligne parasite éventuellement créée côté confrère est retirée au
  // nettoyage (suppression par cle_patient, tous médecins confondus).
  aNettoyer.suivis.push(cle);

  const { error: errCleInvalide } = await confrere.client.rpc("suivi_absence_reinitialiser", {
    p_cle: `c-${"0".repeat(8)}-0000-0000-0000-000000000000`,
    p_motif: "tentative",
  });
  test(
    "un patient totalement étranger au confrère est refusé",
    !!errCleInvalide,
    errCleInvalide?.message ?? "GESTE ACCEPTÉ — fuite"
  );

  const { error: errLecturePatient } = await patient.client
    .from("suivi_absence_patients")
    .select("cle_patient")
    .limit(1);
  const { data: vuParPatient } = await patient.client
    .from("suivi_absence_patients")
    .select("cle_patient");
  test(
    "un patient ne lit pas la table de suivi",
    !!errLecturePatient || (vuParPatient ?? []).length === 0,
    errLecturePatient?.message ?? `${(vuParPatient ?? []).length} ligne(s) visible(s)`
  );

  /* ================= 4. L'assistant ================= */
  console.log("\n── Le secrétariat ──");

  const chezAssistant = await ligneDe(assistant, cle);
  test(
    "l’assistant voit exactement les mêmes comptes que son médecin",
    Number(chezAssistant?.absences ?? -1) === Number(ligne.absences) &&
      Number(chezAssistant?.termines ?? -1) === Number(ligne.termines),
    `${chezAssistant?.absences ?? "—"} / ${chezAssistant?.termines ?? "—"}`
  );

  const { data: signauxAssistant, error: errSignaux } = await assistant.client.rpc(
    "suivi_absence_signaux"
  );
  test(
    "l’assistant lit les signaux du tableau de bord",
    !errSignaux && (signauxAssistant ?? []).some((s) => s.cle === cle),
    errSignaux?.message ?? `${(signauxAssistant ?? []).length} signal/signaux`
  );

  const { error: errSeuils } = await assistant.client
    .from("suivi_absence_parametres")
    .upsert({ medecin_id: medecin.id, seuil_bas: 9 }, { onConflict: "medecin_id" })
    .select("medecin_id");
  const { data: seuilsApres } = await service
    .from("suivi_absence_parametres")
    .select("seuil_bas")
    .eq("medecin_id", medecin.id)
    .maybeSingle();
  test(
    "l’assistant ne peut pas déplacer les seuils",
    !!errSeuils || !seuilsApres,
    errSeuils?.message ?? `seuil écrit : ${seuilsApres?.seuil_bas}`
  );

  /* ================= 5. Les seuils, côté médecin ================= */
  console.log("\n── Les seuils ──");

  const { error: errParam } = await medecin.client
    .from("suivi_absence_parametres")
    .upsert(
      { medecin_id: medecin.id, seuil_bas: 2, seuil_haut: 5, taux_haut: 0.4, mini_rdv: 4, periode_mois: 6 },
      { onConflict: "medecin_id" }
    )
    .select("medecin_id");
  test("le médecin enregistre ses seuils", !errParam, errParam?.message);
  if (!errParam) aNettoyer.parametres.push(medecin.id);

  const { error: errOrdre } = await medecin.client
    .from("suivi_absence_parametres")
    .update({ seuil_haut: 1 })
    .eq("medecin_id", medecin.id)
    .select("medecin_id");
  test(
    "un seuil haut sous le seuil bas est refusé",
    !!errOrdre,
    errOrdre?.message ?? "ACCEPTÉ — la contrainte manque"
  );

  // La période du praticien (6 mois) est celle que prennent les signaux.
  const { data: signauxMedecin } = await medecin.client.rpc("suivi_absence_signaux");
  const signal = (signauxMedecin ?? []).find((s) => s.cle === cle);
  test(
    "les signaux suivent la période réglée par le praticien",
    Number(signal?.absences ?? 0) === absencesAvant + 3,
    `${signal?.absences ?? 0} absence(s) sur 6 mois`
  );

  /* ================= 6. Le résumé et la série mensuelle ================= */
  console.log("\n── Résumé et série mensuelle ──");

  const { data: resume, error: errResume } = await medecin.client.rpc("suivi_absence_resume", {
    p_mois: 12,
  });
  const r = (resume ?? [])[0];
  test("le résumé répond", !errResume && !!r, errResume?.message);
  test(
    "le résumé compte au moins les absences posées",
    Number(r?.absences ?? 0) >= 3,
    `${r?.absences ?? 0} créneaux perdus`
  );
  test("le résumé porte la période demandée", Number(r?.periode_mois) === 12, `${r?.periode_mois}`);

  const { data: serie, error: errSerie } = await medecin.client.rpc("rdv_mensuel_medecin", {
    p_mois: 6,
  });
  test("la série mensuelle rend six mois", !errSerie && (serie ?? []).length === 6, errSerie?.message ?? `${(serie ?? []).length} mois`);
  const totalAbsents = (serie ?? []).reduce((n, m) => n + Number(m.absents), 0);
  test(
    "la série mensuelle voit les absences du semestre",
    totalAbsents >= 3,
    `${totalAbsents} absent(s) sur 6 mois`
  );
  // Honorés, absents et annulés sont rendus séparément : c'est ce qui permet
  // au taux de présence de ne pas être alourdi par les annulations.
  const champs = (serie ?? [])[0] ?? {};
  test(
    "la série distingue honorés, absents et annulés",
    "honores" in champs && "absents" in champs && "annules" in champs,
    Object.keys(champs).join(", ")
  );

  /* ================= 7. L'avertissement ================= */
  console.log("\n── Avertir ──");

  const { error: errAverti } = await assistant.client.rpc("suivi_absence_marquer_averti", {
    p_cle: cle,
    p_canal: "whatsapp",
  });
  test("le secrétariat peut marquer un patient averti", !errAverti, errAverti?.message);
  aNettoyer.suivis.push(cle);

  const apresAvertissement = await ligneDe(medecin, cle);
  test(
    "l’avertissement est visible du médecin",
    !!apresAvertissement?.averti_le && Number(apresAvertissement.nb_avertissements) === 1,
    `averti_le=${apresAvertissement?.averti_le ?? "—"} n=${apresAvertissement?.nb_avertissements}`
  );

  await assistant.client.rpc("suivi_absence_marquer_averti", { p_cle: cle, p_canal: "sms" });
  const deuxFois = await ligneDe(medecin, cle);
  test(
    "le compteur d’avertissements s’incrémente, il ne se remet pas à zéro",
    Number(deuxFois?.nb_avertissements) === 2,
    `n=${deuxFois?.nb_avertissements}`
  );

  const { data: auditAvertissement } = await service
    .from("journal_audit")
    .select("action, acteur_id, details")
    .eq("acteur_id", assistant.id)
    .ilike("action", "%rappel de ponctualité%")
    .order("cree_le", { ascending: false })
    .limit(1);
  test(
    "l’avertissement laisse une ligne d’audit nominative",
    (auditAvertissement ?? []).length === 1 && auditAvertissement[0].details?.cle === cle,
    auditAvertissement?.[0]?.action ?? "aucune ligne"
  );

  /* ================= 8. La clémence ================= */
  console.log("\n── Remettre le compteur à zéro ──");

  const { error: errRaz } = await assistant.client.rpc("suivi_absence_reinitialiser", {
    p_cle: cle,
    p_motif: "Hospitalisation — test",
  });
  test("le secrétariat peut remettre le compteur à zéro", !errRaz, errRaz?.message);

  const apresRaz = await ligneDe(medecin, cle, 24);
  test(
    "le compteur repart de zéro : le patient quitte la liste",
    apresRaz === null,
    apresRaz ? `${apresRaz.absences} absence(s) encore comptée(s)` : "sorti de la liste"
  );

  // Et surtout : RIEN n'a été supprimé.
  const { count: rdvsRestants } = await service
    .from("rendez_vous")
    .select("id", { count: "exact", head: true })
    .in("id", aNettoyer.rdvs);
  test(
    "aucun rendez-vous n’a été supprimé ni modifié par la remise à zéro",
    rdvsRestants === aNettoyer.rdvs.length,
    `${rdvsRestants} / ${aNettoyer.rdvs.length}`
  );
  const { data: toujoursAbsents } = await service
    .from("rendez_vous")
    .select("id")
    .in("id", aNettoyer.rdvs)
    .eq("statut", "absent");
  test(
    "les absences restent au dossier avec leur statut",
    (toujoursAbsents ?? []).length === 4,
    `${(toujoursAbsents ?? []).length} rendez-vous encore « non honoré »`
  );

  const { data: auditRaz } = await service
    .from("journal_audit")
    .select("action, acteur_id, details")
    .eq("acteur_id", assistant.id)
    .ilike("action", "%compteur d%absences%")
    .order("cree_le", { ascending: false })
    .limit(1);
  test(
    "la remise à zéro est tracée avec son motif",
    (auditRaz ?? []).length === 1 && auditRaz[0].details?.motif === "Hospitalisation — test",
    auditRaz?.[0]?.details?.motif ?? "aucune ligne"
  );

  /*
   * Une absence POSTÉRIEURE au geste de clémence recompte : la remise à zéro
   * n'est pas une immunité définitive. La comparaison se fait au jour près (un
   * rendez-vous ne porte qu'une date, pas l'heure de sa qualification), donc
   * seules les absences d'un jour STRICTEMENT postérieur recomptent. Pour le
   * vérifier sans attendre demain, on recule la date de remise à zéro d'un
   * jour, puis on pose une absence aujourd'hui.
   */
  await service
    .from("suivi_absence_patients")
    .update({ remis_a_zero_le: `${jour(-1)}T12:00:00Z` })
    .eq("medecin_id", medecin.id)
    .eq("cle_patient", cle);
  await poserRdv({ medecinId: medecin.id, patientId: patient.id, date: jour(0), heure: "13:00", statut: "absent" });
  const apresNouvelle = await ligneDe(medecin, cle, 24);
  test(
    "une absence postérieure au geste recompte, les antérieures restent effacées",
    Number(apresNouvelle?.absences ?? 0) === 1,
    `${apresNouvelle?.absences ?? 0} absence(s) (attendu 1 : seule celle d’aujourd’hui)`
  );

  /* ================= 9. Clé invalide ================= */
  console.log("\n── Garde-fous ──");

  for (const mauvaise of ["x-00000000-0000-0000-0000-000000000000", "c-pas-un-uuid", ""]) {
    const { error } = await medecin.client.rpc("suivi_absence_reinitialiser", {
      p_cle: mauvaise,
      p_motif: null,
    });
    test(`une clé invalide est refusée (« ${mauvaise || "vide"} »)`, !!error, error?.message ?? "ACCEPTÉE");
  }
}

try {
  await main();
} catch (e) {
  echecs++;
  console.error(`\n❌ Interruption : ${e.message}`);
} finally {
  console.log("\n── Nettoyage ──");
  if (aNettoyer.rdvs.length) {
    await service.from("rendez_vous").delete().in("id", aNettoyer.rdvs);
    console.log(`   ${aNettoyer.rdvs.length} rendez-vous retirés`);
  }
  for (const cle of aNettoyer.suivis) {
    await service.from("suivi_absence_patients").delete().eq("cle_patient", cle);
  }
  for (const id of aNettoyer.parametres) {
    await service.from("suivi_absence_parametres").delete().eq("medecin_id", id);
  }
  console.log(`\n${echecs === 0 ? "✅ Tout est passé." : `❌ ${echecs} échec(s).`}`);
  process.exit(echecs === 0 ? 0 : 1);
}
