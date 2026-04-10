import { describe, it, expect, vi, afterEach } from "vitest";
import {
  STT_MAX_FILE_BYTES,
  STT_ALLOWED_MIME_TYPES,
  SttServiceError,
  getSttServiceUrl,
  getTranscriptText,
  normalizeAudioUpload,
  transcribe,
  transcribeFromSourceUrl,
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
  it("is 500 MiB", () => {
    expect(STT_MAX_FILE_BYTES).toBe(500 * 1024 * 1024);
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

describe("normalizeAudioUpload", () => {
  it("infers a content type from the file extension when the browser omits it", () => {
    expect(normalizeAudioUpload("meeting.aif", "")).toEqual({
      filename: "meeting.aif",
      contentType: "audio/aiff",
    });
  });

  it("rejects unsupported extensions", () => {
    expect(() => normalizeAudioUpload("notes.txt", "text/plain")).toThrow(
      SttServiceError,
    );
  });
});

describe("getTranscriptText", () => {
  it("prefers transcript when present", () => {
    expect(getTranscriptText({ transcript: "hello", text: "ignored" })).toBe(
      "hello",
    );
  });

  it("falls back to text and then segments", () => {
    expect(getTranscriptText({ text: "hello" })).toBe("hello");
    expect(
      getTranscriptText({ segments: [{ speaker: "S0", text: "hello", start: 0, end: 1 }] }),
    ).toBe("hello");
  });
});

describe("transcribe", () => {
  it("POSTs to the correct endpoint and returns parsed JSON", async () => {
    process.env.STT_SERVICE_URL = "http://stt:8080";
    const mockResult = { text: "Hello world" };
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
    const body = init.body as FormData;
    expect(body.get("file")).toBeInstanceOf(File);
    expect(result).toEqual(mockResult);
  });

  it("appends diarize and language fields when set", async () => {
    process.env.STT_SERVICE_URL = "http://stt:8080";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: "" }),
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
});

describe("transcribeFromSourceUrl", () => {
  it("POSTs JSON to the remote-source endpoint", async () => {
    process.env.STT_SERVICE_URL = "http://stt:8080";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: "remote transcript" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await transcribeFromSourceUrl("https://signed.example/object", "clip.wav", {
      diarize: true,
      language: "en-US",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://stt:8080/api/transcribe-from-url");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({
      source_url: "https://signed.example/object",
      filename: "clip.wav",
      diarize: true,
      language: "en-US",
    });
  });

  it("throws SttServiceError on non-OK response", async () => {
    process.env.STT_SERVICE_URL = "http://stt:8080";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "Service unavailable",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      transcribeFromSourceUrl("https://signed.example/object", "clip.wav"),
    ).rejects.toThrow(SttServiceError);
  });
});
