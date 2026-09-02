# GET /items/{id} with a 404 for unknown ids

`fastapi-items-get-404` · kind: **routine** · fixture: `fastapi-svc` · test: `python3 -m pytest -q` · expect: `tests-pass-and-rubric`

## Task

This is the exact string handed to the pipeline (`task.json` → `task`). The pipeline sees nothing else from this directory.

> Add GET /items/{item_id} to the FastAPI service in app/main.py: for a known id respond 200 with the stored item in the same JSON shape POST /items returns; for an unknown id respond 404 with the body {"detail": "item not found"}. Use the existing ItemStore.get from app/store.py. No new dependencies.

## Author notes

- Good: one route function `get_item(item_id: int)` using `store.get` and `raise HTTPException(status_code=404, detail="item not found")`, returning `asdict(item)`; 6-12 changed lines, ideally with one test.
- Slop: re-implementing lookup by scanning `store.list()`; editing `ItemStore`; a custom exception handler or response model hierarchy; changing the 404 detail casing; declaring `item_id: str` and converting by hand.
- FastAPI's own 404 for an unknown path is `{"detail": "Not Found"}`, which is why the hidden test checks the exact detail text and also fetches a known id.

## Validation

Hidden tests were copied into a fresh copy of `evals/fixtures/fastapi-svc` per `hidden.copy` and `python3 -m pytest -q` was run (reference solution kept in a scratch directory, not committed):

| Tree | Exit code |
|------|-----------|
| untouched fixture + hidden tests | 1 (red) |
| reference solution + hidden tests | 0 (green) |
