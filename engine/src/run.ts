/**
 * The stage machine.
 *
 * Each stage produces evidence, the gate reads that evidence, and a checkpoint
 * records enough to resume. The ordering rules that matter:
 *
 * - Nothing is committed that was not verified, scanned and reviewed as the
 *   same tree. Any write after those steps invalidates them and they re-run.
 * - Only orchestrator-captured evidence gates. A phase's own claim about the
 *   tests never substitutes for the test run.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyBaselineTag, assertPlanUnchanged, CHECK_NAMES, commandDisplay, detectVerificationCommands,
  gatesRelease, planDigest, runBaseline, runVerified, VerificationDriftError, writeArtifact,
  type BaselineStatuses, type CheckName, type CheckStatus, type VerificationPlan,
} from "./checks.js";
import { buildContextPack, type ContextPack } from "./context.js";
import {
  applyRefutations, decideReviewGate, findUncoveredCriteria, lintPlan,
  type Finding, type GateDecision,
} from "./gates.js";
import {
  candidateChangedFiles, candidateDiff, candidatePathspec, commitReviewedTree, createRunWorktree,
  ensureIgnoredStateDir, headSha, isClean, isGitRepo, pushBranch, removeRunWorktree, treeOfCommit,
  candidateTreeOid, excludeEnvFor, git, type GitContext, type Worktree,
} from "./git.js";
import { Ledger } from "./ledger.js";
import { scanCandidate, ScannerEscapeError, type SecurityEvidence } from "./security.js";
import { applyGate, profileOf, routeRole, runsRole, type EngineConfig, type Role } from "./config.js";
import type { Adapter, ExecuteRequest, ExecuteResult, Lane } from "./providers/types.js";
import { buildPlanPrompt, parsePlan, PLAN_SCHEMA, renderPlanArtifacts, type PlanOutput } from "./roles/plan.js";
import { buildCritiquePrompt, CRITIQUE_SCHEMA, parseCritique, renderCritique } from "./roles/critique.js";
import { buildBuildPrompt, buildFixPrompt, BUILD_SCHEMA, parseBuild } from "./roles/build.js";
import { buildQaFixPrompt, parseQaFix, QAFIX_SCHEMA, scanForQaFindings } from "./roles/qafix.js";
import { buildSecurityPrompt, parseSecurity, SECURITY_SCHEMA } from "./roles/security.js";
import { buildHealPrompt, buildReviewPrompt, parseReview, REVIEW_SCHEMA, type ReviewOutput } from "./roles/review.js";
import { BLOCKER_RULE } from "./roles/common.js";

export const ENGINE_VERSION = "3.0.0";

export type RunStatus = "COMPLETED" | "REVIEW_ONLY" | "HALTED" | "FAILED";

/** 0 success · 1 error · 3 halted for a human · 4 budget exhausted. */
export type ExitCode = 0 | 1 | 3 | 4;

export interface RunResult {
  status: RunStatus;
  exitCode: ExitCode;
  runId: string;
  artifactsDir: string;
  branch: string | null;
  commit: string | null;
  costUsd: number;
  modelCalls: number;
  tokens: { input: number; output: number; cached: number };
  /** Stage → outcome, for the run summary and the evaluation harness. */
  stages: Record<string, string>;
  haltedAt: string | null;
  message: string;
  warnings: string[];
}

interface Checkpoint {
  runId: string;
  engineVersion: string;
  stage: string;
  completedStages: string[];
  baseHead: string;
  taskHash: string;
  configHash: string;
  verificationPlanSha: string;
  candidateTree: string | null;
  worktreePath: string | null;
  at: string;
}

/** Why a resume was refused, with the fix, rather than a bare mismatch. */
const RESUME_HINTS: Record<string, string> = {
  runId: "the checkpoint belongs to a different run",
  engineVersion: "the engine was upgraded since the run started; start a fresh run",
  baseHead: "the repository moved since the run started; start a fresh run from the new base",
  taskHash: "the task text differs from the original run; resume needs the same task",
  configHash: "the profile, quality or commit settings differ from the original run",
  verificationPlanSha: "the package scripts or verification tooling changed since the run started",
  worktree: "the run worktree is gone; start a fresh run",
};

const DENY_COMMANDS = [
  { pattern: /\bgit\s+(commit|push|reset|checkout|switch|restore|rebase|merge|stash|clean|tag|worktree|update-ref|filter-branch|am|cherry-pick|revert)\b/, reason: "the orchestrator owns the git history for this run" },
  { pattern: /\bgit\s+branch\s+(-[dDmMf]|--delete|--move|--force)/, reason: "the orchestrator owns the run branch" },
  { pattern: /\b(npm|pnpm|yarn|cargo)\s+publish\b|\btwine\s+upload\b|\bgh\s+release\b/, reason: "publishing is never part of a pipeline run" },
  { pattern: /\b(curl|wget|nc|ncat|ssh|scp)\b/, reason: "no network fetchers during a build" },
  { pattern: /\brm\s+-rf?\s+(\/|~|\.git)(\s|$)/, reason: "refusing a destructive delete of the repository or home" },
];

export class Runner {
  private readonly ledger: Ledger;
  private readonly artifacts: string;
  private readonly warnings: string[] = [];
  private costUsd = 0;
  private modelCalls = 0;
  private tokens = { input: 0, output: 0, cached: 0 };
  private readonly stages: Record<string, string> = {};
  private budgetExtensions = 0;
  private worktree: Worktree | null = null;
  private plan: PlanOutput | null = null;
  private context: ContextPack | null = null;
  private verification!: { plan: VerificationPlan; digest: string };
  private baseline: BaselineStatuses | null = null;
  private baseHead = "";
  private baseTree = "";
  private pathspec: string[] = ["."];
  private testStatus: CheckStatus = "NOT_CONFIGURED";
  private testOutput = "";
  private verifiedTree: string | null = null;
  private securityEvidence: SecurityEvidence | null = null;
  private securityTree: string | null = null;
  private reviewedTree: string | null = null;
  private reviewedDiff = "";

