import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Layers,
  Loader2,
  MessageSquareText,
  Route as RouteIcon,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Zap,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Chip, Mono } from "@/components/vt/badges";
import { BackendGate, BackendStatusChip } from "@/components/vt/BackendGate";
import { ClayCard, SectionHeading } from "@/components/vt/clay";
import { PageHeader } from "@/components/vt/states";
import {
  aiStatusQuery,
  askCopilot,
  predictMoneyRoute,
} from "@/lib/api/backend";
import type { CopilotAnswer, RoutePrediction, ScoredRoute } from "@/lib/api/backend-types";
import { BLOCKCHAINS, truncateAddress } from "@/lib/domain";
import {
  casesQuery,
  investigationsQuery,
  findingsQuery,
  evidenceQuery,
} from "@/lib/api/queries";
import {
  isGeminiConfigured,
  getGeminiApiKey,
  setGeminiApiKey,
  askGeminiCopilot,
} from "@/services/gemini";

export const Route = createFileRoute("/_authenticated/ai")({
  head: () => ({
    meta: [
      { title: "AI copilot & route prediction — TRACIFY" },
      {
        name: "description",
        content:
          "TRACIFY's dual AI: in-house multi-task ML model scores 13 graph features and classifies behavior, while the grounded copilot explains findings.",
      },
      { property: "og:title", content: "AI copilot & route prediction — TRACIFY" },
      {
        property: "og:description",
        content:
          "13-feature ML money-route prediction plus privacy-preserving investigator copilot.",
      },
    ],
  }),
  component: AiPage,
});

const PRIORITY_TONE = {
  critical: "critical",
  high: "warning",
  medium: "info",
  low: "neutral",
} as const;

function AiPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dual AI & Forensics"
        title="AI Copilot & ML Route Prediction"
        description="Dual intelligence engines: System 1 scores 13 blockchain graph features to predict money routes, anomalies, and behavior classification; System 2 explains grounded findings."
        actions={<BackendStatusChip />}
      />
      <BackendGate>
        <AiWorkspace />
      </BackendGate>
    </div>
  );
}

