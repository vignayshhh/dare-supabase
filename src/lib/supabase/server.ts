import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "./config";
import { instrumentSupabaseFetch } from "@/lib/observability/resourceMetrics";

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, key } = getSupabasePublicConfig();

  return createServerClient(url, key, {
    global: { fetch: instrumentSupabaseFetch(globalThis.fetch.bind(globalThis)) },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot mutate cookies. Proxy refreshes sessions.
        }
      },
    },
  });
}
