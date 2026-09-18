import { Router } from "express";
import { databaseState } from "../config/db";
import { env } from "../config/env";
import { isShuttingDown } from "../lifecycle";
import { sendSuccess } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";

export const healthRouter = Router();

/**
 * Liveness — is the process itself healthy? Deliberately dependency-free so an
 * orchestrator does not restart the container over a transient DB blip.
 */
healthRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    sendSuccess(res, "VASPTRACE API is running", {
      status: "ok",
      environment: env.NODE_ENV,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  }),
);

/**
 * Readiness — may this instance receive traffic? Reports 503 while the database
 * is unavailable or the process is draining, so load balancers stop routing.
 */
healthRouter.get(
  "/ready",
  asyncHandler(async (_req, res) => {
    const database = databaseState();
    const draining = isShuttingDown();
    const ready = database === "connected" && !draining;

    res.status(ready ? 200 : 503).json({
      success: ready,
      message: ready ? "VASPTRACE API is ready" : "VASPTRACE API is not ready",
      data: {
        status: ready ? "ready" : draining ? "draining" : "unavailable",
        database,
        timestamp: new Date().toISOString(),
      },
    });
  }),
);
