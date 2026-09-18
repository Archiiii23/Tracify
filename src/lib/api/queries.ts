/**
 * Data access layer.
 *
 * Every read/write against the backend goes through this module so that the UI
 * never talks to the database client directly. Row-level security scopes access
 * to authenticated investigators.
 */
import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type {
  CaseRecord,
  EvidenceRecord,
  FindingRecord,
  InvestigationRecord,
  ReportRecord,
} from "@/lib/domain";

function unwrap<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    const msg = (res.error.message || "").toLowerCase();
    const code = res.error.code || "";
    if (
      msg.includes("jwt") ||
      msg.includes("token") ||
      msg.includes("jws") ||
      code === "PGRST301" ||
      code === "401"
    ) {
      if (typeof window !== "undefined") {
        console.warn("[Supabase] Invalid/expired JWT detected in query response, clearing session:", res.error.message);
        void supabase.auth.signOut();
      }
    }
    throw new Error(res.error.message);
  }
  return res.data as T;
}

/* ---------------- Cases ---------------- */

export const casesQuery = () =>
  queryOptions({
    queryKey: ["cases"],
    queryFn: async () =>
      unwrap<CaseRecord[]>(
        (await supabase
          .from("cases")
          .select("*")
          .order("created_at", { ascending: false })) as never,
      ),
  });

export const caseQuery = (id: string) =>
  queryOptions({
    queryKey: ["cases", id],
    queryFn: async () =>
      unwrap<CaseRecord>(
        (await supabase.from("cases").select("*").eq("id", id).single()) as never,
      ),
  });

export interface CaseInput {
  title: string;
  description?: string | undefined;
  priority: string;
  status?: string | undefined;
  jurisdiction?: string | undefined;
  reported_loss?: number | null | undefined;
}

export async function createCase(input: CaseInput) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("You must be signed in to create a case.");

  const case_ref = `CASE-${new Date().getFullYear()}-${String(
    Math.floor(Math.random() * 9000) + 1000,
  )}`;

  return unwrap<CaseRecord>(
    (await supabase
      .from("cases")
      .insert({ ...input, case_ref, created_by: userId, assigned_to: userId } as never)
      .select()
      .single()) as never,
  );
}

export async function updateCase(id: string, patch: Partial<CaseInput>) {
  return unwrap<CaseRecord>(
    (await supabase
      .from("cases")
      .update(patch as never)
      .eq("id", id)
      .select()
      .single()) as never,
  );
}

export async function deleteCase(id: string) {
  const { error } = await supabase.from("cases").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* ---------------- Investigations ---------------- */

export const investigationsQuery = (caseId?: string) =>
  queryOptions({
    queryKey: ["investigations", caseId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("investigations")
        .select("*")
        .order("created_at", { ascending: false });
      if (caseId) q = q.eq("case_id", caseId);
      return unwrap<InvestigationRecord[]>((await q) as never);
    },
  });

export const investigationQuery = (id: string) =>
  queryOptions({
    queryKey: ["investigations", "detail", id],
    queryFn: async () =>
      unwrap<InvestigationRecord>(
        (await supabase
          .from("investigations")
          .select("*")
          .eq("id", id)
          .single()) as never,
      ),
  });

/** Live on-chain tx history — always fetched from Etherscan key, never from DB cache. */
export const investigationTransactionsQuery = (
  investigation: InvestigationRecord | null | undefined,
) =>
  queryOptions({
    queryKey: [
      "investigation-transactions-live",
      investigation?.id,
      investigation?.target_address,
      investigation?.blockchain,
      investigation?.min_value,
      investigation?.window_start,
      investigation?.window_end,
    ],
    enabled: Boolean(investigation?.target_address),
    staleTime: 0,
    gcTime: 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { fetchInvestigationTransactions } = await import(
        "@/services/blockchain/liveAdapter"
      );
      return fetchInvestigationTransactions(
        investigation!.blockchain || "ethereum",
        investigation!.target_address,
        50,
        {
          includeTokens: true,
          minValueUsd: investigation!.min_value ?? 0,
          windowStart: investigation!.window_start,
          windowEnd: investigation!.window_end,
        },
      );
    },
  });

export interface InvestigationInput {
  case_id: string;
  name: string;
  description?: string | undefined;
  target_address: string;
  blockchain: string;
  trace_depth: number;
  window_start?: string | null | undefined;
  window_end?: string | null | undefined;
  min_value?: number | null | undefined;
  status?: string | undefined;
}

