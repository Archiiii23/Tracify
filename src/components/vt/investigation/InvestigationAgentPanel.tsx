import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Bot, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ClayCard, ClayIcon, SectionHeading } from "@/components/vt/clay";
import {
  agentEventsQuery,
  agentRunQuery,
  agentRunChat,
  backendConfigured,
  startAgentInvestigation,
} from "@/lib/api/backend";
import { truncateAddress } from "@/lib/domain";

interface InvestigationAgentPanelProps {
  investigationId: string;
  chain: string;
  address: string;
  traceDepth: number;
  direction?: "outbound" | "inbound" | "both";
}

export function InvestigationAgentPanel({
  investigationId,
  chain,
  address,
  traceDepth,
  direction = "outbound",
}: InvestigationAgentPanelProps) {
  const qc = useQueryClient();
  const [runId, setRunId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");

  const run = useQuery(agentRunQuery(runId, backendConfigured() && Boolean(runId)));
  const events = useQuery(agentEventsQuery(runId, backendConfigured() && Boolean(runId)));

  const start = useMutation({
    mutationFn: () =>
      startAgentInvestigation({
        chain,
        address,
        direction,
        maxHops: traceDepth,
        externalInvestigationId: investigationId,
        objective: `Investigate fund movement for ${truncateAddress(address)} on ${chain}`,
      }),
    onSuccess: (data) => {
      setRunId(data.agent_run_id);
      toast.success(
        data.gemini_configured
          ? "Gemini agent investigation started"
          : "Deterministic agent pipeline started (configure GEMINI_API_KEY for full agent)",
      );
      void qc.invalidateQueries({ queryKey: ["backend", "ai", "agent"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to start AI agent"),
  });

  const chat = useMutation({
    mutationFn: () => agentRunChat(runId!, question.trim()),
    onSuccess: (data) => {
      toast.message("Agent response", { description: data.answer.slice(0, 280) });
      setQuestion("");
      void qc.invalidateQueries({ queryKey: ["backend", "ai", "agent", "events", runId] });
    },
    onError: (err: Error) => toast.error(err.message || "Agent chat failed"),
  });

  if (!backendConfigured()) {
    return null;
  }

  const isRunning = run.data?.status === "RUNNING";
  const assessment = run.data?.assessment;

  return (
    <ClayCard className="p-5">
      <SectionHeading
        title="AI investigation agent"
        description="Server-side Gemini orchestrator with bounded TRACIFY tools"
        action={
          !runId ? (
            <Button size="sm" disabled={start.isPending} onClick={() => start.mutate()}>
              {start.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              Run agent
            </Button>
          ) : isRunning ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-primary">
              <Loader2 className="size-3 animate-spin" />
              {run.data?.stage ?? "RUNNING"}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground capitalize">
              {run.data?.status?.toLowerCase().replace(/_/g, " ")}
            </span>
          )
        }
      />

      {runId ? (
        <div className="space-y-3">
          <div className="clay-inset flex items-center gap-3 p-3 text-[11px]">
            <ClayIcon icon={Bot} tone="intel" className="size-8" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Run {runId.slice(-8)}</p>
              <p className="text-muted-foreground">
                {run.data?.toolCalls ?? 0} tool calls ·{" "}
                {run.data?.geminiConfigured ? "Gemini tools" : "Local deterministic pipeline"}
              </p>
            </div>
          </div>

          {events.data && events.data.length > 0 ? (
            <ul className="max-h-40 space-y-1 overflow-y-auto text-[11px]">
              {events.data.slice(-12).map((ev) => (
                <li key={ev.id} className="flex justify-between gap-2 border-b border-border/30 py-1">
                  <span className="truncate text-muted-foreground">
                    {ev.toolName ?? ev.eventType}
                    {ev.resultSummary ? ` — ${ev.resultSummary.slice(0, 60)}` : ""}
                  </span>
                  <span className={ev.success ? "text-teal shrink-0" : "text-destructive shrink-0"}>
                    {ev.success ? "ok" : "err"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {assessment ? (
            <div className="clay-inset p-3 text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
              {assessment}
            </div>
          ) : null}

          {!isRunning && run.data?.status === "AWAITING_REVIEW" ? (
            <div className="flex gap-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask about this agent run…"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs"
              />
              <Button
                size="sm"
                disabled={!question.trim() || chat.isPending}
                onClick={() => chat.mutate()}
              >
                Ask
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-[12px] text-muted-foreground">
          Runs validate → summarize → fetch txs → trace → risk → VASP check on the server. Results
          require investigator review before external action.
        </p>
      )}
    </ClayCard>
  );
}
