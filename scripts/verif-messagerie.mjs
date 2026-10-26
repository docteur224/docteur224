/*
 * Vérification CDP de la messagerie — patient, médecin, assistant.
 * Connexion par formulaire, navigation vers Messages, vérification du DOM.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://localhost:3001";
const PORT = 9228;
const ICI = path.dirname(new URL(import.meta.url).pathname.slice(1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const resultats = [];
const check = (nom, ok, detail = "") => {
  resultats.push(ok);
  console.log(`${ok ? "✅" : "❌"} ${nom}${detail ? ` — ${detail}` : ""}`);
};

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.attente = new Map(); }
  static async connecter(url) {
    const ws = new WebSocket(url);
    await new Promise((r) => (ws.onopen = r));
    const cdp = new CDP(ws);
    ws.onmessage = (ev) => {
      const m = JSON.parse(typeof ev.data === "string" ? ev.data : ev.data.toString());
      const a = cdp.attente.get(m.id);
      if (a) { cdp.attente.delete(m.id); if (m.error) a.rej(new Error(m.error.message)); else a.res(m.result); }
    };
    return cdp;
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((res, rej) => this.attente.set(id, { res, rej }));
  }
}

const ROLES = [
  { nom: "Patient", email: "patient1@test.docteur224.com", porte: "/connexion", espace: "/", page: "/patient/messages", selecteur: "h2" },
  { nom: "Médecin", email: "medecin1@test.docteur224.com", porte: "/connexion", espace: "/espace-medecin", page: "/espace-medecin/messages", selecteur: "h2" },
  { nom: "Assistant", email: "assistant1@test.docteur224.com", porte: "/connexion", espace: "/espace-assistant", page: "/espace-assistant/messages", selecteur: "h2" },
];

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(ICI, "profil-msg-" + Date.now())}`,
  "--headless=new", "--no-first-run", "--no-default-browser-check",
  "--disable-features=TranslateUI",
  "--disable-gpu", "--window-size=375,812", "--hide-scrollbars", "about:blank",
], { stdio: "ignore" });

let v;
for (let i = 0; i < 60 && !v; i++) {
  try { v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); }
  catch { await sleep(200); }
}
if (!v) { console.error("Chrome ne répond pas"); process.exit(1); }

const cdp = await CDP.connecter(v.webSocketDebuggerUrl);

try {
  for (const role of ROLES) {
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const s = (await cdp.send("Target.attachToTarget", { targetId, flatten: true })).sessionId;
    const envoyer = (m, p) => cdp.send(m, p, s);
    const ev = async (x) => (await envoyer("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result.value;
    const aller = async (c, w = 4000) => { await envoyer("Page.navigate", { url: BASE + c }); await sleep(w); };
    await envoyer("Page.enable");
    await envoyer("Runtime.enable");

    // Connexion
    await aller(role.porte, 4000);
    await ev(`(() => {
      const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      const p = (q, val) => { const e = document.querySelector(q); if (!e) return; d.call(e, val); e.dispatchEvent(new Event("input", { bubbles: true })); };
      p('input[type="email"]', ${JSON.stringify(role.email)});
      p('input[type="password"]', "test1234");
      const b = [...document.querySelectorAll("button")].filter((x) => /s.identifier|acc[ée]der/i.test(x.textContent));
      (b[b.length - 1])?.click();
    })()`);
    await sleep(6000);
    const loc = await ev("location.pathname");
    check(`[${role.nom}] connexion`, loc.startsWith(role.espace), loc);
    if (!loc.startsWith(role.espace)) { await cdp.send("Target.closeTarget", { targetId }); continue; }

    // Navigation vers Messages
    await aller(role.page, 5000);
    const h2 = await ev(`document.querySelector("h2")?.textContent || ""`);
    check(`[${role.nom}] page Messages chargée`, h2.includes("Message"), h2);

    // Tabbar (mobile)
    const tabbar = await ev(`document.querySelector("nav.tabbar a[href='${role.page}']")?.textContent || ""`);
    if (role.nom === "Patient") {
      check(`[${role.nom}] onglet Messages dans la tabbar`, tabbar.includes("Message"), tabbar);
      const rond = await ev(`document.querySelector("nav.tabbar a.tb-rond")?.getAttribute("href") || ""`);
      check(`[${role.nom}] Recherche est le bouton rond`, rond === "/resultats", rond);
      const milieu = await ev(`document.querySelector("nav.tabbar .tb-bloc a:nth-child(2)")?.textContent || ""`);
      check(`[${role.nom}] Mes RDV au milieu`, milieu.includes("RDV"), milieu);
    } else if (role.nom === "Médecin") {
      check(`[${role.nom}] onglet Messages dans la tabbar`, tabbar.includes("Message"), tabbar);
    } else {
      // Assistant : pas la permission → message d'erreur
      const refus = await ev(`!!document.querySelector("[class*='text-red']")`);
      check(`[${role.nom}] accès refusé sans permission`, refus);
    }

    await cdp.send("Target.closeTarget", { targetId });
  }
} finally {
  chrome.kill();
}

const ko = resultats.filter((r) => !r).length;
console.log(`\n${resultats.length - ko}/${resultats.length} vérifications passées`);
process.exit(ko ? 1 : 0);
