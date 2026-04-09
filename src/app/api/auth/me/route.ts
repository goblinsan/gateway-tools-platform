import { NextResponse } from "next/server";
import { headers } from "next/headers";

/**
 * GET /api/auth/me
 *
 * Returns the currently authenticated user derived from the Cloudflare Access
 * headers forwarded by the middleware.  The middleware guarantees that
 * `x-user-email` and `x-user-id` are present for all authenticated requests,
 * so a missing header here indicates a misconfiguration rather than a normal
 * unauthenticated request.
 */
export async function GET(): Promise<NextResponse> {
  const h = await headers();
  const email = h.get("x-user-email");
  const id = h.get("x-user-id");

  if (!email || !id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ email, id });
}
