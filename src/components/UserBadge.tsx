import { headers } from "next/headers";

/**
 * Server component that displays the currently authenticated user's identity.
 * Reads the `x-user-email` and `x-user-id` headers forwarded by the middleware.
 * Renders nothing when no identity is available (e.g. the `/unauthorized` page).
 */
export async function UserBadge() {
  const h = await headers();
  const email = h.get("x-user-email");
  const id = h.get("x-user-id");

  if (!email) {
    return null;
  }

  const initial = email.charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-2" title={`User ID: ${id ?? ""}`}>
      <span
        aria-hidden="true"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white"
      >
        {initial}
      </span>
      <span className="hidden text-sm text-zinc-700 dark:text-zinc-300 sm:inline">
        {email}
      </span>
    </div>
  );
}
