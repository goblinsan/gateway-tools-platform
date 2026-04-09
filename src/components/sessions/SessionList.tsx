import Link from "next/link";
import type { Session } from "@/lib/storage/sessions";

const STATUS_STYLES: Record<
  Session["status"],
  { badge: string; label: string }
> = {
  pending: {
    badge:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    label: "Pending",
  },
  running: {
    badge:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    label: "Running",
  },
  complete: {
    badge:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    label: "Complete",
  },
  failed: {
    badge: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    label: "Failed",
  },
};

const TOOL_LABELS: Record<string, string> = {
  "speech-to-text": "Speech-to-Text",
  "computer-vision": "Computer Vision",
};

function toolPath(tool: string): string {
  if (tool === "speech-to-text") return "/tools/stt";
  if (tool === "computer-vision") return "/tools/cv";
  return "/history";
}

/**
 * Server component that renders a list of tool-run sessions.
 * Pass the `sessions` array fetched from the storage layer.
 */
export function SessionList({
  sessions,
  emptyMessage = "No sessions yet.",
}: {
  sessions: Session[];
  emptyMessage?: string;
}) {
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{emptyMessage}</p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {sessions.map((session) => {
        const { badge, label } = STATUS_STYLES[session.status];
        const toolLabel = TOOL_LABELS[session.tool] ?? session.tool;
        const artifactId =
          typeof session.metadata?.artifactId === "string"
            ? session.metadata.artifactId
            : undefined;
        const filename =
          typeof session.metadata?.filename === "string"
            ? session.metadata.filename
            : undefined;

        return (
          <li
            key={session.id}
            className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Link
                  href={toolPath(session.tool)}
                  className="truncate text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                >
                  {toolLabel}
                </Link>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge}`}
                >
                  {label}
                </span>
              </div>
              {filename && (
                <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {filename}
                </p>
              )}
              <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                {new Date(session.createdAt).toLocaleString()}
              </p>
            </div>

            {artifactId && session.status === "complete" && (
              <a
                href={`/api/artifacts/${artifactId}`}
                download
                className="shrink-0 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Download
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
