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
import { estRoutePublique, estActive } from "../../lib/charte-publique.ts";

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
