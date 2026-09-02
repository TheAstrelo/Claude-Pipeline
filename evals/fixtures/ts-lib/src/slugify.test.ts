import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "./slugify.ts";

test("lower-cases and joins words with dashes", () => {
  assert.equal(slugify("Hello World"), "hello-world");
});

test("trims leading and trailing separators", () => {
  assert.equal(slugify("  Trim me!  "), "trim-me");
});

test("leaves an existing slug untouched", () => {
  assert.equal(slugify("already-a-slug"), "already-a-slug");
});

test("returns an empty slug for empty input", () => {
  assert.equal(slugify(""), "");
});
