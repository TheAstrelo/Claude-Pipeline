/**
 * Profiles, quality presets, model routing and budget policy.
 *
 * Everything that decides "which model, how hard, how much may it spend, and
 * what happens when a gate fails" lives here, so the stage machine never
 * makes those calls inline.
 */

import type { Effort, Lane } from "./providers/types.js";

/** The six model roles. Phases 0/1/2/4 collapse into `plan`. */
export type Role = "plan" | "critique" | "build" | "qafix" | "security" | "review";

export const ROLES: readonly Role[] = ["plan", "critique", "build", "qafix", "security", "review"] as const;

export type Quality = "max" | "balanced" | "cheap";
export type Profile = "yolo" | "fast" | "standard" | "paranoid";
export type GateMode = "soft" | "standard" | "mixed" | "hard";
export type BudgetPolicy = "elastic" | "strict";
export type ProviderId = "auto" | "claude" | "codex";

export interface Routing {
  lane: Lane;
  effort: Effort;
}

/**
 * Lane and effort per role per quality preset (IMPLEMENTATION-PLAN-V2.md M2/M3).
 * `max` is the default: money is not the constraint, correctness is.
 */
const ROUTING: Record<Quality, Record<Role, Routing>> = {
  max: {
    plan:     { lane: "strong",   effort: "xhigh" },
    critique: { lane: "review",   effort: "xhigh" },
    build:    { lane: "strong",   effort: "xhigh" },
    qafix:    { lane: "balanced", effort: "high" },
    security: { lane: "strong",   effort: "xhigh" },
    review:   { lane: "review",   effort: "max" },
  },
  balanced: {
    plan:     { lane: "strong",   effort: "high" },
    critique: { lane: "strong",   effort: "high" },
    build:    { lane: "strong",   effort: "high" },
    qafix:    { lane: "balanced", effort: "medium" },
    security: { lane: "strong",   effort: "high" },
    review:   { lane: "strong",   effort: "xhigh" },
  },
  cheap: {
    plan:     { lane: "balanced", effort: "medium" },
    critique: { lane: "balanced", effort: "medium" },
    build:    { lane: "balanced", effort: "medium" },
    qafix:    { lane: "balanced", effort: "low" },
    security: { lane: "balanced", effort: "high" },
    review:   { lane: "balanced", effort: "high" },
  },
};

export function routeRole(role: Role, quality: Quality): Routing {
  return ROUTING[quality][role];
}

/**
 * Sub-calls inherit the routing of the role they serve, never a cheaper lane:
 * a fix pass writes the same code the build did, and a refuter that is weaker
 * than the reviewer it refutes would just launder findings away.
 */
export function routeSubCall(parent: Role, quality: Quality): Routing {
  return routeRole(parent, quality);
}

export interface ProfileConfig {
  /** Roles this profile does not run at all. */
  skip: readonly Role[];
  gateMode: GateMode;
  /** Bounded recovery attempts. */
  maxCritiqueRetries: number;
  maxPlanLintRetries: number;
  maxBuildFixAttempts: number;
  maxReviewHeals: number;
  /** paranoid refuses to let a weak model approve. */
  requireStrongReviewer: boolean;
}

export const PROFILES: Record<Profile, ProfileConfig> = {
  yolo: {
    skip: ["critique", "qafix"],
    gateMode: "soft",
    maxCritiqueRetries: 0,
    maxPlanLintRetries: 1,
    maxBuildFixAttempts: 1,
    maxReviewHeals: 1,
    requireStrongReviewer: false,
  },
  fast: {
    skip: ["qafix"],
    gateMode: "standard",
    maxCritiqueRetries: 1,
    maxPlanLintRetries: 1,
    maxBuildFixAttempts: 2,
    maxReviewHeals: 2,
    requireStrongReviewer: false,
  },
  standard: {
    skip: [],
    gateMode: "mixed",
    maxCritiqueRetries: 1,
    maxPlanLintRetries: 1,
    maxBuildFixAttempts: 2,
    maxReviewHeals: 2,
    requireStrongReviewer: false,
  },
  paranoid: {
    skip: [],
    gateMode: "hard",
    maxCritiqueRetries: 2,
    maxPlanLintRetries: 2,
    maxBuildFixAttempts: 3,
    maxReviewHeals: 3,
    requireStrongReviewer: true,
  },
};

export interface BudgetConfig {
  policy: BudgetPolicy;
  /** Per-call cap in USD, or null for uncapped. */
  perCallUsd: number | null;
  /** Whole-run cap in USD, or null for uncapped. */
  runUsd: number | null;
  /** How many times one call may double its cap (elastic only). */
  maxExtensions: number;
}

/**
 * Budgets are opt-in. Without a run cap the run is uncapped and a per-call cap
 * exists only as a runaway stop; with a run cap the elastic default returns.
 */
export function resolveBudget(opts: {
  policy: BudgetPolicy;
  perCallUsd: number | null;
  runUsd: number | null;
  maxExtensions?: number;
}): BudgetConfig {
  const runUsd = opts.runUsd;
  let perCallUsd = opts.perCallUsd;
  if (perCallUsd === null) perCallUsd = runUsd === null ? null : 4.0;
  return {
    policy: opts.policy,
    perCallUsd,
    runUsd,
    maxExtensions: opts.maxExtensions ?? 2,
  };
}

/**
 * Gate severity. HARD stops the run for a human; SOFT warns except in
 * `hard` mode; NONE never stops.
 */
export type GateKind = "HARD" | "SOFT" | "NONE";

export type GateOutcome = "proceed" | "warn" | "halt";

export function applyGate(kind: GateKind, passed: boolean, mode: GateMode): GateOutcome {
  if (passed) return "proceed";
  if (kind === "NONE") return "proceed";
  if (kind === "HARD") return "halt";
  // SOFT
  return mode === "hard" ? "halt" : "warn";
}

export interface EngineConfig {
  task: string;
  provider: ProviderId;
  quality: Quality;
  profile: Profile;
  budget: BudgetConfig;
  /** Model overrides; null means "use the adapter's default for that lane". */
  models: { strong: string | null; balanced: string | null; review: string | null };
  commit: boolean;
  allowDirty: boolean;
  allowUntestedCommit: boolean;
  push: boolean;
  openPr: boolean;
  /** Wall-clock cap per model call. */
  callTimeoutMs: number;
  /** Wall-clock cap per verification command. */
  commandTimeoutMs: number;
  stateDir: string;
  repoRoot: string;
  resumeRunId: string | null;
  nonInteractive: boolean;
  baselineChecks: boolean;
}

export function profileOf(config: EngineConfig): ProfileConfig {
  return PROFILES[config.profile];
}

export function runsRole(config: EngineConfig, role: Role): boolean {
  return !PROFILES[config.profile].skip.includes(role);
}
