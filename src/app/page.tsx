import Link from "next/link";

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
        Welcome to Gateway Tools. Select a tool below to get started.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/tools/stt"
          className="group rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h2 className="text-base font-medium text-zinc-900 group-hover:text-indigo-600 dark:text-zinc-50 dark:group-hover:text-indigo-400">
            Speech-to-Text
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Transcribe audio files with optional speaker diarization. Supports
            MP3, WAV, M4A, OGG, FLAC, and WebM.
          </p>
        </Link>

        <Link
          href="/tools/cv"
          className="group rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h2 className="text-base font-medium text-zinc-900 group-hover:text-indigo-600 dark:text-zinc-50 dark:group-hover:text-indigo-400">
            Computer Vision / SAM
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Segment objects, analyse scene content, or extract colour palettes
            from images using SAM.
          </p>
        </Link>

        <Link
          href="/history"
          className="group rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
        >
          <h2 className="text-base font-medium text-zinc-900 group-hover:text-indigo-600 dark:text-zinc-50 dark:group-hover:text-indigo-400">
            History
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Browse and re-download all your past tool sessions. Your data is
            private and isolated from other users.
          </p>
        </Link>
      </div>
    </section>
  );
}
