/**
 * POST /api/posts - create a feed post using the Admin SDK.
 *
 * Production can enforce Postgres App Check / stricter client rules without
 * blocking normal posting, because the browser only supplies a Supabase ID
 * token and the server owns the write.
 */
import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../_lib/withSecurity";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { LIMITS } from "../_lib/rateLimit";
import { bumpFeedCacheVersionsForNetwork } from "../_lib/socialCache";
import { enqueueFeedFanout } from "../_lib/feedFanout";
import { validateSupabaseMediaUrl } from "../_lib/mediaUrl";
import { createUuid } from "@/utils/uuid";
import { attachMediaAssetsForUrls } from "../_lib/mediaAssets";

type CreatePostBody = {
  content?: string;
  media_url?: string | null;
  media_urls?: string[] | null;
  media_type?: "TEXT" | "PHOTO" | "VIDEO" | "AUDIO";
};

const MAX_CONTENT_LENGTH = 10_000;
const MAX_CAROUSEL_IMAGES = 10;
const ALLOWED_MEDIA_TYPES = new Set(["TEXT", "PHOTO", "VIDEO", "AUDIO"]);

function sanitizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const POST = withSecurity(
  { rateLimit: LIMITS.POST_CREATE },
  async (req, ctx) => {
    let body: CreatePostBody = {};
    try {
      body = (await req.json()) as CreatePostBody;
    } catch {
      return NextResponse.json({ error: "bad body" }, { status: 400 });
    }

    const content = sanitizeText(body.content);
    if (!content) {
      return NextResponse.json({ error: "caption required" }, { status: 400 });
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json({ error: "content too long" }, { status: 400 });
    }

    let mediaUrl: string | null;
    try {
      mediaUrl = validateSupabaseMediaUrl(body.media_url);
    } catch {
      return NextResponse.json({ error: "bad media url" }, { status: 400 });
    }

    let mediaUrls: string[] | null = null;
    if (Array.isArray(body.media_urls) && body.media_urls.length > 0) {
      if (body.media_urls.length > MAX_CAROUSEL_IMAGES) {
        return NextResponse.json({ error: "too many images" }, { status: 400 });
      }
      try {
        mediaUrls = body.media_urls.map(
          (u) => validateSupabaseMediaUrl(u) as string,
        );
      } catch {
        return NextResponse.json(
          { error: "bad media url in carousel" },
          { status: 400 },
        );
      }
    }

    const mediaType = ALLOWED_MEDIA_TYPES.has(body.media_type || "")
      ? body.media_type!
      : mediaUrl || mediaUrls?.length
        ? "PHOTO"
        : "TEXT";

    const { data: user } = await (getSupabaseAdminClient() as any).from("profiles").select("username,display_name,avatar_url").eq("id",ctx.uid).maybeSingle();

    const postId = createUuid();
    const eventId = createUuid();
    const now = new Date().toISOString();
    const postData = {
      author_id: ctx.uid,
      author_username: typeof user.username === "string" ? user.username : "",
      author_display_name:
        typeof user.display_name === "string" ? user.display_name : "",
      author_avatar_url:
        typeof user.avatar_url === "string"
          ? user.avatar_url
          : typeof user.avatar === "string"
            ? user.avatar
            : "",
      content,
      media_url: mediaUrl,
      media_urls: mediaUrls,
      media_type: mediaType,
      view_count: 0,
      likes_count: 0,
      comments_count: 0,
      created_at: now,
      updated_at: now,
    };

    const { error } = await (getSupabaseAdminClient() as any).rpc(
      "create_post_with_event",
      {
        p_post_id: postId,
        p_post_data: postData,
        p_event_id: eventId,
        p_event_data: {
        user_id: ctx.uid,
        event_type: "POST_CREATED",
        related_post_id: postId,
        created_at: now,
        },
      },
    );
    if (error) throw error;
    await attachMediaAssetsForUrls(getSupabaseAdminClient(), [mediaUrl, ...(mediaUrls || [])], "post", postId);

    await enqueueFeedFanout({
      kind: "post",
      sourceId: postId,
      actorId: ctx.uid,
      createdAt: new Date().toISOString(),
    }).catch(() => bumpFeedCacheVersionsForNetwork(ctx.uid, ["feed"]));

    return NextResponse.json({
      ok: true,
      post: {
        ...postData,
        id: postId,
        created_at: now,
        updated_at: now,
      },
    });
  },
);
