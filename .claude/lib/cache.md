# Artifact Caching

## Overview

Cache artifacts to avoid redundant work. Focus on high-value, stable items.

## Directory Structure

```
.claude/
├── cache/
│   ├── manifest.json          # Cache index
│   ├── security/              # Security scan results by lockfile hash
│   │   └── {hash}.json
│   ├── patterns/              # Design pattern snippets
│   │   └── {pattern_name}.md
│   └── qa-rules/              # Pre-computed QA rules
│       └── {framework}.json
└── hooks/
    └── cache.sh               # Cache operations script
```

## What We Cache

### 1. Security Scans (Highest Value)

**Key:** SHA256 of `package-lock.json` (or yarn.lock, pnpm-lock.yaml)
**TTL:** Until lockfile changes
**Saves:** ~3000 tokens per run

```json
{
  "key": "sec_a1b2c3d4",
  "lockfile_hash": "sha256:...",
  "created": "2024-01-15T10:30:00Z",
  "findings": {
    "vulnerable_packages": [],
    "outdated_critical": ["lodash@4.17.20"],
    "audit_passed": true
  }
}
```

### 2. QA Rules (Medium Value)

**Key:** Framework name (nextjs, react, express)
**TTL:** Never (manual update)
**Saves:** ~1000 tokens per run

Pre-computed lint rules, type patterns, convention checks per framework.

### 3. Design Patterns (Lower Value)

**Key:** Pattern name (rest-api, auth-jwt, crud-endpoint)
**TTL:** Never (manual update)
**Saves:** ~1500 tokens when pattern matches

Common architectural patterns with pre-written decisions.

## Cache Keys

| Type | Key Formula | Example |
|------|-------------|---------|
| Security | `sec_` + sha256(lockfile)[:8] | `sec_a1b2c3d4` |
| QA Rules | `qa_` + framework | `qa_nextjs` |
| Pattern | `pat_` + pattern_name | `pat_rest-api` |

## Implementation

### manifest.json

```json
{
  "version": 1,
  "created": "2024-01-15T10:00:00Z",
  "entries": {
    "sec_a1b2c3d4": {
      "type": "security",
      "created": "2024-01-15T10:30:00Z",
      "hits": 5,
      "size_bytes": 1240,
      "artifact": "security/a1b2c3d4.json",
      "deps": {
        "lockfile": "package-lock.json",
        "hash": "sha256:abc123..."
      }
    }
  },
  "stats": {
    "total_hits": 23,
    "tokens_saved_estimate": 69000
  }
}
```

## Cache Operations

### Check Cache

```bash
# Check if security cache is valid
cache_check security

# Returns: HIT (with artifact path) or MISS
```

### Save to Cache

```bash
# Save security scan results
cache_save security "$SESSION/security-scan.json"
```

### Invalidate

```bash
# Invalidate security cache (lockfile changed)
cache_invalidate security

# Clear all
cache_clear
```

## Integration Points

### Phase 0 (Pre-Check)
- Check `patterns/` for matching design patterns
- If found, include in context for Phase 2

### Phase 11 (Security)
- Check `security/` by lockfile hash
- If HIT: skip scan, use cached findings
- If MISS: run scan, save to cache

### QA Phases (7-10)
- Load `qa-rules/{framework}.json` once
- Reuse across all QA phases in session

## Token Savings Estimate

| Scenario | Without Cache | With Cache | Savings |
|----------|---------------|------------|---------|
| First run | 42k tokens | 42k tokens | 0% |
| Second run (same deps) | 42k tokens | 39k tokens | 7% |
| Fifth run (same deps) | 42k tokens | 36k tokens | 14% |
| With pattern match | 42k tokens | 34k tokens | 19% |

**Compound effect:** After 10 similar runs, cache saves ~40k tokens total.

## Commands

```bash
/cache-stats          # Show cache statistics
/cache-clear          # Clear all cache
/cache-clear security # Clear security cache only
/cache-warm           # Pre-populate common patterns
```
