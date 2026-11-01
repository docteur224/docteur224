/*
 * Vérification de la connexion par téléphone + code PIN dans Chrome piloté
 * (CDP), sans dépendance — ordinateur 1280 px (souris) et téléphone 390 px
 * (tactile).
 *
 *   1. NON-RÉGRESSION E-MAIL : /connexion et /inscription/patient s'ouvrent
 *      sur l'onglet E-mail ; connexion du compte de démo et création d'un
 *      compte par e-mail aboutissent comme avant ;
 *   2. inscription par téléphone : numéro → WhatsApp/SMS → code → PIN →
 *      confirmation → profil → espace patient, avec chaque refus en route ;
 *   3. connexion numéro + PIN, PIN faux refusé ;
 *   4. « Code PIN oublié ? » jusqu'à la reconnexion avec le nouveau PIN ;
 *   5. bloc « Code PIN » de Mon compte ;
 *   6. aucune erreur console, aucun défilement horizontal sur téléphone.
 *
 * Prérequis : npx next build && OTP_CODE_VISIBLE=1 npx next start -p <port>
 *             (sans agrégateur SMS, c'est le seul moyen de lire le code).
 * Usage     : APP_URL=http://localhost:3997 node scripts/verif-connexion-telephone.mjs
 *
 * Aucun message ne part : les numéros sont tirés dans la plage 69X, les
 * canaux SMS/WhatsApp sont simulés, l'e-mail de test est en
 * `@test.docteur224.com`. Tout est supprimé à la fin.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createClient } from "@supabase/supabase-js";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = process.env.APP_URL ?? "http://localhost:3997";
const PORT = 9347;
const ICI = path.join(os.tmpdir(), "docteur224-verif-telephone");
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

/* Visible = rendu, quel que soit le positionnement (offsetParent écarte les
 * éléments fixed). Chaque écran est rendu deux fois (mobile et web). */
const VIS = `(e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden')`;
/* Hors barre de navigation : le TopNav porte lui aussi un lien « Se connecter ». */
const bouton = (re) => `[...document.querySelectorAll("button, a")].find(b => ${VIS}(b) && !b.closest("header, nav") && ${re}.test(b.textContent))`;
const ALERTE = `([...document.querySelectorAll('[role=alert]')].filter(${VIS}).map(e => e.innerText).join(' | '))`;
const TEXTE = "document.body.innerText";

