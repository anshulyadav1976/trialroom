#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { put } from "@vercel/blob";

const root = path.resolve(import.meta.dirname, "..");
if (existsSync(path.join(root, ".env.local"))) process.loadEnvFile(path.join(root, ".env.local"));
if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN is required");

const token = process.env.BLOB_READ_WRITE_TOKEN;
const runId = "seeded-saucedemo-showcase";
const targetUrl = "https://www.saucedemo.com/";
const startedAt = "2026-09-02T18:09:20.000Z";
const completedAt = "2026-09-02T18:11:04.000Z";
const failedRequests = [
  { url: "https://events.backtrace.io/api/summed-events/submit?universe=UNIVERSE&token=TOKEN", status: 401, method: "POST" },
  { url: "https://events.backtrace.io/api/unique-events/submit?universe=UNIVERSE&token=TOKEN", status: 401, method: "POST" },
];
const consoleErrors = [
  "Failed to load resource: the server responded with a status of 401 (Unauthorized)",
  "Failed to load resource: the server responded with a status of 401 (Unauthorized)",
];

const personas = {
  "first-time": {
    folder: "first-time-evaluator",
    name: "Maya, the first-time user",
    shortName: "Maya",
    description: "Understands the product only through what the interface explains.",
    behavior: ["Read visible product copy", "Follow the clearest primary path"],
    color: "#E59A65",
    files: ["01-login.jpg", "02-catalog.jpg", "03-add-backpack.jpg", "04-cart.jpg", "05-checkout.jpg"],
    steps: [
      ["login", "Enter the shop", "Use the published demo credentials", "pass", 1548],
      ["catalog", "Scan the catalog", "Understand the products and sorting controls", "pass", 51],
      ["add-to-cart", "Add the backpack", "Add one representative product", "pass", 19],
      ["cart", "Review the cart", "Confirm the right item and quantity", "pass", 30],
      ["checkout", "Begin checkout", "Reach customer details and stop safely", "pass", 33],
    ],
    findings: [
      {
        id: "first-time-login-placeholder-labels", stepId: "login", route: "/", category: "accessibility", severity: "medium", shot: 0,
        summary: "Login fields rely on placeholder text for their names",
        expected: "Username and password fields should retain an explicit accessible name after text is entered.",
        actual: "Both inputs had no associated label, aria-label, or aria-labelledby value; only placeholder text identified them.",
        action: "Inspected the username and password field semantics before signing in.",
        reproduction: ["Open SauceDemo", "Inspect the username and password fields", "Verify that each field has no explicit label or ARIA name"],
      },
    ],
  },
  impatient: {
    folder: "impatient-shopper",
    name: "Leo, the impatient user",
    shortName: "Leo",
    description: "Moves quickly and expects immediate, unambiguous feedback.",
    behavior: ["Repeat one uncertain action", "Recover and continue"],
    color: "#E2BD54",
    files: ["01-login.jpg", "02-catalog.jpg", "03-add-backpack.jpg", "04-cart.jpg", "05-checkout.jpg"],
    steps: [
      ["login", "Enter the shop", "Use the published demo credentials", "pass", 1280],
      ["catalog", "Scan the catalog", "Find the backpack quickly", "pass", 41],
      ["add-to-cart", "Add the backpack", "Act quickly, then verify the cart state", "friction", 74],
      ["cart", "Review the cart", "Confirm the recovered item and quantity", "pass", 28],
      ["checkout", "Begin checkout", "Reach customer details and stop safely", "pass", 31],
    ],
    findings: [
      {
        id: "impatient-repeat-reverses-cart", stepId: "add-to-cart", route: "/inventory.html", category: "interaction", severity: "medium", shot: 2,
        summary: "A repeated product action immediately reverses the cart state",
        expected: "A fast repeated action should not silently undo a just-confirmed add, or should make that reversal unmistakable.",
        actual: "The first press showed a cart badge of 1 and changed the button to Remove; the second immediate press returned the badge to 0 and the button to Add to cart.",
        action: "Pressed the product action twice rapidly in the same location, then recovered by adding once.",
        reproduction: ["Open the catalog", "Press Add to cart on Sauce Labs Backpack", "Immediately press the same-position Remove action"],
      },
    ],
  },
  keyboard: {
    folder: "keyboard-only",
    name: "Noor, the keyboard user",
    shortName: "Noor",
    description: "Attempts the core journey keyboard-first and watches focus.",
    behavior: ["Prefer Tab, Enter, and Space", "Track reachable controls"],
    color: "#72A993",
    files: ["01-login.jpg", "02-catalog-add.jpg", "03-cart.jpg", "04-checkout-details.jpg", "05-review-stop.jpg"],
    steps: [
      ["login", "Enter with the keyboard", "Complete login using keyboard controls", "pass", 1650],
      ["catalog", "Add the backpack", "Reach and activate the product action", "pass", 690],
      ["cart", "Reach the cart", "Navigate to the cart without a pointer", "friction", 1220],
      ["checkout", "Enter checkout details", "Complete customer fields with the keyboard", "pass", 480],
      ["review", "Review and stop", "Confirm the review screen without submitting", "pass", 310],
    ],
    findings: [
      {
        id: "keyboard-cart-unreachable", stepId: "cart", route: "/inventory.html", category: "accessibility", severity: "high", shot: 2,
        summary: "The cart link is skipped by keyboard navigation",
        expected: "The cart should be reachable in the natural Tab order after adding a product.",
        actual: "Forty Tab presses completed a focus cycle without reaching the cart link; the element was an anchor with no href, so a pointer fallback was required to continue.",
        action: "Tabbed repeatedly after adding the backpack and tracked the focused element.",
        reproduction: ["Log in using the keyboard", "Activate Add to cart", "Press Tab through one full focus cycle and watch for the cart link"],
      },
    ],
  },
  "edge-case": {
    folder: "edge-case-explorer",
    name: "Eli, the edge-case user",
    shortName: "Eli",
    description: "Uses unusual but legitimate input and tests understandable recovery.",
    behavior: ["Try empty and long values", "Recover from validation once"],
    color: "#8497C9",
    files: ["01-login.jpg", "02-catalog-add.jpg", "03-cart.jpg", "04-empty-validation.jpg", "05-review-stop.jpg"],
    steps: [
      ["login", "Enter the shop", "Use the published demo credentials", "pass", 1420],
      ["catalog", "Add the backpack", "Add one representative product", "pass", 56],
      ["cart", "Review the cart", "Confirm the item and enter checkout", "pass", 42],
      ["checkout", "Probe validation", "Submit empty customer details once", "friction", 94],
      ["review", "Try long values and stop", "Verify accepted data without submitting an order", "pass", 390],
    ],
    findings: [
      {
        id: "edge-checkout-validation-summary", stepId: "checkout", route: "/checkout-step-one.html", category: "validation", severity: "low", shot: 3,
        summary: "Empty checkout highlights every field but names only the first error",
        expected: "Validation feedback should make every invalid field and the next recovery action clear.",
        actual: "All three fields displayed error icons while the single banner named only First Name as required.",
        action: "Continued with all three customer-detail fields empty, then inspected the error state.",
        reproduction: ["Reach checkout customer information", "Leave all fields empty", "Press Continue and compare the three field states with the banner"],
      },
    ],
  },
};

