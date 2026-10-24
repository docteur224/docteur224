/*
 * Vérification de l'étape 3 (Ordonnances et documents) dans Chrome, par CDP.
 * Parcours RÉELS, données de test posées puis retirées :
 *
 *   Médecin (1280)
 *     - signe au pavé (tracé à la souris) depuis le dialogue de dépôt ;
 *     - rédige une ordonnance structurée : recherche « amoxi », choisit dans
 *       la base → ALERTE allergie (patient allergique à la pénicilline) ;
 *       émission bloquée tant que la confirmation n'est pas cochée ;
 *     - enregistre la prescription comme modèle ; émet ;
 *     - le PDF stocké porte le code, la mention de signature ; rendu dans
 *       Chrome, son QR est DÉCODÉ (jsQR) et mène à /verifier/<code> ;
 *     - la page publique dit « Document valide » sans rien du patient ;
 *       code recopié en minuscules accepté ; code inconnu signalé ;
 *     - émet un arrêt de travail pré-rempli (3 jours) ;
 *   Téléphone (390) : dialogue en feuille, éditeur sans débordement, cibles ≥ 44 px.
 *   Administrateur : base de médicaments (recherche, export Excel, import
 *     d'un CSV avec relecture : 1 ajout, 1 ligne en erreur) ; mobile 390.
 *   Aucune erreur console.
 *
 * Usage : APP_URL=http://localhost:3993 ADMIN_MDP=… node scripts/verif-ordonnances.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createClient } from "@supabase/supabase-js";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = process.env.APP_URL ?? "http://localhost:3993";
const PORT = 9344;
const ICI = path.join(os.tmpdir(), "docteur224-verif-ordonnances");
const OUT = path.join(ICI, "captures");
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const lire = (c) => env.match(new RegExp(`^${c}=(.*)$`, "m"))?.[1].trim();
const service = createClient(lire("NEXT_PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});
const JSQR = readFileSync(new URL("../node_modules/jsqr/dist/jsQR.js", import.meta.url), "utf8");

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

async function seConnecter(page, cdp, email, mdp, porte, bouton) {
  await page.send("Network.clearBrowserCookies");
  await page.taille(1280, 900, false);
  await page.goto(`${APP}${porte}`);
  await sleep(800);
  for (const [sel, val] of [['input[type="email"]', email], ['input[type="password"]', mdp]]) {
    await page.eval(`[...document.querySelectorAll('${sel}')].find(e => e.offsetParent)?.focus()`);
    await page.send("Input.insertText", { text: val });
  }
  await page.eval(`[...document.querySelectorAll('button')].find(b => b.offsetParent && ${bouton}.test(b.textContent))?.click()`);
  const ok = await page.waitFor(`!location.pathname.endsWith('connexion')`, 25000);
  return { ok, page: await onglet(cdp, page) };
}

/* ---------- Repères ---------- */
const DIALOGUE = `[...document.querySelectorAll('[role="dialog"]')].find(d => (d.getAttribute('aria-label') ?? '').startsWith('Remettre un document'))`;
const DANS = (racine, texte) =>
  `[...(${racine})?.querySelectorAll('button, [role="option"], a') ?? []].find(b => b.offsetParent !== null && b.textContent.trim().startsWith(${JSON.stringify(texte)}))`;
const BOUTON_EMETTRE = DANS(DIALOGUE, "Émettre et remettre");
const DEBORDE = `document.documentElement.scrollWidth > window.innerWidth + 1`;

/* ---------- Données de test ---------- */
const MARQUE = "VERIF-UI";
let ids;
let debutTest;
const etat = { infos: undefined, signature: undefined };

