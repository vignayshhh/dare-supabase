# DARE DB-read optimization hotspots

Updated: 2026-10-13

Prioritized remaining work. “High” means scale/correctness risk, not measured
production impact.

## High

1. Apply and validate local migrations `20261067000000` through
   `20261083000000` in disposable/staging Supabase only after authorization.
   Run RLS, concurrency, rollback, and query-plan checks.
2. Validate the new story audience/reaction cursors with boundary and concurrent
   reaction tests in staging; cursor payloads must remain stable under inserts.
3. Audit remaining low-frequency challenge proof/comment and moderation
   listeners. Bounded page contracts now exist for major comment/friendship
   paths; remaining listeners need runtime duplicate/reconnect validation.
4. Validate all Realtime channels for duplicate listeners, hidden-tab behavior,
   reconnect cleanup, and authorization scoping.

## Medium

5. Trace high `.from()` marker areas with request logs; marker count alone cannot
   identify redundant reads.
6. Classify interval markers and remove any database polling that overlaps with
   Realtime or cache refresh.
7. Run representative multi-user feed/profile/chat/story/challenge workloads;
   collect median/p95 requests, rows, bytes, SQL time, and Realtime messages.

## Low / hygiene

8. Resolve the remaining targeted lint warnings (`_viewerId`, unused
   `Unsubscribe`) where behavior permits.
9. Add integration coverage for each new RPC against RLS and concurrent calls.

