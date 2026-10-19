/**
 * POST /api/posts/[postId]/comment â€” create a comment. The comments_count
 * trigger handles aggregation. Body: { content: string }.
 */
import "server-only";
import { NextResponse } from "next/server";
import { createUuid } from "@/utils/uuid";
import { withSecurity } from "../../../_lib/withSecurity";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { LIMITS } from "../../../_lib/rateLimit";
import { redisCache } from "@/services/redisCache.server";
import { bumpPostAudienceFeedCache } from "../../../_lib/socialCache";

export const POST = withSecurity(
  { rateLimit: LIMITS.COMMENT },
  async (req, ctx) => {
    const postId = new URL(req.url).pathname.split("/").slice(-2)[0]!;
    if (!postId || postId.length > 128) {
      return NextResponse.json({ error: "bad post id" }, { status: 400 });
    }

    let body: { content?: string; parent_id?: string | null } = {};
    try {
      body = (await req.json()) as {
        content?: string;
        parent_id?: string | null;
      };
    } catch {
      return NextResponse.json({ error: "bad body" }, { status: 400 });
    }
    const content = (body.content ?? "").trim();
    if (!content || content.length > 2000) {
      return NextResponse.json({ error: "bad content" }, { status: 400 });
    }
    const parentId =
      typeof body.parent_id === "string" && body.parent_id.length > 0
        ? body.parent_id
        : null;

    const { data: post, error: postError } = await (getSupabaseAdminClient() as any).from("posts").select("id").eq("id",postId).maybeSingle();
    if (postError) throw postError;
    if (!post) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const commentId = createUuid();
    const { error } = await (getSupabaseAdminClient() as any).rpc(
      "create_post_comment",
      {
        p_post_id: postId,
        p_comment_id: commentId,
        p_actor_id: ctx.uid,
        p_content: content,
        p_parent_id: parentId,
      },
    );
    if (error) throw error;

    await Promise.all([
      bumpPostAudienceFeedCache(postId, ctx.uid),
      redisCache.invalidatePattern(`engagement:${postId}:*`),
    ]);

    return NextResponse.json({ ok: true, id: commentId });
  },
);