async function preparer() {
  debutTest = new Date(Date.now() - 5000).toISOString();
  const { data: u } = await service.from("utilisateurs").select("id, email").in("email", ["medecin1@test.docteur224.com", "patient1@test.docteur224.com"]);
  ids = { medecinId: u.find((x) => x.email.startsWith("medecin1")).id, patientId: u.find((x) => x.email.startsWith("patient1")).id };
  // Allergie déclarée : pénicilline (l'état d'avant est restauré à la fin).
  const { data: infos } = await service.from("infos_medicales").select("*").eq("patient_id", ids.patientId).maybeSingle();
  etat.infos = infos ?? null;
  if (infos) await service.from("infos_medicales").update({ allergies: ["Pénicilline"] }).eq("id", infos.id);
  else await service.from("infos_medicales").insert({ patient_id: ids.patientId, allergies: ["Pénicilline"] });
  // Pas de signature au départ : le test la crée au pavé.
  const { data: sig } = await service.from("signatures_medecin").select("*").eq("medecin_id", ids.medecinId).maybeSingle();
  etat.signature = sig ?? null;
  await service.from("signatures_medecin").delete().eq("medecin_id", ids.medecinId);
}

async function nettoyer() {
  if (!ids) return;
  // Uniquement les pièces du TEST (la base est partagée avec la production) :
  // l'ordonnance amoxicilline + paracétamol et l'arrêt de travail émis ici.
  const { data: candidats } = await service
    .from("documents_patient").select("id, fichier_path, type, contenu")
    .eq("medecin_id", ids.medecinId).eq("patient_id", ids.patientId).gte("cree_le", debutTest);
  const docs = (candidats ?? []).filter(
    (d) => (d.type === "ordonnance" && d.contenu?.startsWith("AMOXICILLINE 500 MG")) || d.type === "arret_travail"
  );
  if (docs?.length) {
    const chemins = docs.map((d) => d.fichier_path).filter(Boolean);
    if (chemins.length) await service.storage.from("documents").remove(chemins);
    await service.from("journal_audit").delete().in("cible_id", docs.map((d) => d.id));
    await service.from("documents_patient").update({ remplace_par_id: null }).in("id", docs.map((d) => d.id));
    await service.from("documents_patient").delete().in("id", docs.map((d) => d.id));
  }
  await service.from("notifications").delete().eq("destinataire_id", ids.patientId).gte("cree_le", debutTest);
  await service.from("modeles_ordonnance").delete().ilike("nom", `%${MARQUE}%`);
  const { data: meds } = await service.from("medicaments").select("id").ilike("dci", `%${MARQUE}%`);
  if (meds?.length) {
    await service.from("journal_audit").delete().in("cible_id", meds.map((m) => m.id));
    await service.from("medicaments").delete().in("id", meds.map((m) => m.id));
  }
  await service.from("journal_audit").delete().eq("action", "A importé la base de médicaments").gte("cree_le", debutTest);
  if (etat.infos) await service.from("infos_medicales").update({ allergies: etat.infos.allergies }).eq("id", etat.infos.id);
  else if (etat.infos === null) await service.from("infos_medicales").delete().eq("patient_id", ids.patientId);
  await service.from("signatures_medecin").delete().eq("medecin_id", ids.medecinId);
  if (etat.signature) await service.from("signatures_medecin").insert(etat.signature);
  console.log(`ℹ️  nettoyage : ${docs?.length ?? 0} document(s), modèles, médicaments, allergie et signature restaurées`);
}

