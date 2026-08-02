# Pipeline Undo Command

Undo a pipeline run's result. With worktree isolation (the current engine),
this is clean and low-risk: a run never touches your checkout — its result
lives only on a `pipeline/<session>` branch (and, for a `--push` run, on the
remote). "Undo" therefore means deleting that branch and its worktree, not
reverting your working tree.

## Arguments

- `$ARGUMENTS` — optional session ID to undo. Defaults to the most recent run.

## Instructions

### 1. Find the run

- Read `.pipeline/artifacts/current.txt` for the most recent session
  directory (or resolve the directory matching the `$ARGUMENTS` session ID
  under `.pipeline/artifacts/`).
- The session's `ledger.jsonl` is authoritative. Find:
  - the `run_started` event → the run's baseline and branch;
  - a `commit_published` event and `commit.sha` → whether a commit was made;
  - a `branch_published` event → whether it was pushed, and to which remote.
- The run branch is `pipeline/<session-id>`.

### 2. Report what will be removed

Show the user, and ask to confirm (`y/n`):
- Session ID and task (from the `run_started` payload).
- The run branch `pipeline/<session-id>` and whether it holds a commit.
- Whether a worktree exists at `.pipeline/worktrees/<session-id>`.
- Whether the branch was pushed to a remote.
- Confirm explicitly that **your current checkout will not change** — only
  the run branch/worktree are removed.

### 3. Execute (only after confirmation)

```bash
# Remove the run worktree if it is still present (review-only / halted runs).
git worktree remove --force ".pipeline/worktrees/<session-id>" 2>/dev/null || true
git worktree prune

# Delete the local run branch.
git branch -D "pipeline/<session-id>"

# Remove the per-run checkpoint ref, if any.
git update-ref -d "refs/pipeline-checkpoints/<session-id>" 2>/dev/null || true
```

If the branch was pushed and the user wants the remote branch removed too
(ask separately — this affects shared state):

```bash
git push <remote> --delete "pipeline/<session-id>"
```

### 4. Do NOT

- Do not `git reset`/`git revert` the user's checkout. A worktree-isolated
  run never committed to it, so there is nothing there to revert; doing so
  would destroy unrelated work.
- Do not delete the session's `.pipeline/artifacts/<session>` directory — it
  is the durable audit record. (Retention is configured separately.)

### 5. Legacy in-place runs (`PIPELINE_WORKTREE=0`)

An older or `PIPELINE_WORKTREE=0` run may have committed on the pipeline
branch after switching your checkout to it. If HEAD is on `pipeline/<session>`
with the run's commit, return to the original branch first
(`git checkout <original-branch>`, named in the `run_started` payload), then
delete the run branch as above. Never `git reset --hard` without confirming
the target with the user.

## Error handling

If a git operation fails, show the exact error and the branch/commit SHAs
from the ledger so the user can finish manually. Never guess.
