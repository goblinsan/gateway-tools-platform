/**
 * Unauthorized page.
 *
 * Shown when a request reaches the origin without a valid Cloudflare Access
 * identity header (e.g. direct access that bypassed the proxy, or an expired
 * session).  Sign-in/out is fully managed by Cloudflare Access – there is no
 * local credential flow in this application.
 */
export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30"
          aria-hidden="true"
        >
          <svg
            className="h-6 w-6 text-red-600 dark:text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>

        <h1 className="mt-4 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Access denied
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          This application requires authentication via Cloudflare Access. You
          must be granted access before you can sign in.
        </p>
        <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-600">
          If you believe this is an error, contact your administrator.
        </p>
      </div>
    </div>
  );
}
