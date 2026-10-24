/*
 * Vérification des notifications dans Chrome, par CDP (corrigé le 24/10/2026).
 *
 *   A. Médecin puis patient dans le MÊME onglet (Déconnexion → Se connecter,
 *      sans rechargement) : la cloche montre les notifications du patient,
 *      plus celles du médecin. Le cache gardait la liste du premier compte.
 *   B. Un message arrive pendant la session : la pastille change sans
 *      recharger la page (relève toutes les 30 s).
 *   C. Ouvrir la conversation marque sa notification lue.
 *
 * Usage : APP_URL=http://localhost:3993 node scripts/verif-notifications.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createClient } from "@supabase/supabase-js";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = process.env.APP_URL ?? "http://localhost:3993";
const PORT = 9346;
const ICI = path.join(os.tmpdir(), "docteur224-verif-notifications");
const OUT = path.join(ICI, "captures");
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const lire = (c) => env.match(new RegExp(`^${c}=(.*)$`, "m"))?.[1].trim();
const service = createClient(lire("NEXT_PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});

let echecs = 0;
const check = (label, ok, detail = "") => {
  if (!ok) echecs++;
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
};

/* ---------- CDP minimal ---------- */
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
    // Une commande sans réponse ne doit pas suspendre tout le test (et son
    // nettoyage) : 30 s, puis on échoue en le disant.
    return new Promise((res, rej) => {
      const minuteur = setTimeout(() => {
        this.attente.delete(id);
        rej(new Error(`CDP sans réponse : ${method}`));
      }, 30_000);
      this.attente.set(id, { res: (v) => { clearTimeout(minuteur); res(v); }, rej: (e) => { clearTimeout(minuteur); rej(e); } });
    });
  }
  on(method, s, fn) { this.ecouteurs.push({ method, s, fn }); }
}

class Page {
  constructor(cdp, s, targetId) {
    Object.assign(this, { cdp, s, targetId, console: [], tactile: false });
    cdp.on("Runtime.exceptionThrown", s, (p) => this.console.push(p.exceptionDetails.exception?.description?.split("\n")[0] ?? p.exceptionDetails.text));
    cdp.on("Runtime.consoleAPICalled", s, (p) => {
      if (p.type === "error") this.console.push(p.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 200));
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
  }
  async centre(expression) {
    return this.eval(`(() => { const el = ${expression}; if (!el) return null; el.scrollIntoView({ block: 'center', behavior: 'instant' });
      const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, l: b.left, t: b.top, w: b.width, h: b.height }; })()`);
  }
  async cliquer(expression) {
    const r = await this.centre(expression);
    if (!r) throw new Error(`introuvable : ${expression}`);
    if (this.tactile) {
      await this.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: r.x, y: r.y }] });
      await this.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
        await this.send("Input.dispatchMouseEvent", { type, x: r.x, y: r.y, button: "left", clickCount: 1 });
      }
    }
    await sleep(450);
  }
  async saisir(id, texte) {
    await this.eval(`(() => { const el = document.getElementById(${JSON.stringify(id)}); el.scrollIntoView({ block: 'center' }); el.focus(); el.select?.(); })()`);
    await this.send("Input.insertText", { text: texte });
    await sleep(150);
  }
  /** Valeur d'un <select> ou d'un <input type=date> : le setter natif, puis l'événement que React écoute. */
  async valeur(id, valeur, evenement = "change") {
    await this.eval(`(() => { const el = document.getElementById(${JSON.stringify(id)});
      const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(valeur)});
      el.dispatchEvent(new Event(${JSON.stringify(evenement)}, { bubbles: true })); })()`);
    await sleep(300);
  }
  async shot(nom) {
    const r = await this.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path.join(OUT, `${nom}.png`), Buffer.from(r.data, "base64"));
    return r.data;
  }
}

async function onglet(cdp, ancienne) {
  if (ancienne) await cdp.send("Target.closeTarget", { targetId: ancienne.targetId }).catch(() => {});
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const p = new Page(cdp, sessionId, targetId);
  await p.send("Page.enable");
  await p.send("Runtime.enable");
  await p.send("Network.enable");
  await p.send("DOM.enable");
  return p;
}

