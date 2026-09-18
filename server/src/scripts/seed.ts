/**
 * Demo seed: one coherent multi-victim USDT drainer investigation.
 *
 * Run with `npm run seed` against a development database. It is idempotent —
 * existing demo documents are removed first — and refuses to run in production.
 */
import mongoose from "mongoose";
import { connectDatabase, disconnectDatabase } from "../config/db";
import { env } from "../config/env";
import { Case } from "../models/Case.model";
import { Counter } from "../models/Counter.model";
import { Evidence, checksumOf } from "../models/Evidence.model";
import { Finding } from "../models/Finding.model";
import { Investigation } from "../models/Investigation.model";
import { Report } from "../models/Report.model";
import { User, hashPassword } from "../models/User.model";
import { executeTrace } from "../services/investigation.service";
import { generateReport } from "../services/report.service";
import { logger } from "../utils/logger";

const DEMO_EMAIL = "analyst@tracify.io";
const DEMO_PASSWORD = "TracifyDemo2026!";

async function seed(): Promise<void> {
  if (env.isProduction) {
    throw new Error("Refusing to seed a production database");
  }

  await connectDatabase();

  await Promise.all([
    Case.deleteMany({}),
    Investigation.deleteMany({}),
    Finding.deleteMany({}),
    Evidence.deleteMany({}),
    Report.deleteMany({}),
    Counter.deleteMany({}),
    User.deleteMany({ email: DEMO_EMAIL }),
  ]);

  const analyst = await User.create({
    name: "Ada Kestrel",
    email: DEMO_EMAIL,
    passwordHash: await hashPassword(DEMO_PASSWORD),
    role: "admin",
    organisation: "Tracify Financial Intelligence Unit",
  });

  const user = {
    id: String(analyst._id),
    email: analyst.email,
    name: analyst.name,
    role: analyst.role,
  };

  const primary = await Case.create({
    reference: "CASE-2026-0001",
    title: "Multi-victim USDT drainer campaign",
    summary:
      "Fourteen victims report wallet-draining approvals signed through a cloned airdrop portal. Value converges on a small set of deposit addresses at two regulated services.",
    status: "active",
    priority: "critical",
    jurisdiction: "EU · MiCA",
    reportedLossUsd: 412_500,
    chains: ["ethereum", "polygon"],
    tags: ["drainer", "approval-phishing", "usdt"],
    createdBy: analyst._id,
    assignedTo: [analyst._id],
  });

  const secondary = await Case.create({
    reference: "CASE-2026-0002",
    title: "OTC desk laundering suspicion",
    summary:
      "Structured deposits into an OTC desk shortly after each drainer settlement window.",
    status: "open",
    priority: "high",
    jurisdiction: "UK",
    reportedLossUsd: 96_000,
    chains: ["ethereum"],
    tags: ["otc", "structuring"],
    createdBy: analyst._id,
    assignedTo: [analyst._id],
  });

  await Counter.create([
    { key: `CASE-${new Date().getUTCFullYear()}`, seq: 2 },
  ]);

  const traces = await Investigation.create([
    {
      reference: "INV-2026-0001",
      case: primary._id,
      title: "Trace victim #1 outflow",
      rootAddress: "0x8f29c1200000000000000000000000000000ab12",
      chain: "ethereum",
      maxHops: 5,
      minValueUsd: 250,
      startedBy: analyst._id,
    },
    {
      reference: "INV-2026-0002",
      case: primary._id,
      title: "Trace consolidated settlement wallet",
      rootAddress: "0x41ba9d70000000000000000000000000000cd934",
      chain: "polygon",
      maxHops: 4,
      minValueUsd: 100,
      startedBy: analyst._id,
    },
    {
      reference: "INV-2026-0003",
      case: secondary._id,
      title: "Trace OTC desk deposits",
      rootAddress: "0x77aa4410000000000000000000000000000ef551",
      chain: "ethereum",
      maxHops: 3,
      minValueUsd: 500,
      startedBy: analyst._id,
    },
  ]);

  for (const trace of traces) await executeTrace(String(trace._id), 42_500);

  const findings = await Finding.create([
    {
      case: primary._id,
      investigation: traces[0]?._id,
      title: "Approval-drainer signature pattern confirmed",
      description:
        "All fourteen victim wallets executed an ERC-20 approval to the same spender contract within 40 seconds of visiting the cloned portal, followed by a transferFrom sweep.",
      severity: "critical",
      category: "layering",
      confidence: 0.94,
      status: "confirmed",
      addresses: ["0x8f29c1200000000000000000000000000000ab12"],
      recordedBy: analyst._id,
    },
    {
      case: primary._id,
      investigation: traces[1]?._id,
      title: "Deposit address attributed to a regulated service",
      description:
        "Consolidated value terminates at a deposit address clustered to Aurora Exchange with 0.92 confidence, making an information request the correct next step.",
      severity: "high",
      category: "vasp-deposit",
      confidence: 0.92,
      status: "confirmed",
      recordedBy: analyst._id,
    },
    {
      case: secondary._id,
      title: "Structuring below reporting thresholds",
      description:
        "Deposits are consistently sized just under the desk's enhanced due-diligence threshold, repeated across nine sessions.",
      severity: "medium",
      category: "structuring",
      confidence: 0.71,
      recordedBy: analyst._id,
    },
  ]);

  const payloads = [
    { kind: "transaction" as const, label: "Victim #1 approval transaction", data: { hash: "0xa1", chain: "ethereum" } },
    { kind: "graph-snapshot" as const, label: "Hop 1–5 graph snapshot", data: { investigation: "INV-2026-0001" } },
    { kind: "address" as const, label: "Aurora Exchange deposit address", data: { confidence: 0.92 } },
  ];

  await Evidence.create(
    payloads.map((p, index) => ({
      case: primary._id,
      investigation: traces[0]?._id,
      finding: findings[index % findings.length]?._id,
      kind: p.kind,
      label: p.label,
      payload: p.data,
      checksum: checksumOf(p.data),
      sealedAt: new Date(),
      pinnedBy: analyst._id,
    })),
  );

  const report = await generateReport(user, {
    caseId: String(primary._id),
    audience: "law-enforcement",
  });

  logger.info("seed complete", {
    analyst: DEMO_EMAIL,
    cases: 2,
    investigations: traces.length,
    findings: findings.length,
    report: report.reference,
  });

  // Credentials are intentionally printed: this is a local demo dataset.
  console.log(`\nDemo sign-in: ${DEMO_EMAIL} / ${DEMO_PASSWORD}\n`);
}

seed()
  .then(async () => {
    await disconnectDatabase();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    logger.error("seed failed", {
      reason: error instanceof Error ? error.message : String(error),
    });
    if (mongoose.connection.readyState === 1) await disconnectDatabase();
    process.exit(1);
  });
