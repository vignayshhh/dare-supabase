import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../../_lib/withSecurity";
import { LIMITS } from "../../../_lib/rateLimit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { attachMediaAssetsForUrls } from "../../../_lib/mediaAssets";
import type { DareActionRow } from "@/types/socialRows";
import {
  cleanText,
  createAlert,
  createFeedEvent,
  dareResponse,
  getDisplayProfile,
  publishChallengeFanout,
} from "../../../_lib/socialMutations";

function dareId(req: Request): string {
  return new URL(req.url).pathname.split("/").slice(-2)[0] || "";
}

export const POST = withSecurity(
  { rateLimit: LIMITS.POST_CREATE },
  async (req, ctx) => {
    const id = dareId(req);
    const body = (await req.json().catch(() => ({}))) as {
      mediaUrl?: unknown;
      media_url?: unknown;
      mediaType?: unknown;
      media_type?: unknown;
      thumbnailUrl?: unknown;
      thumbnail_url?: unknown;
    };
    const mediaUrl = cleanText(body.mediaUrl ?? body.media_url, 2_000);
    const mediaType = cleanText(body.mediaType ?? body.media_type, 10).toUpperCase();
    const thumbnailUrl = cleanText(body.thumbnailUrl ?? body.thumbnail_url, 2_000);
    if (!id || !mediaUrl || !["TEXT", "PHOTO", "VIDEO"].includes(mediaType)) {
      return NextResponse.json({ error: "bad proof" }, { status: 400 });
    }

    let data = {} as DareActionRow;
    const auraResult = null;
    try {
      const response = await (getSupabaseAdminClient() as any).rpc("submit_dare_proof_native", { p_dare_id: id, p_actor_id: ctx.uid, p_media_url: mediaUrl, p_media_type: mediaType, p_thumbnail_url: thumbnailUrl });
      if (response.error) throw response.error;
      data = (response.data || {}) as DareActionRow;
      await attachMediaAssetsForUrls(getSupabaseAdminClient(), [mediaUrl, thumbnailUrl], "dare_proof", id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "dare_not_found") {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      if (message === "dare_forbidden") {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      if (message === "dare_not_submittable") {
        return NextResponse.json({ error: "not_submittable" }, { status: 409 });
      }
      throw error;
    }

    const actor = await getDisplayProfile(ctx.uid).catch(() => ({
      name: "Someone",
      username: "someone",
      avatar: "",
    }));
    await Promise.all([
      createAlert({
        userId: data.challenger_id,
        type: "DARE_PROOF_SUBMITTED",
        entityId: id,
        actorId: ctx.uid,
        message: `${actor.name} submitted proof for your dare`,
        metadata: {
          challengerId: data.challenger_id,
          receiverId: data.receiver_id,
          description: data.description || "",
          actorName: actor.name,
          actorUsername: actor.username,
          actorAvatar: actor.avatar,
          navigateTo: "main",
        },
      }).catch(() => {}),
      // The receiver has supplied proof; it is not public until the
      // challenger reviews it.
      createAlert({
        userId: data.receiver_id,
        type: "DARE_POSTED",
        entityId: id,
        actorId: ctx.uid,
        message: "Your dare proof is waiting for review",
        metadata: {
          challengerId: data.challenger_id,
          receiverId: data.receiver_id,
          description: data.description || "",
          pendingReview: true,
          navigateTo: "main",
        },
      }).catch(() => {}),
      publishChallengeFanout({
        kind: "dare",
        sourceId: id,
        actorId: ctx.uid,
        participantIds: [data.challenger_id, data.receiver_id],
      }).catch(() => {}),
    ]);

    return NextResponse.json({
      ok: true,
      aura: auraResult,
      dare: dareResponse(id, {
        ...data,
        state: "PROOF_SUBMITTED",
        proof_media_url: mediaUrl,
        proof_media_type: mediaType,
        proof_thumbnail_url: thumbnailUrl || mediaUrl,
        proof_submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
  },
);

