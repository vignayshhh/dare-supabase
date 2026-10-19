import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../_lib/withSecurity";
import { LIMITS } from "../../_lib/rateLimit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  cleanText,
  createAlert,
  getDisplayProfile,
} from "../../_lib/socialMutations";
import { invalidateSocialCachesForUsers } from "../../_lib/socialCache";

export const POST = withSecurity(
  { rateLimit: LIMITS.PROFILE_EDIT },
  async (req, ctx) => {
    const body = (await req.json().catch(() => ({}))) as {
      addresseeId?: unknown;
    };
    const addresseeId = cleanText(body.addresseeId, 128);
    if (!addresseeId || addresseeId === ctx.uid) {
      return NextResponse.json({ error: "bad addressee" }, { status: 400 });
    }

    // The authenticated API boundary has already verified ctx.uid.  Insert with
    // the server-only client so this path remains available when an older
    // production database has not yet received the optional RPC migration.
    const { data: created, error } = await (getSupabaseAdminClient() as any)
      .from("friendships")
      .insert({
        requester_id: ctx.uid,
        addressee_id: addresseeId,
        status: "PENDING",
      })
      .select("id, requester_id, addressee_id, status, created_at, updated_at")
      .single();
    if (error) {
      if (error.code === "23505" || error.message.includes("friendship_exists")) {
        return NextResponse.json({ error: "friendship_exists" }, { status: 409 });
      }
      throw error;
    }

    const actor = await getDisplayProfile(ctx.uid).catch(() => ({
      name: "Someone",
      username: "someone",
      avatar: "",
    }));
    await createAlert({
      userId: addresseeId,
      type: "FRIEND_REQUEST",
      entityId: created.id,
      actorId: ctx.uid,
      message: `${actor.name} sent you a friend request`,
      metadata: {
        requesterId: ctx.uid,
        actorName: actor.name,
        actorUsername: actor.username,
        actorAvatar: actor.avatar,
      },
    }).catch(() => {});

    await invalidateSocialCachesForUsers([ctx.uid, addresseeId]);

    return NextResponse.json({
      ok: true,
      friendship: {
        id: created.id,
        requester_id: created.requester_id,
        addressee_id: created.addressee_id,
        status: "pending",
        created_at: created.created_at,
        accepted_at: null,
      },
    });
  },
);