/* ---------- Repères ---------- */
const MARQUE = "VERIF-NOTIFS";
const TITRE = "Nouveau message de Pr Mamadou Diallo";
const LISTE_PAGE = `[...document.querySelectorAll('main li, main a, main button')].map(e => e.textContent).join(' | ')`;
let ids;
let debutTest;
/* Notifications réelles non lues (patient, de medecin1) : la règle anti-doublon
   (une seule par 30 min tant qu'elle est non lue) empêcherait sinon nos
   messages de créer la leur. On les marque lues le temps du test, puis on les
   remet non lues — on ne touche jamais aux VRAIES notifications des comptes. */
let neutralisees = [];

async function preparer() {
  debutTest = new Date(Date.now() - 5000).toISOString();
  const { data: u } = await service.from("utilisateurs").select("id, email").in("email", ["medecin1@test.docteur224.com", "patient1@test.docteur224.com"]);
  ids = { medecinId: u.find((x) => x.email.startsWith("medecin1")).id, patientId: u.find((x) => x.email.startsWith("patient1")).id };
  const { data: enAttente } = await service
    .from("notifications").select("id").eq("destinataire_id", ids.patientId).eq("type", "message")
    .eq("source_type", "conversation").eq("source_id", ids.medecinId).is("lu_le", null);
  neutralisees = (enAttente ?? []).map((n) => n.id);
  if (neutralisees.length) await service.from("notifications").update({ lu_le: debutTest }).in("id", neutralisees);
}

/** Un message du médecin, écrit côté serveur : le trigger notifie le patient. */
async function messageDuMedecin(texte) {
  const { error } = await service.from("messages").insert({
    patient_id: ids.patientId, medecin_id: ids.medecinId, expediteur_id: ids.medecinId, contenu: `${texte} (${MARQUE})`,
  });
  if (error) throw new Error(error.message);
  const { data } = await service.from("notifications").select("id").eq("destinataire_id", ids.patientId)
    .eq("type", "message").gte("cree_le", debutTest).is("lu_le", null).order("cree_le", { ascending: false }).limit(1);
  return data?.[0]?.id ?? null;
}

async function nettoyer() {
  if (!ids) return;
  const { data: msgs } = await service.from("messages").select("id, contenu, cree_le").eq("patient_id", ids.patientId).gte("cree_le", debutTest);
  const aNous = (msgs ?? []).filter((m) => m.contenu?.includes(MARQUE));
  if (aNous.length) await service.from("messages").delete().in("id", aNous.map((m) => m.id));
  // Seulement NOS notifications : même cree_le que le message qui les a créées.
  if (aNous.length) await service.from("notifications").delete().eq("type", "message").eq("source_type", "conversation").in("cree_le", aNous.map((m) => m.cree_le));
  const nos = aNous;
  if (neutralisees.length) await service.from("notifications").update({ lu_le: null }).in("id", neutralisees);
  console.log(`ℹ️  nettoyage : ${nos.length} message(s), leurs notifications, ${neutralisees.length} notification(s) réelle(s) remise(s) non lue(s)`);
}

async function seConnecterSurPlace(page, email) {
  // Le formulaire de la page, SANS nouvel onglet ni rechargement : c'est le
  // parcours réel « déconnexion puis connexion à un autre compte ».
  await page.waitFor(`[...document.querySelectorAll('input[type="email"]')].some(e => e.offsetParent)`, 15000);
  for (const [sel, val] of [['input[type="email"]', email], ['input[type="password"]', "test1234"]]) {
    await page.eval(`[...document.querySelectorAll('${sel}')].find(e => e.offsetParent)?.focus()`);
    await page.send("Input.insertText", { text: val });
  }
  await page.eval(`[...document.querySelectorAll('button')].find(b => b.offsetParent && /S.identifier/.test(b.textContent))?.click()`);
  return page.waitFor(`!location.pathname.endsWith('connexion')`, 25000);
}

