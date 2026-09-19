import { z } from "zod";
import { boundedText } from "../middleware/validate.middleware";

const email = z.string().trim().toLowerCase().email().max(254);

/**
 * Password policy: long enough to resist offline cracking, with mixed classes.
 * Length is capped so bcrypt never silently truncates a 72+ byte input.
 */
const password = z
  .string()
  .min(12, "Password must be at least 12 characters long")
  .max(72, "Password must be at most 72 characters long")
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v), {
    message: "Password must include lower case, upper case and a number",
  });

export const registerSchema = z.object({
  name: boundedText(2, 120),
  email,
  password,
  organisation: boundedText(2, 160).optional(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: password,
});

export const updateProfileSchema = z.object({
  name: boundedText(2, 120).optional(),
  organisation: boundedText(2, 160).optional(),
});
