/**
 * POST /api/users/me/cache - clear server-side profile/feed cache after the
 * client updates its Postgres profile document directly.
 */
import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../../_lib/withSecurity";
import { LIMITS } from "../../../_lib/rateLimit";
import { invalidateSocialCachesForUsers } from "../../../_lib/socialCache";

export const POST = withSecurity(
  { rateLimit: LIMITS.PROFILE_EDIT },
  async (_req, ctx) => {
    await invalidateSocialCachesForUsers([ctx.uid]);

    return NextResponse.json({ ok: true });
  },
);
