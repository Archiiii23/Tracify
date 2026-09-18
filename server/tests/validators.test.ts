import { describe, expect, it } from "vitest";
import {
  validateAddressForChain,
  validateSolanaAddress,
} from "../src/services/blockchain/validators";

describe("chain address validators", () => {
  const validEvm = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0";

  it("accepts valid EVM addresses on ethereum", () => {
    const result = validateAddressForChain("ethereum", validEvm);
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe(validEvm.toLowerCase());
  });

  it("rejects malformed EVM addresses", () => {
    const result = validateAddressForChain("ethereum", "0x1234");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/EVM/i);
  });

  it("accepts Bitcoin Bech32 and legacy formats", () => {
    expect(validateAddressForChain("bitcoin", "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh").valid).toBe(true);
    expect(validateAddressForChain("bitcoin", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa").valid).toBe(true);
  });

  it("rejects invalid Bitcoin addresses", () => {
    expect(validateAddressForChain("bitcoin", "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0").valid).toBe(false);
  });

  it("accepts TRON Base58 addresses", () => {
    const result = validateAddressForChain("tron", "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf");
    expect(result.valid).toBe(true);
  });

  it("rejects invalid TRON addresses", () => {
    expect(validateAddressForChain("tron", validEvm).valid).toBe(false);
  });

  it("validates Solana public keys separately", () => {
    expect(validateSolanaAddress("7EcDhSYGxXyscszYEp35KHN8iJ3aEpJ9MfryjGunjS").valid).toBe(true);
    expect(validateSolanaAddress("not-a-key").valid).toBe(false);
  });
});
