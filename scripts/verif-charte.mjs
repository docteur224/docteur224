/*
 * Vérification de la charte de couleurs personnalisable, dans Chrome (CDP,
 * sans dépendance).
 *
 *   L'aperçu est cantonné : tant qu'on n'a pas enregistré, l'essai ne
 *     déborde pas sur l'espace autour — c'est ce qui permet de comparer.
 *   Enregistrer applique partout, et la charte tient d'une page à l'autre.
 *   Pas de clignotement : la charte est posée pendant l'analyse du
 *     document. Contrôlé en vérifiant qu'elle est déjà là à
 *     DOMContentLoaded — ce qu'un effet React ne permettrait pas.
 *   Une charte illisible ne s'enregistre pas : sans ce garde-fou, un compte
 *     pourrait se rendre l'interface inutilisable sans retrouver le bouton
 *     qui l'en sortirait.
 *   Les couleurs d'origine reviennent en un clic, à l'identique.
 *   Le site public n'est jamais teinté.
 *
 * Le compte d'essai est un compte @test.docteur224.com, qui ne reçoit aucun
 * courriel. Rien n'est écrit en base : la charte vit dans le navigateur.
 *
 * Usage : npx next build && npx next start -p 3987,
 *         puis node scripts/verif-charte.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = process.env.APP_URL ?? "http://localhost:3987";
const PORT = 9334;
const PATIENT = { email: "patient1@test.docteur224.com", mdp: "test1234" };
const ECRAN = "/patient/mon-compte";

const ICI = path.join(os.tmpdir(), "docteur224-verif-charte");
mkdirSync(ICI, { recursive: true });
const PROFIL = path.join(ICI, "chrome-profil");

const resultats = [];
const check = (label, ok, detail = "") => {
  resultats.push({ label, ok });
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.attente = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.attente.has(m.id)) {
        const { res, rej } = this.attente.get(m.id);
        this.attente.delete(m.id);
        if (m.error) rej(new Error(m.error.message));
        else res(m.result);
      }
    };
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((res, rej) => this.attente.set(id, { res, rej }));
  }
}

const rgbVersHex = (rgb) => {
  const n = String(rgb).match(/\d+/g);
  return n ? "#" + n.slice(0, 3).map((v) => (+v).toString(16).padStart(2, "0")).join("") : String(rgb);
};

async function main() {
  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFIL}`,
    "--headless=new", "--no-first-run", "--no-default-browser-check",
    "--disable-save-password-bubble", "--password-store=basic",
    "--disable-features=PasswordManagerOnboarding,PasswordLeakDetection",
    "--disable-gpu", "--window-size=1366,1000", "--hide-scrollbars", "about:blank",
  ], { stdio: "ignore" });

  let version;
  for (let i = 0; i < 60 && !version; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); }
    catch { await sleep(200); }
  }
  if (!version) throw new Error("Chrome ne répond pas");

  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  const cdp = new CDP(ws);

  let cible = await cdp.send("Target.createTarget", { url: "about:blank" });
  let session = (await cdp.send("Target.attachToTarget", { targetId: cible.targetId, flatten: true })).sessionId;
  const envoyer = (m, p) => cdp.send(m, p, session);
  const ev = async (expr) =>
    (await envoyer("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;

  const preparer = async () => {
    await envoyer("Page.enable");
    await envoyer("Runtime.enable");
    // Relevé posé avant tout script de la page : il note si la charte est
    // déjà en place au moment où le document est prêt. Un effet React, lui,
    // ne s'exécuterait qu'après.
    await envoyer("Page.addScriptToEvaluateOnNewDocument", {
      source: `window.__charteTot = null;
        document.addEventListener("DOMContentLoaded", function () {
          window.__charteTot = !!document.getElementById("charte-espace");
        });`,
    });
  };
  const aller = async (chemin, attente = 2200) => {
    await envoyer("Page.navigate", { url: `${APP}${chemin}` });
    await sleep(attente);
  };
  const cliquerTexte = async (texte, balise = "button") =>
    ev(`(() => {
      const e = [...document.querySelectorAll(${JSON.stringify(balise)})]
        .find((x) => x.textContent.trim().includes(${JSON.stringify(texte)}) && !x.disabled);
      if (!e) return false;
      e.scrollIntoView({ block: "center" }); e.click(); return true;
    })()`);

  try {
    await preparer();

    // ---------- connexion ----------
    await aller("/connexion", 2500);
    await ev(`(() => {
      const p = (s, v) => {
        const e = document.querySelector(s);
        const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        d.call(e, v); e.dispatchEvent(new Event("input", { bubbles: true }));
      };
      p('input[type="email"]', ${JSON.stringify(PATIENT.email)});
      p('input[type="password"]', ${JSON.stringify(PATIENT.mdp)});
      // Le formulaire est rendu deux fois (mobile et bureau), avec le même
      // état : on actionne celui qui est effectivement affiché, le dernier.
      [...document.querySelectorAll("button")]
        .filter((b) => b.textContent.trim() === "S'identifier").pop()?.click();
    })()`);
    await sleep(4000);
    const connecte = !(await ev("location.pathname")).startsWith("/connexion");
    check("connexion au compte d'essai", connecte, await ev("location.pathname"));
    if (!connecte) return;

    // Chrome sans interface cesse de transmettre les clics à l'onglet après
    // la connexion : on poursuit dans un onglet neuf, cookies conservés.
    await cdp.send("Target.closeTarget", { targetId: cible.targetId });
    cible = await cdp.send("Target.createTarget", { url: "about:blank" });
    session = (await cdp.send("Target.attachToTarget", { targetId: cible.targetId, flatten: true })).sessionId;
    await preparer();

    // ---------- l'écran est là ----------
    await aller(ECRAN, 3000);
    check("la section « Couleurs de mon espace » est présente",
      await ev(`document.body.innerText.includes("Couleurs de mon espace")`));

    const fondPage = () => ev(`getComputedStyle(document.body).backgroundColor`).then(rgbVersHex);
    const fondOrigine = await fondPage();
    check("le fond de départ est celui de Docteur 224", fondOrigine === "#eaf1f6", fondOrigine);

    // ---------- l'aperçu ne déborde pas ----------
    check("la charte Terracotta se choisit", await cliquerTexte("Terracotta"));
    await sleep(600);
    const fondApresChoix = await fondPage();
    check("avant enregistrement, l'espace autour ne change pas",
      fondApresChoix === fondOrigine, `fond ${fondApresChoix}`);
    const apercuTeinte = await ev(`(() => {
      const t = [...document.querySelectorAll("*")].find((e) => e.style && e.style.getPropertyValue("--bg"));
      return t ? t.style.getPropertyValue("--bg") : "";
    })()`);
    check("l'aperçu, lui, prend les nouvelles couleurs", !!apercuTeinte && apercuTeinte !== "#eaf1f6", apercuTeinte);

    // ---------- enregistrement ----------
    check("le bouton Enregistrer s'active", await cliquerTexte("Enregistrer"));
    await sleep(900);
    const fondEnregistre = await fondPage();
    check("après enregistrement, tout l'espace suit",
      fondEnregistre !== fondOrigine, `fond ${fondEnregistre}`);

    // ---------- la charte tient, sans clignotement ----------
    await aller("/patient", 2600);
    const fondAutrePage = await fondPage();
    check("la charte tient d'une page à l'autre",
      fondAutrePage === fondEnregistre, `fond ${fondAutrePage}`);
    const tot = await ev("window.__charteTot");
    check("la charte est posée avant l'affichage (pas de clignotement)",
      tot === true,
      tot === true ? "" : "absente à DOMContentLoaded : la page s'afficherait d'abord en bleu");

    // ---------- le site public reste intact ----------
    await aller("/", 2600);
    const bleuPublic = await ev(
      `getComputedStyle(document.documentElement).getPropertyValue("--blue").trim().toLowerCase()`);
    check("le site public garde le bleu Docteur 224", bleuPublic === "#15506b", bleuPublic);

    // ---------- une charte illisible ne s'enregistre pas ----------
    await aller(ECRAN, 3000);
    await ev(`(() => {
      const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      const champs = [document.getElementById("charte-principale"), document.getElementById("charte-accent")];
      for (const c of champs) { d.call(c, "#fdf6b2"); c.dispatchEvent(new Event("input", { bubbles: true })); }
    })()`);
    await sleep(700);
    const bloque = await ev(`(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Enregistrer");
      return !!b && b.disabled;
    })()`);
    check("une charte illisible ne peut pas être enregistrée", bloque);
    check("le motif est affiché", await ev(`document.body.innerText.includes("Illisible")`));

    const capture = async (nom) => {
      const { data } = await envoyer("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
      const f = path.join(ICI, nom);
      writeFileSync(f, Buffer.from(data, "base64"));
      return f;
    };
    await ev(`document.querySelector("h3")?.scrollIntoView()`);
    console.log(`\nCapture (charte illisible) : ${await capture("ecran-illisible.png")}`);

    // ---------- retour aux couleurs d'origine ----------
    await aller(ECRAN, 3000);
    check("le bouton « Couleurs d'origine » répond", await cliquerTexte("Couleurs d’origine"));
    await sleep(900);
    const fondRetabli = await fondPage();
    check("les couleurs d'origine reviennent à l'identique",
      fondRetabli === fondOrigine, `fond ${fondRetabli}, attendu ${fondOrigine}`);
    await aller("/patient", 2600);
    check("et elles tiennent après changement de page",
      (await fondPage()) === fondOrigine);

    await aller(ECRAN, 3000);
    console.log(`Capture (écran au repos) : ${await capture("ecran-repos.png")}`);
  } finally {
    const ko = resultats.filter((r) => !r.ok).length;
    console.log(`\n${resultats.length - ko}/${resultats.length} contrôles passés`);
    // On ne ferme pas la WebSocket avant de sortir : sous Windows, la fermer
    // puis quitter dans la foulée fait échouer une assertion de libuv.
    chrome.kill();
    process.exit(ko ? 1 : 0);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
