#!/bin/bash
# Auto-formats TypeScript/JavaScript files after Claude edits them

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only format TS/JS/TSX/JSX files
if [[ "$FILE_PATH" =~ \.(ts|tsx|js|jsx)$ ]]; then
  if command -v npx &> /dev/null; then
    npx prettier --write "$FILE_PATH" 2>/dev/null
  fi
fi

exit 0
