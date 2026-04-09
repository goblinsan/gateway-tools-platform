import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { listSessions } from "@/lib/storage/sessions";

/**
 * GET /api/sessions
 *
 * Returns all sessions for the authenticated user, sorted by createdAt
 * ascending. The proxy guarantees the `x-user-id` header is present for
 * every authenticated request.
 */
export async function GET(): Promise<NextResponse> {
  const h = await headers();
  const userId = h.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessions = await listSessions(userId);
  return NextResponse.json({ sessions });
}
