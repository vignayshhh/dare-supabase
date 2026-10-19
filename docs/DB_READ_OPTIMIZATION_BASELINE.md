# Database read optimization baseline

Historical baseline. Current authoritative verification and remaining work are
in `DB_READ_OPTIMIZATION_RESULTS.md` and `DB_READ_OPTIMIZATION_HOTSPOTS.md`.

Captured: 2026-10-11

## Scope and measurement limits

This baseline was captured before the read-minimization changes in this project. The repository is connected to a hosted Supabase project, but this workstation does not have a disposable multi-user dataset or database-level query telemetry configured. Consequently, this document reports reproducible source-level counts and observed request behavior; it does not invent SQL-statement, row, byte, latency, or cache-hit totals for complete user journeys.

Database requests, HTTP requests, and Realtime messages are tracked separately. A compatibility-adapter `getDocs` call normally maps to one PostgREST request, while a Realtime listener performs an initial read and then receives channel messages. Server routes can execute several database requests behind one HTTP request.

## Reproducible static baseline

The following command family was run over active `src/` files while excluding tests, backups, and documentation:

```powershell
rg -n --glob '!**/*.test.*' --glob '!**/__tests__/**' --glob '!**/*.backup' '<pattern>' src
```

| Operation marker | Matches | Files |
| --- | ---: | ---: |
| `getDoc(` | 104 | 39 |
| `getDocs(` | 138 | 39 |
| `onSnapshot(` | 64 | 27 |
| `onValue(` | 19 | 3 |
| `.select(` | 12 | 8 |
| `fetch(` | 6 | 5 |
| `setInterval(` | 48 | 26 |

These are call-site counts, not runtime request totals. The active provider-compatible document API means most reads appear as `getDoc`, `getDocs`, and `onSnapshot`; native Supabase reads appear as `.select()`.

Highest-density database consumers at baseline:

| File | Read/listener markers |
| --- | ---: |
| `src/middleware/services/messaging.service.ts` | 33 |
| `src/middleware/services/feed.service.ts` | 20 |
| `src/middleware/services/dare-interactions.service.ts` | 18 |
| `src/backend/repositories/MessagingRepository.ts` | 13 |
| `src/backend/repositories/DareRepository.ts` | 12 |
| `src/middleware/services/challenge-room.service.ts` | 11 |
| `src/middleware/services/friends.service.ts` | 11 |
| `src/middleware/services/chat-invite.service.ts` | 10 |

## Confirmed baseline hotspots

- Messaging attached two equivalent Supabase Broadcast listeners for several presence, draft, typing, freeze, mood, and chat-switch paths. Each pair caused duplicate initial reads and duplicate channel events.
- The friends-stories API made two friendship reads, then one story query per friend, followed by chunked story-view and story-stat reads. The story query count therefore grew linearly with friend count.
- The generic listener layer re-ran bounded native-table response queries after matching Postgres changes. `data_documents` is now retired; no runtime listener targets that table.
- Multiple profile, friendship, and feed services coexist. Some screens use API feed snapshots while others still call provider-compatible repositories directly, increasing the risk of duplicated reads on mount.
- The server cache is stored in Supabase (`cache_entries`). A cache lookup therefore still consumes a database request even when it avoids more expensive feed/profile work.
- TanStack Query is not installed. Client server-state reuse is currently implemented with Zustand stores and custom caches.

## Journey baseline status

| Journey | What can be established now | Missing live measurement |
| --- | --- | --- |
| Startup/session restoration | Source trace and browser/server logs available | Auth service request count and SQL telemetry |
| Home feed | API route emits cache-hit, fallback, latency, and payload metrics | Controlled warm/cold runs with representative rows |
| Profile/post/comments | Source trace available | Authenticated browser scenario counters |
| Like/friend mutation | Source trace available | Concurrent mutation and SQL statement totals |
| Stories | Exact query-shape analysis available | Representative friend/story cardinalities |
| Chat/messages/receipts | Listener topology and source trace available | Multi-user Realtime event counts and delivery timing |
| Notifications/rooms/challenges | Source trace available | Seeded multi-user journey measurements |
| Media upload | Request path trace available | Storage egress and signed-URL measurements |

## Reproduction procedure for measured journey totals

1. Use a disposable Supabase staging project initialized from `supabase/migrations`.
2. Seed distinct owner, friend, unrelated-user, and admin accounts with representative content volumes.
3. Clear browser state and server cache entries before cold-cache runs; preserve them for warm-cache runs.
4. Record browser network requests, route cache metrics, Supabase API logs, database query statistics, and active Realtime channels.
5. Execute every journey once cold and at least three times warm. Record medians and p95 only from comparable runs.
6. Repeat after optimization using the same project snapshot and scenario order.

