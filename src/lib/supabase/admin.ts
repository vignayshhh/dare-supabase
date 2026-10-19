import { circleRequestContext } from "./requestContext";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "./config";
import { instrumentSupabaseFetch } from "@/lib/observability/resourceMetrics";

let adminClient: ReturnType<typeof createClient> | undefined;

export function getSupabaseAdminClient() {
  const scoped = circleRequestContext.getStore();
  if (scoped) return scoped.client;
  return getPrivilegedSupabaseClient();
}

/** Infrastructure only. Social reads must use getSupabaseAdminClient's request scope. */
export function getPrivilegedSupabaseClient() {
  if (!adminClient) {
    const secret = process.env.SUPABASE_SECRET_KEY;
    if (!secret) {
      throw new Error("SUPABASE_SECRET_KEY is required for privileged server work.");
    }
    const { url } = getSupabasePublicConfig();
    adminClient = createClient(url, secret, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: instrumentSupabaseFetch(globalThis.fetch.bind(globalThis)) },
    });
  }
  return adminClient;
}
