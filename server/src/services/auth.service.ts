import { User, hashPassword, type UserDoc } from "../models/User.model";
import { ApiError } from "../utils/ApiError";
import { signAccessToken } from "../utils/jwt";

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserDoc["role"];
  organisation?: string;
  createdAt: Date;
  lastLoginAt?: Date;
}

export function toPublicUser(user: UserDoc | Record<string, unknown>): PublicUser {
  const raw = user as unknown as UserDoc;
  return {
    id: String(raw._id),
    email: raw.email,
    name: raw.name,
    role: raw.role,
    organisation: raw.organisation,
    createdAt: raw.createdAt,
    lastLoginAt: raw.lastLoginAt,
  };
}

export function issueToken(user: UserDoc): string {
  return signAccessToken({
    sub: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role,
  });
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  organisation?: string;
}): Promise<{ user: PublicUser; token: string }> {
  const existing = await User.findOne({ email: input.email }).select("_id").lean();
  if (existing) throw ApiError.conflict("An account with this email already exists");

  // The very first account bootstraps the workspace administrator; every
  // subsequent account is an investigator until an admin promotes it.
  const isFirstUser = (await User.estimatedDocumentCount()) === 0;

  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    organisation: input.organisation,
    role: isFirstUser ? "admin" : "investigator",
  });

  return { user: toPublicUser(user), token: issueToken(user) };
}

export async function authenticate(
  email: string,
  password: string,
): Promise<{ user: PublicUser; token: string }> {
  const user = await User.findOne({ email }).select("+passwordHash");

  // Identical response for unknown email and wrong password: no enumeration.
  if (!user || !user.isActive) throw ApiError.unauthorized("Invalid email or password");
  const ok = await user.verifyPassword(password);
  if (!ok) throw ApiError.unauthorized("Invalid email or password");

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  return { user: toPublicUser(user), token: issueToken(user) };
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await User.findById(userId).select("+passwordHash");
  if (!user) throw ApiError.unauthorized();
  const ok = await user.verifyPassword(currentPassword);
  if (!ok) throw ApiError.badRequest("Current password is incorrect");
  user.passwordHash = await hashPassword(newPassword);
  await user.save();
}
