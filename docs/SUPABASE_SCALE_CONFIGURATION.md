# Supabase scale configuration

Dare uses the Supabase HTTP API from Next.js, so normal application reads and
writes already go through Supabase's managed pool. Do not introduce direct
Postgres connections per request. If a worker is later added that uses a
Postgres driver, configure it with the Supavisor transaction-pooler connection
string from the Supabase dashboard and keep its pool small.

## Caching

`cache_entries` is shared, server-only cache state. Client/Zustand caches are
session-local. Cache keys for personalized content must include the user ID and
feed version. Cache values are never authoritative; mutation paths invalidate
them after the committed database write.

Use CDN caching only for public immutable Storage objects. Private media must
continue to use short-lived signed URLs.

## Realtime

Messages, alerts, receipts, and views are durable Postgres data. Typing and
online status use private Presence/Broadcast channels. New screens must share a
screen-scoped channel and unsubscribe when their final consumer unmounts.

## Read replicas

Do not configure a replica before measured primary saturation. If one is added,
route only stale-tolerant GET endpoints there; writes, authorization checks, and
read-after-write flows remain on the primary.

## Required operational checks

- Watch database connections, slow queries, index usage, Realtime connections,
  Storage egress, and cache-table size in Supabase.
- Run `EXPLAIN (ANALYZE, BUFFERS)` before adding expression or GIN indexes.
- Do not add indexes for every JSONB key; move hot filter/sort fields into typed
  columns instead.
