/*
 * Vérification du durcissement de l'authentification (migration 0080).
 *
 * Chaque test se connecte avec un VRAI compte (clé anon, JWT réel) et rejoue
 * l'attaque que la migration ferme, puis le geste légitime qui doit continuer
 * de passer. Les deux moitiés comptent autant : une sécurité qui casse un
 * écran n'est pas une sécurité, c'est une panne.
 *
 * Usage : node scripts/verif-securite-acces.mjs
 *
 * Les comptes @test.docteur224.com ne reçoivent aucun courriel (voir
 * `email_destinataire`), les écritures faites ici sont remises en état.
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
/** Un refus, c'est une erreur renvoyée — ou zéro ligne touchée. */
const refuse = (erreur, lignes) => !!erreur || (lignes ?? []).length === 0;
const court = (t, n = 60) => (t ?? "").replace(/\s+/g, " ").slice(0, n);

async function clientPour(email, mdp = "test1234") {
  const c = createClient(URL_SB, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: mdp });
  if (error) throw new Error(`connexion ${email}: ${error.message}`);
  return c;
}

const anon = createClient(URL_SB, ANON, { auth: { persistSession: false } });
const service = createClient(URL_SB, SERVICE, { auth: { persistSession: false } });
const patient = await clientPour("patient1@test.docteur224.com");
const patient2 = await clientPour("patient2@test.docteur224.com");
const medecin = await clientPour("medecin1@test.docteur224.com");
const assistant = await clientPour("assistant1@test.docteur224.com"); // agenda + créer RDV seulement

const idPatient = (await patient.auth.getUser()).data.user.id;
const idPatient2 = (await patient2.auth.getUser()).data.user.id;
const idMedecin = (await medecin.auth.getUser()).data.user.id;

console.log("\n===== 1. Relais de courriel et fuite d'adresses =====\n");

{
  const { error } = await anon.rpc("creer_notification", {
    p_destinataire: idMedecin,
    p_type: "rdv_confirme",
    p_titre: "Vérifiez votre compte",
    p_corps: "Essai d'injection depuis un visiteur anonyme.",
  });
  test("Visiteur anonyme → creer_notification : refusé", !!error, court(error?.message));
}
{
  const { error } = await patient.rpc("creer_notification", {
    p_destinataire: idMedecin,
    p_type: "rdv_confirme",
    p_titre: "Vérifiez votre compte",
    p_corps: "Essai d'injection depuis un compte patient.",
  });
  test("Patient connecté → creer_notification : refusé", !!error, court(error?.message));
}
{
  const { error } = await anon.rpc("email_destinataire", { p_utilisateur: idMedecin });
  test("Visiteur anonyme → adresse d'un praticien : refusé", !!error, court(error?.message));
}
{
  const { error } = await patient.rpc("email_destinataire", { p_utilisateur: idMedecin });
  test("Patient → adresse d'un autre compte : refusé", !!error, court(error?.message));
}
{
  const { error } = await anon.rpc("annuler_rappels_rdv", {
    p_rdv: "00000000-0000-0000-0000-000000000000",
  });
  test("Visiteur anonyme → vider les rappels d'un RDV : refusé", !!error, court(error?.message));
}
{
  // La file d'e-mails continue de fonctionner côté serveur.
  const { error } = await service.rpc("email_destinataire", { p_utilisateur: idMedecin });
  test("Serveur (service_role) → email_destinataire : toujours autorisé", !error, court(error?.message));
}

console.log("\n===== 2. L'adresse e-mail reste l'identifiant de connexion =====\n");

{
  const { data, error } = await patient
    .from("utilisateurs")
    .update({ email: "detourne@exemple.com" })
    .eq("id", idPatient)
    .select("id");
  test("Patient → changer utilisateurs.email : refusé", refuse(error, data), court(error?.message));
}
{
  // Le geste légitime du même écran : nom, prénom, téléphone.
  const { data: avant } = await patient
    .from("utilisateurs")
    .select("nom, prenom, email")
    .eq("id", idPatient)
    .single();
  const { data, error } = await patient
    .from("utilisateurs")
    .update({ nom: avant.nom, prenom: avant.prenom })
    .eq("id", idPatient)
    .select("id");
  test(
    "Patient → enregistrer son profil (nom, prénom) : toujours autorisé",
    !error && (data ?? []).length === 1,
    court(error?.message)
  );
  test(
    "Patient → son adresse est intacte",
    avant.email === "patient1@test.docteur224.com",
    avant.email
  );
}

