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
echo "  4) Windsurf       (.windsurf/ directory)"
echo "  5) GitHub Copilot (.github/ directory)"
echo "  6) Aider          (.aider.conf.yml + CONVENTIONS.md)"
echo "  7) Codex CLI      (instructions.md + wrapper script)"
echo ""
read -p "  Choice [1-7]: " choice
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
        check_path="$target_dir"
        ;;
    2)
        tool="Cursor"
        source_dir="$TARGETS_DIR/cursor/.cursor"
        target_dir="$project_path/.cursor"
        config_name=".cursor/"
        check_path="$target_dir"
        ;;
    3)
        tool="Cline"
        source_dir="$TARGETS_DIR/cline/.clinerules"
        target_dir="$project_path/.clinerules"
        config_name=".clinerules/"
        check_path="$target_dir"
        ;;
    4)
        tool="Windsurf"
        source_dir="$TARGETS_DIR/windsurf/.windsurf"
        target_dir="$project_path/.windsurf"
        config_name=".windsurf/"
        check_path="$target_dir"
        ;;
    5)
        tool="GitHub Copilot"
        source_dir="$TARGETS_DIR/copilot/.github"
        target_dir="$project_path/.github"
        config_name=".github/"
        check_path="$target_dir"
        ;;
    6)
        tool="Aider"
        source_dir="$TARGETS_DIR/aider"
        target_dir="$project_path"
        config_name="CONVENTIONS.md + .aider.conf.yml"
        check_path="$project_path/CONVENTIONS.md"
        ;;
    7)
        tool="Codex CLI"
        source_dir="$TARGETS_DIR/codex"
        target_dir="$project_path"
        config_name="instructions.md + AGENTS.md + codex-pipeline.sh"
        check_path="$project_path/instructions.md"
        ;;
    *)
        echo "  Invalid choice. Exiting."
        exit 1
        ;;
esac

# Check for existing config
if [ -e "$check_path" ]; then
    echo "  Warning: $config_name already exists in $project_path"
    read -p "  Overwrite? [y/N]: " overwrite
    if [ "$overwrite" != "y" ] && [ "$overwrite" != "Y" ]; then
        echo "  Aborted."
        exit 0
    fi
fi

# Copy files
echo "  Copying $tool pipeline to $project_path ..."

if [ "$choice" = "7" ]; then
    # Codex: copy instructions.md, AGENTS.md, and wrapper script to project root
    cp "$source_dir/instructions.md" "$project_path/instructions.md"
    cp "$source_dir/AGENTS.md" "$project_path/AGENTS.md"
    cp "$source_dir/codex-pipeline.sh" "$project_path/codex-pipeline.sh"
    chmod +x "$project_path/codex-pipeline.sh"
elif [ "$choice" = "6" ]; then
    # Aider: copy individual files to project root
    cp "$source_dir/.aider.conf.yml" "$project_path/.aider.conf.yml"
    cp "$source_dir/CONVENTIONS.md" "$project_path/CONVENTIONS.md"
    mkdir -p "$project_path/pipeline"
    cp "$source_dir/pipeline/phases.md" "$project_path/pipeline/phases.md"
elif [ "$choice" = "5" ]; then
    # Copilot: merge into existing .github/ if present
    mkdir -p "$target_dir"
    cp -r "$source_dir"/* "$target_dir/"
else
    cp -r "$source_dir" "$target_dir"
fi

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
    4)
        echo "    Open project in Windsurf"
        echo "    /auto-pipeline \"your task here\""
        ;;
    5)
        echo "    Open project in VS Code with Copilot"
        echo "    /auto-pipeline \"your task here\""
        ;;
    6)
        echo "    aider --config .aider.conf.yml"
        echo "    Then ask: \"run the pipeline for: your task here\""
        echo ""
        echo "    Or use architect mode:"
        echo "    aider --architect --config .aider.conf.yml"
        ;;
    7)
        echo "    Option A — Wrapper script (recommended):"
        echo "    ./codex-pipeline.sh \"your task here\""
        echo "    ./codex-pipeline.sh --profile=yolo \"your task here\""
        echo ""
        echo "    Option B — Single session (Codex reads instructions.md):"
        echo "    codex \"run the pipeline for: your task here\""
        ;;
esac

echo ""
echo "  Profiles: --profile=yolo | standard | paranoid"
echo ""
