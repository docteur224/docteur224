/*
 * Vérification de l'étape 4 (Relation patient) dans Chrome, par CDP.
 * Parcours RÉELS entre deux sessions, données de test posées puis retirées :
 *
 *   Médecin (1280) : onglet Relation ouvert par l'URL ; écrit au patient,
 *     joint un PDF ; voit le consentement et l'historique des rappels
 *     (« Prévu », « Simulé ») ; règle ses délais (H-6) → le RDV à venir est
 *     reprogrammé en base.
 *   Patient (1280) : entrée Messages au menu ; conversation « 2 non lus » ;
 *     ouverture → lus en base, pastille retirée ; répond à la touche Entrée.
 *   Médecin : pastille « 1 » sur l'onglet, retirée à la lecture ; « Lu à ».
 *   Téléphone (390) : liste puis fil plein écran et retour, sans débordement,
 *     cibles ≥ 44 px ; fiche médecin sur la puce Relation.
 *   Aucune erreur console.
 *
 * Usage : APP_URL=http://localhost:3993 node scripts/verif-relation-patient.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createClient } from "@supabase/supabase-js";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = process.env.APP_URL ?? "http://localhost:3993";
const PORT = 9345;
const ICI = path.join(os.tmpdir(), "docteur224-verif-relation");
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
const DEBORDE = `document.documentElement.scrollWidth > window.innerWidth + 1`;
const PANNEAU = `document.getElementById('panneau-fiche-relation')`;
const BOUTON = (racine, texte) =>
  `[...(${racine})?.querySelectorAll('button, a') ?? []].find(b => b.offsetParent !== null && b.textContent.trim().startsWith(${JSON.stringify(texte)}))`;
const BULLES = (racine) => `[...(${racine}).querySelectorAll('[role="log"] p')].map(p => p.textContent)`;
const PLUS_PETITE_CIBLE = (racine) => `(() => { const els = [...(${racine}).querySelectorAll('button, select, textarea, label[for]')].filter(e => e.offsetParent);
  let min = 999, qui = ''; for (const e of els) { const b = e.getBoundingClientRect(); const t = Math.min(b.height, b.width); if (b.width > 1 && b.height > 1 && t < min) { min = t; qui = (e.textContent || e.id || e.tagName).trim().slice(0, 30); } } return { min: Math.round(min), qui }; })()`;

/* ---------- Données de test ---------- */
const MARQUE = "VERIF-RELATION";
let ids;
let debutTest;
const etat = { pref: undefined, rdv: null, existants: 0, nonLusPatient: 0, nonLusMedecin: 0 };
const jourPlus = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function preparer() {
  debutTest = new Date(Date.now() - 5000).toISOString();
  const { data: u } = await service.from("utilisateurs").select("id, email").in("email", ["medecin1@test.docteur224.com", "patient1@test.docteur224.com"]);
  ids = { medecinId: u.find((x) => x.email.startsWith("medecin1")).id, patientId: u.find((x) => x.email.startsWith("patient1")).id };
  const { data: pref } = await service.from("preferences_rappels").select("*").eq("titulaire_id", ids.medecinId).maybeSingle();
  etat.pref = pref ?? null;
  /* La base sert aussi la production : les comptes de démo peuvent déjà
     s'être écrit. On relève l'état de départ, et on vérifie des écarts. */
  const compter = async (expediteur, nonLus) => {
    let q = service.from("messages").select("id", { count: "exact", head: true }).eq("patient_id", ids.patientId).eq("medecin_id", ids.medecinId);
    if (expediteur) q = q.eq("expediteur_id", expediteur);
    if (nonLus) q = q.eq("lu", false);
    return (await q).count ?? 0;
  };
  etat.existants = await compter(null, false);
  etat.nonLusPatient = await compter(ids.medecinId, true); // à lire par le patient
  etat.nonLusMedecin = await compter(ids.patientId, true); // à lire par le médecin
  // Un rendez-vous à venir, pour que l'historique des rappels ait des lignes ;
  // l'une est avancée à maintenant et vidée : elle passe « simulé ».
  for (let j = 3; j <= 30 && !etat.rdv; j++) {
    for (const h of ["09:00", "10:00", "11:00", "14:00", "15:00"]) {
      const { data: ouvert } = await service.rpc("creneau_ouvert_medecin", { p_medecin_id: ids.medecinId, p_date: jourPlus(j), p_heure: h });
      if (!ouvert) continue;
      const { data } = await service.from("rendez_vous").insert({
        medecin_id: ids.medecinId, patient_id: ids.patientId, reserve_par: ids.patientId, reserve_par_role: "patient",
        date: jourPlus(j), heure: h, motif: MARQUE, source: "en_ligne",
      }).select("id").single();
      etat.rdv = data?.id ?? null;
      break;
    }
  }
  const { data: r } = await service.from("rappels_programmes").select("id").eq("rendez_vous_id", etat.rdv).eq("delai_heures", 24).maybeSingle();
  if (r) {
    await service.from("rappels_programmes").update({ programme_pour: new Date(Date.now() - 60_000).toISOString() }).eq("id", r.id);
    await fetch(`${APP}/api/rappels/drainer`, { method: "POST", headers: { "x-cle-drain": lire("EMAIL_CLE_DRAIN") } });
  }
}

