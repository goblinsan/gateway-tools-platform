import { NextResponse } from "next/server";

/**
 * GET /api/health
 *
 * Lightweight liveness probe used by Docker / the gateway health-check.
 * Returns HTTP 200 with a JSON body so automated monitors can confirm the
 * process is running without requiring an authenticated session.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: "ok" });
}
