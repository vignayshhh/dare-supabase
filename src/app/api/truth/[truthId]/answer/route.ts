import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../../_lib/withSecurity";
import { LIMITS } from "../../../_lib/rateLimit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { TruthActionRow } from "@/types/socialRows";
import {
  cleanText,
  createAlert,
  createFeedEvent,
  getDisplayProfile,
  publishChallengeFanout,
  truthResponse,
} from "../../../_lib/socialMutations";

function truthId(req: Request): string {
  return new URL(req.url).pathname.split("/").slice(-2)[0] || "";
}

export const POST = withSecurity(
  { rateLimit: LIMITS.COMMENT },
  async (req, ctx) => {
    const id = truthId(req);
    const body = (await req.json().catch(() => ({}))) as { answer?: unknown };
    const answer = cleanText(body.answer, 2_000);
    if (!id || !answer) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }

    let data = {} as TruthActionRow;
    try {
      const response = await (getSupabaseAdminClient() as any).rpc("answer_truth_native", { p_truth_id: id, p_actor_id: ctx.uid, p_answer: answer });
      if (response.error) throw response.error;
      data = (response.data || {}) as TruthActionRow;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "truth_not_found") {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      if (message === "truth_forbidden") {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      if (message === "truth_not_answerable") {
        return NextResponse.json({ error: "not_answerable" }, { status: 409 });
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
        type: "TRUTH_ANSWERED",
        entityId: id,
        actorId: ctx.uid,
        message: "answered your question",
        metadata: {
          answer,
          question: data.question || "",
          navigateTo: "main",
          actorName: actor.name,
          actorUsername: actor.username,
        },
      }).catch(() => {}),
      createFeedEvent({
        userId: ctx.uid,
        eventType: "truth_completed",
        relatedTruthId: id,
        eventData: {
          challengerId: data.challenger_id,
          receiverId: data.receiver_id,
          answer,
          result: "APPROVED",
        },
      }).catch(() => {}),
      publishChallengeFanout({
        kind: "truth",
        sourceId: id,
        actorId: ctx.uid,
        participantIds: [data.challenger_id, data.receiver_id],
      }).catch(() => {}),
    ]);

    return NextResponse.json({
      ok: true,
      truth: truthResponse(id, {
        ...data,
        answer,
        state: "APPROVED",
        updated_at: new Date().toISOString(),
        answered_at: new Date().toISOString(),
        reviewed_at: new Date().toISOString(),
      }),
    });
  },
);

