import "server-only";

import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { LIMITS } from "../../../_lib/rateLimit";
import { createAlert, createFeedEvent, getDisplayProfile, publishChallengeFanout, truthResponse } from "../../../_lib/socialMutations";
import { withSecurity } from "../../../_lib/withSecurity";

const FIELDS = "id,creator_id,receiver_id,question,answer,status,created_at,updated_at";
const idOf = (req: Request) => new URL(req.url).pathname.split("/").slice(-2)[0] || "";

export const POST = withSecurity({ rateLimit: LIMITS.COMMENT }, async (req, ctx) => {
  const id = idOf(req);
  const db = getSupabaseAdminClient() as any;
  const { data: truth, error } = await db.from("truths").select(FIELDS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!truth) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (truth.receiver_id !== ctx.uid) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (truth.status !== "OPEN") return NextResponse.json({ error: "state_conflict" }, { status: 409 });

  const { data: updated, error: updateError } = await db.from("truths").update({ status: "EXPIRED", updated_at: new Date().toISOString() })
    .eq("id", id).eq("receiver_id", ctx.uid).eq("status", "OPEN").select(FIELDS).maybeSingle();
  if (updateError) throw updateError;
  if (!updated) return NextResponse.json({ error: "state_conflict" }, { status: 409 });

  const actor = await getDisplayProfile(ctx.uid).catch(() => ({
    name: "Someone",
    username: "someone",
    avatar: "",
  }));
  await Promise.all([
    createAlert({
      userId: truth.creator_id,
      type: "TRUTH_REFUSED",
      entityId: id,
      actorId: ctx.uid,
      message: "refused your truth",
      metadata: {
        question: truth.question,
        navigateTo: "main",
        actorName: actor.name,
        actorUsername: actor.username,
      },
    }).catch(() => {}),
    createFeedEvent({ userId: ctx.uid, eventType: "truth_refused", relatedTruthId: id, eventData: { challengerId: truth.creator_id, receiverId: truth.receiver_id, result: "REJECTED" } }).catch(() => {}),
    publishChallengeFanout({ kind: "truth", sourceId: id, actorId: ctx.uid, participantIds: [truth.creator_id, truth.receiver_id].filter(Boolean) as string[] }).catch(() => {}),
  ]);
  return NextResponse.json({ ok: true, truth: truthResponse(id, { challenger_id: updated.creator_id, receiver_id: updated.receiver_id, question: updated.question, answer: updated.answer, state: "REJECTED", created_at: updated.created_at, updated_at: updated.updated_at }) });
});
