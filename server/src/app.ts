import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { env, isOriginAllowed } from "./config/env";
import { errorHandler } from "./middleware/error.middleware";
import { notFoundHandler } from "./middleware/notFound.middleware";
import {
  globalLimiter,
  requestId,
  requestLogger,
  sanitizeRequest,
} from "./middleware/security.middleware";
import { apiRouter } from "./routes";
import { ApiError } from "./utils/ApiError";

export function createApp(): Express {
  const app = express();

  // Never advertise the stack; trust exactly one proxy hop (platform LB).
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(
    helmet({
      // API responses are JSON; a strict CSP keeps any accidental HTML inert.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { "default-src": ["'none'"], "frame-ancestors": ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: "same-site" },
      referrerPolicy: { policy: "no-referrer" },
      hsts: env.isProduction ? { maxAge: 15_552_000, includeSubDomains: true } : false,
    }),
  );

  app.use(requestId);

  app.use(
    cors({
      origin(origin, callback) {
        // Allow same-origin/tooling requests without an Origin header.
        if (!origin || isOriginAllowed(origin)) {
          callback(null, true);
          return;
        }
        // Deny by omission: no CORS headers, and no error that 500s the request.
        callback(null, false);
      },
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
      exposedHeaders: ["X-Request-Id"],
      maxAge: 600,
    }),
  );

  // Bounded payloads: oversized bodies are rejected before they reach a handler.
  app.use(express.json({ limit: "512kb" }));
  app.use(express.urlencoded({ extended: false, limit: "512kb" }));
  app.use(sanitizeRequest);
  app.use(requestLogger);
  app.use(globalLimiter);

  app.use("/api", apiRouter);

  // Malformed JSON must be a controlled 400, not a stack trace.
  app.use(
    (
      error: unknown,
      _req: express.Request,
      _res: express.Response,
      next: express.NextFunction,
    ) => {
      if (error instanceof SyntaxError && "body" in error) {
        next(ApiError.badRequest("Request body is not valid JSON"));
        return;
      }
      if (
        typeof error === "object" &&
        error !== null &&
        (error as { type?: string }).type === "entity.too.large"
      ) {
        next(new ApiError(413, "Request body is too large"));
        return;
      }
      next(error);
    },
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
