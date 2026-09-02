# Reference-Project Convention Rules (example, not universal)

These three files (`api.md`, `database.md`, `react.md`) are the coding
conventions of **one specific application** the pipeline was originally
extracted from — a Next.js + PostgreSQL SaaS. They are kept here as a
**worked example** of what project-convention rules look like, NOT as
guidance for your project.

They contain that project's specifics — a `deal_outcomes` table, `ml_fit_scores`,
`@infrastructure/auth/middleware` imports, MUI Grid v2, a migration-ID scheme,
and so on. **None of it applies to a different codebase**, and the pipeline
engine (`run-pipeline.sh`) does not read these files at all.

They used to live in `.claude/rules/`, where Claude Code loads every `*.md`
as project instructions — which meant copying `.claude/` into any project
silently injected this app's database schema and API conventions. They were
moved here so that no longer happens.

## Writing your own

To give the pipeline your project's conventions, create your own
`.claude/rules/*.md` files describing YOUR stack, tables, and patterns. Use
these three as a shape to imitate — replace every specific with your own.
Only `.claude/rules/review-precedents.md` is engine-read (it accumulates
findings you mark as false positives; see the Milestone 3 notes in
`docs/archive/IMPLEMENTATION-PLAN.md`).
