/*
 * Vérification de « Mot de passe oublié » dans Chrome piloté (CDP), sans
 * dépendance — ordinateur 1280 px et téléphone 390 px.
 *
 *   - /connexion et /espace-admin/connexion portent un lien ACTIF vers
 *     /mot-de-passe-oublie (c'est précisément ce qui manquait : le libellé
 *     était là, désactivé) ;
 *   - la demande répond la même chose pour une adresse inconnue et pour un
 *     compte existant — un écran qui distinguerait les deux dirait qui est
 *     inscrit chez un service de santé ;
 *   - l'écran du nouveau mot de passe refuse un mot trop court, deux saisies
 *     différentes, un lien sans jeton et un jeton périmé, chaque fois avec un
 *     message en français et une sortie vers une nouvelle demande ;
 *   - aucune erreur console, aucun défilement horizontal sur téléphone.
 *
 * AUCUN COURRIEL NE PART : le compte de démonstration utilisé porte une
 * adresse `@test.docteur224.com`, que `email_destinataire` (migration 0060)
 * exclut de tout envoi. Le script le vérifie d'ailleurs en base à la fin.
 *
 * Prérequis : npx next build && npx next start -p <port>
 * Usage     : APP_URL=http://localhost:3994 node scripts/verif-mot-de-passe.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = process.env.APP_URL ?? "http://localhost:3994";
const PORT = 9341;
const ICI = path.join(os.tmpdir(), "docteur224-verif-mot-de-passe");
const OUT = path.join(ICI, "captures");
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COMPTE_DEMO = "patient1@test.docteur224.com";
const INCONNUE = "personne-sans-compte@exemple.invalid";
/* Le temps de la vérification seulement : le mot de passe d'origine est remis
 * à la fin, les autres scripts s'y connectent. */
const MDP_ORIGINE = "test1234";
const MDP_PROVISOIRE = "essai-mdp-224";

