# DARE database-read optimization results

Updated: 2026-10-13

## Scope and evidence rules

This report records only checks and source measurements actually run against the
current workspace. Static source markers are not runtime request counts. No
hosted before/after percentage is claimed without comparable staging telemetry.

## Current source inventory

Command:

```powershell
npm run audit:supabase
```

Latest scan:

| Marker | Count | Meaning |
| --- | ---: | --- |
| `.from()` | 461 | Static Supabase table-operation markers |
| RPC calls | 73 | Static RPC markers |
| Auth calls | 27 | Static Auth-operation markers |
| Storage calls | 4 | Static Storage-operation markers |
| Realtime channels | 68 | Static channel-construction markers |
| Postgres Changes | 45 | Static Postgres Changes markers |
| Compatibility reads | 0 | No active compatibility-helper markers detected |
| Compatibility writes | 0 | No active compatibility-helper markers detected |
| Compatibility subscriptions | 0 | No active compatibility-helper markers detected |
| `select("*")` | 0 | No broad-star selectors detected |
| Interval markers | 41 | Includes UI timers; not all are database polling |

Scanned files: 333. Latest scan: `2026-10-13T14:00:28.099Z`.

These values are code markers, not database requests, SQL statements, rows,
bytes, latency, or Realtime messages.

## Checks run

| Check | Result |
| --- | --- |
| `npm run type-check` | Passed |
| `npm test -- --runInBand` | Passed: 11 suites, 32 tests |
| `npm run audit:supabase` | Passed; inventory generated |
| Production build | Passed: Next.js 16.2.4, 29 static pages/routes compiled |
| Targeted ESLint for changed optimization files | Passed: 0 errors; warnings remain in legacy/source files |
| Full ESLint | Fails on pre-existing/generated-worktree scope: 233 errors, 3244 warnings |
| `npx supabase db lint --linked` | Passed: no errors in linked schema |
| `npx supabase migration list --linked` | Previously observed remote history stopped at `20261066000000`; current rerun could not authenticate (`cli_login_postgres` password failure) |
| Full Supabase runtime measurement | Not available in this workspace |
| `EXPLAIN (ANALYZE, BUFFERS)` | Not run |
| Disposable migration reset | Not run; Docker/Podman unavailable |
| Multi-user RLS test | Not run against staged database |
| Concurrency/load test | Not run against staged database |

## Confirmed source-level reductions

- Birthday-drop comment creation no longer performs a full `COUNT(*)` read after
  every insert. It uses `increment_birthday_drop_reply_count` and returns the
  updated counter.
- Story feed repository path uses bounded `get_friend_stories` RPC instead of
  separate friendship, story, view, and profile reads.
- Story service reuses author projections returned by the story feed path.
- Story audience viewer loading now uses an opaque cursor, bounded pages, and a
  UI load-more path; duplicate view loading from `getStoryById` was removed.
- Story-list view counts now use a grouped RPC, avoiding transfer of every view
  row to the client.
- Birthday drops, community challenge summaries/joins, conversation-game
  snapshots, and impersonation message/session/prompt listeners coalesce burst
  Realtime events into bounded refreshes and cancel pending work on unsubscribe.
- Community-challenge joins now use one row-locked `join_community_challenge`
  RPC instead of read → delete/upsert sequencing.
- Birthday reactions now use one idempotent atomic RPC instead of insert → full
  count → parent update.
- Dare-comment Realtime refreshes coalesce bursts before bounded reload.
- Challenge-room native-row listeners now coalesce bursts; per-user vote/like
  listeners are bounded by the number of requested IDs (unique-key bounded).
- Challenge-room screen leaderboards/proofs, birthday snapshots, dare
  interaction listeners, and user-post listeners now coalesce Realtime bursts
  and cancel pending work on unsubscribe.
- Aura INSERT events and story-preview changes now reconcile directly from
  Realtime payloads; profile header counts use one RPC with upgrade-safe fallback.
- Friendship, dare-comment, and post-comment list reads now use bounded page
  windows; explicit page APIs expose `hasMore`, while legacy callers drain pages
  without one unbounded request.
- Dare interaction and truth vote totals use grouped RPCs with compatibility
  fallbacks; story view-count fallback is also bounded/page-drained.
- Current source scan detects no active generic compatibility helper markers.
- Broad `select("*")` usage is absent from the scanned source.
- Next.js private-data cache behavior is documented: authenticated app data is
  no-store at the browser boundary; scoped application caches own any reuse.

## Runtime measurements still required

Use a disposable Supabase project seeded with owner, friend, unrelated-user,
room-participant, and admin personas. Capture cold and warm runs for startup,
feed, profile, post/comments, reactions, friendships, stories, chat, alerts,
birthday/challenge features, truth/dare/proof/verdict/prediction workflows,
media, navigation, tab switching, reconnect, and refresh.

Record separately:

- Browser/API request count.
- Supabase REST/RPC request count.
- SQL statements and query duration.
- Rows and response bytes.
- Realtime joins, active channels, and messages.
- Cache hit/miss behavior.
- Errors, authorization results, ordering, and pagination correctness.

Repeat identical scenarios before and after each cutover. Report median and p95
only from comparable runs.

## Remaining hotspots

1. Static Realtime markers remain high. Each channel needs runtime lifecycle,
   hidden-tab, reconnect, authorization, and duplicate-listener validation.
2. Static `.from()` count remains high. Marker count alone does not identify
   unnecessary work; representative query traces and plans are required.
3. Several feature areas have new relational migrations but lack staged RLS,
   concurrency, and load validation.
4. UI interval markers require classification to prove none trigger avoidable
   database polling.
5. Newly added local migrations require explicit deployment authorization,
   staged application, and validation before runtime claims are made.

## Scale-safety requirements

- Keep every feed/list/message query bounded.
- Use composite indexes matching filter plus order columns.
- Use opaque stable cursors for pagination.
- Batch profile/author enrichment.
- Use atomic RPCs for counters and state transitions.
- Scope Realtime channels by user, conversation, room, or entity.
- Keep cache keys identity- and authorization-scoped.
- Never convert missing telemetry into claimed percentage savings.
