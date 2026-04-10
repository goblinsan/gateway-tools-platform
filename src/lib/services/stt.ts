/**
 * Client for the internal Speech-to-Text service.
 *
 * The service URL is configured via the STT_SERVICE_URL environment variable.
 * This module is only ever called from server-side code (API routes) so the
 * internal service endpoint is never exposed to the browser.
 */

/** Maximum audio file size accepted by this broker (500 MiB). */
export const STT_MAX_FILE_BYTES = 500 * 1024 * 1024;

/** Supported audio MIME types. */
export const STT_ALLOWED_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/aiff",
  "audio/x-aiff",
  "audio/aif",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/ogg",
  "audio/webm",
  "audio/flac",
  "audio/x-flac",
] as const;

const MIME_BY_EXTENSION: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".m4a": "audio/m4a",
  ".mp4": "audio/mp4",
  ".webm": "audio/webm",
  ".aif": "audio/aiff",
  ".aiff": "audio/aiff",
};

/** Options for a transcription request. */
export interface SttOptions {
  /** Enable speaker diarization. Defaults to false. */
  diarize?: boolean;
  /** BCP-47 language hint (e.g. "en-US"). Optional – service auto-detects when omitted. */
  language?: string;
}

/** A single diarized segment returned by the STT service. */
export interface SttSegment {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

/** Result returned by the STT service. */
export interface SttResult {
  text?: string;
  transcript?: string;
  segments?: SttSegment[];
}

/** Thrown when the STT service returns a non-OK response. */
export class SttServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SttServiceError";
  }
}

/** Returns the configured STT service base URL (trailing slash stripped). */
export function getSttServiceUrl(): string {
  const url = process.env.STT_SERVICE_URL;
  if (!url) {
    throw new Error("STT_SERVICE_URL environment variable is not set");
  }
  return url.replace(/\/$/, "");
}

function extensionFor(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx).toLowerCase() : "";
}

function sanitizeFilename(filename: string): string {
  const trimmed = filename.trim();
  const collapsed = trimmed.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-");
  return collapsed.replace(/^[-.]+|[-.]+$/g, "") || "audio";
}

export function normalizeAudioUpload(
  filename: string,
  contentType?: string | null,
): { filename: string; contentType: string } {
  const safeFilename = sanitizeFilename(filename);
  const ext = extensionFor(safeFilename);
  const normalizedType = contentType?.trim().toLowerCase() ?? "";
  const inferredType = MIME_BY_EXTENSION[ext] ?? "";
  const resolvedType = normalizedType || inferredType;

  if (!ext || !inferredType) {
    throw new SttServiceError(415, "Unsupported audio format");
  }
  if (!resolvedType || !STT_ALLOWED_MIME_TYPES.includes(resolvedType as (typeof STT_ALLOWED_MIME_TYPES)[number])) {
    throw new SttServiceError(415, "Unsupported audio format");
  }

  return {
    filename: safeFilename,
    contentType: resolvedType,
  };
}

export function getTranscriptText(result: SttResult): string {
  if (result.transcript?.trim()) {
    return result.transcript.trim();
  }
  if (result.text?.trim()) {
    return result.text.trim();
  }
  if (result.segments?.length) {
    return result.segments.map((segment) => segment.text).join(" ").trim();
  }
  return "";
}

/**
 * Sends `audioData` to the internal STT service and returns the transcription
 * result. Only call this from server-side code.
 */
export async function transcribe(
  audioData: Buffer | Uint8Array,
  filename: string,
  options: SttOptions = {},
): Promise<SttResult> {
  const baseUrl = getSttServiceUrl();
  const { filename: safeFilename, contentType } = normalizeAudioUpload(filename, null);
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(audioData)], { type: contentType }),
    safeFilename,
  );
  if (options.diarize) {
    form.append("diarize", "true");
  }
  if (options.language) {
    form.append("language", options.language);
  }

  const res = await fetch(`${baseUrl}/api/transcribe`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new SttServiceError(
      res.status,
      text || `STT service returned ${res.status}`,
    );
  }

  return res.json() as Promise<SttResult>;
}

export async function transcribeFromSourceUrl(
  sourceUrl: string,
  filename: string,
  options: SttOptions = {},
): Promise<SttResult> {
  const baseUrl = getSttServiceUrl();
  const { filename: safeFilename } = normalizeAudioUpload(filename, null);

  const res = await fetch(`${baseUrl}/api/transcribe-from-url`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source_url: sourceUrl,
      filename: safeFilename,
      diarize: options.diarize ?? false,
      language: options.language,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new SttServiceError(
      res.status,
      text || `STT service returned ${res.status}`,
    );
  }

  return res.json() as Promise<SttResult>;
}