  constructor(
    private readonly config: EngineConfig,
    private readonly adapter: Adapter,
    readonly runId: string,
    private readonly log: (message: string) => void = () => {},
  ) {
    this.artifacts = join(config.stateDir, "artifacts", runId);
    mkdirSync(this.artifacts, { recursive: true });
    this.ledger = new Ledger(join(this.artifacts, "ledger.jsonl"));
  }

  async execute(): Promise<RunResult> {
    try {
      return await this.run();
    } catch (error) {
      if (error instanceof HaltError) {
        this.ledger.append("run_finished", { status: "HALTED", stage: error.stage, reason: error.message });
        return this.result("HALTED", 3, error.message, error.stage);
      }
      if (error instanceof BudgetError) {
        this.ledger.append("run_finished", { status: "HALTED", reason: error.message });
        return this.result("HALTED", 4, error.message, error.stage);
      }
      const message = (error as Error).message ?? String(error);
      this.ledger.append("run_finished", { status: "FAILED", reason: message });
      return this.result("FAILED", 1, message, null);
    } finally {
      this.adapter.dispose?.().catch(() => {});
    }
  }

  private async run(): Promise<RunResult> {
    const origin: GitContext = { cwd: this.config.repoRoot, env: {} };
    if (!isGitRepo(origin)) throw new HaltError("startup", "this is not a Git repository; the engine needs one to isolate the run");
    this.baseHead = headSha(origin) ?? "";
    if (!this.baseHead) throw new HaltError("startup", "the repository has no commits yet; make one first");
    this.baseTree = treeOfCommit(origin, this.baseHead) ?? "";
    ensureIgnoredStateDir(this.config.stateDir);

    if (!isClean(origin)) {
      // Not an error: the run happens in its own worktree at the baseline
      // commit, so uncommitted work is simply not part of it.
      this.warn("the checkout has uncommitted changes; they are not part of this run");
    }

    this.ledger.append("run_started", {
      runId: this.runId, engineVersion: ENGINE_VERSION, task: this.config.task,
      profile: this.config.profile, quality: this.config.quality, provider: this.adapter.id,
      baseHead: this.baseHead,
    });

    // Provider first: an unauthenticated run should cost nothing and fail now.
    const preflight = await this.adapter.preflight();
    if (!preflight.ok) throw new HaltError("preflight", preflight.error ?? "the provider is not usable here");
    for (const note of preflight.fallbacks) this.warn(note);

    // The worktree comes first: everything the run measures — the verification
    // descriptors, the baseline, the candidate — must be the baseline commit in
    // the engine's own tree, never the user's checkout with its uncommitted
    // work and untracked files in it.
    if (this.config.resumeRunId) {
      // Resume re-derives the plan below and compares it to the checkpoint, so
      // the worktree has to exist before detection either way.
      this.worktree = this.enterResumedWorktree();
    } else {
      this.worktree = createRunWorktree({
        originRoot: this.config.repoRoot, stateDir: this.config.stateDir,
        runId: this.runId, baseHead: this.baseHead,
      });
    }
    this.pathspec = candidatePathspec(this.worktree.ctx);
    this.log(`  Worktree: ${this.worktree.path} (your checkout stays untouched)`);

    // Verification descriptors are frozen before anything can edit them.
    const plan = detectVerificationCommands(this.worktree.path, Math.round(this.config.commandTimeoutMs / 1000));
    this.verification = { plan, digest: planDigest(plan) };
    writeArtifact(join(this.artifacts, "verification-plan.json"), JSON.stringify(plan, null, 2) + "\n");
    this.log(`  Verification: ${CHECK_NAMES.map(n => `${n}=${plan.commands[n].length ? commandDisplay(plan.commands[n]) : "none"}`).join("  ")}`);

    if (this.config.resumeRunId) this.verifyResumeInvariants();

    if (this.config.baselineChecks && !this.alreadyDone("baseline")) {
      const baseline = await runBaseline({
        plan, ctx: this.worktree.ctx, cwd: this.worktree.path,
        timeoutMs: this.config.commandTimeoutMs, artifactsDir: this.artifacts,
      });
      if (baseline.selfDirtying.length) {
        throw new HaltError("baseline", `the project's own check commands modify the working tree: ${baseline.selfDirtying.join(", ")}. Gitignore those outputs and rerun.`);
      }
      this.baseline = baseline.statuses;
      writeArtifact(join(this.artifacts, "baseline.json"), JSON.stringify(baseline.statuses, null, 2) + "\n");
      this.ledger.append("baseline_recorded", { checks: baseline.statuses });
      const failing = CHECK_NAMES.filter(n => baseline.statuses[n] !== "PASS" && baseline.statuses[n] !== "NOT_CONFIGURED");
      if (failing.length) {
        this.log(`  Pre-existing baseline failures: ${failing.map(n => `${n}=${baseline.statuses[n]}`).join(", ")}`);
        this.log("  They will not gate this run; regressions this run introduces still will.");
      }
      this.stageDone("baseline");
    } else if (this.alreadyDone("baseline")) {
      this.baseline = this.loadBaseline();
    }

    this.context = buildContextPack({
      task: this.config.task, root: this.worktree.path, ctx: this.worktree.ctx, plan,
    });
    writeArtifact(join(this.artifacts, "repo-context.md"), this.context.markdown);

    await this.stagePlan();
    await this.stageCritique();
    await this.stageBuild();
    await this.stageQa();
    await this.stageVerify("after-build");
    await this.stageSecurity();
    return await this.stageReview();
  }

  // ---------------------------------------------------------------- stages

