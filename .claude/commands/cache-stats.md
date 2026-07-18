# Cache Stats

Show pipeline cache statistics.

```bash
bash "$CLAUDE_PROJECT_DIR/.claude/hooks/cache.sh" stats
```

## Output Explanation

- **Security scans**: Cached npm audit / dependency checks (keyed by lockfile hash)
- **Design patterns**: Reusable architectural patterns (rest-api, auth-jwt, etc.)
- **QA rules**: Framework-specific lint and convention rules

## Token Savings

Each cache hit saves:
- Security: ~3000 tokens
- Patterns: ~1500 tokens
- QA rules: ~1000 tokens

## Related Commands

- `/cache-clear` — Clear all or specific cache
- `/cache-warm` — Pre-populate common patterns
