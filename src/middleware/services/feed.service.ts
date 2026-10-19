import { guardCircleResult } from "./guardCircleResult";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
type Unsubscribe = () => void;
type DatabaseTimestamp = string | Date;
import { createUuid } from "@/utils/uuid";
import { userService } from "./user.service";
import { generatePlaceholderMedia } from "@/utils/placeholderImages";
import {
  requireAuthenticatedUser,
  secureLogError,
  validateOptionalMediaUrl,
  validateOptionalText,
  SECURITY_LIMITS,
} from "@/security/appSecurity";

// Browser queries target native relational columns, then alias them to the
// legacy DTO shape consumed by existing UI code.
export const POST_SELECT_FIELDS =
  "id,author_id,content:body,media_url:metadata->>media_url,media_urls:metadata->media_urls,media_type:metadata->>media_type,view_count,likes_count:reaction_count,comments_count:comment_count,created_at,updated_at";
const LIKE_FIELDS = "post_id,user_id,reaction,taps,created_at,updated_at";

export interface Post {
  id: string;
  author_id: string;
  content?: string;
  media_url?: string;
  media_urls?: string[];
  media_type?: "TEXT" | "PHOTO" | "VIDEO" | "AUDIO";
  view_count: number;
  likes_count?: number;
  comments_count?: number;
  created_at: string | DatabaseTimestamp | any;
  updated_at: string | DatabaseTimestamp | any;
}

export interface PostLike {
  id?: string;
  post_id: string;
  user_id: string;
  taps?: number;
  created_at: string;
  updated_at?: string;
}

export interface PostView {
  id: string;
  post_id: string;
  user_id: string;
  viewed_at: string;
}

export interface FeedEvent {
  id: string;
  user_id: string;
  event_type:
    | "POST_CREATED"
    | "DARE_COMPLETED"
    | "DARE_ACCEPTED"
    | "TRUTH_TOLD";
  related_post_id?: string;
  related_dare_id?: string;
  related_truth_id?: string;
  created_at: string | DatabaseTimestamp | any;
}

export interface CreatePostRequest {
  author_id: string;
  content?: string;
  media_url?: string;
  media_urls?: string[];
  media_type?: "TEXT" | "PHOTO" | "VIDEO" | "AUDIO";
}

export interface PostWithAuthor extends Omit<Post, "view_count"> {
  author: {
    id: string;
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  likes_count?: number;
  comments_count?: number;
  is_liked_by_user?: boolean;
  view_count?: number;
}

export interface FeedEventWithUser extends FeedEvent {
  user: {
    id: string;
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  related_post?: PostWithAuthor;
  related_dare?: any;
}

class FeedService {
  private get client() {
    return getSupabaseBrowserClient();
  }
  private readonly postEnrichmentCacheTtlMs = 5 * 60 * 1000;
  private readonly authorDetailsCacheTtlMs = 30 * 60 * 1000;
  // Enable aggregated counters to reduce reads by ~90% for count queries
  private readonly enableAggregatedCounters = true; // Set to true to enable
  private readonly viewedPostsThisSession = new Set<string>();
  private authorDetailsCache = new Map<
    string,
    { data: PostWithAuthor["author"]; expiresAt: number }
  >();
  private postEnrichmentCache = new Map<
    string,
    {
      likesCount: number;
      isLikedByUser: boolean;
      commentsCount: number;
      expiresAt: number;
    }
  >();

  private convertTimestampToISO(timestamp: any): string {
    if (timestamp && typeof timestamp === "object" && "toDate" in timestamp && typeof (timestamp as { toDate?: () => Date }).toDate === "function") return (timestamp as { toDate: () => Date }).toDate().toISOString();
    if (typeof timestamp === "string") {
      return timestamp;
    }
    if (timestamp && typeof timestamp.toDate === "function") {
      return timestamp.toDate().toISOString();
    }
    // If timestamp is a Postgres DatabaseTimestamp object with seconds property
    if (
      timestamp &&
      typeof timestamp === "object" &&
      "seconds" in timestamp &&
      "nanoseconds" in timestamp
    ) {
      const date = new Date(
        timestamp.seconds * 1000 + timestamp.nanoseconds / 1000000,
      );
      return date.toISOString();
    }
    // Fallback to current time if timestamp is invalid
    console.warn(
      "Invalid timestamp detected, using fallback epoch:",
      timestamp,
    );
    return "1970-01-01T00:00:00.000Z";
  }