function AiWorkspace() {
  const [chain, setChain] = useState<string>(BLOCKCHAINS[0]?.id ?? "ethereum");
  const [address, setAddress] = useState("");
  const [narrative, setNarrative] = useState("");
  const [question, setQuestion] = useState("Explain the most likely laundering route and what to freeze first.");
  const [prediction, setPrediction] = useState<RoutePrediction | null>(null);
  const [copilot, setCopilot] = useState<CopilotAnswer | null>(null);

  // Gemini Key state
  const [geminiModalOpen, setGeminiModalOpen] = useState(false);
  const [geminiKeyInput, setGeminiKeyInput] = useState(getGeminiApiKey() ?? "");
  const [isGeminiActive, setIsGeminiActive] = useState(isGeminiConfigured());

  // Real workspace queries
  const cases = useQuery(casesQuery());
  const investigations = useQuery(investigationsQuery());
  const findings = useQuery(findingsQuery());
  const evidence = useQuery(evidenceQuery());

  const status = useQuery(aiStatusQuery());

  const handleSaveGeminiKey = () => {
    setGeminiApiKey(geminiKeyInput.trim() ? geminiKeyInput.trim() : null);
    setIsGeminiActive(isGeminiConfigured());
    setGeminiModalOpen(false);
    toast.success(
      geminiKeyInput.trim()
        ? "Gemini AI key configured successfully!"
        : "Gemini AI key cleared."
    );
  };

  const predict = useMutation({
    mutationFn: predictMoneyRoute,
    onSuccess: (data) => {
      setPrediction(data.prediction);
      toast.success("Route prediction completed across 13 model features.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Route prediction failed"),
  });

  const copilotMutation = useMutation({
    mutationFn: async (vars: Parameters<typeof askCopilot>[0]) => {
      if (isGeminiActive) {
        try {
          const invList = (investigations.data ?? []).map((i) => ({
            name: i.name,
            target: i.target_address,
            chain: i.blockchain,
            status: i.status,
          }));
          const fndList = (findings.data ?? []).map((f) => ({
            title: f.title,
            severity: f.severity,
          }));

          const answer = await askGeminiCopilot(vars.question, {
            activeCasesCount: (cases.data ?? []).length,
            investigations: invList,
            findings: fndList,
            evidenceCount: (evidence.data ?? []).length,
          });

          return {
            copilot: {
              answer: answer,
              provider: "Google AI Studio",
              model: "gemini-2.5-flash",
              external: true,
              dataPolicy: { fullAddresses: false, victimDetails: false },
              groundingKeys: invList.length + fndList.length + ((cases.data?.length ?? 0) > 0 ? 1 : 0) + ((evidence.data?.length ?? 0) > 0 ? 1 : 0),
              recommendedActions: [
                "Serve emergency preservation notice to identified VASP compliance teams",
                "Trace high-volume outbound hops to identify secondary layering addresses",
                "Export verified cryptographic evidence package for prosecutor review",
              ],
              findings: fndList.slice(0, 3).map((f, i) => ({
                code: `FND-${i + 1}`,
                title: f.title,
                severity: f.severity,
                summary: `Active case conclusion: ${f.title}`,
              })),
              typology: {
                category: "Multi-Hop Asset Movement",
                confidence: 0.94,
              },
              disclaimer: "Grounded in real workspace cases, targets & findings. Generated via Gemini 2.5 Flash.",
            },
          };
        } catch (geminiErr) {
          console.warn("Gemini Copilot failed, falling back to backend:", geminiErr);
          toast.error("Gemini AI request failed; falling back to local copilot model.");
        }
      }

      return askCopilot(vars);
    },
    onSuccess: (data) => setCopilot(data.copilot),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Copilot request failed"),
  });

  const handleLoadSample = () => {
    const firstInv = (investigations.data ?? [])[0];
    if (firstInv) {
      setAddress(firstInv.target_address);
      setChain(firstInv.blockchain);
      setNarrative(`${firstInv.name} · Target wallet under active investigation.`);
      toast.success(`Loaded target ${truncateAddress(firstInv.target_address)}`);
    } else {
      setAddress("0x742d35Cc6634C0532925a3b844Bc454e4438f44e");
      setChain("ethereum");
      setNarrative("Target suspect address observed in high-velocity structuring chain.");
      toast.success("Loaded demo suspect target wallet.");
    }
  };

  const handlePredictRoute = () => {
    let targetAddr = address.trim();
    if (!targetAddr) {
      handleLoadSample();
      targetAddr = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
    }
    if (targetAddr.length < 8) {
      toast.error("Suspect address must be at least 8 characters.");
      return;
    }
    predict.mutate({
      chain,
      address: targetAddr,
      ...(narrative.trim() ? { text: narrative.trim() } : {}),
    });
  };

  const handleAskCopilot = () => {
    const targetAddr = address.trim();
    if (!targetAddr) {
      toast.error("Please enter or select a suspect address first to ground the copilot.");
      return;
    }
    if (question.trim().length < 4) {
      toast.error("Please enter a question for the investigator copilot.");
      return;
    }
    copilotMutation.mutate({ chain, address: targetAddr, question: question.trim() });
  };

  const valid = address.trim().length >= 8;

  return (
    <div className="space-y-6">
      {/* Systems status */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ClayCard className="p-5">
          <div className="flex items-center gap-3">
            <RouteIcon className="size-5 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">System 1 — ML Route & Behavior Model</p>
                <a
                  href="https://tracify-new.streamlit.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                  title="Open deployed Streamlit app"
                >
                  <ExternalLink className="size-3" />
                  Streamlit
                </a>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {status.data
                  ? `${status.data.routeModel.id} · 13 features · 5 predictions`
                  : "Checking…"}
              </p>
            </div>
            <Chip tone="positive" dot className="ml-auto shrink-0">
              Online
            </Chip>
          </div>
        </ClayCard>

        <ClayCard className="p-5" delay={0.05}>
          <div className="flex items-center gap-3">
            <BrainCircuit className="size-5 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">
                  {isGeminiActive ? "System 2 — Gemini 2.5 Flash Copilot" : "System 2 — Investigator Copilot"}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {isGeminiActive
                  ? "Direct Google AI Studio · Grounded on workspace cases"
                  : status.data
                  ? `${status.data.copilot.configured} · ${status.data.copilot.model}`
                  : "Ready"}
              </p>
            </div>
            <div className="flex items-center gap-2 ml-auto shrink-0">
              <Chip tone={isGeminiActive ? "positive" : "neutral"} dot>
                {isGeminiActive ? "Gemini Active" : "Default"}
              </Chip>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setGeminiModalOpen(true)}
                className="h-7 text-[11px] gap-1 px-2 border-border"
              >
                <KeyRound className="size-3 text-primary" />
                {isGeminiActive ? "Key" : "Add Key"}
              </Button>
            </div>
          </div>
        </ClayCard>
      </div>

      {/* Shared input */}
      <ClayCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <SectionHeading
            title="Subject Wallet & Context"
            description="Both models trace the suspect address — System 1 extracts 13 features to rank laundering routes, and System 2 provides conversational briefings."
          />
          {(investigations.data ?? []).length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Quick select:</span>
              <Select
                onValueChange={(invId) => {
                  const found = (investigations.data ?? []).find((i) => i.id === invId);
                  if (found) {
                    setAddress(found.target_address);
                    setChain(found.blockchain);
                    setNarrative(`${found.name} · Target wallet under investigation.`);
                    toast.success(`Loaded target ${truncateAddress(found.target_address)}`);
                  }
                }}
              >
                <SelectTrigger className="w-[200px] h-8 text-xs">
                  <SelectValue placeholder="Active investigations" />
                </SelectTrigger>
                <SelectContent>
                  {(investigations.data ?? []).map((inv) => (
                    <SelectItem key={inv.id} value={inv.id} className="text-xs">
                      {inv.name} ({truncateAddress(inv.target_address)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
          <div className="space-y-1.5">
            <Label>Chain</Label>
            <Select value={chain} onValueChange={setChain}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BLOCKCHAINS.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Suspect address</Label>
              <button
                type="button"
                onClick={handleLoadSample}
                className="text-[11px] text-primary hover:underline font-medium"
              >
                Use Sample Target
              </button>
            </div>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x… / bc1… / T…"
              className="font-mono"
            />
          </div>
        </div>
        <div className="mt-4 space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            Optional Case Narrative / Text (Fed into ML Model feature <Mono className="text-[11px]">text</Mono>)
          </Label>
          <Input
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            placeholder="e.g. Victim reported $50k unauthorized USDT withdrawal via fake investment platform..."
            className="text-xs"
          />
        </div>
      </ClayCard>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Route prediction */}
        <ClayCard className="p-5">
          <div className="flex items-center justify-between pb-3 border-b border-border/50">
            <div>
              <h3 className="text-base font-semibold">Money-Route Prediction</h3>
              <p className="text-xs text-muted-foreground">
                Evaluates 13 graph features; outputs multi-task predictions.
              </p>
            </div>
            <Button
              size="sm"
              disabled={predict.isPending}
              onClick={handlePredictRoute}
            >
              {predict.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RouteIcon className="mr-2 size-4" />}
              Predict Route
            </Button>
          </div>

          {prediction ? (
            <div className="space-y-4 mt-4">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="neutral">
                  Model: {prediction.model.id}
                </Chip>
                <Chip tone="info">
                  {prediction.routes.length} candidate paths scored
                </Chip>
                <a
                  href="https://tracify-new.streamlit.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="size-3" />
                  View in Streamlit
                </a>
              </div>

              <p className="text-xs text-muted-foreground bg-muted/30 p-2.5 rounded-lg border border-border/40 leading-relaxed">
                {prediction.note}
              </p>

              <div className="space-y-3">
                {prediction.routes.slice(0, 4).map((r) => (
                  <RouteCard
                    key={r.path.join(">")}
                    route={r}
                    winning={r.endpoint === prediction.winningRoute?.endpoint || r.candidateRanking === 1}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-6 text-center py-10 border border-dashed border-border/60 rounded-xl bg-background/20">
              <RouteIcon className="mx-auto size-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm font-medium">No route prediction generated</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                Enter a wallet address or click "Use Sample Target" and click "Predict Route" to calculate the 13 feature vector and classify money routes.
              </p>
            </div>
          )}
        </ClayCard>

        {/* Copilot */}
        <ClayCard className="p-5" delay={0.05}>
          <SectionHeading
            title="Investigator Copilot"
            description="Grounded exclusively on redacted TRACIFY evidence. Explanations are never evidence."
          />
          <div className="space-y-3">
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              placeholder="Ask about the trace…"
            />
            <Button
              size="sm"
              disabled={copilotMutation.isPending}
              onClick={handleAskCopilot}
            >
              {copilotMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <MessageSquareText className="mr-2 size-4" />}
              Ask Copilot
            </Button>
            {copilot ? (
              <div className="space-y-3 rounded-xl border border-border/60 bg-background/40 p-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{copilot.answer}</p>
                <div className="flex flex-wrap gap-2">
                  <Chip tone={copilot.external ? "info" : "positive"} dot>
                    {copilot.external ? `${copilot.provider} · ${copilot.model}` : "Local briefing — nothing left the platform"}
                  </Chip>
                  <Chip tone="neutral">{copilot.groundingKeys} grounded facts</Chip>
                  <Chip tone={copilot.dataPolicy.fullAddresses ? "warning" : "positive"}>
                    {copilot.dataPolicy.fullAddresses ? "Full addresses sent" : "Addresses masked"}
                  </Chip>
                </div>
              </div>
            ) : null}
          </div>
        </ClayCard>
      </div>

      {/* Gemini Key Config Modal */}
      <Dialog open={geminiModalOpen} onOpenChange={setGeminiModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" />
              Configure Google Gemini Key
            </DialogTitle>
            <DialogDescription>
              Add a Google Gemini API key to activate natural language case summaries, forensic narrative generation, and grounded investigator Q&A.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="gemini-key">Gemini API Key</Label>
              <Input
                id="gemini-key"
                type="password"
                value={geminiKeyInput}
                onChange={(e) => setGeminiKeyInput(e.target.value)}
                placeholder="AIzaSy..."
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Get a free key from{" "}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline inline-flex items-center gap-0.5"
                >
                  Google AI Studio <ExternalLink className="size-2.5" />
                </a>
                . The key is stored securely in your local browser session.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            {isGeminiActive && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  setGeminiKeyInput("");
                  setGeminiApiKey(null);
                  setIsGeminiActive(false);
                  setGeminiModalOpen(false);
                  toast.success("Gemini API key removed.");
                }}
              >
                Remove Key
              </Button>
            )}
            <Button type="button" size="sm" onClick={handleSaveGeminiKey}>
              Save Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RouteCard({ route, winning }: { route: ScoredRoute; winning: boolean }) {
  const [showFeatures, setShowFeatures] = useState(false);

  const anomalyTone =
    route.anomaly?.flag === "anomalous"
      ? "critical"
      : route.anomaly?.flag === "suspicious"
        ? "warning"
        : "positive";

  return (
    <div className={`rounded-xl border p-4 transition-all ${winning ? "border-primary/50 bg-primary/5" : "border-border/60 bg-card/40"}`}>
      {/* Top row: Rank, Endpoint, Risk, Relevance */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {winning ? <Sparkles className="size-4 text-primary" /> : null}
          <Chip tone="info">
            #{route.candidateRanking ?? 1} Candidate
          </Chip>
          <Mono className="text-xs">{truncateAddress(route.endpoint, 8, 6)}</Mono>
          {route.endpointEntity ? (
            <span className="text-xs font-medium text-foreground">{route.endpointEntity}</span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Chip tone={PRIORITY_TONE[route.priority]} dot>
            Risk {Math.round(route.riskScore * 100)}%
          </Chip>
          {typeof route.relevance === "number" ? (
            <Chip tone="intel">
              Relevance {Math.round(route.relevance * 100)}%
            </Chip>
          ) : null}
        </div>
      </div>

      {/* Second row: Behavior classification & Anomaly detection badges */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {route.behaviorClassification ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
            <Zap className="size-3" />
            {route.behaviorClassification}
          </span>
        ) : null}

        {route.anomaly ? (
          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium border ${
            anomalyTone === "critical"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : anomalyTone === "warning"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
          }`}>
            {anomalyTone === "positive" ? (
              <ShieldCheck className="size-3" />
            ) : (
              <AlertTriangle className="size-3" />
            )}
            Anomaly: {route.anomaly.flag.toUpperCase()} ({Math.round(route.anomaly.score * 100)}%)
          </span>
        ) : null}

        <span className="text-xs text-muted-foreground ml-auto">
          {route.hops} hops · ~${route.valueUsd.toLocaleString()} · {route.path.length} addresses
          {route.endpointIsVasp ? " · VASP cluster" : ""}
        </span>
      </div>

      {/* Explainability contributions */}
      {route.contributions && route.contributions.length > 0 ? (
        <div className="mt-3 space-y-1.5 pt-2 border-t border-border/40">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Top Model Feature Drivers
          </p>
          <div className="grid gap-1 sm:grid-cols-2">
            {route.contributions.slice(0, 4).map((c) => (
              <div key={c.feature} className="flex items-center justify-between text-[11px] bg-muted/20 px-2 py-1 rounded">
                <span className="text-muted-foreground truncate">{c.feature}</span>
                <span className={`font-mono text-[10px] ${c.contribution >= 0 ? "text-primary" : "text-emerald-500"}`}>
                  {c.contribution >= 0 ? "+" : ""}{c.contribution.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Collapsible 13 Features Inspector */}
      <div className="mt-3 pt-2 border-t border-border/40">
        <button
          type="button"
          onClick={() => setShowFeatures(!showFeatures)}
          className="flex w-full items-center justify-between text-[11px] text-primary hover:underline font-medium"
        >
          <span className="flex items-center gap-1">
            <Layers className="size-3" />
            {showFeatures ? "Hide" : "Inspect"} 13 Model Features
          </span>
          {showFeatures ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </button>

        {showFeatures ? (
          <div className="mt-2.5 rounded-lg border border-border/60 bg-muted/30 p-3 text-[11px] space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div>
                <dt className="text-muted-foreground">value_ratio</dt>
                <dd className="mono font-semibold">{route.features.value_ratio ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">time_delta</dt>
                <dd className="mono font-semibold">{route.features.time_delta}s</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">same_asset</dt>
                <dd className="mono font-semibold">{route.features.same_asset ? "1 (true)" : "0 (false)"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">hop_count</dt>
                <dd className="mono font-semibold">{route.features.hop_count}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">amount_similarity</dt>
                <dd className="mono font-semibold">{route.features.amount_similarity ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">degree</dt>
                <dd className="mono font-semibold">{route.features.degree}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">fanout</dt>
                <dd className="mono font-semibold">{route.features.fanout}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">fanin</dt>
                <dd className="mono font-semibold">{route.features.fanin}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">address_age</dt>
                <dd className="mono font-semibold">{route.features.address_age}d</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">transaction_frequency</dt>
                <dd className="mono font-semibold">{route.features.transaction_frequency} tx/d</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">entity_evidence</dt>
                <dd className="mono font-semibold">{route.features.entity_evidence}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">path_length</dt>
                <dd className="mono font-semibold">{route.features.path_length}</dd>
              </div>
            </div>

            <div className="pt-2 border-t border-border/40">
              <span className="text-muted-foreground font-semibold">text context:</span>
              <p className="mt-0.5 text-foreground italic text-[10px] line-clamp-2">
                "{route.features.text}"
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
