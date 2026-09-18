import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createCase } from "@/lib/api/queries";
import { CASE_PRIORITIES } from "@/lib/domain";
import { useUIStore } from "@/stores/ui";

const schema = z.object({
  title: z.string().min(6, "Give the case a descriptive title (min 6 chars)."),
  description: z.string().max(2000).optional(),
  priority: z.enum(CASE_PRIORITIES),
  jurisdiction: z.string().max(120).optional(),
  reported_loss: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateCaseDialog() {
  const open = useUIStore((s) => s.createCaseOpen);
  const setOpen = useUIStore((s) => s.setCreateCaseOpen);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      priority: "medium",
      jurisdiction: "",
      reported_loss: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createCase({
        title: values.title,
        description: values.description || undefined,
        priority: values.priority,
        jurisdiction: values.jurisdiction || undefined,
        reported_loss: values.reported_loss
          ? Number(values.reported_loss)
          : null,
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["cases"] });
      toast.success(`${created.case_ref} opened`);
      setOpen(false);
      form.reset();
      void navigate({ to: "/cases/$caseId", params: { caseId: created.id } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Open a new case</DialogTitle>
          <DialogDescription>
            A case is the container for investigations, findings, evidence and
            reports. A case reference is assigned automatically.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Case title</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Multi-victim USDT drainer campaign"
                      {...field}
                    />
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
                  <FormLabel>Complaint summary</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="What was reported, by whom, and what is the investigative objective?"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
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
                        {CASE_PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p.charAt(0).toUpperCase() + p.slice(1)}
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
                name="reported_loss"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reported loss (USD)</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        placeholder="412500"
                        className="mono"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="jurisdiction"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Requesting unit / jurisdiction</FormLabel>
                  <FormControl>
                    <Input placeholder="Maharashtra Cyber, IN" {...field} />
                  </FormControl>
                  <FormDescription>
                    Recorded on generated reports.
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
              >
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Opening…" : "Open case"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
