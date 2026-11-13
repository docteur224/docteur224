/*
 * Vérification du menu groupé en sections (CDP, sans dépendance de test).
 *
 *   - médecin /espace-medecin : cinq en-têtes dans l'ordre, liens rangés,
 *     « Messages » avant « Correspondance » ;
 *   - mode replié : le titre de section cède la place à un filet (texte masqué) ;
 *   - assistant /espace-assistant : trois en-têtes, huit liens ;
 *   - assistant sur /espace-medecin : le groupe « Facturation » (et l'équipe)
 *     disparaît, titre compris.
 *
 * Prérequis : npx next build && npx next start -p <port>
 * Usage     : APP_URL=http://localhost:3995 node scripts/verif-menu-sections.mjs
 * Comptes @test.docteur224.com ; lecture seule, rien n'est modifié ni envoyé.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = process.env.APP_URL ?? "http://localhost:3995";
const PORT = 9357;
const ICI = path.join(os.tmpdir(), "docteur224-verif-menu-sections");
const OUT = path.join(ICI, "captures");
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let echecs = 0;
const check = (label, ok, detail = "") => {
  if (!ok) echecs++;
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
};

class Page {
  constructor(sessionId, cdp, targetId) {
    Object.assign(this, { s: sessionId, cdp, targetId });
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
  async taille(largeur, hauteur) {
    await this.send("Emulation.setDeviceMetricsOverride", { width: largeur, height: hauteur, deviceScaleFactor: 1, mobile: false });
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
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
      await this.send("Input.dispatchMouseEvent", { type, x: r.x, y: r.y, button: "left", clickCount: 1 });
    }
    await sleep(500);
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
async function ongletDans(cdp, contexte) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank", browserContextId: contexte });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const p = new Page(sessionId, cdp, targetId);
  await p.send("Page.enable");
  await p.send("Runtime.enable");
  await p.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  return p;
}

const VIS = `(e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden')`;
const ASIDE = "document.querySelector('aside')";

/** Connexion par e-mail dans un contexte neuf ; rend le contexte (cookies posés). */
async function connecter(cdp, email) {
  const { browserContextId } = await cdp.send("Target.createBrowserContext");
  const p = await ongletDans(cdp, browserContextId);
  await p.taille(1280, 900);
  await p.goto(`${APP}/connexion`);
  await p.eval(`[...document.querySelectorAll('input[type="email"]')].find(${VIS})?.focus()`);
  await p.send("Input.insertText", { text: email });
  await p.eval(`[...document.querySelectorAll('input[type="password"]')].find(${VIS})?.focus()`);
  await p.send("Input.insertText", { text: "test1234" });
  await p.cliquer(`[...document.querySelectorAll("button, a")].find(b => ${VIS}(b) && /^S'identifier$/.test(b.textContent))`);
  const ok = await p.waitFor(`location.pathname !== '/connexion'`, 25000);
  return { ctx: browserContextId, ok };
}

/* Ordre réel du menu : en-têtes (div[role=presentation]) et liens entremêlés,
   dans l'ordre du DOM. On lit le libellé source (textContent), pas le rendu
   CSS en capitales. */
