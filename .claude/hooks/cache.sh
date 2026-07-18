#!/bin/bash
# Cache operations for Claude Pipeline
# Usage: cache.sh <command> [args]

set -e

CACHE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/cache"
MANIFEST="$CACHE_DIR/manifest.json"

# Initialize cache directory
init_cache() {
  mkdir -p "$CACHE_DIR/security"
  mkdir -p "$CACHE_DIR/patterns"
  mkdir -p "$CACHE_DIR/qa-rules"

  if [ ! -f "$MANIFEST" ]; then
    cat > "$MANIFEST" << 'EOF'
{
  "version": 1,
  "created": "",
  "entries": {},
  "stats": {
    "total_hits": 0,
    "tokens_saved_estimate": 0
  }
}
EOF
    # Set created timestamp
    local now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    if command -v jq &> /dev/null; then
      jq --arg now "$now" '.created = $now' "$MANIFEST" > "$MANIFEST.tmp" && mv "$MANIFEST.tmp" "$MANIFEST"
    fi
  fi
}

# Get lockfile hash for security cache key
get_lockfile_hash() {
  local lockfile=""

  if [ -f "package-lock.json" ]; then
    lockfile="package-lock.json"
  elif [ -f "yarn.lock" ]; then
    lockfile="yarn.lock"
  elif [ -f "pnpm-lock.yaml" ]; then
    lockfile="pnpm-lock.yaml"
  else
    echo "none"
    return
  fi

  # Get first 8 chars of SHA256
  if command -v sha256sum &> /dev/null; then
    sha256sum "$lockfile" | cut -c1-8
  elif command -v shasum &> /dev/null; then
    shasum -a 256 "$lockfile" | cut -c1-8
  else
    echo "nohash"
  fi
}

# Check cache for a given type
cache_check() {
  local cache_type="$1"

  init_cache

  case "$cache_type" in
    security)
      local hash=$(get_lockfile_hash)
      local key="sec_${hash}"
      local artifact="$CACHE_DIR/security/${hash}.json"

      if [ -f "$artifact" ]; then
        # Update hit count
        if command -v jq &> /dev/null; then
          jq --arg key "$key" '.entries[$key].hits += 1 | .stats.total_hits += 1 | .stats.tokens_saved_estimate += 3000' "$MANIFEST" > "$MANIFEST.tmp" && mv "$MANIFEST.tmp" "$MANIFEST"
        fi
        echo "HIT:$artifact"
        return 0
      else
        echo "MISS"
        return 1
      fi
      ;;

    patterns)
      local pattern_name="$2"
      local artifact="$CACHE_DIR/patterns/${pattern_name}.md"

      if [ -f "$artifact" ]; then
        if command -v jq &> /dev/null; then
          jq '.stats.total_hits += 1 | .stats.tokens_saved_estimate += 1500' "$MANIFEST" > "$MANIFEST.tmp" && mv "$MANIFEST.tmp" "$MANIFEST"
        fi
        echo "HIT:$artifact"
        return 0
      else
        echo "MISS"
        return 1
      fi
      ;;

    qa-rules)
      local framework="$2"
      local artifact="$CACHE_DIR/qa-rules/${framework}.json"

      if [ -f "$artifact" ]; then
        if command -v jq &> /dev/null; then
          jq '.stats.total_hits += 1 | .stats.tokens_saved_estimate += 1000' "$MANIFEST" > "$MANIFEST.tmp" && mv "$MANIFEST.tmp" "$MANIFEST"
        fi
        echo "HIT:$artifact"
        return 0
      else
        echo "MISS"
        return 1
      fi
      ;;

    *)
      echo "Unknown cache type: $cache_type"
      return 1
      ;;
  esac
}

