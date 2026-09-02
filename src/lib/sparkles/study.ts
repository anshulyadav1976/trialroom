import { createHash, randomUUID } from "node:crypto";
import type { JourneyStepDefinition, Persona } from "@/lib/trialroom";

export const personas: Persona[] = [
  {
    id: "first-time",
    name: "Maya, the first-time user",
    shortName: "Maya",
    description: "Understands the product only through what the interface explains.",
    behavior: ["Read visible product copy", "Follow the clearest primary path", "Record unclear actions and dead ends"],
    color: "#E59A65",
  },
  {
    id: "impatient",
    name: "Leo, the impatient user",
    shortName: "Leo",
    description: "Moves quickly and expects immediate, unambiguous feedback.",
    behavior: ["Act before loading fully settles", "Repeat one uncertain action", "Try back, forward, or refresh once"],
    color: "#E2BD54",
  },
  {
    id: "keyboard",
    name: "Noor, the keyboard user",
    shortName: "Noor",
    description: "Attempts the core journey keyboard-first and watches focus.",
    behavior: ["Prefer Tab, Enter, and Space", "Track visible focus", "Note unreachable or poorly labelled controls"],
    color: "#72A993",
  },
  {
    id: "edge-case",
    name: "Eli, the edge-case user",
    shortName: "Eli",
    description: "Uses unusual but legitimate input and tests understandable recovery.",
    behavior: ["Try empty and long valid values", "Recover from validation once", "Revisit one earlier step"],
    color: "#8497C9",
  },
];

export const journey: JourneyStepDefinition[] = [
  { id: "orient", title: "Understand the product", mission: "Identify the product purpose and primary action." },
  { id: "enter", title: "Enter the main experience", mission: "Follow the clearest route into the product without inventing credentials." },
  { id: "primary-task", title: "Complete the primary task", mission: "Perform one representative task and verify the result." },
  { id: "review", title: "Review the result", mission: "Inspect another meaningful view or state related to the completed task." },
  { id: "recover", title: "Recover from one mistake", mission: "Make one safe mistake, observe feedback, and return to a useful state." },
];

export function newRunId() {
  return `run_${randomUUID()}`;
}

export function idempotencyKey(runId: string, personaId: string) {
  return `trialroom-${createHash("sha256").update(`${runId}\0${personaId}`).digest("hex")}`;
}

export function testerPrompt(input: {
  runId: string;
  targetUrl: string;
  repository?: string;
  persona: Persona;
  artifactUpload?: { url: string; token: string };
}) {
  const resultPath = `artifacts/trialroom-${input.persona.id}.json`;
  const steps = journey.map((step, index) => `${index + 1}. ${step.title}: ${step.mission}`).join("\n");
  const artifactInstructions = input.artifactUpload
    ? `Upload each screenshot and the final JSON with @vercel/blob/client upload(), using handleUploadUrl "${input.artifactUpload.url}", access "public", a pathname beginning "runs/${input.runId}/${input.persona.id}/", and clientPayload "${input.artifactUpload.token}". Never print the clientPayload. Use content type image/jpeg for screenshots and application/json for the result. Record every returned screenshot URL in the result, then upload the final JSON as "runs/${input.runId}/${input.persona.id}/trialroom-${input.persona.id}.json" before finishing.`
    : "Also save compact base64 text companions below 1 MB until TrialRoom's signed artifact upload is enabled.";
  return `You are one independent TrialRoom synthetic product tester.

Run ID: ${input.runId}
Target: ${input.targetUrl}
Persona: ${input.persona.name}
Persona behavior:
${input.persona.behavior.map((item) => `- ${item}`).join("\n")}
${input.repository ? `Optional target source repository: ${input.repository}\nExperience the product before inspecting source, and only inspect source to support a likely-cause hint.` : ""}

Use direct Playwright with headless Chromium in this managed environment. Keep the journey bounded. Do not perform security testing, destructive actions, purchases, source edits, commits, pushes, or pull requests. Do not invent credentials. Capture console errors and failed HTTP responses where practical.

Common journey:
${steps}

Capture one compact JPEG screenshot for each meaningful step. Save screenshots in the artifacts/${input.persona.id} directory. ${artifactInstructions} Always write valid JSON to ${resultPath}, even after a partial failure, using this exact contract:
{
  "runId": "${input.runId}",
  "personaId": "${input.persona.id}",
  "targetUrl": "${input.targetUrl}",
  "status": "completed | partial | failed",
  "steps": [{
    "id": "one of: orient | enter | primary-task | review | recover",
    "title": "matching common journey title",
    "mission": "matching common journey mission",
    "outcome": "pass | friction | fail",
    "durationMs": 0,
    "observationCount": 0,
    "screenshot": { "id": "unique id", "label": "short label", "source": "sparkles-upload", "url": "uploaded public URL", "width": 960, "height": 540 }
  }],
  "findings": [{
    "id": "unique id",
    "testerId": "${input.persona.id}",
    "route": "/page-route",
    "stepId": "matching step id",
    "category": "comprehension | navigation | interaction | feedback | accessibility | validation | performance | reliability",
    "severity": "low | medium | high | critical",
    "observation": { "summary": "what happened", "expected": "expected UX", "actual": "observed UX" },
    "evidence": [{ "pageUrl": "current HTTP(S) URL", "attemptedAction": "action", "screenshot": { "id": "same screenshot id", "label": "short label", "source": "sparkles-upload", "url": "uploaded public URL", "width": 960, "height": 540 }, "consoleErrors": [], "failedRequests": [], "elapsedMs": 0 }],
    "reproduction": ["bounded step"]
  }]
}
Do not add prose around the JSON. Findings may be empty, but never invent evidence or consensus. Finish after this single journey.`;
}
