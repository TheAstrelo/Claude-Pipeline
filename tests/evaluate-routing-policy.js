#!/usr/bin/env node
"use strict";

const fs = require("fs");

const corpusPath = process.argv[2];
const outputPath = process.argv[3] || null;
if (!corpusPath) {
  console.error("usage: evaluate-routing-policy.js CORPUS [OUTPUT]");
  process.exit(2);
}

const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));
if (String(corpus.schemaVersion || "").split(".")[0] !== "1" ||
    corpus.policyVersion !== "1.0") {
  throw new Error("unsupported routing corpus or policy version");
}

function classify(task) {
  const normalized = String(task || "").toLowerCase();
  const riskRules = [
    /\b(auth|authentication|authorization|oauth|oidc|sso|jwt|login|password|permission|role)\b/,
    /\b(payment|billing|invoice|checkout|refund|payout|financial|bank)\b/,
    /\b(secret|credential|token|api key|encryption|cryptograph|certificate)\b/,
    /\b(drop|delete|purge|destructive|migration|schema change|backfill)\b/,
    /\b(security|sandbox|privilege|admin|webhook|upload|ssrf|xss|injection)\b/
  ];
  const ambiguityRules = [
    /\b(not sure|figure (it|this) out|whatever|somehow|maybe|tbd|unknown|unclear)\b/,
    /\b(either|or maybe|conflicting|contradictory)\b/
  ];
  const words = normalized.match(/[a-z0-9]+/g) || [];
  return {
    risk: riskRules.some(rule => rule.test(normalized)) ? "HIGH" : "NORMAL",
    ambiguity: ambiguityRules.some(rule => rule.test(normalized)) || words.length <= 3
      ? "HIGH" : "NORMAL"
  };
}

function laneFor(test, labels) {
  if (test.deterministicResult === "CLEAN" &&
      [7, 8, 10].includes(test.phase)) return "none";
  if (["yolo"].includes(test.profile)) return "fast";
  if (test.profile === "paranoid" &&
      [1, 4, 5, 6, 11].includes(test.phase)) return "strong";
  if (test.profile === "fast" && labels.risk === "HIGH" &&
      [6, 11].includes(test.phase)) return "strong";
  if (test.profile === "standard" &&
      ((labels.risk === "HIGH" && [1, 4, 6, 11].includes(test.phase)) ||
       (labels.ambiguity === "HIGH" && [1, 4].includes(test.phase)))) {
    return "strong";
  }
  if ([2, 3, 12].includes(test.phase)) return "strong";
  return "fast";
}

let truePositive = 0;
let falsePositive = 0;
let falseNegative = 0;
let trueNegative = 0;
let baselinePasses = 0;
let adaptivePasses = 0;
let baselineCost = 0;
let adaptiveCost = 0;
let baselineLatency = 0;
let adaptiveLatency = 0;
let baselineRecovery = 0;
let adaptiveRecovery = 0;
let cleanQaCases = 0;
let cleanQaCalls = 0;
const results = [];

for (const test of corpus.cases) {
  const labels = classify(test.task);
  const lane = laneFor(test, labels);
  const predictedStrong = lane === "strong";
  if (predictedStrong && test.labelRequiresStrong) truePositive++;
  else if (predictedStrong) falsePositive++;
  else if (test.labelRequiresStrong) falseNegative++;
  else trueNegative++;

  if (labels.risk !== test.expectedRisk ||
      labels.ambiguity !== test.expectedAmbiguity ||
      lane !== test.expectedLane) {
    throw new Error(
      `${test.id}: expected ${test.expectedRisk}/${test.expectedAmbiguity}/${test.expectedLane}, ` +
      `got ${labels.risk}/${labels.ambiguity}/${lane}`
    );
  }
  const selected = test[lane];
  if (!selected) throw new Error(`${test.id}: missing outcome for selected lane ${lane}`);
  baselinePasses += test.baseline.passesRequiredChecks ? 1 : 0;
  adaptivePasses += selected.passesRequiredChecks ? 1 : 0;
  baselineCost += test.baseline.costUnits;
  adaptiveCost += selected.costUnits;
  baselineLatency += test.baseline.latencyUnits;
  adaptiveLatency += selected.latencyUnits;
  baselineRecovery += test.baseline.recoverySuccess ? 1 : 0;
  adaptiveRecovery += selected.recoverySuccess ? 1 : 0;
  if (test.deterministicResult === "CLEAN" && [7, 8, 10].includes(test.phase)) {
    cleanQaCases++;
    if (lane !== "none") cleanQaCalls++;
  }
  results.push({ id: test.id, labels, selectedLane: lane });
}

const precision = truePositive / Math.max(1, truePositive + falsePositive);
const recall = truePositive / Math.max(1, truePositive + falseNegative);
const baselinePassRate = baselinePasses / corpus.cases.length;
const adaptivePassRate = adaptivePasses / corpus.cases.length;
const cleanQaCallReduction = cleanQaCases
  ? 1 - cleanQaCalls / cleanQaCases : 0;
const thresholds = corpus.thresholds;
const passed =
  precision >= thresholds.classificationPrecision &&
  recall >= thresholds.classificationRecall &&
  adaptivePassRate - baselinePassRate >= thresholds.requiredCheckPassRateDeltaMin &&
  cleanQaCallReduction >= thresholds.minimumCleanQaCallReduction;

const report = {
  schemaVersion: "1.0",
  policyVersion: corpus.policyVersion,
  corpusSha256: require("crypto").createHash("sha256")
    .update(fs.readFileSync(corpusPath)).digest("hex"),
  cases: corpus.cases.length,
  confusion: { truePositive, falsePositive, falseNegative, trueNegative },
  metrics: {
    classificationPrecision: precision,
    classificationRecall: recall,
    requiredCheckPassRate: {
      baseline: baselinePassRate,
      adaptive: adaptivePassRate,
      delta: adaptivePassRate - baselinePassRate
    },
    cleanQaCallReduction,
    costUnits: { baseline: baselineCost, adaptive: adaptiveCost },
    latencyUnits: { baseline: baselineLatency, adaptive: adaptiveLatency },
    recoverySuccesses: { baseline: baselineRecovery, adaptive: adaptiveRecovery }
  },
  thresholds,
  passed,
  results
};

const rendered = JSON.stringify(report, null, 2) + "\n";
if (outputPath) fs.writeFileSync(outputPath, rendered);
else process.stdout.write(rendered);
if (!passed) process.exit(1);
