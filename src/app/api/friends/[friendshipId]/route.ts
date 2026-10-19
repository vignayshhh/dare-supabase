import "server-only";

import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { invalidateSocialCachesForUsers } from "../../_lib/socialCache";
import { cleanText, createAlert, getDisplayProfile } from "../../_lib/socialMutations";
import { LIMITS } from "../../_lib/rateLimit";
import { withSecurity } from "../../_lib/withSecurity";

const FIELDS = "id,requester_id,addressee_id,status,created_at,updated_at";
const idOf = (req: Request) => new URL(req.url).pathname.split("/").pop() || "";

export const PATCH = withSecurity({ rateLimit: LIMITS.PROFILE_EDIT }, async (req, ctx) => {
  const id = idOf(req);
  const status = cleanText((await req.json().catch(() => ({}))).status, 20);
  if (!id || !["accepted", "rejected"].includes(status)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const db = getSupabaseAdminClient() as any;
  const { data: row, error } = await db.from("friendships").select(FIELDS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (![row.requester_id, row.addressee_id].includes(ctx.uid) || (status === "accepted" && row.addressee_id !== ctx.uid)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const native = status === "accepted" ? "ACCEPTED" : "DECLINED";
  const { data: updated, error: updateError } = await db.from("friendships").update({ status: native })
    .eq("id", id).eq("status", "PENDING").select(FIELDS).maybeSingle();
  if (updateError) throw updateError;
  if (!updated) return NextResponse.json({ error: "state_conflict" }, { status: 409 });
  if (status === "accepted") {
    const actor = await getDisplayProfile(ctx.uid).catch(() => ({ name: "Someone", username: "someone", avatar: "" }));
    await createAlert({ userId: row.requester_id, type: "FRIEND_ACCEPTED", entityId: id, actorId: ctx.uid, message: `${actor.name} accepted your friend request`, metadata: { actorName: actor.name, actorUsername: actor.username, actorAvatar: actor.avatar } }).catch(() => {});
  }
  await invalidateSocialCachesForUsers([row.requester_id, row.addressee_id]);
  return NextResponse.json({ ok: true, friendship: { id, requester_id: updated.requester_id, addressee_id: updated.addressee_id, status, created_at: updated.created_at, accepted_at: status === "accepted" ? updated.updated_at : null } });
});

export const DELETE = withSecurity({ rateLimit: LIMITS.PROFILE_EDIT }, async (req, ctx) => {
  const id = idOf(req);
  const db = getSupabaseAdminClient() as any;
  const { data: row, error } = await db.from("friendships").select(FIELDS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!row) return NextResponse.json({ ok: true });
  if (![row.requester_id, row.addressee_id].includes(ctx.uid)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { error: deleteError } = await db.from("friendships").delete().eq("id", id);
  if (deleteError) throw deleteError;
  await invalidateSocialCachesForUsers([row.requester_id, row.addressee_id]);
  return NextResponse.json({ ok: true });
});
