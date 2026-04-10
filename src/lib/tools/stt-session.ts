import { getArtifact, saveArtifact, type ArtifactRecord } from "@/lib/storage/artifacts";
import { getSession, updateSession, type Session } from "@/lib/storage/sessions";
import { getTranscriptText, getTranscribeJobStatus, type SttResult } from "@/lib/services/stt";

export interface ResolvedSttSession {
  session: Session | null;
  artifact: ArtifactRecord | null;
  result: SttResult | null;
}

function buildTranscriptText(result: SttResult): string {
  if (result.segments?.length) {
    return result.segments
      .map((segment) => `[${segment.speaker ?? "UNKNOWN"}] ${segment.text}`)
      .join("\n");
  }
  return getTranscriptText(result);
}

function sessionResultFromMetadata(session: Session): SttResult | null {
  const transcript = typeof session.metadata.transcript === "string" ? session.metadata.transcript : undefined;
  const text = typeof session.metadata.text === "string" ? session.metadata.text : transcript;
  const segments = Array.isArray(session.metadata.segments) ? session.metadata.segments as SttResult["segments"] : undefined;
  if (!transcript && !text && !segments) {
    return null;
  }
  return { transcript, text, segments };
}

async function loadArtifactForSession(userId: string, session: Session): Promise<ArtifactRecord | null> {
  const artifactId = typeof session.metadata.artifactId === "string" ? session.metadata.artifactId : undefined;
  if (!artifactId) {
    return null;
  }
  const artifact = await getArtifact(userId, artifactId);
  return artifact?.record ?? null;
}

export async function resolveSttSession(userId: string, sessionId: string): Promise<ResolvedSttSession> {
  const session = await getSession(userId, sessionId);
  if (!session) {
    return { session: null, artifact: null, result: null };
  }

  if (session.tool !== "speech-to-text") {
    return {
      session,
      artifact: await loadArtifactForSession(userId, session),
      result: sessionResultFromMetadata(session),
    };
  }

  const sttJobId = typeof session.metadata.sttJobId === "string" ? session.metadata.sttJobId : undefined;
  if (!sttJobId || (session.status !== "pending" && session.status !== "running")) {
    return {
      session,
      artifact: await loadArtifactForSession(userId, session),
      result: sessionResultFromMetadata(session),
    };
  }

  const job = await getTranscribeJobStatus(sttJobId);
  if (job.status === "queued" || job.status === "running") {
    const normalizedStatus = job.status === "queued" ? "pending" : "running";
    const updated = session.status !== normalizedStatus
      ? await updateSession(userId, sessionId, {
          status: normalizedStatus,
          metadata: {
            ...session.metadata,
            sttJobId,
            sttJobStatus: job.status,
          },
        })
      : session;
    return {
      session: updated ?? session,
      artifact: await loadArtifactForSession(userId, updated ?? session),
      result: sessionResultFromMetadata(updated ?? session),
    };
  }

  if (job.status === "failed") {
    const updated = await updateSession(userId, sessionId, {
      status: "failed",
      metadata: {
        ...session.metadata,
        sttJobId,
        sttJobStatus: "failed",
        error: job.error || "Transcription failed",
      },
    });
    return {
      session: updated ?? session,
      artifact: null,
      result: null,
    };
  }

  const result = job.result ?? {};
  const transcriptText = buildTranscriptText(result);
  const existingArtifact = await loadArtifactForSession(userId, session);
  let artifact = existingArtifact;
  if (!artifact) {
    artifact = await saveArtifact(
      userId,
      sessionId,
      "transcript.txt",
      "text/plain",
      Buffer.from(transcriptText, "utf8"),
    );
  }

  const updated = await updateSession(userId, sessionId, {
    status: "complete",
    metadata: {
      ...session.metadata,
      sttJobId,
      sttJobStatus: "complete",
      transcript: getTranscriptText(result),
      text: result.text ?? getTranscriptText(result),
      segments: result.segments,
      artifactId: artifact.id,
    },
  });
  return {
    session: updated ?? session,
    artifact,
    result,
  };
}
