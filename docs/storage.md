# Storage: Retention and Privacy Boundaries

This document describes how per-user artifacts and session metadata are stored,
how long they are kept, and how operators can manage cleanup.

---

## Workspace layout

Every authenticated user gets an isolated subdirectory under the **data root**
(configurable via `DATA_ROOT`, default `/data`):

```
{DATA_ROOT}/
└── {userId}/
    ├── uploads/    – files uploaded by the user
    ├── outputs/    – generated artifacts produced by tool runs
    └── sessions/   – session metadata (one JSON file per session)
```

The directory name is the **stable per-user ID** – the first 32 hex characters
of the SHA-256 digest of the user's lower-cased, trimmed email address (see
`src/lib/auth/cloudflare.ts::deriveUserId`).  This means:

- No user-supplied names can influence the storage path.
- The same user always maps to the same directory, regardless of which
  container slot (blue/green) is active.
- No cross-user path traversal is possible because the key is a fixed-length
  hex string derived by the application, never by the user.

---

## What is stored

| Location | Content | Format |
|----------|---------|--------|
| `sessions/{sessionId}.json` | Tool-run lifecycle (status, timestamps, metadata) | JSON |
| `outputs/{artifactId}{ext}` | Raw artifact file (e.g. `.txt`, `.png`) | Binary / text |
| `outputs/{artifactId}.meta.json` | Artifact metadata (filename, MIME type, size, timestamps) | JSON |
| `uploads/` | User-uploaded input files | Binary / text |

Session metadata includes: session ID, user ID, tool name, creation and last-update
timestamps, status (`pending` / `running` / `complete` / `failed`), and a
free-form `metadata` object used by each tool to store input parameters and
result summaries.

No authentication credentials, passwords, or Cloudflare Access tokens are ever
written to disk.  The email address is **not** stored on the filesystem; only
the derived, opaque user ID is used as the directory name.

---

## Retention policy

There is no automatic expiry built into the platform itself.  Operators are
responsible for configuring a retention schedule that fits their privacy and
compliance requirements.

Two helper functions are provided in the storage layer for programmatic
cleanup:

| Function | Location | Description |
|----------|----------|-------------|
| `purgeExpiredSessions(userId, maxAgeMs)` | `src/lib/storage/sessions.ts` | Deletes sessions whose `updatedAt` is older than `maxAgeMs` milliseconds. |
| `purgeExpiredArtifacts(userId, maxAgeMs)` | `src/lib/storage/artifacts.ts` | Deletes artifacts whose `createdAt` is older than `maxAgeMs` milliseconds. |

Both functions return the count of deleted items and are safe to call
repeatedly (idempotent for already-deleted items).

### Suggested operator schedule

Run a cleanup job (cron, systemd timer, or Docker scheduled task) against the
data volume once per day.  A reasonable default retention window for most
use-cases is **30 days**.  Adjust to your organisation's data-retention policy.

Example Node.js snippet (run as a standalone script with access to the data
volume):

```ts
import { listSessions, purgeExpiredSessions } from "./src/lib/storage/sessions";
import { purgeExpiredArtifacts } from "./src/lib/storage/artifacts";
import fs from "fs/promises";

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DATA_ROOT = process.env.DATA_ROOT ?? "/data";

const userDirs = await fs.readdir(DATA_ROOT).catch(() => []);
for (const userId of userDirs) {
  const sessions = await purgeExpiredSessions(userId, MAX_AGE_MS);
  const artifacts = await purgeExpiredArtifacts(userId, MAX_AGE_MS);
  console.log(`${userId}: removed ${sessions} sessions, ${artifacts} artifacts`);
}
```

To remove **all** data for a user (e.g. on a right-to-erasure request), simply
delete the entire workspace directory:

```bash
rm -rf "${DATA_ROOT}/${USER_ID}"
```

---

## Durable volume mount

The data root must be mounted as a durable volume so that files survive
container restarts and blue/green slot swaps.

`docker-compose.yml` mounts the host directory `./data` at `/data` inside the
container.  The operator should ensure this host path is on persistent storage
(not a tmpfs or ephemeral container layer).

```yaml
volumes:
  - ./data:/data
```

Set `DATA_ROOT` in `.env.local` if you need to change the mount point:

```
DATA_ROOT=/mnt/my-volume/gateway-data
```

---

## Privacy boundaries

| What | Who can access it |
|------|-------------------|
| Workspace files | Only the authenticated user whose ID matches the directory name, via the application layer. No cross-user access is possible through the API. |
| Session JSON files | Readable by the operator via filesystem access on the host. |
| Artifact files | Readable by the operator via filesystem access on the host. |
| Email address | **Never written to disk.** Only the opaque derived ID is used as the directory name. |

Operators with shell access to the host can read any user's data directly from
the filesystem.  Access to the host should be restricted to authorised
personnel only, in line with your organisation's security policy.

---

## Summary

| Property | Value |
|----------|-------|
| Storage backend | Filesystem (local volume) |
| Per-user isolation | Separate directory per user, keyed by derived ID |
| Session retention | Operator-managed; `purgeExpiredSessions` helper provided |
| Artifact retention | Operator-managed; `purgeExpiredArtifacts` helper provided |
| Email on disk | No – only the opaque SHA-256-derived user ID |
| Durable volume | Mount host path at `DATA_ROOT` (default `/data`) |
