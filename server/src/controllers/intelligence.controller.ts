import { providerStatus } from "../services/blockchain";
import { lookupAddress, lookupNeighbours } from "../services/intelligence.query.service";
import type { Chain } from "../models/Investigation.model";
import { sendSuccess } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";

/** Which chain-data provider serves each chain, and whether it is reachable. */
export const providers = asyncHandler(async (_req, res) => {
  sendSuccess(res, "Chain data providers", await providerStatus());
});

export const address = asyncHandler(async (req, res) => {
  const params = req.params as unknown as { chain: Chain; address: string };
  sendSuccess(res, "Address intelligence", await lookupAddress(params.chain, params.address));
});

export const neighbours = asyncHandler(async (req, res) => {
  const params = req.params as unknown as { chain: Chain; address: string };
  const query = req.query as unknown as {
    direction: "in" | "out";
    limit: number;
    minValueUsd?: number;
  };
  sendSuccess(
    res,
    "Address counterparties",
    await lookupNeighbours(params.chain, params.address, {
      direction: query.direction,
      limit: query.limit,
      ...(query.minValueUsd !== undefined ? { minValueUsd: query.minValueUsd } : {}),
    }),
  );
});
