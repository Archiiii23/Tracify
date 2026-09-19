import type { GeminiFunctionDeclaration } from "./types";

/** Controlled TRACIFY tools exposed to Gemini — no arbitrary API access. */
export const AGENT_TOOL_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: "validate_wallet",
    description:
      "Validate and normalize a wallet address for the given chain. Returns validity and address type only — never infers ownership.",
    parameters: {
      type: "object",
      properties: {
        chain: {
          type: "string",
          description: "Blockchain: ethereum, polygon, bsc, arbitrum, bitcoin, tron",
        },
        address: { type: "string", description: "Wallet address to validate" },
      },
      required: ["chain", "address"],
    },
  },
  {
    name: "get_wallet_summary",
    description:
      "Fetch structured wallet summary from TRACIFY chain providers: balances, tx counts, labels, coverage limits.",
    parameters: {
      type: "object",
      properties: {
        chain: { type: "string" },
        address: { type: "string" },
      },
      required: ["chain", "address"],
    },
  },
  {
    name: "get_transaction_history",
    description:
      "Fetch paginated transaction history for an address. Never claim full wallet history unless pagination_complete is true.",
    parameters: {
      type: "object",
      properties: {
        chain: { type: "string" },
        address: { type: "string" },
        direction: { type: "string", description: "all, in, or out" },
        limit: { type: "number", description: "Max records per page (default 25)" },
        page: { type: "number", description: "Page number starting at 1" },
        min_value_usd: { type: "number" },
      },
      required: ["chain", "address"],
    },
  },
  {
    name: "get_transaction_details",
    description: "Fetch details for a single transaction hash including provider and evidence reference.",
    parameters: {
      type: "object",
      properties: {
        chain: { type: "string" },
        tx_hash: { type: "string" },
      },
      required: ["chain", "tx_hash"],
    },
  },
  {
    name: "trace_fund_flow",
    description:
      "Run bounded deterministic fund-flow trace: graph expansion, path ranking, risk scoring. Paths come from TRACIFY only.",
    parameters: {
      type: "object",
      properties: {
        chain: { type: "string" },
        address: { type: "string" },
        direction: { type: "string", description: "outbound, inbound, or both" },
        max_hops: { type: "number", description: "Max traversal depth (default 3)" },
      },
      required: ["chain", "address"],
    },
  },
  {
    name: "analyze_risk",
    description:
      "Return behavioural risk signals from the latest trace. Must call trace_fund_flow first.",
    parameters: {
      type: "object",
      properties: {
        chain: { type: "string" },
        address: { type: "string" },
      },
      required: ["chain", "address"],
    },
  },
  {
    name: "get_vasp_candidates",
    description:
      "Return VASP/entity candidates from traced graph and address intelligence. Proximity does not equal ownership.",
    parameters: {
      type: "object",
      properties: {
        chain: { type: "string" },
        address: { type: "string" },
      },
      required: ["chain", "address"],
    },
  },
  {
    name: "get_investigation_status",
    description: "Return current agent run status, stage, tool call count, and accumulated facts summary.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
];

export const AGENT_SYSTEM_INSTRUCTION = `You are TRACIFY Investigation Intelligence, an AI assistant for blockchain investigations.

You do NOT have independent authority over blockchain facts. All blockchain facts MUST come from TRACIFY tools provided to you.

NEVER invent: transactions, wallets, addresses, amounts, timestamps, entities, VASP attribution, fund-flow relationships, evidence, or identities.

Treat tool results as OBSERVED evidence. Clearly distinguish in your final assessment:
- OBSERVED: directly from provider/tool output
- DERIVED: calculated from observed data (e.g. value continuity)
- INFERRED: analytical interpretation — label as hypothesis
- AI-ASSISTED: your summary language

Graph paths, risk scores, and VASP candidates MUST come from TRACIFY tools only.

If evidence is insufficient, state explicitly: "Insufficient evidence to establish attribution."

Do not claim a wallet belongs to an individual. Do not claim funds are stolen without case evidence. Do not claim fund recovery.

When concluding, cite transaction hashes and evidence from tool outputs.

Your job: orchestrate investigation tools, prioritize paths, explain patterns, identify gaps, and produce an auditable narrative for human review.

Suggested investigation plan:
1. validate_wallet
2. get_wallet_summary
3. get_transaction_history (request additional pages if has_more)
4. trace_fund_flow
5. analyze_risk
6. get_vasp_candidates
7. Produce final assessment with OBSERVED/DERIVED/INFERRED sections`;
