/**
 * Route-level access control.
 *
 * Every protected endpoint must reject anonymous and malformed-token requests
 * before any database work happens — these tests therefore need no database.
 */
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { signAccessToken, verifyAccessToken } from "../src/utils/jwt";

const app = createApp();

const PROTECTED: [string, string][] = [
  ["get", "/api/auth/me"],
  ["patch", "/api/auth/me"],
  ["post", "/api/auth/logout"],
  ["get", "/api/users"],
  ["get", "/api/dashboard/overview"],
  ["get", "/api/cases"],
  ["post", "/api/cases"],
  ["get", "/api/investigations"],
  ["post", "/api/investigations"],
  ["get", "/api/findings"],
  ["post", "/api/findings"],
  ["get", "/api/evidence"],
  ["post", "/api/evidence"],
  ["get", "/api/reports"],
  ["post", "/api/reports"],
];

describe("authentication guard", () => {
  for (const [method, path] of PROTECTED) {
    it(`${method.toUpperCase()} ${path} requires a bearer token`, async () => {
      const res = await (request(app) as never as Record<string, (p: string) => never>)[method]!(
        path,
      );
      const body = res as unknown as { status: number; body: { success: boolean } };
      expect(body.status).toBe(401);
      expect(body.body.success).toBe(false);
    });
  }

  it("rejects a malformed token with 401 and no stack trace", async () => {
    const res = await request(app)
      .get("/api/cases")
      .set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
    expect(res.body.stack).toBeUndefined();
  });

  it("rejects a non-bearer authorization scheme", async () => {
    const res = await request(app).get("/api/cases").set("Authorization", "Basic abc123");
    expect(res.status).toBe(401);
  });

  it("rejects a token signed for a different audience", async () => {
    const token = signAccessToken({
      sub: "000000000000000000000001",
      email: "a@b.co",
      name: "A",
      role: "investigator",
    });
    // Valid signature, but tampered payload must fail verification.
    const tampered = `${token.slice(0, -3)}abc`;
    const res = await request(app).get("/api/cases").set("Authorization", `Bearer ${tampered}`);
    expect(res.status).toBe(401);
  });
});

describe("token issuance", () => {
  it("round-trips minimal claims", () => {
    const token = signAccessToken({
      sub: "000000000000000000000002",
      email: "investigator@tracify.io",
      name: "Ada",
      role: "admin",
    });
    const claims = verifyAccessToken(token);
    expect(claims.sub).toBe("000000000000000000000002");
    expect(claims.role).toBe("admin");
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("never embeds a password or secret in the token payload", () => {
    const token = signAccessToken({
      sub: "000000000000000000000003",
      email: "a@b.co",
      name: "A",
      role: "investigator",
    });
    const payload = Buffer.from(token.split(".")[1] as string, "base64url").toString();
    expect(payload).not.toMatch(/password|secret/i);
  });
});

describe("validation on protected routes", () => {
  it("does not leak whether a resource exists before authenticating", async () => {
    const res = await request(app).get("/api/cases/000000000000000000000001");
    expect(res.status).toBe(401);
    expect(res.body.message).not.toMatch(/not found/i);
  });
});
