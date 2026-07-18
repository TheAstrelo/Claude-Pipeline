# Pre-Check

Run: `/pre-check <task>`

$ARGUMENTS

---

Use the **pre-check** agent.

## Process

1. **Extract keywords** from task
   - Feature name (auth, payments, export)
   - Entity name (user, order, report)
   - Action verb (login, sync, generate)

2. **Search codebase**
   ```bash
   # Check each configured dir
   for dir in src/pages/api src/features src/lib src/domain; do
     grep -r "KEYWORD" "$dir" --include="*.ts" --include="*.tsx" | head -5
   done

   # Find similar files
   glob "src/**/*KEYWORD*.{ts,tsx}"
   ```

3. **Check dependencies**
   ```bash
   grep -i "KEYWORD" package.json
   ```

4. **Web search** (if no local match)
   - Max 3 searches
   - Query: "[keyword] [framework] library"

5. **Output recommendation**

---

## Output

Write to session `pre-check.md`:

```markdown
# Pre-Check: [Task]

## Confidence: [0-100]

## Codebase Matches

| Path | Match | Relevance |
|------|-------|-----------|
| src/pages/api/auth/login.ts | login handler | HIGH |

## Dependencies

| Package | Relevance |
|---------|-----------|
| next-auth | HIGH - auth framework |

## External Options

| Option | Fit |
|--------|-----|
| clerk | Good - managed auth |

## Recommendation: [EXTEND_EXISTING | USE_LIBRARY | BUILD_NEW]

**Reasoning:** [1 sentence]

**Next step:** [What to pass to Phase 1]
```

---

## Decision Logic

```
IF high_relevance_match in codebase:
  → EXTEND_EXISTING
ELSE IF suitable_library in package.json OR popular_library found:
  → USE_LIBRARY
ELSE:
  → BUILD_NEW
```

---

## Tip

Run this before any "make me a..." request to avoid duplicate work.
