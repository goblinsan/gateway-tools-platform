import { headers } from "next/headers";
import { CvForm } from "@/components/tools/CvForm";
import { SessionList } from "@/components/sessions/SessionList";
import { listSessions } from "@/lib/storage/sessions";

export default async function CvPage() {
  const h = await headers();
  const userId = h.get("x-user-id") ?? "";
  const sessions = userId
    ? (await listSessions(userId)).filter((s) => s.tool === "computer-vision")
    : [];

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Computer Vision / SAM
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Upload an image to segment objects, analyse scene content, or extract
          the dominant colour palette.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <CvForm />
      </div>

      {sessions.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Your CV sessions
          </h2>
          <div className="mt-4">
            <SessionList sessions={[...sessions].reverse()} />
          </div>
        </div>
      )}
    </section>
  );
}
