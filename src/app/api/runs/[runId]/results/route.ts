import { list } from "@vercel/blob";
import { collectRunResults, pendingRunResults } from "@/lib/results";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(runId)) return Response.json({ error: "Run not found" }, { status: 404 });
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) return Response.json(pendingRunResults(runId));

  try {
    const listed = await list({ prefix: `runs/${runId}/`, limit: 1_000 });
    const result = await collectRunResults(
      runId,
      listed.blobs,
      async ({ url }) => {
        const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
        if (!response.ok) throw new Error("Result artifact unavailable");
        return response.text();
      },
      listed.hasMore,
    );
    return Response.json(result);
  } catch {
    return Response.json(pendingRunResults(runId, "storage-unavailable"));
  }
}
