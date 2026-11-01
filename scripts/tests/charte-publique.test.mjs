/*
 * Les deux règles qui cantonnent la charte de campagne :
 *   · estRoutePublique — jamais dans un espace connecté ;
 *   · estActive        — seulement dans sa fenêtre de dates.
 *
 * Fonctions pures, vérifiées sans navigateur ni base.
 * Usage : node --test scripts/tests/charte-publique.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { estRoutePublique, estActive, analyser } from "../../lib/charte-publique.ts";
import { construireCharte, contraste } from "../../lib/charte-couleurs.ts";
import {
  CHARTES_PUBLIQUES_PRETES, prochaineOccurrence,
} from "../../lib/chartes-publiques-pretes.ts";

test("estRoutePublique — les pages publiques sont publiques", () => {
  for (const p of ["/", "/a-propos", "/faq", "/resultats", "/conseils-sante", "/connexion", "/medecin/dr-barry", "/reservation"]) {
    assert.equal(estRoutePublique(p), true, p);
  }
});

test("estRoutePublique — les espaces connectés ne le sont pas", () => {
  for (const p of [
    "/patient", "/patient/", "/patient/mon-compte",
    "/espace-admin", "/espace-admin/mon-compte", "/espace-admin/connexion",
    "/espace-medecin/agenda", "/espace-assistant", "/espace-etablissement/abonnement",
    // Page du patient restée à la racine : connectée, donc jamais publique.
    "/mes-rendez-vous", "/mes-rendez-vous/", "/mes-rendez-vous/abc123",
  ]) {
    assert.equal(estRoutePublique(p), false, p);
  }
});

test("estRoutePublique — un préfixe partiel reste public", () => {
  // « /patientele » n'est pas « /patient » : on ne doit pas l'exclure.
  assert.equal(estRoutePublique("/patientele"), true);
  assert.equal(estRoutePublique("/espace-medecin-public"), true);
});

const t = (iso) => Date.parse(iso);

test("estActive — dans la fenêtre", () => {
  const c = { principale: "#8a1246", accent: "#db2777", debut: "2026-10-01T00:00:00Z", fin: "2026-10-31T23:59:59Z" };
  assert.equal(estActive(c, t("2026-10-15T12:00:00Z")), true);
});

test("estActive — avant le début (programmée)", () => {
  const c = { principale: "#8a1246", accent: "#db2777", debut: "2026-10-01T00:00:00Z", fin: "2026-10-31T23:59:59Z" };
  assert.equal(estActive(c, t("2026-09-20T12:00:00Z")), false);
});

test("estActive — après la fin (retour à l'origine)", () => {
  const c = { principale: "#8a1246", accent: "#db2777", debut: "2026-10-01T00:00:00Z", fin: "2026-10-31T23:59:59Z" };
  assert.equal(estActive(c, t("2026-11-05T12:00:00Z")), false);
});

test("estActive — bornes nulles = sans limite de ce côté", () => {
  assert.equal(estActive({ principale: "#8a1246", accent: "#db2777", debut: null, fin: null }, Date.now()), true);
  assert.equal(estActive({ principale: "#8a1246", accent: "#db2777", debut: null, fin: "2026-10-31T23:59:59Z" }, t("2026-10-10T00:00:00Z")), true);
  assert.equal(estActive({ principale: "#8a1246", accent: "#db2777", debut: "2026-10-01T00:00:00Z", fin: null }, t("2026-12-10T00:00:00Z")), true);
});

test("estActive — null (aucune campagne)", () => {
  assert.equal(estActive(null), false);
});

/* ------------------------------------------------------------------ */
/* La troisième couleur                                                */
/* ------------------------------------------------------------------ */

test("analyser — la troisième couleur est reprise, normalisée", () => {
  const c = analyser(JSON.stringify({
    principale: "#0A5C3F", accent: "#CE1126", secondaire: "#FCD116",
  }));
  assert.equal(c.secondaire, "#fcd116");
});

test("analyser — absente ou mal formée, elle vaut null sans perdre la campagne", () => {
  for (const brut of [
    { principale: "#0a5c3f", accent: "#ce1126" },
    { principale: "#0a5c3f", accent: "#ce1126", secondaire: "jaune" },
    { principale: "#0a5c3f", accent: "#ce1126", secondaire: null },
  ]) {
    const c = analyser(JSON.stringify(brut));
    assert.equal(c.secondaire, null, JSON.stringify(brut));
    assert.equal(c.principale, "#0a5c3f");
  }
});

test("construireCharte — la 3e couleur ne déborde pas sur le reste", () => {
  // Elle ne sert qu'au filet : poser un jaune éclatant ne doit toucher ni les
  // fonds, ni les textes, ni les bordures. C'est ce qui permet de l'accepter
  // sans contrôle de lisibilité de texte.
  const sans = construireCharte("#0a5c3f", "#ce1126");
  const avec = construireCharte("#0a5c3f", "#ce1126", "#fcd116");
  for (const [nom, valeur] of Object.entries(sans)) {
    if (nom === "secondaire" || nom === "sur-secondaire") continue;
    assert.equal(avec[nom], valeur, nom);
  }
  assert.equal(avec.secondaire, "#fcd116");
  // Sans troisième couleur, le token existe quand même et vaut l'accent :
  // le filet garde deux segments au lieu de disparaître.
  assert.equal(sans.secondaire, "#ce1126");
});

/* ------------------------------------------------------------------ */
/* Les habillages proposés se lisent vraiment                          */
/* ------------------------------------------------------------------ */

test("habillages prêts — chaque cause reste lisible là où on la lit", () => {
  // Les trois mêmes mesures que l'écran d'administration. Une couleur
  // retouchée à vue ne passera pas sans que ce test le dise.
  const CAUSES = CHARTES_PUBLIQUES_PRETES.filter((c) => c.periode || c.secondaire);
  assert.ok(CAUSES.length >= 9, "les causes du calendrier sont proposées");

  for (const c of CAUSES) {
    const p = construireCharte(c.principale, c.accent, c.secondaire);
    assert.ok(
      contraste(p.blue, p["sur-principale"]) >= 4.5,
      `${c.nom} — titre sur le héros`,
    );
    assert.ok(
      contraste(p.teal, p["sur-accent"]) >= 3,
      `${c.nom} — texte des boutons`,
    );
    assert.ok(
      contraste(p.teal, "#ffffff") >= 4.5,
      `${c.nom} — lien d'accent sur blanc`,
    );
    if (c.secondaire) {
      // La 3e couleur ne porte pas de texte : on lui demande seulement de se
      // détacher du filet, qui est peint de la principale.
      assert.ok(
        contraste(c.secondaire, c.principale) >= 3,
        `${c.nom} — 3e couleur sur le filet`,
      );
    }
  }
});

test("prochaineOccurrence — cette année tant qu'elle n'est pas passée", () => {
  const octobreRose = { debut: "10-01", jours: 31 };
  assert.deepEqual(
    prochaineOccurrence(octobreRose, new Date(2026, 7, 15)),
    { debut: "2026-10-01", fin: "2026-10-31" },
  );
  // Le dernier jour compte encore : une campagne du jour reste proposable.
  assert.deepEqual(
    prochaineOccurrence(octobreRose, new Date(2026, 9, 31)),
    { debut: "2026-10-01", fin: "2026-10-31" },
  );
});

test("prochaineOccurrence — une fois passée, c'est l'an prochain", () => {
  assert.deepEqual(
    prochaineOccurrence({ debut: "10-01", jours: 3 }, new Date(2026, 10, 1)),
    { debut: "2027-10-01", fin: "2027-10-03" },
  );
});
