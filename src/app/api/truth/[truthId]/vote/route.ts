import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../../_lib/withSecurity";
import { LIMITS } from "../../../_lib/rateLimit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { cleanText, createFeedEvent, publishChallengeFanout } from "../../../_lib/socialMutations";

const idOf = (request: Request) => new URL(request.url).pathname.split("/").slice(-2)[0] || "";
export const POST = withSecurity({ rateLimit: LIMITS.LIKE }, async (request, context) => {
  const id = idOf(request);
  const vote = cleanText((await request.json().catch(() => ({}))).vote, 10).toUpperCase();
  if (!id || !["TRUTH", "LIE"].includes(vote)) return NextResponse.json({ error: "bad vote" }, { status: 400 });
  const database = getSupabaseAdminClient() as any;
  const { data: truth, error } = await database.from("truths").select("id,creator_id,receiver_id,status,metadata").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!truth) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const state = truth.metadata?.state || ({ OPEN: "SENT", ANSWERED: "ANSWERED" } as Record<string, string>)[truth.status] || truth.status;
  if (!["ANSWERED", "UNDER_REVIEW"].includes(state)) return NextResponse.json({ error: "not_votable" }, { status: 400 });
  const { error: voteError } = await database.rpc("set_truth_vote_native", { p_truth_id: id, p_vote: vote, p_actor_id: context.uid });
  if (voteError) throw voteError;
  const [{ count: total, error: totalError }, { count: truthVotes, error: truthError }] = await Promise.all([
    database.from("truth_votes").select("truth_id", { count: "exact", head: true }).eq("truth_id", id),
    database.from("truth_votes").select("truth_id", { count: "exact", head: true }).eq("truth_id", id).eq("vote", "TRUTH"),
  ]);
  if (totalError) throw totalError;
  if (truthError) throw truthError;
  const voteTotal = Number(total) || 0;
  const truthTotal = Number(truthVotes) || 0;
  if (voteTotal >= 3) await createFeedEvent({ userId: context.uid, eventType: "truth_completed", relatedTruthId: id, eventData: { challengerId: truth.creator_id, receiverId: truth.receiver_id, result: truthTotal > voteTotal - truthTotal ? "APPROVED" : "REJECTED", voteCount: voteTotal } }).catch(() => {});
  await publishChallengeFanout({ kind: "truth", sourceId: id, actorId: context.uid, participantIds: [truth.creator_id, truth.receiver_id].filter(Boolean) }).catch(() => {});
  return NextResponse.json({ ok: true });
});
