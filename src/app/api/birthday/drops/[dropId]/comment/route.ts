import "server-only";

import { NextResponse } from "next/server";

import { LIMITS } from "../../../../_lib/rateLimit";
import { cleanText } from "../../../../_lib/socialMutations";
import { withSecurity } from "../../../../_lib/withSecurity";
import { getSupabaseAdminClient, getPrivilegedSupabaseClient } from "@/lib/supabase/admin";

const BLOCKED_WORDS = ["kill yourself", "kys", "slut", "whore", "bitch", "dox"];

function dropIdFromRequest(request: Request) {
  return new URL(request.url).pathname.split("/").slice(-2)[0] || "";
}

export const POST = withSecurity(
  { rateLimit: LIMITS.COMMENT },
  async (request, context) => {
    const dropId = dropIdFromRequest(request);
    const body = await request.json().catch(() => ({}));
    const roomId = cleanText(body.roomId, 160);
    const text = cleanText(body.text, 360);

    if (!dropId || !roomId || !text) {
      return NextResponse.json({ error: "bad comment" }, { status: 400 });
    }

    if (BLOCKED_WORDS.some((word) => text.toLowerCase().includes(word))) {
      return NextResponse.json({ error: "moderation" }, { status: 400 });
    }

    const db = getSupabaseAdminClient() as any;
    const { data: drop, error: dropError } = await db
      .from("birthday_drops")
      .select("room_id")
      .eq("id", dropId)
      .maybeSingle();

    if (dropError) throw dropError;
    if (!drop || drop.room_id !== roomId) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const { data: comment, error: commentError } = await db
      .from("birthday_drop_comments")
      .insert({ drop_id: dropId, user_id: context.uid, body: text })
      .select("id,created_at")
      .single();

    if (commentError) throw commentError;

    // The RPC increments the counter atomically and returns the authoritative value.
    // This removes the old full COUNT(*) read after every comment.
    const { data: replyCount, error: counterError } = await (getPrivilegedSupabaseClient() as any).rpc(
      "increment_birthday_drop_reply_count",
      { p_drop_id: dropId },
    );

    if (counterError) throw counterError;

    return NextResponse.json({
      ok: true,
      comment: {
        id: comment.id,
        dropId,
        roomId,
        text,
        createdAtMs: Date.parse(comment.created_at),
      },
      replyCount: Number(replyCount) || 0,
    });
  },
);
