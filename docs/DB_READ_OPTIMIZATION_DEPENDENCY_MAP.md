# DARE database-access dependency map

This map describes current active boundaries. It is intentionally logical, so
it remains useful when screens or service filenames change.

## Request flow

```text
Next.js screen/component
  -> Zustand store or middleware service
  -> API route / repository / Supabase client
  -> typed table query or authorized RPC
  -> PostgreSQL table, index, function, trigger, or Realtime channel
```

## Main feature paths

| Feature | UI/store | Service/API boundary | Primary DB boundary | Realtime |
| --- | --- | --- | --- | --- |
| Feed | `FeedScreen`, `useFeedStore` | feed service, `/api/posts/feed` | ranked feed RPC/tables, profiles, reactions/comments | scoped feed events where enabled |
| Stories | `FeedScreen`, `useStoryStore` | story service, `/api/stories/friends` | `get_friend_stories`, stories, story views/reactions | story-scoped channel |
| Profiles | profile screens/stores | user service, profile API | profiles, friendship/profile-context RPCs | user/relationship topics |
| Friendships | friends screens/stores | friendship/relationship services, friends API | friendships/relationships RPCs | participant-targeted topics |
| Chat | `MessagingScreen`, `useMessagingStore` | messaging service/repository | conversations, members, messages, receipts, inbox RPCs | conversation/inbox/typing topics |
| Alerts | `AlertsScreen`, `useAlertStore` | alert service, alert API | bounded alert-page RPC and alerts table | user-scoped alert topic |
| Dares/truths | dare/truth stores and screens | repositories, API routes | typed tables and transition RPCs | feature-scoped channels |
| Birthday | birthday screens/services | birthday APIs/services | birthday room/drop/comment tables | room-scoped channels |
| Challenges | challenge screens/services | challenge APIs/services | challenge relational tables/RPCs | room/challenge channels |
| Verdicts/drama | verdict/drama stores/services | verdict/drama APIs | typed records, vote/comment RPCs | feature-scoped channels |
| Aura | Aura components/store | Aura API/service | aura event tables/RPCs | user-scoped updates |
| Media | upload utilities/services | media API/storage | Supabase Storage metadata and signed URLs | none required for upload |

## Shared infrastructure

- Supabase clients: `src/lib/supabase/client.ts`, `server.ts`, `admin.ts`.
- API security boundary: `src/app/api/_lib/withSecurity.ts`.
- Cache/instrumentation: `src/lib/observability/`, `src/app/api/_lib/cacheMetrics.ts`,
  and cache managers under `src/middleware/cache/`.
- Pagination: `src/app/api/_lib/pageCursor.ts` and feature-specific RPC cursors.
- Schema and authorization: `supabase/migrations/`.
- Source inventory: `scripts/audit-supabase-usage.mjs`.

## Scale review checklist

Every new path must identify:

1. Owner identity and authorization source.
2. Bounded row limit and stable ordering.
3. Required columns only.
4. Index supporting filter/order shape.
5. Cache key scope and invalidation event.
6. Realtime channel scope and cleanup owner.
7. Mutation atomicity and authoritative response.
8. Runtime measurement plan.
