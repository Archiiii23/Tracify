import { Router } from "express";
import * as blockchain from "../controllers/blockchain.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { heavyLimiter } from "../middleware/security.middleware";
import { validate } from "../middleware/validate.middleware";
import {
  addressParams,
  multiChainSearchQuery,
  neighbourQuery,
  quickTraceQuery,
  txHashParams,
  txListQuery,
} from "../validators/blockchain.schema";

export const blockchainRouter = Router();

// Blockchain queries touch node indexes and are secured & rate-limited
blockchainRouter.use(requireAuth);

blockchainRouter.get("/providers", blockchain.providers);

blockchainRouter.get(
  "/search",
  heavyLimiter,
  validate({ query: multiChainSearchQuery }),
  blockchain.search,
);

blockchainRouter.get(
  "/transactions/:chain/:txHash",
  heavyLimiter,
  validate({ params: txHashParams }),
  blockchain.transaction,
);

blockchainRouter.get(
  "/addresses/:chain/:address",
  heavyLimiter,
  validate({ params: addressParams }),
  blockchain.address,
);

blockchainRouter.get(
  "/addresses/:chain/:address/transactions",
  heavyLimiter,
  validate({ params: addressParams, query: txListQuery }),
  blockchain.transactions,
);

blockchainRouter.get(
  "/addresses/:chain/:address/neighbours",
  heavyLimiter,
  validate({ params: addressParams, query: neighbourQuery }),
  blockchain.neighbours,
);

blockchainRouter.get(
  "/addresses/:chain/:address/trace",
  heavyLimiter,
  validate({ params: addressParams, query: quickTraceQuery }),
  blockchain.trace,
);
