/*
 * Tests du changement de mot de passe du compte PRINCIPAL
 * (route /api/admin/equipe/mot-de-passe).
 *
 * Ce que ces tests cherchent d'abord, ce sont les REFUS : la route touche au
 * seul compte que personne ne peut désactiver, et une permission « equipe »
 * qui donnerait ce pouvoir vaudrait la plateforme entière.
 *
 * Le mot de passe réel est changé puis REMIS À SA VALEUR D'ORIGINE par la
 * route elle-même (dernier scénario). Le filet de sécurité est en fin de
 * fichier : quoi qu'il arrive, la clé service_role le restaure.
 *
 * Prérequis : `npx next build && npx next start -p 3987`.
 * Usage : MDP_PRINCIPAL=… node scripts/test-mot-de-passe-principal.mjs
 *
 * Le mot de passe du compte principal n'est PAS écrit ici : il arrive par la
 * variable d'environnement `MDP_PRINCIPAL`, ou par la clé du même nom dans
 * `.env.local`. Un secret dans un fichier suivi par Git est un secret publié.
 */
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const lire = (cle) => env.match(new RegExp(`^${cle}=(.*)$`, "m"))?.[1].trim();
const URL_SB = lire("NEXT_PUBLIC_SUPABASE_URL");
const ANON = lire("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const APP = process.env.APP ?? "http://localhost:3987";

const service = createClient(URL_SB, lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

let echecs = 0;
const test = (nom, ok, detail) => {
  if (!ok) echecs++;
  console.log(`${ok ? "✅" : "❌"} ${nom}${detail ? ` — ${detail}` : ""}`);
};

const EMAIL_PRINCIPAL = process.env.EMAIL_PRINCIPAL ?? lire("EMAIL_PRINCIPAL") ?? "admin@docteur224.com";
const MDP_ORIGINE = process.env.MDP_PRINCIPAL ?? lire("MDP_PRINCIPAL");
if (!MDP_ORIGINE) {
  console.error(
    "Mot de passe du compte principal absent : passez MDP_PRINCIPAL=… en variable\n" +
      "d'environnement, ou ajoutez la ligne MDP_PRINCIPAL=… dans .env.local (pas d'espaces\n" +
      "autour du =). Rien n'a été touché."
  );
  process.exit(1);
}
const MDP_TEMPORAIRE = `Temporaire-${Date.now()}`;
const CHEMIN = "/api/admin/equipe/mot-de-passe";

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

  const entete = () => [...bocal].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");
  /*
   * Un navigateur garde les cookies que la réponse lui pose. Sans cela, le
   * scénario raterait justement ce que la route fait de mieux : reposer la
   * session après un changement de mot de passe.
   */
  const appel = async (chemin, init = {}) => {
    const r = await fetch(`${APP}${chemin}`, {
      ...init,
      headers: { "Content-Type": "application/json", cookie: entete(), ...(init.headers ?? {}) },
    });
    for (const brut of r.headers.getSetCookie?.() ?? []) {
      const [paire] = brut.split(";");
      const coupe = paire.indexOf("=");
      if (coupe > 0) {
        bocal.set(paire.slice(0, coupe).trim(), decodeURIComponent(paire.slice(coupe + 1)));
      }
    }
    return r;
  };
  return { client, appel, cookiesPoses: () => [...bocal.keys()] };
}

/** La connexion passe-t-elle avec ce mot de passe ? (client jetable) */
async function connexionPossible(email, motDePasse) {
  const c = createClient(URL_SB, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password: motDePasse });
  return !error;
}

const idAutre = { valeur: null };
let mdpCourant = MDP_ORIGINE;