export async function createInvestigation(input: InvestigationInput) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("You must be signed in to start an investigation.");

  const investigation_ref = `INV-${String(Math.floor(Math.random() * 9000) + 1000)}`;

  return unwrap<InvestigationRecord>(
    (await supabase
      .from("investigations")
      .insert({
        ...input,
        investigation_ref,
        status: input.status ?? "queued",
        created_by: userId,
      } as never)
      .select()
      .single()) as never,
  );
}

export async function updateInvestigation(
  id: string,
  patch: Record<string, unknown>,
) {
  return unwrap<InvestigationRecord>(
    (await supabase
      .from("investigations")
      .update(patch as never)
      .eq("id", id)
      .select()
      .single()) as never,
  );
}

export async function deleteInvestigation(id: string) {
  const { error } = await supabase.from("investigations").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* ---------------- Findings ---------------- */

export const findingsQuery = (filters?: {
  caseId?: string;
  investigationId?: string;
}) =>
  queryOptions({
    queryKey: [
      "findings",
      filters?.caseId ?? "all",
      filters?.investigationId ?? "all",
    ],
    queryFn: async () => {
      let q = supabase
        .from("findings")
        .select("*")
        .order("created_at", { ascending: false });
      if (filters?.caseId) q = q.eq("case_id", filters.caseId);
      if (filters?.investigationId)
        q = q.eq("investigation_id", filters.investigationId);
      return unwrap<FindingRecord[]>((await q) as never);
    },
  });

export interface FindingInput {
  case_id?: string | null | undefined;
  investigation_id?: string | null | undefined;
  title: string;
  description?: string | undefined;
  severity: string;
  confidence: number;
  finding_type?: string | undefined;
  related?: Record<string, unknown> | undefined;
}

export async function createFinding(input: FindingInput) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("You must be signed in to record a finding.");

  return unwrap<FindingRecord>(
    (await supabase
      .from("findings")
      .insert({
        ...input,
        finding_ref: `FND-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        created_by: userId,
      } as never)
      .select()
      .single()) as never,
  );
}

/* ---------------- Evidence ---------------- */

export const evidenceQuery = (filters?: {
  caseId?: string;
  investigationId?: string;
}) =>
  queryOptions({
    queryKey: [
      "evidence",
      filters?.caseId ?? "all",
      filters?.investigationId ?? "all",
    ],
    queryFn: async () => {
      let q = supabase
        .from("evidence")
        .select("*")
        .order("created_at", { ascending: false });
      if (filters?.caseId) q = q.eq("case_id", filters.caseId);
      if (filters?.investigationId)
        q = q.eq("investigation_id", filters.investigationId);
      return unwrap<EvidenceRecord[]>((await q) as never);
    },
  });

export interface EvidenceInput {
  case_id?: string | null | undefined;
  investigation_id?: string | null | undefined;
  title: string;
  evidence_type: string;
  description?: string | undefined;
  source?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export async function createEvidence(input: EvidenceInput) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("You must be signed in to add evidence.");

  return unwrap<EvidenceRecord>(
    (await supabase
      .from("evidence")
      .insert({
        ...input,
        evidence_ref: `EVD-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        added_by: userId,
      } as never)
      .select()
      .single()) as never,
  );
}

/* ---------------- Reports ---------------- */

export const reportsQuery = () =>
  queryOptions({
    queryKey: ["reports"],
    queryFn: async () =>
      unwrap<ReportRecord[]>(
        (await supabase
          .from("reports")
          .select("*")
          .order("created_at", { ascending: false })) as never,
      ),
  });

export interface ReportInput {
  case_id?: string | null | undefined;
  investigation_id?: string | null | undefined;
  title: string;
  sections: string[];
  notes?: string | undefined;
  status?: string | undefined;
}

export async function createReport(input: ReportInput) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("You must be signed in to build a report.");

  return unwrap<ReportRecord>(
    (await supabase
      .from("reports")
      .insert({
        ...input,
        report_ref: `RPT-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        created_by: userId,
      } as never)
      .select()
      .single()) as never,
  );
}

/* ---------------- Profile & roles ---------------- */

export const profileQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["profile", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

export const rolesQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["roles", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId!);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => r.role as string);
    },
  });