const manifest = { runId, title: "SauceDemo checkout study", targetUrl, seeded: true, generatedBy: "TrialRoom synthetic testers", testers: [], artifacts: [] };
const storedTesters = [];
const commonJourney = [
  { id: "login", title: "Enter the shop", mission: "Reach the catalog using published demo credentials." },
  { id: "catalog", title: "Scan the catalog", mission: "Understand the products and choose one representative item." },
  { id: "add-to-cart", title: "Add a product", mission: "Add Sauce Labs Backpack and verify feedback." },
  { id: "cart", title: "Review the cart", mission: "Confirm the selected item and quantity." },
  { id: "checkout", title: "Begin checkout safely", mission: "Inspect checkout without submitting an order." },
];

for (const [personaId, persona] of Object.entries(personas)) {
  const screenshots = [];
  for (const filename of persona.files) {
    const localPath = path.join(root, "public/demo/saucedemo", persona.folder, filename);
    const blob = await put(`runs/${runId}/${personaId}/${filename}`, readFileSync(localPath), {
      access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "image/jpeg", token,
    });
    screenshots.push(blob);
    manifest.artifacts.push(blob.url);
  }

  const steps = persona.steps.map(([id, title, mission, outcome, durationMs], index) => ({
    id, title, mission, outcome, durationMs, observationCount: persona.findings.filter((finding) => finding.stepId === id).length + (id === "login" ? 1 : 0),
    screenshot: { id: `${personaId}-${id}`, label: `${persona.shortName} · ${title}`, source: "demo-placeholder", url: screenshots[index].url, width: 960, height: 540 },
  }));
  const telemetryFinding = {
    id: `${personaId}-telemetry-401`, testerId: personaId, route: "/", stepId: "login", category: "reliability", severity: "low",
    observation: {
      summary: "Background telemetry requests fail during page load",
      expected: "Background product telemetry should complete without browser-visible network failures.",
      actual: "Two Backtrace telemetry POST requests returned HTTP 401; the core shopping journey still completed.",
    },
    evidence: [{ pageUrl: targetUrl, attemptedAction: "Opened SauceDemo in a fresh browser context.", screenshot: steps[0].screenshot, consoleErrors, failedRequests, elapsedMs: Number(persona.steps[0][4]) }],
    reproduction: ["Open SauceDemo in a fresh browser context", "Observe failed network responses during page load", "Continue through the core flow to verify it remains usable"],
  };
  const findings = [...persona.findings.map((finding) => ({
    id: finding.id, testerId: personaId, route: finding.route, stepId: finding.stepId, category: finding.category, severity: finding.severity,
    observation: { summary: finding.summary, expected: finding.expected, actual: finding.actual },
    evidence: [{ pageUrl: new URL(finding.route, targetUrl).toString(), attemptedAction: finding.action, screenshot: steps[finding.shot].screenshot, consoleErrors: [], failedRequests: [], elapsedMs: Number(persona.steps[finding.shot][4]) }],
    reproduction: finding.reproduction,
  })), telemetryFinding];
  const result = { runId, personaId, targetUrl, status: "completed", steps, findings };
  writeFileSync(path.join(root, "public/demo/saucedemo/results", `trialroom-${personaId}.json`), `${JSON.stringify(result, null, 2)}\n`);
  const resultBlob = await put(`runs/${runId}/${personaId}/trialroom-${personaId}.json`, JSON.stringify(result), {
    access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", token,
  });
  manifest.testers.push({ personaId, name: persona.name, status: "completed", resultUrl: resultBlob.url });
  manifest.artifacts.push(resultBlob.url);
  storedTesters.push({
    id: personaId,
    persona: { id: personaId, name: persona.name, shortName: persona.shortName, description: persona.description, behavior: persona.behavior, color: persona.color },
    status: "completed", currentActivity: "Seeded evidence complete", elapsedMs: 104000, journey: steps, sandboxActive: false,
    events: [
      { id: `${personaId}-opened`, testerId: personaId, kind: "browser-activity", at: startedAt, label: "Opened SauceDemo", stepId: "login" },
      { id: `${personaId}-completed`, testerId: personaId, kind: "completed", at: completedAt, label: "Journey complete" },
    ],
  });
}

const state = { runId, id: runId, mode: "live", seeded: true, targetName: "SauceDemo", targetUrl, startedAt, completedAt, journey: commonJourney, testers: storedTesters, activeSandboxCount: 0 };
writeFileSync(path.join(root, "public/demo/saucedemo/results/manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await Promise.all([
  put(`runs/${runId}/manifest.json`, JSON.stringify(manifest), { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", token }),
  put(`trialroom/state/runs/${runId}.json`, JSON.stringify(state), { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 60, token }),
]);

console.log(`Seeded ${manifest.testers.length} SauceDemo testers and ${manifest.artifacts.length} evidence artifacts.`);
