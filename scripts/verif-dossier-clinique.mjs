/*
 * Vérification du Dossier clinique (fiche patient, étape 2) dans Chrome, par
 * CDP et sans dépendance. Parcours RÉELS, comme un médecin les ferait :
 *
 *   - le module s'ouvre par défaut avec ses quatre sections ;
 *   - une note se rédige, se modifie (v2), et la v1 reste lisible ;
 *   - des constantes se saisissent ; une tension élevée est signalée PENDANT
 *     la frappe, puis dans la tuile et la courbe ;
 *   - la courbe répond au survol ET au clavier (info-bulle) ;
 *   - une mesure se marque erronée et reste dans l'historique ;
 *   - la chronologie se filtre par type ;
 *   - téléphone 390 et 360 : aucun défilement horizontal, cibles ≥ 44 px,
 *     dialogues en feuille montante ;
 *   - aucune erreur console.
 *
 * Données créées supprimées à la fin. Prérequis : build + next start.
 * Usage : APP_URL=http://localhost:3993 node scripts/verif-dossier-clinique.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createClient } from "@supabase/supabase-js";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = process.env.APP_URL ?? "http://localhost:3993";
const PORT = 9339;
const ICI = path.join(os.tmpdir(), "docteur224-verif-dossier-clinique");
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
    return new Promise((res, rej) => this.attente.set(id, { res, rej }));
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
  /** Clique l'élément visible désigné par une expression JS. */
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
    await sleep(450);
  }
  /** Remplit un champ par son id : sélectionne tout, puis tape. */
  async saisir(id, texte) {
    await this.eval(`(() => { const el = document.getElementById(${JSON.stringify(id)}); el.focus(); el.select?.(); })()`);
    await this.send("Input.insertText", { text: texte });
    await sleep(120);
  }
  async touche(key, code) {
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: code });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: code });
    await sleep(300);
  }
  async shot(nom) {
    const r = await this.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path.join(OUT, `${nom}.png`), Buffer.from(r.data, "base64"));
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
  return p;
}

/* ---------- Repères ---------- */
const PANNEAU = `document.getElementById('panneau-fiche-dossier')`;
const BOUTON = (texte) =>
  `[...document.querySelectorAll('button')].find(b => b.offsetParent !== null && b.textContent.trim().startsWith(${JSON.stringify(texte)}))`;
const DIALOGUE = (debut) => `[...document.querySelectorAll('[role="dialog"]')].find(d => (d.getAttribute('aria-label') ?? '').startsWith(${JSON.stringify(debut)}))`;
const DANS = (racine, texte) => `[...(${racine})?.querySelectorAll('button') ?? []].find(b => b.offsetParent !== null && b.textContent.trim().startsWith(${JSON.stringify(texte)}))`;
const DEBORDE = `document.documentElement.scrollWidth > window.innerWidth + 1`;
const PLUS_PETITE_CIBLE = `(() => {
  const racine = ${PANNEAU};
  const els = [...racine.querySelectorAll('button, a[href], select, [role="radio"]')].filter(e => e.offsetParent !== null);
  let min = 999, qui = '';
  for (const e of els) { const b = e.getBoundingClientRect(); if (b.height && b.height < min) { min = b.height; qui = (e.textContent || e.tagName).trim().slice(0, 30); } }
  return { min: Math.round(min), qui };
})()`;

const MARQUE = "(VERIF-UI)";
let debutTest;
let ids;

async function nettoyer() {
  if (!ids) return;
  const { data: notes } = await service.from("notes_consultation").select("id").eq("medecin_id", ids.medecinId).gte("cree_le", debutTest);
  const { data: cst } = await service.from("constantes").select("id").eq("medecin_id", ids.medecinId).gte("cree_le", debutTest);
  const tout = [...(notes ?? []), ...(cst ?? [])].map((x) => x.id);
  if (tout.length) await service.from("journal_audit").delete().in("cible_id", tout);
  if (notes?.length) await service.from("notes_consultation").delete().in("id", notes.map((n) => n.id));
  if (cst?.length) await service.from("constantes").delete().in("id", cst.map((c) => c.id));
  console.log(`ℹ️  nettoyage : ${notes?.length ?? 0} note(s), ${cst?.length ?? 0} prise(s) de constantes`);
}