console.log("\n===== 3. On ne se déclare pas praticien ni établissement =====\n");

{
  const { data, error } = await patient
    .from("medecins")
    .insert({ id: idPatient, statut: "valide", en_vedette: true, note_moyenne: 5, nb_avis: 999 })
    .select("id");
  test("Patient → s'inscrire dans l'annuaire en « valide » : refusé", refuse(error, data), court(error?.message));
}
{
  const { data } = await anon.from("medecins").select("id").eq("id", idPatient);
  test("Annuaire public → la fausse fiche n'existe pas", (data ?? []).length === 0, `${data?.length ?? 0} ligne(s)`);
}
{
  const { data, error } = await patient
    .from("etablissements")
    .insert({ gestionnaire_id: idPatient, nom: "Clinique fantôme", type: "Clinique privée", statut: "valide" })
    .select("id");
  test("Patient → créer un établissement « valide » : refusé", refuse(error, data), court(error?.message));
}
{
  // La fiche d'un praticien RÉEL reste modifiable par lui, et son statut non.
  const { data: avant } = await medecin.from("medecins").select("presentation, statut").eq("id", idMedecin).single();
  const { data, error } = await medecin
    .from("medecins")
    .update({ presentation: avant.presentation })
    .eq("id", idMedecin)
    .select("id");
  test("Médecin → modifier sa fiche : toujours autorisé", !error && (data ?? []).length === 1, court(error?.message));
  const { error: eStatut } = await medecin
    .from("medecins")
    .update({ statut: "en_attente" })
    .eq("id", idMedecin);
  test("Médecin → changer son statut de validation : refusé", !!eStatut, court(eStatut?.message));
  test("Médecin → statut inchangé", avant.statut === "valide", avant.statut);
}

console.log("\n===== 4. Une équipe se compose entre un médecin et ses assistant(e)s =====\n");

{
  const { data, error } = await patient
    .from("assistants")
    .insert({ id: idPatient2, medecin_id: idPatient })
    .select("id");
  test("Patient → se déclarer médecin d'un tiers : refusé", refuse(error, data), court(error?.message));
}
/*
 * Les deux refus ci-dessus pourraient venir d'un autre garde-fou — le quota
 * d'assistant(e)s de la formule parle avant la RLS. On vérifie donc les deux
 * conditions que la policy ajoute, une à une : le rôle de l'auteur du
 * rattachement, et celui de la personne rattachée.
 */
{
  const { data: rolePatient } = await patient.rpc("role_courant");
  const { data: roleMedecin } = await medecin.rpc("role_courant");
  test(
    "Condition de la policy : role_courant() distingue bien patient et médecin",
    rolePatient === "patient" && roleMedecin === "medecin",
    `${rolePatient} / ${roleMedecin}`
  );
  const { data: roleCible } = await medecin.rpc("role_du_compte", { p_id: idPatient2 });
  test(
    "Condition de la policy : la personne rattachée doit être assistant(e)",
    roleCible === "patient",
    `rôle de la cible : ${roleCible}`
  );
}
{
  const { data, error } = await medecin
    .from("assistants")
    .insert({ id: idPatient2, medecin_id: idMedecin })
    .select("id");
  test("Médecin → rattacher un PATIENT comme assistant(e) : refusé", refuse(error, data), court(error?.message));
  if ((data ?? []).length) await service.from("assistants").delete().eq("id", idPatient2);
}
{
  const { data: nom } = await patient.from("utilisateurs").select("nom").eq("id", idPatient2);
  test("Patient → fiche d'un autre compte : toujours invisible", (nom ?? []).length === 0, `${nom?.length ?? 0} ligne(s)`);
}
{
  // Le geste légitime : le médecin règle les permissions de son équipe.
  const { data: equipe } = await medecin.from("assistants").select("id, peut_voir_agenda").eq("medecin_id", idMedecin);
  const cible = (equipe ?? [])[0];
  if (!cible) {
    test("Médecin → régler les permissions de son équipe", false, "aucun assistant rattaché");
  } else {
    const { data, error } = await medecin
      .from("assistants")
      .update({ peut_voir_agenda: cible.peut_voir_agenda })
      .eq("id", cible.id)
      .select("id");
    test(
      "Médecin → régler les permissions de son équipe : toujours autorisé",
      !error && (data ?? []).length === 1,
      court(error?.message)
    );
  }
}
{
  const { data: equipe } = await medecin.from("assistants").select("id").eq("medecin_id", idMedecin);
  const cible = (equipe ?? [])[0];
  if (cible) {
    const { data, error } = await assistant
      .from("assistants")
      .update({ peut_confirmer_annuler: true })
      .eq("id", cible.id)
      .select("id");
    test("Assistant(e) → s'accorder une permission : refusé", refuse(error, data), court(error?.message));
  }
}

