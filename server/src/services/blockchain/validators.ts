import type { Chain } from "../../models/Investigation.model";
import { ApiError } from "../../utils/ApiError";

export interface AddressValidationResult {
  valid: boolean;
  normalized: string;
  format: string;
  error?: string;
}

const EVM_RE = /^0x[a-fA-F0-9]{40}$/;
const BTC_RE = /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/;
const TRON_RE = /^T[a-zA-HJ-NP-Z0-9]{33}$/;
/** Base58 Solana public key (32–44 chars). */
const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const EVM_CHAINS = new Set<Chain>(["ethereum", "polygon", "bsc", "arbitrum"]);

function normalizeEvm(address: string): string {
  return address.trim().toLowerCase();
}

/** Chain-specific address validation — do not use a single generic regex. */
export function validateAddressForChain(chain: Chain, address: string): AddressValidationResult {
  const raw = address?.trim() ?? "";
  if (!raw) {
    return { valid: false, normalized: "", format: "unknown", error: "Address is required" };
  }

  if (EVM_CHAINS.has(chain)) {
    if (!EVM_RE.test(raw)) {
      return {
        valid: false,
        normalized: "",
        format: "EVM",
        error: `Invalid EVM address for ${chain}. Expected 0x followed by 40 hexadecimal characters.`,
      };
    }
    return { valid: true, normalized: normalizeEvm(raw), format: "EVM (0x hex)" };
  }

  if (chain === "bitcoin") {
    if (!BTC_RE.test(raw)) {
      return {
        valid: false,
        normalized: "",
        format: "Bitcoin",
        error: "Invalid Bitcoin address. Supported: legacy (1/3…) or Bech32 (bc1…).",
      };
    }
    return { valid: true, normalized: raw, format: "Bitcoin (legacy / Bech32)" };
  }

  if (chain === "tron") {
    if (!TRON_RE.test(raw)) {
      return {
        valid: false,
        normalized: "",
        format: "TRON",
        error: "Invalid TRON address. Expected Base58 address starting with T.",
      };
    }
    return { valid: true, normalized: raw, format: "TRON (Base58)" };
  }

  return {
    valid: false,
    normalized: "",
    format: "unsupported",
    error: `Chain ${chain} is not supported for address validation.`,
  };
}

/** Validates Solana public keys (separate from Investigation CHAINS enum for future use). */
export function validateSolanaAddress(address: string): AddressValidationResult {
  const raw = address?.trim() ?? "";
  if (!raw) {
    return { valid: false, normalized: "", format: "Solana", error: "Address is required" };
  }
  if (!SOLANA_RE.test(raw)) {
    return {
      valid: false,
      normalized: "",
      format: "Solana",
      error: "Invalid Solana public key format.",
    };
  }
  return { valid: true, normalized: raw, format: "Solana (Base58 public key)" };
}

export function assertValidAddress(chain: Chain, address: string): string {
  const result = validateAddressForChain(chain, address);
  if (!result.valid) {
    throw ApiError.badRequest(result.error ?? "Invalid wallet address");
  }
  return result.normalized;
}
