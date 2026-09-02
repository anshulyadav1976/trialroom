import "server-only";

import { BlobPreconditionFailedError, del, get, list, put } from "@vercel/blob";
import type { JourneyStepDefinition, TesterRun } from "@/lib/trialroom";
import { registry, type LiveRun, type LiveTester } from "@/lib/sparkles/registry";
import { journey, personas } from "@/lib/sparkles/study";

const RUN_PREFIX = "trialroom/state/runs/";
const LOCK_PATH = "trialroom/state/live-study.lock.json";
const LOCK_TTL_MS = 45 * 60_000;

interface StoredTester extends TesterRun {
  sandboxActive: boolean;
}

export interface StoredRun {
  id: string;
  mode: "live" | "demo";
  seeded?: boolean;
  targetName: string;
  targetUrl: string;
  repository?: string;
  startedAt: string;
  completedAt?: string;
  journey: JourneyStepDefinition[];
  testers: StoredTester[];
  activeSandboxCount: number;
}

interface StudyLock {
  runId: string;
  acquiredAt: string;
  expiresAt: string;
}

interface BlobJson<T> {
  value: T;
  etag: string;
  uploadedAt: Date;
}

export function durableRunsEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN));
}

function pathname(runId: string) {
  return `${RUN_PREFIX}${encodeURIComponent(runId)}.json`;
}

