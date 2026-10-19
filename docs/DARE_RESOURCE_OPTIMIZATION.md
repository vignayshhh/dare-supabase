# Dare Resource Optimization

Updated: 2026-10-13

## Scope and architecture

Dare uses Supabase PostgreSQL/Auth/Realtime/Storage, Next.js 16.2.4, and Zustand/custom caches. TanStack Query was removed because no active query or mutation hook used it; retaining a second cache owner would add invalidation complexity without reducing Supabase traffic. The generic `data_documents` table was retired by guarded migration `20261048000000`; active application paths use native relational tables/RPCs.

Ghost Mode, Activity Radar, and surveillance-related activity monitoring remain removed.

## Implemented resource reductions

| Area | Change | Resource reduced | Verification status |
| --- | --- | --- | --- |
| Compatibility adapter | Batched `getAll`, merge RPC, bounded pages, typed expressions, real OR groups, stable `(value,id)` cursors | Database round trips and transferred rows | Unit-tested; hosted query-plan measurement pending |
| Feed | Ranked feed API uses opaque score/ID cursors end-to-end; client no longer silently falls back to compatibility reads or opens a broad feed listener | Repeated feed reads, duplicate enrichment, unstable pagination, broad Realtime traffic | Type/build/tests passed; staging latency pending |
| Profile search | Bounded username/display-name range queries instead of loading the full users collection | Database reads, response bytes, browser filtering | Type/build/tests passed |
| Stories | Bounded `get_friend_stories` RPC selection, explicit media/payload mapping, and current-view lookup | N+1 story reads, oversized aggregation, response bytes | Source-level verification; multi-user runtime measurement pending |
| Realtime | Typing, drafts, chat presence, freeze/mood/switch state, and birthday-room presence use private Broadcast/Presence; friend presence uses per-user friend-authorized topics | Database writes, broad presence exposure, duplicate events | Type/build/tests passed; linked topic RLS applied |
| Cache | Process-local LRU, batched cache misses, atomic increments and set mutation RPC | Cache database requests and race conditions | Unit tests passed; local SQL concurrency test pending |
| Visibility | Removed one-second polling loop; uses the browser visibility event | Client timers and unnecessary subscription churn | Type/build verification passed |
| Media | Client-side image resizing and short-lived signed-URL reuse | Upload bytes and repeated Storage requests | Static review; real egress measurement pending |
| Client query cache | Zustand domain stores, client-scoped in-flight query coalescing, shared reference-counted subscriptions | Duplicate concurrent requests and duplicate Realtime channels without introducing a second cache owner | Unit-tested; runtime measurement pending |
| Atomic mutations | Replaced active API/middleware simulated transactions with narrow RPCs for posts, comments, friendships, stories, truths, dares, verdicts, Aura, moderation, drama, and fanout claiming | Read-before-write round trips, lost updates, duplicate event writes | Type/build/tests and linked schema lint passed |
| Document batches | Core batch writes use one atomic native-table RPC; secondary records use their own physical feature tables | Network requests, partial batch commits, connection churn | Unit-tested; linked migrations applied |
| Challenge routes | Removed broad row projections from dare/truth/friendship/vote routes and added guarded state predicates | Database egress, race-condition retries, accidental stale transitions | Type-check and targeted ESLint passed |
| Message realtime | One bounded initial message page, batched sender-profile lookup, payload-local INSERT/UPDATE/DELETE reconciliation | Full-history rereads and N+1 profile requests per event | Type-check and targeted ESLint passed |
| Truth/story interactions | Bounded vote/comment previews, exact server-side vote/reaction counts, local realtime reconciliation | Transferred rows and event-triggered full list reloads | Type-check and targeted ESLint passed |
| Alerts/presence | Exact initial unread summary query, payload-local alert updates, removed avatar/presence heartbeat timers | Repeated list reads, local timer churn, unnecessary Realtime presence events | Type-check and targeted ESLint passed |
| Instrumentation | Cache metrics are enabled by default in development/staging and opt-in in production via `RESOURCE_METRICS_ENABLED=true` | Production log volume and metric persistence writes | Type-check and targeted ESLint passed |
| Cache lifecycle | Removed permanent per-instance cleanup timers; expired/in-flight entries clean up lazily during cache use | Client timers, idle work, and retained cache instances | Type-check and Jest passed |

## Current verification

- `npm run type-check`: passed.
- `npm test -- --runInBand`: passed, 8 suites and 26 tests.
- Targeted ESLint for previously changed optimization files passed. Latest touched-file results are recorded below.
- `npm run build`: passed.
- `npm audit` and `npm audit --omit=dev`: passed with zero reported vulnerabilities.
- `npx supabase db lint --linked`: clean for the linked database through `20261059000000`. Migration `20261063000000_bounded_story_feed.sql` is repository-only and has not been pushed.
- Full-repository ESLint exits successfully with 0 errors and 420 warnings. Warnings are predominantly pre-existing React compiler diagnostics and unused declarations; they remain visible rather than being excluded.

## 2026-10-13 follow-up implementation

