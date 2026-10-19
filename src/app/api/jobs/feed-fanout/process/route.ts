/**
 * POST /api/jobs/feed-fanout/process
 *
 * Historical fanout processing is retired. This endpoint is report-only so
 * pending legacy rows can be inventoried without recreating materialized-feed
 * writes.
 */
import "server-only";
import { NextResponse } from "next/server";
import { getPrivilegedSupabaseClient } from "@/lib/supabase/admin";

function authorized(req: Request): boolean {
  const secret = process.env.FEED_FANOUT_CRON_SECRET;
  if (!secret && process.env.NODE_ENV !== "production") return true;
  if (!secret) return false;

  const headerSecret = req.headers.get("x-cron-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return headerSecret === secret || bearer === secret;
}

async function handler(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { count, error } = await (getPrivilegedSupabaseClient() as any)
    .from("feed_fanout_jobs")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "processing"]);
  if (error) return NextResponse.json({ error: "Could not inspect retired fanout jobs" }, { status: 500 });

  return NextResponse.json({
    ok: true,
    retired: true,
    pendingLegacyJobs: count ?? 0,
  });
}

export const POST = handler;
export const GET = handler;
