import { getSandbox } from "@/lib/sparkles/client";
import { mapSandboxStatus } from "@/lib/sparkles/events";
import { getLiveRun, persistAndUnlockIfSettled } from "@/lib/sparkles/persistence";
import { publicRun, registry } from "@/lib/sparkles/registry";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = await getLiveRun(runId);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });

  await Promise.all(run.testers.map(async (tester) => {
    if (!tester.sandboxId || !tester.slotReserved) return;
    try {
      const snapshot = await getSandbox(tester.sandboxId);
      const status = mapSandboxStatus(snapshot.status ?? snapshot.sandbox?.status);
      if (status) registry.updateStatus(run, tester, status, true);
    } catch {
      // A transient status fetch must not erase the last known tester state.
    }
  }));

  try {
    await persistAndUnlockIfSettled(run);
  } catch {
    // Status reads still succeed if durable history is temporarily unavailable.
  }

  return Response.json(publicRun(run));
}