  private async stagePlan(): Promise<void> {
    if (this.alreadyDone("plan")) { this.plan = this.loadPlan(); if (this.plan) { this.log("  Plan: reused from the checkpoint"); return; } }
    this.checkpoint("plan");
    const limits = profileOf(this.config);
    let critique: string | null = null;
    let lintNotes: string | null = null;

    for (let attempt = 0; attempt <= limits.maxPlanLintRetries; attempt++) {
      const result = await this.callRole("plan", {
        prompt: buildPlanPrompt({
          task: this.config.task, contextPack: this.context!.markdown, precedents: this.precedents(),
          critique, lintFindings: lintNotes,
          hasTestCommand: this.verification.plan.commands.test.length > 0,
        }),
        toolScope: "read-web", sandbox: "read-only", schema: PLAN_SCHEMA as unknown as Record<string, unknown>,
      });
      const parsed = parsePlan(result.structured);
      if (!parsed) throw new HaltError("plan", "the planning phase returned nothing usable");
      this.plan = parsed;
      this.persistPlan(parsed);

      const lint = lintPlan(parsed.steps, file => this.readWorktreeFile(file));
      const uncovered = findUncoveredCriteria(parsed.brief.criteria.map(c => c.id), parsed.steps);
      if (!lint.length && !uncovered.length) { this.stageDone("plan"); return; }

      const problems = [
        ...lint.map(f => `Step ${f.step} (${f.file}): ${f.problem}`),
        ...uncovered.map(id => `Criterion ${id} is not covered by a step with a test`),
      ];
      this.ledger.append("gate", { stage: "plan", attempt, problems });
      if (attempt === limits.maxPlanLintRetries) {
        // The build gets the findings instead of a human getting a halt: a
        // wrong anchor is a hint the builder can resolve by looking.
        this.warn(`plan lint did not converge; passing ${problems.length} finding(s) to the build`);
        lintNotes = problems.join("\n");
        this.planLintNotes = lintNotes;
        this.stageDone("plan");
        return;
      }
      lintNotes = problems.join("\n");
      critique = null;
      this.log(`  Plan lint found ${problems.length} problem(s); re-planning`);
    }
  }

  private planLintNotes: string | null = null;
  private readonly completedStages: string[] = [];
  private resumedFrom: Checkpoint | null = null;

  private async stageCritique(): Promise<void> {
    if (!runsRole(this.config, "critique")) return;
    if (this.alreadyDone("critique")) { this.log("  Critique: already passed in the checkpoint"); return; }
    this.checkpoint("critique");
    const limits = profileOf(this.config);

    for (let attempt = 0; attempt <= limits.maxCritiqueRetries; attempt++) {
      const result = await this.callRole("critique", {
        prompt: buildCritiquePrompt({
          task: this.config.task, contextPack: this.context!.markdown,
          precedents: this.precedents(), plan: this.plan!,
        }),
        toolScope: "read-exec", sandbox: "read-only",
        schema: CRITIQUE_SCHEMA as unknown as Record<string, unknown>,
      });
      const critique = parseCritique(result.structured, result.report);
      writeArtifact(join(this.artifacts, "critique.md"), renderCritique(critique, this.plan!.steps));

      const decision = decideReviewGate(critique, null);
      this.recordGate("critique", decision);
      if (decision.passed) { this.stageDone("critique"); return; }

      const confirmed = await this.refute("critique", decision.gating);
      if (!confirmed.length) {
        this.log("  Every critique blocker was refuted on review; proceeding");
        this.stageDone("critique");
        return;
      }
      if (attempt === limits.maxCritiqueRetries) {
        const outcome = applyGate("HARD", false, profileOf(this.config).gateMode);
        if (outcome === "halt") {
          throw new HaltError("critique", `the design was sent back and did not converge: ${confirmed.map(f => f.summary).join("; ")}`);
        }
        return;
      }
      this.log(`  Critique asked for a revision (${confirmed.length} blocker(s)); re-planning`);
      this.ledger.append("recovery", { stage: "critique", attempt, blockers: confirmed.length });
      await this.replanFromCritique(confirmed);
    }
  }

  private async replanFromCritique(findings: Finding[]): Promise<void> {
    const result = await this.callRole("plan", {
      prompt: buildPlanPrompt({
        task: this.config.task, contextPack: this.context!.markdown, precedents: this.precedents(),
        critique: findings.map(f => `- ${f.location}: ${f.summary}\n  Evidence: ${f.evidence}`).join("\n"),
        lintFindings: null, hasTestCommand: this.verification.plan.commands.test.length > 0,
      }),
      toolScope: "read-web", sandbox: "read-only", schema: PLAN_SCHEMA as unknown as Record<string, unknown>,
    });
    const parsed = parsePlan(result.structured);
    if (parsed) this.persistPlan(parsed);
  }

  private loadPlan(): PlanOutput | null {
    const path = join(this.artifacts, "plan.json");
    if (!existsSync(path)) return null;
    try { return JSON.parse(readFileSync(path, "utf8")) as PlanOutput; } catch { return null; }
  }

  private persistPlan(plan: PlanOutput): void {
    this.plan = plan;
    for (const [name, body] of Object.entries(renderPlanArtifacts(plan))) {
      writeArtifact(join(this.artifacts, name), body);
    }
    // The structured form is what a resume reloads; the markdown is for humans
    // and for the phases that quote it.
    writeArtifact(join(this.artifacts, "plan.json"), JSON.stringify(plan, null, 2) + "\n");
  }

