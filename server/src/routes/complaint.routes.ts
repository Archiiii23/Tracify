import { Router } from "express";
import * as complaints from "../controllers/complaint.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import { heavyLimiter } from "../middleware/security.middleware";
import { validate, objectIdParam } from "../middleware/validate.middleware";
import {
  attributeBody,
  complaintListQuery,
  createComplaintBody,
} from "../validators/complaint.schema";

export const complaintRouter = Router();

complaintRouter.use(requireAuth);

complaintRouter.get("/", validate({ query: complaintListQuery }), complaints.index);
complaintRouter.get("/queue", complaints.queue);
complaintRouter.post("/", validate({ body: createComplaintBody }), complaints.create);

// Chain lookups leave the process on these routes, so they are throttled.
complaintRouter.post(
  "/attribute",
  heavyLimiter,
  validate({ body: attributeBody }),
  complaints.attribute,
);

complaintRouter.get("/:id", validate({ params: objectIdParam }), complaints.show);
complaintRouter.get("/:id/report", validate({ params: objectIdParam }), complaints.leaReport);
complaintRouter.post(
  "/:id/retriage",
  heavyLimiter,
  validate({ params: objectIdParam }),
  complaints.retriage,
);
complaintRouter.post(
  "/:id/escalate",
  requireRole("admin", "investigator"),
  validate({ params: objectIdParam }),
  complaints.escalate,
);
