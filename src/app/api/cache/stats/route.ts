/**
 * GET /api/cache/stats - lightweight Redis cache counters for production
 * debugging. Requires an admin Supabase custom claim.
 */
import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../_lib/withSecurity";
import { LIMITS } from "../../_lib/rateLimit";
import { redisCache } from "@/services/redisCache.server";
import {
  getCacheFeatureStats,
  getPersistentCacheFeatureStats,
} from "../../_lib/cacheMetrics";

export const GET = withSecurity(
  { rateLimit: LIMITS.MODERATION, requireAdmin: true, skipCsrf: true },
  async (req) => {
    const url = new URL(req.url);
    const minutes = Number.parseInt(url.searchParams.get("minutes") || "15", 10);

    return NextResponse.json({
      ok: true,
      cache: redisCache.getStats(),
      features: {
        process: getCacheFeatureStats(),
        redisWindow: await getPersistentCacheFeatureStats(minutes),
      },
    });
  },
);
