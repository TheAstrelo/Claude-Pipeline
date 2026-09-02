#!/usr/bin/env node
// Summarize a corpus results file (from run-corpus.ts) and, optionally, diff
// it against a previous one so regressions are named rather than averaged
// away.
//
//   node evals/score.ts evals/results/2026-09-08.json [--prev=evals/results/2026-09-01.json]
//
// Prints a markdown summary and writes <results>.summary.json next to it.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface Row {
  taskId: string; kind: string; pass: boolean; reason: string; exitCode: number | null;
  haltedAt: string | null; costUsd: number | null; wallClockMs: number; modelCalls: number | null;
  slop: null | { addedLines: number; removedLines: number; filesChanged: number; newDeps: string[]; debugLines: number; todoMarkers: number; commentRatio: number };
  rubric: { pass: boolean; failures: string[]; warnings: string[] };
}

const file = process.argv.slice(2).find(a => !a.startsWith("--"));
if (!file) { console.error("usage: node evals/score.ts <results.json> [--prev=<results.json>]"); process.exit(2); }
const prevArg = process.argv.slice(2).find(a => a.startsWith("--prev="))?.slice(7);

const rows: Row[] = JSON.parse(readFileSync(resolve(file), "utf8"));
const prev: Row[] | null = prevArg && existsSync(resolve(prevArg)) ? JSON.parse(readFileSync(resolve(prevArg), "utf8")) : null;

const pct = (n: number, d: number) => d ? `${Math.round((100 * n) / d)}%` : "n/a";
const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

const byKind = (k: string) => rows.filter(r => r.kind === k);
const routine = [...byKind("routine"), ...byKind("terse")];
const negative = byKind("negative");
const costs = rows.map(r => r.costUsd).filter((c): c is number => c != null);
const walls = rows.map(r => r.wallClockMs / 60000);
const slops = rows.map(r => r.slop).filter((s): s is NonNullable<Row["slop"]> => !!s);

const summary = {
  file: resolve(file),
  tasks: rows.length,
  passRate: { all: pct(rows.filter(r => r.pass).length, rows.length), routine: pct(routine.filter(r => r.pass).length, routine.length), terse: pct(byKind("terse").filter(r => r.pass).length, byKind("terse").length), negativeCatch: pct(negative.filter(r => r.pass).length, negative.length) },
  routineHalts: routine.filter(r => r.exitCode !== 0).length,
  cost: { meanUsd: +mean(costs).toFixed(2), medianUsd: +median(costs).toFixed(2), totalUsd: +costs.reduce((a, b) => a + b, 0).toFixed(2), known: costs.length },
  wallClockMinutes: { mean: +mean(walls).toFixed(1), median: +median(walls).toFixed(1) },
  slop: {
    meanAddedLines: Math.round(mean(slops.map(s => s.addedLines))),
    meanFilesChanged: +mean(slops.map(s => s.filesChanged)).toFixed(1),
    tasksWithNewDeps: slops.filter(s => s.newDeps.length).length,
    tasksWithDebugLines: slops.filter(s => s.debugLines > 0).length,
    tasksWithTodoMarkers: slops.filter(s => s.todoMarkers > 0).length,
    meanCommentRatio: +mean(slops.map(s => s.commentRatio)).toFixed(3),
    diffBandWarnings: rows.filter(r => r.rubric.warnings.some(w => w.includes("band"))).length,
  },
  failures: rows.filter(r => !r.pass).map(r => ({ taskId: r.taskId, kind: r.kind, reason: r.reason, haltedAt: r.haltedAt })),
  deltaVsPrev: null as null | { regressions: string[]; fixes: string[]; costDeltaUsd: number | null },
};

if (prev) {
  const prevBy = new Map(prev.map(r => [r.taskId, r]));
  const regressions: string[] = []; const fixes: string[] = [];
  for (const r of rows) {
    const p = prevBy.get(r.taskId);
    if (!p) continue;
    if (p.pass && !r.pass) regressions.push(`${r.taskId}: ${r.reason}`);
    if (!p.pass && r.pass) fixes.push(r.taskId);
  }
  const prevCosts = prev.map(r => r.costUsd).filter((c): c is number => c != null);
  summary.deltaVsPrev = { regressions, fixes, costDeltaUsd: costs.length && prevCosts.length ? +(mean(costs) - mean(prevCosts)).toFixed(2) : null };
}

const out = file.replace(/\.json$/, "") + ".summary.json";
writeFileSync(resolve(out), JSON.stringify(summary, null, 2) + "\n");

console.log(`# Corpus results — ${summary.tasks} tasks\n`);
console.log("| Metric | Value |\n|---|---|");
console.log(`| Pass rate (all) | ${summary.passRate.all} |`);
console.log(`| Pass rate (routine + terse) | ${summary.passRate.routine} |`);
console.log(`| Pass rate (terse only) | ${summary.passRate.terse} |`);
console.log(`| Negative-task catch rate | ${summary.passRate.negativeCatch} |`);
console.log(`| Hard halts on routine tasks | ${summary.routineHalts} |`);
console.log(`| Cost per task (mean / median) | $${summary.cost.meanUsd} / $${summary.cost.medianUsd} (${summary.cost.known} known) |`);
console.log(`| Wall-clock per task (mean / median) | ${summary.wallClockMinutes.mean} / ${summary.wallClockMinutes.median} min |`);
console.log(`| Mean added lines | ${summary.slop.meanAddedLines} |`);
console.log(`| Tasks adding a dependency | ${summary.slop.tasksWithNewDeps} |`);
console.log(`| Tasks with debug output / TODO markers | ${summary.slop.tasksWithDebugLines} / ${summary.slop.tasksWithTodoMarkers} |`);
console.log(`| Mean comment ratio of added lines | ${summary.slop.meanCommentRatio} |`);
if (summary.failures.length) {
  console.log("\n## Failures\n\n| Task | Kind | Halted at | Reason |\n|---|---|---|---|");
  for (const f of summary.failures) console.log(`| ${f.taskId} | ${f.kind} | ${f.haltedAt ?? "—"} | ${f.reason} |`);
}
if (summary.deltaVsPrev) {
  const d = summary.deltaVsPrev;
  console.log(`\n## Versus ${prevArg}\n`);
  console.log(`- Regressions: ${d.regressions.length ? d.regressions.join("; ") : "none"}`);
  console.log(`- Fixed: ${d.fixes.length ? d.fixes.join(", ") : "none"}`);
  if (d.costDeltaUsd != null) console.log(`- Mean cost delta: ${d.costDeltaUsd >= 0 ? "+" : ""}$${d.costDeltaUsd}`);
}
console.log(`\nSummary written to ${out}`);
