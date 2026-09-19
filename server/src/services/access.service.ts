/**
 * Single authorisation gate for case-scoped data.
 *
 * Every read and write of a case, investigation, finding, evidence item or
 * report funnels through `assertCaseAccess`, so authorisation cannot be
 * forgotten in one controller and enforced in another.
 */
import { Types } from "mongoose";
import { Case, type CaseDoc } from "../models/Case.model";
import type { AuthenticatedUser } from "../types/express";
import { ApiError } from "../utils/ApiError";

export function asObjectId(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) throw ApiError.badRequest("Invalid resource id");
  return new Types.ObjectId(id);
}

/** Mongo filter restricting cases to the ones this user may see. */
export function caseScopeFilter(user: AuthenticatedUser): Record<string, unknown> {
  if (user.role === "admin") return {};
  const id = new Types.ObjectId(user.id);
  return { $or: [{ createdBy: id }, { assignedTo: id }] };
}

export async function assertCaseAccess(
  caseId: string | Types.ObjectId,
  user: AuthenticatedUser,
): Promise<CaseDoc> {
  const id = typeof caseId === "string" ? asObjectId(caseId) : caseId;
  const found = await Case.findById(id);
  // Unauthorised access is reported as 404 so ids cannot be enumerated.
  if (!found) throw ApiError.notFound("Case not found");

  if (user.role === "admin") return found;

  const isOwner = String(found.createdBy) === user.id;
  const isAssigned = found.assignedTo.some((assignee) => String(assignee) === user.id);
  if (!isOwner && !isAssigned) throw ApiError.notFound("Case not found");

  return found;
}

/** Only the case owner or an admin may perform destructive operations. */
export function assertCaseOwner(found: CaseDoc, user: AuthenticatedUser): void {
  if (user.role === "admin") return;
  if (String(found.createdBy) !== user.id) throw ApiError.forbidden();
}