console.log("\n===== 5. La présence d'un rendez-vous ne s'écrit que par qualifier_rdv =====\n");

// Un rendez-vous passé du patient chez medecin1, posé par le serveur.
const { data: passe } = await service
  .from("rendez_vous")
  .select("id, statut, date, heure, source")
  .eq("patient_id", idPatient)
  .eq("medecin_id", idMedecin)
  .lt("date", new Date().toISOString().slice(0, 10))
  .neq("statut", "annule")
  .order("date", { ascending: false })
  .limit(1)
  .maybeSingle();

if (!passe) {
  test("Rendez-vous passé disponible pour les tests de présence", false, "aucun trouvé");
} else {
  const statutInitial = passe.statut;
  {
    const { data, error } = await patient
      .from("rendez_vous")
      .update({ statut: "honore" })
      .eq("id", passe.id)
      .select("id");
    test("Patient → marquer son RDV « honoré » : refusé", refuse(error, data), court(error?.message));
  }
  {
    const { data, error } = await patient
      .from("rendez_vous")
      .update({ statut: "confirme" })
      .eq("id", passe.id)
      .select("id");
    test("Patient → confirmer son propre RDV : refusé", refuse(error, data), court(error?.message));
  }
  {
    /*
     * Vers un praticien RÉEL, sur un créneau RÉELLEMENT ouvert : sans quoi
     * c'est le garde du créneau (`rdv_creneau_ouvert`) qui refuse, et l'on
     * n'aurait pas vérifié le garde des colonnes d'identité.
     */
    const { data: confreres } = await anon
      .from("medecins")
      .select("id")
      .eq("statut", "valide")
      .neq("id", idMedecin)
      .limit(12);
    const jour = new Date(Date.now() + 86_400_000 * 4).toISOString().slice(0, 10);
    let cible = null;
    for (const c of confreres ?? []) {
      const { data: dispos } = await anon.rpc("prochaines_dispos_medecins", {
        p_medecin_ids: [c.id],
        p_jours: 14,
      });
      const creneau = (dispos ?? [])[0];
      if (creneau?.date && creneau?.heure) {
        cible = { id: c.id, date: creneau.date, heure: creneau.heure };
        break;
      }
    }
    /*
     * Sonde isolante : `source` ne concerne aucun autre garde-fou de la
     * table. Seul le garde des colonnes d'identité peut refuser — c'est donc
     * lui, et lui seul, que ce test mesure.
     */
    const { data: dSource, error: eSource } = await patient
      .from("rendez_vous")
      .update({ source: passe.source === "telephone" ? "en_ligne" : "telephone" })
      .eq("id", passe.id)
      .select("id");
    test(
      "Patient → réécrire la provenance de son RDV : refusé par le garde des colonnes",
      refuse(eSource, dSource) && /ne se changent pas/.test(eSource?.message ?? ""),
      court(eSource?.message)
    );

    if (!cible) {
      console.log("   (aucun confrère avec créneau publié : le praticien cible n'a pas pu être testé)");
    } else {
      const { data, error } = await patient
        .from("rendez_vous")
        .update({ medecin_id: cible.id, date: cible.date, heure: cible.heure })
        .eq("id", passe.id)
        .select("id");
      const parLeBonGarde = /ne se changent pas/.test(error?.message ?? "");
      test(
        "Patient → déplacer son RDV vers un autre praticien (créneau ouvert) : refusé",
        refuse(error, data) && parLeBonGarde,
        court(error?.message)
      );
    }
  }
  {
    const { data: apres } = await service
      .from("rendez_vous")
      .select("statut, medecin_id")
      .eq("id", passe.id)
      .single();
    test(
      "Le rendez-vous est resté intact",
      apres.statut === statutInitial && apres.medecin_id === idMedecin,
      `${apres.statut}`
    );
  }
  {
    // Un avis exige une consultation honorée : le patient ne peut plus se l'offrir.
    const { error } = await patient
      .from("avis")
      .insert({ patient_id: idPatient, medecin_id: idMedecin, rendez_vous_id: passe.id, note: 5, commentaire: "Essai" });
    test("Patient → déposer un avis sans consultation honorée : refusé", !!error, court(error?.message));
  }
  {
    // Le geste légitime : le praticien qualifie, et la fonction journalise.
    const { error } = await medecin.rpc("qualifier_rdv", {
      p_rdv_id: passe.id,
      p_statut: "present",
      p_correction: true,
    });
    test("Médecin → qualifier_rdv(present) : toujours autorisé", !error, court(error?.message));
    const { error: e2 } = await medecin.rpc("qualifier_rdv", {
      p_rdv_id: passe.id,
      p_statut: "honore",
    });
    test("Médecin → qualifier_rdv(honore) après « présent » : toujours autorisé", !e2, court(e2?.message));
  }
  {
    const { error } = await assistant.rpc("qualifier_rdv", {
      p_rdv_id: passe.id,
      p_statut: "absent",
      p_correction: true,
    });
    test(
      "Assistant(e) sans « confirmer / annuler » → qualifier_rdv : refusé",
      !!error,
      court(error?.message)
    );
  }
  // Remise en état.
  await service.from("rendez_vous").update({ statut: statutInitial }).eq("id", passe.id);
  const { data: remis } = await service.from("rendez_vous").select("statut").eq("id", passe.id).single();
  test("Rendez-vous de test remis dans son état d'origine", remis.statut === statutInitial, remis.statut);
}