const LIRE_MENU = `(() => {
  const nav = ${ASIDE}.querySelector('nav');
  // Le libellé est le span SANS aria-hidden ; l'icône (emoji) porte aria-hidden.
  const libelle = (el) => (el.querySelector('span:not([aria-hidden])') ?? el).textContent.trim();
  return [...nav.children].map((el) => {
    if (el.getAttribute('role') === 'presentation') return { type: 'section', texte: el.textContent.trim() };
    if (el.tagName === 'A') return { type: 'lien', texte: libelle(el), href: el.getAttribute('href') };
    return { type: 'autre', texte: libelle(el) };
  });
})()`;

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
    /* ---------- Médecin : /espace-medecin ---------- */
    const medecin = await connecter(cdp, "medecin1@test.docteur224.com");
    check("médecin connecté", medecin.ok);
    const m = await ongletDans(cdp, medecin.ctx);
    await m.taille(1280, 900);
    await m.goto(`${APP}/espace-medecin`);
    await m.waitFor(`${ASIDE}?.querySelector('nav [role="presentation"]')`, 25000);
    const menuMed = await m.eval(LIRE_MENU);

    const sectionsMed = menuMed.filter((x) => x.type === "section").map((x) => x.texte);
    check("médecin : 5 sections dans l'ordre",
      JSON.stringify(sectionsMed) === JSON.stringify(["Au quotidien", "Échanges", "Mon cabinet", "Facturation", "Compte"]),
      JSON.stringify(sectionsMed));

    const liensMed = menuMed.filter((x) => x.type === "lien").map((x) => x.texte);
    const attenduMed = ["Tableau de bord", "Mon agenda", "Mes patients", "Suivi d’absence",
      "Messages", "Correspondance", "Mes disponibilités", "Avis et notes", "Statistiques",
      "Mes assistant(e)s", "Mon abonnement", "Mes paiements", "Mon profil", "Mon compte"];
    check("médecin : 14 liens dans le nouvel ordre",
      JSON.stringify(liensMed) === JSON.stringify(attenduMed), JSON.stringify(liensMed));

    const iMsg = liensMed.indexOf("Messages"), iCor = liensMed.indexOf("Correspondance");
    check("médecin : « Messages » avant « Correspondance »", iMsg >= 0 && iMsg === iCor - 1);

    // Un en-tête tombe bien juste avant le premier lien de son groupe.
    const avantAgenda = menuMed[menuMed.findIndex((x) => x.texte === "Tableau de bord") - 1];
    check("médecin : « Au quotidien » coiffe « Tableau de bord »",
      avantAgenda?.type === "section" && avantAgenda.texte === "Au quotidien");
    await m.shot("1280-medecin-sections");

    /* ---------- Mode replié : le titre cède la place à un filet ---------- */
    await m.cliquer(`${ASIDE}.querySelector('button[aria-label="Plier le menu"]')`);
    await m.waitFor(`document.documentElement.getAttribute('data-sidebar') === 'plie'`, 5000);
    const replie = await m.eval(`(() => {
      const ent = ${ASIDE}.querySelector('nav [role="presentation"]');
      const span = ent.querySelector('span');               // le libellé
      const filet = ent.querySelector('span[aria-hidden]');  // le trait
      return {
        texteMasque: getComputedStyle(span).display === 'none',
        filetVisible: !!filet && getComputedStyle(filet).display !== 'none',
      };
    })()`);
    check("replié : le libellé de section est masqué", replie.texteMasque, JSON.stringify(replie));
    check("replié : un filet le remplace", replie.filetVisible, JSON.stringify(replie));
    await m.shot("1280-medecin-sections-replie");
    // On déplie pour ne pas laisser l'état global sur « plié ».
    await m.cliquer(`${ASIDE}.querySelector('button[aria-label="Déplier le menu"]')`);

    /* ---------- Assistant : /espace-assistant ---------- */
    const assistant = await connecter(cdp, "assistant1@test.docteur224.com");
    check("assistant connecté", assistant.ok);
    const a = await ongletDans(cdp, assistant.ctx);
    await a.taille(1280, 900);
    await a.goto(`${APP}/espace-assistant`);
    await a.waitFor(`${ASIDE}?.querySelector('nav [role="presentation"]')`, 25000);
    const menuAsst = await a.eval(LIRE_MENU);
    const sectionsAsst = menuAsst.filter((x) => x.type === "section").map((x) => x.texte);
    check("assistant : 3 sections dans l'ordre",
      JSON.stringify(sectionsAsst) === JSON.stringify(["Au quotidien", "Échanges", "Compte"]),
      JSON.stringify(sectionsAsst));
    const liensAsst = menuAsst.filter((x) => x.type === "lien").map((x) => x.texte);
    check("assistant : 8 liens", liensAsst.length === 8, JSON.stringify(liensAsst));
    await a.shot("1280-assistant-sections");

    /* ---------- Assistant sur /espace-medecin : Facturation s'efface ---------- */
    const am = await ongletDans(cdp, assistant.ctx);
    await am.taille(1280, 900);
    await am.goto(`${APP}/espace-medecin`);
    await am.waitFor(`${ASIDE}?.querySelector('nav [role="presentation"]')`, 25000);
    const menuAssistMed = await am.eval(LIRE_MENU);
    const sectionsAM = menuAssistMed.filter((x) => x.type === "section").map((x) => x.texte);
    const liensAM = menuAssistMed.filter((x) => x.type === "lien").map((x) => x.texte);
    check("assistant/espace-medecin : pas de titre « Facturation »", !sectionsAM.includes("Facturation"), JSON.stringify(sectionsAM));
    check("assistant/espace-medecin : ni abonnement, ni paiements, ni équipe",
      !liensAM.includes("Mon abonnement") && !liensAM.includes("Mes paiements") && !liensAM.includes("Mes assistant(e)s"),
      JSON.stringify(liensAM));
    check("assistant/espace-medecin : « Mon cabinet » reste (dispos/avis/stats)",
      sectionsAM.includes("Mon cabinet") && liensAM.includes("Mes disponibilités"));
    await am.shot("1280-assistant-sur-espace-medecin");

    /* ---------- Patient : /patient (web) ---------- */
    const patient = await connecter(cdp, "patient1@test.docteur224.com");
    check("patient connecté", patient.ok);
    const p = await ongletDans(cdp, patient.ctx);
    await p.taille(1280, 900);
    await p.goto(`${APP}/patient`);
    await p.waitFor(`${ASIDE}?.querySelector('nav [role="presentation"]')`, 25000);
    const menuPat = await p.eval(LIRE_MENU);
    const sectionsPat = menuPat.filter((x) => x.type === "section").map((x) => x.texte);
    check("patient : 4 sections dans l'ordre",
      JSON.stringify(sectionsPat) === JSON.stringify(["Au quotidien", "Mon suivi", "Échanges", "Compte"]),
      JSON.stringify(sectionsPat));
    const liensPat = menuPat.filter((x) => x.type === "lien").map((x) => x.texte);
    const attenduPat = ["Tableau de bord", "Prendre rendez-vous", "Mes rendez-vous",
      "Mes documents", "Mes proches", "Mes favoris", "Mes avis",
      "Messages", "Notifications", "Mon profil", "Mon compte", "Paramètres"];
    check("patient : 12 liens dans le nouvel ordre",
      JSON.stringify(liensPat) === JSON.stringify(attenduPat), JSON.stringify(liensPat));
    await p.shot("1280-patient-sections");

    /* ---------- Patient : tiroir mobile (sections miroir) ---------- */
    const pm = await ongletDans(cdp, patient.ctx);
    await pm.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await pm.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await pm.goto(`${APP}/patient`);
    await pm.waitFor(`document.querySelector('.tiroir .tiroir-titre')`, 20000);
    const titresTiroir = await pm.eval(`[...document.querySelectorAll('.tiroir .tiroir-groupe .tiroir-titre')].map((t) => t.textContent.trim())`);
    check("patient (tiroir mobile) : mêmes 4 sections",
      JSON.stringify(titresTiroir) === JSON.stringify(["Au quotidien", "Mon suivi", "Échanges", "Compte"]),
      JSON.stringify(titresTiroir));
    await pm.shot("390-patient-tiroir");

    /* ---------- Établissement : /espace-etablissement (web) ---------- */
    const etab = await connecter(cdp, "etab.clinique-ambroise@test.docteur224.com");
    check("établissement connecté", etab.ok);
    const e = await ongletDans(cdp, etab.ctx);
    await e.taille(1280, 900);
    await e.goto(`${APP}/espace-etablissement`);
    await e.waitFor(`${ASIDE}?.querySelector('nav [role="presentation"]')`, 25000);
    const menuEtab = await e.eval(LIRE_MENU);
    const sectionsEtab = menuEtab.filter((x) => x.type === "section").map((x) => x.texte);
    check("établissement : 3 sections dans l'ordre",
      JSON.stringify(sectionsEtab) === JSON.stringify(["Pilotage", "Gestion", "Compte"]),
      JSON.stringify(sectionsEtab));
    const liensEtab = menuEtab.filter((x) => x.type === "lien").map((x) => x.texte);
    const attenduEtab = ["Tableau de bord", "Médecins", "Statistiques", "Informations",
      "Abonnement", "Compte & paramètres", "Mon compte"];
    check("établissement : 7 liens dans le nouvel ordre",
      JSON.stringify(liensEtab) === JSON.stringify(attenduEtab), JSON.stringify(liensEtab));
    await e.shot("1280-etablissement-sections");
  } finally {
    ws.close();
    chrome.kill();
  }
  console.log(`\nCaptures : ${OUT}\n${echecs ? `❌ ${echecs} échec(s)` : "✅ tout est passé"}`);
  process.exit(echecs ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
