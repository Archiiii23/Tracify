import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "../utils/logger";

type DbState = "connected" | "connecting" | "disconnected" | "disconnecting";

const STATES: Record<number, DbState> = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

/** Current connection state, used by the readiness probe. */
export function databaseState(): DbState {
  return STATES[mongoose.connection.readyState] ?? "disconnected";
}

export async function connectDatabase(): Promise<void> {
  // Fail fast rather than queueing writes against a database that is not there.
  mongoose.set("strictQuery", true);
  // Operator injection is stripped from every request payload by sanitizeRequest,
  // so the global filter sanitizer is redundant here — and it would wrap trusted
  // internal operator queries ($in/$exists) in $eq, breaking them at cast time.
  mongoose.set("sanitizeFilter", false);
  mongoose.set("bufferCommands", false);

  mongoose.connection.on("disconnected", () => {
    logger.warn("database disconnected");
  });
  mongoose.connection.on("reconnected", () => {
    logger.info("database reconnected");
  });
  mongoose.connection.on("error", (error: Error) => {
    logger.error("database error", { reason: error.message });
  });

  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 8_000,
    socketTimeoutMS: 45_000,
    maxPoolSize: 20,
    minPoolSize: 2,
    retryWrites: true,
  });

  logger.info("database connected", { host: mongoose.connection.host });
}

export async function disconnectDatabase(): Promise<void> {
  if (databaseState() === "disconnected") return;
  await mongoose.disconnect();
}
