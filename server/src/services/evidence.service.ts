import { Types } from "mongoose";
import { Case } from "../models/Case.model";
import { Evidence, checksumOf, type EvidenceDoc } from "../models/Evidence.model";
import type { AuthenticatedUser } from "../types/express";
import { ApiError } from "../utils/ApiError";
import { asObjectId, assertCaseAccess, assertCaseOwner, caseScopeFilter } from "./access.service";

async function scopeFilter(user: AuthenticatedUser): Promise<Record<string, unknown>> {
  if (user.role === "admin") return {};
  const cases = await Case.find(caseScopeFilter(user)).select("_id").lean();
  return { case: { $in: cases.map((c) => c._id) } };
}

export async function listEvidence(
  user: AuthenticatedUser,
  options: {
    page: number;
    limit: number;
    sort: string;
    order: "asc" | "desc";
    caseId?: string;
    investigationId?: string;
    kind?: string;
  },
) {
  const filter: Record<string, unknown> = await scopeFilter(user);
  if (options.caseId) {
    await assertCaseAccess(options.caseId, user);
    filter['case'] = asObjectId(options.caseId);
  }
  if (options.investigationId) filter['investigation'] = asObjectId(options.investigationId);
  if (options.kind) filter['kind'] = options.kind;

  const [items, total] = await Promise.all([
    Evidence.find(filter)
      .sort({ [options.sort]: options.order === "asc" ? 1 : -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .populate("case", "reference title")
      .lean(),
    Evidence.countDocuments(filter),
  ]);

  return { items, total };
}

/** Pinning seals the payload with a SHA-256 checksum at creation time. */
export async function pinEvidence(
  user: AuthenticatedUser,
  input: {
    caseId: string;
    investigationId?: string;
    findingId?: string;
    kind: EvidenceDoc["kind"];
    label: string;
    description?: string;
    payload?: Record<string, unknown>;
  },
) {
  const parent = await assertCaseAccess(input.caseId, user);
  const payload = input.payload ?? {};

  return Evidence.create({
    case: parent._id,
    investigation: input.investigationId ? asObjectId(input.investigationId) : undefined,
    finding: input.findingId ? asObjectId(input.findingId) : undefined,
    kind: input.kind,
    label: input.label,
    description: input.description,
    payload,
    checksum: checksumOf(payload),
    sealedAt: new Date(),
    pinnedBy: new Types.ObjectId(user.id),
  });
}

export async function getEvidence(id: string, user: AuthenticatedUser): Promise<EvidenceDoc> {
  const found = await Evidence.findById(asObjectId(id));
  if (!found) throw ApiError.notFound("Evidence not found");
  await assertCaseAccess(found.case, user);
  return found;
}

/**
 * Evidence is append-only: only the descriptive metadata may change. The sealed
 * payload and its checksum are immutable, which is what makes the chain of
 * custody defensible.
 */
export async function relabelEvidence(
  id: string,
  user: AuthenticatedUser,
  patch: { label?: string; description?: string },
) {
  const found = await getEvidence(id, user);
  if (patch.label !== undefined) found.label = patch.label;
  if (patch.description !== undefined) found.description = patch.description;
  await found.save();
  return found;
}

/** Recompute the checksum and compare it with the seal. */
export async function verifyEvidence(id: string, user: AuthenticatedUser) {
  const found = await getEvidence(id, user);
  const recomputed = checksumOf(found.payload);
  return {
    id: String(found._id),
    checksum: found.checksum,
    recomputed,
    intact: recomputed === found.checksum,
    sealedAt: found.sealedAt,
  };
}

export async function deleteEvidence(id: string, user: AuthenticatedUser) {
  const found = await getEvidence(id, user);
  const parent = await assertCaseAccess(found.case, user);
  // Removing sealed evidence is an owner/admin-only action.
  assertCaseOwner(parent, user);
  if (!found.case) throw ApiError.notFound("Evidence not found");
  await found.deleteOne();
}
