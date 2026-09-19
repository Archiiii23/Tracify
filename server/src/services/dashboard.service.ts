import { Case } from "../models/Case.model";
import { Evidence } from "../models/Evidence.model";
import { Finding } from "../models/Finding.model";
import { Investigation } from "../models/Investigation.model";
import { Report } from "../models/Report.model";
import type { AuthenticatedUser } from "../types/express";
import { caseScopeFilter } from "./access.service";

/** Aggregated command-centre metrics for the cases this user can see. */
export async function dashboardOverview(user: AuthenticatedUser) {
  const scope = caseScopeFilter(user);
  const cases = await Case.find(scope).select("_id status priority reportedLossUsd updatedAt").lean();
  const caseIds = cases.map((c) => c._id);

  const [investigations, findings, evidenceCount, reportCount] = await Promise.all([
    Investigation.find({ case: { $in: caseIds } })
      .select("status riskScore metrics updatedAt reference title chain")
      .sort({ updatedAt: -1 })
      .lean(),
    Finding.find({ case: { $in: caseIds } }).select("severity status createdAt").lean(),
    Evidence.countDocuments({ case: { $in: caseIds } }),
    Report.countDocuments({ case: { $in: caseIds } }),
  ]);

  const countBy = <T extends string>(items: { [k: string]: unknown }[], key: string) =>
    items.reduce<Record<string, number>>((acc, item) => {
      const value = String(item[key] ?? "unknown") as T;
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    }, {});

  const activeTraces = investigations.filter((i) =>
    ["queued", "tracing", "analysing"].includes(i.status),
  ).length;

  return {
    totals: {
      cases: cases.length,
      openCases: cases.filter((c) => c.status !== "closed").length,
      investigations: investigations.length,
      activeTraces,
      findings: findings.length,
      criticalFindings: findings.filter((f) => f.severity === "critical").length,
      evidence: evidenceCount,
      reports: reportCount,
      reportedLossUsd: cases.reduce((acc, c) => acc + (c.reportedLossUsd ?? 0), 0),
      valueTracedUsd: investigations.reduce((acc, i) => acc + (i.metrics?.valueTracedUsd ?? 0), 0),
      vaspTouchpoints: investigations.reduce((acc, i) => acc + (i.metrics?.vaspTouchpoints ?? 0), 0),
    },
    breakdown: {
      caseStatus: countBy(cases, "status"),
      casePriority: countBy(cases, "priority"),
      traceStatus: countBy(investigations, "status"),
      findingSeverity: countBy(findings, "severity"),
    },
    averageRiskScore: investigations.length
      ? Math.round(
          investigations.reduce((acc, i) => acc + (i.riskScore ?? 0), 0) / investigations.length,
        )
      : 0,
    recentInvestigations: investigations.slice(0, 6),
  };
}
