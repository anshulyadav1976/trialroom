import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { verifyArtifactGrant } from "@/lib/sparkles/artifacts";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  try {
    const body = await request.json() as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const grant = verifyArtifactGrant(clientPayload ?? "", runId);
        if (!pathname.startsWith(`runs/${runId}/${grant.testerId}/`)) throw new Error("Artifact path is outside this tester run");
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "application/json"],
          maximumSizeInBytes: 2_000_000,
          addRandomSuffix: true,
          validUntil: grant.exp,
          tokenPayload: JSON.stringify({ runId, testerId: grant.testerId }),
        };
      },
      onUploadCompleted: async () => {},
    });
    return Response.json(response);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Artifact upload failed" }, { status: 400 });
  }
}