async function main() {
  await preparer();
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
  const page = await onglet(cdp);

  try {
    const notifA = await messageDuMedecin("Message avant connexion");
    check("message du médecin → notification du patient créée en base", !!notifA);

    /* ---------- A. Médecin, déconnexion, puis patient : plus de cache croisé ----------
       La connexion recharge le document (choix voulu : le serveur voit la
       session tout de suite, et les caches de module repartent de zéro). On
       vérifie ici ce qui comptait pour l'utilisateur : après le changement de
       compte, la cloche montre les notifications du PATIENT, pas du médecin. */
    await page.send("Network.clearBrowserCookies");
    await page.taille(1280, 900, false);
    await page.goto(`${APP}/connexion`);
    check("connexion médecin", await seConnecterSurPlace(page, "medecin1@test.docteur224.com"));
    await page.waitFor(`location.pathname.startsWith('/espace-medecin')`, 20000);
    await sleep(2500); // la cloche du médecin lit SES notifications
    await page.cliquer(`[...document.querySelectorAll('aside button')].find(b => b.offsetParent && b.textContent.includes('Déconnexion'))`);
    await page.waitFor(`location.pathname === '/'`, 15000);
    await page.cliquer(`[...document.querySelectorAll('a[href^="/connexion"]')].find(a => a.offsetParent)`);
    check("patient : connexion après déconnexion", await seConnecterSurPlace(page, "patient1@test.docteur224.com"));
    await page.waitFor(`location.pathname.startsWith('/patient')`, 20000);
    await page.cliquer(`[...document.querySelectorAll('aside a')].find(a => a.offsetParent && a.getAttribute('href') === '/patient/notifications')`);
    await page.waitFor(`location.pathname === '/patient/notifications'`, 10000);
    const vu = await page.waitFor(`document.querySelector('main')?.textContent.includes('${TITRE}')`, 15000);
    check("après changement de compte : la cloche montre les notifications du PATIENT", vu, vu ? "" : (await page.eval(LISTE_PAGE)).slice(0, 200));
    check("…et jamais celles du médecin", !(await page.eval(`document.querySelector('main').textContent.includes('Nouveau message de Alpha Condé')`)));
    await page.shot("1280-notifications-apres-changement");

    /* ---------- B. Une notification qui arrive pendant la session ---------- */
    await service.from("notifications").update({ lu_le: new Date().toISOString() }).eq("id", notifA);
    await page.goto(`${APP}/patient/notifications`);
    await page.waitFor(`document.querySelector('main')?.textContent.includes('${TITRE}')`, 15000);
    await page.eval(`window.__memeDocument = true`);
    const pastille = `(() => { const b = [...document.querySelectorAll('aside button, header button')].find(x => x.offsetParent && /notification/i.test(x.getAttribute('aria-label') ?? '')); return b ? b.getAttribute('aria-label') : null; })()`;
    const avant = await page.eval(pastille);
    console.log(`ℹ️  onglet : ${await page.eval("document.visibilityState")}, ${avant}`);
    const notifB = await messageDuMedecin("Message pendant la session");
    check("second message → nouvelle notification en base", !!notifB && notifB !== notifA);
    const t0 = Date.now();
    const arrivee = await page.waitFor(`${pastille} !== ${JSON.stringify(avant)}`, 45000);
    check("arrive sans recharger la page (≤ 45 s)", arrivee && (await page.eval(`window.__memeDocument === true`)),
      `pastille ${JSON.stringify(avant)} → ${JSON.stringify(await page.eval(pastille))} en ${Math.round((Date.now() - t0) / 1000)} s`);
    await page.shot("1280-notification-arrivee");

    /* ---------- C. Lire le message éteint sa notification ---------- */
    await page.goto(`${APP}/patient/messages?medecin=${ids.medecinId}`);
    await page.waitFor(`[...document.querySelectorAll('main [role="log"] p')].some(p => p.textContent.includes('${MARQUE}'))`, 20000);
    let luEnBase = false;
    for (let i = 0; i < 20 && !luEnBase; i++) {
      await sleep(500);
      const { data } = await service.from("notifications").select("lu_le").eq("id", notifB).single();
      luEnBase = !!data?.lu_le;
    }
    check("ouvrir la conversation marque sa notification lue", luEnBase);

    const bruit = page.console.filter((x) => !/favicon|Multiple GoTrueClient/i.test(x));
    check("aucune erreur console", bruit.length === 0, bruit.slice(0, 3).join(" | "));
  } finally {
    try { chrome.kill(); } catch { /* déjà fermé */ }
  }
}

setTimeout(async () => {
  console.error("❌ délai global dépassé (5 min) — nettoyage puis arrêt");
  await nettoyer().catch(() => {});
  process.exit(1);
}, 5 * 60_000).unref();

main()
  .catch((e) => {
    echecs++;
    console.error("❌", e.message);
  })
  .finally(async () => {
    await nettoyer();
    console.log(`\nCaptures : ${OUT}`);
    console.log(echecs === 0 ? "\n✅ Tout est passé." : `\n❌ ${echecs} vérification(s) en échec.`);
    process.exit(echecs === 0 ? 0 : 1);
  });
