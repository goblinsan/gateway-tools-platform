import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "os";
import path from "path";
import fs from "fs/promises";
import {
  getDataRoot,
  userWorkspacePaths,
  ensureUserWorkspace,
} from "@/lib/storage/workspace";

const TEST_USER_ID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";

describe("getDataRoot", () => {
  const original = process.env.DATA_ROOT;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DATA_ROOT;
    } else {
      process.env.DATA_ROOT = original;
    }
  });

  it("returns /data when DATA_ROOT is not set", () => {
    delete process.env.DATA_ROOT;
    expect(getDataRoot()).toBe("/data");
  });

  it("returns the value of DATA_ROOT when set", () => {
    process.env.DATA_ROOT = "/mnt/storage";
    expect(getDataRoot()).toBe("/mnt/storage");
  });
});

describe("userWorkspacePaths", () => {
  const original = process.env.DATA_ROOT;

  beforeEach(() => {
    process.env.DATA_ROOT = "/data";
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.DATA_ROOT;
    } else {
      process.env.DATA_ROOT = original;
    }
  });

  it("returns the expected directory structure", () => {
    const ws = userWorkspacePaths(TEST_USER_ID);
    expect(ws.root).toBe(`/data/${TEST_USER_ID}`);
    expect(ws.uploads).toBe(`/data/${TEST_USER_ID}/uploads`);
    expect(ws.outputs).toBe(`/data/${TEST_USER_ID}/outputs`);
    expect(ws.sessions).toBe(`/data/${TEST_USER_ID}/sessions`);
  });

  it("uses the current DATA_ROOT at call time", () => {
    process.env.DATA_ROOT = "/mnt/vol";
    const ws = userWorkspacePaths(TEST_USER_ID);
    expect(ws.root).toBe(`/mnt/vol/${TEST_USER_ID}`);
  });

  it("produces different roots for different user IDs", () => {
    const ws1 = userWorkspacePaths(TEST_USER_ID);
    const ws2 = userWorkspacePaths("deadbeefdeadbeefdeadbeefdeadbeef");
    expect(ws1.root).not.toBe(ws2.root);
  });
});

describe("ensureUserWorkspace", () => {
  let tmpDir: string;
  const original = process.env.DATA_ROOT;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-test-"));
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

  it("creates all required subdirectories", async () => {
    const ws = await ensureUserWorkspace(TEST_USER_ID);
    const [uploadsExists, outputsExists, sessionsExists] = await Promise.all([
      fs
        .stat(ws.uploads)
        .then((s) => s.isDirectory())
        .catch(() => false),
      fs
        .stat(ws.outputs)
        .then((s) => s.isDirectory())
        .catch(() => false),
      fs
        .stat(ws.sessions)
        .then((s) => s.isDirectory())
        .catch(() => false),
    ]);
    expect(uploadsExists).toBe(true);
    expect(outputsExists).toBe(true);
    expect(sessionsExists).toBe(true);
  });

  it("is idempotent – safe to call more than once", async () => {
    await ensureUserWorkspace(TEST_USER_ID);
    await expect(ensureUserWorkspace(TEST_USER_ID)).resolves.not.toThrow();
  });

  it("isolates different users under separate subdirectories", async () => {
    const ws1 = await ensureUserWorkspace(TEST_USER_ID);
    const ws2 = await ensureUserWorkspace("deadbeefdeadbeefdeadbeefdeadbeef");
    expect(ws1.root).not.toBe(ws2.root);
    expect(ws1.sessions).not.toBe(ws2.sessions);
  });

  it("returns paths consistent with userWorkspacePaths", async () => {
    const ws = await ensureUserWorkspace(TEST_USER_ID);
    const paths = userWorkspacePaths(TEST_USER_ID);
    expect(ws.root).toBe(paths.root);
    expect(ws.uploads).toBe(paths.uploads);
    expect(ws.outputs).toBe(paths.outputs);
    expect(ws.sessions).toBe(paths.sessions);
  });
});
