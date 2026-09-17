import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  FolderOpen,
  FolderPlus,
  Radar,
  ShieldAlert,
  Vault,
  Wallet,
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { casesQuery, investigationsQuery } from "@/lib/api/queries";
import { truncateAddress } from "@/lib/domain";
import { useUIStore } from "@/stores/ui";

export function CommandPalette() {
  const open = useUIStore((s) => s.commandOpen);
  const setOpen = useUIStore((s) => s.setCommandOpen);
  const setCreateCaseOpen = useUIStore((s) => s.setCreateCaseOpen);
  const setStartInvestigationOpen = useUIStore((s) => s.setStartInvestigationOpen);
  const navigate = useNavigate();

  const { data: cases } = useQuery({ ...casesQuery(), enabled: open });
  const { data: investigations } = useQuery({
    ...investigationsQuery(),
    enabled: open,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const run = (fn: () => void) => {
    setOpen(false);
    setTimeout(fn, 60);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search cases, investigations, wallet addresses…" />
      <CommandList>
        <CommandEmpty>No matches in this workspace.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => run(() => setCreateCaseOpen(true))}>
            <FolderPlus className="size-4" />
            Create case
          </CommandItem>
          <CommandItem
            onSelect={() => run(() => setStartInvestigationOpen(true))}
          >
            <Radar className="size-4" />
            Start investigation
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => run(() => navigate({ to: "/cases" }))}>
            <FolderOpen className="size-4" />
            Cases
          </CommandItem>
          <CommandItem onSelect={() => run(() => navigate({ to: "/evidence" }))}>
            <Vault className="size-4" />
            Evidence
          </CommandItem>
          <CommandItem onSelect={() => run(() => navigate({ to: "/reports" }))}>
            <FileText className="size-4" />
            Reports
          </CommandItem>
        </CommandGroup>

        {cases?.length ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Cases">
              {cases.slice(0, 6).map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.case_ref} ${c.title}`}
                  onSelect={() =>
                    run(() =>
                      navigate({
                        to: "/cases/$caseId",
                        params: { caseId: c.id },
                      }),
                    )
                  }
                >
                  <FolderOpen className="size-4" />
                  <span className="mono text-[11px] text-muted-foreground">
                    {c.case_ref}
                  </span>
                  <span className="truncate">{c.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}

        {investigations?.length ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Investigations & target wallets">
              {investigations.slice(0, 6).map((inv) => (
                <CommandItem
                  key={inv.id}
                  value={`${inv.investigation_ref} ${inv.name} ${inv.target_address}`}
                  onSelect={() =>
                    run(() =>
                      navigate({
                        to: "/investigations/$investigationId/$tab",
                        params: { investigationId: inv.id, tab: "overview" },
                      }),
                    )
                  }
                >
                  <Wallet className="size-4" />
                  <span className="mono text-[11px] text-muted-foreground">
                    {truncateAddress(inv.target_address)}
                  </span>
                  <span className="truncate">{inv.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
