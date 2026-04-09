/**
 * Session persistence layer.
 *
 * Sessions track individual tool runs for an authenticated user.  Each
 * session is stored as a single JSON file inside the user's workspace
 * `sessions/` directory so the operator can inspect, back up, or delete
 * sessions directly on the filesystem.
 *
 * File naming: `{sessionId}.json`
 *
 * Retention: call `purgeExpiredSessions` with a maximum age in milliseconds
 * to remove sessions whose `updatedAt` timestamp is older than the cutoff.
 */

import path from "path";
import fs from "fs/promises";
import { ensureUserWorkspace, userWorkspacePaths } from "./workspace";

/** Possible lifecycle states for a tool-run session. */
export type SessionStatus = "pending" | "running" | "complete" | "failed";

/** Persisted representation of a single tool-run session. */
export interface Session {
  /** Randomly generated UUID v4. */
  id: string;
  /** Derived user ID of the session owner (never user-supplied). */
  userId: string;
  /** Identifier of the tool that was invoked. */
  tool: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** ISO 8601 timestamp of the last status or metadata update. */
  updatedAt: string;
  /** Current lifecycle status. */
  status: SessionStatus;
  /** Arbitrary tool-specific metadata (input parameters, result summary, …). */
  metadata: Record<string, unknown>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sessionFilePath(sessionsDir: string, sessionId: string): string {
  return path.join(sessionsDir, `${sessionId}.json`);
}

async function readSessionFile(filePath: string): Promise<Session | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Creates a new session for `userId`, persists it to disk, and returns the
 * newly created record.
 */
export async function createSession(
  userId: string,
  tool: string,
  metadata: Record<string, unknown> = {},
): Promise<Session> {
  const workspace = await ensureUserWorkspace(userId);
  const now = new Date().toISOString();
  const session: Session = {
    id: crypto.randomUUID(),
    userId,
    tool,
    createdAt: now,
    updatedAt: now,
    status: "pending",
    metadata,
  };
  await fs.writeFile(
    sessionFilePath(workspace.sessions, session.id),
    JSON.stringify(session, null, 2),
    "utf8",
  );
  return session;
}

/**
 * Returns the session with `sessionId` owned by `userId`, or `null` if it
 * does not exist.
 */
export async function getSession(
  userId: string,
  sessionId: string,
): Promise<Session | null> {
  const { sessions } = userWorkspacePaths(userId);
  return readSessionFile(sessionFilePath(sessions, sessionId));
}

/**
 * Applies a partial update to an existing session and writes the result back
 * to disk.  Returns the updated session, or `null` if it does not exist.
 */
export async function updateSession(
  userId: string,
  sessionId: string,
  patch: Partial<Pick<Session, "status" | "metadata">>,
): Promise<Session | null> {
  const existing = await getSession(userId, sessionId);
  if (!existing) return null;

  const updated: Session = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  const { sessions } = userWorkspacePaths(userId);
  await fs.writeFile(
    sessionFilePath(sessions, sessionId),
    JSON.stringify(updated, null, 2),
    "utf8",
  );
  return updated;
}

/**
 * Returns all sessions for `userId`, sorted by `createdAt` ascending.
 * Returns an empty array when the sessions directory does not yet exist.
 */
export async function listSessions(userId: string): Promise<Session[]> {
  const { sessions: dir } = userWorkspacePaths(userId);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }

  const records = await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .map((f) => readSessionFile(path.join(dir, f))),
  );

  return (records.filter(Boolean) as Session[]).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
}

/**
 * Deletes the session file for `sessionId`.  Returns `true` if the file was
 * removed, or `false` if it did not exist.
 */
export async function deleteSession(
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const { sessions } = userWorkspacePaths(userId);
  try {
    await fs.unlink(sessionFilePath(sessions, sessionId));
    return true;
  } catch {
    return false;
  }
}

/**
 * Deletes all sessions for `userId` whose `updatedAt` timestamp is older than
 * `maxAgeMs` milliseconds.  Returns the number of sessions deleted.
 *
 * Operators can call this on a schedule (e.g. a daily cron job) to enforce a
 * retention window.
 */
export async function purgeExpiredSessions(
  userId: string,
  maxAgeMs: number,
): Promise<number> {
  const sessions = await listSessions(userId);
  const cutoff = Date.now() - maxAgeMs;
  let deleted = 0;
  for (const session of sessions) {
    if (new Date(session.updatedAt).getTime() < cutoff) {
      if (await deleteSession(userId, session.id)) {
        deleted++;
      }
    }
  }
  return deleted;
}
