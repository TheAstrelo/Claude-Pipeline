# LRUCache TTL (terse variant)

`tslib-lru-ttl-terse` · kind: **terse** · fixture: `ts-lib` · test: `npm test` · expect: `tests-pass-and-rubric`

## Task

This is the exact string handed to the pipeline (`task.json` → `task`). The pipeline sees nothing else from this directory.

> lru cache entries should be able to expire

## Author notes

- Terse variant of `tslib-lru-ttl`: same fixture and hidden test, task text is one sentence. Exercises the assumptions path.
- The hidden test depends on two API choices the terse text does not state: the ttl as an optional third `set` argument in milliseconds, and an injectable `{ now }` clock in the constructor. A solution that expires entries but uses `Date.now()` directly passes only the real-clock subtest; a `{ ttl }` options-object shape passes none of the expiry subtests. Both are expected failure modes, and the per-subtest output distinguishes them.
- Read this row together with the routine variant's.

## Validation

Hidden tests were copied into a fresh copy of `evals/fixtures/ts-lib` per `hidden.copy` and `npm test` was run (reference solution kept in a scratch directory, not committed):

| Tree | Exit code |
|------|-----------|
| untouched fixture + hidden tests | 1 (red) |
| reference solution + hidden tests | 0 (green) |

The reference used was the `tslib-lru-ttl` reference solution.
