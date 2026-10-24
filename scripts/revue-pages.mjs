/*
 * Revue de TOUTES les pages du site, pour chaque rôle, aux quatre largeurs
 * de référence — par Chrome piloté (CDP), sans dépendance.
 *
 * Ce qui est relevé sur chaque page et à chaque largeur :
 *   - débordement horizontal de la page (défilement latéral) ;
 *   - contenu ROGNÉ dans <main> : depuis que les coquilles portent
 *     `overflow-x-clip` (pour qu'une barre collante puisse coller), un
 *     contenu trop large ne fait plus défiler <main>, il est coupé. On le
 *     détecte ici plutôt que de le découvrir à l'écran ;
 *   - zoom : 80 % sous une souris à partir de 768 px, 100 % au tactile ;
 *   - zones tactiles < 44 px sur les écrans tactiles (boutons, onglets,
 *     liens-boutons — pas les liens au fil du texte, que WCAG excepte) ;
 *   - police : tout élément de texte hors de la police de la charte ;
 *   - erreurs JavaScript et erreurs console ;
 *   - redirection inattendue (garde de rôle, page cassée).
 *
 * Lecture seule : la revue NAVIGUE, elle ne clique sur aucune action.
 *
 * Prérequis : npx next build && npx next start -p <port>
 * Usage     : APP_URL=http://localhost:3993 node scripts/revue-pages.mjs [role…]
 *             (rôles : public patient medecin assistant etablissement admin)
 * Sortie    : rapport JSON + captures dans %TEMP%/docteur224-revue-pages
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createClient } from "@supabase/supabase-js";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = process.env.APP_URL ?? "http://localhost:3993";
const PORT = 9337;
const ICI = path.join(os.tmpdir(), "docteur224-revue-pages");
const OUT = path.join(ICI, "captures");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const lire = (c) => env.match(new RegExp(`^${c}=(.*)$`, "m"))?.[1].trim();
const service = createClient(lire("NEXT_PUBLIC_SUPABASE_URL"), lire("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const LARGEURS = [
  { nom: "360", largeur: 360, hauteur: 800, tactile: true },
  { nom: "390", largeur: 390, hauteur: 844, tactile: true },
  { nom: "768t", largeur: 768, hauteur: 1024, tactile: true },
  { nom: "1280", largeur: 1280, hauteur: 900, tactile: false },
];

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
        for (const e of this.ecouteurs) if (e.method === m.method && e.sessionId === m.sessionId) e.fn(m.params);
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
  constructor(cdp, sessionId, targetId) {
    this.cdp = cdp;
    this.s = sessionId;
    this.targetId = targetId;
    this.console = [];
    this.tactile = false;
    cdp.on("Runtime.exceptionThrown", (p) =>
      this.console.push(`exception: ${p.exceptionDetails.exception?.description?.split("\n")[0] ?? p.exceptionDetails.text}`), sessionId);
    cdp.on("Runtime.consoleAPICalled", (p) => {
      if (p.type === "error") this.console.push(`error: ${p.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 200)}`);
    }, sessionId);
  }
  send(m, p) {
    return this.cdp.send(m, p, this.s);
  }
  async init() {
    await this.send("Page.enable");
    await this.send("Runtime.enable");
  }
  async taille({ largeur, hauteur, tactile }) {
    this.tactile = tactile;
    await this.send("Emulation.setDeviceMetricsOverride", { width: largeur, height: hauteur, deviceScaleFactor: 1, mobile: tactile });
    await this.send("Emulation.setTouchEmulationEnabled", tactile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  }
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
  async waitFor(expression, timeout = 15000) {
    const debut = Date.now();
    while (Date.now() - debut < timeout) {
      if (await this.eval(`!!(${expression})`).catch(() => false)) return true;
      await sleep(150);
    }
    return false;
  }
  async goto(url) {
    await this.send("Page.navigate", { url });
    await sleep(700);
    await this.waitFor("document.readyState === 'complete'", 15000);
    // Les écrans clients chargent leurs données après le premier rendu :
    // on attend que les « Chargement… » et les squelettes se taisent.
    await this.waitFor(
      `!/Chargement…|Chargement\\.\\.\\./.test(document.body.innerText) && !document.querySelector('.animate-pulse:not([aria-hidden="true"] *)')`,
      8000
    );
    await sleep(500);
  }
  async taper(selector, texte) {
    await this.eval(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.offsetParent !== null); el.focus(); el.click(); })()`);
    await this.send("Input.insertText", { text: texte });
  }
  async shot(nom) {
    const r = await this.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path.join(OUT, `${nom}.png`), Buffer.from(r.data, "base64"));
  }
}

async function nouvelOnglet(cdp, ancienne) {
  if (ancienne) await cdp.send("Target.closeTarget", { targetId: ancienne.targetId }).catch(() => {});
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const p = new Page(cdp, sessionId, targetId);
  await p.init();
  return p;
}

/* ---------- Ce qu'on mesure sur une page ---------- */
const MESURE = (tactile) => `(() => {
  const visible = (e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed';
  const main = document.querySelector('main');
  const r = {
    url: location.pathname + location.search,
    deborde: document.documentElement.scrollWidth - window.innerWidth,
    rogne: main ? main.scrollWidth - main.clientWidth : 0,
    zoom: getComputedStyle(document.body).zoom,
    petites: [],
    polices: [],
  };
  // Ce qui dépasse dans main : les coupables, pas seulement le total.
  if (main && r.rogne > 2) {
    const bord = main.getBoundingClientRect().right;
    r.rogneCoupables = [...main.querySelectorAll('*')]
      .filter(e => visible(e) && e.getBoundingClientRect().right > bord + 2 && e.children.length === 0)
      .slice(0, 4)
      .map(e => (e.tagName + '.' + String(e.className).split(' ').slice(0, 3).join('.') + ' « ' + (e.textContent || '').trim().slice(0, 30) + ' »'));
  }
  if (${tactile}) {
    const cibles = [...document.querySelectorAll('button, [role="button"], [role="tab"], [role="radio"], [role="menuitem"], a.ui-btn, a[class*="btn"], a[class*="rounded"], nav a, select')]
      .filter(e => visible(e) && !e.disabled && !e.closest('[aria-hidden="true"]') && !e.closest('[hidden]'));
    for (const e of cibles) {
      const b = e.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      // Hors de l'écran (tiroir fermé, panneau replié) : pas une cible.
      if (b.right < 0 || b.left > window.innerWidth || getComputedStyle(e).visibility === 'hidden') continue;
      if (b.height < 44 - 0.5 || b.width < 44 - 0.5) {
        /* La taille VISUELLE ne suffit pas à conclure : plusieurs boutons
           (barre haute mobile…) élargissent leur zone de clic par un
           pseudo-élément invisible. On sonde donc ce qui se trouve
           réellement sous le doigt, à 22 px du centre dans les quatre
           directions (dans la limite de l'écran). */
        // Amené à l'écran avant de sonder : sous la ligne de flottaison,
        // elementFromPoint ne voit rien, et chaque cible paraissait fautive.
        e.scrollIntoView({ block: 'center', behavior: 'instant' });
        const v = e.getBoundingClientRect();
        const cx = v.left + v.width / 2, cy = v.top + v.height / 2;
        const sondes = [[cx, cy - 21.5], [cx, cy + 21.5], [cx - 21.5, cy], [cx + 21.5, cy]]
          .filter(([x, y]) => x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight);
        const touche = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === e || e.contains(t)); };
        if (sondes.length && sondes.every(([x, y]) => touche(x, y))) continue;
        r.petites.push(Math.round(b.width) + 'x' + Math.round(b.height) + ' ' + ((e.getAttribute('aria-label') || e.textContent || e.tagName).trim().replace(/\\s+/g, ' ').slice(0, 28)));
      }
    }
  }
  // Police de la charte : relevée sur le corps, comparée sur chaque texte.
  const charte = getComputedStyle(document.body).fontFamily.split(',')[0].trim();
  const vus = new Set();
  for (const e of document.querySelectorAll('body *')) {
    if (!visible(e) || !e.childNodes.length || ['SCRIPT','STYLE','svg','path','CODE','PRE'].includes(e.tagName)) continue;
    if (![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const f = getComputedStyle(e).fontFamily.split(',')[0].trim();
    if (f !== charte && !vus.has(f)) { vus.add(f); r.polices.push(f + ' ← ' + e.tagName + ' « ' + e.textContent.trim().slice(0, 25) + ' »'); }
  }
  window.scrollTo(0, 0);
  return r;
})()`;

