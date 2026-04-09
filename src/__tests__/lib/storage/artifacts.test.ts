import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "os";
import path from "path";
import fs from "fs/promises";
import {
  saveArtifact,
  getArtifact,
  listArtifacts,
  deleteArtifact,
  purgeExpiredArtifacts,
} from "@/lib/storage/artifacts";

const USER_A = "aaaabbbbccccddddaaaabbbbccccdddd";
const USER_B = "11112222333344441111222233334444";
const SESSION_ID = "sess-00000000-0000-0000-0000-000000000001";

const SAMPLE_CONTENT = Buffer.from("hello artifact");

describe("artifacts", () => {
  let tmpDir: string;
  const original = process.env.DATA_ROOT;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "artifacts-test-"));
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

  // ── saveArtifact ────────────────────────────────────────────────────────────

  describe("saveArtifact", () => {
    it("saves an artifact and returns a record", async () => {
      const record = await saveArtifact(
        USER_A,
        SESSION_ID,
        "result.txt",
        "text/plain",
        SAMPLE_CONTENT,
      );
      expect(record.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(record.userId).toBe(USER_A);
      expect(record.sessionId).toBe(SESSION_ID);
      expect(record.filename).toBe("result.txt");
      expect(record.mimeType).toBe("text/plain");
      expect(record.sizeBytes).toBe(SAMPLE_CONTENT.length);
      expect(record.createdAt).toBeTruthy();
    });

    it("writes the data file to disk", async () => {
      const record = await saveArtifact(
        USER_A,
        undefined,
        "output.txt",
        "text/plain",
        SAMPLE_CONTENT,
      );
      const dataPath = path.join(
        tmpDir,
        USER_A,
        "outputs",
        `${record.id}.txt`,
      );
      const onDisk = await fs.readFile(dataPath);
      expect(onDisk).toEqual(SAMPLE_CONTENT);
    });

    it("writes the meta file to disk", async () => {
      const record = await saveArtifact(
        USER_A,
        undefined,
        "output.txt",
        "text/plain",
        SAMPLE_CONTENT,
      );
      const metaPath = path.join(
        tmpDir,
        USER_A,
        "outputs",
        `${record.id}.meta.json`,
      );
      const raw = await fs.readFile(metaPath, "utf8");
      const parsed = JSON.parse(raw);
      expect(parsed.id).toBe(record.id);
      expect(parsed.mimeType).toBe("text/plain");
    });

    it("accepts an undefined sessionId", async () => {
      const record = await saveArtifact(
        USER_A,
        undefined,
        "file.bin",
        "application/octet-stream",
        SAMPLE_CONTENT,
      );
      expect(record.sessionId).toBeUndefined();
    });

    it("generates unique IDs for each artifact", async () => {
      const r1 = await saveArtifact(USER_A, undefined, "f.txt", "text/plain", SAMPLE_CONTENT);
      const r2 = await saveArtifact(USER_A, undefined, "f.txt", "text/plain", SAMPLE_CONTENT);
      expect(r1.id).not.toBe(r2.id);
    });
  });

  // ── getArtifact ─────────────────────────────────────────────────────────────

  describe("getArtifact", () => {
    it("returns the record and data for an existing artifact", async () => {
      const saved = await saveArtifact(
        USER_A,
        SESSION_ID,
        "out.txt",
        "text/plain",
        SAMPLE_CONTENT,
      );
      const result = await getArtifact(USER_A, saved.id);
      expect(result).not.toBeNull();
      expect(result?.record.id).toBe(saved.id);
      expect(result?.data).toEqual(SAMPLE_CONTENT);
    });

    it("returns null for a non-existent artifact", async () => {
      const result = await getArtifact(USER_A, "no-such-id");
      expect(result).toBeNull();
    });

    it("returns null when user has no outputs directory", async () => {
      const result = await getArtifact("nonexistentuser00000000000000000", "any");
      expect(result).toBeNull();
    });
  });

  // ── listArtifacts ───────────────────────────────────────────────────────────

  describe("listArtifacts", () => {
    it("returns an empty array when no artifacts exist", async () => {
      const list = await listArtifacts(USER_A);
      expect(list).toEqual([]);
    });

    it("returns all artifacts for the user", async () => {
      await saveArtifact(USER_A, undefined, "a.txt", "text/plain", SAMPLE_CONTENT);
      await saveArtifact(USER_A, undefined, "b.txt", "text/plain", SAMPLE_CONTENT);
      const list = await listArtifacts(USER_A);
      expect(list).toHaveLength(2);
    });

    it("sorts artifacts by createdAt ascending", async () => {
      const r1 = await saveArtifact(USER_A, undefined, "a.txt", "text/plain", SAMPLE_CONTENT);
      await new Promise((res) => setTimeout(res, 5));
      const r2 = await saveArtifact(USER_A, undefined, "b.txt", "text/plain", SAMPLE_CONTENT);
      const list = await listArtifacts(USER_A);
      expect(list[0].id).toBe(r1.id);
      expect(list[1].id).toBe(r2.id);
    });

    it("filters by sessionId when provided", async () => {
      const sess2 = "sess-00000000-0000-0000-0000-000000000002";
      await saveArtifact(USER_A, SESSION_ID, "a.txt", "text/plain", SAMPLE_CONTENT);
      await saveArtifact(USER_A, sess2, "b.txt", "text/plain", SAMPLE_CONTENT);
      const list = await listArtifacts(USER_A, SESSION_ID);
      expect(list).toHaveLength(1);
      expect(list[0].sessionId).toBe(SESSION_ID);
    });

    it("isolates artifacts between users", async () => {
      await saveArtifact(USER_A, undefined, "a.txt", "text/plain", SAMPLE_CONTENT);
      await saveArtifact(USER_B, undefined, "b.txt", "text/plain", SAMPLE_CONTENT);
      const listA = await listArtifacts(USER_A);
      const listB = await listArtifacts(USER_B);
      expect(listA).toHaveLength(1);
      expect(listB).toHaveLength(1);
      expect(listA[0].userId).toBe(USER_A);
      expect(listB[0].userId).toBe(USER_B);
    });
  });

  // ── deleteArtifact ──────────────────────────────────────────────────────────

  describe("deleteArtifact", () => {
    it("deletes an existing artifact and returns true", async () => {
      const saved = await saveArtifact(
        USER_A,
        undefined,
        "out.txt",
        "text/plain",
        SAMPLE_CONTENT,
      );
      const result = await deleteArtifact(USER_A, saved.id);
      expect(result).toBe(true);
      expect(await getArtifact(USER_A, saved.id)).toBeNull();
    });

    it("removes both the data file and the meta file", async () => {
      const saved = await saveArtifact(
        USER_A,
        undefined,
        "out.txt",
        "text/plain",
        SAMPLE_CONTENT,
      );
      await deleteArtifact(USER_A, saved.id);
      const files = await fs.readdir(path.join(tmpDir, USER_A, "outputs"));
      expect(files).toHaveLength(0);
    });

    it("returns false for a non-existent artifact", async () => {
      const result = await deleteArtifact(USER_A, "no-such-id");
      expect(result).toBe(false);
    });
  });

  // ── purgeExpiredArtifacts ───────────────────────────────────────────────────

  describe("purgeExpiredArtifacts", () => {
    it("deletes artifacts older than the maximum age", async () => {
      const old = await saveArtifact(
        USER_A,
        undefined,
        "old.txt",
        "text/plain",
        SAMPLE_CONTENT,
      );
      // Manually backdate the meta file
      const { userWorkspacePaths } = await import("@/lib/storage/workspace");
      const { outputs } = userWorkspacePaths(USER_A);
      const metaPath = path.join(outputs, `${old.id}.meta.json`);
      const data = JSON.parse(await fs.readFile(metaPath, "utf8"));
      data.createdAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      await fs.writeFile(metaPath, JSON.stringify(data, null, 2), "utf8");

      // Recent artifact should be kept
      await saveArtifact(USER_A, undefined, "new.txt", "text/plain", SAMPLE_CONTENT);

      const deleted = await purgeExpiredArtifacts(USER_A, 24 * 60 * 60 * 1000);
      expect(deleted).toBe(1);
      expect(await listArtifacts(USER_A)).toHaveLength(1);
    });

    it("returns 0 when no artifacts are expired", async () => {
      await saveArtifact(USER_A, undefined, "f.txt", "text/plain", SAMPLE_CONTENT);
      const deleted = await purgeExpiredArtifacts(USER_A, 24 * 60 * 60 * 1000);
      expect(deleted).toBe(0);
    });

    it("returns 0 when user has no artifacts", async () => {
      const deleted = await purgeExpiredArtifacts(USER_A, 1000);
      expect(deleted).toBe(0);
    });
  });
});
