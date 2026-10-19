import "server-only";

import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { LIMITS } from "../../../_lib/rateLimit";
import { createFeedEvent, dareResponse, publishChallengeFanout } from "../../../_lib/socialMutations";
import { withSecurity } from "../../../_lib/withSecurity";

const FIELDS = "id,creator_id,receiver_id,body,status,metadata,created_at,updated_at";
const idOf = (req: Request) => new URL(req.url).pathname.split("/").slice(-2)[0] || "";

export const POST = withSecurity({ rateLimit: LIMITS.COMMENT }, async (req, ctx) => {
  const id = idOf(req);
  const db = getSupabaseAdminClient() as any;
  const { data: dare, error } = await db.from("dares").select(FIELDS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!dare) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (dare.receiver_id !== ctx.uid || dare.status !== "PENDING") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const now = new Date().toISOString();
  const metadata = { ...(dare.metadata || {}), state: "ACCEPTED", accepted_at: now };
  const { data: updated, error: updateError } = await db.from("dares").update({ status: "ACCEPTED", metadata })
    .eq("id", id).eq("receiver_id", ctx.uid).eq("status", "PENDING").select(FIELDS).maybeSingle();
  if (updateError) throw updateError;
  if (!updated) return NextResponse.json({ error: "state_conflict" }, { status: 409 });

  await Promise.all([
    createFeedEvent({ userId: ctx.uid, eventType: "dare_accepted", relatedDareId: id, eventData: { challengerId: dare.creator_id, receiverId: dare.receiver_id } }).catch(() => {}),
    publishChallengeFanout({ kind: "dare", sourceId: id, actorId: ctx.uid, participantIds: [dare.creator_id] }).catch(() => {}),
  ]);
  return NextResponse.json({ ok: true, dare: dareResponse(id, { ...metadata, challenger_id: updated.creator_id, receiver_id: updated.receiver_id, description: updated.body, created_at: updated.created_at, updated_at: updated.updated_at }) });
});
