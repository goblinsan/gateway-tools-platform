/**
 * Per-user workspace layout.
 *
 * Every authenticated user gets an isolated subtree under the data root.
 * The workspace key is the stable per-user ID derived from the Cloudflare
 * Access email (see `src/lib/auth/cloudflare.ts::deriveUserId`), so no
 * user-supplied names can influence the path.
 *
 * Default data root: `/data` (override with the `DATA_ROOT` env variable).
 * Operators should mount a durable volume at that path so that artifacts
 * and session metadata survive container restarts and blue/green swaps.
 *
 * Layout:
 *   {DATA_ROOT}/
 *   └── {userId}/
 *       ├── uploads/    – files uploaded by the user
 *       ├── outputs/    – generated artifacts produced by tools
 *       └── sessions/   – session metadata (one JSON file per session)
 */

import path from "path";
import fs from "fs/promises";

/** Returns the data root from the environment, falling back to `/data`. */
export function getDataRoot(): string {
  return process.env.DATA_ROOT ?? "/data";
}

/** Resolved paths for a single user's workspace. */
export interface UserWorkspace {
  /** Workspace root: `{DATA_ROOT}/{userId}` */
  root: string;
  /** Directory for files uploaded by the user. */
  uploads: string;
  /** Directory for generated artifacts (tool outputs). */
  outputs: string;
  /** Directory for session metadata JSON files. */
  sessions: string;
}

/**
 * Returns the expected paths for a user's workspace without performing any
 * I/O.  Callers that need the directories to exist should use
 * `ensureUserWorkspace` instead.
 */
export function userWorkspacePaths(userId: string): UserWorkspace {
  const root = path.join(getDataRoot(), userId);
  return {
    root,
    uploads: path.join(root, "uploads"),
    outputs: path.join(root, "outputs"),
    sessions: path.join(root, "sessions"),
  };
}

/**
 * Ensures all workspace directories exist for the given user, creating them
 * recursively if necessary, and returns the resolved paths.
 *
 * Safe to call concurrently or repeatedly – `mkdir` with `recursive: true`
 * is idempotent.
 */
export async function ensureUserWorkspace(
  userId: string,
): Promise<UserWorkspace> {
  const workspace = userWorkspacePaths(userId);
  await Promise.all([
    fs.mkdir(workspace.uploads, { recursive: true }),
    fs.mkdir(workspace.outputs, { recursive: true }),
    fs.mkdir(workspace.sessions, { recursive: true }),
  ]);
  return workspace;
}
