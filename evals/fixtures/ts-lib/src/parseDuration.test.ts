import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDuration } from "./parseDuration.ts";

test("parses single units", () => {
  assert.equal(parseDuration("250ms"), 250);
  assert.equal(parseDuration("45s"), 45_000);
  assert.equal(parseDuration("2m"), 120_000);
  assert.equal(parseDuration("1h"), 3_600_000);
  assert.equal(parseDuration("1d"), 86_400_000);
});

test("sums compound durations", () => {
  assert.equal(parseDuration("1h30m"), 5_400_000);
  assert.equal(parseDuration("1h 30m 15s"), 5_415_000);
});

test("accepts decimal amounts", () => {
  assert.equal(parseDuration("1.5s"), 1_500);
});

test("rejects malformed input", () => {
  assert.throws(() => parseDuration(""), /must not be empty/);
  assert.throws(() => parseDuration("soon"), /invalid duration/);
  assert.throws(() => parseDuration("10"), /invalid duration/);
  assert.throws(() => parseDuration("5x"), /invalid duration/);
});