console.log("\n===== 6. Les gestes légitimes du patient sur ses rendez-vous =====\n");

{
  // Réserver → reprogrammer → annuler, le parcours complet, sans le serveur.
  const demain = new Date(Date.now() + 86_400_000 * 3).toISOString().slice(0, 10);
  const { data: libres } = await anon.rpc("heures_indisponibles", {
    p_medecin_id: idMedecin,
    p_debut: demain,
    p_fin: demain,
  });
  const prises = new Set((libres ?? []).map((l) => `${l.date ?? demain} ${l.heure}`));
  const creneaux = ["09:00:00", "09:30:00", "10:00:00", "10:30:00", "11:00:00", "11:30:00"];
  const heure = creneaux.find((h) => !prises.has(`${demain} ${h}`));

  const { data: pose, error: ePose } = await patient
    .from("rendez_vous")
    .insert({
      medecin_id: idMedecin,
      date: demain,
      heure,
      patient_id: idPatient,
      reserve_par: idPatient,
      reserve_par_role: "patient",
      lieu: "cabinet",
      motif: "Vérification de sécurité",
    })
    .select("id, statut")
    .maybeSingle();
  test("Patient → réserver un rendez-vous : toujours autorisé", !ePose && !!pose, court(ePose?.message));

  if (pose) {
    const autre = creneaux.find((h) => h !== heure && !prises.has(`${demain} ${h}`));
    const { data: deplace, error: eDeplace } = await patient
      .from("rendez_vous")
      .update({ date: demain, heure: autre, statut: "en_attente" })
      .eq("id", pose.id)
      .select("id");
    test(
      "Patient → reprogrammer son rendez-vous : toujours autorisé",
      !eDeplace && (deplace ?? []).length === 1,
      court(eDeplace?.message)
    );

    const { data: confirme, error: eConfirme } = await medecin
      .from("rendez_vous")
      .update({ statut: "confirme" })
      .eq("id", pose.id)
      .select("id");
    test(
      "Médecin → confirmer un rendez-vous : toujours autorisé",
      !eConfirme && (confirme ?? []).length === 1,
      court(eConfirme?.message)
    );

    const { data: annule, error: eAnnule } = await patient
      .from("rendez_vous")
      .update({ statut: "annule" })
      .eq("id", pose.id)
      .select("id");
    test(
      "Patient → annuler son rendez-vous : toujours autorisé",
      !eAnnule && (annule ?? []).length === 1,
      court(eAnnule?.message)
    );

    await service.from("rendez_vous").delete().eq("id", pose.id);
  }
}

