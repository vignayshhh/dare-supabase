import { guardCircleResult } from "./guardCircleResult";
import { getActiveCircleId } from "@/lib/circleContext";
import { CircleRepository } from "@/backend/repositories/CircleRepository";
﻿/**
 * Optimized Feed Service with Intelligent Caching
 *
 * This wraps the existing feed.service.ts with caching and batching layers
 * to dramatically reduce Supabase reads while maintaining real-time updates.
 */

import {
  feedService,
  POST_SELECT_FIELDS,
  PostWithAuthor,
} from "./feed.service";
import { feedCache, userPostsCache } from "../cache/FeedCacheManager";
import { batchQueryOptimizer } from "../cache/BatchQueryOptimizer";
import { redisCache } from "@/services/clientSocialCache";
import { visibilitySubscriptionManager } from "@/utils/visibilitySubscriptionManager";
import type { Unsubscribe } from "@/types/realtime";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { scheduleRefresh } from "@/lib/realtime/scheduleRefresh";

interface EngagementData {
  likesCount: number;
  commentsCount: number;
  isLikedByUser: boolean;
}

export const buildScopedFeedCacheKey = (
  scope: "feed" | "user-posts",
  userId: string,
  limit: number,
) => `${scope}:${userId}:${limit}`;

class OptimizedFeedService {
  private get client() {
    return getSupabaseBrowserClient();
  }
  private readonly fallbackTimestamp = "1970-01-01T00:00:00.000Z";
  private readonly friendIdsTtlMs = 5 * 60 * 1000;
  private readonly authorDetailsTtlMs = 15 * 60 * 1000;
  private readonly engagementTtlMs = 5 * 60 * 1000;
  private readonly localUserLikesTtlMs = 30 * 24 * 60 * 60 * 1000;
  // Enable visibility-based subscription unloading to reduce Supabase reads for inactive tabs
  private readonly enableVisibilityUnloading = true; // Set to true to enable
  private userLikedPostIds = new Map<
    string,
    { ids: Set<string>; expiresAt: number }
  >();
  private readonly userLikesTtlMs = 15 * 60 * 1000;
  private friendIdsCache = new Map<
    string,
    { ids: string[]; expiresAt: number; inFlight?: Promise<string[]> }
  >();
  private authorDetailsCache = new Map<
    string,
    { data: PostWithAuthor["author"]; expiresAt: number }
  >();
  private engagementCache = new Map<
    string,
    {
      likesCount: number;
      commentsCount: number;
      isLikedByUser: boolean;
      expiresAt: number;
    }
  >();

  // Cache the auth-ready promise so concurrent callers share one waiter.
  private authReadyPromise: Promise<boolean> | null = null;

