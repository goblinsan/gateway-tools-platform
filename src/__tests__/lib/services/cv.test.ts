import { describe, it, expect, vi, afterEach } from "vitest";
import {
  CV_MAX_FILE_BYTES,
  CV_ALLOWED_MIME_TYPES,
  CvServiceError,
  getCvServiceUrl,
  processImage,
} from "@/lib/services/cv";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.CV_SERVICE_URL;
});

describe("getCvServiceUrl", () => {
  it("returns the env variable value with trailing slash stripped", () => {
    process.env.CV_SERVICE_URL = "http://cv:9000/";
    expect(getCvServiceUrl()).toBe("http://cv:9000");
  });

  it("returns the env variable as-is when no trailing slash", () => {
    process.env.CV_SERVICE_URL = "http://cv:9000";
    expect(getCvServiceUrl()).toBe("http://cv:9000");
  });

  it("throws when CV_SERVICE_URL is not set", () => {
    delete process.env.CV_SERVICE_URL;
    expect(() => getCvServiceUrl()).toThrow("CV_SERVICE_URL");
  });
});

describe("CV_MAX_FILE_BYTES", () => {
  it("is 10 MiB", () => {
    expect(CV_MAX_FILE_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe("CV_ALLOWED_MIME_TYPES", () => {
  it("includes common image formats", () => {
    expect(CV_ALLOWED_MIME_TYPES).toContain("image/jpeg");
    expect(CV_ALLOWED_MIME_TYPES).toContain("image/png");
    expect(CV_ALLOWED_MIME_TYPES).toContain("image/webp");
  });
});

describe("processImage", () => {
  it("POSTs to the correct operation endpoint", async () => {
    process.env.CV_SERVICE_URL = "http://cv:9000";
    const imageBytes = Buffer.from("fake-png");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "image/png" },
      arrayBuffer: async () => imageBytes.buffer,
    });
    vi.stubGlobal("fetch", fetchMock);

    await processImage(imageBytes, "photo.png", "segment");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://cv:9000/segment");
    expect(init.method).toBe("POST");
  });

  it("appends the image field to the form", async () => {
    process.env.CV_SERVICE_URL = "http://cv:9000";
    const imageBytes = Buffer.from("fake-png");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "image/png" },
      arrayBuffer: async () => imageBytes.buffer,
    });
    vi.stubGlobal("fetch", fetchMock);

    await processImage(imageBytes, "photo.png", "analyze");

    const body = fetchMock.mock.calls[0][1].body as FormData;
    const imageField = body.get("image");
    expect(imageField).not.toBeNull();
  });

  it("derives .png extension for image/png responses", async () => {
    process.env.CV_SERVICE_URL = "http://cv:9000";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "image/png" },
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await processImage(Buffer.from("x"), "img.png", "segment");
    expect(result.filename).toMatch(/\.png$/);
    expect(result.mimeType).toBe("image/png");
  });

  it("derives .json extension for application/json responses", async () => {
    process.env.CV_SERVICE_URL = "http://cv:9000";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json; charset=utf-8" },
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await processImage(Buffer.from("x"), "img.png", "analyze");
    expect(result.filename).toMatch(/\.json$/);
    expect(result.mimeType).toBe("application/json");
  });

  it("throws CvServiceError on non-OK response", async () => {
    process.env.CV_SERVICE_URL = "http://cv:9000";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "Bad Request",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      processImage(Buffer.from("x"), "img.png", "palette"),
    ).rejects.toThrow(CvServiceError);
  });

  it("CvServiceError carries the upstream status", async () => {
    process.env.CV_SERVICE_URL = "http://cv:9000";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });
    vi.stubGlobal("fetch", fetchMock);

    let caught: CvServiceError | null = null;
    try {
      await processImage(Buffer.from("x"), "img.png", "segment");
    } catch (e) {
      caught = e as CvServiceError;
    }
    expect(caught?.status).toBe(500);
    expect(caught?.message).toContain("Internal Server Error");
  });
});
