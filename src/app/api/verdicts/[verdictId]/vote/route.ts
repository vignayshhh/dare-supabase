import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../../_lib/withSecurity";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCachedProfiles, toIsoString } from "../../../_lib/socialCache";
import { LIMITS } from "../../../_lib/rateLimit";
import type { VerdictDTO, VerdictChoice } from "@/types/verdict";

const VERDICT_COLUMNS = "id,author_id,question,description,choice_one_text,choice_two_text,media_url,media_type,scope,topic,total_votes,choice_one_votes,choice_two_votes,comments_count,created_at,updated_at";
const idOf = (request: Request) => request.url.split("/api/verdicts/")[1]?.split("/")[0] || "";
const map = (row: any, vote: VerdictChoice | null, profiles: Map<string, any>): VerdictDTO => {
  const profile = profiles.get(row.author_id);
  return { id: row.id, author_id: row.author_id, author: { id: row.author_id, username: profile?.username || "", display_name: profile?.display_name || profile?.nickname || "", avatar_url: profile?.avatar_url || "" }, question: row.question, description: row.description, choice_one_text: row.choice_one_text, choice_two_text: row.choice_two_text, media_url: row.media_url, media_type: row.media_type, scope: row.scope, topic: row.topic || null, total_votes: row.total_votes, choice_one_votes: row.choice_one_votes, choice_two_votes: row.choice_two_votes, comments_count: row.comments_count, voter_preview: [], my_vote: vote, created_at: toIsoString(row.created_at), updated_at: toIsoString(row.updated_at) };
};

export const GET = withSecurity({ rateLimit: LIMITS.VERDICT_FETCH, skipCsrf: true }, async (request) => {
  const id = idOf(request);
  const database = getSupabaseAdminClient() as any;
  const { data: rows, error } = await database.from("verdict_votes").select("user_id,choice").eq("verdict_id", id).limit(100);
  if (error) throw error;
  const profiles = await getCachedProfiles((rows || []).map((row: any) => row.user_id));
  const voters = (rows || []).map((row: any) => { const profile = profiles.get(row.user_id); return { id: row.user_id, choice: row.choice, username: profile?.username || "", display_name: profile?.display_name || profile?.nickname || "", avatar_url: profile?.avatar_url || "" }; });
  return NextResponse.json({ ok: true, voters });
});

async function mutate(request: Request, userId: string, choice: VerdictChoice, remove: boolean) {
  const id = idOf(request);
  const database = getSupabaseAdminClient() as any;
  const { error } = await database.rpc("set_verdict_vote_native", { p_verdict_id: id, p_choice: choice, p_remove: remove, p_actor_id: userId });
  if (error) throw error;
  const { data: row, error: rowError } = await database.from("verdicts").select(VERDICT_COLUMNS).eq("id", id).single();
  if (rowError) throw rowError;
  return NextResponse.json({ ok: true, verdict: map(row, remove ? null : choice, await getCachedProfiles([row.author_id])) });
}

export const POST = withSecurity({ rateLimit: LIMITS.LIKE }, async (request, context) => {
  const body = await request.json().catch(() => ({})) as { choice?: unknown };
  const choice = body.choice === "one" || body.choice === "two" ? body.choice : null;
  if (!idOf(request) || !choice) return NextResponse.json({ error: "bad choice" }, { status: 400 });
  return mutate(request, context.uid, choice, false);
});
export const DELETE = withSecurity({ rateLimit: LIMITS.LIKE }, async (request, context) => mutate(request, context.uid, "one", true));
