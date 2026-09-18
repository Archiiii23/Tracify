import { currentUser } from "../middleware/auth.middleware";
import { recordAudit } from "../services/audit.service";
import {
  analyseInvestigation,
  deleteInvestigation,
  executeTrace,
  getInvestigation,
  getInvestigationStatus,
  listInvestigations,
  startInvestigation,
} from "../services/investigation.service";
import { sendPaginated, sendSuccess } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";

export const index = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const query = req.query as unknown as {
    page: number;
    limit: number;
    sort: string;
    order: "asc" | "desc";
    status?: string;
    caseId?: string;
  };
  const { items, total } = await listInvestigations(user, query);
  sendPaginated(res, "Investigations", items, {
    page: query.page,
    limit: query.limit,
    total,
  });
});

export const start = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const investigation = await startInvestigation(user, req.body);
  await recordAudit({
    actorId: user.id,
    action: "investigation.start",
    resource: "investigation",
    resourceId: String(investigation._id),
    requestId: req.requestId,
    metadata: { reference: investigation.reference, chain: investigation.chain },
  });
  sendSuccess(res, "Trace started", { investigation: investigation.toJSON() }, 201);
});

export const show = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const investigation = await getInvestigation(String(req.params['id']), user);
  sendSuccess(res, "Investigation", { investigation: investigation.toJSON() });
});

export const graph = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const investigation = await getInvestigation(String(req.params['id']), user);
  sendSuccess(res, "Investigation graph", {
    rootAddress: investigation.rootAddress,
    status: investigation.status,
    nodes: investigation.graph.nodes,
    edges: investigation.graph.edges,
  });
});

export const analysis = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const result = await analyseInvestigation(String(req.params['id']), user);
  sendSuccess(res, "Path analysis and behavioural signals", result);
});

/** Re-run the pipeline, e.g. after widening the hop bound. */
export const rerun = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const investigation = await getInvestigation(String(req.params['id']), user);
  investigation.status = "queued";
  investigation.progress = 0;
  await investigation.save();
  void executeTrace(String(investigation._id));
  sendSuccess(res, "Trace re-queued", { investigation: investigation.toJSON() }, 202);
});

export const destroy = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  await deleteInvestigation(String(req.params['id']), user);
  sendSuccess(res, "Investigation deleted", { deleted: true });
});

/** Poll-friendly pipeline status for async investigation jobs. */
export const status = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const payload = await getInvestigationStatus(String(req.params['id']), user);
  sendSuccess(res, "Investigation status", payload);
});
