import "server-only";
import { NextResponse } from "next/server";
import { getPrivilegedSupabaseClient } from "@/lib/supabase/admin";

const authorized = (req: Request) => {
  const secret = process.env.MAINTENANCE_CRON_SECRET || process.env.FEED_FANOUT_CRON_SECRET;
  if (!secret && process.env.NODE_ENV !== "production") return true;
  return Boolean(secret) && (req.headers.get("x-cron-secret") === secret || req.headers.get("authorization") === `Bearer ${secret}`);
};

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const client: any = getPrivilegedSupabaseClient();
  let removed = 0;
  let batches = 0;
  for (; batches < 10; batches += 1) {
    const { data, error } = await client.rpc("cleanup_expired_cache_entries", { p_limit: 500 });
    if (error) return NextResponse.json({ error: "cleanup_failed", removed, batches }, { status: 500 });
    const count = Number(data || 0);
    removed += count;
    if (count < 500) break;
  }
  return NextResponse.json({ ok: true, removed, batches, bounded: true });
}
