/**
 * API contract, security and failure-path tests.
 *
 * These run without a database on purpose: they exercise the transport layer
 * (headers, CORS, validation, error envelopes, 404s, payload limits) which must
 * hold regardless of data-layer availability.
 */
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { validate, objectIdParam, listQuery } from "../src/middleware/validate.middleware";
import { sanitizeRequest } from "../src/middleware/security.middleware";
import { redact } from "../src/utils/logger";
import express from "express";
import { z } from "zod";
import { errorHandler } from "../src/middleware/error.middleware";

const app = createApp();

describe("health + readiness", () => {
  it("liveness returns the success envelope without leaking config", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("ok");
    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toMatch(/mongodb|JWT|secret/i);
  });

  it("readiness reports 503 while the database is unavailable", async () => {
    const res = await request(app).get("/api/health/ready");
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.data.database).toBe("disconnected");
  });

  it("attaches a correlation id to every response", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-request-id"]).toMatch(/^[\w-]+$/);
  });
});

describe("unknown routes and methods", () => {
  it("returns a controlled 404 error envelope", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false });
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  it("does not expose the server implementation", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("rejects an unsupported method on a known route", async () => {
    const res = await request(app).delete("/api/health");
    expect(res.status).toBe(404);
  });
});

describe("security headers", () => {
  it("sets hardening headers", async () => {
    const res = await request(app).get("/api/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
  });
});

describe("CORS", () => {
  it("allows a configured origin with credentials", async () => {
    const res = await request(app)
      .get("/api/health")
      .set("Origin", "http://localhost:5173");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("does not grant access to an unlisted origin", async () => {
    const res = await request(app)
      .get("/api/health")
      .set("Origin", "https://evil.example.com");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("answers preflight for an allowed origin", async () => {
    const res = await request(app)
      .options("/api/health")
      .set("Origin", "http://localhost:8080")
      .set("Access-Control-Request-Method", "GET");
    expect([200, 204]).toContain(res.status);
    expect(res.headers["access-control-allow-methods"]).toContain("GET");
  });
});

describe("payload handling", () => {
  it("rejects malformed JSON with 400, not a stack trace", async () => {
    const res = await request(app)
      .post("/api/health")
      .set("Content-Type", "application/json")
      .send('{"broken":');
    expect([400, 404]).toContain(res.status);
    expect(res.body.stack ?? "").not.toContain("node_modules");
  });

  it("rejects oversized payloads", async () => {
    const res = await request(app)
      .post("/api/health")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ blob: "x".repeat(600_000) }));
    expect([413, 400]).toContain(res.status);
  });
});

/** Minimal harness app to exercise validation + sanitisation in isolation. */
function harness() {
  const a = express();
  a.use(express.json());
  a.use(sanitizeRequest);
  a.post(
    "/cases",
    validate({
      body: z
        .object({
          title: z.string().trim().min(3).max(120),
          status: z.enum(["open", "active", "review", "closed"]).default("open"),
        })
        .strict(),
    }),
    (req, res) => res.json({ success: true, data: req.body }),
  );
  a.get("/cases/:id", validate({ params: objectIdParam }), (req, res) =>
    res.json({ success: true, data: req.params }),
  );
  a.get(
    "/list",
    validate({ query: listQuery(["created_at", "title"]) }),
    (req, res) => res.json({ success: true, data: req.query }),
  );
  a.use(errorHandler);
  return a;
}

describe("input validation", () => {
  const a = harness();

  it("accepts a valid body and applies defaults", async () => {
    const res = await request(a).post("/cases").send({ title: "Drainer sweep" });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ title: "Drainer sweep", status: "open" });
  });

  it.each([
    ["missing title", {}],
    ["null title", { title: null }],
    ["empty title", { title: "" }],
    ["whitespace title", { title: "   " }],
    ["numeric title", { title: 42 }],
    ["array title", { title: ["a", "b"] }],
    ["object title", { title: { $ne: null } }],
    ["overlong title", { title: "x".repeat(500) }],
    ["invalid status", { title: "Valid title", status: "hacked" }],
    ["unexpected field", { title: "Valid title", role: "admin" }],
  ])("rejects %s", async (_label, body) => {
    const res = await request(a).post("/cases").send(body);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("strips Mongo operator keys before they reach a handler", async () => {
    const res = await request(a)
      .post("/cases")
      .send({ title: "Operator probe", $gt: "", "nested.path": 1 });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("$gt");
  });

  it.each(["not-an-id", "1", "$ne", "aaaaaaaaaaaaaaaaaaaaaaaz", "../../etc/passwd"])(
    "rejects invalid resource id %s",
    async (id) => {
      const res = await request(a).get(`/cases/${encodeURIComponent(id)}`);
      expect(res.status).toBe(400);
    },
  );

  it("accepts a well-formed resource id", async () => {
    const res = await request(a).get("/cases/64b7f0c2a1d3e4f5a6b7c8d9");
    expect(res.status).toBe(200);
  });
});

describe("pagination and query safety", () => {
  const a = harness();

  it("applies safe defaults", async () => {
    const res = await request(a).get("/list");
    expect(res.body.data).toMatchObject({ page: 1, limit: 20, sort: "created_at", order: "desc" });
  });

  it("caps an absurd limit", async () => {
    const res = await request(a).get("/list?limit=999999999");
    expect(res.status).toBe(400);
  });

  it.each(["page=0", "page=-3", "page=abc", "limit=0", "sort=password", "order=sideways"])(
    "rejects %s",
    async (qs) => {
      const res = await request(a).get(`/list?${qs}`);
      expect(res.status).toBe(400);
    },
  );

  it("whitelists sortable fields", async () => {
    const res = await request(a).get("/list?sort=title&order=asc");
    expect(res.body.data).toMatchObject({ sort: "title", order: "asc" });
  });
});

describe("logging redaction", () => {
  it("never serialises credentials or tokens", () => {
    const out = JSON.stringify(
      redact({
        email: "a@b.com",
        password: "hunter2",
        authorization: "Bearer abc.def.ghi",
        nested: { refreshToken: "rt_123", MONGODB_URI: "mongodb://user:pass@host/db" },
      }),
    );
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("abc.def.ghi");
    expect(out).not.toContain("rt_123");
    expect(out).not.toContain("mongodb://");
    expect(out).toContain("a@b.com");
  });
});
