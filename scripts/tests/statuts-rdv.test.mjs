/*
 * Tests unitaires de la logique de présence (lib/statuts-rdv.ts) : l'état
 * affiché, et les aides qui décident quelles actions l'interface propose.
 * node:test, sans dépendance ni base.
 *
 * Usage : node --test "scripts/tests/*.test.mjs"
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  statutAffiche,
  estConfirmable,
  estAQualifier,
  estMarquablePresent,
  estHonorableDepuisPresent,
  estCorrigeable,
  libelleStatut,
  APPARENCE_STATUT,
} from "../../lib/statuts-rdv.ts";

// Un « maintenant » fixe : le 15 juin 2026 à 10 h 00, heure de Guinée (UTC+0).
const MAINTENANT = new Date("2026-06-15T10:00:00");
const futur = { date: "2026-06-20", heure: "09:00" };
const passe = { date: "2026-06-10", heure: "09:00" };

test("présent est un fait : la date ne le transforme pas en « à qualifier »", () => {
  assert.equal(statutAffiche({ ...passe, statut: "present" }, MAINTENANT), "present");
  assert.equal(statutAffiche({ ...futur, statut: "present" }, MAINTENANT), "present");
});

test("un rendez-vous passé resté en attente ou confirmé attend d'être qualifié", () => {
  assert.equal(statutAffiche({ ...passe, statut: "en_attente" }, MAINTENANT), "a_qualifier");
  assert.equal(statutAffiche({ ...passe, statut: "confirme" }, MAINTENANT), "a_qualifier");
});

test("honoré, absent, annulé restent eux-mêmes, passés ou non", () => {
  for (const s of ["honore", "absent", "annule"]) {
    assert.equal(statutAffiche({ ...passe, statut: s }, MAINTENANT), s);
    assert.equal(statutAffiche({ ...futur, statut: s }, MAINTENANT), s);
  }
});

test("un rendez-vous à venir encore en attente est confirmable, pas à qualifier", () => {
  assert.equal(estConfirmable({ ...futur, statut: "en_attente" }, MAINTENANT), true);
  assert.equal(estAQualifier({ ...futur, statut: "en_attente" }, MAINTENANT), false);
});

test("« présent » se propose tant que rien n'est tranché — jamais après", () => {
  assert.equal(estMarquablePresent({ ...futur, statut: "en_attente" }, MAINTENANT), true);
  assert.equal(estMarquablePresent({ ...futur, statut: "confirme" }, MAINTENANT), true);
  assert.equal(estMarquablePresent({ ...passe, statut: "en_attente" }, MAINTENANT), true); // à qualifier
  assert.equal(estMarquablePresent({ ...passe, statut: "present" }, MAINTENANT), false);
  assert.equal(estMarquablePresent({ ...passe, statut: "honore" }, MAINTENANT), false);
  assert.equal(estMarquablePresent({ ...passe, statut: "absent" }, MAINTENANT), false);
  assert.equal(estMarquablePresent({ ...futur, statut: "annule" }, MAINTENANT), false);
});

test("depuis « présent », le pas normal qui reste est « honoré »", () => {
  assert.equal(estHonorableDepuisPresent({ statut: "present" }), true);
  assert.equal(estHonorableDepuisPresent({ statut: "confirme" }), false);
});

test("un statut de présence déjà posé est corrigeable ; pas en attente / confirmé / annulé", () => {
  for (const s of ["present", "honore", "absent"]) {
    assert.equal(estCorrigeable({ statut: s }), true);
  }
  for (const s of ["en_attente", "confirme", "annule"]) {
    assert.equal(estCorrigeable({ statut: s }), false);
  }
});

test("chaque état a un libellé, « non honoré » pour absent", () => {
  assert.equal(libelleStatut("present"), "Présent");
  assert.equal(libelleStatut("absent"), "Non honoré");
  // Aucun libellé vide : la couleur n'est qu'un renfort, le mot porte le sens.
  for (const [cle, app] of Object.entries(APPARENCE_STATUT)) {
    assert.ok(app.libelle && app.classe, `apparence incomplète pour ${cle}`);
  }
});
