import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteInvestigation } from "@/lib/api/queries";
import type { InvestigationRecord, InvestigationStatus } from "@/lib/domain";

const QUEUED_STATUSES: InvestigationStatus[] = ["draft", "queued", "processing"];

function actionLabel(status: InvestigationStatus): string {
  return QUEUED_STATUSES.includes(status) ? "Remove from queue" : "Delete investigation";
}

function dialogTitle(status: InvestigationStatus, ref: string): string {
  return QUEUED_STATUSES.includes(status)
    ? `Remove ${ref} from queue?`
    : `Delete ${ref}?`;
}

function dialogDescription(status: InvestigationStatus): string {
  return QUEUED_STATUSES.includes(status)
    ? "This will cancel the in-progress trace and remove the investigation from your queue. Linked findings and evidence for this investigation will also be removed."
    : "This permanently removes the investigation, its stored graph analysis, and any findings or evidence linked only to this trace.";
}

export function DeleteInvestigationButton({
  investigation,
  variant = "ghost",
  size = "sm",
  className,
  onDeleted,
}: {
  investigation: Pick<InvestigationRecord, "id" | "investigation_ref" | "status" | "name">;
  variant?: "ghost" | "outline" | "destructive";
  size?: "sm" | "icon" | "default";
  className?: string;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const isQueued = QUEUED_STATUSES.includes(investigation.status);
  const label = actionLabel(investigation.status);

  const mutation = useMutation({
    mutationFn: () => deleteInvestigation(investigation.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["investigations"] });
      void queryClient.invalidateQueries({ queryKey: ["findings"] });
      void queryClient.invalidateQueries({ queryKey: ["evidence"] });
      toast.success(
        isQueued
          ? `${investigation.investigation_ref} removed from queue.`
          : `${investigation.investigation_ref} deleted.`,
      );
      setOpen(false);
      onDeleted?.();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          className={className}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          title={label}
        >
          {size === "icon" ? (
            isQueued ? (
              <XCircle className="size-4" />
            ) : (
              <Trash2 className="size-4" />
            )
          ) : (
            <>
              {isQueued ? <XCircle className="size-3.5" /> : <Trash2 className="size-3.5" />}
              {label}
            </>
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{dialogTitle(investigation.status, investigation.investigation_ref)}</AlertDialogTitle>
          <AlertDialogDescription>
            {dialogDescription(investigation.status)}
            {investigation.name ? (
              <>
                {" "}
                Trace: <span className="font-medium text-foreground">{investigation.name}</span>
              </>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={mutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
          >
            {mutation.isPending ? "Removing…" : isQueued ? "Remove from queue" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
