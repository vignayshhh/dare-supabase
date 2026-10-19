import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../../_lib/withSecurity";
import { LIMITS } from "../../../_lib/rateLimit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { cleanText } from "../../../_lib/socialMutations";
import { invalidateSocialCachesForUsers } from "../../../_lib/socialCache";

const RESERVED = new Set(["admin", "support", "root", "system"]);
const PROFILE_RESPONSE_COLUMNS = "id,username,display_name,avatar_url,bio,visibility,followers_count,following_count,posts_count,current_aura,lifetime_aura,has_completed_profile_creation,is_18_plus,consent_accepted,is_online,last_active_at,created_at,updated_at";
function username(value: unknown) { const normalized = cleanText(value, 30).toLowerCase(); if (!/^[a-z0-9_]{3,30}$/.test(normalized) || RESERVED.has(normalized)) throw new Error("bad username"); return normalized; }

export const PATCH = withSecurity({ rateLimit: LIMITS.PROFILE_EDIT }, async (req, ctx) => {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const profile: Record<string, unknown> = {};
  const privateData: Record<string, unknown> = {};
  try {
    if (body.displayName !== undefined) { const value = cleanText(body.displayName, 80); if (!value) throw new Error("bad display name"); profile.display_name = value; }
    if (body.username !== undefined) profile.username = username(body.username);
    if (body.bio !== undefined) profile.bio = cleanText(body.bio, 500);
    if (body.avatar !== undefined || body.avatar_url !== undefined) profile.avatar_url = cleanText(body.avatar ?? body.avatar_url, 2000);
    if (body.visibility !== undefined) profile.visibility = body.visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC";
    if (body.hasCompletedProfileCreation !== undefined) profile.has_completed_profile_creation = Boolean(body.hasCompletedProfileCreation);
    if (body.is_18_plus !== undefined) profile.is_18_plus = Boolean(body.is_18_plus);
    if (body.consent_accepted !== undefined) profile.consent_accepted = Boolean(body.consent_accepted);
    if (body.notificationPreferences && typeof body.notificationPreferences === "object") { const p = body.notificationPreferences as Record<string, unknown>; privateData.notification_preferences = { challenges: Boolean(p.challenges), messages: Boolean(p.messages), friendRequests: Boolean(p.friendRequests) }; }
  } catch { return NextResponse.json({ error: "invalid_profile_update" }, { status: 400 }); }
  if (!Object.keys(profile).length && !Object.keys(privateData).length) return NextResponse.json({ error: "empty update" }, { status: 400 });
  // Generated database types are added after the first `supabase gen types` run.
  // Keep this privileged route explicit while the fresh project has no linked ID.
  const admin: any = getSupabaseAdminClient();
  if (Object.keys(profile).length) { const { error } = await admin.from("profiles").update(profile).eq("id", ctx.uid); if (error?.code === "23505") return NextResponse.json({ error: "username_taken" }, { status: 409 }); if (error) throw error; }
  if (Object.keys(privateData).length) { const { error } = await admin.from("profile_private").update(privateData).eq("user_id", ctx.uid); if (error) throw error; }
  const [{ data: publicProfile, error: publicError }, { data: privateProfile, error: privateError }] = await Promise.all([admin.from("profiles").select(PROFILE_RESPONSE_COLUMNS).eq("id",ctx.uid).single(),admin.from("profile_private").select("notification_preferences").eq("user_id",ctx.uid).single()]);
  if (publicError) throw publicError; if (privateError) throw privateError;
  await invalidateSocialCachesForUsers([ctx.uid]);
  return NextResponse.json({ ok: true, profile: { ...(publicProfile as Record<string, unknown>), notificationPreferences: (privateProfile as { notification_preferences: unknown }).notification_preferences } });
});
