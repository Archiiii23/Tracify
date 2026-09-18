import { currentUser } from "../middleware/auth.middleware";
import { recordAudit } from "../services/audit.service";
import {
  createFinding,
  deleteFinding,
  getFinding,
  listFindings,
  updateFinding,
} from "../services/finding.service";
import { sendPaginated, sendSuccess } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";

export const index = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const query = req.query as unknown as Parameters<typeof listFindings>[1];
  const { items, total } = await listFindings(user, query);
  sendPaginated(res, "Findings", items, { page: query.page, limit: query.limit, total });
});

export const create = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const finding = await createFinding(user, req.body);
  await recordAudit({
    actorId: user.id,
    action: "finding.create",
    resource: "finding",
    resourceId: String(finding._id),
    requestId: req.requestId,
    metadata: { severity: finding.severity, category: finding.category },
  });
  sendSuccess(res, "Finding recorded", { finding: finding.toJSON() }, 201);
});

export const show = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const finding = await getFinding(String(req.params['id']), user);
  sendSuccess(res, "Finding", { finding: finding.toJSON() });
});

export const update = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const finding = await updateFinding(String(req.params['id']), user, req.body);
  sendSuccess(res, "Finding updated", { finding: finding.toJSON() });
});

export const destroy = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  await deleteFinding(String(req.params['id']), user);
  sendSuccess(res, "Finding deleted", { deleted: true });
});
