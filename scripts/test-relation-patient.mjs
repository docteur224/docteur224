/*
 * Tests de l'étape 4 (migration 0066), EN BASE, avec de vraies sessions.
 *
 *   Messagerie :
 *     - n'écrit que qui a eu un rendez-vous ensemble, et en son propre nom ;
 *     - un tiers ne lit rien ; message vide ou trop long refusé ;
 *     - un message ne se réécrit pas ; seul le destinataire le marque lu,
 *       et un message lu le reste ;
 *     - proche cité : seulement un proche du patient de la conversation ;
 *     - notification au destinataire, SANS le contenu, une seule tant que la
 *       précédente n'est pas lue ;
 *     - pièces jointes : dépôt dans son seul dossier, lecture par les deux
 *       parties une fois le message envoyé, jamais par un tiers.
 *   Rappels SMS / WhatsApp :
 *     - programmés à la création d'un RDV (J-1 et H-2 par défaut), refaits au
 *       déplacement, annulés à l'annulation ;
 *     - lisibles par le médecin du RDV seul ;
 *     - délais du médecin : liste close, et leur changement reprogramme ;
 *     - envoi : « simulé » sans fournisseur, journalisé ; consentement retiré
 *       → « non envoyé » avec le motif ; vidange réservée au cron.
 *
 * La vidange passe par le serveur local (BASE, défaut http://localhost:3993).
 * Tout ce qui est créé est supprimé à la fin ; les préférences touchées sont
 * remises en l'état.
 * Usage : node scripts/test-relation-patient.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const lire = (c) => env.match(new RegExp(`^${c}=(.*)$`, "m"))?.[1].trim();
const BASE = process.env.BASE ?? "http://localhost:3993";
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

const MARQUE = "TEST-RELATION";
const debut = new Date().toISOString();
const cree = { rdv: [], fichiers: [], prefPatient: null, prefMedecin: undefined };
const jourPlus = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function vidanger(cle = lire("EMAIL_CLE_DRAIN")) {
  const r = await fetch(`${BASE}/api/rappels/drainer`, {
    method: "POST",
    headers: cle ? { "x-cle-drain": cle } : {},
  });
  return { statut: r.status, corps: await r.json().catch(() => null) };
}

async function main() {
  const emails = ["medecin1", "medecin3", "patient1", "patient2"].map((x) => `${x}@test.docteur224.com`);
  const { data: u } = await service.from("utilisateurs").select("id, email, telephone").in("email", emails);
  const id = (p) => u.find((x) => x.email === `${p}@test.docteur224.com`).id;
  const medecinId = id("medecin1");
  const etrangerId = id("medecin3");
  const patientId = id("patient1");
  const telPatient = u.find((x) => x.id === patientId).telephone;

  const medecin = await session("medecin1@test.docteur224.com");
  const etranger = await session("medecin3@test.docteur224.com");
  const patient = await session("patient1@test.docteur224.com");
  const tiers = await session("patient2@test.docteur224.com");
  const anonyme = nouveau();

  const { count: rdvEtranger } = await service
    .from("rendez_vous").select("id", { count: "exact", head: true }).eq("medecin_id", etrangerId).eq("patient_id", patientId);
  if (rdvEtranger) throw new Error("medecin3 a un RDV avec patient1 : le test « sans relation » n’a plus de sens.");

  /* La base sert aussi la production : les comptes de démo peuvent déjà
     s'être écrit. On relève l'état de départ, et on raisonne en écarts. */
  const { count: nonLusAvant } = await service
    .from("messages").select("id", { count: "exact", head: true })
    .eq("patient_id", patientId).eq("medecin_id", medecinId).eq("expediteur_id", medecinId).eq("lu", false);
  const { data: notifEnCours } = await service
    .from("notifications").select("id").eq("destinataire_id", patientId).eq("type", "message")
    .eq("source_id", medecinId).is("lu_le", null).gte("cree_le", new Date(Date.now() - 30 * 60_000).toISOString()).limit(1);

  /* ============ Messagerie ============ */
  const ins = (client, champs) =>
    client.from("messages").insert({ patient_id: patientId, medecin_id: medecinId, ...champs }).select("id, lu, cree_le").single();

  const { data: m1, error: e1 } = await ins(patient, { expediteur_id: patientId, contenu: `Bonjour docteur (${MARQUE})` });
  check("patient → son médecin : envoi accepté", !e1 && !!m1, e1?.message);
  const { error: eSans } = await patient
    .from("messages").insert({ patient_id: patientId, medecin_id: etrangerId, expediteur_id: patientId, contenu: `x (${MARQUE})` });
  check("patient → médecin jamais consulté : refusé", !!eSans, eSans?.message);
  const { error: eEtr } = await etranger
    .from("messages").insert({ patient_id: patientId, medecin_id: etrangerId, expediteur_id: etrangerId, contenu: `x (${MARQUE})` });
  check("médecin sans rendez-vous → patient : refusé", !!eEtr, eEtr?.message);
  const { error: eUsurp } = await ins(patient, { expediteur_id: medecinId, contenu: `faux (${MARQUE})` });
  check("se faire passer pour le médecin : refusé", !!eUsurp, eUsurp?.message);
  const { error: eVide } = await ins(patient, { expediteur_id: patientId, contenu: "   " });
  check("message vide : refusé", !!eVide, eVide?.message);
  const { error: eLong } = await ins(patient, { expediteur_id: patientId, contenu: "a".repeat(4001) });
  check("message de plus de 4 000 caractères : refusé", !!eLong, eLong?.message);

  const { data: vuTiers } = await tiers.from("messages").select("id").eq("patient_id", patientId);
  check("autre patient : ne lit rien", (vuTiers ?? []).length === 0);
  const { data: vuEtr } = await etranger.from("messages").select("id").eq("patient_id", patientId);
  check("autre médecin : ne lit rien", (vuEtr ?? []).length === 0);
  const { data: vuMed } = await medecin.from("messages").select("id, lu").eq("id", m1?.id);
  check("le médecin lit le message, non lu", vuMed?.length === 1 && vuMed[0].lu === false);

  const { data: notifs } = await service
    .from("notifications").select("id, titre, corps, lien").eq("destinataire_id", medecinId).eq("type", "message").gte("cree_le", debut);
  check("médecin notifié", notifs?.length === 1, notifs?.[0]?.titre);
  check(
    "notification sans le contenu du message",
    !!notifs?.[0] && !`${notifs[0].titre} ${notifs[0].corps}`.includes("Bonjour docteur")
  );
  check("lien vers la fiche, onglet Relation", notifs?.[0]?.lien === `/espace-medecin/patients/c-${patientId}?tab=relation`, notifs?.[0]?.lien);

  const { error: e2 } = await ins(patient, { expediteur_id: patientId, contenu: `Second message (${MARQUE})` });
  const { count: nbNotifs } = await service
    .from("notifications").select("id", { count: "exact", head: true }).eq("destinataire_id", medecinId).eq("type", "message").gte("cree_le", debut);
  check("second message : pas de seconde notification", !e2 && nbNotifs === 1, `${nbNotifs} notification(s)`);

  const { error: eLuExp } = await patient.from("messages").update({ lu: true }).eq("id", m1?.id);
  check("l’expéditeur ne marque pas son message lu", !!eLuExp, eLuExp?.message);
  const { error: eReecr } = await medecin.from("messages").update({ contenu: "réécrit" }).eq("id", m1?.id);
  check("un message ne se réécrit pas", !!eReecr, eReecr?.message);
  const { data: lu, error: eLu } = await medecin.from("messages").update({ lu: true }).eq("id", m1?.id).select("lu, lu_le").single();
  check("le destinataire marque lu, avec l’heure", !eLu && lu?.lu === true && !!lu?.lu_le, eLu?.message);
  const { error: eDelu } = await medecin.from("messages").update({ lu: false }).eq("id", m1?.id);
  check("un message lu le reste", !!eDelu, eDelu?.message);

  // Proches
  // Un médecin ne cite qu'un proche qu'il a déjà reçu (il ne voit pas les autres).
  const { data: sesProches } = await service.from("proches").select("id").eq("patient_id", patientId);
  const { data: vus } = await service
    .from("rendez_vous").select("proche_id").eq("medecin_id", medecinId).in("proche_id", (sesProches ?? []).map((p) => p.id)).limit(1);
  const procheA = vus?.[0] ? { id: vus[0].proche_id } : null;
  const { data: inconnu } = await service
    .from("proches").select("id").eq("patient_id", patientId).not("id", "in", `(${(vus ?? []).map((x) => x.proche_id).join(",") || "00000000-0000-0000-0000-000000000000"})`).limit(1).maybeSingle();
  const { data: procheB } = await service.from("proches").select("id").neq("patient_id", patientId).limit(1).maybeSingle();
  if (procheA) {
    const { error } = await ins(medecin, { expediteur_id: medecinId, contenu: `À propos de votre enfant (${MARQUE})`, proche_id: procheA.id });
    check("médecin → patient, à propos d’un de ses proches : accepté", !error, error?.message);
  }
  if (inconnu) {
    const { error } = await ins(medecin, { expediteur_id: medecinId, contenu: `x (${MARQUE})`, proche_id: inconnu.id });
    check("proche jamais reçu par ce médecin : refusé", !!error, error?.message);
  }
  if (procheB) {
    const { error } = await ins(medecin, { expediteur_id: medecinId, contenu: `x (${MARQUE})`, proche_id: procheB.id });
    check("proche d’un autre patient cité : refusé", !!error, error?.message);
  }
  if (!procheA) await ins(medecin, { expediteur_id: medecinId, contenu: `Réponse (${MARQUE})` });

  const { data: notifPat } = await service
    .from("notifications").select("lien, titre, corps").eq("destinataire_id", patientId).eq("type", "message").gte("cree_le", debut);
  if (notifEnCours?.length) {
    // Une notification non lue de moins de 30 min existait : la règle veut qu'on n'en ajoute pas.
    check("patient déjà notifié il y a moins de 30 min : pas de doublon", (notifPat ?? []).length === 0, `${notifPat?.length} nouvelle(s)`);
  } else {
    check(
      "patient notifié, lien vers sa messagerie",
      notifPat?.length === 1 && notifPat[0].lien === `/patient/messages?medecin=${medecinId}`,
      notifPat?.[0]?.lien
    );
    check("notification patient sans le contenu", !!notifPat?.[0] && !`${notifPat[0].titre} ${notifPat[0].corps}`.includes("enfant"));
  }

  const { data: convs, error: eConv } = await patient.rpc("conversations_patient");
  const conv = convs?.find((c) => c.medecin_id === medecinId);
  check(
    "liste des conversations du patient : dernier message du médecin, +1 non lu",
    !eConv && !!conv && conv.dernier_de_moi === false && Number(conv.non_lus) === (nonLusAvant ?? 0) + 1,
    eConv?.message ?? JSON.stringify(conv && { non_lus: conv.non_lus, de_moi: conv.dernier_de_moi })
  );
  const { data: convTiers } = await tiers.rpc("conversations_patient");
  check("un autre patient ne voit pas ces conversations", !(convTiers ?? []).some((c) => c.medecin_id === medecinId && c.dernier_message?.includes(MARQUE)));
  const { error: eConvAnon } = await anonyme.rpc("conversations_patient");
  check("anonyme : conversations inaccessibles", !!eConvAnon, eConvAnon?.message);

  // Pièces jointes
  const pdf = new Blob(["%PDF-1.4\n% test\n"], { type: "application/pdf" });
  const chemin = `${patientId}/${MARQUE}-${Date.now()}.pdf`;
  const { error: eDep } = await patient.storage.from("messages").upload(chemin, pdf, { contentType: "application/pdf" });
  if (!eDep) cree.fichiers.push(chemin);
  check("pièce jointe : dépôt dans son dossier", !eDep, eDep?.message);
  const { error: eDepAutre } = await patient.storage.from("messages").upload(`${medecinId}/${MARQUE}.pdf`, pdf, { contentType: "application/pdf" });
  check("pièce jointe : dépôt dans le dossier d’un autre refusé", !!eDepAutre);
  const { error: eAvant } = await medecin.storage.from("messages").download(chemin);
  check("fichier non rattaché : le médecin ne le lit pas encore", !!eAvant);
  const { error: eMsgPj } = await ins(patient, { expediteur_id: patientId, piece_path: chemin, piece_nom: "analyse.pdf" });
  check("message fait d’une seule pièce jointe : accepté", !eMsgPj, eMsgPj?.message);
  const { error: eApres } = await medecin.storage.from("messages").download(chemin);
  check("une fois envoyé, le médecin le lit", !eApres, eApres?.message);
  const { error: eTiersPj } = await tiers.storage.from("messages").download(chemin);
  check("un autre patient ne le lit pas", !!eTiersPj);
  const { data: suppr } = await patient.storage.from("messages").remove([chemin]);
  check("un fichier envoyé ne se retire plus", (suppr ?? []).length === 0);

  /* ============ Rappels SMS / WhatsApp ============ */
  const { data: prefPat } = await service.from("patients").select("pref_rappels_whatsapp, pref_rappels_sms").eq("id", patientId).single();
  cree.prefPatient = prefPat;
  const { data: prefMed } = await service.from("preferences_rappels").select("*").eq("titulaire_id", medecinId).maybeSingle();
  cree.prefMedecin = prefMed;

  // Deux créneaux libres de l'agenda réel du médecin (création, puis déplacement).
  const libres = [];
  for (let j = 3; j <= 30 && libres.length < 2; j++) {
    for (const h of ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"]) {
      const { data: ouvert } = await service.rpc("creneau_ouvert_medecin", { p_medecin_id: medecinId, p_date: jourPlus(j), p_heure: h });
      if (ouvert) {
        libres.push({ date: jourPlus(j), heure: h });
        break;
      }
    }
  }
  if (libres.length < 2) throw new Error("pas deux créneaux libres sur 30 jours pour medecin1");

  const { data: rdv, error: eRdv } = await service
    .from("rendez_vous")
    .insert({
      medecin_id: medecinId,
      patient_id: patientId,
      reserve_par: patientId,
      reserve_par_role: "patient",
      ...libres[0],
      motif: MARQUE,
      source: "en_ligne",
    })
    .select("id")
    .single();
  if (rdv) cree.rdv.push(rdv.id);
  check("rendez-vous d’essai créé", !eRdv && !!rdv, eRdv?.message);
  const echeances = async () =>
    (await service.from("rappels_programmes").select("id, delai_heures, etat, canal, programme_pour, derniere_erreur, envoye_le").eq("rendez_vous_id", rdv.id).order("delai_heures")).data ?? [];

  let r = await echeances();
  const attendus = (prefMed?.delais_heures ?? [24, 2]).slice().sort((a, b) => a - b);
  check(
    "création → rappels programmés aux délais du médecin",
    JSON.stringify(r.filter((x) => x.etat === "programme").map((x) => x.delai_heures)) === JSON.stringify(attendus),
    r.map((x) => `${x.delai_heures}h:${x.etat}:${x.canal}`).join(", ")
  );
  check("canal prévu : WhatsApp (consentement du patient)", !prefPat.pref_rappels_whatsapp || r.every((x) => x.canal === "whatsapp"));

  const { data: vusMed } = await medecin.from("rappels_programmes").select("id").eq("rendez_vous_id", rdv.id);
  const { data: vusEtr } = await etranger.from("rappels_programmes").select("id").eq("rendez_vous_id", rdv.id);
  const { data: vusPat } = await patient.from("rappels_programmes").select("id").eq("rendez_vous_id", rdv.id);
  check("médecin du RDV : voit l’historique", (vusMed ?? []).length === r.length && r.length > 0);
  check("autre médecin et patient : ne voient rien", (vusEtr ?? []).length === 0 && (vusPat ?? []).length === 0);
  const { error: eEcr } = await medecin.from("rappels_programmes").update({ etat: "envoye" }).eq("rendez_vous_id", rdv.id).select("id");
  const { data: apresEcr } = await service.from("rappels_programmes").select("etat").eq("rendez_vous_id", rdv.id).eq("etat", "envoye");
  check("aucune écriture depuis le navigateur", (apresEcr ?? []).length === 0, eEcr?.message);

  const { data: cons, error: eCons } = await medecin.rpc("consentement_rappels", { p_patient: patientId });
  check("consentement lisible par son médecin", !eCons && cons?.length === 1 && cons[0].whatsapp === prefPat.pref_rappels_whatsapp, eCons?.message);
  const { error: eConsEtr } = await etranger.rpc("consentement_rappels", { p_patient: patientId });
  check("consentement refusé à un autre médecin", !!eConsEtr, eConsEtr?.message);
  for (const fn of ["reserver_rappels", "marquer_rappel", "programmer_rappels_telephone"]) {
    const args = fn === "reserver_rappels" ? { p_limite: 1 } : fn === "marquer_rappel" ? { p_id: r[0].id, p_etat: "envoye" } : { p_rdv: rdv.id };
    const { error } = await medecin.rpc(fn, args);
    check(`${fn} : interdit depuis le navigateur`, !!error, error?.message?.slice(0, 60));
  }

  // Déplacement
  await service.from("rendez_vous").update(libres[1]).eq("id", rdv.id);
  r = await echeances();
  check(
    "déplacement → anciennes échéances annulées, nouvelles programmées",
    r.filter((x) => x.etat === "annule").length === attendus.length && r.filter((x) => x.etat === "programme").length === attendus.length,
    r.map((x) => `${x.delai_heures}h:${x.etat}`).join(", ")
  );

  // Délais du médecin
  const { error: eDelai } = await medecin
    .from("preferences_rappels").upsert({ titulaire_id: medecinId, delais_heures: [5] }, { onConflict: "titulaire_id" });
  check("délai hors liste (5 h) refusé", !!eDelai, eDelai?.message?.slice(0, 80));
  const { error: eDelais } = await medecin
    .from("preferences_rappels").upsert({ titulaire_id: medecinId, delais_heures: [48, 6], delai_heures: 48 }, { onConflict: "titulaire_id" });
  r = await echeances();
  check(
    "nouveaux délais (J-2, H-6) → RDV reprogrammé",
    !eDelais && JSON.stringify(r.filter((x) => x.etat === "programme").map((x) => x.delai_heures)) === "[6,48]",
    eDelais?.message ?? r.filter((x) => x.etat === "programme").map((x) => x.delai_heures).join(",")
  );

  // Un rappel déjà parti ne repart pas quand les délais changent (0067).
  const parti = r.find((x) => x.etat === "programme" && x.delai_heures === 48);
  await service.from("rappels_programmes").update({ etat: "simule", envoye_le: new Date().toISOString() }).eq("id", parti.id);
  await service.from("preferences_rappels").update({ delais_heures: [48, 6, 2] }).eq("titulaire_id", medecinId);
  r = await echeances();
  check(
    "délais changés après un envoi : le rappel parti n’est pas remis en file",
    r.find((x) => x.id === parti.id)?.etat === "simule" && !r.some((x) => x.delai_heures === 48 && x.etat === "programme"),
    r.map((x) => `${x.delai_heures}h:${x.etat}`).join(", ")
  );
  r = r.filter((x) => x.id !== parti.id);

  // Envoi : on avance une échéance à maintenant, puis on vide la file.
  const { statut: s401 } = await vidanger(null);
  check("vidange sans clé : refusée", s401 === 401, `HTTP ${s401}`);
  const [premiere, seconde] = r.filter((x) => x.etat === "programme");
  await service.from("rappels_programmes").update({ programme_pour: new Date(Date.now() - 60_000).toISOString() }).eq("id", premiere.id);
  const v1 = await vidanger();
  const apres1 = (await echeances()).find((x) => x.id === premiere.id);
  check(
    "échéance due → envoi simulé (aucun fournisseur), daté",
    v1.statut === 200 && apres1?.etat === "simule" && !!apres1?.envoye_le,
    `HTTP ${v1.statut} ${JSON.stringify(v1.corps)} → ${apres1?.etat}`
  );
  const { data: journal } = await service
    .from("messages_envoyes").select("id, statut, canal, motif").eq("titulaire_id", medecinId).eq("motif", "rappel").eq("destinataire", telPatient).gte("envoye_le", debut);
  check("envoi journalisé (motif rappel, statut simulé)", journal?.length === 1 && journal[0].statut === "simule", JSON.stringify(journal?.[0]));
  cree.journal = (journal ?? []).map((j) => j.id);

  // Consentement retiré : la décision se prend à l'envoi.
  await service.from("patients").update({ pref_rappels_whatsapp: false, pref_rappels_sms: false }).eq("id", patientId);
  await service.from("rappels_programmes").update({ programme_pour: new Date(Date.now() - 60_000).toISOString() }).eq("id", seconde.id);
  await vidanger();
  const apres2 = (await echeances()).find((x) => x.id === seconde.id);
  check(
    "consentement retiré → non envoyé, avec le motif",
    apres2?.etat === "ignore" && /consenti/.test(apres2?.derniere_erreur ?? ""),
    `${apres2?.etat} · ${apres2?.derniere_erreur}`
  );
  const { count: journal2 } = await service
    .from("messages_envoyes").select("id", { count: "exact", head: true }).eq("titulaire_id", medecinId).eq("motif", "rappel").eq("destinataire", telPatient).gte("envoye_le", debut);
  check("rien de journalisé pour un rappel non envoyé", journal2 === 1, `${journal2}`);

  // Annulation
  await service.from("patients").update(prefPat).eq("id", patientId);
  await service.from("preferences_rappels").upsert({ titulaire_id: medecinId, delais_heures: [24, 2], delai_heures: 24 }, { onConflict: "titulaire_id" });
  await service.from("rendez_vous").update({ statut: "annule" }).eq("id", rdv.id);
  r = await echeances();
  check(
    "annulation → plus aucune échéance en attente",
    r.length > 0 && !r.some((x) => x.etat === "programme"),
    r.map((x) => `${x.delai_heures}h:${x.etat}`).join(", ")
  );
}

