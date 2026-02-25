# Cache Warm

Pre-populate cache with common patterns and rules.

## Process

1. Initialize cache directory
2. Detect project framework (Next.js, React, Express, etc.)
3. Load appropriate QA rules
4. Cache common design patterns

```bash
# Initialize cache
bash "$CLAUDE_PROJECT_DIR/.claude/hooks/cache.sh" init
```

## Auto-Detected Patterns

Check `package.json` for framework:

```bash
FRAMEWORK="unknown"

if grep -q '"next":' package.json 2>/dev/null; then
  FRAMEWORK="nextjs"
elif grep -q '"express":' package.json 2>/dev/null; then
  FRAMEWORK="express"
elif grep -q '"react":' package.json 2>/dev/null; then
  FRAMEWORK="react"
fi

echo "Detected framework: $FRAMEWORK"
```

## Pre-Cached Patterns

After running `/cache-warm`, these patterns are available:

| Pattern | Description |
|---------|-------------|
| `rest-api` | REST endpoint with auth, validation, error handling |
| `auth-jwt` | JWT authentication flow |
| `crud-endpoint` | Create/Read/Update/Delete operations |
| `react-form` | Form with validation and submission |
| `db-migration` | Database migration pattern |

## Usage

Run once when starting a new project:

```
/cache-warm
```

Then run `/cache-stats` to verify.

## Related Commands

- `/cache-stats` — View what's cached
- `/cache-clear` — Clear cache
