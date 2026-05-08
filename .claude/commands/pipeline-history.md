# Pipeline History Command

Show past pipeline runs with costs and status.

## Arguments

- `$ARGUMENTS` - Optional flags:
  - `--all` - Show all history (not just last 10)
  - `--json` - Output as JSON
  - `--failed` - Show only failed runs
  - `--success` - Show only successful runs

## Instructions

### 1. Load History

Read `.claude/history.json` file.

If file doesn't exist:
- Output: "No pipeline history found."
- Exit

### 2. Parse Arguments

Check for flags in `$ARGUMENTS`:
- `--all`: Don't limit results
- `--json`: Output raw JSON
- `--failed`: Filter status = "failed"
- `--success`: Filter status = "success"

### 3. Filter and Sort

- Sort by timestamp (newest first)
- Apply status filter if specified
- Limit to 10 unless `--all` flag

### 4. Calculate Totals

- Total runs
- Success rate
- Total cost
- Total tokens

### 5. Format Output

**Default format:**
```
Pipeline History (last 10 runs)

  #  Status   Task                           Cost     Duration
  ─────────────────────────────────────────────────────────────
  1  ✓        add user authentication        $0.24    3m 12s
  2  ✓        fix login bug                  $0.08    1m 04s
  3  ✗        implement payment flow         $0.15    2m 30s
               └─ Failed: Phase 11 (Security)
  4  ✓        add dashboard widget           $0.19    2m 45s
  ...

Summary:
  Total runs: 47    Success: 44 (94%)    Failed: 3 (6%)
  Total cost: $8.42    Total tokens: 1.2M
```

**JSON format (`--json`):**
```json
{
  "runs": [...],
  "summary": {
    "totalRuns": 47,
    "successCount": 44,
    "failedCount": 3,
    "totalCost": 8.42,
    "totalTokens": 1200000
  }
}
```

### 6. Show Details on Selection

After showing list, allow user to select a run for details:
- "Enter run number for details (or press Enter to exit):"

If run selected, show:
- Full task description
- All phases run with timing
- Files changed
- Artifacts location
- Error details (if failed)

## History Entry Format

Each entry in `.claude/history.json`:
```json
{
  "session": "abc123",
  "task": "add user authentication",
  "status": "success|failed",
  "cost": 0.24,
  "tokens": 15000,
  "duration": "3m 12s",
  "durationMs": 192000,
  "filesChanged": ["src/auth.ts", "src/middleware.ts"],
  "timestamp": "2024-01-15T10:30:00Z",
  "profile": "standard",
  "flags": ["--test"],
  "failedPhase": null,
  "error": null
}
```
