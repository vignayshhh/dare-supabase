import "server-only";

import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { LIMITS } from "../../../_lib/rateLimit";
import { createAlert, createFeedEvent, getDisplayProfile, publishChallengeFanout, truthResponse } from "../../../_lib/socialMutations";
import { withSecurity } from "../../../_lib/withSecurity";

const FIELDS = "id,creator_id,receiver_id,question,answer,status,created_at,updated_at";
const idOf = (req: Request) => new URL(req.url).pathname.split("/").slice(-2)[0] || "";

export const POST = withSecurity({ rateLimit: LIMITS.MODERATION }, async (req, ctx) => {
  const id = idOf(req);
  const db = getSupabaseAdminClient() as any;
  const { data: truth, error } = await db.from("truths").select(FIELDS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!truth) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (truth.creator_id !== ctx.uid) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (truth.status !== "ANSWERED") return NextResponse.json({ error: "state_conflict" }, { status: 409 });

  const { data: updated, error: updateError } = await db.from("truths").update({ updated_at: new Date().toISOString() })
    .eq("id", id).eq("creator_id", ctx.uid).eq("status", "ANSWERED").select(FIELDS).maybeSingle();
  if (updateError) throw updateError;
  if (!updated) return NextResponse.json({ error: "state_conflict" }, { status: 409 });

  const actor = await getDisplayProfile(ctx.uid).catch(() => ({ name: "Someone", username: "someone", avatar: "" }));
  if (truth.receiver_id) await createAlert({ userId: truth.receiver_id, type: "TRUTH_COMPLETED", entityId: id, actorId: ctx.uid, message: "approved your answer", metadata: { question: truth.question, answer: truth.answer, navigateTo: "main", actorName: actor.name, actorUsername: actor.username } }).catch(() => {});
  await Promise.all([
    createFeedEvent({ userId: ctx.uid, eventType: "truth_completed", relatedTruthId: id, eventData: { challengerId: truth.creator_id, receiverId: truth.receiver_id, result: "APPROVED" } }).catch(() => {}),
    publishChallengeFanout({ kind: "truth", sourceId: id, actorId: ctx.uid, participantIds: [truth.creator_id, truth.receiver_id].filter(Boolean) as string[] }).catch(() => {}),
  ]);
  return NextResponse.json({ ok: true, truth: truthResponse(id, { challenger_id: updated.creator_id, receiver_id: updated.receiver_id, question: updated.question, answer: updated.answer, state: "APPROVED", created_at: updated.created_at, updated_at: updated.updated_at }) });
});