  async createPost(request: CreatePostRequest): Promise<Post> {
    try {
      const authenticatedUserId = requireAuthenticatedUser(request.author_id);
      console.log("ðŸ” Authenticated user ID:", authenticatedUserId);
      console.log("ðŸ“ Request author_id:", request.author_id);
      const sanitizedContent = validateOptionalText(
        request.content,
        SECURITY_LIMITS.postContent,
      );
      console.log("ðŸ” Media URL before validation:", request.media_url);
      if (!sanitizedContent?.trim()) {
        throw new Error("Caption is required to create a feed post.");
      }
      const sanitizedMediaUrl = validateOptionalMediaUrl(request.media_url);
      console.log("âœ… Media URL after validation:", sanitizedMediaUrl);
      try {
        const { apiFetch } = await import("@/lib/apiClient");
        const response = await apiFetch<{ ok: boolean; post: Post }>(
          "/api/posts",
          {
            method: "POST",
            body: JSON.stringify({
              content: sanitizedContent,
              media_url: sanitizedMediaUrl || null,
              media_urls: request.media_urls || null,
              media_type: request.media_type || "TEXT",
            }),
          },
        );

        if (response?.post?.id) return response.post;
      } catch (error) {
        secureLogError("createPost API failed", error);
        console.error("âŒ [CREATE POST API] failed:", error);
        if (!this.isApiAuthFailure(error)) {
          throw error;
        }
      }

      const postId = createUuid();

      // Fetch author profile to denormalize onto post doc
      let authorUsername = "";
      let authorDisplayName = "";
      let authorAvatarUrl = "";
      try {
        const authorProfile = await userService.getProfile(authenticatedUserId);
        if (authorProfile) {
          authorUsername = authorProfile.username || "";
          authorDisplayName = authorProfile.display_name || "";
          authorAvatarUrl = authorProfile.avatar_url || "";
        }
      } catch {
        /* non-fatal */
      }

      const postData = {
        author_id: authenticatedUserId,
        author_username: authorUsername,
        author_display_name: authorDisplayName,
        author_avatar_url: authorAvatarUrl,
        content: sanitizedContent,
        media_url: sanitizedMediaUrl || null,
        media_urls: request.media_urls?.length ? request.media_urls : null,
        media_type: request.media_type || "TEXT",
        view_count: 0,
        likes_count: 0,
        comments_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      console.log("ðŸ“¤ Attempting to create post with data:", postData);
      const { error: insertError } = await this.client.from("posts").insert({ id: postId, ...postData });
      if (insertError) throw insertError;
      const newPost = { id: postId, ...postData } as Post;
      console.log("âœ… Post created successfully:", newPost.id);

      // Create feed event
      await this.createFeedEvent({
        user_id: authenticatedUserId,
        event_type: "POST_CREATED",
        related_post_id: newPost.id,
      });

      if (typeof window !== "undefined") {
        import("@/lib/apiClient")
          .then(({ apiFetch }) =>
            apiFetch("/api/cache/social", {
              method: "POST",
              body: JSON.stringify({ userIds: [authenticatedUserId] }),
            }),
          )
          .catch(() => {});
      }

      return newPost;
    } catch (error) {
      secureLogError("createPost failed", error);
      throw error;
    }
  }

  async createFeedEvent(
    eventData: Omit<FeedEvent, "id" | "created_at">,
  ): Promise<FeedEvent> {
    try {
      const eventId = createUuid();
      const feedEventData = {
        ...eventData,
        created_at: new Date().toISOString(),
      };

      const { error } = await this.client.from("feed_events").insert({ id: eventId, ...feedEventData });
      if (error) throw error;
      return { id: eventId, ...feedEventData } as FeedEvent;
    } catch (error) {
      secureLogError("createFeedEvent failed", error);
      throw error;
    }
  }

  async getFeed(
    userId: string,
    limitCount: number = 20,
    lastDoc?: any,
  ): Promise<PostWithAuthor[]> {
    try {
      // Use new friends service to get friends
      const { friendsService: newFriendsService } =
        await import("./service-factory");
      const friendsResponse = await newFriendsService.getFriends(userId);

      console.log("ðŸ” FEED - Friends response:", friendsResponse);

      let friendIds: string[];

      if (!friendsResponse.success || !friendsResponse.friends) {
        friendIds = [userId];
        console.log("ðŸ” FEED - No friends found, using only user ID");
      } else {
        friendIds = friendsResponse.friends
          .map((friend: any) => friend?.userId || friend?.id)
          .filter((id: any): id is string => !!id && typeof id === "string");
        friendIds = [...new Set([...friendIds, userId])];
        console.log("ðŸ” FEED - Friend IDs:", friendIds);
      }

      console.log("ðŸ” FEED - Executing buildQuery for", friendIds.length, "users");
      let query = this.client.from("posts").select(POST_SELECT_FIELDS).in("author_id", friendIds)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limitCount);
      if (lastDoc?.data?.()?.created_at) {
        const timestamp = this.convertTimestampToISO(lastDoc.data().created_at);
        query = query.lt("created_at", timestamp);
      }
      const { data: rows, error } = await query;
      if (error) throw error;
      const rawRows = rows ?? [];
      console.log("ðŸ” FEED - Query returned", rawRows.length, "posts");

      // Extract raw posts (no async)
      const rawPosts: Post[] = rawRows.map((data) => {
        return {
          id: data.id,
          ...data,
          created_at: this.convertTimestampToISO(data.created_at),
          updated_at: this.convertTimestampToISO(data.updated_at),
        } as Post;
      });

      // Batch fetch ALL enrichment data in parallel
      const authorIds = [...new Set(rawPosts.map((p) => p.author_id))];
      const postIds = rawPosts.map((p) => p.id);

      const [authorsMap, likesMap, commentsMap] = await Promise.all([
        this.batchGetAuthors(authorIds),
        this.batchGetPostLikes(postIds, userId),
        this.batchGetPostCommentsCounts(postIds),
      ]);

      // Assemble enriched posts (no async, pure mapping)
      const posts: PostWithAuthor[] = rawPosts.map((post) => ({
        ...post,
        author: authorsMap.get(post.author_id) || {
          id: post.author_id,
          user_id: post.author_id,
          username: `user_${post.author_id.slice(0, 8)}`,
          display_name: null,
          avatar_url: "",
        },
        likes_count: likesMap.get(post.id)?.likesCount ?? 0,
        comments_count: commentsMap.get(post.id) ?? 0,
        is_liked_by_user: likesMap.get(post.id)?.isLikedByUser ?? false,
      }));

      return posts;
    } catch (error) {
      console.error("Error getting feed:", error);
      return [];
    }
  }

