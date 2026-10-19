import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { scheduleRefresh } from "@/lib/realtime/scheduleRefresh";
import type { Unsubscribe } from "@/types/realtime";
import { createUuid } from "@/utils/uuid";
import { requireAuthenticatedUser } from "@/security/appSecurity";
import { useAvatarStore } from "@/stores/avatarStore";

export interface PostComment {
  id: string;
  post_id: string;
  user_id: string;
  text: string;
  likes?: number;
  parent_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommentWithAuthor extends PostComment {
  author: {
    id: string;
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export interface CreateCommentRequest {
  post_id: string;
  user_id: string;
  text: string;
  parent_id?: string | null;
}

class CommentService {
  private get client() {
    return getSupabaseBrowserClient();
  }
  private authorCache = new Map<string, CommentWithAuthor["author"] | null>();

  // SECURITY FIX (Â§1.6): Comment creation runs through the server API
  // route. Postgres rules deny client writes to `post_comments` so
  // this is the only path. The Cloud Function trigger keeps
  // `posts.comments_count` in sync, so the old manual incrementValue is
  // removed. Realtime listeners are scoped to the post.
  // pick the new comment up instantly.
  async createComment(request: CreateCommentRequest): Promise<PostComment> {
    try {
      const { apiFetch } = await import("@/lib/apiClient");
      const res = await apiFetch<{ ok: boolean; id: string }>(
        `/api/posts/${encodeURIComponent(request.post_id)}/comment`,
        {
          method: "POST",
          body: JSON.stringify({
            content: request.text,
            parent_id: request.parent_id ?? null,
          }),
        },
      );
      const now = new Date().toISOString();
      return {
        id: res.id,
        post_id: request.post_id,
        user_id: request.user_id,
        text: request.text,
        likes: 0,
        created_at: now,
        updated_at: now,
      } as PostComment;
    } catch (error) {
      console.error("Error creating comment:", error);
      if (!this.isApiAuthFailure(error)) {
        throw error;
      }

      return this.createCommentDirect(request);
    }
  }

  private isApiAuthFailure(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("API 401") || message.includes("API 403");
  }

  private async createCommentDirect(
    request: CreateCommentRequest,
  ): Promise<PostComment> {
    requireAuthenticatedUser(request.user_id);
    const now = new Date().toISOString();
    const id = createUuid();
    const commentData: Record<string, any> = {
      post_id: request.post_id,
      user_id: request.user_id,
      content: request.text,
      text: request.text,
      likes: 0,
      created_at: now,
      updated_at: now,
    };

    if (request.parent_id) {
      commentData.parent_id = request.parent_id;
    }

    const { error } = await this.client.from("post_comments").insert({ id, post_id: request.post_id, author_id: request.user_id, parent_id: request.parent_id ?? null, body: request.text, created_at: now, updated_at: now });
    if (error) throw error;

    return {
      id,
      post_id: request.post_id,
      user_id: request.user_id,
      text: request.text,
      likes: 0,
      parent_id: request.parent_id || null,
      created_at: now,
      updated_at: now,
    };
  }

  async getCommentsPage(postId: string, page = 0, pageSize = 100): Promise<{ comments: CommentWithAuthor[]; hasMore: boolean }> {
    const safePage = Math.max(0, Math.floor(page)); const safeSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
    const { data: rows, error } = await this.client.from("post_comments")
      .select("id,post_id,author_id,body,parent_id,reaction_count,created_at,updated_at")
      .eq("post_id", postId).order("created_at", { ascending: true }).order("id", { ascending: true })
      .range(safePage * safeSize, (safePage + 1) * safeSize - 1);
    if (error) throw error;
    const comments = (rows ?? []).map((row) => ({ id: row.id, post_id: row.post_id, user_id: row.author_id, text: row.body, likes: row.reaction_count ?? 0, parent_id: row.parent_id, created_at: row.created_at, updated_at: row.updated_at }) as PostComment);
    return { comments: await this.attachAuthors(comments), hasMore: (rows ?? []).length === safeSize };
  }

  async getComments(postId: string): Promise<CommentWithAuthor[]> {
    try {
      const comments: CommentWithAuthor[] = []; for (let page = 0;; page += 1) { const result = await this.getCommentsPage(postId, page); comments.push(...result.comments); if (!result.hasMore) return comments; }
    } catch (error) {
      console.error("Error getting comments:", error);
      return [];
    }
  }

  private async getCommentAuthor(
    userId: string,
  ): Promise<CommentWithAuthor["author"] | null> {
    try {
      if (this.authorCache.has(userId)) {
        return this.authorCache.get(userId) ?? null;
      }

      const { data: userData, error } = await this.client.from("profiles")
        .select("id,username,display_name,avatar_url").eq("id", userId).maybeSingle();
      if (error) throw error;
      if (!userData) {
        this.authorCache.set(userId, null);
        return null;
      }

      let avatarUrl = userData.avatar_url || "";

      try {
        const { getStoredAvatar } = useAvatarStore.getState();
        const storedAvatar = getStoredAvatar(userId);

        if (storedAvatar && storedAvatar !== avatarUrl) {
          avatarUrl = storedAvatar;
        }
      } catch {
        console.log("Could not access avatar store for user:", userId);
      }

      const author = {
        id: userData.id,
        user_id: userData.id,
        username: userData.username || `user_${userId.slice(0, 8)}`,
        display_name:
          userData.display_name ||
          `User ${userId.slice(0, 8)}`,
        avatar_url: avatarUrl,
      };

      this.authorCache.set(userId, author);
      return author;
    } catch (error) {
      console.error("Error getting comment author:", error);
      return null;
    }
  }

  private async getCommentAuthorsBatch(
    userIds: string[],
  ): Promise<Map<string, CommentWithAuthor["author"] | null>> {
    const results = new Map<string, CommentWithAuthor["author"] | null>();
    const missingUserIds = [...new Set(userIds)].filter((userId) => {
      if (!this.authorCache.has(userId)) {
        return true;
      }
      results.set(userId, this.authorCache.get(userId) ?? null);
      return false;
    });

    if (missingUserIds.length === 0) {
      return results;
    }

    const chunks: string[][] = [];
    for (let i = 0; i < missingUserIds.length; i += 10) {
      chunks.push(missingUserIds.slice(i, i + 10));
    }

    await Promise.all(
      chunks.map(async (chunk) => {
        const { data: users, error } = await this.client.from("profiles")
          .select("id,username,display_name,avatar_url").in("id", chunk);
        if (error) throw error;
        (users ?? []).forEach((userData) => {
          const author = {
            id: userData.id,
            user_id: userData.id,
            username: userData.username || `user_${userData.id.slice(0, 8)}`,
            display_name:
              userData.display_name ||
              `User ${userData.id.slice(0, 8)}`,
            avatar_url: userData.avatar_url || "",
          };
          this.authorCache.set(userData.id, author);
          results.set(userData.id, author);
        });

        chunk.forEach((userId) => {
          if (!results.has(userId)) {
            this.authorCache.set(userId, null);
            results.set(userId, null);
          }
        });
      }),
    );

    return results;
  }

  private async attachAuthors(
    comments: PostComment[],
  ): Promise<CommentWithAuthor[]> {
    const authorsMap = await this.getCommentAuthorsBatch(
      comments.map((comment) => comment.user_id),
    );

    return comments.flatMap((comment) => {
      const author = authorsMap.get(comment.user_id);
      return author
        ? [
            {
              ...comment,
              author,
            },
          ]
        : [];
    });
  }

  async deleteComment(commentId: string, userId: string): Promise<boolean> {
    try {
      const { data: commentRow, error: readError } = await this.client.from("post_comments")
        .select("id,post_id,author_id,body,parent_id,reaction_count,created_at,updated_at")
        .eq("id", commentId).maybeSingle();
      if (readError) throw readError;
      if (!commentRow) {
        throw new Error("Comment not found");
      }
      const comment = { ...commentRow, user_id: commentRow.author_id, text: commentRow.body } as PostComment;
      if (comment.user_id !== userId) {
        throw new Error("Unauthorized to delete this comment");
      }

      const { error } = await this.client.from("post_comments").delete().eq("id", commentId);
      if (error) throw error;

      return true;
    } catch (error) {
      console.error("Error deleting comment:", error);
      return false;
    }
  }

  async likeComment(commentId: string): Promise<void> {
    try {
      const { error } = await this.client.rpc("increment_comment_reaction", {
        p_comment_id: commentId,
        p_delta: 1,
      });
      if (error) throw error;
    } catch (error) {
      console.error("Error liking comment:", error);
      throw error;
    }
  }

  subscribeToComments(
    postId: string,
    callback: (comments: CommentWithAuthor[]) => void,
  ): Unsubscribe {
    let active = true;
    const load = async () => {
      const { data, error } = await this.client.from("post_comments")
        .select("id,post_id,author_id,body,parent_id,reaction_count,created_at,updated_at")
        .eq("post_id", postId).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(200);
      if (!active) return;
      if (error) throw error;
      callback(await this.attachAuthors((data ?? []).map((row) => ({ id: row.id, post_id: row.post_id, user_id: row.author_id, text: row.body, parent_id: row.parent_id, likes: row.reaction_count ?? 0, created_at: row.created_at, updated_at: row.updated_at })) as PostComment[]));
    };
    void load().catch((error) => console.error("Real-time comments subscription error:", error));
    const refresh = scheduleRefresh(() => { void load().catch((error) => console.error("Real-time comments subscription error:", error)); });
    const channel = this.client.channel(`post-comments:${postId}`).on("postgres_changes", { event: "*", schema: "public", table: "post_comments", filter: `post_id=eq.${postId}` }, refresh.schedule).subscribe();
    return () => { active = false; refresh.cancel(); void this.client.removeChannel(channel); };
  }

  async getCommentsCount(postId: string): Promise<number> {
    try {
      const { count, error } = await this.client.from("post_comments").select("id", { count: "exact", head: true }).eq("post_id", postId);
      if (error) throw error;
      return count ?? 0;
    } catch (error) {
      console.error("Error getting comments count:", error);
      return 0;
    }
  }
}

export const commentService = new CommentService();
