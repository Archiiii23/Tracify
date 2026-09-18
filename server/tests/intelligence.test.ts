/**
 * Intelligence engine tests.
 *
 * The engine is pure, so these assert real behaviour: determinism, hop bounds,
 * value continuity, detector correctness and score bounds — no mocks required.
 */
import { describe, expect, it } from "vitest";
import {
  detectSignals,
  expandGraph,
  rankPaths,
  runTrace,
  scoreRisk,
} from "../src/services/intelligence.service";
import { canonicalise, checksumOf } from "../src/models/Evidence.model";
import { formatSequentialId } from "../src/utils/generateId";

const base = {
  rootAddress: "0x8f29c1200000000000000000000000000000ab12",
  chain: "ethereum" as const,
  maxHops: 4,
  minValueUsd: 100,
  direction: "outbound" as const,
};

describe("graph expansion", () => {
  it("is deterministic for identical inputs", () => {
    const a = expandGraph(base);
    const b = expandGraph(base);
    expect(a.nodes.map((n) => n.address)).toEqual(b.nodes.map((n) => n.address));
    expect(a.edges.map((e) => e.txHash)).toEqual(b.edges.map((e) => e.txHash));
  });

  it("produces a different graph for a different root address", () => {
    const other = expandGraph({ ...base, rootAddress: "0x1111111111111111111111111111111111111111" });
    expect(other.nodes[1]?.address).not.toBe(expandGraph(base).nodes[1]?.address);
  });

  it("never exceeds the requested hop bound", () => {
    const { nodes } = expandGraph({ ...base, maxHops: 3 });
    expect(Math.max(...nodes.map((n) => n.hop))).toBeLessThanOrEqual(3);
  });

  it("keeps the root at hop zero and preserves its seed value", () => {
    const { nodes } = expandGraph({ ...base, seedValueUsd: 12_345 });
    expect(nodes[0]?.hop).toBe(0);
    expect(nodes[0]?.valueUsd).toBe(12_345);
  });

  it("never forwards more value than a parent holds", () => {
    const { nodes, edges } = expandGraph(base);
    const byAddress = new Map(nodes.map((n) => [n.address, n]));
    for (const address of new Set(edges.map((e) => e.from))) {
      const outgoing = edges.filter((e) => e.from === address);
      const total = outgoing.reduce((acc, e) => acc + e.valueUsd, 0);
      expect(total).toBeLessThanOrEqual((byAddress.get(address)?.valueUsd ?? 0) + 1);
    }
  });

  it("respects the minimum value filter", () => {
    const { edges } = expandGraph({ ...base, minValueUsd: 5_000, seedValueUsd: 20_000 });
    for (const edge of edges) expect(edge.valueUsd).toBeGreaterThanOrEqual(4_999);
  });

  it("does not forward value out of a terminal service address", () => {
    const { nodes, edges } = expandGraph(base);
    const vasps = nodes.filter((n) => n.isVasp).map((n) => n.address);
    for (const address of vasps) {
      expect(edges.some((e) => e.from === address)).toBe(false);
    }
  });

  it("assigns every edge a unique transaction hash", () => {
    const { edges } = expandGraph(base);
    expect(new Set(edges.map((e) => e.txHash)).size).toBe(edges.length);
  });
});

describe("path ranking", () => {
  it("returns paths sorted by descending score and starting at the root", () => {
    const { nodes, edges } = expandGraph(base);
    const paths = rankPaths(nodes, edges, base.rootAddress);
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) expect(path.addresses[0]).toBe(base.rootAddress);
    const scores = paths.map((p) => p.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("explains every ranked path", () => {
    const { nodes, edges } = expandGraph(base);
    for (const path of rankPaths(nodes, edges, base.rootAddress)) {
      expect(path.rationale.length).toBeGreaterThan(20);
      expect(path.hops).toBe(path.addresses.length - 1);
    }
  });
});

describe("behavioural detectors", () => {
  it("raises a mixer signal when a mixer address is present", () => {
    const nodes = [
      { address: "0xa", chain: "ethereum" as const, riskScore: 40, hop: 0, valueUsd: 100, isVasp: false },
      {
        address: "0xb",
        chain: "ethereum" as const,
        riskScore: 90,
        hop: 1,
        valueUsd: 90,
        isVasp: false,
        category: "mixer",
      },
    ];
    const signals = detectSignals(nodes, []);
    expect(signals.map((s) => s.code)).toContain("MIXER_TOUCHPOINT");
    expect(signals[0]?.addresses).toContain("0xb");
  });

  it("raises nothing for a clean single-node graph", () => {
    const signals = detectSignals(
      [{ address: "0xa", chain: "ethereum", riskScore: 10, hop: 0, valueUsd: 10, isVasp: false }],
      [],
    );
    expect(signals).toHaveLength(0);
  });

  it("detects a splitting pattern from out-degree", () => {
    const edges = [1, 2, 3].map((i) => ({
      from: "0xa",
      to: `0x${i}`,
      txHash: `h${i}`,
      asset: "USDT",
      amount: 1,
      valueUsd: 1,
      timestamp: new Date("2026-01-01T00:00:00Z"),
      hop: 1,
    }));
    expect(detectSignals([], edges).map((s) => s.code)).toContain("PEELING_CHAIN");
  });
});

describe("risk scoring", () => {
  it("stays within 0–100 and rises with critical signals", () => {
    const nodes = [
      { address: "0xa", chain: "ethereum" as const, riskScore: 50, hop: 0, valueUsd: 1, isVasp: false },
    ];
    const low = scoreRisk(nodes, []);
    const high = scoreRisk(nodes, [
      {
        code: "MIXER_TOUCHPOINT",
        label: "x",
        severity: "critical",
        confidence: 1,
        addresses: [],
        explanation: "x",
      },
    ]);
    expect(low).toBeGreaterThanOrEqual(0);
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(100);
  });

  it("scores an empty graph as zero", () => {
    expect(scoreRisk([], [])).toBe(0);
  });
});

describe("full pipeline", () => {
  it("reports coherent metrics", () => {
    const result = runTrace(base);
    expect(result.metrics.addressesTouched).toBe(result.nodes.length);
    expect(result.metrics.hopsTraced).toBeLessThanOrEqual(base.maxHops);
    expect(result.metrics.retainedValuePct).toBeGreaterThanOrEqual(0);
    expect(result.metrics.retainedValuePct).toBeLessThanOrEqual(100);
    expect(result.riskScore).toBeGreaterThan(0);
  });
});

describe("evidence sealing", () => {
  it("is stable regardless of key order", () => {
    expect(checksumOf({ a: 1, b: [1, 2] })).toBe(checksumOf({ b: [1, 2], a: 1 }));
  });

  it("changes when the payload changes", () => {
    expect(checksumOf({ a: 1 })).not.toBe(checksumOf({ a: 2 }));
  });

  it("canonicalises nested structures deterministically", () => {
    expect(canonicalise({ z: 1, a: { c: 2, b: 3 } })).toBe('{"a":{"b":3,"c":2},"z":1}');
  });
});

describe("sequential identifiers", () => {
  it("formats readable, sortable references", () => {
    expect(formatSequentialId("case", 7, { year: 2026 })).toBe("CASE-2026-0007");
  });
});
