import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, PlugZap, ServerCrash, ShieldCheck, Unplug } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip } from "@/components/vt/badges";
import { useBackend } from "@/hooks/useBackend";
import { DEMO_SERVICE_CREDENTIALS, backendLogin, backendLogout } from "@/lib/api/backend";

/** Compact connection indicator for page headers. */
export function BackendStatusChip() {
  const { reason, checking, user } = useBackend();
  if (checking) return <Chip>Checking service…</Chip>;
  if (reason === "ready")
    return <Chip tone="positive">Attribution service · {user?.email ?? "connected"}</Chip>;
  if (reason === "offline") return <Chip tone="critical">Attribution service offline</Chip>;
  if (reason === "unconfigured") return <Chip tone="warning">Service URL not set</Chip>;
  return <Chip tone="warning">Service not connected</Chip>;
}

/**
 * Renders children only once the intelligence service is reachable *and* the
 * investigator has a service session; otherwise it explains the exact gap and,
 * where possible, offers the fix inline.
 */
export function BackendGate({ children }: { children: React.ReactNode }) {
  const { reason, checking } = useBackend();

  if (checking) {
    return (
      <div className="clay-inset flex items-center justify-center gap-2.5 px-6 py-14 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Contacting the attribution service…
      </div>
    );
  }

  if (reason === "ready") return <>{children}</>;

  if (reason === "unconfigured") {
    return (
      <Notice
        icon={Unplug}
        title="No attribution service bound to this workspace"
        body="Complaint intake, nearest-VASP attribution, alerts and LEA reporting are served by the TRACIFY intelligence service. Set VITE_API_URL to its base URL and reload."
      />
    );
  }

  if (reason === "offline") {
    return (
      <Notice
        icon={ServerCrash}
        title="The attribution service is not responding"
        body="The workspace could not get a healthy response from the configured service URL. Two common causes: the service is cold-starting (wait ~60s and retry), or it does not list this site as an allowed origin."

      />
    );
  }

  return <BackendConnectPanel />;
}

function Notice({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Unplug;
  title: string;
  body: string;
}) {
  return (
    <div className="clay-inset flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="clay-icon flex size-12 text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

/** Sign-in against the intelligence service's own investigator directory. */
export function BackendConnectPanel() {
  const { connected, user, online } = useBackend();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState<string>(DEMO_SERVICE_CREDENTIALS.email);
  const [password, setPassword] = useState<string>(DEMO_SERVICE_CREDENTIALS.password);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const signedIn = await backendLogin(email.trim(), password);
      await queryClient.invalidateQueries({ queryKey: ["backend"] });
      toast.success(`Connected as ${signedIn.email}`);
      setPassword("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not connect");
    } finally {
      setBusy(false);
    }
  };

  if (connected) {
    return (
      <div className="clay flex flex-wrap items-center gap-3 p-5">
        <div className="clay-icon flex size-10 text-positive">
          <ShieldCheck className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">Attribution service connected</p>
          <p className="mono text-[11px] text-muted-foreground">
            {user?.email} · role {user?.role ?? "unknown"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={async () => {
            backendLogout();
            await queryClient.invalidateQueries({ queryKey: ["backend"] });
          }}
        >
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="clay space-y-4 p-6">
      <div className="flex items-center gap-3">
        <div className="clay-icon flex size-10 text-primary">
          <PlugZap className="size-5" />
        </div>
        <div>
          <p className="text-sm font-medium">Connect the attribution service</p>
          <p className="text-sm text-muted-foreground">
            The intelligence service keeps its own investigator directory. Sign in once per
            device to work complaints, alerts and LEA reports.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="svc-email">Investigator email</Label>
          <Input
            id="svc-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="svc-password">Password</Label>
          <Input
            id="svc-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
      </div>

      <Button type="submit" disabled={busy || !online}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        Connect service
      </Button>
      {!online ? (
        <p className="text-[11px] text-muted-foreground">
          The service is currently unreachable, so connecting will fail.
        </p>
      ) : null}
    </form>
  );
}