  /**
   * Wait until Supabase Auth has restored the current user on the client.
   *
   * After a page refresh our Zustand auth store rehydrates `user` synchronously
   * from localStorage, so `currentUser.userId` flips to a real uid almost
   * immediately and `subscribeToFeed(uid)` is dispatched right away. The
   * Supabase Auth SDK, however, only restores `auth.currentUser` async via
   * `onAuthStateChanged`. Any Postgres read whose security rule requires
   * `isSignedIn()` (e.g. `post_likes`) that runs in this window fails with
   * Permission failures surface as thrown Supabase query errors,
   * The realtime bridge retries. This helper bridges the gap so one-shot
   * reads can wait for auth instead of racing it.
   */
  private waitForAuthReady(timeoutMs = 5000): Promise<boolean> {
    if (this.authReadyPromise) return this.authReadyPromise;

    this.authReadyPromise = (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const session = await supabase.auth.getSession();
        if (session.data.session?.user) return true;
        return await new Promise<boolean>((resolve) => {
          let settled = false;
          const finish = (ok: boolean) => {
            if (settled) return;
            settled = true;
            try {
              unsub();
            } catch {}
            clearTimeout(timer);
            // Allow re-evaluation later if auth is still not ready, so a
            // future call can wait again rather than instantly returning false.
            if (!ok) this.authReadyPromise = null;
            resolve(ok);
          };
          const timer = setTimeout(() => finish(false), timeoutMs);
          const { data: authState } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) finish(true);
          });
          const unsub = () => authState.subscription.unsubscribe();
        });
      } catch (error) {
        console.error("âŒ [waitForAuthReady] failed:", error);
        this.authReadyPromise = null;
        return false;
      }
    })();

    return this.authReadyPromise;
  }

  private getLocalUserLikesKey(userId: string): string {
    return `dare:user-liked-posts:${userId}`;
  }

  private async fetchFeedFromApi(
    userId: string,
    limitCount: number,
    forceRefresh = false,
    cursor?: string | null,
  ): Promise<{ posts: PostWithAuthor[]; nextCursor: string | null; hasMore: boolean } | null> {
    if (typeof window === "undefined") return null;

    try {
      const { data: currentUser } = await getSupabaseBrowserClient().auth.getUser();
      if (currentUser.user?.id && currentUser.user.id !== userId) {
        return null;
      }

      const { apiFetch } = await import("@/lib/apiClient");
      const params = new URLSearchParams({ limit: String(limitCount) });
      if (forceRefresh) params.set("refresh", "1");
      if (cursor) params.set("cursor", cursor);

      const response = await apiFetch<{
        ok: boolean;
        items?: PostWithAuthor[];
        nextCursor?: string | null;
        hasMore?: boolean;
      }>(`/api/posts/feed?${params.toString()}`);

      if (!Array.isArray(response.items)) return null;
      return {
        posts: response.items,
        nextCursor: typeof response.nextCursor === "string" ? response.nextCursor : null,
        hasMore: response.hasMore === true,
      };
    } catch (error) {
      console.warn(
        "[Optimized] Redis-backed feed API unavailable, falling back to Postgres:",
        error,
      );
      return null;
    }
  }

  private readLocalUserLikes(userId: string): Set<string> | null {
    if (typeof window === "undefined") return null;

    try {
      const raw = window.localStorage.getItem(
        this.getLocalUserLikesKey(userId),
      );
      if (!raw) return null;

      const parsed = JSON.parse(raw) as {
        ids?: unknown;
        updatedAt?: unknown;
      };
      if (!Array.isArray(parsed.ids) || typeof parsed.updatedAt !== "number") {
        return null;
      }
      if (Date.now() - parsed.updatedAt > this.localUserLikesTtlMs) {
        window.localStorage.removeItem(this.getLocalUserLikesKey(userId));
        return null;
      }

      return new Set(
        parsed.ids.filter((id): id is string => typeof id === "string"),
      );
    } catch {
      return null;
    }
  }

  private writeLocalUserLikes(userId: string, ids: Set<string>): void {
    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(
        this.getLocalUserLikesKey(userId),
        JSON.stringify({
          ids: Array.from(ids).slice(0, 500),
          updatedAt: Date.now(),
        }),
      );
    } catch {
      // Local storage may be unavailable/private; server hydration still works.
    }
  }

  private cacheUserLikes(
    userId: string,
    ids: Set<string>,
    ttlMs = this.userLikesTtlMs,
  ): void {
    this.userLikedPostIds.set(userId, {
      ids,
      expiresAt: Date.now() + ttlMs,
    });
    this.writeLocalUserLikes(userId, ids);
  }

  getCachedLikedPostIds(userId: string): Set<string> {
    const cached = this.userLikedPostIds.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return new Set(cached.ids);
    }

    return this.readLocalUserLikes(userId) ?? new Set<string>();
  }

  private async preloadUserLikes(userId: string): Promise<Set<string>> {
    const now = Date.now();
    const cached = this.userLikedPostIds.get(userId);
    if (cached && cached.expiresAt > now) {
      return cached.ids;
    }

    const localLikes = this.readLocalUserLikes(userId);
    if (localLikes) {
      this.cacheUserLikes(userId, localLikes);
      return localLikes;
    }

    const cacheKey = `likes:${userId}`;
    const cachedLikes = await redisCache
      .get<string[]>(cacheKey)
      .catch(() => null);
    if (cachedLikes) {
      const ids = new Set(cachedLikes);
      this.cacheUserLikes(userId, ids);
      return ids;
    }

    return new Set<string>();
  }

  // Called by optimistic like/unlike to keep preloaded cache in sync
  updateLikeCache(userId: string, postId: string, liked: boolean): void {
    const cached = this.userLikedPostIds.get(userId);
    const ids = new Set(cached?.ids ?? this.readLocalUserLikes(userId) ?? []);

    if (liked) {
      ids.add(postId);
    } else {
      ids.delete(postId);
    }

    this.cacheUserLikes(userId, ids);
  }

  private async rehydrateCachedFeedLikes<
    T extends {
      id: string;
      is_liked_by_user?: boolean;
      likes_count?: number;
      comments_count?: number;
    },
  >(posts: T[], userId: string): Promise<T[]> {
    if (posts.length === 0) return posts;

    if (posts.every((post) => typeof post.is_liked_by_user === "boolean")) {
      return posts;
    }
    const likedPostIds = await this.preloadUserLikes(userId);
    return posts.map((post) => ({
      ...post,
      is_liked_by_user:
        typeof post.is_liked_by_user === "boolean"
          ? post.is_liked_by_user
          : likedPostIds.has(post.id),
      likes_count: typeof post.likes_count === "number" ? post.likes_count : 0,
      comments_count:
        typeof post.comments_count === "number" ? post.comments_count : 0,
    }));
  }

  private normalizeTimestamp(value: any): string {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (typeof value?.toDate === "function") {
      return value.toDate().toISOString();
    }
    if (
      typeof value === "object" &&
      typeof value.seconds === "number" &&
      typeof value.nanoseconds === "number"
    ) {
      return new Date(
        value.seconds * 1000 + value.nanoseconds / 1_000_000,
      ).toISOString();
    }
    return "";
  }

  private async getFeedAuthorIds(userId: string): Promise<string[]> {
    const circleId=getActiveCircleId();
    if(circleId) return new CircleRepository().memberIds(circleId);
    const now = Date.now();
    const cached = this.friendIdsCache.get(userId);

    if (cached && cached.expiresAt > now && !cached.inFlight) {
      return cached.ids;
    }

    if (cached?.inFlight) {
      return cached.inFlight;
    }

    const inFlight = (async () => {
      const { friendsService } = await import("./service-factory");
      const friendsResponse = await friendsService.getFriends(userId);
      const friendIds = (friendsResponse.friends || [])
        .map((f: any) => f.user_id || f.userId || f.id)
        .filter(Boolean);

      const ids = [...new Set([userId, ...friendIds])];
      this.friendIdsCache.set(userId, {
        ids,
        expiresAt: Date.now() + this.friendIdsTtlMs,
      });
      return ids;
    })();

    this.friendIdsCache.set(userId, {
      ids: cached?.ids || [userId],
      expiresAt: now + this.friendIdsTtlMs,
      inFlight,
    });

    try {
      return await inFlight;
    } catch (error) {
      this.friendIdsCache.delete(userId);
      throw error;
    }
  }

  private getAuthorCache(authorId: string): PostWithAuthor["author"] | null {
    const cached = this.authorDetailsCache.get(authorId);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.authorDetailsCache.delete(authorId);
      return null;
    }
    return cached.data;
  }

  private getEngagementCache(
    postId: string,
    userId: string,
  ): EngagementData | null {
    const cached = this.engagementCache.get(`${postId}:${userId}`);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.engagementCache.delete(`${postId}:${userId}`);
      return null;
    }
    return cached;
  }

  private isEngagementData(value: unknown): value is EngagementData {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<EngagementData>;
    return (
      typeof candidate.likesCount === "number" &&
      typeof candidate.commentsCount === "number" &&
      typeof candidate.isLikedByUser === "boolean"
    );
  }

  private setEngagementCache(
    postId: string,
    userId: string,
    data: EngagementData,
    ttlMs = this.engagementTtlMs,
  ): void {
    this.engagementCache.set(`${postId}:${userId}`, {
      ...data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  private async hydrateEngagementFromRedis(
    postIds: string[],
    userId: string,
  ): Promise<void> {
    await Promise.all(
      postIds.map(async (postId) => {
        if (this.getEngagementCache(postId, userId)) return;
        const cached = await redisCache.get<EngagementData>(
          `engagement:${postId}:${userId}`,
        );
        if (this.isEngagementData(cached)) {
          this.setEngagementCache(postId, userId, cached);
        }
      }),
    );
  }

  private async enrichRawPosts(
    rawPosts: any[],
    userId: string,
    limitEngagementToFirst: number = 10,
  ): Promise<PostWithAuthor[]> {
    const now = Date.now();
    const authorIds = [
      ...new Set(rawPosts.map((p) => p.author_id).filter(Boolean)),
    ];
    const postIds = rawPosts.map((p) => p.id);

    // Prime author cache from denormalized fields on post docs (0 reads)
    for (const post of rawPosts) {
      if (
        post.author_id &&
        post.author_username &&
        !this.getAuthorCache(post.author_id)
      ) {
        this.authorDetailsCache.set(post.author_id, {
          data: {
            id: post.author_id,
            user_id: post.author_id,
            username: post.author_username,
            display_name: post.author_display_name || null,
            avatar_url: post.author_avatar_url || "",
          },
          expiresAt: now + this.authorDetailsTtlMs,
        });
      }
    }

    await this.hydrateEngagementFromRedis(postIds, userId);

    const missingAuthorIds = authorIds.filter((id) => !this.getAuthorCache(id));
    const missingEngagementPostIds = postIds
      .filter((id) => !this.getEngagementCache(id, userId))
      .slice(0, limitEngagementToFirst);

    const rawPostsMap = new Map<string, any>(rawPosts.map((p) => [p.id, p]));

    // Preload user's liked post IDs (1 buildQuery, cached 5min)
    // + fetch missing authors in parallel
    // + check Redis for cached authors
    // Always preload the user's liked-post set so realtime snapshot updates
    // can correctly compute `is_liked_by_user` for posts that are already in
    // the engagement TTL cache (otherwise the heart would not refill after a
    // like flows through the Postgres listener). The result is itself
    // cached for 5min, so this stays cheap.
    const [freshAuthorsMap, userLikedIds] = await Promise.all([
      this.fetchAuthorsWithRedis(missingAuthorIds),
      this.preloadUserLikes(userId),
    ]);

    // For posts WITHOUT denormalized counts â†’ fall back to batch queries
    const legacyPostIds = missingEngagementPostIds.filter((id) => {
      const raw = rawPostsMap.get(id);
      return (
        typeof raw?.likes_count !== "number" ||
        typeof raw?.comments_count !== "number"
      );
    });

    let legacyLikesMap = new Map<
      string,
      { likesCount: number; isLikedByUser: boolean }
    >();
    let legacyCommentsMap = new Map<string, number>();

    if (legacyPostIds.length > 0) {
      const storedLikesCounts = new Map<string, number | undefined>(
        legacyPostIds.map((id) => {
          const v = rawPostsMap.get(id)?.likes_count;
          return [id, typeof v === "number" ? v : undefined];
        }),
      );
      const storedCommentsCounts = new Map<string, number | undefined>(
        legacyPostIds.map((id) => {
          const v = rawPostsMap.get(id)?.comments_count;
          return [id, typeof v === "number" ? v : undefined];
        }),
      );

      [legacyLikesMap, legacyCommentsMap] = await Promise.all([
        feedService.batchGetPostLikes(legacyPostIds, userId, storedLikesCounts),
        feedService.batchGetPostCommentsCounts(
          legacyPostIds,
          storedCommentsCounts,
        ),
      ]);
    }

    freshAuthorsMap.forEach((author, authorId) => {
      if (!author) return;
      this.authorDetailsCache.set(authorId, {
        data: author,
        expiresAt: now + this.authorDetailsTtlMs,
      });
    });

    // Modern posts carry live denormalized counters on the post document.
    // shows correctly after opening the likes modal" â€” the modal path
    // Trust those fields here so a feed snapshot does not fan out into
    // per-post counter reads. Only legacy posts without counter fields use
    // the batched fallback queries above.
    missingEngagementPostIds.forEach((postId) => {
      const raw = rawPostsMap.get(postId);
      const hasDenormalized =
        typeof raw?.likes_count === "number" &&
        typeof raw?.comments_count === "number";

      if (hasDenormalized) {
        const engagementData = {
          likesCount: raw.likes_count,
          commentsCount: raw.comments_count,
          isLikedByUser: userLikedIds.has(postId),
        };
        this.engagementCache.set(`${postId}:${userId}`, {
          ...engagementData,
          expiresAt: now + this.engagementTtlMs,
        });
        // Cache in Redis with 5min TTL
        const cacheKey = `engagement:${postId}:${userId}`;
        redisCache.set(cacheKey, engagementData, 300).catch(() => {});
      } else {
        // Legacy fallback for posts created before counters were denormalized.
        const engagementData = {
          likesCount: legacyLikesMap.get(postId)?.likesCount ?? 0,
          commentsCount: legacyCommentsMap.get(postId) ?? 0,
          isLikedByUser: legacyLikesMap.get(postId)?.isLikedByUser ?? false,
        };
        this.engagementCache.set(`${postId}:${userId}`, {
          ...engagementData,
          expiresAt: now + this.engagementTtlMs,
        });
        // Cache in Redis with 5min TTL
        const cacheKey = `engagement:${postId}:${userId}`;
        redisCache.set(cacheKey, engagementData, 300).catch(() => {});
      }
    });

    return rawPosts.map((post: any) => {
      const author = this.getAuthorCache(post.author_id) || {
        id: post.author_id,
        user_id: post.author_id,
        username: `user_${post.author_id.slice(0, 8)}`,
        display_name: null,
        avatar_url: "",
      };
      const engagement = this.getEngagementCache(post.id, userId);

      // Compute the best likes count from two authoritative sources:
      //
      // 1. `raw.likes_count` â€” written by the `onPostLikeCreated` /
      //    `onPostLikeDeleted` Cloud Function triggers and delivered live
      //    via the scoped Postgres listener. This is the realtime
      //    source and fixes the stale-cache/no-update problem.
      //
      // 2. `engagement?.likesCount` â€” populated by `batchGetPostLikes`
      //    which counts actual `post_likes` documents. This is the
      //    accurate fallback for legacy posts filterWhere `likes_count` on
      //    the post doc is 0 or missing because the Cloud Function was
      //    not yet deployed when those likes were added.
      //
      // Taking Math.max handles all cases:
      //   - New like arrives:  raw=6, cache=5  â†’ 6  (realtime âœ“)
      //   - Legacy post:       raw=0, cache=5  â†’ 5  (actual count âœ“)
      //   - Post past take:   raw=5, cache=0  â†’ 5  (was 0 before âœ“)
      //   - Genuine zero:      raw=0, cache=0  â†’ 0  (correct âœ“)
      const rawLikes =
        typeof post.likes_count === "number" ? post.likes_count : 0;
      const rawComments =
        typeof post.comments_count === "number" ? post.comments_count : 0;

      const likesCount = Math.max(rawLikes, engagement?.likesCount ?? 0);
      const commentsCount = Math.max(
        rawComments,
        engagement?.commentsCount ?? 0,
      );
      // is_liked_by_user comes from the user's own likes set (preloaded via
      // `preloadUserLikes` and kept warm by `updateLikeCache` on optimistic
      // like/unlike). Fall back to the engagement cache when neither is
      // populated (e.g. posts past the enrichment slice).
      const isLikedByUser =
        userLikedIds.has(post.id) || engagement?.isLikedByUser || false;

      // Keep the TTL cache in sync with the realtime numbers so subsequent
      // calls (loadEngagementForPosts, getFeedCached, etc.) see fresh data.
      this.engagementCache.set(`${post.id}:${userId}`, {
        likesCount,
        commentsCount,
        isLikedByUser,
        expiresAt: now + this.engagementTtlMs,
      });

      return {
        id: post.id,
        author_id: post.author_id,
        author,
        content: post.content || "",
        media_url: post.media_url || null,
        media_urls: Array.isArray(post.media_urls) ? post.media_urls : null,
        media_type: post.media_type || null,
        view_count: post.view_count || 0,
        likes_count: likesCount,
        comments_count: commentsCount,
        is_liked_by_user: isLikedByUser,
        created_at:
          this.normalizeTimestamp(post.created_at) ||
          this.normalizeTimestamp(post.updated_at) ||
          this.fallbackTimestamp,
        updated_at:
          this.normalizeTimestamp(post.updated_at) ||
          this.normalizeTimestamp(post.created_at) ||
          this.fallbackTimestamp,
      };
    });
  }

  /**
   * Get feed with intelligent caching
   * - First load: Shows cached data immediately (if available)
   * - Background: Fetches fresh data and updates cache
   * - Real-time: Subscribes to updates after initial load
   */
  async getFeedCached(
    userId: string,
    limitCount: number = 20,
    options: { forceRefresh?: boolean } = {},
  ): Promise<PostWithAuthor[]> {
    const cacheKey = buildScopedFeedCacheKey("feed", userId, limitCount);

    return feedCache.get(
      cacheKey,
      async () => {
        const apiFeed = await this.fetchFeedFromApi(
          userId,
          limitCount,
          !!options.forceRefresh,
        );
        if (apiFeed) {
          this.feedApiCursors.set(userId, apiFeed.hasMore ? apiFeed.nextCursor : null);
          return apiFeed.posts;
        }
        throw new Error("Feed API returned an invalid page");
      },
      { forceRefresh: options.forceRefresh },
    );
  }

  /**
   * Get user posts with caching
   */
  async getUserPostsCached(
    userId: string,
    limitCount: number = 20,
    options: { forceRefresh?: boolean } = {},
  ): Promise<PostWithAuthor[]> {
    const cacheKey = buildScopedFeedCacheKey("user-posts", userId, limitCount);

    return userPostsCache.get(
      cacheKey,
      async () => {
        console.log(
          "ðŸ”„ [Optimized] Fetching user posts from Supabase for user:",
          userId,
        );
        // Use the direct user posts method for efficiency
        const userPosts = await feedService.getUserPosts(userId, limitCount);
        console.log(
          "ðŸ“Š [Optimized] Got user posts:",
          userPosts.length,
          "for user:",
          userId,
        );
        return userPosts;
      },
      { forceRefresh: options.forceRefresh },
    );
  }

  private readonly feedApiCursors = new Map<string, string | null>();

  /**
   * Fetch authors with Redis caching
   * Checks Redis first, falls back to Postgres, then caches result
   */
  private async fetchAuthorsWithRedis(
    authorIds: string[],
  ): Promise<Map<string, PostWithAuthor["author"]>> {
    if (authorIds.length === 0) {
      return new Map();
    }

    const authorsMap = new Map<string, PostWithAuthor["author"]>();
    const missingIds: string[] = [];

    // Check Redis cache first
    for (const authorId of authorIds) {
      const cacheKey = `author:${authorId}`;
      try {
        const cached = await redisCache.get<PostWithAuthor["author"]>(cacheKey);
        if (cached) {
          authorsMap.set(authorId, cached);
        } else {
          missingIds.push(authorId);
        }
      } catch {
        // Redis error, fall back to Postgres
        missingIds.push(authorId);
      }
    }

    // Fetch missing authors from Postgres
    if (missingIds.length > 0) {
      const freshAuthors = await feedService.batchGetAuthors(missingIds);
      freshAuthors.forEach((author, authorId) => {
        if (author) {
          authorsMap.set(authorId, author);
          // Cache in Redis with 15min TTL
          const cacheKey = `author:${authorId}`;
          redisCache.set(cacheKey, author, 900).catch(() => {});
        }
      });
    }

    return authorsMap;
  }

  /**
   * Subscribe to real-time feed updates.
   * First delivery is BLOCKED until complete data is ready â€” no partial renders.
   * After the first delivery, subsequent real-time updates flow with light throttle.
   * Checks Redis cache FIRST to prevent Postgres reads on reload.
   */
  subscribeToFeedOptimized(
    userId: string,
    onUpdate: (posts: any[]) => void,
    initialLimit: number = 10,
  ): () => void {
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let active = true;
    let feedChannel: any = null;
    let refreshScheduler: ReturnType<typeof scheduleRefresh> | null = null;
    this.feedApiCursors.delete(userId);

    const loadFeed = async (forceRefresh: boolean) => {
      const page = await this.fetchFeedFromApi(userId, initialLimit, forceRefresh);
      if (!page || !active) return;
      this.feedApiCursors.set(userId, page.hasMore ? page.nextCursor : null);
      const posts = await this.rehydrateCachedFeedLikes(page.posts, userId);
      if (active) onUpdate(posts);
    };

    const setup = async () => {
      try {
        const authReady = await this.waitForAuthReady();
        if (!active) return;
        if (!authReady) {
          retryTimer = setTimeout(setup, 700);
          return;
        }

        await loadFeed(false);
        if (!active) return;

        const client = getSupabaseBrowserClient();
        refreshScheduler = scheduleRefresh(() => {
          void loadFeed(true).catch((error) => {
            console.warn("[Optimized] Realtime feed refresh failed:", error);
          });
        });
        feedChannel = client
          .channel(`feed-posts:${userId}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "posts" },
            refreshScheduler.schedule,
          )
          .on(
            "postgres_changes",
            { event: "DELETE", schema: "public", table: "posts" },
            refreshScheduler.schedule,
          );
        void feedChannel.subscribe((status: string) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("[Optimized] Realtime feed channel unavailable:", status);
          }
        });
      } catch (error) {
        console.error("Error setting up feed subscription:", error);
        if (active) retryTimer = setTimeout(setup, 1200);
      }
    };

    void setup();
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      refreshScheduler?.cancel();
      if (feedChannel) void getSupabaseBrowserClient().removeChannel(feedChannel);
    };
  }

  /**
   * Load more posts (pagination)
   * Returns additional posts beyond the initial batch
   */
  async loadMorePosts(userId: string, take: number = 10): Promise<any[]> {
    const apiCursor = this.feedApiCursors.get(userId);
    if (apiCursor === undefined) throw new Error("Feed must be loaded before pagination");
    if (apiCursor === null) return [];
    const page = await this.fetchFeedFromApi(userId, take, false, apiCursor);
    if (!page) throw new Error("Feed pagination API unavailable");
    this.feedApiCursors.set(userId, page.hasMore ? page.nextCursor : null);
    return page.posts;
  }

  /**
   * Subscribe to user posts.
   * First delivery blocked until complete data is ready.
   */
  subscribeToUserPostsOptimized(
    userId: string,
    callback: (posts: PostWithAuthor[]) => void,
    limitCount: number = 20,
  ): Unsubscribe {
    let firstDeliveryDone = false;
    let lastUpdateTime = 0;
    const THROTTLE_MS = 1000;

    let unsubscribe: Unsubscribe = () => {};
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const setup = async () => {
      // Wait for Supabase Auth before any Postgres read inside enrichRawPosts.
      // See subscribeToFeedOptimized for the rationale.
      const authReady = await this.waitForAuthReady();
      if (!authReady) {
        console.warn(
          "âš ï¸ [subscribeToUserPostsOptimized] auth not ready; delivering empty user posts",
        );
        retryTimer = setTimeout(setup, 700);
        return;
      }

      const client = getSupabaseBrowserClient();
      const load = async () => {
        const { data, error } = await client.from("posts").select(POST_SELECT_FIELDS).eq("author_id", userId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limitCount);
        if (error) throw error;
        const rawPosts = (data ?? []) as any[];
        const posts = await this.enrichRawPosts(rawPosts, userId);

        if (!firstDeliveryDone) {
          firstDeliveryDone = true;
          console.log(
            "ðŸ“¡ [Optimized] First complete user posts delivery:",
            posts.length,
          );

          const cacheKey = `user-posts:${userId}:${limitCount}`;
          userPostsCache.get(cacheKey, async () => posts, {
            forceRefresh: true,
          });

          callback(posts);
          lastUpdateTime = Date.now();
          return;
        }

        const now = Date.now();
        if (now - lastUpdateTime < THROTTLE_MS) {
          return;
        }
        lastUpdateTime = now;

        const cacheKey = `user-posts:${userId}:${limitCount}`;
        userPostsCache.get(cacheKey, async () => posts, { forceRefresh: true });

        callback(posts);
      };
      const loadSafely = () => {
        void load().catch((error) => {
          // Keep last good snapshot. Never leak raw Supabase objects as an
          // unhandled rejection into the Next.js development overlay.
          console.warn("[Optimized] User posts refresh failed:", error);
        });
      };
      const refresh = scheduleRefresh(loadSafely);
      loadSafely();
      const channel = client
        .channel(`user-posts:${userId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts", filter: `author_id=eq.${userId}` }, refresh.schedule)
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "posts", filter: `author_id=eq.${userId}` }, refresh.schedule)
        .subscribe();
      unsubscribe = () => { refresh.cancel(); void client.removeChannel(channel); };
    };

    setup().catch((error) => {
      console.error("Error setting up user posts subscription:", error);
      retryTimer = setTimeout(setup, 1200);
    });

    // Use visibility manager to automatically unsubscribe when tab is hidden
    if (this.enableVisibilityUnloading) {
      const subscriptionKey = `user-posts:${userId}`;
      return visibilitySubscriptionManager.register(subscriptionKey, () => {
        return () => {
          if (retryTimer) clearTimeout(retryTimer);
          unsubscribe();
        };
      });
    }

    // Default behavior without visibility management
    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      unsubscribe();
    };
  }

  /**
   * Load engagement data for specific posts on-demand
   * Called when posts scroll into viewport to avoid loading for off-screen posts
   */
  async loadEngagementForPosts(
    postIds: string[],
    userId: string,
  ): Promise<void> {
    await this.hydrateEngagementFromRedis(postIds, userId);

    const now = Date.now();
    const missingPostIds = postIds.filter(
      (id) => !this.getEngagementCache(id, userId),
    );

    if (missingPostIds.length === 0) return;

    // Fetch posts to check for denormalized counts
    const chunks: string[][] = [];
    for (let i = 0; i < missingPostIds.length; i += 10) {
      chunks.push(missingPostIds.slice(i, i + 10));
    }

    const rawPostsMap = new Map<string, any>();
    await Promise.all(
      chunks.map(async (chunk) => {
        const { data: rows, error } = await this.client.from("posts")
          .select("id,likes_count:reaction_count,comments_count:comment_count").in("id", chunk);
        if (error) throw error;
        (rows ?? []).forEach((row) => rawPostsMap.set(row.id, row));
      }),
    );

    const legacyPostIds = missingPostIds.filter((id) => {
      const raw = rawPostsMap.get(id);
      return (
        typeof raw?.likes_count !== "number" ||
        typeof raw?.comments_count !== "number"
      );
    });

    if (legacyPostIds.length === 0) {
      const userLikedIds = await this.preloadUserLikes(userId);

      missingPostIds.forEach((postId) => {
        const raw = rawPostsMap.get(postId);
        if (raw) {
          this.engagementCache.set(`${postId}:${userId}`, {
            likesCount:
              typeof raw.likes_count === "number" ? raw.likes_count : 0,
            commentsCount:
              typeof raw.comments_count === "number" ? raw.comments_count : 0,
            isLikedByUser: userLikedIds.has(postId),
            expiresAt: now + this.engagementTtlMs,
          });
        }
      });
      return;
    }

    // Legacy posts need batch queries
    const storedLikesCounts = new Map<string, number | undefined>(
      legacyPostIds.map((id) => {
        const v = rawPostsMap.get(id)?.likes_count;
        return [id, typeof v === "number" ? v : undefined];
      }),
    );

    const legacyLikesMap = await feedService.batchGetPostLikes(
      legacyPostIds,
      userId,
      storedLikesCounts,
    );

    const userLikedIds = await this.preloadUserLikes(userId);

    missingPostIds.forEach((postId) => {
      const raw = rawPostsMap.get(postId);
      if (!raw) return;

      this.engagementCache.set(`${postId}:${userId}`, {
        likesCount:
          legacyLikesMap.get(postId)?.likesCount ?? raw.likes_count ?? 0,
        commentsCount:
          typeof raw.comments_count === "number" ? raw.comments_count : 0,
        isLikedByUser:
          legacyLikesMap.get(postId)?.isLikedByUser ??
          userLikedIds.has(postId) ??
          false,
        expiresAt: now + this.engagementTtlMs,
      });
    });
  }

  /**
   * Clear engagement cache for specific posts or all posts
   * Useful after enabling aggregated counters to force fresh reads
   */
  clearEngagementCache(postId?: string, userId?: string): void {
    if (postId && userId) {
      // Clear specific post engagement
      this.engagementCache.delete(`${postId}:${userId}`);
      console.log(`ðŸ§¹ Cleared engagement cache for post ${postId}`);
    } else if (userId) {
      // Clear all engagement for a user
      for (const key of this.engagementCache.keys()) {
        if (key.endsWith(`:${userId}`)) {
          this.engagementCache.delete(key);
        }
      }
      console.log(`ðŸ§¹ Cleared all engagement cache for user ${userId}`);
    } else {
      // Clear all engagement cache
      this.engagementCache.clear();
      console.log(`ðŸ§¹ Cleared all engagement cache`);
    }
  }

  /**
   * Enrich posts with batched author and likes data
   * This reduces Supabase reads by 80%+ by batching queries
   */
  private async enrichPostsWithBatchData(
    posts: PostWithAuthor[],
    userId: string,
  ): Promise<void> {
    if (posts.length === 0) return;

    console.log(
      `ðŸ”„ [Optimized] Enriching ${posts.length} posts with batch data`,
    );

    // Extract unique author IDs
    const authorIds = [...new Set(posts.map((post) => post.author_id))];

    // Extract post IDs
    const postIds = posts.map((post) => post.id);

    // Batch fetch authors and likes in parallel
    const [authorsMap, likesMap] = await Promise.all([
      batchQueryOptimizer.getAuthors(authorIds),
      batchQueryOptimizer.getPostLikesBatch(postIds, userId),
    ]);

    // Enrich posts with the fetched data
    for (const post of posts) {
      const author = authorsMap.get(post.author_id);
      if (author) {
        post.author = author;
      }

      const likes = likesMap.get(post.id);
      if (likes) {
        post.likes_count = likes.likesCount;
        post.is_liked_by_user = likes.isLikedByUser;
      }
    }

    console.log(
      `âœ… [Optimized] Enriched ${posts.length} posts with batch data`,
    );
  }

  /**
   * Create post and invalidate relevant caches
   */
  async createPostOptimized(request: any): Promise<PostWithAuthor | null> {
    const post = await feedService.createPost(request);

    if (post) {
      // Server APIs handle Redis invalidation. This clears only the local
      // browser/session feed snapshots so the next read pulls the API cache.
      feedCache.invalidatePattern(/^feed:posts-feed:/);
      userPostsCache.invalidatePattern(
        new RegExp(`^feed:user-posts:${request.author_id}`),
      );

      // Get enriched post
      return feedService.getPostWithAuthor(post.id, request.author_id);
    }

    return null;
  }

  /**
   * Like post and invalidate cache
   */
  async likePostOptimized(postId: string, userId: string): Promise<void> {
    // Await the API write FIRST. If it throws, we must not update any local
    // cache â€” otherwise the optimistic UI will keep showing a filled heart
    // for a like that was never persisted, and it will vanish on the next
    // refresh.
    try {
      await feedService.likePost(postId, userId);
      console.log("âœ… [LIKE] persisted to Postgres:", postId);
    } catch (error) {
      console.error(
        "âŒ [LIKE] not persisted â€” rolling back local caches:",
        postId,
        error,
      );
      // Make sure no stale entry survives in any cache layer.
      this.updateLikeCache(userId, postId, false);
      this.engagementCache.delete(`${postId}:${userId}`);
      throw error;
    }

    // Keep the warm in-memory liked-post cache aligned with the mutation so
    // the next feed enrichment pass does not briefly regress is_liked_by_user.
    this.updateLikeCache(userId, postId, true);

    // Invalidate local browser/session caches. Server Redis invalidation is
    // handled by the `/api/posts/:id/like` route used by feedService.likePost.
    this.engagementCache.delete(`${postId}:${userId}`);
    feedCache.invalidatePattern(/^feed:posts-feed:/);
    userPostsCache.invalidatePattern(/^feed:user-posts:/);
  }

  /**
   * Unlike post and invalidate cache
   */
  async unlikePostOptimized(postId: string, userId: string): Promise<void> {
    try {
      await feedService.unlikePost(postId, userId);
      console.log("âœ… [UNLIKE] persisted to Postgres:", postId);
    } catch (error) {
      console.error(
        "âŒ [UNLIKE] not persisted â€” leaving local caches as-is:",
        postId,
        error,
      );
      throw error;
    }

    // Mirror the unlike locally so cached feed enrichment stays consistent.
    this.updateLikeCache(userId, postId, false);

    // Invalidate local browser/session caches. Server Redis invalidation is
    // handled by the `/api/posts/:id/like` route used by feedService.unlikePost.
    this.engagementCache.delete(`${postId}:${userId}`);
    feedCache.invalidatePattern(/^feed:posts-feed:/);
    userPostsCache.invalidatePattern(/^feed:user-posts:/);
  }

  /**
   * Delete post and invalidate cache
   */
  async deletePostOptimized(postId: string, userId: string): Promise<boolean> {
    const result = await feedService.deletePost(postId, userId);

    if (result) {
      // Clear local browser/session snapshots after deletion.
      feedCache.invalidatePattern(/^feed:posts-feed:/);
      userPostsCache.invalidatePattern(/^feed:user-posts:/);
    }

    return result;
  }

  /**
   * Force refresh feed (pull-to-refresh)
   */
  async refreshFeed(
    userId: string,
    limitCount: number = 20,
  ): Promise<PostWithAuthor[]> {
    console.log("ðŸ”„ [Optimized] Force refreshing feed...");
    return this.getFeedCached(userId, limitCount, { forceRefresh: true });
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats() {
    return {
      feedCache: feedCache.getStats(),
      userPostsCache: userPostsCache.getStats(),
    };
  }

  /**
   * Clear all caches (useful for logout)
   */
  clearAllCaches(): void {
    feedCache.clear();
    userPostsCache.clear();
    this.friendIdsCache.clear();
    this.authorDetailsCache.clear();
    this.engagementCache.clear();
    batchQueryOptimizer.clear();
    console.log("ðŸ—‘ï¸ [Optimized] Cleared all caches");
  }
}

export const optimizedFeedService = guardCircleResult(new OptimizedFeedService());
