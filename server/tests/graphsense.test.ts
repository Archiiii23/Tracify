/**
 * GraphSense adapter and provider-driven expansion.
 *
 * `fetch` is stubbed with recorded-shape GraphSense payloads so the mapping,
 * error translation and BFS value continuity are all verified without a live
 * ledger index.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GraphSenseProvider } from "../src/services/blockchain/graphsense.provider";
import { syntheticProvider } from "../src/services/blockchain/synthetic.provider";
import {
  expandGraphFromProvider,
  traceWithProvider,
} from "../src/services/blockchain/expansion";
import {
  getChainProvider,
  providerStatus,
  resetProviders,
  setGraphSenseProvider,
} from "../src/services/blockchain";
import { baselineRisk } from "../src/services/blockchain/types";
import { ApiError } from "../src/utils/ApiError";

const ROOT = "0x8f29c1200000000000000000000000000000ab12";
const SERVICE = "0x41ba9d70000000000000000000000000000cd934";
const MIXER = "0x77aa4410000000000000000000000000000ef551";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function addressPayload(address: string, tag?: Record<string, unknown>) {
  return {
    address,
    balance: { value: 1200, fiat_values: [{ code: "eur", value: 900 }, { code: "usd", value: 1000 }] },
    total_received: { value: 5, fiat_values: [{ code: "usd", value: 51_000 }] },
    total_spent: { value: 4, fiat_values: [{ code: "usd", value: 42_500 }] },
    no_incoming_txs: 12,
    no_outgoing_txs: 9,
    in_degree: 3,
    out_degree: 4,
    first_tx: { timestamp: 1_770_000_000 },
    last_tx: { timestamp: 1_771_000_000 },
    is_contract: false,
    ...(tag ? { best_address_tag: tag } : {}),
  };
}

function neighboursPayload(entries: [string, number, string | undefined][]) {
  return {
    neighbors: entries.map(([address, value, category]) => ({
      address: {
        address,
        ...(category
          ? { best_address_tag: { label: `${category} service`, category, confidence_level: 90 } }
          : {}),
      },
      value: { value: value / 1000, fiat_values: [{ code: "usd", value }] },
      no_txs: 3,
    })),
  };
}

function provider(): GraphSenseProvider {
  return new GraphSenseProvider("https://gs.test", "test-key", 5000);
}

describe("GraphSense adapter — response mapping", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalises an address, picking USD out of the fiat array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/tags?pagesize=20")
          ? jsonResponse({
              address_tags: [
                { label: "Aurora Exchange", category: "exchange", actor: "aurora", confidence_level: 95 },
                { label: "seen in forum", confidence: "web_crawl" },
              ],
            })
          : jsonResponse(addressPayload(ROOT)),
      ),
    );

    const summary = await provider().getAddress("ethereum", ROOT);

    expect(summary.balanceUsd).toBe(1000);
    expect(summary.totalSentUsd).toBe(42_500);
    expect(summary.inDegree).toBe(3);
    expect(summary.firstSeen?.toISOString()).toBe(new Date(1_770_000_000_000).toISOString());
    // The highest-confidence tag drives label, entity and service classification.
    expect(summary.label).toBe("aurora");
    expect(summary.category).toBe("exchange");
    expect(summary.isVasp).toBe(true);
    expect(summary.tags).toHaveLength(2);
  });

  it("still returns a node when tag lookup fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/tags")
          ? jsonResponse({ message: "boom" }, 500)
          : jsonResponse(addressPayload(ROOT, { label: "wallet", category: "personal_wallet", confidence_level: 60 })),
      ),
    );

    const summary = await provider().getAddress("ethereum", ROOT);
    expect(summary.category).toBe("personal_wallet");
    expect(summary.isVasp).toBe(false);
  });

  it("ranks neighbours by value, applies the floor and honours the limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          neighboursPayload([
            [SERVICE, 30_000, "exchange"],
            [MIXER, 9_000, "mixer"],
            ["0xaaa0000000000000000000000000000000000001", 40, undefined],
          ]),
        ),
      ),
    );

    const neighbours = await provider().getNeighbours({
      chain: "ethereum",
      address: ROOT,
      direction: "out",
      limit: 2,
      minValueUsd: 100,
    });

    expect(neighbours.map((n) => n.address)).toEqual([SERVICE, MIXER]);
    expect(neighbours[0]?.valueUsd).toBe(30_000);
    expect(neighbours[0]?.isVasp).toBe(true);
    expect(neighbours[1]?.isVasp).toBe(false);
    expect(neighbours[1]?.category).toBe("mixer");
  });

  it("prefers token fiat totals over the native value when larger", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          neighbors: [
            {
              address: { address: SERVICE },
              value: { value: 0, fiat_values: [{ code: "usd", value: 0 }] },
              token_values: { usdt: { value: 42_500, fiat_values: [{ code: "usd", value: 42_500 }] } },
              no_txs: 1,
            },
          ],
        }),
      ),
    );

    const [neighbour] = await provider().getNeighbours({
      chain: "ethereum",
      address: ROOT,
      direction: "out",
      limit: 5,
    });
    expect(neighbour?.valueUsd).toBe(42_500);
  });

  it("only claims the chains GraphSense actually indexes", () => {
    const gs = provider();
    expect(gs.supports("ethereum")).toBe(true);
    expect(gs.supports("bitcoin")).toBe(true);
    expect(gs.supports("tron")).toBe(true);
    expect(gs.supports("polygon")).toBe(false);
    expect(gs.supports("arbitrum")).toBe(false);
  });
});

describe("GraphSense adapter — failure translation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps 404 to a not-found error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 404)));
    await expect(provider().getAddress("ethereum", ROOT)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("maps credential rejection to 502 without leaking the provider body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ secret: "key invalid" }, 403)));
    const error = await provider()
      .getAddress("ethereum", ROOT)
      .catch((e: unknown) => e as ApiError);
    expect((error as ApiError).statusCode).toBe(502);
    expect((error as ApiError).message).not.toContain("secret");
  });

  it("surfaces provider throttling as 429", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 429)));
    await expect(provider().getAddress("ethereum", ROOT)).rejects.toMatchObject({ statusCode: 429 });
  });

  it("retries once on a network failure, then reports the provider unreachable", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(provider().getAddress("ethereum", ROOT)).rejects.toMatchObject({ statusCode: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a 500 once and succeeds on the retry", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call += 1;
        if (call === 1) return jsonResponse({}, 500);
        return jsonResponse({ address_tags: [] });
      }),
    );
    await expect(provider().getTags("ethereum", ROOT)).resolves.toEqual([]);
    expect(call).toBe(2);
  });

  it("sends the API key and never puts it in the URL", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ address_tags: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await provider().getTags("ethereum", ROOT);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("test-key");
    expect((init.headers as Record<string, string>)['Authorization']).toBe("test-key");
  });

  it("refuses chains it does not index instead of guessing an endpoint", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    await expect(provider().getAddress("polygon", ROOT)).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("provider-driven expansion", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubLedger() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/neighbors")) {
          if (url.includes(SERVICE) || url.includes(MIXER)) return jsonResponse({ neighbors: [] });
          return jsonResponse(
            neighboursPayload([
              [SERVICE, 30_000, "exchange"],
              [MIXER, 12_500, "mixer"],
            ]),
          );
        }
        if (url.includes("/tags")) return jsonResponse({ address_tags: [] });
        return jsonResponse(addressPayload(ROOT));
      }),
    );
  }

  it("preserves value continuity across hops", async () => {
    stubLedger();
    const { nodes, edges } = await expandGraphFromProvider(provider(), {
      rootAddress: ROOT,
      chain: "ethereum",
      maxHops: 3,
      minValueUsd: 0,
      direction: "outbound",
      seedValueUsd: 42_500,
    });

    const root = nodes.find((n) => n.address === ROOT);
    expect(root?.valueUsd).toBe(42_500);
    const hop1 = edges.filter((e) => e.hop === 1).reduce((acc, e) => acc + e.valueUsd, 0);
    // Distributed proportionally to observed value, never invented.
    expect(hop1).toBeLessThanOrEqual(42_500);
    expect(hop1).toBeGreaterThan(42_000);
  });

  it("terminates at regulated services and respects the hop bound", async () => {
    stubLedger();
    const { nodes, edges } = await expandGraphFromProvider(provider(), {
      rootAddress: ROOT,
      chain: "ethereum",
      maxHops: 2,
      minValueUsd: 0,
      direction: "outbound",
      seedValueUsd: 10_000,
    });

    expect(Math.max(...nodes.map((n) => n.hop))).toBeLessThanOrEqual(2);
    expect(nodes.find((n) => n.address === SERVICE)?.isVasp).toBe(true);
    // No edge leaves the service node.
    expect(edges.some((e) => e.from === SERVICE)).toBe(false);
  });

  it("produces ranked paths, signals and a bounded risk score", async () => {
    stubLedger();
    const result = await traceWithProvider(provider(), {
      rootAddress: ROOT,
      chain: "ethereum",
      maxHops: 3,
      minValueUsd: 0,
      direction: "outbound",
      seedValueUsd: 42_500,
    });

    expect(result.source).toBe("graphsense");
    expect(result.paths.length).toBeGreaterThan(0);
    expect(result.signals.map((s) => s.code)).toContain("MIXER_TOUCHPOINT");
    expect(result.riskScore).toBeGreaterThan(0);
    expect(result.riskScore).toBeLessThanOrEqual(100);
    expect(result.metrics.vaspTouchpoints).toBeGreaterThan(0);
  });

  it("does not revisit an address that appears twice in the graph", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/neighbors")) return jsonResponse(neighboursPayload([[SERVICE, 1_000, undefined]]));
        if (url.includes("/tags")) return jsonResponse({ address_tags: [] });
        return jsonResponse(addressPayload(ROOT));
      }),
    );

    const { nodes } = await expandGraphFromProvider(provider(), {
      rootAddress: ROOT,
      chain: "ethereum",
      maxHops: 4,
      minValueUsd: 0,
      direction: "outbound",
      seedValueUsd: 5_000,
    });
    expect(nodes.filter((n) => n.address === SERVICE)).toHaveLength(1);
  });
});

describe("provider registry", () => {
  afterEach(() => resetProviders());

  it("falls back to the synthetic provider when GraphSense is absent", () => {
    setGraphSenseProvider(null);
    expect(getChainProvider("ethereum").id).toBe("synthetic");
  });

  it("uses GraphSense only for the chains it indexes", () => {
    setGraphSenseProvider(provider());
    expect(getChainProvider("bitcoin").id).toBe("graphsense");
    expect(getChainProvider("polygon").id).toBe("synthetic");
  });

  it("reports coverage and reachability", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ currencies: [] })));
    setGraphSenseProvider(provider());
    const status = await providerStatus();
    expect(status.graphsense.configured).toBe(true);
    expect(status.graphsense.reachable).toBe(true);
    expect(status.resolution.polygon).toBe("synthetic");
    expect(status.resolution.ethereum).toBe("graphsense");
    vi.unstubAllGlobals();
  });

  it("marks an unreachable provider without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, 503)));
    setGraphSenseProvider(provider());
    const status = await providerStatus();
    expect(status.graphsense.reachable).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("synthetic provider", () => {
  it("is deterministic and needs no network", async () => {
    const first = await syntheticProvider.getNeighbours({
      chain: "ethereum",
      address: ROOT,
      direction: "out",
      limit: 5,
    });
    const second = await syntheticProvider.getNeighbours({
      chain: "ethereum",
      address: ROOT,
      direction: "out",
      limit: 5,
    });
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
  });

  it("summarises an address with outbound totals", async () => {
    const summary = await syntheticProvider.getAddress("bitcoin", "bc1qexampleaddress0000");
    expect(summary.chain).toBe("bitcoin");
    expect(summary.outDegree).toBeGreaterThan(0);
  });
});

describe("attribution-driven baseline risk", () => {
  it("scores illicit attribution above obfuscation above plain services", () => {
    expect(baselineRisk("sanctions", 0)).toBeGreaterThan(baselineRisk("mixer", 0));
    expect(baselineRisk("mixer", 0)).toBeGreaterThan(baselineRisk("exchange", 0));
    expect(baselineRisk(undefined, 0)).toBeLessThan(baselineRisk("exchange", 0));
    expect(baselineRisk("sanctions", 9)).toBeLessThanOrEqual(99);
  });
});
