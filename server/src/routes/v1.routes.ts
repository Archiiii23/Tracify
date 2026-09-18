import { Router } from "express";
import * as blockchain from "../controllers/blockchain.controller";
import * as investigations from "../controllers/investigation.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { heavyLimiter } from "../middleware/security.middleware";
import { objectIdParam, validate } from "../middleware/validate.middleware";
import { startInvestigationSchema } from "../validators/investigation.schema";
import { addressParams, txListQuery } from "../validators/blockchain.schema";

/**
 * v1 API aliases — stable contract for integrators and the TRACIFY frontend.
 * Wraps existing handlers; does not duplicate business logic.
 */
export const v1Router = Router();

v1Router.use(requireAuth);

v1Router.post(
  "/investigations",
  heavyLimiter,
  validate({ body: startInvestigationSchema }),
  investigations.start,
);

v1Router.get(
  "/investigations/:id/status",
  validate({ params: objectIdParam }),
  investigations.status,
);

v1Router.get(
  "/wallets/:chain/:address/history",
  heavyLimiter,
  validate({ params: addressParams, query: txListQuery }),
  blockchain.walletHistory,
);
