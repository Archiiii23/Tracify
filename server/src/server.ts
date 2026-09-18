import type { Server } from "node:http";
import { createApp } from "./app";
import { connectDatabase, disconnectDatabase } from "./config/db";
import { env } from "./config/env";
import { beginShutdown, isShuttingDown } from "./lifecycle";
import { User, hashPassword } from "./models/User.model";
import { logger } from "./utils/logger";

const SHUTDOWN_GRACE_MS = 15_000;

const DEMO_EMAIL = "analyst@tracify.io";
const DEMO_PASSWORD = "TracifyDemo2026!";

/**
 * The hosted demo needs the built-in investigator to exist even though the
 * full seed script refuses to run in production. Upsert just that one account.
 */
async function ensureDemoInvestigator(): Promise<void> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  await User.updateOne(
    { email: DEMO_EMAIL },
    {
      $set: {
        name: "Ada Kestrel",
        passwordHash,
        role: "admin",
        organisation: "Tracify Financial Intelligence Unit",
      },
    },
    { upsert: true },
  );
  logger.info("demo investigator ready", { email: DEMO_EMAIL });
}

async function bootstrap(): Promise<void> {
  try {
    await connectDatabase();
  } catch (error) {
    logger.error("startup aborted", {
      reason: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }

  try {
    await ensureDemoInvestigator();
  } catch (error) {
    logger.error("demo investigator provisioning failed", {
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  const app = createApp();
  const server: Server = app.listen(env.PORT, () => {
    logger.info("api listening", { port: env.PORT, env: env.NODE_ENV });
  });

  // Guard against slowloris-style socket hoarding.
  server.headersTimeout = 20_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 10_000;

  let exiting = false;

  const shutdown = (signal: string, code = 0) => {
    if (exiting) return;
    exiting = true;
    beginShutdown();
    logger.warn("shutdown started", { signal });

    // Readiness now reports draining; stop accepting new connections and let
    // in-flight requests finish before closing the database.
    server.close(() => {
      void disconnectDatabase()
        .catch((error: unknown) => {
          logger.error("database close failed", {
            reason: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          logger.info("shutdown complete", { signal });
          process.exit(code);
        });
    });

    server.closeIdleConnections?.();

    setTimeout(() => {
      logger.error("shutdown timed out — forcing exit", { signal });
      server.closeAllConnections?.();
      process.exit(1);
    }, SHUTDOWN_GRACE_MS).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // A rejected promise that escaped a handler is a bug, not a reason to die:
  // log it with context and keep serving traffic.
  process.on("unhandledRejection", (reason) => {
    logger.error("unhandled rejection", {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
  });

  // An uncaught exception leaves the process in an unknown state — drain and
  // exit non-zero so the supervisor restarts a clean instance.
  process.on("uncaughtException", (error) => {
    logger.error("uncaught exception", { reason: error.message, stack: error.stack });
    if (!isShuttingDown()) shutdown("uncaughtException", 1);
  });
}

void bootstrap();
