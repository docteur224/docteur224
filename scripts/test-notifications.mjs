/**
 * Tests de la migration 0013 (notifications).
 *
 * Vérifie que les triggers écrivent les bonnes lignes aux bons destinataires,
 * et surtout que la RLS tient : personne ne lit les notifications d'autrui,
 * personne n'en fabrique, et une notification ne peut qu'être marquée lue.
 *
 * Chaque scénario nettoie ce qu'il a créé.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const URL_SB = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(URL_SB, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let ok = 0;
let ko = 0;
const verifier = (nom, condition, detail = "") => {
  if (condition) {
    ok++;
    console.log(`  ✓ ${nom}`);
  } else {
    ko++;
    console.log(`  ✗ ${nom}${detail ? " — " + detail : ""}`);
  }
};

async function connecter(email, motDePasse) {
  const c = createClient(URL_SB, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await c.auth.signInWithPassword({ email, password: motDePasse });
  if (error) throw new Error(`connexion ${email} : ${error.message}`);
  return { client: c, id: data.user.id };
}

const idPar = async (email) =>
  (await admin.from("utilisateurs").select("id").eq("email", email).single()).data.id;

const notifsDe = async (destinataire, type) => {
  let q = admin
    .from("notifications")
    .select("*")
    .eq("destinataire_id", destinataire)
    .order("cree_le", { ascending: false });
  if (type) q = q.eq("type", type);
  return (await q).data ?? [];
};

console.log("\n=== Notifications : triggers ===");

// Repère de départ : tout ce que ce script fera naître sera supprimé à la fin.
// Sans cela, les notifications de test s'accumulent dans la cloche des
// comptes de démo à chaque exécution.
const debutTest = new Date().toISOString();

const patient = await connecter("patient1@test.docteur224.com", "test1234");
const medecinId = await idPar("medecin1@test.docteur224.com");
const medecin = await connecter("medecin1@test.docteur224.com", "test1234");

// ---------- 1. Réservation ----------
const dateTest = "2027-03-15";
await admin.from("rendez_vous").delete().eq("date", dateTest); // repart propre
const avantPatient = (await notifsDe(patient.id)).length;
const avantMedecin = (await notifsDe(medecinId)).length;

const { data: rdv, error: erreurRdv } = await admin
  .from("rendez_vous")
  .insert({
    medecin_id: medecinId,
    date: dateTest,
    heure: "09:30",
    reserve_par: patient.id,
    reserve_par_role: "patient",
    patient_id: patient.id,
    statut: "en_attente",
    source: "en_ligne",
  })
  .select()
  .single();
if (erreurRdv) throw new Error("insertion RDV : " + erreurRdv.message);

const notifsResa = await notifsDe(patient.id, "rdv_reserve");
verifier("réservation → notification au patient", notifsResa.length > 0);
verifier(
  "la notification porte le nom du médecin et la date",
  /Dr .*15 mars à 09:30/.test(notifsResa[0]?.corps ?? ""),
  notifsResa[0]?.corps
);
verifier(
  "elle pointe sur le détail du rendez-vous",
  notifsResa[0]?.lien === `/mes-rendez-vous/${rdv.id}`,
  notifsResa[0]?.lien
);
const notifsMedecin = await notifsDe(medecinId, "rdv_nouveau");
verifier("réservation → notification au médecin", notifsMedecin.length > 0);
verifier(
  "canaux du patient : in_app + préférences",
  (notifsResa[0]?.canaux ?? []).includes("in_app"),
  JSON.stringify(notifsResa[0]?.canaux)
);
verifier(
  "canaux du médecin : in_app seulement",
  JSON.stringify(notifsMedecin[0]?.canaux) === JSON.stringify(["in_app"]),
  JSON.stringify(notifsMedecin[0]?.canaux)
);
verifier(
  "le patient a bien reçu 1 notification de plus",
  (await notifsDe(patient.id)).length === avantPatient + 1
);
verifier(
  "le médecin a bien reçu 1 notification de plus",
  (await notifsDe(medecinId)).length === avantMedecin + 1
);

// ---------- 2. Confirmation ----------
await medecin.client.from("rendez_vous").update({ statut: "confirme" }).eq("id", rdv.id);
verifier(
  "confirmation → notification au patient",
  (await notifsDe(patient.id, "rdv_confirme")).length > 0
);

// ---------- 3. Reprogrammation ----------
await medecin.client
  .from("rendez_vous")
  .update({ date: "2027-03-16", heure: "11:00" })
  .eq("id", rdv.id);
const reprog = await notifsDe(patient.id, "rdv_reprogramme");
verifier("reprogrammation → notification au patient", reprog.length > 0);
verifier(
  "elle annonce la nouvelle date",
  /16 mars à 11:00/.test(reprog[0]?.corps ?? ""),
  reprog[0]?.corps
);

// ---------- 4. Annulation par le patient ----------
const avantAnnul = (await notifsDe(patient.id, "rdv_annule")).length;
await patient.client.from("rendez_vous").update({ statut: "annule" }).eq("id", rdv.id);
verifier(
  "annulation par le patient → le médecin est prévenu",
  (await notifsDe(medecinId, "rdv_annule")).length > 0
);
verifier(
  "…et le patient n'est pas prévenu de sa propre annulation",
  (await notifsDe(patient.id, "rdv_annule")).length === avantAnnul
);

console.log("\n=== Notifications : RLS ===");

// ---------- 5. Lecture ----------
const { data: vuesParPatient } = await patient.client.from("notifications").select("*");
verifier(
  "le patient ne lit que les siennes",
  (vuesParPatient ?? []).every((n) => n.destinataire_id === patient.id),
  `${(vuesParPatient ?? []).filter((n) => n.destinataire_id !== patient.id).length} intruse(s)`
);
const { data: vuesParMedecin } = await medecin.client
  .from("notifications")
  .select("*")
  .eq("destinataire_id", patient.id);
verifier("le médecin ne lit pas celles du patient", (vuesParMedecin ?? []).length === 0);

const anonyme = createClient(URL_SB, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const { data: vuesAnonyme } = await anonyme.from("notifications").select("*");
verifier("un anonyme ne lit rien", (vuesAnonyme ?? []).length === 0);

// ---------- 6. Insertion interdite ----------
const { error: erreurIns } = await patient.client.from("notifications").insert({
  destinataire_id: patient.id,
  type: "faux",
  titre: "Notification fabriquée",
});
verifier("personne ne peut s'inventer une notification", !!erreurIns, erreurIns?.message);

const { error: erreurInsAutre } = await medecin.client.from("notifications").insert({
  destinataire_id: patient.id,
  type: "faux",
  titre: "Notification envoyée à autrui",
});
verifier("…ni en écrire une à quelqu'un d'autre", !!erreurInsAutre);

// ---------- 7. Marquage lu ----------
const cible = (await notifsDe(patient.id))[0];
const { error: erreurLu } = await patient.client
  .from("notifications")
  .update({ lu_le: new Date().toISOString() })
  .eq("id", cible.id);
verifier("le destinataire peut marquer lu", !erreurLu, erreurLu?.message);

const { error: erreurTitre } = await patient.client
  .from("notifications")
  .update({ titre: "Titre réécrit" })
  .eq("id", cible.id);
verifier("…mais pas réécrire le contenu", !!erreurTitre, erreurTitre?.message);

const { error: erreurDestinataire } = await patient.client
  .from("notifications")
  .update({ destinataire_id: medecinId })
  .eq("id", cible.id);
verifier("…ni la faire changer de destinataire", !!erreurDestinataire);

// ---------- 8. Tout marquer lu ----------
const { data: nbMarquees, error: erreurRpc } = await patient.client.rpc(
  "marquer_notifications_lues"
);
verifier("marquer_notifications_lues() répond", !erreurRpc, erreurRpc?.message);
const restantes = (await notifsDe(patient.id)).filter((n) => n.lu_le === null);
verifier(
  `…et ne laisse aucune non-lue (${nbMarquees} marquée·s)`,
  restantes.length === 0,
  `${restantes.length} restante(s)`
);
verifier(
  "elle ne touche que le compte appelant",
  (await notifsDe(medecinId)).some((n) => n.lu_le === null)
);

// ---------- 9. Avis ----------
console.log("\n=== Notifications : avis et invitations ===");
const { data: rdvHonore } = await admin
  .from("rendez_vous")
  .select("id, medecin_id")
  .eq("patient_id", patient.id)
  .eq("statut", "honore")
  .limit(1)
  .single();
if (rdvHonore) {
  await admin.from("avis").delete().eq("rendez_vous_id", rdvHonore.id);
  const avantAvis = (await notifsDe(rdvHonore.medecin_id, "avis_nouveau")).length;
  const { data: avis } = await admin
    .from("avis")
    .insert({
      medecin_id: rdvHonore.medecin_id,
      patient_id: patient.id,
      rendez_vous_id: rdvHonore.id,
      note: 5,
      commentaire: "Test notifications",
    })
    .select()
    .single();
  verifier(
    "nouvel avis → notification au médecin",
    (await notifsDe(rdvHonore.medecin_id, "avis_nouveau")).length === avantAvis + 1
  );
  await admin.from("avis").update({ reponse_medecin: "Merci !" }).eq("id", avis.id);
  verifier(
    "réponse du médecin → notification au patient",
    (await notifsDe(patient.id, "avis_reponse")).length > 0
  );
  await admin.from("avis").delete().eq("id", avis.id);
} else {
  console.log("  (aucune consultation honorée : bloc avis ignoré)");
}

// ---------- 10. Validation d'un compte ----------
const { data: enAttente } = await admin
  .from("medecins")
  .select("id, statut")
  .eq("statut", "en_attente")
  .limit(1)
  .maybeSingle();
if (enAttente) {
  await admin.from("medecins").update({ statut: "valide" }).eq("id", enAttente.id);
  verifier(
    "validation d'un médecin → notification",
    (await notifsDe(enAttente.id, "compte_valide")).length > 0
  );
  await admin.from("medecins").update({ statut: "en_attente" }).eq("id", enAttente.id);
  await admin.from("notifications").delete().eq("destinataire_id", enAttente.id);
} else {
  console.log("  (aucun médecin en attente : bloc validation ignoré)");
}

// ---------- ménage ----------
await admin.from("rendez_vous").delete().eq("id", rdv.id);
const { count: menage } = await admin
  .from("notifications")
  .delete({ count: "exact" })
  .in("destinataire_id", [patient.id, medecinId])
  .gte("cree_le", debutTest);
console.log(`\nMénage : ${menage ?? 0} notification(s) de test supprimée(s).`);

console.log(`\n${ok}/${ok + ko} contrôles réussis${ko ? ` — ${ko} ÉCHEC(S)` : ""}\n`);
process.exit(ko ? 1 : 0);
