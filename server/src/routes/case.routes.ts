import { Router } from "express";
import * as cases from "../controllers/case.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { objectId, objectIdParam, validate } from "../middleware/validate.middleware";
import { z } from "zod";
import { assignSchema, caseListQuery, createCaseSchema, updateCaseSchema } from "../validators/case.schema";

export const caseRouter = Router();

caseRouter.use(requireAuth);

caseRouter.get("/", validate({ query: caseListQuery }), cases.index);
caseRouter.post("/", validate({ body: createCaseSchema }), cases.create);
caseRouter.get("/:id", validate({ params: objectIdParam }), cases.show);
caseRouter.patch(
  "/:id",
  validate({ params: objectIdParam, body: updateCaseSchema }),
  cases.update,
);
caseRouter.post(
  "/:id/assignees",
  validate({ params: objectIdParam, body: assignSchema }),
  cases.assign,
);
caseRouter.delete(
  "/:id/assignees/:userId",
  validate({ params: z.object({ id: objectId, userId: objectId }) }),
  cases.unassign,
);
caseRouter.delete("/:id", validate({ params: objectIdParam }), cases.destroy);
