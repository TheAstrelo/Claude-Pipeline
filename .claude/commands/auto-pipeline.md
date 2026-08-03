# Automated Pipeline

Run: `/auto-pipeline [--provider=auto|claude|codex] [--profile=yolo|fast|standard|paranoid] [--policy-rollout=legacy|shadow|enforced] [--resume=RUN_ID] [--skip-arm] [--skip-ar] [--skip-pmatch] [--model-strong=MODEL] [--model-fast=MODEL] [--no-commit] [--allow-untested-commit] [--retention-days=N] [--retention-max-runs=N] <task>`

$ARGUMENTS

---

## What this is

A **thin wrapper** over the real pipeline engine, `run-pipeline.sh` at the repo
root. It does not reimplement the 13 phases — it launches the one script that
actually executes them and relays the result. The engine owns model routing,
gates, validators, retries, and artifacts.

(This replaced ~2,400 lines of bash-embedded-in-markdown that no interpreter
ever ran. If you are editing pipeline behavior, edit `run-pipeline.sh`, not
this file.)

## How to run it

1. **Parse `$ARGUMENTS`** into flags plus a task description. If there is no
   task, ask the user for one and stop — do not run the engine without a task.

2. **Launch the engine once**, from the project root, via the Bash tool. Pass
   the flags through and give the task as a **single quoted argument**. Set
   `PIPELINE_NONINTERACTIVE=1` so a failed HARD gate halts (exit 3) instead of
   blocking on a prompt with no TTY:

   ```bash
   PIPELINE_NONINTERACTIVE=1 bash run-pipeline.sh --profile=<profile> "<the task>"
   ```

   The engine parses `--profile`, `--skip-arm`, `--skip-ar`, `--skip-pmatch`,
   `--provider`, `--resume=RUN_ID`, `--model-strong=`, `--model-fast=`, `--no-commit`,
   `--allow-dirty`, `--allow-untested-commit`, `--policy-rollout=`,
   retention controls, budget caps, and `--mode`
   itself — pass whatever the user supplied.

   A resume invocation must repeat the original task and effective options.
   The engine proceeds only if its atomic checkpoint and all bound engine,
   configuration, Git, worktree, verification-policy, ledger, attempt, and
   artifact hashes still match.

   > **This is long-running** (it spawns up to 13 provider subprocesses, several
   > minutes, real API spend). Launch it in the background and monitor, or tell
   > the user it will take a while before starting.

3. **Interpret the exit code and report back:**
   - **0** — completed. Summarize the profile used, the "Validators: N passed /
     N failed" line, any warnings, and the artifacts directory printed at the
     end.
   - **3** — a **HARD gate failed** and the run halted for review (Phase 0
     Pre-Check, Phase 3 Adversarial, Phase 6 Build, Phase 11 Security, or Phase 12 Commit
     Code-Review). Read the relevant
     artifact under `.pipeline/artifacts/<session>/` and the matching `*.err`
     file, tell the user **exactly which gate failed and why**, and ask how to
     proceed (fix and re-run, override, or abort). **Never silently continue
     past a HARD gate.**
   - **any other non-zero** — a phase's subprocess failed to write its artifact.
     Read that phase's `*.err` file and report the failing phase to the user.

4. **Cloud/no-subprocess fallback.** If the engine exits at its **auth
   preflight** ("this environment cannot spawn an authenticated claude
   subprocess"), the subprocess engine cannot run here. Fall back to
   **in-session orchestration**: run the phases yourself in phase order using
   the per-phase agents in `.claude/agents/` via the Task tool (pre-check →
   requirements-crystallizer → architect → adversarial-coordinator →
   atomic-planner → drift-detector → builder → security-auditor →
   plan-reviewer for the final review), honoring the same artifacts
   directory layout, running the project's real test command yourself between
   build and review, and applying the BLOCKER-lane rule from
   `PIPELINE-SPEC.md` §4: only evidence-cited BLOCKER findings may stop the
   run. In this mode NEVER auto-commit — end by presenting the diff and the
   test results, and let the user commit. Tell the user explicitly that the
   run used in-session mode (weaker isolation than the engine).

5. **Do not** re-run phases yourself while the engine mode is in use, edit
   artifacts by hand, or "improvise" the pipeline. In engine mode your only
   job is to launch the engine and relay its outcome.

## Model routing (Balanced profile)

- **Claude:** `claude-opus-4-8` strong lane and `claude-sonnet-5` balanced lane.
- **Codex:** `gpt-5.6-sol` strong lane and `gpt-5.6-terra` balanced lane.
- Effort is tuned independently per phase. Override either lane per run with
  `--model-strong=` / `--model-fast=`.

## Interactive / step-through variant

For a run that pauses after each phase for review, use the engine directly in a
real terminal (it needs a TTY for the prompts):

```bash
bash run-pipeline.sh --mode=dev "<task>"
```
