/*
 * Tests des ordonnances d'actes (migration 0068), EN BASE, avec de vraies
 * sessions.
 *
 *   Référentiel : amorcé (biologie + imagerie) ; lisible connecté, pas
 *     anonyme ; écrit par l'administration seule ; unicité par DOMAINE et
 *     libellé ; catégorie normalisée.
 *   Recherche : la colonne `recherche` est tenue par le trigger — on trouve
 *     « NFS (hémogramme) » en tapant « hemogramme », et « Œstradiol » en
 *     tapant « oestradiol » (la ligature, que `translate` seul rate).
 *   Modèles : cloisonnés par domaine — un bilan de biologie ne doit JAMAIS
 *     remonter dans l'ordonnance de médicaments.
 *   Options (« à jeun », « urgent », renseignements) : reconduites par
 *     `corriger_document` quand l'appelant n'en passe pas, et effaçables en
 *     passant un objet vide. C'est la règle qui empêche une correction de
 *     faire disparaître un « urgent » en silence.
 *
 * Tout ce qui est créé est supprimé à la fin.
 * Usage : ADMIN_MDP=… node scripts/test-actes.mjs
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

const cree = { actes: [], documents: [], modeles: [] };
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const code = () => {
  const c = Array.from({ length: 12 }, () => ALPHA[Math.floor(Math.random() * 32)]).join("");
  return `D224-${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;
};

/*
 * Sans la migration, tout échoue pour la même raison — et PIRE : les
 * contrôles « untel n'a pas le droit » passent au vert, puisqu'ils se
 * contentent de constater une erreur et qu'une table absente en est une.
 * Le premier passage a produit cinq faux succès de cette façon.
 *
 * On s'arrête donc net, avant d'afficher la moindre ligne.
 */
async function exigerMigration() {
  const manques = [];
  const absent = async (table, colonne) => (await service.from(table).select(colonne).limit(1)).error;
  if (await absent("actes_prescriptibles", "id")) manques.push("table `actes_prescriptibles`");
  if (await absent("modeles_ordonnance", "domaine")) manques.push("colonne `modeles_ordonnance.domaine`");
  if (await absent("documents_patient", "prescription_options")) manques.push("colonne `documents_patient.prescription_options`");
  if (manques.length) {
    throw new Error(`migration 0068 non appliquée — absent : ${manques.join(", ")}`);
  }
}

/** Un refus doit venir de la RLS, pas d'un objet manquant ou d'une faute de frappe. */
const refusParRls = (e) => e?.code === "42501" || /row-level security/i.test(e?.message ?? "");

