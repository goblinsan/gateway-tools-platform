import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import {
  transcribe,
  transcribeFromSourceUrl,
  STT_MAX_FILE_BYTES,
  SttServiceError,
  getTranscriptText,
  normalizeAudioUpload,
} from "@/lib/services/stt";
import { createSession, updateSession } from "@/lib/storage/sessions";
import { saveArtifact } from "@/lib/storage/artifacts";
import {
  assertUploadedObjectExists,
  createPresignedSttDownloadUrl,
  isObjectStoreConfigured,
} from "@/lib/storage/object-store";

interface SttJobBody {
  uploadKey?: string;
  filename?: string;
  diarize?: boolean;
  language?: string;
}

async function requireUserId(): Promise<string | null> {
  const h = await headers();
  return h.get("x-user-id");
}

async function finishSuccessfulSession(
  userId: string,
  sessionId: string,
  filename: string,
  diarize: boolean,
  language: string | undefined,
  storageKey: string | undefined,
  result: Awaited<ReturnType<typeof transcribe>>,
) {
  const transcriptText = result.segments
    ? result.segments.map((s) => `[${s.speaker ?? "UNKNOWN"}] ${s.text}`).join("\n")
    : getTranscriptText(result);
  const artifact = await saveArtifact(
    userId,
    sessionId,
    "transcript.txt",
    "text/plain",
    Buffer.from(transcriptText, "utf8"),
  );

  const updatedSession = await updateSession(userId, sessionId, {
    status: "complete",
    metadata: {
      filename,
      diarize,
      language,
      storageKey,
      transcript: getTranscriptText(result),
      segments: result.segments,
      artifactId: artifact.id,
    },
  });

  return NextResponse.json({ session: updatedSession, artifact, result });
}

async function failSession(
  userId: string,
  sessionId: string,
  filename: string,
  diarize: boolean,
  language: string | undefined,
  storageKey: string | undefined,
  err: unknown,
) {
  const message =
    err instanceof SttServiceError ? err.message : "Upstream service error";
  await updateSession(userId, sessionId, {
    status: "failed",
    metadata: {
      filename,
      diarize,
      language,
      storageKey,
      error: message,
    },
  });
  const status = err instanceof SttServiceError ? err.status : 502;
  return NextResponse.json(
    { error: message, sessionId },
    { status },
  );
}

async function handleMultipart(userId: string, req: NextRequest): Promise<NextResponse> {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const audioFile = formData.get("audio") ?? formData.get("file");
  if (!(audioFile instanceof File)) {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }

  let normalized;
  try {
    normalized = normalizeAudioUpload(audioFile.name, audioFile.type);
  } catch (err) {
    const status = err instanceof SttServiceError ? err.status : 415;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unsupported audio format" },
      { status },
    );
  }

  if (audioFile.size > STT_MAX_FILE_BYTES) {
    return NextResponse.json(
      {
        error: `Audio file exceeds the ${STT_MAX_FILE_BYTES / (1024 * 1024)} MiB limit`,
      },
      { status: 413 },
    );
  }

  const diarize = formData.get("diarize") === "true";
  const languageRaw = formData.get("language");
  const language =
    typeof languageRaw === "string" && languageRaw.trim()
      ? languageRaw.trim()
      : undefined;

  const session = await createSession(userId, "speech-to-text", {
    filename: normalized.filename,
    diarize,
    language,
    source: "multipart",
  });

  try {
    await updateSession(userId, session.id, { status: "running" });
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const result = await transcribe(audioBuffer, normalized.filename, {
      diarize,
      language,
    });
    return finishSuccessfulSession(
      userId,
      session.id,
      normalized.filename,
      diarize,
      language,
      undefined,
      result,
    );
  } catch (err) {
    return failSession(
      userId,
      session.id,
      normalized.filename,
      diarize,
      language,
      undefined,
      err,
    );
  }
}

async function handleObjectStoreJob(userId: string, req: NextRequest): Promise<NextResponse> {
  if (!isObjectStoreConfigured()) {
    return NextResponse.json(
      { error: "Object storage is not configured for STT uploads" },
      { status: 503 },
    );
  }

  let body: SttJobBody;
  try {
    body = (await req.json()) as SttJobBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.uploadKey || typeof body.uploadKey !== "string") {
    return NextResponse.json({ error: "Missing upload key" }, { status: 400 });
  }
  if (!body.filename || typeof body.filename !== "string") {
    return NextResponse.json({ error: "Missing filename" }, { status: 400 });
  }

  let normalized;
  try {
    normalized = normalizeAudioUpload(body.filename, null);
    await assertUploadedObjectExists(userId, body.uploadKey);
  } catch (err) {
    const status = err instanceof SttServiceError ? err.status : 400;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid upload reference" },
      { status },
    );
  }

  const diarize = body.diarize === true;
  const language = typeof body.language === "string" && body.language.trim()
    ? body.language.trim()
    : undefined;

  const session = await createSession(userId, "speech-to-text", {
    filename: normalized.filename,
    diarize,
    language,
    source: "object-store",
    storageKey: body.uploadKey,
  });

  try {
    await updateSession(userId, session.id, { status: "running" });
    const sourceUrl = await createPresignedSttDownloadUrl(userId, body.uploadKey);
    const result = await transcribeFromSourceUrl(sourceUrl, normalized.filename, {
      diarize,
      language,
    });
    return finishSuccessfulSession(
      userId,
      session.id,
      normalized.filename,
      diarize,
      language,
      body.uploadKey,
      result,
    );
  } catch (err) {
    return failSession(
      userId,
      session.id,
      normalized.filename,
      diarize,
      language,
      body.uploadKey,
      err,
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = await requireUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    return handleMultipart(userId, req);
  }
  return handleObjectStoreJob(userId, req);
}