async function main() {
  debutTest = new Date(Date.now() - 5000).toISOString();
  const { data: u } = await service.from("utilisateurs").select("id, email").in("email", ["medecin1@test.docteur224.com", "patient1@test.docteur224.com"]);
  ids = {
    medecinId: u.find((x) => x.email.startsWith("medecin1")).id,
    patientId: u.find((x) => x.email.startsWith("patient1")).id,
  };
  const fiche = `${APP}/espace-medecin/patients/c-${ids.patientId}`;

  // Une mesure ancienne, pour que la courbe ait deux points à relier.
  await service.from("constantes").insert({
    medecin_id: ids.medecinId, patient_id: ids.patientId, saisi_par: ids.medecinId,
    mesure_le: new Date(Date.now() - 40 * 86400000).toISOString(),
    poids_kg: 74, tension_sys: 132, tension_dia: 84,
  });

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
    /* ---------- Connexion ---------- */
    await page.send("Network.clearBrowserCookies");
    await page.taille(1280, 900, false);
    await page.goto(`${APP}/connexion`);
    await sleep(800);
    for (const [sel, val] of [['input[type="email"]', "medecin1@test.docteur224.com"], ['input[type="password"]', "test1234"]]) {
      await page.eval(`[...document.querySelectorAll('${sel}')].find(e => e.offsetParent)?.focus()`);
      await page.send("Input.insertText", { text: val });
    }
    await page.eval(`[...document.querySelectorAll('button')].find(b => b.offsetParent && /S.identifier/.test(b.textContent))?.click()`);
    check("connexion médecin", await page.waitFor(`!location.pathname.endsWith('connexion')`, 25000));
    page = await onglet(cdp, page);
    await page.taille(1280, 900, false);

    /* ---------- Ouverture ---------- */
    await page.goto(fiche);
    const pret = await page.waitFor(`${PANNEAU} && /Constantes/.test(${PANNEAU}.textContent) && !${PANNEAU}.querySelector('[aria-busy="true"], .animate-pulse')`, 30000);
    check("[1280] Dossier clinique ouvert par défaut, chargé", pret);
    const sections = await page.eval(`[...${PANNEAU}.querySelectorAll('h3')].map(h => h.textContent.replace(/\\s*\\(.*\\)/, '').trim())`);
    check(
      "[1280] quatre sections",
      ["Constantes", "Notes de consultation", "Historique des consultations", "Chronologie"].every((s) => sections.includes(s)),
      sections.join(" | ")
    );
    await page.shot("1280-clinique-ouverture");
    console.log(`   console après ouverture 1280 : ${page.console.length ? page.console.join(" | ").slice(0, 300) : "rien"}`);

    /* ---------- Note : création ---------- */
    await page.cliquer(DANS(PANNEAU, "Nouvelle note"));
    check("[1280] dialogue de note ouvert", await page.waitFor(DIALOGUE("Nouvelle note"), 5000));
    await page.saisir("note-motif", `Contrôle tensionnel ${MARQUE}`);
    await page.saisir("note-examen", "TA 150/95 au repos, auscultation normale");
    await page.saisir("note-diagnostic", "HTA grade 1");
    await page.saisir("note-conduite", "Mesures hygiéno-diététiques, contrôle dans 1 mois");
    await page.shot("1280-note-redaction");
    await page.cliquer(DANS(DIALOGUE("Nouvelle note"), "Enregistrer la note"));
    check("[1280] note enregistrée, dialogue refermé", await page.waitFor(`!(${DIALOGUE("Nouvelle note")})`, 10000));
    check(
      "[1280] la note apparaît dans la liste",
      await page.waitFor(`[...${PANNEAU}.querySelectorAll('article')].some(a => a.textContent.includes(${JSON.stringify(MARQUE)}))`, 10000)
    );

    /* ---------- Note : nouvelle version ---------- */
    const ARTICLE = `[...${PANNEAU}.querySelectorAll('article')].find(a => a.textContent.includes(${JSON.stringify(MARQUE)}))`;
    await page.cliquer(DANS(ARTICLE, "Modifier"));
    check("[1280] dialogue de modification ouvert", await page.waitFor(DIALOGUE("Modifier la note"), 5000));
    const repris = await page.eval(`document.getElementById('note-diagnostic').value`);
    check("[1280] le contenu actuel est repris", repris === "HTA grade 1", repris);
    await page.saisir("note-diagnostic", "HTA grade 1 confirmée");
    await page.cliquer(DANS(DIALOGUE("Modifier la note"), "Enregistrer la version 2"));
    check("[1280] version 2 enregistrée", await page.waitFor(`(${ARTICLE})?.textContent.includes('Modifiée · v2')`, 10000));

    /* ---------- Note : lecture des versions ---------- */
    await page.cliquer(DANS(ARTICLE, "Ouvrir"));
    const DETAIL = `[...document.querySelectorAll('[role="dialog"]')].find(d => (d.getAttribute('aria-label') ?? '').includes(${JSON.stringify(MARQUE)}))`;
    check("[1280] note ouverte", await page.waitFor(DETAIL, 5000));
    check("[1280] la v2 affiche le diagnostic modifié", await page.eval(`(${DETAIL}).textContent.includes('HTA grade 1 confirmée')`));
    await page.cliquer(DANS(DETAIL, "v1"));
    const v1 = await page.eval(`(() => { const t = (${DETAIL}).textContent; return t.includes('HTA grade 1') && !t.includes('confirmée'); })()`);
    check("[1280] la v1 reste lisible, telle qu’écrite", v1);
    await page.shot("1280-note-versions");
    await page.touche("Escape", 27);
    check("[1280] Échap referme la note", await page.waitFor(`!(${DETAIL})`, 4000));

    /* ---------- Constantes ---------- */
    await page.cliquer(DANS(PANNEAU, "Saisir des constantes"));
    check("[1280] dialogue de constantes ouvert", await page.waitFor(DIALOGUE("Saisir des constantes"), 5000));
    await page.saisir("cst-poids", "72,5");
    await page.saisir("cst-sys", "152");
    await page.saisir("cst-dia", "96");
    await page.saisir("cst-gly", "1,32");
    check(
      "[1280] tension élevée signalée pendant la frappe",
      await page.waitFor(`(${DIALOGUE("Saisir des constantes")}).textContent.includes('Élevée')`, 3000)
    );
    check(
      "[1280] glycémie à jeun au seuil du diabète signalée",
      await page.eval(`(${DIALOGUE("Saisir des constantes")}).textContent.includes('seuil du diabète')`)
    );
    await page.shot("1280-constantes-saisie");
    await page.cliquer(DANS(DIALOGUE("Saisir des constantes"), "Enregistrer"));
    check("[1280] constantes enregistrées", await page.waitFor(`!(${DIALOGUE("Saisir des constantes")})`, 10000));
    check("[1280] la tuile Tension affiche 152/96", await page.waitFor(`${PANNEAU}.textContent.includes('152/96 mmHg')`, 10000));
    check("[1280] la tuile poids affiche 72,5 kg", await page.eval(`${PANNEAU}.textContent.includes('72,5 kg')`));

    // Courbe de tension : deux séries, légende, points
    const SVG = `${PANNEAU}.querySelector('svg[role="group"]')`;
    await page.waitFor(SVG, 5000);
    const courbe = await page.eval(`(() => { const s = ${SVG}; return { traces: s.querySelectorAll('path').length, points: s.querySelectorAll('circle').length }; })()`);
    check("[1280] courbe de tension : deux tracés", courbe.traces === 2, JSON.stringify(courbe));
    check("[1280] légende Systolique / Diastolique", await page.eval(`${PANNEAU}.textContent.includes('Systolique') && ${PANNEAU}.textContent.includes('Diastolique')`));

    // Survol : info-bulle
    const zone = await page.eval(`(() => { const r = ${SVG}.querySelector('rect[tabindex]').getBoundingClientRect(); return { x: r.right - 6, y: r.top + r.height / 2 }; })()`);
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: zone.x, y: zone.y });
    await sleep(300);
    check("[1280] info-bulle au survol (valeur + état)", await page.eval(`(() => { const t = ${PANNEAU}.querySelector('.shadow-card')?.textContent ?? ''; return t.includes('152 mmHg') && t.includes('Élevée'); })()`));
    await page.shot("1280-courbe-survol");
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });

    // Clavier : flèches
    // Sans point choisi, la première flèche prend la mesure la plus récente ;
    // la suivante recule d'une mesure.
    await page.eval(`${SVG}.querySelector('rect[tabindex]').focus()`);
    await page.touche("ArrowLeft", 37);
    check("[1280] clavier : la première flèche prend la dernière mesure", await page.eval(`(${PANNEAU}.querySelector('.shadow-card')?.textContent ?? '').includes('152 mmHg')`));
    await page.touche("ArrowLeft", 37);
    check("[1280] clavier : la suivante recule d'une mesure", await page.eval(`(${PANNEAU}.querySelector('.shadow-card')?.textContent ?? '').includes('132 mmHg')`));

    // Période
    await page.cliquer(DANS(PANNEAU, "3 mois"));
    check("[1280] période 3 mois sélectionnée", await page.eval(`${DANS(PANNEAU, "3 mois")}.getAttribute('aria-checked') === 'true'`));
    await page.cliquer(DANS(PANNEAU, "Poids"));
    check("[1280] courbe de poids : une série, sans légende", await page.eval(`${SVG}.querySelectorAll('path').length === 1 && !${PANNEAU}.textContent.includes('Diastolique')`));

    /* ---------- Mesure erronée ---------- */
    await page.cliquer(DANS(PANNEAU, "Signaler une erreur"));
    check("[1280] dialogue « mesure erronée »", await page.waitFor(DIALOGUE("Signaler une mesure erronée"), 5000));
    await page.cliquer(DANS(DIALOGUE("Signaler une mesure erronée"), "Marquer comme erronée"));
    check("[1280] la mesure reste, marquée erronée", await page.waitFor(`${PANNEAU}.textContent.includes('Erronée · Faute de frappe')`, 10000));

    /* ---------- Consultations & chronologie ---------- */
    check("[1280] historique des consultations rempli", await page.eval(`[...${PANNEAU}.querySelectorAll('section')].some(s => /Historique des consultations/.test(s.textContent) && s.querySelectorAll('li').length > 0)`));
    const SECTION_CHRONO = `[...${PANNEAU}.querySelectorAll('section')].find(s => s.querySelector('h3')?.textContent.startsWith('Chronologie'))`;
    await page.cliquer(DANS(SECTION_CHRONO, "Notes"));
    await sleep(1200);
    const types = await page.eval(`[...(${SECTION_CHRONO}).querySelectorAll('ol > li')].map(li => li.textContent.split('·')[0].trim())`);
    check("[1280] chronologie filtrée sur les notes", types.length >= 2 && types.every((t) => t.startsWith("Note")), types.slice(0, 4).join(", "));
    await page.cliquer(DANS(SECTION_CHRONO, "Tout"));
    await sleep(1200);
    const mix = await page.eval(`new Set([...(${SECTION_CHRONO}).querySelectorAll('ol > li')].map(li => li.textContent.split('·')[0].trim())).size`);
    check("[1280] chronologie « Tout » mélange les types", mix >= 3, `${mix} types`);
    check("[1280] pas de défilement horizontal", !(await page.eval(DEBORDE)));
    await page.eval(`document.getElementById('titre-notes').scrollIntoView({ block: 'start', behavior: 'instant' })`);
    await sleep(300);
    await page.shot("1280-notes-consultations");
    await page.eval(`document.getElementById('titre-chronologie').scrollIntoView({ block: 'start', behavior: 'instant' })`);
    await sleep(300);
    await page.shot("1280-chronologie");
    await page.eval("window.scrollTo(0, 0)");
    await page.shot("1280-clinique-complet");

    /* ---------- Téléphone ---------- */
    for (const [l, h] of [[390, 844], [360, 800]]) {
      await page.taille(l, h, true);
      await page.goto(`${fiche}?tab=dossier`);
      await page.waitFor(`${PANNEAU}?.offsetParent && /Constantes/.test(${PANNEAU}.textContent) && !${PANNEAU}.querySelector('.animate-pulse')`, 30000);
      await sleep(600);
      check(`[${l}] module visible sur la puce Clinique`, await page.eval(`!!${PANNEAU}.offsetParent`));
      check(`[${l}] pas de défilement horizontal`, !(await page.eval(DEBORDE)));
      const cible = await page.eval(PLUS_PETITE_CIBLE);
      check(`[${l}] zones tactiles ≥ 44 px`, cible.min >= 44, `plus petite : ${cible.min}px (${cible.qui})`);
      await page.shot(`${l}-clinique`);
      console.log(`   console après ouverture ${l} : ${page.console.length ? page.console.join(" | ").slice(0, 200) : "rien"}`);
      await page.cliquer(DANS(PANNEAU, "Saisir des constantes"));
      await page.waitFor(DIALOGUE("Saisir des constantes"), 5000);
      check(
        `[${l}] saisie en feuille montante`,
        await page.eval(`(() => { const d = (${DIALOGUE("Saisir des constantes")})?.firstElementChild; const b = d.getBoundingClientRect(); return Math.abs(b.bottom - innerHeight) < 2; })()`)
      );
      check(`[${l}] clavier numérique sur les champs`, await page.eval(`document.getElementById('cst-poids').inputMode === 'decimal' && document.getElementById('cst-sys').inputMode === 'numeric'`));
      await page.shot(`${l}-constantes-saisie`);
      await page.touche("Escape", 27);
    }

    const bruit = page.console.filter((x) => !/favicon|Multiple GoTrueClient/i.test(x));
    check("aucune erreur console", bruit.length === 0, bruit.slice(0, 3).join(" | "));
  } finally {
    try { chrome.kill(); } catch { /* déjà fermé */ }
  }
}

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
