/*
 * Tests de la fiche patient (migration 0063).
 *
 * Ce qui est vérifié n'est pas que les fonctions répondent, mais que les
 * règles tiennent quand on essaie de passer à côté :
 *
 *   - une pièce remise par un médecin ne se SUPPRIME pas. Ni par son auteur,
 *     ni par un confrère, ni en passant par la table plutôt que par la
 *     fonction ;
 *   - corriger CONSERVE la version précédente, lisible, avec son fichier ;
 *   - annuler EXIGE un motif, et laisse la pièce au dossier ;
 *   - ces deux gestes sont réservés à l'auteur ;
 *   - un rendez-vous ne se qualifie qu'une fois passé, et jamais s'il est
 *     annulé ou s'il appartient à un autre praticien ;
 *   - les informations médicales ne s'écrivent que par le médecin traitant ;
 *   - chaque action laisse une ligne dans journal_audit.
 *
 * Les données de travail sont créées puis retirées à la fin : le script est
 * rejouable. Il ne touche à rien du seed, sauf aux rendez-vous qu'il crée.
 *
 * Usage : node scripts/test-fiche-patient.mjs
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

const aNettoyer = { documents: [], rdvs: [], infos: [] };

/**
 * Pose un rendez-vous de test sur un créneau quelconque.
 *
 * En deux temps, et c'est voulu : le trigger `bloquer_rdv_creneau_ferme`
 * (migration 0053) refuse toute arrivée sur un créneau qui n'est pas ouvert
 * à la réservation — une date passée en fait partie. Il laisse en revanche
 * passer un rendez-vous ANNULÉ, puis tout changement qui ne touche ni au
 * praticien, ni à la date, ni à l'heure. On crée donc annulé, puis on pose
 * le statut voulu. La règle de production n'est pas contournée : elle ne
 * porte que sur l'occupation d'un créneau, dont ce test ne traite pas.
 */