async function readJson<T>(path: string): Promise<BlobJson<T> | null> {
  const result = await get(path, { access: "public", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return {
    value: JSON.parse(await new Response(result.stream).text()) as T,
    etag: result.blob.etag,
    uploadedAt: result.blob.uploadedAt,
  };
}

function safeTargetUrl(value: string) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

export function snapshotRun(run: LiveRun): StoredRun {
  const testers = run.testers.map((tester): StoredTester => ({
    id: tester.id,
    persona: tester.persona,
    sandboxId: tester.sandboxId,
    status: tester.status,
    currentStepId: tester.currentStepId,
    currentActivity: tester.currentActivity,
    elapsedMs: tester.elapsedMs,
    journey: tester.journey,
    events: tester.events,
    sandboxActive: tester.slotReserved,
  }));
  return {
    id: run.id,
    mode: "live",
    seeded: run.seeded,
    targetName: run.targetName,
    targetUrl: safeTargetUrl(run.targetUrl),
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    journey: run.journey,
    testers,
    activeSandboxCount: testers.filter((tester) => tester.sandboxActive).length,
  };
}

export function publicStoredRun(run: StoredRun) {
  return {
    ...run,
    testers: run.testers.map((tester): TesterRun => ({
      id: tester.id,
      persona: tester.persona,
      sandboxId: tester.sandboxId,
      status: tester.status,
      currentStepId: tester.currentStepId,
      currentActivity: tester.currentActivity,
      elapsedMs: tester.elapsedMs,
      journey: tester.journey,
      events: tester.events,
    })),
  };
}

export const seededPreviewRun: StoredRun = {
  id: "seeded-todomvc-preview",
  mode: "demo",
  seeded: true,
  targetName: "TodoMVC",
  targetUrl: "https://demo.playwright.dev/todomvc/",
  startedAt: "2026-09-02T12:00:00.000Z",
  completedAt: "2026-09-02T12:02:14.000Z",
  journey,
  testers: personas.map((persona) => ({
    id: persona.id,
    persona,
    status: "completed",
    currentActivity: "Seeded preview complete",
    elapsedMs: 134_000,
    journey: journey.map((step) => ({ ...step, outcome: "pass", observationCount: 0 })),
    events: [{
      id: `${persona.id}-seeded-preview`,
      testerId: persona.id,
      kind: "completed",
      at: "2026-09-02T12:02:14.000Z",
      label: "Seeded preview data — no live sandbox or artifact claim",
    }],
    sandboxActive: false,
  })),
  activeSandboxCount: 0,
};

function isStoredRun(value: unknown): value is StoredRun {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredRun>;
  return typeof candidate.id === "string" && candidate.mode === "live" && Array.isArray(candidate.testers) && Array.isArray(candidate.journey);
}

export async function persistRun(run: LiveRun) {
  if (!durableRunsEnabled()) return;
  await put(pathname(run.id), JSON.stringify(snapshotRun(run)), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: "application/json",
  });
}

export async function readStoredRun(runId: string) {
  if (!durableRunsEnabled()) return null;
  const stored = await readJson<unknown>(pathname(runId));
  return stored && isStoredRun(stored.value) ? stored.value : null;
}

export async function getLiveRun(runId: string) {
  const local = registry.get(runId);
  if (local) return local;
  const stored = await readStoredRun(runId);
  if (!stored) return null;
  const raced = registry.get(runId);
  if (raced) return raced;

  const testers: LiveTester[] = stored.testers.map(({ sandboxActive, ...tester }) => ({
    ...tester,
    seenEventIds: new Set<string>(),
    slotReserved: sandboxActive,
  }));
  const active = testers.filter((tester) => tester.slotReserved).length;
  if (active && !registry.slots.reserve(active)) throw new Error("Local sandbox registry is already at capacity");
  const run: LiveRun = {
    id: stored.id,
    mode: "live",
    seeded: stored.seeded,
    targetName: stored.targetName,
    targetUrl: stored.targetUrl,
    repository: stored.repository,
    startedAt: stored.startedAt,
    completedAt: stored.completedAt,
    journey: stored.journey,
    testers,
  };
  registry.add(run);
  return run;
}

export async function listPublicRuns() {
  const runs = new Map<string, StoredRun>();
  for (const run of registry.runs.values()) runs.set(run.id, snapshotRun(run));

  if (durableRunsEnabled()) {
    try {
      const result = await list({ prefix: RUN_PREFIX, limit: 20 });
      const stored = await Promise.all(result.blobs.map(async (blob) => {
        try {
          const value = await readJson<unknown>(blob.pathname);
          return value && isStoredRun(value.value) ? value.value : null;
        } catch {
          return null;
        }
      }));
      for (const run of stored) if (run && !runs.has(run.id)) runs.set(run.id, run);
    } catch {
      // The seeded preview and process-local runs remain useful during a Blob outage.
    }
  }

  return [...runs.values(), seededPreviewRun]
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .map(publicStoredRun);
}

async function currentLock() {
  try {
    return await readJson<StudyLock>(LOCK_PATH);
  } catch {
    return null;
  }
}

function lockBody(runId: string, now: number) {
  return JSON.stringify({
    runId,
    acquiredAt: new Date(now).toISOString(),
    expiresAt: new Date(now + LOCK_TTL_MS).toISOString(),
  } satisfies StudyLock);
}

export async function acquireStudyLock(
  runId: string,
  canRecoverStale: (lockedRunId: string) => Promise<boolean>,
  now = Date.now(),
) {
  if (!durableRunsEnabled()) return true;
  const body = lockBody(runId, now);
  try {
    await put(LOCK_PATH, body, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 60,
      contentType: "application/json",
    });
    return true;
  } catch {
    const existing = await currentLock();
    if (!existing) return false;
    const stored = await readStoredRun(existing.value.runId);
    const settled = Boolean(stored && stored.testers.every((tester) => !tester.sandboxActive));
    const expired = Date.parse(existing.value.expiresAt) <= now;
    if (!settled && (!expired || !(await canRecoverStale(existing.value.runId)))) return false;
    try {
      await put(LOCK_PATH, body, {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        ifMatch: existing.etag,
        cacheControlMaxAge: 60,
        contentType: "application/json",
      });
      return true;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) return false;
      throw error;
    }
  }
}

export async function releaseStudyLock(runId: string) {
  if (!durableRunsEnabled()) return;
  const existing = await currentLock();
  if (!existing || existing.value.runId !== runId) return;
  try {
    await del(LOCK_PATH, { ifMatch: existing.etag });
  } catch (error) {
    if (!(error instanceof BlobPreconditionFailedError)) throw error;
  }
}

export async function persistAndUnlockIfSettled(run: LiveRun) {
  await persistRun(run);
  if (run.testers.every((tester) => !tester.slotReserved)) await releaseStudyLock(run.id);
}
