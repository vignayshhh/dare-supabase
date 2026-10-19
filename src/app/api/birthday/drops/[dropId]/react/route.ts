import "server-only";

import { NextResponse } from "next/server";

import { LIMITS } from "../../../../_lib/rateLimit";
import { cleanText } from "../../../../_lib/socialMutations";
import { withSecurity } from "../../../../_lib/withSecurity";
import { getSupabaseAdminClient, getPrivilegedSupabaseClient } from "@/lib/supabase/admin";

const ALLOWED_REACTIONS = new Set(["heart", "laugh", "cry", "fire"]);

function dropIdFromRequest(request: Request) {
  return new URL(request.url).pathname.split("/").slice(-2)[0] || "";
}

export const POST = withSecurity(
  { rateLimit: LIMITS.BIRTHDAY_REACTION },
  async (request, context) => {
    const dropId = dropIdFromRequest(request);
    const body = await request.json().catch(() => ({}));
    const roomId = cleanText(body.roomId, 160);
    const reaction = cleanText(body.reaction, 16);

    if (!dropId || !roomId || !ALLOWED_REACTIONS.has(reaction)) {
      return NextResponse.json({ error: "bad reaction" }, { status: 400 });
    }

    const db = getSupabaseAdminClient() as any;
    const { data: drop, error: dropError } = await db
      .from("birthday_drops")
      .select("id,room_id")
      .eq("id", dropId)
      .maybeSingle();

    if (dropError) throw dropError;
    if (!drop || drop.room_id !== roomId) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const { data: inserted, error } = await (getPrivilegedSupabaseClient() as any).rpc(
      "add_birthday_drop_reaction",
      { p_drop_id: dropId, p_user_id: context.uid, p_reaction: reaction },
    );
    if (error) throw error;

    return NextResponse.json({ ok: true, duplicate: inserted === false });
  },
);
