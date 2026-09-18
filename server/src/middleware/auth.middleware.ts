/**
 * Authentication and role gating.
 *
 * The token is the only credential source: no query-string tokens, no cookies
 * fallback, and the user record is re-read so a deactivated account loses access
 * immediately instead of at token expiry.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { User } from "../models/User.model";
import type { AppRole } from "../types/express";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { verifyAccessToken } from "../utils/jwt";

function bearerToken(req: Request): string | null {
  const header = req.get("authorization");
  if (!header) return null;
  const [scheme, value] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !value) return null;
  return value.trim() || null;
}

export const requireAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  const token = bearerToken(req);
  if (!token) throw ApiError.unauthorized();

  const claims = verifyAccessToken(token);
  const user = await User.findById(claims.sub).select("email name role isActive").lean();
  if (!user || !user.isActive) throw ApiError.unauthorized("Account is no longer active");

  req.user = {
    id: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role,
  };
  next();
});

/** Attach the user when a valid token is present, but never reject. */
export const optionalAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  const token = bearerToken(req);
  if (!token) {
    next();
    return;
  }
  try {
    const claims = verifyAccessToken(token);
    const user = await User.findById(claims.sub).select("email name role isActive").lean();
    if (user?.isActive) {
      req.user = {
        id: String(user._id),
        email: user.email,
        name: user.name,
        role: user.role,
      };
    }
  } catch {
    // An invalid token on an optional route is treated as anonymous.
  }
  next();
});

export function requireRole(...roles: AppRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(ApiError.forbidden());
      return;
    }
    next();
  };
}

/** The authenticated user, or a 401 — removes `req.user!` from handlers. */
export function currentUser(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}
