/*
 * Tests de l'écran Équipe admin (migration 0043) : création d'un compte
 * administrateur, permissions, désactivation, suppression — et surtout les
 * refus, qui sont la raison d'être de cette page.
 *
 * Chaque acteur agit avec un VRAI compte (clé anon, JWT réel) : les routes
 * serveur sont appelées avec les cookies de session qu'un navigateur
 * enverrait, la base répond sous la RLS de l'appelant. Rien n'est simulé.
 *
 * Prérequis : `npx next build && npx next start -p 3001`.
 * Usage : node scripts/test-equipe-admin.mjs
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

/*
 * Une session « comme dans un navigateur » : le client SSR écrit ses cookies
 * dans un bocal, qu'on renvoie ensuite en en-tête aux routes /api. C'est le
 * seul moyen d'appeler ces routes telles qu'elles seront appelées.
 */
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
  const cookie = [...bocal]
    .map(([n, v]) => `${n}=${encodeURIComponent(v)}`)
    .join("; ");
  const appel = (chemin, init = {}) =>
    fetch(`${APP}${chemin}`, {
      ...init,
      headers: { "Content-Type": "application/json", cookie, ...(init.headers ?? {}) },
    });
  return { client, appel };
}

const MDP_NOUVEAU = "equipe1234";
const emailNouveau = `moderateur.test.${Date.now()}@docteur224.com`;
let idNouveau = null;

const principal = await ouvrirSession("admin@docteur224.com", "alpha2308");

// Combien d'administrateurs AVANT le scénario : la plateforme en compte
// autant que l'exploitant en a ouverts, un chiffre écrit en dur ici serait
// périmé au premier compte créé pour de vrai.
const equipeDepart = ((await principal.client.rpc("admins_equipe")).data ?? []).length;

/* ---------- 1. La liste de l'équipe ---------- */
{
  const { data } = await principal.client.rpc("admins_equipe");
  const moi = (data ?? [])[0];
  test("admins_equipe() rend l'équipe au compte principal", (data ?? []).length >= 1, `${data?.length} compte(s)`);
  test("Le compte principal est marqué comme tel", moi?.principal === true);
  test("Le compte principal détient les 10 permissions", moi?.permissions?.length === 10, `${moi?.permissions?.length}`);
  test("La dernière connexion remonte de auth.users", !!moi?.derniere_connexion);
}

/* ---------- 2. Un non-administrateur ne voit rien, ne peut rien ---------- */
{
  const patient = await ouvrirSession("patient1@test.docteur224.com", "test1234");
  const { data } = await patient.client.rpc("admins_equipe");
  test("Patient → admins_equipe() : liste vide", (data ?? []).length === 0);
  const r = await patient.appel("/api/admin/equipe", {
    method: "POST",
    body: JSON.stringify({ nomComplet: "Pirate", email: "pirate@x.com", motDePasse: "12345678", permissions: [] }),
  });
  test("Patient → POST /api/admin/equipe : 403", r.status === 403, `HTTP ${r.status}`);
}

/* ---------- 3. Création d'un compte administrateur ---------- */
{
  const r = await principal.appel("/api/admin/equipe", {
    method: "POST",
    body: JSON.stringify({
      nomComplet: "Modérateur Test",
      email: emailNouveau,
      motDePasse: MDP_NOUVEAU,
      permissions: ["validations", "moderation", "etablissements"],
    }),
  });
  const corps = await r.json();
  idNouveau = corps.id;
  test("Création d'un compte administrateur", r.ok && !!idNouveau, corps.erreur ?? emailNouveau);

  const { data: u } = await service
    .from("utilisateurs")
    .select("role, statut, sous_roles_admin, admin_principal, prenom, nom")
    .eq("id", idNouveau ?? "00000000-0000-0000-0000-000000000000")
    .maybeSingle();
  test("Le profil est créé avec le rôle admin", u?.role === "admin" && u?.statut === "actif");
  test("Les permissions demandées sont enregistrées", u?.sous_roles_admin?.length === 3, u?.sous_roles_admin?.join(", "));
  test("Le nouveau compte n'est pas principal", u?.admin_principal === false);
  test("Le nom complet est éclaté en prénom + nom", u?.prenom === "Modérateur" && u?.nom === "Test");
}

