/**
 * The run summary: what happened, what it cost, and where the evidence is.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RunResult } from "./run.js";
import type { EngineConfig } from "./config.js";

export function writeRunJson(result: RunResult, config: EngineConfig, engineVersion: string): void {
  const body = {
    schemaVersion: 1,
    runId: result.runId,
    engineVersion,
    status: result.status,
    exitCode: result.exitCode,
    haltedAt: result.haltedAt,
    task: config.task,
    profile: config.profile,
    quality: config.quality,
    provider: config.provider,
    branch: result.branch,
    commit: result.commit,
    costUsd: Number(result.costUsd.toFixed(6)),
    modelCalls: result.modelCalls,
    warnings: result.warnings,
    message: result.message,
    finishedAt: new Date().toISOString(),
  };
  writeFileSync(join(result.artifactsDir, "run.json"), JSON.stringify(body, null, 2) + "\n");
  appendHistory(config.stateDir, body);
}

function appendHistory(stateDir: string, entry: Record<string, unknown>): void {
  const path = join(stateDir, "history.json");
  mkdirSync(dirname(path), { recursive: true });
  let runs: unknown[] = [];
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as { runs?: unknown[] };
      if (Array.isArray(parsed.runs)) runs = parsed.runs;
    } catch { runs = []; }
  }
  runs.push(entry);
  writeFileSync(path, JSON.stringify({ schemaVersion: 2, runs: runs.slice(-200) }, null, 2) + "\n");
}

export function renderSummary(result: RunResult): string {
  const lines = [
    "",
    "─".repeat(64),
    `  ${result.status}: ${result.message}`,
    "─".repeat(64),
    `  Run:      ${result.runId}`,
    `  Evidence: ${result.artifactsDir}`,
  ];
  if (result.branch) lines.push(`  Branch:   ${result.branch}`);
  if (result.commit) lines.push(`  Commit:   ${result.commit.slice(0, 12)}`);
  lines.push(`  Cost:     $${result.costUsd.toFixed(2)} over ${result.modelCalls} model call(s)`);
  if (result.haltedAt) lines.push(`  Halted:   ${result.haltedAt}`);
  if (result.warnings.length) {
    lines.push("", "  Warnings:");
    for (const warning of result.warnings) lines.push(`    - ${warning}`);
  }
  lines.push("");
  return lines.join("\n");
}
