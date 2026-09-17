import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Chip, Mono } from "@/components/vt/badges";
import { BackendGate, BackendStatusChip } from "@/components/vt/BackendGate";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatTile,
} from "@/components/vt/states";
import {
  complaintsQuery,
  fileComplaint,
  triageQueueQuery,
  type FileComplaintInput,
} from "@/lib/api/backend";
import {
  COMPLAINT_SOURCE_LABEL,
  FRAUD_TYPES,
  FRAUD_TYPE_LABEL,
  RISK_CATEGORIES,
  TRIAGE_STATUSES,
  type FraudType,
  type RiskCategory,
} from "@/lib/api/backend-types";
import { BLOCKCHAINS, truncateAddress } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/complaints/")({
  head: () => ({
    meta: [
      { title: "Victim complaints — TRACIFY" },
      {
        name: "description",
        content:
          "NCRP, SAHYOG and LEA complaint intake with automated triage: reported suspect wallets, risk category and the nearest attributed exchange for each report.",
      },
      { property: "og:title", content: "Victim complaints — TRACIFY" },
      {
        property: "og:description",
        content:
          "Automated intake and triage of fraud-linked wallet reports from cybercrime portals.",
      },
    ],
  }),
  component: ComplaintsPage,
});

const RISK_TONE: Record<RiskCategory, "neutral" | "info" | "warning" | "critical"> = {
  low: "neutral",
  moderate: "info",
  elevated: "warning",
  high: "critical",
  severe: "critical",
};

function ComplaintsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Intake"
        title="Victim complaints"
        description="Every complaint from NCRP, SAHYOG or an integrating LEA system lands here and is triaged automatically: suspect wallets are traced, the nearest regulated exchange is attributed, and risk is scored before an investigator opens it."
        actions={
          <>
            <BackendStatusChip />
            <FileComplaintDialog />
          </>
        }
      />
      <BackendGate>
        <ComplaintList />
      </BackendGate>
    </div>
  );
}

