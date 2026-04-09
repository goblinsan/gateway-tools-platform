/**
 * Artifact persistence layer.
 *
 * Artifacts are files produced by tool runs (e.g. a transcription text file,
 * a processed image).  Each artifact is stored in the user's workspace
 * `outputs/` directory as two files:
 *
 *   {artifactId}{originalExtension}   – the raw file data
 *   {artifactId}.meta.json            – a small JSON record (ArtifactRecord)
 *
 * Keeping the metadata separate from the binary means the operator can list,
 * inspect, or clean up artifacts with standard filesystem tooling without
 * parsing binary blobs.
 *
 * Retention: call `purgeExpiredArtifacts` with a maximum age in milliseconds
 * to delete artifacts whose `createdAt` timestamp is older than the cutoff.
 */

import path from "path";
import fs from "fs/promises";
import { ensureUserWorkspace, userWorkspacePaths } from "./workspace";

/** Metadata record stored alongside each artifact file. */
export interface ArtifactRecord {
  /** Randomly generated UUID v4 used as the storage key. */
  id: string;
  /** Derived user ID of the artifact owner. */
  userId: string;
  /** Session that produced this artifact, if any. */
  sessionId?: string;
  /** Original filename as supplied by the tool (display only). */
  filename: string;
  /** MIME type of the artifact content. */
  mimeType: string;
  /** File size in bytes. */
  sizeBytes: number;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function metaFilePath(outputsDir: string, artifactId: string): string {
  return path.join(outputsDir, `${artifactId}.meta.json`);
}

function dataFilePath(
  outputsDir: string,
  artifactId: string,
  ext: string,
): string {
  return path.join(outputsDir, `${artifactId}${ext}`);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Writes `content` to the user's `outputs/` directory and persists an
 * `ArtifactRecord` alongside it.  Returns the persisted record.
 */
export async function saveArtifact(
  userId: string,
  sessionId: string | undefined,
  filename: string,
  mimeType: string,
  content: Buffer | Uint8Array,
): Promise<ArtifactRecord> {
  const workspace = await ensureUserWorkspace(userId);
  const id = crypto.randomUUID();
  const ext = path.extname(filename);

  const record: ArtifactRecord = {
    id,
    userId,
    sessionId,
    filename,
    mimeType,
    sizeBytes: content.length,
    createdAt: new Date().toISOString(),
  };

  await Promise.all([
    fs.writeFile(dataFilePath(workspace.outputs, id, ext), content),
    fs.writeFile(
      metaFilePath(workspace.outputs, id),
      JSON.stringify(record, null, 2),
      "utf8",
    ),
  ]);

  return record;
}

/**
 * Returns the `ArtifactRecord` and raw file data for `artifactId`, or `null`
 * if the artifact does not exist.
 */
export async function getArtifact(
  userId: string,
  artifactId: string,
): Promise<{ record: ArtifactRecord; data: Buffer } | null> {
  const { outputs } = userWorkspacePaths(userId);
  try {
    const raw = await fs.readFile(metaFilePath(outputs, artifactId), "utf8");
    const record = JSON.parse(raw) as ArtifactRecord;
    const ext = path.extname(record.filename);
    const data = await fs.readFile(dataFilePath(outputs, artifactId, ext));
    return { record, data };
  } catch {
    return null;
  }
}

/**
 * Returns all artifact records for `userId`, optionally filtered by
 * `sessionId`, sorted by `createdAt` ascending.
 * Returns an empty array when the outputs directory does not yet exist.
 */
export async function listArtifacts(
  userId: string,
  sessionId?: string,
): Promise<ArtifactRecord[]> {
  const { outputs } = userWorkspacePaths(userId);
  let files: string[];
  try {
    files = await fs.readdir(outputs);
  } catch {
    return [];
  }

  const records = await Promise.all(
    files
      .filter((f) => f.endsWith(".meta.json"))
      .map(async (f) => {
        try {
          const raw = await fs.readFile(path.join(outputs, f), "utf8");
          return JSON.parse(raw) as ArtifactRecord;
        } catch {
          return null;
        }
      }),
  );

  const all = (records.filter(Boolean) as ArtifactRecord[]).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );

  return sessionId ? all.filter((r) => r.sessionId === sessionId) : all;
}

/**
 * Deletes the artifact data and metadata files for `artifactId`.  Returns
 * `true` if both files were removed, `false` if the artifact did not exist.
 */
export async function deleteArtifact(
  userId: string,
  artifactId: string,
): Promise<boolean> {
  const { outputs } = userWorkspacePaths(userId);
  try {
    const raw = await fs.readFile(metaFilePath(outputs, artifactId), "utf8");
    const record = JSON.parse(raw) as ArtifactRecord;
    const ext = path.extname(record.filename);
    await Promise.all([
      fs.unlink(metaFilePath(outputs, artifactId)),
      fs
        .unlink(dataFilePath(outputs, artifactId, ext))
        .catch((err: NodeJS.ErrnoException) => {
          // Tolerate a missing data file (e.g. already cleaned up manually)
          // but re-throw any other error so the caller is informed.
          if (err.code !== "ENOENT") throw err;
        }),
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deletes all artifacts for `userId` whose `createdAt` timestamp is older
 * than `maxAgeMs` milliseconds.  Returns the number of artifacts deleted.
 *
 * Operators can call this on a schedule (e.g. a daily cron job) to enforce a
 * retention window.
 */
export async function purgeExpiredArtifacts(
  userId: string,
  maxAgeMs: number,
): Promise<number> {
  const artifacts = await listArtifacts(userId);
  const cutoff = Date.now() - maxAgeMs;
  let deleted = 0;
  for (const artifact of artifacts) {
    if (new Date(artifact.createdAt).getTime() < cutoff) {
      if (await deleteArtifact(userId, artifact.id)) {
        deleted++;
      }
    }
  }
  return deleted;
}
