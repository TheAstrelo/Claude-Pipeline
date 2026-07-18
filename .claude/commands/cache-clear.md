# Cache Clear

Clear pipeline cache.

$ARGUMENTS

## Usage

```bash
# Clear all cache
bash "$CLAUDE_PROJECT_DIR/.claude/hooks/cache.sh" clear

# Clear specific type
bash "$CLAUDE_PROJECT_DIR/.claude/hooks/cache.sh" clear security
bash "$CLAUDE_PROJECT_DIR/.claude/hooks/cache.sh" clear patterns
bash "$CLAUDE_PROJECT_DIR/.claude/hooks/cache.sh" clear qa-rules
```

## When to Clear

- **Security**: After updating dependencies (lockfile changed)
- **Patterns**: When you want fresh design suggestions
- **QA rules**: After changing project conventions
- **All**: When cache seems stale or corrupted

## Related Commands

- `/cache-stats` — View cache statistics
