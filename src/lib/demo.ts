import {
  calculateProductHealth,
  createCluster,
  type Finding,
  type JourneyStepDefinition,
  type Persona,
  type PersonaId,
  type StepOutcome,
  type StudyRun,
  type TesterEvent,
  type TesterRun,
} from "./trialroom";

export const personas: Persona[] = [
  {
    id: "first-time",
    name: "Maya, the first-time user",
    shortName: "Maya",
    description: "Understands the product from what the interface explains, without prior context.",
    behavior: ["Reads the value proposition", "Follows the most prominent path", "Notes unclear copy and dead ends"],
    color: "#E59A65",
  },
  {
    id: "impatient",
    name: "Leo, the impatient user",
    shortName: "Leo",
    description: "Moves quickly and expects clear, immediate feedback from every action.",
    behavior: ["Acts before loading settles", "Repeats uncertain actions", "Uses back, forward, and refresh"],
    color: "#E2BD54",
  },
  {
    id: "keyboard",
    name: "Noor, the keyboard user",
    shortName: "Noor",
    description: "Attempts the core journey with a keyboard and watches focus carefully.",
    behavior: ["Tabs through controls", "Uses Enter and Space", "Notes traps and missing labels"],
    color: "#72A993",
  },
  {
    id: "edge-case",
    name: "Eli, the edge-case user",
    shortName: "Eli",
    description: "Uses unusual but valid input and checks whether recovery is understandable.",
    behavior: ["Uses empty and long values", "Recovers from validation", "Revisits earlier steps"],
    color: "#8497C9",
  },
];

export const demoJourney: JourneyStepDefinition[] = [
  { id: "orient", title: "Understand the workspace", mission: "Identify the product's purpose and primary action." },
  { id: "create-task", title: "Create a task", mission: "Add a clear, valid task to the list." },
  { id: "complete-task", title: "Complete a task", mission: "Mark the new task complete and verify the result." },
  { id: "filter", title: "Review filtered tasks", mission: "Move between active and completed task views." },
  { id: "recover", title: "Recover from a mistake", mission: "Make one safe mistake and return to a useful state." },
];

const startedAt = "2026-09-02T10:00:00.000Z";
const at = (seconds: number) => new Date(Date.parse(startedAt) + seconds * 1_000).toISOString();
const screenshot = (testerId: PersonaId, stepId: string) => ({
  id: `shot-${testerId}-${stepId}`,
  label: `${personas.find((persona) => persona.id === testerId)?.shortName} · ${demoJourney.find((step) => step.id === stepId)?.title}`,
  source: "demo-placeholder" as const,
});

const outcomes: Record<PersonaId, Partial<Record<string, StepOutcome>>> = {
  "first-time": { filter: "friction" },
  impatient: { "complete-task": "friction", filter: "friction" },
  keyboard: { filter: "friction" },
  "edge-case": { recover: "friction" },
};

function tester(persona: Persona, index: number): TesterRun {
  const journey = demoJourney.map((step, stepIndex) => ({
    ...step,
    outcome: outcomes[persona.id][step.id] ?? "pass",
    durationMs: 5_400 + index * 900 + stepIndex * 1_300,
    screenshot: screenshot(persona.id, step.id),
    observationCount: outcomes[persona.id][step.id] === "friction" ? 1 : 0,
  }));
  const events: TesterEvent[] = [
    { id: `${persona.id}-queued`, testerId: persona.id, kind: "queued", at: at(index * 3), label: "Tester queued" },
    { id: `${persona.id}-open`, testerId: persona.id, kind: "browser-activity", at: at(8 + index * 3), label: "Opening product", stepId: "orient" },
    { id: `${persona.id}-finding`, testerId: persona.id, kind: "finding-discovered", at: at(31 + index * 4), label: "Friction captured with evidence", stepId: persona.id === "edge-case" ? "recover" : "filter" },
    { id: `${persona.id}-done`, testerId: persona.id, kind: "completed", at: at(58 + index * 5), label: "Journey complete" },
  ];
  return {
    id: persona.id,
    persona,
    status: "completed",
    currentActivity: "Journey complete",
    elapsedMs: 58_000 + index * 5_000,
    journey,
    events,
  };
}