  private async stageBuild(): Promise<void> {
    if (this.alreadyDone("build")) { this.log("  Build: already applied in the resumed worktree"); return; }
    this.checkpoint("build");
    const result = await this.callRole("build", {
      prompt: buildBuildPrompt({
        task: this.config.task, contextPack: this.context!.markdown, precedents: this.precedents(),
        plan: this.plan!, verificationNote: this.context!.verificationNote, lintNotes: this.planLintNotes,
      }),
      toolScope: "write-exec", sandbox: "workspace-write",
      schema: BUILD_SCHEMA as unknown as Record<string, unknown>,
    });
    const build = parseBuild(result.structured, result.report);
    writeArtifact(join(this.artifacts, "build-report.md"), [
      "# Build", "", `## Verdict\n\n${build.verdict}`, "",
      build.blockedReason ? `## Blocked\n\n${build.blockedReason}\n` : "",
      `## Notes\n\n${build.notes}`, "",
    ].join("\n"));

    if (build.verdict === "FAILED") {
      throw new HaltError("build", `the build could not proceed: ${build.blockedReason ?? build.notes.slice(0, 300)}`);
    }
    if (build.blockedReason) this.warn(`build reported a blocked step: ${build.blockedReason}`);

    const changed = candidateChangedFiles(this.worktree!.ctx, this.baseHead, this.pathspec);
    if (!changed.length) throw new HaltError("build", "the build produced no change to the tree");
    this.log(`  Build touched ${changed.length} file(s)`);

    await this.buildFixLoop();
    this.stageDone("build");
  }

  /**
   * Run the frozen checks immediately and let the builder fix its own break
   * while the context is still warm. Advisory only: the release verification
   * later is what actually gates.
   */
  private async buildFixLoop(): Promise<void> {
    const limits = profileOf(this.config);
    const commands: Array<[CheckName, string[]]> = [
      ["test", this.verification.plan.commands.test],
      ["typecheck", this.verification.plan.commands.typecheck],
    ];
    for (let attempt = 1; attempt <= limits.maxBuildFixAttempts; attempt++) {
      const failures: string[] = [];
      for (const [name, argv] of commands) {
        if (!argv.length) continue;
        const run = await this.runCheck(name, argv);
        if (run.integrityFailure) throw new HaltError("build", `running ${name} changed the tree it was measuring (${run.integrityFailure}); a fresh run is required`);
        const status = applyBaselineTag(run.status, this.baseline?.[name]);
        if (gatesRelease(status)) failures.push(`### ${name}\n\n${run.output.slice(-20_000)}`);
      }
      this.ledger.append("check_run", { stage: "build-verify", attempt, clean: failures.length === 0 });
      if (!failures.length) return;
      if (attempt === limits.maxBuildFixAttempts) {
        this.warn("the in-build fix loop did not reach a clean run; the release gate will decide");
        return;
      }
      this.log(`  Verification failed inside the build; fix attempt ${attempt}`);
      await this.callRole("build", {
        prompt: buildFixPrompt({
          task: this.config.task, contextPack: this.context!.markdown, precedents: this.precedents(),
          failingOutput: failures.join("\n\n"), verificationNote: this.context!.verificationNote,
        }),
        toolScope: "write-exec", sandbox: "workspace-write", label: "build-fix",
      });
    }
  }

  private async stageQa(): Promise<void> {
    if (!runsRole(this.config, "qafix")) return;
    if (this.alreadyDone("qa")) return;
    this.checkpoint("qa");
    const files = this.changedTextFiles();
    const findings = scanForQaFindings(files, { documentsRoutes: this.context!.documentsRoutes });
    writeArtifact(join(this.artifacts, "qa-findings.json"), JSON.stringify(findings, null, 2) + "\n");
    if (!findings.length) {
      this.ledger.append("check_run", { stage: "qa", model: "SKIPPED", findings: 0 });
      this.log("  Deterministic quality checks clean; no model call");
      this.stageDone("qa");
      return;
    }
    this.log(`  Deterministic quality checks found ${findings.length} item(s); fixing`);
    await this.callRole("qafix", {
      prompt: buildQaFixPrompt({
        task: this.config.task, contextPack: this.context!.markdown, precedents: this.precedents(),
        findings, lintOutput: null, typecheckOutput: null,
      }),
      toolScope: "write-exec", sandbox: "workspace-write",
      schema: QAFIX_SCHEMA as unknown as Record<string, unknown>,
    });
    const after = scanForQaFindings(this.changedTextFiles(), { documentsRoutes: this.context!.documentsRoutes });
    this.ledger.append("check_run", { stage: "qa", before: findings.length, after: after.length });
    if (after.length) this.warn(`${after.length} quality finding(s) remain after the fix pass`);
    this.stageDone("qa");
  }

  /**
   * The whole frozen matrix against the current tree. Everything downstream —
   * security, review, the commit — attests this exact tree, so any later write
   * sends the run back through here.
   */
  private async stageVerify(reason: string): Promise<void> {
    this.checkpoint("verify");
    this.assertNoDrift();
    const statuses: Partial<Record<CheckName, CheckStatus>> = {};
    let gating = false;

    for (const name of CHECK_NAMES) {
      const argv = this.verification.plan.commands[name];
      if (!argv.length) { statuses[name] = "NOT_CONFIGURED"; continue; }
      const run = await this.runCheck(name, argv);
      if (run.integrityFailure) {
        throw new HaltError("verify", `running ${name} changed the tree it was measuring (${run.integrityFailure}); this is not overridable`);
      }
      const status = applyBaselineTag(run.status, this.baseline?.[name]);
      statuses[name] = status;
      writeArtifact(join(this.artifacts, `${reason}-${name}-output.txt`), run.output);
      if (name === "test") {
        this.testStatus = status;
        this.testOutput = run.output;
        writeArtifact(join(this.artifacts, "test-output.txt"), run.output);
        writeArtifact(join(this.artifacts, "test-exit-code.txt"), `${run.exitCode}\n`);
      }
      if (gatesRelease(status)) gating = true;
      this.log(`  ${name}: ${status}`);
    }

    this.assertNoDrift();
    writeArtifact(join(this.artifacts, "release-verification.json"), JSON.stringify({
      schemaVersion: 1, source: "orchestrator", reason, statuses,
      verificationPlanSha256: this.verification.digest,
    }, null, 2) + "\n");
    this.ledger.append("check_run", { stage: "verify", reason, statuses });

    if (gating) {
      const failing = CHECK_NAMES.filter(n => statuses[n] && gatesRelease(statuses[n]!));
      throw new HaltError("verify", `verification failed (${failing.map(n => `${n}=${statuses[n]}`).join(", ")}); security and review would be reviewing a broken tree`);
    }
    this.verifiedTree = candidateTreeOid(this.worktree!.ctx, this.baseHead, this.pathspec);
  }

