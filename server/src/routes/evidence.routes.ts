import { Router } from "express";
import * as evidence from "../controllers/evidence.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { uploadLimiter } from "../middleware/security.middleware";
import { objectIdParam, validate } from "../middleware/validate.middleware";
import {
  evidenceListQuery,
  pinEvidenceSchema,
  relabelEvidenceSchema,
} from "../validators/evidence.schema";

export const evidenceRouter = Router();

evidenceRouter.use(requireAuth);

evidenceRouter.get("/", validate({ query: evidenceListQuery }), evidence.index);
evidenceRouter.post("/", uploadLimiter, validate({ body: pinEvidenceSchema }), evidence.pin);
evidenceRouter.get("/:id", validate({ params: objectIdParam }), evidence.show);
evidenceRouter.get("/:id/verify", validate({ params: objectIdParam }), evidence.verify);
// Only descriptive metadata is mutable — the sealed payload never is.
evidenceRouter.patch(
  "/:id",
  validate({ params: objectIdParam, body: relabelEvidenceSchema }),
  evidence.relabel,
);
evidenceRouter.delete("/:id", validate({ params: objectIdParam }), evidence.destroy);
