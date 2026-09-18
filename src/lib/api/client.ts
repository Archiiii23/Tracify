/**
 * HTTP client for the TRACIFY intelligence backend (`/server`).
 *
 * The workspace keeps its case/investigation records in Lovable Cloud, while
 * the attribution pipeline (complaint intake, nearest-VASP attribution, alerts,
 * LEA reports) lives in the Express service. That service authenticates with
 * its own JWT, so this module owns the token and unwraps the API envelope.
 */

const TOKEN_KEY = "tracify.api.token";

export class BackendError extends Error {
  status: number;
  details: { field?: string; message: string }[];

  constructor(message: string, status: number, details: { field?: string; message: string }[] = []) {
    super(message);
    this.name = "BackendError";
    this.status = status;
    this.details = details;
  }

  /** Backend refused the credentials — the UI should offer a reconnect. */
  get unauthenticated() {
    return this.status === 401 || this.status === 403;
  }

  /** Backend could not be reached at all. */
  get offline() {
    return this.status === 0;
  }
}

/** Base URL of the intelligence service, without a trailing slash. */
export function backendBaseUrl(): string {
  const raw = (import.meta.env['VITE_API_URL'] as string | undefined) ?? "";
  return raw.replace(/\/+$/, "");
}

export function backendConfigured(): boolean {
  return backendBaseUrl().length > 0;
}

export function getBackendToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setBackendToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event("tracify:backend-token"));
}

/** Mongo documents serialise `_id`; the UI only ever speaks `id`. */
function normalizeIds<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => normalizeIds(v)) as unknown as T;
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(source)) {
      if (key === "_id" && typeof val === "string") out['id'] = val;
      else if (key === "__v") continue;
      else out[key] = normalizeIds(val);
    }
    if (out['id'] === undefined && typeof source['id'] === "string") out['id'] = source['id'];
    return out as T;
  }
  return value;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Skip the bearer token (used for login). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

export async function backendRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const base = backendBaseUrl();
  if (!base) {
    throw new BackendError(
      "No intelligence service URL is configured for this workspace.",
      0,
    );
  }

  const url = new URL(`${base}/api${path}`);
  for (const [key, val] of Object.entries(options.query ?? {})) {
    if (val !== undefined && val !== "") url.searchParams.set(key, String(val));
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers['Content-Type'] = "application/json";
  const token = options.anonymous ? null : getBackendToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: options.method ?? "GET",
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    throw new BackendError("The intelligence service is unreachable.", 0);
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  const envelope = (payload ?? {}) as {
    success?: boolean;
    message?: string;
    data?: unknown;
    errors?: { field?: string; message: string }[];
  };

  if (!response.ok || envelope.success === false) {
    throw new BackendError(
      envelope.message ?? `Request failed (${response.status})`,
      response.status,
      envelope.errors ?? [],
    );
  }

  return normalizeIds(envelope.data as T);
}

/** Liveness probe; `/health` sits outside the authenticated surface. */
export async function backendHealth(): Promise<{ status: string; uptime?: number; database?: string }> {
  const base = backendBaseUrl();
  if (!base) throw new BackendError("No intelligence service URL is configured.", 0);
  let response: Response;
  try {
    response = await fetch(`${base}/api/health`, { headers: { Accept: "application/json" } });
  } catch {
    throw new BackendError("The intelligence service is unreachable.", 0);
  }
  if (!response.ok) throw new BackendError(`Health check failed (${response.status})`, response.status);
  const body = (await response.json()) as { data?: Record<string, unknown> };
  const data = body.data ?? {};
  return {
    status: String(data['status'] ?? "ok"),
    ...(typeof data['uptime'] === "number" ? { uptime: data['uptime'] as number } : {}),
    ...(typeof data['database'] === "string" ? { database: data['database'] as string } : {}),
  };
}
