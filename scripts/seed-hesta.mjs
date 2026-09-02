#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { put } from "@vercel/blob";
import { parseTesterResult } from "../src/lib/results.ts";

const root = path.resolve(import.meta.dirname, "..");
const validateOnly = process.argv.includes("--validate-only");
if (existsSync(path.join(root, ".env.local"))) process.loadEnvFile(path.join(root, ".env.local"));
if (!validateOnly && !process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN is required");

const token = process.env.BLOB_READ_WRITE_TOKEN;
const runId = "seeded-hesta-health-study";
const targetUrl = "https://www.hestahealth.com/";
const completedAt = new Date().toISOString();
const startedAt = new Date(Date.parse(completedAt) - 6 * 60_000).toISOString();
const commonJourney = [
  { id: "orient", title: "Understand Hesta", mission: "Identify the service and its primary care action." },
  { id: "explore", title: "Explore care options", mission: "Compare available postnatal care and next steps." },
  { id: "how-it-works", title: "Understand the pathway", mission: "Learn how care begins and what to expect." },
  { id: "support", title: "Find support", mission: "Locate trustworthy help without submitting a form." },
  { id: "mobile", title: "Check the mobile entry", mission: "Revisit the entry point in a narrow viewport." },
];

const personas = {
  "first-time": {
    folder: "first-time", name: "Maya, the first-time user", shortName: "Maya", color: "#E59A65",
    description: "Understands the service only through what the public site explains.", behavior: ["Read visible care copy", "Follow the clearest path"],
    files: [
      ["01-orient.png", 1440, 757], ["02-explore.png", 1440, 757], ["03-how-it-works.png", 1440, 757],
      ["04-support.png", 1440, 757], ["05-mobile.jpg", 390, 844],
    ],
    outcomes: ["friction", "friction", "pass", "friction", "pass"], durations: [1380, 1283, 1325, 1211, 1100],
    findings: [
      ["first-time-consent-obscures-entry", "orient", "/", "interaction", "medium", 0,
        "The consent layer dominates the first product impression",
        "A first-time visitor can understand the core service while making a clear consent choice.",
        "A modal-style consent layer dimmed the whole page and covered the lower viewport until a choice was made.",
        "Opened the homepage in a fresh browser profile.",
        ["Open the homepage in a fresh profile", "Do not make a cookie choice", "Observe the dimmed hero and consent panel"]],
      ["first-time-service-links-unnamed", "explore", "/what-we-help-with", "accessibility", "medium", 1,
        "Service-card detail links are unnamed in the accessibility tree",
        "Each service detail link has a descriptive accessible name.",
        "The browser exposed separate detail links with empty accessible names, including the pelvic-floor link.",
        "Enumerated service links and inspected their accessible names.",
        ["Open What we help with", "Inspect the page links", "Locate the unnamed service-detail anchors"]],
      ["first-time-price-conflict", "explore", "/what-we-help-with", "comprehension", "medium", 1,
        "The lactation starting price changes between discovery surfaces",
        "The same service presents one current starting price across the site.",
        "The homepage rendered From £125 while What we help with rendered From £85 for lactation support.",
        "Compared rendered lactation prices on the homepage and service directory.",
        ["Note the homepage lactation price", "Open What we help with", "Compare the lactation price"]],
      ["first-time-support-email-conflict", "support", "/contact-2", "navigation", "medium", 3,
        "Care and support enquiries are directed to different addresses",
        "Support surfaces give one address or explain when each address applies.",
        "FAQs and the footer use support@hesta.health while Contact Details directs care or support enquiries to hello@hesta.health.",
        "Compared the support and contact surfaces without sending a message.",
        ["Open FAQs", "Note the support email", "Open Contact us and compare its care or support email"]],
    ],
  },
  impatient: {
    folder: "impatient", name: "Leo, the impatient user", shortName: "Leo", color: "#E2BD54",
    description: "Moves quickly and checks whether navigation recovers cleanly.", behavior: ["Navigate quickly", "Use back, forward, and refresh"],
    files: [
      ["01-orient.jpg", 1280, 720], ["02-explore.jpg", 1280, 720], ["03-how-it-works.jpg", 1280, 720],
      ["04-support.jpg", 1280, 720], ["05-mobile.jpg", 390, 844],
    ],
    outcomes: ["pass", "pass", "friction", "pass", "fail"], durations: [816, 500, 572, 500, 1128],
    findings: [
      ["impatient-active-navigation", "how-it-works", "/how-works", "navigation", "low", 2,
        "The current navigation section is not visually distinguished",
        "The persistent navigation identifies the page currently being viewed.",
        "How it works had no aria-current value and matched the computed presentation of the About us peer link.",
        "Opened How it works quickly and compared the persistent navigation links.",
        ["Open the homepage", "Select How it works", "Compare its header link with About us"]],
      ["impatient-mobile-layout-overflow", "mobile", "/", "navigation", "high", 4,
        "The mobile landing page extends far beyond the viewport",
        "Landing content reflows inside a 390 px viewport.",
        "At 390 px, clientWidth was 390 but content scrollWidth was 1134; hero copy clipped at the right edge.",
        "Opened the homepage in a 390 × 844 mobile browser context.",
        ["Open the homepage at 390 × 844", "Compare clientWidth with scrollWidth", "Observe the clipped hero copy"]],
    ],
  },
  keyboard: {
    folder: "keyboard", name: "Noor, the keyboard user", shortName: "Noor", color: "#72A993",
    description: "Uses keyboard navigation and inspects control semantics.", behavior: ["Prefer Tab and Enter", "Track focus and names"],
    files: [
      ["01-orient.jpg", 960, 540], ["02-explore.jpg", 960, 540], ["03-how-it-works.jpg", 960, 540],
      ["04-support.jpg", 960, 540], ["05-mobile.jpg", 390, 844],
    ],
    outcomes: ["friction", "friction", "friction", "friction", "pass"], durations: [920, 1450, 830, 1260, 980],
    findings: [
      ["keyboard-cookie-controls-unnamed", "orient", "/", "accessibility", "high", 0,
        "Cookie preference controls are focusable but unnamed",
        "Each cookie switch and action is announced with its purpose and state.",
        "Functional, Analytical, and Marketing switches plus the save button had no detected accessible name.",
        "Tabbed through the fresh-visit cookie controls and inspected each focused element.",
        ["Open the homepage in a fresh context", "Tab through cookie preferences", "Inspect the names at the three switches and save action"]],
      ["keyboard-service-links-unnamed", "explore", "/what-we-help-with", "accessibility", "high", 1,
        "Service-card detail links are unnamed in the accessibility tree",
        "Each linked service icon has a useful accessible name.",
        "Keyboard traversal reached service-detail anchors with an empty accessible name, including Feeding.",
        "Tabbed through the service content and recorded the focused element.",
        ["Open What we help with", "Tab through service content", "Inspect the focused service-detail link name"]],
      ["keyboard-heading-hierarchy", "how-it-works", "/how-works", "accessibility", "medium", 2,
        "The How it works page has no page-level heading",
        "Page headings begin with one descriptive h1 and follow a predictable order.",
        "The page had no detected h1 and began with h3, then h2 and h5.",
        "Inspected headings in DOM order after opening How it works with the keyboard.",
        ["Open How it works", "Inspect headings in DOM order", "Observe the missing h1 and skipped levels"]],
      ["keyboard-faq-horizontal-clipping", "support", "/support", "accessibility", "medium", 3,
        "Keyboard focus shifts the FAQ disclosure partly out of view",
        "Focusing a disclosure keeps it and the surrounding content fully visible.",
        "At 960 px, the focused 914 px FAQ button began at x=-141 and its question text was visibly clipped.",
        "Tabbed to the first FAQ disclosure and opened it with Enter.",
        ["Open FAQs at 960 px", "Tab to What is Hesta Health?", "Observe the focused question clipped on the left"]],
    ],
  },
  "edge-case": {
    folder: "edge-case", name: "Eli, the edge-case user", shortName: "Eli", color: "#8497C9",
    description: "Checks unusual viewports and consistency across care paths.", behavior: ["Compare alternate paths", "Use a narrow viewport"],
    files: [
      ["01-orient.png", 1440, 1000], ["02-explore.png", 1440, 1000], ["03-how-it-works.png", 1440, 1000],
      ["04-support.png", 1440, 1000], ["05-mobile.png", 390, 844],
    ],
    outcomes: ["friction", "friction", "pass", "pass", "fail"], durations: [1510, 1260, 1180, 1220, 1040],
    findings: [
      ["edge-consent-obscures-entry", "orient", "/", "interaction", "medium", 0,
        "The consent layer dominates the first product impression",
        "Consent controls preserve enough product context for orientation.",
        "The consent layer dimmed the interface and occupied roughly the bottom fifth of the first viewport.",
        "Opened the homepage in a fresh browser profile and made no cookie choice.",
        ["Open the homepage in a fresh profile", "Do not make a cookie choice", "Compare the consent panel with the primary care action"]],
      ["edge-care-copy-polish", "explore", "/what-we-help-with", "comprehension", "low", 1,
        "Care catalogue copy contains visible punctuation defects",
        "Sensitive healthcare service descriptions use polished copy.",
        "The page showed “And more....” and “Confidential,specialist” without a space.",
        "Read the Mental health and final care-category descriptions.",
        ["Open What we help with", "Read the Mental health description", "Read the final care-category label"]],
      ["edge-mobile-layout-overflow", "mobile", "/", "navigation", "high", 4,
        "The mobile landing page extends far beyond the viewport",
        "Landing content reflows inside a 390 px viewport.",
        "At 390 px, the hero headline and paragraphs continued beyond the right edge and no mobile navigation control was visible.",
        "Opened the homepage in a fresh 390 × 844 browser context.",
        ["Open the homepage at 390 × 844", "Inspect the header and hero", "Observe copy ending beyond the right edge"]],
    ],
  },
};

async function publish(pathname, body, contentType, localUrl) {
  if (validateOnly) return { url: localUrl };
  return put(pathname, body, { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType, token });
}

const manifest = { runId, title: "Hesta Health public-site study", targetUrl, seeded: true, generatedBy: "TrialRoom synthetic testers", testers: [], artifacts: [] };
const storedTesters = [];

for (const [personaId, persona] of Object.entries(personas)) {
  const screenshots = [];
  for (const [filename, width, height] of persona.files) {
    const localPath = path.join(root, "public/demo/hesta", persona.folder, filename);
    if (!existsSync(localPath)) throw new Error(`Missing evidence screenshot: ${localPath}`);
    const contentType = filename.endsWith(".png") ? "image/png" : "image/jpeg";
    screenshots.push(await publish(
      `runs/${runId}/${personaId}/${filename}`,
      readFileSync(localPath),
      contentType,
      `https://trialroom-sigma.vercel.app/demo/hesta/${persona.folder}/${filename}`,
    ));
    manifest.artifacts.push(screenshots.at(-1).url);
    if (width < 1 || height < 1) throw new Error(`Invalid dimensions for ${filename}`);
  }

  const steps = commonJourney.map((definition, index) => ({
    ...definition,
    outcome: persona.outcomes[index],
    durationMs: persona.durations[index],
    observationCount: persona.findings.filter((finding) => finding[1] === definition.id).length,
    screenshot: {
      id: `${personaId}-${definition.id}`,
      label: `${persona.shortName} · ${definition.title}`,
      source: "demo-placeholder",
      url: screenshots[index].url,
      width: persona.files[index][1],
      height: persona.files[index][2],
    },
  }));
  const findings = persona.findings.map(([id, stepId, route, category, severity, shot, summary, expected, actual, action, reproduction]) => ({
    id, testerId: personaId, route, stepId, category, severity,
    observation: { summary, expected, actual },
    evidence: [{
      pageUrl: new URL(route, targetUrl).toString(),
      attemptedAction: action,
      screenshot: steps[shot].screenshot,
      consoleErrors: [],
      failedRequests: [],
      elapsedMs: persona.durations[shot],
    }],
    reproduction,
  }));
  const result = { runId, personaId, targetUrl, status: "completed", steps, findings };
  parseTesterResult(result);
  const resultName = `trialroom-${personaId}.json`;
  writeFileSync(path.join(root, "public/demo/hesta/results", resultName), `${JSON.stringify(result, null, 2)}\n`);
  const resultBlob = await publish(
    `runs/${runId}/${personaId}/${resultName}`,
    JSON.stringify(result),
    "application/json",
    `https://trialroom-sigma.vercel.app/demo/hesta/results/${resultName}`,
  );
  manifest.testers.push({ personaId, name: persona.name, status: "completed", resultUrl: resultBlob.url });
  manifest.artifacts.push(resultBlob.url);
  storedTesters.push({
    id: personaId,
    persona: { id: personaId, name: persona.name, shortName: persona.shortName, description: persona.description, behavior: persona.behavior, color: persona.color },
    status: "completed",
    currentActivity: "Seeded evidence complete",
    elapsedMs: persona.durations.reduce((sum, duration) => sum + duration, 0),
    journey: steps,
    sandboxActive: false,
    events: [
      { id: `${personaId}-opened`, testerId: personaId, kind: "browser-activity", at: startedAt, label: "Opened Hesta Health", stepId: "orient" },
      { id: `${personaId}-completed`, testerId: personaId, kind: "completed", at: completedAt, label: "Journey complete" },
    ],
  });
}

const state = { id: runId, mode: "live", seeded: true, targetName: "Hesta Health", targetUrl, startedAt, completedAt, journey: commonJourney, testers: storedTesters, activeSandboxCount: 0 };
writeFileSync(path.join(root, "public/demo/hesta/results/manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

if (!validateOnly) {
  await Promise.all([
    publish(`runs/${runId}/manifest.json`, JSON.stringify(manifest), "application/json"),
    publish(`trialroom/state/runs/${runId}.json`, JSON.stringify(state), "application/json"),
  ]);
}

console.log(`${validateOnly ? "Validated" : "Seeded"} 4 Hesta testers, 20 real screenshots, and ${Object.values(personas).reduce((sum, persona) => sum + persona.findings.length, 0)} findings.`);
