Generate changelog - auto-generate release notes from build artifacts.

---

## Purpose

Produce user-facing and developer-facing changelog entries from:
- `brief.md` (problem statement)
- `build-report.md` (what was built)
- `design.md` (technical context)
- Git commit history

---

## Execution

Use the **changelog-generator** agent.

**Input:** Read `brief.md`, `build-report.md`, `design.md`, and git log.

**Process:**

1. Read brief.md for problem statement and success criteria
2. Read build-report.md for what was actually built
3. Read design.md for technical context
4. Run git log for commit messages
5. Categorize changes: Feature / Enhancement / Fix / Internal
6. Write user-facing AND developer-facing notes
7. Write to `changelog.md`

---

## Output

After generating, report:

```
## Changelog Generated

### User-Facing Changes
- [N] new features
- [N] improvements
- [N] bug fixes

### Developer Notes
- [N] technical changes
- [N] new API endpoints
- [N] database changes

### Migration Notes
[Any deploy steps required]
```

---

## Notes

- This command never blocks the pipeline — informational only
- User-facing notes are non-technical (no file paths or code)
- Developer notes are precise (include file paths and API details)

---

## Gate

This command runs as the final pipeline phase, after Rollback Plan.
Order: `/rollback-plan` → `/changelog`
