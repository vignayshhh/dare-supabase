/**
 * GET /api/drama/feed - drama cards (all kinds) created by the user's friend
 * network, newest first. Returns posts grouped per kind in client shapes.
 */
import "server-only";
import { NextResponse } from "next/server";
import { withSecurity } from "../../_lib/withSecurity";
import { LIMITS } from "../../_lib/rateLimit";
import { hydrateDramaRows, toClientDramaPost } from "../../_lib/drama";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const GET = withSecurity(
  { rateLimit: LIMITS.DRAMA_FEED_FETCH, skipCsrf: true },
  async (req, ctx) => {
    const url = new URL(req.url);
    const requestedLimit = Number.parseInt(
      url.searchParams.get("limit") || "60",
      10,
    );
    const limitCount = Math.max(
      1,
      Math.min(100, Number.isFinite(requestedLimit) ? requestedLimit : 60),
    );

    const requestedId = url.searchParams.get('id');
    const requestedIds = (url.searchParams.get('ids') || requestedId || '')
      .split(',').map((id) => id.trim()).filter(Boolean);
    if (requestedIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) return NextResponse.json({ error: 'Invalid card' }, { status: 400 });

    const client = getSupabaseAdminClient() as any;
    let query = client.from("drama_posts")
      .select("id,kind,creator_id,payload,resolution,resolved_at,subject_reaction,subject_outcome,subject_thought,proof_label,proof_url,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(limitCount);
    // Circle RLS supplies the audience, including members beyond a friend list.
    if (requestedIds.length === 1) query = query.eq('id', requestedIds[0]);
    else if (requestedIds.length > 1) query = query.in('id', requestedIds.slice(0, 100));
    const { data: rows, error } = await query;
    if (error) throw error;
    const hydrated = await hydrateDramaRows(rows ?? []);

    const posts: {
      predictions: unknown[];
      deals: unknown[];
      rumours: unknown[];
      promises: unknown[];
      customs: unknown[];
    } = { predictions: [], deals: [], rumours: [], promises: [], customs: [] };

    const docs = hydrated.sort((a, b) => new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime());

    for (const docSnap of docs) {
      const mapped = toClientDramaPost(docSnap.id, docSnap as any);
      if (!mapped) continue;
      if (mapped.kind === "prediction") posts.predictions.push(mapped.post);
      else if (mapped.kind === "deal") posts.deals.push(mapped.post);
      else if (mapped.kind === "rumour") posts.rumours.push(mapped.post);
      else if (mapped.kind === "promise") posts.promises.push(mapped.post);
      else posts.customs.push(mapped.post);
    }

    return NextResponse.json({ ok: true, ...posts });
  },
);
