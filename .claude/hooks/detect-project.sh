#!/bin/bash
# Project detection script for Auto Pipeline
# Outputs JSON with detected project configuration

OUTPUT_FILE="${1:-.claude/artifacts/project-config.json}"

# Initialize defaults
PROJECT_TYPE="unknown"
FRAMEWORK=""
TEST_COMMAND=""
BUILD_COMMAND=""
LINT_COMMAND=""
SEARCH_DIRS=""
LANGUAGE="javascript"

# Check for package.json (Node.js projects)
if [ -f "package.json" ]; then
    LANGUAGE="javascript"

    # Check for TypeScript
    if [ -f "tsconfig.json" ]; then
        LANGUAGE="typescript"
    fi

    # Detect framework from dependencies
    if grep -q '"next"' package.json 2>/dev/null; then
        PROJECT_TYPE="nextjs"
        FRAMEWORK="next"
        SEARCH_DIRS="src,app,pages,components,lib"
        BUILD_COMMAND="npm run build"
    elif grep -q '"react"' package.json 2>/dev/null; then
        if grep -q '"vite"' package.json 2>/dev/null; then
            PROJECT_TYPE="react-vite"
            FRAMEWORK="vite"
        else
            PROJECT_TYPE="react"
            FRAMEWORK="react"
        fi
        SEARCH_DIRS="src,components,lib"
        BUILD_COMMAND="npm run build"
    elif grep -q '"vue"' package.json 2>/dev/null; then
        PROJECT_TYPE="vue"
        FRAMEWORK="vue"
        SEARCH_DIRS="src,components"
        BUILD_COMMAND="npm run build"
    elif grep -q '"express"' package.json 2>/dev/null; then
        PROJECT_TYPE="express"
        FRAMEWORK="express"
        SEARCH_DIRS="src,routes,controllers,middleware"
    elif grep -q '"hono"' package.json 2>/dev/null; then
        PROJECT_TYPE="hono"
        FRAMEWORK="hono"
        SEARCH_DIRS="src,routes,handlers"
    elif grep -q '"fastify"' package.json 2>/dev/null; then
        PROJECT_TYPE="fastify"
        FRAMEWORK="fastify"
        SEARCH_DIRS="src,routes,plugins"
    elif grep -q '"@nestjs/core"' package.json 2>/dev/null; then
        PROJECT_TYPE="nestjs"
        FRAMEWORK="nestjs"
        SEARCH_DIRS="src,modules,controllers,services"
    fi

    # Detect test runner
    if grep -q '"vitest"' package.json 2>/dev/null; then
        TEST_COMMAND="npm run test"
    elif grep -q '"jest"' package.json 2>/dev/null; then
        TEST_COMMAND="npm test"
    elif grep -q '"mocha"' package.json 2>/dev/null; then
        TEST_COMMAND="npm test"
    fi

    # Detect if using bun
    if [ -f "bun.lockb" ]; then
        TEST_COMMAND="${TEST_COMMAND/npm/bun}"
        BUILD_COMMAND="${BUILD_COMMAND/npm/bun}"
    fi

    # Detect linter
    if grep -q '"eslint"' package.json 2>/dev/null; then
        LINT_COMMAND="npm run lint"
    elif grep -q '"biome"' package.json 2>/dev/null; then
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
  "searchDirectories": "$SEARCH_DIRS",
  "detectedAt": "$(date -Iseconds 2>/dev/null || date)"
}
EOF

echo "Project detected: $PROJECT_TYPE ($FRAMEWORK)"
