import { createSandbox, getSandbox, listSandboxes } from "@/lib/sparkles/client";
import { createArtifactGrant } from "@/lib/sparkles/artifacts";
import { acquireStudyLock, durableRunsEnabled, listPublicRuns, persistAndUnlockIfSettled, persistRun, readStoredRun, releaseStudyLock } from "@/lib/sparkles/persistence";
import { mapSandboxStatus } from "@/lib/sparkles/events";
import { makeTester, publicRun, registry, type LiveRun } from "@/lib/sparkles/registry";
import { idempotencyKey, journey, newRunId, personas, testerPrompt } from "@/lib/sparkles/study";

export const runtime = "nodejs";
export const maxDuration = 60;

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function validTarget(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

async function staleRunSettled(runId: string) {
  if (runId.startsWith("fix_")) {
    try {
      const sandboxes = await listSandboxes();
      return !sandboxes.some((sandbox) => sandbox.metadata?.fixId === runId && sandbox.status !== "terminated" && sandbox.status !== "failed");
    } catch {
      return false;
    }
  }
  const stored = await readStoredRun(runId);
  if (!stored) return false;
  const active = stored.testers.filter((tester) => tester.sandboxActive);
  if (active.some((tester) => !tester.sandboxId)) return false;
  const statuses = await Promise.all(active.map(async (tester) => {
    try {
      const snapshot = await getSandbox(tester.sandboxId!);
      return mapSandboxStatus(snapshot.status ?? snapshot.sandbox?.status);
    } catch {
      return undefined;
    }
  }));
  return statuses.every((status) => status === "completed" || status === "partial" || status === "failed");
}

export async function GET() {
  return Response.json({ runs: await listPublicRuns() });
}

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return Response.json({ error: "Request body must be a JSON object" }, { status: 400 });
  }
  const body = input as { targetUrl?: unknown; repository?: unknown };
  const targetUrl = validTarget(body.targetUrl);
  if (!targetUrl) return Response.json({ error: "targetUrl must be a valid HTTP(S) URL without embedded credentials" }, { status: 400 });
  if (body.repository !== undefined && (typeof body.repository !== "string" || !REPOSITORY.test(body.repository))) {
    return Response.json({ error: "repository must use owner/repo format" }, { status: 400 });
  }

  const harnessRepository = process.env.SPARKLES_REPOSITORY;
  if (!harnessRepository || !REPOSITORY.test(harnessRepository)) {
    return Response.json({ error: "SPARKLES_REPOSITORY is not configured as owner/repo" }, { status: 503 });
  }
  if (!process.env.SPARKLES_API_KEY) {
    return Response.json({ error: "SPARKLES_API_KEY is not configured" }, { status: 503 });
  }
  if (process.env.VERCEL && !durableRunsEnabled()) {
    return Response.json({ error: "BLOB_READ_WRITE_TOKEN is required for safe production orchestration" }, { status: 503 });
  }
  const runId = newRunId();
  if (!(await acquireStudyLock(runId, staleRunSettled))) {
    return Response.json({ error: "A four-tester study is already active; wait for it to finish" }, { status: 429 });
  }
  if (!registry.slots.reserve(personas.length)) {
    await releaseStudyLock(runId);
    return Response.json({ error: `TrialRoom permits exactly ${personas.length} active sandboxes; wait for the current study to finish` }, { status: 429 });
  }

  const repository = typeof body.repository === "string" ? body.repository : undefined;
  const origin = new URL(request.url).origin;
  const canUploadArtifacts = Boolean(process.env.BLOB_READ_WRITE_TOKEN) && !/localhost|127\.0\.0\.1/.test(origin);
  const run: LiveRun = {
    id: runId,
    mode: "live",
    targetName: new URL(targetUrl).hostname,
    targetUrl,
    repository,
    startedAt: new Date().toISOString(),
    journey,
    testers: personas.map((persona) => makeTester(persona, journey)),
  };
  registry.add(run);
  try {
    await persistRun(run);
  } catch {
    for (const tester of run.testers) registry.releaseTester(tester);
    try {
      await releaseStudyLock(runId);
    } catch {
      // An unreleased lock fails closed without starting paid work.
    }
    return Response.json({ error: "Durable run storage is temporarily unavailable" }, { status: 503 });
  }

  const repos = [...new Set([harnessRepository, repository].filter((value): value is string => Boolean(value)))].map((fullName) => ({ fullName }));
  await Promise.all(run.testers.map(async (tester) => {
    try {
      const sandbox = await createSandbox({
        repos,
        prompt: testerPrompt({
          runId,
          targetUrl,
          repository,
          persona: tester.persona,
          artifactUpload: canUploadArtifacts ? {
            url: `${origin}/api/runs/${runId}/artifacts`,
            token: createArtifactGrant(runId, tester.id),
          } : undefined,
        }),
        title: `TrialRoom · ${tester.persona.shortName} · ${run.targetName}`,
        idempotencyKey: idempotencyKey(runId, tester.id),
        metadata: { product: "trialroom", runId, testerId: tester.id },
        model: process.env.SPARKLES_MODEL,
      });
      tester.sandboxId = sandbox.id;
      tester.status = "booting";
      tester.currentActivity = "Preparing test environment";
    } catch {
      registry.updateStatus(run, tester, "failed", true);
      tester.currentActivity = "Sandbox creation failed";
    }
  }));

  try {
    await persistAndUnlockIfSettled(run);
  } catch {
    // The in-memory run remains usable; the durable lock prevents unsafe overlap.
  }

  return Response.json(publicRun(run), { status: 201 });
}