  private async stageSecurity(): Promise<void> {
    this.checkpoint("security");
    const before = candidateTreeOid(this.worktree!.ctx, this.baseHead, this.pathspec);
    const paths = candidateChangedFiles(this.worktree!.ctx, this.baseHead, this.pathspec);

    let evidence: SecurityEvidence;
    try {
      evidence = scanCandidate({
        root: this.worktree!.path, paths, candidateTreeOid: before,
        gitBound: true, allowRemoteDeps: process.env["PIPELINE_ALLOW_REMOTE_DEPS"] === "1",
      });
    } catch (error) {
      if (error instanceof ScannerEscapeError) throw new HaltError("security", error.message);
      throw error;
    }
    writeArtifact(join(this.artifacts, "security-scanners.json"), JSON.stringify(evidence, null, 2) + "\n");
    this.securityEvidence = evidence;

    const after = candidateTreeOid(this.worktree!.ctx, this.baseHead, this.pathspec);
    if (!after || after !== before) throw new HaltError("security", "the security scan changed the candidate tree; refusing to continue");

    this.ledger.append("gate", {
      stage: "security-scanner", result: evidence.result,
      findings: evidence.findings.length, waivers: evidence.waivers.length,
    });
    for (const waiver of evidence.waivers) this.ledger.append("waiver", { ...waiver });
    if (evidence.waivers.length) this.log(`  Scanner recorded ${evidence.waivers.length} waiver(s)`);

    if (evidence.result === "BLOCK") {
      const summary = evidence.findings.map(f => `${f.rule} at ${f.path}:${f.line}`).join("; ");
      throw new HaltError("security-scanner", `deterministic security findings are not waivable: ${summary}`);
    }

    if (!runsRole(this.config, "security")) return;
    const diff = candidateDiff(this.worktree!.ctx, this.baseHead, this.pathspec);
    writeArtifact(join(this.artifacts, "review.diff"), diff);
    const result = await this.callRole("security", {
      prompt: buildSecurityPrompt({
        task: this.config.task, contextPack: this.context!.markdown, precedents: this.precedents(),
        diff, scannerResult: evidence.result, scannerEvidencePath: join(this.artifacts, "security-scanners.json"),
      }),
      toolScope: "read-exec", sandbox: "read-only",
      schema: SECURITY_SCHEMA as unknown as Record<string, unknown>,
    });
    const security = parseSecurity(result.structured, result.report);
    writeArtifact(join(this.artifacts, "security-review.md"), result.report || `Verdict: ${security.verdict}`);

    const decision = decideReviewGate(security, diff);
    this.recordGate("security", decision);
    if (!decision.passed) {
      const confirmed = await this.refute("security", decision.gating);
      if (confirmed.length) {
        throw new HaltError("security", `security review blocked: ${confirmed.map(f => `${f.location} — ${f.summary}`).join("; ")}`);
      }
    }
    this.securityTree = candidateTreeOid(this.worktree!.ctx, this.baseHead, this.pathspec);
  }

  private async stageReview(): Promise<RunResult> {
    this.checkpoint("review");
    const limits = profileOf(this.config);
    let priorFindings: Finding[] = [];

    for (let round = 0; round <= limits.maxReviewHeals; round++) {
      const diff = candidateDiff(this.worktree!.ctx, this.baseHead, this.pathspec);
      writeArtifact(join(this.artifacts, "review.diff"), diff);
      const tree = candidateTreeOid(this.worktree!.ctx, this.baseHead, this.pathspec);

      const result = await this.callRole("review", {
        prompt: buildReviewPrompt({
          task: this.config.task, contextPack: this.context!.markdown, precedents: this.precedents(),
          diff, criteria: this.plan!.brief.criteria, assumptions: this.plan!.brief.assumptions,
          designDecisions: this.plan!.design.decisions.map(d => d.decision),
          testSummary: this.testSummary(), scannerResult: this.securityEvidence?.result ?? "NOT_APPLICABLE",
          priorFindings, healRound: round,
        }),
        toolScope: "read-exec", sandbox: "read-only",
        schema: REVIEW_SCHEMA as unknown as Record<string, unknown>,
      });
      const review = parseReview(result.structured, result.report);
      writeArtifact(join(this.artifacts, "code-review.md"), renderReview(review, result.report));

      const decision = decideReviewGate(review, diff);
      this.recordGate("review", decision);
      const uncovered = review.coverage.filter(c => !c.satisfied).map(c => c.id);
      if (uncovered.length) this.warn(`review reports criteria not satisfied by the diff: ${uncovered.join(", ")}`);

      if (decision.passed) {
        this.reviewedTree = tree;
        this.reviewedDiff = diff;
        return await this.finish(review);
      }

      const confirmed = await this.refute("review", decision.gating);
      if (!confirmed.length) {
        this.log("  Every review blocker was refuted; approving");
        this.reviewedTree = tree;
        this.reviewedDiff = diff;
        return await this.finish(review);
      }
      if (round === limits.maxReviewHeals) {
        throw new HaltError("review", `review did not converge after ${round} heal(s): ${confirmed.map(f => f.summary).join("; ")}`);
      }

      this.log(`  Review asked for changes (${confirmed.length} blocker(s)); heal ${round + 1}`);
      this.ledger.append("recovery", { stage: "review", round: round + 1, blockers: confirmed.length });
      priorFindings = confirmed;
      await this.callRole("build", {
        prompt: buildHealPrompt({
          task: this.config.task, contextPack: this.context!.markdown, precedents: this.precedents(),
          findings: confirmed, diff, testOutput: this.testOutput.slice(-8000),
          verificationNote: this.context!.verificationNote,
        }),
        toolScope: "write-exec", sandbox: "workspace-write", label: "heal",
      });
      // A heal is code generation: every prior approval is void.
      this.verifiedTree = null;
      this.securityTree = null;
      await this.stageVerify(`after-heal-${round + 1}`);
      await this.stageSecurity();
    }
    throw new HaltError("review", "review did not converge");
  }

