import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../../../_lib/withSecurity";
import { LIMITS } from "../../../../_lib/rateLimit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { cleanText } from "../../../../_lib/socialMutations";
import { getCachedProfiles } from "../../../../_lib/socialCache";
import { attachMediaAssetsForUrls } from "../../../../_lib/mediaAssets";

const types = new Set(["wish", "memory", "photo", "video", "voice", "dare", "anonymous", "confession", "compliment", "joke"]);
const mediaTypes = new Set(["image", "video", "audio"]);
const blocked = ["kill yourself", "kys", "slut", "whore", "bitch", "dox"];
const roomId = (request: Request) => new URL(request.url).pathname.split("/").slice(-2)[0] || "";

export const POST = withSecurity({ rateLimit: LIMITS.BIRTHDAY_DROP }, async (request, context) => {
  const id = cleanText(roomId(request), 160);
  const body = await request.json().catch(() => ({}));
  const type = cleanText(body.type, 24);
  const text = cleanText(body.text, 900);
  const mediaUrl = cleanText(body.mediaUrl, 2000);
  const mediaType = cleanText(body.mediaType, 12);
  const anonymous = body.anonymous === true || type === "anonymous" || type === "confession";
  const sealed = body.sealed === true;
  if (!id || !types.has(type) || (!text && !mediaUrl) || blocked.some((word) => text.toLowerCase().includes(word))) {
    return NextResponse.json({ error: "bad drop" }, { status: 400 });
  }
  if (mediaUrl && (!mediaTypes.has(mediaType) || !/^https:\/\/.*supabase\.co/.test(mediaUrl))) {
    return NextResponse.json({ error: "bad media" }, { status: 400 });
  }
  const database = getSupabaseAdminClient() as any;
  const { data: room, error: roomError } = await database.from("birthday_rooms").select("birthday_user_id,status,expires_at").eq("id", id).maybeSingle();
  if (roomError) throw roomError;
  if (!room) return NextResponse.json({ error: "room not found" }, { status: 404 });
  if (room.status !== "preview" && room.status !== "active") return NextResponse.json({ error: "room closed" }, { status: 403 });
  const profile = (await getCachedProfiles([context.uid])).get(context.uid);
  const metadata = {
    authorUsername: anonymous ? "birthday secret" : profile?.username || context.uid,
    authorDisplayName: anonymous ? "Anonymous" : profile?.display_name || profile?.nickname || profile?.username || "Friend",
    authorAvatarUrl: anonymous ? "" : profile?.avatar_url || "",
    anonymous,
    sealed,
  };
  const { data: drop, error } = await database.from("birthday_drops").insert({
    room_id: id, birthday_user_id: room.birthday_user_id, real_author_id: anonymous ? null : context.uid,
    type, text: text || "", media_url: mediaUrl || null, media_type: mediaType || null, anonymous, sealed, metadata,
  }).select("id,birthday_user_id,type,text,media_url,media_type,created_at").single();
  if (error) throw error;
  await attachMediaAssetsForUrls(database, [mediaUrl], "birthday_drop", drop.id);
  return NextResponse.json({ ok: true, drop: {
    id: drop.id, roomId: id, birthdayUserId: drop.birthday_user_id,
    authorId: anonymous ? metadata.authorUsername : context.uid,
    authorUsername: metadata.authorUsername, authorDisplayName: metadata.authorDisplayName, authorAvatarUrl: metadata.authorAvatarUrl,
    type: drop.type, text: drop.text, mediaUrl: drop.media_url, mediaType: drop.media_type,
    anonymous, sealed, reactions: {}, reactionCount: 0, replyCount: 0, createdAtMs: Date.parse(drop.created_at),
  } });
});
