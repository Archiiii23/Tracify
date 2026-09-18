import { currentUser } from "../middleware/auth.middleware";
import { dashboardOverview } from "../services/dashboard.service";
import { sendSuccess } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";

export const overview = asyncHandler(async (req, res) => {
  const user = currentUser(req);
  const data = await dashboardOverview(user);
  sendSuccess(res, "Dashboard overview", data);
});
