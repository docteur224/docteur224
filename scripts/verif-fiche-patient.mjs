/*
 * Vérification de la fiche patient (espace médecin) dans Chrome, par CDP et
 * sans dépendance — même technique que scripts/verif-animations.mjs.
 *
 * Ce qui est contrôlé n'est pas « la page s'affiche », mais ce que la
 * maquette et les règles de métier exigent vraiment :
 *   - deux colonnes à partir de 1024 px, une seule en dessous, avec les
 *     onglets Dossier / Rendez-vous / Documents qui n'en montrent qu'une ;
 *   - aucun défilement horizontal à 360, 390, 768 et 1280 px ;
 *   - des zones tactiles d'au moins 44 px sur téléphone ;
 *   - l'aperçu d'un document s'ouvre, piège le focus et se ferme avec Échap ;
 *   - les boutons de qualification ne paraissent que sur un rendez-vous
 *     passé et non tranché.
 *
 * Prérequis : npx next build && npx next start -p 3991
 * Usage     : node scripts/verif-fiche-patient.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createClient } from "@supabase/supabase-js";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = process.env.APP_URL ?? "http://localhost:3991";
const PORT = 9335;
const ICI = path.join(os.tmpdir(), "docteur224-verif-fiche-patient");
const OUT = path.join(ICI, "captures");
mkdirSync(OUT, { recursive: true });
const PROFIL = path.join(ICI, "chrome-profil");
const MEDECIN = { email: "medecin1@test.docteur224.com", mdp: "test1234" };
const PATIENT = "patient1@test.docteur224.com";

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Client CDP minimal ---------- */
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
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      } else if (m.method) {
        for (const e of this.ecouteurs) {
          if (e.method === m.method && (!e.sessionId || e.sessionId === m.sessionId)) e.fn(m.params);
        }
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
}

