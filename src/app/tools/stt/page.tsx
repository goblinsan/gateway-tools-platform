import { headers } from "next/headers";
import { SttForm } from "@/components/tools/SttForm";
import { SessionList } from "@/components/sessions/SessionList";
import { listSessions } from "@/lib/storage/sessions";

/**
 * /tools/stt
 *
 * Speech-to-Text tool page. Renders the upload form (client component) and a
 * list of the user's prior STT sessions (server-rendered).
 */
export default async function SttPage() {
  const h = await headers();
  const userId = h.get("x-user-id") ?? "";
  const sessions = userId
    ? (await listSessions(userId)).filter((s) => s.tool === "speech-to-text")
    : [];

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Speech-to-Text
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Upload an audio file to transcribe it. Enable diarization to label
          each speaker separately.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <SttForm />
      </div>

      {sessions.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Your transcriptions
          </h2>
          <div className="mt-4">
            <SessionList
              sessions={[...sessions].reverse()}
              emptyMessage="No transcriptions yet."
            />
          </div>
        </div>
      )}
    </section>
  );
}
