# Auto Pipeline Enhanced Flags

This document describes the enhanced flags available for `/auto-pipeline`.

## Flag Reference

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--dry-run` | Boolean | false | Preview without writing files |
| `--fast` | Boolean | false | Skip QA phases 7-10 (alias for --profile=fast) |
| `--fix` | Boolean | false | Auto-retry on failures (max 3 attempts) |
| `--auto` / `--yolo` | Boolean | false | Never pause, log warnings only |
| `--quiet` | Boolean | false | One-line output for scripting |
| `--only=X` | Value | all | Run specific phases (e.g., `--only=0,2,6`) |
| `--preview` | Boolean | false | Show diff before applying changes |
| `--test` | Boolean | false | Run tests after build |
| `--branch[=X]` | Optional | - | Create feature branch |
| `--pr` | Boolean | false | Create PR after success |
| `--template=X` | Value | - | Use template (api-endpoint, auth-flow, crud-page, webhook) |
| `--estimate` | Boolean | false | Show cost estimate only |
| `--resume[=X]` | Optional | - | Resume from phase |
| `--profile=X` | Value | standard | Profile (yolo, fast, standard, paranoid) |

## Phase Names for `--only`

- `precheck` → 0
- `requirements` → 1
- `architect` / `design` → 2
- `adversarial` → 3
- `planner` / `plan` → 4
- `drift` → 5
- `builder` / `build` → 6
- `qa` → 7,8,9,10
- `security` → 11

## Flag Behaviors

### `--dry-run`
Preview mode - shows what would happen without writing files:
```
Would create: src/api/users.ts
Would modify: src/routes/index.ts (+15 -3)
```

### `--fast`
Alias for `--profile=fast`. Skips QA phases 7-10 but keeps adversarial, drift, and security.

### `--fix`
On failure, auto-retry with fixes (max 3 attempts). Works with:
- Adversarial REVISE verdicts
- Test failures
- QA issues

### `--auto` / `--yolo`
Never pause, log warnings and continue. Security issues are logged but don't block.
Output includes: "⚠ AUTO MODE: X issues logged"

### `--quiet`
Single-line output for scripting:
```
✓ task · 3 files · $0.19
```

### `--preview`
After build, show `git diff` and prompt: "Apply changes? [y/n]"

### `--test`
After Phase 6 (Build), run tests:
- Detect test runner (npm test, bun test, etc.)
- HARD gate: tests must pass to continue

### `--branch[=name]`
Create feature branch before build:
- With value: `git checkout -b feature/name`
- Without value: auto-generate from task

### `--pr`
After success, create PR:
- Implies `--branch`
- Commits changes, pushes, creates PR via `gh pr create`

### `--template=name`
Use pre-configured template:
- Skip Phase 1 (Requirements)
- Available: `api-endpoint`, `auth-flow`, `crud-page`, `webhook`

### `--estimate`
Show cost estimate without running:
```
Estimated cost: $0.15-$0.25
```

### `--resume[=N]`
Resume incomplete session:
- Without value: continue from last completed phase
- With value: start from specific phase

## Examples

```bash
# Quick prototype with minimal checks
/auto-pipeline --yolo "add hello world endpoint"

# Full pipeline with tests
/auto-pipeline --test "add user authentication"

# Preview changes before applying
/auto-pipeline --preview --branch "refactor auth middleware"

# Create PR after completion
/auto-pipeline --pr "fix login validation bug"

# Use template for common patterns
/auto-pipeline --template=api-endpoint "users GET /api/users"

# Check cost before running
/auto-pipeline --estimate "implement payment processing"

# Fast mode skipping QA
/auto-pipeline --fast "add dashboard widget"
```

## Related Commands

- `/pipeline-undo` - Revert last pipeline run
- `/pipeline-history` - Show past runs with costs
- `/pipeline-estimate` - Standalone cost estimation
- `/pipeline-scan` - Proactive issue detection
