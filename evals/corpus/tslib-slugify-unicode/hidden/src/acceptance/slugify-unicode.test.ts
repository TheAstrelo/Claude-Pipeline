// Hidden acceptance test for tslib-slugify-unicode. Copied into the
// candidate tree AFTER the pipeline run; the pipeline never sees it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "../slugify.ts";

test("folds diacritics to their base letters", () => {
  assert.equal(slugify("Crème Brûlée"), "creme-brulee");
  assert.equal(slugify("Ünïcödé"), "unicode");
  assert.equal(slugify("São Paulo"), "sao-paulo");
  assert.equal(slugify("naïve café"), "naive-cafe");
});

test("collapses runs of separators into a single dash", () => {
  assert.equal(slugify("hello   world"), "hello-world");
  assert.equal(slugify("a -- b"), "a-b");
  assert.equal(slugify("one___two...three"), "one-two-three");
  assert.equal(slugify("rock & roll"), "rock-roll");
});

test("still trims leading and trailing separators after folding", () => {
  assert.equal(slugify("--- Élan ---"), "elan");
  assert.equal(slugify("  ¡Hola!  "), "hola");
});

test("existing behaviour is preserved", () => {
  assert.equal(slugify("Hello World"), "hello-world");
  assert.equal(slugify("already-a-slug"), "already-a-slug");
  assert.equal(slugify("v2.0.1"), "v2-0-1");
  assert.equal(slugify(""), "");
});

test("output only ever contains a-z, 0-9 and single dashes", () => {
  for (const input of ["Crème  Brûlée!!", "___", "Ça va?", "  x  "]) {
    assert.match(slugify(input), /^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/);
  }
});
