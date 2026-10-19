import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getSupabasePublicConfig } from "./config";
import { instrumentSupabaseFetch } from "@/lib/observability/resourceMetrics";

export async function refreshSupabaseSession(request: NextRequest, response: NextResponse) {
  const { url, key } = getSupabasePublicConfig();
  const supabase = createServerClient(url, key, {
    global: { fetch: instrumentSupabaseFetch(globalThis.fetch.bind(globalThis)) },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Never trust getSession() alone for authorization; this validates the JWT
  // and renews cookies when Supabase rotates the refresh token.
  await supabase.auth.getClaims();
  return response;
}