function ComplaintList() {
  const [status, setStatus] = useState("all");
  const [risk, setRisk] = useState("all");
  const [search, setSearch] = useState("");

  const complaints = useQuery(complaintsQuery({ status, riskCategory: risk, search }));
  const queue = useQuery(triageQueueQuery());

  const items = complaints.data?.items ?? [];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile
          label="In queue"
          value={(queue.data?.['received'] ?? 0) + (queue.data?.['attributing'] ?? 0)}
          hint="awaiting attribution"
        />
        <StatTile
          label="Attributed"
          value={queue.data?.['attributed'] ?? 0}
          hint="VASP identified"
          tone="intel"
        />
        <StatTile
          label="Escalated"
          value={queue.data?.['escalated'] ?? 0}
          hint="linked to a case"
          tone="positive"
        />
        <StatTile
          label="Failed triage"
          value={queue.data?.['failed'] ?? 0}
          hint="needs manual trace"
          tone="critical"
        />
      </div>

      <div className="clay flex flex-wrap items-center gap-2.5 p-4">
        <Input
          placeholder="Search reference, external ref or wallet…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {TRIAGE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={risk} onValueChange={setRisk}>
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All risk bands</SelectItem>
            {RISK_CATEGORIES.map((r) => (
              <SelectItem key={r} value={r}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {complaints.error ? <ErrorState message={complaints.error.message} /> : null}

      {complaints.isLoading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No complaints match"
          description="Complaints arrive through the machine-to-machine intake endpoint used by NCRP and SAHYOG, or can be filed manually from this screen."
        />
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <Link
              key={c.id}
              to="/complaints/$complaintId"
              params={{ complaintId: c.id }}
              className="clay clay-lift block rounded-2xl p-5 shadow-clay transition-all hover:border-primary/40 cursor-pointer"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Mono className="text-muted-foreground">{c.reference}</Mono>
                <Chip tone="info">{COMPLAINT_SOURCE_LABEL[c.source]}</Chip>
                <Chip>{FRAUD_TYPE_LABEL[c.fraudType]}</Chip>
                <Chip tone={RISK_TONE[c.riskCategory]} dot>
                  {c.riskCategory} · {c.riskScore}
                </Chip>
                <span className="mono ml-auto text-[11px] text-muted-foreground">
                  {c.triageStatus}
                </span>
              </div>

              <div className="mt-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <p className="text-sm font-semibold">
                  ₹{c.lossInr.toLocaleString("en-IN")} reported loss
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {c.suspectAddresses.length} suspect wallet
                  {c.suspectAddresses.length === 1 ? "" : "s"}
                  {c.jurisdiction ? ` · ${c.jurisdiction}` : ""}
                </p>
              </div>

              {c.primaryVasp ? (
                <p className="mono mt-2 text-[11px] text-intel">
                  Nearest VASP · {c.primaryVasp.entity} · {c.primaryVasp.hops} hop
                  {c.primaryVasp.hops === 1 ? "" : "s"} ·{" "}
                  {Math.round(c.primaryVasp.confidence * 100)}% confidence
                </p>
              ) : (
                <p className="mono mt-2 text-[11px] text-muted-foreground">
                  No regulated touchpoint attributed yet
                </p>
              )}

              <div className="mono mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3 text-[11px]">
                {c.suspectAddresses.slice(0, 4).map((a) => (
                  <Chip key={`${a.chain}:${a.address}`}>
                    {a.chain} · {truncateAddress(a.address, 8, 6)}
                  </Chip>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const EMPTY: FileComplaintInput = {
  source: "manual",
  fraudType: "investment-scam",
  lossInr: 0,
  addresses: [{ address: "", chain: "ethereum" }],
};

function FileComplaintDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FileComplaintInput>(EMPTY);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      fileComplaint({
        ...form,
        addresses: form.addresses
          .filter((a) => a.address.trim().length > 0)
          .map((a) => ({ address: a.address.trim(), chain: a.chain })),
      }),
    onSuccess: async (complaint) => {
      toast.success(`${complaint.reference} filed — triage queued`);
      await queryClient.invalidateQueries({ queryKey: ["backend", "complaints"] });
      setForm(EMPTY);
      setOpen(false);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not file complaint"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          File complaint
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>File a victim complaint</DialogTitle>
          <DialogDescription>
            Only non-identifying victim context is stored. The suspect wallets are traced
            immediately and attribution runs in the background.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Fraud typology</Label>
              <Select
                value={form.fraudType}
                onValueChange={(v) => setForm({ ...form, fraudType: v as FraudType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FRAUD_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {FRAUD_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loss">Reported loss (INR)</Label>
              <Input
                id="loss"
                type="number"
                min={0}
                value={form.lossInr}
                onChange={(e) => setForm({ ...form, lossInr: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jur">Jurisdiction</Label>
              <Input
                id="jur"
                placeholder="e.g. Maharashtra Cyber"
                value={form.jurisdiction ?? ""}
                onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ext">Portal acknowledgement</Label>
              <Input
                id="ext"
                placeholder="NCRP ack number"
                value={form.externalRef ?? ""}
                onChange={(e) => setForm({ ...form, externalRef: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Suspect wallets</Label>
            {form.addresses.map((a, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder="Wallet address"
                  value={a.address}
                  onChange={(e) => {
                    const next = [...form.addresses];
                    next[i] = { ...a, address: e.target.value };
                    setForm({ ...form, addresses: next });
                  }}
                  className="mono"
                />
                <Select
                  value={a.chain}
                  onValueChange={(v) => {
                    const next = [...form.addresses];
                    next[i] = { ...a, chain: v };
                    setForm({ ...form, addresses: next });
                  }}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BLOCKCHAINS.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setForm({
                  ...form,
                  addresses: [...form.addresses, { address: "", chain: "ethereum" }],
                })
              }
            >
              Add another wallet
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="narrative">Narrative</Label>
            <Textarea
              id="narrative"
              rows={3}
              placeholder="How the funds left the victim, platforms involved, payment rails used…"
              value={form.narrative ?? ""}
              onChange={(e) => setForm({ ...form, narrative: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={() => mutation.mutate()}
            disabled={
              mutation.isPending ||
              form.addresses.every((a) => a.address.trim().length === 0)
            }
          >
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            File & triage
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
