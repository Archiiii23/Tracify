import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { CloudUpload, FileUp, X } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { casesQuery, createEvidence } from "@/lib/api/queries";
import { EVIDENCE_TYPES } from "@/lib/domain";
import { formatBytes, uploadEvidenceToS3 } from "@/lib/api/s3";

const MAX_FILE_MB = 25;

const schema = z.object({
  case_id: z.string().uuid("Choose the case this evidence belongs to."),
  title: z.string().min(3, "Give this evidence a short title."),
  evidence_type: z.enum(EVIDENCE_TYPES),
  description: z.string().max(2000).optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  /** If provided, the case picker is locked to this case. */
  presetCaseId?: string;
  /** Trigger element. Defaults to a primary "Upload evidence" button. */
  trigger?: React.ReactNode;
}

export function EvidenceUploadDialog({ presetCaseId, trigger }: Props) {
  const [open, setOpen]         = useState(false);
  const [file, setFile]         = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);

  const queryClient = useQueryClient();
  const cases = useQuery(casesQuery());

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      case_id: presetCaseId ?? "",
      title: "",
      evidence_type: "document",
      description: "",
    },
  });

  const reset = () => {
    setFile(null);
    setProgress(0);
    form.reset({
      case_id: presetCaseId ?? "",
      title: "",
      evidence_type: "document",
      description: "",
    });
  };

  const upload = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!file) throw new Error("Choose a file to upload.");
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        throw new Error(`File exceeds ${MAX_FILE_MB} MB limit.`);
      }

      const uploaded = await uploadEvidenceToS3({
        case_id: values.case_id,
        file,
        onProgress: setProgress,
      });

      return createEvidence({
        case_id:         values.case_id,
        title:           values.title,
        evidence_type:   values.evidence_type,
        description:     values.description || undefined,
        source:          `Amazon S3 · ${uploaded.s3_bucket}`,
        s3_bucket:       uploaded.s3_bucket,
        s3_key:          uploaded.s3_key,
        original_name:   uploaded.original_name,
        mime_type:       uploaded.mime_type,
        file_size:       uploaded.file_size,
        checksum_sha256: uploaded.checksum_sha256,
        metadata: {
          uploadedVia:  "aws-s3",
          uploadedAt:   new Date().toISOString(),
        },
      });
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["evidence"] });
      toast.success(`${created.evidence_ref} sealed in Amazon S3`);
      setOpen(false);
      reset();
    },
    onError: (err: Error) => {
      setProgress(0);
      toast.error(err.message);
    },
  });

  const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      setFile(f);
      if (!form.getValues("title")) form.setValue("title", f.name);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <CloudUpload className="mr-2 size-4" />
            Upload evidence
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload evidence to Amazon S3</DialogTitle>
          <DialogDescription>
            The file is stored in a private S3 bucket and sealed with a
            SHA-256 chain-of-custody checksum. Only its metadata lives in the
            database.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => upload.mutate(v))}
            className="space-y-4"
          >
            {/* --- Dropzone --- */}
            <label
              htmlFor="evidence-file"
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-border-strong"
              }`}
            >
              <FileUp className="size-6 text-muted-foreground" />
              {file ? (
                <div className="flex items-center gap-2">
                  <span className="mono text-xs">{file.name}</span>
                  <span className="mono text-[10px] text-muted-foreground">
                    ({formatBytes(file.size)})
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setFile(null);
                    }}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                    aria-label="Remove file"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm">
                    <span className="font-semibold text-primary">Choose a file</span>{" "}
                    or drop it here
                  </p>
                  <p className="mono text-[10px] text-muted-foreground">
                    Up to {MAX_FILE_MB} MB · PDF, images, docs, JSON, CSV, ZIP
                  </p>
                </>
              )}
              <input
                id="evidence-file"
                type="file"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f && !form.getValues("title")) form.setValue("title", f.name);
                }}
              />
            </label>

            {upload.isPending ? (
              <div className="space-y-1">
                <Progress value={Math.round(progress * 100)} />
                <p className="mono text-[10px] text-muted-foreground">
                  {progress < 1
                    ? `Uploading to S3… ${Math.round(progress * 100)}%`
                    : "Sealing metadata…"}
                </p>
              </div>
            ) : null}

            {/* --- Case --- */}
            <FormField
              control={form.control}
              name="case_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Case</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={Boolean(presetCaseId)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a case…" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(cases.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="mono text-[11px] text-muted-foreground">
                            {c.case_ref}
                          </span>{" "}
                          — {c.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* --- Title + type --- */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Evidence title</FormLabel>
                    <FormControl>
                      <Input placeholder="Signed report package" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="evidence_type"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {EVIDENCE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t.replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder="What this evidence shows and why it matters."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Sealed SHA-256 checksum is computed automatically in the browser.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={upload.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!file || upload.isPending}
              >
                {upload.isPending ? "Uploading…" : "Upload to S3"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