export const demoFindings: Finding[] = [
  {
    id: "finding-filter-discovery-first-time",
    testerId: "first-time",
    route: "/",
    stepId: "filter",
    category: "navigation",
    severity: "medium",
    observation: {
      summary: "The task filters were easy to overlook below the list.",
      expected: "The available views should be apparent after a task is completed.",
      actual: "Maya scanned the task row twice before noticing the filters in the footer.",
    },
    evidence: [{ pageUrl: "https://demo.playwright.dev/todomvc/", attemptedAction: "Find completed tasks", screenshot: screenshot("first-time", "filter"), elapsedMs: 12_800 }],
    reproduction: ["Create a task", "Mark it complete", "Look for a way to show only completed tasks"],
  },
  {
    id: "finding-filter-discovery-impatient",
    testerId: "impatient",
    route: "/",
    stepId: "filter",
    category: "navigation",
    severity: "medium",
    observation: {
      summary: "The filter controls did not read as the next action during a fast scan.",
      expected: "Active, completed, and all-task views should be quickly discoverable.",
      actual: "Leo refreshed before locating the filter links beneath the remaining-item count.",
    },
    evidence: [{ pageUrl: "https://demo.playwright.dev/todomvc/", attemptedAction: "Open completed tasks quickly", screenshot: screenshot("impatient", "filter"), elapsedMs: 7_100 }],
    reproduction: ["Create and complete a task", "Scan the visible actions from the task row downward", "Attempt to open completed tasks"],
  },
  {
    id: "finding-filter-discovery-keyboard",
    testerId: "keyboard",
    route: "/",
    stepId: "filter",
    category: "navigation",
    severity: "high",
    observation: {
      summary: "Keyboard focus on the filter links was difficult to track.",
      expected: "Each focused filter should have a clear visible indicator.",
      actual: "Noor lost track of focus while tabbing from the task list into the footer filters.",
    },
    evidence: [{ pageUrl: "https://demo.playwright.dev/todomvc/", attemptedAction: "Tab to the Completed filter", screenshot: screenshot("keyboard", "filter"), elapsedMs: 16_400 }],
    reproduction: ["Create and complete a task using the keyboard", "Press Tab until the footer is reached", "Observe focus while moving across filters"],
    likelyCause: {
      summary: "The focused and unfocused filter styles may not have enough visual separation.",
      confidence: "low",
    },
  },
  {
    id: "finding-long-task-label",
    testerId: "edge-case",
    route: "/",
    stepId: "recover",
    category: "validation",
    severity: "low",
    observation: {
      summary: "A very long valid task name made the row difficult to scan.",
      expected: "Long task names should wrap without crowding adjacent controls.",
      actual: "Eli's 180-character task occupied several lines and pushed row controls out of visual alignment.",
    },
    evidence: [{ pageUrl: "https://demo.playwright.dev/todomvc/", attemptedAction: "Create a 180-character task", screenshot: screenshot("edge-case", "recover"), elapsedMs: 9_600 }],
    reproduction: ["Enter a 180-character task name", "Submit it", "Compare its controls with a short task row"],
  },
];

const filterCluster = createCluster(
  {
    id: "cluster-filter-discovery",
    title: "Completed-task filters are easy to miss",
    summary: "Three independent journeys slowed down at the filter controls, including one keyboard-focused journey.",
    findingIds: [
      "finding-filter-discovery-first-time",
      "finding-filter-discovery-impatient",
      "finding-filter-discovery-keyboard",
    ],
  },
  demoFindings,
);

export const demoStudy: StudyRun = {
  id: "demo-todomvc-001",
  mode: "demo",
  targetName: "TodoMVC",
  targetUrl: "https://demo.playwright.dev/todomvc/",
  startedAt,
  completedAt: at(73),
  journey: demoJourney,
  testers: personas.map(tester),
  findings: demoFindings,
  clusters: [filterCluster],
};

export const demoProductHealth = calculateProductHealth(demoStudy);