# Save to cache
cache_save() {
  local cache_type="$1"
  local source_file="$2"

  init_cache

  case "$cache_type" in
    security)
      local hash=$(get_lockfile_hash)
      local key="sec_${hash}"
      local artifact="$CACHE_DIR/security/${hash}.json"

      cp "$source_file" "$artifact"

      # Update manifest
      if command -v jq &> /dev/null; then
        local now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        local size=$(wc -c < "$artifact")
        jq --arg key "$key" \
           --arg now "$now" \
           --arg artifact "security/${hash}.json" \
           --argjson size "$size" \
           --arg hash "$hash" \
           '.entries[$key] = {
             "type": "security",
             "created": $now,
             "hits": 0,
             "size_bytes": $size,
             "artifact": $artifact,
             "deps": {"lockfile_hash": $hash}
           }' "$MANIFEST" > "$MANIFEST.tmp" && mv "$MANIFEST.tmp" "$MANIFEST"
      fi

      echo "SAVED:$artifact"
      ;;

    patterns)
      local pattern_name="$2"
      local source_file="$3"
      local artifact="$CACHE_DIR/patterns/${pattern_name}.md"

      cp "$source_file" "$artifact"
      echo "SAVED:$artifact"
      ;;

    qa-rules)
      local framework="$2"
      local source_file="$3"
      local artifact="$CACHE_DIR/qa-rules/${framework}.json"

      cp "$source_file" "$artifact"
      echo "SAVED:$artifact"
      ;;
  esac
}

# Clear cache
cache_clear() {
  local cache_type="$1"

  if [ -z "$cache_type" ] || [ "$cache_type" = "all" ]; then
    rm -rf "$CACHE_DIR/security/"*
    rm -rf "$CACHE_DIR/patterns/"*
    rm -rf "$CACHE_DIR/qa-rules/"*

    # Reset manifest
    if command -v jq &> /dev/null; then
      jq '.entries = {} | .stats.total_hits = 0 | .stats.tokens_saved_estimate = 0' "$MANIFEST" > "$MANIFEST.tmp" && mv "$MANIFEST.tmp" "$MANIFEST"
    fi

    echo "Cleared all cache"
  else
    rm -rf "$CACHE_DIR/${cache_type}/"*

    # Remove entries of this type from manifest
    if command -v jq &> /dev/null; then
      jq --arg type "$cache_type" 'del(.entries[] | select(.type == $type))' "$MANIFEST" > "$MANIFEST.tmp" && mv "$MANIFEST.tmp" "$MANIFEST"
    fi

    echo "Cleared $cache_type cache"
  fi
}

# Show cache stats
cache_stats() {
  init_cache

  local security_count=$(ls -1 "$CACHE_DIR/security/" 2>/dev/null | wc -l)
  local patterns_count=$(ls -1 "$CACHE_DIR/patterns/" 2>/dev/null | wc -l)
  local qa_count=$(ls -1 "$CACHE_DIR/qa-rules/" 2>/dev/null | wc -l)

  local total_hits=0
  local tokens_saved=0

  if command -v jq &> /dev/null && [ -f "$MANIFEST" ]; then
    total_hits=$(jq -r '.stats.total_hits // 0' "$MANIFEST")
    tokens_saved=$(jq -r '.stats.tokens_saved_estimate // 0' "$MANIFEST")
  fi

  cat << EOF
Cache Statistics
================
Security scans:  $security_count cached
Design patterns: $patterns_count cached
QA rules:        $qa_count cached

Total hits:      $total_hits
Tokens saved:    ~$tokens_saved (estimate)

Location: $CACHE_DIR
EOF
}

# Main command router
case "${1:-}" in
  check)
    cache_check "$2" "$3"
    ;;
  save)
    cache_save "$2" "$3" "$4"
    ;;
  clear)
    cache_clear "$2"
    ;;
  stats)
    cache_stats
    ;;
  init)
    init_cache
    echo "Cache initialized at $CACHE_DIR"
    ;;
  *)
    echo "Usage: cache.sh <command> [args]"
    echo ""
    echo "Commands:"
    echo "  init                    Initialize cache directory"
    echo "  check <type> [name]     Check if cached (security|patterns|qa-rules)"
    echo "  save <type> <file>      Save to cache"
    echo "  clear [type]            Clear cache (all if no type specified)"
    echo "  stats                   Show cache statistics"
    exit 1
    ;;
esac
