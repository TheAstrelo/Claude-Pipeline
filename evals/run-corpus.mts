#!/usr/bin/env node
// Corpus runner: runs the pipeline engine on every sealed task under
// evals/corpus, then scores each result against hidden acceptance tests and
// the task's rubric. Real providers, real spend — see evals/README.md.
//
//   node evals/run-corpus.ts [--engine=bash] [--provider=claude|codex]
//        [--profile=standard] [--quality=max|balanced|cheap]
//        [--only=id,id] [--skip=id,id] [--max-run-budget-usd=N]
//        [--timeout-minutes=90] [--out=evals/results/<date>.json]
//        [--keep] [--dry-run]
//
// No dependencies beyond node 22 built-ins; runs directly via type stripping.

import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync,
  rmSync, statSync, writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Types (the task.json contract is documented in evals/corpus/README.md)
// ---------------------------------------------------------------------------

interface HiddenCopy { from: string; to: string }
// expect: "tests-pass" / "tests-pass-and-rubric" — the engine must complete and
// the hidden tests must be green; "halt" — the engine must stop at
// rubric.expected_halt; "halt-or-clean" — either it stops there, or it
// completes with none of rubric.forbidden_content in the candidate tree (and
// the hidden tests green, if any). The last is for tasks that tempt a defect a
// good pipeline may refuse to write in the first place.
interface Hidden { copy: HiddenCopy[]; expect: "tests-pass" | "halt" | "tests-pass-and-rubric" | "halt-or-clean" }
interface Rubric {
  must_touch?: string[];
  must_not_touch?: string[];
  forbidden_new_deps?: string[];
  diff_line_band?: [number, number];
  expected_halt?: null | "security-scanner" | "security-review" | "code-review" | "adversarial" | "build" | "pre-check";
  // For tasks that should normally complete, halts that also count as a
  // correct outcome (e.g. Security refusing an unsafe implementation).
  acceptable_halts?: string[];
  // Literal strings that must not appear in any file of the candidate tree
  // (the planted secret, an injection sink). Checked on every completed run;
  // required by expect "halt-or-clean".
  forbidden_content?: string[];
}
interface Task {
  id: string;
  title: string;
  fixture: string;
  kind: "routine" | "terse" | "negative";
  task: string;
  test_command: string[];
  hidden: Hidden;
  rubric: Rubric;
  seed: null | { description: string; proof: string };
}

interface Slop {
  addedLines: number;
  removedLines: number;
  filesChanged: number;
  newFiles: number;
  newDeps: string[];
  debugLines: number;
  todoMarkers: number;
  commentRatio: number;
}

interface Row {
  taskId: string;
  kind: Task["kind"];
  fixture: string;
  engine: string;
  provider: string;
  profile: string;
  quality: string | null;
  startedAt: string;
  wallClockMs: number;
  exitCode: number | null;
  timedOut: boolean;
  status: string | null;
  haltedAt: string | null;
  phases: Record<string, string>;
  modelCalls: number | null;
  costUsd: number | null;
  tokens: { input: number; output: number; cached: number } | null;
  hiddenTests: { ran: boolean; exitCode: number | null; tail: string } ;
  rubric: { pass: boolean; failures: string[]; warnings: string[] };
  slop: Slop | null;
  changedFiles: string[];
  pass: boolean;
  reason: string;
  artifactsDir: string | null;
  // Last lines of the engine's stdout/stderr (ANSI stripped), always kept so
  // a failure is diagnosable from the results file alone.
  engineTail: { stdout: string; stderr: string };
}

const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
const tail = (s: string, n = 1500) => { const t = stripAnsi(s); return t.length > n ? t.slice(-n) : t; };

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const ROOT = resolve(import.meta.dirname, "..");
const CORPUS = join(ROOT, "evals", "corpus");
const FIXTURES = join(ROOT, "evals", "fixtures");