- Identical transitional adapter queries now share one in-flight Supabase request per client. No result cache is retained, avoiding stale or cross-user data.
- Identical adapter subscriptions now share one reference-counted channel and one coalesced refresh. Final unsubscribe removes the channel.
- Safe equality filters are translated to physical Realtime columns for profiles, friendships, posts, reactions, comments, stories, messages, alerts, dares, and truths. Unsupported query shapes retain correct broad behavior instead of applying an unsafe filter.
- Auth startup/sign-in profile hydration uses `get_my_auth_profile`, combining public profile and private notification preferences in one authorized RPC. Sign-in activity touch occurs in the same RPC and is write-throttled to one minute.
- Relationship conflict acceptance/countering uses a locked, target-only state-transition RPC. Direct authenticated updates are revoked.
- Relationship and alert changes use participant/user-targeted private Broadcast topics instead of broad Postgres Changes subscriptions.
- Migration `20261066000000_auth_relationship_resource_optimization.sql` contains these database changes and was applied to the linked main project on 2026-10-13 after explicit authorization.
- Truth, dare, and messaging repositories now use dedicated relational tables and narrow RPCs rather than transitional document calls. Truth/dare lifecycle updates are row-locked and authenticated direct table updates are revoked.
- The feed HTTP contract now exposes `items`, `nextCursor`, and `hasMore` while retaining the existing `posts` field for compatibility. First page and load-more both use `get_ranked_feed_page`; invalid API responses fail explicitly instead of querying the compatibility adapter.
- Legacy realtime typing labels were renamed to `broadcast`; active source contains no deprecated database-provider runtime reference.
- `npm run audit:supabase` provides reproducible source inventory. Latest scan: 477 direct table markers, 63 RPC markers, 68 channels, 45 Postgres Changes markers, 0 compatibility reads, 0 compatibility writes, 0 compatibility subscriptions, and 0 `select("*")` markers. Old compatibility module, generic row namespace, and unreferenced fallback service are removed.
- Inbox no longer listens to the entire `messages` table. It uses authorized private `inbox:<user_id>` Broadcast trigger plus scoped membership changes, with coalesced refresh.
- Shared `scheduleRefresh` coalesces bursty Postgres-change refreshes for post comments, story reactions, challenge-room chat, and conversation games; teardown cancels pending timers.

## Measurements not yet available

Docker work was explicitly excluded, so disposable local Supabase reset, SQL concurrency tests, RLS persona tests, and `EXPLAIN (ANALYZE, BUFFERS)` runs were not executed. No reset, seed, destructive test, or load test was performed. After explicit authorization, linked and local migration history were synchronized through `20261079000000`; the final forward migration corrected the function-lint findings discovered after deployment.

Before/after request counts, rows, bytes, Realtime messages, Auth requests, Storage egress, connection use, and Edge Function usage require a disposable staging dataset and Supabase dashboard/API telemetry. Static call-site reductions must not be reported as runtime percentages.

## Remaining high-impact work

1. Complete local/staging RLS, concurrency, cursor, and query-plan tests after Docker or a disposable staging project is available.
2. Apply and verify repository-only forward migrations in a reviewed non-production project.
3. Add controlled 10/100/500/1,000-user staging load runs; never run them against production.

## Measurement procedure

1. Initialize a disposable Supabase project from the committed migrations.
2. Seed owner, friend, unrelated-user, room-participant, and admin personas with representative feed, story, chat, alert, and media volumes.
3. Capture cold and warm browser/network traces, Supabase API logs, database query plans, Realtime channels/messages, Storage requests, and cache metrics.
4. Repeat identical journeys after each feature cutover and report median/p95 values.
5. Track database size, egress, Realtime messages/connections, Auth requests, Storage egress, function invocations, and slow-query plans against the current Supabase plan limits.

## Production safety

After explicit authorization, migrations `20261067000000` through `20261079000000` were applied to the linked main project. `npx supabase migration list --linked` confirms that local and remote history match, and `npx supabase db lint --linked` reports no schema errors. No database reset, seed, production load test, Storage deletion, or billing/project-setting change was performed.

## Free-plan resource budget

Current official Supabase documentation lists these Free-plan allowances: 5 GB uncached and 5 GB cached egress, 500 MB database size per project, 50,000 monthly active users, 1 GB Storage, 500,000 Edge Function invocations, 2 million Realtime messages, and 200 peak Realtime connections. Current Realtime limits list 100 messages/second, 100 channel joins/second, 100 channels/connection, and 20 presence messages/second on Free. Usage quotas are generally organization-level while database size is shown per project; verify the live dashboard before capacity decisions because plans can change.

Sources: [Supabase billing and quotas](https://supabase.com/docs/guides/platform/billing-on-supabase), [database size](https://supabase.com/docs/guides/platform/database-size), [egress usage](https://supabase.com/docs/guides/platform/manage-your-usage/egress), and [Realtime limits](https://supabase.com/docs/guides/realtime/limits).

For Dare, the likely dominant drivers are media egress, Realtime messages/connections from chat and room screens, database egress from feed/story/message payloads, database size from compatibility documents and event history, and Auth MAU. Capacity must be estimated from measured operations per active user, average payload bytes, media sizes, simultaneous open channels, and retention—not converted into a fixed user-count promise.

Review the Dashboard usage page weekly and investigate when any resource exceeds 60% of its allowance for two consecutive checks, 80% during a single peak period, or grows materially faster than active users. Record the date, plan, database size, egress, Storage, Auth MAU, Edge Function invocations, Realtime messages, peak connections, and slow-query findings.

For repository instrumentation, set `RESOURCE_METRICS_ENABLED=true` only in development/staging when measurements are needed. Leave it unset in production unless a deliberately sampled investigation is running.
