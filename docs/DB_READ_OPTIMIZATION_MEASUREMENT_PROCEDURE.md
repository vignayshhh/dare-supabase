# Reproducible DARE read-measurement procedure

Updated: 2026-10-13

## Dataset

Use a disposable Supabase project. Seed owner, friend, unrelated user, admin,
room participant, multiple stories/posts/messages, and enough rows to cross
each page boundary. Keep a resettable seed snapshot.

## Runs

For each journey (startup, feed, profile, posts/comments, reactions,
friendships, stories/audience, chat, alerts, birthday, challenges,
truth/dares/verdicts, media, tab switch, reconnect):

1. Clear browser state and cache for cold run; preserve them for warm run.
2. Capture browser/API requests, Supabase REST/RPC calls, SQL duration/rows,
   response bytes, cache hit/miss, active channels, and Realtime messages.
3. Run one cold and at least three identical warm scenarios before and after.
4. Compare only identical seed, account, viewport, route, and interaction
   sequence. Report median/p95; retain raw traces.
5. Separately test two users requesting the same private resource.
6. Run RLS negative cases, concurrent toggles/joins/counters, cursor boundary
   cases, reconnect, unsubscribe, and hidden-tab cases.

## SQL evidence

Run `EXPLAIN (ANALYZE, BUFFERS)` on representative feed, story, message,
audience, and challenge queries/RPCs. Record plan, rows removed, buffers,
duration, and index used. Never convert static marker counts into runtime
percentages.

Current workspace lacks the disposable seeded environment, so live metrics are
not claimed.