async function nettoyer() {
  if (!ids) return;
  const { data: msgs } = await service.from("messages").select("id, contenu, piece_path, piece_nom, cree_le").eq("patient_id", ids.patientId).eq("medecin_id", ids.medecinId).gte("cree_le", debutTest);
  const nos = (msgs ?? []).filter((m) => m.contenu?.includes(MARQUE) || m.piece_nom === `${MARQUE}.pdf`);
  const fichiers = nos.map((m) => m.piece_path).filter(Boolean);
  if (nos.length) await service.from("messages").delete().in("id", nos.map((m) => m.id));
  if (fichiers.length) await service.storage.from("messages").remove(fichiers);
  // Seulement NOS notifications : même cree_le que le message qui les a créées.
  if (nos.length) await service.from("notifications").delete().eq("type", "message").eq("source_type", "conversation").in("cree_le", nos.map((m) => m.cree_le));
  if (etat.rdv) {
    await service.from("notifications").delete().eq("source_id", etat.rdv);
    await service.from("messages_envoyes").delete().eq("titulaire_id", ids.medecinId).eq("motif", "rappel").gte("envoye_le", debutTest);
    await service.from("rendez_vous").delete().eq("id", etat.rdv);
  }
  if (etat.pref === null) await service.from("preferences_rappels").delete().eq("titulaire_id", ids.medecinId);
  else if (etat.pref) await service.from("preferences_rappels").upsert(etat.pref, { onConflict: "titulaire_id" });
  console.log(`ℹ️  nettoyage : ${nos.length} message(s), ${fichiers.length} pièce(s) jointe(s), rendez-vous et réglages restaurés`);
}