function arg(name: string, fallback: string | null = null): string | null {
  const hit = process.argv.slice(2).find(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const eq = hit.indexOf("=");
  return eq === -1 ? "true" : hit.slice(eq + 1);
}

const ENGINE = arg("engine", "bash")!;
const PROVIDER = arg("provider", "claude")!;
const PROFILE = arg("profile", "standard")!;
const QUALITY = arg("quality");
const ONLY = (arg("only", "") || "").split(",").map(s => s.trim()).filter(Boolean);
const SKIP = (arg("skip", "") || "").split(",").map(s => s.trim()).filter(Boolean);
const BUDGET = arg("max-run-budget-usd");
const TIMEOUT_MIN = Number(arg("timeout-minutes", "90"));
const KEEP = arg("keep") === "true";
const DRY_RUN = arg("dry-run") === "true";
const OUT = resolve(ROOT, arg("out", `evals/results/${new Date().toISOString().slice(0, 10)}.json`)!);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sh(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd, env: { ...process.env, ...(opts.env || {}) },
    encoding: "utf8", timeout: opts.timeoutMs, maxBuffer: 64 * 1024 * 1024,
  });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "", signal: r.signal, error: r.error };
}

function git(cwd: string, ...args: string[]) { return sh("git", args, { cwd }); }

function globToRegex(glob: string): RegExp {
  let re = "^";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") { re += ".*"; i++; if (glob[i + 1] === "/") i++; }
      else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (".+^${}()|[]\\".includes(c)) re += "\\" + c;
    else re += c;
  }
  return new RegExp(re + "$");
}
const matchesAny = (file: string, globs: string[] | undefined) => (globs || []).some(g => globToRegex(g).test(file));

function readJson<T>(p: string): T { return JSON.parse(readFileSync(p, "utf8")) as T; }

function loadTasks(): Task[] {
  if (!existsSync(CORPUS)) throw new Error(`corpus directory missing: ${CORPUS}`);
  const tasks: Task[] = [];
  for (const dir of readdirSync(CORPUS).sort()) {
    const p = join(CORPUS, dir, "task.json");
    if (!existsSync(p)) continue;
    const t = readJson<Task>(p);
    const problems: string[] = [];
    if (t.id !== dir) problems.push(`id "${t.id}" != directory "${dir}"`);
    if (!existsSync(join(FIXTURES, t.fixture))) problems.push(`fixture missing: ${t.fixture}`);
    if (!Array.isArray(t.test_command) || !t.test_command.length) problems.push("test_command must be a non-empty argv array");
    if (!t.hidden || !["tests-pass", "halt", "tests-pass-and-rubric", "halt-or-clean"].includes(t.hidden.expect)) problems.push("hidden.expect invalid");
    for (const c of t.hidden?.copy || []) if (!existsSync(join(CORPUS, dir, c.from))) problems.push(`hidden file missing: ${c.from}`);
    if ((t.hidden?.expect === "halt" || t.hidden?.expect === "halt-or-clean") && !t.rubric?.expected_halt) problems.push(`hidden.expect=${t.hidden?.expect} requires rubric.expected_halt`);
    if (t.hidden?.expect === "halt-or-clean" && !t.rubric?.forbidden_content?.length) problems.push("hidden.expect=halt-or-clean requires rubric.forbidden_content");
    if (problems.length) throw new Error(`invalid task ${dir}:\n  - ${problems.join("\n  - ")}`);
    tasks.push(t);
  }
  return tasks;
}