try {
  const principal = await ouvrirSession(EMAIL_PRINCIPAL, MDP_ORIGINE);
  const { data: moi } = await service
    .from("utilisateurs")
    .select("id, admin_principal")
    .eq("email", EMAIL_PRINCIPAL)
    .maybeSingle();
  test("Le compte de référence est bien le compte principal", moi?.admin_principal === true);

  /* ---------- 1. Sans session ---------- */
  {
    const r = await fetch(`${APP}${CHEMIN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actuel: MDP_ORIGINE, nouveau: "peu importe 12" }),
    });
    test("Sans session → 401", r.status === 401, `HTTP ${r.status}`);
  }

  /* ---------- 2. Un patient ---------- */
  {
    const patient = await ouvrirSession("patient1@test.docteur224.com", "test1234");
    const r = await patient.appel(CHEMIN, {
      method: "POST",
      body: JSON.stringify({ actuel: "test1234", nouveau: "autrechose12" }),
    });
    test("Patient → 403", r.status === 403, `HTTP ${r.status}`);
    test(
      "Le mot de passe du patient n'a pas bougé",
      await connexionPossible("patient1@test.docteur224.com", "test1234")
    );
  }

  /* ---------- 3. Un administrateur NON principal ---------- */
  {
    const email = `mdp.test.${Date.now()}@docteur224.com`;
    const mdp = "equipe1234";
    const creation = await principal.appel("/api/admin/equipe", {
      method: "POST",
      body: JSON.stringify({
        nomComplet: "Second Test",
        email,
        motDePasse: mdp,
        permissions: ["equipe"],
      }),
    });
    const corps = await creation.json();
    idAutre.valeur = corps.id ?? null;
    test("Compte admin de test créé (permission « equipe »)", creation.ok && !!idAutre.valeur, corps.erreur ?? email);

    const autre = await ouvrirSession(email, mdp);
    const r = await autre.appel(CHEMIN, {
      method: "POST",
      body: JSON.stringify({ actuel: mdp, nouveau: "elevation1234" }),
    });
    test("Admin non principal, même avec la permission « equipe » → 403", r.status === 403, `HTTP ${r.status}`);
    test(
      "Le mot de passe du compte principal n'a pas bougé",
      await connexionPossible(EMAIL_PRINCIPAL, MDP_ORIGINE)
    );
    test("Son propre mot de passe n'a pas bougé non plus", await connexionPossible(email, mdp));
  }

  /* ---------- 4. Le principal, mais l'ancien mot de passe est faux ---------- */
  {
    const r = await principal.appel(CHEMIN, {
      method: "POST",
      body: JSON.stringify({ actuel: "pas-le-bon-mdp", nouveau: MDP_TEMPORAIRE }),
    });
    const corps = await r.json();
    test("Ancien mot de passe faux → 403", r.status === 403, `HTTP ${r.status}`);
    test("Le message nomme la cause", /actuel/i.test(corps.erreur ?? ""), corps.erreur);
    test(
      "Le mot de passe est intact après le refus",
      await connexionPossible(EMAIL_PRINCIPAL, MDP_ORIGINE)
    );
  }

  /* ---------- 5. Refus de forme ---------- */
  {
    const court = await principal.appel(CHEMIN, {
      method: "POST",
      body: JSON.stringify({ actuel: MDP_ORIGINE, nouveau: "court" }),
    });
    test("Nouveau mot de passe trop court → 400", court.status === 400, `HTTP ${court.status}`);

    const identique = await principal.appel(CHEMIN, {
      method: "POST",
      body: JSON.stringify({ actuel: MDP_ORIGINE, nouveau: MDP_ORIGINE }),
    });
    test("Nouveau identique à l'ancien → 400", identique.status === 400, `HTTP ${identique.status}`);

    const vide = await principal.appel(CHEMIN, {
      method: "POST",
      body: JSON.stringify({ actuel: "", nouveau: "" }),
    });
    test("Champs vides → 400", vide.status === 400, `HTTP ${vide.status}`);
    test(
      "Aucun de ces refus n'a touché au mot de passe",
      await connexionPossible(EMAIL_PRINCIPAL, MDP_ORIGINE)
    );
  }

  /* ---------- 6. Le changement, pour de vrai ---------- */
  {
    const avant = new Date().toISOString();
    const r = await principal.appel(CHEMIN, {
      method: "POST",
      body: JSON.stringify({ actuel: MDP_ORIGINE, nouveau: MDP_TEMPORAIRE }),
    });
    const corps = await r.json();
    test("Changement accepté", r.ok && corps.ok === true, corps.erreur ?? "");
    if (r.ok) mdpCourant = MDP_TEMPORAIRE;
    test("La réponse annonce une session reposée", corps.session === true);

    test("Le nouveau mot de passe ouvre la session", await connexionPossible(EMAIL_PRINCIPAL, MDP_TEMPORAIRE));
    test("L'ancien ne fonctionne plus", !(await connexionPossible(EMAIL_PRINCIPAL, MDP_ORIGINE)));

    // La session en cours reste valable : l'administrateur ne doit pas être
    // éjecté de la console au moment où il change son mot de passe.
    const encore = await principal.appel("/api/admin/equipe", { method: "POST", body: "{}" });
    test("La session en cours survit au changement", encore.status !== 401, `HTTP ${encore.status}`);

    const { data: audit } = await service
      .from("journal_audit")
      .select("action, acteur_id, cible_id, cree_le")
      .eq("acteur_id", moi.id)
      .gte("cree_le", avant)
      .order("cree_le", { ascending: false })
      .limit(5);
    const trace = (audit ?? []).find((l) => /mot de passe/i.test(l.action));
    test("Le geste est inscrit au journal d'audit", !!trace, trace?.action);

    const { data: courriels } = await service
      .from("emails_en_attente")
      .select("type, titre, lien, categorie, envoye_le, cree_le")
      .eq("destinataire_id", moi.id)
      .eq("type", "mot_de_passe_modifie")
      .gte("cree_le", avant)
      .limit(5);
    const avis = (courriels ?? [])[0];
    test("Un avis a été déposé en file", !!avis, avis?.titre);
    test("L'avis ne contient AUCUN lien", !!avis && avis.lien === null);
    test("L'avis est en catégorie « service » (non désabonnable)", avis?.categorie === "service");
    test("L'avis a quitté la file (drainé sur place)", !!avis?.envoye_le, avis?.envoye_le ?? "toujours en attente");
  }

  /* ---------- 7. Retour à la valeur d'origine, par la route ---------- */
  {
    const session = await ouvrirSession(EMAIL_PRINCIPAL, MDP_TEMPORAIRE);
    const r = await session.appel(CHEMIN, {
      method: "POST",
      body: JSON.stringify({ actuel: MDP_TEMPORAIRE, nouveau: MDP_ORIGINE }),
    });
    const corps = await r.json();
    test("Retour au mot de passe d'origine", r.ok && corps.ok === true, corps.erreur ?? "");
    if (r.ok) mdpCourant = MDP_ORIGINE;
    test("Le mot de passe d'origine fonctionne de nouveau", await connexionPossible(EMAIL_PRINCIPAL, MDP_ORIGINE));
  }
} finally {
  /*
   * Filet : si un scénario s'est interrompu en route, le mot de passe
   * d'origine est rétabli par la clé service_role. Mieux vaut un test qui
   * échoue qu'un compte principal dont plus personne ne connaît la clé.
   */
  if (mdpCourant !== MDP_ORIGINE) {
    const { data } = await service
      .from("utilisateurs")
      .select("id")
      .eq("email", EMAIL_PRINCIPAL)
      .maybeSingle();
    if (data?.id) {
      await service.auth.admin.updateUserById(data.id, { password: MDP_ORIGINE });
      console.log("⚠️  Mot de passe d'origine rétabli par le filet de sécurité.");
    }
  }
  // Le compte administrateur de test ne doit pas survivre au scénario.
  if (idAutre.valeur) {
    await service.auth.admin.deleteUser(idAutre.valeur).catch(() => {});
    await service.from("utilisateurs").delete().eq("id", idAutre.valeur);
    console.log("Compte admin de test supprimé.");
  }
}

console.log(echecs === 0 ? "\n✅ Tout est conforme." : `\n❌ ${echecs} test(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
