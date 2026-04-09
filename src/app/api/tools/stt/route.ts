import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import {
  transcribe,
  STT_MAX_FILE_BYTES,
  STT_ALLOWED_MIME_TYPES,
  SttServiceError,
} from "@/lib/services/stt";
import { createSession, updateSession } from "@/lib/storage/sessions";
import { saveArtifact } from "@/lib/storage/artifacts";

/**
 * POST /api/tools/stt
 *
 * Accepts a multipart form upload containing an audio file and optional
 * transcription options. Validates the file, proxies it to the internal STT
 * service, stores the transcript as a per-user artifact, and records a session
 * entry so the user can browse their history.
 *
 * Expected form fields:
 *   audio    – required, audio file
 *   diarize  – optional, "true" to enable speaker diarization
 *   language – optional, BCP-47 language hint (e.g. "en-US")
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const h = await headers();
  const userId = h.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const audioFile = formData.get("audio");
  if (!(audioFile instanceof File)) {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }

  if (!STT_ALLOWED_MIME_TYPES.includes(audioFile.type)) {
    return NextResponse.json(
      { error: "Unsupported audio format" },
      { status: 415 },
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

  // Create a pending session before calling the upstream service so that
  // even a failed run is visible in the user's history.
  const session = await createSession(userId, "speech-to-text", {
    filename: audioFile.name,
    diarize,
    language,
  });

  try {
    await updateSession(userId, session.id, { status: "running" });

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const result = await transcribe(audioBuffer, audioFile.name, {
      diarize,
      language,
    });

    // Persist the transcript text as a downloadable artifact.
    const transcriptText = result.segments
      ? result.segments.map((s) => `[${s.speaker}] ${s.text}`).join("\n")
      : result.transcript;
    const artifact = await saveArtifact(
      userId,
      session.id,
      "transcript.txt",
      "text/plain",
      Buffer.from(transcriptText, "utf8"),
    );

    const updatedSession = await updateSession(userId, session.id, {
      status: "complete",
      metadata: {
        filename: audioFile.name,
        diarize,
        language,
        transcript: result.transcript,
        segments: result.segments,
        artifactId: artifact.id,
      },
    });

    return NextResponse.json({ session: updatedSession, artifact, result });
  } catch (err) {
    const message =
      err instanceof SttServiceError ? err.message : "Upstream service error";
    await updateSession(userId, session.id, {
      status: "failed",
      metadata: {
        filename: audioFile.name,
        diarize,
        language,
        error: message,
      },
    });
    const status = err instanceof SttServiceError ? err.status : 502;
    return NextResponse.json(
      { error: message, sessionId: session.id },
      { status },
    );
  }
}
