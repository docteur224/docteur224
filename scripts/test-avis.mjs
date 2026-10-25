/*
 * Tests du système d'avis et notes (migration 0011).
 *
 * Chaque test se connecte avec un vrai compte (clé anon, JWT réel) : ce sont
 * les policies de la base qui sont vérifiées, pas la logique du navigateur.
 * Les données créées ici sont nettoyées en fin de scénario.
 *
 * Exécution : node scripts/test-avis.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const lire = (cle) => env.match(new RegExp(`^${cle}=(.*)$`, "m"))?.[1].trim();
const URL_SB = lire("NEXT_PUBLIC_SUPABASE_URL");
const ANON = lire("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE = lire("SUPABASE_SERVICE_ROLE_KEY");

const resultats = [];
const test = (nom, ok, detail) => {
  resultats.push({ nom, ok });
  console.log(`${ok ? "✅" : "❌"} ${nom}${detail ? ` — ${detail}` : ""}`);
};

async function clientPour(email, mdp = "test1234") {
  const c = createClient(URL_SB, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: mdp });
  if (error) throw new Error(`connexion ${email}: ${error.message}`);
  return c;
}

const admin = createClient(URL_SB, SERVICE, { auth: { persistSession: false } });
const anon = createClient(URL_SB, ANON, { auth: { persistSession: false } });
const patient = await clientPour("patient1@test.docteur224.com");
const patient2 = await clientPour("patient2@test.docteur224.com");
const medecin = await clientPour("medecin1@test.docteur224.com");
const medecin2 = await clientPour("medecin2@test.docteur224.com");

const idPatient = (await patient.auth.getUser()).data.user.id;
const idPatient2 = (await patient2.auth.getUser()).data.user.id;
const idMedecin = (await medecin.auth.getUser()).data.user.id;

// ---------- Préparation : deux RDV chez medecin1 pour patient1 ----------
// L'un honoré (notable), l'autre confirmé (non notable). Créés en
// service_role pour ne pas dépendre de l'état du seed.
const creesRdv = [];

/*
 * Les créneaux sont pris dans l'AGENDA RÉEL du praticien, et non à une
 * heure choisie au hasard : le verrou de la migration 0053 refuse tout
 * rendez-vous posé sur un créneau fermé, y compris en clé de service.
 * Ce qui compte ici est le STATUT — `peut_noter_rdv` n'exige qu'un
 * rendez-vous honoré, jamais une date passée —, pas la date elle-même.
 */
const jourPlus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function creneauxLibres(combien) {
  const libres = [];
  for (let j = 3; j <= 40 && libres.length < combien; j++) {
    for (const heure of ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"]) {
      const date = jourPlus(j);
      const { data: ouvert } = await admin.rpc("creneau_ouvert_medecin", {
        p_medecin_id: idMedecin, p_date: date, p_heure: heure,
      });
      if (ouvert) { libres.push({ date, heure }); break; }
    }
  }
  if (libres.length < combien) {
    throw new Error(`pas ${combien} créneau(x) ouvert(s) sur 40 jours pour medecin1`);
  }
  return libres;
}

// Trois créneaux : la consultation notée, une non honorée, et une honorée
// laissée VIERGE — sans elle, le refus « médecin jamais consulté » serait
// rendu par l'unicité par rendez-vous et ne prouverait rien.
const libres = await creneauxLibres(3);

async function creerRdv(statut, creneau) {
  const { data, error } = await admin
    .from("rendez_vous")
    .insert({
      medecin_id: idMedecin,
      date: creneau.date,
      heure: creneau.heure,
      reserve_par: idPatient,
      reserve_par_role: "patient",
      patient_id: idPatient,
      motif: "Test avis",
      statut,
      source: "en_ligne",
    })
    .select("id")
    .single();
  if (error) throw new Error(`création RDV ${statut}: ${error.message}`);
  creesRdv.push(data.id);
  return data.id;
}

const rdvHonore = await creerRdv("honore", libres[0]);
const rdvConfirme = await creerRdv("confirme", libres[1]);
const rdvHonoreVierge = await creerRdv("honore", libres[2]);

/** Note et nombre d'avis actuels du médecin — la base peut déjà en contenir. */
async function noteMedecin() {
  const { data } = await admin
    .from("medecins")
    .select("note_moyenne, nb_avis")
    .eq("id", idMedecin)
    .single();
  return { moyenne: Number(data.note_moyenne), nb: data.nb_avis };
}