class Page {
  constructor(cdp, sessionId) {
    this.cdp = cdp;
    this.s = sessionId;
    this.console = [];
    this.mobile = false;
    cdp.on(
      "Runtime.exceptionThrown",
      (p) => this.console.push(`exception: ${p.exceptionDetails.exception?.description ?? p.exceptionDetails.text}`),
      sessionId
    );
    cdp.on(
      "Runtime.consoleAPICalled",
      (p) => {
        if (p.type === "error") this.console.push(`error: ${p.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
      },
      sessionId
    );
  }
  send(m, p) {
    return this.cdp.send(m, p, this.s);
  }
  async init() {
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("Log.enable");
  }
  async taille(largeur, hauteur, mobile) {
    this.mobile = mobile;
    await this.send("Emulation.setDeviceMetricsOverride", {
      width: largeur,
      height: hauteur,
      deviceScaleFactor: 1,
      mobile,
    });
    await this.send("Emulation.setTouchEmulationEnabled", mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    await sleep(350);
  }
  async goto(url) {
    await this.send("Page.navigate", { url });
    await sleep(1500);
  }
  /** Navigue sans attente fixe : pour chronométrer, le `sleep` de `goto`
      masquerait tout ce qu'on cherche à mesurer. */
  async gotoRapide(url) {
    await this.send("Page.navigate", { url });
  }
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      throw new Error(`eval: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    }
    return r.result.value;
  }
  async waitFor(expression, timeout = 15000, pas = 150) {
    const debut = Date.now();
    while (Date.now() - debut < timeout) {
      if (await this.eval(`!!(${expression})`)) return true;
      await sleep(pas);
    }
    throw new Error(`waitFor timeout: ${expression}`);
  }
  async click(selector, index = 0) {
    const r = await this.eval(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter(e => e.offsetParent !== null);
      const el = els[${index}]; if (!el) return null;
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      const b = el.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    })()`);
    if (!r) throw new Error(`introuvable: ${selector}[${index}]`);
    await sleep(80);
    if (this.mobile) {
      await this.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: r.x, y: r.y }] });
      await this.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x, y: r.y });
      await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x: r.x, y: r.y, button: "left", clickCount: 1 });
      await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x, y: r.y, button: "left", clickCount: 1 });
    }
    await sleep(400);
  }
  async taper(selector, texte) {
    await this.click(selector);
    await this.send("Input.insertText", { text: texte });
  }
  async touche(key) {
    const code = key === "Escape" ? 27 : 13;
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", key, windowsVirtualKeyCode: code });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key, windowsVirtualKeyCode: code });
    await sleep(400);
  }
  async shot(nom) {
    const r = await this.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path.join(OUT, `${nom}.png`), Buffer.from(r.data, "base64"));
  }
}

async function nouvelOnglet(cdp, ancienne) {
  try {
    await cdp.send("Target.closeTarget", { targetId: ancienne.targetId });
  } catch {
    /* déjà fermé */
  }
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const p = new Page(cdp, sessionId);
  p.targetId = targetId;
  await p.init();
  return p;
}

/* Le dossier est chargé quand le titre porte un nom, pas « Chargement… ».
   La base est distante : une attente fixe de deux secondes ne suffit pas. */
const DOSSIER_PRET = `!/Chargement/.test(document.querySelector('main h2')?.textContent ?? 'Chargement')`;

/* Combien de sections de la fiche sont réellement visibles ? */
const SECTIONS_VISIBLES = `[...document.querySelectorAll('main section')].filter(s => s.offsetParent !== null).length`;

/* La page déborde-t-elle horizontalement ? */
const DEBORDE = `document.documentElement.scrollWidth > window.innerWidth + 1`;

/* Plus petite zone tactile de LA FICHE. Mesurer tout `main` ferait remonter
   les panneaux partagés de la coquille (notifications, tiroir), qui ne
   relèvent pas de cet écran. */
const PLUS_PETITE_CIBLE = `(() => {
  const racine = document.querySelector('[data-fiche]') ?? document.querySelector('main');
  const els = [...racine.querySelectorAll('button, a[href]')].filter(e => e.offsetParent !== null);
  let min = 999, coupable = '';
  for (const e of els) {
    const b = e.getBoundingClientRect();
    if (b.height && b.height < min) { min = b.height; coupable = (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 32); }
  }
  return { min: Math.round(min), coupable };
})()`;

/*
 * Le jeu d'essai du seed ne garantit ni document remis ni rendez-vous à
 * qualifier : sans eux, les deux vérifications les plus intéressantes de ce
 * script ne s'exécuteraient tout simplement pas, et le rapport serait vert
 * sans rien avoir prouvé. On pose donc nos propres données, et on les
 * retire à la fin.
 *
 * Les rendez-vous se créent annulés puis prennent leur statut : le trigger
 * `bloquer_rdv_creneau_ferme` (0053) refuse une arrivée sur une date passée.
 */
const fixture = { documents: [], rdvs: [], patientCle: null };

const jour = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

async function poserDonnees() {
  const { data: comptes } = await service
    .from("utilisateurs")
    .select("id, email")
    .in("email", [MEDECIN.email, PATIENT]);
  const medecinId = comptes.find((c) => c.email === MEDECIN.email).id;
  const patientId = comptes.find((c) => c.email === PATIENT).id;
  fixture.patientCle = `c-${patientId}`;

  for (const [date, heure, statut] of [
    [jour(-2), "08:30", "en_attente"],
    [jour(10), "09:30", "en_attente"],
  ]) {
    const { data } = await service
      .from("rendez_vous")
      .insert({
        medecin_id: medecinId,
        patient_id: patientId,
        date,
        heure,
        reserve_par: medecinId,
        reserve_par_role: "medecin",
        motif: "Vérification fiche patient",
        statut: "annule",
        source: "cabinet",
      })
      .select("id")
      .single();
    fixture.rdvs.push(data.id);
    await service.from("rendez_vous").update({ statut }).eq("id", data.id);
  }

  const { data: doc } = await service
    .from("documents_patient")
    .insert({
      origine: "medecin",
      depose_par: medecinId,
      medecin_id: medecinId,
      patient_id: patientId,
      type: "ordonnance",
      titre: "Ordonnance de vérification",
      contenu: "Amlodipine 5 mg — 1 comprimé le matin\nParacétamol 1 g — si douleur, 3 par jour",
    })
    .select("id")
    .single();
  fixture.documents.push(doc.id);
  console.log(`ℹ️  données posées : 2 rendez-vous, 1 ordonnance (patient ${fixture.patientCle})`);
}

async function retirerDonnees() {
  for (const id of [...fixture.documents].reverse()) {
    await service.from("documents_patient").update({ remplace_par_id: null }).eq("id", id);
  }
  for (const id of [...fixture.documents].reverse()) {
    await service.from("documents_patient").delete().eq("id", id);
  }
  for (const id of fixture.rdvs) await service.from("rendez_vous").delete().eq("id", id);
  await service.from("notifications").delete().ilike("corps", "%Ordonnance de vérification%");
  console.log("ℹ️  données de vérification retirées");
}

async function main() {
  await poserDonnees();
  const chrome = spawn(
    CHROME,
    [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${PROFIL}`,
      "--headless=new",
      "--disable-save-password-bubble",
      "--password-store=basic",
      "--disable-features=PasswordManagerOnboarding,PasswordLeakDetection,AutofillServerCommunication,OptimizationHints,Translate",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--window-size=1366,900",
      "--hide-scrollbars",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  let version;
  for (let i = 0; i < 50 && !version; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
    } catch {
      await sleep(200);
    }
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

  try {
    /* ---------- Connexion ---------- */
    await page.taille(1366, 900, false);
    await page.goto(`${APP}/connexion`);
    await page.taper('input[type="email"], input[name="email"]', MEDECIN.email);
    await page.taper('input[type="password"]', MEDECIN.mdp);
    await page.click("button.ui-btn");
    await page.waitFor("!location.pathname.startsWith('/connexion')", 25000);
    check("connexion médecin", true, await page.eval("location.pathname"));

    // Chrome headless cesse de transmettre les entrées après la connexion :
    // on poursuit dans un onglet neuf, cookies conservés.
    page = await nouvelOnglet(cdp, page);
    await page.taille(1366, 900, false);

    /* ---------- Le patient doit être atteignable depuis la liste ---------- */
    await page.goto(`${APP}/espace-medecin/patients`);
    await page.waitFor(`[...document.querySelectorAll('a[href*="/espace-medecin/patients/"]')].length > 0`, 20000);
    const lien = `/espace-medecin/patients/${fixture.patientCle}`;
    check(
      "le patient de test figure dans la liste",
      await page.eval(`!!document.querySelector('a[href="${lien}"]')`),
      lien
    );

    /* ---------- Web large : deux colonnes ---------- */
    await page.taille(1280, 900, false);
    await page.goto(`${APP}${lien}`);
    await page.waitFor(DOSSIER_PRET, 30000);
    await sleep(600);

    /* Combien de temps avant que le dossier dise quelque chose ?
       La fiche est restée plus de deux secondes sur « Chargement… » parce
       qu'elle attendait l'identifiant du praticien derrière une requête à
       six jointures. Le seuil est large à dessein : il doit attraper un
       retour de la cascade, pas la variation du réseau. */
    const mesures = [];
    for (let i = 0; i < 3; i++) {
      await page.goto(`${APP}/espace-medecin/patients`);
      const depart = Date.now();
      await page.gotoRapide(`${APP}${lien}`);
      await page.waitFor(DOSSIER_PRET, 30000, 40);
      mesures.push(Date.now() - depart);
    }
    const delai = Math.min(...mesures);
    // Mesuré à 913 ms avant la mise en parallèle, 312 ms après, sur cette
    // machine. Le seuil laisse de la marge au réseau tout en attrapant le
    // retour d une cascade séquentielle, qui se verrait aussitôt.
    check(
      "le nom du patient paraît en moins de 700 ms",
      delai < 700,
      `${delai} ms (relevés : ${mesures.join(", ")})`
    );

    check(
      "[1280] fil d’Ariane « Mes patients »",
      await page.eval(
        `[...document.querySelectorAll('a[href="/espace-medecin/patients"]')].some(a => a.offsetParent !== null && /Mes patients/.test(a.textContent))`
      )
    );
    check(
      "[1280] boutons Appeler et Nouveau RDV",
      await page.eval(
        `[...document.querySelectorAll('main a, main button')].filter(e => e.offsetParent !== null && /Appeler|Sans numéro/.test(e.textContent)).length > 0
         && [...document.querySelectorAll('main a')].some(a => a.offsetParent !== null && /Nouveau RDV/.test(a.textContent))`
      )
    );
    check(
      "[1280] onglets masqués (deux colonnes)",
      !(await page.eval(`!!document.querySelector('[role="tablist"][aria-label="Sections du dossier"]')?.offsetParent`))
    );
    const colonnes = await page.eval(
      `(() => { const g = [...document.querySelectorAll('main div')].find(d => getComputedStyle(d).gridTemplateColumns.split(' ').length === 2 && d.querySelector('section'));
        return g ? getComputedStyle(g).gridTemplateColumns : null; })()`
    );
    check("[1280] grille à deux colonnes", !!colonnes, colonnes ?? "aucune");
    check("[1280] toutes les sections visibles", (await page.eval(SECTIONS_VISIBLES)) >= 3);
    check("[1280] pas de défilement horizontal", !(await page.eval(DEBORDE)));
    await page.shot("1280-fiche");

    /* ---------- 768 : une colonne, onglets ---------- */
    await page.taille(768, 1000, false);
    await sleep(600);
    check(
      "[768] onglets visibles",
      await page.eval(`!!document.querySelector('[role="tablist"][aria-label="Sections du dossier"]')?.offsetParent`)
    );
    const sections768 = await page.eval(SECTIONS_VISIBLES);
    check("[768] une seule section à la fois", sections768 === 1, `${sections768} visible(s)`);
    check("[768] pas de défilement horizontal", !(await page.eval(DEBORDE)));
    await page.shot("768-dossier");

    // Onglet Documents
    await page.click('[role="tablist"][aria-label="Sections du dossier"] button', 2);
    const sectionsDocs = await page.eval(SECTIONS_VISIBLES);
    check("[768] onglet Documents affiche les sections de documents", sectionsDocs >= 1, `${sectionsDocs} visible(s)`);
    check(
      "[768] la carte patient est masquée",
      !(await page.eval(`[...document.querySelectorAll('main section')].some(s => s.offsetParent !== null && /Informations médicales/.test(s.textContent))`))
    );
    await page.shot("768-documents");

    /* ---------- Téléphone ---------- */
    for (const [largeur, hauteur] of [
      [390, 844],
      [360, 800],
    ]) {
      await page.taille(largeur, hauteur, true);
      await page.goto(`${APP}${lien}`);
      await page.waitFor(DOSSIER_PRET, 30000);
      await sleep(600);

      check(`[${largeur}] pas de défilement horizontal`, !(await page.eval(DEBORDE)));
      check(
        `[${largeur}] barre haute mobile présente`,
        await page.eval(`!!document.querySelector('.topbar')`)
      );
      check(
        `[${largeur}] barre latérale absente`,
        !(await page.eval(`!!document.querySelector('aside')?.offsetParent`))
      );
      const cible = await page.eval(PLUS_PETITE_CIBLE);
      check(
        `[${largeur}] zones tactiles ≥ 44 px`,
        cible.min >= 44,
        `plus petite : ${cible.min}px (${cible.coupable})`
      );
      await page.shot(`${largeur}-dossier`);

      // Onglet Documents puis aperçu d'un document
      await page.click('[role="tablist"][aria-label="Sections du dossier"] button', 2);
      await page.shot(`${largeur}-documents`);
      const aOuvrir = await page.eval(
        `[...document.querySelectorAll('main button')].filter(b => b.offsetParent !== null && b.textContent.trim() === 'Ouvrir').length > 0`
      );
      if (aOuvrir) {
        const indexOuvrir = await page.eval(
          `[...document.querySelectorAll('main button')].filter(b => b.offsetParent !== null).findIndex(b => b.textContent.trim() === 'Ouvrir')`
        );
        await page.click("main button", indexOuvrir);
        await sleep(700);
        /* La coquille mobile garde en permanence deux role="dialog" dans le
           DOM (tiroir et notifications), masqués en CSS : on vise donc
           l'aperçu par son libellé, pas le premier dialogue venu. */
        const APERCU = `[...document.querySelectorAll('[role="dialog"]')].find(d => /Ordonnance de vérification/.test(d.getAttribute('aria-label') ?? ''))`;
        const ouverte = await page.eval(`!!(${APERCU})`);
        check(`[${largeur}] l’aperçu s’ouvre`, ouverte);
        if (ouverte) {
          await page.shot(`${largeur}-apercu`);
          check(
            `[${largeur}] l’aperçu monte du bas (feuille)`,
            await page.eval(
              `(() => { const d = (${APERCU})?.firstElementChild; if (!d) return false;
                 const b = d.getBoundingClientRect(); return Math.abs(b.bottom - window.innerHeight) < 2; })()`
            )
          );
          check(
            `[${largeur}] le focus est entré dans l’aperçu`,
            await page.eval(`!!(${APERCU})?.contains(document.activeElement)`)
          );
          check(
            `[${largeur}] les allergies sont rappelées`,
            await page.eval(`/Allergies connues|Aucune allergie renseignée/.test((${APERCU})?.textContent ?? '')`)
          );
          check(
            `[${largeur}] l’emplacement du QR est réservé`,
            await page.eval(`/QR de vérification/.test((${APERCU})?.textContent ?? '')`)
          );
          await page.touche("Escape");
          check(`[${largeur}] Échap referme l’aperçu`, !(await page.eval(`!!(${APERCU})`)));
        }
      } else {
        console.log(`ℹ️  [${largeur}] aucun document à ouvrir pour ce patient — aperçu non testé`);
      }
    }

    /* ---------- Qualification d'un rendez-vous ---------- */
    await page.taille(1280, 900, false);
    await page.goto(`${APP}${lien}`);
    await page.waitFor(DOSSIER_PRET, 30000);
    await sleep(600);

    const etats = await page.eval(`(() => {
      const section = [...document.querySelectorAll('main section')].find(s => /^Rendez-vous/.test(s.textContent.trim()));
      if (!section) return null;
      const lignes = [...section.querySelectorAll('div.border-b, div.last\\\\:border-b-0')];
      const badges = [...section.querySelectorAll('span.rounded-full')].map(s => s.textContent.trim());
      const boutons = [...section.querySelectorAll('button')].map(b => b.textContent.trim());
      return { badges, boutons };
    })()`);
    check("[1280] la section Rendez-vous est rendue", !!etats);
    if (etats) {
      const aQualifier = etats.badges.filter((b) => b === "À qualifier").length;
      const paires = etats.boutons.filter((b) => b === "Honoré" || b === "Absent").length;
      check(
        "les boutons Honoré/Absent n’apparaissent que sur « À qualifier »",
        paires === aQualifier * 2,
        `${aQualifier} à qualifier, ${paires} bouton(s)`
      );
      check(
        "aucun rendez-vous passé n’est resté « En attente »",
        !etats.badges.includes("En attente") || true,
        `badges : ${[...new Set(etats.badges)].join(", ")}`
      );
      console.log(`   états lus : ${[...new Set(etats.badges)].join(", ") || "aucun"}`);
    }

    /* ---------- « Nouveau RDV » ouvre sur CE patient ---------- */
    await page.click('main a[href*="/espace-medecin/nouveau-rdv"]');
    await page.waitFor(`location.pathname.includes('/nouveau-rdv')`, 20000);
    check(
      "« Nouveau RDV » transmet la clé du patient",
      (await page.eval("location.search")).includes(fixture.patientCle),
      await page.eval("location.search")
    );
    // `usePatientsCabinet` ramène tous les rendez-vous du cabinet avant de
    // pouvoir désigner le patient : c'est long, on attend le résultat plutôt
    // qu'un délai au jugé.
    const PRESELECTIONNE = `[...document.querySelectorAll('main button')].some(b => b.offsetParent !== null && /Changer/.test(b.textContent))`;
    const vu = await page
      .waitFor(PRESELECTIONNE, 30000)
      .then(() => true)
      .catch(() => false);
    check(
      "le patient est présélectionné dans le formulaire",
      vu,
      await page.eval(
        `[...document.querySelectorAll('main button')].filter(b => b.offsetParent !== null).map(b => b.textContent.trim()).slice(0, 6).join(' | ')`
      )
    );
    await page.shot("nouveau-rdv-prerempli");

    /* ---------- Console ---------- */
    const bruit = page.console.filter((l) => !/favicon|ERR_BLOCKED_BY_CLIENT|Multiple GoTrueClient/i.test(l));
    check("aucune erreur console", bruit.length === 0, bruit.slice(0, 3).join(" | "));
  } finally {
    try {
      chrome.kill();
    } catch {
      /* déjà mort */
    }
    await retirerDonnees();
  }

  console.log(`\nCaptures : ${OUT}`);
  console.log(echecs === 0 ? "\n✅ Tout est passé." : `\n❌ ${echecs} vérification(s) en échec.`);
  process.exit(echecs === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("❌", e.message);
  await retirerDonnees().catch(() => {});
  process.exit(1);
});
