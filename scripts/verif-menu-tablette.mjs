/*
 * Vérification de la barre latérale partagée (components/site/BarreLaterale)
 * dans les cinq espaces connectés, par Chrome piloté (CDP), sans dépendance.
 *
 *   - tablette 768 px (tactile) : bandeau compact, menu replié ; le bouton
 *     « Menu » l'ouvre sur deux colonnes, Échap le referme, un changement de
 *     page aussi ; aucun défilement horizontal ;
 *   - ordinateur 1280 px (souris) : colonne de 236 px, menu déplié, pas de
 *     bouton « Menu » ;
 *   - aucune erreur console.
 *
 * Prérequis : npx next build && npx next start -p <port>
 * Usage     : APP_URL=http://localhost:3993 ADMIN_MDP=… node scripts/verif-menu-tablette.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = process.env.APP_URL ?? "http://localhost:3993";
const PORT = 9338;
const ICI = path.join(os.tmpdir(), "docteur224-verif-menu-tablette");
const OUT = path.join(ICI, "captures");
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COMPTES = [
  { role: "patient", email: "patient1@test.docteur224.com", mdp: "test1234", porte: "/connexion", page: "/patient" },
  { role: "medecin", email: "medecin1@test.docteur224.com", mdp: "test1234", porte: "/connexion", page: "/espace-medecin" },
  { role: "assistant", email: "assistant1@test.docteur224.com", mdp: "test1234", porte: "/connexion", page: "/espace-assistant" },
  { role: "etablissement", email: "etab.hopital-donka@test.docteur224.com", mdp: "test1234", porte: "/connexion", page: "/espace-etablissement" },
  { role: "admin", email: "admin@docteur224.com", mdp: process.env.ADMIN_MDP ?? "", porte: "/espace-admin/connexion", page: "/espace-admin" },
];

let echecs = 0;
const check = (label, ok, detail = "") => {
  if (!ok) echecs++;
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
};

class Page {
  constructor(ws, sessionId, targetId, cdp) {
    Object.assign(this, { ws, s: sessionId, targetId, cdp, console: [], tactile: false });
    cdp.on("Runtime.exceptionThrown", sessionId, (p) => this.console.push(p.exceptionDetails.exception?.description?.split("\n")[0] ?? p.exceptionDetails.text));
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
    await sleep(800);
    await this.waitFor("document.readyState === 'complete'");
    await sleep(1200);
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
  async touche(key, code) {
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", key, windowsVirtualKeyCode: code });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key, windowsVirtualKeyCode: code });
    await sleep(400);
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
  const p = new Page(cdp.ws, sessionId, targetId, cdp);
  await p.send("Page.enable");
  await p.send("Runtime.enable");
  await p.send("Network.enable");
  return p;
}

const BOUTON = `[...document.querySelectorAll('aside button[aria-controls="menu-espace"]')][0]`;
const NAV = `document.getElementById('menu-espace')`;
const ASIDE = `document.querySelector('aside')`;
const visible = (expr) => `(() => { const e = ${expr}; return !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none'; })()`;

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
  let page = await onglet(cdp);

  try {
    for (const c of COMPTES) {
      if (!c.mdp) { console.log(`⏭️  ${c.role} : mot de passe absent, ignoré`); continue; }
      await page.send("Network.clearBrowserCookies");
      await page.taille(1280, 900, false);
      await page.goto(`${APP}${c.porte}`);
      for (const [sel, val] of [['input[type="email"]', c.email], ['input[type="password"]', c.mdp]]) {
        await page.eval(`[...document.querySelectorAll('${sel}')].find(e => e.offsetParent)?.focus()`);
        await page.send("Input.insertText", { text: val });
      }
      await page.eval(`[...document.querySelectorAll('button')].find(b => b.offsetParent && /S.identifier|Accéder à la console/.test(b.textContent))?.click()`);
      const connecte = await page.waitFor(`!location.pathname.endsWith('connexion')`, 25000);
      check(`${c.role} : connexion`, connecte);
      if (!connecte) continue;
      page = await onglet(cdp, page);

      /* ---------- Tablette 768, tactile ---------- */
      await page.taille(768, 1024, true);
      await page.goto(`${APP}${c.page}`);
      await page.waitFor(visible(BOUTON), 15000);
      page.console = [];
      const hauteurFermee = await page.eval(`Math.round(${ASIDE}.getBoundingClientRect().height)`);
      check(`[768] ${c.role} : bandeau compact`, hauteurFermee <= 90, `${hauteurFermee}px`);
      check(`[768] ${c.role} : menu replié`, !(await page.eval(visible(NAV))));
      const hBouton = await page.eval(`Math.round(${BOUTON}.getBoundingClientRect().height)`);
      check(`[768] ${c.role} : bouton Menu ≥ 44px`, hBouton >= 44, `${hBouton}px`);
      await page.shot(`${c.role}-768-ferme`);

      await page.cliquer(BOUTON);
      check(`[768] ${c.role} : Menu ouvre`, (await page.eval(`${BOUTON}.getAttribute('aria-expanded')`)) === "true" && (await page.eval(visible(NAV))));
      const colonnes = await page.eval(`getComputedStyle(${NAV}).gridTemplateColumns.split(' ').length`);
      check(`[768] ${c.role} : deux colonnes`, colonnes === 2, `${colonnes}`);
      check(`[768] ${c.role} : pas de défilement horizontal`, !(await page.eval(`document.documentElement.scrollWidth > innerWidth + 1`)));
      await page.shot(`${c.role}-768-ouvert`);

      await page.touche("Escape", 27);
      check(`[768] ${c.role} : Échap referme`, !(await page.eval(visible(NAV))));

      // Changer de page referme le menu.
      await page.cliquer(BOUTON);
      const cible = await page.eval(`[...${NAV}.querySelectorAll('a')].find(a => a.getAttribute('aria-current') !== 'page')?.getAttribute('href')`);
      await page.cliquer(`[...${NAV}.querySelectorAll('a')].find(a => a.getAttribute('href') === ${JSON.stringify(cible)})`);
      const arrive = await page.waitFor(`location.pathname === ${JSON.stringify(cible)}`, 20000);
      await sleep(600);
      check(`[768] ${c.role} : un lien mène à ${cible}`, arrive);
      check(`[768] ${c.role} : le menu se referme au changement de page`, !(await page.eval(visible(NAV))));

      /* ---------- Ordinateur 1280, souris ---------- */
      await page.taille(1280, 900, false);
      await page.goto(`${APP}${c.page}`);
      await sleep(400);
      check(`[1280] ${c.role} : menu déplié`, await page.eval(visible(NAV)));
      check(`[1280] ${c.role} : pas de bouton Menu`, !(await page.eval(visible(BOUTON))));
      const largeur = await page.eval(`Math.round(${ASIDE}.getBoundingClientRect().width)`);
      check(`[1280] ${c.role} : colonne latérale`, largeur > 150 && largeur < 260, `${largeur}px (zoom 80 %)`);
      check(`[1280] ${c.role} : lien courant marqué`, await page.eval(`!!${NAV}.querySelector('[aria-current="page"]')`));
      await page.shot(`${c.role}-1280`);

      const bruit = page.console.filter((l) => !/favicon|Multiple GoTrueClient/i.test(l));
      check(`${c.role} : aucune erreur console`, bruit.length === 0, bruit.slice(0, 2).join(" | "));
    }
  } finally {
    try { chrome.kill(); } catch { /* déjà fermé */ }
  }
  console.log(`\nCaptures : ${OUT}`);
  console.log(echecs === 0 ? "\n✅ Tout est passé." : `\n❌ ${echecs} vérification(s) en échec.`);
  process.exit(echecs === 0 ? 0 : 1);
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
