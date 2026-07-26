---
name: new-migration
description: Create a new database migration file with the correct next ID, preventing duplicates
argument-hint: <description> (e.g. add_status_to_contacts)
---

Create a new database migration SQL file. Follow these steps exactly:

## Step 1: Find the next migration ID

Read the current migration files in `src/infrastructure/database/migrations/` and find the highest numbered migration file. The new migration ID is that number + 1.

**Known duplicate IDs:** Migrations 116 and 133 have duplicates — be aware of this but it only matters if creating migrations in that range (you won't be).

## Step 2: Create the migration file

Create: `src/infrastructure/database/migrations/<ID>_$ARGUMENTS.sql`

Example: If the highest migration is `226_add_user_quota.sql` and the user wants "add_status_to_contacts", create `227_add_status_to_contacts.sql`.

## Step 3: Write safe, idempotent SQL

All migrations 206+ MUST be safe and idempotent. Use these patterns:

```sql
-- For new tables:
CREATE TABLE IF NOT EXISTS table_name (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- For new columns:
ALTER TABLE table_name ADD COLUMN IF NOT EXISTS column_name VARCHAR(100);

-- For indexes:
CREATE INDEX IF NOT EXISTS idx_table_column ON table_name(column_name);

-- For constraints:
DO $$ BEGIN
  ALTER TABLE table_name ADD CONSTRAINT constraint_name UNIQUE (col1, col2);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

## Step 4: Register in migrate.js

Open `scripts/migrate.js` and add the new migration filename to the `SAFE_MIGRATIONS` array at the end.

## Rules
- NEVER create destructive migrations (DROP TABLE, DROP COLUMN)
- Always use `IF NOT EXISTS` / `IF EXISTS` for idempotency
- Always include `user_id` references where applicable (multi-tenant)
- Use `TIMESTAMPTZ` for timestamps, not `TIMESTAMP`
- Use `gen_random_uuid()` for UUID defaults
- Use `ON DELETE CASCADE` for foreign keys to `users(id)`
