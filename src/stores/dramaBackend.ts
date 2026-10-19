import { getActiveCircleId } from "@/lib/circleContext";
/**
 * Shared backend loader for social drama cards. One request hydrates all
 * three drama stores (predictions, deals, rumours/promises/customs) from
 * GET /api/drama/feed. Mutations live inside each store; this module only
 * fans the feed snapshot out, so imports stay one-directional.
 */
import { apiFetch } from "@/lib/apiClient";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { scheduleRefresh } from "@/lib/realtime/scheduleRefresh";
import { createUuid } from "@/utils/uuid";
import { usePredictionStore, type PredictionPost } from "./usePredictionStore";
import { useDealStore, type DealPost } from "./useDealStore";
import {
  useDramaStore,
  type CustomPost,
  type PromisePost,
  type RumourPost,
} from "./useDramaStore";

interface DramaFeedResponse {
  ok?: boolean;
  predictions?: PredictionPost[];
  deals?: DealPost[];
  rumours?: RumourPost[];
  promises?: PromisePost[];
  customs?: CustomPost[];
}

let inFlight: Promise<void> | null = null;
let lastLoadedAt = 0;
let loadedCircle: string | null = null;
const STALE_MS = 60_000;

// Drop the legacy localStorage snapshots from the pre-backend era (seeded
// mock data) so they never resurface.
let cleanedLegacy = false;
function cleanupLegacyStorage() {
  if (cleanedLegacy || typeof window === "undefined") return;
  cleanedLegacy = true;
  try {
    localStorage.removeItem("dare-predictions");
    localStorage.removeItem("dare-deals");
    localStorage.removeItem("dare-social-drama");
  } catch {
    // storage unavailable — nothing to clean
  }
}

export async function loadDramaFeed(refresh = false): Promise<void> {
  if (typeof window === "undefined") return;
  cleanupLegacyStorage();
  if (loadedCircle !== getActiveCircleId()) { loadedCircle=getActiveCircleId(); lastLoadedAt=0; inFlight=null; }
  if (inFlight) return inFlight;
  if (!refresh && Date.now() - lastLoadedAt < STALE_MS) return;

  inFlight = (async () => {
    try {
      const response = await apiFetch<DramaFeedResponse>(
        "/api/drama/feed?limit=60",
        { method: "GET" },
      );
      usePredictionStore
        .getState()
        .setFromServer(response.predictions ?? []);
      useDealStore.getState().setFromServer(response.deals ?? []);
      useDramaStore
        .getState()
        .setFromServer(
          response.rumours ?? [],
          response.promises ?? [],
          response.customs ?? [],
        );
      lastLoadedAt = Date.now();
    } catch (error) {
      console.warn("[dramaBackend] feed load failed:", error);
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Refresh only already-rendered cards whose rows changed. */
async function loadDramaCards(ids: string[]): Promise<void> {
  const unique = [...new Set(ids)].filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100);
  if (!unique.length) return;
  try {
    const response = await apiFetch<DramaFeedResponse>(`/api/drama/feed?ids=${encodeURIComponent(unique.join(","))}`);
    usePredictionStore.getState().mergeFromServer(response.predictions ?? []);
    useDealStore.getState().mergeFromServer(response.deals ?? []);
    useDramaStore.getState().mergeFromServer(response.rumours ?? [], response.promises ?? [], response.customs ?? []);
  } catch (error) {
    console.warn("[dramaBackend] targeted card refresh failed:", error);
    invalidateDramaFeed();
  }
}

/** Force the next loadDramaFeed call to hit the network. */
export function invalidateDramaFeed() {
  lastLoadedAt = 0;
}

/** Refresh loaded cards when another participant changes votes or comments. */
export function subscribeToDramaCards(postIds: string[]) {
  const ids = [...new Set(postIds)].filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100);
  if (!ids.length) return () => {};
  const client = getSupabaseBrowserClient();
  const dirtyIds = new Set<string>();
  const refresh = scheduleRefresh(() => { const pending = [...dirtyIds]; dirtyIds.clear(); void loadDramaCards(pending); }, 100);
  const markDirty = (payload: any) => {
    const id = String(payload?.new?.id || payload?.old?.id || payload?.new?.post_id || payload?.old?.post_id || "");
    if (id) dirtyIds.add(id);
    refresh.schedule();
  };
  const channel = client.channel(`drama-cards:${createUuid()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "drama_posts", filter: `id=in.(${ids.join(",")})` }, markDirty)
    .on("postgres_changes", { event: "*", schema: "public", table: "drama_votes", filter: `post_id=in.(${ids.join(",")})` }, markDirty)
    .on("postgres_changes", { event: "*", schema: "public", table: "drama_comments", filter: `post_id=in.(${ids.join(",")})` }, markDirty)
    .subscribe();
  return () => {
    refresh.cancel();
    void client.removeChannel(channel);
  };
}
