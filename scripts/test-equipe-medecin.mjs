/*
 * Tests de l'écran « Mes assistant(e)s » (migration 0044) : ouverture d'un
 * compte, plafond de la formule, permissions, désactivation, fermeture —
 * et les refus, qui sont la moitié du sujet.
 *
 * Le scénario central est celui demandé par l'exploitant : un médecin
 * Standard est bloqué à une place, l'administrateur passe la formule à deux
 * places depuis la grille tarifaire, et le médecin peut aussitôt ouvrir un
 * second compte — sans qu'une ligne de code ne change.
 *
 * Chaque acteur agit avec un VRAI compte (clé anon, JWT réel) ; les routes
 * serveur reçoivent les cookies de session qu'un navigateur enverrait.
 *
 * Prérequis : `npx next build && npx next start -p 3001`.
 * Usage : node scripts/test-equipe-medecin.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const lire = (cle) => env.match(new RegExp(`^${cle}=(.*)$`, "m"))?.[1].trim();
const URL_SB = lire("NEXT_PUBLIC_SUPABASE_URL");
const ANON = lire("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const APP = process.env.APP ?? "http://localhost:3001";

const service = createClient(URL_SB, lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

let echecs = 0;
const test = (nom, ok, detail) => {
  if (!ok) echecs++;
  console.log(`${ok ? "✅" : "❌"} ${nom}${detail ? ` — ${detail}` : ""}`);
};

async function ouvrirSession(email, motDePasse) {
  const bocal = new Map();
  const client = createServerClient(URL_SB, ANON, {
    cookies: {
      getAll: () => [...bocal].map(([name, value]) => ({ name, value })),
      setAll: (liste) => liste.forEach(({ name, value }) => bocal.set(name, value)),
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: motDePasse });
  if (error) throw new Error(`connexion ${email} : ${error.message}`);
  const cookie = [...bocal].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");
  const appel = (chemin, init = {}) =>
    fetch(`${APP}${chemin}`, {
      ...init,
      headers: { "Content-Type": "application/json", cookie, ...(init.headers ?? {}) },
    });
  return { client, appel };
}

const MDP_ASSISTANT = "assistant1234";
const emailAssistant = `assistant.test.${Date.now()}@docteur224.com`;
let idAssistant = null;

const medecin = await ouvrirSession("medecin1@test.docteur224.com", "test1234");
const medecinId = (await medecin.client.auth.getUser()).data.user.id;
const admin = await ouvrirSession("admin@docteur224.com", "alpha2308");

// Le plafond d'origine est remis en place à la fin, quoi qu'il arrive.
const { data: tarifDepart } = await service
  .from("tarifs_plateforme")
  .select("assistants_inclus")
  .eq("formule", "standard")
  .single();

/* ---------- 1. Le plafond vient de la formule ---------- */
{
  const { data } = await medecin.client.rpc("quota_assistants");
  const q = (data ?? [])[0];
  test("quota_assistants() rend la formule du médecin", q?.formule === "standard", q?.formule);
  test("Standard ouvre 1 place", q?.places === 1, `${q?.places} place(s)`);
  test("La place est déjà prise par l'assistant(e) du seed", q?.occupees === 1, `${q?.occupees}`);
}

/* ---------- 2. Le plafond atteint bloque la création ---------- */
{
  const r = await medecin.appel("/api/medecin/assistants", {
    method: "POST",
    body: JSON.stringify({
      nomComplet: "En Trop",
      email: `entrop.${Date.now()}@docteur224.com`,
      motDePasse: MDP_ASSISTANT,
      permissions: ["voirAgenda"],
    }),
  });
  const corps = await r.json();
  test("Plafond atteint : la création est refusée", r.status === 409, `HTTP ${r.status}`);
  test("Le message nomme la formule et la sortie", /Standard|standard/.test(corps.erreur ?? ""), corps.erreur);

  // Le verrou ne tient pas qu'à la route : le trigger refuse aussi un insert
  // fait avec la clé service_role, qui traverse pourtant la RLS.
  const { data: cree } = await service.auth.admin.createUser({
    email: `direct.${Date.now()}@docteur224.com`,
    password: MDP_ASSISTANT,
    email_confirm: true,
  });
  await service.from("utilisateurs").insert({
    id: cree.user.id,
    role: "assistant",
    email: cree.user.email,
    prenom: "Direct",
    nom: "Test",
  });
  const { error } = await service
    .from("assistants")
    .insert({ id: cree.user.id, medecin_id: medecinId });
  test("Le trigger refuse aussi un insert service_role", !!error, error?.message?.slice(0, 60));
  await service.from("utilisateurs").delete().eq("id", cree.user.id);
  await service.auth.admin.deleteUser(cree.user.id);
}

/* ---------- 3. L'admin relève le plafond depuis la grille tarifaire ---------- */
{
  const { data } = await admin.client
    .from("tarifs_plateforme")
    .update({ assistants_inclus: 2 })
    .eq("formule", "standard")
    .select("formule");
  test("L'admin porte Standard à 2 places", (data ?? []).length === 1);

  const { data: q } = await medecin.client.rpc("quota_assistants");
  test("Le médecin voit aussitôt 2 places", (q ?? [])[0]?.places === 2, `${(q ?? [])[0]?.places}`);
}