/* ---------- 4. Refus à la création ---------- */
{
  const r1 = await principal.appel("/api/admin/equipe", {
    method: "POST",
    body: JSON.stringify({ nomComplet: "Doublon", email: emailNouveau, motDePasse: "12345678", permissions: [] }),
  });
  test("Adresse déjà utilisée : refusée", r1.status === 409, `HTTP ${r1.status}`);

  const r2 = await principal.appel("/api/admin/equipe", {
    method: "POST",
    body: JSON.stringify({ nomComplet: "Court", email: `court.${Date.now()}@x.com`, motDePasse: "1234", permissions: [] }),
  });
  test("Mot de passe trop court : refusé", r2.status === 400, `HTTP ${r2.status}`);

  const r3 = await principal.appel("/api/admin/equipe", {
    method: "POST",
    body: JSON.stringify({
      nomComplet: "Inventif",
      email: `inventif.${Date.now()}@x.com`,
      motDePasse: "12345678",
      permissions: ["tout_pouvoir"],
    }),
  });
  test("Permission inventée : refusée", r3.status === 400, `HTTP ${r3.status}`);
}

/* ---------- 5. Ce que le nouvel administrateur peut, et ne peut pas ---------- */
const nouveau = await ouvrirSession(emailNouveau, MDP_NOUVEAU);
{
  const { data } = await nouveau.client.rpc("admins_equipe");
  test(
    "Le nouvel admin voit l'équipe",
    (data ?? []).length === equipeDepart + 1,
    `${data?.length} compte(s)`
  );

  // Pas la permission « Équipe admin » : la RLS refuse sans lever d'erreur.
  const { data: maj } = await nouveau.client
    .from("utilisateurs")
    .update({ sous_roles_admin: ["finance"] })
    .eq("id", (await principal.client.auth.getUser()).data.user.id)
    .select("id");
  test("Sans « Équipe admin » : modifier les droits d'un autre est refusé", (maj ?? []).length === 0);

  const { error: eSoi } = await nouveau.client
    .from("utilisateurs")
    .update({ sous_roles_admin: ["finance", "equipe"] })
    .eq("id", idNouveau)
    .select("id");
  test("S'auto-attribuer des permissions est refusé", !!eSoi, eSoi?.message?.slice(0, 60));

  // Pas la permission « Paramètres » : l'écriture du référentiel est fermée.
  const { data: ville } = await nouveau.client
    .from("villes")
    .insert({ nom: `Ville test ${Date.now()}` })
    .select("id");
  test("Sans « Paramètres » : ajouter une ville est refusé", !ville || ville.length === 0);

  // Pas la permission « Journal d'audit » : la lecture est fermée.
  const { data: audit } = await nouveau.client.from("journal_audit").select("id").limit(5);
  test("Sans « Journal d'audit » : le journal est vide", (audit ?? []).length === 0);

  // Mais il a « Modération » : les signalements lui sont ouverts en écriture.
  const { error: eSignalement } = await nouveau.client
    .from("signalements")
    .update({ statut: "en_cours" })
    .eq("id", "00000000-0000-0000-0000-000000000000");
  test("Avec « Modération » : l'écriture des signalements ne lève rien", !eSignalement);

  const r = await nouveau.appel("/api/admin/equipe", {
    method: "POST",
    body: JSON.stringify({ nomComplet: "X Y", email: `x.${Date.now()}@x.com`, motDePasse: "12345678", permissions: [] }),
  });
  test("Sans « Équipe admin » : POST /api/admin/equipe → 403", r.status === 403, `HTTP ${r.status}`);
}

/* ---------- 6. Le compte principal règle les permissions ---------- */
{
  const { data } = await principal.client
    .from("utilisateurs")
    .update({ sous_roles_admin: ["utilisateurs", "messagerie"] })
    .eq("id", idNouveau)
    .select("id");
  test("Le compte principal modifie les permissions d'un autre admin", (data ?? []).length === 1);

  const { data: u } = await service
    .from("utilisateurs")
    .select("sous_roles_admin")
    .eq("id", idNouveau)
    .maybeSingle();
  test("Les nouvelles permissions sont bien en base", u?.sous_roles_admin?.join(",") === "utilisateurs,messagerie", u?.sous_roles_admin?.join(","));

  const { error } = await principal.client
    .from("utilisateurs")
    .update({ sous_roles_admin: ["equipe", "hors_catalogue"] })
    .eq("id", idNouveau)
    .select("id");
  test("Une permission hors catalogue est refusée par la base", !!error, error?.message?.slice(0, 50));

  const { error: ePrincipal } = await principal.client
    .from("utilisateurs")
    .update({ admin_principal: true })
    .eq("id", idNouveau)
    .select("id");
  test("Désigner un autre compte principal est refusé", !!ePrincipal, ePrincipal?.message?.slice(0, 60));
}