async function main() {
  await preparer();
  const fiche = (tab) => `${APP}/espace-medecin/patients/c-${ids.patientId}?tab=${tab}`;
  const piece = path.join(ICI, `${MARQUE}.pdf`);
  writeFileSync(piece, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

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
    /* ---------- Médecin, bureau ---------- */
    let c = await seConnecter(page, cdp, "medecin1@test.docteur224.com", "test1234", "/connexion", "/S.identifier/");
    page = c.page;
    check("connexion médecin", c.ok);
    await page.taille(1280, 900, false);
    await page.goto(fiche("relation"));
    check("[1280] onglet Relation patient ouvert par l’URL", await page.waitFor(`${PANNEAU}?.querySelector('[role="log"]')`, 30000));
    check("[1280] trois sections : messagerie, rappels, téléconsultation", await page.eval(
      `['titre-messagerie','titre-rappels','titre-teleconsultation'].every(i => document.getElementById(i)) && ${PANNEAU}.textContent.includes('Bientôt disponible')`));
    await page.waitFor(`!${PANNEAU}.textContent.includes('Chargement de la conversation')`, 15000);
    if (etat.existants === 0) check("[1280] conversation vide : état vide explicite", await page.eval(`${PANNEAU}.textContent.includes('Aucun message pour l’instant')`));
    else console.log(`ℹ️  conversation déjà commencée (${etat.existants} message(s) d’avant le test) : état vide non vérifiable`);

    await page.saisir("message-fiche", `Bonjour, vos résultats sont bons. (${MARQUE})`);
    await page.cliquer(BOUTON(PANNEAU, "Envoyer"));
    check("[1280] message envoyé, affiché « Envoyé »", await page.waitFor(
      `${BULLES(PANNEAU)}.some(t => t.includes('${MARQUE}')) && ${PANNEAU}.querySelector('[role="log"]').textContent.includes('· Envoyé')`, 15000));

    const { root } = await page.send("DOM.getDocument", { depth: -1 });
    const { nodeId } = await page.send("DOM.querySelector", { nodeId: root.nodeId, selector: "#message-fiche-fichier" });
    await page.send("DOM.setFileInputFiles", { nodeId, files: [piece] });
    check("[1280] pièce jointe choisie, nommée avant l’envoi", await page.waitFor(`${PANNEAU}.textContent.includes('${MARQUE}.pdf')`, 5000));
    await page.cliquer(BOUTON(PANNEAU, "Envoyer"));
    check("[1280] pièce jointe envoyée", await page.waitFor(BOUTON(`${PANNEAU}.querySelector('[role="log"]')`, `${MARQUE}.pdf`), 20000));

    check("[1280] rappels : consentement du patient affiché", await page.eval(`${PANNEAU}.textContent.includes('Consentement du patient') && ${PANNEAU}.textContent.includes('Ses rappels partiront par WhatsApp')`));
    check("[1280] rappels : historique (prévu + simulé)", await page.waitFor(
      `${PANNEAU}.textContent.includes('Prévu') && ${PANNEAU}.textContent.includes('Simulé (mode test)')`, 10000));
    await page.shot("1280-medecin-relation");
    const bruitMedecin = [...page.console];

    /* ---------- Patient, bureau ---------- */
    c = await seConnecter(page, cdp, "patient1@test.docteur224.com", "test1234", "/connexion", "/S.identifier/");
    page = c.page;
    check("connexion patient", c.ok);
    await page.taille(1280, 900, false);
    await page.goto(`${APP}/patient/messages`);
    check("[1280] menu patient : entrée Messages", await page.waitFor(`[...document.querySelectorAll('a')].some(a => a.getAttribute('href') === '/patient/messages' && a.offsetParent)`, 15000));
    const LISTE = `document.querySelector('main ul[aria-label="Conversations"]')`;
    check("[1280] menu : un seul lien actif, « Messages »", await page.eval(
      `(() => { const a = [...document.querySelectorAll('aside [aria-current="page"]')].filter(x => x.offsetParent); return a.length === 1 && a[0].getAttribute('href') === '/patient/messages'; })()`));
    const attendus = etat.nonLusPatient + 2;
    check(`[1280] conversation listée, ${attendus} non lus`, await page.waitFor(`${LISTE}?.textContent.includes('${attendus} non lus')`, 20000));
    await page.cliquer(`${LISTE}.querySelector('button')`);
    const FIL = `document.querySelector('main [role="log"]')?.closest('.rounded-2xl')`;
    check("[1280] fil ouvert, message du médecin et pièce jointe", await page.waitFor(
      `${BULLES(FIL)}.some(t => t.includes('${MARQUE}')) && ${FIL}.textContent.includes('${MARQUE}.pdf')`, 15000));
    check("[1280] URL du fil partageable (?medecin=)", await page.eval(`location.search === '?medecin=${ids.medecinId}'`));
    check("[1280] un seul fil monté (pas de champ en double)", await page.eval(`document.querySelectorAll('#message-patient').length === 1`));
    check("[1280] lus à l’ouverture : pastille retirée", await page.waitFor(`!${LISTE}.textContent.includes('non lu')`, 20000));
    await page.saisir("message-patient", `Merci docteur ! (${MARQUE})`);
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    check("[1280] réponse envoyée à la touche Entrée", await page.waitFor(`${BULLES(FIL)}.some(t => t.startsWith('Merci docteur'))`, 15000));
    check("[1280] dernier message de la liste : « Vous : Merci… »", await page.waitFor(`${LISTE}.textContent.includes('Vous : Merci docteur')`, 15000));
    const { data: lus } = await service.from("messages").select("lu, lu_le").eq("patient_id", ids.patientId).eq("expediteur_id", ids.medecinId).gte("cree_le", debutTest);
    check("en base : messages du médecin lus, avec l’heure", lus?.length === 2 && lus.every((m) => m.lu && m.lu_le));
    await page.shot("1280-patient-messages");

    /* ---------- Patient, téléphone ---------- */
    await page.taille(390, 844, true);
    await page.goto(`${APP}/patient/messages`);
    const MOB = `document.querySelector('main')`;
    check("[390] liste des conversations", await page.waitFor(`${MOB}?.querySelector('ul[aria-label="Conversations"] button')`, 20000));
    check("[390] liste sans débordement", !(await page.eval(DEBORDE)));
    await page.shot("390-patient-liste");
    await page.cliquer(`${MOB}.querySelector('ul[aria-label="Conversations"] button')`);
    check("[390] fil en plein écran, avec retour", await page.waitFor(`${MOB}.querySelector('[role="log"]') && ${BOUTON(MOB, "← Toutes les conversations")}`, 15000));
    check("[390] fil sans débordement", !(await page.eval(DEBORDE)));
    const cibleP = await page.eval(PLUS_PETITE_CIBLE(`${MOB}.querySelector('form')`));
    check("[390] saisie : cibles ≥ 44 px", cibleP.min >= 44, `plus petite : ${cibleP.min}px (${cibleP.qui})`);
    await page.shot("390-patient-fil");
    await page.cliquer(BOUTON(MOB, "← Toutes les conversations"));
    check("[390] retour à la liste", await page.waitFor(`${MOB}.querySelector('ul[aria-label="Conversations"]') && location.search === ''`, 5000));
    const bruitPatient = [...page.console];

    /* ---------- Médecin : la réponse, lue ---------- */
    c = await seConnecter(page, cdp, "medecin1@test.docteur224.com", "test1234", "/connexion", "/S.identifier/");
    page = c.page;
    await page.taille(1280, 900, false);
    await page.goto(fiche("dossier"));
    const ONGLET = `document.getElementById('onglet-fiche-relation')`;
    const pastille = etat.nonLusMedecin + 1;
    check(`[1280] onglet Relation : pastille « ${pastille} » (réponse non lue)`, await page.waitFor(`${ONGLET}?.textContent.trim().endsWith('${pastille}')`, 20000),
      await page.eval(`${ONGLET}?.textContent`).catch(() => ""));
    await page.cliquer(ONGLET);
    check("[1280] réponse du patient affichée", await page.waitFor(`${PANNEAU} && ${BULLES(PANNEAU)}.some(t => t.startsWith('Merci docteur'))`, 20000));
    check("[1280] pastille retirée une fois lue", await page.waitFor(`!/\\d$/.test(${ONGLET}.textContent.trim())`, 20000));
    check("[1280] statut « Lu à » sous le dernier envoi du médecin", await page.eval(`${PANNEAU}.querySelector('[role="log"]').textContent.includes('· Lu à')`));

    /* ---------- Réglage des délais ---------- */
    await page.goto(`${APP}/espace-medecin/abonnement`);
    const GROUPE = `[...document.querySelectorAll('[role="group"][aria-label="Délais des rappels"]')].find(g => g.offsetParent)`;
    const coches = `[...(${GROUPE})?.querySelectorAll('button[aria-pressed="true"]') ?? []].map(b => b.textContent).join(',')`;
    check("[1280] délais : J-1 et H-2 cochés par défaut", await page.waitFor(`${coches} === 'J-1,H-2'`, 20000), await page.eval(coches).catch(() => ""));
    await page.cliquer(`[...(${GROUPE}).querySelectorAll('button')].find(b => b.textContent === 'H-6')`);
    await page.waitFor(`document.body.innerText.includes('Préférences enregistrées')`, 10000);
    const { data: pref } = await service.from("preferences_rappels").select("delais_heures").eq("titulaire_id", ids.medecinId).maybeSingle();
    check("en base : H-6 ajouté aux délais", JSON.stringify(pref?.delais_heures) === "[24,6,2]", JSON.stringify(pref?.delais_heures));
    const { data: rep } = await service.from("rappels_programmes").select("delai_heures").eq("rendez_vous_id", etat.rdv).eq("etat", "programme");
    check("en base : le RDV à venir est reprogrammé avec H-6", (rep ?? []).some((x) => x.delai_heures === 6), (rep ?? []).map((x) => x.delai_heures).join(","));
    await page.shot("1280-medecin-delais");

    /* ---------- Médecin, téléphone ---------- */
    await page.taille(390, 844, true);
    await page.goto(fiche("relation"));
    check("[390] fiche : puce Relation active", await page.waitFor(`document.getElementById('puce-fiche-relation')?.getAttribute('aria-selected') === 'true' && ${PANNEAU}?.querySelector('[role="log"] p')`, 30000));
    await sleep(1500); // les compteurs des puces arrivent
    check("[390] puce active entièrement visible", await page.eval(
      `(() => { const b = document.getElementById('puce-fiche-relation').getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth; })()`));
    check("[390] fiche relation sans débordement", !(await page.eval(DEBORDE)));
    const cibleM = await page.eval(PLUS_PETITE_CIBLE(PANNEAU));
    check("[390] fiche relation : cibles ≥ 44 px", cibleM.min >= 44, `plus petite : ${cibleM.min}px (${cibleM.qui})`);
    await page.shot("390-medecin-relation");
    await page.eval(`document.getElementById('titre-rappels').scrollIntoView({ block: 'start' })`);
    await sleep(300);
    await page.shot("390-medecin-rappels");

    const bruit = [...bruitMedecin, ...bruitPatient, ...page.console].filter((x) => !/favicon|Multiple GoTrueClient/i.test(x));
    check("aucune erreur console", bruit.length === 0, bruit.slice(0, 3).join(" | "));
  } finally {
    try { chrome.kill(); } catch { /* déjà fermé */ }
  }
}

// Délai global : au-delà, on abandonne MAIS on nettoie.
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
