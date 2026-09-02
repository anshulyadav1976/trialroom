import { createSandbox } from "@/lib/sparkles/client";
import { fixDigest, fixPrompt, parseFixRequest } from "@/lib/sparkles/fix";
import { acquireStudyLock, durableRunsEnabled, releaseStudyLock } from "@/lib/sparkles/persistence";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const input = parseFixRequest(body);
  if (!input) return Response.json({ error: "repository and finding must be valid and bounded" }, { status: 400 });
  if (!process.env.SPARKLES_API_KEY) return Response.json({ error: "SPARKLES_API_KEY is not configured" }, { status: 503 });
  if (process.env.VERCEL && !durableRunsEnabled()) {
    return Response.json({ error: "BLOB_READ_WRITE_TOKEN is required for safe production orchestration" }, { status: 503 });
  }

  const digest = fixDigest(input);
  const lockId = `fix_${digest}`;
  if (!(await acquireStudyLock(lockId, async (lockedId) => lockedId.startsWith("fix_")))) {
    return Response.json({ error: "Another study or fix room is already active" }, { status: 429 });
  }

  try {
    const sandbox = await createSandbox({
      repos: [{ fullName: input.repository }],
      prompt: fixPrompt(input),
      title: `TrialRoom fix · ${input.finding.title}`.slice(0, 100),
      idempotencyKey: `trialroom-fix-${digest}`,
      metadata: { product: "trialroom", kind: "fix", fixId: lockId, findingId: input.finding.id },
      model: process.env.SPARKLES_MODEL,
    });
    // ponytail: the demo holds this one-room lease until its 45-minute stale window; add fix status/termination only when the UI needs it.
    return Response.json({ sandboxId: sandbox.id, status: sandbox.status ?? "queued" }, { status: 201 });
  } catch {
    try {
      await releaseStudyLock(lockId);
    } catch {
      // The stale-lock recovery path remains the last-resort safety valve.
    }
    return Response.json({ error: "The fix room could not be created" }, { status: 502 });
  }
}