/* ---------- 7. Désactivation, puis réactivation ---------- */
{
  const r = await principal.appel(`/api/admin/equipe/${idNouveau}`, {
    method: "PATCH",
    body: JSON.stringify({ actif: false }),
  });
  test("Désactivation du compte", r.ok, `HTTP ${r.status}`);

  const { data: u } = await service.from("utilisateurs").select("statut").eq("id", idNouveau).maybeSingle();
  test("Le statut passe à « suspendu »", u?.statut === "suspendu", u?.statut);

  const banni = createClient(URL_SB, ANON, { auth: { persistSession: false } });
  const { error } = await banni.auth.signInWithPassword({ email: emailNouveau, password: MDP_NOUVEAU });
  test("Un compte désactivé ne peut plus se connecter", !!error, error?.message);

  const r2 = await principal.appel(`/api/admin/equipe/${idNouveau}`, {
    method: "PATCH",
    body: JSON.stringify({ actif: true }),
  });
  test("Réactivation du compte", r2.ok, `HTTP ${r2.status}`);
  const { error: e2 } = await createClient(URL_SB, ANON, { auth: { persistSession: false } })
    .auth.signInWithPassword({ email: emailNouveau, password: MDP_NOUVEAU });
  test("Le compte réactivé se reconnecte", !e2, e2?.message);
}

/* ---------- 8. Ce que personne ne peut faire ---------- */
{
  const moi = (await principal.client.auth.getUser()).data.user.id;
  const r1 = await principal.appel(`/api/admin/equipe/${moi}`, {
    method: "PATCH",
    body: JSON.stringify({ actif: false }),
  });
  test("Se désactiver soi-même : refusé", r1.status === 400, `HTTP ${r1.status}`);

  const r2 = await principal.appel(`/api/admin/equipe/${moi}`, { method: "DELETE" });
  test("Supprimer son propre compte : refusé", r2.status === 400, `HTTP ${r2.status}`);

  // Le compte principal vu par un autre administrateur muni de « Équipe admin ».
  await service.from("utilisateurs").update({ sous_roles_admin: ["equipe"] }).eq("id", idNouveau);
  const complice = await ouvrirSession(emailNouveau, MDP_NOUVEAU);
  const r3 = await complice.appel(`/api/admin/equipe/${moi}`, { method: "DELETE" });
  test("Supprimer le compte principal : refusé", r3.status === 403, `HTTP ${r3.status}`);
  const { error } = await complice.client
    .from("utilisateurs")
    .update({ sous_roles_admin: ["audit"] })
    .eq("id", moi)
    .select("id");
  test("Rétrograder le compte principal : refusé", !!error, error?.message?.slice(0, 60));
}

/* ---------- 9. Suppression ---------- */
{
  const r = await principal.appel(`/api/admin/equipe/${idNouveau}`, { method: "DELETE" });
  test("Suppression du compte administrateur", r.ok, `HTTP ${r.status}`);

  const { data: u } = await service
    .from("utilisateurs")
    .select("statut, email, sous_roles_admin")
    .eq("id", idNouveau)
    .maybeSingle();
  test("Le compte est anonymisé et fermé", u?.statut === "supprime" && u?.email?.startsWith("supprime-"), u?.email);
  test("Ses permissions sont retirées", (u?.sous_roles_admin ?? []).length === 0);

  const { data: liste } = await principal.client.rpc("admins_equipe");
  test("Il disparaît de la liste de l'équipe", !(liste ?? []).some((a) => a.id === idNouveau));

  const { data: trace } = await service
    .from("journal_audit")
    .select("action")
    .eq("cible_id", idNouveau)
    .order("cree_le");
  test(
    "Le journal d'audit garde la trace des quatre décisions",
    (trace ?? []).length === 4,
    (trace ?? []).map((t) => t.action).join(" | ")
  );
}

/* ---------- Nettoyage ---------- */
if (idNouveau) {
  await service.from("journal_audit").delete().eq("cible_id", idNouveau);
  await service.auth.admin.deleteUser(idNouveau);
  await service.from("utilisateurs").delete().eq("id", idNouveau);
}

console.log(echecs === 0 ? "\n✅ Tous les tests passent." : `\n❌ ${echecs} test(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
