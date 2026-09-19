import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import type { AppRole } from "../types/express";

export interface AccessTokenClaims {
  sub: string;
  email: string;
  name: string;
  role: AppRole;
}

/** Sign a short-lived access token. Claims are minimal on purpose. */
export function signAccessToken(claims: AccessTokenClaims): string {
  const options = {
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: "vasptrace-api",
    audience: "vasptrace-app",
  } as SignOptions;
  return jwt.sign(claims, env.JWT_SECRET, options);
}

/** Verify a token; throws JsonWebTokenError/TokenExpiredError on failure. */
export function verifyAccessToken(token: string): AccessTokenClaims & { exp: number } {
  return jwt.verify(token, env.JWT_SECRET, {
    issuer: "vasptrace-api",
    audience: "vasptrace-app",
  }) as AccessTokenClaims & { exp: number };
}
