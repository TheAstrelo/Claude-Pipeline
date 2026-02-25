# Artifact Caching

## Cache Structure

```
.claude/
├── cache/
│   ├── manifest.json      # Cache index
│   ├── designs/           # Reusable design patterns
│   ├── security/          # Security scan results
│   └── templates/         # Scaffolding templates
└── artifacts/
    └── {session}/         # Per-run artifacts (not cached)
```

## Manifest Schema

```json
{
  "version": 1,
  "entries": {
    "{cache_key}": {
      "type": "design|security|template",
      "created": "ISO8601",
      "hits": 0,
      "deps": ["file:path:hash", "pkg:name:version"],
      "artifact": "relative/path"
    }
  }
}
```

## Cache Keys

| Type | Key Formula | Invalidates When |
|------|-------------|------------------|
| Design | `sha256(requirements + tech_stack)` | Requirements change |
| Security | `sha256(lockfile + changed_files)` | Dependencies update |
| Template | `sha256(scaffold_type + framework)` | Never (manual clear) |

## Cache Logic (Pseudocode)

```python
def check_cache(phase, inputs):
    key = compute_key(phase, inputs)
    entry = manifest.get(key)

    if not entry:
        return None

    # Validate deps still match
    for dep in entry.deps:
        if dep.type == "file" and hash(dep.path) != dep.hash:
            invalidate(key)
            return None
        if dep.type == "pkg" and version(dep.name) != dep.version:
            invalidate(key)
            return None

    entry.hits += 1
    return load_artifact(entry.artifact)

def save_cache(phase, inputs, artifact):
    key = compute_key(phase, inputs)
    deps = extract_deps(phase, inputs)

    manifest[key] = {
        "type": phase_type(phase),
        "created": now(),
        "hits": 0,
        "deps": deps,
        "artifact": save_artifact(artifact)
    }
```

## What to Cache

| Cacheable | Not Cacheable |
|-----------|---------------|
| Security rules for unchanged deps | Requirements (unique per task) |
| Common design patterns | Adversarial critique |
| Scaffold templates | Build results |
| QA rule definitions | Drift reports |

## Commands

```bash
# View cache stats
/cache-stats

# Clear all cache
/cache-clear

# Clear specific type
/cache-clear --type=security
```

## Token Savings

Caching reduces tokens by:
1. Skipping redundant security scans (~2000 tokens/scan)
2. Reusing design pattern templates (~1500 tokens)
3. Pre-loading common QA rules (~1000 tokens)

Estimated savings: **15-30%** on repeated similar tasks.
