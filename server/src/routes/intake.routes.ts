/**
 * Machine-to-machine complaint intake for NCRP / SAHYOG / LEA systems.
 *
 * These callers have no user session, so the route is authenticated with a
 * shared API key presented in `x-api-key` and compared in constant time. It is
 * throttled independently of the user-facing API so a busy upstream portal
 * cannot exhaust an investigator's rate budget.
 */
import { Router } from "express";
import * as complaints from "../controllers/complaint.controller";
import { intakeApiKey, intakeLimiter } from "../middleware/intake.middleware";
import { validate } from "../middleware/validate.middleware";
import { intakeComplaintBody } from "../validators/complaint.schema";

export const intakeRouter = Router();

intakeRouter.post(
  "/complaints",
  intakeLimiter,
  intakeApiKey,
  validate({ body: intakeComplaintBody }),
  complaints.intake,
);
