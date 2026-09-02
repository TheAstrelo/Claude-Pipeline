# slugify: fold diacritics and collapse repeated dashes

`tslib-slugify-unicode` · kind: **routine** · fixture: `ts-lib` · test: `npm test` · expect: `tests-pass-and-rubric`

## Task

This is the exact string handed to the pipeline (`task.json` → `task`). The pipeline sees nothing else from this directory.

> Improve slugify in src/slugify.ts: (1) accented Latin letters must fold to their base letter (é→e, ü→u, ã→a), so slugify("Crème Brûlée") === "creme-brulee"; (2) any run of one or more separator characters must collapse into a single dash, so slugify("hello   world") === "hello-world" and slugify("a -- b") === "a-b". Leading and trailing dashes are still trimmed, the output stays lower-case a-z0-9 and dashes, and every existing test must keep passing. Use only the standard library (String.prototype.normalize) — no dependencies.

## Author notes

- Good: `normalize("NFKD")`, strip combining marks (`/[\u0300-\u036f]/g`), then `[^a-z0-9]+` -> `-` (note the `+`) and the existing trim; 3-6 changed lines, existing tests untouched.
- Slop: a `slugify`/`transliteration`/`lodash` dependency; a hand-written accent lookup table; a second post-pass `replace(/-+/g, "-")` instead of fixing the character class; touching `lruCache.ts`/`parseDuration.ts`.
- `tsc --noEmit` must still pass (strict, `erasableSyntaxOnly`).

## Validation

Hidden tests were copied into a fresh copy of `evals/fixtures/ts-lib` per `hidden.copy` and `npm test` was run (reference solution kept in a scratch directory, not committed):

| Tree | Exit code |
|------|-----------|
| untouched fixture + hidden tests | 1 (red) |
| reference solution + hidden tests | 0 (green) |

With the reference solution and hidden test in place, `npm run typecheck` (`tsc --noEmit`) exit code: 0.
