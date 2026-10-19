import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "./config";
import { instrumentSupabaseFetch } from "@/lib/observability/resourceMetrics";

type Context = {
  circleId: string;
  userId: string;
  client: SupabaseClient<any>;
  circleMemberIds?: Promise<string[]>;
};
export const circleRequestContext = new AsyncLocalStorage<Context>();
export function runInCircle<T>(
  circleId: string,
  userId: string,
  authorization: string,
  fn: () => T,
  eventId?: string | null,
  chatSourceId?: string | null,
): T {
  const { url, key } = getSupabasePublicConfig();
  // Use the caller's JWT: service-role reads must never bypass Circle RLS.
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: instrumentSupabaseFetch(globalThis.fetch.bind(globalThis)),
      headers: {
        Authorization: authorization,
        "x-circle-id": circleId,
        ...(eventId ? { "x-event-id": eventId } : {}),
        ...(chatSourceId ? { "x-chat-source-id": chatSourceId } : {}),
      },
    },
  });
  return circleRequestContext.run({ circleId, userId, client }, fn);
}

export function getCircleMemberIds(): Promise<string[]> | null {
  const context = circleRequestContext.getStore();
  if (!context) return null;
  if (!context.circleMemberIds) {
    context.circleMemberIds = Promise.resolve(context.client.from("circle_members").select("user_id").eq("circle_id", context.circleId))
      .then(({ data, error }) => { if (error) throw error; return (data ?? []).map((row: { user_id: string }) => row.user_id); });
  }
  return context.circleMemberIds ?? Promise.resolve([]);
}
