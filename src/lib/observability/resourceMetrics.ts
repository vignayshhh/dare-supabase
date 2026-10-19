export type ResourceMetric =
  | "supabase_queries"
  | "supabase_rpcs"
  | "supabase_rows"
  | "api_requests"
  | "realtime_joins"
  | "realtime_messages"
  | "cache_hits"
  | "cache_misses"
  | "supabase_auth"
  | "supabase_storage_uploads"
  | "supabase_storage_signs"
  | "supabase_storage_ops"
  | "supabase_failures"
  | "supabase_response_bytes";

type ResourceSnapshot = Record<ResourceMetric, number>;
export type SupabaseDiagnostic = { category: string; method: string; status: number | null; durationMs: number; endpoint: string; runtime: "browser" | "server" | "middleware"; responseBytes?: number };

const emptySnapshot = (): ResourceSnapshot => ({
  supabase_queries: 0,
  supabase_rpcs: 0,
  supabase_rows: 0,
  api_requests: 0,
  realtime_joins: 0,
  realtime_messages: 0,
  cache_hits: 0,
  cache_misses: 0,
  supabase_auth: 0,
  supabase_storage_uploads: 0,
  supabase_storage_signs: 0,
  supabase_storage_ops: 0,
  supabase_failures: 0,
  supabase_response_bytes: 0,
});

let metrics = emptySnapshot();
const diagnostics: SupabaseDiagnostic[] = [];

export const resourceMetricsEnabled = () =>
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_RESOURCE_METRICS === "true";

export function recordResourceMetric(metric: ResourceMetric, amount = 1) {
  if (!resourceMetricsEnabled()) return;
  metrics[metric] += Math.max(0, amount);
}

export function getResourceMetrics(): ResourceSnapshot {
  return { ...metrics };
}

export function resetResourceMetrics() {
  metrics = emptySnapshot();
  diagnostics.length = 0;
}

export function getResourceDiagnostics(): SupabaseDiagnostic[] { return diagnostics.slice(); }

export function instrumentSupabaseFetch(fetcher: typeof fetch): typeof fetch {
  return async (input, init) => {
    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    const rawUrl = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
    let url: URL;
    try { url = new URL(rawUrl); } catch { return fetcher(input, init); }
    const path = url.pathname;
    const method = (init?.method || (typeof input !== "string" && !(input instanceof URL) ? input.method : "GET")).toUpperCase();
    const isRpc = path.includes("/rest/v1/rpc/");
    const isDb = path.includes("/rest/v1/");
    const isAuth = path.includes("/auth/v1/");
    const isStorage = path.includes("/storage/v1/");
    if (isRpc) recordResourceMetric("supabase_rpcs"); else if (isDb) recordResourceMetric("supabase_queries");
    if (isAuth) recordResourceMetric("supabase_auth");
    if (isStorage) {
      if (path.includes("/object/sign/")) recordResourceMetric("supabase_storage_signs");
      else if (method === "POST" && path.includes("/object/")) recordResourceMetric("supabase_storage_uploads");
      else recordResourceMetric("supabase_storage_ops");
    }
    let response: Response;
    try { response = await fetcher(input, init); } catch (error) { recordResourceMetric("supabase_failures"); diagnostics.push({ category: isAuth ? "auth" : isStorage ? "storage" : isRpc ? "rpc" : isDb ? "database" : "other", method, status: null, durationMs: Math.max(0, (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt), endpoint: isAuth ? "auth" : isStorage ? "storage" : isRpc ? "rpc" : isDb ? "rest" : "other", runtime: typeof window === "undefined" ? "server" : "browser" }); throw error; }
    if (!response.ok) recordResourceMetric("supabase_failures");
    const length = response.headers?.get?.("content-length");
    if (length && Number.isFinite(Number(length))) recordResourceMetric("supabase_response_bytes", Number(length));
    diagnostics.push({ category: isAuth ? "auth" : isStorage ? "storage" : isRpc ? "rpc" : isDb ? "database" : "other", method, status: response.status ?? null, durationMs: Math.max(0, (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt), endpoint: isAuth ? "auth" : isStorage ? "storage" : isRpc ? "rpc" : isDb ? "rest" : "other", runtime: typeof window === "undefined" ? "server" : "browser", ...(length && Number.isFinite(Number(length)) ? { responseBytes: Number(length) } : {}) });
    if (diagnostics.length > 200) diagnostics.splice(0, diagnostics.length - 200);
    if (resourceMetricsEnabled() && isDb && response.ok) {
      void response
        .clone()
        .json()
        .then((body: unknown) => {
          if (Array.isArray(body)) recordResourceMetric("supabase_rows", body.length);
          else if (body && typeof body === "object") {
            const items = (body as { items?: unknown[] }).items;
            recordResourceMetric("supabase_rows", Array.isArray(items) ? items.length : 1);
          }
        })
        .catch(() => undefined);
    }
    return response;
  };
}

if (typeof window !== "undefined" && resourceMetricsEnabled()) {
  (window as typeof window & {
    __DARE_RESOURCE_METRICS__?: {
      snapshot: typeof getResourceMetrics;
      reset: typeof resetResourceMetrics;
    };
  }).__DARE_RESOURCE_METRICS__ = {
    snapshot: getResourceMetrics,
    reset: resetResourceMetrics,
  };
}
