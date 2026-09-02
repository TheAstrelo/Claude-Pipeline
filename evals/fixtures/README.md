# Evaluation fixtures

Small, self-contained projects the corpus runner (`evals/run-corpus.mts`)
copies into a temp directory, commits as the baseline, and runs the engine
against. Every fixture has a real test command that the engine's
`detect_project`-style discovery picks up on its own (package.json scripts,
`[tool.pytest.ini_options]`, `go.mod`). No fixture ever contains a hidden
acceptance test — those live in `evals/corpus/<task>/hidden/` and are copied
in only after the run. Lockfiles and installed dependencies are not committed:
the runner runs `npm install` after the baseline commit for Node fixtures;
Python and Go dependencies must already be on the machine (`requirements.txt`
lists the Python ones; Go has none beyond the toolchain).

## `express-api` — Node 22, Express 4

The `demo/starter-project` app without its red acceptance test: `src/index.js`
mounts `/api/health` and `/api/items` (in-memory `Map` store: list, get,
create, delete) behind a request logger. Version is `1.4.2` so a hard-coded
`"1.0.0"` cannot pass the version task by accident. Tests: `npm test` runs
`node --test "src/**/*.test.js"` (node's own glob, so tests at any depth
under `src/` are found); baseline suite is `src/routes/health.test.js` and
`src/routes/items.test.js`, green (4 tests). No typecheck/lint scripts.
Used by every `express-*` task and by `neg-secret-leak` /
`neg-command-injection`.

## `express-api-bugged` — Node 22, Express 4 (red at baseline by design)

`express-api` with the item store switched to an insertion-ordered array and
a seeded off-by-one in `DELETE /api/items/:id` (`items.splice(id, 1)` — the
1-based id used as a 0-based index, with a comment that rationalises it).
`src/routes/items.test.js` is byte-identical to the one in `express-api` and
**fails** at baseline (`npm test` exits 1: 3 pass, 1 fail), which is what the
`neg-seeded-bug` task hands to the engine's red-baseline TDD flow.

## `ts-lib` — TypeScript 5.8+, Node 22, zero runtime dependencies

Three modules under `src/`: `slugify.ts`, `parseDuration.ts` (`"1h30m"` →
ms), `lruCache.ts` (`LRUCache<K, V>` with `get/set/has/delete/clear/keys`),
re-exported from `src/index.ts`. ESM (`"type": "module"`), `.ts` import
specifiers, `tsconfig.json` is `strict` with `erasableSyntaxOnly` and
`verbatimModuleSyntax` so the code stays runnable by node's type stripping.
Tests: `npm test` = `node --test --experimental-strip-types "src/**/*.test.ts"`
(no build step; baseline 13 tests green). Typecheck: `npm run typecheck` =
`tsc --noEmit` (green). Dev dependencies: `typescript`, `@types/node`. No
lint script.

## `fastapi-svc` — Python 3.11, FastAPI, httpx, pytest

`app/main.py` exposes `GET /health`, `GET /items`, `POST /items` on top of
`app/store.py` (`ItemStore`, process-local dict, sequential ids).
`tests/conftest.py` provides a `client` fixture that clears the store and
returns a `TestClient`. `pyproject.toml` carries
`[tool.pytest.ini_options]` (`testpaths`, `pythonpath = ["."]`) so the engine
selects `python3 -m pytest -q`; `requirements.txt` pins nothing tighter than
`fastapi>=0.110`, `httpx>=0.27`, `pytest>=8`. Baseline: 3 tests green (one
`StarletteDeprecationWarning` about httpx comes from the installed starlette,
not the fixture). No mypy/ruff configuration, so no typecheck/lint commands
are detected.

## `go-cli` — Go 1.24, standard library only

Module `example.com/wordcount`: `main.go` reads stdin and prints `word count`
lines alphabetically; `internal/wordcount` has `Count(text) map[string]int`,
`Sorted(counts) []Pair` and the `Pair{Word, Count}` type. Tests: `go test
./...` (baseline 4 tests across two packages, green); the engine also runs
`go build ./...` and `go vet ./...` (both clean, `gofmt -l .` empty).
