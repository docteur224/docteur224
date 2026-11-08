/*
 * Vérification du suivi d'absence (espace médecin) dans Chrome, par CDP et
 * sans dépendance — même technique que scripts/verif-fiche-patient.mjs.
 *
 * Ce qui est contrôlé n'est pas « la page s'affiche », mais les points du
 * cahier des charges qui ne se voient qu'au navigateur :
 *
 *   5. une demande à confirmer, sur le tableau de bord, porte une pastille
 *      d'absence quand le demandeur a manqué des rendez-vous ;
 *   6. la même information paraît sur la fiche du patient ;
 *   7. cliquer la pastille ouvre la fiche du patient DANS le menu Suivi
 *      d'absence (c'est le fil entre les trois points) ;
 *   - le menu liste le patient, ses indicateurs, et ouvre le détail ;
 *   - aucun défilement horizontal à 360, 390, 768 et 1280 px ;
 *   - des zones tactiles d'au moins 44 px sur téléphone ;
 *   - la console reste muette.
 *
 * Aucun message n'est envoyé : le script n'ouvre pas le dialogue « Avertir »
 * jusqu'à l'envoi (il partirait pour de vrai). L'envoi lui-même est couvert,
 * en mode simulé, par scripts/test-suivi-absence.mjs.
 *
 * Prérequis : npx next build && npx next start -p 3992
 * Usage     : node scripts/verif-suivi-absence.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createClient } from "@supabase/supabase-js";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = process.env.APP_URL ?? "http://localhost:3992";
const PORT = 9337;
const ICI = path.join(os.tmpdir(), "docteur224-verif-suivi-absence");
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

/* ---------- Client CDP minimal (identique aux autres verif-*) ---------- */
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
        if (p.type === "error")
          this.console.push(`error: ${p.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
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
    await this.send(
      "Emulation.setTouchEmulationEnabled",
      mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false }
    );
    await sleep(350);
  }
  async goto(url) {
    await this.send("Page.navigate", { url });
    await sleep(1500);
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
  /* Clique un élément visible. `texte` restreint aux éléments dont le libellé
     correspond — plusieurs boutons peuvent partager une classe (la page de
     connexion a deux `.ui-btn` visibles). */
  async click(selector, index = 0, texte = null) {
    const r = await this.eval(`(() => {
      let els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter(e => e.offsetParent !== null);
      ${texte ? `els = els.filter(e => /${texte}/i.test(e.textContent || ''));` : ""}
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
    await sleep(500);
  }
  async taper(selector, texte) {
    await this.click(selector);
    await this.send("Input.insertText", { text: texte });
  }
  /* Écrit dans un champ CONTRÔLÉ par React : le setter natif pose la valeur,
     l'événement `input` prévient React. `insertText` seul peut ne pas
     déclencher le onChange selon la version de Chrome, et le champ reste vide
     — la connexion échoue alors en silence. */
  async remplir(selector, index, texte) {
    const ok = await this.eval(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter(e => e.offsetParent !== null);
      const el = els[${index}]; if (!el) return false;
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(el, ${JSON.stringify(texte)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    if (!ok) throw new Error(`champ introuvable: ${selector}[${index}]`);
    await sleep(120);
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

const DEBORDE = `document.documentElement.scrollWidth > window.innerWidth + 1`;

/* Plus petite zone tactile de l'écran — bornée à notre contenu (`[data-suivi]`).
   Mesurer tout `main` ferait remonter l'en-tête mobile partagé (sa flèche de
   retour), qui ne relève pas de cet écran — exactement comme verif-fiche-patient
   se restreint à `[data-fiche]`. */
const PLUS_PETITE_CIBLE = `(() => {
  const racine = document.querySelector('[data-suivi]') ?? document.querySelector('main');
  const els = [...racine.querySelectorAll('button, a[href]')].filter(e => e.offsetParent !== null);
  let min = 999, coupable = '';
  for (const e of els) {
    const b = e.getBoundingClientRect();
    if (b.height && b.height < min) { min = b.height; coupable = (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 32); }
  }
  return { min: Math.round(min), coupable };
})()`;

const jour = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/*
 * On pose de quoi FAIRE APPARAÎTRE un signal : trois absences passées (pour
 * franchir le seuil « à risque »), et une demande à confirmer à venir pour le
 * même patient (pour que la pastille ait où se poser sur le tableau de bord).
 * Tout est retiré à la fin.
 *
 * Les rendez-vous se créent annulés puis prennent leur statut : le trigger
 * `bloquer_rdv_creneau_ferme` (0053) refuse une arrivée sur une date passée.
 */
const fixture = { rdvs: [], cle: null, medecinId: null };

async function poserDonnees() {
  const { data: comptes } = await service
    .from("utilisateurs")
    .select("id, email")
    .in("email", [MEDECIN.email, PATIENT]);
  const medecinId = comptes.find((c) => c.email === MEDECIN.email).id;
  const patientId = comptes.find((c) => c.email === PATIENT).id;
  fixture.cle = `c-${patientId}`;
  fixture.medecinId = medecinId;

  const poser = async (date, heure, statut) => {
    const { data } = await service
      .from("rendez_vous")
      .insert({
        medecin_id: medecinId,
        patient_id: patientId,
        date,
        heure,
        reserve_par: medecinId,
        reserve_par_role: "medecin",
        motif: "Vérification suivi d’absence",
        statut: "annule",
        source: "cabinet",
      })
      .select("id")
      .single();
    fixture.rdvs.push(data.id);
    if (statut !== "annule") await service.from("rendez_vous").update({ statut }).eq("id", data.id);
  };

  await poser(jour(-40), "08:00", "absent");
  await poser(jour(-30), "08:30", "absent");
  await poser(jour(-10), "09:00", "absent");
  await poser(jour(-20), "09:30", "honore");
  // La demande à confirmer qui portera la pastille sur le tableau de bord.
  await poser(jour(3), "10:00", "en_attente");

  // Compteur de suivi au propre : pas de remise à zéro héritée d'un essai.
  await service
    .from("suivi_absence_patients")
    .delete()
    .eq("medecin_id", medecinId)
    .eq("cle_patient", fixture.cle);

  console.log(`ℹ️  données posées : 3 absences, 1 honoré, 1 demande (patient ${fixture.cle})`);
}

async function retirerDonnees() {
  if (fixture.rdvs.length) {
    await service.from("notifications").delete().in("source_id", fixture.rdvs);
    await service.from("rendez_vous").delete().in("id", fixture.rdvs);
  }
  if (fixture.medecinId && fixture.cle) {
    await service
      .from("suivi_absence_patients")
      .delete()
      .eq("medecin_id", fixture.medecinId)
      .eq("cle_patient", fixture.cle);
  }
  console.log("ℹ️  données de vérification retirées");
}

/* La pastille d'absence, où qu'elle soit : elle pointe vers le menu, clé en
   paramètre. C'est le sélecteur qui relie les trois points. */
const PASTILLE = `a[href*="/espace-medecin/suivi-absence?patient="]`;
/* Expression JS (pour waitFor/eval) : une pastille VISIBLE existe-t-elle ?
   `waitFor` évalue du JavaScript, pas un sélecteur CSS — lui passer `PASTILLE`
   brut ferait évaluer `a[href…]` comme une variable `a` inexistante. */
const PASTILLE_VISIBLE = `[...document.querySelectorAll('${PASTILLE}')].some(e => e.offsetParent !== null)`;
/* La première pastille visible (élément), pour en lire le texte ou le href. */
const PASTILLE_EL = `[...document.querySelectorAll('${PASTILLE}')].find(e => e.offsetParent !== null)`;

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
    await page.remplir('input[type="email"]', 0, MEDECIN.email);
    await page.remplir('input[type="password"]', 0, MEDECIN.mdp);
    await page.click("button.ui-btn", 0, "identifier");
    await page.waitFor("!location.pathname.startsWith('/connexion')", 30000);
    check("connexion médecin", true, await page.eval("location.pathname"));

    page = await nouvelOnglet(cdp, page);
    await page.taille(1280, 900, false);

    /* ---------- Point 5 : pastille sur une demande à confirmer ---------- */
    await page.goto(`${APP}/espace-medecin`);
    await page.waitFor(`document.querySelector('main')`, 20000);
    // Le signal dépend d'un appel RPC : on lui laisse le temps d'arriver.
    const pastilleTableau = await page
      .waitFor(PASTILLE_VISIBLE, 20000)
      .then(() => true)
      .catch(() => false);
    check("[tableau] une demande à confirmer porte une pastille d’absence", pastilleTableau);
    check(
      "[tableau] la pastille se lit sans la couleur (libellé ou nombre d’absences)",
      await page.eval(`(() => { const a = ${PASTILLE_EL}; return !!a && /risque|surveiller|absence|\\d/i.test(a.textContent); })()`),
      await page.eval(`(${PASTILLE_EL})?.textContent?.trim() ?? "—"`)
    );
    check(
      "[tableau] le taux de présence n’est plus le 96 % de la maquette",
      await page.eval(
        `![...document.querySelectorAll('main')].some(m => /96%/.test(m.textContent))`
      )
    );
    await page.shot("tableau-pastille");

    /* ---------- Point 7 : la pastille ouvre le menu sur ce patient ---------- */
    await page.click(PASTILLE);
    await page.waitFor(`location.pathname.includes('/suivi-absence')`, 15000);
    check(
      "[7] cliquer la pastille mène au menu Suivi d’absence, clé en paramètre",
      (await page.eval("location.search")).includes(fixture.cle),
      await page.eval("location.pathname + location.search")
    );
    // Le dialogue du patient s'ouvre de lui-même à l'arrivée depuis l'URL.
    const dialogueOuvert = await page
      .waitFor(`document.querySelector('[role="dialog"], [aria-modal="true"]')`, 15000)
      .then(() => true)
      .catch(() => false);
    check("[7] la fiche du patient s’ouvre dans le menu", dialogueOuvert);
    /* Plusieurs éléments portent aria-modal (le panneau de notifications
       partagé contient « Nouveau rendez-vous ») : on ne cherche donc pas un
       dialogue « qui parle de rendez-vous », mais celui qui porte la phrase
       même qu'on vérifie — l'assertion est sa propre cible. */
    const PHRASE = `[...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].some(d => /informe|ne restreint|aucune réservation/i.test(d.textContent ?? ''))`;
    const ditInforme = await page
      .waitFor(PHRASE, 8000)
      .then(() => true)
      .catch(() => false);
    check(
      "[menu] le détail rappelle que l’écran informe sans restreindre",
      ditInforme,
      ditInforme ? "" : (await page.eval(`document.querySelector('[role="dialog"]')?.textContent?.slice(0,90) ?? 'aucun dialogue'`))
    );
    await page.shot("menu-detail-patient");

    // Fermer le dialogue (Échap) pour voir la liste et les indicateurs.
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", windowsVirtualKeyCode: 27 });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", windowsVirtualKeyCode: 27 });
    await sleep(600);

    check(
      "[menu] la liste des patients est rendue (tableau ou cartes)",
      await page.eval(
        `!!document.querySelector('main table tbody tr') || [...document.querySelectorAll('main button')].some(b => b.offsetParent !== null && /rendez-vous/.test(b.textContent))`
      )
    );
    check(
      "[menu] les indicateurs annoncent au moins un patient à risque",
      await page.eval(`/risque/i.test(document.querySelector('main')?.textContent ?? '')`)
    );
    check("[1280] pas de défilement horizontal", !(await page.eval(DEBORDE)));
    await page.shot("menu-1280");

    /* ---------- Point 6 : pastille sur la fiche patient ---------- */
    await page.goto(`${APP}/espace-medecin/patients/${fixture.cle}`);
    await page.waitFor(`!/Chargement/.test(document.querySelector('main h2, main b')?.textContent ?? 'Chargement')`, 30000);
    const pastilleFiche = await page
      .waitFor(PASTILLE_VISIBLE, 20000)
      .then(() => true)
      .catch(() => false);
    check("[6] la fiche patient porte le signal d’absence", pastilleFiche);
    check(
      "[6] le signal de la fiche pointe aussi vers le menu, clé en paramètre",
      await page.eval(`(${PASTILLE_EL})?.getAttribute('href')?.includes(${JSON.stringify(fixture.cle)}) ?? false`)
    );
    await page.shot("fiche-signal");

    /* ---------- Mobile : lisible, tactile, sans débordement ---------- */
    for (const [l, h] of [
      [360, 740],
      [390, 844],
      [768, 1024],
    ]) {
      await page.taille(l, h, true);
      await page.goto(`${APP}/espace-medecin/suivi-absence?patient=${fixture.cle}`);
      await page.waitFor(`document.querySelector('main')`, 20000);
      await sleep(900);
      // Fermer le dialogue auto-ouvert pour mesurer la liste.
      await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", windowsVirtualKeyCode: 27 });
      await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", windowsVirtualKeyCode: 27 });
      await sleep(500);
      check(`[${l}] pas de défilement horizontal`, !(await page.eval(DEBORDE)));
      if (l <= 400) {
        const cible = await page.eval(PLUS_PETITE_CIBLE);
        check(`[${l}] zones tactiles ≥ 44 px`, cible.min >= 44, `${cible.min}px — « ${cible.coupable} »`);
      }
      await page.shot(`menu-${l}`);
    }

    /* ---------- Console ---------- */
    const bruit = page.console.filter(
      (l) => !/favicon|ERR_BLOCKED_BY_CLIENT|Multiple GoTrueClient/i.test(l)
    );
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
