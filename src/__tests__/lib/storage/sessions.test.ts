import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "os";
import path from "path";
import fs from "fs/promises";
import {
  createSession,
  getSession,
  updateSession,
  listSessions,
  deleteSession,
  purgeExpiredSessions,
} from "@/lib/storage/sessions";

const USER_A = "aaaabbbbccccddddaaaabbbbccccdddd";
const USER_B = "11112222333344441111222233334444";

describe("sessions", () => {
  let tmpDir: string;
  const original = process.env.DATA_ROOT;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sessions-test-"));
    process.env.DATA_ROOT = tmpDir;
  });

  afterEach(async () => {
    if (original === undefined) {
      delete process.env.DATA_ROOT;
    } else {
      process.env.DATA_ROOT = original;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── createSession ───────────────────────────────────────────────────────────

  describe("createSession", () => {
    it("creates a session with the expected fields", async () => {
      const session = await createSession(USER_A, "speech-to-text");
      expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(session.userId).toBe(USER_A);
      expect(session.tool).toBe("speech-to-text");
      expect(session.status).toBe("pending");
      expect(session.metadata).toEqual({});
      expect(session.createdAt).toBeTruthy();
      expect(session.updatedAt).toBe(session.createdAt);
    });

    it("persists the session as a JSON file on disk", async () => {
      const session = await createSession(USER_A, "speech-to-text");
      const filePath = path.join(
        tmpDir,
        USER_A,
        "sessions",
        `${session.id}.json`,
      );
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw);
      expect(parsed.id).toBe(session.id);
      expect(parsed.tool).toBe("speech-to-text");
    });

    it("accepts optional metadata", async () => {
      const session = await createSession(USER_A, "ocr", { lang: "en" });
      expect(session.metadata).toEqual({ lang: "en" });
    });

    it("generates unique IDs for each session", async () => {
      const s1 = await createSession(USER_A, "tool");
      const s2 = await createSession(USER_A, "tool");
      expect(s1.id).not.toBe(s2.id);
    });
  });

  // ── getSession ──────────────────────────────────────────────────────────────

  describe("getSession", () => {
    it("returns the session when it exists", async () => {
      const created = await createSession(USER_A, "tool");
      const fetched = await getSession(USER_A, created.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(created.id);
    });

    it("returns null for a non-existent session ID", async () => {
      const result = await getSession(USER_A, "00000000-0000-0000-0000-000000000000");
      expect(result).toBeNull();
    });

    it("returns null when user has no sessions directory", async () => {
      const result = await getSession("nonexistentuser00000000000000000", "any-id");
      expect(result).toBeNull();
    });
  });

  // ── updateSession ───────────────────────────────────────────────────────────

  describe("updateSession", () => {
    it("updates the status and bumps updatedAt", async () => {
      const created = await createSession(USER_A, "tool");
      // Small delay ensures updatedAt > createdAt
      await new Promise((r) => setTimeout(r, 5));
      const updated = await updateSession(USER_A, created.id, {
        status: "running",
      });
      expect(updated?.status).toBe("running");
      expect(updated?.updatedAt).not.toBe(created.updatedAt);
    });

    it("updates metadata while preserving other fields", async () => {
      const created = await createSession(USER_A, "tool", { key: "old" });
      const updated = await updateSession(USER_A, created.id, {
        metadata: { key: "new" },
      });
      expect(updated?.metadata).toEqual({ key: "new" });
      expect(updated?.tool).toBe("tool");
      expect(updated?.userId).toBe(USER_A);
    });

    it("persists the update to disk", async () => {
      const created = await createSession(USER_A, "tool");
      await updateSession(USER_A, created.id, { status: "complete" });
      const refetched = await getSession(USER_A, created.id);
      expect(refetched?.status).toBe("complete");
    });

    it("returns null for a non-existent session", async () => {
      const result = await updateSession(USER_A, "no-such-id", {
        status: "failed",
      });
      expect(result).toBeNull();
    });
  });

  // ── listSessions ────────────────────────────────────────────────────────────

  describe("listSessions", () => {
    it("returns an empty array when no sessions exist", async () => {
      const list = await listSessions(USER_A);
      expect(list).toEqual([]);
    });

    it("returns all sessions for the user", async () => {
      await createSession(USER_A, "tool-1");
      await createSession(USER_A, "tool-2");
      const list = await listSessions(USER_A);
      expect(list).toHaveLength(2);
    });

    it("sorts sessions by createdAt ascending", async () => {
      const s1 = await createSession(USER_A, "tool");
      await new Promise((r) => setTimeout(r, 5));
      const s2 = await createSession(USER_A, "tool");
      const list = await listSessions(USER_A);
      expect(list[0].id).toBe(s1.id);
      expect(list[1].id).toBe(s2.id);
    });

    it("isolates sessions between users", async () => {
      await createSession(USER_A, "tool");
      await createSession(USER_B, "tool");
      const listA = await listSessions(USER_A);
      const listB = await listSessions(USER_B);
      expect(listA).toHaveLength(1);
      expect(listB).toHaveLength(1);
      expect(listA[0].userId).toBe(USER_A);
      expect(listB[0].userId).toBe(USER_B);
    });
  });

  // ── deleteSession ───────────────────────────────────────────────────────────

  describe("deleteSession", () => {
    it("deletes an existing session and returns true", async () => {
      const session = await createSession(USER_A, "tool");
      const result = await deleteSession(USER_A, session.id);
      expect(result).toBe(true);
      expect(await getSession(USER_A, session.id)).toBeNull();
    });

    it("returns false for a non-existent session", async () => {
      const result = await deleteSession(USER_A, "no-such-id");
      expect(result).toBe(false);
    });
  });

  // ── purgeExpiredSessions ────────────────────────────────────────────────────

  describe("purgeExpiredSessions", () => {
    it("deletes sessions older than the maximum age", async () => {
      const old = await createSession(USER_A, "tool");
      // Manually backdate the session file
      const { userWorkspacePaths } = await import("@/lib/storage/workspace");
      const { sessions: sessionsDir } = userWorkspacePaths(USER_A);
      const filePath = path.join(sessionsDir, `${old.id}.json`);
      const data = JSON.parse(await fs.readFile(filePath, "utf8"));
      const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      data.updatedAt = pastDate;
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");

      // Recent session should be kept
      await createSession(USER_A, "tool");

      const deleted = await purgeExpiredSessions(USER_A, 24 * 60 * 60 * 1000);
      expect(deleted).toBe(1);
      expect(await listSessions(USER_A)).toHaveLength(1);
    });

    it("returns 0 when no sessions are expired", async () => {
      await createSession(USER_A, "tool");
      const deleted = await purgeExpiredSessions(USER_A, 24 * 60 * 60 * 1000);
      expect(deleted).toBe(0);
    });

    it("returns 0 when user has no sessions", async () => {
      const deleted = await purgeExpiredSessions(USER_A, 1000);
      expect(deleted).toBe(0);
    });
  });
});
