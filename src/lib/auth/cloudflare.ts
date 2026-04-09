/**
 * Cloudflare Access identity helpers.
 *
 * The upstream reverse-proxy (Cloudflare Access) injects the authenticated
 * user's email via the `Cf-Access-Authenticated-User-Email` request header.
 * We trust that header unconditionally – Cloudflare strips any client-supplied
 * version before it reaches the origin – and derive a stable, opaque user ID
 * from it so the rest of the app never needs to parse raw emails.
 */

export interface CloudflareUser {
  /** The authenticated user's email as supplied by Cloudflare Access. */
  email: string;
  /**
   * Stable per-user ID derived from the lower-cased email via SHA-256.
   * Always a 32-character lowercase hex string (first 16 bytes of the digest).
   */
  id: string;
}

/** Cloudflare Access injects the authenticated user email in this header. */
export const CF_EMAIL_HEADER = "cf-access-authenticated-user-email";

/**
 * Derives a stable, opaque user ID from a Cloudflare-authenticated email.
 * Uses the first 16 bytes (32 hex chars) of the SHA-256 digest of the
 * lower-cased, trimmed email.
 */
export async function deriveUserId(email: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(email.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/**
 * Parses Cloudflare Access identity headers from an incoming request.
 *
 * Returns a `CloudflareUser` when the expected header is present and non-empty,
 * or `null` when the request has not been authenticated by Cloudflare Access.
 */
export async function getCloudflareUser(
  headers: Headers,
): Promise<CloudflareUser | null> {
  const email = headers.get(CF_EMAIL_HEADER);
  if (!email || !email.trim()) {
    return null;
  }
  const id = await deriveUserId(email);
  return { email: email.trim(), id };
}
