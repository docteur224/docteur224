/*
 * Tests unitaires de lib/normes-constantes.ts — node:test, sans dépendance.
 * Node 24 lit le TypeScript directement (suppression des types).
 *
 * Usage : node --test scripts/tests/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dansPeriode,
  debutPeriode,
  evaluerGlycemie,
  evaluerTension,
  lireNombre,
  nombreFr,
  variationPoids,
} from "../../lib/normes-constantes.ts";

test("tension : seuils et chiffre le plus défavorable", () => {
  assert.equal(evaluerTension(120, 80).niveau, "normal");
  assert.equal(evaluerTension(139, 89).niveau, "normal");
  assert.equal(evaluerTension(140, 80).libelle, "Élevée");
  assert.equal(evaluerTension(135, 95).libelle, "Élevée", "la diastolique seule suffit");
  assert.equal(evaluerTension(185, 100).niveau, "alerte");
  assert.equal(evaluerTension(150, 112).niveau, "alerte");
  assert.equal(evaluerTension(85, 55).libelle, "Basse");
});

test("glycémie : le contexte change le seuil", () => {
  assert.equal(evaluerGlycemie(1.3, "a_jeun").niveau, "alerte");
  assert.equal(evaluerGlycemie(1.3, "apres_repas").niveau, "normal");
  assert.equal(evaluerGlycemie(1.15, "a_jeun").libelle, "Hyperglycémie modérée");
  assert.equal(evaluerGlycemie(1.09, "a_jeun").niveau, "normal");
  assert.equal(evaluerGlycemie(1.5, "apres_repas").niveau, "attention");
  assert.equal(evaluerGlycemie(2.1, "au_hasard").niveau, "alerte");
});

test("glycémie : l’hypoglycémie est une alerte dans tous les contextes", () => {
  for (const c of ["a_jeun", "apres_repas", "au_hasard"]) {
    assert.equal(evaluerGlycemie(0.6, c).libelle, "Hypoglycémie");
  }
});

test("poids : variation signalée au-delà de 5 % en moins de trois mois", () => {
  const v = variationPoids({ kg: 80, le: "2026-07-01" }, { kg: 75, le: "2026-09-01" });
  assert.equal(v.pourcentage, -6.3);
  assert.equal(v.signalee, true);
  assert.equal(variationPoids({ kg: 80, le: "2025-01-01" }, { kg: 75, le: "2026-09-01" }).signalee, false, "sur 20 mois");
  assert.equal(variationPoids({ kg: 80, le: "2026-08-01" }, { kg: 78, le: "2026-09-01" }).signalee, false, "2,5 %");
});

test("périodes : mois calendaires, tri chronologique", () => {
  const maintenant = new Date("2026-10-24T12:00:00Z");
  assert.equal(debutPeriode("tout", maintenant), null);
  assert.equal(debutPeriode("3m", maintenant).toISOString().slice(0, 10), "2026-07-24");
  assert.equal(debutPeriode("1a", maintenant).toISOString().slice(0, 10), "2025-10-24");
  const points = [
    { le: "2026-10-01T08:00:00Z", v: 3 },
    { le: "2026-01-01T08:00:00Z", v: 1 },
    { le: "2026-08-01T08:00:00Z", v: 2 },
  ];
  assert.deepEqual(dansPeriode(points, "3m", maintenant).map((p) => p.v), [2, 3]);
  assert.deepEqual(dansPeriode(points, "tout", maintenant).map((p) => p.v), [1, 2, 3]);
});

test("saisie : virgule acceptée, texte refusé", () => {
  assert.equal(lireNombre("72,5"), 72.5);
  assert.equal(lireNombre(" 1.32 "), 1.32);
  assert.equal(lireNombre(""), null);
  assert.ok(Number.isNaN(lireNombre("72kg")));
  assert.ok(Number.isNaN(lireNombre("-3")));
});

test("affichage : virgule décimale", () => {
  assert.equal(nombreFr(72.5), "72,5");
  assert.equal(nombreFr(1.32, 2), "1,32");
  assert.equal(nombreFr(73), "73");
});
