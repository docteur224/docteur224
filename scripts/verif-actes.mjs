/*
 * Vérification des ordonnances d'ACTES — biologie (migration 0068) et
 * imagerie (0069) — dans Chrome, par CDP. Parcours RÉELS, données de test
 * posées puis retirées :
 *
 *   Médecin (1280)
 *     - choisit « Ordonnance de biologie » : le titre devient automatique et
 *       l'éditeur d'ACTES remplace celui des médicaments (ni posologie, ni
 *       durée, ni alerte allergie) ;
 *     - tape « hemo » → trouve « NFS (hémogramme) » par son SYNONYME ;
 *       « oestradiol » → trouve « Œstradiol » malgré la ligature ;
 *     - coche « urgent » et « à jeun », saisit les renseignements cliniques ;
 *     - enregistre le tout comme modèle, puis le recharge ;
 *     - émet ; en base : type, lignes d'actes, options ;
 *     - la page publique /verifier/<code> annonce « Ordonnance de biologie »
 *       sans rien livrer des renseignements cliniques ;
 *   Cloisonnement : le modèle de biologie n'apparaît PAS dans la liste des
 *     modèles de l'ordonnance de médicaments.
 *   Imagerie : le type existe, l'éditeur parle d'« examens », la recherche
 *     porte sur le référentiel d'imagerie, et les RENSEIGNEMENTS CLINIQUES
 *     sont exigés — l'émission reste bloquée tant qu'ils manquent.
 *   Téléphone (390) : éditeur sans débordement, cibles ≥ 44 px.
 *   Administrateur : /espace-admin/actes — bascule biologie/imagerie,
 *     recherche par synonyme, export Excel, import CSV relu (1 ajout,
 *     1 ligne en erreur) ; mobile 390.
 *   Aucune erreur console.
 *
 * Usage : APP_URL=http://localhost:3993 ADMIN_MDP=… node scripts/verif-actes.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createClient } from "@supabase/supabase-js";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = process.env.APP_URL ?? "http://localhost:3993";
const PORT = 9347;
const ICI = path.join(os.tmpdir(), "docteur224-verif-actes");
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
  // Après connexion, on poursuit dans un NOUVEL onglet : celui de la
  // connexion garde des écouteurs qui faussent le relevé de la console.
  const ok = await page.waitFor(`!location.pathname.endsWith('connexion')`, 25000);
  return { ok, page: await onglet(cdp, page) };
}

/* ---------- Repères ---------- */
const DIALOGUE = `[...document.querySelectorAll('[role="dialog"]')].find(d => (d.getAttribute('aria-label') ?? '').startsWith('Remettre un document'))`;
const DANS = (racine, texte) =>
  `[...(${racine})?.querySelectorAll('button, [role="option"], a, label') ?? []].find(b => b.offsetParent !== null && b.textContent.trim().startsWith(${JSON.stringify(texte)}))`;
const DEBORDE = `document.documentElement.scrollWidth > window.innerWidth + 1`;
const BOUTON_NOUVEAU = `[...document.querySelectorAll('#panneau-fiche-documents button')].find(b => b.offsetParent && b.textContent.trim() === '+ Document')`;

/*
 * Ouvre le dialogue de dépôt depuis la fiche patient, en CONSTATANT chaque
 * étape. Trois conditions s'enchaînent — l'onglet s'affiche, le bouton
 * existe, le dialogue s'ouvre — et un `waitFor` qui expire rend `false`
 * sans rien dire. Sans ces constats, c'est l'étape suivante qui échoue, sur
 * un « introuvable : [...document.querySelectorAll… » qui ne désigne
 * aucune des trois.
 */
async function ouvrirDepot(page, ou) {
  if (!(await page.waitFor(`document.querySelector('#panneau-fiche-documents article')`, 30000))) {
    check(`${ou} onglet Documents chargé`, false, await page.eval(`document.body.innerText.slice(0, 180).replace(/\\n+/g, ' · ')`));
    return false;
  }
  if (!(await page.waitFor(BOUTON_NOUVEAU, 15000))) {
    check(
      `${ou} bouton « + Document » présent`,
      false,
      await page.eval(`[...document.querySelectorAll('#panneau-fiche-documents button')].map(b => b.textContent.trim()).join(' / ').slice(0, 180)`)
    );
    return false;
  }
  await page.cliquer(BOUTON_NOUVEAU);
  const ouvert = await page.waitFor(DIALOGUE, 10000);
  check(`${ou} dialogue de dépôt ouvert`, ouvert);
  return ouvert;
}
/*
 * Une suggestion DÉSIGNÉE, et non la première venue : « hemo » remonte
 * légitimement « Électrophorèse de l'hémoglobine » ET « NFS (hémogramme) »,
 * et le tri est alphabétique. Exiger un rang précis testerait l'ordre du
 * tri, pas la recherche.
 */
