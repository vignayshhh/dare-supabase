import "server-only";
import { NextResponse } from "next/server";
import type { DarePost } from "@/middleware/adapters/data-adapters";
import { withSecurity } from "../../_lib/withSecurity";
import { LIMITS } from "../../_lib/rateLimit";
import { redisCache } from "@/services/redisCache.server";
import { getFeedCacheKey } from "../../_lib/socialCache";
import { getChallengeFeed } from "../../_lib/challengeFeed";
import { refreshStoredMediaUrl } from "../../_lib/storedMediaUrl";

const refreshProofMedia = (dares: DarePost[]) => Promise.all(
  dares.map(async (dare) => {
    if (!dare.proof) return dare;
    const url = await refreshStoredMediaUrl(dare.proof.url);
    const thumbnail = dare.proof.thumbnail === dare.proof.url
      ? url
      : await refreshStoredMediaUrl(dare.proof.thumbnail);
    return { ...dare, proof: { ...dare.proof, url, thumbnail: thumbnail || undefined } };
  }),
);

export const GET = withSecurity(
  { rateLimit: LIMITS.DARE_FEED_FETCH, skipCsrf: true },
  async (req, ctx) => {
    const u = new URL(req.url);
    const n = Math.max(1, Math.min(20, Number(u.searchParams.get("limit")) || 20));
    const key = await getFeedCacheKey("dare-feed", ctx.uid, n);
    if (u.searchParams.get("refresh") !== "1") {
      const cached = await redisCache.get<DarePost[]>(key);
      if (Array.isArray(cached) && cached.length) {
        return NextResponse.json({ ok: true, cached: true, dares: await refreshProofMedia(cached) });
      }
    }
    const items = await refreshProofMedia(await getChallengeFeed(ctx.uid, "dare", n) as DarePost[]);
    await redisCache.set(key, items, items.length ? 120 : 30);
    return NextResponse.json({ ok: true, cached: false, dares: items });
  },
);

