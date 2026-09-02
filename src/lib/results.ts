import {
  PERSONA_IDS,
  createCluster,
  type BrowserEvidence,
  type Finding,
  type FindingCategory,
  type FindingCluster,
  type JourneyStepResult,
  type PersonaId,
  type Severity,
  type TesterStatus,
} from "./trialroom.ts";

export interface TesterResult {
  runId: string;
  personaId: PersonaId;
  targetUrl: string;
  status: Extract<TesterStatus, "completed" | "partial" | "failed">;
  steps: JourneyStepResult[];
  findings: Finding[];
}

export interface ResultBlob {
  pathname: string;
  url: string;
  uploadedAt: Date;
}

export interface RunResultsResponse {
  runId: string;
  status: "pending" | "partial" | "completed";
  receivedTesterIds: PersonaId[];
  missingTesterIds: PersonaId[];
  testers: Array<Pick<TesterResult, "personaId" | "status" | "steps">>;
  findings: Finding[];
  clusters: FindingCluster[];
  screenshots: Array<{ testerId: PersonaId; pathname: string; url: string }>;
  issues: Array<{ code: "invalid-result" | "invalid-artifact" | "artifact-limit" | "storage-unavailable"; testerId?: PersonaId }>;
}

const severities = ["low", "medium", "high", "critical"] as const;
const categories = [
  "comprehension",
  "navigation",
  "interaction",
  "feedback",
  "accessibility",
  "validation",
  "performance",
  "reliability",
] as const;
const outcomes = ["pending", "pass", "friction", "fail"] as const;
const resultStatuses = ["completed", "partial", "failed"] as const;
const screenshotSources = ["demo-placeholder", "sparkles-upload"] as const;
const severityRank: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string`);
  return value.trim();
}

function optionalString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : string(value, path);
}

function number(value: unknown, path: string, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
    throw new Error(`${path} must be a non-negative${integer ? " integer" : " number"}`);
  }
  return value;
}

function optionalNumber(value: unknown, path: string, integer = false): number | undefined {
  return value === undefined ? undefined : number(value, path, integer);
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}

function oneOf<const T extends readonly string[]>(value: unknown, allowed: T, path: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) throw new Error(`${path} is invalid`);
  return value as T[number];
}

function httpUrl(value: unknown, path: string): string {
  const candidate = string(value, path);
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    return url.toString();
  } catch {
    throw new Error(`${path} must be an HTTP(S) URL`);
  }
}

function screenshot(value: unknown, path: string) {
  const item = record(value, path);
  const width = optionalNumber(item.width, `${path}.width`, true);
  const height = optionalNumber(item.height, `${path}.height`, true);
  if ((width && width > 10_000) || (height && height > 10_000)) throw new Error(`${path} dimensions are too large`);
  return {
    id: string(item.id, `${path}.id`),
    label: string(item.label, `${path}.label`),
    source: oneOf(item.source, screenshotSources, `${path}.source`),
    url: item.url === undefined ? undefined : httpUrl(item.url, `${path}.url`),
    width,
    height,
  };
}

function evidence(value: unknown, path: string): BrowserEvidence {
  const item = record(value, path);
  return {
    pageUrl: httpUrl(item.pageUrl, `${path}.pageUrl`),
    attemptedAction: optionalString(item.attemptedAction, `${path}.attemptedAction`),
    screenshot: item.screenshot === undefined ? undefined : screenshot(item.screenshot, `${path}.screenshot`),
    consoleErrors: item.consoleErrors === undefined
      ? undefined
      : array(item.consoleErrors, `${path}.consoleErrors`).map((entry, index) => string(entry, `${path}.consoleErrors[${index}]`)),
    failedRequests: item.failedRequests === undefined
      ? undefined
      : array(item.failedRequests, `${path}.failedRequests`).map((entry, index) => {
          const request = record(entry, `${path}.failedRequests[${index}]`);
          const status = optionalNumber(request.status, `${path}.failedRequests[${index}].status`, true);
          if (status !== undefined && (status < 100 || status > 599)) throw new Error(`${path}.failedRequests[${index}].status is invalid`);
          return {
            url: httpUrl(request.url, `${path}.failedRequests[${index}].url`),
            status,
            method: optionalString(request.method, `${path}.failedRequests[${index}].method`),
          };
        }),
    elapsedMs: optionalNumber(item.elapsedMs, `${path}.elapsedMs`, true),
  };
}

function step(value: unknown, path: string): JourneyStepResult {
  const item = record(value, path);
  return {
    id: string(item.id, `${path}.id`),
    title: string(item.title, `${path}.title`),
    mission: string(item.mission, `${path}.mission`),
    outcome: oneOf(item.outcome, outcomes, `${path}.outcome`),
    durationMs: optionalNumber(item.durationMs, `${path}.durationMs`, true),
    screenshot: item.screenshot === undefined ? undefined : screenshot(item.screenshot, `${path}.screenshot`),
    observationCount: number(item.observationCount, `${path}.observationCount`, true),
  };
}

function finding(value: unknown, path: string): Finding {
  const item = record(value, path);
  const observation = record(item.observation, `${path}.observation`);
  const likelyCause = item.likelyCause === undefined ? undefined : record(item.likelyCause, `${path}.likelyCause`);
  const codeHint = likelyCause?.codeHint === undefined ? undefined : record(likelyCause.codeHint, `${path}.likelyCause.codeHint`);
  return {
    id: string(item.id, `${path}.id`),
    testerId: oneOf(item.testerId, PERSONA_IDS, `${path}.testerId`),
    route: string(item.route, `${path}.route`),
    stepId: string(item.stepId, `${path}.stepId`),
    category: oneOf(item.category, categories, `${path}.category`) as FindingCategory,
    severity: oneOf(item.severity, severities, `${path}.severity`) as Severity,
    observation: {
      summary: string(observation.summary, `${path}.observation.summary`),
      expected: string(observation.expected, `${path}.observation.expected`),
      actual: string(observation.actual, `${path}.observation.actual`),
    },
    evidence: array(item.evidence, `${path}.evidence`).map((entry, index) => evidence(entry, `${path}.evidence[${index}]`)),
    reproduction: array(item.reproduction, `${path}.reproduction`).map((entry, index) => string(entry, `${path}.reproduction[${index}]`)),
    likelyCause: likelyCause
      ? {
          summary: string(likelyCause.summary, `${path}.likelyCause.summary`),
          confidence: oneOf(likelyCause.confidence, ["low", "medium", "high"] as const, `${path}.likelyCause.confidence`),
          codeHint: codeHint
            ? {
                path: string(codeHint.path, `${path}.likelyCause.codeHint.path`),
                line: optionalNumber(codeHint.line, `${path}.likelyCause.codeHint.line`, true),
              }
            : undefined,
        }
      : undefined,
  };
}

export function parseTesterResult(input: string | unknown): TesterResult {
  let value: unknown = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input);
    } catch {
      throw new Error("Tester result is not valid JSON");
    }
  }

  const result = record(value, "result");
  const personaId = oneOf(result.personaId, PERSONA_IDS, "result.personaId");
  const steps = array(result.steps, "result.steps").map((entry, index) => step(entry, `result.steps[${index}]`));
  const findings = array(result.findings, "result.findings").map((entry, index) => finding(entry, `result.findings[${index}]`));
  const stepIds = new Set(steps.map(({ id }) => id));

  if (stepIds.size !== steps.length) throw new Error("result.steps contains duplicate ids");
  if (new Set(findings.map(({ id }) => id)).size !== findings.length) throw new Error("result.findings contains duplicate ids");
  if (findings.some((item) => item.testerId !== personaId)) throw new Error("A finding belongs to another persona");
  if (findings.some((item) => !stepIds.has(item.stepId))) throw new Error("A finding references an unknown journey step");

  return {
    runId: string(result.runId, "result.runId"),
    personaId,
    targetUrl: httpUrl(result.targetUrl, "result.targetUrl"),
    status: oneOf(result.status, resultStatuses, "result.status"),
    steps,
    findings,
  };
}

function normalizeRoute(route: string) {
  try {
    const pathname = new URL(route, "https://trialroom.invalid").pathname.replace(/\/+$/, "");
    return pathname || "/";
  } catch {
    return route.trim().replace(/[?#].*$/, "").replace(/\/+$/, "") || "/";
  }
}

function clusterKey(item: Finding) {
  return [normalizeRoute(item.route), item.stepId.trim().toLowerCase(), item.category].join("\0");
}

/** Exact route + journey step + category grouping. Semantic merging belongs in a later optional pass. */
export function clusterFindings(findings: Finding[], totalTesters = PERSONA_IDS.length): FindingCluster[] {
  if (!Number.isInteger(totalTesters) || totalTesters < 1) throw new Error("totalTesters must be a positive integer");
  const groups = new Map<string, Finding[]>();
  for (const item of findings) groups.set(clusterKey(item), [...(groups.get(clusterKey(item)) ?? []), item]);

  return [...groups.entries()]
    .map(([key, members]) => {
      const stableMembers = members.toSorted((a, b) => a.id.localeCompare(b.id));
      const route = normalizeRoute(stableMembers[0].route);
      const affected = new Set(stableMembers.map(({ testerId }) => testerId)).size;
      return createCluster(
        {
          id: `cluster-${encodeURIComponent(key)}`,
          title: stableMembers[0].observation.summary,
          summary: `${affected} / ${totalTesters} testers reported ${stableMembers[0].category} friction at ${route} during ${stableMembers[0].stepId}.`,
          findingIds: stableMembers.map(({ id }) => id),
        },
        stableMembers,
        totalTesters,
      );
    })
    .toSorted((a, b) => b.affectedCount - a.affectedCount || severityRank[b.severity] - severityRank[a.severity] || a.id.localeCompare(b.id));
}

function blobTesterId(runId: string, pathname: string): PersonaId | undefined {
  const [testerId] = pathname.startsWith(`runs/${runId}/`)
    ? pathname.slice(`runs/${runId}/`.length).split("/")
    : [];
  return PERSONA_IDS.find((id) => id === testerId);
}

export async function collectRunResults(
  runId: string,
  blobs: ResultBlob[],
  readJson: (blob: ResultBlob) => Promise<string>,
  artifactLimitReached = false,
): Promise<RunResultsResponse> {
  const results = new Map<PersonaId, TesterResult>();
  const issues: RunResultsResponse["issues"] = artifactLimitReached ? [{ code: "artifact-limit" }] : [];
  const jsonBlobs = blobs
    .filter(({ pathname }) => pathname.endsWith(".json"))
    .toSorted((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());

  for (const blob of jsonBlobs) {
    const testerId = blobTesterId(runId, blob.pathname);
    if (!testerId || results.has(testerId)) continue;
    try {
      const result = parseTesterResult(await readJson(blob));
      if (result.runId !== runId || result.personaId !== testerId) throw new Error("Artifact identity mismatch");
      results.set(testerId, result);
    } catch {
      issues.push({ code: "invalid-result", testerId });
    }
  }

  const receivedTesterIds = PERSONA_IDS.filter((id) => results.has(id));
  const missingTesterIds = PERSONA_IDS.filter((id) => !results.has(id));
  const ordered = receivedTesterIds.map((id) => results.get(id)!);
  const findings = ordered.flatMap((result) => result.findings);
  const screenshots: RunResultsResponse["screenshots"] = [];
  for (const blob of blobs) {
    const testerId = blobTesterId(runId, blob.pathname);
    if (!testerId || !/\.(?:jpe?g|png|webp)$/i.test(blob.pathname)) continue;
    try {
      screenshots.push({ testerId, pathname: blob.pathname, url: httpUrl(blob.url, "blob.url") });
    } catch {
      issues.push({ code: "invalid-artifact", testerId });
    }
  }

  return {
    runId,
    status: receivedTesterIds.length === 0 ? "pending" : missingTesterIds.length ? "partial" : "completed",
    receivedTesterIds,
    missingTesterIds,
    testers: ordered.map(({ personaId, status, steps }) => ({ personaId, status, steps })),
    findings,
    clusters: clusterFindings(findings),
    screenshots,
    issues,
  };
}

export function pendingRunResults(runId: string, code?: "storage-unavailable"): RunResultsResponse {
  return {
    runId,
    status: "pending",
    receivedTesterIds: [],
    missingTesterIds: [...PERSONA_IDS],
    testers: [],
    findings: [],
    clusters: [],
    screenshots: [],
    issues: code ? [{ code }] : [],
  };
}
