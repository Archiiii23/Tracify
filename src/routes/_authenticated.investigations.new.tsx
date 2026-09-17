import { useCallback, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Radar } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { GraphCanvas } from "@/components/vt/GraphCanvas";
import { TraceDepthSelect } from "@/components/vt/TraceDepthSelect";
import { PageHeader } from "@/components/vt/states";
import { casesQuery, createInvestigation, updateInvestigation } from "@/lib/api/queries";
import { BLOCKCHAINS, DEFAULT_TRACE_DEPTH, MAX_TRACE_DEPTH } from "@/lib/domain";
import { FORENSIC_COPY } from "@/lib/provenance";
import { validateAddress } from "@/services/blockchain/liveAdapter";
import type { InvestigationGraph } from "@/services/intelligence";
import {
  PIPELINE_STAGES,
  runInvestigationPipeline,
  type PipelineProgress,
} from "@/services/investigationPipeline";

const FRAUD_CATEGORIES = [
  { id: "crypto_fraud", label: "Cryptocurrency fraud" },
  { id: "investment_scam", label: "Investment scam" },
  { id: "romance_scam", label: "Romance scam" },
  { id: "ransomware", label: "Ransomware" },
  { id: "other", label: "Other" },
] as const;

const schema = z
  .object({
    case_id: z.string().uuid("Select the case this investigation belongs to."),
    name: z.string().min(6, "Case title must be at least 6 characters."),
    description: z.string().max(2000).optional(),
    target_address: z.string().trim().min(1, "Wallet address is required."),
    blockchain: z.string().min(1),
    transaction_hash: z
      .string()
      .optional()
      .refine((v) => !v || /^0x[a-fA-F0-9]{64}$/.test(v.trim()), {
        message: "Transaction hash must be 0x followed by 64 hex characters.",
      }),
    fraud_category: z.string().min(1),
    approx_loss: z.string().optional(),
    incident_date: z.string().optional(),
    investigator_notes: z.string().max(4000).optional(),
    trace_depth: z.number().min(1).max(MAX_TRACE_DEPTH),
  })
  .superRefine((data, ctx) => {
    const check = validateAddress(data.target_address, data.blockchain);
    if (!check.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target_address"],
        message: check.error ?? "Invalid address for selected blockchain.",
      });
    }
    if (data.approx_loss && Number.isNaN(Number(data.approx_loss))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["approx_loss"],
        message: "Approximate loss must be a number.",
      });
    }
  });

type FormValues = z.infer<typeof schema>;

export const Route = createFileRoute("/_authenticated/investigations/new")({
  head: () => ({
    meta: [{ title: "New investigation — TRACIFY" }],
  }),
  component: NewInvestigationPage,
});

function NewInvestigationPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: cases } = useQuery(casesQuery());
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress | null>(null);
  const [createdRef, setCreatedRef] = useState<string | null>(null);
  const [buildingGraph, setBuildingGraph] = useState<InvestigationGraph | null>(null);
  const [latestNodeId, setLatestNodeId] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      case_id: "",
      name: "",
      description: "",
      target_address: "",
      blockchain: "ethereum",
      transaction_hash: "",
      fraud_category: "crypto_fraud",
      approx_loss: "",
      incident_date: "",
      investigator_notes: "",
      trace_depth: DEFAULT_TRACE_DEPTH,
    },
  });

  const navigateToWorkspace = useCallback(
    (investigationId: string) => {
      void navigate({
        to: "/investigations/$investigationId/$tab",
        params: { investigationId, tab: "graph" },
      });
    },
    [navigate],
  );

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const normalized =
        values.blockchain !== "bitcoin" && values.blockchain !== "tron"
          ? values.target_address.trim().toLowerCase()
          : values.target_address.trim();

      const created = await createInvestigation({
        case_id: values.case_id,
        name: values.name,
        description: values.description || undefined,
        target_address: normalized,
        blockchain: values.blockchain,
        trace_depth: values.trace_depth,
        status: "queued",
      });

      setCreatedRef(created.investigation_ref);

      await updateInvestigation(created.id, {
        summary: {
          fraudCategory: values.fraud_category,
          approxLoss: values.approx_loss ? Number(values.approx_loss) : null,
          incidentDate: values.incident_date || null,
          transactionHash: values.transaction_hash?.trim() || null,
          investigatorNotes: values.investigator_notes || null,
          pipelineStage: "validate",
          progress: 0,
        },
      });

      await runInvestigationPipeline(
        { ...created, target_address: normalized },
        {
          onProgress: (p) => setPipelineProgress(p),
          onGraphProgress: (snapshot) => {
            setBuildingGraph(snapshot.graph);
            setLatestNodeId(snapshot.latestNodeId);
          },
        },
      );

      return created;
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["investigations"] });
      toast.success(`${created.investigation_ref} — investigation queued and analyzed`);
      setTimeout(() => navigateToWorkspace(created.id), 600);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const running = mutation.isPending;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        to="/investigations"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to investigations
      </Link>

      <PageHeader
        eyebrow="New case trace"
        title="New investigation"
        description={FORENSIC_COPY.publicDataNote}
      />

      {running ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
          <div className="min-h-[min(780px,72vh)]">
            {buildingGraph && buildingGraph.nodes.length > 0 ? (
              <GraphCanvas
                graph={buildingGraph}
                paths={[]}
                focusedPath={null}
                selectedId={null}
                building
                latestNodeId={latestNodeId}
                onSelectNode={() => undefined}
                onSelectEdge={() => undefined}
              />
            ) : (
              <div className="panel flex h-full min-h-[min(780px,72vh)] items-center justify-center p-8">
                <div className="max-w-sm space-y-3 text-center">
                  <p className="text-sm font-semibold">Preparing graph canvas…</p>
                  <p className="text-xs text-muted-foreground">
                    Fetching on-chain transactions. The target wallet will appear first, then
                    counterparties one node at a time.
                  </p>
                  {pipelineProgress && (
                    <Progress value={pipelineProgress.progress} className="h-2" />
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="panel space-y-4 p-5 xl:sticky xl:top-4">
            <p className="text-sm font-semibold">
              {createdRef ?? "Investigation"} — Live analysis pipeline
            </p>
            {pipelineProgress && (
              <>
                <Progress value={pipelineProgress.progress} className="h-2" />
                <p className="text-xs text-muted-foreground">{pipelineProgress.note}</p>
              </>
            )}
            {buildingGraph && (
              <p className="text-xs text-amber-300/90">
                {buildingGraph.nodes.length} address
                {buildingGraph.nodes.length === 1 ? "" : "es"} · {buildingGraph.edges.length}{" "}
                transfer{buildingGraph.edges.length === 1 ? "" : "s"} mapped
              </p>
            )}
            <ul className="space-y-2">
              {PIPELINE_STAGES.map((stage, idx) => {
                const activeIdx = pipelineProgress
                  ? PIPELINE_STAGES.findIndex((s) => s.key === pipelineProgress.stage)
                  : 0;
                const done = idx < activeIdx;
                const active = idx === activeIdx;
                return (
                  <li
                    key={stage.key}
                    className={`text-xs ${done ? "text-emerald-400" : active ? "text-foreground" : "text-muted-foreground/60"}`}
                  >
                    {done ? "✓" : active ? "●" : "○"} {stage.label}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="panel space-y-5 p-6"
          >
            <FormField
              control={form.control}
              name="case_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parent case</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a case" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(cases ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.case_ref} — {c.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Case title</FormLabel>
                  <FormControl>
                    <Input placeholder="Suspected crypto fraud investigation" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Brief case context…" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="blockchain"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Blockchain / network</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {BLOCKCHAINS.map((b) => (
                          <SelectItem key={b.id} value={b.id} disabled={!b.supported}>
                            {b.label}
                            {!b.supported ? " (coming soon)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="fraud_category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fraud category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {FRAUD_CATEGORIES.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="target_address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Wallet address</FormLabel>
                  <FormControl>
                    <Input className="mono" placeholder="0x…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="transaction_hash"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Transaction hash (optional)</FormLabel>
                  <FormControl>
                    <Input className="mono" placeholder="0x…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="approx_loss"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Approximate loss (USD)</FormLabel>
                    <FormControl>
                      <Input className="mono" inputMode="decimal" placeholder="250000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="incident_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Incident date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="investigator_notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Investigator notes</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Victim report summary, referral source…" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="trace_depth"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Trace depth</FormLabel>
                  <FormControl>
                    <TraceDepthSelect value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormDescription>
                    Bounded multi-hop tracing — does not crawl the entire blockchain.
                  </FormDescription>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" asChild>
                <Link to="/investigations">Cancel</Link>
              </Button>
              <Button type="submit">
                <Radar className="size-4" />
                Launch investigation
              </Button>
            </div>
          </form>
        </Form>
      )}
    </div>
  );
}