  async getPost(postId: string): Promise<Post | null> {
    try {
      const { data, error } = await this.client.from("posts").select(POST_SELECT_FIELDS).eq("id", postId).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        ...data,
        created_at: this.convertTimestampToISO(data.created_at),
        updated_at: this.convertTimestampToISO(data.updated_at),
      } as Post;
    } catch (error) {
      console.error("Error getting post:", error);
      return null;
    }
  }

  async getPostWithAuthor(
    postId: string,
    userId?: string,
  ): Promise<PostWithAuthor | null> {
    try {
      const post = await this.getPost(postId);
      if (!post) return null;

      // Fix blob URLs if needed
      const fixedPost = await this.fixBlobUrlIfNeeded(post);

      const author = await this.getPostAuthor(fixedPost.author_id);
      if (!author) return null;

      const likesCount = await this.getPostLikesCount(fixedPost.id);
      const commentsCount = await this.getPostCommentsCount(fixedPost.id);
      const isLikedByUser = userId
        ? await this.isPostLikedByUser(fixedPost.id, userId)
        : false;

      return {
        ...fixedPost,
        author,
        likes_count: likesCount,
        comments_count: commentsCount,
        is_liked_by_user: isLikedByUser,
      };
    } catch (error) {
      console.error("Error getting post with author:", error);
      return null;
    }
  }

  private async getPostAuthor(
    authorId: string,
  ): Promise<PostWithAuthor["author"] | null> {
    try {
      const { data: userData, error } = await this.client.from("profiles")
        .select("id,username,display_name,avatar_url").eq("id", authorId).maybeSingle();
      if (error) throw error;

      let avatarUrl = "";

      avatarUrl = userData?.avatar_url || "";

      // ALWAYS try to get from stored avatars as backup/enhancement
      try {
        const { useAvatarStore } = await import("../../stores/avatarStore");
        const { getStoredAvatar } = useAvatarStore.getState();
        const storedAvatar = getStoredAvatar(authorId);

        if (storedAvatar && storedAvatar !== avatarUrl) {
          avatarUrl = storedAvatar;
        }
      } catch {}

      // If we have an avatar, return the author data
      if (avatarUrl || userData) {

        return {
          id: userData?.id || authorId,
          user_id: authorId,
          username: userData?.username || `user_${authorId.slice(0, 8)}`,
          display_name: userData?.display_name || null,
          avatar_url: avatarUrl,
        };
      }

      return null;
    } catch (error) {
      console.error("Error getting post author:", error);
      return null;
    }
  }

  // SECURITY FIX (Â§1.6): Likes/unlikes are written server-side via the
  // Next.js API route. The client no longer touches `post_likes` or
  // `posts.likes_count` directly â€” Postgres rules block both. The
  // Cloud Function trigger aggregates the authoritative count, and
  // existing scoped listeners on the client pick up the change
  // automatically so realtime feels unchanged.
  async likePost(postId: string, userId: string): Promise<boolean> {
    try {
      requireAuthenticatedUser(userId);
      const { apiFetch } = await import("@/lib/apiClient");
      await apiFetch<{ aura?: { userId?: string } | null }>(`/api/posts/${encodeURIComponent(postId)}/like`, {
        method: "POST",
      });
      this.postEnrichmentCache.delete(postId);
      return true;
    } catch (error) {
      // CRITICAL: re-throw so the caller can roll back the optimistic UI.
      // Previously this swallowed the error and returned false, which made
      // failed likes appear successful in the UI until the user refreshed
      // and saw the heart vanish (because nothing was ever written to
      // Postgres).
      secureLogError("likePost failed", error);
      console.error("âŒ [LIKE API] failed:", postId, error);
      throw error;
    }
  }

  async unlikePost(postId: string, userId: string): Promise<boolean> {
    try {
      requireAuthenticatedUser(userId);
      const { apiFetch } = await import("@/lib/apiClient");
      await apiFetch(`/api/posts/${encodeURIComponent(postId)}/like`, {
        method: "DELETE",
      });
      this.postEnrichmentCache.delete(postId);
      return true;
    } catch (error) {
      secureLogError("unlikePost failed", error);
      console.error("âŒ [UNLIKE API] failed:", postId, error);
      throw error;
    }
  }

  private isApiAuthFailure(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("API 401") || message.includes("API 403");
  }

