Accessibility audit - WCAG 2.1 AA compliance check on UI changes.

---

## Purpose

Check changed UI files (.tsx) for accessibility issues:
- Missing alt text on images
- Click handlers without keyboard equivalents
- Missing ARIA labels on interactive elements
- Hardcoded colors bypassing theme tokens
- Form inputs without associated labels
- Semantic HTML misuse (div as button)

Skips entirely if no .tsx files were changed.

---

## Execution

Use the **accessibility-auditor** agent.

**Input:** Read `build-report.md` to identify changed .tsx files.

**Process:**

1. Check if any .tsx files were changed — skip if none
2. Scan for missing alt text
3. Scan for click handlers without keyboard access
4. Check ARIA labels on interactive elements
5. Check for hardcoded colors
6. Check form inputs for labels
7. Check semantic HTML usage
8. Append results to `qa-report.md`

---

## Output

After auditing, report:

```
## Accessibility Check Complete

**Verdict:** [PASS | WARN | FAIL]
**Standard:** WCAG 2.1 Level AA

### Findings
- Alt Text: [OK/ISSUES]
- Keyboard Nav: [OK/ISSUES]
- ARIA: [OK/ISSUES]
- Contrast: [OK/ISSUES]
- Forms: [OK/ISSUES]
- Semantics: [OK/ISSUES]

### Required Fixes
[If FAIL, specific fixes with WCAG criteria references]
```

---

## Verdict Levels

- **PASS:** All checks clear, or no UI changes
- **WARN:** Minor issues (hardcoded colors, non-critical ARIA)
- **FAIL:** Interactive element has no keyboard access, missing form labels, missing alt text

---

## Gate

This command runs as part of the QA pipeline, after Performance Check.
Order: `/perf-check` → `/a11y-check` → `/security-review`
