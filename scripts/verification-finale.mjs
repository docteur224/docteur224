/*
 * Étape 5 — Scénario de vérification de bout en bout (7 points du prompt).
 * Chaque étape agit avec le compte du rôle concerné (clé anon + JWT réel),
 * puis vérifie l'état réel en base. Nettoyage complet à la fin.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const lire = (cle) => env.match(new RegExp(`^${cle}=(.*)$`, "m"))?.[1].trim();
const URL_SB = lire("NEXT_PUBLIC_SUPABASE_URL");
const ANON = lire("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const APP = "http://localhost:3002";

const resultats = [];
const etape = (n, titre, ok, detail) => {
  resultats.push(ok);
  console.log(`${ok ? "✅" : "❌"} Étape ${n} — ${titre}${detail ? `\n   ${detail}` : ""}`);
};

const client = () => createClient(URL_SB, ANON, { auth: { persistSession: false } });
const connecte = async (email, mdp = "test1234") => {
  const c = client();
  const { error } = await c.auth.signInWithPassword({ email, password: mdp });
  if (error) throw new Error(`connexion ${email}: ${error.message}`);
  return c;
};
const admin = createClient(URL_SB, lire("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const aNettoyer = { rdvIds: [], fichesSansCompte: [], patientId: null };

// ---------- 1. Inscription d'un nouveau patient ----------
const emailPatient = `verif.finale.${Date.now()}@gmail.com`;
{
  const r = await fetch(`${APP}/api/inscription`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "patient", email: emailPatient, motDePasse: "verif1234", nom: "Finale", prenom: "Verif", telephone: "620778899", genre: "F" }),
  });
  const cP = await connecte(emailPatient, "verif1234").catch(() => null);
  const uid = cP ? (await cP.auth.getUser()).data.user.id : null;
  aNettoyer.patientId = uid;
  const { data: u } = uid ? await admin.from("utilisateurs").select("role").eq("id", uid).single() : { data: null };
  const { data: p } = uid ? await admin.from("patients").select("id").eq("id", uid).single() : { data: null };
  etape(1, "Inscription patient → lignes utilisateurs + patients", r.ok && u?.role === "patient" && !!p, `email ${emailPatient}`);
}

// ---------- 2. Recherche + réservation par le patient ----------
let rdvId = null;
let medecinId = null;
{
  const anon = client();
  const { data: medecins } = await anon
    .from("medecins")
    .select("id, statut, specialites ( nom ), utilisateurs ( nom )")
    .eq("statut", "valide");
  medecinId = medecins?.[0]?.id;
  const cP = await connecte(emailPatient, "verif1234");
  const uid = (await cP.auth.getUser()).data.user.id;
  const { data: rdv, error } = await cP.from("rendez_vous").insert({
    medecin_id: medecinId, date: "2026-08-10", heure: "09:00",
    reserve_par: uid, reserve_par_role: "patient", patient_id: uid,
    motif: "Vérification finale", source: "en_ligne",
  }).select("id, statut").single();
  rdvId = rdv?.id;
  if (rdvId) aNettoyer.rdvIds.push(rdvId);
  const { data: enBase } = await admin.from("rendez_vous").select("statut").eq("id", rdvId ?? "00000000-0000-0000-0000-000000000000").maybeSingle();
  etape(2, "Recherche réelle + réservation écrite dans rendez_vous", (medecins?.length ?? 0) >= 5 && !error && enBase?.statut === "en_attente", `${medecins?.length} médecins trouvés, RDV ${rdvId} en_attente`);
}

// ---------- 3. Le médecin voit et confirme le RDV ----------
{
  const { data: proprietaire } = await admin.from("utilisateurs").select("email").eq("id", medecinId).single();
  const cM = await connecte(proprietaire.email);
  const { data: sesRdv } = await cM.from("rendez_vous").select("id").eq("id", rdvId);
  const { error } = await cM.from("rendez_vous").update({ statut: "confirme" }).eq("id", rdvId);
  const { data: verif } = await admin.from("rendez_vous").select("statut").eq("id", rdvId).single();
  etape(3, "Le médecin voit le RDV dans son agenda et le confirme", sesRdv?.length === 1 && !error && verif.statut === "confirme", `statut en base : ${verif.statut}`);
}

// ---------- 4. Fermeture d'un créneau → invisible côté patient ----------
{
  const { data: proprietaire } = await admin.from("utilisateurs").select("email").eq("id", medecinId).single();
  const cM = await connecte(proprietaire.email);
  await cM.from("creneaux_exceptions").upsert({ medecin_id: medecinId, date: "2026-08-11", heure: "10:00", etat: "ferme" }, { onConflict: "medecin_id,date,heure" });
  const { data: indispos } = await client().rpc("heures_indisponibles", { p_medecin_id: medecinId, p_debut: "2026-08-11", p_fin: "2026-08-11" });
  const ferme = (indispos ?? []).some((i) => i.heure.startsWith("10:00") && i.etat === "ferme");
  await cM.from("creneaux_exceptions").delete().eq("medecin_id", medecinId).eq("date", "2026-08-11").eq("heure", "10:00");
  etape(4, "Créneau fermé par le médecin → indisponible côté patient", ferme);
}

// ---------- 5. L'assistant crée un RDV pour un patient sans compte ----------
{
  const cA = await connecte("assistant1@test.docteur224.com");
  const uidA = (await cA.auth.getUser()).data.user.id;
  const { data: aRow } = await cA.from("assistants").select("medecin_id").eq("id", uidA).single();
  const { data: fiche, error: e1 } = await cA.from("patients_sans_compte")
    .insert({ medecin_id: aRow.medecin_id, nom: "Verif", prenom: "SansCompte", telephone: "+224620555444" })
    .select("id").single();
  if (fiche) aNettoyer.fichesSansCompte.push(fiche.id);
  const { data: rdv, error: e2 } = await cA.from("rendez_vous").insert({
    medecin_id: aRow.medecin_id, date: "2026-08-12", heure: "11:00",
    reserve_par: uidA, reserve_par_role: "assistant",
    patient_sans_compte_id: fiche?.id, motif: "Pris au téléphone", statut: "confirme", source: "telephone",
  }).select("id, source").single();
  if (rdv) aNettoyer.rdvIds.push(rdv.id);
  etape(5, "Assistant → fiche patient minimale + RDV source téléphone", !e1 && !e2 && rdv?.source === "telephone", e1?.message ?? e2?.message ?? `fiche ${fiche?.id}`);
}

// ---------- 6. L'admin valide le médecin en attente + journal d'audit ----------
{
  const cAdm = await connecte("admin@docteur224.com", "alpha2308");
  const { data: enAttente } = await cAdm.from("medecins").select("id").eq("statut", "en_attente").limit(1);
  const cible = enAttente?.[0]?.id;
  const { error: e1 } = await cAdm.from("medecins").update({ statut: "valide" }).eq("id", cible);
  await cAdm.rpc("ecrire_audit", { p_action: "A approuvé un médecin", p_cible_type: "medecin", p_cible_id: cible, p_details: { cible: "medecin8 (vérification finale)" } });
  const { data: verif } = await admin.from("medecins").select("statut").eq("id", cible).single();
  const { data: audit } = await cAdm.from("journal_audit").select("action").order("cree_le", { ascending: false }).limit(1);
  // retour à l'état initial du seed
  await admin.from("medecins").update({ statut: "en_attente" }).eq("id", cible);
  etape(6, "Admin valide un médecin → statut changé + entrée d'audit", !e1 && verif.statut === "valide" && audit?.[0]?.action === "A approuvé un médecin");
}

// ---------- 7. Accès non autorisé refusé par la RLS ----------
{
  const cP = await connecte(emailPatient, "verif1234");
  const { data: docs } = await cP.from("documents_validation").select("*");
  const { error: eAudit } = await cP.from("journal_audit").insert({ action: "intrusion" });
  etape(7, "Patient → documents_validation vide + écriture audit refusée", (docs ?? []).length === 0 && !!eAudit);
}

// ---------- Nettoyage ----------
for (const id of aNettoyer.rdvIds) await admin.from("rendez_vous").delete().eq("id", id);
for (const id of aNettoyer.fichesSansCompte) await admin.from("patients_sans_compte").delete().eq("id", id);
if (aNettoyer.patientId) await admin.auth.admin.deleteUser(aNettoyer.patientId);
console.log("\n🧹 Données de vérification nettoyées.");

const echecs = resultats.filter((r) => !r).length;
console.log(`${resultats.length - echecs}/${resultats.length} étapes réussies${echecs ? " — ÉCHEC(S) À CORRIGER" : ""}`);
process.exit(echecs ? 1 : 0);
