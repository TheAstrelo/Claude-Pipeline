# wordcount.TopN: the n most frequent words

`go-wordcount-top-n` · kind: **routine** · fixture: `go-cli` · test: `go test ./...` · expect: `tests-pass-and-rubric`

## Task

This is the exact string handed to the pipeline (`task.json` → `task`). The pipeline sees nothing else from this directory.

> Add TopN(text string, n int) []Pair to package wordcount (internal/wordcount/wordcount.go). It returns the n most frequent words in text, most frequent first, using the same normalisation as Count (reuse Count rather than re-tokenising). Words with equal counts are ordered alphabetically. When n exceeds the number of distinct words return all of them; when n <= 0 return an empty slice. Add a unit test next to the existing ones. No new dependencies.

## Author notes

- Good: `TopN` built on `Count` (and `Sorted` for the alphabetical base order) with a `sort.SliceStable` by count descending, then truncation; `n <= 0` returns an empty slice. 15-30 lines plus a table test; `go vet` and `gofmt` clean.
- Slop: re-tokenising the text inside `TopN`; a heap or a generic "ranking" abstraction; a new module dependency; wiring a `-top` flag into `main.go` (out of scope and forbidden by the rubric).
- On the untouched fixture the hidden test fails at compile time (`undefined: wordcount.TopN`), which `go test` reports as a build failure with exit 1.

## Validation

Hidden tests were copied into a fresh copy of `evals/fixtures/go-cli` per `hidden.copy` and `go test ./...` was run (reference solution kept in a scratch directory, not committed):

| Tree | Exit code |
|------|-----------|
| untouched fixture + hidden tests | 1 (red) |
| reference solution + hidden tests | 0 (green) |

On the untouched fixture the failure is a build failure of the `internal/wordcount` test binary (`undefined: wordcount.TopN`). With the reference in place, `go vet ./...` exit 0 and `gofmt -l .` printed nothing.
