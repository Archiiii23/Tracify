import { Router } from "express";
import * as auth from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { authLimiter } from "../middleware/security.middleware";
import { validate } from "../middleware/validate.middleware";
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from "../validators/auth.schema";

export const authRouter = Router();

// Credential endpoints are rate limited before any database work happens.
authRouter.post("/register", authLimiter, validate({ body: registerSchema }), auth.register);
authRouter.post("/login", authLimiter, validate({ body: loginSchema }), auth.login);

authRouter.use(requireAuth);
authRouter.get("/me", auth.me);
authRouter.patch("/me", validate({ body: updateProfileSchema }), auth.updateMe);
authRouter.post(
  "/password",
  authLimiter,
  validate({ body: changePasswordSchema }),
  auth.updatePassword,
);
authRouter.post("/logout", auth.logout);
