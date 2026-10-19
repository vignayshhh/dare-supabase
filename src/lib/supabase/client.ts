"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "./config";
import { instrumentSupabaseFetch } from "@/lib/observability/resourceMetrics";

import { withCircleHeader } from "@/lib/circleContext";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function getSupabaseBrowserClient() {
  if (!browserClient) {
    const { url, key } = getSupabasePublicConfig();
    browserClient = createBrowserClient(url, key, {
      global: { fetch: instrumentSupabaseFetch(withCircleHeader(globalThis.fetch.bind(globalThis))) },
    });
    // Test-only introspection; never exposed unless a QA init script opts in.
    if ((globalThis as any).__DARE_QA__ === true) {
      (globalThis as any).__DARE_QA_SUPABASE__ = browserClient;
    }
  }
  return browserClient;
}
