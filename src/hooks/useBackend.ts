import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  backendAutoConnect,
  backendConfigured,
  backendHealthQuery,
  backendMeQuery,
  getBackendToken,
} from "@/lib/api/backend";

/**
 * Connection state for the intelligence service.
 *
 * The service is a separate deployment with its own JWT, so a screen that reads
 * from it must be able to say precisely why it has no data: unconfigured,
 * offline, or not yet connected with an investigator account.
 */
export function useBackend() {
  const [token, setToken] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setToken(getBackendToken());
    setHydrated(true);
    const sync = () => setToken(getBackendToken());
    window.addEventListener("tracify:backend-token", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("tracify:backend-token", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const health = useQuery(backendHealthQuery());

  // The service ships a built-in demo investigator; connect automatically so
  // attribution screens are usable without a manual sign-in.
  useEffect(() => {
    if (!hydrated || token || !health.isSuccess) return;
    void backendAutoConnect().then(() => setToken(getBackendToken()));
  }, [hydrated, token, health.isSuccess]);
  const me = useQuery({ ...backendMeQuery(token), enabled: hydrated && Boolean(token) });

  const configured = backendConfigured();
  const online = configured && health.isSuccess;
  const connected = online && Boolean(token) && me.isSuccess;

  return {
    configured,
    online,
    connected,
    token,
    hydrated,
    user: me.data ?? null,
    health: health.data ?? null,
    checking: health.isLoading || (Boolean(token) && me.isLoading),
    reason: !configured
      ? ("unconfigured" as const)
      : health.isError
        ? ("offline" as const)
        : !token || me.isError
          ? ("disconnected" as const)
          : ("ready" as const),
  };
}
