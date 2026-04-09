/**
 * Dashboard – the authenticated home page.
 *
 * This page is always rendered with a valid Cloudflare Access identity because
 * the edge middleware redirects unauthenticated requests to `/unauthorized`
 * before they reach any route handler or page component.
 */
export default function DashboardPage() {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Dashboard
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Welcome to Gateway Tools. Select a tool from the navigation to get
        started.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Tool cards will be added here as new tools are implemented */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-medium text-zinc-900 dark:text-zinc-50">
            More tools coming soon
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Speech-to-text and computer vision tools are under active
            development.
          </p>
        </div>
      </div>
    </section>
  );
}
