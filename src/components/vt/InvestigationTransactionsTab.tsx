import { useMemo, useState } from "react";
import { ExternalLink, ArrowDownLeft, ArrowUpRight, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Mono, SeverityBadge } from "@/components/vt/badges";
import { EmptyState, ErrorState, LoadingState } from "@/components/vt/states";
import type { InternalTransaction } from "@/services/blockchain/liveAdapter";
import { chainLabel, truncateAddress } from "@/lib/domain";
import { getExplorerTxUrl } from "@/lib/explorer";
import { FORENSIC_COPY, PROVENANCE, PROVENANCE_TONE } from "@/lib/provenance";

interface InvestigationTransactionsTabProps {
  blockchain: string;
  targetAddress: string;
  transactions: InternalTransaction[];
  isLoading?: boolean;
  isFetching?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

function riskTone(tx: InternalTransaction): "low" | "medium" | "high" | undefined {
  const usd = tx.valueUsd ?? 0;
  if (usd >= 50_000) return "high";
  if (usd >= 5_000) return "medium";
  return undefined;
}

export function InvestigationTransactionsTab({
  blockchain,
  targetAddress,
  transactions,
  isLoading = false,
  isFetching = false,
  error = null,
  onRefresh,
}: InvestigationTransactionsTabProps) {
  const [selected, setSelected] = useState<InternalTransaction | null>(null);

  const sorted = useMemo(
    () => [...transactions].sort((a, b) => b.unixTime - a.unixTime),
    [transactions],
  );

  if (isLoading && sorted.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Fetching live on-chain transactions from Etherscan…
        </p>
        <LoadingState rows={5} />
      </div>
    );
  }

  if (error && sorted.length === 0) {
    return (
      <div className="space-y-3">
        <ErrorState message={error} />
        {onRefresh ? (
          <Button size="sm" variant="outline" onClick={onRefresh}>
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        ) : null}
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <EmptyState
        title="No transactions returned"
        description="Live Etherscan query returned no transfers for this wallet within the investigation filters."
        action={
          onRefresh ? (
            <Button size="sm" variant="outline" onClick={onRefresh}>
              <RefreshCw className="size-3.5" />
              Refresh from chain
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      <div className="panel overflow-hidden">
        <div className="border-b border-border/60 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {FORENSIC_COPY.publicDataNote} Live fetch via Etherscan — not stored in database.
          </p>
          <div className="flex items-center gap-2">
            {onRefresh ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] gap-1"
                disabled={isFetching}
                onClick={onRefresh}
              >
                <RefreshCw className={`size-3 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            ) : null}
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PROVENANCE_TONE[PROVENANCE.OBSERVED]}`}
            >
              {PROVENANCE.OBSERVED}
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border/50 bg-surface/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Direction</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Counterparty</th>
                <th className="px-4 py-2.5 font-medium">Asset</th>
                <th className="px-4 py-2.5 font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Tx Hash</th>
                <th className="px-4 py-2.5 font-medium">Risk</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((tx) => {
                const counterparty =
                  tx.direction === "out" ? tx.to : tx.from;
                const tone = riskTone(tx);
                return (
                  <tr
                    key={`${tx.hash}-${tx.blockNumber}`}
                    className="border-b border-border/30 cursor-pointer transition-colors hover:bg-surface/50"
                    onClick={() => setSelected(tx)}
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 font-semibold ${
                          tx.direction === "out" ? "text-amber-400" : "text-emerald-400"
                        }`}
                      >
                        {tx.direction === "out" ? (
                          <ArrowUpRight className="size-3.5" />
                        ) : (
                          <ArrowDownLeft className="size-3.5" />
                        )}
                        {tx.direction === "out" ? "OUT" : "IN"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(tx.timestamp).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 mono">{truncateAddress(counterparty, 8, 6)}</td>
                    <td className="px-4 py-3">{tx.asset}</td>
                    <td className="px-4 py-3 font-medium">{tx.value}</td>
                    <td className="px-4 py-3 mono text-primary">
                      {truncateAddress(tx.hash, 8, 6)}
                    </td>
                    <td className="px-4 py-3">
                      {tone ? (
                        <SeverityBadge severity={tone} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>Transaction detail</SheetTitle>
                <SheetDescription>
                  Observed on-chain transfer on {chainLabel(blockchain)}.
                </SheetDescription>
              </SheetHeader>
              <dl className="mt-6 space-y-3 text-sm">
                <DetailRow label="Hash" value={selected.hash} mono />
                <DetailRow label="Block" value={String(selected.blockNumber)} />
                <DetailRow
                  label="Timestamp"
                  value={new Date(selected.timestamp).toLocaleString()}
                />
                <DetailRow label="From" value={selected.from} mono />
                <DetailRow label="To" value={selected.to} mono />
                <DetailRow label="Asset" value={selected.asset} />
                <DetailRow label="Amount" value={selected.value} />
                <DetailRow label="Status" value={selected.status} />
                {selected.valueUsd !== undefined && (
                  <DetailRow label="Approx. USD" value={`$${selected.valueUsd.toLocaleString()}`} />
                )}
              </dl>
              <div className="mt-6 flex gap-2">
                <Button asChild size="sm" variant="outline">
                  <a
                    href={getExplorerTxUrl(blockchain, selected.hash)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on explorer <ExternalLink className="ml-1 size-3.5" />
                  </a>
                </Button>
              </div>
              <p className="mt-4 text-[11px] text-muted-foreground">
                Subject root: <Mono>{truncateAddress(targetAddress)}</Mono>
              </p>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 break-all ${mono ? "mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
