/**
 * Client for the internal Speech-to-Text service.
 *
 * The service URL is configured via the STT_SERVICE_URL environment variable.
 * This module is only ever called from server-side code (API routes) so the
 * internal service endpoint is never exposed to the browser.
 */

/** Maximum audio file size accepted by this broker (100 MiB). */
export const STT_MAX_FILE_BYTES = 100 * 1024 * 1024;

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
];

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
  transcript: string;
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
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(audioData)]), filename);
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