  private async finish(review: ReviewOutput): Promise<RunResult> {
    const tree = this.reviewedTree;
    if (!tree) throw new HaltError("commit", "no reviewed tree was recorded");

    if (!this.config.commit) {
      return this.result("REVIEW_ONLY", 0, "review complete; commit was not requested", null);
    }

    // Red baseline tests are legitimate (a TDD flow starts red), so the
    // decision lands here on the FINAL state rather than aborting at startup.
    if (this.testStatus !== "PASS") {
      if (this.testStatus === "NOT_CONFIGURED" && !this.config.allowUntestedCommit) {
        this.warn("no test command was detected; completing review-only (pass --allow-untested-commit to commit anyway)");
        return this.result("REVIEW_ONLY", 0, "no test evidence; not committing", null);
      }
      if (this.testStatus !== "NOT_CONFIGURED") {
        this.warn("tests are not green on the final tree; completing review-only");
        return this.result("REVIEW_ONLY", 0, "tests are not green; not committing", null);
      }
    }

    // Verification, security and review must all attest the same tree.
    if (this.verifiedTree !== tree || (this.securityTree && this.securityTree !== tree)) {
      throw new HaltError("commit", "the reviewed tree is not the tree that was verified and scanned; refusing to commit");
    }

    const outcome = commitReviewedTree({
      worktree: this.worktree!, reviewedTree: tree,
      reviewedDiffSha: "sha256:" + hashOf(this.reviewedDiff),
      baseTree: this.baseTree, task: this.config.task, runId: this.runId,
    });
    if (outcome.kind === "refused") throw new HaltError("commit", outcome.reason);
    if (outcome.kind === "noop") {
      return this.result("REVIEW_ONLY", 0, "nothing to commit: the reviewed tree equals the baseline", null);
    }

    this.ledger.append("commit", { commit: outcome.commit, tree: outcome.tree, parent: outcome.parent, branch: outcome.branch });
    this.log(`  Committed ${outcome.commit.slice(0, 12)} to ${outcome.branch}`);

    if (this.config.push) {
      const remote = process.env["PIPELINE_PUSH_REMOTE"] ?? "origin";
      const push = pushBranch(this.worktree!.ctx, remote, outcome.branch);
      if (push.status === 0) {
        this.ledger.append("publish", { remote, branch: outcome.branch });
        this.log(`  Pushed ${outcome.branch} to ${remote}`);
      } else {
        this.warn(`push to ${remote} failed: ${push.stderr.trim().slice(0, 200)}`);
      }
    }

    const result = this.result("COMPLETED", 0, `committed ${outcome.commit.slice(0, 12)}`, null);
    result.commit = outcome.commit;
    result.branch = outcome.branch;
    // A committed run has nothing left to inspect; halted runs keep theirs.
    removeRunWorktree(this.config.repoRoot, this.worktree!.path);
    void review;
    return result;
  }

  // --------------------------------------------------------------- helpers

  private async callRole(
    role: Role,
    request: Omit<ExecuteRequest, "model" | "effort" | "timeoutMs" | "label" | "cwd"> & { label?: string },
  ): Promise<ExecuteResult> {
    const routing = routeRole(role, this.config.quality);
    const label = request.label ?? role;
    let cap = this.config.budget.perCallUsd;

    for (let attempt = 1; ; attempt++) {
      this.assertRunBudget(cap);
      const full: ExecuteRequest = {
        ...request,
        label,
        model: this.adapter.models[routing.lane as Lane],
        effort: routing.effort,
        cwd: this.worktree?.path ?? this.config.repoRoot,
        addDirs: [this.artifacts],
        timeoutMs: this.config.callTimeoutMs,
        budgetUsd: cap,
        ...(request.toolScope === "write-exec"
          ? { denyCommands: DENY_COMMANDS, protectedPaths: PROTECTED_PATHS, formatCommand: null }
          : {}),
      };
      this.log(`  ${label}: ${full.model} (${full.effort})`);
      const result = await this.adapter.execute(full);
      this.modelCalls++;
      this.costUsd += result.usage.costUsd ?? 0;
      this.tokens.input += result.usage.inputTokens;
      this.tokens.output += result.usage.outputTokens;
      this.tokens.cached += result.usage.cachedTokens;
      this.ledger.append("model_call", {
        role, label, attempt, model: full.model, effort: full.effort, exit: result.exit,
        costUsd: result.usage.costUsd, tokens: result.usage.outputTokens, denials: result.denials,
      });
      if (result.report) writeArtifact(join(this.artifacts, `${label}.report.md`), result.report);

      if (result.exit === "ok") return result;

      if (result.exit === "budget" && this.config.budget.policy === "elastic" && this.budgetExtensions < this.config.budget.maxExtensions && cap) {
        const next = cap * 2;
        this.budgetExtensions++;
        this.ledger.append("budget_extended", { role, label, from: cap, to: next });
        this.log(`  ${label} hit its $${cap.toFixed(2)} cap; extending to $${next.toFixed(2)}`);
        cap = next;
        continue;
      }
      if (result.exit === "budget") throw new BudgetError(role, `${label} hit its budget cap and the policy does not extend it`);
      if (result.exit === "transient" && attempt < 2) {
        this.ledger.append("model_retry", { role, label, reason: result.errorMessage });
        this.log(`  ${label}: transient provider failure; retrying`);
        continue;
      }
      throw new HaltError(role, `${label} failed (${result.exit}): ${result.errorMessage ?? "no detail"}`);
    }
  }

