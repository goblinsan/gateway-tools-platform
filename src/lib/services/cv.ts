/**
 * Client for the internal Computer Vision / SAM service.
 *
 * The service URL is configured via the CV_SERVICE_URL environment variable.
 * This module is only ever called from server-side code (API routes) so the
 * internal service endpoint is never exposed to the browser.
 */

/** Maximum image file size accepted by this broker (10 MiB). */
export const CV_MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Supported image MIME types. */
export const CV_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
  "image/bmp",
];

/** Supported CV operations. */
export type CvOperation = "segment" | "analyze" | "palette";

/** Result returned by the CV service. */
export interface CvResult {
  /** MIME type of the result (e.g. "image/png", "application/json"). */
  mimeType: string;
  /** Suggested filename for storage. */
  filename: string;
  /** Raw result bytes. */
  data: Buffer;
}

/** Thrown when the CV service returns a non-OK response. */
export class CvServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "CvServiceError";
  }
}

/** Returns the configured CV service base URL (trailing slash stripped). */
export function getCvServiceUrl(): string {
  const url = process.env.CV_SERVICE_URL;
  if (!url) {
    throw new Error("CV_SERVICE_URL environment variable is not set");
  }
  return url.replace(/\/$/, "");
}

/**
 * Sends `imageData` to the internal CV service for the requested operation
 * and returns the result. Only call this from server-side code.
 */
export async function processImage(
  imageData: Buffer | Uint8Array,
  filename: string,
  operation: CvOperation,
): Promise<CvResult> {
  const baseUrl = getCvServiceUrl();
  const form = new FormData();
  form.append("image", new Blob([imageData]), filename);

  const res = await fetch(`${baseUrl}/${operation}`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new CvServiceError(
      res.status,
      text || `CV service returned ${res.status}`,
    );
  }

  const contentType =
    res.headers.get("content-type") ?? "application/octet-stream";
  const data = Buffer.from(await res.arrayBuffer());

  // Derive a sensible output filename from the operation and content-type.
  const ext = contentType.includes("image/png")
    ? ".png"
    : contentType.includes("image/jpeg")
      ? ".jpg"
      : contentType.includes("application/json")
        ? ".json"
        : ".bin";
  const outputFilename = `${operation}-result${ext}`;

  return { mimeType: contentType.split(";")[0].trim(), filename: outputFilename, data };
}
