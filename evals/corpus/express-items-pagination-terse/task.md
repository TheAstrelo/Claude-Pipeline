# Items pagination (terse variant)

`express-items-pagination-terse` · kind: **terse** · fixture: `express-api` · test: `npm test` · expect: `tests-pass-and-rubric`

## Task

This is the exact string handed to the pipeline (`task.json` → `task`). The pipeline sees nothing else from this directory.

> add pagination to items

## Author notes

- Terse variant of `express-items-pagination`: same fixture, same hidden test, but the pipeline only sees "add pagination to items". It exercises the assumptions path in Requirements/Design.
- The hidden test encodes the canonical contract (`limit` 1-100 default 20, `offset` >= 0 default 0, bare-array response, 400 on invalid values). A pipeline that picks a different but defensible contract (page/pageSize, clamping, an envelope object) fails some subtests; the per-subtest output shows which assumption diverged, which is the signal this row exists to produce.
- Compare its row with the routine variant's to measure how much the pipeline loses to under-specification.

## Validation

Hidden tests were copied into a fresh copy of `evals/fixtures/express-api` per `hidden.copy` and `npm test` was run (reference solution kept in a scratch directory, not committed):

| Tree | Exit code |
|------|-----------|
| untouched fixture + hidden tests | 1 (red) |
| reference solution + hidden tests | 0 (green) |

The reference used was the `express-items-pagination` reference solution.
