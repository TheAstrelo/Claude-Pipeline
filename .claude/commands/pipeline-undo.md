# Pipeline Undo Command

Revert the last pipeline run by restoring the git checkpoint.

## Arguments

- `$ARGUMENTS` - Optional: session ID to undo (defaults to last session)

## Instructions

### 1. Find Checkpoint

If session ID provided in `$ARGUMENTS`:
- Look for `.claude/artifacts/{session}/checkpoint.txt`

Otherwise:
- Read `.claude/artifacts/current.txt` for last session ID
- Look for checkpoint in that session's directory

### 2. Verify Checkpoint Exists

If no checkpoint found:
- Output: "No checkpoint found. Cannot undo."
- Suggest: "Pipeline may not have made any changes, or was run without git."
- Exit

### 3. Get Checkpoint Type

Read checkpoint file to determine type:
- If starts with `stash@`: it's a git stash
- If 40-char hex: it's a commit hash

### 4. Confirm with User

Show what will be undone:
- Session ID
- Task description (from status.json)
- Files that were changed
- Checkpoint type

Ask: "Revert these changes? [y/n]"

### 5. Execute Undo

**For stash checkpoint:**
```bash
git stash pop {stash-ref}
```

**For commit checkpoint:**
```bash
git revert --no-commit HEAD~N..HEAD
```
Where N is the number of commits since checkpoint.

Or for clean revert:
```bash
git reset --hard {commit-hash}
```

### 6. Clean Up

- Remove session from `.claude/artifacts/current.txt`
- Update history.json to mark session as "reverted"
- Output success message

### 7. Output

```
Reverted pipeline run: {session}
Task: {task description}
Files restored: {count}

Current state matches pre-pipeline checkpoint.
```

## Error Handling

If git operations fail:
- Show git error message
- Suggest manual resolution
- Provide checkpoint hash for manual recovery
