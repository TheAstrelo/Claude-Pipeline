/**
 * Verdicts, the BLOCKER lane, and what is allowed to stop a run.
 *
 * The failure mode this module exists to prevent is a reviewer that blocks on
 * taste. A review may only gate on a defect in this change that would produce
 * wrong behavior, data loss, a crash, or a security breach — stated with a
 * concrete trigger and a citation into the diff. Everything else is a note.
 * Style, lint and docs belong to the phases that own them.
 */

export type Severity = "BLOCKER" | "WARN" | "PRE_EXISTING";

export interface Finding {
  severity: Severity;
  /** file:line, or the file alone. Verified against the diff before gating. */
  location: string;
  summary: string;
  /** What triggers it and where that is visible. An empty cell cannot gate. */
  evidence: string;
}

export type Verdict = string;

export interface RoleOutput {
  verdict: Verdict;
  findings: Finding[];
}

export interface GateDecision {
  /** May the run continue past this gate? */
  passed: boolean;
  /** Findings that survived verification and may gate. */
  gating: Finding[];
  /** Findings stripped from the gate, with the reason, for the ledger. */
  stripped: Array<{ finding: Finding; reason: string }>;
  /** Set when a blocking verdict was demoted for citing no gating finding. */
  demoted: boolean;
  notes: string[];
}

/** Verdicts that ask the run to stop or loop, per role. */
const BLOCKING_VERDICTS = new Set(["REVISE_DESIGN", "REQUEST_CHANGES", "FAIL", "CRITICAL", "FAILED"]);

export function isBlockingVerdict(verdict: string): boolean {
  return BLOCKING_VERDICTS.has(verdict.trim().toUpperCase());
}

/** Files a diff actually touches, so a finding cannot cite something absent. */
export function filesInDiff(diff: string): Set<string> {
  const files = new Set<string>();
  for (const line of diff.split("\n")) {
    const match = /^(?:diff --git a\/(.+?) b\/|\+\+\+ b\/(.+?)$|--- a\/(.+?)$)/.exec(line);
    const path = match?.[1] ?? match?.[2] ?? match?.[3];
    if (path && path !== "dev/null") files.add(path.trim());
  }
  return files;
}

function citedFile(location: string): string {
  return location.split(":")[0]?.trim() ?? "";
}

const EMPTY_EVIDENCE = /^(|-|—|–|n\/?a|none|tbd|see above)$/i;

/**
 * Strip findings that cannot carry a gate: no evidence, or a citation into a
 * file this change never touched. Both are the shapes a confident-sounding
 * hallucination takes, and both are mechanically checkable.
 */
export function verifyFindings(findings: Finding[], diff: string | null): {
  gating: Finding[];
  stripped: Array<{ finding: Finding; reason: string }>;
} {
  const gating: Finding[] = [];
  const stripped: Array<{ finding: Finding; reason: string }> = [];
  const files = diff === null ? null : filesInDiff(diff);

  for (const finding of findings) {
    if (finding.severity !== "BLOCKER") continue;
    if (EMPTY_EVIDENCE.test((finding.evidence ?? "").trim())) {
      stripped.push({ finding, reason: "no evidence cited" });
      continue;
    }
    if (files) {
      const file = citedFile(finding.location ?? "");
      if (!file || EMPTY_EVIDENCE.test(file)) {
        stripped.push({ finding, reason: "no location cited" });
        continue;
      }
      // Accept a suffix match: reviewers cite paths relative to varying roots.
      const known = [...files].some(f => f === file || f.endsWith(`/${file}`) || file.endsWith(`/${f}`));
      if (!known) {
        stripped.push({ finding, reason: `cites ${file}, which this change does not touch` });
        continue;
      }
    }
    gating.push(finding);
  }
  return { gating, stripped };
}

/**
 * Decide a review gate. A blocking verdict with no surviving BLOCKER is
 * demoted to proceed-with-notes: the run records what was claimed, and keeps
 * going, rather than halting a human on an unevidenced objection.
 */
