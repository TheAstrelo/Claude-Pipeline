/**
 * Verification commands: detection, freezing, execution, classification.
 *
 * This is the module the whole gate system rests on. A phase can claim
 * anything; what the orchestrator runs here is the only signal a model cannot
 * fake. Three rules make that true:
 *
 * 1. Commands are argv arrays run without a shell, so repository or model text
 *    never reaches `sh -c`.
 * 2. The plan is frozen at startup and re-derived at every check boundary. If
 *    a run edits the scripts its own gate calls, that is drift and the run
 *    halts — not overridable by any flag or profile.
 * 3. Every run is bracketed by candidate-tree snapshots. A test process that
 *    changes the tree invalidates its own evidence.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, openSync, fsyncSync, closeSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { redact } from "./redact.js";
import { candidateTreeOid, git, gitOut, isGitRepo, type GitContext } from "./git.js";

export type CheckName = "test" | "build" | "typecheck" | "lint" | "docs";
export const CHECK_NAMES: readonly CheckName[] = ["test", "build", "typecheck", "lint", "docs"] as const;

export type CheckStatus =
  | "PASS" | "FAIL" | "TIMEOUT" | "UNAVAILABLE" | "SIGNALED"
  | "NOT_CONFIGURED" | "UNBOUND" | "UNSTABLE" | "FAIL_PREEXISTING";

/** Exit codes reserved for integrity failures the runner detects itself. */
export const EXIT_UNSTABLE = 86;
export const EXIT_UNBOUND = 87;
/** Sentinel meaning "no command was configured", serialized as null. */
export const EXIT_NOT_CONFIGURED = -1;

export interface ExecutableIdentity {
  name: string;
  resolvedPath: string | null;
  sha256: string | null;
}

export interface VerificationPlan {
  schemaVersion: 1;
  frozen: true;
  source: "engine-detection" | "explicit-config";
  commandTimeoutSeconds: number;
  executionPolicy: { shell: false; descriptorChange: "halt"; candidateTreeChange: "halt" };
  packagePolicy: {
    present: boolean;
    configuredManager: string | null;
    detectedManager: string | null;
    selectedScripts: Record<CheckName, string | null>;
    /** Verbatim bodies of every pre/base/post script that could weaken a gate. */
    recognizedScripts: Record<string, string | null>;
  };
  commands: Record<CheckName, string[]>;
  executableIdentities: Record<CheckName, ExecutableIdentity | null>;
}

const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;
type PackageManager = (typeof PACKAGE_MANAGERS)[number];

/** Script names tried per target, first match wins. */
const SCRIPT_CANDIDATES: Record<CheckName, string[]> = {
  test: ["test"],
  build: ["build"],
  typecheck: ["typecheck", "type-check", "check-types"],
  lint: ["lint"],
  docs: ["docs:check", "docs-check", "check-docs"],
};

/** Every script whose body could weaken a gate if edited mid-run. */
const RECOGNIZED_BASES = ["test", "build", "typecheck", "type-check", "check-types", "lint", "docs:check", "docs-check", "check-docs"];

