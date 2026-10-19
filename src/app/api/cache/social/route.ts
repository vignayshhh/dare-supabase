/**
 * POST /api/cache/social - targeted server cache invalidation for client-side
 * Supabase mutations such as friendship, truth, and dare updates.
 */
import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../_lib/withSecurity";
import { LIMITS } from "../../_lib/rateLimit";
import { invalidateSocialCachesForUsers } from "../../_lib/socialCache";

export const POST = withSecurity(
  { rateLimit: LIMITS.CACHE_INVALIDATE },
  async (req, ctx) => {
    let body: { userIds?: unknown } = {};
    try {
      body = (await req.json()) as { userIds?: unknown };
    } catch {
      body = {};
    }

    const requestedIds = Array.isArray(body.userIds) ? body.userIds : [];
    const userIds = [
      ctx.uid,
      ...requestedIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      ),
    ].slice(0, 6);

    await invalidateSocialCachesForUsers(userIds);

    return NextResponse.json({ ok: true });
  },
);
