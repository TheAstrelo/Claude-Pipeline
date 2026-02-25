#!/bin/bash
# AI Development Pipeline — Interactive Installer
# Copies the right pipeline config files for your AI coding tool.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGETS_DIR="$SCRIPT_DIR/targets"

echo ""
echo "  AI Development Pipeline Installer"
echo "  =================================="
echo ""
echo "  Which AI coding tool do you use?"
echo ""
echo "  1) Claude Code    (.claude/ directory)"
echo "  2) Cursor         (.cursor/ directory)"
echo "  3) Cline          (.clinerules/ directory)"
echo ""
read -p "  Choice [1-3]: " choice
echo ""

# Determine target directory
read -p "  Project path (or . for current directory): " project_path
project_path="${project_path:-.}"
project_path="$(cd "$project_path" 2>/dev/null && pwd)" || {
    echo "  Error: directory '$project_path' does not exist."
    exit 1
}

case "$choice" in
    1)
        tool="Claude Code"
        source_dir="$SCRIPT_DIR/.claude"
        target_dir="$project_path/.claude"
        config_name=".claude/"
        ;;
    2)
        tool="Cursor"
        source_dir="$TARGETS_DIR/cursor/.cursor"
        target_dir="$project_path/.cursor"
        config_name=".cursor/"
        ;;
    3)
        tool="Cline"
        source_dir="$TARGETS_DIR/cline/.clinerules"
        target_dir="$project_path/.clinerules"
        config_name=".clinerules/"
        ;;
    *)
        echo "  Invalid choice. Exiting."
        exit 1
        ;;
esac

# Check for existing config
if [ -d "$target_dir" ]; then
    echo "  Warning: $config_name already exists in $project_path"
    read -p "  Overwrite? [y/N]: " overwrite
    if [ "$overwrite" != "y" ] && [ "$overwrite" != "Y" ]; then
        echo "  Aborted."
        exit 0
    fi
fi

# Copy files
echo "  Copying $tool pipeline to $project_path/$config_name ..."
cp -r "$source_dir" "$target_dir"

# Create artifacts directory
mkdir -p "$project_path/.pipeline/artifacts"

echo ""
echo "  Done! Pipeline installed for $tool."
echo ""
echo "  Quick start:"

case "$choice" in
    1)
        echo "    npx @anthropic-ai/claude-code@latest"
        echo "    /auto-pipeline \"your task here\""
        ;;
    2)
        echo "    Open project in Cursor"
        echo "    /auto-pipeline \"your task here\""
        ;;
    3)
        echo "    Open project in VS Code with Cline"
        echo "    /auto-pipeline.md \"your task here\""
        ;;
esac

echo ""
echo "  Profiles: --profile=yolo | standard | paranoid"
echo ""
