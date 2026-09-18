import { Router } from "express";
import * as findings from "../controllers/finding.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { objectIdParam, validate } from "../middleware/validate.middleware";
import {
  createFindingSchema,
  findingListQuery,
  updateFindingSchema,
} from "../validators/finding.schema";

export const findingRouter = Router();

findingRouter.use(requireAuth);

findingRouter.get("/", validate({ query: findingListQuery }), findings.index);
findingRouter.post("/", validate({ body: createFindingSchema }), findings.create);
findingRouter.get("/:id", validate({ params: objectIdParam }), findings.show);
findingRouter.patch(
  "/:id",
  validate({ params: objectIdParam, body: updateFindingSchema }),
  findings.update,
);
findingRouter.delete("/:id", validate({ params: objectIdParam }), findings.destroy);
