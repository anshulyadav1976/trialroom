import type { PersonaId, TesterEvent } from "@/lib/trialroom";
import { getSandbox, listSandboxEvents, streamSandboxEvents, terminateSandbox } from "@/lib/sparkles/client";
import { mapSandboxStatus, normalizeSparklesEvent, parseSseStream, sparklesEventKey, type RawSseEvent } from "@/lib/sparkles/events";
import { getLiveRun, persistAndUnlockIfSettled } from "@/lib/sparkles/persistence";
import { publicRun, registry, type LiveTester } from "@/lib/sparkles/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const encoder = new TextEncoder();
const TERMINAL = new Set(["completed", "partial", "failed"]);

function frame(event: string, data: unknown, id?: string) {
  return encoder.encode(`${id ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = await getLiveRun(runId);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(frame("run.snapshot", publicRun(run)));

      const pump = async (tester: LiveTester) => {
        if (!tester.sandboxId || !tester.slotReserved) return;
        let transient = 0;
        let warned = false;

        const consume = (raw: RawSseEvent) => {
          if (raw.id) tester.upstreamCursor = raw.id;
          const normalized = normalizeSparklesEvent(tester.id as PersonaId, raw);
          if (!normalized) return;
          const durableKey = sparklesEventKey(normalized);
          if (durableKey && tester.seenEventIds.has(durableKey)) return;
          if (durableKey) tester.seenEventIds.add(durableKey);
          const downstreamId = `${tester.id}:${durableKey ?? `transient-${transient++}`}`;
          const event: TesterEvent = {
            id: downstreamId,
            testerId: tester.id,
            kind: normalized.kind,
            at: normalized.at,
            label: normalized.label,
          };
          registry.addEvent(tester, event);
          if (normalized.status) {
            registry.updateStatus(run, tester, normalized.status, normalized.sourceType === "sandbox.status");
          }
          controller.enqueue(frame("tester.updated", { ...normalized, id: downstreamId }, downstreamId));
        };

        while (!request.signal.aborted && tester.slotReserved) {
          try {
            const history = await listSandboxEvents(tester.sandboxId, tester.upstreamCursor);
            for (const event of history.data ?? []) {
              consume({ event: event.type, id: event.id, data: JSON.stringify(event) });
            }

            if (!tester.slotReserved) break;
            if (!TERMINAL.has(tester.status)) {
              const streamStartCursor = tester.upstreamCursor;
              const upstream = await streamSandboxEvents(tester.sandboxId, tester.upstreamCursor, request.signal);
              if (!upstream.body) throw new Error("Sparkles returned an empty event stream");
              for await (const raw of parseSseStream(upstream.body)) {
                consume(raw);
                if (!tester.slotReserved || TERMINAL.has(tester.status)) break;
              }
              const missed = await listSandboxEvents(tester.sandboxId, streamStartCursor);
              for (const event of missed.data ?? []) {
                consume({ event: event.type, id: event.id, data: JSON.stringify(event) });
              }
            }
            warned = false;
          } catch {
            if (!request.signal.aborted && !warned) {
              warned = true;
              controller.enqueue(frame("stream.warning", {
                testerId: tester.id,
                label: "Live connection interrupted; replaying durable events",
              }));
            }
          }

          if (request.signal.aborted || !tester.slotReserved) break;
          if ((tester.status === "completed" || tester.status === "partial" || tester.status === "failed") && tester.sandboxId) {
            try {
              await terminateSandbox(tester.sandboxId);
            } catch {
              // Status reconciliation below decides when the sandbox slot is safe to release.
            }
          }

          try {
            const snapshot = await getSandbox(tester.sandboxId);
            const status = mapSandboxStatus(snapshot.status ?? snapshot.sandbox?.status);
            if (status) registry.updateStatus(run, tester, status, true);
          } catch {
            // The next history replay resumes from tester.upstreamCursor.
          }

          if (!request.signal.aborted && tester.slotReserved) {
            await new Promise((resolve) => setTimeout(resolve, 1_000));
          }
        }
      };

      void Promise.all(run.testers.map(pump)).finally(async () => {
        try {
          await persistAndUnlockIfSettled(run);
        } catch {
          // A durable write failure keeps the lock conservative.
        }
        if (!request.signal.aborted) {
          controller.enqueue(frame("run.snapshot", publicRun(run)));
          controller.close();
        }
      });
    },
    cancel() {
      // The request signal closes all upstream fetches.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
