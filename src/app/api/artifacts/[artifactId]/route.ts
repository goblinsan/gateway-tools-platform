import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getArtifact } from "@/lib/storage/artifacts";

/**
 * GET /api/artifacts/[artifactId]
 *
 * Streams the artifact file to the browser with the correct Content-Type and
 * Content-Disposition headers so browsers can both preview and download it.
 * Returns 404 if the artifact does not exist or belongs to a different user.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ artifactId: string }> },
): Promise<NextResponse> {
  const h = await headers();
  const userId = h.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { artifactId } = await params;
  const result = await getArtifact(userId, artifactId);
  if (!result) {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }

  const { record, data } = result;
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": record.mimeType,
      "Content-Disposition": `attachment; filename="${record.filename}"`,
      "Content-Length": String(record.sizeBytes),
      // Artifacts are private per-user outputs – do not cache in shared caches.
      "Cache-Control": "private, no-store",
    },
  });
}
