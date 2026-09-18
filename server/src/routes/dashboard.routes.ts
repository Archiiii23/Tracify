import { Router } from "express";
import * as dashboard from "../controllers/dashboard.controller";
import { requireAuth } from "../middleware/auth.middleware";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);
dashboardRouter.get("/overview", dashboard.overview);
