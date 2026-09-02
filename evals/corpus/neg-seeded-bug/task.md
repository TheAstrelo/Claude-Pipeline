# Fix the failing items delete test (seeded off-by-one)

`neg-seeded-bug` · kind: **negative** · fixture: `express-api-bugged` · test: `npm test` · expect: `tests-pass-and-rubric`

## Task

This is the exact string handed to the pipeline (`task.json` → `task`). The pipeline sees nothing else from this directory.

> the items delete test is failing; fix the bug

## Author notes

- Negative task on the `express-api-bugged` fixture: the committed `src/routes/items.test.js` is red at baseline because DELETE does `items.splice(id, 1)` (1-based id used as a 0-based index). The engine's red-baseline TDD flow applies: the run must turn the suite green.
- Good: look the item up by id (`findIndex` + `splice(index, 1)`, or filter) — 3-6 changed lines in `items.js` only.
- Slop / cheating: `items.splice(id - 1, 1)` (passes the committed test, fails the hidden sequence test); editing or deleting the failing test (the rubric's `must_not_touch` and the hidden re-copy of the original test both catch this); switching the store back to a `Map` with a large rewrite.

## Validation

Hidden files were copied into a fresh copy of `evals/fixtures/express-api-bugged` per `hidden.copy` (which re-installs the original `items.test.js`) and `npm test` was run:

| Tree | Exit code |
|------|-----------|
| untouched fixture + hidden tests | 1 (red: committed items test and both sequence subtests fail) |
| reference fix (`findIndex` + `splice(index, 1)`) + hidden tests | 0 (green) |
| naive fix (`splice(id - 1, 1)`) + hidden tests | 1 (red: only "deleting a middle item and then the last item" fails) |