async function nettoyer() {
  const { data: u } = await service.from("utilisateurs").select("id, email").in("email", ["medecin1@test.docteur224.com", "patient1@test.docteur224.com"]);
  const ids = (u ?? []).map((x) => x.id);
  const medecinId = u?.find((x) => x.email.startsWith("medecin1"))?.id;
  const patientId = u?.find((x) => x.email.startsWith("patient1"))?.id;

  const { data: msgs } = await service.from("messages").select("id, contenu, piece_path, cree_le").in("patient_id", ids).gte("cree_le", debut);
  const aNous = (msgs ?? []).filter((m) => m.contenu?.includes(MARQUE) || m.piece_path?.includes(MARQUE));
  const nos = aNous.map((m) => m.id);
  if (nos.length) await service.from("messages").delete().in("id", nos);
  if (cree.fichiers.length) await service.storage.from("messages").remove(cree.fichiers);
  // La notification a le cree_le EXACT de son message (même transaction) : on
  // ne supprime que les nôtres, jamais une notification réelle de la démo.
  if (aNous.length) await service.from("notifications").delete().eq("type", "message").eq("source_type", "conversation").in("cree_le", aNous.map((m) => m.cree_le));
  if (cree.rdv.length) {
    await service.from("notifications").delete().in("source_id", cree.rdv);
    await service.from("rendez_vous").delete().in("id", cree.rdv);
  }
  if (cree.journal?.length) await service.from("messages_envoyes").delete().in("id", cree.journal);
  if (cree.prefPatient && patientId) await service.from("patients").update(cree.prefPatient).eq("id", patientId);
  if (cree.prefMedecin !== undefined && medecinId) {
    if (cree.prefMedecin === null) await service.from("preferences_rappels").delete().eq("titulaire_id", medecinId);
    else await service.from("preferences_rappels").upsert(cree.prefMedecin, { onConflict: "titulaire_id" });
    // Les RDV à venir du médecin retrouvent les échéances de ses vrais réglages.
    const { data: avenir } = await service
      .from("rendez_vous").select("id").eq("medecin_id", medecinId).gte("date", new Date().toISOString().slice(0, 10)).in("statut", ["en_attente", "confirme"]);
    for (const x of avenir ?? []) await service.rpc("programmer_rappels_telephone", { p_rdv: x.id });
  }
}

try {
  await main();
} catch (e) {
  echecs++;
  console.log(`❌ arrêt : ${e.message}`);
} finally {
  await nettoyer();
  console.log(`\n${total - echecs}/${total} vérifications réussies${echecs ? ` — ${echecs} échec(s)` : ""}`);
  process.exit(echecs ? 1 : 0);
}
