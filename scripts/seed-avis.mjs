/*
 * Avis de démonstration.
 *
 * Un avis n'existe qu'adossé à une consultation honorée : ce script crée donc
 * les consultations passées manquantes, puis dépose les avis correspondants.
 * `medecins.note_moyenne` et `nb_avis` se recalculent seuls (trigger
 * `avis_recalcule_note`).
 *
 * Rejouable : les avis et les consultations de démo sont effacés avant
 * réinsertion (repérés par leur motif « Consultation (démo avis) »).
 * Exécution : node scripts/seed-avis.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const lire = (cle) => env.match(new RegExp(`^${cle}=(.*)$`, "m"))?.[1].trim();
const supabase = createClient(lire("NEXT_PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

/** Commentaires de démo, du plus élogieux au plus critique. */
const COMMENTAIRES = [
  { note: 5, texte: "Accueil chaleureux et diagnostic très clair. Je n'ai pas attendu plus de dix minutes." },
  { note: 5, texte: "Médecin à l'écoute, qui prend le temps d'expliquer le traitement. Je recommande vivement." },
  { note: 4, texte: "Bonne consultation, explications précises. Un peu d'attente à l'accueil, sans plus." },
  { note: 5, texte: "Très professionnel. Le suivi par téléphone après la consultation est un vrai plus." },
  { note: 4, texte: "Cabinet propre et bien tenu, praticien compétent. Je reviendrai pour le contrôle." },
  { note: 3, texte: "Consultation correcte mais un peu rapide à mon goût. Les réponses restaient justes." },
  { note: 5, texte: "Excellente prise en charge de ma fille, très rassurant avec les enfants." },
  { note: 2, texte: "Presque une heure d'attente malgré le rendez-vous. La consultation elle-même était bonne." },
];

const REPONSES = {
  2: "Merci pour votre retour. Nous avons revu l'organisation des créneaux du matin pour limiter l'attente — désolé pour ce désagrément.",
  3: "Merci de votre message. N'hésitez pas à me solliciter si une question reste en suspens après la consultation.",
};

// ---------- Médecins validés ----------
const { data: medecins, error: eMed } = await supabase
  .from("medecins")
  .select("id")
  .eq("statut", "valide");
if (eMed) throw new Error(`médecins: ${eMed.message}`);

// ---------- Patients disposant d'un compte ----------
const { data: patients, error: ePat } = await supabase.from("patients").select("id");
if (ePat) throw new Error(`patients: ${ePat.message}`);
if (!patients.length) throw new Error("Aucun patient en base — lancez d'abord scripts/seed.mjs.");

const MOTIF_DEMO = "Consultation (démo avis)";

// ---------- Nettoyage ----------
// Les avis partent en cascade avec leurs rendez-vous de démo ; on efface les
// autres avis à part pour repartir d'une base propre.
await supabase.from("avis").delete().not("id", "is", null);
await supabase.from("rendez_vous").delete().eq("motif", MOTIF_DEMO);

const jourPasse = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

let deposes = 0;
let iCommentaire = 0;
let iPatient = 0;
let decalage = 5;

for (const [iMedecin, medecin] of medecins.entries()) {
  // Nombre d'avis variable d'un médecin à l'autre : une fiche à 5 avis et une
  // fiche à 1 avis rendent le tri « Mieux notés » et la répartition lisibles.
  const nbAvis = 1 + ((iMedecin * 2) % 5);

  for (let i = 0; i < nbAvis; i++) {
    const modele = COMMENTAIRES[iCommentaire % COMMENTAIRES.length];
    iCommentaire++;
    // Un patient différent par avis : la contrainte est une note par
    // consultation, mais des auteurs variés sont plus réalistes.
    const patient = patients[iPatient++ % patients.length];
    decalage += 3;

    // La consultation qui porte l'avis. `heure` unique par médecin et par jour
    // (index anti-double-booking sur medecin_id + date + heure).
    const { data: rdv, error: eRdv } = await supabase
      .from("rendez_vous")
      .insert({
        medecin_id: medecin.id,
        date: jourPasse(decalage),
        heure: `${String(8 + (i % 10)).padStart(2, "0")}:00`,
        reserve_par: patient.id,
        reserve_par_role: "patient",
        patient_id: patient.id,
        motif: MOTIF_DEMO,
        statut: "honore",
        source: "en_ligne",
      })
      .select("id")
      .single();
    if (eRdv) {
      console.warn(`  ⚠ RDV ${medecin.id.slice(0, 8)}: ${eRdv.message}`);
      continue;
    }

    const reponse = REPONSES[modele.note] ?? null;
    const { error } = await supabase.from("avis").insert({
      patient_id: patient.id,
      medecin_id: medecin.id,
      rendez_vous_id: rdv.id,
      note: modele.note,
      commentaire: modele.texte,
      statut: "publie",
      reponse_medecin: reponse,
      reponse_le: reponse ? new Date().toISOString() : null,
    });
    if (error) {
      console.warn(`  ⚠ avis ${medecin.id.slice(0, 8)}: ${error.message}`);
      continue;
    }
    deposes++;
  }
}

const { data: notes } = await supabase
  .from("medecins")
  .select("id, note_moyenne, nb_avis")
  .gt("nb_avis", 0)
  .order("note_moyenne", { ascending: false });

console.log(`✅ ${deposes} avis de démonstration déposés.`);
for (const m of notes ?? []) {
  console.log(`   ${m.id.slice(0, 8)}… → ${m.note_moyenne} ★ (${m.nb_avis} avis)`);
}