export class DetectionError extends Error {}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function which(command: string): string | null {
  const dirs = (process.env.PATH ?? "").split(":").filter(Boolean);
  for (const dir of dirs) {
    const candidate = join(dir, command);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function executableIdentity(argv: string[]): ExecutableIdentity | null {
  const name = argv[0];
  if (!name) return null;
  const resolvedPath = which(name);
  let digest: string | null = null;
  if (resolvedPath) {
    try { digest = sha256(readFileSync(resolvedPath)); } catch { digest = null; }
  }
  return { name, resolvedPath, sha256: digest };
}

interface PackageJson {
  scripts?: Record<string, unknown>;
  packageManager?: unknown;
}

function readPackageJson(root: string): PackageJson | null {
  const path = join(root, "package.json");
  if (!existsSync(path)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new DetectionError("package.json is malformed; verification detection cannot fail open.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new DetectionError("package.json is malformed; verification detection cannot fail open.");
  }
  const pkg = parsed as PackageJson;
  if (pkg.scripts !== undefined && (typeof pkg.scripts !== "object" || pkg.scripts === null || Array.isArray(pkg.scripts))) {
    throw new DetectionError("package.json is malformed; verification detection cannot fail open.");
  }
  return pkg;
}

function scriptBody(pkg: PackageJson | null, name: string): string | null {
  const value = pkg?.scripts?.[name];
  return typeof value === "string" ? value : null;
}

/** A usable script: non-blank, and not npm's "no test specified" stub. */
function hasScript(pkg: PackageJson | null, name: string): boolean {
  const body = scriptBody(pkg, name);
  if (!body || !body.trim()) return false;
  if (name === "test" && /no test specified/i.test(body)) return false;
  return true;
}

function detectPackageManager(root: string, pkg: PackageJson): { configured: string | null; detected: string | null; selected: PackageManager } {
  let configured: string | null = null;
  if (typeof pkg.packageManager === "string" && pkg.packageManager.trim()) {
    const manager = pkg.packageManager.trim().split("@")[0] ?? "";
    if (!PACKAGE_MANAGERS.includes(manager as PackageManager)) {
      throw new DetectionError("package.json has an unsupported packageManager declaration.");
    }
    configured = manager;
  }

  const families: Array<[PackageManager, string[]]> = [
    ["bun", ["bun.lock", "bun.lockb"]],
    ["pnpm", ["pnpm-lock.yaml"]],
    ["yarn", ["yarn.lock"]],
    ["npm", ["package-lock.json", "npm-shrinkwrap.json"]],
  ];
  const found = families.filter(([, files]) => files.some(f => existsSync(join(root, f)))).map(([m]) => m);
  if (found.length > 1) {
    throw new DetectionError("Multiple package-manager lockfile families were found; verification routing is ambiguous.");
  }
  const detected = found[0] ?? null;
  if (configured && detected && configured !== detected) {
    throw new DetectionError("packageManager and lockfile manager disagree; verification routing is ambiguous.");
  }
  return { configured, detected, selected: (configured ?? detected ?? "npm") as PackageManager };
}

function packageScriptArgv(manager: PackageManager, target: CheckName, script: string): string[] {
  if (manager === "bun") return ["bun", "run", script];
  if (target === "test") return [manager, "test"];
  return [manager, "run", script];
}

function fileHasMatch(path: string, pattern: RegExp): boolean {
  if (!existsSync(path)) return false;
  try { return pattern.test(readFileSync(path, "utf8")); } catch { return false; }
}

/**
 * Detect the repository's verification commands. Runs exactly once per run,
 * before anything is frozen; never re-run after the model writes, because
 * re-detection would defeat the freeze.
 */
export function detectVerificationCommands(root: string, timeoutSeconds: number): VerificationPlan {
  const commands: Record<CheckName, string[]> = { test: [], build: [], typecheck: [], lint: [], docs: [] };
  const selectedScripts: Record<CheckName, string | null> = { test: null, build: null, typecheck: null, lint: null, docs: null };
  const recognizedScripts: Record<string, string | null> = {};
  let configuredManager: string | null = null;
  let detectedManager: string | null = null;

  const pkg = readPackageJson(root);
  const present = pkg !== null;

  if (pkg) {
    // Node wins outright: a repository with a package.json is a Node project,
    // even when it also carries a go.mod for a sidecar tool.
    const manager = detectPackageManager(root, pkg);
    configuredManager = manager.configured;
    detectedManager = manager.detected;
    for (const target of CHECK_NAMES) {
      const script = SCRIPT_CANDIDATES[target].find(name => hasScript(pkg, name));
      if (!script) continue;
      selectedScripts[target] = script;
      commands[target] = packageScriptArgv(manager.selected, target, script);
    }
    for (const base of RECOGNIZED_BASES) {
      for (const name of [`pre${base}`, base, `post${base}`]) {
        recognizedScripts[name] = scriptBody(pkg, name);
      }
    }
  } else if (existsSync(join(root, "go.mod"))) {
    commands.test = ["go", "test", "./..."];
    commands.build = ["go", "build", "./..."];
    commands.typecheck = ["go", "vet", "./..."];
    const hasGolangci =
      which("golangci-lint") !== null ||
      [".golangci.yml", ".golangci.yaml", ".golangci.toml", ".golangci.json"].some(f => existsSync(join(root, f)));
    if (hasGolangci) commands.lint = ["golangci-lint", "run"];
  } else if (existsSync(join(root, "Cargo.toml"))) {
    commands.test = ["cargo", "test"];
    commands.build = ["cargo", "build", "--all-targets"];
    commands.typecheck = ["cargo", "check", "--all-targets"];
    commands.lint = ["cargo", "clippy", "--all-targets", "--", "-D", "warnings"];
    commands.docs = ["cargo", "doc", "--no-deps"];
  } else if (["pyproject.toml", "pytest.ini", "setup.cfg"].some(f => existsSync(join(root, f)))) {
    const py = which("python3") ? "python3" : which("python") ? "python" : "python";
    const pyproject = join(root, "pyproject.toml");
    const setupCfg = join(root, "setup.cfg");
    if (existsSync(join(root, "pytest.ini")) ||
        fileHasMatch(pyproject, /\[tool\.pytest|pytest/) || fileHasMatch(setupCfg, /\[tool\.pytest|pytest/)) {
      commands.test = [py, "-m", "pytest", "-q"];
    }
    if (existsSync(join(root, "mypy.ini")) || existsSync(join(root, ".mypy.ini")) ||
        fileHasMatch(pyproject, /\[tool\.mypy|\[mypy\]/) || fileHasMatch(setupCfg, /\[tool\.mypy|\[mypy\]/)) {
      commands.typecheck = [py, "-m", "mypy", "."];
    }
    if (existsSync(join(root, "ruff.toml")) || existsSync(join(root, ".ruff.toml")) || fileHasMatch(pyproject, /\[tool\.ruff/)) {
      commands.lint = [py, "-m", "ruff", "check", "."];
    }
    if (existsSync(join(root, "mkdocs.yml"))) commands.docs = [py, "-m", "mkdocs", "build", "--strict"];
  }

  const executableIdentities = {} as Record<CheckName, ExecutableIdentity | null>;
  for (const name of CHECK_NAMES) executableIdentities[name] = commands[name].length ? executableIdentity(commands[name]) : null;

  return {
    schemaVersion: 1,
    frozen: true,
    source: "engine-detection",
    commandTimeoutSeconds: timeoutSeconds,
    executionPolicy: { shell: false, descriptorChange: "halt", candidateTreeChange: "halt" },
    packagePolicy: { present, configuredManager, detectedManager, selectedScripts, recognizedScripts },
    commands,
    executableIdentities,
  };
}

/** Digest of the whole plan; the value drift detection compares against. */
export function planDigest(plan: VerificationPlan): string {
  return sha256(JSON.stringify(plan));
}

export class VerificationDriftError extends Error {
  constructor(message: string, readonly kind: "missing" | "modified" | "redetected") {
    super(message);
  }
}

/**
 * Re-derive the plan from the current filesystem and compare it to the frozen
 * one. Catches a weakened test script, an added pretest hook, a swapped
 * package manager, a changed test binary — anything that would make the gate
 * measure something other than what was frozen.
 */
export function assertPlanUnchanged(root: string, frozen: VerificationPlan, frozenDigest: string): void {
  let live: VerificationPlan;
  try {
    live = detectVerificationCommands(root, frozen.commandTimeoutSeconds);
  } catch (error) {
    throw new VerificationDriftError(
      `Verification descriptors could not be re-derived: ${(error as Error).message}`, "redetected");
  }
  if (planDigest(live) !== frozenDigest) {
    throw new VerificationDriftError(
      "Verification descriptors changed during the run. Start a fresh pipeline to adopt them.", "modified");
  }
}

export interface CommandOutcome {
  argv: string[];
  exitCode: number;
  status: CheckStatus;
  timedOut: boolean;
  signal: string | null;
  /** Redacted, complete. Artifacts keep the whole thing. */
  output: string;
  durationMs: number;
  /** True when redaction itself failed; the output is then withheld. */
  redactionFailed: boolean;
}

export interface RunCommandOptions {
  cwd: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
}

/**
 * Run one frozen command. No shell, no stdin, a hard wall-clock bound, and the
 * whole process group reaped on every exit path — a background descendant that
 * outlived its parent could otherwise mutate the tree after the post-run
 * snapshot and turn an integrity failure into a flake.
 */
export function runCommand(argv: string[], options: RunCommandOptions): Promise<CommandOutcome> {
  const started = Date.now();
  const [command, ...args] = argv;
  if (!command) {
    return Promise.resolve({
      argv, exitCode: EXIT_NOT_CONFIGURED, status: "NOT_CONFIGURED", timedOut: false, signal: null,
      output: "No trusted command was configured; nothing was run.\n", durationMs: 0, redactionFailed: false,
    });
  }

  return new Promise<CommandOutcome>(resolve => {
    const chunks: Buffer[] = [];
    let settled = false;
    let timedOut = false;

    const child = spawn(command, args, {
      cwd: options.cwd,
      // CI=1 forces test runners out of watch mode; the color vars keep the
      // captured evidence free of ANSI noise. Environment, not argv, so the
      // frozen descriptor identity is unaffected.
      env: { ...process.env, ...options.env, CI: "1", FORCE_COLOR: "0", NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      detached: true,
    });

    const collect = (buffer: Buffer) => { chunks.push(buffer); };
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);

    const killGroup = (signal: NodeJS.Signals) => {
      try { if (child.pid) process.kill(-child.pid, signal); } catch { /* already gone */ }
    };

    // TERM at the deadline, KILL ten seconds later: a test runner gets a
    // chance to flush its output before it is taken out.
    let hardTimer: NodeJS.Timeout | null = null;
    const softTimer = setTimeout(() => {
      timedOut = true;
      killGroup("SIGTERM");
      hardTimer = setTimeout(() => killGroup("SIGKILL"), 10_000);
    }, options.timeoutMs);

    const finish = (code: number, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(softTimer);
      if (hardTimer) clearTimeout(hardTimer);
      // Sweep any descendants left behind by a "successful" run.
      killGroup("SIGTERM");
      setTimeout(() => {
        killGroup("SIGKILL");
        let output = Buffer.concat(chunks).toString("utf8");
        if (timedOut) output += `\n[pipeline] Command timed out after ${Math.round(options.timeoutMs / 1000)} seconds.\n`;
        let redactionFailed = false;
        try { output = redact(output); } catch { redactionFailed = true; output = "[pipeline] Output withheld: redaction failed.\n"; }
        const exitCode = timedOut ? 124 : code;
        resolve({
          argv, exitCode, status: classifyExit(exitCode, signal), timedOut, signal,
          output, durationMs: Date.now() - started, redactionFailed,
        });
      }, 100);
    };

    child.on("error", error => {
      chunks.push(Buffer.from(`\n[pipeline] ${(error as Error).message}\n`));
      // ENOENT/EACCES are "the tool is not here", not "the code is broken".
      const code = (error as NodeJS.ErrnoException).code === "ENOENT" ? 127 : 126;
      finish(code, null);
    });
    child.on("close", (code, signal) => finish(code ?? (signal ? 128 : 1), signal));
  });
}

/**
 * Classify a raw exit. Unlike the shell engine, a signalled death is reported
 * as SIGNALED on every platform, because the child's signal is available here
 * rather than only under GNU timeout.
 */
export function classifyExit(exitCode: number, signal: NodeJS.Signals | null): CheckStatus {
  if (exitCode === EXIT_NOT_CONFIGURED) return "NOT_CONFIGURED";
  if (exitCode === 0) return "PASS";
  if (exitCode === 124) return "TIMEOUT";
  if (exitCode === 126 || exitCode === 127) return "UNAVAILABLE";
  if (signal) return "SIGNALED";
  return "FAIL";
}

export interface TreeBinding {
  tree: string | null;
  control: string | null;
}

/**
 * Snapshot the candidate tree and Git control state. Taken before and after
 * every verification run: if they differ, the command changed the thing it was
 * measuring and its evidence is void.
 */
export function bindTree(ctx: GitContext, baseHead: string, pathspec: string[]): TreeBinding {
  if (!isGitRepo(ctx)) return { tree: null, control: null };
  const tree = candidateTreeOid(ctx, baseHead, pathspec);
  const parts = [
    "head", gitOut(ctx, ["rev-parse", "HEAD"]) ?? "",
    "symbolic-head", gitOut(ctx, ["symbolic-ref", "-q", "HEAD"]) ?? "DETACHED",
    "real-index-tree", gitOut(ctx, ["write-tree"]) ?? "",
    "porcelain", git(ctx, ["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all", "--ignore-submodules=none", "--", ...pathspec]).stdout,
    "submodules", git(ctx, ["submodule", "status", "--recursive"]).stdout,
  ];
  return { tree, control: sha256(parts.join("\0")) };
}

export interface VerifiedRun extends CommandOutcome {
  before: TreeBinding;
  after: TreeBinding;
  /** Set when the run must halt the pipeline regardless of profile. */
  integrityFailure: "UNSTABLE" | "UNBOUND" | null;
}

/**
 * Run a frozen command bracketed by tree snapshots. A command that changes the
 * candidate tree, or one whose binding cannot be taken at all, produces an
 * integrity failure the caller must treat as non-overridable.
 */
export async function runVerified(
  argv: string[],
  options: RunCommandOptions & { ctx: GitContext; baseHead: string; pathspec: string[] },
): Promise<VerifiedRun> {
  const gitBound = isGitRepo(options.ctx);
  const before = bindTree(options.ctx, options.baseHead, options.pathspec);
  const outcome = await runCommand(argv, options);
  const after = bindTree(options.ctx, options.baseHead, options.pathspec);

  let integrityFailure: VerifiedRun["integrityFailure"] = null;
  let status = outcome.status;
  let exitCode = outcome.exitCode;

  if (gitBound && argv.length > 0) {
    if (!before.tree || !before.control || !after.tree || !after.control) {
      integrityFailure = "UNBOUND";
      status = "UNBOUND";
      exitCode = EXIT_UNBOUND;
    } else if (before.tree !== after.tree || before.control !== after.control) {
      integrityFailure = "UNSTABLE";
      status = "UNSTABLE";
      exitCode = EXIT_UNSTABLE;
    }
  }
  return { ...outcome, exitCode, status, before, after, integrityFailure };
}

export type BaselineStatuses = Record<CheckName, CheckStatus>;

/**
 * Run the whole matrix against the untouched baseline. Checks already failing
 * here are pre-existing: they are reported later but never gate, so a run is
 * judged on what it changed rather than on the state it inherited.
 */
export async function runBaseline(options: {
  plan: VerificationPlan;
  ctx: GitContext;
  cwd: string;
  timeoutMs: number;
  artifactsDir: string;
}): Promise<{ statuses: BaselineStatuses; selfDirtying: string[] }> {
  const statuses = {} as BaselineStatuses;
  const beforeStatus = git(options.ctx, ["status", "--porcelain", "--untracked-files=all"]).stdout;

  for (const name of CHECK_NAMES) {
    const argv = options.plan.commands[name];
    if (!argv.length) { statuses[name] = "NOT_CONFIGURED"; continue; }
    const outcome = await runCommand(argv, { cwd: options.cwd, timeoutMs: options.timeoutMs });
    statuses[name] = outcome.status;
    writeArtifact(join(options.artifactsDir, `baseline-${name}-output.txt`), outcome.output);
  }

  // A check that writes into the tree would contaminate every later candidate
  // snapshot and surface as an opaque integrity failure much later. The
  // engine's own evidence files are excluded: those are our writes, not the
  // project's, and the run state directory is not always gitignored yet.
  const afterStatus = git(options.ctx, ["status", "--porcelain", "--untracked-files=all"]).stdout;
  const engineOwned = relative(options.ctx.cwd, options.artifactsDir);
  const selfDirtying = diffLines(beforeStatus, afterStatus, engineOwned);

  writeArtifact(join(options.artifactsDir, "baseline-checks.json"), JSON.stringify({
    schemaVersion: 1,
    source: "orchestrator-baseline",
    checks: Object.fromEntries(CHECK_NAMES.map(n => [n, { status: statuses[n] }])),
  }, null, 2) + "\n");

  return { statuses, selfDirtying };
}

function diffLines(before: string, after: string, ignorePrefix: string): string[] {
  const beforeSet = new Set(before.split("\n"));
  const engineOwned = ignorePrefix && !ignorePrefix.startsWith("..")
    ? ignorePrefix.split("/")[0] + "/"
    : null;
  return after.split("\n").filter(line => {
    if (!line.trim() || beforeSet.has(line)) return false;
    if (!engineOwned) return true;
    // Porcelain lines look like "?? path" or " M path".
    const path = line.slice(3);
    return !path.startsWith(engineOwned);
  });
}

/**
 * A check that was already failing at baseline is reported as pre-existing and
 * does not gate. Only a plain FAIL qualifies: a check that timed out or was
 * missing at baseline still gates when it fails later, because that is not the
 * same signal.
 */
export function applyBaselineTag(status: CheckStatus, baseline: CheckStatus | undefined): CheckStatus {
  if (status === "FAIL" && baseline === "FAIL") return "FAIL_PREEXISTING";
  return status;
}

/** Does this status stop the run from proceeding to security and review? */
export function gatesRelease(status: CheckStatus): boolean {
  return status !== "PASS" && status !== "NOT_CONFIGURED" && status !== "FAIL_PREEXISTING";
}

/** Atomic, private write; artifacts can carry redacted command output. */
export function writeArtifact(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, body, { mode: 0o600 });
  const fd = openSync(temp, "r+");
  try { fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temp, path);
  chmodSync(path, 0o600);
}

export function commandDisplay(argv: string[]): string {
  return argv.map(part => (/[^A-Za-z0-9_./:=-]/.test(part) ? JSON.stringify(part) : part)).join(" ");
}
