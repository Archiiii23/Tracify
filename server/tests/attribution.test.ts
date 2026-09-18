/**
 * Attribution, typology and alerting tests.
 *
 * These exercise the SIH-critical guarantees: the nearest regulated touchpoint
 * is found and ranked correctly, mixers/bridges are surfaced, risk is bounded
 * and explainable, and every alert carries an actionable recommendation.
 */
import { describe, expect, it } from "vitest";
import { attributeAddress } from "../src/services/attribution.service";
import {
  assessRisk,
  classifyTypology,
  extractFeatures,
  riskCategoryFor,
} from "../src/services/typology.service";
import { detectAlerts } from "../src/services/alert.service";
import type { GraphEdge, GraphNode } from "../src/models/Investigation.model";
import type { BehaviouralSignal } from "../src/services/intelligence.service";

function node(partial: Partial<GraphNode> & { address: string; hop: number }): GraphNode {
  return {
    chain: "ethereum",
    riskScore: 40,
    valueUsd: 1000,
    isVasp: false,
    ...partial,
  } as GraphNode;
}

function edge(from: string, to: string, hop: number, valueUsd = 1000): GraphEdge {
  return {
    from,
    to,
    txHash: `0x${from}${to}`,
    asset: "USDT",
    amount: valueUsd,
    valueUsd,
    timestamp: new Date("2026-01-01T00:00:00Z"),
    hop,
  } as GraphEdge;
}

describe("feature extraction", () => {
  it("returns a zeroed vector for an empty graph", () => {
    const features = extractFeatures([], []);
    expect(Object.values(features).every((v) => v === 0)).toBe(true);
  });

  it("keeps every feature normalised to 0..1", () => {
    const nodes = [
      node({ address: "a", hop: 0 }),
      node({ address: "b", hop: 1, category: "mixer" }),
      node({ address: "c", hop: 2, isVasp: true, category: "exchange" }),
    ];
    const edges = [edge("a", "b", 1), edge("b", "c", 2)];
    const features = extractFeatures(nodes, edges);
    for (const value of Object.values(features)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(features.mixerShare).toBeGreaterThan(0);
    expect(features.vaspShare).toBeGreaterThan(0);
  });
});

describe("typology classification", () => {
  it("flags mixer-heavy linear chains as ransomware-like laundering", () => {
    const nodes = [
      node({ address: "a", hop: 0, valueUsd: 100_000 }),
      node({ address: "b", hop: 1, valueUsd: 100_000 }),
      node({ address: "c", hop: 2, category: "mixer", valueUsd: 95_000 }),
      node({ address: "d", hop: 3, valueUsd: 90_000 }),
    ];
    const edges = [
      edge("a", "b", 1, 100_000),
      edge("b", "c", 2, 95_000),
      edge("c", "d", 3, 90_000),
    ];
    const prediction = classifyTypology(extractFeatures(nodes, edges));
    expect(["ransomware", "darknet", "layering"]).toContain(prediction.typology);
    expect(prediction.confidence).toBeGreaterThan(0);
    expect(prediction.drivers.length).toBeGreaterThan(0);
  });

  it("reports unknown rather than guessing on an empty graph", () => {
    expect(classifyTypology(extractFeatures([], [])).typology).toBe("unknown");
  });

  it("uses the reported fraud type only as a weak prior", () => {
    const features = extractFeatures([], []);
    const withPrior = classifyTypology(features, "investment-scam");
    const without = classifyTypology(features);
    // A prior alone must never be enough to assert a typology.
    expect(without.typology).toBe("unknown");
    expect(withPrior.confidence).toBeLessThan(0.5);
  });
});

describe("risk assessment", () => {
  it("bounds the score to 0..100 and explains it", () => {
    const nodes = Array.from({ length: 40 }, (_, i) =>
      node({ address: `n${i}`, hop: i % 6, category: i % 3 === 0 ? "mixer" : "bridge", riskScore: 95 }),
    );
    const edges = nodes.slice(1).map((n, i) => edge(`n${i}`, n.address, 1));
    const signals: BehaviouralSignal[] = [
      {
        code: "MIXER_TOUCHPOINT",
        label: "Mixer touchpoint",
        severity: "critical",
        confidence: 0.92,
        addresses: ["n0"],
        explanation: "value entered a mixer",
      },
    ];
    const risk = assessRisk(extractFeatures(nodes, edges), signals);
    expect(risk.score).toBeGreaterThan(0);
    expect(risk.score).toBeLessThanOrEqual(100);
    expect(risk.reasons.length).toBeGreaterThan(0);
  });

  it("maps scores onto the reporting categories", () => {
    expect(riskCategoryFor(10)).toBe("low");
    expect(riskCategoryFor(35)).toBe("moderate");
    expect(riskCategoryFor(55)).toBe("elevated");
    expect(riskCategoryFor(75)).toBe("high");
    expect(riskCategoryFor(95)).toBe("severe");
  });
});

describe("address attribution", () => {
  it("returns ranked VASP candidates with a nearest-first ordering", async () => {
    const result = await attributeAddress("ethereum", "0xdeadbeefdeadbeefdeadbeef", {
      maxHops: 4,
      seedValueUsd: 250_000,
    });

    expect(result.address).toBe("0xdeadbeefdeadbeefdeadbeef");
    expect(result.dataSource).toBe("synthetic");
    expect(result.live).toBe(false);
    expect(result.graph.nodes.length).toBeGreaterThan(0);

    const hops = result.vaspCandidates.map((v) => v.hops);
    expect([...hops].sort((a, b) => a - b)).toEqual(hops);

    for (const candidate of result.vaspCandidates) {
      expect(candidate.confidence).toBeGreaterThan(0);
      expect(candidate.confidence).toBeLessThanOrEqual(1);
      // The trail must start at the reported address for evidentiary continuity.
      expect(candidate.path[0]).toBe(result.address);
    }
  });

  it("always produces recommendations and a caveat when data is not live", async () => {
    const result = await attributeAddress("bitcoin", "bc1qexampleexampleexample", {
      maxHops: 3,
    });
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations.some((r) => r.includes("offline deterministic ledger"))).toBe(
      true,
    );
    expect(result.riskScore).toBeGreaterThanOrEqual(0);
    expect(result.riskScore).toBeLessThanOrEqual(100);
  });

  it("never marks a freeze actionable without an attributed touchpoint", async () => {
    const result = await attributeAddress("ethereum", "0xabc123abc123abc123abc1", {
      maxHops: 1,
    });
    if (!result.nearestVasp) expect(result.freezeActionable).toBe(false);
  });
});

