import { currentUser } from "../middleware/auth.middleware";
import { recordAudit } from "../services/audit.service";
import {
  deleteEvidence,
  getEvidence,
  listEvidence,
  pinEvidence,
  relabelEvidence,
  verifyEvidence,
} from "../services/evidence.service";
import { sendPaginated, sendSuccess } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";

export const index = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const query = req.query as unknown as Parameters<typeof listEvidence>[1];
  const { items, total } = await listEvidence(user, query);
  sendPaginated(res, "Evidence", items, { page: query.page, limit: query.limit, total });
});

export const pin = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const evidence = await pinEvidence(user, req.body);
  await recordAudit({
    actorId: user.id,
    action: "evidence.pin",
    resource: "evidence",
    resourceId: String(evidence._id),
    requestId: req.requestId,
    metadata: { checksum: evidence.checksum, kind: evidence.kind },
  });
  sendSuccess(res, "Evidence sealed", { evidence: evidence.toJSON() }, 201);
});

export const show = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const evidence = await getEvidence(String(req.params['id']), user);
  sendSuccess(res, "Evidence", { evidence: evidence.toJSON() });
});

export const relabel = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const evidence = await relabelEvidence(String(req.params['id']), user, req.body);
  sendSuccess(res, "Evidence metadata updated", { evidence: evidence.toJSON() });
});

export const verify = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const result = await verifyEvidence(String(req.params['id']), user);
  sendSuccess(res, result.intact ? "Seal intact" : "Seal broken", result);
});

export const destroy = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const id = String(req.params['id']);
  await deleteEvidence(id, user);
  await recordAudit({
    actorId: user.id,
    action: "evidence.delete",
    resource: "evidence",
    resourceId: id,
    requestId: req.requestId,
  });
  sendSuccess(res, "Evidence deleted", { deleted: true });
});
