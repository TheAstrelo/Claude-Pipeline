# Pipeline History Command

Show past pipeline runs with cost, token, cache, and status summaries.

## Arguments

- `$ARGUMENTS` - Optional flags:
  - `--all` - Show all history (not just the last 10)
  - `--json` - Output the schema-2 history document as JSON
  - `--failed` - Show only `HALTED` runs
  - `--success` - Show only `COMPLETED` runs

## Instructions

### 1. Load and Validate History

Read `.pipeline/history.json`.

If it does not exist, output `No pipeline history found.` and exit.

Parse `schemaVersion`. Accept major version `2` and tolerate additive minor
fields. Reject any other major version and tell the user to use a compatible
history reader. Never reinterpret an unknown schema.

The file is a derived index, not durable evidence. Each run's authoritative
record is `.pipeline/artifacts/<session>/ledger.jsonl`; its `run.json` is a
derived per-run summary. Do not edit any of these files from this command.

### 2. Parse Arguments

- `--all`: do not limit results
- `--json`: output the validated JSON document
- `--failed`: filter `status = "HALTED"`
- `--success`: filter `status = "COMPLETED"`

`RUNNING` means no terminal event follows the latest start/resume event. It is
neither a successful nor a failed run.

### 3. Filter and Sort

- Sort `runs` by `finishedAt`, newest first.
- Apply the requested status filter.
- Limit to 10 unless `--all` is present.

### 4. Calculate Totals

For the displayed set report:

- Total runs
- Completed, halted, and running counts
- Completion rate
- Total estimated/reported cost
- Total input plus output tokens
- Cached input tokens

### 5. Format Output

Default table:

```text
Pipeline History (last 10 runs)

  #  Status     Task                         Cost      Tokens   Cached
  1  COMPLETED  add user authentication      $0.2400    15,000    4,000
  2  HALTED     implement payment flow       $0.1500     9,400        0
  3  RUNNING    add dashboard widget         $0.0800     5,200    1,100

Summary:
  Runs: 3  Completed: 1  Halted: 1  Running: 1
  Cost: $0.4700  Tokens: 29,600  Cached: 5,100
```

With `--json`, return the validated schema-2 document (or the filtered `runs`
and recomputed `summary` when a filter is present).

### 6. Show Details on Selection

If interaction is available, allow selection of a run. Read its referenced
`run.json` and show:

- Full task
- Provider, model lanes, and profile
- Phase results and last checkpoint cursor
- Attempts, model calls, token/cache totals, and cost semantics
- Commit publication state
- Artifact directory

State clearly that `run.json` is derived and that forensic verification must
use the hash-linked ledger and referenced attempt/artifact evidence.

## History Schema

`.pipeline/history.json` uses this versioned shape:

```json
{
  "schemaVersion": "2.0",
  "version": 2,
  "source": "derived-from-run-ledgers",
  "runs": [
    {
      "id": "opaque-run-id",
      "task": "add user authentication",
      "provider": "codex",
      "models": {
        "strong": "gpt-5.6-sol",
        "fast": "gpt-5.6-terra"
      },
      "profile": "standard",
      "artifacts": ".pipeline/artifacts/<session>",
      "validatorsPassed": 13,
      "validatorsFailed": 0,
      "costUSD": 0.24,
      "costKind": "api-price-equivalent-estimate",
      "totalTokens": 15000,
      "cachedTokens": 4000,
      "status": "COMPLETED",
      "finishedAt": "2026-07-24T10:30:00.000Z"
    }
  ],
  "summary": {
    "totalRuns": 1,
    "successCount": 1,
    "failedCount": 0,
    "totalCost": 0.24,
    "totalTokens": 15000
  }
}
```
