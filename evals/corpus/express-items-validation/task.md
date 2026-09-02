# Validate the item name on POST /api/items

`express-items-validation` · kind: **routine** · fixture: `express-api` · test: `npm test` · expect: `tests-pass-and-rubric`

## Task

This is the exact string handed to the pipeline (`task.json` → `task`). The pipeline sees nothing else from this directory.

> POST /api/items must reject an invalid item name: when the body has no "name", or "name" is not a string, or it is an empty/whitespace-only string, respond 400 with exactly the JSON body { "error": "name is required" }. Valid names keep creating items with 201 as today. Do not add dependencies.

## Author notes

- Good: a single guard in the POST handler (`typeof name !== 'string' || name.trim() === ''`) returning exactly `{ error: "name is required" }`; 3-8 changed lines plus perhaps one test.
- Slop: pulling in `express-validator`/`joi`/`zod` for one string check; a generic validation middleware layer; changing the message casing on other error paths; rewriting the router.
- The baseline already returns 400 for a missing name with `"Name is required"`; the hidden test's message check and the whitespace/non-string cases are what distinguish a real fix.

## Validation

Hidden tests were copied into a fresh copy of `evals/fixtures/express-api` per `hidden.copy` and `npm test` was run (reference solution kept in a scratch directory, not committed):

| Tree | Exit code |
|------|-----------|
| untouched fixture + hidden tests | 1 (red) |
| reference solution + hidden tests | 0 (green) |
