# DARE SQL, index, and RPC policy

Updated: 2026-10-13

## Query contract

- Select minimum columns; broad `select("*")` is prohibited in active source.
- Every feed/list/message query has an explicit bound or cursor contract.
- Cursor ordering is stable: primary timestamp plus unique ID tie-breaker.
- Composite indexes match equality filters followed by ordering columns.
- State transitions, counters, and toggle mutations use transactional RPCs
  when separate reads would race.
- RPCs validate `auth.uid()`, keep `search_path` constrained, and grant only
  required roles.

## Validation

`npx supabase db lint --linked` currently passes for the linked schema. Local
migrations after the linked history still require disposable/staging apply and
RLS/concurrency validation. `EXPLAIN (ANALYZE, BUFFERS)` requires representative
staging data and has not been run. No production-destructive migration action
was taken.