No percentage reduction is claimed in this baseline because comparable before/after live measurements are not yet available.

## Implementation verification update

Updated after the current optimization pass:

- Current source audit finds no active `relationalStore` import or CRUD adapter call. Dead commented legacy snippets in messaging are pending cleanup; they do not execute.
- Feed, comments, moderation, profiles, stories, dare interactions, conversation games, community challenges, challenge-room chat/proofs, birthday drops/snapshots, daily matches, impersonation, messaging, presence, typing, and drafts now use native Supabase tables/RPCs/Realtime for active paths.
- Verification: `npm run type-check` passed. Full Jest/build passed. Full ESLint exits 0 with 435 warnings; warning-free lint is not complete.
- Hosted migrations were not pushed. The new forward migrations require application to a reviewed staging/local database before deployment.

- Adapter removal: deleted `src/lib/supabase/relationalStore.ts` and its adapter unit suite after moving remaining type-only users to `src/types/realtime.ts` or local domain types.

- `npm run type-check`: passed.
- `npm test -- --runInBand`: passed, 7 suites and 29 tests.
- Targeted ESLint for changed optimization files: passed.
- `npm run build`: passed.
- `npx supabase db push --linked`: passed through migration `20261059000000`.
- `npx supabase db lint --linked`: clean after migration `20261059000000`.
- Full-repository ESLint remains blocked by 110 pre-existing errors in unrelated/generated files; it was not changed as part of this read optimization pass.

Implemented architectural reductions include batched story/profile/cache reads, scoped feed cursor state, authoritative cached-like preservation, bounded profile search, atomic cache operations, database-free ephemeral chat/birthday state, and friend-authorized per-user Presence topics.

Local migration reset, RPC concurrency tests, RLS persona tests, and `EXPLAIN (ANALYZE, BUFFERS)` validation remain pending because Docker Desktop/Podman is unavailable on the workstation. Linked migrations were applied to the configured Supabase project; no reset, seed, or production load test was performed.

## 2026-10-11 continuation

Measured locally in this pass:

- Full Jest suite: 7 suites and 29 tests passed.
- TypeScript (`tsc --noEmit`): passed after all changes.
- Production Next.js build: passed, including all 29 static pages and route compilation.
- Focused ESLint for every changed service/repository: passed.
- Linked database lint: no schema errors in the currently deployed schema.
- Local migration reset remains unavailable because Docker Desktop/Podman is not installed.

Architectural changes in this pass (not presented as hosted telemetry):

- Removed the five-minute client story-cleanup database write loop. Expiry is enforced by the story read policy/query.
- Removed the 60-second drama feed polling loop; the existing stale-cache refresh now runs only on focus/visibility restoration.
- Replaced Can't Sleep participant heartbeat writes with private Realtime Presence.
- Replaced compatibility-backed Can't Sleep rooms/messages with typed tables, bounded message loading, an authenticated message RPC, and event-payload reconciliation.
- Replaced profile/avatar compatibility reads with direct typed profile/friendship queries, one-query batch avatar refresh, and reference-counted profile subscriptions.
- Moved stickman status/customization into constrained profile columns and removed its durable compatibility-presence records.
- Replaced compatibility profile search with a bounded indexed SQL function.
- Replaced friend-request alert fallback and cancellation scans with a direct insert and narrow authenticated cleanup RPC.

Migrations `20261060000000` through `20261062000000` were applied directly to the linked Supabase project on 2026-10-12. Migration parity and `supabase db lint --linked` both passed afterward. TypeScript, all 29 Jest tests, and the production build also passed against the updated repository state.

## 2026-10-13 continuation

- Native cutover completed for challenge-room proofs/votes/comments/likes, impersonation sessions/secrets/messages/prompts, feed subscriptions, conversation inbox/events, messaging sends, presence, typing, and draft state.
- Added forward-only migrations `20261074000000_challenge_room_interactions.sql` and `20261075000000_impersonation_relational_cutover.sql`. These are not pushed to hosted Supabase.
- Deleted active `supabaseData` compatibility exports and removed their remaining imports. `relationalStore` remains only for transitional type definitions/tests and legacy commented code; no active feature data path imports its CRUD adapter.
- Verification: `npm run type-check` passed; `npm test -- --runInBand` passed (9 suites, 39 tests); `npm run build` passed.
- Full ESLint exits 0 with 444 warnings and 0 errors. Warning-free lint is still incomplete; warnings include pre-existing React compiler, unused-symbol, and image optimization diagnostics.
- Hosted migration push, staging load tests, RLS persona tests, concurrency tests, and query-plan measurements remain pending. No hosted migration push or reset performed.
