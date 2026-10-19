import "server-only";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { withSecurity } from "./withSecurity";
import { getCachedProfiles, toIsoString } from "./socialCache";
import { decodePageCursor, encodePageCursor } from "./pageCursor";
import { LIMITS } from "./rateLimit";

const COMMENT_COLUMNS = "id,verdict_id,user_id,text,parent_id,created_at";
const clean = (value: unknown) => typeof value === "string" ? value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 1000) : "";
const verdictId = (request: Request, body?: Record<string, unknown>) => new URL(request.url).searchParams.get("verdictId") || String(body?.verdict_id || "") || request.url.split("/api/verdicts/")[1]?.split("/")[0] || "";

async function mapComments(rows: any[]) {
  const profiles = await getCachedProfiles(rows.map((row) => row.user_id));
  return rows.map((row) => {
    const profile = profiles.get(row.user_id);
    return {
      id: row.id, verdict_id: row.verdict_id, user_id: row.user_id,
      author: { id: row.user_id, username: profile?.username || "", display_name: profile?.display_name || profile?.nickname || "", avatar_url: profile?.avatar_url || "" },
      text: row.text, parent_id: row.parent_id || null, created_at: toIsoString(row.created_at),
    };
  });
}

export const GET_VERDICT_COMMENTS = withSecurity({ rateLimit: LIMITS.POST_FETCH, skipCsrf: true }, async (request) => {
  const id = verdictId(request);
  const url = new URL(request.url);
  const take = Math.min(50, Math.max(1, Number(url.searchParams.get("take")) || 30));
  const cursor = decodePageCursor(url.searchParams.get("cursor"));
  let query = (getSupabaseAdminClient() as any).from("verdict_comments").select(COMMENT_COLUMNS).eq("verdict_id", id)
    .order("created_at", { ascending: true }).order("id", { ascending: true }).limit(take);
  if (cursor && typeof cursor.value === "string") query = cursor.id
    ? query.or(`created_at.gt.${cursor.value},and(created_at.eq.${cursor.value},id.gt.${cursor.id})`)
    : query.gt("created_at", cursor.value);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data || [];
  const comments = await mapComments(rows);
  const last = rows.at(-1);
  return NextResponse.json({ ok: true, comments, nextCursor: last ? encodePageCursor({ value: toIsoString(last.created_at), id: last.id }) : null, hasMore: rows.length === take });
});

export const POST_VERDICT_COMMENT = withSecurity({ rateLimit: LIMITS.COMMENT }, async (request, context) => {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = verdictId(request, body);
  const text = clean(body.text);
  const parentId = typeof body.parent_id === "string" && body.parent_id ? body.parent_id : null;
  if (!id || !text) return NextResponse.json({ error: "comment required" }, { status: 400 });
  const { data, error } = await (getSupabaseAdminClient() as any).rpc("create_verdict_comment_native", { p_verdict_id: id, p_text: text, p_parent_id: parentId, p_actor_id: context.uid });
  if (error) throw error;
  const comments = await mapComments([{ id: data.id, verdict_id: id, user_id: context.uid, text: data.text, parent_id: data.parent_id, created_at: data.created_at || new Date().toISOString() }]);
  return NextResponse.json({ ok: true, comment: comments[0], comments_count: Number(data.comments_count) || 0 });
});