  /**
   * One cheap adversarial pass per surviving blocker, on the reviewer's own
   * lane. Only a confirmed finding may halt the run or drive a heal.
   */
  private async refute(stage: string, gating: Finding[]): Promise<Finding[]> {
    if (!gating.length) return [];
    if (this.config.profile === "yolo" || this.config.profile === "fast") return gating;
    const role: Role = stage === "review" ? "review" : stage === "security" ? "security" : "critique";
    const results = [];
    for (const finding of gating.slice(0, 5)) {
      const result = await this.callRole(role, {
        label: `refute:${stage}`,
        prompt: [
          `You are checking one claim another reviewer made about this change. Your job is to establish whether it is real, not to be agreeable.`,
          "",
          `Claim: ${finding.summary}`,
          `Location: ${finding.location}`,
          `Evidence offered: ${finding.evidence}`,
          "",
          "```diff", this.reviewedDiffOrCurrent(), "```",
          "",
          "Read the cited code. Confirm the finding only if you can state the concrete input or sequence that triggers it and what goes wrong. If the code already handles it, if the trigger cannot occur, or if the claim is about style rather than a defect, refute it.",
          "",
          BLOCKER_RULE,
        ].join("\n"),
        toolScope: "read-exec", sandbox: "read-only",
        schema: {
          type: "object", additionalProperties: false, required: ["confirmed", "reason"],
          properties: { confirmed: { type: "boolean" }, reason: { type: "string" } },
        } as unknown as Record<string, unknown>,
      });
      const record = (result.structured ?? {}) as Record<string, unknown>;
      const confirmed = record["confirmed"] === true;
      results.push({ finding, confirmed, reason: String(record["reason"] ?? "") });
      this.ledger.append("blocker_refuted", { stage, summary: finding.summary, confirmed, reason: record["reason"] });
    }
    const { confirmed, refuted } = applyRefutations(gating, results);
    if (refuted.length) {
      writeArtifact(join(this.artifacts, `${stage}.refuted.json`), JSON.stringify(refuted, null, 2) + "\n");
      this.log(`  ${refuted.length} of ${gating.length} blocker(s) refuted on second look`);
    }
    return confirmed;
  }

  private reviewedDiffOrCurrent(): string {
    return this.reviewedDiff || candidateDiff(this.worktree!.ctx, this.baseHead, this.pathspec);
  }

  private async runCheck(name: CheckName, argv: string[]) {
    return runVerified(argv, {
      cwd: this.worktree!.path, timeoutMs: this.config.commandTimeoutMs,
      ctx: this.worktree!.ctx, baseHead: this.baseHead, pathspec: this.pathspec,
      env: this.worktree!.env,
    });
  }

  /**
   * Re-enter a halted run's worktree.
   *
   * Every invariant is checked before anything is reused, and a refusal names
   * the fix rather than the mismatch. The worktree is engine-owned, so a
   * workspace left mid-write is restored to its checkpointed tree — nothing a
   * person authored is at risk there.
   */
  private enterResumedWorktree(): Worktree {
    const path = join(this.artifacts, "checkpoint.json");
    if (!existsSync(path)) throw new HaltError("resume", `no checkpoint for run ${this.runId}; it may have been pruned`);
    let checkpoint: Checkpoint;
    try {
      checkpoint = JSON.parse(readFileSync(path, "utf8")) as Checkpoint;
    } catch {
      throw new HaltError("resume", "the checkpoint is unreadable; start a fresh run");
    }

    // Everything checkable before the worktree is entered, checked first.
    const expected: Array<[keyof typeof RESUME_HINTS, unknown, unknown]> = [
      ["runId", checkpoint.runId, this.runId],
      ["engineVersion", checkpoint.engineVersion, ENGINE_VERSION],
      ["baseHead", checkpoint.baseHead, this.baseHead],
      ["taskHash", checkpoint.taskHash, hashOf(this.config.task)],
      ["configHash", checkpoint.configHash, this.configHash()],
    ];
    for (const [name, was, now] of expected) {
      if (was !== now) throw new HaltError("resume", `cannot resume: ${RESUME_HINTS[name]}`);
    }

    const worktreePath = checkpoint.worktreePath;
    if (!worktreePath || !existsSync(worktreePath)) throw new HaltError("resume", `cannot resume: ${RESUME_HINTS["worktree"]}`);

    const branch = `pipeline/${this.runId}`;
    const env = excludeEnvFor(this.config.stateDir, this.runId, existsSync(join(worktreePath, "node_modules")) ? ["node_modules"] : []);
    const worktree: Worktree = { path: worktreePath, branch, baseHead: this.baseHead, env, ctx: { cwd: worktreePath, env } };

    // A run interrupted mid-write leaves a tree that matches no checkpoint.
    // Restoring it is safe here and is the difference between resuming and
    // starting over.
    const pathspec = candidatePathspec(worktree.ctx);
    const current = candidateTreeOid(worktree.ctx, this.baseHead, pathspec);
    if (checkpoint.candidateTree && current !== checkpoint.candidateTree) {
      const restored = git(worktree.ctx, ["checkout", "--", "."]).status === 0;
      this.warn(restored
        ? "the workspace was mid-write; restored it to the checkpointed tree"
        : "the workspace does not match the checkpoint and could not be restored");
    }

    this.resumedFrom = checkpoint;
    for (const stage of checkpoint.completedStages) this.completedStages.push(stage);
    this.log(`  Resuming ${this.runId} after: ${checkpoint.completedStages.join(", ") || "nothing"}`);
    this.ledger.append("note", { resumedFrom: checkpoint.stage, completed: checkpoint.completedStages });
    return worktree;
  }

  /** The one invariant that can only be checked once the plan is re-derived. */
  private verifyResumeInvariants(): void {
    const checkpoint = this.resumedFrom;
    if (!checkpoint) return;
    if (checkpoint.verificationPlanSha !== this.verification.digest) {
      throw new HaltError("resume", `cannot resume: ${RESUME_HINTS["verificationPlanSha"]}`);
    }
  }

