import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Vault } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Chip, Mono } from "@/components/vt/badges";
import { EvidenceUploadDialog } from "@/components/vt/EvidenceUploadDialog";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatTile,
} from "@/components/vt/states";
import { casesQuery, evidenceQuery } from "@/lib/api/queries";
import {
  EVIDENCE_TYPES,
  extractedEntityCount,
  isS3BackedEvidence,
} from "@/lib/domain";
import { formatBytes, getPresignedDownloadUrl } from "@/lib/api/s3";

export const Route = createFileRoute("/_authenticated/evidence")({
  head: () => ({
    meta: [
      { title: "Evidence vault — TRACIFY" },
      {
        name: "description",
        content:
          "Immutable, time-stamped evidence for every case: pinned transactions, wallets, graph snapshots, documents and analyst notes.",
      },
      { property: "og:title", content: "Evidence vault — TRACIFY" },
      {
        property: "og:description",
        content:
          "Time-stamped, attributable evidence supporting each investigative conclusion.",
      },
    ],
  }),
  component: EvidencePage,
});

function EvidencePage() {
  const [type, setType] = useState("all");
  const evidence = useQuery(evidenceQuery());
  const cases = useQuery(casesQuery());

  const caseRef = (id: string | null) =>
    id ? ((cases.data ?? []).find((c) => c.id === id)?.case_ref ?? null) : null;

  const filtered = (evidence.data ?? []).filter(
    (e) => type === "all" || e.evidence_type === type,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Chain of custody"
        title="Evidence"
        description="Every artefact is time-stamped and attributed to the investigator who pinned it, so conclusions stay defensible outside this tool."
        actions={
          <div className="flex items-center gap-2">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All evidence types</SelectItem>
                {EVIDENCE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <EvidenceUploadDialog />
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Items held"
          value={(evidence.data ?? []).length}
          hint="across all cases"
        />
        <StatTile
          label="On-chain artefacts"
          value={
            (evidence.data ?? []).filter((e) =>
              ["transaction", "wallet", "graph_snapshot"].includes(
                e.evidence_type,
              ),
            ).length
          }
          hint="transactions, wallets, snapshots"
          tone="intel"
        />
        <StatTile
          label="Analyst records"
          value={
            (evidence.data ?? []).filter((e) =>
              ["note", "document", "screenshot", "reference"].includes(
                e.evidence_type,
              ),
            ).length
          }
          hint="notes, documents, references"
        />
      </div>

      {evidence.error ? <ErrorState message={evidence.error.message} /> : null}

      {evidence.isLoading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Vault}
          title="No evidence of this type"
          description="Pin transactions, wallets and graph snapshots from the investigation workspace to build the case record."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((e) => {
            const s3Backed = isS3BackedEvidence(e);
            return (
              <article
                key={e.id}
                className="clay clay-lift rounded-2xl p-5 shadow-clay transition-all hover:border-border-strong"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Mono className="text-muted-foreground">{e.evidence_ref}</Mono>
                  <Chip tone="intel">{e.evidence_type.replace(/_/g, " ")}</Chip>
                  {s3Backed ? (
                    <span title={`s3://${e.s3_bucket}/${e.s3_key}`}>
                      <Chip tone="positive" dot>
                        Amazon S3
                      </Chip>
                    </span>
                  ) : null}
                  {s3Backed && e.extraction_status === "extracting" ? (
                    <Chip tone="info" dot>Textract extracting…</Chip>
                  ) : null}
                  {s3Backed && e.extraction_status === "extracted" && extractedEntityCount(e) > 0 ? (
                    <span title="Extracted by Amazon Textract">
                      <Chip tone="info" dot>
                        Textract · {extractedEntityCount(e)} entit{extractedEntityCount(e) === 1 ? "y" : "ies"}
                      </Chip>
                    </span>
                  ) : null}
                  {s3Backed && e.extraction_status === "failed" ? (
                    <span title={e.extraction_error ?? ""}>
                      <Chip tone="warning" dot>Textract failed</Chip>
                    </span>
                  ) : null}
                  {caseRef(e.case_id) ? (
                    <Link
                      to="/cases/$caseId"
                      params={{ caseId: e.case_id! }}
                      className="mono text-[11px] text-primary hover:underline"
                    >
                      {caseRef(e.case_id)}
                    </Link>
                  ) : null}
                </div>
                <h2 className="mt-2.5 text-sm font-semibold">{e.title}</h2>
                {e.description ? (
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {e.description}
                  </p>
                ) : null}
                <dl className="mono mt-3 space-y-1 border-t border-border pt-3 text-[11px] text-muted-foreground">
                  <div className="flex justify-between gap-3">
                    <dt>captured</dt>
                    <dd>{new Date(e.created_at).toLocaleString()}</dd>
                  </div>
                  {e.source ? (
                    <div className="flex justify-between gap-3">
                      <dt>source</dt>
                      <dd className="truncate">{e.source}</dd>
                    </div>
                  ) : null}
                  {s3Backed ? (
                    <>
                      <div className="flex justify-between gap-3">
                        <dt>file</dt>
                        <dd className="truncate">
                          {e.original_name}
                          {typeof e.file_size === "number"
                            ? ` · ${formatBytes(e.file_size)}`
                            : ""}
                        </dd>
                      </div>
                      {e.checksum_sha256 ? (
                        <div className="flex justify-between gap-3">
                          <dt>sha-256</dt>
                          <dd className="truncate" title={e.checksum_sha256}>
                            {e.checksum_sha256.slice(0, 12)}…
                          </dd>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </dl>
                {s3Backed && e.extraction_status === "extracted" && extractedEntityCount(e) > 0 ? (
                  <div className="mt-3 space-y-1.5 rounded-lg border border-primary/25 bg-primary/5 p-3">
                    <div className="mono text-[10px] uppercase tracking-wider text-primary">
                      Extracted by Amazon Textract
                    </div>
                    {e.extracted_entities.walletAddresses?.length ? (
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        <span className="text-[11px] text-muted-foreground">Wallets:</span>
                        {e.extracted_entities.walletAddresses.slice(0, 4).map((w) => (
                          <span
                            key={w}
                            className="mono text-[10px] rounded border border-border bg-secondary px-1.5 py-0.5"
                            title={w}
                          >
                            {w.slice(0, 6)}…{w.slice(-4)}
                          </span>
                        ))}
                        {e.extracted_entities.walletAddresses.length > 4 ? (
                          <span className="text-[10px] text-muted-foreground">
                            +{e.extracted_entities.walletAddresses.length - 4} more
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {e.extracted_entities.txHashes?.length ? (
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        <span className="text-[11px] text-muted-foreground">Tx hashes:</span>
                        {e.extracted_entities.txHashes.slice(0, 3).map((tx) => (
                          <span
                            key={tx}
                            className="mono text-[10px] rounded border border-border bg-secondary px-1.5 py-0.5"
                            title={tx}
                          >
                            {tx.slice(0, 8)}…
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {e.extracted_entities.amounts?.length ? (
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        <span className="text-[11px] text-muted-foreground">Amounts:</span>
                        {e.extracted_entities.amounts.slice(0, 3).map((a) => (
                          <span key={a} className="mono text-[10px] text-foreground">
                            {a}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {s3Backed ? (
                  <div className="mt-3 flex justify-end">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        try {
                          const { url } = await getPresignedDownloadUrl(e.s3_key!);
                          window.open(url, "_blank", "noopener,noreferrer");
                        } catch (err) {
                          toast.error((err as Error).message);
                        }
                      }}
                    >
                      <Download className="mr-2 size-3.5" />
                      Open from S3
                    </Button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
