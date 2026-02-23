#!/bin/bash
# Blocks edits to sensitive files
# Exit code 2 = block the tool action

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Protected file patterns
PROTECTED_PATTERNS=(
  ".env"
  ".env.local"
  ".env.production"
  "package-lock.json"
  ".git/"
  "amplify.yml"
)

for pattern in "${PROTECTED_PATTERNS[@]}"; do
  if [[ "$FILE_PATH" == *"$pattern"* ]]; then
    echo "BLOCKED: Cannot edit protected file: $FILE_PATH" >&2
    echo "If you need to modify this file, ask the user for explicit permission." >&2
    exit 2
  fi
done

exit 0
