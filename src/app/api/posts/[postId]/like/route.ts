/**
 * POST   /api/posts/[postId]/like    — idempotent like (creates post_likes doc id=postId_uid).
 * DELETE /api/posts/[postId]/like    — unlike.
 *
 * Likes are written by the Admin SDK so Postgres rules can deny direct
 * client writes to `post_likes` and `posts.likes_count`. This route updates
 * the count atomically for milestone detection; Cloud Functions reconcile
 * the counter from the authoritative unique-like documents after delivery.
 */
import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../../_lib/withSecurity";
import { LIMITS } from "../../../_lib/rateLimit";
import { redisCache } from "@/services/redisCache.server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const POST = withSecurity(
  { rateLimit: LIMITS.LIKE, skipRateLimit: true, allowRedisFallback: true },
  async (req, ctx) => {
    const postId = new URL(req.url).pathname.split("/").slice(-2)[0]!;
    if (!postId || postId.length > 128) {
      return NextResponse.json({ error: "bad post id" }, { status: 400 });
    }

    let result: any;
    try {
      const response = await (getSupabaseAdminClient() as any).rpc(
        "set_post_like",
        { p_post_id: postId, p_actor_id: ctx.uid, p_liked: true },
      );
      if (response.error) throw response.error;
      result = response.data;
    } catch (error) {
      if (error instanceof Error && error.message === "post_not_found") {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      throw error;
    }

    await Promise.all([
      redisCache.invalidatePattern(`engagement:${postId}:*`),
      redisCache.delete(`likes:${ctx.uid}`),
    ]);
    return NextResponse.json({ ok: true, liked: true, duplicate: Boolean(result?.duplicate), milestone: result?.milestone ?? null, aura: null });
  },
);

export const DELETE = withSecurity(
  { rateLimit: LIMITS.UNLIKE, allowRedisFallback: true },
  async (req, ctx) => {
    const postId = new URL(req.url).pathname.split("/").slice(-2)[0]!;
    if (!postId) {
      return NextResponse.json({ error: "bad post id" }, { status: 400 });
    }
    const { error } = await (getSupabaseAdminClient() as any).rpc(
      "set_post_like",
      { p_post_id: postId, p_actor_id: ctx.uid, p_liked: false },
    );
    if (error) throw error;

    await Promise.all([
      redisCache.invalidatePattern(`engagement:${postId}:*`),
      redisCache.delete(`likes:${ctx.uid}`),
    ]);

    return NextResponse.json({ ok: true, liked: false });
  },
);