/* ---------- 4. Ouverture d'un compte assistant(e) ---------- */
{
  const r = await medecin.appel("/api/medecin/assistants", {
    method: "POST",
    body: JSON.stringify({
      nomComplet: "Aïssatou Ba",
      email: emailAssistant,
      motDePasse: MDP_ASSISTANT,
      permissions: ["voirAgenda", "confirmerAnnuler", "reprogrammer"],
    }),
  });
  const corps = await r.json();
  idAssistant = corps.id;
  test("Le compte assistant(e) est créé", r.ok && !!idAssistant, corps.erreur ?? emailAssistant);

  const { data: u } = await service
    .from("utilisateurs")
    .select("role, statut, prenom, nom")
    .eq("id", idAssistant ?? "00000000-0000-0000-0000-000000000000")
    .maybeSingle();
  test("Le profil porte le rôle assistant", u?.role === "assistant" && u?.statut === "actif");
  test("Le nom complet est éclaté en prénom + nom", u?.prenom === "Aïssatou" && u?.nom === "Ba");

  const { data: a } = await service
    .from("assistants")
    .select("medecin_id, peut_voir_agenda, peut_reprogrammer, peut_messagerie")
    .eq("id", idAssistant)
    .maybeSingle();
  test("Il/elle est rattaché(e) au bon médecin", a?.medecin_id === medecinId);
  test(
    "Les permissions demandées sont posées, les autres non",
    a?.peut_voir_agenda === true && a?.peut_reprogrammer === true && a?.peut_messagerie === false
  );

  const { data: q } = await medecin.client.rpc("quota_assistants");
  test("Les deux places sont occupées", (q ?? [])[0]?.occupees === 2, `${(q ?? [])[0]?.occupees}`);
}

/* ---------- 5. Refus à la création ---------- */
{
  const r1 = await medecin.appel("/api/medecin/assistants", {
    method: "POST",
    body: JSON.stringify({
      nomComplet: "Doublon",
      email: emailAssistant,
      motDePasse: MDP_ASSISTANT,
      permissions: [],
    }),
  });
  // Le plafond est atteint de nouveau : c'est lui qui parle en premier, et
  // c'est le bon ordre — rien n'est créé, donc rien à annuler.
  test("Le plafond reprend la main dès la 3e place", r1.status === 409, `HTTP ${r1.status}`);

  await service.from("tarifs_plateforme").update({ assistants_inclus: 3 }).eq("formule", "standard");
  const r2 = await medecin.appel("/api/medecin/assistants", {
    method: "POST",
    body: JSON.stringify({
      nomComplet: "Doublon",
      email: emailAssistant,
      motDePasse: MDP_ASSISTANT,
      permissions: [],
    }),
  });
  test("Adresse déjà utilisée : refusée", r2.status === 409, `HTTP ${r2.status}`);

  const r3 = await medecin.appel("/api/medecin/assistants", {
    method: "POST",
    body: JSON.stringify({
      nomComplet: "Inventif",
      email: `inventif.${Date.now()}@docteur224.com`,
      motDePasse: MDP_ASSISTANT,
      permissions: ["tout_voir"],
    }),
  });
  test("Permission inventée : refusée", r3.status === 400, `HTTP ${r3.status}`);

  const r4 = await medecin.appel("/api/medecin/assistants", {
    method: "POST",
    body: JSON.stringify({
      nomComplet: "Court",
      email: `court.${Date.now()}@docteur224.com`,
      motDePasse: "1234",
      permissions: [],
    }),
  });
  test("Mot de passe trop court : refusé", r4.status === 400, `HTTP ${r4.status}`);
  await service.from("tarifs_plateforme").update({ assistants_inclus: 2 }).eq("formule", "standard");
}

/* ---------- 6. Ce que l'assistant(e) peut, et ne peut pas ---------- */
const assistant = await ouvrirSession(emailAssistant, MDP_ASSISTANT);
{
  const { data: sienne } = await assistant.client
    .from("assistants")
    .select("id, peut_voir_agenda")
    .eq("id", idAssistant);
  test("L'assistant(e) lit ses propres permissions", (sienne ?? []).length === 1);

  const { data: maj } = await assistant.client
    .from("assistants")
    .update({ peut_messagerie: true })
    .eq("id", idAssistant)
    .select("id");
  test("Il/elle ne s'accorde aucune permission", (maj ?? []).length === 0);

  const r = await assistant.appel("/api/medecin/assistants", {
    method: "POST",
    body: JSON.stringify({
      nomComplet: "Collègue",
      email: `collegue.${Date.now()}@docteur224.com`,
      motDePasse: MDP_ASSISTANT,
      permissions: [],
    }),
  });
  test("Il/elle ne compose pas l'équipe : POST → 403", r.status === 403, `HTTP ${r.status}`);

  const rSuppr = await assistant.appel(`/api/medecin/assistants/${idAssistant}`, { method: "DELETE" });
  test("Il/elle ne ferme aucun compte : DELETE → 403", rSuppr.status === 403, `HTTP ${rSuppr.status}`);

  const { data: abos } = await assistant.client.from("abonnements").select("id");
  test("Les données financières lui restent fermées", (abos ?? []).length === 0);

  const { data: q } = await assistant.client.rpc("quota_assistants");
  test("Le plafond ne le/la regarde pas", (q ?? []).length === 0);
}

