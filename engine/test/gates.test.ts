import { describe, expect, it } from "vitest";
import {
  applyRefutations, decideReviewGate, filesInDiff, findUncoveredCriteria, isBlockingVerdict,
  lintPlan, verifyFindings, type Finding, type PlanStep,
} from "../src/gates.js";

const diff = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,4 @@
 const a = 1;
+const b = 2;
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1 @@
+export const c = 3;
`;

const blocker = (over: Partial<Finding> = {}): Finding => ({
  severity: "BLOCKER", location: "src/app.ts:2", summary: "off-by-one drops the last row",
  evidence: "loop bound is i < n - 1 at line 2", ...over,
});

describe("diff parsing", () => {
  it("lists the files a change touches, excluding /dev/null", () => {
    expect([...filesInDiff(diff)].sort()).toEqual(["src/app.ts", "src/new.ts"]);
  });
});

describe("evidence-grounded gating", () => {
  it("keeps a blocker that cites a touched file with evidence", () => {
    const { gating, stripped } = verifyFindings([blocker()], diff);
    expect(gating).toHaveLength(1);
    expect(stripped).toHaveLength(0);
  });

  it("strips a blocker with no evidence", () => {
    for (const evidence of ["", "-", "—", "N/A", "none"]) {
      const { gating, stripped } = verifyFindings([blocker({ evidence })], diff);
      expect(gating).toHaveLength(0);
      expect(stripped[0]!.reason).toBe("no evidence cited");
    }
  });

  it("strips a blocker citing a file the change never touched", () => {
    const { gating, stripped } = verifyFindings([blocker({ location: "src/untouched.ts:9" })], diff);
    expect(gating).toHaveLength(0);
    expect(stripped[0]!.reason).toContain("does not touch");
  });

  it("accepts a citation written against a different path root", () => {
    const { gating } = verifyFindings([blocker({ location: "app.ts:2" })], diff);
    expect(gating).toHaveLength(1);
  });

  it("ignores non-blocker findings entirely", () => {
    const { gating } = verifyFindings([blocker({ severity: "WARN" }), blocker({ severity: "PRE_EXISTING" })], diff);
    expect(gating).toHaveLength(0);
  });
});

describe("review gate", () => {
  it("passes an approving verdict", () => {
    const decision = decideReviewGate({ verdict: "APPROVE", findings: [] }, diff);
    expect(decision.passed).toBe(true);
    expect(decision.demoted).toBe(false);
  });

  it("blocks on a verified blocker", () => {
    const decision = decideReviewGate({ verdict: "REQUEST_CHANGES", findings: [blocker()] }, diff);
    expect(decision.passed).toBe(false);
    expect(decision.gating).toHaveLength(1);
  });

  it("demotes a blocking verdict that cites nothing that survives", () => {
    const decision = decideReviewGate({ verdict: "REQUEST_CHANGES", findings: [blocker({ evidence: "-" })] }, diff);
    expect(decision.passed).toBe(true);
    expect(decision.demoted).toBe(true);
    expect(decision.notes.join(" ")).toContain("demoted");
  });

  it("demotes a blocking verdict with no findings at all", () => {
    const decision = decideReviewGate({ verdict: "REVISE_DESIGN", findings: [] }, null);
    expect(decision.passed).toBe(true);
    expect(decision.demoted).toBe(true);
  });

  it("knows which verdicts block", () => {
    expect(isBlockingVerdict("REQUEST_CHANGES")).toBe(true);
    expect(isBlockingVerdict("revise_design")).toBe(true);
    expect(isBlockingVerdict("APPROVE")).toBe(false);
    expect(isBlockingVerdict("PASS")).toBe(false);
  });
});

describe("refutation", () => {
  it("keeps confirmed blockers and drops refuted ones", () => {
    const a = blocker({ summary: "real bug" });
    const b = blocker({ summary: "imagined bug" });
    const { confirmed, refuted } = applyRefutations([a, b], [
      { finding: a, confirmed: true, reason: "reproduced" },
      { finding: b, confirmed: false, reason: "the guard clause above already handles it" },
    ]);
    expect(confirmed.map(f => f.summary)).toEqual(["real bug"]);
    expect(refuted).toHaveLength(1);
  });

  it("keeps a blocker the refuter never judged", () => {
    const a = blocker();
    expect(applyRefutations([a], []).confirmed).toHaveLength(1);
  });
});

describe("criteria coverage (deterministic drift detection)", () => {
  const step = (over: Partial<PlanStep> = {}): PlanStep => ({
    file: "src/app.ts", action: "MODIFY", anchor: "const a = 1;", intent: "add b",
    test: "npm test -> passes", criteria: ["SC1"], ...over,
  });

  it("passes when every criterion is planned and tested", () => {
    expect(findUncoveredCriteria(["SC1"], [step()])).toEqual([]);
  });

  it("reports a criterion no step names", () => {
    expect(findUncoveredCriteria(["SC1", "SC2"], [step()])).toEqual(["SC2"]);
  });

  it("reports a criterion that is planned but never tested", () => {
    expect(findUncoveredCriteria(["SC1"], [step({ test: "-" })])).toEqual(["SC1"]);
  });
});

describe("plan lint", () => {
  const files: Record<string, string> = {
    "src/app.ts": "export function login() {\n  const token = read();\n}\n",
    "src/tpl.ts": "const q = `SELECT 1`;\n",
  };
  const read = (file: string) => files[file] ?? null;

  it("accepts a modify step whose anchor really occurs", () => {
    expect(lintPlan([{ file: "src/app.ts", action: "MODIFY", anchor: "export function login() {", intent: "i", test: "t", criteria: [] }], read)).toEqual([]);
  });

  it("rejects a modify step on a file that does not exist", () => {
    const findings = lintPlan([{ file: "src/nope.ts", action: "MODIFY", anchor: "x", intent: "i", test: "t", criteria: [] }], read);
    expect(findings[0]!.problem).toContain("does not exist");
  });

  it("rejects an anchor that does not occur in the file", () => {
    const findings = lintPlan([{ file: "src/app.ts", action: "MODIFY", anchor: "function logout()", intent: "i", test: "t", criteria: [] }], read);
    expect(findings[0]!.problem).toContain("anchor not found");
  });

  it("accepts an anchor whose backticks arrived escaped", () => {
    expect(lintPlan([{ file: "src/tpl.ts", action: "MODIFY", anchor: "const q = \\`SELECT 1\\`;", intent: "i", test: "t", criteria: [] }], read)).toEqual([]);
  });

  it("does not lint CREATE steps or anchorless deletes", () => {
    expect(lintPlan([
      { file: "src/brand-new.ts", action: "CREATE", anchor: null, intent: "i", test: "t", criteria: [] },
      { file: "src/app.ts", action: "DELETE", anchor: null, intent: "i", test: "t", criteria: [] },
    ], read)).toEqual([]);
  });
});

describe("prompt contracts that keep the pipeline honest", () => {
  it("tells the planner an existing failing test is the specification", async () => {
    const { buildPlanPrompt } = await import("../src/roles/plan.js");
    const prompt = buildPlanPrompt({
      task: "the items delete test is failing; fix the bug",
      contextPack: "", precedents: null, critique: null, lintFindings: null, hasTestCommand: true,
    });
    expect(prompt).toMatch(/that test \*is\* the acceptance test/);
    expect(prompt).toMatch(/Do not modify it, do not add cases to it/);
  });

  it("does not ask for acceptance tests where there is no test command", async () => {
    const { buildPlanPrompt } = await import("../src/roles/plan.js");
    const prompt = buildPlanPrompt({
      task: "write the docs", contextPack: "", precedents: null,
      critique: null, lintFindings: null, hasTestCommand: false,
    });
    expect(prompt).toContain("No test command was detected");
    expect(prompt).not.toContain("acceptance test");
  });

  it("carries the no-weakening and scope rules into every code-producing prompt", async () => {
    const { ENGINEERING_STANDARD } = await import("../src/roles/common.js");
    expect(ENGINEERING_STANDARD).toMatch(/already specifies the behavior you are changing/);
    expect(ENGINEERING_STANDARD).toMatch(/Stay inside the area the task and the plan name/);
  });
});
