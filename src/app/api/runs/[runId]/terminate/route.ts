import { terminateSandbox } from "@/lib/sparkles/client";
import { getLiveRun, persistAndUnlockIfSettled } from "@/lib/sparkles/persistence";
import { publicRun } from "@/lib/sparkles/registry";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = await getLiveRun(runId);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });

  await Promise.all(run.testers.map(async (tester) => {
    if (tester.sandboxId && tester.slotReserved) {
      try {
        await terminateSandbox(tester.sandboxId);
        tester.currentActivity = "Stopping journey";
      } catch {
        tester.currentActivity = "Could not confirm sandbox termination";
      }
    }
  }));

  try {
    await persistAndUnlockIfSettled(run);
  } catch {
    // The lock remains conservative until termination is confirmed.
  }

  return Response.json(publicRun(run));
}
