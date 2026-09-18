import { useEffect, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { Radar, CheckCircle2, Loader2, Circle, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { TraceDepthSelect } from "@/components/vt/TraceDepthSelect";
import { DEFAULT_TRACE_DEPTH, MAX_TRACE_DEPTH } from "@/lib/domain";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { casesQuery, createInvestigation } from "@/lib/api/queries";
import { BLOCKCHAINS } from "@/lib/domain";
import { useUIStore } from "@/stores/ui";
import {
  PIPELINE_STAGES,
  runInvestigationPipeline,
  type PipelineProgress,
} from "@/services/investigationPipeline";

const schema = z.object({
  case_id: z.string().uuid("Select the case this investigation belongs to."),
  name: z.string().min(6, "Name the investigation (min 6 chars)."),
  description: z.string().max(2000).optional(),
  target_address: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Enter a valid EVM address (0x + 40 hex chars)."),
  blockchain: z.string().min(1),
  trace_depth: z.number().min(1).max(MAX_TRACE_DEPTH),
  window_start: z.string().optional(),
  window_end: z.string().optional(),
  min_value: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type StepStatus = "pending" | "active" | "done" | "failed";

function AnalysisProgressStepper({
  progress,
  investigationRef,
  failed,
}: {
  progress: PipelineProgress | null;
  investigationRef: string;
  failed?: boolean;
}) {
  const activeIndex = progress
    ? PIPELINE_STAGES.findIndex((s) => s.key === progress.stage)
    : 0;

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-foreground">
          {investigationRef} — Live Analysis Pipeline
        </p>
        <p className="text-xs text-muted-foreground">
          {progress?.note ?? "Initializing real on-chain investigation…"}
        </p>
      </div>

      {progress && (
        <Progress value={progress.progress} className="h-1.5" />
      )}

      <div className="space-y-2.5 py-2">
        {PIPELINE_STAGES.filter((s) => s.key !== "ready").map((step, i) => {
          let status: StepStatus = "pending";
          if (failed && i === activeIndex) status = "failed";
          else if (i < activeIndex) status = "done";
          else if (i === activeIndex) status = "active";

          return (
            <div
              key={step.key}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-300 ${
                status === "done"
                  ? "bg-emerald-500/10 border border-emerald-500/20"
                  : status === "active"
                    ? "bg-primary/10 border border-primary/30"
                    : status === "failed"
                      ? "bg-destructive/10 border border-destructive/30"
                      : "bg-secondary/30 border border-transparent"
              }`}
            >
              {status === "done" ? (
                <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
              ) : status === "active" ? (
                <Loader2 className="size-4 text-primary animate-spin shrink-0" />
              ) : status === "failed" ? (
                <AlertTriangle className="size-4 text-destructive shrink-0" />
              ) : (
                <Circle className="size-4 text-muted-foreground/40 shrink-0" />
              )}
              <span
                className={`text-xs font-medium ${
                  status === "done"
                    ? "text-emerald-400"
                    : status === "active"
                      ? "text-foreground"
                      : status === "failed"
                        ? "text-destructive"
                        : "text-muted-foreground/60"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {progress?.stage === "ready" && (
        <div className="text-center">
          <p className="text-xs text-emerald-400 font-semibold animate-pulse">
            ✓ Real on-chain analysis complete — opening workspace…
          </p>
        </div>
      )}
    </div>
  );
}

export function StartInvestigationDialog({
  presetCaseId,
}: {
  presetCaseId?: string | undefined;
}) {
  const open = useUIStore((s) => s.startInvestigationOpen);
  const setOpen = useUIStore((s) => s.setStartInvestigationOpen);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: cases } = useQuery({ ...casesQuery(), enabled: open });

  const [analysisState, setAnalysisState] = useState<{
    active: boolean;
    investigationId: string;
    investigationRef: string;
    failed: boolean;
  } | null>(null);
  const [pipelineProgress, setPipelineProgress] = useState<PipelineProgress | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      case_id: presetCaseId ?? "",
      name: "",
      description: "",
      target_address: "",
      blockchain: "ethereum",
      trace_depth: DEFAULT_TRACE_DEPTH,
      window_start: "",
      window_end: "",
      min_value: "",
    },
  });

  useEffect(() => {
    if (open && presetCaseId) form.setValue("case_id", presetCaseId);
  }, [open, presetCaseId, form]);

  const navigateToWorkspace = useCallback(
    (investigationId: string) => {
      setAnalysisState(null);
      setPipelineProgress(null);
      setOpen(false);
      form.reset();
      void navigate({
        to: "/investigations/$investigationId/$tab",
        params: { investigationId, tab: "graph" },
      });
    },
    [setOpen, form, navigate],
  );

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const created = await createInvestigation({
        case_id: values.case_id,
        name: values.name,
        description: values.description || undefined,
        target_address: values.target_address.toLowerCase(),
        blockchain: values.blockchain,
        trace_depth: values.trace_depth,
        window_start: values.window_start
          ? new Date(values.window_start).toISOString()
          : null,
        window_end: values.window_end
          ? new Date(values.window_end).toISOString()
          : null,
        min_value: values.min_value ? Number(values.min_value) : null,
        status: "queued",
      });

      setAnalysisState({
        active: true,
        investigationId: created.id,
        investigationRef: created.investigation_ref,
        failed: false,
      });

      let openedGraph = false;
      await runInvestigationPipeline(created, {
        onProgress: (p) => setPipelineProgress(p),
        onGraphProgress: (snapshot) => {
          if (!openedGraph && snapshot.nodeCount > 0) {
            openedGraph = true;
            setOpen(false);
            void navigate({
              to: "/investigations/$investigationId/$tab",
              params: { investigationId: created.id, tab: "graph" },
            });
          }
        },
      });
      return created;
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["investigations"] });
      toast.success(`${created.investigation_ref} — live on-chain trace complete`);
      setTimeout(() => navigateToWorkspace(created.id), 800);
    },
    onError: (error: Error) => {
      setAnalysisState((prev) => (prev ? { ...prev, failed: true } : prev));
      toast.error(error.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!analysisState) setOpen(v); }}>
      <DialogContent className="sm:max-w-xl">
        {analysisState ? (
          <AnalysisProgressStepper
            progress={pipelineProgress}
            investigationRef={analysisState.investigationRef}
            failed={analysisState.failed}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Radar className="size-4 text-primary" />
                Start an investigation
              </DialogTitle>
              <DialogDescription>
                Real on-chain trace bounded by hop depth, time window and value
                threshold. The pipeline fetches live transactions, builds the
                graph, ranks fund-flow paths, and correlates entity intelligence.
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
                className="max-h-[65vh] space-y-4 overflow-y-auto pr-1"
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
                  name="target_address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target wallet address</FormLabel>
                      <FormControl>
                        <Input
                          className="mono"
                          placeholder="0x7f3a9c41d8b2e6a05c19fd4b7e82a1c60d5f93ab"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Real EVM address — becomes the root of the bounded investigation graph.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Investigation name</FormLabel>
                      <FormControl>
                        <Input placeholder="Trace — Suspected Mixer Interaction" {...field} />
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
                      <FormLabel>Notes (optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={2}
                          placeholder="Context that analysts reviewing the case should know."
                          {...field}
                        />
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
                        <FormLabel>Blockchain</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {BLOCKCHAINS.filter((b) => b.supported).map((b) => (
                              <SelectItem key={b.id} value={b.id}>
                                {b.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                          <TraceDepthSelect
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <Accordion type="single" collapsible>
                  <AccordionItem value="advanced" className="border-b-0">
                    <AccordionTrigger className="text-xs text-muted-foreground py-2">
                      Advanced bounds
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-1">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                          control={form.control}
                          name="window_start"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Window start</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="window_end"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Window end</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="min_value"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Minimum transaction value (USD)</FormLabel>
                            <FormControl>
                              <Input
                                className="mono"
                                inputMode="decimal"
                                placeholder="500"
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>
                              Filters dust and decoy transfers from the graph.
                            </FormDescription>
                          </FormItem>
                        )}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? "Running live trace…" : "Begin Analysis →"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
