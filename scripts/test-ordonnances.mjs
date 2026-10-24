/*
 * Tests de l'étape 3 (migration 0065), EN BASE, avec de vraies sessions.
 *
 *   Base de médicaments : amorcée ; lisible connecté, pas anonyme ; écrite
 *     par l'administration seule (pas par un médecin) ; unicité DCI/dosage/forme.
 *   Modèles d'ordonnance et signature : privés à leur médecin.
 *   Vérification d'un document :
 *     - code au bon format exigé, unique, réservé aux pièces d'un praticien ;
 *     - l'anonyme vérifie : « valide », puis « annule » après annulation,
 *       « corrige » après correction (et la nouvelle version « valide ») ;
 *     - le code se recopie à la main (minuscules, espaces, sans préfixe) ;
 *     - RIEN du patient dans la réponse ; code inconnu → aucune ligne.
 *
 * Tout ce qui est créé est supprimé à la fin.
 * Usage : ADMIN_MDP=… node scripts/test-ordonnances.mjs
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
const nouveau = () => createClient(URL_SB, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

let echecs = 0;
let total = 0;
const check = (label, ok, detail = "") => {
  total++;
  if (!ok) echecs++;
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
};
async function session(email, mdp = "test1234") {
  const c = nouveau();
  const { error } = await c.auth.signInWithPassword({ email, password: mdp });
  if (error) throw new Error(`${email} : ${error.message}`);
  return c;
}

const cree = { medicaments: [], documents: [], modeles: [], signatureMedecin: null };
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = () => {
  const c = Array.from({ length: 12 }, () => ALPHA[Math.floor(Math.random() * 32)]).join("");
  return `D224-${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;
};

async function main() {
  const { data: u } = await service
    .from("utilisateurs").select("id, email").in("email", ["medecin1@test.docteur224.com", "medecin3@test.docteur224.com", "patient1@test.docteur224.com"]);
  const id = (e) => u.find((x) => x.email === e).id;
  const medecinId = id("medecin1@test.docteur224.com");
  const patientId = id("patient1@test.docteur224.com");

  const medecin = await session("medecin1@test.docteur224.com");
  const confrere = await session("medecin3@test.docteur224.com");
  const patient = await session("patient1@test.docteur224.com");
  const anonyme = nouveau();
  const admin = process.env.ADMIN_MDP ? await session("admin@docteur224.com", process.env.ADMIN_MDP) : null;

  /* ============ Base de médicaments ============ */
  const { count: nbOms } = await service.from("medicaments").select("id", { count: "exact", head: true }).eq("origine", "oms");
  check("base amorcée sur la liste OMS", nbOms >= 150, `${nbOms} médicaments`);
  const { data: amox } = await medecin.from("medicaments").select("dci, classe").ilike("dci", "amoxicilline").limit(1);
  check("médecin : lecture de la base", amox?.length === 1 && amox[0].classe === "pénicillines", JSON.stringify(amox?.[0]));
  const { data: rien } = await anonyme.from("medicaments").select("id").limit(1);
  check("anonyme : pas de lecture", (rien ?? []).length === 0);

  const { error: eMed } = await medecin.from("medicaments").insert({ dci: "Essai médecin (TEST-ORDO)" });
  check("médecin : ajout refusé (réservé à l’administration)", !!eMed, eMed?.message);
  const { data: majMed } = await medecin.from("medicaments").update({ classe: "piratage" }).ilike("dci", "paracétamol").select("id");
  check("médecin : modification refusée", (majMed ?? []).length === 0);

  if (admin) {
    const { data: ajout, error: eA } = await admin
      .from("medicaments").insert({ dci: "Molécule d’essai (TEST-ORDO)", dosage: "10 mg", forme: "comprimé", classe: "  ESSAIS  " }).select("id, classe, maj_par").single();
    if (ajout) cree.medicaments.push(ajout.id);
    check("admin : ajout accepté", !eA && !!ajout, eA?.message);
    check("classe normalisée en minuscules", ajout?.classe === "essais", ajout?.classe);
    check("auteur de la modification posé par la base", !!ajout?.maj_par);
    const { error: eDoublon } = await admin.from("medicaments").insert({ dci: "MOLÉCULE D’ESSAI (TEST-ORDO)", dosage: "10 MG", forme: "Comprimé" });
    check("doublon (casse différente) refusé", eDoublon?.code === "23505", eDoublon?.message);
  } else {
    console.log("ℹ️  ADMIN_MDP absent : écritures de l’administration non testées");
  }

  /* ============ Modèles et signature ============ */
  const { data: modele, error: eMod } = await medecin
    .from("modeles_ordonnance")
    .insert({ medecin_id: medecinId, nom: "Angine (TEST-ORDO)", lignes: [{ libelle: "Amoxicilline 1 g — comprimé", posologie: "1 matin et soir" }] })
    .select("id").single();
  if (modele) cree.modeles.push(modele.id);
  check("médecin : modèle enregistré", !eMod && !!modele, eMod?.message);
  const { data: vuConfrere } = await confrere.from("modeles_ordonnance").select("id").eq("id", modele?.id);
  check("confrère : ne voit pas le modèle", (vuConfrere ?? []).length === 0);
  const { data: supConfrere } = await confrere.from("modeles_ordonnance").delete().eq("id", modele?.id).select("id");
  check("confrère : ne peut pas le supprimer", (supConfrere ?? []).length === 0);
  const { error: eUsurpe } = await confrere.from("modeles_ordonnance").insert({ medecin_id: medecinId, nom: "Usurpation" });
  check("confrère : ne peut pas créer au nom d’un autre", !!eUsurpe);

  const { data: sigAvant } = await service.from("signatures_medecin").select("medecin_id, traits, ratio").eq("medecin_id", medecinId).maybeSingle();
  cree.signatureMedecin = sigAvant ?? "aucune";
  const { error: eSig } = await medecin.from("signatures_medecin").upsert({ medecin_id: medecinId, traits: [[[0.1, 0.5], [0.9, 0.5]]], ratio: 3 });
  check("médecin : signature enregistrée", !eSig, eSig?.message);
  const { data: sigPatient } = await patient.from("signatures_medecin").select("medecin_id");
  check("patient : ne lit aucune signature", (sigPatient ?? []).length === 0);
  const { data: sigConfrere } = await confrere.from("signatures_medecin").select("medecin_id").eq("medecin_id", medecinId);
  check("confrère : ne lit pas la signature d’un autre", (sigConfrere ?? []).length === 0);
  const { error: eSigVide } = await medecin.from("signatures_medecin").upsert({ medecin_id: medecinId, traits: [], ratio: 3 });
  check("signature vide refusée", !!eSigVide);

  /* ============ Vérification d'un document ============ */
  const c1 = code();
  const { data: doc, error: eDoc } = await medecin
    .from("documents_patient")
    .insert({
      origine: "medecin", depose_par: medecinId, medecin_id: medecinId, patient_id: patientId, type: "ordonnance",
      titre: "Ordonnance (TEST-ORDO)", contenu: "AMOXICILLINE 1 G — comprimé\n1 matin et soir",
      prescription: [{ libelle: "Amoxicilline 1 g — comprimé", posologie: "1 matin et soir" }], code_verification: c1,
    })
    .select("id").single();
  if (doc) cree.documents.push(doc.id);
  check("ordonnance émise avec code et prescription", !eDoc && !!doc, eDoc?.message);

  const { data: v1 } = await anonyme.rpc("verifier_document", { p_code: c1 });
  check("anonyme : document « valide »", v1?.[0]?.statut === "valide", JSON.stringify(v1?.[0]));
  check("réponse : type, date et médecin", v1?.[0]?.type === "ordonnance" && !!v1?.[0]?.emis_le && /\S+ \S+/.test(v1?.[0]?.medecin ?? ""));
  const cles = Object.keys(v1?.[0] ?? {}).sort().join(",");
  check(
    "réponse : rien du patient (ni nom, ni contenu, ni motif)",
    cles === "change_le,emis_le,etablissement,medecin,specialite,statut,type,version" &&
      !JSON.stringify(v1).includes("AMOXICILLINE") && !JSON.stringify(v1).includes("Condé"),
    cles
  );
  const saisieManuelle = c1.toLowerCase().replace("d224-", "").replace(/-/g, " ");
  const { data: vManuel } = await anonyme.rpc("verifier_document", { p_code: saisieManuelle });
  check("code recopié à la main (minuscules, espaces, sans préfixe)", vManuel?.[0]?.statut === "valide", saisieManuelle);
  const { data: vInconnu } = await anonyme.rpc("verifier_document", { p_code: code() });
  check("code inconnu : aucune ligne", (vInconnu ?? []).length === 0);
  const { data: vFaux } = await anonyme.rpc("verifier_document", { p_code: "n'importe quoi" });
  check("code mal formé : aucune ligne", (vFaux ?? []).length === 0);

  const { error: eFormat } = await medecin.from("documents_patient").insert({
    origine: "medecin", depose_par: medecinId, medecin_id: medecinId, patient_id: patientId, type: "ordonnance",
    titre: "Mauvais code (TEST-ORDO)", contenu: "x", code_verification: "D224-0000-OOOO-1111",
  });
  check("code au mauvais format refusé", !!eFormat, eFormat?.message);
  const { error: eUnique } = await medecin.from("documents_patient").insert({
    origine: "medecin", depose_par: medecinId, medecin_id: medecinId, patient_id: patientId, type: "ordonnance",
    titre: "Doublon (TEST-ORDO)", contenu: "x", code_verification: c1,
  });
  check("code déjà attribué refusé", !!eUnique, eUnique?.message);
  const { error: ePatient } = await patient.from("documents_patient").insert({
    origine: "patient", depose_par: patientId, patient_id: patientId, medecin_id: medecinId, type: "resultat",
    titre: "Analyse (TEST-ORDO)", contenu: "x", code_verification: code(),
  });
  check("pièce envoyée par le patient : pas de code possible", !!ePatient, ePatient?.message);

  // Correction → l'ancienne version répond « corrige », la nouvelle « valide »
  const c2 = code();
  const { data: v2Id, error: eCorr } = await medecin.rpc("corriger_document", {
    p_document_id: doc.id, p_titre: "Ordonnance (TEST-ORDO)", p_contenu: "AMOXICILLINE 1 G — comprimé\n1 matin, midi et soir",
    p_prescription: [{ libelle: "Amoxicilline 1 g — comprimé", posologie: "1 matin, midi et soir" }], p_code_verification: c2,
  });
  if (v2Id) cree.documents.push(v2Id);
  check("correction : nouvelle version avec son propre code", !eCorr && !!v2Id, eCorr?.message);
  const { data: vAncien } = await anonyme.rpc("verifier_document", { p_code: c1 });
  check("l’ancienne version répond « corrigé »", vAncien?.[0]?.statut === "corrige" && !!vAncien?.[0]?.change_le);
  const { data: vNouveau } = await anonyme.rpc("verifier_document", { p_code: c2 });
  check("la nouvelle version répond « valide », version 2", vNouveau?.[0]?.statut === "valide" && vNouveau?.[0]?.version === 2);
  const { data: presc } = await medecin.from("documents_patient").select("prescription").eq("id", v2Id).single();
  check("la prescription corrigée est enregistrée", presc?.prescription?.[0]?.posologie === "1 matin, midi et soir");

  // Annulation → « annule », sans le motif
  const { error: eAnn } = await medecin.rpc("annuler_document", { p_document_id: v2Id, p_motif: "Erreur de posologie (motif médical)" });
  check("annulation acceptée", !eAnn, eAnn?.message);
  const { data: vAnnule } = await anonyme.rpc("verifier_document", { p_code: c2 });
  check("après annulation : « annulé »", vAnnule?.[0]?.statut === "annule");
  check("le motif d’annulation n’est pas révélé", !JSON.stringify(vAnnule).includes("posologie"));
}

async function nettoyer() {
  if (cree.documents.length) {
    await service.from("documents_patient").update({ remplace_par_id: null }).in("id", cree.documents);
    await service.from("journal_audit").delete().in("cible_id", cree.documents);
    await service.from("notifications").delete().ilike("corps", "%TEST-ORDO%");
    await service.from("documents_patient").delete().in("id", [...cree.documents].reverse());
  }
  await service.from("documents_patient").delete().ilike("titre", "%(TEST-ORDO)%");
  if (cree.medicaments.length) await service.from("medicaments").delete().in("id", cree.medicaments);
  await service.from("medicaments").delete().ilike("dci", "%(TEST-ORDO)%");
  if (cree.modeles.length) await service.from("modeles_ordonnance").delete().in("id", cree.modeles);
  // La signature du médecin de test retrouve son état d'avant.
  if (cree.signatureMedecin === "aucune") {
    const { data: u } = await service.from("utilisateurs").select("id").eq("email", "medecin1@test.docteur224.com").single();
    await service.from("signatures_medecin").delete().eq("medecin_id", u.id);
  } else if (cree.signatureMedecin) {
    await service.from("signatures_medecin").upsert(cree.signatureMedecin);
  }
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
