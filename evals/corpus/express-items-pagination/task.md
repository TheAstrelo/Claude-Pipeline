# Paginate GET /api/items with limit and offset

`express-items-pagination` · kind: **routine** · fixture: `express-api` · test: `npm test` · expect: `tests-pass-and-rubric`

## Task

This is the exact string handed to the pipeline (`task.json` → `task`). The pipeline sees nothing else from this directory.

> Add pagination to GET /api/items via two optional query parameters: limit (integer 1-100, default 20) and offset (integer >= 0, default 0). The response stays a JSON array containing the items from position offset, at most limit of them, in insertion order; an offset past the end yields an empty array. If limit or offset is present but is not an integer or is out of range, respond 400 with a JSON body of the shape { "error": "<message>" }. Do not add dependencies.

## Author notes

- Good: parse `limit`/`offset` in the GET handler with integer + range checks, 400 on anything invalid, then `slice(offset, offset + limit)` on the insertion-ordered array; the response stays a bare array. 15-40 changed lines.
- Slop: an `express-paginate`/`joi` dependency; changing the response to `{ items, total, ... }` (breaks the committed list test); clamping silently instead of rejecting; parsing with `parseInt` so `2.5` and `10abc` pass; a pagination "service" abstraction.
- Fractional and non-numeric values must be 400, not coerced.

## Validation

Hidden tests were copied into a fresh copy of `evals/fixtures/express-api` per `hidden.copy` and `npm test` was run (reference solution kept in a scratch directory, not committed):

| Tree | Exit code |
|------|-----------|
| untouched fixture + hidden tests | 1 (red) |
| reference solution + hidden tests | 0 (green) |
