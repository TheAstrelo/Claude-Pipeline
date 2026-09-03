#!/usr/bin/env node
/**
 * Command line entry point.
 *
 * Exit codes are the contract callers depend on:
 *   0 the run finished (committed, or review-only when commit was not asked for)
 *   1 the engine failed
 *   3 a gate halted the run for a human
 *   4 the budget stopped it
 */

import { resolve } from "node:path";
import { ClaudeAdapter } from "./providers/claude.js";
import { CodexAdapter } from "./providers/codex.js";
import { resolveBudget, type BudgetPolicy, type EngineConfig, type Profile, type ProviderId, type Quality } from "./config.js";
import { ENGINE_VERSION, Runner } from "./run.js";
import { renderSummary, writeRunJson } from "./report.js";
import type { Adapter } from "./providers/types.js";

const HELP = `claude-pipeline — a task description in, reviewed code out.

Usage: claude-pipeline [options] "<task>"

Options:
  --provider=auto|claude|codex   Executor (default: auto)
  --quality=max|balanced|cheap   Model lane and effort per role (default: max)
  --profile=yolo|fast|standard|paranoid
                                 What runs and how gates behave (default: standard)
  --no-commit                    Review only; never commit
  --allow-dirty                  Proceed with uncommitted changes in the checkout
  --allow-untested-commit        Commit even with no test command (recorded)
  --push                         Push the run branch after committing
  --pr                           --push, and print pull-request guidance
  --budget=elastic|strict        Whether a capped call may retry with a bigger cap
  --max-budget-usd=N             Per-call cap (default: none, unless a run cap is set)
  --max-run-budget-usd=N         Whole-run cap (default: none — the run is uncapped)
  --model-strong=ID              Override the strong lane
  --model-fast=ID                Override the balanced lane
  --model-review=ID              Override the review lane
  --state-dir=PATH               Where run state lives (default: .pipeline)
  --resume=RUN_ID                Resume a halted run
  --version                      Print the engine version
  -h, --help                     This message

Budgets are opt-in. Without --max-run-budget-usd the run is uncapped; with one,
each call starts at a $4 cap that doubles on demand within the run cap.
`;

export function parseArgs(argv: string[]): { config: EngineConfig; error?: string; help?: boolean; version?: boolean } {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (const arg of argv) {
    if (arg === "-h" || arg === "--help") return { config: null as never, help: true };
    if (arg === "--version") return { config: null as never, version: true };
    if (arg.startsWith("--")) {
      const [name, ...rest] = arg.slice(2).split("=");
      flags.set(name!, rest.join("=") || "true");
    } else {
      positional.push(arg);
    }
  }
  const task = positional.join(" ").trim();
  const numeric = (name: string): number | null => {
    const raw = flags.get(name);
    if (raw === undefined) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : NaN;
  };

  const perCall = numeric("max-budget-usd");
  const runCap = numeric("max-run-budget-usd");
  const config: EngineConfig = {
    task,
    provider: (flags.get("provider") ?? "auto") as ProviderId,
    quality: (flags.get("quality") ?? "max") as Quality,
    profile: (flags.get("profile") ?? "standard") as Profile,
    budget: resolveBudget({
      policy: (flags.get("budget") ?? "elastic") as BudgetPolicy,
      perCallUsd: perCall,
      runUsd: runCap,
    }),
    models: {
      strong: flags.get("model-strong") ?? null,
      balanced: flags.get("model-fast") ?? null,
      review: flags.get("model-review") ?? null,
    },
    commit: !flags.has("no-commit"),
    allowDirty: flags.has("allow-dirty"),
    allowUntestedCommit: flags.has("allow-untested-commit"),
    push: flags.has("push") || flags.has("pr"),
    openPr: flags.has("pr"),
    callTimeoutMs: Number(process.env["PIPELINE_PROVIDER_TIMEOUT_SECONDS"] ?? 2400) * 1000,
    commandTimeoutMs: Number(process.env["PIPELINE_COMMAND_TIMEOUT_SECONDS"] ?? 900) * 1000,
    stateDir: resolve(flags.get("state-dir") ?? process.env["PIPELINE_STATE_DIR"] ?? ".pipeline"),
    repoRoot: process.cwd(),
    resumeRunId: flags.get("resume") ?? null,
    nonInteractive: process.env["PIPELINE_NONINTERACTIVE"] === "1",
    baselineChecks: process.env["PIPELINE_BASELINE_CHECKS"] !== "0",
  };

  if (!task) return { config, error: "a task description is required" };
  if (Number.isNaN(perCall) || Number.isNaN(runCap)) return { config, error: "budget caps must be non-negative numbers" };
  for (const [name, allowed] of [
    ["quality", ["max", "balanced", "cheap"]],
    ["profile", ["yolo", "fast", "standard", "paranoid"]],
    ["provider", ["auto", "claude", "codex"]],
    ["budget", ["elastic", "strict"]],
  ] as const) {
    const value = flags.get(name);
    if (value !== undefined && !allowed.includes(value as never)) {
      return { config, error: `--${name} must be one of: ${allowed.join(", ")}` };
    }
  }
  return { config };
}

export function chooseAdapter(config: EngineConfig): Adapter {
  const models = {
    ...(config.models.strong ? { strong: config.models.strong } : {}),
    ...(config.models.balanced ? { balanced: config.models.balanced } : {}),
    ...(config.models.review ? { review: config.models.review } : {}),
  };
  if (config.provider === "codex") return new CodexAdapter({ models });
  return new ClaudeAdapter({ models });
}

export function makeRunId(task: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const slug = task.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "run";
  return `${stamp}-${slug}`;
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) { process.stdout.write(HELP); return; }
  if (parsed.version) { process.stdout.write(`${ENGINE_VERSION}\n`); return; }
  if (parsed.error) {
    process.stderr.write(`Error: ${parsed.error}\n\n${HELP}`);
    process.exitCode = 1;
    return;
  }

  const config = parsed.config;
  const runId = config.resumeRunId ?? makeRunId(config.task);
  const adapter = chooseAdapter(config);
  const log = (message: string) => process.stdout.write(message + "\n");

  log("");
  log(`  ${config.profile} · quality=${config.quality} · ${adapter.id}`);
  log(`  Task: ${config.task}`);
  log("");

  const runner = new Runner(config, adapter, runId, log);
  const result = await runner.execute();
  writeRunJson(result, config, ENGINE_VERSION);
  process.stdout.write(renderSummary(result));
  if (result.status === "COMPLETED" && config.openPr && result.branch) {
    process.stdout.write(`  Open a pull request from ${result.branch} when you are ready.\n\n`);
  }
  process.exitCode = result.exitCode;
}

const invokedDirectly = process.argv[1] && /cli\.(ts|js)$/.test(process.argv[1]);
if (invokedDirectly) {
  main().catch(error => {
    process.stderr.write(`Error: ${(error as Error).message}\n`);
    process.exitCode = 1;
  });
}
