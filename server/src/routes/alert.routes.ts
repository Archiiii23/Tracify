import { Router } from "express";
import * as alerts from "../controllers/alert.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { objectIdParam, validate } from "../middleware/validate.middleware";
import { alertListQuery, alertStatusBody } from "../validators/complaint.schema";

export const alertRouter = Router();

alertRouter.use(requireAuth);

alertRouter.get("/", validate({ query: alertListQuery }), alerts.index);
alertRouter.patch(
  "/:id/status",
  validate({ params: objectIdParam, body: alertStatusBody }),
  alerts.setStatus,
);
