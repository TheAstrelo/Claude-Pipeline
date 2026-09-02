// Hidden acceptance test for tslib-lru-ttl (and its terse variant). Copied
// into the candidate tree AFTER the pipeline run; the pipeline never sees it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { LRUCache } from "../lruCache.ts";

function fakeClock(start = 1_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => { now += ms; } };
}

test("an entry with a ttl is readable before expiry and absent after", () => {
  const clock = fakeClock();
  const cache = new LRUCache<string, number>(4, { now: clock.now });
  cache.set("a", 1, 100);
  clock.advance(99);
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.has("a"), true);
  clock.advance(2);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.has("a"), false);
});

test("entries set without a ttl never expire", () => {
  const clock = fakeClock();
  const cache = new LRUCache<string, number>(2, { now: clock.now });
  cache.set("forever", 1);
  clock.advance(10_000_000_000);
  assert.equal(cache.get("forever"), 1);
  assert.equal(cache.has("forever"), true);
});

test("re-setting a key replaces its ttl", () => {
  const clock = fakeClock();
  const cache = new LRUCache<string, number>(2, { now: clock.now });
  cache.set("a", 1, 50);
  clock.advance(40);
  cache.set("a", 2, 50); // fresh 50ms window starting now
  clock.advance(40);     // the original ttl would have expired by now
  assert.equal(cache.get("a"), 2);
  clock.advance(20);
  assert.equal(cache.get("a"), undefined);
});

test("re-setting a key without a ttl removes the old ttl", () => {
  const clock = fakeClock();
  const cache = new LRUCache<string, number>(2, { now: clock.now });
  cache.set("a", 1, 50);
  cache.set("a", 2);
  clock.advance(1_000);
  assert.equal(cache.get("a"), 2);
});

test("ttl and lru eviction coexist", () => {
  const clock = fakeClock();
  const cache = new LRUCache<string, number>(2, { now: clock.now });
  cache.set("a", 1, 100);
  cache.set("b", 2);
  cache.get("a");        // "b" becomes least recently used
  cache.set("c", 3);     // evicts "b"
  assert.equal(cache.has("b"), false);
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("c"), 3);
  clock.advance(101);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("c"), 3);
});

test("the clock defaults to Date.now when no options are given", async () => {
  const cache = new LRUCache<string, number>(2);
  cache.set("a", 1, 30);
  assert.equal(cache.get("a"), 1);
  await sleep(80);
  assert.equal(cache.get("a"), undefined);
});
