import "server-only";
import { bumpFeedCacheVersions, type FeedCacheKind } from "./socialCache";

export type MaterializedFeedKind = "post" | "truth" | "dare";

export interface FeedFanoutEvent {
  kind: MaterializedFeedKind;
  sourceId: string;
  actorId: string;
  participantIds?: string[];
  createdAt?: string;
}

function cacheKindsFor(kind: MaterializedFeedKind): FeedCacheKind[] {
  if (kind === "post") return ["feed"];
  if (kind === "truth") return ["truth-feed"];
  return ["dare-feed"];
}

async function invalidateFeed(event: FeedFanoutEvent): Promise<string[]> {
  // The active feed is Circle-scoped and reads posts directly. Materialized
  // fanout is retained only for historical maintenance/reporting; no request
  // path may create feed_items or feed_fanout_jobs anymore.
  await bumpFeedCacheVersions([], cacheKindsFor(event.kind));
  return Array.from(new Set([event.actorId, ...(event.participantIds || [])].filter(Boolean)));
}

export async function enqueueFeedFanout(
  event: FeedFanoutEvent,
): Promise<string[]> {
  return invalidateFeed(event);
}

export async function removeFeedFanout(
  event: FeedFanoutEvent,
): Promise<string[]> {
  return invalidateFeed(event);
}