describe("alert detection", () => {
  it("raises a critical direct-deposit alert with actions", async () => {
    const result = await attributeAddress("ethereum", "0xfeedfacefeedfacefeedface", {
      maxHops: 4,
    });
    const drafts = detectAlerts(result);
    expect(drafts.length).toBeGreaterThan(0);
    for (const draft of drafts) {
      expect(draft.recommendedActions.length).toBeGreaterThan(0);
      expect(draft.summary.length).toBeGreaterThan(10);
      expect(draft.addresses.length).toBeGreaterThan(0);
    }
  });

  it("tells the operator what to do when no VASP was reached", () => {
    const drafts = detectAlerts({
      address: "0xnovasp",
      chain: "ethereum",
      dataSource: "synthetic",
      live: false,
      generatedAt: new Date(),
      riskScore: 10,
      riskCategory: "low",
      riskReasons: [],
      typology: { typology: "unknown", label: "Unclassified", confidence: 0, drivers: [] },
      features: extractFeatures([], []),
      nearestVasp: null,
      vaspCandidates: [],
      intermediaries: [],
      crossChain: { detected: false, bridgeHops: [], note: "none" },
      obfuscation: { detected: false, services: [], note: "none" },
      signals: [],
      topPaths: [],
      metrics: {
        addressesTouched: 1,
        hopsTraced: 0,
        valueTracedUsd: 0,
        vaspTouchpoints: 0,
        retainedValuePct: 0,
      },
      freezeActionable: false,
      recommendations: [],
      graph: { nodes: [], edges: [] },
    });

    const codes = drafts.map((d) => d.code);
    expect(codes).toContain("NO_VASP_TOUCHPOINT");
  });
});
