#!/bin/bash
# Project detection script for Auto Pipeline
# Outputs JSON with detected project configuration

OUTPUT_FILE="${1:-.pipeline/project-config.json}"

# Initialize defaults
PROJECT_TYPE="unknown"
FRAMEWORK=""
TEST_COMMAND=""
BUILD_COMMAND=""
LINT_COMMAND=""
SEARCH_DIRS=""
LANGUAGE="unknown"

# Check for package.json (Node.js projects)
if [ -f "package.json" ]; then
    LANGUAGE="javascript"

    # Check for TypeScript
    if [ -f "tsconfig.json" ]; then
        LANGUAGE="typescript"
    fi

    # Detect framework from dependencies
    if grep -qE '"next"[[:space:]]*:' package.json 2>/dev/null; then
        PROJECT_TYPE="nextjs"
        FRAMEWORK="next"
        SEARCH_DIRS="src,app,pages,components,lib"
        BUILD_COMMAND="npm run build"
    elif grep -qE '"react"[[:space:]]*:' package.json 2>/dev/null; then
        if grep -qE '"vite"[[:space:]]*:' package.json 2>/dev/null; then
            PROJECT_TYPE="react-vite"
            FRAMEWORK="vite"
        else
            PROJECT_TYPE="react"
            FRAMEWORK="react"
        fi
        SEARCH_DIRS="src,components,lib"
        BUILD_COMMAND="npm run build"
    elif grep -qE '"vue"[[:space:]]*:' package.json 2>/dev/null; then
        PROJECT_TYPE="vue"
        FRAMEWORK="vue"
        SEARCH_DIRS="src,components"
        BUILD_COMMAND="npm run build"
    elif grep -qE '"express"[[:space:]]*:' package.json 2>/dev/null; then
        PROJECT_TYPE="express"
        FRAMEWORK="express"
        SEARCH_DIRS="src,routes,controllers,middleware"
    elif grep -qE '"hono"[[:space:]]*:' package.json 2>/dev/null; then
        PROJECT_TYPE="hono"
        FRAMEWORK="hono"
        SEARCH_DIRS="src,routes,handlers"
    elif grep -qE '"fastify"[[:space:]]*:' package.json 2>/dev/null; then
        PROJECT_TYPE="fastify"
        FRAMEWORK="fastify"
        SEARCH_DIRS="src,routes,plugins"
    elif grep -qE '"@nestjs/core"[[:space:]]*:' package.json 2>/dev/null; then
        PROJECT_TYPE="nestjs"
        FRAMEWORK="nestjs"
        SEARCH_DIRS="src,modules,controllers,services"
    fi

    # Detect test runner
    if grep -qE '"vitest"[[:space:]]*:' package.json 2>/dev/null; then
        TEST_COMMAND="npm run test"
    elif grep -qE '"jest"[[:space:]]*:' package.json 2>/dev/null; then
        TEST_COMMAND="npm test"
    elif grep -qE '"mocha"[[:space:]]*:' package.json 2>/dev/null; then
        TEST_COMMAND="npm test"
    fi

    # Detect if using bun
    if [ -f "bun.lockb" ]; then
        TEST_COMMAND="${TEST_COMMAND/npm/bun}"
        BUILD_COMMAND="${BUILD_COMMAND/npm/bun}"
    fi

    # Detect linter
    if grep -qE '"eslint"[[:space:]]*:' package.json 2>/dev/null; then
        LINT_COMMAND="npm run lint"
    elif grep -qE '"biome"[[:space:]]*:' package.json 2>/dev/null; then
        LINT_COMMAND="npx biome check"
    fi
fi

# Check for Python projects
if [ -f "pyproject.toml" ] || [ -f "setup.py" ] || [ -f "requirements.txt" ]; then
    LANGUAGE="python"
    PROJECT_TYPE="python"
    SEARCH_DIRS="src,app,tests"

    if [ -f "pyproject.toml" ]; then
        if grep -q 'fastapi' pyproject.toml 2>/dev/null; then
            FRAMEWORK="fastapi"
            PROJECT_TYPE="fastapi"
        elif grep -q 'django' pyproject.toml 2>/dev/null; then
            FRAMEWORK="django"
            PROJECT_TYPE="django"
        elif grep -q 'flask' pyproject.toml 2>/dev/null; then
            FRAMEWORK="flask"
            PROJECT_TYPE="flask"
        fi

        if grep -q 'pytest' pyproject.toml 2>/dev/null; then
            TEST_COMMAND="pytest"
        fi
    fi

    # Projects without pyproject: pytest.ini, setup.cfg, or a requirements file
    # that lists pytest are the usual signals.
    if [ -z "$TEST_COMMAND" ]; then
        if [ -f "pytest.ini" ] || grep -qE '^\[tool:pytest\]' setup.cfg 2>/dev/null ||
           grep -qsiE '^pytest([=<>~! ]|$)' requirements*.txt 2>/dev/null; then
            TEST_COMMAND="pytest"
        fi
    fi
fi

# Check for Go projects
if [ -f "go.mod" ]; then
    LANGUAGE="go"
    PROJECT_TYPE="go"
    SEARCH_DIRS="cmd,internal,pkg"
    TEST_COMMAND="go test ./..."
    BUILD_COMMAND="go build ./..."
fi

# Check for Rust projects
if [ -f "Cargo.toml" ]; then
    LANGUAGE="rust"
    PROJECT_TYPE="rust"
    SEARCH_DIRS="src"
    TEST_COMMAND="cargo test"
    BUILD_COMMAND="cargo build"
fi

# Output JSON configuration
cat > "$OUTPUT_FILE" << EOF
{
  "projectType": "$PROJECT_TYPE",
  "framework": "$FRAMEWORK",
  "language": "$LANGUAGE",
  "commands": {
    "test": "$TEST_COMMAND",
    "build": "$BUILD_COMMAND",
    "lint": "$LINT_COMMAND"
  },
  "searchDirectories": "$SEARCH_DIRS"
}
EOF

echo "Project detected: $PROJECT_TYPE ($FRAMEWORK)"
