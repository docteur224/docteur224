/*
 * Vérification du numéro de test (migration 0078) dans Chrome piloté (CDP).
 *
 *   - /espace-admin/messagerie : la carte « Numéro de test », la case à cocher,
 *     l'enregistrement, la fermeture du compte de test ;
 *   - côté visiteur : l'encart « Compte de test » sur /connexion et
 *     /inscription/patient, « Utiliser ce numéro », inscription complète avec
 *     le code de test ; l'encart disparaît dès l'option décochée ;
 *   - web 1280 px et mobile 390 px, sans défilement horizontal.
 *
 * Prérequis : npx next build && npx next start -p <port>   (SANS OTP_CODE_VISIBLE)
 * Usage     : APP_URL=http://localhost:3997 node scripts/verif-numero-test.mjs
 *
 * Le réglage trouvé en base est rendu à la fin ; le compte créé est supprimé.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createClient } from "@supabase/supabase-js";
import { EMAIL_PRINCIPAL, exigerMotDePassePrincipal } from "./identifiants.mjs";

const MDP_PRINCIPAL = exigerMotDePassePrincipal();

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = process.env.APP_URL ?? "http://localhost:3997";
const PORT = 9348;
const ICI = path.join(os.tmpdir(), "docteur224-verif-numero-test");
const OUT = path.join(ICI, "captures");
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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

const VIS = `(e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden')`;
const bouton = (re) => `[...document.querySelectorAll("button, a")].find(b => ${VIS}(b) && !b.closest("header, nav") && ${re}.test(b.textContent))`;
const TEXTE = "document.body.innerText";

async function remplirVisible(page, selecteur, texte) {
  await page.eval(`[...document.querySelectorAll(${JSON.stringify(selecteur)})].find(${VIS})?.focus()`);
  await page.eval(`(() => { const e = document.activeElement; const p = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    p.call(e, ''); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await page.send("Input.insertText", { text: texte });
  await sleep(150);
}
async function taperChiffres(page, libelle, valeur) {
  await page.eval(`[...document.querySelectorAll('input[aria-label^=${JSON.stringify(libelle + " — chiffre 1")}]')].find(${VIS})?.focus()`);
  for (const c of valeur) { await page.send("Input.insertText", { text: c }); await sleep(30); }
  await sleep(150);
}
const debordement = (page) => page.eval("document.documentElement.scrollWidth - window.innerWidth");

async function ongletDans(cdp, contexte) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank", ...(contexte ? { browserContextId: contexte } : {}) });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const p = new Page(sessionId, cdp, targetId);
  await p.send("Page.enable");
  await p.send("Runtime.enable");
  await p.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  // window.confirm (« Fermer le compte de test ? ») : accepté.
  cdp.on("Page.javascriptDialogOpening", sessionId, () => p.send("Page.handleJavaScriptDialog", { accept: true }));
  return p;
}

async function main() {
  const { data: origine } = await admin.from("telephone_test").select("actif, numero, code").eq("id", 1).single();
  const numero = "69" + String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
  let idCompte = null;
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(ICI, "profil")}`, "--headless=new",
    "--password-store=basic", "--no-first-run", "--disable-gpu", "--hide-scrollbars", "about:blank",
  ], { stdio: "ignore" });
  let version;
  for (let i = 0; i < 50 && !version; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(200); }
  }
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  const cdp = new CDP(ws);
  try {
    /* ---------- Admin : connexion puis carte « Numéro de test » ---------- */
    const { browserContextId: ctxAdmin } = await cdp.send("Target.createBrowserContext");
    let a = await ongletDans(cdp, ctxAdmin);
    await a.taille(1280, 900, false);
    await a.goto(`${APP}/espace-admin/connexion`);
    await remplirVisible(a, 'input[type="email"]', "admin@docteur224.com");
    await remplirVisible(a, 'input[type="password"]', MDP_PRINCIPAL);
    await a.cliquer(bouton(/Accéder à la console/));
    check("admin connecté", await a.waitFor(`location.pathname.startsWith('/espace-admin') && !location.pathname.includes('connexion')`, 25000));
    a = await ongletDans(cdp, ctxAdmin);
    await a.taille(1280, 900, false);
    await a.goto(`${APP}/espace-admin/messagerie`);
    check("carte « Numéro de test » présente", await a.waitFor(`/Numéro de test \\(connexion par téléphone\\)/.test(${TEXTE}) && !/Chargement…/.test(${TEXTE})`, 25000));
    await remplirVisible(a, 'input[aria-label="Numéro de test"]', numero);
    await remplirVisible(a, 'input[aria-label="Code de test"]', "135790");
    await a.cliquer(bouton(/Enregistrer le numéro et le code/));
    const caseTest = `[...document.querySelectorAll('input[type=checkbox]')].find(e => ${VIS}(e) && e.closest('label')?.textContent.includes('Activer le numéro'))`;
    if (!(await a.eval(`${caseTest}.checked`))) await a.cliquer(caseTest);
    check("option cochée et enregistrée", await a.waitFor(`/Numéro de test activé/.test(${TEXTE})`));
    const { data: enBase } = await admin.from("telephone_test").select("actif, numero, code").eq("id", 1).single();
    check("réglage écrit en base", enBase.actif && enBase.numero === `+224${numero}` && enBase.code === "135790", JSON.stringify(enBase));
    await a.shot("admin-numero-test");

    /* ---------- Visiteur : encart, inscription avec le numéro de test ---------- */
    for (const [nom, l, h, tactile] of [["1280", 1280, 900, false], ["390", 390, 844, true]]) {
      const { browserContextId: ctx } = await cdp.send("Target.createBrowserContext");
      const v = await ongletDans(cdp, ctx);
      await v.taille(l, h, tactile);
      await v.goto(`${APP}/connexion?mode=telephone`);
      check(`[${nom}] /connexion : encart « Compte de test » avec numéro et code`,
        await v.waitFor(`/Compte de test/.test(${TEXTE}) && ${TEXTE}.includes('135790') && ${TEXTE}.includes('${numero.slice(0, 3)} ${numero.slice(3, 5)}')`));
      if (nom === "390") {
        check(`[390] encart : pas de défilement horizontal`, (await debordement(v)) <= 0);
        await v.shot("390-encart-connexion");
        continue;
      }
      await v.goto(`${APP}/inscription/patient?mode=telephone`);
      await v.waitFor(`/Compte de test/.test(${TEXTE})`);
      await v.cliquer(bouton(/Utiliser ce numéro/));
      check(`[${nom}] « Utiliser ce numéro » remplit le champ`,
        (await v.eval(`[...document.querySelectorAll('input[aria-label="Numéro de téléphone"]')].find(${VIS}).value.replace(/\\s/g, '')`)) === numero);
      await v.cliquer(bouton(/^Continuer$/));
      await v.waitFor(`/Recevoir votre code/.test(${TEXTE})`);
      await v.cliquer(bouton(/Envoyer le code/));
      check(`[${nom}] écran du code : « Numéro de test », code affiché`,
        await v.waitFor(`/Numéro de test — aucun message/.test(${TEXTE}) && ${TEXTE}.includes('135790')`), (await v.eval(TEXTE)).slice(0, 300));
      await v.shot("1280-code-test");
      await taperChiffres(v, "Code reçu", "135790");
      await v.cliquer(bouton(/^Vérifier$/));
      check(`[${nom}] code de test accepté`, await v.waitFor(`/Créez votre code PIN/.test(${TEXTE})`));
      await taperChiffres(v, "Nouveau code PIN", "2580");
      await v.cliquer(bouton(/^Continuer$/));
      await v.waitFor(`/Confirmez votre code PIN/.test(${TEXTE})`);
      await taperChiffres(v, "Confirmation du code PIN", "2580");
      await v.cliquer(bouton(/Continuer vers mon profil/));
      await v.waitFor(`/Votre profil/.test(${TEXTE})`);
      await remplirVisible(v, 'input[placeholder="Nom"]', "Test");
      await remplirVisible(v, 'input[placeholder="Prénom"]', "Numéro");
      await v.eval(`(() => { const e = [...document.querySelectorAll('input[type=date]')].find(${VIS}); const p = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; p.call(e, '1990-01-01'); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await v.cliquer(`[...document.querySelectorAll('label')].find(l => ${VIS}(l) && /J'accepte/.test(l.textContent))`);
      await v.cliquer(bouton(/Créer mon compte/));
      check(`[${nom}] compte de test créé → /patient`, await v.waitFor(`location.pathname === '/patient'`, 30000));
      idCompte = (await admin.from("identifiants_telephone").select("utilisateur_id").eq("telephone", `+224${numero}`).maybeSingle()).data?.utilisateur_id ?? null;
      check(`[${nom}] aucune erreur console`, v.console.length === 0, v.console.slice(0, 2).join(" / "));
    }

    /* ---------- Admin : le compte apparaît, on le ferme, on décoche ---------- */
    a = await ongletDans(cdp, ctxAdmin);
    await a.taille(1280, 900, false);
    await a.goto(`${APP}/espace-admin/messagerie`);
    check("admin : le compte ouvert avec le numéro est signalé",
      await a.waitFor(`/Compte ouvert avec ce numéro : Numéro Test/.test(${TEXTE})`, 25000));
    await a.cliquer(bouton(/Fermer le compte de test/));
    check("admin : compte de test fermé", await a.waitFor(`/Compte de test fermé/.test(${TEXTE})`));
    const { count } = await admin.from("identifiants_telephone").select("utilisateur_id", { count: "exact", head: true }).eq("telephone", `+224${numero}`);
    check("le numéro est libéré (inscription rejouable)", count === 0);
    await a.cliquer(`[...document.querySelectorAll('input[type=checkbox]')].find(e => ${VIS}(e) && e.closest('label')?.textContent.includes('Activer le numéro'))`);
    check("admin : option décochée", await a.waitFor(`/Numéro de test désactivé/.test(${TEXTE})`));
    await a.taille(390, 844, true);
    await a.goto(`${APP}/espace-admin/messagerie`);
    await a.waitFor(`/Numéro de test \\(connexion/.test(${TEXTE})`, 25000);
    check("admin mobile : carte sans défilement horizontal", (await debordement(a)) <= 0);
    await a.shot("390-admin-numero-test");

    const { browserContextId: ctx2 } = await cdp.send("Target.createBrowserContext");
    const v2 = await ongletDans(cdp, ctx2);
    await v2.taille(1280, 900, false);
    await v2.goto(`${APP}/connexion?mode=telephone`);
    await sleep(1500);
    check("option décochée : plus aucun encart sur /connexion", !(await v2.eval(`/Compte de test/.test(${TEXTE})`)));
  } finally {
    console.log("\nNettoyage");
    // Le compte fermé par l'admin est anonymisé, pas effacé : on le supprime.
    if (idCompte) await admin.auth.admin.deleteUser(idCompte);
    const { data: ident } = await admin.from("identifiants_telephone").select("utilisateur_id").eq("telephone", `+224${numero}`).maybeSingle();
    if (ident) await admin.auth.admin.deleteUser(ident.utilisateur_id);
    await admin.from("codes_telephone").delete().eq("telephone", `+224${numero}`);
    await admin.from("telephone_test").update(origine).eq("id", 1);
    console.log(`  réglage rendu : ${JSON.stringify(origine)} · captures : ${OUT}`);
    ws.close();
    chrome.kill();
  }
  console.log(`\n${echecs ? `❌ ${echecs} échec(s)` : "✅ tout est passé"}`);
  process.exit(echecs ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