async function poserRdv({ medecinId, patientId, date, heure, statut }) {
  const { data, error } = await service
    .from("rendez_vous")
    .insert({
      medecin_id: medecinId,
      patient_id: patientId,
      date,
      heure,
      reserve_par: medecinId,
      reserve_par_role: "medecin",
      motif: "Test fiche patient",
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

async function main() {
  const medecin = await session("medecin1@test.docteur224.com");
  const confrere = await session("medecin2@test.docteur224.com");
  const patient = await session("patient1@test.docteur224.com");

  console.log("\n── Préparation ──");

  // Un rendez-vous passé entre ce médecin et ce patient : c'est lui qui ouvre
  // le droit de déposer un document (policy ins_docs_medecin).
  const rdvPasse = await poserRdv({
    medecinId: medecin.id,
    patientId: patient.id,
    date: jour(-3),
    heure: "09:00",
    statut: "en_attente",
  });
  test("rendez-vous passé créé", true, rdvPasse.slice(0, 8));

  const rdvFutur = await poserRdv({
    medecinId: medecin.id,
    patientId: patient.id,
    date: jour(14),
    heure: "10:00",
    statut: "en_attente",
  });

  const rdvAnnule = await poserRdv({
    medecinId: medecin.id,
    patientId: patient.id,
    date: jour(-5),
    heure: "11:00",
    statut: "annule",
  });

  // Deux rendez-vous de plus pour la présence, sans perturber `rdvPasse`
  // (lui sert aux documents) : un passé et un à venir.
  const rdvPresencePasse = await poserRdv({
    medecinId: medecin.id,
    patientId: patient.id,
    date: jour(-2),
    heure: "08:00",
    statut: "en_attente",
  });
  const rdvPresenceFutur = await poserRdv({
    medecinId: medecin.id,
    patientId: patient.id,
    date: jour(21),
    heure: "15:00",
    statut: "confirme",
  });

  /* ================= 1. Documents : pas de suppression ================= */
  console.log("\n── Documents : une pièce remise ne se supprime pas ──");

  const { data: doc, error: errDoc } = await medecin.client
    .from("documents_patient")
    .insert({
      origine: "medecin",
      depose_par: medecin.id,
      medecin_id: medecin.id,
      patient_id: patient.id,
      type: "ordonnance",
      titre: "Ordonnance de test",
      contenu: "Amlodipine 5 mg — 1 comprimé le matin",
    })
    .select("id, version")
    .single();
  test("le médecin peut remettre une ordonnance", !errDoc, errDoc?.message);
  if (errDoc) return;
  aNettoyer.documents.push(doc.id);
  test("la pièce d’origine porte la version 1", doc.version === 1, `v${doc.version}`);

  const suppression = await medecin.client
    .from("documents_patient")
    .delete()
    .eq("id", doc.id)
    .select("id");
  test(
    "l’auteur ne peut PAS supprimer sa pièce",
    (suppression.data ?? []).length === 0,
    suppression.error?.message ?? "aucune ligne supprimée (RLS)"
  );

  const supprConfrere = await confrere.client
    .from("documents_patient")
    .delete()
    .eq("id", doc.id)
    .select("id");
  test("un confrère ne peut pas davantage la supprimer", (supprConfrere.data ?? []).length === 0);

  const reecriture = await medecin.client
    .from("documents_patient")
    .update({ contenu: "Réécrit en douce" })
    .eq("id", doc.id)
    .select("id");
  test(
    "l’auteur ne peut PAS réécrire la pièce en place",
    (reecriture.data ?? []).length === 0,
    reecriture.error?.message ?? "aucune ligne modifiée (RLS)"
  );

  /* ================= 2. Correction = nouvelle version ================= */
  console.log("\n── Corriger crée une version, sans effacer la précédente ──");

  const { data: v2, error: errV2 } = await medecin.client.rpc("corriger_document", {
    p_document_id: doc.id,
    p_titre: "Ordonnance de test",
    p_contenu: "Amlodipine 10 mg — 1 comprimé le matin",
    p_fichier_path: null,
    p_fichier_nom: null,
  });
  test("correction acceptée", !errV2, errV2?.message);
  if (v2) aNettoyer.documents.push(v2);

  const { data: chaine } = await service
    .from("documents_patient")
    .select("id, version, contenu, document_parent_id, remplace_par_id")
    .or(`id.eq.${doc.id},document_parent_id.eq.${doc.id}`)
    .order("version");
  const v1Lue = chaine?.find((d) => d.id === doc.id);
  const v2Lue = chaine?.find((d) => d.id === v2);

  test("la v1 existe toujours", !!v1Lue);
  test("la v1 garde son contenu d’origine", v1Lue?.contenu?.includes("5 mg"), v1Lue?.contenu);
  test("la v1 pointe vers la v2", v1Lue?.remplace_par_id === v2);
  test("la v2 porte le numéro 2", v2Lue?.version === 2, `v${v2Lue?.version}`);
  test("la v2 est rattachée à la v1", v2Lue?.document_parent_id === doc.id);
  test("la v2 porte le contenu corrigé", v2Lue?.contenu?.includes("10 mg"), v2Lue?.contenu);

  const { error: errDeuxFois } = await medecin.client.rpc("corriger_document", {
    p_document_id: doc.id,
    p_titre: "Tentative",
    p_contenu: "Encore",
  });
  test(
    "on ne corrige pas une version déjà remplacée",
    !!errDeuxFois,
    errDeuxFois?.message ?? "acceptée à tort"
  );

  const { error: errConfrereCorrige } = await confrere.client.rpc("corriger_document", {
    p_document_id: v2,
    p_titre: "Par un confrère",
    p_contenu: "Non",
  });
  test(
    "un confrère ne corrige pas la pièce d’un autre",
    !!errConfrereCorrige,
    errConfrereCorrige?.message ?? "acceptée à tort"
  );

  const { data: v3 } = await medecin.client.rpc("corriger_document", {
    p_document_id: v2,
    p_titre: "Ordonnance de test",
    p_contenu: "Amlodipine 10 mg — 1 comprimé le soir",
  });
  if (v3) aNettoyer.documents.push(v3);
  const { data: lueV3 } = await service
    .from("documents_patient")
    .select("version, document_parent_id")
    .eq("id", v3)
    .single();
  test("une troisième version s’enchaîne bien", lueV3?.version === 3, `v${lueV3?.version}`);
  test(
    "toute la chaîne partage la même racine",
    lueV3?.document_parent_id === doc.id,
    lueV3?.document_parent_id
  );

  /* ================= 3. Annulation ================= */
  console.log("\n── Annuler : motif obligatoire, la pièce reste ──");

  const { error: errSansMotif } = await medecin.client.rpc("annuler_document", {
    p_document_id: v3,
    p_motif: "   ",
  });
  test("annulation refusée sans motif", !!errSansMotif, errSansMotif?.message ?? "acceptée à tort");

  const { error: errConfrereAnnule } = await confrere.client.rpc("annuler_document", {
    p_document_id: v3,
    p_motif: "Erreur de prescription",
  });
  test(
    "un confrère n’annule pas la pièce d’un autre",
    !!errConfrereAnnule,
    errConfrereAnnule?.message ?? "acceptée à tort"
  );

  const { error: errAnnule } = await medecin.client.rpc("annuler_document", {
    p_document_id: v3,
    p_motif: "Erreur de prescription",
  });
  test("annulation acceptée avec motif", !errAnnule, errAnnule?.message);

  const { data: apresAnnulation } = await service
    .from("documents_patient")
    .select("id, annule_le, annule_par, motif_annulation, titre, contenu")
    .eq("id", v3)
    .maybeSingle();
  test("la pièce est toujours au dossier", !!apresAnnulation);
  test("elle porte sa date d’annulation", !!apresAnnulation?.annule_le);
  test(
    "elle porte son motif",
    apresAnnulation?.motif_annulation === "Erreur de prescription",
    apresAnnulation?.motif_annulation
  );
  test("elle garde son contenu", !!apresAnnulation?.contenu);

  const { error: errCorrigerAnnule } = await medecin.client.rpc("corriger_document", {
    p_document_id: v3,
    p_titre: "Après annulation",
    p_contenu: "Non",
  });
  test(
    "une pièce annulée ne se corrige plus",
    !!errCorrigerAnnule,
    errCorrigerAnnule?.message ?? "acceptée à tort"
  );

  const { count: avantSeconde } = await service
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("destinataire_id", patient.id)
    .ilike("corps", "%Ordonnance de test%");
  await medecin.client.rpc("annuler_document", { p_document_id: v3, p_motif: "Doublon" });
  const { count: apresSeconde } = await service
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("destinataire_id", patient.id)
    .ilike("corps", "%Ordonnance de test%");
  test(
    "annuler deux fois ne prévient pas deux fois",
    avantSeconde === apresSeconde,
    `${avantSeconde} → ${apresSeconde}`
  );

  /* ================= 4. Qualification des rendez-vous ================= */
  console.log("\n── Rendez-vous : on ne qualifie que ce qui a eu lieu ──");

  const { error: errFutur } = await medecin.client.rpc("qualifier_rdv", {
    p_rdv_id: rdvFutur,
    p_statut: "honore",
  });
  test(
    "un rendez-vous à venir ne se qualifie pas",
    !!errFutur,
    errFutur?.message ?? "acceptée à tort"
  );

  const { error: errAnnuleRdv } = await medecin.client.rpc("qualifier_rdv", {
    p_rdv_id: rdvAnnule,
    p_statut: "absent",
  });
  test(
    "un rendez-vous annulé ne se qualifie pas",
    !!errAnnuleRdv,
    errAnnuleRdv?.message ?? "acceptée à tort"
  );

  const { error: errInconnu } = await medecin.client.rpc("qualifier_rdv", {
    p_rdv_id: rdvPasse,
    p_statut: "peut_etre",
  });
  test("une qualification inconnue est refusée", !!errInconnu, errInconnu?.message);

  const { error: errAutre } = await confrere.client.rpc("qualifier_rdv", {
    p_rdv_id: rdvPasse,
    p_statut: "honore",
  });
  test(
    "un confrère ne qualifie pas le rendez-vous d’un autre",
    !!errAutre,
    errAutre?.message ?? "acceptée à tort"
  );

  const { error: errHonore } = await medecin.client.rpc("qualifier_rdv", {
    p_rdv_id: rdvPasse,
    p_statut: "honore",
  });
  test("un rendez-vous passé se marque honoré", !errHonore, errHonore?.message);

  // Depuis un état déjà tranché, on ne repart pas sans se corriger : la
  // transition « honoré → absent » directe est désormais refusée.
  const { error: errSansCorrection } = await medecin.client.rpc("qualifier_rdv", {
    p_rdv_id: rdvPasse,
    p_statut: "absent",
  });
  test(
    "honoré → absent est refusé hors correction",
    !!errSansCorrection,
    errSansCorrection?.message ?? "acceptée à tort"
  );

  const { error: errAbsent } = await medecin.client.rpc("qualifier_rdv", {
    p_rdv_id: rdvPasse,
    p_statut: "absent",
    p_correction: true,
  });
  test("et se reprend en « absent » si on s’est trompé (correction)", !errAbsent, errAbsent?.message);

  const { data: rdvLu } = await service
    .from("rendez_vous")
    .select("statut")
    .eq("id", rdvPasse)
    .single();
  test("le statut est bien « absent » en base", rdvLu?.statut === "absent", rdvLu?.statut);

  // ---- Présence : le maillon ajouté par 0075 ----
  const { error: errPresentFutur } = await medecin.client.rpc("qualifier_rdv", {
    p_rdv_id: rdvPresenceFutur,
    p_statut: "present",
  });
  test("un patient se marque présent, même avant l’heure", !errPresentFutur, errPresentFutur?.message);

  const { error: errHonoreFutur } = await medecin.client.rpc("qualifier_rdv", {
    p_rdv_id: rdvPresenceFutur,
    p_statut: "honore",
  });
  test(
    "honoré sur un rendez-vous à venir reste refusé, même présent",
    !!errHonoreFutur,
    errHonoreFutur?.message ?? "acceptée à tort"
  );

  const { error: errPresentPasse } = await medecin.client.rpc("qualifier_rdv", {
    p_rdv_id: rdvPresencePasse,
    p_statut: "present",
  });
  test("un rendez-vous passé se marque présent", !errPresentPasse, errPresentPasse?.message);

  const { error: errPresentHonore } = await medecin.client.rpc("qualifier_rdv", {
    p_rdv_id: rdvPresencePasse,
    p_statut: "honore",
  });
  test("présent → honoré est une suite normale (sans correction)", !errPresentHonore, errPresentHonore?.message);

  const { error: errHonorePresent } = await medecin.client.rpc("qualifier_rdv", {
    p_rdv_id: rdvPresencePasse,
    p_statut: "present",
  });
  test(
    "honoré → présent est refusé hors correction",
    !!errHonorePresent,
    errHonorePresent?.message ?? "acceptée à tort"
  );

  const { error: errCorrPresent } = await medecin.client.rpc("qualifier_rdv", {
    p_rdv_id: rdvPresencePasse,
    p_statut: "present",
    p_correction: true,
  });
  test("honoré → présent est permis en correction", !errCorrPresent, errCorrPresent?.message);

  // Pas de double notification : repasser « absent » un rendez-vous déjà
  // absent n'écrit rien et ne prévient pas une seconde fois.
  const { count: avantAbsent } = await service
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("destinataire_id", patient.id)
    .eq("source_id", rdvPasse)
    .eq("type", "rdv_absent");
  await medecin.client.rpc("qualifier_rdv", {
    p_rdv_id: rdvPasse,
    p_statut: "absent",
    p_correction: true,
  });
  const { count: apresAbsent } = await service
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("destinataire_id", patient.id)
    .eq("source_id", rdvPasse)
    .eq("type", "rdv_absent");
  test(
    "remarquer « absent » ne re-notifie pas",
    avantAbsent === apresAbsent,
    `${avantAbsent} → ${apresAbsent}`
  );

  /* ================= 5. Informations médicales ================= */
  console.log("\n── Informations médicales ──");

  const { error: errInfos } = await medecin.client.rpc("enregistrer_infos_medicales", {
    p_patient_id: patient.id,
    p_proche_id: null,
    p_sans_compte_id: null,
    p_groupe_sanguin: "O+",
    p_allergies: ["Pénicilline", "  ", "pénicilline", "Arachides"],
    p_antecedents: "Hypertension",
    p_traitements: "Amlodipine 5 mg",
  });
  test("le médecin traitant enregistre les informations", !errInfos, errInfos?.message);
  if (!errInfos) aNettoyer.infos.push(patient.id);

  const { data: infosLues } = await service
    .from("infos_medicales")
    .select("groupe_sanguin, allergies, antecedents, maj_par")
    .eq("patient_id", patient.id)
    .maybeSingle();
  test("le groupe sanguin est enregistré", infosLues?.groupe_sanguin === "O+");
  test(
    "les allergies vides et les doublons (casse comprise) sont écartés",
    infosLues?.allergies?.length === 2,
    JSON.stringify(infosLues?.allergies)
  );
  test("l’auteur de la mise à jour est tracé", infosLues?.maj_par === medecin.id);

  const { error: errGroupe } = await medecin.client.rpc("enregistrer_infos_medicales", {
    p_patient_id: patient.id,
    p_groupe_sanguin: "Z+",
  });
  test("un groupe sanguin inventé est refusé", !!errGroupe, errGroupe?.message);

  const { error: errPatientEcrit } = await patient.client.rpc("enregistrer_infos_medicales", {
    p_patient_id: patient.id,
    p_groupe_sanguin: "AB-",
  });
  test(
    "le patient n’écrit pas son propre bloc médical",
    !!errPatientEcrit,
    errPatientEcrit?.message ?? "acceptée à tort"
  );

  // Second enregistrement : il doit METTRE À JOUR, pas créer une deuxième ligne.
  await medecin.client.rpc("enregistrer_infos_medicales", {
    p_patient_id: patient.id,
    p_groupe_sanguin: "A+",
    p_allergies: ["Arachides"],
  });
  const { count: lignes } = await service
    .from("infos_medicales")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", patient.id);
  test("un second enregistrement met à jour la même ligne", lignes === 1, `${lignes} ligne(s)`);

  const { data: luParPatient } = await patient.client
    .from("infos_medicales")
    .select("groupe_sanguin")
    .eq("patient_id", patient.id)
    .maybeSingle();
  test("le patient lit son propre bloc médical", luParPatient?.groupe_sanguin === "A+");

  /* ================= 6. Journal d'audit ================= */
  console.log("\n── Journal d’audit ──");

  const depuis = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: audit } = await service
    .from("journal_audit")
    .select("action, cible_type, details")
    .eq("acteur_id", medecin.id)
    .gte("cree_le", depuis);
  const actions = (audit ?? []).map((a) => a.action);
  const contient = (fragment) => actions.some((a) => a.includes(fragment));

  test("la correction est journalisée", contient("corrigé un document"), `${actions.length} entrées`);
  test("l’annulation est journalisée", contient("annulé un document"));
  test("la qualification est journalisée", contient("honoré") || contient("absent"));
  test("la mise à jour médicale est journalisée", contient("informations médicales"));
  const motifTrace = (audit ?? []).find((a) => a.action.includes("annulé un document"))?.details
    ?.motif;
  test("le motif d’annulation figure au journal", !!motifTrace, motifTrace);

  const { data: auditPatient } = await patient.client.from("journal_audit").select("id").limit(1);
  test(
    "le journal n’est pas lisible par un patient",
    (auditPatient ?? []).length === 0,
    `${auditPatient?.length ?? 0} ligne(s)`
  );
}

async function nettoyer() {
  console.log("\n── Nettoyage ──");
  // Les versions d'abord, la racine ensuite : remplace_par_id pointe dessus.
  for (const id of [...aNettoyer.documents].reverse()) {
    await service.from("documents_patient").update({ remplace_par_id: null }).eq("id", id);
  }
  for (const id of [...aNettoyer.documents].reverse()) {
    await service.from("documents_patient").delete().eq("id", id);
  }
  for (const id of aNettoyer.rdvs) await service.from("rendez_vous").delete().eq("id", id);
  for (const id of aNettoyer.infos) await service.from("infos_medicales").delete().eq("patient_id", id);
  await service.from("notifications").delete().ilike("corps", "%Ordonnance de test%");
  console.log("✓ données de test retirées");
}

try {
  await main();
} catch (e) {
  echecs++;
  console.error("❌ interruption :", e.message);
} finally {
  await nettoyer();
}

console.log(echecs === 0 ? "\n✅ Tout est passé." : `\n❌ ${echecs} test(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
