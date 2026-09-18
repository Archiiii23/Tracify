import { User } from "../models/User.model";
import { toPublicUser } from "../services/auth.service";
import { recordAudit } from "../services/audit.service";
import { currentUser } from "../middleware/auth.middleware";
import { ApiError } from "../utils/ApiError";
import { sendPaginated, sendSuccess } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";

/** Directory of workspace members — used for case assignment. */
export const index = asyncHandler(async (req, res) => {
  const query = req.query as unknown as { page: number; limit: number; search?: string };
  const filter: Record<string, unknown> = {};
  if (query.search) {
    // Escaped so a search term can never be interpreted as a regex.
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter['$or'] = [
      { name: { $regex: escaped, $options: "i" } },
      { email: { $regex: escaped, $options: "i" } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select("name email role organisation isActive createdAt lastLoginAt")
      .sort({ name: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  sendPaginated(
    res,
    "Workspace members",
    users.map((u) => toPublicUser(u)),
    { page: query.page, limit: query.limit, total },
  );
});

/** Admin-only: change a member's role or deactivate an account. */
export const update = asyncHandler(async (req, res) => {
  const actor = currentUser(req);
  const id = String(req.params['id']);
  if (id === actor.id && req.body.role && req.body.role !== "admin") {
    throw ApiError.badRequest("You cannot remove your own administrator role");
  }

  const user = await User.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
  if (!user) throw ApiError.notFound("User not found");

  await recordAudit({
    actorId: actor.id,
    action: "user.update",
    resource: "user",
    resourceId: id,
    requestId: req.requestId,
    metadata: { role: user.role, isActive: user.isActive },
  });

  sendSuccess(res, "Member updated", { user: toPublicUser(user) });
});
