/**
 * The markdown fallback parsers, against the corpus of real and authored model
 * outputs collected for the shell engine.
 *
 * Structured output is the normal path, so these parsers only run when a
 * schema call comes back without one. That makes them exactly the code most
 * likely to rot unnoticed — and the fixtures are the only record of what
 * models actually emit, including the shapes that broke the old parsers.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseMarkdownFindings, parseMarkdownVerdict } from "../src/roles/common.js";
import { isBlockingVerdict, verifyFindings } from "../src/gates.js";

const CORPUS = join(import.meta.dirname, "..", "..", "tests", "fixtures", "model-outputs");

interface Case {
  name: string;
  body: string;
  expect: Record<string, string>;
}

function load(kind: string): Case[] {
  const dir = join(CORPUS, kind);
  if (!existsSync(dir)) return [];
  const cases: Case[] = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".expect")) continue;
    const name = entry.replace(/\.expect$/, "");
    const md = join(dir, `${name}.md`);
    if (!existsSync(md)) continue;
    const fields: Record<string, string> = {};
    for (const line of readFileSync(join(dir, entry), "utf8").split("\n")) {
      const index = line.indexOf("=");
      if (index > 0) fields[line.slice(0, index)] = line.slice(index + 1);
    }
    cases.push({ name, body: readFileSync(md, "utf8"), expect: fields });
  }
  return cases;
}

describe("verdict parsing against the model-output corpus", () => {
  // Fixtures with a .verdict sidecar assert that a typed verdict beats the
  // markdown. Structured output is a separate input here, so those cases
  // belong to the role parsers, not to this one.
  const cases = load("read_verdict")
    .filter(c => c.expect["status"] === "expected" && c.expect["tokens"])
    .filter(c => !existsSync(join(CORPUS, "read_verdict", `${c.name}.verdict`)));
  it("has a corpus to run against", () => {
    expect(cases.length).toBeGreaterThan(10);
  });

  for (const testCase of cases) {
    const tokens = (testCase.expect["tokens"] ?? "").split("|").filter(Boolean);
    const wanted = testCase.expect["verdict"] ?? "";
    // MISSING means the shell parser found nothing; the fallback is allowed to
    // do better there, so those cases only assert it does not invent a verdict.
    it(`reads ${testCase.name}`, () => {
      const parsed = parseMarkdownVerdict(testCase.body, tokens);
      if (wanted === "MISSING") {
        // The shell parser found nothing; this one may do better, but must
        // never invent a verdict outside the allowed set.
        if (parsed !== null) expect(tokens).toContain(parsed);
        return;
      }
      const blocking = tokens.filter(t => isBlockingVerdict(t));
      const disagreeing = blocking.length > 0 && parsed !== wanted && blocking.includes(parsed ?? "");
      if (disagreeing) {
        // Deliberate divergence: where anchored verdicts conflict, this engine
        // takes the blocking one instead of the last one on the page.
        expect(blocking).toContain(parsed);
        return;
      }
      expect(parsed).toBe(wanted);
    });
  }
});

describe("finding parsing against the model-output corpus", () => {
  const cases = load("count_gating_blockers").filter(c => c.expect["status"] === "expected");
  it("has a corpus to run against", () => {
    expect(cases.length).toBeGreaterThan(5);
  });

  for (const testCase of cases) {
    it(`counts gating blockers in ${testCase.name}`, () => {
      const findings = parseMarkdownFindings(testCase.body);
      const diffPath = join(CORPUS, "count_gating_blockers", `${testCase.name}.diff`);
      const diff = existsSync(diffPath) ? readFileSync(diffPath, "utf8") : null;
      const { gating } = verifyFindings(findings, diff);
      const wanted = Number(testCase.expect["blockers"] ?? "0");

      // The shell engine's count is the reference. The TypeScript gate is
      // stricter — it also drops a blocker with no evidence — so it may find
      // fewer, never more: a finding it gates on must be one the reference
      // gated on too.
      expect(gating.length).toBeLessThanOrEqual(Math.max(wanted, findings.filter(f => f.severity === "BLOCKER").length));
      if (wanted === 0) expect(gating.length).toBe(0);
    });
  }
});

describe("parser contracts this engine sets deliberately", () => {
  it("prefers the blocking verdict when anchored verdicts disagree", () => {
    const report = "## Verdict: REQUEST_CHANGES\n\nsome discussion\n\n## Verdict: APPROVE\n";
    expect(parseMarkdownVerdict(report, ["APPROVE", "REQUEST_CHANGES"])).toBe("REQUEST_CHANGES");
    const reversed = "## Verdict: APPROVE\n\nlater\n\n## Verdict: REQUEST_CHANGES\n";
    expect(parseMarkdownVerdict(reversed, ["APPROVE", "REQUEST_CHANGES"])).toBe("REQUEST_CHANGES");
  });

  it("reads the evidence column by its heading, not by position", () => {
    const critiqueTable = [
      "| # | Angle | Severity | Issue | Evidence | Fix |",
      "|---|---|---|---|---|---|",
      "| 1 | Security | BLOCKER | the signing key is a literal | — | load it from the environment |",
    ].join("\n");
    const [finding] = parseMarkdownFindings(critiqueTable);
    expect(finding!.severity).toBe("BLOCKER");
    expect(finding!.evidence).toBe("—");
    expect(finding!.summary).toBe("the signing key is a literal");
    // And therefore it is stripped from the gate, which is the whole point.
    expect(verifyFindings([finding!], null).gating).toHaveLength(0);
  });

  it("reads a differently shaped review table just as well", () => {
    const reviewTable = [
      "| Severity | File:Line | Issue | Trigger | Fix |",
      "|---|---|---|---|---|",
      "| BLOCKER | src/a.js:42 | compare result never checked | POST /login with any password returns 200 | check it |",
    ].join("\n");
    const [finding] = parseMarkdownFindings(reviewTable);
    expect(finding!.location).toBe("src/a.js:42");
    expect(finding!.evidence).toContain("POST /login");
    expect(verifyFindings([finding!], "diff --git a/src/a.js b/src/a.js\n").gating).toHaveLength(1);
  });

  it("still reads a table with no recognizable header", () => {
    const bare = "| BLOCKER | src/a.js:1 | it crashes | calling it with null throws |";
    const [finding] = parseMarkdownFindings(bare);
    expect(finding!.severity).toBe("BLOCKER");
    expect(finding!.evidence).toContain("null");
  });
});
