#!/bin/bash
# PreToolUse(Edit|Write) hook: blocks edits to sensitive files.
#   exit 2 = block the tool action (reason goes to stderr, shown to Claude)
#   exit 0 = allow
#
# Fails CLOSED: if the hook payload cannot be parsed, the edit is BLOCKED.
# The previous version parsed stdin with `jq`, which is absent on stock
# Git-for-Windows, so it fell through to `exit 0` and silently ALLOWED edits
# to .env, .git/, package-lock.json, etc. This version uses node (which ships
# with Claude Code) and denies on any parse failure.

INPUT=$(cat)

# Extract tool_input.file_path without jq.
FILE_PATH=$(printf '%s' "$INPUT" | node -e '
  let d = "";
  process.stdin.on("data", c => d += c);
  process.stdin.on("end", () => {
    try {
      const j = JSON.parse(d);
      process.stdout.write((j.tool_input && j.tool_input.file_path) || "");
    } catch (e) { process.exit(3); }   // parse failure -> caller fails closed
  });
') || {
  echo "BLOCKED: could not parse hook input (node missing or bad JSON); failing closed." >&2
  exit 2
}

# No file_path on this tool call -> nothing to protect.
[ -z "$FILE_PATH" ] && exit 0

# Normalize Windows backslashes so C:\proj\.git\config and proj/.git/config match.
NORM=$(printf '%s' "$FILE_PATH" | tr '\\' '/')

# Allow explicit template/example files first (docs/.env.example, .env.dist, ...).
case "$NORM" in
  *.example|*.example.*|*.sample|*.sample.*|*.dist) exit 0 ;;
esac

# Protected patterns, matched on path segments / suffixes — NOT bare substrings,
# so src/my.envelope.ts is not mistaken for a .env file.
BLOCK=""
case "$NORM" in
  .env|*/.env)                                   BLOCK=".env" ;;
  .env.*|*/.env.*)                               BLOCK=".env.* file" ;;
  package-lock.json|*/package-lock.json)         BLOCK="package-lock.json" ;;
  .git/*|*/.git/*)                               BLOCK=".git internals" ;;
  amplify.yml|*/amplify.yml)                     BLOCK="amplify.yml" ;;
  .claude/settings.json|*/.claude/settings.json) BLOCK=".claude/settings.json" ;;
esac

if [ -n "$BLOCK" ]; then
  echo "BLOCKED: refusing to edit protected file ($BLOCK): $FILE_PATH" >&2
  echo "If you need to modify this file, ask the user to do it directly." >&2
  exit 2
fi

exit 0