/**
 * La vérité, calculée depuis les avis publiés. C'est à elle que la fiche
 * doit se conformer : c'est toute la promesse de `recalculer_note_medecin`.
 *
 * On ne déduit plus l'attendu d'une formule appliquée à l'état relevé au
 * départ. Cette façon de faire supposait qu'un seul avis s'ajouterait et
 * que la fiche était juste au moment du relevé — deux hypothèses fausses,
 * qui faisaient échouer le test sans qu'aucun défaut n'existe. Comparer à
 * la vérité est à la fois plus simple et plus exigeant.
 */
async function veriteDepuisAvis() {
  const { data } = await admin
    .from("avis").select("note").eq("medecin_id", idMedecin).eq("statut", "publie");
  const notes = (data ?? []).map((a) => Number(a.note));
  const nb = notes.length;
  return {
    nb,
    moyenne: nb ? Math.round((notes.reduce((s, n) => s + n, 0) / nb) * 100) / 100 : 0,
  };
}

/** La fiche concorde-t-elle avec les avis publiés ? */
async function ficheConforme() {
  const [fiche, vrai] = await Promise.all([noteMedecin(), veriteDepuisAvis()]);
  return {
    ok: fiche.nb === vrai.nb && Math.abs(fiche.moyenne - vrai.moyenne) < 0.011,
    detail: `fiche ${fiche.moyenne}/${fiche.nb} · avis publiés ${vrai.moyenne}/${vrai.nb}`,
  };
}

/*
 * Un passage interrompu laisse son avis derrière lui : le `finally` est bien
 * exécuté, mais une exception au niveau supérieur éteint le processus avant
 * que son nettoyage asynchrone n'aboutisse. On balaie donc AVANT de
 * commencer, en ciblant le commentaire exact déposé par ce script — jamais
 * « tout ce que ce médecin a reçu », ce qui emporterait les avis du seed.
 */
const COMMENTAIRE = "Médecin très à l'écoute, explications claires.";
{
  const { data: residus } = await admin
    .from("avis").delete()
    .eq("medecin_id", idMedecin).eq("commentaire", COMMENTAIRE).select("id");
  if ((residus ?? []).length) {
    console.log(`ℹ️  ${residus.length} avis d'un passage précédent retiré(s).`);
  }
}

// État de départ, pour vérifier à la fin qu'on a tout rendu.
const depart = await noteMedecin();

let idAvis = null;

