import { currentUser } from "../middleware/auth.middleware";
import { listAlerts, updateAlertStatus } from "../services/alert.service";
import { recordAudit } from "../services/audit.service";
import { ApiError } from "../utils/ApiError";
import { sendPaginated, sendSuccess } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";

export const index = asyncHandler(async (req, res) => {
  const query = req.query as unknown as {
    page: number;
    limit: number;
    sort: string;
    order: "asc" | "desc";
    status?: string;
    severity?: string;
    complaintId?: string;
  };
  const { items, total } = await listAlerts(query);
  sendPaginated(res, "Alerts", items, { page: query.page, limit: query.limit, total });
});

export const setStatus = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const body = req.body as { status: "open" | "acknowledged" | "actioned" | "dismissed" };
  const alert = await updateAlertStatus(String(req.params['id']), body.status, user.id);
  if (!alert) throw ApiError.notFound("Alert not found");
  await recordAudit({
    actorId: user.id,
    action: `alert.${body.status}`,
    resource: "alert",
    resourceId: String(alert._id),
    requestId: req.requestId,
  });
  sendSuccess(res, "Alert updated", { alert: alert.toJSON() });
});
