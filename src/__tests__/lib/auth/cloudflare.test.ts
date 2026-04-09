import { describe, it, expect } from "vitest";
import { getCloudflareUser, deriveUserId } from "@/lib/auth/cloudflare";

describe("deriveUserId", () => {
  it("produces a 32-character lowercase hex string", async () => {
    const id = await deriveUserId("user@example.com");
    expect(id).toHaveLength(32);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("is deterministic for the same email", async () => {
    const id1 = await deriveUserId("user@example.com");
    const id2 = await deriveUserId("user@example.com");
    expect(id1).toBe(id2);
  });

  it("normalises email to lower-case before hashing", async () => {
    const id1 = await deriveUserId("User@Example.COM");
    const id2 = await deriveUserId("user@example.com");
    expect(id1).toBe(id2);
  });

  it("produces different IDs for different emails", async () => {
    const id1 = await deriveUserId("alice@example.com");
    const id2 = await deriveUserId("bob@example.com");
    expect(id1).not.toBe(id2);
  });

  it("trims leading and trailing whitespace before hashing", async () => {
    const id1 = await deriveUserId("  user@example.com  ");
    const id2 = await deriveUserId("user@example.com");
    expect(id1).toBe(id2);
  });
});

describe("getCloudflareUser", () => {
  it("returns null when the CF header is absent", async () => {
    const result = await getCloudflareUser(new Headers());
    expect(result).toBeNull();
  });

  it("returns null when the CF header is an empty string", async () => {
    const result = await getCloudflareUser(
      new Headers({ "cf-access-authenticated-user-email": "" }),
    );
    expect(result).toBeNull();
  });

  it("returns null when the CF header is whitespace only", async () => {
    const result = await getCloudflareUser(
      new Headers({ "cf-access-authenticated-user-email": "   " }),
    );
    expect(result).toBeNull();
  });

  it("returns a user object when the CF header is present", async () => {
    const result = await getCloudflareUser(
      new Headers({ "cf-access-authenticated-user-email": "alice@example.com" }),
    );
    expect(result).not.toBeNull();
    expect(result?.email).toBe("alice@example.com");
    expect(result?.id).toHaveLength(32);
    expect(result?.id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("trims surrounding whitespace from the email value", async () => {
    const result = await getCloudflareUser(
      new Headers({
        "cf-access-authenticated-user-email": "  alice@example.com  ",
      }),
    );
    expect(result?.email).toBe("alice@example.com");
  });

  it("returns the same stable ID as deriveUserId for the same email", async () => {
    const email = "stable@example.com";
    const expectedId = await deriveUserId(email);
    const result = await getCloudflareUser(
      new Headers({ "cf-access-authenticated-user-email": email }),
    );
    expect(result?.id).toBe(expectedId);
  });
});