/* ---------- Comptes et pages par rôle ---------- */
async function identifiants() {
  const { data: u } = await service
    .from("utilisateurs")
    .select("id, email")
    .in("email", ["medecin1@test.docteur224.com", "patient1@test.docteur224.com"]);
  const medecinId = u.find((x) => x.email.startsWith("medecin1")).id;
  const patientId = u.find((x) => x.email.startsWith("patient1")).id;
  const { data: rdv } = await service
    .from("rendez_vous")
    .select("id")
    .eq("patient_id", patientId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { medecinId, patientId, rdvId: rdv?.id };
}

function pagesParRole({ medecinId, patientId, rdvId }) {
  return {
    public: {
      compte: null,
      pages: [
        "/", "/a-propos", "/conseils-sante", "/faq", "/connexion", "/inscription", "/inscription/patient",
        "/inscription/professionnel", "/resultats", `/medecin/${medecinId}`, `/medecin/${medecinId}/creneaux`,
        `/reservation?medecin=${medecinId}`, "/maintenance", "/confirmation", "/desinscription", "/espace-admin/connexion",
      ],
    },
    patient: {
      compte: { email: "patient1@test.docteur224.com", mdp: "test1234", porte: "/connexion" },
      pages: [
        "/patient", "/patient/avis", "/patient/compte", "/patient/documents", "/patient/favoris", "/patient/mon-compte",
        "/patient/notifications", "/patient/parametres", "/patient/proches", "/patient/profil", "/mes-rendez-vous",
        ...(rdvId ? [`/mes-rendez-vous/${rdvId}`] : []),
      ],
    },
    medecin: {
      compte: { email: "medecin1@test.docteur224.com", mdp: "test1234", porte: "/connexion" },
      pages: [
        "/espace-medecin", "/espace-medecin/abonnement", "/espace-medecin/agenda", "/espace-medecin/avis",
        "/espace-medecin/compte", "/espace-medecin/correspondance", "/espace-medecin/disponibilites",
        "/espace-medecin/documents-partages", "/espace-medecin/equipe", "/espace-medecin/mon-compte",
        "/espace-medecin/nouveau-rdv", "/espace-medecin/paiements", "/espace-medecin/patients",
        `/espace-medecin/patients/c-${patientId}`, `/espace-medecin/patients/c-${patientId}?tab=documents`,
        "/espace-medecin/profil", "/espace-medecin/statistiques",
      ],
    },
    assistant: {
      compte: { email: "assistant1@test.docteur224.com", mdp: "test1234", porte: "/connexion" },
      pages: [
        "/espace-assistant", "/espace-assistant/compte", "/espace-assistant/creneaux", "/espace-assistant/messages",
        "/espace-assistant/mon-compte", "/espace-assistant/nouveau-rdv", "/espace-assistant/patients",
        "/espace-assistant/rendez-vous",
      ],
    },
    etablissement: {
      compte: { email: "etab.hopital-donka@test.docteur224.com", mdp: "test1234", porte: "/connexion" },
      pages: [
        "/espace-etablissement", "/espace-etablissement/abonnement", "/espace-etablissement/compte",
        "/espace-etablissement/informations", "/espace-etablissement/medecins", "/espace-etablissement/mon-compte",
        "/espace-etablissement/statistiques",
      ],
    },
    admin: {
      compte: { email: "admin@docteur224.com", mdp: process.env.ADMIN_MDP ?? "", porte: "/espace-admin/connexion" },
      pages: [
        "/espace-admin", "/espace-admin/abonnements", "/espace-admin/annonces", "/espace-admin/audit",
        "/espace-admin/equipe", "/espace-admin/etablissements", "/espace-admin/finances", "/espace-admin/messagerie",
        "/espace-admin/moderation", "/espace-admin/mon-compte", "/espace-admin/nouveau-rdv", "/espace-admin/parametres",
        "/espace-admin/pilotage", "/espace-admin/plus", "/espace-admin/utilisateurs", "/espace-admin/validations",
      ],
    },
  };
}

async function seConnecter(page, { email, mdp, porte }) {
  await page.taille(LARGEURS[3]);
  await page.goto(`${APP}${porte}`);
  await page.taper('input[type="email"], input[name="email"]', email);
  await page.taper('input[type="password"]', mdp);
  await page.eval(`[...document.querySelectorAll('button')].find(b => b.offsetParent !== null && /S.identifier|Se connecter|Connexion|Accéder à la console/.test(b.textContent))?.click()`);
  return page.waitFor(`!location.pathname.endsWith('connexion')`, 25000);
}

async function main() {
  const roles = process.argv.slice(2).length ? process.argv.slice(2) : ["public", "patient", "medecin", "assistant", "etablissement", "admin"];
  const ids = await identifiants();
  const plan = pagesParRole(ids);

  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(ICI, "profil")}`, "--headless=new",
    "--password-store=basic", "--no-first-run", "--no-default-browser-check", "--disable-gpu",
    "--hide-scrollbars", "--window-size=1366,900", "about:blank",
  ], { stdio: "ignore" });

  let version;
  for (let i = 0; i < 50 && !version; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(200); }
  }
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  const cdp = new CDP(ws);
  const rapport = [];

  try {
    let page = await nouvelOnglet(cdp);
    for (const role of roles) {
      const { compte, pages } = plan[role];
      await page.send("Network.enable");
      await page.send("Network.clearBrowserCookies");
      if (compte) {
        if (!compte.mdp) {
          console.log(`⏭️  ${role} : mot de passe absent (ADMIN_MDP), rôle ignoré`);
          continue;
        }
        const ok = await seConnecter(page, compte);
        console.log(`${ok ? "🔑" : "❌"} ${role} : connexion ${ok ? "ok" : "ÉCHEC"}`);
        if (!ok) continue;
        // Chrome headless cesse de transmettre les entrées après la
        // connexion : on poursuit dans un onglet neuf, cookies conservés.
        page = await nouvelOnglet(cdp, page);
      }
      for (const chemin of pages) {
        for (const l of LARGEURS) {
          page.console = [];
          await page.taille(l);
          await page.goto(`${APP}${chemin}`);
          let m;
          try {
            m = await page.eval(MESURE(l.tactile));
          } catch (e) {
            m = { erreurMesure: e.message };
          }
          m.role = role;
          m.demande = chemin;
          m.largeur = l.nom;
          m.zoomAttendu = !l.tactile && l.largeur >= 768 ? "0.8" : "1";
          m.console = page.console.filter((x) => !/favicon|ERR_BLOCKED_BY_CLIENT|Multiple GoTrueClient/i.test(x));
          const nom = `${role}${chemin.replace(/[/?=&]+/g, "_").replace(/_$/, "")}-${l.nom}`.slice(0, 120);
          await page.shot(nom);
          m.capture = nom;
          rapport.push(m);
          const pb = [
            m.deborde > 1 && `déborde ${m.deborde}px`,
            m.rogne > 2 && `rogné ${m.rogne}px`,
            m.zoom !== m.zoomAttendu && `zoom ${m.zoom}≠${m.zoomAttendu}`,
            m.petites?.length && `${m.petites.length} cible(s) < 44px`,
            m.polices?.length && `police ${m.polices.length}`,
            m.console.length && `console ${m.console.length}`,
            m.url && !m.url.startsWith(chemin.split("?")[0]) && `redirigé → ${m.url}`,
          ].filter(Boolean);
          console.log(`${pb.length ? "⚠️ " : "✅"} [${l.nom.padEnd(4)}] ${role.padEnd(13)} ${chemin}${pb.length ? " — " + pb.join(", ") : ""}`);
        }
      }
    }
  } finally {
    try { chrome.kill(); } catch { /* déjà mort */ }
  }
  writeFileSync(path.join(ICI, "rapport.json"), JSON.stringify(rapport, null, 1));
  console.log(`\nRapport : ${path.join(ICI, "rapport.json")}\nCaptures : ${OUT}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