const SUGGESTION_DE = (texte) =>
  `[...document.querySelectorAll('[role="option"]')].find(o => o.offsetParent && !o.textContent.startsWith('Prescrire') && o.textContent.includes(${JSON.stringify(texte)}))`;

/* ---------- Données de test ---------- */
const MARQUE = "VERIF-ACTES";
let ids;
let debutTest;

async function preparer() {
  debutTest = new Date(Date.now() - 5000).toISOString();
  const { data: u } = await service
    .from("utilisateurs").select("id, email").in("email", ["medecin1@test.docteur224.com", "patient1@test.docteur224.com"]);
  ids = {
    medecinId: u.find((x) => x.email.startsWith("medecin1")).id,
    patientId: u.find((x) => x.email.startsWith("patient1")).id,
  };
  // La migration doit être appliquée : sans elle, tout le reste échouerait
  // pour la même raison, et le dire une fois vaut mieux que vingt fois.
  const { error } = await service.from("actes_prescriptibles").select("id").limit(1);
  if (error) throw new Error(`table actes_prescriptibles absente — la migration 0068 n'est pas appliquée (${error.message})`);
}

async function nettoyer() {
  if (!ids) return;
  // Uniquement les pièces de CE test : la base est partagée avec la production.
  const { data: candidats } = await service
    .from("documents_patient").select("id, fichier_path, type")
    .eq("medecin_id", ids.medecinId).eq("patient_id", ids.patientId)
    .in("type", ["ordonnance_biologie", "ordonnance_imagerie"]).gte("cree_le", debutTest);
  const docs = candidats ?? [];
  if (docs.length) {
    const chemins = docs.map((d) => d.fichier_path).filter(Boolean);
    if (chemins.length) await service.storage.from("documents").remove(chemins);
    await service.from("journal_audit").delete().in("cible_id", docs.map((d) => d.id));
    await service.from("documents_patient").update({ remplace_par_id: null }).in("id", docs.map((d) => d.id));
    await service.from("documents_patient").delete().in("id", docs.map((d) => d.id));
  }
  await service.from("notifications").delete().eq("destinataire_id", ids.patientId).gte("cree_le", debutTest);
  await service.from("modeles_ordonnance").delete().ilike("nom", `%${MARQUE}%`);
  const { data: actes } = await service.from("actes_prescriptibles").select("id").ilike("libelle", `%${MARQUE}%`);
  if (actes?.length) {
    await service.from("journal_audit").delete().in("cible_id", actes.map((a) => a.id));
    await service.from("actes_prescriptibles").delete().in("id", actes.map((a) => a.id));
  }
  await service.from("journal_audit").delete().eq("action", "A importé le référentiel d’actes").gte("cree_le", debutTest);
  console.log(`ℹ️  nettoyage : ${docs.length} document(s), modèles et actes de test supprimés`);
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

    /* ---------- Le type et son éditeur ---------- */
    if (!(await ouvrirDepot(page, "[1280]"))) throw new Error("dialogue de dépôt inaccessible à 1280 px");
    check(
      "[1280] le menu dit « Ordonnance médicale », plus seulement « Ordonnance »",
      await page.eval(`[...document.querySelectorAll('#doc-type option')].some(o => o.textContent === 'Ordonnance médicale')`)
    );
    check(
      "[1280] « Ordonnance de biologie » proposée",
      await page.eval(`[...document.querySelectorAll('#doc-type option')].some(o => o.value === 'ordonnance_biologie')`)
    );

    await page.valeur("doc-type", "ordonnance_biologie");
    check("[1280] éditeur d’actes affiché", await page.waitFor(`document.getElementById('acte-0')`, 5000));
    check("[1280] pas de champ posologie", !(await page.eval(`!!document.getElementById('poso-0')`)));
    check(
      "[1280] titre automatique « Ordonnance de biologie du … »",
      await page.eval(`/Ordonnance de biologie du \\d{2}\\/\\d{2}\\/\\d{4}/.test((${DIALOGUE}).textContent)`)
    );
    check(
      "[1280] pas de bloc allergie (il ne vaut que pour les médicaments)",
      !(await page.eval(`(${DIALOGUE}).textContent.includes('Allergies déclarées')`))
    );

    /* ---------- Recherche par synonyme ---------- */
    await page.saisir("acte-0", "hemo");
    check("[1280] « hemo » propose la NFS par son synonyme", await page.waitFor(SUGGESTION_DE("NFS"), 8000));
    await page.cliquer(SUGGESTION_DE("NFS"));
    check("[1280] acte retenu", await page.waitFor(`(${DIALOGUE}).textContent.includes('NFS (hémogramme)')`, 5000));

    await page.cliquer(DANS(DIALOGUE, "Ajouter une analyse"));
    await page.waitFor(`document.getElementById('acte-1')`, 5000);
    await page.saisir("acte-1", "oestradiol");
    // La ligature : sans le `replace` de `normaliser_recherche`, « œ » reste
    // « œ » dans l'index et cette recherche ne rend rien.
    check("[1280] « oestradiol » trouve « Œstradiol » (ligature)", await page.waitFor(SUGGESTION_DE("stradiol"), 8000));
    await page.cliquer(SUGGESTION_DE("stradiol"));

    /* ---------- Renseignements et options ---------- */
    await page.saisir("actes-renseignements", `Asthénie, suspicion d’anémie (${MARQUE})`);
    await page.cliquer(DANS(DIALOGUE, "Prélèvement à jeun"));
    await page.cliquer(DANS(DIALOGUE, "Urgent"));
    check(
      "[1280] les deux options sont cochées",
      await page.eval(`[...(${DIALOGUE}).querySelectorAll('input[type=checkbox]')].filter(c => c.checked).length === 2`)
    );
    await page.shot("1280-ordonnance-biologie");

    /* ---------- Modèle, et son cloisonnement ---------- */
    await page.cliquer(DANS(DIALOGUE, "Enregistrer comme modèle"));
    await page.waitFor(`document.getElementById('nom-modele-actes')`, 5000);
    await page.saisir("nom-modele-actes", `Bilan ${MARQUE}`);
    await page.cliquer(DANS(DIALOGUE, "Enregistrer"));
    /*
     * On vise le <p role="status"> de l'éditeur, et NON le texte du
     * dialogue entier : celui-ci contient déjà « Aucune signature
     * enregistrée », qui faisait passer ce contrôle au vert quoi qu'il
     * arrive. On relève aussi le message réel, pour qu'un refus se lise
     * au lieu de se deviner.
     */
    const STATUT = `[...document.querySelectorAll('[role=status], [role=alert]')].map(p => p.textContent.trim()).filter(Boolean).join(' | ')`;
    await page.waitFor(`/Modèle/.test(${STATUT})`, 8000);
    const messageModele = await page.eval(STATUT);
    check(
      "[1280] modèle enregistré — confirmation affichée",
      /Modèle .*(enregistré|mis à jour)/.test(messageModele),
      messageModele || `(aucun role=status) — dialogue : ${await page.eval(`(${DIALOGUE}).innerText.slice(0, 160).replace(/\\n+/g, ' · ')`)}`
    );
    // Pas de `maybeSingle()` : s'il y avait deux lignes, il rendrait `null`
    // sans dire pourquoi, et les trois contrôles suivants échoueraient sans
    // qu'on sache si le modèle manque ou s'il est en double.
    const { data: modeles, error: eModeles } = await service
      .from("modeles_ordonnance").select("nom, domaine, lignes, options").ilike("nom", `%${MARQUE}%`);
    const modele = modeles?.[0];
    check(
      "en base : modèle rangé en biologie",
      modeles?.length === 1 && modele?.domaine === "biologie",
      eModeles?.message ?? `${modeles?.length ?? 0} ligne(s) : ${JSON.stringify((modeles ?? []).map((m) => m.nom))}`
    );
    check("en base : options du modèle conservées", modele?.options?.urgent === true && modele?.options?.jeun === true, JSON.stringify(modele?.options));
    check("en base : lignes d’actes, sans posologie", modele?.lignes?.[0]?.libelle?.includes("NFS") && !("posologie" in (modele?.lignes?.[0] ?? {})), JSON.stringify(modele?.lignes?.[0]));

    /*
     * LE cloisonnement, vu de l'écran. L'ORDRE compte : on constate d'abord
     * que le modèle EST dans sa liste — ce qui prouve du même coup que la
     * requête a répondu — avant d'affirmer son absence ailleurs. Une
     * assertion d'absence passe au vert sur une liste simplement pas encore
     * chargée, et ne vaut donc rien sans cette preuve préalable.
     */
    const OPTION_MARQUEE = (select) =>
      `[...document.querySelectorAll('${select} option')].some(o => o.textContent.includes(${JSON.stringify(MARQUE)}))`;
    check("[1280] il est bien là dans les modèles de biologie", await page.waitFor(OPTION_MARQUEE("#modele-actes"), 10000));

    await page.valeur("doc-type", "ordonnance");
    await page.waitFor(`document.getElementById('modele-ordonnance')`, 10000);
    // Changer de type remonte l'éditeur : sa liste repart d'une requête.
    await sleep(1500);
    check(
      "[1280] le bilan de biologie n’apparaît PAS dans les modèles de médicaments",
      !(await page.eval(OPTION_MARQUEE("#modele-ordonnance")))
    );

    await page.valeur("doc-type", "ordonnance_biologie");
    await page.waitFor(`document.getElementById('modele-actes')`, 10000);

    /* ---------- Émission ---------- */
    // Le changement de type a vidé les lignes : on recharge le modèle.
    const idModele = await page.eval(`[...document.querySelectorAll('#modele-actes option')].find(o => o.textContent.includes(${JSON.stringify(MARQUE)}))?.value`);
    await page.valeur("modele-actes", idModele);
    check("[1280] modèle rechargé", await page.waitFor(`(${DIALOGUE}).textContent.includes('NFS (hémogramme)')`, 8000));

    await page.cliquer(DANS(DIALOGUE, "Émettre et remettre"));
    check("[1280] ordonnance émise", await page.waitFor(`(${DIALOGUE})?.textContent.includes('remise à') ?? false`, 40000));
    await page.shot("1280-biologie-emise");

    const { data: doc } = await service
      .from("documents_patient")
      .select("type, titre, contenu, prescription, prescription_options, code_verification, fichier_path")
      .eq("patient_id", ids.patientId).eq("type", "ordonnance_biologie").gte("cree_le", debutTest)
      .order("cree_le", { ascending: false }).limit(1).maybeSingle();
    check("en base : type « ordonnance_biologie »", doc?.type === "ordonnance_biologie");
    check("en base : titre automatique", /^Ordonnance de biologie du /.test(doc?.titre ?? ""), doc?.titre);
    check("en base : lignes d’actes enregistrées", doc?.prescription?.length === 2, JSON.stringify(doc?.prescription?.length));
    check(
      "en base : options enregistrées à part du texte",
      doc?.prescription_options?.urgent === true && doc?.prescription_options?.jeun === true,
      JSON.stringify(doc?.prescription_options)
    );
    check("le texte imprimé porte les mentions EN TÊTE", /^EXAMEN URGENT\nÀ JEUN\n\n1\. /.test(doc?.contenu ?? ""), (doc?.contenu ?? "").slice(0, 40));
    check("un PDF a bien été déposé", !!doc?.fichier_path);

    /* ---------- Page publique de vérification ---------- */
    await page.goto(`${APP}/verifier/${doc.code_verification}`);
    await page.waitFor(`document.body.innerText.includes('valide') || document.body.innerText.includes('Document')`, 15000);
    const texteVerif = await page.eval(`document.body.innerText`);
    check("[public] le type est nommé « Ordonnance de biologie »", texteVerif.includes("Ordonnance de biologie"), texteVerif.slice(0, 120).replace(/\n/g, " · "));
    check("[public] rien des renseignements cliniques", !texteVerif.includes("Asthénie") && !texteVerif.includes("URGENT"));
    await page.shot("1280-verifier-biologie");

    /* ---------- Imagerie : le même mécanisme, une règle en plus ---------- */
    await page.goto(fiche);
    if (!(await ouvrirDepot(page, "[1280] imagerie :"))) throw new Error("dialogue de dépôt inaccessible pour l’imagerie");
    check(
      "[1280] « Ordonnance d’imagerie » proposée",
      await page.eval(`[...document.querySelectorAll('#doc-type option')].some(o => o.value === 'ordonnance_imagerie')`)
    );
    await page.valeur("doc-type", "ordonnance_imagerie");
    check("[1280] imagerie : éditeur d’actes affiché", await page.waitFor(`document.getElementById('acte-0')`, 10000));
    check(
      "[1280] imagerie : l’éditeur parle d’examens, pas d’analyses",
      await page.eval(`(${DIALOGUE}).innerText.includes('Ajouter un examen')`)
    );

    await page.saisir("acte-0", "echo abdo");
    check(
      "[1280] imagerie : la recherche porte sur le référentiel d’imagerie",
      await page.waitFor(SUGGESTION_DE("Échographie abdominale"), 8000)
    );
    await page.cliquer(SUGGESTION_DE("Échographie abdominale"));

    /*
     * LA règle propre à l'imagerie. On vérifie les DEUX faces : le bouton
     * refuse, ET le médecin sait pourquoi — un bouton grisé sans motif est
     * un cul-de-sac.
     */
    check(
      "[1280] imagerie : le motif du refus est affiché",
      await page.waitFor(`(${DIALOGUE}).innerText.includes('Indiquez les renseignements cliniques')`, 8000)
    );
    check(
      "[1280] imagerie : émission bloquée sans renseignements cliniques",
      await page.eval(`(${DANS(DIALOGUE, "Émettre et remettre")})?.disabled === true`)
    );

    await page.saisir("actes-renseignements", `Douleurs abdominales persistantes (${MARQUE})`);
    check(
      "[1280] imagerie : l’avertissement lève une fois l’indication saisie",
      await page.waitFor(`!(${DIALOGUE}).innerText.includes('Indiquez les renseignements cliniques')`, 8000)
    );

    await page.cliquer(DANS(DIALOGUE, "Émettre et remettre"));
    check("[1280] imagerie : ordonnance émise", await page.waitFor(`(${DIALOGUE})?.textContent.includes('remise à') ?? false`, 40000));
    await page.shot("1280-imagerie-emise");

    const { data: docImg } = await service
      .from("documents_patient")
      .select("type, titre, prescription, prescription_options, code_verification")
      .eq("patient_id", ids.patientId).eq("type", "ordonnance_imagerie").gte("cree_le", debutTest)
      .order("cree_le", { ascending: false }).limit(1).maybeSingle();
    check("en base : type « ordonnance_imagerie »", docImg?.type === "ordonnance_imagerie");
    if (docImg) {
      check("en base : titre automatique d’imagerie", /^Ordonnance d’imagerie du /.test(docImg.titre ?? ""), docImg.titre);
      check(
        "en base : l’examen est enregistré",
        !!docImg.prescription?.[0]?.libelle?.includes("Échographie"),
        JSON.stringify(docImg.prescription?.[0])
      );
      check(
        "en base : les renseignements cliniques sont rangés dans les options",
        !!docImg.prescription_options?.renseignements?.includes(MARQUE),
        JSON.stringify(docImg.prescription_options)
      );
      await page.goto(`${APP}/verifier/${docImg.code_verification}`);
      await page.waitFor(`document.body.innerText.includes('Document')`, 15000);
      check(
        "[public] le type est nommé « Ordonnance d’imagerie »",
        (await page.eval(`document.body.innerText`)).includes("Ordonnance d’imagerie")
      );
    }

    /* ---------- Téléphone ---------- */
    await page.taille(390, 844, true);
    await page.goto(fiche);
    if (!(await ouvrirDepot(page, "[390]"))) throw new Error("le dialogue ne s’est pas ouvert à 390 px — section téléphone abandonnée");
    await page.valeur("doc-type", "ordonnance_biologie");
    check("[390] éditeur d’actes affiché", await page.waitFor(`document.getElementById('acte-0')`, 10000));
    check("[390] pas de débordement horizontal", !(await page.eval(DEBORDE)));
    /*
     * Ce qu'on DOIT pouvoir toucher : les contrôles, et les <label> qui
     * enveloppent une case à cocher — ceux-là SONT la cible, et la case de
     * 16 px qu'ils contiennent n'a pas à grandir.
     *
     * Ce qu'on exclut : les <label> qui ne font que légender un champ
     * (« Type », « Renseignements cliniques ») et ceux en `sr-only`,
     * destinés aux lecteurs d'écran. Les mesurer reviendrait à exiger
     * 44 px pour du texte qu'on ne touche jamais.
     */
    const petites = await page.eval(`[...(${DIALOGUE}).querySelectorAll('button, select, textarea, a, input, label')]
      .filter(e => e.offsetParent)
      .filter(e => e.tagName === 'LABEL' ? !!e.querySelector('input[type=checkbox], input[type=radio]') : e.type !== 'checkbox' && e.type !== 'radio')
      .filter(e => e.getBoundingClientRect().height < 43.5)
      .map(e => e.tagName.toLowerCase() + '«' + (e.id || e.textContent.trim().slice(0, 28) || e.type) + '»:' + Math.round(e.getBoundingClientRect().height) + 'px')`);
    check("[390] cibles tactiles ≥ 44 px (contrôles et labels cliquables)", petites.length === 0, petites.join(" | "));
    await page.shot("390-ordonnance-biologie");

    const bruit = page.console.filter((x) => !/favicon|Multiple GoTrueClient/i.test(x));
    check("médecin : aucune erreur console", bruit.length === 0, bruit.slice(0, 2).join(" | "));

    /* ---------- Administrateur ---------- */
    if (!process.env.ADMIN_MDP) {
      console.log("ℹ️  ADMIN_MDP absent : écran d’administration non vérifié");
    } else {
      // L'administration a SA porte et SON bouton : /espace-admin/connexion
      // et « Accéder à la console ». Pas /connexion, qui est celle des
      // patients et des praticiens.
      const c2 = await seConnecter(
        page,
        cdp,
        "admin@docteur224.com",
        process.env.ADMIN_MDP,
        "/espace-admin/connexion",
        "/Accéder à la console/"
      );
      page = c2.page;
      check("connexion administrateur", c2.ok);
      // Sans ce garde-fou, une connexion refusée produisait trois échecs de
      // plus — tous les mêmes — puis une exception sur un sélecteur, et la
      // vraie cause se perdait en tête de liste.
      if (!c2.ok) throw new Error("connexion administrateur refusée — mot de passe (ADMIN_MDP) ou compte à vérifier");
      await page.taille(1280, 900, false);
      await page.goto(`${APP}/espace-admin/actes`);
      check("[1280] admin : référentiel listé", await page.waitFor(`document.querySelectorAll('main table tbody tr').length > 10`, 20000));
      check("[1280] admin : entrée de menu « Actes et analyses »", await page.eval(`!!document.querySelector('a[href="/espace-admin/actes"][aria-current="page"]')`));

      /*
       * On lit la PREMIÈRE CELLULE (l'acte), pas la ligne entière : celle-ci
       * concatène les synonymes et la catégorie. Et on confronte le libellé
       * au RÉFÉRENTIEL plutôt qu'à une liste de mots devinée — « Écho-Doppler
       * artériel » est bien de l'imagerie, mais ne contient ni
       * « Échographie », ni « Scanner », ni « IRM ».
       */
      const { data: actesImagerie } = await service
        .from("actes_prescriptibles").select("libelle").eq("domaine", "imagerie").eq("actif", true);
      const libellesImagerie = (actesImagerie ?? []).map((a) => a.libelle);
      const PREMIER_ACTE = `document.querySelector('main table tbody tr td')?.textContent.trim() ?? ''`;

      const premierBio = await page.eval(PREMIER_ACTE);
      const nbBio = await page.eval(`document.querySelectorAll('main table tbody tr').length`);
      await page.cliquer(`[...document.querySelectorAll('main [role="radio"]')].find(b => b.textContent.startsWith('Imagerie'))`);
      // Attendre que la liste ait VRAIMENT changé, plutôt qu'un délai fixe.
      await page.waitFor(`(${PREMIER_ACTE}) !== ${JSON.stringify(premierBio)}`, 8000);
      const premierImagerie = await page.eval(PREMIER_ACTE);
      check(
        "[1280] admin : la bascule change de domaine",
        libellesImagerie.some((l) => premierImagerie.startsWith(l)),
        premierImagerie.slice(0, 60)
      );

      await page.cliquer(`[...document.querySelectorAll('main [role="radio"]')].find(b => b.textContent.startsWith('Biologie'))`);
      await page.waitFor(`(${PREMIER_ACTE}) === ${JSON.stringify(premierBio)}`, 8000);
      check("[1280] admin : retour en biologie", (await page.eval(`document.querySelectorAll('main table tbody tr').length`)) === nbBio);

      await page.saisir("recherche-acte", "tgo");
      await sleep(400);
      check(
        "[1280] admin : recherche par synonyme",
        await page.eval(`document.querySelector('main table tbody tr')?.textContent.includes('Transaminases') ?? false`)
      );
      await page.shot("1280-admin-actes");

      const exp = await page.eval(`fetch('/api/admin/actes/export').then(async r => ({ s: r.status, t: r.headers.get('content-type'), n: (await r.arrayBuffer()).byteLength }))`);
      check("[1280] admin : export Excel", exp.s === 200 && exp.t.includes("spreadsheetml") && exp.n > 4000, JSON.stringify(exp));

      /*
       * Import d'un CSV : 1 ajout, 1 ligne en erreur (domaine inconnu).
       *
       * La cellule des synonymes est ENTRE GUILLEMETS : le point-virgule qui
       * les sépare est aussi le délimiteur du fichier. Sans les guillemets,
       * les colonnes se décalent, « biochimie » tombe dans « Actif », et la
       * ligne est écartée pour la mauvaise raison — ce qui s'est produit au
       * premier passage.
       */
      const csv = path.join(ICI, "import-verif.csv");
      writeFileSync(
        csv,
        `Domaine;Libellé;Synonymes;Catégorie;Actif\n` +
          `biologie;Dosage ${MARQUE};"essai ; bidon";biochimie;oui\n` +
          `chirurgie;Acte hors domaine ${MARQUE};;;oui\n`
      );
      await page.cliquer(`[...document.querySelectorAll('main button')].find(b => b.offsetParent && b.textContent.trim() === 'Importer')`);
      await page.waitFor(`document.getElementById('fichier-import-actes')`, 5000);
      const { root } = await page.send("DOM.getDocument", { depth: -1 });
      const { nodeId } = await page.send("DOM.querySelector", { nodeId: root.nodeId, selector: "#fichier-import-actes" });
      await page.send("DOM.setFileInputFiles", { nodeId, files: [csv] });
      await sleep(300);
      await page.cliquer(`[...document.querySelectorAll('[role="dialog"] button')].find(b => b.offsetParent && b.textContent.trim() === 'Analyser le fichier')`);
      check(
        "[1280] admin : analyse — la ligne au domaine inconnu est écartée et numérotée",
        await page.waitFor(`[...document.querySelectorAll('[role="dialog"]')].some(d => d.textContent.includes('Ligne 3') && d.textContent.includes('biologie ou imagerie'))`, 15000)
      );
      await page.shot("1280-admin-import-actes");
      await page.cliquer(`[...document.querySelectorAll('[role="dialog"] button')].find(b => b.offsetParent && b.textContent.trim().startsWith('Appliquer : 1 ajout'))`);
      check("[1280] admin : import appliqué", await page.waitFor(`document.body.innerText.includes('Import appliqué : 1 ajout(s), 0 modification(s), 1 ligne(s) écartée(s)')`, 15000));
      const { data: ajoute } = await service
        .from("actes_prescriptibles").select("domaine, synonymes, categorie, origine, recherche").ilike("libelle", `%${MARQUE}%`).maybeSingle();
      check("en base : acte importé (domaine, origine, catégorie)", ajoute?.domaine === "biologie" && ajoute?.origine === "admin" && ajoute?.categorie === "biochimie", JSON.stringify(ajoute));
      check("en base : synonymes séparés au point-virgule", JSON.stringify(ajoute?.synonymes) === '["essai","bidon"]', JSON.stringify(ajoute?.synonymes));
      check("en base : `recherche` reconstruit par le trigger à l’import", (ajoute?.recherche ?? "").includes("bidon"), ajoute?.recherche);

      await page.taille(390, 844, true);
      await page.goto(`${APP}/espace-admin/actes`);
      await page.waitFor(`document.querySelectorAll('main ul li').length > 5`, 20000);
      check("[390] admin : cartes, pas de tableau, pas de débordement", !(await page.eval(DEBORDE)) && !(await page.eval(`!!document.querySelector('main table')?.offsetParent`)));
      await page.shot("390-admin-actes");
      const bruitAdmin = page.console.filter((x) => !/favicon|Multiple GoTrueClient/i.test(x));
      check("admin : aucune erreur console", bruitAdmin.length === 0, bruitAdmin.slice(0, 2).join(" | "));
    }
  } finally {
    try { chrome.kill(); } catch { /* déjà fermé */ }
  }
}

// Délai global : au-delà, on abandonne MAIS on nettoie — un test tué de
// l'extérieur laisserait ses documents et ses modèles en base.
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
