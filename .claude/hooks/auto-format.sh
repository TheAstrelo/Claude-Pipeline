#!/bin/bash
# PostToolUse(Edit|Write) hook: format a just-edited JS/TS file, but ONLY when
# the project actually uses Prettier. The previous version parsed stdin with
# jq (absent on stock Git-for-Windows) and ran `npx prettier` unconditionally,
# which downloads Prettier and reformats files even in projects that don't use
# it. This version uses node (ships with Claude Code) and no-ops unless a
# Prettier config or dependency is present.

INPUT=$(cat)

# Extract tool_input.file_path without jq. Any parse failure -> no-op (a
# formatter must never block or fail an edit).
FILE_PATH=$(printf '%s' "$INPUT" | node -e '
  let d = "";
  process.stdin.on("data", c => d += c);
  process.stdin.on("end", () => {
    try {
      const j = JSON.parse(d);
      process.stdout.write((j.tool_input && j.tool_input.file_path) || "");
    } catch { process.stdout.write(""); }
  });
' 2>/dev/null) || exit 0

[ -z "$FILE_PATH" ] && exit 0
case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) ;;
  *) exit 0 ;;
esac

# Walk up from the edited file to a project root; only format if that project
# declares Prettier (config file or a dependency). Never introduce Prettier
# into a project that hasn't opted in.
dir=$(cd "$(dirname "$FILE_PATH")" 2>/dev/null && pwd) || exit 0
uses_prettier=false
while [ -n "$dir" ]; do
  for cfg in .prettierrc .prettierrc.json .prettierrc.yaml .prettierrc.yml \
             .prettierrc.js .prettierrc.cjs prettier.config.js prettier.config.cjs; do
    [ -f "$dir/$cfg" ] && uses_prettier=true && break
  done
  if [ "$uses_prettier" != true ] && [ -f "$dir/package.json" ]; then
    if grep -q '"prettier"' "$dir/package.json" 2>/dev/null; then
      uses_prettier=true
    fi
    # package.json marks the project root; stop climbing here.
    break
  fi
  [ "$uses_prettier" = true ] && break
  parent=$(dirname "$dir")
  [ "$parent" = "$dir" ] && break
  dir="$parent"
done

if [ "$uses_prettier" = true ] && command -v npx >/dev/null 2>&1; then
  npx --no-install prettier --write "$FILE_PATH" >/dev/null 2>&1 || true
fi

exit 0
