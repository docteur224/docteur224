/*
 * Seed de données de test — Étape 3 de la mission Supabase.
 * Exécution : node scripts/seed.mjs  (utilise la clé service_role, qui bypasse RLS)
 * Données 100 % fictives, téléphones factices au format +224.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const lire = (cle) => env.match(new RegExp(`^${cle}=(.*)$`, "m"))?.[1].trim();

const supabase = createClient(lire("NEXT_PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const MDP_TEST = "test1234";

async function creerCompte(email, motDePasse, profil) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: motDePasse,
    email_confirm: true,
  });
  let id = data?.user?.id;
  if (error) {
    if (!error.message.includes("already been registered")) throw new Error(`${email}: ${error.message}`);
    const { data: liste } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    id = liste.users.find((u) => u.email === email)?.id;
  }
  const { error: e2 } = await supabase.from("utilisateurs").upsert({ id, email, ...profil });
  if (e2) throw new Error(`utilisateurs ${email}: ${e2.message}`);
  return id;
}

async function inserer(table, lignes, conflit) {
  const { data, error } = await supabase.from(table).upsert(lignes, conflit ? { onConflict: conflit } : undefined).select();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
}

// ---------- Référentiels ----------
const specialites = await inserer("specialites", [
  { nom: "Médecine générale", emoji: "🩺" },
  { nom: "Cardiologie", emoji: "❤️" },
  { nom: "Pédiatrie", emoji: "👶" },
  { nom: "Gynécologie", emoji: "🌸" },
  { nom: "Dermatologie", emoji: "🧴" },
  { nom: "Ophtalmologie", emoji: "👁️" },
  { nom: "Dentaire", emoji: "🦷" },
  { nom: "ORL", emoji: "👂" },
], "nom");
const spec = Object.fromEntries(specialites.map((s) => [s.nom, s.id]));

const villes = await inserer("villes", [
  { nom: "Conakry" }, { nom: "Kindia" }, { nom: "Labé" }, { nom: "Kankan" }, { nom: "Nzérékoré" },
], "nom");
const ville = Object.fromEntries(villes.map((v) => [v.nom, v.id]));

const assurances = await inserer("assurances", [
  { libelle: "NSIA Assurances" }, { libelle: "SUNU Assurances" }, { libelle: "Activa Guinée" },
  { libelle: "UGAR" }, { libelle: "Saham Assurance" },
], "libelle");

// ---------- Tarifs plateforme ----------
await inserer("tarifs_plateforme", [
  { formule: "standard", prix_mensuel: 250000, prix_annuel: 2500000, quota_sms: 100, essai_jours: 30 },
  { formule: "premium", prix_mensuel: 450000, prix_annuel: 4500000, quota_sms: 500, essai_jours: 30 },
  { formule: "cabinet", prix_mensuel: 800000, prix_annuel: 8000000, quota_sms: 1000, essai_jours: 15 },
  { formule: "clinique", prix_mensuel: 2000000, prix_annuel: 20000000, quota_sms: 5000, essai_jours: 15 },
  { formule: "hopital", prix_mensuel: 4000000, prix_annuel: 40000000, quota_sms: 15000, essai_jours: 15 },
], "formule");

// ---------- Admin ----------
const adminId = await creerCompte("admin@docteur224.com", "alpha2308", {
  role: "admin", nom: "Administrateur", prenom: "Docteur224", telephone: "+224620000001",
  sous_roles_admin: ["finance", "support", "moderation"],
});

// ---------- Gestionnaires d'établissements ----------
const etabsDef = [
  { email: "etab.hopital-donka@test.docteur224.com", nom: "Hôpital National Donka", type: "Hôpital public", villeId: ville["Conakry"], quartier: "Dixinn" },
  { email: "etab.clinique-ambroise@test.docteur224.com", nom: "Clinique Ambroise Paré", type: "Clinique privée", villeId: ville["Conakry"], quartier: "Kaloum" },
  { email: "etab.centre-kindia@test.docteur224.com", nom: "Centre Médical de Kindia", type: "Centre de santé", villeId: ville["Kindia"], quartier: "Centre-ville" },
];
const etabIds = [];
for (const [i, e] of etabsDef.entries()) {
  const gid = await creerCompte(e.email, MDP_TEST, {
    role: "etablissement", nom: e.nom, prenom: "Gestion", telephone: `+22462100000${i + 1}`,
  });
  const [row] = await inserer("etablissements", [{
    gestionnaire_id: gid, nom: e.nom, type: e.type, ville_id: e.villeId, quartier: e.quartier,
    description: `${e.nom} — établissement de santé (données de test).`,
    telephone: `+22462200000${i + 1}`, email: e.email, statut: "valide",
    services: ["Consultations", "Urgences", "Laboratoire"],
    horaires: { "lun-ven": "08:00-18:00", sam: "09:00-13:00" },
  }]);
  etabIds.push(row.id);
}

// ---------- Médecins (8) — les 6 premiers rattachés 2 par établissement ----------
const medecinsDef = [
  { prenom: "Mamadou", nom: "Diallo", specialite: "Médecine générale", villeNom: "Conakry", tarif: 150000, etab: 0 },
  { prenom: "Aissatou", nom: "Barry", specialite: "Cardiologie", villeNom: "Conakry", tarif: 350000, etab: 0 },
  { prenom: "Ibrahima", nom: "Sow", specialite: "Pédiatrie", villeNom: "Conakry", tarif: 200000, etab: 1 },
  { prenom: "Fatoumata", nom: "Camara", specialite: "Gynécologie", villeNom: "Conakry", tarif: 250000, etab: 1 },
  { prenom: "Ousmane", nom: "Baldé", specialite: "Dermatologie", villeNom: "Kindia", tarif: 180000, etab: 2 },
  { prenom: "Mariama", nom: "Touré", specialite: "Ophtalmologie", villeNom: "Kindia", tarif: 220000, etab: 2 },
  { prenom: "Sékou", nom: "Kourouma", specialite: "Dentaire", villeNom: "Kankan", tarif: 160000, etab: null },
  { prenom: "Kadiatou", nom: "Sylla", specialite: "ORL", villeNom: "Labé", tarif: 190000, etab: null },
];
const medecinIds = [];
for (const [i, m] of medecinsDef.entries()) {
  const email = `medecin${i + 1}@test.docteur224.com`;
  const id = await creerCompte(email, MDP_TEST, {
    role: "medecin", nom: m.nom, prenom: m.prenom, telephone: `+2246230000${String(i + 1).padStart(2, "0")}`,
  });
  await inserer("medecins", [{
    id, civilite: i === 1 ? "Pr" : "Dr", specialite_id: spec[m.specialite],
    etablissement_id: m.etab === null ? null : etabIds[m.etab],
    ville_id: ville[m.villeNom], quartier: "Centre", tarif_consultation: m.tarif,
    presentation: `${i === 1 ? "Pr" : "Dr"} ${m.prenom} ${m.nom}, spécialiste en ${m.specialite.toLowerCase()} (profil de test).`,
    soins_et_actes: ["Consultation", "Suivi", "Dépistage"],
    diplomes: [{ titre: `Doctorat en médecine — ${m.specialite}`, lieu: "Université de Conakry" }],
    parcours: [{ lieu: "CHU de Conakry", duree: "5 ans" }],
    langues: ["Français", "Soussou", "Peul"],
    annees_experience: 5 + i, telephone_secretariat: `+2246240000${String(i + 1).padStart(2, "0")}`,
    statut: i === 7 ? "en_attente" : "valide", // le 8e reste à valider (test admin)
  }]);
  medecinIds.push(id);
  // Assurances acceptées (2 par médecin)
  await inserer("medecin_assurances", [
    { medecin_id: id, assurance_id: assurances[i % assurances.length].id },
    { medecin_id: id, assurance_id: assurances[(i + 1) % assurances.length].id },
  ]);
  // Horaires-types : lun-ven 08:00-13:00 et 14:00-18:00
  const horaires = [];
  for (const jour of [1, 2, 3, 4, 5]) {
    horaires.push({ medecin_id: id, jour_semaine: jour, heure_debut: "08:00", heure_fin: "13:00" });
    horaires.push({ medecin_id: id, jour_semaine: jour, heure_debut: "14:00", heure_fin: "18:00" });
  }
  await inserer("horaires_types", horaires);
}

// Une exception de créneau par médecin validé : fermeture demain 09:00
const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
await inserer("creneaux_exceptions",
  medecinIds.slice(0, 7).map((id) => ({ medecin_id: id, date: demain, heure: "09:00", etat: "ferme" })),
  "medecin_id,date,heure");

// ---------- Document de validation pour le médecin en attente ----------
await inserer("documents_validation", [{
  professionnel_id: medecinIds[7], type: "diplome",
  fichier_path: "validation/medecin8/diplome.pdf", statut: "en_attente",
}]);

// ---------- Patients (5, le 1er avec un proche) ----------
const patientsDef = [
  { prenom: "Alpha", nom: "Condé", genre: "M", naissance: "1990-03-14" },
  { prenom: "Hawa", nom: "Bangoura", genre: "F", naissance: "1985-07-22" },
  { prenom: "Moussa", nom: "Keita", genre: "M", naissance: "1978-11-02" },
  { prenom: "Salématou", nom: "Cissé", genre: "F", naissance: "1995-01-30" },
  { prenom: "Lansana", nom: "Fofana", genre: "M", naissance: "2000-06-18" },
];
const patientIds = [];
for (const [i, p] of patientsDef.entries()) {
  const id = await creerCompte(`patient${i + 1}@test.docteur224.com`, MDP_TEST, {
    role: "patient", nom: p.nom, prenom: p.prenom, telephone: `+2246250000${String(i + 1).padStart(2, "0")}`,
  });
  await inserer("patients", [{ id, date_naissance: p.naissance, genre: p.genre, ville_id: ville["Conakry"], quartier: "Ratoma" }]);
  patientIds.push(id);
}
const [proche] = await inserer("proches", [{
  patient_id: patientIds[0], nom: "Condé", prenom: "Aminata", lien: "Ma fille",
  date_naissance: "2018-09-05", genre: "F",
}]);

// ---------- Assistants (2, permissions partielles pour tester le cloisonnement) ----------
const assistant1 = await creerCompte("assistant1@test.docteur224.com", MDP_TEST, {
  role: "assistant", nom: "Soumah", prenom: "Bintou", telephone: "+224626000001",
});
await inserer("assistants", [{
  id: assistant1, medecin_id: medecinIds[0],
  peut_voir_agenda: true, peut_creer_rdv: true,
  peut_confirmer_annuler: false, peut_reprogrammer: false, peut_messagerie: false, peut_gerer_creneaux: false,
}]);
const assistant2 = await creerCompte("assistant2@test.docteur224.com", MDP_TEST, {
  role: "assistant", nom: "Yattara", prenom: "Sékouba", telephone: "+224626000002",
});
await inserer("assistants", [{
  id: assistant2, medecin_id: medecinIds[1],
  peut_voir_agenda: true, peut_confirmer_annuler: true, peut_gerer_creneaux: true,
  peut_reprogrammer: false, peut_creer_rdv: false, peut_messagerie: false,
}]);

// ---------- Rendez-vous à différents statuts ----------
const dans = (j) => new Date(Date.now() + j * 86400000).toISOString().slice(0, 10);
await inserer("rendez_vous", [
  { medecin_id: medecinIds[0], etablissement_id: etabIds[0], date: dans(2), heure: "10:00", reserve_par: patientIds[0], reserve_par_role: "patient", patient_id: patientIds[0], motif: "Consultation générale", statut: "en_attente", source: "en_ligne" },
  { medecin_id: medecinIds[0], etablissement_id: etabIds[0], date: dans(3), heure: "11:00", reserve_par: patientIds[0], reserve_par_role: "patient", proche_id: proche.id, motif: "Vaccination", statut: "confirme", source: "en_ligne" },
  { medecin_id: medecinIds[1], etablissement_id: etabIds[0], date: dans(1), heure: "09:30", reserve_par: patientIds[1], reserve_par_role: "patient", patient_id: patientIds[1], motif: "Douleurs thoraciques", statut: "confirme", source: "en_ligne" },
  { medecin_id: medecinIds[2], etablissement_id: etabIds[1], date: dans(-7), heure: "15:00", reserve_par: patientIds[2], reserve_par_role: "patient", patient_id: patientIds[2], motif: "Suivi pédiatrique", statut: "honore", source: "en_ligne" },
  { medecin_id: medecinIds[3], etablissement_id: etabIds[1], date: dans(4), heure: "16:30", reserve_par: patientIds[3], reserve_par_role: "patient", patient_id: patientIds[3], motif: "Consultation gynécologique", statut: "annule", source: "en_ligne" },
  { medecin_id: medecinIds[0], etablissement_id: etabIds[0], date: dans(5), heure: "08:30", reserve_par: assistant1, reserve_par_role: "assistant", patient_id: patientIds[4], motif: "RDV pris par téléphone", statut: "confirme", source: "telephone" },
]);

// ---------- Abonnements ----------
await inserer("abonnements", [
  { titulaire_id: medecinIds[0], type_titulaire: "medecin", formule: "premium", periode: "annuel", statut: "actif", date_fin: dans(300), quota_sms: 500 },
  { titulaire_id: medecinIds[6], type_titulaire: "medecin", formule: "standard", periode: "mensuel", statut: "essai", date_fin: dans(30), quota_sms: 100 },
]);

// ---------- Un avis publié + un en attente de modération ----------
await inserer("avis", [
  { patient_id: patientIds[2], medecin_id: medecinIds[2], note: 5, commentaire: "Très bon accueil, médecin à l'écoute.", statut: "publie" },
  { patient_id: patientIds[1], medecin_id: medecinIds[1], note: 4, commentaire: "Bonne consultation.", statut: "en_attente" },
]);

console.log("✅ Seed terminé.");
console.log("Comptes créés (mot de passe test1234 sauf admin) :");
console.log("  admin@docteur224.com / alpha2308");
for (let i = 1; i <= 8; i++) console.log(`  medecin${i}@test.docteur224.com`);
for (let i = 1; i <= 5; i++) console.log(`  patient${i}@test.docteur224.com`);
console.log("  assistant1@test.docteur224.com, assistant2@test.docteur224.com");
console.log("  etab.hopital-donka@ / etab.clinique-ambroise@ / etab.centre-kindia@test.docteur224.com");
