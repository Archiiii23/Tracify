/**
 * Central story configuration.
 *
 * Every chapter of the landing experience is described here: where the camera
 * is, what it looks at, which part of the world it occupies and what copy
 * overlays it. Tuning the journey means editing this file only — the scenes and
 * the camera controller read from it.
 *
 * The whole world lives on one axis: the journey travels from z ≈ +90 (the
 * void) to z ≈ -680 (the convergence). Scenes are placed at fixed depths so the
 * camera literally flies through them.
 */

export type Vec3 = [number, number, number];

export type OverlayAlign = "left" | "center" | "right";

export interface ChapterOverlay {
  align: OverlayAlign;
  /** Each entry is one visual line of the statement. */
  lines: string[];
  /** Optional second statement, revealed after the first. */
  lines2?: string[];
  note?: string;
  /** Small technical annotations rendered as an investigation side-note. */
  meta?: [string, string][];
  /** Capability points, rendered as a compact ticked list under the copy. */
  bullets?: string[];
  /** Investigation read-out docked in the lane opposite the copy. */
  panel?: {
    title: string;
    rows: [string, string][];
    footer?: string;
  };
}

export interface Chapter {
  id: string;
  /** Displayed as `04 / NETWORK` in the navigation. */
  label: string;
  /** Story progress at which this chapter's camera keyframe sits. */
  at: number;
  /** Progress range the overlay copy is visible for. */
  start: number;
  end: number;
  camera: Vec3;
  target: Vec3;
  overlay?: ChapterOverlay;
}

/** World depths — scenes are authored around these anchors. */
export const DEPTH = {
  voidField: -260,
  dataField: -90,
  signal: -196,
  traceFrom: -206,
  traceTo: -292,
  network: -336,
  cluster: -378,
  context: -424,
  vasp: -488,
  filtering: -548,
  evidence: -606,
  reveal: -668,
} as const;

