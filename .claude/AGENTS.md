# AGENTS.md - Pipeline Learning Memory

> This file accumulates patterns and learnings across pipeline sessions.
> Auto-updated after each pipeline run.

## Patterns Discovered
<!-- Format: - YYYY-MM-DD: Pattern description (session: {id}) -->

## Common Failures & Fixes
<!-- Format: - Error pattern → Fix applied -->

## Project-Specific Rules Learned
<!-- Conventions discovered from codebase analysis -->

## Security Patterns
<!-- Recurring security issues and mitigations -->

---

## How This File Is Updated

After each successful pipeline run, the following learnings are automatically extracted and appended:

1. **Phase 3 (Adversarial Review)**: Issues that were raised and resolved during design revision
2. **Phase 6 (Build)**: Build failures that were encountered and fixed
3. **Phase 11 (Security)**: Security findings and their mitigations

The extraction happens in the post-run phase of `auto-pipeline.md`.

---

## Usage

This file is read by Phase 0 (Pre-Check) to provide historical context about:
- Patterns that have worked well in this project
- Common mistakes to avoid
- Security considerations specific to this codebase
- Project conventions learned from previous runs

---

*Last updated: Never (no pipeline runs yet)*
