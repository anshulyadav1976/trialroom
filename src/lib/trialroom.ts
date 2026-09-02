export const PERSONA_IDS = ["first-time", "impatient", "keyboard", "edge-case"] as const;

export type PersonaId = (typeof PERSONA_IDS)[number];
export type Severity = "low" | "medium" | "high" | "critical";
export type FindingCategory =
  | "comprehension"
  | "navigation"
  | "interaction"
  | "feedback"
  | "accessibility"
  | "validation"
  | "performance"
  | "reliability";
export type TesterStatus = "queued" | "booting" | "running" | "completed" | "partial" | "failed";
export type StepOutcome = "pending" | "pass" | "friction" | "fail";

export interface Persona {
  id: PersonaId;
  name: string;
  shortName: string;
  description: string;
  behavior: string[];
  color: string;
}

export interface JourneyStepDefinition {
  id: string;
  title: string;
  mission: string;
}

export interface ScreenshotArtifact {
  id: string;
  label: string;
  url?: string;
  source: "demo-placeholder" | "sparkles-upload";
  width?: number;
  height?: number;
}

export interface JourneyStepResult extends JourneyStepDefinition {
  outcome: StepOutcome;
  durationMs?: number;
  screenshot?: ScreenshotArtifact;
  observationCount: number;
}

export type TesterEventKind =
  | "queued"
  | "booting"
  | "step-started"
  | "browser-activity"
  | "finding-discovered"
  | "screenshot-captured"
  | "completed"
  | "failed";

export interface TesterEvent {
  id: string;
  testerId: PersonaId;
  kind: TesterEventKind;
  at: string;
  label: string;
  stepId?: string;
}

export interface TesterRun {
  id: PersonaId;
  persona: Persona;
  sandboxId?: string;
  status: TesterStatus;
  currentStepId?: string;
  currentActivity: string;
  elapsedMs: number;
  journey: JourneyStepResult[];
  events: TesterEvent[];
}

export interface BrowserEvidence {
  pageUrl: string;
  attemptedAction?: string;
  screenshot?: ScreenshotArtifact;
  consoleErrors?: string[];
  failedRequests?: Array<{ url: string; status?: number; method?: string }>;
  elapsedMs?: number;
}

export interface FindingObservation {
  summary: string;
  expected: string;
  actual: string;
}

export interface LikelyCause {
  summary: string;
  confidence: "low" | "medium" | "high";
  codeHint?: { path: string; line?: number };
}

export interface Finding {
  id: string;
  testerId: PersonaId;
  route: string;
  stepId: string;
  category: FindingCategory;
  severity: Severity;
  observation: FindingObservation;
  evidence: BrowserEvidence[];
  reproduction: string[];
  likelyCause?: LikelyCause;
}

export interface FindingCluster {
  id: string;
  title: string;
  summary: string;
  severity: Severity;
  findingIds: string[];
  affectedTesterIds: PersonaId[];
  affectedCount: number;
  totalTesters: number;
}

export interface StudyRun {
  id: string;
  mode: "demo" | "live";
  targetName: string;
  targetUrl: string;
  startedAt: string;
  completedAt?: string;
  journey: JourneyStepDefinition[];
  testers: TesterRun[];
  findings: Finding[];
  clusters: FindingCluster[];
}

export interface ProductHealth {
  kind: "heuristic";
  score: number;
  label: "Excellent" | "Solid" | "Needs attention" | "At risk";
  completionRate: number;
  penalties: {
    severeFindings: number;
    repeatedFriction: number;
    testerFailures: number;
  };
  explanation: string;
}

const severityRank: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function createCluster(
  input: Pick<FindingCluster, "id" | "title" | "summary" | "findingIds">,
  findings: Finding[],
  totalTesters = PERSONA_IDS.length,
): FindingCluster {
  const members = input.findingIds.map((id) => findings.find((finding) => finding.id === id));
  if (members.some((finding) => !finding)) throw new Error(`Cluster ${input.id} references an unknown finding`);

  const present = members as Finding[];
  const affectedTesterIds = [...new Set(present.map((finding) => finding.testerId))];
  return {
    ...input,
    severity: present.reduce(
      (highest, finding) => (severityRank[finding.severity] > severityRank[highest] ? finding.severity : highest),
      "low" as Severity,
    ),
    affectedTesterIds,
    affectedCount: affectedTesterIds.length,
    totalTesters,
  };
}

export function calculateProductHealth(
  study: Pick<StudyRun, "testers" | "findings" | "clusters">,
): ProductHealth {
  const allSteps = study.testers.flatMap((tester) => tester.journey);
  const completedSteps = allSteps.filter((step) => step.outcome === "pass" || step.outcome === "friction").length;
  const completionRate = allSteps.length ? completedSteps / allSteps.length : 0;
  const severeFindings = study.findings.reduce(
    (penalty, finding) => penalty + (finding.severity === "critical" ? 15 : finding.severity === "high" ? 8 : 0),
    0,
  );
  const repeatedFriction = study.clusters.reduce(
    (penalty, cluster) => penalty + Math.min(12, Math.max(0, cluster.affectedCount - 1) * 3),
    0,
  );
  const testerFailures = study.testers.reduce(
    (penalty, tester) => penalty + (tester.status === "failed" ? 10 : tester.status === "partial" ? 4 : 0),
    0,
  );
  const score = Math.max(0, Math.min(100, Math.round(completionRate * 100) - severeFindings - repeatedFriction - testerFailures));

  return {
    kind: "heuristic",
    score,
    label: score >= 90 ? "Excellent" : score >= 75 ? "Solid" : score >= 55 ? "Needs attention" : "At risk",
    completionRate,
    penalties: { severeFindings, repeatedFriction, testerFailures },
    explanation: "Journey completion minus transparent penalties for high/critical findings, repeated friction, and failed testers.",
  };
}
