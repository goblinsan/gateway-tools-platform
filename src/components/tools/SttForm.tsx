"use client";

import { useRef, useState } from "react";

interface SttSegment {
  speaker?: string;
  text: string;
  start: number;
  end: number;
}

interface SttResult {
  text?: string;
  transcript?: string;
  segments?: SttSegment[];
}

interface SubmitState {
  status: "idle" | "uploading" | "transcribing" | "success" | "error";
  result?: SttResult;
  artifactId?: string;
  sessionId?: string;
  error?: string;
}

interface UploadTarget {
  uploadKey: string;
  uploadUrl: string;
  headers: Record<string, string>;
  expiresInSeconds: number;
  filename: string;
  contentType: string;
}

interface JobResponse {
  result?: SttResult;
  artifact?: { id?: string };
  session?: { id?: string };
  error?: string;
}

/**
 * Client component that renders the STT upload form, uploads large files
 * directly to object storage, submits a small transcription job to the broker
 * API route, and displays the transcript inline.
 */
export function SttForm({ onComplete }: { onComplete?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [diarize, setDiarize] = useState(false);
  const [language, setLanguage] = useState("");
  const [state, setState] = useState<SubmitState>({ status: "idle" });

  async function parseJsonSafely<T>(res: Response): Promise<T> {
    try {
      return (await res.json()) as T;
    } catch {
      return {} as T;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setState({ status: "uploading" });

    try {
      const uploadInit = await fetch("/api/tools/stt/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });
      const uploadJson = await parseJsonSafely<Partial<UploadTarget> & { error?: string }>(uploadInit);
      if (!uploadInit.ok) {
        setState({
          status: "error",
          error:
            typeof uploadJson.error === "string"
              ? uploadJson.error
              : "Unable to initialize upload",
        });
        return;
      }
      if (
        !uploadJson.uploadKey ||
        !uploadJson.uploadUrl ||
        !uploadJson.filename ||
        !uploadJson.headers
      ) {
        setState({ status: "error", error: "Upload target response was incomplete" });
        return;
      }

      const target = uploadJson as UploadTarget;
      const uploadRes = await fetch(target.uploadUrl, {
        method: "PUT",
        headers: target.headers,
        body: file,
      });
      if (!uploadRes.ok) {
        setState({
          status: "error",
          error: `Upload failed with status ${uploadRes.status}`,
        });
        return;
      }

      setState({ status: "transcribing" });
      const jobRes = await fetch("/api/tools/stt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          uploadKey: target.uploadKey,
          filename: target.filename,
          diarize,
          language: language.trim() || undefined,
        }),
      });
      const jobJson = await parseJsonSafely<JobResponse>(jobRes);
      if (!jobRes.ok) {
        setState({
          status: "error",
          error:
            typeof jobJson.error === "string"
              ? jobJson.error
              : "Unknown error",
        });
        return;
      }

      setState({
        status: "success",
        result: jobJson.result,
        artifactId: jobJson.artifact?.id,
        sessionId: jobJson.session?.id,
      });
      onComplete?.();
    } catch {
      setState({ status: "error", error: "Network error – please try again" });
    }
  }

  function reset() {
    setState({ status: "idle" });
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-6">
      {state.status !== "success" && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="stt-audio"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Audio file
            </label>
            <input
              id="stt-audio"
              ref={fileRef}
              type="file"
              accept="audio/*"
              required
              className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 file:mr-3 file:rounded file:border-0 file:bg-indigo-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              MP3, WAV, M4A, OGG, FLAC, WebM, AIFF — uploaded directly to object storage, up to 500 MiB
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="stt-diarize"
              type="checkbox"
              checked={diarize}
              onChange={(e) => setDiarize(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600"
            />
            <label
              htmlFor="stt-diarize"
              className="text-sm text-zinc-700 dark:text-zinc-300"
            >
              Enable speaker diarization
            </label>
          </div>

          <div>
            <label
              htmlFor="stt-language"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Language hint <span className="font-normal text-zinc-400">(optional)</span>
            </label>
            <input
              id="stt-language"
              type="text"
              placeholder="e.g. en-US"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500"
            />
          </div>

          {state.status === "error" && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={state.status === "uploading" || state.status === "transcribing"}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state.status === "uploading"
              ? "Uploading…"
              : state.status === "transcribing"
                ? "Transcribing…"
                : "Transcribe"}
          </button>
        </form>
      )}

      {state.status === "success" && state.result && (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Transcript
            </h3>
            {state.result.segments ? (
              <ul className="mt-3 space-y-2">
                {state.result.segments.map((seg, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium text-indigo-600 dark:text-indigo-400">
                      {seg.speaker ?? "SPEAKER"}
                    </span>{" "}
                    <span className="text-zinc-700 dark:text-zinc-300">
                      {seg.text}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
                {state.result.transcript ?? state.result.text}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            {state.artifactId && (
              <a
                href={`/api/artifacts/${state.artifactId}`}
                download
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Download transcript
              </a>
            )}
            <button
              onClick={reset}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              New transcription
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