export function decideReviewGate(output: RoleOutput, diff: string | null): GateDecision {
  const { gating, stripped } = verifyFindings(output.findings, diff);
  const blocking = isBlockingVerdict(output.verdict);
  const notes: string[] = [];
  if (blocking && gating.length === 0) {
    notes.push(`verdict ${output.verdict} cited no gating finding; demoted to proceed-with-notes`);
    return { passed: true, gating, stripped, demoted: true, notes };
  }
  for (const item of stripped) notes.push(`stripped: ${item.finding.summary} (${item.reason})`);
  return { passed: !blocking && gating.length === 0, gating, stripped, demoted: false, notes };
}

export interface RefuterResult {
  finding: Finding;
  confirmed: boolean;
  reason: string;
}

/**
 * A confirmed BLOCKER is the only thing that may drive a recovery loop or a
 * halt. The refuter runs on the reviewer's own lane: a cheaper model would
 * just launder findings away.
 */
export function applyRefutations(gating: Finding[], refutations: RefuterResult[]): {
  confirmed: Finding[];
  refuted: RefuterResult[];
} {
  const byFinding = new Map(refutations.map(r => [r.finding.summary, r]));
  const confirmed: Finding[] = [];
  const refuted: RefuterResult[] = [];
  for (const finding of gating) {
    const verdict = byFinding.get(finding.summary);
    if (verdict && !verdict.confirmed) refuted.push(verdict);
    else confirmed.push(finding);
  }
  return { confirmed, refuted };
}

/**
 * Every Success Criterion must be reachable: named by at least one plan step
 * and by at least one step's test. This replaces the model-driven drift phase
 * with something mechanical.
 */
export interface PlanStep {
  file: string;
  action: "CREATE" | "MODIFY" | "DELETE" | "VERIFY";
  anchor: string | null;
  intent: string;
  test: string;
  criteria: string[];
}

export function findUncoveredCriteria(criteriaIds: string[], steps: PlanStep[]): string[] {
  const planned = new Set<string>();
  const tested = new Set<string>();
  for (const step of steps) {
    for (const id of step.criteria) {
      planned.add(id);
      if (step.test && step.test.trim() && !EMPTY_EVIDENCE.test(step.test.trim())) tested.add(id);
    }
  }
  return criteriaIds.filter(id => !planned.has(id) || !tested.has(id));
}

export interface LintFinding {
  step: number;
  file: string;
  problem: string;
}

/**
 * Plan lint: a MODIFY step must name a file that exists, and its anchor must
 * literally occur in that file. Catching this before the build spends anything
 * is the cheapest correction in the pipeline.
 */
export function lintPlan(steps: PlanStep[], read: (file: string) => string | null): LintFinding[] {
  const findings: LintFinding[] = [];
  steps.forEach((step, index) => {
    const number = index + 1;
    if (step.action !== "MODIFY" && step.action !== "DELETE") return;
    const body = read(step.file);
    if (body === null) {
      findings.push({ step: number, file: step.file, problem: `${step.action} target does not exist` });
      return;
    }
    if (step.action === "DELETE" || !step.anchor) return;
    for (const form of anchorForms(step.anchor)) {
      if (body.includes(form)) return;
    }
    findings.push({ step: number, file: step.file, problem: `anchor not found in the file: ${truncate(step.anchor)}` });
  });
  return findings;
}

/**
 * Anchors arrive escaped in several ways depending on how the model quoted
 * them. Accepting the obvious variants avoids re-planning over a backtick.
 */
function anchorForms(anchor: string): string[] {
  const forms = [anchor, anchor.replace(/\\`/g, "`").replace(/\\\\/g, "\\")];
  const beforeTrailingEscape = anchor.split("\\")[0];
  if (beforeTrailingEscape && beforeTrailingEscape !== anchor) forms.push(beforeTrailingEscape);
  return [...new Set(forms.map(f => f.trim()).filter(Boolean))];
}

function truncate(value: string, max = 60): string {
  return value.length <= max ? value : value.slice(0, max) + "…";
}
