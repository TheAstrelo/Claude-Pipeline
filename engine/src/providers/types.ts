/**
 * The executor adapter contract (PIPELINE-SPEC.md §6).
 *
 * An adapter runs one phase in a fresh context and returns what the phase
 * produced. It never decides anything: gating reads orchestrator-captured
 * evidence, and an adapter's claims only ever become evidence after the
 * orchestrator has verified them.
 */

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** Model lanes. `review` is a deliberately different model from `strong`. */
export type Lane = "strong" | "balanced" | "review";

/**
 * What a phase may touch.
 * - `read`      — read the tree, nothing else (drift, docs checks)
 * - `read-exec` — read plus a scoped command allowlist (reviewers: git log,
 *                 the frozen verification argv, dependency audits)
 * - `read-web`  — read plus web search (research phases only)
 * - `write-exec`— edit the worktree and run commands (build, qa-fix, heal)
 */
export type ToolScope = "read" | "read-exec" | "read-web" | "write-exec";

export type Sandbox = "read-only" | "workspace-write";

/** How a call ended, normalized across adapters. */
export type ExitClass =
  | "ok"
  | "budget"            // hit the per-call cap; may be retried with a bigger one
  | "timeout"
  | "transient"         // API error worth one retry
  | "model-unavailable" // wrong id, no access, out of credits: fall back a lane
  | "error";            // anything else, including an unparseable reply

export interface ExecuteRequest {
  /** Stable label for logs, ledger events and artifact names (e.g. "build"). */
  label: string;
  prompt: string;
  model: string;
  effort: Effort;
  toolScope: ToolScope;
  sandbox: Sandbox;
  /** The run worktree. Adapters must not run anywhere else. */
  cwd: string;
  /** Extra readable directories (the artifacts dir, so a phase can read its inputs). */
  addDirs?: string[];
  /**
   * JSON schema for a typed verdict. Adapters that cannot do structured
   * output ignore it; the caller always accepts the markdown fallback.
   */
  schema?: Record<string, unknown> | null;
  /** Per-call cap in USD. `null` means uncapped (the default at --quality=max). */
  budgetUsd?: number | null;
  timeoutMs: number;
  /**
   * Adapter-specific command allow rules for `read-exec` (e.g.
   * `Bash(git log:*)`). Ignored by adapters without per-tool scoping.
   */
  allowRules?: string[];
  /** Commands a `write-exec` phase must never run (checked before execution). */
  denyCommands?: DenyRule[];
  /** Absolute paths a `write-exec` phase must never edit. */
  protectedPaths?: string[];
  /** Run after every successful file write (formatter). argv, not a shell string. */
  formatCommand?: string[] | null;
}

export interface DenyRule {
  /** Matched against the command line the phase is about to run. */
  pattern: RegExp;
  reason: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  /** USD, or null when the runtime does not report cost (budgets go advisory). */
  costUsd: number | null;
}

export interface ExecuteResult {
  /** The phase report body. Empty string when the call produced nothing usable. */
  report: string;
  /** The typed verdict when the adapter returned one, else null. */
  structured: unknown | null;
  usage: Usage;
  exit: ExitClass;
  /** Present when `exit` is not "ok". */
  errorMessage?: string;
  /** Tool calls the sandbox refused, for the ledger. */
  denials: string[];
  /** Wall-clock of the call. */
  durationMs: number;
}

/**
 * What an adapter can actually enforce. Missing capabilities downgrade trust
 * rather than being assumed (PIPELINE-SPEC.md §6): an adapter that cannot
 * isolate context or scope tools runs audit-only.
 */
export interface Capabilities {
  /** No user config, memory, or repo-controlled instruction files. */
  contextIsolation: boolean;
  /** Per-tool scoping or a sandbox that makes read-only phases read-only. */
  toolScoping: boolean;
  /** Reports real spend, so budget caps can be enforced rather than estimated. */
  costReporting: boolean;
  /** Can return a typed verdict against a JSON schema. */
  structuredOutput: boolean;
  /** Can block a command or a protected-file edit before it happens. */
  commandGuards: boolean;
}

export interface Adapter {
  readonly id: string;
  /** Model ids for the three lanes, after any preflight fallback. */
  readonly models: Record<Lane, string>;
  readonly capabilities: Capabilities;
  /** Highest effort this runtime accepts; requests are clamped to it. */
  readonly effortCeiling: Effort;
  execute(request: ExecuteRequest): Promise<ExecuteResult>;
  /**
   * Cheap probe that a call can authenticate and that each distinct routed
   * model is usable. Returns the lane→model map actually usable, having
   * applied fallbacks, or throws when the adapter cannot run at all.
   */
  preflight(): Promise<PreflightReport>;
  /** Release any long-lived resources. */
  dispose?(): Promise<void>;
}

export interface PreflightReport {
  ok: boolean;
  /** Lane → model after fallbacks. */
  models: Record<Lane, string>;
  /** Human-readable fallback notes, e.g. "review: fable-5-1 → opus-5". */
  fallbacks: string[];
  /** Set when ok is false. */
  error?: string;
}

const EFFORT_RANK: Record<Effort, number> = {
  low: 0, medium: 1, high: 2, xhigh: 3, max: 4,
};

/** Clamp a requested effort to what the runtime accepts. */
export function clampEffort(requested: Effort, ceiling: Effort): Effort {
  return EFFORT_RANK[requested] <= EFFORT_RANK[ceiling] ? requested : ceiling;
}

export function emptyUsage(): Usage {
  return { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: null };
}
