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
  getDisplayProfile,
  publishChallengeFanout,
  truthResponse,
} from "../_lib/socialMutations";

export const POST = withSecurity(
  { rateLimit: LIMITS.POST_CREATE },
  async (req, ctx) => {
    const body = (await req.json().catch(() => ({}))) as {
      receiverId?: unknown;
      question?: unknown;
    };
    const receiverId = cleanText(body.receiverId, 128);
    const question = cleanText(body.question, 500);
    if (!receiverId || receiverId === ctx.uid || !question) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }

    const areFriends = await areUsersFriends(ctx.uid, receiverId);
    if (!areFriends) {
      return NextResponse.json({ error: "not_friends" }, { status: 403 });
    }

    const legacy = {
      challenger_id: ctx.uid,
      receiver_id: receiverId,
      question,
      state: "SENT",
      votes: { truth: 0, lie: 0, total: 0 },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      answered_at: null,
      reviewed_at: null,
    };
    const { data: inserted, error } = await (getSupabaseAdminClient() as any).from("truths").insert({
      creator_id: ctx.uid, receiver_id: receiverId, question, status: "OPEN", visibility: "FRIENDS",
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
        type: "TRUTH_RECEIVED",
        entityId: inserted.id,
        actorId: ctx.uid,
        message: `${actor.name} asked you a truth`,
        metadata: { question, actorName: actor.name, actorUsername: actor.username },
      }).catch(() => {}),
      createFeedEvent({
        userId: ctx.uid,
        eventType: "truth_received",
        relatedTruthId: inserted.id,
        eventData: { challengerId: ctx.uid, receiverId, question },
      }).catch(() => {}),
      publishChallengeFanout({
        kind: "truth",
        sourceId: inserted.id,
        actorId: ctx.uid,
        participantIds: [receiverId],
        createdAt: new Date().toISOString(),
      }).catch(() => {}),
    ]);

    return NextResponse.json({
      ok: true,
      truth: truthResponse(inserted.id, {
        challenger_id: ctx.uid,
        receiver_id: receiverId,
        question,
        state: "SENT",
        votes: { truth: 0, lie: 0, total: 0 },
        created_at: inserted.created_at,
        updated_at: inserted.updated_at,
      }),
    });
  },
);
