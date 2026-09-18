import { currentUser } from "../middleware/auth.middleware";
import { User } from "../models/User.model";
import {
  authenticate,
  changePassword,
  registerUser,
  toPublicUser,
} from "../services/auth.service";
import { recordAudit } from "../services/audit.service";
import { ApiError } from "../utils/ApiError";
import { sendSuccess } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";

export const register = asyncHandler(async (req, res) => {
  const { user, token } = await registerUser(req.body);
  await recordAudit({
    actorId: user.id,
    action: "auth.register",
    resource: "user",
    resourceId: user.id,
    requestId: req.requestId,
  });
  sendSuccess(res, "Account created", { user, token }, 201);
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  const { user, token } = await authenticate(email, password);
  await recordAudit({
    actorId: user.id,
    action: "auth.login",
    resource: "user",
    resourceId: user.id,
    requestId: req.requestId,
  });
  sendSuccess(res, "Signed in", { user, token });
});

export const me = asyncHandler(async (req, res) => {
  const auth = currentUser(req);
  const user = await User.findById(auth.id);
  if (!user) throw ApiError.unauthorized();
  sendSuccess(res, "Current user", { user: toPublicUser(user) });
});

export const updateMe = asyncHandler(async (req, res) => {
  const auth = currentUser(req);
  const user = await User.findByIdAndUpdate(auth.id, req.body, { new: true, runValidators: true });
  if (!user) throw ApiError.unauthorized();
  sendSuccess(res, "Profile updated", { user: toPublicUser(user) });
});

export const updatePassword = asyncHandler(async (req, res) => {
  const auth = currentUser(req);
  const { currentPassword, newPassword } = req.body as {
    currentPassword: string;
    newPassword: string;
  };
  await changePassword(auth.id, currentPassword, newPassword);
  await recordAudit({
    actorId: auth.id,
    action: "auth.password_changed",
    resource: "user",
    resourceId: auth.id,
    requestId: req.requestId,
  });
  sendSuccess(res, "Password updated", { updated: true });
});

/** Stateless tokens cannot be revoked server-side; the client discards it. */
export const logout = asyncHandler(async (req, res) => {
  const auth = currentUser(req);
  await recordAudit({
    actorId: auth.id,
    action: "auth.logout",
    resource: "user",
    resourceId: auth.id,
    requestId: req.requestId,
  });
  sendSuccess(res, "Signed out", { signedOut: true });
});
