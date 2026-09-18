import { currentUser } from "../middleware/auth.middleware";
import { recordAudit } from "../services/audit.service";
import {
  assignUser,
  createCase,
  deleteCase,
  getCaseDetail,
  listCases,
  unassignUser,
  updateCase,
  type ListOptions,
} from "../services/case.service";
import { sendPaginated, sendSuccess } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";

export const index = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const query = req.query as unknown as ListOptions;
  const { items, total } = await listCases(user, query);
  sendPaginated(res, "Cases", items, { page: query.page, limit: query.limit, total });
});

export const create = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const created = await createCase(user, req.body);
  await recordAudit({
    actorId: user.id,
    action: "case.create",
    resource: "case",
    resourceId: String(created._id),
    requestId: req.requestId,
    metadata: { reference: created.reference },
  });
  sendSuccess(res, "Case created", { case: created.toJSON() }, 201);
});

export const show = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const detail = await getCaseDetail(String(req.params['id']), user);
  sendSuccess(res, "Case detail", detail);
});

export const update = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const updated = await updateCase(String(req.params['id']), user, req.body);
  await recordAudit({
    actorId: user.id,
    action: "case.update",
    resource: "case",
    resourceId: String(updated._id),
    requestId: req.requestId,
  });
  sendSuccess(res, "Case updated", { case: updated.toJSON() });
});

export const assign = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const { userId } = req.body as { userId: string };
  const updated = await assignUser(String(req.params['id']), user, userId);
  sendSuccess(res, "Investigator assigned", { case: updated.toJSON() });
});

export const unassign = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const updated = await unassignUser(String(req.params['id']), user, String(req.params['userId']));
  sendSuccess(res, "Investigator unassigned", { case: updated.toJSON() });
});

export const destroy = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const id = String(req.params['id']);
  await deleteCase(id, user);
  await recordAudit({
    actorId: user.id,
    action: "case.delete",
    resource: "case",
    resourceId: id,
    requestId: req.requestId,
  });
  sendSuccess(res, "Case deleted", { deleted: true });
});
