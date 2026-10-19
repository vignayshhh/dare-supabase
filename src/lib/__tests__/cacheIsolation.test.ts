import { buildScopedFeedCacheKey } from "@/middleware/services/feed.service.optimized";

describe("private feed cache keys", () => {
  it("separates identical requests for different users", () => {
    expect(buildScopedFeedCacheKey("feed", "user-a", 20)).not.toBe(
      buildScopedFeedCacheKey("feed", "user-b", 20),
    );
  });

  it("separates feed and profile-post scopes", () => {
    expect(buildScopedFeedCacheKey("feed", "user-a", 20)).not.toBe(
      buildScopedFeedCacheKey("user-posts", "user-a", 20),
    );
  });
});
