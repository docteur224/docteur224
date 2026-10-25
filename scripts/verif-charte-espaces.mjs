/*
 * La charte vue dans les CINQ espaces, en bureau et en mobile.
 *
 * `verif-charte.mjs` éprouve le mécanisme de bout en bout, mais sur le seul
 * espace patient et en 1366 px. Or chaque rôle a sa propre coquille — barre
 * latérale, bandeaux, tabbar — et le mobile a sa feuille de style à lui
 * (`mobile.css`, 156 couleurs). Rien ne garantissait que la charte les
 * atteigne.
 *
 * La charte est posée en base pour chaque compte avant d'ouvrir le
 * navigateur : ce script vérifie le RENDU, pas le parcours d'enregistrement,
 * déjà couvert ailleurs. Tout est effacé à la fin.
 *
 * Usage : npx next build && npx next start -p 3987,
 *         puis node scripts/verif-charte-espaces.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import os from "node:os";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = process.env.APP_URL ?? "http://localhost:3987";
const PORT = 9344;

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const lire = (c) => env.match(new RegExp(`^${c}=(.*)$`, "m"))?.[1].trim();
const URL_SB = lire("NEXT_PUBLIC_SUPABASE_URL");
const ANON = lire("NEXT_PUBLIC_SUPABASE_ANON_KEY");

/** Terracotta : la charte la plus éloignée du bleu d'origine. */
const CHARTE = { principale: "#5a2a14", accent: "#c25400" };
/** Valeurs attendues, calculées par le moteur pour cette charte. */
const ATTENDU = { blue: "#5a2a14", teal: "#c25400", bg: "#f6eeea" };

const ROLES = [
  { nom: "patient", email: "patient1@test.docteur224.com", mdp: "test1234", porte: "/connexion", espace: "/patient" },
  { nom: "médecin", email: "medecin1@test.docteur224.com", mdp: "test1234", porte: "/connexion", espace: "/espace-medecin" },
  { nom: "assistant", email: "assistant1@test.docteur224.com", mdp: "test1234", porte: "/connexion", espace: "/espace-assistant" },
  { nom: "établissement", email: "etab.hopital-donka@test.docteur224.com", mdp: "test1234", porte: "/connexion", espace: "/espace-etablissement" },
  // Même porte et même convention de mot de passe que `revue-pages.mjs`.
  { nom: "administrateur", email: "admin@docteur224.com", mdp: process.env.ADMIN_MDP ?? "alpha2308", porte: "/espace-admin/connexion", espace: "/espace-admin" },
];

const ICI = path.join(os.tmpdir(), "docteur224-verif-charte-espaces");
mkdirSync(ICI, { recursive: true });

const resultats = [];
const check = (label, ok, detail = "") => {
  resultats.push({ label, ok });
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pose ou retire la charte en base, avec la session du compte lui-même. */
async function semer(role, charte) {
  const c = createClient(URL_SB, ANON, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: role.email, password: role.mdp });
  if (error) throw new Error(`${role.nom} : ${error.message}`);
  const id = data.user.id;
  if (charte) {
    await c.from("preferences_affichage").upsert(
      { utilisateur_id: id, charte_principale: charte.principale, charte_accent: charte.accent },
      { onConflict: "utilisateur_id" },
    );
  } else {
    await c.from("preferences_affichage").delete().eq("utilisateur_id", id);
  }
}

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

const hex = (rgb) => {
  const n = String(rgb).match(/\d+/g);
  return n ? "#" + n.slice(0, 3).map((v) => (+v).toString(16).padStart(2, "0")).join("") : String(rgb);
};

