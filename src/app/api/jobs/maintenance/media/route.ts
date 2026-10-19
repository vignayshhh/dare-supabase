import "server-only";
import { NextResponse } from "next/server";
import { getPrivilegedSupabaseClient } from "@/lib/supabase/admin";

const authorized = (req: Request) => {
  const secret = process.env.MAINTENANCE_CRON_SECRET || process.env.FEED_FANOUT_CRON_SECRET;
  if (!secret && process.env.NODE_ENV !== "production") return true;
  return Boolean(secret) && (req.headers.get("x-cron-secret") === secret || req.headers.get("authorization") === `Bearer ${secret}`);
};

/**
 * Bounded cleanup for newly tracked media. GET is report-only: it never deletes.
 * POST claims and removes at most 100 newly tracked, unreferenced objects.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const client: any = getPrivilegedSupabaseClient();
  const { count, error } = await client.from("media_assets").select("id", { count: "exact", head: true }).eq("state", "uploaded_unattached");
  if (error) return NextResponse.json({ error: "report_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, mode: "report-only", newlyTrackedUnattached: count ?? 0, historicalObjects: "not inventoried automatically" });
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const client: any = getPrivilegedSupabaseClient();
  const { data: assets, error } = await client.rpc("claim_unattached_media_assets", { p_limit: 100 });
  if (error) return NextResponse.json({ error: "claim_failed" }, { status: 500 });

  let deleted = 0;
  let failed = 0;
  for (const asset of assets ?? []) {
    const result = await client.storage.from(asset.bucket).remove([asset.object_path]);
    if (!result.error || /not found|does not exist/i.test(result.error.message)) {
      await client.from("media_assets").update({ state: "deleted", cleanup_claimed_at: null, last_error: null }).eq("id", asset.id).eq("state", "pending_deletion");
      deleted += 1;
    } else {
      await client.from("media_assets").update({ state: "cleanup_failed", cleanup_claimed_at: null, retry_count: (asset.retry_count ?? 0) + 1, last_error: result.error.message }).eq("id", asset.id).eq("state", "pending_deletion");
      failed += 1;
    }
  }
  return NextResponse.json({ ok: true, claimed: assets?.length ?? 0, deleted, failed, historicalObjectsUntouched: true });
}