  private loadBaseline(): BaselineStatuses | null {
    const path = join(this.artifacts, "baseline.json");
    if (!existsSync(path)) return null;
    try { return JSON.parse(readFileSync(path, "utf8")) as BaselineStatuses; } catch { return null; }
  }

  private configHash(): string {
    return hashOf(JSON.stringify({
      profile: this.config.profile, quality: this.config.quality, provider: this.config.provider,
      commit: this.config.commit, allowUntested: this.config.allowUntestedCommit,
    }));
  }

  private assertNoDrift(): void {
    try {
      assertPlanUnchanged(this.worktree!.path, this.verification.plan, this.verification.digest);
    } catch (error) {
      if (error instanceof VerificationDriftError) throw new HaltError("verify", error.message);
      throw error;
    }
  }

  private assertRunBudget(nextCap: number | null): void {
    const runCap = this.config.budget.runUsd;
    if (runCap === null) return;
    const projected = this.costUsd + (nextCap ?? 0);
    if (this.costUsd >= runCap) throw new BudgetError("run", `the run budget of $${runCap.toFixed(2)} is spent`);
    if (projected > runCap) {
      this.warn(`next call capped at the remaining run budget ($${(runCap - this.costUsd).toFixed(2)})`);
    }
  }

  private changedTextFiles(): Array<{ path: string; body: string }> {
    const files: Array<{ path: string; body: string }> = [];
    for (const path of candidateChangedFiles(this.worktree!.ctx, this.baseHead, this.pathspec)) {
      const body = this.readWorktreeFile(path);
      if (body !== null && !body.includes("\0")) files.push({ path, body });
    }
    return files;
  }

  private readWorktreeFile(path: string): string | null {
    const full = join(this.worktree?.path ?? this.config.repoRoot, path);
    if (!existsSync(full)) return null;
    try { return readFileSync(full, "utf8"); } catch { return null; }
  }

  private precedents(): string | null {
    const path = join(this.config.repoRoot, ".claude", "rules", "review-precedents.md");
    if (!existsSync(path)) return null;
    try {
      const body = readFileSync(path, "utf8");
      return body.includes("(none recorded yet)") ? null : body.slice(0, 6000);
    } catch { return null; }
  }

  private testSummary(): string {
    if (this.testStatus === "NOT_CONFIGURED") return "no test command was detected in this repository";
    const command = commandDisplay(this.verification.plan.commands.test);
    return `\`${command}\` was run by the orchestrator and reported ${this.testStatus}`;
  }

  private recordGate(stage: string, decision: GateDecision): void {
    this.ledger.append("gate", {
      stage, passed: decision.passed, demoted: decision.demoted,
      gating: decision.gating.length, stripped: decision.stripped.length,
    });
    for (const item of decision.stripped) {
      this.ledger.append("blocker_demoted", { stage, summary: item.finding.summary, reason: item.reason });
    }
    if (decision.demoted) this.warn(`${stage}: blocking verdict demoted because it cited no gating finding`);
  }

  /** Has this stage already run in the checkpoint we resumed from? */
  private alreadyDone(stage: string): boolean {
    return this.resumedFrom !== null && this.resumedFrom.completedStages.includes(stage);
  }

  private stageDone(stage: string): void {
    if (!this.completedStages.includes(stage)) this.completedStages.push(stage);
    this.stages[stage] = "DONE";
    this.checkpoint(stage);
  }

  private checkpoint(stage: string): void {
    if (!this.stages[stage]) this.stages[stage] = "RUNNING";
    const checkpoint: Checkpoint = {
      runId: this.runId, engineVersion: ENGINE_VERSION, stage,
      completedStages: [...this.completedStages],
      worktreePath: this.worktree?.path ?? null,
      baseHead: this.baseHead,
      taskHash: hashOf(this.config.task), configHash: this.configHash(),
      verificationPlanSha: this.verification?.digest ?? "",
      candidateTree: this.worktree ? candidateTreeOid(this.worktree.ctx, this.baseHead, this.pathspec) : null,
      at: new Date().toISOString(),
    };
    writeFileSync(join(this.artifacts, "checkpoint.json"), JSON.stringify(checkpoint, null, 2) + "\n");
    this.ledger.append("checkpoint", { stage, candidateTree: checkpoint.candidateTree });
  }

  private warn(message: string): void {
    this.warnings.push(message);
    this.ledger.append("note", { warning: message });
    this.log(`  ! ${message}`);
  }

  private result(status: RunStatus, exitCode: ExitCode, message: string, haltedAt: string | null): RunResult {
    if (haltedAt) this.stages[haltedAt] = exitCode === 4 ? "BUDGET" : "HALTED";
    return {
      status, exitCode, runId: this.runId, artifactsDir: this.artifacts,
      branch: this.worktree?.branch ?? null, commit: null,
      costUsd: this.costUsd, modelCalls: this.modelCalls, tokens: { ...this.tokens },
      stages: { ...this.stages }, haltedAt, message, warnings: [...this.warnings],
    };
  }
}

const PROTECTED_PATHS = [
  ".env", "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
  ".claude/settings.json", ".github/workflows",
];

class HaltError extends Error {
  constructor(readonly stage: string, message: string) { super(message); }
}
class BudgetError extends Error {
  constructor(readonly stage: string, message: string) { super(message); }
}

function hashOf(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function renderReview(review: ReviewOutput, report: string): string {
  return [
    "# Commit review", "",
    `## Verdict\n\n${review.verdict}`, "",
    "## Criteria coverage", "",
    review.coverage.length
      ? review.coverage.map(c => `- ${c.id}: ${c.satisfied ? "satisfied" : "NOT satisfied"} — ${c.evidence}`).join("\n")
      : "Not reported.",
    "",
    "## Findings", "",
    review.findings.length
      ? review.findings.map(f => `- **[${f.severity}]** ${f.location} — ${f.summary}\n  - Evidence: ${f.evidence}`).join("\n")
      : "None.",
    "",
    report ? `## Reviewer notes\n\n${report}` : "",
    "",
  ].join("\n");
}
