import assert from "node:assert/strict";
import test from "node:test";
import { clusterFindings, collectRunResults, parseTesterResult } from "./results.ts";

function rawFinding(id, testerId, route = "https://example.test/onboarding/?from=home") {
  return {
    id,
    testerId,
    route,
    stepId: "create-account",
    category: "navigation",
    severity: testerId === "keyboard" ? "high" : "medium",
    observation: {
      summary: "The next action was easy to miss",
      expected: "The next action should be clear",
      actual: "The tester searched before continuing",
    },
    evidence: [{ pageUrl: "https://example.test/onboarding", elapsedMs: 1200 }],
    reproduction: ["Open onboarding", "Look for the next action"],
  };
}

function rawResult() {
  return {
    runId: "run-1",
    personaId: "first-time",
    targetUrl: "https://example.test",
    status: "completed",
    steps: [{
      id: "create-account",
      title: "Create an account",
      mission: "Complete onboarding",
      outcome: "friction",
      observationCount: 1,
    }],
    findings: [rawFinding("finding-1", "first-time")],
  };
}

test("tester result parser validates and returns the trusted result shape", () => {
  const parsed = parseTesterResult(JSON.stringify(rawResult()));
  assert.equal(parsed.personaId, "first-time");
  assert.equal(parsed.findings[0].evidence[0].pageUrl, "https://example.test/onboarding");
});

test("tester result parser rejects malformed and cross-persona findings", () => {
  assert.throws(() => parseTesterResult("not json"), /not valid JSON/);
  const result = rawResult();
  result.findings[0].testerId = "impatient";
  assert.throws(() => parseTesterResult(result), /another persona/);
});

test("deterministic clusters use unique tester evidence and exact route-step-category matches", () => {
  const findings = [
    rawFinding("b", "keyboard", "/onboarding"),
    rawFinding("a", "first-time", "/onboarding/"),
    rawFinding("c", "first-time", "/onboarding?retry=1"),
    { ...rawFinding("d", "edge-case", "/settings"), stepId: "recover", category: "validation" },
  ];

  const clusters = clusterFindings(findings);
  assert.equal(clusters.length, 2);
  assert.deepEqual(clusters[0].findingIds, ["a", "b", "c"]);
  assert.deepEqual(clusters[0].affectedTesterIds, ["first-time", "keyboard"]);
  assert.equal(clusters[0].affectedCount, 2);
  assert.match(clusters[0].summary, /^2 \/ 4 testers/);
  assert.deepEqual(clusterFindings(findings), clusters);
});

test("Blob result collection returns partial public evidence without inventing missing testers", async () => {
  const first = rawResult();
  const keyboard = {
    ...rawResult(),
    personaId: "keyboard",
    findings: [rawFinding("finding-keyboard", "keyboard")],
  };
  const artifacts = [
    { pathname: "runs/run-1/first-time/result.json", url: "https://blob.test/first.json", uploadedAt: new Date("2026-01-01") },
    { pathname: "runs/run-1/keyboard/result.json", url: "https://blob.test/keyboard.json", uploadedAt: new Date("2026-01-02") },
    { pathname: "runs/run-1/keyboard/03-task.jpg", url: "https://blob.test/task.jpg", uploadedAt: new Date("2026-01-02") },
    { pathname: "runs/run-1/impatient/bad.jpg", url: "javascript:alert(1)", uploadedAt: new Date("2026-01-02") },
  ];
  const bodies = new Map([
    [artifacts[0].url, JSON.stringify(first)],
    [artifacts[1].url, JSON.stringify(keyboard)],
  ]);

  const result = await collectRunResults("run-1", artifacts, async ({ url }) => bodies.get(url));
  assert.equal(result.status, "partial");
  assert.deepEqual(result.receivedTesterIds, ["first-time", "keyboard"]);
  assert.deepEqual(result.missingTesterIds, ["impatient", "edge-case"]);
  assert.equal(result.findings.length, 2);
  assert.equal(result.clusters[0].affectedCount, 2);
  assert.deepEqual(result.screenshots, [{ testerId: "keyboard", pathname: "runs/run-1/keyboard/03-task.jpg", url: "https://blob.test/task.jpg" }]);
  assert.deepEqual(result.issues, [{ code: "invalid-artifact", testerId: "impatient" }]);
});
