#!/usr/bin/env node
"use strict";

const fs = require("fs");
const crypto = require("crypto");

const [corpusPath, outputPath] = process.argv.slice(2);
if (!corpusPath || !outputPath) {
  console.error("usage: evaluate-release-slos.js CORPUS OUTPUT");
  process.exit(2);
}

const corpusBytes = fs.readFileSync(corpusPath);
const corpus = JSON.parse(corpusBytes.toString("utf8"));
if (corpus.schemaVersion !== "1.0" || corpus.policyVersion !== "1.0") {
  throw new Error("unsupported release SLO corpus or policy version");
}

const cases = corpus.cases;
const ratio = (items, predicate) => {
  if (!items.length) return null;
  return items.filter(predicate).length / items.length;
};

const recoverable = cases.filter(item => item.recoveryAvailable);
const commitEligible = cases.filter(item => item.commitEligible);
const heals = cases.filter(item => item.mutationAfterReview);
const reviewIntegrity = cases.filter(item => item.reviewedDiffIntegrity !== undefined);
const mismatches = cases.filter(item => item.integrityMismatchInjected);
const redaction = cases.filter(item => item.secretPersistenceAttempted);
const protectedPaths = cases.filter(item => item.protectedPathAttempted);
const scannerFindings = cases.filter(item => item.scannerFinding);
const rollbacks = cases.filter(item => item.rollbackRequested || item.shadowMode);
const hardGates = cases.filter(item => item.terminalHardGateFailure);

const metrics = {
  recoveryReachability: ratio(recoverable, item => item.recoveryEnteredBeforeHalt),
  finalVerificationCoverage: ratio(commitEligible, item => item.finalVerificationCurrent),
  postHealSecurityCoverage: ratio(heals,
    item => item.finalVerificationCurrent && item.securityCurrent),
  reviewedDiffIntegrity: ratio(reviewIntegrity, item => item.reviewedDiffIntegrity),
  preventedIntegrityMismatch: ratio(mismatches, item => item.commitPrevented),
  redactionCoverage: ratio(redaction, item => item.durableSecretAbsent),
  protectedPathEnforcement: ratio(protectedPaths, item => item.protectedPathBlocked),
  scannerNonWaiver: ratio(scannerFindings, item => item.modelCallPrevented),
  rollbackSuccess: ratio(rollbacks, item => item.baselineBehaviorRestored),
  hardGateEscapes: hardGates.filter(item => item.advancedAfterFailure).length
};

const thresholdResults = {};
for (const [name, target] of Object.entries(corpus.thresholds)) {
  const metricName = name === "maximumHardGateEscapes" ? "hardGateEscapes" : name;
  const actual = metrics[metricName];
  thresholdResults[name] = {
    target,
    actual,
    passed: name === "maximumHardGateEscapes" ? actual <= target : actual >= target
  };
}

const report = {
  schemaVersion: "1.0",
  policyVersion: corpus.policyVersion,
  corpusSha256: crypto.createHash("sha256").update(corpusBytes).digest("hex"),
  cases: cases.length,
  metrics,
  thresholds: thresholdResults,
  passed: Object.values(thresholdResults).every(item => item.passed),
  evidenceClass: "offline-control-fixtures",
  liveProviderCanary: false,
  gaEligible: false,
  gaBlocker: "controlled-provider-canary-and-security-approval-required"
};

fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
if (!report.passed) process.exit(1);
