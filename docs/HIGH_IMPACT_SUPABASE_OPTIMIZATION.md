# High-impact Supabase optimization report

Updated: 2026-10-13

## Implemented runtime changes

- Stories: feed bootstrap changed from friendship discovery, a 30-friend cap, story subscription, profile hydration, viewer-state reads, and counter reads to one bounded `get_friend_stories` RPC. RPC returns author, view count, and viewer-specific state. Own/friend stories share one in-flight request and one authorized `story-feed:<uid>` Broadcast channel.
- Alerts: app owns one user-scoped channel for session lifetime. Entering Alerts loads one bounded `get_alert_page` RPC only when 50-row data is stale; leaving screen performs no resubscribe. RPC returns rows plus authoritative unread count.
- Inbox: removed unfiltered `conversations` Postgres Changes listener. Inbox uses one authorized `inbox:<uid>` Broadcast topic plus user-filtered membership changes. Message/conversation triggers notify only members; client coalesces bursts into one bounded inbox refresh.
- Typing: all consumers of a conversation share one private Broadcast channel and one dispatch handler. Reference counting removes channel after final listener. Typing remains ephemeral; no database writes.
- Profiles: concurrent profile reads now share one promise per user. Profile header social data uses one bounded `get_profile_social_context` RPC returning count, six preview profiles, and viewer relationship state. Cache key includes viewer and profile; friendship mutations invalidate affected keys.
- Feed: fixed the client/server page-shape mismatch that forced ranked pages into compatibility fallback. Initial and load-more reads now use the server `get_ranked_feed_page` path with opaque score/ID cursors; broad feed Realtime fallback is removed.
- Truth/dares: native repositories use typed tables and RPCs. Lifecycle updates are actor-derived, row-locked, transition-checked, and direct authenticated table updates are revoked.
- Shared adapter: concurrent identical reads are coalesced per client; identical listeners share one reference-counted channel without cross-client snapshot sharing.
- Instrumentation: development/staging counters track Supabase REST queries, RPCs, returned rows, app API requests, selected Realtime joins/messages, and cache signals without logging URLs, tokens, bodies, or private payloads. Browser snapshot: `window.__DARE_RESOURCE_METRICS__.snapshot()`.

## Architectural operation reduction

These are source-path reductions, not hosted telemetry:

| Journey | Before | After |
| --- | --- | --- |
| Feed story bootstrap | friendship reads + capped story listener + profile/view/count hydration + separate own-story listener | 1 RPC + 1 targeted channel |
| Background alerts | 2 initial DB requests; channel recreated when Alerts screen opened/closed | 1 RPC + stable channel |
| Inbox live updates | membership listener + every `conversations` table change | membership listener + member-targeted Broadcast |
| Typing with inbox and open chat | duplicate channel per consumer | 1 shared channel per conversation |
| Profile social header | profile + complete friend list/profile hydration + relationship read | profile read + 1 bounded context RPC |

## Feed cache decision

Broad TanStack Query adoption was rejected: repository had a provider but zero query/mutation hooks, while Zustand stores already own optimistic UI and subscriptions. Keeping both would create two freshness/invalidation systems without removing Supabase calls. Unused TanStack provider and dependency were removed.

Ranked-feed cache remains enabled pending representative staging evidence. Current Supabase-backed cache can save ranked-query compute on a hit, but a process-memory miss still costs a `cache_entries` DB query and cold misses add a cache write. `FEED_DB_CACHE_ENABLED=false` enables a clean direct-RPC A/B run. Existing `posts-feed` cache metrics plus resource counters must compare cold/warm request count, p50/p95 latency, returned bytes, DB time, and hit ratio before removal.

## Verification limits

After explicit authorization, migrations `20261063000000`, `20261065000000`, and `20261066000000` were applied to the linked main project on 2026-10-13. Remote migration history now matches local history and linked database lint reports no schema errors. No reset, seed, production load test, Storage deletion, or billing/project-setting change was performed.

Post-change reproducible scan (`npm run audit:supabase`, active `src/`, excluding tests/backups/generated files): 318 `.from(` markers, 72 RPC markers, 35 channel markers, 11 Postgres Changes markers, 104 relational-helper reads, 96 relational-helper writes, 45 shared subscriptions, 41 interval markers, and zero `select("*")` markers. These are source markers, not runtime request totals. The retired compatibility module is no longer imported; remaining helpers target dedicated native relational tables through `relationalStore`.

Executed checks:

- TypeScript: passed.
- Jest: 9 suites, 39 tests passed.
- ESLint on changed implementation/test files: passed.
- Production build: passed (29 static pages generated).
- Linked migrations `20261063000000`, `20261065000000`, and `20261066000000` were pushed successfully; a subsequent migration-list check showed all three present remotely and linked database lint returned no schema errors.
- Full ESLint: exits successfully with 0 errors and 439 warnings. Remaining warnings are visible React compiler/unused-symbol diagnostics, not ignored files.
- Local migration reset/execution: blocked because Docker Desktop and Podman are unavailable.
