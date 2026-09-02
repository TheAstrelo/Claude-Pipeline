# LRUCache: optional per-entry TTL with an injectable clock

`tslib-lru-ttl` · kind: **routine** · fixture: `ts-lib` · test: `npm test` · expect: `tests-pass-and-rubric`

## Task

This is the exact string handed to the pipeline (`task.json` → `task`). The pipeline sees nothing else from this directory.

> Add optional per-entry expiry to LRUCache in src/lruCache.ts. set(key, value, ttlMs?) takes an optional time-to-live in milliseconds; once ttlMs has elapsed since that set, get(key) returns undefined and has(key) returns false — the entry behaves as if absent. Entries set without a ttl never expire. Re-setting a key replaces its ttl (or removes it when no ttl is given). For testability the constructor must accept an optional second argument, an options object { now?: () => number } supplying the clock (default Date.now); every time read must go through it. LRU eviction semantics are unchanged and all existing tests must keep passing. No dependencies.

## Author notes

- Good: entries become `{ value, expiresAt: number | null }`, a private `#live(key)` helper drops expired entries lazily on `get`/`has`, `set(key, value, ttlMs?)` computes `expiresAt` from the injected `now`, constructor takes `(capacity, { now } = {})` defaulting to `Date.now`. 30-70 changed lines; existing tests keep passing (chaining `set` still returns `this`).
- Slop: `setTimeout`-based expiry (timers keep the process alive, untestable with a fake clock); a `lru-cache`/`@isaacs/ttlcache` dependency; reading `Date.now()` directly somewhere so the fake clock is bypassed; breaking `keys()`/`size`/`capacity`.
- The last hidden subtest uses the real clock (30 ms ttl, 80 ms sleep) to confirm the default.

## Validation

Hidden tests were copied into a fresh copy of `evals/fixtures/ts-lib` per `hidden.copy` and `npm test` was run (reference solution kept in a scratch directory, not committed):

| Tree | Exit code |
|------|-----------|
| untouched fixture + hidden tests | 1 (red) |
| reference solution + hidden tests | 0 (green) |

With the reference solution and hidden test in place, `npm run typecheck` (`tsc --noEmit`) exit code: 0.
