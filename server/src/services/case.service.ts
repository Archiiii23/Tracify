import { Types } from "mongoose";
import { Case, type CaseDoc } from "../models/Case.model";
import { Evidence } from "../models/Evidence.model";
import { Finding } from "../models/Finding.model";
import { Investigation } from "../models/Investigation.model";
import { Report } from "../models/Report.model";
import { nextSequentialId } from "../models/Counter.model";
import type { AuthenticatedUser } from "../types/express";
import { assertCaseAccess, assertCaseOwner, caseScopeFilter } from "./access.service";

export interface ListOptions {
  page: number;
  limit: number;
  sort: string;
  order: "asc" | "desc";
  search?: string;
  status?: string;
  priority?: string;
}

export async function listCases(user: AuthenticatedUser, options: ListOptions) {
  const filter: Record<string, unknown> = { ...caseScopeFilter(user) };
  if (options.status) filter['status'] = options.status;
  if (options.priority) filter['priority'] = options.priority;
  if (options.search) filter['$text'] = { $search: options.search };

  const [items, total] = await Promise.all([
    Case.find(filter)
      .sort({ [options.sort]: options.order === "asc" ? 1 : -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .populate("createdBy", "name email")
      .lean(),
    Case.countDocuments(filter),
  ]);

  return { items, total };
}

export async function createCase(
  user: AuthenticatedUser,
  input: {
    title: string;
    summary?: string;
    priority?: CaseDoc["priority"];
    jurisdiction?: string;
    reportedLossUsd?: number;
    chains?: string[];
    tags?: string[];
  },
) {
  const reference = await nextSequentialId("CASE");
  return Case.create({
    ...input,
    reference,
    createdBy: new Types.ObjectId(user.id),
    assignedTo: [new Types.ObjectId(user.id)],
  });
}

export async function getCaseDetail(caseId: string, user: AuthenticatedUser) {
  const found = await assertCaseAccess(caseId, user);
  const id = found._id as Types.ObjectId;

  const [investigations, findings, evidence, reports] = await Promise.all([
    Investigation.find({ case: id }).sort({ updatedAt: -1 }).limit(50).lean(),
    Finding.find({ case: id }).sort({ createdAt: -1 }).limit(100).lean(),
    Evidence.find({ case: id }).sort({ createdAt: -1 }).limit(100).lean(),
    Report.find({ case: id }).sort({ createdAt: -1 }).limit(50).lean(),
  ]);

  return { case: found.toJSON(), investigations, findings, evidence, reports };
}

export async function updateCase(
  caseId: string,
  user: AuthenticatedUser,
  patch: Partial<Pick<CaseDoc, "title" | "summary" | "status" | "priority" | "jurisdiction" | "reportedLossUsd" | "chains" | "tags">>,
) {
  const found = await assertCaseAccess(caseId, user);
  Object.assign(found, patch);
  if (patch.status === "closed" && !found.closedAt) found.closedAt = new Date();
  if (patch.status && patch.status !== "closed") found.closedAt = undefined;
  await found.save();
  return found;
}

export async function assignUser(caseId: string, user: AuthenticatedUser, assigneeId: string) {
  const found = await assertCaseAccess(caseId, user);
  assertCaseOwner(found, user);
  const assignee = new Types.ObjectId(assigneeId);
  if (!found.assignedTo.some((a) => String(a) === assigneeId)) found.assignedTo.push(assignee);
  await found.save();
  return found;
}

export async function unassignUser(caseId: string, user: AuthenticatedUser, assigneeId: string) {
  const found = await assertCaseAccess(caseId, user);
  assertCaseOwner(found, user);
  found.assignedTo = found.assignedTo.filter((a) => String(a) !== assigneeId);
  await found.save();
  return found;
}

/** Deleting a case removes everything derived from it — one explicit cascade. */
export async function deleteCase(caseId: string, user: AuthenticatedUser) {
  const found = await assertCaseAccess(caseId, user);
  assertCaseOwner(found, user);
  const id = found._id as Types.ObjectId;
  await Promise.all([
    Investigation.deleteMany({ case: id }),
    Finding.deleteMany({ case: id }),
    Evidence.deleteMany({ case: id }),
    Report.deleteMany({ case: id }),
  ]);
  await found.deleteOne();
}
