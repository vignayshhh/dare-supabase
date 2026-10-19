import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../_lib/withSecurity";
import { LIMITS } from "../_lib/rateLimit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  areUsersFriends,
  cleanText,
  createAlert,
  createFeedEvent,
  dareResponse,
  getDisplayProfile,
  publishChallengeFanout,
} from "../_lib/socialMutations";

export const POST = withSecurity(
  { rateLimit: LIMITS.POST_CREATE },
  async (req, ctx) => {
    const body = (await req.json().catch(() => ({}))) as {
      receiverId?: unknown;
      description?: unknown;
    };
    const receiverId = cleanText(body.receiverId, 128);
    const description = cleanText(body.description, 500);
    if (!receiverId || receiverId === ctx.uid || !description) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }

    const areFriends = await areUsersFriends(ctx.uid, receiverId);
    if (!areFriends) {
      return NextResponse.json({ error: "not_friends" }, { status: 403 });
    }

    const data = {
      challenger_id: ctx.uid,
      receiver_id: receiverId,
      description,
      state: "SENT",
      proof_media_url: null,
      proof_media_type: null,
      proof_thumbnail_url: null,
      challenger_vote: null,
      validation_threshold_met: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      accepted_at: null,
      proof_submitted_at: null,
      completed_at: null,
    };
    const { data: inserted, error } = await (getSupabaseAdminClient() as any).from("dares").insert({
      creator_id: ctx.uid, receiver_id: receiverId, title: description.slice(0, 200), body: description,
      status: "PENDING", visibility: "FRIENDS", metadata: data,
    }).select("id,created_at,updated_at").single();
    if (error) throw error;

    const actor = await getDisplayProfile(ctx.uid).catch(() => ({
      name: "Someone",
      username: "someone",
      avatar: "",
    }));
    await Promise.all([
      createAlert({
        userId: receiverId,
        type: "DARE_RECEIVED",
        entityId: inserted.id,
        actorId: ctx.uid,
        message: `${actor.name} gave you a dare`,
        metadata: {
          challengerId: ctx.uid,
          receiverId,
          description,
          actorName: actor.name,
          actorUsername: actor.username,
          actorAvatar: actor.avatar,
        },
      }).catch(() => {}),
      createFeedEvent({
        userId: ctx.uid,
        eventType: "dare_sent",
        relatedDareId: inserted.id,
        eventData: { challengerId: ctx.uid, receiverId, description },
      }).catch(() => {}),
      publishChallengeFanout({
        kind: "dare",
        sourceId: inserted.id,
        actorId: ctx.uid,
        participantIds: [receiverId],
        createdAt: new Date().toISOString(),
      }).catch(() => {}),
    ]);

    return NextResponse.json({
      ok: true,
      dare: dareResponse(inserted.id, {
        ...data,
        created_at: inserted.created_at,
        updated_at: inserted.updated_at,
      }),
    });
  },
);
