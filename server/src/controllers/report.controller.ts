import { currentUser } from "../middleware/auth.middleware";
import { recordAudit } from "../services/audit.service";
import {
  deleteReport,
  generateReport,
  getReport,
  listReports,
  reportToCsv,
  updateReport,
} from "../services/report.service";
import { sendPaginated, sendSuccess } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";

export const index = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const query = req.query as unknown as Parameters<typeof listReports>[1];
  const { items, total } = await listReports(user, query);
  sendPaginated(res, "Reports", items, { page: query.page, limit: query.limit, total });
});

export const generate = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const report = await generateReport(user, req.body);
  await recordAudit({
    actorId: user.id,
    action: "report.generate",
    resource: "report",
    resourceId: String(report._id),
    requestId: req.requestId,
    metadata: { reference: report.reference },
  });
  sendSuccess(res, "Report generated", { report: report.toJSON() }, 201);
});

export const show = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const report = await getReport(String(req.params['id']), user);
  sendSuccess(res, "Report", { report: report.toJSON() });
});

export const update = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const report = await updateReport(String(req.params['id']), user, req.body);
  sendSuccess(res, "Report updated", { report: report.toJSON() });
});

export const exportCsv = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const report = await getReport(String(req.params['id']), user);
  const csv = reportToCsv(report);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${report.reference}.csv"`);
  // Downloads must never be rendered inline by a browser.
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(200).send(csv);
});

export const destroy = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  await deleteReport(String(req.params['id']), user);
  sendSuccess(res, "Report deleted", { deleted: true });
});
