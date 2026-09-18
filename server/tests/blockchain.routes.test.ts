import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { User } from "../src/models/User.model";
import { signAccessToken } from "../src/utils/jwt";
import { resetProviders } from "../src/services/blockchain";

const app = createApp();

const TEST_USER_ID = "507f1f77bcf86cd799439011";
const validToken = signAccessToken({
  sub: TEST_USER_ID,
  email: "analyst@tracify.io",
  role: "admin",
});

describe("Blockchain API Routes", () => {
  beforeEach(() => {
    resetProviders();
    vi.spyOn(User, "findById").mockReturnValue({
      select: () => ({
        lean: async () => ({
          _id: TEST_USER_ID,
          email: "analyst@tracify.io",
          name: "Ada Kestrel",
          role: "admin",
          isActive: true,
        }),
      }),
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetProviders();
  });

  describe("Authentication", () => {
    it("rejects unauthenticated requests to /api/blockchain/providers", async () => {
      const res = await request(app).get("/api/blockchain/providers");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("rejects unauthenticated requests to /api/blockchain/transactions/:chain/:txHash", async () => {
      const res = await request(app).get(
        "/api/blockchain/transactions/ethereum/0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      );
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe("GET /api/blockchain/providers", () => {
    it("returns provider status with synthetic resolution when no keys configured", async () => {
      const res = await request(app)
        .get("/api/blockchain/providers")
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("graphsense");
      expect(res.body.data).toHaveProperty("etherscan");
      expect(res.body.data).toHaveProperty("fallback");
      expect(res.body.data.resolution.ethereum).toBe("synthetic");
      expect(res.body.data.resolution.bitcoin).toBe("synthetic");
    });
  });

  describe("GET /api/blockchain/transactions/:chain/:txHash", () => {
    it("returns deterministic transaction summary for a synthetic chain", async () => {
      const txHash = "0x9f83a241b1234567890abcdef1234567890abcdef1234567890abcdef12345678";
      const res = await request(app)
        .get(`/api/blockchain/transactions/ethereum/${txHash}`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.source).toBe("synthetic");
      expect(res.body.data.transaction).toMatchObject({
        txHash,
        chain: "ethereum",
        status: "success",
        asset: "ETH",
      });
      expect(typeof res.body.data.transaction.amount).toBe("number");
      expect(typeof res.body.data.transaction.valueUsd).toBe("number");
    });

    it("validates transaction hash format", async () => {
      const res = await request(app)
        .get("/api/blockchain/transactions/ethereum/short")
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe("GET /api/blockchain/addresses/:chain/:address/transactions", () => {
    it("returns transactions for a synthetic address", async () => {
      const address = "0x8f29c1200000000000000000000000000000ab12";
      const res = await request(app)
        .get(`/api/blockchain/addresses/ethereum/${address}/transactions?limit=5`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.address).toBe(address);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeLessThanOrEqual(5);
    });

    it("filters transactions by direction", async () => {
      const address = "0x8f29c1200000000000000000000000000000ab12";
      const res = await request(app)
        .get(`/api/blockchain/addresses/ethereum/${address}/transactions?direction=out`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      res.body.data.items.forEach((tx: any) => {
        expect(tx.from.toLowerCase()).toBe(address.toLowerCase());
      });
    });
  });

  describe("GET /api/blockchain/addresses/:chain/:address/trace", () => {
    it("runs on-demand quick trace without saving an investigation", async () => {
      const address = "0x8f29c1200000000000000000000000000000ab12";
      const res = await request(app)
        .get(`/api/blockchain/addresses/ethereum/${address}/trace?maxHops=2`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rootAddress).toBe(address);
      expect(res.body.data.graph).toHaveProperty("nodes");
      expect(res.body.data.graph).toHaveProperty("edges");
      expect(res.body.data.graph.nodes.length).toBeGreaterThan(0);
    });
  });

  describe("GET /api/blockchain/search", () => {
    it("scans all supported chains for an address", async () => {
      const address = "0x8f29c1200000000000000000000000000000ab12";
      const res = await request(app)
        .get(`/api/blockchain/search?address=${address}`)
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.address).toBe(address);
      expect(res.body.data.chainsScanned).toBe(6);
      expect(Array.isArray(res.body.data.results)).toBe(true);
    });
  });
});