export const CHAPTERS: Chapter[] = [
  {
    id: "void",
    label: "VOID",
    at: 0,
    start: 0,
    end: 0.075,
    camera: [0, 0, 92],
    target: [0, 0, -40],
    overlay: {
      align: "left",
      lines: ["A TRANSACTION", "IS ONLY THE BEGINNING."],
      note: "Somewhere in an immutable ledger, illicit value has moved. Scroll to breach the gateway and enter the network.",
      meta: [
        ["GATEWAY", "ACTIVE // Z=55"],
        ["VECTORS", "MULTI-CHAIN"],
      ],
      bullets: [
        "Multi-chain ingestion across EVM, TRON and Bitcoin",
        "Bounded hop tracing with full provenance",
        "Court-ready evidence from the first click",
      ],
      panel: {
        title: "INVESTIGATION CASE",
        rows: [
          ["INCIDENT", "UNAUTHORIZED DRAIN"],
          ["VECTOR", "ETH · TRON · POLYGON"],
          ["INITIAL LOSS", "42,500 USDT"],
          ["TARGET GATE", "LOCKED // READY"],
        ],
        footer: "Scroll down to fly into the network",
      },
    },
  },
  {
    id: "enter",
    label: "ENTERING",
    at: 0.08,
    start: 0.085,
    end: 0.16,
    camera: [3, 1.5, 34],
    target: [0, 0, -70],
    overlay: {
      align: "center",
      lines: ["THE NETWORK", "IS ALREADY MOVING."],
      note: "Blocks settle. Value hops. Nothing waits for an investigator.",
      meta: [
        ["BLOCK", "#2,198,432"],
        ["MEMPOOL", "14,209 TX"],
      ],
      panel: {
        title: "LIVE FEED",
        rows: [
          ["THROUGHPUT", "38 TX / SEC"],
          ["WATCHLIST HITS", "12"],
          ["NEW ADDRESSES", "1,844"],
          ["LATENCY", "1.2 S"],
        ],
        footer: "Streaming ledger state",
      },
    },
  },
  {
    id: "data",
    label: "DATA EXPLOSION",
    at: 0.18,
    start: 0.185,
    end: 0.27,
    camera: [-4, 2.5, -52],
    target: [1, 0, -150],
    overlay: {
      align: "left",
      lines: ["EVERYTHING IS VISIBLE."],
      lines2: ["ALMOST NOTHING", "IS CLEAR."],
      note: "Millions of transfers, fully transparent and completely unreadable.",
      meta: [
        ["FIELD", "1.4M TRANSFERS"],
        ["CONTEXT", "NONE"],
      ],
      bullets: [
        "Normalises every chain into one transfer model",
        "Deduplicates internal calls and token wrappers",
        "Indexes counterparties before you ask a question",
      ],
      panel: {
        title: "RAW FIELD",
        rows: [
          ["TRANSFERS", "1,412,908"],
          ["ADDRESSES", "268,441"],
          ["TOKENS", "94"],
          ["SIGNAL / NOISE", "0.0004"],
        ],
        footer: "Transparency is not clarity",
      },
    },
  },
  {
    id: "signal",
    label: "THE SIGNAL",
    at: 0.3,
    start: 0.295,
    end: 0.375,
    camera: [7, 2, -166],
    target: [-2, 0, -198],
    overlay: {
      align: "right",
      lines: ["SOMEWHERE", "INSIDE THE NOISE"],
      lines2: ["THERE IS A SIGNAL."],
      note: "One address behaves differently. The rest of the field goes quiet.",
      meta: [
        ["ADDRESS", "0x8F29…C12"],
        ["SIGNAL", "ANOMALOUS OUTFLOW"],
      ],
      bullets: [
        "Behavioural baselines per address, not global rules",
        "Peeling, layering and structuring detectors",
        "Every signal carries the evidence that raised it",
      ],
      panel: {
        title: "SIGNAL CARD",
        rows: [
          ["FIRST SEEN", "2026-02-11 04:18Z"],
          ["OUTFLOW BURST", "9 TX / 6 MIN"],
          ["PEER OVERLAP", "0.81"],
          ["RISK", "78 / 100"],
        ],
        footer: "Anomaly promoted to lead",
      },
    },
  },
  {
    id: "trace",
    label: "THE TRACE",
    at: 0.4,
    start: 0.4,
    end: 0.485,
    camera: [6, 2.5, -212],
    target: [0, 1, -262],
    overlay: {
      align: "left",
      lines: ["FOLLOW THE FLOW."],
      lines2: ["NOT JUST", "THE DATA."],
      note: "The camera rides the value, hop by hop, through the wallets that carried it.",
      meta: [
        ["VALUE MOVED", "42,500 USDT"],
        ["HOP", "03 / 06"],
        ["RISK SIGNAL", "HIGH"],
      ],
      bullets: [
        "Bounded hop expansion keeps traces defensible",
        "Value continuity survives swaps and bridges",
        "Each hop timestamped and source-linked",
      ],
      panel: {
        title: "HOP LEDGER",
        rows: [
          ["HOP 01", "VICTIM → 0x8F29"],
          ["HOP 02", "0x8F29 → 0x41BA"],
          ["HOP 03", "SPLIT · 4 WAYS"],
          ["RETAINED VALUE", "86%"],
        ],
        footer: "Continuity preserved end to end",
      },
    },
  },
  {
    id: "network",
    label: "THE NETWORK",
    at: 0.52,
    start: 0.505,
    end: 0.585,
    camera: [34, 15, -304],
    target: [0, 0, -336],
    overlay: {
      align: "right",
      lines: ["ONE ADDRESS."],
      lines2: ["MANY CONNECTIONS."],
      note: "The linear path was only a thread inside a far larger topology.",
      meta: [
        ["NODES IN VIEW", "1,000"],
        ["EDGES", "3,412"],
      ],
      panel: {
        title: "TOPOLOGY",
        rows: [
          ["DEGREE (MAX)", "184"],
          ["BRIDGES", "6"],
          ["MIXER TOUCHPOINTS", "2"],
          ["SUBGRAPHS", "11"],
        ],
        footer: "One thread inside a network",
      },
    },
  },
  {
    id: "cluster",
    label: "THE CLUSTER",
    at: 0.62,
    start: 0.6,
    end: 0.675,
    camera: [-30, 9, -362],
    target: [0, 0, -378],
    overlay: {
      align: "left",
      lines: ["PATTERNS EMERGE"],
      lines2: ["WHEN CONNECTIONS", "ARE SEEN TOGETHER."],
      note: "Addresses reorganise into a single controlling entity.",
      meta: [
        ["ADDRESSES", "38"],
        ["ENTITY CANDIDATE", "CONFIRMED"],
      ],
      bullets: [
        "Co-spend and timing heuristics with confidence scores",
        "Entity merges are reversible and fully audited",
        "Cluster-level risk instead of address whack-a-mole",
      ],
      panel: {
        title: "ENTITY",
        rows: [
          ["LABEL", "DRAINER-OPS 04"],
          ["MEMBERS", "38 ADDRESSES"],
          ["HEURISTIC", "CO-SPEND + TIMING"],
          ["CONFIDENCE", "0.88"],
        ],
        footer: "Every merge is auditable",
      },
    },
  },
  {
    id: "context",
    label: "CONTEXT",
    at: 0.7,
    start: 0.69,
    end: 0.755,
    camera: [0, 2, -404],
    target: [0, 0, -452],
    overlay: {
      align: "center",
      lines: ["DATA TELLS YOU", "WHAT HAPPENED."],
      lines2: ["CONTEXT TELLS YOU", "WHY IT MATTERS."],
      note: "Behaviour, relationships and attribution stack over the raw graph.",
      panel: {
        title: "CONTEXT LAYERS",
        rows: [
          ["ATTRIBUTION", "14 LABELS"],
          ["SANCTIONS", "1 MATCH"],
          ["VICTIM REPORTS", "6 LINKED"],
          ["OSINT", "3 SOURCES"],
        ],
        footer: "Layered over the raw graph",
      },
    },
  },
  {
    id: "vasp",
    label: "VASP CONNECTION",
    at: 0.78,
    start: 0.77,
    end: 0.835,
    camera: [12, 6, -462],
    target: [0, 0, -492],
    overlay: {
      align: "right",
      lines: ["FOLLOW THE ADDRESS."],
      lines2: ["UNDERSTAND", "THE DESTINATION."],
      note: "The flow terminates at a regulated service. That is where an investigation becomes actionable.",
      meta: [
        ["SERVICE INTERACTION", "DEPOSIT"],
        ["ATTRIBUTION", "0.92 CONFIDENCE"],
      ],
      bullets: [
        "Deposit-address attribution with confidence bands",
        "Jurisdiction and licensing context per service",
        "Exportable request packs for compliance teams",
      ],
      panel: {
        title: "SERVICE",
        rows: [
          ["TYPE", "CENTRALISED VASP"],
          ["JURISDICTION", "EU · MICA"],
          ["EXPOSURE", "31,900 USDT"],
          ["NEXT STEP", "INFO REQUEST"],
        ],
        footer: "Where a trace becomes actionable",
      },
    },
  },
  {
    id: "intelligence",
    label: "INTELLIGENCE",
    at: 0.86,
    start: 0.85,
    end: 0.905,
    camera: [0, 22, -486],
    target: [0, 0, -552],
    overlay: {
      align: "left",
      lines: ["NOT EVERY PATH", "MATTERS."],
      lines2: ["CLARITY", "IS THE ABILITY", "TO IGNORE THE NOISE."],
      note: "Scoring collapses a thousand candidates into the one path you can defend.",
      bullets: [
        "Path ranking by value, risk and hop economy",
        "Noise suppressed, never deleted — always reversible",
        "Every score explains itself in plain language",
      ],
      panel: {
        title: "PATH RANKING",
        rows: [
          ["CANDIDATES", "1,000 → 1"],
          ["TOP PATH SCORE", "0.94"],
          ["HOPS", "6"],
          ["SUPPRESSED", "993 (RECOVERABLE)"],
        ],
        footer: "Prioritised, not hidden",
      },
    },
  },
  {
    id: "evidence",
    label: "EVIDENCE",
    at: 0.93,
    start: 0.92,
    end: 0.962,
    camera: [0, 3.5, -580],
    target: [0, 0, -616],
    overlay: {
      align: "center",
      lines: ["A TRACE", "IS NOT A CASE"],
      lines2: ["UNTIL YOU", "CAN EXPLAIN IT."],
      note: "Findings, exhibits and narrative assemble into one defensible package.",
      panel: {
        title: "EVIDENCE PACK",
        rows: [
          ["FINDINGS", "6 RECORDED"],
          ["EXHIBITS", "11 PINNED"],
          ["CHAIN OF CUSTODY", "SEALED"],
          ["EXPORT", "PDF · CSV · JSON"],
        ],
        footer: "Reproducible by a third party",
      },
    },
  },
  {
    id: "reveal",
    label: "CONVERGENCE",
    at: 1,
    start: 0.968,
    end: 1,
    camera: [0, 0, -622],
    target: [0, 0, -672],
  },
];

/** Filtering counters, shown as world typography during the intelligence chapter. */
export const FILTER_STEPS: { at: number; value: string; caption: string }[] = [
  { at: 0.852, value: "1000", caption: "NODES" },
  { at: 0.868, value: "247", caption: "RELEVANT" },
  { at: 0.882, value: "38", caption: "CONNECTED" },
  { at: 0.894, value: "7", caption: "HIGH PRIORITY" },
  { at: 0.908, value: "1", caption: "CRITICAL PATH" },
];

/** Spatial data fragments scattered through the data universe. */
export const DATA_FRAGMENTS = [
  "0x8F29…C12",
  "TX",
  "USDT",
  "ETH",
  "BLOCK #2198432",
  "$42,500",
  "HOP 02",
  "POLYGON",
  "0x41BA…9D7",
  "TRON",
  "MIXER?",
  "NONCE 41",
];

export function chapterAt(p: number): Chapter {
  let found = CHAPTERS[0]!;
  for (const c of CHAPTERS) if (p >= c.at - 0.02) found = c;
  return found;
}

export const chapterNumber = (c: Chapter) =>
  String(CHAPTERS.indexOf(c)).padStart(2, "0");
