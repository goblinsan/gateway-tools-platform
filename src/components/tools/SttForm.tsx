"use client";

import { useEffect, useRef, useState } from "react";
import { STT_LANGUAGE_OPTIONS } from "@/lib/services/stt";

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

interface SpeakerSummary {
  id: string;
  segmentCount: number;
  totalDuration: number;
}

interface SubmitState {
  status: "idle" | "uploading" | "queued" | "transcribing" | "success" | "error";
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
  session?: { id?: string };
  job?: { id?: string; status?: string };
  error?: string;
}

interface SessionResponse {
  session?: {
    id?: string;
    status?: "pending" | "running" | "complete" | "failed";
    metadata?: {
      artifactId?: string;
      error?: string;
    };
  };
  artifact?: { id?: string };
  result?: SttResult;
  error?: string;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds % 1) * 10);
  return `${mins}:${secs.toString().padStart(2, "0")}.${tenths}`;
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function toExportStem(filename?: string): string {
  if (!filename) return "transcript";
  return filename.replace(/\.[^/.]+$/, "") || "transcript";
}

function speakerName(label: string, aliases: Record<string, string>): string {
  const alias = aliases[label]?.trim();
  return alias || label;
}

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function buildSpeakerSummaries(result?: SttResult): SpeakerSummary[] {
  if (!result?.segments?.length) {
    return [];
  }

  const summaries = new Map<string, SpeakerSummary>();
  for (const segment of result.segments) {
    if (!segment.speaker) continue;
    const existing = summaries.get(segment.speaker) ?? {
      id: segment.speaker,
      segmentCount: 0,
      totalDuration: 0,
    };
    existing.segmentCount += 1;
    existing.totalDuration += Math.max(0, segment.end - segment.start);
    summaries.set(segment.speaker, existing);
  }

  return Array.from(summaries.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function buildTranscriptText(result: SttResult, aliases: Record<string, string>): string {
  if (result.segments?.length) {
    return result.segments
      .map((segment) => {
        const parts = [`[${formatTime(segment.start)} - ${formatTime(segment.end)}]`];
        if (segment.speaker) {
          parts.push(`${speakerName(segment.speaker, aliases)}:`);
        }
        parts.push(segment.text);
        return parts.join(" ");
      })
      .join("\n");
  }

  return result.transcript?.trim() || result.text?.trim() || "";
}

function buildExportCsv(result: SttResult, aliases: Record<string, string>): string {
  const header = [
    "start_seconds",
    "end_seconds",
    "speaker_id",
    "speaker_name",
    "text",
  ];
  const rows = (result.segments ?? []).map((segment) => [
    segment.start.toFixed(3),
    segment.end.toFixed(3),
    segment.speaker ?? "",
    segment.speaker ? speakerName(segment.speaker, aliases) : "",
    segment.text,
  ]);
  return [header, ...rows]
    .map((row) => row.map((cell) => csvCell(cell)).join(","))
    .join("\n");
}

function buildExportJson(result: SttResult, aliases: Record<string, string>): string {
  return JSON.stringify(
    {
      ...result,
      speaker_aliases: aliases,
      export_segments: (result.segments ?? []).map((segment) => ({
        ...segment,
        speaker_name: segment.speaker ? speakerName(segment.speaker, aliases) : null,
      })),
      export_text: buildTranscriptText(result, aliases),
    },
    null,
    2,
  );
}

function SpeakerSummaryEditor({
  speakers,
  aliases,
  onAliasChange,
}: {
  speakers: SpeakerSummary[];
  aliases: Record<string, string>;
  onAliasChange: (speakerId: string, value: string) => void;
}) {
  if (!speakers.length) {
    return null;
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        Speakers
      </h3>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        Rename speakers below, then export the transcript.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="pb-2 pr-4 font-medium">Speaker</th>
              <th className="pb-2 pr-4 font-medium">Rename</th>
              <th className="pb-2 pr-4 font-medium">Segments</th>
              <th className="pb-2 font-medium">Duration</th>
            </tr>
          </thead>
          <tbody className="text-zinc-700 dark:text-zinc-300">
            {speakers.map((speaker) => (
              <tr key={speaker.id} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="py-2 pr-4 font-medium text-indigo-600 dark:text-indigo-400">
                  {speaker.id}
                </td>
                <td className="py-2 pr-4">
                  <input
                    type="text"
                    value={aliases[speaker.id] ?? ""}
                    onChange={(e) => onAliasChange(speaker.id, e.target.value)}
                    placeholder="e.g. Mom"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder-zinc-500"
                  />
                </td>
                <td className="py-2 pr-4">{speaker.segmentCount}</td>
                <td className="py-2">{formatTime(speaker.totalDuration)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Client component that renders the STT upload form, uploads large files
 * directly to object storage, submits a small transcription job to the broker
 * API route, and displays the transcript inline.
 */
export function SttForm({ onComplete }: { onComplete?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [diarize, setDiarize] = useState(false);
  const [language, setLanguage] = useState("en");
  const [state, setState] = useState<SubmitState>({ status: "idle" });
  const [speakerAliases, setSpeakerAliases] = useState<Record<string, string>>({});

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

      setState({ status: "queued" });
      const jobRes = await fetch("/api/tools/stt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          uploadKey: target.uploadKey,
          filename: target.filename,
          diarize,
          language: language || undefined,
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
        status: "queued",
        sessionId: jobJson.session?.id,
        error: typeof jobJson.error === "string" ? jobJson.error : undefined,
      });
    } catch {
      setState({ status: "error", error: "Network error – please try again" });
    }
  }

  useEffect(() => {
    if (!state.sessionId || (state.status !== "queued" && state.status !== "transcribing")) {
      return;
    }

    let cancelled = false;
    let timer: number | undefined;

    async function poll(): Promise<void> {
      try {
        const response = await fetch(`/api/sessions/${state.sessionId}`, {
          cache: "no-store",
        });
        const payload = await parseJsonSafely<SessionResponse>(response);
        if (!response.ok) {
          if (!cancelled) {
            setState({
              status: "error",
              sessionId: state.sessionId,
              error:
                typeof payload.error === "string"
                  ? payload.error
                  : "Unable to read transcription status",
            });
          }
          return;
        }

        const sessionStatus = payload.session?.status;
        if (sessionStatus === "complete") {
          if (!cancelled) {
            setState({
              status: "success",
              sessionId: state.sessionId,
              result: payload.result,
              artifactId:
                payload.artifact?.id ??
                (typeof payload.session?.metadata?.artifactId === "string"
                  ? payload.session.metadata.artifactId
                  : undefined),
            });
            onComplete?.();
          }
          return;
        }

        if (sessionStatus === "failed") {
          if (!cancelled) {
            setState({
              status: "error",
              sessionId: state.sessionId,
              error:
                typeof payload.session?.metadata?.error === "string"
                  ? payload.session.metadata.error
                  : "Transcription failed",
            });
          }
          return;
        }

        if (!cancelled) {
          setState((current) => ({
            ...current,
            status: "transcribing",
          }));
          timer = window.setTimeout(poll, 2500);
        }
      } catch {
        if (!cancelled) {
          setState({
            status: "error",
            sessionId: state.sessionId,
            error: "Unable to poll transcription status",
          });
        }
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [state.sessionId, state.status, onComplete]);

  function reset() {
    setState({ status: "idle" });
    setSpeakerAliases({});
    if (fileRef.current) fileRef.current.value = "";
  }

  useEffect(() => {
    const nextAliases: Record<string, string> = {};
    for (const speaker of buildSpeakerSummaries(state.result)) {
      nextAliases[speaker.id] = "";
    }
    setSpeakerAliases(nextAliases);
  }, [state.result]);

  const speakerSummaries = buildSpeakerSummaries(state.result);
  const transcriptText = state.result ? buildTranscriptText(state.result, speakerAliases) : "";
  const exportStem = toExportStem(fileRef.current?.files?.[0]?.name);

  function handleAliasChange(speakerId: string, value: string) {
    setSpeakerAliases((current) => ({ ...current, [speakerId]: value }));
  }

  function handleExportText() {
    if (!state.result) return;
    downloadTextFile(
      `${exportStem}-transcript.txt`,
      transcriptText,
      "text/plain;charset=utf-8",
    );
  }

  function handleExportCsv() {
    if (!state.result) return;
    downloadTextFile(
      `${exportStem}-segments.csv`,
      buildExportCsv(state.result, speakerAliases),
      "text/csv;charset=utf-8",
    );
  }

  function handleExportJson() {
    if (!state.result) return;
    downloadTextFile(
      `${exportStem}-transcript.json`,
      buildExportJson(state.result, speakerAliases),
      "application/json;charset=utf-8",
    );
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
              MP3, WAV, M4A, OGG, FLAC, WebM, AIFF — uploaded directly to object storage, then transcribed as an async job up to 500 MiB
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
              Language
            </label>
            <select
              id="stt-language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500"
            >
              {STT_LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Defaults to English. Change it when you know the source language.
            </p>
          </div>

          {state.status === "error" && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={state.status === "uploading" || state.status === "queued" || state.status === "transcribing"}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state.status === "uploading"
              ? "Uploading…"
              : state.status === "queued"
                ? "Queued…"
                : state.status === "transcribing"
                ? "Transcribing…"
                : "Transcribe"}
          </button>
        </form>
      )}

      {state.status === "success" && state.result && (
        <div className="space-y-4">
          {speakerSummaries.length > 0 && (
            <SpeakerSummaryEditor
              speakers={speakerSummaries}
              aliases={speakerAliases}
              onAliasChange={handleAliasChange}
            />
          )}

          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Transcript
            </h3>
            {state.result.segments?.length ? (
              <ul className="mt-3 space-y-2">
                {state.result.segments.map((seg, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium text-indigo-600 dark:text-indigo-400">
                      {seg.speaker ? speakerName(seg.speaker, speakerAliases) : "SPEAKER"}
                    </span>{" "}
                    <span className="text-zinc-700 dark:text-zinc-300">
                      {seg.text}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
                {transcriptText}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleExportText}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Download TXT
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Download CSV
            </button>
            <button
              type="button"
              onClick={handleExportJson}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Download JSON
            </button>
            {state.artifactId && (
              <a
                href={`/api/artifacts/${state.artifactId}`}
                download
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Download original
              </a>
            )}
            <button
              type="button"
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
