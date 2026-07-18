# Automated Pipeline

Run: `/auto-pipeline [--profile=yolo|fast|standard|paranoid] [--skip-arm] [--skip-ar] [--skip-pmatch] [--model-strong=MODEL] [--model-fast=MODEL] <task>`

$ARGUMENTS

---

## What this is

A **thin wrapper** over the real pipeline engine, `run-pipeline.sh` at the repo
root. It does not reimplement the 12 phases — it launches the one script that
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
   `--model-strong=`, `--model-fast=`, and `--mode` itself — pass whatever the
   user supplied.

   > **This is long-running** (it spawns ~12 `claude -p` subprocesses, several
   > minutes, real API spend). Launch it in the background and monitor, or tell
   > the user it will take a while before starting.

3. **Interpret the exit code and report back:**
   - **0** — completed. Summarize the profile used, the "Validators: N passed /
     N failed" line, any warnings, and the artifacts directory printed at the
     end.
   - **3** — a **HARD gate failed** and the run halted for review (Phase 0
     Pre-Check, Phase 3 Adversarial, Phase 11 Security, or Phase 12 Commit
     Code-Review). Read the relevant
     artifact under `.claude/artifacts/<session>/` and the matching `*.err`
     file, tell the user **exactly which gate failed and why**, and ask how to
     proceed (fix and re-run, override, or abort). **Never silently continue
     past a HARD gate.**
   - **any other non-zero** — a phase's subprocess failed to write its artifact.
     Read that phase's `*.err` file and report the failing phase to the user.

4. **Do not** re-run phases yourself, edit artifacts by hand, or "improvise" the
   pipeline. Your only job is to launch the engine and relay its outcome.

## Model routing (Balanced profile)

- **Opus** (`claude-opus-4-8`): Phase 2 Design, Phase 3 Adversarial Review — the
  open-ended reasoning and adversarial-finding work.
- **Sonnet** (`claude-sonnet-5`): every other phase — generation and
  verification. **Haiku is never used.**
- Effort is tuned per phase (deep on Pre-Check/Design/Adversarial/Security,
  light on the mechanical phases) and auto-clamps to what the installed CLI
  supports. Override models per run with `--model-strong=` / `--model-fast=`.

## Interactive / step-through variant

For a run that pauses after each phase for review, use the engine directly in a
real terminal (it needs a TTY for the prompts):

```bash
bash run-pipeline.sh --mode=dev "<task>"
```
