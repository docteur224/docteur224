/*
 * Vérification des animations dans Chrome (CDP, sans dépendance). Captures
 * et profil Chrome dans le dossier temporaire du système. Crée deux
 * rendez-vous avec patient1@test puis les annule.
 * Parcours web puis mobile : accueil → résultats → fiche → créneau →
 * réservation → confirmation, avec contrôle console, classes, styles
 * calculés, prefers-reduced-motion et temps de chargement.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
// Usage : npx next build && npx next start -p 3987, puis node scripts/verif-animations.mjs
const APP = process.env.APP_URL ?? "http://localhost:3987";
const PORT = 9333;
const ICI = path.join(os.tmpdir(), "docteur224-verif-animations");
mkdirSync(ICI, { recursive: true });
const OUT = path.join(ICI, "captures");
mkdirSync(OUT, { recursive: true });
const PROFIL = path.join(ICI, "chrome-profil");
const PATIENT = { email: "patient1@test.docteur224.com", mdp: "test1234" };

const resultats = [];
const check = (label, ok, detail = "") => {
  resultats.push({ label, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Client CDP minimal ----------
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.attente = new Map();
    this.ecouteurs = [];
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.attente.has(m.id)) {
        const { res, rej } = this.attente.get(m.id);
        this.attente.delete(m.id);
        m.error ? rej(new Error(`${m.error.message} (${m.error.data ?? ""})`)) : res(m.result);
      } else if (m.method) {
        for (const e of this.ecouteurs) if (e.method === m.method && (!e.sessionId || e.sessionId === m.sessionId)) e.fn(m.params);
      }
    };
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((res, rej) => this.attente.set(id, { res, rej }));
  }
  on(method, fn, sessionId) {
    this.ecouteurs.push({ method, fn, sessionId });
  }
  once(method, sessionId, timeout = 15000) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(`timeout ${method}`)), timeout);
      const e = { method, sessionId, fn: (p) => { clearTimeout(t); this.ecouteurs.splice(this.ecouteurs.indexOf(e), 1); res(p); } };
      this.ecouteurs.push(e);
    });
  }
}

class Page {
  constructor(cdp, sessionId) {
    this.cdp = cdp;
    this.s = sessionId;
    this.console = [];
    this.mobile = false;
    cdp.on("Runtime.exceptionThrown", (p) => this.console.push(`exception: ${p.exceptionDetails.exception?.description ?? p.exceptionDetails.text}`), sessionId);
    cdp.on("Runtime.consoleAPICalled", (p) => {
      if (p.type === "error" || p.type === "warning") this.console.push(`${p.type}: ${p.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
    }, sessionId);
    cdp.on("Log.entryAdded", (p) => {
      if (p.entry.level === "error") this.console.push(`log: ${p.entry.text} ${p.entry.url ?? ""}`);
    }, sessionId);
    cdp.on("Page.javascriptDialogOpening", () => cdp.send("Page.handleJavaScriptDialog", { accept: true }, sessionId), sessionId);
  }
  send(m, p) { return this.cdp.send(m, p, this.s); }
  async init() {
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("Log.enable");
    await this.send("Network.enable");
  }
  async media() {
    await this.send("Emulation.setEmulatedMedia", { features: [
      { name: "prefers-reduced-motion", value: this.reduit ? "reduce" : "no-preference" },
      { name: "hover", value: this.mobile ? "none" : "hover" },
      { name: "pointer", value: this.mobile ? "coarse" : "fine" },
    ] });
  }
  async desktop() {
    this.mobile = false;
    await this.media();
    await this.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await this.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await this.send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36" });
  }
  async telephone() {
    this.mobile = true;
    await this.media();
    await this.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await this.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await this.send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
  }
  async reduireMouvement(actif) {
    this.reduit = actif;
    await this.media();
  }
  async goto(url) {
    const charge = this.cdp.once("Page.loadEventFired", this.s, 30000);
    await this.send("Page.navigate", { url });
    await charge;
    await sleep(500);
  }
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`eval: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}\n${expression}`);
    return r.result.value;
  }
  async waitFor(expression, timeout = 15000) {
    const debut = Date.now();
    while (Date.now() - debut < timeout) {
      if (await this.eval(`!!(${expression})`)) return true;
      await sleep(100);
    }
    throw new Error(`waitFor timeout: ${expression}`);
  }
  async url() { return this.eval("location.pathname + location.search"); }
  async shot(nom) {
    const r = await this.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path.join(OUT, `${nom}.png`), Buffer.from(r.data, "base64"));
  }
  /** Centre du premier élément VISIBLE correspondant, après défilement. */
  async centre(selector, index = 0) {
    const r = await this.eval(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed');
      const el = els[${index}]; if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      const b = el.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    })()`);
    if (!r) throw new Error(`introuvable: ${selector}[${index}]`);
    await sleep(80);
    return r;
  }
  async hover(selector, index = 0) {
    const { x, y } = await this.centre(selector, index);
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  }
  async click(selector, index = 0) {
    const { x, y } = await this.centre(selector, index);
    if (this.mobile) {
      await this.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await this.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
      await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
      await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    }
  }
  async taper(selector, texte) {
    await this.click(selector);
    await this.send("Input.insertText", { text: texte });
  }
  async touche(key, code) {
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: key === "Escape" ? 27 : 13 });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: key === "Escape" ? 27 : 13 });
  }
  viderConsole() { const c = this.console.splice(0); return c; }
  async attendreNavigation(cheminAttendu, timeout = 20000) {
    await this.waitFor(`location.pathname.startsWith(${JSON.stringify(cheminAttendu)})`, timeout);
    await sleep(600);
  }
}

/** Chrome headless cesse de transmettre les entrées à l'onglet après la
 * connexion (constaté hors animations : un onglet neuf clique normalement).
 * On poursuit donc le parcours dans un nouvel onglet, cookies conservés. */
async function nouvelOnglet(cdp, ancienne) {
  try { await cdp.send("Target.closeTarget", { targetId: ancienne.targetId }); } catch {}
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const p = new Page(cdp, sessionId);
  p.targetId = targetId;
  p.reduit = ancienne.reduit;
  await p.init();
  await (ancienne.mobile ? p.telephone() : p.desktop());
  return p;
}

// Observateurs posés dans la page : compte les relances de la transition de
// page et note si un squelette est passé par le DOM.
const SONDES = `(() => {
  const w = document.querySelector('.ui-page');
  window.__toggles = 0;
  if (w) new MutationObserver((ms) => { window.__toggles += ms.length; }).observe(w, { attributes: true, attributeFilter: ['class'] });
  window.__skeleton = false;
  new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches?.('.ui-skeleton') || n.querySelector?.('.ui-skeleton'))) window.__skeleton = true; })
    .observe(document.body, { childList: true, subtree: true });
  return true;
})()`;

const DEFILER = "(async () => { const h = document.body.scrollHeight; for (let y = 0; y <= h; y += 450) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 160)); } return true; })()";

const CHOISIR_SOIN = "(() => { const s = [...document.querySelectorAll('select')].find(e => e.offsetParent !== null && [...e.options].some(o => /soin/i.test(o.textContent))); if (!s) return false; s.selectedIndex = 1; s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; })()";

const styleDe = (page, selector, prop, index = 0) =>
  page.eval(`(() => { const els=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(e=>e.offsetParent!==null||getComputedStyle(e).position==='fixed'); const el = els[${index}]; return el ? getComputedStyle(el).getPropertyValue(${JSON.stringify(prop)}) : null; })()`);

const erreursConsole = (page, etape) => {
  const c = page.viderConsole().filter((l) => !/favicon|ERR_BLOCKED_BY_CLIENT|leaflet.*tile|tile.openstreetmap|Multiple GoTrueClient/i.test(l));
  check(`[${etape}] aucune erreur console`, c.length === 0, c.slice(0, 3).join(" | "));
};

async function main() {
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFIL}`, "--headless=new", "--disable-save-password-bubble", "--password-store=basic", "--disable-features=PasswordManagerOnboarding,PasswordLeakDetection,AutofillServerCommunication,OptimizationHints,Translate", "--no-first-run",
    "--no-default-browser-check", "--disable-gpu", "--window-size=1366,900", "--hide-scrollbars", "about:blank",
  ], { stdio: "ignore" });
  let version;
  for (let i = 0; i < 50 && !version; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(200); }
  }
  if (!version) throw new Error("Chrome ne répond pas");
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  const cdp = new CDP(ws);
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  let page = new Page(cdp, sessionId);
  page.targetId = targetId;
  await page.init();

  const reservationsACreer = [];
  try {
    // ==================== WEB ====================
    await page.desktop();
    await page.goto(`${APP}/`);
    await page.eval(SONDES);
    const perfAccueil = await page.eval("JSON.stringify((({domContentLoadedEventEnd:d, loadEventEnd:l, responseEnd:r}) => ({dcl: Math.round(d), load: Math.round(l), ttfb: Math.round(r)}))(performance.getEntriesByType('navigation')[0]))");
    check("[web accueil] enveloppe .ui-page animée", (await styleDe(page, ".ui-page", "animation-name")) === "ui-page-in");
    check("[web accueil] <html> porte ui-reveal-pret", await page.eval("document.documentElement.classList.contains('ui-reveal-pret')"));
    const totalReveal = await page.eval("[...document.querySelectorAll('[data-reveal]')].filter(e => e.offsetParent !== null).length");
    const visiblesAvant = await page.eval("[...document.querySelectorAll('[data-reveal].ui-in')].filter(e => e.offsetParent !== null).length");
    await page.eval(DEFILER);
    await sleep(500);
    const visiblesApres = await page.eval("[...document.querySelectorAll('[data-reveal].ui-in')].filter(e => e.offsetParent !== null).length");
    check("[web accueil] apparition au scroll", totalReveal > 0 && visiblesAvant < totalReveal && visiblesApres === totalReveal, `${visiblesAvant}/${totalReveal} avant défilement, ${visiblesApres}/${totalReveal} après`);
    check("[web accueil] carte révélée sans déplacement résiduel", (await styleDe(page, "[data-reveal].ui-in", "translate")) === "none" && (await styleDe(page, "[data-reveal].ui-in", "transform")) === "none");
    await page.hover(".ui-card:has(.ui-card-media)");
    await sleep(300);
    const tHover = await styleDe(page, ".ui-card:has(.ui-card-media)", "transform");
    const sHover = await styleDe(page, ".ui-card:has(.ui-card-media)", "box-shadow");
    check("[web accueil] survol carte : élévation + ombre", tHover !== "none" && sHover !== "none", `transform=${tHover}`);
    check("[web accueil] survol carte : zoom avatar", (await styleDe(page, ".ui-card:has(.ui-card-media) .ui-card-media", "transform")) !== "none");
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 400 });
    await sleep(300);
    check("[web accueil] fin de survol : retour à plat", (await styleDe(page, ".ui-card:has(.ui-card-media)", "transform")) === "none");
    await page.eval("window.scrollTo({top: 0, behavior: 'instant'})");
    await sleep(300);
    await page.shot("web-accueil");
    erreursConsole(page, "web accueil");

    // Navigation → résultats
    await page.click('nav a[href="/resultats"]');
    await page.attendreNavigation("/resultats");
    await page.waitFor("document.querySelectorAll('.ui-card[data-reveal]').length > 0");
    const perfResultats = await page.eval("JSON.stringify({toggles: window.__toggles, skeleton: window.__skeleton})");
    const { toggles, skeleton } = JSON.parse(perfResultats);
    check("[web résultats] transition de page relancée", toggles >= 2, `${toggles} bascules de classe`);
    check("[web résultats] squelette de route affiché pendant le chargement", skeleton === true);
    await sleep(700);
    const cartes = await page.eval("document.querySelectorAll('.ui-card[data-reveal]').length");
    const cartesVisibles = await page.eval("[...document.querySelectorAll('.ui-card[data-reveal].ui-in')].filter(e => e.offsetParent !== null).length");
    check("[web résultats] cartes médecin révélées", cartes > 0 && cartesVisibles > 0, `${cartesVisibles} visibles / ${cartes}`);
    check("[web résultats] stagger déclaré sur la liste", (await styleDe(page, "[data-reveal-stagger] > [data-reveal]:nth-child(3)", "transition-delay")) !== "0s");
    await page.hover(".ui-card[data-reveal]");
    await sleep(300);
    check("[web résultats] survol carte", (await styleDe(page, ".ui-card[data-reveal]", "transform")) !== "none");
    // Autocomplétion
    await page.click('input[name="specialite"]');
    await sleep(250);
    check("[web résultats] liste d'autocomplétion animée", (await styleDe(page, "ul.ui-dropdown-in", "animation-name")) === "ui-drop-in");
    await page.touche("Escape", "Escape");
    await sleep(200);
    check("[web résultats] Échap referme la liste", (await page.eval("!document.querySelector('ul.ui-dropdown-in')")));
    // Popup avis
    await page.click('.ui-card[data-reveal] button[aria-haspopup="dialog"]');
    await page.waitFor("document.querySelector('[role=dialog].ui-modal-in')");
    check("[web résultats] popup avis : entrée scale+fade", (await styleDe(page, "[role=dialog].ui-modal-in", "animation-name")) === "ui-scale-in");
    check("[web résultats] popup avis : voile en fondu", (await styleDe(page, ".ui-overlay-in", "animation-name")) === "ui-fade-in");
    await sleep(300);
    await page.shot("web-popup-avis");
    await page.click('[role=dialog] button[aria-label="Fermer"]');
    await sleep(200);
    check("[web résultats] popup avis refermé", await page.eval("!document.querySelector('[role=dialog].ui-modal-in')"));
    await page.shot("web-resultats");
    erreursConsole(page, "web résultats");

    // Fiche médecin
    await page.click('.ui-card[data-reveal] a.ui-btn');
    await page.attendreNavigation("/medecin/");
    await page.waitFor("document.querySelectorAll('.grid-cols-3 button.ui-slot:not([disabled])').length > 0", 20000);
    check("[web fiche] squelette des créneaux passé", await page.eval("window.__skeleton === true"));
    // Jour explicite (le 2e du bandeau) avant l'horaire : le jour affiché
    // et le jour retenu sont alors les mêmes.
    await page.click("button.ui-slot:not([disabled])", 1);
    await sleep(400);
    await page.waitFor("document.querySelectorAll('.grid-cols-3 button.ui-slot:not([disabled])').length > 0", 20000);
    await page.click(".grid-cols-3 button.ui-slot");
    await sleep(220);
    check("[web fiche] créneau sélectionné (classe ui-slot-sel + fond bleu)", await page.eval("(() => { const s = document.querySelector('.ui-slot-sel'); return !!s && getComputedStyle(s).backgroundColor === 'rgb(21, 80, 107)'; })()"));
    check("[web fiche] pulse de confirmation", (await styleDe(page, ".ui-slot-sel", "animation-name")) === "ui-pulse");
    const lienContinuer = await page.eval("document.querySelector('a.ui-btn[href^=\"/reservation\"]')?.getAttribute('href')");
    check("[web fiche] bouton « Continuer » actif", !!lienContinuer, lienContinuer ?? "");
    await page.shot("web-fiche-creneau");
    erreursConsole(page, "web fiche");

    // Réservation (visiteur) → invitation à se connecter
    await page.click('a.ui-btn[href^="/reservation"]');
    await page.attendreNavigation("/reservation");
    check("[web réservation] page atteinte avec le créneau", (await page.url()).includes("heure="));
    erreursConsole(page, "web réservation visiteur");

    // Connexion patient
    await page.goto(`${APP}/connexion`);
    await page.taper('input[type="email"], input[name="email"]', PATIENT.email);
    await page.taper('input[type="password"]', PATIENT.mdp);
    await page.click("button.ui-btn");
    await page.waitFor("!location.pathname.startsWith('/connexion')", 25000);
    await sleep(800);
    check("[web connexion] connecté", !(await page.url()).startsWith("/connexion"), await page.url());
    erreursConsole(page, "web connexion");
    page = await nouvelOnglet(cdp, page);

    // Réservation connectée → confirmation
    await page.goto(`${APP}${lienContinuer}`);
    await page.eval(SONDES);
    await page.waitFor("[...document.querySelectorAll('button.ui-btn')].some(b => b.textContent.includes('Confirmer'))", 20000);
    await sleep(500);
    const idxConfirmer = await page.eval("[...document.querySelectorAll('button.ui-btn')].filter(e=>e.offsetParent!==null).findIndex(b => b.textContent.includes('Confirmer'))");
    check("[web réservation] bouton Confirmer visible", idxConfirmer >= 0);
    // Sans soin choisi : le formulaire refuse et l'erreur apparaît en fondu.
    await page.click("button.ui-btn", idxConfirmer);
    await sleep(500);
    check("[web réservation] erreur inline en fondu (aucun soin choisi)", (await styleDe(page, "p.ui-fade-in", "animation-name")) === "ui-fade-in");
    await page.eval(CHOISIR_SOIN);
    await sleep(300);
    await page.click("button.ui-btn", idxConfirmer);
    await page.attendreNavigation("/confirmation", 30000);
    reservationsACreer.push(lienContinuer);
    check("[web confirmation] coche animée", (await styleDe(page, ".ui-check", "animation-name")) === "ui-check");
    check("[web confirmation] récapitulatif en fondu décalé", (await styleDe(page, "h2.ui-fade-up", "animation-name")) === "ui-fade-up" && (await styleDe(page, "h2.ui-fade-up", "animation-delay")) === "0.24s");
    await sleep(900);
    check("[web confirmation] texte visible une fois l'animation finie", (await styleDe(page, "p.ui-fade-up", "opacity")) === "1");
    await page.shot("web-confirmation");
    erreursConsole(page, "web confirmation");

    // Cloche des notifications (dropdown)
    await page.goto(`${APP}/resultats`);
    await page.waitFor("document.querySelector('button[aria-label^=\"Notifications\"]')", 15000);
    await page.click('button[aria-label^="Notifications"]');
    await sleep(200);
    check("[web cloche] panneau déroulant animé", (await styleDe(page, "[role=dialog].ui-dropdown-in", "animation-name")) === "ui-drop-in");
    await page.shot("web-cloche");
    await page.touche("Escape", "Escape");
    await sleep(200);
    check("[web cloche] Échap referme", await page.eval("!document.querySelector('[role=dialog].ui-dropdown-in')"));

    // Mes rendez-vous : cartes + annulation du RDV créé
    await page.goto(`${APP}/mes-rendez-vous`);
    await page.waitFor("document.querySelectorAll('.ui-card[data-reveal]').length > 0", 20000);
    await sleep(600);
    check("[web mes RDV] cartes révélées", await page.eval("[...document.querySelectorAll('.ui-card[data-reveal].ui-in')].some(e => e.offsetParent !== null)"));
    await page.shot("web-mes-rdv");
    erreursConsole(page, "web mes RDV");

    // ==================== REDUCED MOTION (web) ====================
    await page.reduireMouvement(true);
    await page.goto(`${APP}/`);
    check("[reduced] transition de page réduite à un fondu", (await styleDe(page, ".ui-page", "animation-name")) === "ui-fade-in");
    check("[reduced] éléments data-reveal visibles sans défilement", await page.eval("[...document.querySelectorAll('[data-reveal]')].every(e => getComputedStyle(e).opacity === '1' && getComputedStyle(e).transform === 'none')"));
    await page.hover(".ui-card");
    await sleep(250);
    check("[reduced] aucun mouvement au survol", (await styleDe(page, ".ui-card", "transform")) === "none");
    await page.goto(`${APP}/resultats`);
    await page.waitFor("document.querySelector('.ui-card[data-reveal] button[aria-haspopup=\"dialog\"]')");
    await page.click('.ui-card[data-reveal] button[aria-haspopup="dialog"]');
    await page.waitFor("document.querySelector('[role=dialog].ui-modal-in')");
    check("[reduced] modale : simple fondu", (await styleDe(page, "[role=dialog].ui-modal-in", "animation-name")) === "ui-fade-in");
    await page.shot("web-reduced-motion");
    await page.click('[role=dialog] button[aria-label="Fermer"]');
    await page.reduireMouvement(false);
    erreursConsole(page, "reduced motion");

    // ==================== MOBILE ====================
    await page.telephone();
    await page.goto(`${APP}/`);
    await page.eval(SONDES);
    const perfMobile = await page.eval("JSON.stringify((({domContentLoadedEventEnd:d, loadEventEnd:l}) => ({dcl: Math.round(d), load: Math.round(l)}))(performance.getEntriesByType('navigation')[0]))");
    check("[mobile accueil] version mobile affichée", await page.eval("!!document.querySelector('.topbar') && getComputedStyle(document.querySelector('nav.sticky')).display === 'none'"));
    const totalM = await page.eval("[...document.querySelectorAll('.doc[data-reveal]')].filter(e=>e.offsetParent!==null).length");
    await page.eval(DEFILER);
    await sleep(500);
    const visM = await page.eval("[...document.querySelectorAll('.doc[data-reveal].ui-in')].filter(e=>e.offsetParent!==null).length");
    check("[mobile accueil] cartes .doc révélées au défilement", totalM > 0 && visM === totalM, `${visM}/${totalM}`);
    await page.eval("window.scrollTo({top: 0, behavior: 'instant'})");
    await sleep(300);
    await page.shot("mobile-accueil");
    await page.click('.tb-btn[aria-label="Menu du site"]');
    await sleep(350);
    check("[mobile accueil] menu ☰ ouvert (tiroir existant)", await page.eval("!!document.querySelector('.tiroir-hote.ouvert')"));
    await page.shot("mobile-menu");
    // Le voile n'est visible qu'à gauche du tiroir (84 vw) : on tape au bord.
    await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 20, y: 400 }] });
    await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(350);
    check("[mobile accueil] menu refermé", await page.eval("!document.querySelector('.tiroir-hote.ouvert')"));
    erreursConsole(page, "mobile accueil");

    await page.goto(`${APP}/resultats`);
    await page.waitFor("document.querySelectorAll('.doc[data-reveal]').length > 0", 20000);
    await sleep(700);
    check("[mobile résultats] cartes révélées", await page.eval("[...document.querySelectorAll('.doc[data-reveal].ui-in')].filter(e=>e.offsetParent!==null).length > 0"));
    await page.click('.searchbox input[name="specialite"]');
    await sleep(250);
    check("[mobile résultats] liste d'autocomplétion animée", (await styleDe(page, ".autolist", "animation-name")) === "ui-drop-in");
    await page.shot("mobile-resultats");
    erreursConsole(page, "mobile résultats");

    // Fiche mobile → créneaux
    const idMedecin = lienContinuer.match(/medecin=([^&]+)/)[1];
    await page.goto(`${APP}/medecin/${idMedecin}`);
    await page.waitFor("document.querySelector('a.btn[href$=\"/creneaux\"]')", 20000);
    await page.click('a.btn[href$="/creneaux"]');
    await page.attendreNavigation(`/medecin/${idMedecin}/creneaux`);
    await page.waitFor("document.querySelectorAll('button.slot').length > 0", 20000);
    check("[mobile créneaux] page atteinte", true);
    await page.click("button.day:not([disabled])", 1);
    await sleep(400);
    await page.waitFor("document.querySelectorAll('button.slot').length > 0", 20000);
    await page.click("button.slot");
    await sleep(60);
    check("[mobile créneaux] sélection immédiate (.sel)", await page.eval("!!document.querySelector('button.slot.sel')"));
    check("[mobile créneaux] pulse de confirmation", (await styleDe(page, "button.slot.sel", "animation-name")) === "ui-pulse");
    check("[mobile créneaux] CTA « Continuer » actif", await page.eval("!!document.querySelector('.ctafoot a.btn')"));
    await page.shot("mobile-creneau");
    erreursConsole(page, "mobile créneaux");

    // Réservation → confirmation (mobile, session déjà ouverte)
    await page.click(".ctafoot a.btn");
    await page.attendreNavigation("/reservation");
    const lienMobile = await page.url();
    await page.waitFor("[...document.querySelectorAll('.ctafoot button.btn')].some(b => b.textContent.includes('Confirmer'))", 20000);
    await sleep(400);
    await page.eval(CHOISIR_SOIN);
    await sleep(300);
    await page.click(".ctafoot button.btn");
    await page.attendreNavigation("/confirmation", 30000);
    reservationsACreer.push(lienMobile);
    check("[mobile confirmation] coche animée", (await styleDe(page, ".check div", "animation-name")) === "ui-check");
    check("[mobile confirmation] titre en fondu décalé", (await styleDe(page, ".confwrap h2", "animation-name")) === "ui-fade-up");
    await sleep(900);
    check("[mobile confirmation] texte visible une fois fini", (await styleDe(page, ".confwrap p", "opacity")) === "1");
    await page.shot("mobile-confirmation");
    erreursConsole(page, "mobile confirmation");

    // Reduced motion mobile
    await page.reduireMouvement(true);
    await page.goto(`${APP}/`);
    check("[mobile reduced] cartes visibles d'emblée", await page.eval("[...document.querySelectorAll('.doc[data-reveal]')].filter(e=>e.offsetParent!==null).every(e => getComputedStyle(e).opacity === '1')"));
    await page.reduireMouvement(false);

    // ==================== NETTOYAGE : annuler les 2 RDV créés ====================
    await page.desktop();
    await page.goto(`${APP}/mes-rendez-vous`);
    await page.waitFor("document.querySelectorAll('.ui-card[data-reveal]').length > 0", 20000);
    let annules = 0;
    for (const lien of reservationsACreer) {
      const heure = decodeURIComponent(lien.match(/heure=([^&]+)/)[1]);
      const date = lien.match(/date=([^&]+)/)[1];
      const idx = await page.eval(`(() => {
        const cartes = [...document.querySelectorAll('.ui-card[data-reveal]')].filter(e => e.offsetParent !== null);
        const jour = new Date('${date}T00:00:00').getDate();
        return cartes.findIndex(c => c.textContent.includes('${heure}') && c.querySelector('button.ui-btn.text-red') && c.textContent.includes(String(jour)));
      })()`);
      if (idx < 0) { check(`[nettoyage] RDV ${date} ${heure} retrouvé`, false); continue; }
      const boutons = await page.eval(`(() => { const c=[...document.querySelectorAll('.ui-card[data-reveal]')].filter(e=>e.offsetParent!==null)[${idx}]; const b=c.querySelector('button.ui-btn.text-red'); b.scrollIntoView({block:'center'}); const r=b.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
      await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: boutons.x, y: boutons.y, button: "left", clickCount: 1 });
      await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: boutons.x, y: boutons.y, button: "left", clickCount: 1 });
      await sleep(1500);
      annules++;
    }
    check("[nettoyage] rendez-vous de test annulés", annules === reservationsACreer.length, `${annules}/${reservationsACreer.length}`);
    erreursConsole(page, "nettoyage");

    console.log("\nTemps de chargement (production locale) :");
    console.log(`  web accueil     : ${perfAccueil}`);
    console.log(`  mobile accueil  : ${perfMobile}`);
  } catch (e) {
    check("Scénario interrompu", false, e.message);
    try { await page.shot("erreur"); } catch {}
  } finally {
    const ko = resultats.filter((r) => !r.ok).length;
    console.log(`\n${resultats.length - ko}/${resultats.length} vérifications réussies`);
    try { await cdp.send("Browser.close"); } catch {}
    chrome.kill();
    process.exit(ko ? 1 : 0);
  }
}
main();
