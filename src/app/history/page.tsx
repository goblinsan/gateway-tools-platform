import { headers } from "next/headers";
import { SessionList } from "@/components/sessions/SessionList";
import { listSessions } from "@/lib/storage/sessions";

export default async function HistoryPage() {
  const h = await headers();
  const userId = h.get("x-user-id") ?? "";
  const sessions = userId ? await listSessions(userId) : [];

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          History
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          All of your past tool sessions — only visible to you.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <SessionList
          sessions={[...sessions].reverse()}
          emptyMessage="No sessions yet. Try the Speech-to-Text or Computer Vision tools."
        />
      </div>
    </section>
  );
}
