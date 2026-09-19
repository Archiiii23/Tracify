import { Types } from "mongoose";
import { Case } from "../models/Case.model";
import { Finding, type FindingDoc } from "../models/Finding.model";
import type { AuthenticatedUser } from "../types/express";
import { ApiError } from "../utils/ApiError";
import { asObjectId, assertCaseAccess, caseScopeFilter } from "./access.service";

async function scopeFilter(user: AuthenticatedUser): Promise<Record<string, unknown>> {
  if (user.role === "admin") return {};
  const cases = await Case.find(caseScopeFilter(user)).select("_id").lean();
  return { case: { $in: cases.map((c) => c._id) } };
}

export async function listFindings(
  user: AuthenticatedUser,
  options: {
    page: number;
    limit: number;
    sort: string;
    order: "asc" | "desc";
    caseId?: string;
    investigationId?: string;
    severity?: string;
    status?: string;
  },
) {
  const filter: Record<string, unknown> = await scopeFilter(user);
  if (options.caseId) {
    await assertCaseAccess(options.caseId, user);
    filter['case'] = asObjectId(options.caseId);
  }
  if (options.investigationId) filter['investigation'] = asObjectId(options.investigationId);
  if (options.severity) filter['severity'] = options.severity;
  if (options.status) filter['status'] = options.status;

  const [items, total] = await Promise.all([
    Finding.find(filter)
      .sort({ [options.sort]: options.order === "asc" ? 1 : -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .populate("case", "reference title")
      .lean(),
    Finding.countDocuments(filter),
  ]);

  return { items, total };
}

export async function createFinding(
  user: AuthenticatedUser,
  input: {
    caseId: string;
    investigationId?: string;
    title: string;
    description: string;
    severity?: FindingDoc["severity"];
    category?: FindingDoc["category"];
    confidence?: number;
    addresses?: string[];
    txHashes?: string[];
  },
) {
  const parent = await assertCaseAccess(input.caseId, user);
  return Finding.create({
    case: parent._id,
    investigation: input.investigationId ? asObjectId(input.investigationId) : undefined,
    title: input.title,
    description: input.description,
    severity: input.severity,
    category: input.category,
    confidence: input.confidence,
    addresses: input.addresses ?? [],
    txHashes: input.txHashes ?? [],
    recordedBy: new Types.ObjectId(user.id),
  });
}

export async function getFinding(id: string, user: AuthenticatedUser): Promise<FindingDoc> {
  const found = await Finding.findById(asObjectId(id));
  if (!found) throw ApiError.notFound("Finding not found");
  await assertCaseAccess(found.case, user);
  return found;
}

export async function updateFinding(
  id: string,
  user: AuthenticatedUser,
  patch: Partial<Pick<FindingDoc, "title" | "description" | "severity" | "category" | "confidence" | "status" | "addresses" | "txHashes">>,
) {
  const found = await getFinding(id, user);
  Object.assign(found, patch);
  await found.save();
  return found;
}

export async function deleteFinding(id: string, user: AuthenticatedUser) {
  const found = await getFinding(id, user);
  await found.deleteOne();
}
