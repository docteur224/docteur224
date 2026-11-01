/*
 * Vérification de la barre latérale des espaces connectés (CDP).
 *
 *   - le nom s'affiche en entier (il était réduit à « Ma… Dia… » : la cloche
 *     et la bascule clair/sombre lui prenaient la ligne), à 1280 et 1024 px ;
 *   - patient : « Prendre rendez-vous » juste avant « Mes rendez-vous », sur
 *     web et dans le tiroir mobile ;
 *   - professionnel : sa photo à la place des initiales (barre latérale, barre
 *     haute et tiroir mobiles), initiales s'il n'en a pas ;
 *   - inscription patient : « Créer mon compte » grisé tant que les
 *     conditions ne sont pas acceptées.
 *
 * Prérequis : npx next build && npx next start -p <port>
 * Usage     : APP_URL=http://localhost:3997 node scripts/verif-barre-laterale.mjs
 * Comptes de démonstration (@test.docteur224.com) ; rien n'est modifié.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createClient } from "@supabase/supabase-js";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = process.env.APP_URL ?? "http://localhost:3997";
const PORT = 9349;
const ICI = path.join(os.tmpdir(), "docteur224-verif-barre-laterale");
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
const ASIDE = "document.querySelector('aside')";

async function remplirVisible(page, selecteur, texte) {
  await page.eval(`[...document.querySelectorAll(${JSON.stringify(selecteur)})].find(${VIS})?.focus()`);
  await page.eval(`(() => { const e = document.activeElement; const p = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    p.call(e, ''); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await page.send("Input.insertText", { text: texte });
  await sleep(150);
}

async function ongletDans(cdp, contexte) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank", browserContextId: contexte });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const p = new Page(sessionId, cdp, targetId);
  await p.send("Page.enable");
  await p.send("Runtime.enable");
  await p.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  return p;
}

/** Connexion par e-mail dans un contexte neuf ; rend le contexte (cookies posés). */
async function connecter(cdp, email) {
  const { browserContextId } = await cdp.send("Target.createBrowserContext");
  const p = await ongletDans(cdp, browserContextId);
  await p.taille(1280, 900, false);
  await p.goto(`${APP}/connexion`);
  await remplirVisible(p, 'input[type="email"]', email);
  await remplirVisible(p, 'input[type="password"]', "test1234");
  await p.cliquer(bouton(/^S'identifier$/));
  const ok = await p.waitFor(`location.pathname !== '/connexion'`, 25000);
  return { ctx: browserContextId, ok };
}

/** Le nom de la barre latérale est-il affiché en entier (ni tronqué ni coupé) ? */
const nomEntier = `(() => { const b = ${ASIDE}.querySelector('b'); return { texte: b.innerText, coupe: b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1 }; })()`;

async function main() {
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
    /* ---------- Patient ---------- */
    const patient = await connecter(cdp, "patient1@test.docteur224.com");
    check("patient connecté", patient.ok);
    for (const [l, h] of [[1280, 900], [1024, 800]]) {
      const p = await ongletDans(cdp, patient.ctx);
      await p.taille(l, h, false);
      await p.goto(`${APP}/patient`);
      await p.waitFor(`${ASIDE} && ${ASIDE}.querySelector('b').innerText.trim().length > 1`, 20000);
      const n = await p.eval(nomEntier);
      check(`[${l}] patient : nom complet, ni tronqué ni coupé`, !n.coupe && !n.texte.includes("…"), JSON.stringify(n));
      const liens = await p.eval(`[...${ASIDE}.querySelectorAll('nav a')].map(a => a.textContent.trim() + '→' + a.getAttribute('href'))`);
      const iPrendre = liens.findIndex((x) => x.includes("Prendre rendez-vous"));
      const iMes = liens.findIndex((x) => x.includes("Mes rendez-vous"));
      check(`[${l}] « Prendre rendez-vous » juste avant « Mes rendez-vous », vers /resultats`,
        iPrendre >= 0 && iPrendre === iMes - 1 && liens[iPrendre].endsWith("→/resultats"), JSON.stringify(liens.slice(0, 3)));
      const commandes = await p.eval(`(() => { const b = ${ASIDE}.querySelector('b').getBoundingClientRect(); const c = ${ASIDE}.querySelector('[aria-label*="otification"], button[aria-label*="loche"]') ?? ${ASIDE}.querySelector('.ml-auto'); const r = c.getBoundingClientRect(); return r.top >= b.bottom - 1; })()`);
      check(`[${l}] cloche et bascule sous l'identité, pas à côté`, commandes);
      await p.shot(`${l}-patient-barre`);
    }
    const pm = await ongletDans(cdp, patient.ctx);
    await pm.taille(390, 844, true);
    await pm.goto(`${APP}/patient`);
    await pm.waitFor(`document.querySelector('.tiroir')`, 20000);
    check("[390] tiroir mobile : « Prendre rendez-vous » présent", await pm.eval(`/Prendre rendez-vous/.test(document.querySelector('.tiroir').textContent)`));

    /* ---------- Médecin avec photo ---------- */
    const medecin = await connecter(cdp, "medecin1@test.docteur224.com");
    check("médecin (avec photo) connecté", medecin.ok);
    const m = await ongletDans(cdp, medecin.ctx);
    await m.taille(1280, 900, false);
    await m.goto(`${APP}/espace-medecin`);
    check("[1280] médecin : sa photo dans la barre latérale",
      await m.waitFor(`${ASIDE}?.querySelector('img')?.src.includes('cloudinary')`, 25000));
    check("[1280] médecin : la photo est chargée (non cassée)",
      await m.waitFor(`${ASIDE}.querySelector('img').complete && ${ASIDE}.querySelector('img').naturalWidth > 0`, 15000));
    const nm = await m.eval(nomEntier);
    check("[1280] médecin : nom complet", !nm.coupe, JSON.stringify(nm));
    await m.shot("1280-medecin-barre");
    const mm = await ongletDans(cdp, medecin.ctx);
    await mm.taille(390, 844, true);
    await mm.goto(`${APP}/espace-medecin`);
    check("[390] médecin : photo dans l'avatar de la barre haute",
      await mm.waitFor(`document.querySelector('button.tb-avatar img')?.src.includes('cloudinary')`, 25000));
    check("[390] médecin : photo dans l'en-tête du tiroir",
      await mm.eval(`!!document.querySelector('.tiroir-tete .tb-avatar img')`));
    await mm.shot("390-medecin-avatar");

    /* ---------- Médecin sans photo : initiales ---------- */
    const sans = await connecter(cdp, "medecin2@test.docteur224.com");
    const s = await ongletDans(cdp, sans.ctx);
    await s.taille(1280, 900, false);
    await s.goto(`${APP}/espace-medecin`);
    await s.waitFor(`${ASIDE} && /^[A-Z]{2}$/.test(${ASIDE}.querySelector('span[aria-hidden]')?.textContent.trim() ?? '')`, 25000);
    check("[1280] médecin sans photo : initiales, aucune image", !(await s.eval(`!!${ASIDE}.querySelector('img')`)),
      await s.eval(`${ASIDE}.querySelector('span[aria-hidden]')?.textContent`));

    /* ---------- Inscription : bouton grisé sans les conditions ---------- */
    const { browserContextId: ctxV } = await cdp.send("Target.createBrowserContext");
    for (const [l, h, t] of [[1280, 900, false], [390, 844, true]]) {
      const v = await ongletDans(cdp, ctxV);
      await v.taille(l, h, t);
      await v.goto(`${APP}/inscription/patient`);
      const creer = bouton(/Créer mon compte/);
      check(`[${l}] inscription e-mail : bouton grisé au départ, rappel affiché`,
        (await v.eval(`${creer}.disabled`)) === true && /Acceptez les conditions d’utilisation/.test(await v.eval(TEXTE)));
      await v.cliquer(`[...document.querySelectorAll('label')].find(e => ${VIS}(e) && /J'accepte/.test(e.textContent))`);
      check(`[${l}] case cochée : bouton actif, rappel retiré`,
        (await v.eval(`${creer}.disabled`)) === false && !(await v.eval(`[...document.querySelectorAll('p')].some(e => ${VIS}(e) && /Acceptez les conditions d’utilisation/.test(e.textContent))`)));
      await v.cliquer(`[...document.querySelectorAll('label')].find(e => ${VIS}(e) && /J'accepte/.test(e.textContent))`);
      check(`[${l}] case décochée : bouton de nouveau grisé`, (await v.eval(`${creer}.disabled`)) === true);
    }
  } finally {
    ws.close();
    chrome.kill();
  }
  console.log(`\nCaptures : ${OUT}\n${echecs ? `❌ ${echecs} échec(s)` : "✅ tout est passé"}`);
  process.exit(echecs ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