/** Variables d'environnement du projet, lues comme partout ailleurs ici. */
function env() {
  return Object.fromEntries(
    readFileSync(new URL("../.env.local", import.meta.url), "utf8")
      .split("\n").filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
}

function creerAdmin() {
  const e = env();
  return createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

let echecs = 0;
const check = (label, ok, detail = "") => {
  if (!ok) echecs++;
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
};

class Page {
  constructor(sessionId, cdp, targetId) {
    Object.assign(this, { s: sessionId, cdp, targetId, console: [], tactile: false });
    cdp.on("Runtime.exceptionThrown", sessionId, (p) =>
      this.console.push(p.exceptionDetails.exception?.description?.split("\n")[0] ?? p.exceptionDetails.text));
    cdp.on("Runtime.consoleAPICalled", sessionId, (p) => {
      if (p.type === "error") this.console.push(p.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 160));
    });
  }
  send(m, p) { return this.cdp.send(m, p, this.s); }
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
  async waitFor(expression, timeout = 20000) {
    const debut = Date.now();
    while (Date.now() - debut < timeout) {
      if (await this.eval(`!!(${expression})`).catch(() => false)) return true;
      await sleep(150);
    }
    return false;
  }
  async taille(largeur, hauteur, tactile) {
    this.tactile = tactile;
    await this.send("Emulation.setDeviceMetricsOverride", { width: largeur, height: hauteur, deviceScaleFactor: 1, mobile: tactile });
    await this.send("Emulation.setTouchEmulationEnabled", tactile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    await sleep(300);
  }
  async goto(url) {
    await this.send("Page.navigate", { url });
    await sleep(700);
    await this.waitFor("document.readyState === 'complete'");
    await sleep(900);
  }
  async cliquer(expression) {
    const r = await this.eval(`(() => { const el = ${expression}; if (!el) return null; el.scrollIntoView({ block: 'center', behavior: 'instant' });
      const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    if (!r) throw new Error(`introuvable : ${expression}`);
    if (this.tactile) {
      await this.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: r.x, y: r.y }] });
      await this.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
        await this.send("Input.dispatchMouseEvent", { type, x: r.x, y: r.y, button: "left", clickCount: 1 });
      }
    }
    await sleep(500);
  }
  async remplir(selecteur, texte) {
    await this.eval(`[...document.querySelectorAll('${selecteur}')].find(e => e.offsetParent)?.focus()`);
    await this.eval(`(() => { const e = document.activeElement; const p = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      p.call(e, ''); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await this.send("Input.insertText", { text: texte });
    await sleep(150);
  }
  async shot(nom) {
    const r = await this.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path.join(OUT, `${nom}.png`), Buffer.from(r.data, "base64"));
  }
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.attente = new Map(); this.ecouteurs = [];
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.attente.has(m.id)) {
        const { res, rej } = this.attente.get(m.id); this.attente.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      } else if (m.method) for (const e of this.ecouteurs) if (e.method === m.method && e.s === m.sessionId) e.fn(m.params);
    };
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((res, rej) => this.attente.set(id, { res, rej }));
  }
  on(method, s, fn) { this.ecouteurs.push({ method, s, fn }); }
}

async function onglet(cdp, ancienne) {
  if (ancienne) await cdp.send("Target.closeTarget", { targetId: ancienne.targetId }).catch(() => {});
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const p = new Page(sessionId, cdp, targetId);
  await p.send("Page.enable");
  await p.send("Runtime.enable");
  await p.send("Network.enable");
  return p;
}

/** Le lien « Mot de passe oublié ? » visible à l'écran, quel qu'en soit le rendu. */
const LIEN_OUBLI =
  `[...document.querySelectorAll('a, button')].find(e => e.offsetParent && /Mot de passe oubli/i.test(e.textContent))`;
const TEXTE = "document.body.innerText";
/* Le message d'erreur LUI-MÊME, et non le texte de la page : celle-ci annonce
 * déjà « au moins 8 caractères » en consigne, ce qui ferait passer pour un
 * refus une page qui n'a rien refusé du tout. */
const ALERTE = `(document.querySelector('[role=alert]')?.innerText ?? '')`;

async function main() {
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(ICI, "profil")}`, "--headless=new",
    "--password-store=basic", "--no-first-run", "--disable-gpu", "--hide-scrollbars", "about:blank",
  ], { stdio: "ignore" });
  let version;
  for (let i = 0; i < 50 && !version; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(200); }
  }
  if (!version) throw new Error("Chrome ne répond pas");
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  const cdp = new CDP(ws);
  let page = await onglet(cdp);

  try {
    for (const [nom, largeur, hauteur, tactile] of [
      ["1280", 1280, 900, false],
      ["390", 390, 844, true],
    ]) {
      console.log(`\n── ${nom} px ──`);
      await page.taille(largeur, hauteur, tactile);

      /* ---------- 1 · Le lien existe et mène quelque part ---------- */
      await page.goto(`${APP}/connexion`);
      page.console = [];
      const actif = await page.eval(
        `(() => { const e = ${LIEN_OUBLI}; return e ? { tag: e.tagName, desactive: !!e.disabled, href: e.getAttribute('href') } : null; })()`);
      check(`[${nom}] /connexion : le lien est là`, !!actif, JSON.stringify(actif));
      check(`[${nom}] /connexion : il n'est plus désactivé`, actif && !actif.desactive);
      check(`[${nom}] /connexion : il pointe vers la demande`, actif?.href === "/mot-de-passe-oublie", actif?.href ?? "");
      await page.cliquer(LIEN_OUBLI);
      check(`[${nom}] /connexion : le clic y mène`,
        await page.waitFor(`location.pathname === '/mot-de-passe-oublie'`), await page.eval("location.pathname"));
      await page.shot(`${nom}-demande`);

      /* ---------- 2 · La demande ne dit jamais qui est inscrit ---------- */
      await page.remplir('input[type="email"]', INCONNUE);
      await page.cliquer(`[...document.querySelectorAll('button')].find(b => b.offsetParent && /Recevoir le lien/.test(b.textContent))`);
      const repondu = await page.waitFor(`/un message vient/i.test(${TEXTE})`, 20000);
      check(`[${nom}] adresse inconnue : confirmation neutre`, repondu, (await page.eval(TEXTE)).slice(0, 120));
      check(`[${nom}] adresse inconnue : rien ne révèle l'absence de compte`,
        !/introuvable|aucun compte|n'existe pas/i.test(await page.eval(TEXTE)));
      await page.shot(`${nom}-demande-envoyee`);

      await page.goto(`${APP}/mot-de-passe-oublie`);
      await page.remplir('input[type="email"]', COMPTE_DEMO);
      await page.cliquer(`[...document.querySelectorAll('button')].find(b => b.offsetParent && /Recevoir le lien/.test(b.textContent))`);
      const memeReponse = await page.waitFor(`/un message vient/i.test(${TEXTE})`, 20000);
      check(`[${nom}] compte existant : exactement la même réponse`, memeReponse);

      /* ---------- 3 · Le nouveau mot de passe ---------- */
      await page.goto(`${APP}/mot-de-passe-oublie/nouveau`);
      await page.remplir("#mdp-nouveau", "court");
      await page.remplir("#mdp-confirme", "court");
      await page.cliquer(`[...document.querySelectorAll('button')].find(b => b.offsetParent && /Enregistrer/.test(b.textContent))`);
      check(`[${nom}] un mot de passe trop court est refusé`,
        /8 caractères/i.test(await page.eval(ALERTE)), await page.eval(ALERTE));

      await page.remplir("#mdp-nouveau", "motdepasse1");
      await page.remplir("#mdp-confirme", "motdepasse2");
      await page.cliquer(`[...document.querySelectorAll('button')].find(b => b.offsetParent && /Enregistrer/.test(b.textContent))`);
      check(`[${nom}] deux saisies différentes sont refusées`,
        /ne sont pas identiques/i.test(await page.eval(ALERTE)), await page.eval(ALERTE));

      await page.remplir("#mdp-confirme", "motdepasse1");
      await page.cliquer(`[...document.querySelectorAll('button')].find(b => b.offsetParent && /Enregistrer/.test(b.textContent))`);
      check(`[${nom}] un lien sans jeton le dit`,
        /lien est incomplet/i.test(await page.eval(ALERTE)), await page.eval(ALERTE));
      check(`[${nom}] …et propose d'en demander un autre`,
        await page.eval(`!!document.querySelector('[role=alert] a[href="/mot-de-passe-oublie"]')`));

      await page.goto(`${APP}/mot-de-passe-oublie/nouveau?jeton=jeton-qui-ne-vaut-rien`);
      await page.remplir("#mdp-nouveau", "motdepasse1");
      await page.remplir("#mdp-confirme", "motdepasse1");
      await page.cliquer(`[...document.querySelectorAll('button')].find(b => b.offsetParent && /Enregistrer/.test(b.textContent))`);
      const perime = await page.waitFor(`/plus valable/i.test(${ALERTE})`, 20000);
      check(`[${nom}] un jeton périmé ou faux est refusé en français`, perime, await page.eval(ALERTE));
      await page.shot(`${nom}-jeton-refuse`);

      /* ---------- 4 · La console d'administration ---------- */
      await page.goto(`${APP}/espace-admin/connexion`);
      const lienAdmin = await page.eval(`(() => { const e = ${LIEN_OUBLI}; return e ? e.getAttribute('href') : null; })()`);
      check(`[${nom}] la console d'administration propose le même lien`,
        lienAdmin === "/mot-de-passe-oublie", lienAdmin ?? "absent");

      if (tactile) {
        await page.goto(`${APP}/mot-de-passe-oublie`);
        check(`[${nom}] aucun défilement horizontal`,
          !(await page.eval("document.documentElement.scrollWidth > innerWidth + 1")));
      }

      const bruit = page.console.filter((l) => !/favicon|Multiple GoTrueClient/i.test(l));
      check(`[${nom}] aucune erreur console`, bruit.length === 0, bruit.slice(0, 2).join(" | "));
      page = await onglet(cdp, page);
    }

    /* ---------- 5 · Un VRAI jeton, jusqu'au bout ---------- */
    /*
     * C'est le seul endroit où le dispositif est éprouvé en entier : jeton
     * fabriqué comme la route le fabrique, formulaire, changement effectif,
     * puis connexion avec le nouveau mot de passe. Toujours sans courriel —
     * `generateLink` n'envoie rien, il ne fait que produire le jeton.
     *
     * Le mot de passe du compte de démonstration est rendu à sa valeur
     * d'origine à la fin : les autres vérifications s'y connectent.
     */
    console.log("\n── un vrai lien ──");
    const admin = creerAdmin();
    const { data: lien, error: eLien } = await admin.auth.admin.generateLink({
      type: "recovery", email: COMPTE_DEMO,
    });
    check("un jeton de récupération est fabriqué", !!lien?.properties?.hashed_token, eLien?.message ?? "");
    const jeton = lien?.properties?.hashed_token;
    if (jeton) {
      await page.taille(1280, 900, false);
      await page.goto(`${APP}/mot-de-passe-oublie/nouveau?jeton=${encodeURIComponent(jeton)}`);
      page.console = [];
      await page.remplir("#mdp-nouveau", MDP_PROVISOIRE);
      await page.remplir("#mdp-confirme", MDP_PROVISOIRE);
      await page.cliquer(`[...document.querySelectorAll('button')].find(b => b.offsetParent && /Enregistrer/.test(b.textContent))`);
      const change = await page.waitFor(`/mot de passe a été modifié/i.test(${TEXTE})`, 25000);
      check("le mot de passe est changé", change, (await page.eval(TEXTE)).slice(-200));
      await page.shot("1280-change");
      check("l'écran renvoie vers la bonne porte",
        (await page.eval(`document.querySelector('a[href="/connexion"]')?.getAttribute('href')`)) === "/connexion");
      check("la session de récupération est refermée",
        !(await page.eval("document.cookie.includes('sb-')")), await page.eval("document.cookie"));

      // Le même lien, une seconde fois : un jeton de récupération ne sert qu'une fois.
      await page.goto(`${APP}/mot-de-passe-oublie/nouveau?jeton=${encodeURIComponent(jeton)}`);
      await page.remplir("#mdp-nouveau", MDP_PROVISOIRE);
      await page.remplir("#mdp-confirme", MDP_PROVISOIRE);
      await page.cliquer(`[...document.querySelectorAll('button')].find(b => b.offsetParent && /Enregistrer/.test(b.textContent))`);
      check("le lien ne resservira pas", await page.waitFor(`/plus valable/i.test(${ALERTE})`, 25000),
        await page.eval(ALERTE));

      // …et le nouveau mot de passe ouvre bien la porte.
      page = await onglet(cdp, page);
      await page.taille(1280, 900, false);
      await page.goto(`${APP}/connexion`);
      await page.remplir('input[type="email"]', COMPTE_DEMO);
      await page.remplir('input[type="password"]', MDP_PROVISOIRE);
      await page.cliquer(`[...document.querySelectorAll('button')].find(b => b.offsetParent && /S.identifier/.test(b.textContent))`);
      check("on se connecte avec le nouveau mot de passe",
        await page.waitFor(`location.pathname.startsWith('/patient')`, 30000),
        await page.eval("location.pathname"));

      const { data: compte } = await admin.from("utilisateurs").select("id").eq("email", COMPTE_DEMO).maybeSingle();
      const { error: eRetour } = await admin.auth.admin.updateUserById(compte.id, { password: MDP_ORIGINE });
      check("le compte de démonstration retrouve son mot de passe", !eRetour, eRetour?.message ?? "");
    }
  } finally {
    try { chrome.kill(); } catch { /* déjà fermé */ }
  }

  /* ---------- 5 · Et rien n'a été mis en file pour le compte de démo ---------- */
  const e = env();
  const ref = new URL(e.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const bdd = new Client({
    host: `db.${ref}.supabase.co`, user: "postgres", port: 5432,
    password: e.SUPABASE_DB_PASSWORD, database: "postgres",
    ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000,
  });
  await bdd.connect();
  const { rows } = await bdd.query(
    `select count(*)::int as n from emails_en_attente
     where type = 'mot_de_passe_oublie' and cree_le > now() - interval '30 minutes'`);
  await bdd.end();
  check("aucun courriel n'a été mis en file pendant la vérification", rows[0].n === 0, `${rows[0].n} ligne(s)`);

  console.log(`\nCaptures : ${OUT}`);
  console.log(echecs === 0 ? "\n✅ Tout est passé." : `\n❌ ${echecs} vérification(s) en échec.`);
  process.exit(echecs === 0 ? 0 : 1);
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
