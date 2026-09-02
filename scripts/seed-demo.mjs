#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { put } from "@vercel/blob";

const root = path.resolve(import.meta.dirname, "..");
if (existsSync(path.join(root, ".env.local"))) process.loadEnvFile(path.join(root, ".env.local"));
if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN is required");

const runId = "seeded-todomvc-preview";
const targetUrl = "https://demo.playwright.dev/todomvc/";
const publicOrigin = (process.env.TRIALROOM_PUBLIC_ORIGIN ?? "https://trialroom-sigma.vercel.app").replace(/\/$/, "");
const steps = [
  ["orient", "Understand the product", "Identify the product purpose and primary action."],
  ["enter", "Enter the main experience", "Reach the task input and begin without invented credentials."],
  ["primary-task", "Complete the primary task", "Create and complete a representative task."],
  ["review", "Review the result", "Inspect the completed state and related view."],
  ["recover", "Recover from one mistake", "Make one safe mistake and return to a useful state."],
];
const testers = {
  "first-time": { name: "Maya, the first-time user", durations: [709, 32, 75, 42, 323], friction: [3] },
  impatient: { name: "Leo, the impatient user", durations: [736, 82, 18, 23, 42], friction: [4] },
  keyboard: { name: "Noor, the keyboard user", durations: [743, 65, 25, 17, 159], friction: [2, 3] },
  "edge-case": { name: "Eli, the edge-case user", durations: [706, 294, 70, 249, 568], friction: [4] },
};

const findingData = {
  "first-time": [{
    id: "first-time-filter-discovery", stepId: "review", category: "navigation", severity: "medium",
    summary: "Completed-task filters are easy to miss",
    expected: "A first-time user should notice how to review completed work immediately after finishing a task.",
    actual: "The small filters sit beneath the item count and only appear after a task exists.",
    action: "Completed one of two tasks, then looked for a completed-work view.",
    reproduction: ["Add two tasks", "Complete one task", "Look for a way to view completed work"],
    shot: 3, elapsedMs: 42,
  }],
  impatient: [{
    id: "impatient-empty-submit-feedback", stepId: "recover", category: "feedback", severity: "low",
    summary: "Empty submission has no visible feedback",
    expected: "A quick user should understand that an empty action was intentionally ignored.",
    actual: "The task count stayed unchanged and no visible alert or explanation appeared.",
    action: "Pressed Enter with an empty new-task input.",
    reproduction: ["Create one task", "Focus the empty new-task input", "Press Enter and observe the unchanged page"],
    shot: 4, elapsedMs: 42,
  }],
  keyboard: [{
    id: "keyboard-task-toggle-focus", stepId: "primary-task", category: "accessibility", severity: "medium",
    summary: "The task checkbox has no visible keyboard focus indicator",
    expected: "The task-completion control should visibly indicate keyboard focus.",
    actual: "The focused checkbox was operable but reported opacity 0, outline none, and box-shadow none.",
    action: "Tabbed to the task checkbox and pressed Space.",
    reproduction: ["Create a task with Enter", "Tab to its checkbox", "Observe focus before pressing Space"],
    shot: 2, elapsedMs: 25,
  }, {
    id: "keyboard-filter-focus", stepId: "review", category: "accessibility", severity: "medium",
    summary: "Footer filters have no visible keyboard focus indicator",
    expected: "The focused filter should be visually distinct before activation.",
    actual: "The Completed link was operable but reported no outline or box-shadow while focused.",
    action: "Tabbed to Completed and pressed Enter.",
    reproduction: ["Create and complete a task", "Tab to the Completed filter", "Observe focus before pressing Enter"],
    shot: 3, elapsedMs: 17,
  }],
  "edge-case": [{
    id: "edge-empty-feedback", stepId: "recover", category: "feedback", severity: "low",
    summary: "Empty submission has no visible feedback",
    expected: "The rejected empty action should be understandable.",
    actual: "The task count remained zero and the page did not visibly change.",
    action: "Pressed Enter with an empty new-task input.",
    reproduction: ["Focus the new-task input", "Leave it empty", "Press Enter"],
    shot: 4, elapsedMs: 294,
  }],
};

const screenshotNames = ["01-orient.jpg", "02-enter.jpg", "03-primary-task.jpg", "04-review.jpg", "05-recover.jpg"];
const resultDir = path.join(root, "public/demo/todomvc/results");
mkdirSync(resultDir, { recursive: true });
const manifest = { runId, title: "TodoMVC product pass", targetUrl, seeded: true, testers: [], artifacts: [] };

for (const [personaId, tester] of Object.entries(testers)) {
  const uploaded = [];
  for (const filename of screenshotNames) {
    const localPath = path.join(root, "public/demo/todomvc", personaId, filename);
    const blob = await put(`runs/${runId}/${personaId}/${filename}`, readFileSync(localPath), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "image/jpeg",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    uploaded.push(blob);
    manifest.artifacts.push(blob.url);
  }

  const journey = steps.map(([id, title, mission], index) => ({
    id, title, mission,
    outcome: tester.friction.includes(index) ? "friction" : "pass",
    durationMs: tester.durations[index],
    observationCount: (findingData[personaId] ?? []).filter((finding) => finding.stepId === id).length,
    screenshot: { id: `${personaId}-${id}`, label: `${tester.name} · ${title}`, source: "sparkles-upload", url: uploaded[index].url, width: 960, height: 540 },
  }));
  const findings = (findingData[personaId] ?? []).map((finding) => ({
    id: finding.id,
    testerId: personaId,
    route: "/",
    stepId: finding.stepId,
    category: finding.category,
    severity: finding.severity,
    observation: { summary: finding.summary, expected: finding.expected, actual: finding.actual },
    evidence: [{
      pageUrl: targetUrl,
      attemptedAction: finding.action,
      screenshot: journey[finding.shot].screenshot,
      consoleErrors: [],
      failedRequests: [],
      elapsedMs: finding.elapsedMs,
    }],
    reproduction: finding.reproduction,
  }));
  const result = { runId, personaId, targetUrl, status: "completed", steps: journey, findings };
  const localResult = path.join(resultDir, `${personaId}.json`);
  writeFileSync(localResult, `${JSON.stringify(result, null, 2)}\n`);
  const resultBlob = await put(`runs/${runId}/${personaId}/trialroom-${personaId}.json`, JSON.stringify(result), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  manifest.testers.push({ personaId, name: tester.name, status: "completed", resultUrl: resultBlob.url });
  manifest.artifacts.push(resultBlob.url);
}

const manifestPath = path.join(resultDir, "manifest.json");
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await put(`runs/${runId}/manifest.json`, JSON.stringify(manifest), {
  access: "public",
  addRandomSuffix: false,
  allowOverwrite: true,
  contentType: "application/json",
  token: process.env.BLOB_READ_WRITE_TOKEN,
});

console.log(`Seeded ${manifest.testers.length} testers and ${manifest.artifacts.length} evidence artifacts.`);
console.log(`${publicOrigin}/api/runs/${runId}/results`);
