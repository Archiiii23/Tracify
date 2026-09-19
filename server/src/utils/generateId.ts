import { randomBytes } from "node:crypto";

/**
 * Build a readable, sortable domain identifier such as `CASE-2026-0001`.
 * `sequence` is expected to come from a per-prefix, per-year count.
 */
export function formatSequentialId(
  prefix: string,
  sequence: number,
  options: { year?: number; pad?: number } = {},
): string {
  const year = options.year ?? new Date().getUTCFullYear();
  const pad = options.pad ?? 4;
  return `${prefix.toUpperCase()}-${year}-${String(sequence).padStart(pad, "0")}`;
}

/** Short opaque token for non-sequential identifiers. */
export function randomId(bytes = 8): string {
  return randomBytes(bytes).toString("hex");
}
