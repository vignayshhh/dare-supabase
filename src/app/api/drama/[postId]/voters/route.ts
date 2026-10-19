import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../../_lib/withSecurity";
import { LIMITS } from "../../../_lib/rateLimit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCachedProfiles } from "../../../_lib/socialCache";

export const GET = withSecurity({ rateLimit: LIMITS.DRAMA_FEED_FETCH, skipCsrf: true }, async (req) => {
  const postId = new URL(req.url).pathname.split("/").filter(Boolean).at(-2) || "";
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return NextResponse.json({ error: "Invalid card" }, { status: 400 });
  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));
  const cursorAt = url.searchParams.get("cursorAt");
  const cursorId = url.searchParams.get("cursorId");
  const client = getSupabaseAdminClient() as any;
  let query = client.from("drama_votes").select("post_id,user_id,vote,created_at").eq("post_id", postId).order("created_at", { ascending: false }).order("user_id", { ascending: false }).limit(limit + 1);
  if (cursorAt && cursorId) query = query.or(`created_at.lt.${cursorAt},and(created_at.eq.${cursorAt},user_id.lt.${cursorId})`);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []).slice(0, limit);
  const profiles = await getCachedProfiles(rows.map((row: any) => row.user_id));
  const items = rows.map((row: any) => { const p = profiles.get(row.user_id); return { id: row.user_id, userId: row.user_id, vote: row.vote, createdAt: row.created_at, profile: { id: row.user_id, username: p?.username || "", displayName: p?.display_name || p?.username || "Someone", avatarUrl: p?.avatar_url || "" } }; });
  const last = rows[rows.length - 1];
  return NextResponse.json({ items, nextCursor: data && data.length > limit && last ? { cursorAt: last.created_at, cursorId: last.user_id } : null, hasMore: Boolean(data && data.length > limit) });
});
