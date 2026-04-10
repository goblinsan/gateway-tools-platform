import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { STT_MAX_FILE_BYTES, SttServiceError, normalizeAudioUpload } from "@/lib/services/stt";
import { createPresignedSttUpload, isObjectStoreConfigured } from "@/lib/storage/object-store";

interface UploadRequestBody {
  filename?: string;
  contentType?: string;
  size?: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const h = await headers();
  const userId = h.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isObjectStoreConfigured()) {
    return NextResponse.json(
      { error: "Object storage is not configured for STT uploads" },
      { status: 503 },
    );
  }

  let body: UploadRequestBody;
  try {
    body = (await req.json()) as UploadRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.filename || typeof body.filename !== "string") {
    return NextResponse.json({ error: "Missing filename" }, { status: 400 });
  }
  if (typeof body.size !== "number" || Number.isNaN(body.size) || body.size <= 0) {
    return NextResponse.json({ error: "Missing file size" }, { status: 400 });
  }
  if (body.size > STT_MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `Audio file exceeds the ${STT_MAX_FILE_BYTES / (1024 * 1024)} MiB limit` },
      { status: 413 },
    );
  }

  try {
    const normalized = normalizeAudioUpload(body.filename, body.contentType);
    const target = await createPresignedSttUpload(
      userId,
      normalized.filename,
      normalized.contentType,
    );
    return NextResponse.json(target);
  } catch (err) {
    if (err instanceof SttServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unable to create upload URL" },
      { status: 500 },
    );
  }
}