try {
  // ---------- 1. Dépôt ----------
  {
    const { data, error } = await patient
      .from("avis")
      .insert({
        patient_id: idPatient,
        medecin_id: idMedecin,
        rendez_vous_id: rdvHonore,
        note: 5,
        commentaire: COMMENTAIRE,
      })
      .select("id, statut")
      .single();
    idAvis = data?.id ?? null;
    test("Patient dépose un avis sur une consultation honorée", !error && !!idAvis, error?.message);
    test("L'avis est publié immédiatement (modération a posteriori)", data?.statut === "publie", data?.statut);
  }

  // ---------- 2. Règles de dépôt ----------
  {
    const { error } = await patient.from("avis").insert({
      patient_id: idPatient,
      medecin_id: idMedecin,
      rendez_vous_id: rdvConfirme,
      note: 5,
    });
    test("Refus d'un avis sur un RDV non honoré", !!error, error?.code);
  }
  {
    // La consultation honorée appartient bien à ce patient, mais chez un
    // AUTRE praticien : noter le second reviendrait à inventer une visite.
    const idMedecin2 = (await medecin2.auth.getUser()).data.user.id;
    const { error } = await patient.from("avis").insert({
      patient_id: idPatient,
      medecin_id: idMedecin2,
      rendez_vous_id: rdvHonoreVierge,
      note: 1,
    });
    test("Refus d'un avis sur un médecin jamais consulté", !!error, error?.code);
  }
  {
    const { error } = await patient.from("avis").insert({
      patient_id: idPatient,
      medecin_id: idMedecin,
      rendez_vous_id: rdvHonore,
      note: 4,
    });
    test("Refus d'un second avis sur la même consultation", !!error, error?.code);
  }
  {
    const { error } = await patient2.from("avis").insert({
      patient_id: idPatient2,
      medecin_id: idMedecin,
      rendez_vous_id: rdvHonore,
      note: 1,
    });
    test("Refus d'un avis sur la consultation d'un autre patient", !!error, error?.code);
  }
  {
    const { error } = await patient.from("avis").insert({
      patient_id: idPatient,
      medecin_id: idMedecin,
      rendez_vous_id: rdvHonore,
      note: 9,
    });
    test("Refus d'une note hors de 1–5", !!error, error?.code);
  }

  // ---------- 3. Recalcul de la note du médecin ----------
  {
    // Le trigger a-t-il fait son travail ? La fiche doit concorder avec les
    // avis publiés — et compter un avis de plus qu'avant le dépôt.
    const apres = await noteMedecin();
    const { ok, detail } = await ficheConforme();
    test(
      "La note du médecin est recalculée par trigger",
      ok && apres.nb === depart.nb + 1,
      detail
    );
  }

  // ---------- 4. Lecture publique ----------
  {
    const { data, error } = await anon.rpc("avis_publies_medecin", { p_medecin_id: idMedecin });
    const trouve = (data ?? []).find((a) => a.id === idAvis);
    test("Un visiteur anonyme lit les avis publiés", !error && !!trouve, error?.message);
    test(
      "L'auteur est anonymisé (prénom + initiale)",
      !!trouve && /^\S+( \S\.)?$/.test(trouve.auteur),
      trouve?.auteur
    );
  }

  // ---------- 5. Réponse du médecin ----------
  {
    const { error } = await medecin
      .from("avis")
      .update({ reponse_medecin: "Merci pour votre confiance !" })
      .eq("id", idAvis);
    test("Le médecin répond à un avis reçu", !error, error?.message);

    const { data } = await admin.from("avis").select("reponse_medecin, reponse_le").eq("id", idAvis).single();
    test("La date de réponse est posée automatiquement", !!data?.reponse_le, data?.reponse_le);
  }
  {
    const { error } = await medecin.from("avis").update({ note: 1 }).eq("id", idAvis);
    test("Le médecin ne peut pas modifier la note", !!error, error?.message?.slice(0, 60));
  }
  {
    const { error } = await medecin.from("avis").update({ statut: "rejete" }).eq("id", idAvis);
    test("Le médecin ne peut pas masquer un avis lui-même", !!error, error?.message?.slice(0, 60));
  }
  {
    // Une policy `update` ne s'applique qu'aux lignes visibles : medecin2 ne
    // voit pas cet avis, la mise à jour ne touche donc aucune ligne.
    const { data } = await medecin2
      .from("avis")
      .update({ reponse_medecin: "Piratage" })
      .eq("id", idAvis)
      .select("id");
    test("Un autre médecin ne peut pas répondre à cet avis", (data ?? []).length === 0);
  }

  // ---------- 5 bis. Chemins de jointure et cloisonnement des listes ----------
  {
    // `avis.patient_id` référence `patients`, pas `utilisateurs` : le nom de
    // l'auteur se lit en deux sauts. Une régression ici casse silencieusement
    // l'affichage (l'écran croit qu'aucun avis n'existe).
    const SELECTION = `
      id, note, commentaire, cree_le, statut, reponse_medecin, reponse_le, rendez_vous_id,
      patients ( utilisateurs ( nom, prenom ) ),
      rendez_vous ( date )
    `;
    const { data, error } = await patient
      .from("avis")
      .select(SELECTION)
      .eq("rendez_vous_id", rdvHonore)
      .eq("patient_id", idPatient)
      .maybeSingle();
    test("Le patient relit son avis avec le nom de l'auteur", !error && !!data?.patients?.utilisateurs?.prenom, error?.message);

    const { data: vuMedecin } = await medecin.from("avis").select(SELECTION).eq("medecin_id", idMedecin);
    test(
      "Le médecin relit ses avis avec auteur et date de consultation",
      (vuMedecin ?? []).length > 0 &&
        !!vuMedecin[0].patients?.utilisateurs?.prenom &&
        !!vuMedecin[0].rendez_vous?.date
    );

    // Les policies se combinent en OR : `sel_avis_publies` rend tout avis
    // publié lisible par un médecin connecté. Le filtre applicatif est donc
    // la seule chose qui empêche d'afficher les avis des confrères.
    const { data: sansFiltre } = await medecin2.from("avis").select("id, medecin_id");
    const { data: avecFiltre } = await medecin2
      .from("avis")
      .select("id")
      .eq("medecin_id", (await medecin2.auth.getUser()).data.user.id);
    test(
      "Le filtre medecin_id est bien nécessaire (policies en OR)",
      (sansFiltre ?? []).length > (avecFiltre ?? []).length,
      `${sansFiltre?.length} sans filtre vs ${avecFiltre?.length} avec`
    );
  }

  // ---------- 5 ter. Signalement d'un avis ----------
  {
    const { error } = await patient2.from("signalements").insert({
      auteur_id: idPatient2,
      cible_type: "avis",
      cible_id: idAvis,
      motif: "Propos injurieux ou haineux",
    });
    test("Un utilisateur connecté signale un avis", !error, error?.message);

    const { error: eAnon } = await anon.from("signalements").insert({
      auteur_id: idPatient2,
      cible_type: "avis",
      cible_id: idAvis,
      motif: "Test anonyme",
    });
    test("Un visiteur anonyme ne peut pas signaler", !!eAnon, eAnon?.code);

    // La file de modération admin doit voir cet avis signalé, alors qu'il est
    // publié (donc invisible d'un filtre `statut = 'en_attente'` seul).
    const { data: ouverts } = await admin
      .from("signalements")
      .select("cible_id")
      .eq("cible_type", "avis")
      .in("statut", ["nouveau", "en_cours"]);
    test(
      "L'avis signalé remonte dans la file de modération",
      (ouverts ?? []).some((s) => s.cible_id === idAvis)
    );

    // Nettoyage : la décision de l'admin clôt le signalement.
    await admin
      .from("signalements")
      .update({ statut: "traite", decision: "conservé" })
      .eq("cible_type", "avis")
      .eq("cible_id", idAvis);
    const { data: apres } = await admin
      .from("signalements")
      .select("cible_id")
      .eq("cible_type", "avis")
      .eq("cible_id", idAvis)
      .in("statut", ["nouveau", "en_cours"]);
    test("La décision de l'admin vide la file", (apres ?? []).length === 0);
  }

  // ---------- 6. Le patient corrige son avis ----------
  {
    const { error } = await patient.from("avis").update({ note: 4 }).eq("id", idAvis);
    test("Le patient modifie sa propre note", !error, error?.message);
    const { ok, detail } = await ficheConforme();
    test("La moyenne suit la correction", ok, detail);
  }
  {
    const { data } = await patient2.from("avis").update({ note: 1 }).eq("id", idAvis).select("id");
    test("Un autre patient ne peut pas modifier cet avis", (data ?? []).length === 0);
  }

  // ---------- 7. Modération admin ----------
  {
    await admin.from("avis").update({ statut: "rejete" }).eq("id", idAvis);
    const { data: pub } = await anon.rpc("avis_publies_medecin", { p_medecin_id: idMedecin });
    test(
      "Un avis masqué disparaît de la fiche publique",
      !(pub ?? []).some((a) => a.id === idAvis)
    );
    const { ok, detail } = await ficheConforme();
    test("Un avis masqué ne compte plus dans la moyenne", ok, detail);

    const { data: vuMedecin } = await medecin.from("avis").select("id").eq("id", idAvis);
    test("Le médecin voit toujours l'avis masqué", (vuMedecin ?? []).length === 1);

    await admin.from("avis").update({ statut: "publie" }).eq("id", idAvis);
  }

  // ---------- 8. Retrait par l'auteur ----------
  {
    // `.select()` pour SAVOIR si la ligne est partie : une suppression qui
    // ne touche rien — refusée par une policy, par exemple — ne rend aucune
    // erreur. Sans cela le test passait au vert et l'avis restait en base.
    const { data: parti, error } = await patient
      .from("avis").delete().eq("id", idAvis).select("id");
    test("Le patient retire son avis", !error && (parti ?? []).length === 1, error?.message);
    if ((parti ?? []).length === 1) idAvis = null;
    const apres = await noteMedecin();
    test(
      "La fiche retrouve son état d'avant l'avis",
      apres.nb === depart.nb && Math.abs(apres.moyenne - depart.moyenne) < 0.011,
      `moyenne=${apres.moyenne} nb=${apres.nb} (départ ${depart.moyenne}/${depart.nb})`
    );
  }
} finally {
  // ---------- Nettoyage ----------
  // Les signalements ne partent pas en cascade : `cible_id` est polymorphe,
  // sans clé étrangère vers `avis`.
  await admin.from("signalements").delete().eq("cible_type", "avis").eq("auteur_id", idPatient2);
  if (idAvis) await admin.from("avis").delete().eq("id", idAvis);
  if (creesRdv.length) await admin.from("rendez_vous").delete().in("id", creesRdv);
}

const echecs = resultats.filter((r) => !r.ok).length;
console.log(`\n${resultats.length - echecs}/${resultats.length} tests réussis.`);
process.exit(echecs === 0 ? 0 : 1);