async function main() {
  await preparer();
  const fiche = `${APP}/espace-medecin/patients/c-${ids.patientId}?tab=documents`;

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
    const c1 = await seConnecter(page, cdp, "medecin1@test.docteur224.com", "test1234", "/connexion", "/S.identifier/");
    page = c1.page;
    check("connexion médecin", c1.ok);
    await page.taille(1280, 900, false);
    await page.goto(fiche);
    await page.waitFor(`document.querySelector('#panneau-fiche-documents article')`, 30000);

    /* ---------- Dialogue de dépôt ---------- */
    await page.cliquer(`[...document.querySelectorAll('#panneau-fiche-documents button')].find(b => b.offsetParent && b.textContent.trim() === '+ Document')`);
    check("[1280] dialogue de dépôt ouvert", await page.waitFor(DIALOGUE, 5000));
    check("[1280] ordonnance par défaut, éditeur structuré", await page.waitFor(`document.getElementById('med-0')`, 5000));
    check("[1280] allergies déclarées rappelées", await page.eval(`(${DIALOGUE}).textContent.includes('Allergies déclarées : Pénicilline')`));

    /* ---------- Signature au pavé ---------- */
    // Premier clic : ouvre la section ; le composant lit alors la signature
    // en base (squelette), puis propose son propre « Créer ma signature ».
    await page.cliquer(DANS(DIALOGUE, "Créer ma signature"));
    await page.waitFor(DANS(DIALOGUE, "Créer ma signature"), 8000);
    await page.cliquer(DANS(DIALOGUE, "Créer ma signature"));
    check("[1280] pavé de signature affiché", await page.waitFor(`(${DIALOGUE}).querySelector('canvas')`, 5000));
    const toile = await page.centre(`(${DIALOGUE}).querySelector('canvas')`);
    const pts = Array.from({ length: 24 }, (_, i) => [toile.l + toile.w * (0.1 + 0.8 * (i / 23)), toile.t + toile.h * (0.5 + 0.25 * Math.sin(i / 2.5))]);
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pts[0][0], y: pts[0][1] });
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: pts[0][0], y: pts[0][1], button: "left", buttons: 1, clickCount: 1 });
    for (const [x, y] of pts.slice(1)) {
      await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 });
    }
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pts.at(-1)[0], y: pts.at(-1)[1], button: "left", buttons: 0, clickCount: 1 });
    await sleep(300);
    await page.shot("1280-signature");
    await page.cliquer(DANS(DIALOGUE, "Enregistrer la signature"));
    check(
      "[1280] signature enregistrée",
      await page.waitFor(`(${DIALOGUE}).textContent.includes('Votre signature électronique et un QR de vérification seront apposés')`, 10000)
    );
    const { data: sig } = await service.from("signatures_medecin").select("traits").eq("medecin_id", ids.medecinId).maybeSingle();
    check("signature en base : un tracé de plusieurs points", (sig?.traits?.[0]?.length ?? 0) > 5, `${sig?.traits?.[0]?.length ?? 0} points`);
    await page.cliquer(DANS(DIALOGUE, "Masquer"));

    /* ---------- Ordonnance structurée + alerte allergie ---------- */
    await page.saisir("med-0", "amoxi");
    check("[1280] recherche dans la base", await page.waitFor(`[...document.querySelectorAll('[role="option"]')].some(o => o.textContent.includes('Amoxicilline 500 mg — gélule'))`, 8000));
    await page.shot("1280-recherche-medicament");
    await page.cliquer(`[...document.querySelectorAll('[role="option"]')].find(o => o.textContent.startsWith('Amoxicilline 500 mg — gélule'))`);
    check(
      "[1280] alerte allergie sur l’amoxicilline",
      await page.waitFor(`[...(${DIALOGUE}).querySelectorAll('[role="alert"]')].some(a => a.textContent.includes('Pénicilline (même classe : pénicillines)'))`, 4000)
    );
    await page.saisir("poso-0", "1 gélule 3 fois par jour");
    await page.saisir("duree-0", "7 jours");
    await page.saisir("qte-0", "21 gélules");
    check("[1280] émission bloquée sans confirmation", await page.eval(`(${BOUTON_EMETTRE}).disabled === true`));
    await page.cliquer(`(${DIALOGUE}).querySelector('input[type="checkbox"]')`);
    check("[1280] confirmation cochée → émission possible", await page.waitFor(`(${BOUTON_EMETTRE}).disabled === false`, 3000));

    await page.cliquer(DANS(DIALOGUE, "Ajouter un médicament"));
    await page.saisir("med-1", "paracé");
    await page.waitFor(`[...document.querySelectorAll('[role="option"]')].some(o => o.textContent.startsWith('Paracétamol 1 g — comprimé'))`, 8000);
    await page.cliquer(`[...document.querySelectorAll('[role="option"]')].find(o => o.textContent.startsWith('Paracétamol 1 g — comprimé'))`);
    await page.saisir("poso-1", "1 comprimé si douleur, 3 par jour au maximum");
    check("[1280] pas d’alerte sur le paracétamol", await page.eval(`[...(${DIALOGUE}).querySelectorAll('[role="alert"]')].filter(a => a.textContent.includes('Allergie déclarée :')).length === 1`));
    check(
      "[1280] la confirmation survit à l’ajout d’un médicament sans alerte",
      await page.eval(`(${DIALOGUE}).querySelector('input[type="checkbox"]').checked && (${BOUTON_EMETTRE}).disabled === false`)
    );

    // Modèle
    await page.cliquer(DANS(DIALOGUE, "Enregistrer comme modèle"));
    await page.saisir("nom-modele", `Angine adulte (${MARQUE})`);
    await page.cliquer(`[...(${DIALOGUE}).querySelectorAll('button')].find(b => b.offsetParent && b.textContent.trim() === 'Enregistrer')`);
    check("[1280] modèle enregistré", await page.waitFor(`(${DIALOGUE}).textContent.includes('Modèle « Angine adulte (${MARQUE}) » enregistré')`, 8000));
    await page.shot("1280-ordonnance-redaction");

    // Émission
    await page.cliquer(BOUTON_EMETTRE);
    const emise = await page.waitFor(`(${DIALOGUE}).textContent.includes('code de vérification D224-')`, 30000);
    check("[1280] ordonnance émise, code annoncé", emise);
    const code = await page.eval(`(${DIALOGUE}).textContent.match(/D224-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/)?.[0]`);
    console.log(`   code : ${code}`);
    await page.shot("1280-ordonnance-emise");

    const { data: doc } = await service.from("documents_patient").select("id, titre, prescription, code_verification, fichier_path, contenu").eq("code_verification", code).maybeSingle();
    check("en base : prescription structurée (2 lignes)", doc?.prescription?.length === 2, JSON.stringify(doc?.prescription?.map((l) => l.libelle)));
    check("en base : titre automatique", /^Ordonnance du \d{2}\/\d{2}\/\d{4}$/.test(doc?.titre ?? ""), doc?.titre);
    check("en base : texte de l’ordonnance tiré des lignes", doc?.contenu?.startsWith("AMOXICILLINE 500 MG — gélule"), doc?.contenu?.split("\n")[0]);

    /* ---------- Le PDF : code, signature, QR décodé ---------- */
    const { data: blob } = await service.storage.from("documents").download(doc.fichier_path);
    const pdf = Buffer.from(await blob.arrayBuffer());
    const fichierPdf = path.join(ICI, "ordonnance.pdf");
    writeFileSync(fichierPdf, pdf);
    const textePdf = pdf.toString("latin1");
    check("PDF : code imprimé en clair", textePdf.includes(code));
    check("PDF : mention de signature électronique", textePdf.includes("Sign") && textePdf.includes("lectroniquement le"));
    check("PDF : tracé de signature (chemins vectoriels)", /\d+\.\d+ \d+\.\d+ l/.test(textePdf));

    const vue = await onglet(cdp);
    await vue.taille(900, 1270, false);
    await vue.send("Page.navigate", { url: `file:///${fichierPdf.replace(/\\/g, "/")}` });
    await sleep(3500);
    const png = await vue.shot("pdf-ordonnance");
    await vue.send("Page.navigate", { url: "about:blank" });
    await sleep(300);
    await vue.eval(JSQR.replace(/^/, "") + ";0");
    const lu = await vue.eval(`new Promise((ok) => { const img = new Image(); img.onload = () => {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height);
        const r = jsQR(d.data, c.width, c.height); ok(r ? r.data : null); };
      img.onerror = () => ok('erreur image'); img.src = 'data:image/png;base64,${png}'; })`);
    check("PDF rendu : QR décodé, il mène à /verifier/<code>", typeof lu === "string" && lu.endsWith(`/verifier/${code}`), String(lu));
    await cdp.send("Target.closeTarget", { targetId: vue.targetId }).catch(() => {});

    /* ---------- Liste et aperçu ---------- */
    await page.cliquer(DANS(DIALOGUE, "Fermer"));
    const carte = `[...document.querySelectorAll('#panneau-fiche-documents article')].find(a => a.textContent.includes('Amoxicilline 500 mg, Paracétamol 1 g'))`;
    check("[1280] la nouvelle ordonnance est listée avec ses médicaments", await page.waitFor(carte, 10000));
    await page.cliquer(`[...(${carte}).querySelectorAll('button')].find(b => b.textContent.trim() === 'Ouvrir')`);
    const APERCU = `[...document.querySelectorAll('[role="dialog"]')].find(d => (d.getAttribute('aria-label') ?? '').startsWith('Ordonnance du'))`;
    check("[1280] aperçu : code de vérification et lien", await page.waitFor(`(${APERCU})?.textContent.includes(${JSON.stringify(code)}) && (${APERCU}).querySelector('a[href="/verifier/${code}"]')`, 8000));
    check("[1280] aperçu : posologie structurée", await page.eval(`(${APERCU}).textContent.includes('1 gélule 3 fois par jour · pendant 7 jours · Quantité : 21 gélules')`));
    await page.shot("1280-apercu-code");
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", windowsVirtualKeyCode: 27 });
    await sleep(400);

    /* ---------- Page publique de vérification ---------- */
    await page.goto(`${APP}/verifier/${code}`);
    await page.waitFor(`document.body.innerText.includes('Document valide')`, 15000);
    const texteVerif = await page.eval("document.body.innerText");
    check("vérification : « Document valide »", texteVerif.includes("Document valide"));
    check("vérification : médecin et date", texteVerif.includes("Mamadou Diallo") && /Émis le/.test(texteVerif));
    check("vérification : rien du patient", !texteVerif.includes("Alpha") && !texteVerif.includes("Condé") && !texteVerif.includes("AMOXICILLINE"));
    check("vérification : page non indexée", await page.eval(`document.querySelector('meta[name="robots"]')?.content.includes('noindex')`));
    await page.shot("1280-verification-valide");
    await page.goto(`${APP}/verifier/${code.toLowerCase().replace("d224-", "")}`);
    check("vérification : code recopié en minuscules accepté", await page.waitFor(`document.body.innerText.includes('Document valide')`, 15000));
    await page.goto(`${APP}/verifier/D224-AAAA-BBBB-CCCC`);
    check("vérification : code inconnu signalé", await page.waitFor(`document.body.innerText.includes('Code inconnu')`, 15000));
    await page.taille(390, 844, true);
    await page.goto(`${APP}/verifier/${code}`);
    await page.waitFor(`document.body.innerText.includes('Document valide')`, 15000);
    check("[390] vérification lisible au téléphone, sans débordement", !(await page.eval(DEBORDE)));
    await page.shot("390-verification");
    await page.taille(1280, 900, false);

    /* ---------- Arrêt de travail ---------- */
    await page.goto(fiche);
    await page.waitFor(`document.querySelector('#panneau-fiche-documents article')`, 30000);
    await page.cliquer(`[...document.querySelectorAll('#panneau-fiche-documents button')].find(b => b.offsetParent && b.textContent.trim() === '+ Document')`);
    await page.waitFor(DIALOGUE, 5000);
    await page.valeur("doc-type", "arret_travail");
    check("[1280] arrêt de travail : champs du modèle", await page.waitFor(`document.getElementById('arret-debut') && document.getElementById('arret-fin')`, 4000));
    const debut = await page.eval(`document.getElementById('arret-debut').value`);
    const fin = new Date(Date.parse(`${debut}T00:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10);
    await page.valeur("arret-fin", fin, "input");
    await page.valeur("arret-fin", fin, "change");
    const texteArret = await page.eval(`document.getElementById('doc-contenu').value`);
    check("[1280] texte pré-rempli : 3 jours, patient nommé", /de 3 jours/.test(texteArret) && texteArret.includes("Alpha Condé"), texteArret.slice(0, 120));
    check("[1280] titre pré-rempli", (await page.eval(`document.getElementById('doc-titre').value`)).startsWith("Arrêt de travail du"));
    await page.shot("1280-arret-travail");
    await page.cliquer(BOUTON_EMETTRE);
    check("[1280] arrêt de travail émis", await page.waitFor(`(${DIALOGUE}).textContent.includes('Arrêt de travail remis à')`, 30000));
    await page.cliquer(DANS(DIALOGUE, "Fermer"));

    /* ---------- Téléphone ---------- */
    await page.taille(390, 844, true);
    await page.goto(fiche);
    await page.waitFor(`document.querySelector('#panneau-fiche-documents article')?.offsetParent`, 30000);
    await page.cliquer(`[...document.querySelectorAll('#panneau-fiche-documents button')].find(b => b.offsetParent && b.textContent.trim() === '+ Document')`);
    await page.waitFor(`document.getElementById('med-0')`, 5000);
    const feuille = await page.eval(`(() => { const p = (${DIALOGUE}).firstElementChild; const b = p.getBoundingClientRect();
      return { bas: Math.abs(b.bottom - innerHeight) < 2, deborde: p.scrollWidth > p.clientWidth + 1 }; })()`);
    check("[390] dialogue en feuille montante", feuille.bas);
    check("[390] éditeur sans débordement horizontal", !feuille.deborde && !(await page.eval(DEBORDE)));
    const cible = await page.eval(`(() => { const els = [...(${DIALOGUE}).querySelectorAll('button, select, input:not([type=checkbox]):not([type=file])')].filter(e => e.offsetParent);
      let min = 999, qui = ''; for (const e of els) { const h = e.getBoundingClientRect().height; if (h && h < min) { min = h; qui = (e.textContent || e.id || e.tagName).trim().slice(0, 30); } } return { min: Math.round(min), qui }; })()`);
    check("[390] cibles du dialogue ≥ 44 px", cible.min >= 44, `plus petite : ${cible.min}px (${cible.qui})`);
    await page.shot("390-ordonnance-editeur");

    const bruitMedecin = page.console.filter((x) => !/favicon|Multiple GoTrueClient/i.test(x));
    check("médecin : aucune erreur console", bruitMedecin.length === 0, bruitMedecin.slice(0, 2).join(" | "));

    /* ---------- Administrateur ---------- */
    if (!process.env.ADMIN_MDP) {
      console.log("ℹ️  ADMIN_MDP absent : écran administrateur non testé");
    } else {
      const c2 = await seConnecter(page, cdp, "admin@docteur224.com", process.env.ADMIN_MDP, "/espace-admin/connexion", "/Accéder à la console/");
      page = c2.page;
      check("connexion administrateur", c2.ok);
      await page.taille(1280, 900, false);
      await page.goto(`${APP}/espace-admin/medicaments`);
      check("[1280] admin : base listée", await page.waitFor(`document.querySelectorAll('main table tbody tr').length > 10`, 20000));
      check("[1280] admin : entrée de menu « Médicaments »", await page.eval(`!!document.querySelector('a[href="/espace-admin/medicaments"][aria-current="page"]')`));
      await page.saisir("recherche-medicament", "amoxi");
      await sleep(400);
      const nbAmox = await page.eval(`document.querySelectorAll('main table tbody tr').length`);
      check("[1280] admin : recherche", nbAmox >= 4 && nbAmox < 15, `${nbAmox} lignes`);
      await page.shot("1280-admin-medicaments");
      const exp = await page.eval(`fetch('/api/admin/medicaments/export').then(async r => ({ s: r.status, t: r.headers.get('content-type'), n: (await r.arrayBuffer()).byteLength }))`);
      check("[1280] admin : export Excel", exp.s === 200 && exp.t.includes("spreadsheetml") && exp.n > 4000, JSON.stringify(exp));

      // Import d'un CSV : 1 ajout, 1 ligne en erreur
      const csv = path.join(ICI, "import-verif.csv");
      writeFileSync(csv, `DCI;Dosage;Forme;Classe;Actif\nMolécule ${MARQUE};5 mg;comprimé;essais;oui\n;5 mg;comprimé;;oui\n`);
      await page.cliquer(`[...document.querySelectorAll('main button')].find(b => b.offsetParent && b.textContent.trim() === 'Importer')`);
      await page.waitFor(`document.getElementById('fichier-import')`, 5000);
      const { root } = await page.send("DOM.getDocument", { depth: -1 });
      const { nodeId } = await page.send("DOM.querySelector", { nodeId: root.nodeId, selector: "#fichier-import" });
      await page.send("DOM.setFileInputFiles", { nodeId, files: [csv] });
      await sleep(300);
      await page.cliquer(`[...document.querySelectorAll('[role="dialog"] button')].find(b => b.offsetParent && b.textContent.trim() === 'Analyser le fichier')`);
      const analyse = await page.waitFor(`[...document.querySelectorAll('[role="dialog"]')].some(d => d.textContent.includes('Ligne 3') && d.textContent.includes('DCI manquante'))`, 15000);
      check("[1280] admin : analyse — ligne en erreur numérotée", analyse);
      await page.shot("1280-admin-import-analyse");
      await page.cliquer(`[...document.querySelectorAll('[role="dialog"] button')].find(b => b.offsetParent && b.textContent.trim().startsWith('Appliquer : 1 ajout'))`);
      check("[1280] admin : import appliqué", await page.waitFor(`document.body.innerText.includes('Import appliqué : 1 ajout(s), 0 modification(s), 1 ligne(s) écartée(s)')`, 15000));
      const { data: ajoute } = await service.from("medicaments").select("dci, classe, origine").ilike("dci", `%${MARQUE}%`).maybeSingle();
      check("en base : médicament importé (origine admin, classe)", ajoute?.origine === "admin" && ajoute?.classe === "essais", JSON.stringify(ajoute));

      await page.taille(390, 844, true);
      await page.goto(`${APP}/espace-admin/medicaments`);
      await page.waitFor(`document.querySelectorAll('main ul li').length > 5`, 20000);
      check("[390] admin : cartes, pas de tableau, pas de débordement", !(await page.eval(DEBORDE)) && !(await page.eval(`!!document.querySelector('main table')?.offsetParent`)));
      await page.shot("390-admin-medicaments");
      const bruitAdmin = page.console.filter((x) => !/favicon|Multiple GoTrueClient/i.test(x));
      check("admin : aucune erreur console", bruitAdmin.length === 0, bruitAdmin.slice(0, 2).join(" | "));
    }
  } finally {
    try { chrome.kill(); } catch { /* déjà fermé */ }
  }
}

// Délai global : au-delà, on abandonne MAIS on nettoie — un test tué de
// l'extérieur laisserait l'allergie et la signature de test en base.
setTimeout(async () => {
  console.error("❌ délai global dépassé (8 min) — nettoyage puis arrêt");
  await nettoyer().catch(() => {});
  process.exit(1);
}, 8 * 60_000).unref();

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