async function main() {
  await exigerMigration();

  const { data: u } = await service
    .from("utilisateurs")
    .select("id, email")
    .in("email", ["medecin1@test.docteur224.com", "medecin3@test.docteur224.com", "patient1@test.docteur224.com"]);
  const id = (e) => u.find((x) => x.email === e).id;
  const medecinId = id("medecin1@test.docteur224.com");
  const patientId = id("patient1@test.docteur224.com");

  const medecin = await session("medecin1@test.docteur224.com");
  const confrere = await session("medecin3@test.docteur224.com");
  const anonyme = nouveau();
  const admin = process.env.ADMIN_MDP ? await session("admin@docteur224.com", process.env.ADMIN_MDP) : null;

  /* ============ Référentiel ============ */
  const compte = async (domaine) =>
    (await service.from("actes_prescriptibles").select("id", { count: "exact", head: true }).eq("domaine", domaine)).count;
  const nbBio = await compte("biologie");
  const nbImg = await compte("imagerie");
  check("biologie amorcée", nbBio >= 90, `${nbBio} analyses`);
  check("imagerie amorcée (invisible des médecins tant que son type n’existe pas)", nbImg >= 50, `${nbImg} examens`);

  const { data: nfs } = await medecin
    .from("actes_prescriptibles")
    .select("libelle, categorie, synonymes, recherche")
    .eq("domaine", "biologie")
    .ilike("libelle", "NFS%")
    .limit(1);
  check("médecin : lecture du référentiel", nfs?.length === 1, JSON.stringify(nfs?.[0]?.libelle));
  check("catégorie en minuscules", nfs?.[0]?.categorie === "hématologie", nfs?.[0]?.categorie);
  check(
    "le trigger a rempli `recherche` : libellé + synonymes, sans accents",
    (nfs?.[0]?.recherche ?? "").includes("hemogramme") && (nfs?.[0]?.recherche ?? "").includes("nfs"),
    nfs?.[0]?.recherche
  );

  const { data: rien } = await anonyme.from("actes_prescriptibles").select("id").limit(1);
  check("anonyme : pas de lecture", (rien ?? []).length === 0);

  /* ---- La recherche telle que l'écran la fait ---- */
  const chercher = async (q) =>
    (
      await medecin
        .from("actes_prescriptibles")
        .select("libelle")
        .eq("domaine", "biologie")
        .eq("actif", true)
        .ilike("recherche", `%${q}%`)
        .limit(5)
    ).data ?? [];
  check("« hemogramme » trouve la NFS", (await chercher("hemogramme")).some((a) => a.libelle.startsWith("NFS")));
  check("« tgo » trouve les transaminases", (await chercher("tgo")).some((a) => a.libelle.includes("Transaminases")));
  check("« vs » trouve la vitesse de sédimentation", (await chercher("vs")).some((a) => a.libelle.includes("sédimentation")));
  // La ligature : « œ » vaut deux lettres, ce que `translate` seul ne sait
  // pas faire. Sans le `replace` de `normaliser_recherche`, ceci échoue.
  check(
    "« oestradiol » trouve « Œstradiol » (ligature)",
    (await chercher("oestradiol")).some((a) => a.libelle.includes("stradiol"))
  );

  /* ---- Écriture : l'administration seule ---- */
  const { error: eMedecin } = await medecin
    .from("actes_prescriptibles")
    .insert({ domaine: "biologie", libelle: "Essai médecin (TEST-ACTES)" });
  check("médecin : ajout refusé PAR LA RLS (réservé à l’administration)", refusParRls(eMedecin), eMedecin?.message);
  const { data: majMedecin } = await medecin
    .from("actes_prescriptibles")
    .update({ categorie: "piratage" })
    .ilike("libelle", "NFS%")
    .select("id");
  check("médecin : modification refusée", (majMedecin ?? []).length === 0);

  if (admin) {
    const { data: ajout, error: eA } = await admin
      .from("actes_prescriptibles")
      .insert({
        domaine: "biologie",
        libelle: "Dosage d’essai (TEST-ACTES)",
        synonymes: ["essai", "dosage bidon"],
        categorie: "  BIOCHIMIE  ",
      })
      .select("id, categorie, recherche, maj_par")
      .single();
    if (ajout) cree.actes.push(ajout.id);
    check("admin : ajout accepté", !eA && !!ajout, eA?.message);
    check("catégorie normalisée en minuscules", ajout?.categorie === "biochimie", ajout?.categorie);
    check("auteur de la modification posé par la base", !!ajout?.maj_par);
    check("`recherche` reprend les synonymes à l’ajout", (ajout?.recherche ?? "").includes("dosage bidon"), ajout?.recherche);

    const { error: eDoublon } = await admin
      .from("actes_prescriptibles")
      .insert({ domaine: "biologie", libelle: "DOSAGE D’ESSAI (TEST-ACTES)" });
    check("doublon dans le même domaine (casse différente) refusé", eDoublon?.code === "23505", eDoublon?.message);

    // Le même intitulé dans l'AUTRE domaine est un acte différent : un
    // « Doppler » de biologie n'existe pas, mais la règle doit tenir.
    const { data: jumeau, error: eJumeau } = await admin
      .from("actes_prescriptibles")
      .insert({ domaine: "imagerie", libelle: "Dosage d’essai (TEST-ACTES)" })
      .select("id")
      .single();
    if (jumeau) cree.actes.push(jumeau.id);
    check("même libellé dans l’autre domaine : accepté", !eJumeau && !!jumeau, eJumeau?.message);

    const { error: eDomaine } = await admin
      .from("actes_prescriptibles")
      .insert({ domaine: "chirurgie", libelle: "Domaine inconnu (TEST-ACTES)" });
    check("domaine hors liste refusé", !!eDomaine, eDomaine?.message);
  } else {
    console.log("ℹ️  ADMIN_MDP absent : écritures de l’administration non testées");
  }

  /* ============ Modèles : cloisonnés par domaine ============ */
  const { data: modeleBio, error: eMod } = await medecin
    .from("modeles_ordonnance")
    .insert({
      medecin_id: medecinId,
      domaine: "biologie",
      nom: "Bilan d’essai (TEST-ACTES)",
      lignes: [{ acteId: null, libelle: "NFS (hémogramme)" }],
      options: { jeun: true, renseignements: "Asthénie" },
    })
    .select("id, domaine")
    .single();
  if (modeleBio) cree.modeles.push(modeleBio.id);
  check("modèle de biologie enregistré", !eMod && modeleBio?.domaine === "biologie", eMod?.message);

  const { data: modeleMed } = await medecin
    .from("modeles_ordonnance")
    .insert({ medecin_id: medecinId, nom: "Angine d’essai (TEST-ACTES)", lignes: [{ libelle: "Amoxicilline 1 g", posologie: "1 matin et soir" }] })
    .select("id, domaine")
    .single();
  if (modeleMed) cree.modeles.push(modeleMed.id);
  check("un modèle sans domaine est un modèle de médicaments", modeleMed?.domaine === "medicament", modeleMed?.domaine);

  // LE point du cloisonnement : la requête de l'éditeur des médicaments.
  const { data: vusEnMedicament } = await medecin
    .from("modeles_ordonnance")
    .select("id, nom")
    .eq("domaine", "medicament")
    .ilike("nom", "%(TEST-ACTES)%");
  check(
    "le bilan de biologie ne remonte PAS dans l’ordonnance de médicaments",
    (vusEnMedicament ?? []).length === 1 && vusEnMedicament[0].id === modeleMed?.id,
    (vusEnMedicament ?? []).map((m) => m.nom).join(", ")
  );
  const { data: vuConfrere } = await confrere.from("modeles_ordonnance").select("id").eq("id", modeleBio?.id);
  check("confrère : ne voit pas le modèle", (vuConfrere ?? []).length === 0);

  /* ============ Ordonnance de biologie et ses options ============ */
  const c1 = code();
  const { data: doc, error: eDoc } = await medecin
    .from("documents_patient")
    .insert({
      origine: "medecin",
      depose_par: medecinId,
      medecin_id: medecinId,
      patient_id: patientId,
      type: "ordonnance_biologie",
      titre: "Ordonnance de biologie (TEST-ACTES)",
      contenu: "EXAMEN URGENT\nÀ JEUN\n\n1. NFS (hémogramme)\n\nRenseignements cliniques : Asthénie",
      prescription: [{ acteId: null, libelle: "NFS (hémogramme)" }],
      prescription_options: { jeun: true, urgent: true, renseignements: "Asthénie" },
      code_verification: c1,
    })
    .select("id")
    .single();
  if (doc) cree.documents.push(doc.id);
  check("ordonnance de biologie émise", !eDoc && !!doc, eDoc?.message);

  const { data: vPublic } = await anonyme.rpc("verifier_document", { p_code: c1 });
  check("la page publique la reconnaît", vPublic?.[0]?.type === "ordonnance_biologie", JSON.stringify(vPublic?.[0]?.type));
  check(
    "rien des renseignements cliniques n’est révélé",
    !JSON.stringify(vPublic).includes("Asthénie") && !JSON.stringify(vPublic).includes("URGENT")
  );

  /* ---- Imagerie : le type existe-t-il ? (migration 0069) ---- */
  const { data: docImagerie, error: eImagerie } = await medecin
    .from("documents_patient")
    .insert({
      origine: "medecin",
      depose_par: medecinId,
      medecin_id: medecinId,
      patient_id: patientId,
      type: "ordonnance_imagerie",
      titre: "Ordonnance d’imagerie (TEST-ACTES)",
      contenu: "1. Échographie abdominale\n\nRenseignements cliniques : Douleurs",
      prescription: [{ acteId: null, libelle: "Échographie abdominale" }],
      prescription_options: { renseignements: "Douleurs" },
      code_verification: code(),
    })
    .select("id")
    .single();
  if (docImagerie) cree.documents.push(docImagerie.id);
  check(
    "ordonnance d’imagerie émise",
    !eImagerie && !!docImagerie,
    // 22P02 = valeur hors enum : le diagnostic utile, sinon on lit un
    // message Postgres qui ne dit pas quelle migration manque.
    eImagerie?.code === "22P02"
      ? "valeur d’enum « ordonnance_imagerie » absente — migration 0069 non appliquée"
      : eImagerie?.message
  );

  const { error: eTableau } = await medecin.from("documents_patient").insert({
    origine: "medecin", depose_par: medecinId, medecin_id: medecinId, patient_id: patientId,
    type: "ordonnance_biologie", titre: "Options mal formées (TEST-ACTES)", contenu: "x",
    prescription_options: [{ urgent: true }],
  });
  check("`prescription_options` doit être un objet, pas un tableau", !!eTableau, eTableau?.message);

  /* ---- La règle qui m'a manqué à la première écriture ---- */
  // Sans la pièce d'origine, la suite n'a rien à corriger : on le dit une
  // fois plutôt que de lever une exception obscure sur `doc.id`.
  if (!doc) {
    check("correction : impossible à vérifier, l’ordonnance n’a pas été émise", false);
    return;
  }
  const { data: v2Id, error: eCorr } = await medecin.rpc("corriger_document", {
    p_document_id: doc.id,
    p_titre: "Ordonnance de biologie (TEST-ACTES)",
    p_contenu: "EXAMEN URGENT\nÀ JEUN\n\n1. NFS (hémogramme)\n2. CRP\n\nRenseignements cliniques : Asthénie",
    p_prescription: [{ acteId: null, libelle: "NFS (hémogramme)" }, { acteId: null, libelle: "CRP" }],
    p_code_verification: code(),
    // p_prescription_options VOLONTAIREMENT absent : c'est le cas de
    // l'appelant distrait, et celui de l'ordonnance de médicaments.
  });
  if (v2Id) cree.documents.push(v2Id);
  check("correction sans options : acceptée", !eCorr && !!v2Id, eCorr?.message);
  const { data: v2 } = await service.from("documents_patient").select("prescription_options").eq("id", v2Id).single();
  check(
    "les options sont RECONDUITES, pas perdues",
    v2?.prescription_options?.urgent === true && v2?.prescription_options?.renseignements === "Asthénie",
    JSON.stringify(v2?.prescription_options)
  );

  const { data: v3Id } = await medecin.rpc("corriger_document", {
    p_document_id: v2Id,
    p_titre: "Ordonnance de biologie (TEST-ACTES)",
    p_contenu: "1. NFS (hémogramme)",
    p_prescription: [{ acteId: null, libelle: "NFS (hémogramme)" }],
    p_prescription_options: {}, // objet vide = « efface-les vraiment »
    p_code_verification: code(),
  });
  if (v3Id) cree.documents.push(v3Id);
  const { data: v3 } = await service.from("documents_patient").select("prescription_options").eq("id", v3Id).single();
  check(
    "un objet vide efface les options (retirer un « urgent » posé par erreur)",
    v3?.prescription_options && Object.keys(v3.prescription_options).length === 0,
    JSON.stringify(v3?.prescription_options)
  );
}

