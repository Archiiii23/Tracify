import { Router } from "express";
import * as reports from "../controllers/report.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { heavyLimiter } from "../middleware/security.middleware";
import { objectIdParam, validate } from "../middleware/validate.middleware";
import {
  generateReportSchema,
  reportListQuery,
  updateReportSchema,
} from "../validators/report.schema";

export const reportRouter = Router();

reportRouter.use(requireAuth);

reportRouter.get("/", validate({ query: reportListQuery }), reports.index);
reportRouter.post(
  "/",
  heavyLimiter,
  validate({ body: generateReportSchema }),
  reports.generate,
);
reportRouter.get("/:id", validate({ params: objectIdParam }), reports.show);
reportRouter.get("/:id/export.csv", validate({ params: objectIdParam }), reports.exportCsv);
reportRouter.patch(
  "/:id",
  validate({ params: objectIdParam, body: updateReportSchema }),
  reports.update,
);
reportRouter.delete("/:id", validate({ params: objectIdParam }), reports.destroy);
