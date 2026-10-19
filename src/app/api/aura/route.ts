import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../_lib/withSecurity";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { LIMITS } from "../_lib/rateLimit";

function mapEvent(data: Record<string, unknown>) {
  return {
    id: String(data.id || ""),
    kind: data.kind,
    amount: Number(data.amount || 0),
    title: String(data.title || "Aura update"),
    message: String(data.message || ""),
    sourceType: String(data.source_type || ""),
    sourceId: String(data.source_id || ""),
    currentAuraAfter: Number(data.current_aura_after || 0),
    lifetimeAuraAfter: Number(data.lifetime_aura_after || 0),
    celebrated: Boolean(data.celebrated_at),
    createdAt: String(data.created_at || ""),
  };
}

export const GET = withSecurity({ rateLimit: LIMITS.PROFILE_VIEW }, async (req, ctx) => {
  const params = new URL(req.url).searchParams;
  const includeHistory = params.get("history") === "1";
  const includeBalance = params.get("balance") !== "0";
  const client = getSupabaseAdminClient() as any;
  const balances = includeBalance
    ? await client.from("circle_aura").select("current_aura,lifetime_aura").eq("circle_id", ctx.circleId).eq("user_id", ctx.uid).maybeSingle()
    : { data: null };
  let eventsQuery = client.from("aura_events").select("id,kind,delta,title,message,source_type,source_id,current_aura_after,lifetime_aura_after,celebrated_at,created_at").eq("user_id", ctx.uid).order("created_at", { ascending: false });
  eventsQuery = includeHistory ? eventsQuery.limit(30) : eventsQuery.is("celebrated_at", null).limit(1);
  const { data: eventRows, error } = await eventsQuery;
  if (error) throw error;
  const events = (eventRows ?? []).map((row: Record<string, unknown>) => mapEvent({ ...row, amount: row.delta }));
  return NextResponse.json({
    ok: true,
    currentAura: Number(balances.data?.current_aura ?? 100),
    lifetimeAura: Number(balances.data?.lifetime_aura ?? 100),
    events,
    pendingEvent: events.find((event) => !event.celebrated) || null,
  });
});

export const PATCH = withSecurity({ rateLimit: LIMITS.PROFILE_EDIT }, async (req, ctx) => {
  const body = (await req.json().catch(() => ({}))) as { eventId?: unknown };
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) {
    return NextResponse.json({ error: "bad_event_id" }, { status: 400 });
  }
  const { error } = await (getSupabaseAdminClient() as any).rpc(
    "celebrate_aura_event",
    { p_event_id: eventId, p_user_id: ctx.uid },
  );
  if (error) throw error;
  return NextResponse.json({ ok: true });
});