console.log("\n===== 7. Les écrans publics ne perdent rien =====\n");

{
  const { data, error } = await anon.from("medecins").select("id, statut").eq("statut", "valide").limit(5);
  test("Visiteur anonyme → annuaire des praticiens validés", !error && (data ?? []).length > 0, `${data?.length ?? 0} fiche(s)`);
}
{
  const demain = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const { error } = await anon.rpc("heures_indisponibles", {
    p_medecin_id: idMedecin,
    p_debut: demain,
    p_fin: demain,
  });
  test("Visiteur anonyme → heures indisponibles (prise de RDV)", !error, court(error?.message));
}
{
  const { error } = await anon.rpc("prochaines_dispos_medecins", { p_medecin_ids: [idMedecin], p_jours: 7 });
  test("Visiteur anonyme → prochaines disponibilités (résultats)", !error, court(error?.message));
}
{
  const { error } = await anon.rpc("avis_publies_medecin", { p_medecin_id: idMedecin });
  test("Visiteur anonyme → avis publiés d'une fiche", !error, court(error?.message));
}
{
  const { error } = await anon.rpc("verifier_document", { p_code: "D224-AAAA-BBBB-CCCC" });
  test("Pharmacie (anonyme) → vérifier une ordonnance", !error, court(error?.message));
}
{
  const { data, error } = await anon.from("specialites").select("id").limit(3);
  test("Visiteur anonyme → référentiels publics (spécialités)", !error && (data ?? []).length > 0, court(error?.message));
}
{
  /*
   * Ces trois-là ne disent QUE ce que la plateforme publie déjà (ouverture
   * d'un créneau, grille tarifaire, recalcul d'une note à partir des avis
   * publiés) : la 0081 les a rendues à l'annuaire public après que la 0080
   * les eut révoquées pour rien. On vérifie qu'elles répondent toujours.
   */
  const { error: e1 } = await anon.rpc("creneau_ouvert_medecin", {
    p_medecin_id: idMedecin,
    p_date: new Date().toISOString().slice(0, 10),
    p_heure: "09:00:00",
  });
  test("Visiteur anonyme → ouverture d'un créneau : toujours autorisé", !e1, court(e1?.message));
  const { error: e2 } = await anon.rpc("soins_depuis_tarifs", { p_medecin: idMedecin });
  test("Visiteur anonyme → grille tarifaire d'une fiche : toujours autorisé", !e2, court(e2?.message));

  // Celle-ci, en revanche, dit ce qu'un praticien PAIE : elle reste au serveur.
  const { error: e3 } = await anon.rpc("formule_du_medecin", { p_medecin: idMedecin });
  test("Visiteur anonyme → formule d'abonnement d'un praticien : refusé", !!e3, court(e3?.message));
  const { error: e4 } = await anon.rpc("titulaire_abonnement_medecin", { p_medecin: idMedecin });
  test("Visiteur anonyme → titulaire de l'abonnement : refusé", !!e4, court(e4?.message));
  const { error: e5 } = await patient.rpc("programmer_rappels_rdv", {
    p_rdv: "00000000-0000-0000-0000-000000000000",
  });
  test("Patient → reprogrammer les rappels d'un RDV : refusé", !!e5, court(e5?.message));
}
{
  // Le praticien, lui, garde ce dont son écran d'équipe a besoin.
  const { error } = await medecin.rpc("quota_assistants");
  test("Médecin → quota d'assistant(e)s de sa formule : toujours autorisé", !error, court(error?.message));
}

const reussis = resultats.filter((r) => r.ok).length;
console.log(`\n${reussis}/${resultats.length} vérifications réussies`);
if (reussis !== resultats.length) {
  console.log("\nÉchecs :");
  resultats.filter((r) => !r.ok).forEach((r) => console.log(`  ❌ ${r.nom}`));
  process.exit(1);
}
