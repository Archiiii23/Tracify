import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { motion } from "motion/react";
import { Lock, ShieldCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TracifyMark } from "@/components/vt/AppShell";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — TRACIFY Investigator Console" },
      {
        name: "description",
        content:
          "Secure sign-in for TRACIFY, the blockchain investigation and financial intelligence console for cybercrime investigators.",
      },
      { property: "og:title", content: "Sign in — TRACIFY" },
      {
        property: "og:description",
        content:
          "Secure sign-in for the TRACIFY blockchain investigation console.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().email("Enter a valid work email address."),
  password: z.string().min(8, "Passwords must be at least 8 characters."),
});

type Values = z.infer<typeof schema>;

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  const onSubmit = async (values: Values) => {
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword(values);
        if (error) throw error;
        void navigate({ to: "/dashboard" });
      } else {
        const { data, error } = await supabase.auth.signUp({
          ...values,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Account created. Welcome aboard.");
          void navigate({ to: "/dashboard" });
        } else {
          toast.success("Account created. Signing you in…");
          const { error: signInError } =
            await supabase.auth.signInWithPassword(values);
          if (signInError) throw signInError;
          void navigate({ to: "/dashboard" });
        }
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Authentication failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    try {
      // Direct OAuth redirect — works on any origin (Vercel, custom domain)
      // that is allow-listed in Cloud Auth Settings redirect URLs.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth` },
      });
      if (error) {
        toast.error(error.message || "Google sign-in is unavailable right now.");
        setBusy(false);
      }
      // On success the browser navigates away to Google — nothing more to do.
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Google sign-in failed.",
      );
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Intelligence context panel */}
      <div className="ambient-glow relative hidden flex-col justify-between overflow-hidden border-r border-border bg-workspace p-10 lg:flex">
        <div className="canvas-grid absolute inset-0 opacity-60" aria-hidden />
        <div className="relative flex items-center gap-3">
          <TracifyMark />
          <div>
            <p className="text-sm font-semibold tracking-tight">TRACIFY</p>
            <p className="mono text-[10px] text-muted-foreground">
              investigator console
            </p>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative max-w-lg"
        >
          <h1 className="text-[2.1rem] font-semibold leading-[1.15] tracking-tight">
            Follow the movement of value —
            <span className="text-gradient-intel"> not just the wallets.</span>
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            TRACIFY turns fragmented on-chain activity into a bounded,
            evidence-backed investigation: relevant fund paths, ranked entity and
            VASP candidates, behavioural signals, and a defensible evidence trail.
          </p>

          <dl className="mono mt-8 grid grid-cols-3 gap-3 pt-6 text-[11px]">
            <div className="clay rounded-xl p-3 shadow-clay">
              <dt className="text-muted-foreground">bounded graph</dt>
              <dd className="mt-1 text-sm font-semibold text-foreground">hop-limited</dd>
            </div>
            <div className="clay rounded-xl p-3 shadow-clay">
              <dt className="text-muted-foreground">path ranking</dt>
              <dd className="mt-1 text-sm font-semibold text-foreground">continuity</dd>
            </div>
            <div className="clay rounded-xl p-3 shadow-clay">
              <dt className="text-muted-foreground">conclusions</dt>
              <dd className="mt-1 text-sm font-semibold text-foreground">evidence-backed</dd>
            </div>
          </dl>
        </motion.div>

        <p className="relative flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="size-3.5" />
          Access is logged. Handle case material per your agency's evidence policy.
        </p>
      </div>

      {/* Auth panel */}
      <div className="flex items-center justify-center px-5 py-12">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32 }}
          className="clay w-full max-w-md rounded-3xl p-8 shadow-clay-lift"
        >
          <div className="mb-7 flex items-center gap-3 lg:hidden">
            <TracifyMark />
            <span className="text-sm font-semibold">TRACIFY</span>
          </div>

          <p className="label-caps">Restricted access</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">
            {mode === "signin"
              ? "Sign in to the console"
              : "Request console access"}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Use your issued investigator credentials."
              : "New accounts are provisioned with the Investigator role."}
          </p>

          <Tabs
            value={mode}
            onValueChange={(v) => setMode(v as "signin" | "signup")}
            className="mt-6"
          >
            <TabsList className="w-full">
              <TabsTrigger value="signin" className="flex-1">
                Sign in
              </TabsTrigger>
              <TabsTrigger value="signup" className="flex-1">
                Create account
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="mt-6 space-y-4"
            >
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Work email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        className="mono"
                        placeholder="investigator@agency.gov"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete={
                          mode === "signin" ? "current-password" : "new-password"
                        }
                        placeholder="••••••••"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={busy}>
                <ShieldCheck className="size-4" />
                {busy
                  ? "Verifying…"
                  : mode === "signin"
                    ? "Sign in"
                    : "Create account"}
              </Button>
            </form>
          </Form>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="mono text-[10px] text-muted-foreground">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => void google()}
            disabled={busy}
          >
            Continue with Google
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
