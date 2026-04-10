import { describe, it, expect, vi, afterEach } from "vitest";
import {
  STT_MAX_FILE_BYTES,
  STT_ALLOWED_MIME_TYPES,
  SttServiceError,
  getSttServiceUrl,
  transcribe,
} from "@/lib/services/stt";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.STT_SERVICE_URL;
});

describe("getSttServiceUrl", () => {
  it("returns the env variable value with trailing slash stripped", () => {
    process.env.STT_SERVICE_URL = "http://stt:8080/";
    expect(getSttServiceUrl()).toBe("http://stt:8080");
  });

  it("returns the env variable as-is when no trailing slash", () => {
    process.env.STT_SERVICE_URL = "http://stt:8080";
    expect(getSttServiceUrl()).toBe("http://stt:8080");
  });

  it("throws when STT_SERVICE_URL is not set", () => {
    delete process.env.STT_SERVICE_URL;
    expect(() => getSttServiceUrl()).toThrow("STT_SERVICE_URL");
  });
});

describe("STT_MAX_FILE_BYTES", () => {
  it("is 100 MiB", () => {
    expect(STT_MAX_FILE_BYTES).toBe(100 * 1024 * 1024);
  });
});

describe("STT_ALLOWED_MIME_TYPES", () => {
  it("includes common audio formats", () => {
    expect(STT_ALLOWED_MIME_TYPES).toContain("audio/mpeg");
    expect(STT_ALLOWED_MIME_TYPES).toContain("audio/wav");
    expect(STT_ALLOWED_MIME_TYPES).toContain("audio/aiff");
    expect(STT_ALLOWED_MIME_TYPES).toContain("audio/ogg");
    expect(STT_ALLOWED_MIME_TYPES).toContain("audio/flac");
    expect(STT_ALLOWED_MIME_TYPES).toContain("audio/webm");
  });
});

describe("transcribe", () => {
  it("POSTs to the correct endpoint and returns parsed JSON", async () => {
    process.env.STT_SERVICE_URL = "http://stt:8080";
    const mockResult = { transcript: "Hello world" };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResult,
    });
    vi.stubGlobal("fetch", fetchMock);

    const audio = Buffer.from("fake-audio");
    const result = await transcribe(audio, "test.mp3");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://stt:8080/api/transcribe");
    expect(init.method).toBe("POST");
    expect(result).toEqual(mockResult);
  });

  it("appends diarize and language fields when set", async () => {
    process.env.STT_SERVICE_URL = "http://stt:8080";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ transcript: "" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await transcribe(Buffer.from("x"), "a.mp3", {
      diarize: true,
      language: "en-US",
    });

    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get("diarize")).toBe("true");
    expect(body.get("language")).toBe("en-US");
  });

  it("does not append diarize when false", async () => {
    process.env.STT_SERVICE_URL = "http://stt:8080";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ transcript: "" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await transcribe(Buffer.from("x"), "a.mp3", { diarize: false });

    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get("diarize")).toBeNull();
  });

  it("throws SttServiceError on non-OK response", async () => {
    process.env.STT_SERVICE_URL = "http://stt:8080";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "Unprocessable",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(transcribe(Buffer.from("x"), "a.mp3")).rejects.toThrow(
      SttServiceError,
    );
  });

  it("SttServiceError carries the upstream status", async () => {
    process.env.STT_SERVICE_URL = "http://stt:8080";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "Service Unavailable",
    });
    vi.stubGlobal("fetch", fetchMock);

    let caught: SttServiceError | null = null;
    try {
      await transcribe(Buffer.from("x"), "a.mp3");
    } catch (e) {
      caught = e as SttServiceError;
    }
    expect(caught?.status).toBe(503);
    expect(caught?.message).toContain("Service Unavailable");
  });
});
