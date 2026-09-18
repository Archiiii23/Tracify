import { Router } from "express";
import * as investigations from "../controllers/investigation.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { heavyLimiter } from "../middleware/security.middleware";
import { objectIdParam, validate } from "../middleware/validate.middleware";
import {
  investigationListQuery,
  startInvestigationSchema,
} from "../validators/investigation.schema";

export const investigationRouter = Router();

investigationRouter.use(requireAuth);

investigationRouter.get("/", validate({ query: investigationListQuery }), investigations.index);
// Tracing is the expensive operation: throttled separately from ordinary reads.
investigationRouter.post(
  "/",
  heavyLimiter,
  validate({ body: startInvestigationSchema }),
  investigations.start,
);
investigationRouter.get("/:id", validate({ params: objectIdParam }), investigations.show);
investigationRouter.get(
  "/:id/status",
  validate({ params: objectIdParam }),
  investigations.status,
);
investigationRouter.get("/:id/graph", validate({ params: objectIdParam }), investigations.graph);
investigationRouter.get(
  "/:id/analysis",
  validate({ params: objectIdParam }),
  investigations.analysis,
);
investigationRouter.post(
  "/:id/rerun",
  heavyLimiter,
  validate({ params: objectIdParam }),
  investigations.rerun,
);
investigationRouter.delete("/:id", validate({ params: objectIdParam }), investigations.destroy);