// Dependency manifests: return the set of declared dependency names.
function declaredDeps(root: string): Set<string> {
  const out = new Set<string>();
  const pkg = join(root, "package.json");
  if (existsSync(pkg)) {
    try {
      const p = readJson<any>(pkg);
      for (const k of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"])
        for (const name of Object.keys(p[k] || {})) out.add(name);
    } catch { /* malformed: treat as none */ }
  }
  for (const f of readdirSync(root).filter(f => /^requirements.*\.txt$/.test(f))) {
    for (const line of readFileSync(join(root, f), "utf8").split("\n")) {
      const m = line.trim().match(/^([A-Za-z0-9_.\-]+)/);
      if (m && !line.trim().startsWith("#")) out.add(m[1].toLowerCase());
    }
  }
  const pyproject = join(root, "pyproject.toml");
  if (existsSync(pyproject)) {
    const txt = readFileSync(pyproject, "utf8");
    const block = txt.match(/dependencies\s*=\s*\[([^\]]*)\]/s);
    if (block) for (const m of block[1].matchAll(/"([A-Za-z0-9_.\-]+)/g)) out.add(m[1].toLowerCase());
  }
  const gomod = join(root, "go.mod");
  if (existsSync(gomod)) {
    for (const m of readFileSync(gomod, "utf8").matchAll(/^\s*([a-z0-9.\-\/]+\.[a-z]+\/[^\s]+)\s+v[0-9]/gm)) out.add(m[1]);
  }
  const cargo = join(root, "Cargo.toml");
  if (existsSync(cargo)) {
    const txt = readFileSync(cargo, "utf8");
    const block = txt.match(/\[dependencies\]([^[]*)/s);
    if (block) for (const m of block[1].matchAll(/^\s*([A-Za-z0-9_\-]+)\s*=/gm)) out.add(m[1]);
  }
  return out;
}

function slopFromDiff(diff: string, numstat: string, baseDeps: Set<string>, candDeps: Set<string>): Slop {
  let added = 0, removed = 0, debug = 0, todo = 0, comment = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) {
      added++;
      const body = line.slice(1).trim();
      if (/\b(console\.(log|debug|trace)|debugger;|pdb\.set_trace|breakpoint\(\)|dbg!\()/.test(body)) debug++;
      if (/\b(TODO|FIXME|XXX|HACK)\b/.test(body)) todo++;
      if (/^(\/\/|#|\/\*|\*|<!--|--|""")/.test(body)) comment++;
    } else if (line.startsWith("-")) removed++;
  }
  const files = numstat.split("\n").filter(Boolean);
  const newFiles = diff.split("\n").filter(l => l.startsWith("new file mode")).length;
  const newDeps = [...candDeps].filter(d => !baseDeps.has(d)).sort();
  return {
    addedLines: added, removedLines: removed, filesChanged: files.length, newFiles,
    newDeps, debugLines: debug, todoMarkers: todo,
    commentRatio: added ? +(comment / added).toFixed(3) : 0,
  };
}

function findWorktree(stateDir: string, repo: string): string {
  const wts = join(stateDir, "worktrees");
  if (existsSync(wts)) {
    const entries = readdirSync(wts).filter(e => statSync(join(wts, e)).isDirectory());
    if (entries.length === 1) return join(wts, entries[0]);
    if (entries.length > 1) return join(wts, entries.sort().at(-1)!);
  }
  return repo; // legacy in-place mode
}

function findArtifacts(stateDir: string): string | null {
  const cur = join(stateDir, "artifacts", "current.txt");
  if (!existsSync(cur)) return null;
  const p = readFileSync(cur, "utf8").trim();
  return existsSync(p) ? p : null;
}

function haltedWhere(exit: number | null, run: any, stdout: string): string | null {
  if (exit === 0) return null;
  if (run?.security?.latestScannerResult === "BLOCK" || /scanner.*BLOCK|BLOCK.*scanner/i.test(stdout)) return "security-scanner";
  const phases: Record<string, string> = run?.phases || {};
  const names: Record<string, string> = {
    "0": "pre-check", "1": "requirements", "2": "design", "3": "adversarial", "4": "planning",
    "5": "drift", "6": "build", "7": "denoise", "8": "quality-fit", "9": "tests", "10": "docs",
    "11": "security-review", "12": "code-review",
  };
  // The last phase the engine recorded as stuck is where it halted.
  const stuckPhases = Object.keys(phases)
    .filter(n => ["PAUSE", "STALE", "ERROR", "BUDGET"].includes(phases[n]))
    .sort((a, b) => Number(b) - Number(a));
  if (stuckPhases.length) return names[stuckPhases[0]] ?? `phase-${stuckPhases[0]}`;
  if (exit === 4) return "budget";
  return exit === null ? "timeout" : `exit-${exit}`;
}

function candidateDiff(wt: string, stateDir: string): { diff: string; numstat: string; files: string[] } {
  const idx = join(tmpdir(), `corpus-index-${process.pid}-${Date.now()}`);
  const env: NodeJS.ProcessEnv = { GIT_INDEX_FILE: idx };
  // The engine excludes the build-state symlinks it plants in the worktree
  // (node_modules, .venv, …) via a per-run core.excludesFile; honor the same
  // file so those links never count as candidate changes here either.
  const exclude = join(stateDir, "worktrees", `${basename(wt)}.exclude`);
  if (existsSync(exclude)) Object.assign(env, { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.excludesFile", GIT_CONFIG_VALUE_0: exclude });
  sh("git", ["add", "-A"], { cwd: wt, env });
  const diff = sh("git", ["diff", "--cached", "HEAD"], { cwd: wt, env }).stdout;
  const numstat = sh("git", ["diff", "--cached", "--numstat", "HEAD"], { cwd: wt, env }).stdout;
  rmSync(idx, { force: true });
  const files = numstat.split("\n").filter(Boolean).map(l => l.split("\t")[2]).filter(Boolean);
  return { diff, numstat, files };
}

// ---------------------------------------------------------------------------
// One task
// ---------------------------------------------------------------------------

function runTask(task: Task): Row {
  const startedAt = new Date();
  const work = mkdtempSync(join(tmpdir(), `corpus-${task.id}-`));
  const repo = join(work, "repo");
  const stateDir = join(work, "state");
  mkdirSync(stateDir, { recursive: true });

  // 1. Fixture → fresh git repo at baseline
  cpSync(join(FIXTURES, task.fixture), repo, {
    recursive: true,
    filter: (src) => !/(^|\/)(node_modules|\.git|__pycache__|\.pytest_cache|target|dist)(\/|$)/.test(src),
  });
  // Install before the baseline commit so the lockfile is part of the
  // baseline, as it would be in a real project (node_modules stays ignored).
  if (existsSync(join(repo, "package.json"))) {
    const r = sh("npm", ["install", "--no-audit", "--no-fund", "--silent"], { cwd: repo, timeoutMs: 10 * 60_000 });
    if (r.status !== 0) console.warn(`  [${task.id}] npm install failed (continuing): ${r.stderr.slice(0, 200)}`);
  }
  git(repo, "init", "-q");
  git(repo, "config", "user.email", "corpus@pipeline.invalid");
  git(repo, "config", "user.name", "Corpus Runner");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "baseline");
  const baseDeps = declaredDeps(repo);

  // 2. Engine
  const engineArgs = [`--provider=${PROVIDER}`, `--profile=${PROFILE}`, "--no-commit"];
  if (QUALITY) engineArgs.push(`--quality=${QUALITY}`);
  if (BUDGET) engineArgs.push(`--max-run-budget-usd=${BUDGET}`);
  let cmd: string; let args: string[];
  if (ENGINE === "bash") { cmd = "bash"; args = [join(ROOT, "run-pipeline.sh"), ...engineArgs, task.task]; }
  else { cmd = "node"; args = [join(ROOT, "engine", "dist", "cli.js"), ...engineArgs, task.task]; }
  const t0 = Date.now();
  const r = sh(cmd, args, {
    cwd: repo,
    env: { PIPELINE_NONINTERACTIVE: "1", PIPELINE_NO_NOTIFY: "1", PIPELINE_STATE_DIR: stateDir, CI: "1", NO_COLOR: "1" },
    timeoutMs: TIMEOUT_MIN * 60_000,
  });
  const wallClockMs = Date.now() - t0;
  const timedOut = r.signal === "SIGTERM" && r.status === null;
  writeFileSync(join(work, "engine.stdout"), r.stdout);
  writeFileSync(join(work, "engine.stderr"), r.stderr);

  // 3. Evidence
  const artifacts = findArtifacts(stateDir);
  const runJsonPath = artifacts ? join(artifacts, "run.json") : null;
  const run = runJsonPath && existsSync(runJsonPath) ? readJson<any>(runJsonPath) : null;
  const wt = findWorktree(stateDir, repo);
  const { diff, numstat, files } = candidateDiff(wt, stateDir);
  const candDeps = declaredDeps(wt);
  const slop = slopFromDiff(diff, numstat, baseDeps, candDeps);
  writeFileSync(join(work, "candidate.diff"), diff);
  const haltedAt = haltedWhere(r.status, run, r.stdout + r.stderr);

  // 4. Rubric
  const failures: string[] = []; const warnings: string[] = [];
  const rb = task.rubric || {};
  if (rb.must_touch?.length && !files.some(f => matchesAny(f, rb.must_touch))) failures.push(`must_touch: none of ${rb.must_touch.join(", ")} changed`);
  const forbiddenTouched = files.filter(f => matchesAny(f, rb.must_not_touch));
  if (forbiddenTouched.length) failures.push(`must_not_touch: ${forbiddenTouched.join(", ")}`);
  const forbiddenDeps = slop.newDeps.filter(d => (rb.forbidden_new_deps || []).map(x => x.toLowerCase()).includes(d.toLowerCase()));
  if (forbiddenDeps.length) failures.push(`forbidden_new_deps: ${forbiddenDeps.join(", ")}`);
  if (rb.diff_line_band) {
    const size = slop.addedLines + slop.removedLines;
    if (size < rb.diff_line_band[0]) warnings.push(`diff ${size} lines below band ${rb.diff_line_band.join("-")}`);
    if (size > rb.diff_line_band[1]) warnings.push(`diff ${size} lines above band ${rb.diff_line_band.join("-")}`);
  }

  // Forbidden content: scan every file the candidate changed or added.
  const forbiddenHits: string[] = [];
  for (const f of files) {
    const p = join(wt, f);
    if (!existsSync(p) || statSync(p).isDirectory()) continue;
    const text = readFileSync(p, "utf8");
    for (const needle of rb.forbidden_content || []) if (text.includes(needle)) forbiddenHits.push(`${f} contains ${needle.slice(0, 12)}…`);
  }
  if (forbiddenHits.length) failures.push(`forbidden_content: ${forbiddenHits.join(", ")}`);

  // 5. Hidden tests (only when the pipeline was supposed to finish)
  const hidden: Row["hiddenTests"] = { ran: false, exitCode: null, tail: "" };
  let pass = false; let reason = "";
  const haltedAsExpected = r.status === 3 && haltedAt === rb.expected_halt;
  if (task.hidden.expect === "halt") {
    pass = haltedAsExpected;
    reason = pass ? `halted at ${haltedAt} as expected` : `expected halt at ${rb.expected_halt}, got exit ${r.status} (${haltedAt ?? "completed"})`;
  } else if (task.hidden.expect === "halt-or-clean" && (haltedAsExpected || r.status !== 0)) {
    pass = haltedAsExpected;
    reason = pass ? `halted at ${haltedAt} as expected` : `expected a halt at ${rb.expected_halt} or a clean completion, got exit ${r.status} (${haltedAt})`;
  } else {
    if (r.status === 3 && haltedAt && (rb.acceptable_halts || []).includes(haltedAt)) {
      pass = true;
      reason = `halted at ${haltedAt} (acceptable for this task)`;
    } else if (r.status !== 0) {
      reason = `engine exit ${r.status ?? "timeout"} (${haltedAt})`;
    } else {
      const hiddenPaths: string[] = [];
      for (const c of task.hidden.copy) {
        const dst = join(wt, c.to);
        mkdirSync(dirname(dst), { recursive: true });
        cpSync(join(CORPUS, task.id, c.from), dst);
        hiddenPaths.push(dst);
      }
      disambiguateGoTests(hiddenPaths);
      const t = sh(task.test_command[0], task.test_command.slice(1), { cwd: wt, env: { CI: "1", NO_COLOR: "1" }, timeoutMs: 10 * 60_000 });
      hidden.ran = true; hidden.exitCode = t.status; hidden.tail = (t.stdout + "\n" + t.stderr).slice(-2000);
      const clean = task.hidden.expect === "halt-or-clean";
      if (t.status !== 0) reason = "hidden acceptance tests failed";
      else if (failures.length) reason = `rubric: ${failures.join("; ")}`;
      else { pass = true; reason = clean ? "completed clean: forbidden content absent, tests green" : "hidden tests green, rubric satisfied"; }
    }
  }

  const row: Row = {
    taskId: task.id, kind: task.kind, fixture: task.fixture, engine: ENGINE, provider: PROVIDER, profile: PROFILE, quality: QUALITY,
    startedAt: startedAt.toISOString(), wallClockMs, exitCode: r.status, timedOut,
    status: run?.status ?? null, haltedAt, phases: run?.phases ?? {},
    modelCalls: run?.totals?.modelCalls ?? null, costUsd: run?.totals?.estimatedCostUsd ?? null,
    tokens: run ? { input: run.totals?.inputTokens ?? 0, output: run.totals?.outputTokens ?? 0, cached: run.totals?.cachedTokens ?? 0 } : null,
    hiddenTests: hidden, rubric: { pass: failures.length === 0, failures, warnings }, slop, changedFiles: files,
    pass, reason, artifactsDir: KEEP ? work : null,
    engineTail: { stdout: tail(r.stdout), stderr: tail(r.stderr) },
  };
  if (!KEEP) rmSync(work, { recursive: true, force: true });
  return row;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// Go test functions share one namespace per package, so a candidate that
// authored `func TestTopNOfEmptyTextIsEmpty` next to the existing tests makes
// the package fail to compile once the hidden `_test.go` with the same name is
// copied in — a build failure that would score as "hidden tests failed" even
// when the code is right. Rename colliding candidate-authored test functions
// (declaration and any same-file references) so both sets run.
function disambiguateGoTests(hiddenPaths: string[]): void {
  const decl = /^func\s+((?:Test|Benchmark|Example|Fuzz)\w*)\s*\(/gm;
  for (const hidden of hiddenPaths) {
    if (!hidden.endsWith("_test.go")) continue;
    const names = [...readFileSync(hidden, "utf8").matchAll(decl)].map(m => m[1]);
    if (!names.length) continue;
    const dir = dirname(hidden);
    for (const entry of readdirSync(dir)) {
      const file = join(dir, entry);
      if (!entry.endsWith("_test.go") || hiddenPaths.includes(file)) continue;
      let text = readFileSync(file, "utf8");
      let changed = false;
      for (const name of names) {
        const re = new RegExp("\\b" + name + "\\b", "g");
        if (re.test(text)) { text = text.replace(re, name + "Candidate"); changed = true; }
      }
      if (changed) writeFileSync(file, text);
    }
  }
}

function main() {
  let tasks = loadTasks();
  if (ONLY.length) tasks = tasks.filter(t => ONLY.includes(t.id));
  if (SKIP.length) tasks = tasks.filter(t => !SKIP.includes(t.id));
  if (!tasks.length) { console.error("no tasks selected"); process.exit(2); }
  console.log(`corpus: ${tasks.length} task(s) · engine=${ENGINE} provider=${PROVIDER} profile=${PROFILE}${QUALITY ? ` quality=${QUALITY}` : ""}${BUDGET ? ` budget=$${BUDGET}` : ""}`);
  if (DRY_RUN) { for (const t of tasks) console.log(`  ${t.id} [${t.kind}] fixture=${t.fixture} expect=${t.hidden.expect}`); return; }

  mkdirSync(dirname(OUT), { recursive: true });
  const rows: Row[] = existsSync(OUT) ? readJson<Row[]>(OUT).filter(r => !tasks.some(t => t.id === r.taskId)) : [];
  for (const task of tasks) {
    process.stdout.write(`▶ ${task.id} [${task.kind}] … `);
    let row: Row;
    try { row = runTask(task); }
    catch (e: any) {
      row = {
        taskId: task.id, kind: task.kind, fixture: task.fixture, engine: ENGINE, provider: PROVIDER, profile: PROFILE, quality: QUALITY,
        startedAt: new Date().toISOString(), wallClockMs: 0, exitCode: null, timedOut: false, status: null, haltedAt: "runner-error",
        phases: {}, modelCalls: null, costUsd: null, tokens: null, hiddenTests: { ran: false, exitCode: null, tail: "" },
        rubric: { pass: false, failures: [String(e?.message || e)], warnings: [] }, slop: null, changedFiles: [],
        pass: false, reason: `runner error: ${String(e?.message || e)}`, artifactsDir: null,
        engineTail: { stdout: "", stderr: String(e?.stack || "") },
      };
    }
    rows.push(row);
    writeFileSync(OUT, JSON.stringify(rows, null, 2) + "\n");
    const cost = row.costUsd != null ? `$${row.costUsd.toFixed(2)}` : "cost n/a";
    console.log(`${row.pass ? "PASS" : "FAIL"} · ${(row.wallClockMs / 60000).toFixed(1)} min · ${cost} · ${row.reason}`);
  }
  const passed = rows.filter(r => r.pass).length;
  console.log(`\n${passed}/${rows.length} passed → ${OUT}`);
}

main();
