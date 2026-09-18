import { currentUser } from "../middleware/auth.middleware";
import { recordAudit } from "../services/audit.service";
import {
  createComplaint,
  getComplaint,
  linkComplaintToCase,
  listComplaints,
  triageComplaint,
  triageQueue,
  type IntakeInput,
} from "../services/complaint.service";
import { attributeAddress } from "../services/attribution.service";
import { buildLeaReport } from "../services/lea-report.service";
import { sendPaginated, sendSuccess } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";

/**
 * Public intake used by NCRP / SAHYOG / LEA systems (API-key authenticated).
 * The complaint is acknowledged immediately and triaged asynchronously, so an
 * upstream portal is never blocked on chain lookups.
 */
export const intake = asyncHandler(async (req, res) => {
  const complaint = await createComplaint(req.body as IntakeInput);
  void triageComplaint(String(complaint._id));
  await recordAudit({
    action: "complaint.intake",
    resource: "complaint",
    resourceId: String(complaint._id),
    requestId: req.requestId,
    metadata: { source: complaint.source, externalRef: complaint.externalRef },
  });
  sendSuccess(
    res,
    "Complaint accepted for automated attribution",
    {
      reference: complaint.reference,
      triageStatus: complaint.triageStatus,
      addresses: complaint.suspectAddresses.length,
    },
    201,
  );
});

export const index = asyncHandler(async (req, res) => {
  const query = req.query as unknown as {
    page: number;
    limit: number;
    sort: string;
    order: "asc" | "desc";
    status?: string;
    source?: string;
    riskCategory?: string;
    search?: string;
  };
  const { items, total } = await listComplaints(query);
  sendPaginated(res, "Complaints", items, {
    page: query.page,
    limit: query.limit,
    total,
  });
});

export const create = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const complaint = await createComplaint(req.body as IntakeInput);
  void triageComplaint(String(complaint._id));
  await recordAudit({
    actorId: user.id,
    action: "complaint.create",
    resource: "complaint",
    resourceId: String(complaint._id),
    requestId: req.requestId,
  });
  sendSuccess(res, "Complaint filed", { complaint: complaint.toJSON() }, 201);
});

export const show = asyncHandler(async (req, res) => {
  const complaint = await getComplaint(String(req.params['id']));
  sendSuccess(res, "Complaint", { complaint: complaint.toJSON() });
});

export const retriage = asyncHandler(async (req, res) => {
  const complaint = await getComplaint(String(req.params['id']));
  void triageComplaint(String(complaint._id));
  sendSuccess(res, "Re-attribution queued", { reference: complaint.reference }, 202);
});

export const queue = asyncHandler(async (_req, res) => {
  sendSuccess(res, "Triage queue", await triageQueue());
});

export const escalate = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const { complaint, caseId } = await linkComplaintToCase(String(req.params['id']), user);
  await recordAudit({
    actorId: user.id,
    action: "complaint.escalate",
    resource: "complaint",
    resourceId: String(complaint._id),
    requestId: req.requestId,
    metadata: { caseId: String(caseId) },
  });
  sendSuccess(res, "Complaint escalated to a case", {
    caseId: String(caseId),
    complaint: complaint.toJSON(),
  }, 201);
});

/** Standardised report for a freeze / information request. */
export const leaReport = asyncHandler(async (req, res) => {
  const complaint = await getComplaint(String(req.params['id']));
  sendSuccess(res, "Attribution report", await buildLeaReport(complaint));
});

/** Ad-hoc real-time attribution of a single address. */
export const attribute = asyncHandler(async (req, res) => {
  const body = req.body as {
    address: string;
    chain: Parameters<typeof attributeAddress>[0];
    maxHops: number;
    minValueUsd: number;
    direction: "outbound" | "inbound" | "both";
    seedValueUsd?: number;
    fraudType?: Parameters<typeof attributeAddress>[2] extends infer O
      ? O extends { reportedType?: infer F }
        ? F
        : never
      : never;
  };

  const result = await attributeAddress(body.chain, body.address, {
    maxHops: body.maxHops,
    minValueUsd: body.minValueUsd,
    direction: body.direction,
    ...(body.seedValueUsd !== undefined ? { seedValueUsd: body.seedValueUsd } : {}),
    ...(body.fraudType ? { reportedType: body.fraudType } : {}),
  });

  // The graph is large; the workspace fetches it separately when needed.
  const { graph: _graph, ...summary } = result;
  sendSuccess(res, "Address attribution", summary);
});