async function main() {
  console.log("Pose de la charte terracotta sur les cinq comptes…");
  for (const r of ROLES) await semer(r, CHARTE);

  const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(ICI, "profil")}`,
    "--headless=new", "--no-first-run", "--no-default-browser-check",
    "--disable-save-password-bubble", "--password-store=basic",
    "--disable-features=PasswordManagerOnboarding,PasswordLeakDetection",
    "--disable-gpu", "--window-size=1366,1000", "--hide-scrollbars", "about:blank",
  ], { stdio: "ignore" });

  let v;
  for (let i = 0; i < 60 && !v; i++) {
    try { v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); }
    catch { await sleep(200); }
  }
  if (!v) throw new Error("Chrome ne répond pas");
  const ws = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  const cdp = new CDP(ws);

  try {
    for (const role of ROLES) {
      // Un onglet neuf par rôle : les sessions ne doivent pas se mélanger,
      // et Chrome sans interface cesse de transmettre les clics après une
      // connexion faite dans le même onglet.
      const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
      const s = (await cdp.send("Target.attachToTarget", { targetId, flatten: true })).sessionId;
      const envoyer = (m, p) => cdp.send(m, p, s);
      const ev = async (x) =>
        (await envoyer("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result.value;
      const aller = async (c, w = 2600) => { await envoyer("Page.navigate", { url: APP + c }); await sleep(w); };
      await envoyer("Page.enable");
      await envoyer("Runtime.enable");
      await envoyer("Network.clearBrowserCookies");

      await aller(role.porte, 2600);
      await ev(`(() => {
        const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        const p = (q, val) => { const e = document.querySelector(q); if (!e) return; d.call(e, val); e.dispatchEvent(new Event("input", { bubbles: true })); };
        p('input[type="email"]', ${JSON.stringify(role.email)});
        p('input[type="password"]', ${JSON.stringify(role.mdp)});
        const b = [...document.querySelectorAll("button")]
          .filter((x) => /s.identifier|acc[ée]der/i.test(x.textContent));
        (b[b.length - 1])?.click();
      })()`);
      await sleep(4500);

      const arrive = (await ev("location.pathname")).startsWith(role.espace);
      check(`[${role.nom}] connexion`, arrive, await ev("location.pathname"));
      if (!arrive) { await cdp.send("Target.closeTarget", { targetId }); continue; }

      // La charte vient de la base : on laisse la réconciliation arriver.
      for (let i = 0; i < 30; i++) {
        if (await ev(`!!localStorage.getItem("docteur224.charte")`)) break;
        await sleep(300);
      }
      await aller(role.espace, 3000);

      const lu = JSON.parse(await ev(`JSON.stringify({
        blue: getComputedStyle(document.documentElement).getPropertyValue("--blue").trim(),
        teal: getComputedStyle(document.documentElement).getPropertyValue("--teal").trim(),
        fond: getComputedStyle(document.body).backgroundColor,
      })`));
      check(`[${role.nom}] la charte atteint l'espace`,
        lu.blue === ATTENDU.blue && lu.teal === ATTENDU.teal, `--blue ${lu.blue}, --teal ${lu.teal}`);
      check(`[${role.nom}] le fond de page suit`, hex(lu.fond) === ATTENDU.bg, hex(lu.fond));

      // La coquille du rôle : barre latérale et bandeaux lui appartiennent.
      const coquille = JSON.parse(await ev(`(() => {
        const bleus = [...document.querySelectorAll("aside *, header *, nav *")]
          .map((e) => getComputedStyle(e))
          .filter((s) => /rgb/.test(s.backgroundColor) && s.backgroundColor !== "rgba(0, 0, 0, 0)");
        return JSON.stringify({ n: bleus.length,
          restes: bleus.filter((s) => /21, 80, 107|46, 156, 202/.test(s.backgroundColor)).length });
      })()`));
      check(`[${role.nom}] aucun reste de bleu d'origine dans la coquille`,
        coquille.restes === 0, `${coquille.restes} sur ${coquille.n} fonds`);

      const capture = async (nom) => {
        const { data } = await envoyer("Page.captureScreenshot", { format: "png" });
        writeFileSync(path.join(ICI, nom), Buffer.from(data, "base64"));
      };
      await capture(`${role.nom}-bureau.png`);

      // ---------- mobile ----------
      await envoyer("Emulation.setDeviceMetricsOverride",
        { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await envoyer("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      await envoyer("Emulation.setEmulatedMedia", {
        features: [{ name: "pointer", value: "coarse" }, { name: "hover", value: "none" }],
      });
      await aller(role.espace, 3000);
      const mob = JSON.parse(await ev(`(() => {
        const vus = [...document.querySelectorAll("body *")]
          .map((e) => getComputedStyle(e))
          .filter((s) => s.backgroundColor !== "rgba(0, 0, 0, 0)");
        return JSON.stringify({
          fond: getComputedStyle(document.body).backgroundColor,
          restes: vus.filter((s) => /21, 80, 107|46, 156, 202|39, 144, 188/.test(s.backgroundColor)).length,
        });
      })()`));
      check(`[${role.nom}] mobile : le fond suit`, hex(mob.fond) === ATTENDU.bg, hex(mob.fond));
      check(`[${role.nom}] mobile : aucun reste de bleu d'origine`, mob.restes === 0, `${mob.restes} éléments`);
      await capture(`${role.nom}-mobile.png`);

      await cdp.send("Target.closeTarget", { targetId });
    }
  } finally {
    console.log("\nRetrait de la charte des cinq comptes…");
    for (const r of ROLES) { try { await semer(r, null); } catch { /* compte injoignable */ } }
    const ko = resultats.filter((x) => !x.ok).length;
    console.log(`\nCaptures : ${ICI}`);
    console.log(`${resultats.length - ko}/${resultats.length} contrôles passés`);
    chrome.kill();
    process.exit(ko ? 1 : 0);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
