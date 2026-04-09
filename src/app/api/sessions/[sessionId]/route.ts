import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSession } from "@/lib/storage/sessions";
import { listArtifacts } from "@/lib/storage/artifacts";

/**
 * GET /api/sessions/[sessionId]
 *
 * Returns the session and its associated artifacts for the authenticated user.
 * Returns 404 if the session does not exist or belongs to a different user.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<NextResponse> {
  const h = await headers();
  const userId = h.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const session = await getSession(userId, sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const artifacts = await listArtifacts(userId, sessionId);
  return NextResponse.json({ session, artifacts });
}