/* ---------- 7. Un confrère n'y touche pas ---------- */
{
  const confrere = await ouvrirSession("medecin7@test.docteur224.com", "test1234");
  const { data } = await confrere.client
    .from("assistants")
    .update({ peut_messagerie: true })
    .eq("id", idAssistant)
    .select("id");
  test("Un autre médecin ne modifie pas cet(te) assistant(e)", (data ?? []).length === 0);

  const r = await confrere.appel(`/api/medecin/assistants/${idAssistant}`, {
    method: "PATCH",
    body: JSON.stringify({ actif: false }),
  });
  test("Un autre médecin ne le/la désactive pas : 404", r.status === 404, `HTTP ${r.status}`);
}

/* ---------- 8. Le médecin règle les permissions ---------- */
{
  const { data } = await medecin.client
    .from("assistants")
    .update({ peut_messagerie: true, peut_gerer_creneaux: true })
    .eq("id", idAssistant)
    .select("id");
  test("Le médecin modifie les permissions de son équipe", (data ?? []).length === 1);

  const { data: a } = await service
    .from("assistants")
    .select("peut_messagerie, peut_gerer_creneaux")
    .eq("id", idAssistant)
    .maybeSingle();
  test("Les nouvelles permissions sont en base", a?.peut_messagerie && a?.peut_gerer_creneaux);
}

/* ---------- 9. Désactivation : la place reste prise ---------- */
{
  const r = await medecin.appel(`/api/medecin/assistants/${idAssistant}`, {
    method: "PATCH",
    body: JSON.stringify({ actif: false }),
  });
  test("Désactivation du compte", r.ok, `HTTP ${r.status}`);

  const { data: u } = await service.from("utilisateurs").select("statut").eq("id", idAssistant).maybeSingle();
  test("Le statut passe à « suspendu »", u?.statut === "suspendu", u?.statut);

  const { error } = await createClient(URL_SB, ANON, { auth: { persistSession: false } })
    .auth.signInWithPassword({ email: emailAssistant, password: MDP_ASSISTANT });
  test("Un(e) assistant(e) désactivé(e) ne se connecte plus", !!error, error?.message);

  const { data: q } = await medecin.client.rpc("quota_assistants");
  test("Un compte désactivé occupe toujours sa place", (q ?? [])[0]?.occupees === 2, `${(q ?? [])[0]?.occupees}`);

  const r2 = await medecin.appel(`/api/medecin/assistants/${idAssistant}`, {
    method: "PATCH",
    body: JSON.stringify({ actif: true }),
  });
  test("Réactivation du compte", r2.ok, `HTTP ${r2.status}`);
  const { error: e2 } = await createClient(URL_SB, ANON, { auth: { persistSession: false } })
    .auth.signInWithPassword({ email: emailAssistant, password: MDP_ASSISTANT });
  test("Le compte réactivé se reconnecte", !e2, e2?.message);
}

/* ---------- 10. Fermeture : la place est libérée ---------- */
{
  const r = await medecin.appel(`/api/medecin/assistants/${idAssistant}`, { method: "DELETE" });
  test("Fermeture du compte assistant(e)", r.ok, `HTTP ${r.status}`);

  const { data: u } = await service
    .from("utilisateurs")
    .select("statut, email")
    .eq("id", idAssistant)
    .maybeSingle();
  test(
    "Le compte est anonymisé et fermé",
    u?.statut === "supprime" && u?.email?.startsWith("supprime-"),
    u?.email
  );

  const { data: a } = await service.from("assistants").select("id").eq("id", idAssistant);
  test("Le rattachement disparaît", (a ?? []).length === 0);

  const { data: q } = await medecin.client.rpc("quota_assistants");
  test("La place est libérée", (q ?? [])[0]?.occupees === 1, `${(q ?? [])[0]?.occupees}`);

  const { data: trace } = await service
    .from("journal_audit")
    .select("action")
    .eq("cible_id", idAssistant)
    .order("cree_le");
  test(
    "Le journal d'audit garde la trace des quatre décisions",
    (trace ?? []).length === 4,
    (trace ?? []).map((t) => t.action).join(" | ")
  );
}

/* ---------- Nettoyage ---------- */
await service
  .from("tarifs_plateforme")
  .update({ assistants_inclus: tarifDepart?.assistants_inclus ?? 1 })
  .eq("formule", "standard");
if (idAssistant) {
  await service.from("journal_audit").delete().eq("cible_id", idAssistant);
  await service.auth.admin.deleteUser(idAssistant);
  await service.from("utilisateurs").delete().eq("id", idAssistant);
}

console.log(echecs === 0 ? "\n✅ Tous les tests passent." : `\n❌ ${echecs} test(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
