/**
 * POST /api/drama - create a drama card (prediction/deal/rumour/promise/custom).
 * Body: { kind, ...kind-specific payload }. Returns the created post in its
 * client shape.
 */
import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../_lib/withSecurity";
import { LIMITS } from "../_lib/rateLimit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { cleanText } from "../_lib/socialMutations";
import {
  DRAMA_KINDS,
  type DramaKind,
  participantForUid,
  sanitizeDramaPayload,
  toClientDramaPost,
} from "../_lib/drama";

export const POST = withSecurity(
  { rateLimit: LIMITS.POST_CREATE },
  async (req, ctx) => {
    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const kind = cleanText(body.kind, 20) as DramaKind;
    if (!DRAMA_KINDS.includes(kind)) {
      return NextResponse.json({ error: "bad_kind" }, { status: 400 });
    }

    const data = sanitizeDramaPayload(kind, body);
    if (!data) {
      return NextResponse.json({ error: "bad_payload" }, { status: 400 });
    }

    // A prediction about a person is visible only within the active Circle.
    // Validate that relationship before the insert, rather than letting the
    // database's invitation trigger throw and surface as an opaque 500.
    // (The trigger remains the final integrity guard for every write path.)
    if (kind === "prediction") {
      const subject = data.subject as { type?: unknown; id?: unknown };
      if (
        subject?.type === "friend" &&
        (typeof subject.id !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(subject.id))
      ) {
        return NextResponse.json({ error: "bad_subject" }, { status: 400 });
      }
      if (subject?.type === "friend") {
        const { data: isMember, error: membershipError } = await (
          getSupabaseAdminClient() as any
        ).rpc("is_circle_member", {
          p_circle: ctx.circleId,
          p_user: subject.id,
        });
        if (membershipError) throw membershipError;
        if (isMember !== true) {
          return NextResponse.json(
            {
              error: "participant_not_in_circle",
              message: "Choose someone in your active Circle.",
            },
            { status: 400 },
          );
        }
      }
    }

    const { data: row, error } = await (getSupabaseAdminClient() as any)
      .from("drama_posts")
      .insert({ kind, creator_id: ctx.uid, payload: data })
      .select("id,kind,creator_id,payload,resolution,resolved_at,subject_reaction,subject_outcome,subject_thought,proof_label,proof_url,created_at,updated_at,confirmations:drama_confirmations(user_id,status)")
      .single();
    if (error) throw error;
    const mapped = toClientDramaPost(row.id, {
      ...row, data: row.payload, creator: await participantForUid(ctx.uid), votes: {}, voters: {}, comments: [],
    } as any);
    return NextResponse.json({ ok: true, kind, post: mapped?.post ?? null });
  },
);
