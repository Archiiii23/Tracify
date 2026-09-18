import { Router } from "express";
import { z } from "zod";
import * as users from "../controllers/user.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";
import { objectIdParam, validate } from "../middleware/validate.middleware";

export const userRouter = Router();

userRouter.use(requireAuth);

userRouter.get(
  "/",
  validate({
    query: z.object({
      page: z.coerce.number().int().min(1).max(1000).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      search: z.string().trim().max(120).optional(),
    }),
  }),
  users.index,
);

// Role and activation changes are administrator-only.
userRouter.patch(
  "/:id",
  requireRole("admin"),
  validate({
    params: objectIdParam,
    body: z.object({
      role: z.enum(["investigator", "admin"]).optional(),
      isActive: z.boolean().optional(),
    }),
  }),
  users.update,
);