  private async likePostDirect(postId: string, userId: string): Promise<void> {
    requireAuthenticatedUser(userId);
    const { data: existing, error: readError } = await this.client.from("post_reactions")
      .select("post_id,user_id,taps").eq("post_id", postId).eq("user_id", userId).eq("reaction", "LIKE").maybeSingle();
    if (readError) throw readError;
    if (existing) {
      const { error } = await this.client.from("post_reactions").update({
        taps: Math.min(50, (existing.taps ?? 0) + 1),
        updated_at: new Date().toISOString(),
      }).eq("post_id", postId).eq("user_id", userId).eq("reaction", "LIKE");
      if (error) throw error;
      return;
    }
    const { error } = await this.client.from("post_reactions").insert({
      post_id: postId,
      user_id: userId,
      reaction: "LIKE",
      taps: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  private async unlikePostDirect(
    postId: string,
    userId: string,
  ): Promise<void> {
    requireAuthenticatedUser(userId);
    const { error } = await this.client.from("post_reactions").delete()
      .eq("post_id", postId).eq("user_id", userId).eq("reaction", "LIKE");
    if (error) throw error;
  }

  private async getPostLike(
    postId: string,
    userId: string,
  ): Promise<PostLike | null> {
    try {
      const { data, error } = await this.client.from("post_reactions").select(LIKE_FIELDS)
        .eq("post_id", postId).eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data as PostLike | null;
    } catch (error) {
      console.error("Error getting post like:", error);
      return null;
    }
  }

  async isPostLikedByUser(postId: string, userId: string): Promise<boolean> {
    const like = await this.getPostLike(postId, userId);
    return !!like;
  }

  async getPostLikesCount(postId: string): Promise<number> {
    try {
      const { count, error } = await this.client.from("post_reactions")
        .select("post_id", { count: "exact", head: true }).eq("post_id", postId).eq("reaction", "LIKE");
      if (error) throw error;
      return count ?? 0;
    } catch (error) {
      console.error("Error getting post likes count:", error);
      return 0;
    }
  }

  async getPostCommentsCount(postId: string): Promise<number> {
    try {
      const { count, error } = await this.client.from("post_comments")
        .select("id", { count: "exact", head: true }).eq("post_id", postId);
      if (error) throw error;
      return count ?? 0;
    } catch (error) {
      console.error("Error getting post comments count:", error);
      return 0;
    }
  }

  // SECURITY FIX (Â§1.6): View tracking is server-side. The API route
  // aggregates `view_count`. `skipCsrf` is set server-side for this
  // endpoint so sendBeacon() can be used for page-unload flushes.
  async deletePost(postId: string, userId: string): Promise<boolean> {
    try {
      requireAuthenticatedUser(userId);
      try {
        const { apiFetch } = await import("@/lib/apiClient");
        await apiFetch(`/api/posts/${encodeURIComponent(postId)}`, {
          method: "DELETE",
        });
        return true;
      } catch (error) {
        secureLogError("deletePost API failed", error);
        console.error("[DELETE POST API] failed:", postId, error);
        if (!this.isApiAuthFailure(error)) {
          throw error;
        }
      }

      const post = await this.getPost(postId);
      if (!post || post.author_id !== userId) {
        throw new Error("Unauthorized to delete this post");
      }

      const { error } = await this.client.from("posts").delete().eq("id", postId);
      if (error) throw error;

      await this.deletePostLikes(postId);
      return true;
    } catch (error) {
      secureLogError("deletePost failed", error);
      return false;
    }
  }

  private async deletePostLikes(postId: string): Promise<void> {
    try {
      const { error } = await this.client.from("post_reactions").delete().eq("post_id", postId);
      if (error) throw error;
    } catch (error) {
      console.error("Error deleting post likes:", error);
    }
  }

  private async fixBlobUrlIfNeeded(post: Post): Promise<Post> {
    if (post.media_url && post.media_url.startsWith("blob:")) {
      const placeholderUrl = generatePlaceholderMedia(
        800,
        600,
        "Media Migrated",
      );

      const { error } = await this.client.from("posts").update({
        media_url: placeholderUrl,
        updated_at: new Date().toISOString(),
      }).eq("id", post.id);
      if (error) throw error;

      return { ...post, media_url: placeholderUrl };
    }
    return post;
  }

  async migrateBlobUrls(): Promise<void> {
    try {
      const { data: rows, error } = await this.client.from("posts").select(POST_SELECT_FIELDS);
      if (error) throw error;

      let migratedCount = 0;
      for (const post of (rows ?? []) as Post[]) {
        if (post.media_url && post.media_url.startsWith("blob:")) {
          await this.fixBlobUrlIfNeeded(post);
          migratedCount++;
        }
      }

      console.log(`âœ… MIGRATION COMPLETE: ${migratedCount} posts migrated`);
    } catch (error) {
      console.error("âŒ ERROR DURING MIGRATION:", error);
    }
  }

  // FIX: Rebuilt subscribeToFeed â€” uses parallel batch enrichment instead of
  // sequential N+1 queries. Removed migrateBlobUrls() from hot path.
  subscribeToFeed(
    userId: string,
    callback: (posts: PostWithAuthor[]) => void,
    limitCount: number = 20,
  ): Unsubscribe {
    // We need to return an Unsubscribe synchronously, so we use a ref pattern
    // that gets replaced once the async setup resolves.
    let innerUnsubscribe: Unsubscribe = () => {};

    const setupSubscription = async () => {
      try {
        // Use new friends service to get friends
        const { friendsService: newFriendsService } =
          await import("./service-factory");
        const friendsResponse = await newFriendsService.getFriends(userId);

        let friendIds: string[];

        if (!friendsResponse.success || !friendsResponse.friends) {
          friendIds = [userId];
        } else {
          friendIds = friendsResponse.friends
            .map((friend: any) => friend?.userId || friend?.id)
            .filter((id: any): id is string => !!id && typeof id === "string");
          friendIds = [...new Set([...friendIds, userId])];
        }

        const authorCache = new Map<string, PostWithAuthor["author"]>();

        const deliver = async (rawPosts: Post[]) => {
            // Extract raw posts (no async)

            // Step 1: Collect unique author IDs and post IDs
            const authorIds = [...new Set(rawPosts.map((p) => p.author_id))];
            const postIds = rawPosts.map((p) => p.id);

            // Step 2a: Only fetch authors not already in cache (persists across fires)
            const missingAuthorIds = authorIds.filter(
              (id) => !authorCache.has(id),
            );
            if (missingAuthorIds.length > 0) {
              const fetched = await this.batchGetAuthors(missingAuthorIds);
              fetched.forEach((author, id) => authorCache.set(id, author));
            }
            const authorsMap = new Map<string, PostWithAuthor["author"]>(
              authorIds.map((id) => [
                id,
                authorCache.get(id) ?? {
                  id,
                  user_id: id,
                  username: `user_${id.slice(0, 8)}`,
                  display_name: null,
                  avatar_url: "",
                },
              ]),
            );

            // Step 3b: Fetch likes+comments only for posts not in the TTL cache
            const now = Date.now();
            const staleFeedPostIds = postIds.filter((id) => {
              const c = this.postEnrichmentCache.get(id);
              return !c || c.expiresAt <= now;
            });

            if (staleFeedPostIds.length > 0) {
              const [freshLikes, freshComments] = await Promise.all([
                this.batchGetPostLikes(staleFeedPostIds, userId),
                this.batchGetPostCommentsCounts(staleFeedPostIds),
              ]);
              const expiresAt = now + this.postEnrichmentCacheTtlMs;
              staleFeedPostIds.forEach((id) => {
                this.postEnrichmentCache.set(id, {
                  likesCount: freshLikes.get(id)?.likesCount ?? 0,
                  isLikedByUser: freshLikes.get(id)?.isLikedByUser ?? false,
                  commentsCount: freshComments.get(id) ?? 0,
                  expiresAt,
                });
              });
            }

            // Step 4: Assemble enriched posts from cache (no extra reads).
            // Use Math.max(raw, cached) so that:
            //   a) realtime CF-incremented counts supersede a stale cache, and
            //   b) legacy posts filterWhere likes_count=0 on the doc (pre-CF) still
            //      show the actual count from the batchGetPostLikes buildQuery.
            const posts: PostWithAuthor[] = rawPosts.map((post) => {
              const enrichment = this.postEnrichmentCache.get(post.id);
              const rawLikes =
                typeof post.likes_count === "number" ? post.likes_count : 0;
              const rawComments =
                typeof post.comments_count === "number"
                  ? post.comments_count
                  : 0;
              return {
                ...post,
                author: authorsMap.get(post.author_id) || {
                  id: post.author_id,
                  user_id: post.author_id,
                  username: `user_${post.author_id.slice(0, 8)}`,
                  display_name: null,
                  avatar_url: "",
                },
                likes_count: Math.max(rawLikes, enrichment?.likesCount ?? 0),
                comments_count: Math.max(
                  rawComments,
                  enrichment?.commentsCount ?? 0,
                ),
                is_liked_by_user: enrichment?.isLikedByUser ?? false,
              };
            });

            callback(posts);
          };
          /* (error) => {
            console.error("âŒ Real-time feed subscription error:", error);
          },
        ); */
        let active = true;
        let refreshTimer: ReturnType<typeof setTimeout> | null = null;
        const load = async () => {
          const { data, error } = await this.client.from("posts").select(POST_SELECT_FIELDS)
            .in("author_id", friendIds).order("created_at", { ascending: false })
            .order("id", { ascending: false }).limit(limitCount);
          if (!active || error) return;
          await deliver((data ?? []) as Post[]);
        };
        const scheduleLoad = () => {
          if (!active || refreshTimer) return;
          refreshTimer = setTimeout(() => { refreshTimer = null; void load(); }, 40);
        };
        void load();
        const channel = this.client.channel("feed-posts:" + userId)
          .on("postgres_changes", { event: "*", schema: "public", table: "posts", filter: `author_id=in.(${friendIds.join(",")})` }, scheduleLoad)
          .subscribe();
        innerUnsubscribe = () => { active = false; if (refreshTimer) clearTimeout(refreshTimer); void this.client.removeChannel(channel); };
      } catch (error) {
        console.error("âŒ Error setting up feed subscription:", error);
      }
    };

    setupSubscription();

    // Return a stable unsubscribe handle that delegates to the inner one
    return () => innerUnsubscribe();
  }

  // Get user posts directly (for profile pages)
  async getUserPosts(
    userId: string,
    limitCount: number = 20,
  ): Promise<PostWithAuthor[]> {
    const { data: rows, error } = await this.client.from("posts").select(POST_SELECT_FIELDS)
      .eq("author_id", userId).order("created_at", { ascending: false })
      .order("id", { ascending: false }).limit(limitCount);
    if (error) throw error;

    // Extract raw posts
    const rawPosts: Post[] = (rows ?? []).map((data) => {
      return {
        id: data.id,
        ...data,
        created_at: this.convertTimestampToISO(data.created_at),
        updated_at: this.convertTimestampToISO(data.updated_at),
      } as Post;
    });

    // Batch fetch all enrichment in parallel
    const authorIds = [...new Set(rawPosts.map((p) => p.author_id))];
    const postIds = rawPosts.map((p) => p.id);

    const [authorsMap, likesMap, commentsMap] = await Promise.all([
      this.batchGetAuthors(authorIds),
      this.batchGetPostLikes(postIds, userId),
      this.batchGetPostCommentsCounts(postIds),
    ]);

    const posts: PostWithAuthor[] = rawPosts.map((post) => ({
      ...post,
      author: authorsMap.get(post.author_id) || {
        id: post.author_id,
        user_id: post.author_id,
        username: `user_${post.author_id.slice(0, 8)}`,
        display_name: null,
        avatar_url: "",
      },
      likes_count: likesMap.get(post.id)?.likesCount ?? 0,
      comments_count: commentsMap.get(post.id) ?? 0,
      is_liked_by_user: likesMap.get(post.id)?.isLikedByUser ?? false,
    }));

    return posts;
  }

  // Separate method for subscribing to a single user's posts (profile page)
  subscribeToUserPosts(
    userId: string,
    callback: (posts: PostWithAuthor[]) => void,
    limitCount: number = 20,
  ): Unsubscribe {
    const authorCache = new Map<string, PostWithAuthor["author"]>();
    const deliver = async (rawPosts: Post[]) => {

        const authorIds = [...new Set(rawPosts.map((p) => p.author_id))];
        const postIds = rawPosts.map((p) => p.id);

        // Only fetch authors not already in cache
        const missingAuthorIds = authorIds.filter((id) => !authorCache.has(id));
        if (missingAuthorIds.length > 0) {
          const fetched = await this.batchGetAuthors(missingAuthorIds);
          fetched.forEach((author, id) => authorCache.set(id, author));
        }
        const authorsMap = new Map<string, PostWithAuthor["author"]>(
          authorIds.map((id) => [
            id,
            authorCache.get(id) ?? {
              id,
              user_id: id,
              username: `user_${id.slice(0, 8)}`,
              display_name: null,
              avatar_url: "",
            },
          ]),
        );

        // Fetch likes+comments only for posts not in the TTL cache
        const nowUp = Date.now();
        const staleUserPostIds = postIds.filter((id) => {
          const c = this.postEnrichmentCache.get(id);
          return !c || c.expiresAt <= nowUp;
        });

        if (staleUserPostIds.length > 0) {
          const [freshLikes, freshComments] = await Promise.all([
            this.batchGetPostLikes(staleUserPostIds, userId),
            this.batchGetPostCommentsCounts(staleUserPostIds),
          ]);
          const expiresAt = nowUp + this.postEnrichmentCacheTtlMs;
          staleUserPostIds.forEach((id) => {
            this.postEnrichmentCache.set(id, {
              likesCount: freshLikes.get(id)?.likesCount ?? 0,
              isLikedByUser: freshLikes.get(id)?.isLikedByUser ?? false,
              commentsCount: freshComments.get(id) ?? 0,
              expiresAt,
            });
          });
        }

        const posts: PostWithAuthor[] = rawPosts.map((post) => {
          const enrichment = this.postEnrichmentCache.get(post.id);
          return {
            ...post,
            author: authorsMap.get(post.author_id) || {
              id: post.author_id,
              user_id: post.author_id,
              username: `user_${post.author_id.slice(0, 8)}`,
              display_name: null,
              avatar_url: "",
            },
            likes_count: enrichment?.likesCount ?? 0,
            comments_count: enrichment?.commentsCount ?? 0,
            is_liked_by_user: enrichment?.isLikedByUser ?? false,
          };
        });

      callback(posts);
    };
    /*      (error) => {
        console.error("âŒ Real-time user posts subscription error:", error);
      },
    );

    console.log("âœ… Real-time user posts subscription established");
    return unsubscribe; */

    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      const { data, error } = await this.client.from("posts").select(POST_SELECT_FIELDS)
        .eq("author_id", userId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limitCount);
      if (!active) return;
      if (error) {
        console.error("Real-time user posts subscription error:", error);
        return;
      }
      await deliver((data ?? []) as Post[]);
    };
    const scheduleLoad = () => {
      if (!active || refreshTimer) return;
      refreshTimer = setTimeout(() => { refreshTimer = null; void load(); }, 40);
    };

    void load();
    const channel = this.client.channel(`user-posts-feed:${userId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "posts",
        filter: `author_id=eq.${userId}`,
      }, scheduleLoad)
      .subscribe();
    return () => {
      active = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      void this.client.removeChannel(channel);
    };
  }

  async getPostLikes(postId: string): Promise<
    Array<{
      userId: string;
      name: string;
      username: string;
      avatar: string;
      tapCount: number;
    }>
  > {
    try {
      const { data: rows, error } = await this.client.from("post_reactions").select(LIKE_FIELDS)
        .eq("post_id", postId).eq("reaction", "LIKE");
      if (error) throw error;

      const likes: Array<{ userId: string; name: string; username: string; avatar: string; tapCount: number }> = [];
      for (const like of (rows ?? []) as PostLike[]) {
        const author = await this.getPostAuthor(like.user_id);

        if (author) {
          likes.push({
            userId: like.user_id,
            name: author.display_name || author.username,
            username: author.username,
            avatar: author.avatar_url || "",
            tapCount: like.taps || 1,
          });
        }
      }

      return likes;
    } catch (error) {
      console.error("Error getting post likes:", error);
      return [];
    }
  }

  // â”€â”€â”€ Batch enrichment methods â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // These fetch data for multiple posts/authors in a single Postgres buildQuery,
  // replacing the sequential N+1 pattern that caused slow feed loading.

  async getPostLikePreviews(
    postIds: string[],
    perPostLimit = 3,
  ): Promise<
    Map<
      string,
      Array<{
        userId: string;
        name: string;
        username: string;
        avatar: string;
        tapCount: number;
      }>
    >
  > {
    const results = new Map<
      string,
      Array<{
        userId: string;
        name: string;
        username: string;
        avatar: string;
        tapCount: number;
      }>
    >();
    const uniquePostIds = [...new Set(postIds.filter(Boolean))].slice(0, 12);
    if (uniquePostIds.length === 0) return results;

    try {
      const rawByPost = new Map<string, PostLike[]>();

      await Promise.all(
        uniquePostIds.map(async (postId) => {
          const { data: rows, error } = await this.client.from("post_reactions").select(LIKE_FIELDS)
            .eq("post_id", postId).eq("reaction", "LIKE").order("taps", { ascending: false })
            .limit(Math.max(1, perPostLimit));
          if (error) throw error;
          rawByPost.set(
            postId,
            (rows ?? []) as PostLike[],
          );
        }),
      );

      const authorIds = [
        ...new Set(
          Array.from(rawByPost.values()).flatMap((likes) =>
            likes.map((like) => like.user_id),
          ),
        ),
      ];
      const authors = await this.batchGetAuthors(authorIds);

      rawByPost.forEach((likes, postId) => {
        results.set(
          postId,
          likes
            .map((like) => {
              const author = authors.get(like.user_id);
              const fallbackUsername = `user_${like.user_id.slice(0, 8)}`;

              return {
                userId: like.user_id,
                name:
                  author?.display_name || author?.username || fallbackUsername,
                username: author?.username || fallbackUsername,
                avatar: author?.avatar_url || "",
                tapCount: like.taps || 1,
              };
            })
            .sort((a, b) => b.tapCount - a.tapCount),
        );
      });
    } catch (error) {
      console.error("Error getting post like previews:", error);
    }

    return results;
  }

  async batchGetAuthors(
    authorIds: string[],
  ): Promise<Map<string, PostWithAuthor["author"]>> {
    const results = new Map<string, PostWithAuthor["author"]>();
    if (authorIds.length === 0) return results;

    try {
      const now = Date.now();
      const uniqueAuthorIds = [...new Set(authorIds)];
      const missingAuthorIds = uniqueAuthorIds.filter((authorId) => {
        const cached = this.authorDetailsCache.get(authorId);
        if (cached && cached.expiresAt > now) {
          results.set(authorId, cached.data);
          return false;
        }
        return true;
      });

      if (missingAuthorIds.length === 0) {
        return results;
      }

      // Supabase 'in' queries support max 10 items; chunk if needed
      const chunks: string[][] = [];
      for (let i = 0; i < missingAuthorIds.length; i += 10) {
        chunks.push(missingAuthorIds.slice(i, i + 10));
      }

      await Promise.all(
        chunks.map(async (chunk) => {
          const { data: rows, error } = await this.client.from("profiles")
            .select("id,username,display_name,avatar_url").in("id", chunk);
          if (error) throw error;
          (rows ?? []).forEach((data) => {
            const author = {
              id: data.id,
              user_id: data.id,
              username: data.username || `user_${data.id.slice(0, 8)}`,
              display_name: data.display_name || null,
              avatar_url: data.avatar_url || "",
            };
            results.set(data.id, author);
            this.authorDetailsCache.set(data.id, {
              data: author,
              expiresAt: now + this.authorDetailsCacheTtlMs,
            });
          });
        }),
      );
    } catch (error) {
      console.error("âŒ batchGetAuthors error:", error);
    }

    return results;
  }

  async batchGetPostLikes(
    postIds: string[],
    userId: string,
    storedLikesCounts?: Map<string, number | undefined>,
  ): Promise<Map<string, { likesCount: number; isLikedByUser: boolean }>> {
    const results = new Map<
      string,
      { likesCount: number; isLikedByUser: boolean }
    >();

    // Seed defaults â€” if stored counts are provided use them, otherwise 0
    for (const id of postIds) {
      const stored = storedLikesCounts?.get(id);
      results.set(id, {
        likesCount: typeof stored === "number" ? stored : 0,
        isLikedByUser: false,
      });
    }

    if (postIds.length === 0) return results;

    try {
      const chunks: string[][] = [];
      for (let i = 0; i < postIds.length; i += 10) {
        chunks.push(postIds.slice(i, i + 10));
      }

      if (storedLikesCounts !== undefined) {
        // â”€â”€ Optimized path (posts that have likes_count on the document) â”€â”€â”€â”€
        // likesCount is already seeded above. Only buildQuery current user's own
        // likes so we can set isLikedByUser without scanning every like doc.
        //
        // Posts whose stored count is undefined (field not yet written, e.g.
        // old posts created before denormalization) fall into legacyIds and
        // go through the full scan so their count is always correct.
        const legacyIds = postIds.filter(
          (id) => typeof storedLikesCounts.get(id) !== "number",
        );
        const optimizedIds = postIds.filter(
          (id) => typeof storedLikesCounts.get(id) === "number",
        );

        const optimizedChunks: string[][] = [];
        for (let i = 0; i < optimizedIds.length; i += 10)
          optimizedChunks.push(optimizedIds.slice(i, i + 10));

        const legacyChunks: string[][] = [];
        for (let i = 0; i < legacyIds.length; i += 10)
          legacyChunks.push(legacyIds.slice(i, i + 10));

        await Promise.all([
          // Narrow user-only buildQuery for posts with a stored count
          ...optimizedChunks.map(async (chunk) => {
            const { data: rows, error } = await this.client.from("post_reactions").select("post_id")
              .eq("user_id", userId).eq("reaction", "LIKE").in("post_id", chunk);
            if (error) throw error;
            (rows ?? []).forEach((row) => {
              const pid = row.post_id as string;
              const existing = results.get(pid)!;
              results.set(pid, { ...existing, isLikedByUser: true });
            });
          }),
          // Full scan for posts without a stored count
          ...legacyChunks.map(async (chunk) => {
            const { data: rows, error } = await this.client.from("post_reactions").select("post_id,user_id")
              .eq("reaction", "LIKE").in("post_id", chunk);
            if (error) throw error;
            const byPost = new Map<string, Array<{ user_id: string }>>();
            (rows ?? []).forEach((d) => {
              const pid = d.post_id as string;
              if (!byPost.has(pid)) byPost.set(pid, []);
              byPost.get(pid)!.push({ user_id: d.user_id });
            });
            for (const pid of chunk) {
              const likes = byPost.get(pid) || [];
              results.set(pid, {
                likesCount: likes.length,
                isLikedByUser: likes.some((l) => l.user_id === userId),
              });
            }
          }),
        ]);
      } else {
        // â”€â”€ Legacy path (no stored counts provided by caller) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Read ALL like docs per chunk to derive count + user status.
        await Promise.all(
          chunks.map(async (chunk) => {
            const { data: rows, error } = await this.client.from("post_reactions").select("post_id,user_id")
              .eq("reaction", "LIKE").in("post_id", chunk);
            if (error) throw error;

            const byPost = new Map<string, Array<{ user_id: string }>>();
            (rows ?? []).forEach((d) => {
              const pid = d.post_id as string;
              if (!byPost.has(pid)) byPost.set(pid, []);
              byPost.get(pid)!.push({ user_id: d.user_id });
            });

            for (const pid of chunk) {
              const likes = byPost.get(pid) || [];
              results.set(pid, {
                likesCount: likes.length,
                isLikedByUser: likes.some((l) => l.user_id === userId),
              });
            }
          }),
        );
      }
    } catch (error) {
      console.error("âŒ batchGetPostLikes error:", error);
    }

    return results;
  }

  async batchGetPostCommentsCounts(
    postIds: string[],
    storedCommentsCounts?: Map<string, number | undefined>,
  ): Promise<Map<string, number>> {
    const results = new Map<string, number>();

    if (postIds.length === 0) return results;

    if (storedCommentsCounts !== undefined) {
      // â”€â”€ Optimized path â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // Use the comments_count field stored on the post document.
      // No Postgres reads needed for posts that have this field.
      const needsQuery: string[] = [];
      for (const id of postIds) {
        const stored = storedCommentsCounts.get(id);
        if (typeof stored === "number") {
          results.set(id, stored);
        } else {
          results.set(id, 0);
          needsQuery.push(id); // old posts without the stored field
        }
      }
      if (needsQuery.length === 0) return results;
      // Fall through with only the legacy posts that need querying
      postIds = needsQuery;
    } else {
      // Initialise all with 0 for legacy path
      for (const id of postIds) {
        results.set(id, 0);
      }
    }

    try {
      const chunks: string[][] = [];
      for (let i = 0; i < postIds.length; i += 10) {
        chunks.push(postIds.slice(i, i + 10));
      }

      await Promise.all(
        chunks.map(async (chunk) => {
          const { data: rows, error } = await this.client.from("post_comments").select("post_id")
            .in("post_id", chunk);
          if (error) throw error;

          const counts = new Map<string, number>();
          (rows ?? []).forEach((row) => {
            const pid = row.post_id as string;
            counts.set(pid, (counts.get(pid) || 0) + 1);
          });

          for (const pid of chunk) {
            results.set(pid, counts.get(pid) || 0);
          }
        }),
      );
    } catch (error) {
      console.error("âŒ batchGetPostCommentsCounts error:", error);
    }

    return results;
  }

  subscribeToPostLikes(
    postId: string,
    callback: (
      likes: Array<{
        userId: string;
        name: string;
        username: string;
        avatar: string;
        tapCount: number;
      }>,
    ) => void,
  ): Unsubscribe {
    const authorCache = new Map<string, PostWithAuthor["author"]>();
    let active = true;
    const load = async () => {
        const { data: rawLikes, error } = await this.client.from("post_reactions")
          .select(LIKE_FIELDS).eq("post_id", postId).eq("reaction", "LIKE")
          .order("taps", { ascending: false }).limit(100);
        if (!active) return;
        if (error) throw error;
        const authorIds = [...new Set<string>(rawLikes.map((like) => String(like.user_id)))];
        const missingAuthorIds = authorIds.filter((id) => !authorCache.has(id));

        if (missingAuthorIds.length > 0) {
          const fetchedAuthors = await this.batchGetAuthors(missingAuthorIds);
          fetchedAuthors.forEach((author, id) => {
            if (author) authorCache.set(id, author);
          });
        }

        const likes = rawLikes.map((like) => {
          const authorId = String(like.user_id);
          const author = authorCache.get(authorId);
          const fallbackUsername = `user_${authorId.slice(0, 8)}`;

          return {
            userId: like.user_id,
            name: author?.display_name || author?.username || fallbackUsername,
            username: author?.username || fallbackUsername,
            avatar: author?.avatar_url || "",
            tapCount: like.taps || 1,
          };
        });

        callback(likes);
    };
    void load().catch((error) => console.error("Real-time likes subscription error:", error));
    const channel = this.client.channel(`feed:post-likes:${postId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "post_reactions", filter: `post_id=eq.${postId}` }, () => { void load().catch((error) => console.error("Real-time likes subscription error:", error)); })
      .subscribe();
    return () => { active = false; void this.client.removeChannel(channel); };
  }
}

export const feedService = guardCircleResult(new FeedService());
