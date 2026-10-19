# DARE cache policy and isolation

Updated: 2026-10-13

## Rules

- Personalized keys include the authenticated user ID, resource scope, and
  relevant feed/version token.
- Public immutable media may use CDN/browser caching; private media uses
  short-lived signed URLs.
- A cache value is never authorization evidence. RLS/auth checks still run on
  the authoritative path.
- Mutations invalidate only affected identity/resource keys after the database
  write commits.
- Cross-user cache reuse is forbidden for profiles, messages, alerts,
  audiences, drafts, presence, and moderation data.
- Client/Zustand caches are session-local; server `cache_entries` is
  identity-scoped and must not contain private data under a public key.

## Verification checklist

- Key includes user identity where output differs by user.
- Cache hit and miss return equivalent authorization/order/pagination shape.
- Mutation invalidates affected key(s), not the whole cache namespace.
- Logout/user-switch clears or namespaces client state.
- Tests cover two users requesting the same resource and receiving isolated
  results.

Current evidence is source inspection and unit tests. Live hit-rate and
cross-user staging tests remain pending.

