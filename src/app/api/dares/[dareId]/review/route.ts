import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../../_lib/withSecurity";
import { LIMITS } from "../../../_lib/rateLimit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
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
  { rateLimit: LIMITS.MODERATION },
  async (req, ctx) => {
    const id = dareId(req);
    const body = (await req.json().catch(() => ({}))) as { decision?: unknown };
    const decision = cleanText(body.decision, 10).toUpperCase();
    if (!id || (decision !== "ACCEPT" && decision !== "REJECT")) {
      return NextResponse.json({ error: "bad decision" }, { status: 400 });
    }

    const state = decision === "ACCEPT" ? "ACCEPTED_REAL" : "REJECTED_FAKE";
    let data = {} as DareActionRow;
    const auraResult = null;
    try {
      const response = await (getSupabaseAdminClient() as any).rpc("review_dare_native", { p_dare_id: id, p_actor_id: ctx.uid, p_decision: decision });
      if (response.error) throw response.error;
      data = (response.data || {}) as DareActionRow;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "dare_not_found") {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      if (message === "dare_forbidden") {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      if (message === "dare_not_reviewable") {
        return NextResponse.json({ error: "not_reviewable" }, { status: 409 });
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
        userId: data.receiver_id,
        type: decision === "ACCEPT" ? "DARE_APPROVED" : "DARE_REJECTED",
        entityId: id,
        actorId: ctx.uid,
        message:
          decision === "ACCEPT"
            ? `${actor.name} approved your dare`
            : `${actor.name} rejected your dare`,
        metadata: {
          challengerId: data.challenger_id,
          receiverId: data.receiver_id,
          description: data.description || "",
          actorName: actor.name,
          actorUsername: actor.username,
          actorAvatar: actor.avatar,
        },
      }).catch(() => {}),
      createFeedEvent({
        userId: data.receiver_id,
        eventType: "dare_completed",
        relatedDareId: id,
        eventData: {
          challengerId: data.challenger_id,
          receiverId: data.receiver_id,
          result: decision === "ACCEPT" ? "REAL" : "FAKE",
        },
      }).catch(() => {}),
      publishChallengeFanout({
        kind: "dare",
        sourceId: id,
        actorId: ctx.uid,
        participantIds: [data.receiver_id],
      }).catch(() => {}),
    ]);

    return NextResponse.json({
      ok: true,
      aura: auraResult,
      dare: dareResponse(id, {
        ...data,
        state,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
  },
);

