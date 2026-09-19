import { Types } from "mongoose";
import { AuditLog } from "../models/AuditLog.model";
import { logger } from "../utils/logger";

export interface AuditEntry {
  actorId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Audit writes must never break the user-facing operation, so failures are
 * logged rather than thrown.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await AuditLog.create({
      actor: entry.actorId ? new Types.ObjectId(entry.actorId) : undefined,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId,
      requestId: entry.requestId,
      metadata: entry.metadata,
    });
  } catch (error) {
    logger.warn("audit write failed", {
      action: entry.action,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
