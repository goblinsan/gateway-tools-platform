import { NextRequest, NextResponse } from "next/server";
import { getCloudflareUser } from "@/lib/auth/cloudflare";

const PUBLIC_PATH_PREFIXES = [
  "/_next/static",
  "/_next/image",
  "/favicon.ico",
  "/unauthorized",
  "/api/health",
] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Paths that are publicly accessible without a Cloudflare Access identity.
 * All other routes require a valid `Cf-Access-Authenticated-User-Email` header.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|unauthorized|api/health).*)",
  ],
};

/**
 * Edge proxy that enforces Cloudflare Access authentication.
 *
 * Named `proxy` (not `middleware`) in accordance with the Next.js 16 file
 * convention: `src/proxy.ts` replaces the deprecated `src/middleware.ts`.
 * The `config.matcher` export is unchanged.
 * See: https://nextjs.org/docs/messages/middleware-to-proxy
 *
 * When the upstream reverse proxy has authenticated the request it injects the
 * `Cf-Access-Authenticated-User-Email` header.  If that header is absent (e.g.
 * the request bypassed Cloudflare Access in a misconfigured environment) the
 * user is redirected to `/unauthorized`.
 *
 * Authenticated requests have two forwarded headers added so that server
 * components and API routes can read the current identity without re-parsing
 * the CF header:
 *   - `x-user-email`  – the authenticated email
 *   - `x-user-id`     – the stable, derived user ID
 */
export async function proxy(req: NextRequest): Promise<NextResponse> {
  if (isPublicPath(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const user = await getCloudflareUser(req.headers);

  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/unauthorized";
    return NextResponse.redirect(url);
  }

  // Propagate the derived identity so downstream code can read it from
  // request headers without accessing raw Cloudflare headers directly.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-user-email", user.email);
  requestHeaders.set("x-user-id", user.id);

  return NextResponse.next({ request: { headers: requestHeaders } });
}