async function nettoyer() {
  if (cree.documents.length) {
    await service.from("documents_patient").update({ remplace_par_id: null }).in("id", cree.documents);
    await service.from("journal_audit").delete().in("cible_id", cree.documents);
    await service.from("notifications").delete().ilike("corps", "%TEST-ACTES%");
    await service.from("documents_patient").delete().in("id", [...cree.documents].reverse());
  }
  await service.from("documents_patient").delete().ilike("titre", "%(TEST-ACTES)%");
  if (cree.actes.length) await service.from("actes_prescriptibles").delete().in("id", cree.actes);
  await service.from("actes_prescriptibles").delete().ilike("libelle", "%(TEST-ACTES)%");
  if (cree.modeles.length) await service.from("modeles_ordonnance").delete().in("id", cree.modeles);
  await service.from("modeles_ordonnance").delete().ilike("nom", "%(TEST-ACTES)%");
  console.log("ℹ️  données de test supprimées");
}

main()
  .catch((e) => {
    echecs++;
    console.error("❌", e.message);
  })
  .finally(async () => {
    await nettoyer();
    console.log(
      echecs === 0
        ? `\n✅ ${total}/${total} vérifications passées.`
        : total === 0
          ? "\n❌ arrêté avant toute vérification."
          : `\n❌ ${echecs} échec(s) sur ${total}.`
    );
    process.exit(echecs === 0 ? 0 : 1);
  });
