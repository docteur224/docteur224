/*
 * Drapeaux du cookie de session (lib/supabase/cookies.ts).
 *
 * node:test, sans dépendance ni base ni réseau : on exerce la fonction PURE
 * qui décide des drapeaux, dans les deux mondes (production / développement).
 *
 * Usage : node --test "scripts/tests/*.test.mjs"
 *
 * Ce que ce test protège vraiment : que le durcissement ajoute `secure` en
 * production SANS jamais poser `name`, `path`, `domain` ni `maxAge` — les
 * quatre attributs qui, s'ils changeaient, déconnecteraient toutes les
 * sessions en cours (le navigateur ne retrouverait plus le cookie existant).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { optionsCookieSession } from "../../lib/supabase/cookies.ts";

test("en production : le cookie est Secure, SameSite=Lax, non-HttpOnly", () => {
  const o = optionsCookieSession(true);
  assert.equal(o.secure, true, "secure doit être actif en production");
  assert.equal(o.sameSite, "lax");
  assert.equal(o.httpOnly, false, "httpOnly reste false : le SDK navigateur lit le cookie");
});

test("en développement : Secure est désactivé (http://localhost)", () => {
  const o = optionsCookieSession(false);
  assert.equal(o.secure, false, "secure inactif en dev, sinon le cookie est refusé sur http");
  assert.equal(o.sameSite, "lax");
  assert.equal(o.httpOnly, false);
});

test("aucun attribut d'IDENTITÉ n'est posé (name, path, domain, maxAge)", () => {
  for (const enProd of [true, false]) {
    const o = optionsCookieSession(enProd);
    const cles = Object.keys(o).sort();
    assert.deepEqual(
      cles,
      ["httpOnly", "sameSite", "secure"],
      "la fonction ne doit rendre QUE les drapeaux ; name/path/domain/maxAge restent par défaut"
    );
  }
});

test("SameSite vaut littéralement « lax » (protection CSRF figée)", () => {
  // Poser la valeur plutôt que de la laisser au défaut de la bibliothèque :
  // c'est sur elle que repose la protection CSRF actuelle.
  assert.equal(optionsCookieSession(true).sameSite, "lax");
  assert.equal(optionsCookieSession(false).sameSite, "lax");
});
