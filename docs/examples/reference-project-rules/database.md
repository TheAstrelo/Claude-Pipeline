# Database Rules

## Connection
- Always import: `import pool from '@infrastructure/database/connection'`
- Use `pool.query()` with parameterized queries — never string interpolation for SQL
- Multi-tenant: almost every query should filter by `user_id`

## SQL Aliases
- NEVER use `do` as a SQL alias — it's a PostgreSQL reserved keyword
- Use `d` for deal_outcomes, `c` for companies/contacts, `f` for fit scores, `i` for intent scores

## Key Tables & Columns
- `contacts.seniority_level` — values: 'C-Suite', 'VP', 'Director', 'Manager', 'IC'
- `deal_outcomes` — has `deal_value`, `outcome` ('won'|'lost'|'stalled'|'open'), `pipeline_stage`
- `ml_fit_scores` and `ml_intent_scores` join on `company_id` + `user_id`
- Numeric scores: always use `parseFloat(String(value)).toFixed(1)`

## Migrations
- Files live in `src/infrastructure/database/migrations/`
- 105 migration files total (IDs 103-240), highest ID is **240**
- 200-205 are DESTRUCTIVE (consolidation) — never touch these
- 206+ are SAFE (additive only) — always use `IF NOT EXISTS` / `IF EXISTS`
- Register new migrations in `scripts/migrate.js` SAFE_MIGRATIONS array
- Known duplicate IDs: **116, 133, 134, 151, 152, 233, 234, 235** — always check the highest ID before creating new ones
- Use `TIMESTAMPTZ` not `TIMESTAMP`, `gen_random_uuid()` for UUIDs
