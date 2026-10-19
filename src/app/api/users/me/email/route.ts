/**
 * GET /api/users/me/email â€” returns the caller's email from the
 * owner-only private subcollection. Client code that needs its own
 * email (e.g. settings page, account export) should call this instead
 * of reading it directly from Postgres.
 */
import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../../_lib/withSecurity";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { LIMITS } from "../../../_lib/rateLimit";

export const GET = withSecurity(
  { rateLimit: LIMITS.PROFILE_EDIT, skipCsrf: true },
  async (_req, ctx) => {
    // Primary: private subcollection (post-migration).
    const { data: priv, error } = await (getSupabaseAdminClient() as any)
      .from("profile_private").select("email").eq("user_id",ctx.uid).maybeSingle();
    if (error) throw error;
    if (priv?.email) return NextResponse.json({ ok: true, email: priv.email });
    // Fallback: Auth record (pre-migration or Google sign-in).
    return NextResponse.json({ ok: true, email: ctx.token.email ?? null });
  },
);
