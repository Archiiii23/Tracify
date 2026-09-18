import { Router } from "express";
import * as intelligence from "../controllers/intelligence.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { heavyLimiter } from "../middleware/security.middleware";
import { validate } from "../middleware/validate.middleware";
import { addressParams, neighbourQuery } from "../validators/intelligence.schema";

export const intelligenceRouter = Router();

// Chain lookups leave the process, so they require a session and are throttled.
intelligenceRouter.use(requireAuth);

intelligenceRouter.get("/providers", intelligence.providers);

intelligenceRouter.get(
  "/addresses/:chain/:address",
  heavyLimiter,
  validate({ params: addressParams }),
  intelligence.address,
);

intelligenceRouter.get(
  "/addresses/:chain/:address/neighbours",
  heavyLimiter,
  validate({ params: addressParams, query: neighbourQuery }),
  intelligence.neighbours,
);
