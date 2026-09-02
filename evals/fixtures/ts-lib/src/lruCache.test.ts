import { test } from "node:test";
import assert from "node:assert/strict";
import { LRUCache } from "./lruCache.ts";

test("stores and retrieves values", () => {
  const cache = new LRUCache<string, number>(2);
  cache.set("a", 1).set("b", 2);
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("b"), 2);
  assert.equal(cache.get("missing"), undefined);
  assert.equal(cache.size, 2);
});

test("evicts the least recently used entry when over capacity", () => {
  const cache = new LRUCache<string, number>(2);
  cache.set("a", 1).set("b", 2);
  cache.get("a"); // "b" is now the least recently used
  cache.set("c", 3);
  assert.equal(cache.has("b"), false);
  assert.deepEqual(cache.keys(), ["a", "c"]);
});

test("overwriting a key keeps a single entry and refreshes it", () => {
  const cache = new LRUCache<string, number>(2);
  cache.set("a", 1).set("b", 2).set("a", 10);
  assert.equal(cache.size, 2);
  assert.equal(cache.get("a"), 10);
  assert.deepEqual(cache.keys(), ["b", "a"]);
});

test("delete and clear remove entries", () => {
  const cache = new LRUCache<string, number>(3);
  cache.set("a", 1).set("b", 2);
  assert.equal(cache.delete("a"), true);
  assert.equal(cache.delete("a"), false);
  cache.clear();
  assert.equal(cache.size, 0);
});

test("rejects a non-positive capacity", () => {
  assert.throws(() => new LRUCache(0), RangeError);
});
