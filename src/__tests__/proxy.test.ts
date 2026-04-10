import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/proxy";

describe("isPublicPath", () => {
  it("allows the health endpoint without Cloudflare headers", () => {
    expect(isPublicPath("/api/health")).toBe(true);
  });

  it("allows Next.js asset paths", () => {
    expect(isPublicPath("/_next/static/chunk.js")).toBe(true);
    expect(isPublicPath("/_next/image")).toBe(true);
  });

  it("allows the unauthorized page", () => {
    expect(isPublicPath("/unauthorized")).toBe(true);
  });

  it("does not allow authenticated app routes", () => {
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/tools/stt")).toBe(false);
    expect(isPublicPath("/api/tools/stt")).toBe(false);
  });
});
