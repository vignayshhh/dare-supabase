import "server-only";

import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { redisCache } from "@/services/redisCache.server";
import { approximatePayloadBytes, recordCacheFeatureMetric } from "../../_lib/cacheMetrics";
import { getFeedCacheKey } from "../../_lib/socialCache";
import { withSecurity } from "../../_lib/withSecurity";
import { LIMITS } from "../../_lib/rateLimit";
import { refreshStoredMediaUrl } from "../../_lib/storedMediaUrl";

type FeedCursor = { score: number; id: string };
type FeedPage = { posts: unknown[]; nextCursor: string | null; hasMore: boolean };

const refreshFeedItemMedia = async (value: unknown): Promise<unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const item = { ...(value as Record<string, unknown>) };
  for (const key of ["media_url", "thumbnail_url", "proof_media_url", "proof_thumbnail_url", "avatar_url", "author_avatar", "receiver_avatar", "challenger_avatar"]) {
    if (typeof item[key] === "string") item[key] = await refreshStoredMediaUrl(item[key]);
  }
  for (const key of ["media_urls", "mediaUrls"]) {
    if (Array.isArray(item[key])) item[key] = await Promise.all(item[key].map((url) => refreshStoredMediaUrl(url)));
  }
  for (const key of ["author", "receiver", "challenger", "user", "profile"]) {
    if (item[key] && typeof item[key] === "object") item[key] = await refreshFeedItemMedia(item[key]);
  }
  return item;
};

const hydrateFeedPage = async (page: FeedPage): Promise<FeedPage> => ({
  ...page,
  posts: await Promise.all(page.posts.map(refreshFeedItemMedia)),
});

function decodeCursor(raw: string | null): FeedCursor | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<FeedCursor>;
    if (typeof value.score !== "number" || !Number.isFinite(value.score) || typeof value.id !== "string" || !value.id) return null;
    return { score: value.score, id: value.id };
  } catch {
    return null;
  }
}

function encodeCursor(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const cursor = value as Partial<FeedCursor>;
  if (typeof cursor.score !== "number" || !Number.isFinite(cursor.score) || typeof cursor.id !== "string" || !cursor.id) return null;
  return Buffer.from(JSON.stringify({ score: cursor.score, id: cursor.id }), "utf8").toString("base64url");
}

export const GET = withSecurity(
  { rateLimit: LIMITS.FEED_FETCH, skipCsrf: true },
  async (req, ctx) => {
    const startedAt = Date.now();
    const url = new URL(req.url);
    const requestedLimit = Number.parseInt(url.searchParams.get("limit") || "20", 10);
    const limit = Math.max(1, Math.min(50, Number.isFinite(requestedLimit) ? requestedLimit : 20));
    const rawCursor = url.searchParams.get("cursor");
    const cursor = decodeCursor(rawCursor);
    if (rawCursor && !cursor) return NextResponse.json({ error: "invalid cursor" }, { status: 400 });

    const databaseCacheEnabled = process.env.FEED_DB_CACHE_ENABLED !== "false";
    const cacheKey = databaseCacheEnabled
      ? await getFeedCacheKey("feed", ctx.uid, limit, rawCursor || "")
      : null;
    if (cacheKey && url.searchParams.get("refresh") !== "1") {
      const cached = await redisCache.get<FeedPage>(cacheKey);
      if (cached && Array.isArray(cached.posts)) {
        const hydrated = await hydrateFeedPage(cached);
        recordCacheFeatureMetric("posts-feed", {
          cacheHit: true,
          latencyMs: Date.now() - startedAt,
          payloadBytes: approximatePayloadBytes(hydrated),
        });
        return NextResponse.json({
          ok: true,
          cached: true,
          items: hydrated.posts,
          ...hydrated,
        });
      }
    }

    const { data, error } = await (getSupabaseAdminClient() as any).rpc("get_ranked_feed_page", {
      p_user_id: ctx.uid,
      p_limit: limit,
      p_before_score: cursor?.score ?? null,
      p_before_id: cursor?.id ?? null,
    });
    if (error) throw error;

    const page: FeedPage = {
      posts: Array.isArray(data?.items) ? data.items : [],
      nextCursor: encodeCursor(data?.nextCursor),
      hasMore: data?.hasMore === true,
    };
    if (cacheKey) {
      await redisCache.set(cacheKey, page, page.posts.length > 0 ? 120 : 30);
    }
    recordCacheFeatureMetric("posts-feed", {
      cacheHit: false,
      databaseFallback: false,
      latencyMs: Date.now() - startedAt,
      payloadBytes: approximatePayloadBytes(page),
    });
    const hydratedPage = await hydrateFeedPage(page);
    return NextResponse.json({
      ok: true,
      cached: false,
      items: hydratedPage.posts,
      ...hydratedPage,
    });
  },
);
