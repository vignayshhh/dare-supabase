# DARE DB-read optimization: modified-file inventory

Updated: 2026-10-13

This is the optimization-pass inventory only. The worktree already contained
large unrelated/user changes; this list is not a complete `git diff` claim.

## Source

- `src/backend/repositories/StoryRepository.ts` — bounded friend-story RPC and projected author/view fields.
- `src/middleware/services/story.service.ts` — reuse author projections.
- `src/middleware/services/story.service.ts` — bounded opaque-cursor story-audience viewer pages and removal of duplicate view read.
- `src/middleware/services/story-reaction.service.ts` — stable reaction cursor pages.
- `src/components/app/StoryViewer.tsx` — viewer-page “Load more” flow.
- `src/middleware/services/birthday-room.service.ts` — coalesced drop refreshes.
- `src/middleware/services/community-challenge.service.ts` — coalesced listeners and atomic join RPC.
- `src/middleware/services/impersonation.service.ts` — coalesced session/message/prompt refreshes.
- `src/middleware/services/dare-interactions.service.ts` — coalesced comment refreshes.
- `src/middleware/services/feed.service.optimized.ts` — coalesced user-post refreshes.
- `src/components/screens/ChallengeRoomScreen.tsx` — coalesced leaderboard/proof refreshes.
- `src/middleware/services/challenge-room.service.ts` — atomic comment-like toggle call; bounded proof reads already present.
- `src/middleware/services/challenge-room.service.ts` — coalesced native-row listeners and exact per-user bounds.
- `src/app/api/birthday/drops/[dropId]/comment/route.ts` — counter RPC instead of count read.
- `src/app/api/birthday/drops/[dropId]/react/route.ts` — atomic reaction RPC.
- `src/lib/realtime/scheduleRefresh.ts` — burst scheduler integration.
- `src/middleware/services/__tests__/auth-v2.service.test.ts` — Jest-safe mock naming.
- `src/stores/__tests__/stores.test.js` — test Supabase environment setup.
- `src/lib/__tests__/scheduleRefresh.test.ts` — scheduler coalescing/cancellation coverage.
- `src/lib/__tests__/storyPagination.test.ts` — cursor round-trip/malformed-cursor coverage.
- `src/lib/__tests__/cacheIsolation.test.ts` — private feed cache-key isolation coverage.
- `jest.config.js` — routes Playwright QA specs to `qa:e2e`, keeps Jest deterministic.

## Database

- `supabase/migrations/20261076000000_atomic_birthday_drop_reply_count.sql`
- `supabase/migrations/20261077000000_atomic_community_challenge_join.sql`
- `supabase/migrations/20261081000000_story_view_count_rpc.sql`
- `supabase/migrations/20261082000000_dare_interaction_counts_rpc.sql`
- `supabase/migrations/20261083000000_truth_vote_counts_rpc.sql`
- `supabase/migrations/20261080000000_profile_content_counts_rpc.sql`

## Documentation

- `docs/DB_READ_OPTIMIZATION_RESULTS.md`
- `docs/DB_READ_OPTIMIZATION_DEPENDENCY_MAP.md`
- `docs/DB_READ_OPTIMIZATION_REMOVED_READS.md`
- `docs/DB_READ_OPTIMIZATION_HOTSPOTS.md`
- `docs/DB_READ_OPTIMIZATION_CACHE_POLICY.md`
- `docs/DB_READ_OPTIMIZATION_REALTIME_POLICY.md`
- `docs/DB_READ_OPTIMIZATION_SQL_POLICY.md`
- `docs/DB_READ_OPTIMIZATION_MEASUREMENT_PROCEDURE.md`
- `docs/DB_READ_OPTIMIZATION_NEXT_CACHE.md`

## Additional source touched in this pass

- `src/middleware/services/comment.service.ts` — bounded post-comment page contract.
- `src/backend/repositories/FriendshipRepository.ts` — bounded, stably ordered friendship page draining.
- `src/backend/repositories/TruthRepository.ts` — grouped truth-vote totals with compatibility fallback.
- `src/components/aura/AuraSystem.tsx` — payload-local Aura event reconciliation.
- `src/components/screens/MessagingScreen.tsx` — payload-local story-preview reconciliation.
- `src/components/screens/ProfileScreen.tsx` — grouped profile-content counts with fallback.

