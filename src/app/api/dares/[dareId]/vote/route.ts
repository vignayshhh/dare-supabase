import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../../_lib/withSecurity";
import { LIMITS } from "../../../_lib/rateLimit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { cleanText, createFeedEvent, publishChallengeFanout } from "../../../_lib/socialMutations";

function dareId(req: Request): string {
  return new URL(req.url).pathname.split("/").slice(-2)[0] || "";
}

export const POST = withSecurity(
  { rateLimit: LIMITS.LIKE },
  async (req, ctx) => {
    const id = dareId(req);
    const body = (await req.json().catch(() => ({}))) as { vote?: unknown };
    const vote = cleanText(body.vote, 10).toUpperCase();
    if (!id || (vote !== "REAL" && vote !== "FAKE")) {
      return NextResponse.json({ error: "bad vote" }, { status: 400 });
    }

    let result: any;
    try {
      const response = await (getSupabaseAdminClient() as any).rpc(
        "record_dare_vote_native",
        { p_dare_id: id, p_actor_id: ctx.uid, p_vote: vote },
      );
      if (response.error) throw response.error;
      result = response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "dare_not_found") {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      if (message === "dare_not_voteable") {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      throw error;
    }

    if (result?.result) {
      await createFeedEvent({
        userId: result.receiverId,
        eventType: "dare_completed",
        relatedDareId: id,
        eventData: {
          challengerId: result.challengerId,
          receiverId: result.receiverId,
          result: result.result,
          voteCount: result.total,
        },
      }).catch(() => {});
    }

    await publishChallengeFanout({
      kind: "dare",
      sourceId: id,
      actorId: ctx.uid,
      participantIds: [result?.challengerId, result?.receiverId].filter(Boolean),
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  },
);
