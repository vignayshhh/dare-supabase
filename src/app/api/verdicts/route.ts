import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../_lib/withSecurity";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { attachMediaAssetsForUrls } from "../_lib/mediaAssets";
import { getCachedProfiles, getFeedNetworkIds, toIsoString } from "../_lib/socialCache";
import { decodePageCursor, encodePageCursor } from "../_lib/pageCursor";
import { LIMITS } from "../_lib/rateLimit";
import type { VerdictDTO, VerdictChoice, VerdictMediaType, VerdictScope } from "@/types/verdict";
import { refreshStoredMediaUrl } from "../_lib/storedMediaUrl";

const MAX_LIMIT = 20;
const VERDICT_COLUMNS = "id,author_id,question,description,choice_one_text,choice_two_text,media_url,media_type,scope,topic,total_votes,choice_one_votes,choice_two_votes,comments_count,created_at,updated_at";
const clean = (value: unknown, length: number) => typeof value === "string" ? value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, length) : "";

const mapVerdict = (row: any, myVote: VerdictChoice | null, profiles: Map<string, any>): VerdictDTO => {
  const profile = profiles.get(row.author_id);
  return {
    id: row.id,
    author_id: row.author_id,
    author: { id: row.author_id, username: profile?.username || "", display_name: profile?.display_name || profile?.nickname || "", avatar_url: profile?.avatar_url || "" },
    question: row.question || "",
    description: row.description || "",
    choice_one_text: row.choice_one_text || "Yes",
    choice_two_text: row.choice_two_text || "No",
    media_url: row.media_url || "",
    media_type: (row.media_type || "PHOTO") as VerdictMediaType,
    scope: (row.scope || "friends") as VerdictScope,
    topic: row.topic || null,
    total_votes: Number(row.total_votes) || 0,
    choice_one_votes: Number(row.choice_one_votes) || 0,
    choice_two_votes: Number(row.choice_two_votes) || 0,
    comments_count: Number(row.comments_count) || 0,
    voter_preview: [],
    my_vote: myVote,
    created_at: toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at),
  };
};

export const GET = withSecurity({ rateLimit: LIMITS.VERDICT_FETCH, skipCsrf: true }, async (request, context) => {
  const url = new URL(request.url);
  const scope = (url.searchParams.get("scope") === "topics" ? "topics" : "friends") as VerdictScope;
  const take = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("take")) || 12));
  const topic = clean(url.searchParams.get("topic"), 40) || null;
  const cursor = decodePageCursor(url.searchParams.get("cursor"));
  const database = getSupabaseAdminClient() as any;
  let query = database.from("verdicts").select(VERDICT_COLUMNS).eq("scope", scope)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(take);
  if (topic) query = query.eq("topic", topic);
  if (cursor && typeof cursor.value === "string") query = cursor.id
    ? query.or(`created_at.lt.${cursor.value},and(created_at.eq.${cursor.value},id.lt.${cursor.id})`)
    : query.lt("created_at", cursor.value);
  if (scope === "friends") {
    const networkIds = (await getFeedNetworkIds(context.uid).catch(() => [context.uid])).slice(0, 100);
    query = query.in("author_id", networkIds);
  }
  const { data: rows, error } = await query;
  if (error) throw error;
  const list = rows || [];
  const ids = list.map((row: any) => row.id);
  const { data: votes, error: voteError } = ids.length
    ? await database.from("verdict_votes").select("verdict_id,choice").eq("user_id", context.uid).in("verdict_id", ids)
    : { data: [], error: null };
  if (voteError) throw voteError;
  const voteMap = new Map((votes || []).map((vote: any) => [vote.verdict_id, vote.choice as VerdictChoice]));
  const profiles = await getCachedProfiles(list.map((row: any) => row.author_id));
  const hydratedProfiles = new Map(await Promise.all(
    [...profiles.entries()].map(async ([id, profile]) => [
      id,
      profile ? { ...profile, avatar_url: await refreshStoredMediaUrl(profile.avatar_url) } : profile,
    ] as const),
  ));
  const verdicts = await Promise.all(list.map(async (row: any) => mapVerdict(
    { ...row, media_url: await refreshStoredMediaUrl(row.media_url) },
    (voteMap.get(row.id) as VerdictChoice | null) || null,
    hydratedProfiles,
  )));
  const last = list.at(-1);
  return NextResponse.json({
    ok: true,
    verdicts,
    nextCursor: last ? encodePageCursor({ value: toIsoString(last.created_at), id: last.id }) : null,
    hasMore: list.length === take,
  });
});

export const POST = withSecurity({ rateLimit: LIMITS.POST_CREATE, allowRedisFallback: true }, async (request, context) => {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const question = clean(body.question, 90);
  const description = clean(body.description, 2000);
  const choiceOne = clean(body.choice_one_text, 28);
  const choiceTwo = clean(body.choice_two_text, 28);
  if (!question || !choiceOne || !choiceTwo) return NextResponse.json({ error: "question and choices required" }, { status: 400 });
  const mediaUrl = clean(body.media_url, 2000);
  try { if (new URL(mediaUrl).protocol !== "https:") throw new Error(); } catch { return NextResponse.json({ error: "media required" }, { status: 400 }); }
  const scope = (body.scope === "topics" ? "topics" : "friends") as VerdictScope;
  const row = {
    author_id: context.uid, question, description, choice_one_text: choiceOne, choice_two_text: choiceTwo,
    media_url: mediaUrl, media_type: ["PHOTO", "VIDEO", "GIF"].includes(String(body.media_type)) ? String(body.media_type) : "PHOTO",
    scope, topic: scope === "topics" ? clean(body.topic, 40) || "Memes" : null,
  };
  const { data, error } = await (getSupabaseAdminClient() as any).from("verdicts").insert(row).select(VERDICT_COLUMNS).single();
  if (error) throw error;
  await attachMediaAssetsForUrls(getSupabaseAdminClient(), [mediaUrl], "verdict", data.id);
  return NextResponse.json({ ok: true, verdict: mapVerdict(data, null, await getCachedProfiles([context.uid])) });
});