async function remplirVisible(page, selecteur, texte) {
  await page.eval(`[...document.querySelectorAll(${JSON.stringify(selecteur)})].find(${VIS})?.focus()`);
  await page.eval(`(() => { const e = document.activeElement; const p = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    p.call(e, ''); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await page.send("Input.insertText", { text: texte });
  await sleep(150);
}

/** Tape un code case par case : la frappe doit avancer seule d'une case. */
async function taperChiffres(page, libelle, valeur) {
  await page.eval(`[...document.querySelectorAll('input[aria-label^=${JSON.stringify(libelle + " — chiffre 1")}]')].find(${VIS})?.focus()`);
  for (const c of valeur) {
    await page.send("Input.insertText", { text: c });
    await sleep(15); // frappe rapide : la case suivante doit déjà avoir le focus
  }
  await sleep(150);
}
const valeurChiffres = (libelle) =>
  `[...document.querySelectorAll('input[aria-label^=${JSON.stringify(libelle + " — chiffre")}]')].filter(${VIS}).map(e => e.value).join('')`;

const debordement = (page) => page.eval("document.documentElement.scrollWidth - window.innerWidth");
const codeAffiche = (page) => page.eval(`(${TEXTE}.match(/code de démonstration : (\\d{6})/i) || [])[1] || null`);

const numero = () => "69" + String(Math.floor(Math.random() * 1e7)).padStart(7, "0");
const numerosCrees = [];
const emailsCrees = [];

async function nouvelOnglet(cdp, page) {
  // Onglet neuf à chaque scénario : après une connexion, Chrome headless ne
  // transmet plus les événements d'entrée à l'onglet (voir la mémoire du
  // projet). Les cookies, eux, sont vidés pour repartir déconnecté.
  const p = await onglet(cdp, page);
  await p.send("Network.clearBrowserCookies");
  await p.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  return p;
}

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
  let page = null;

  try {
    for (const [nom, largeur, hauteur, tactile] of [
      ["1280", 1280, 900, false],
      ["390", 390, 844, true],
    ].filter(([n]) => !process.env.VUES || process.env.VUES.split(",").includes(n))) {
      console.log(`\n══════ ${nom} px ══════`);
      const tel = numero();
      numerosCrees.push(`+224${tel}`); // dès maintenant : le nettoyage doit aussi couvrir une exécution interrompue
      const nouveauPin = nom === "1280" ? "3691" : "7319";
      const pinInitial = "2580";
      const erreursConsole = [];
      const ouvrir = async () => {
        if (page) erreursConsole.push(...page.console);
        page = await nouvelOnglet(cdp, page);
        await page.taille(largeur, hauteur, tactile);
      };

      /* ---------- 1 · Non-régression : connexion par e-mail ---------- */
      await ouvrir();
      await page.goto(`${APP}/connexion`);
      const etatOnglets = await page.eval(`[...document.querySelectorAll('[aria-label="Identifiant de connexion"] button')].filter(${VIS}).map(b => b.textContent.trim() + ':' + b.getAttribute('aria-pressed'))`);
      check(`[${nom}] /connexion : sélecteur « Téléphone | E-mail », E-mail par défaut`,
        JSON.stringify(etatOnglets) === JSON.stringify(["📱 Téléphone:false", "✉️ E-mail:true"]), JSON.stringify(etatOnglets));
      await remplirVisible(page, 'input[type="email"]', "patient1@test.docteur224.com");
      await remplirVisible(page, 'input[type="password"]', "mauvais-mdp");
      await page.cliquer(bouton(/S'identifier/));
      check(`[${nom}] e-mail : mauvais mot de passe refusé comme avant`,
        await page.waitFor(`/incorrect/i.test(${ALERTE})`), await page.eval(ALERTE));
      await remplirVisible(page, 'input[type="password"]', "test1234");
      await page.cliquer(bouton(/S'identifier/));
      check(`[${nom}] e-mail : connexion du compte de démo → /patient`,
        await page.waitFor(`location.pathname === '/patient'`, 25000), await page.eval("location.pathname"));

      /* ---------- 2 · Non-régression : inscription par e-mail ---------- */
      await ouvrir();
      await page.goto(`${APP}/inscription/patient`);
      check(`[${nom}] /inscription/patient : E-mail par défaut, formulaire d'origine`,
        await page.eval(`[...document.querySelectorAll('input[type=password]')].filter(${VIS}).length === 2`));
      const emailTest = `verif-tel-${nom}-${Date.now()}@test.docteur224.com`;
      emailsCrees.push(emailTest);
      await remplirVisible(page, 'input[placeholder="Nom"]', "Verif");
      await remplirVisible(page, 'input[placeholder="Prénom"]', "Email");
      await remplirVisible(page, 'input[aria-label="Numéro de téléphone"]', "620000777");
      await remplirVisible(page, 'input[type="email"]', emailTest);
      const mdp = `[...document.querySelectorAll('input[type=password]')].filter(${VIS})`;
      await page.eval(`${mdp}[0].focus()`); await page.send("Input.insertText", { text: "motdepasse1" });
      await page.eval(`${mdp}[1].focus()`); await page.send("Input.insertText", { text: "autre-chose" });
      await page.cliquer(bouton(/Créer mon compte/));
      check(`[${nom}] e-mail : confirmation différente refusée`,
        /ne correspondent pas/.test(await page.eval(`${TEXTE}`)));
      await page.eval(`(() => { const e = ${mdp}[1]; const p = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; p.call(e, ''); e.dispatchEvent(new Event('input', { bubbles: true })); e.focus(); })()`);
      await page.send("Input.insertText", { text: "motdepasse1" });
      await page.cliquer(bouton(/Créer mon compte/));
      check(`[${nom}] e-mail : compte créé → /patient`,
        await page.waitFor(`location.pathname === '/patient'`, 30000), await page.eval(`location.pathname + ' ' + ${ALERTE}`));

      /* ---------- 3 · Inscription par téléphone ---------- */
      await ouvrir();
      await page.goto(`${APP}/inscription/patient`);
      await page.cliquer(bouton(/Téléphone/));
      check(`[${nom}] onglet Téléphone actif, étape 1 sur 4`,
        await page.waitFor(`/Étape 1 sur 4/.test(${TEXTE}) && /Votre numéro de téléphone/.test(${TEXTE})`));
      await remplirVisible(page, 'input[aria-label="Numéro de téléphone"]', "12345");
      await page.cliquer(bouton(/^Continuer$/));
      check(`[${nom}] numéro incomplet refusé`, /9 chiffres/.test(await page.eval(ALERTE)), await page.eval(ALERTE));
      await remplirVisible(page, 'input[aria-label="Numéro de téléphone"]', tel);
      await page.cliquer(bouton(/^Continuer$/));
      check(`[${nom}] étape canal : WhatsApp et SMS proposés, numéro masqué`,
        await page.waitFor(`/Recevoir votre code/.test(${TEXTE})`) &&
        (await page.eval(`[...document.querySelectorAll('[role=radio]')].filter(${VIS}).length`)) === 2 &&
        (await page.eval(`${TEXTE}.includes('+224 ${tel.slice(0, 3)} •• •• ${tel.slice(7)}')`)));
      if (debordement && tactile) check(`[${nom}] canal : pas de défilement horizontal`, (await debordement(page)) <= 0);
      const canal = nom === "1280" ? "SMS" : "WhatsApp";
      await page.cliquer(`[...document.querySelectorAll('[role=radio]')].find(e => ${VIS}(e) && e.textContent.includes('${canal}'))`);
      check(`[${nom}] canal ${canal} sélectionné`,
        await page.eval(`[...document.querySelectorAll('[role=radio]')].find(e => ${VIS}(e) && e.textContent.includes('${canal}'))?.getAttribute('aria-checked') === 'true'`));
      await page.shot(`${nom}-inscription-canal`);
      await page.cliquer(bouton(/Envoyer le code/));
      check(`[${nom}] écran du code (6 cases), canal rappelé`,
        await page.waitFor(`/Vérifiez votre numéro/.test(${TEXTE})`) &&
        (await page.eval(`[...document.querySelectorAll('input[aria-label^="Code reçu — chiffre"]')].filter(${VIS}).length`)) === 6 &&
        (await page.eval(`${TEXTE}.includes('envoyé par ${canal}')`)));
      const code = await codeAffiche(page);
      check(`[${nom}] code de démonstration affiché (OTP_CODE_VISIBLE)`, !!code);
      check(`[${nom}] renvoi temporisé`, /Renvoyer dans \d+ s/.test(await page.eval(TEXTE)));
      await taperChiffres(page, "Code reçu", code === "000000" ? "111111" : "000000");
      check(`[${nom}] saisie case par case : avance automatique`, (await page.eval(valeurChiffres("Code reçu"))).length === 6);
      await page.cliquer(bouton(/^Vérifier$/));
      check(`[${nom}] mauvais code refusé, cases vidées`,
        await page.waitFor(`/incorrect/i.test(${ALERTE})`) && (await page.eval(valeurChiffres("Code reçu"))) === "");
      // Collage du code entier dans la première case.
      await page.eval(`(() => { const e = [...document.querySelectorAll('input[aria-label^="Code reçu — chiffre 1"]')].find(${VIS}); const dt = new DataTransfer(); dt.setData('text', '${code}'); e.focus(); e.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()`);
      await sleep(200);
      check(`[${nom}] coller le code le répartit dans les 6 cases`, (await page.eval(valeurChiffres("Code reçu"))) === code);
      await page.shot(`${nom}-inscription-code`);
      if (tactile) check(`[${nom}] code : pas de défilement horizontal`, (await debordement(page)) <= 0);
      await page.cliquer(bouton(/^Vérifier$/));
      check(`[${nom}] code accepté → création du PIN (étape 3)`,
        await page.waitFor(`/Créez votre code PIN/.test(${TEXTE}) && /Étape 3 sur 4/.test(${TEXTE})`));
      check(`[${nom}] PIN masqué (champs mot de passe)`,
        await page.eval(`[...document.querySelectorAll('input[aria-label^="Nouveau code PIN — chiffre"]')].filter(${VIS}).every(e => e.type === 'password')`));
      await taperChiffres(page, "Nouveau code PIN", "1234");
      check(`[${nom}] règle « pas de 1234 » non cochée`, /○ Pas de 0000/.test(await page.eval(TEXTE)));
      await page.cliquer(bouton(/^Continuer$/));
      check(`[${nom}] PIN 1234 refusé`, /difficiles à deviner/.test(await page.eval(ALERTE)), await page.eval(ALERTE));
      // Effacement : depuis la dernière case, quatre retours arrière vident tout.
      await page.eval(`[...document.querySelectorAll('input[aria-label^="Nouveau code PIN — chiffre 4"]')].find(${VIS})?.focus()`);
      await sleep(100);
      for (let i = 0; i < 4; i++) {
        await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
        await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
      }
      await sleep(150);
      check(`[${nom}] retour arrière efface case par case`, (await page.eval(valeurChiffres("Nouveau code PIN"))) === "");
      await taperChiffres(page, "Nouveau code PIN", pinInitial);
      check(`[${nom}] les deux règles cochées`, /✓ Exactement 4 chiffres/.test(await page.eval(TEXTE)) && /✓ Pas de 0000/.test(await page.eval(TEXTE)), `cases=${await page.eval(valeurChiffres("Nouveau code PIN"))} focus=${await page.eval("document.activeElement?.getAttribute('aria-label')")}`);
      await page.shot(`${nom}-inscription-pin`);
      await page.cliquer(bouton(/^Continuer$/));
      check(`[${nom}] confirmation du PIN`, await page.waitFor(`/Confirmez votre code PIN/.test(${TEXTE})`));
      await taperChiffres(page, "Confirmation du code PIN", "9876");
      await page.cliquer(bouton(/Continuer vers mon profil/));
      check(`[${nom}] confirmation différente refusée`, /ne correspondent pas/.test(await page.eval(ALERTE)));
      await taperChiffres(page, "Confirmation du code PIN", pinInitial);
      await page.cliquer(bouton(/Continuer vers mon profil/));
      check(`[${nom}] profil (étape 4 sur 4)`, await page.waitFor(`/Votre profil/.test(${TEXTE}) && /Étape 4 sur 4/.test(${TEXTE})`));
      await page.cliquer(bouton(/Créer mon compte/));
      check(`[${nom}] profil vide refusé`, /champs obligatoires/.test(await page.eval(ALERTE)));
      await remplirVisible(page, 'input[placeholder="Nom"]', "Verif");
      await remplirVisible(page, 'input[placeholder="Prénom"]', `Tel${nom}`);
      await page.eval(`(() => { const e = [...document.querySelectorAll('input[type=date]')].find(${VIS}); const p = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; p.call(e, '1991-03-08'); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await page.cliquer(bouton(/Créer mon compte/));
      check(`[${nom}] conditions non acceptées refusées`, /conditions/.test(await page.eval(ALERTE)), await page.eval(ALERTE));
      await page.cliquer(`[...document.querySelectorAll('label')].find(l => ${VIS}(l) && /J'accepte/.test(l.textContent))`);
      await page.shot(`${nom}-inscription-profil`);
      if (tactile) check(`[${nom}] profil : pas de défilement horizontal`, (await debordement(page)) <= 0);
      await page.cliquer(bouton(/Créer mon compte/));
      check(`[${nom}] compte téléphone créé → /patient (session ouverte)`,
        await page.waitFor(`location.pathname === '/patient'`, 30000), await page.eval(`location.pathname + ' ' + ${ALERTE}`));

      /* ---------- 4 · Connexion téléphone + PIN ---------- */
      await ouvrir();
      await page.goto(`${APP}/connexion`);
      await page.cliquer(bouton(/Téléphone/));
      check(`[${nom}] connexion : onglet Téléphone, aucun SMS annoncé`,
        await page.waitFor(`/Aucun SMS n’est envoyé/.test(${TEXTE})`));
      await remplirVisible(page, 'input[aria-label="Numéro de téléphone"]', tel);
      await page.cliquer(bouton(/^Continuer$/));
      check(`[${nom}] écran du PIN (4 cases)`,
        await page.waitFor(`/Saisissez votre code PIN/.test(${TEXTE})`) &&
        (await page.eval(`[...document.querySelectorAll('input[aria-label^="Code PIN — chiffre"]')].filter(${VIS}).length`)) === 4);
      await taperChiffres(page, "Code PIN", "1470");
      await page.cliquer(bouton(/^Se connecter$/));
      check(`[${nom}] PIN faux refusé`, await page.waitFor(`/incorrect/i.test(${ALERTE})`), await page.eval(ALERTE));
      await page.shot(`${nom}-connexion-pin`);
      await taperChiffres(page, "Code PIN", pinInitial);
      await page.cliquer(bouton(/^Se connecter$/));
      check(`[${nom}] connexion numéro + PIN → /patient`,
        await page.waitFor(`location.pathname === '/patient'`, 25000), await page.eval(`location.pathname + ' ' + ${ALERTE}`));

      /* ---------- 5 · PIN oublié ---------- */
      await ouvrir();
      await page.goto(`${APP}/connexion?mode=telephone`);
      check(`[${nom}] ?mode=telephone ouvre directement l'onglet Téléphone`,
        await page.waitFor(`[...document.querySelectorAll('[aria-label="Identifiant de connexion"] button')].find(b => ${VIS}(b) && /Téléphone/.test(b.textContent))?.getAttribute('aria-pressed') === 'true'`));
      await remplirVisible(page, 'input[aria-label="Numéro de téléphone"]', tel);
      await page.cliquer(bouton(/^Continuer$/));
      await page.waitFor(`/Saisissez votre code PIN/.test(${TEXTE})`);
      await page.cliquer(bouton(/Code PIN oublié/));
      check(`[${nom}] PIN oublié : choix du canal`, await page.waitFor(`/Pour protéger vos données/.test(${TEXTE})`));
      await page.cliquer(bouton(/Envoyer le code/));
      check(`[${nom}] PIN oublié : écran du code`, await page.waitFor(`/Vérifiez votre identité/.test(${TEXTE})`));
      const code2 = await codeAffiche(page);
      await taperChiffres(page, "Code reçu", code2);
      await page.cliquer(bouton(/^Vérifier$/));
      check(`[${nom}] PIN oublié : nouveau PIN`, await page.waitFor(`/Créez un nouveau PIN/.test(${TEXTE})`));
      await taperChiffres(page, "Nouveau code PIN", "0000");
      await page.cliquer(bouton(/^Continuer$/));
      check(`[${nom}] PIN oublié : 0000 refusé`, /difficiles à deviner/.test(await page.eval(ALERTE)));
      await taperChiffres(page, "Nouveau code PIN", nouveauPin);
      check(`[${nom}] PIN oublié : saisie par-dessus un PIN refusé`, (await page.eval(valeurChiffres("Nouveau code PIN"))).length === 4, await page.eval(valeurChiffres("Nouveau code PIN")));
      await page.cliquer(bouton(/^Continuer$/));
      check(`[${nom}] PIN oublié : confirmation du nouveau PIN`, await page.waitFor(`/Confirmez le nouveau PIN/.test(${TEXTE})`), `cases=${await page.eval(valeurChiffres("Nouveau code PIN"))} alerte=${await page.eval(ALERTE)}`);
      await taperChiffres(page, "Confirmation du code PIN", nouveauPin);
      await page.shot(`${nom}-oubli-confirmation`);
      if (tactile) check(`[${nom}] PIN oublié : pas de défilement horizontal`, (await debordement(page)) <= 0);
      await page.cliquer(bouton(/Réinitialiser et me connecter/));
      check(`[${nom}] PIN réinitialisé → connecté sur /patient`,
        await page.waitFor(`location.pathname === '/patient'`, 25000), await page.eval(`location.pathname + ' ' + ${ALERTE}`));

      /* ---------- 6 · L'ancien PIN ne passe plus, le nouveau oui ; Mon compte ---------- */
      await ouvrir();
      await page.goto(`${APP}/connexion?mode=telephone`);
      await remplirVisible(page, 'input[aria-label="Numéro de téléphone"]', tel);
      await page.cliquer(bouton(/^Continuer$/));
      await page.waitFor(`/Saisissez votre code PIN/.test(${TEXTE})`);
      await taperChiffres(page, "Code PIN", pinInitial);
      await page.cliquer(bouton(/^Se connecter$/));
      check(`[${nom}] ancien PIN refusé après réinitialisation`, await page.waitFor(`/incorrect/i.test(${ALERTE})`));
      await taperChiffres(page, "Code PIN", nouveauPin);
      await page.cliquer(bouton(/^Se connecter$/));
      check(`[${nom}] nouveau PIN accepté`, await page.waitFor(`location.pathname === '/patient'`, 25000));
      await ouvrir();
      // Les cookies viennent d'être vidés : on se reconnecte par l'API pour
      // ouvrir Mon compte dans un onglet neuf.
      await page.goto(`${APP}/connexion`);
      await page.eval(`fetch('/api/telephone/connexion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telephone: '${tel}', pin: '${nouveauPin}' }) }).then(r => r.status)`);
      await page.goto(`${APP}/patient/mon-compte`);
      check(`[${nom}] Mon compte : bloc « Code PIN » à la place du mot de passe`,
        await page.waitFor(`/Code PIN/.test(${TEXTE}) && /Connexion avec le \\+224/.test(${TEXTE})`, 20000) &&
        !(await page.eval(`/Changez le mot de passe|Changez votre mot de passe/.test(${TEXTE})`)));
      check(`[${nom}] Mon compte : le numéro remplace l'e-mail absent`,
        await page.eval(`/Patient · \\+224${tel}/.test(${TEXTE})`) && !(await page.eval(`/· null/.test(${TEXTE})`)));
      await page.shot(`${nom}-mon-compte`);
      if (tactile) check(`[${nom}] Mon compte : pas de défilement horizontal`, (await debordement(page)) <= 0);

      erreursConsole.push(...page.console);
      const pertinentes = erreursConsole.filter((e) => !/Failed to load resource.*(401|429|400)/.test(e));
      check(`[${nom}] aucune erreur console`, pertinentes.length === 0, pertinentes.slice(0, 3).join(" / "));
    }
  } finally {
    console.log("\nNettoyage");
    const { data: ids } = await admin.from("identifiants_telephone").select("utilisateur_id").in("telephone", numerosCrees);
    const { data: parEmail } = await admin.from("utilisateurs").select("id").in("email", emailsCrees);
    for (const { utilisateur_id } of ids ?? []) await admin.auth.admin.deleteUser(utilisateur_id);
    for (const { id } of parEmail ?? []) await admin.auth.admin.deleteUser(id);
    await admin.from("codes_telephone").delete().in("telephone", numerosCrees);
    await admin.from("messages_envoyes").delete().in("destinataire", numerosCrees);
    console.log(`  ${(ids?.length ?? 0) + (parEmail?.length ?? 0)} comptes de test supprimés. Captures : ${OUT}`);
    ws.close();
    chrome.kill();
  }
  console.log(`\n${echecs ? `❌ ${echecs} échec(s)` : "✅ tout est passé"}`);
  process.exit(echecs ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
