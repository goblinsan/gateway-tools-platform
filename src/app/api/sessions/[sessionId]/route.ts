import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { resolveSttSession } from "@/lib/tools/stt-session";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
): Promise<NextResponse> {
  const h = await headers();
  const userId = h.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await context.params;
  const resolved = await resolveSttSession(userId, sessionId);
  if (!resolved.session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({
    session: resolved.session,
    artifact: resolved.artifact,
    result: resolved.result,
  });
}
