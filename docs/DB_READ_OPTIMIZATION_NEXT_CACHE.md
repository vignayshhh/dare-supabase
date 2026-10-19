# DARE Next.js data-fetching/cache contract

Updated: 2026-10-13

- Authenticated app layout sends `Cache-Control: no-cache, no-store,
  must-revalidate`; private UI data is not browser/CDN cached.
- API handlers use explicit Supabase reads/RPCs and application cache helpers;
  they do not rely on implicit public Next.js fetch caching for personalized
  responses.
- `FeedCacheManager` provides stale-while-revalidate only for identity/scoped
  cache keys and deduplicates in-flight refreshes.
- Cache metrics are observational; they do not change authorization or make a
  stale value authoritative.
- Public immutable media is the only intended CDN-cache candidate.

Verification is source-level. Browser cache headers, warm/cold route traces,
and cross-user cache isolation still require staged runtime tests.

