// Dare Interactions Service
// Handles views tracking, comments CRUD, and share-to-DM functionality
// All Supabase calls are encapsulated here per ARCHITECTURE_CONTRACT.md

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Unsubscribe } from "@/types/realtime";
import { messagingService } from "./messaging.service";
import { logBackendError } from "@/utils/backendErrors";
import { scheduleRefresh } from "@/lib/realtime/scheduleRefresh";

// â”€â”€â”€ DTOs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface DareView {
  id: string;
  dareId: string;
  userId: string;
  createdAt: string;
}

export interface DareComment {
  id: string;
  dareId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  text: string;
  likes: number;
  parentId?: string | null;
  createdAt: string;
}

export interface DareViewCount {
  dareId: string;
  count: number;
}

export interface DareVoter {
  id: string;
  odareId: string;
  oduserId: string;
  vote: "REAL" | "FAKE";
  displayName: string;
  username: string;
  avatarUrl: string;
  createdAt: string;
}

export interface DareVoteData {
  realVoters: DareVoter[];
  fakeVoters: DareVoter[];
  realCount: number;
  fakeCount: number;
  total: number;
  userVote: "REAL" | "FAKE" | null;
  revision?: number;
}

export interface DareMediaLike {
  id: string;
  dareId: string;
  userId: string;
  createdAt: string;
}

// â”€â”€â”€ Service â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class DareInteractionsService {
  private get client() {
    return getSupabaseBrowserClient();
  }

  private subscribeCount(tableName: string, filterColumn: string, filterValue: string, callback: (count: number) => void): Unsubscribe {
    let active = true;
    const load = async () => {
      const { count, error } = await this.client.from(tableName).select("*", { count: "exact", head: true }).eq(filterColumn, filterValue);
      if (active && !error) callback(count ?? 0);
    };
    const refresh = scheduleRefresh(() => { void load(); });
    void load();
    const channel = this.client.channel(`dare-interactions:${tableName}:${filterValue}`).on("postgres_changes", { event: "*", schema: "public", table: tableName, filter: `${filterColumn}=eq.${filterValue}` }, refresh.schedule).subscribe();
    return () => { active = false; refresh.cancel(); void this.client.removeChannel(channel); };
  }
  // â”€â”€ Views â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /** Record that a user viewed a dare. Idempotent â€” only one view per user per dare. */
  async recordView(dareId: string, userId: string): Promise<void> {
    try {
      // The relational composite key makes duplicate views no-ops.
      const { error } = await this.client.from("dare_views").upsert({
        dare_id: dareId,
        user_id: userId,
        created_at: new Date().toISOString(),
      }, { onConflict: "dare_id,user_id", ignoreDuplicates: true });
      if (error) throw error;
    } catch (error) {
      console.error("âŒ recordView:", error);
    }
  }

  /** Get the number of unique viewers for a dare. */
  async getViewCount(dareId: string): Promise<number> {
    try {
      const { count, error } = await this.client.from("dare_views")
        .select("*", { count: "exact", head: true }).eq("dare_id", dareId);
      if (error) throw error;
      return count ?? 0;
    } catch (error) {
      console.error("âŒ getViewCount:", error);
      return 0;
    }
  }

  /** Get view counts for multiple dares in one batch. */
  async getViewCounts(dareIds: string[]): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    if (dareIds.length === 0) return counts;

    try {
      const { data: rows, error } = await this.client.rpc("get_dare_interaction_counts", { p_dare_ids: dareIds });
      if (!error) (rows ?? []).forEach((row) => { counts[String(row.dare_id)] = Number(row.view_count) || 0; });
      else {
        const fallback = await this.client.from("dare_views").select("dare_id").in("dare_id", dareIds);
        if (fallback.error) throw fallback.error;
        (fallback.data ?? []).forEach((row) => { counts[String(row.dare_id)] = (counts[String(row.dare_id)] || 0) + 1; });
      }

      // Fill in zeros for dares with no views
      for (const id of dareIds) {
        if (!(id in counts)) counts[id] = 0;
      }
    } catch (error) {
      console.error("âŒ getViewCounts:", error);
    }
    return counts;
  }

  /** Subscribe to real-time view count changes for a dare. */
  subscribeToViewCount(
    dareId: string,
    callback: (count: number) => void,
  ): Unsubscribe {
    return this.subscribeCount("dare_views", "dare_id", dareId, callback);
  }

  // â”€â”€ Comments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /** Like a dare media item. Idempotent: one like doc per user per dare. */
  async likeMedia(dareId: string, userId: string): Promise<void> {
    try {
      const { error } = await this.client.from("dare_media_likes").upsert({
        dare_id: dareId,
        user_id: userId,
        created_at: new Date().toISOString(),
      }, { onConflict: "dare_id,user_id", ignoreDuplicates: true });
      if (error) throw error;
    } catch (error) {
      console.error("âŒ likeMedia:", error);
      throw error;
    }
  }

  /** Subscribe to real-time media like count for a dare. */
  subscribeToMediaLikeCount(
    dareId: string,
    callback: (count: number) => void,
  ): Unsubscribe {
    return this.subscribeCount("dare_media_likes", "dare_id", dareId, callback);
  }

  /** Subscribe to whether the current user already liked this dare media. */
  subscribeToUserMediaLike(
    dareId: string,
    userId: string,
    callback: (liked: boolean) => void,
  ): Unsubscribe {
    let active = true;
    const load = async () => { const { data, error } = await this.client.from("dare_media_likes").select("dare_id").eq("dare_id", dareId).eq("user_id", userId).maybeSingle(); if (active && !error) callback(Boolean(data)); };
    const refresh = scheduleRefresh(() => { void load(); });
    void load(); const channel = this.client.channel(`dare-media-like:${dareId}:${userId}`).on("postgres_changes", { event: "*", schema: "public", table: "dare_media_likes", filter: `dare_id=eq.${dareId}` }, refresh.schedule).subscribe(); return () => { active = false; refresh.cancel(); void this.client.removeChannel(channel); };
  }

  /** Add a comment to a dare. */
  async addComment(
    dareId: string,
    userId: string,
    username: string,
    displayName: string,
    avatarUrl: string,
    text: string,
    parentId?: string | null,
  ): Promise<DareComment> {
    try {
      const commentData: Record<string, any> = {
        dare_id: dareId,
        user_id: userId,
        username,
        display_name: displayName,
        avatar_url: avatarUrl,
        text,
        likes: 0,
        created_at: new Date().toISOString(),
      };
      if (parentId) {
        commentData.parent_id = parentId;
      }

      const { data: commentRef, error } = await this.client.from("dare_comments")
        .insert(commentData).select("id").single();
      if (error) throw error;

      return {
        id: commentRef.id,
        dareId,
        userId,
        username,
        displayName,
        avatarUrl,
        text,
        likes: 0,
        parentId: parentId || null,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("âŒ addComment:", error);
      throw error;
    }
  }

  /** Delete a comment (only by author). */
  async deleteComment(commentId: string): Promise<void> {
    try {
      const { error } = await this.client.from("dare_comments").delete().eq("id", commentId);
      if (error) throw error;
    } catch (error) {
      console.error("âŒ deleteComment:", error);
      throw error;
    }
  }

  /** Bounded page contract; callers needing the complete legacy list use getComments(), which drains pages. */
  async getCommentsPage(dareId: string, page = 0, pageSize = 100): Promise<{ comments: DareComment[]; hasMore: boolean }> {
    const safePage = Math.max(0, Math.floor(page)); const safeSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
    const { data: rows, error } = await this.client.from("dare_comments").select("id,dare_id,user_id,username,display_name,avatar_url,text,likes,parent_id,created_at").eq("dare_id", dareId).order("created_at", { ascending: true }).order("id", { ascending: true }).range(safePage * safeSize, (safePage + 1) * safeSize - 1);
    if (error) throw error;
    return { comments: (rows ?? []).map((row) => this.mapComment(row.id, row)), hasMore: (rows ?? []).length === safeSize };
  }

  /** Get all comments for a dare through bounded pages. */
  async getComments(dareId: string): Promise<DareComment[]> {
    try {
      const comments: DareComment[] = []; for (let page = 0;; page += 1) { const result = await this.getCommentsPage(dareId, page); comments.push(...result.comments); if (!result.hasMore) return comments; }
    } catch (error) {
      console.error("âŒ getComments:", error);
      return [];
    }
  }

  /** Get comment count for a dare. */
  async getCommentCount(dareId: string): Promise<number> {
    try {
      const { count, error } = await this.client.from("dare_comments")
        .select("id", { count: "exact", head: true }).eq("dare_id", dareId);
      if (error) throw error;
      return count ?? 0;
    } catch (error) {
      console.error("âŒ getCommentCount:", error);
      return 0;
    }
  }

  /** Get comment counts for multiple dares in one batch. */
  async getCommentCounts(dareIds: string[]): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    if (dareIds.length === 0) return counts;

    try {
      const { data: rows, error } = await this.client.rpc("get_dare_interaction_counts", { p_dare_ids: dareIds });
      if (!error) (rows ?? []).forEach((row) => { counts[String(row.dare_id)] = Number(row.comment_count) || 0; });
      else {
        const fallback = await this.client.from("dare_comments").select("dare_id").in("dare_id", dareIds);
        if (fallback.error) throw fallback.error;
        (fallback.data ?? []).forEach((row) => { counts[String(row.dare_id)] = (counts[String(row.dare_id)] || 0) + 1; });
      }

      for (const id of dareIds) {
        if (!(id in counts)) counts[id] = 0;
      }
    } catch (error) {
      console.error("âŒ getCommentCounts:", error);
    }
    return counts;
  }

  /** Subscribe to real-time comments for a dare. */
  subscribeToComments(
    dareId: string,
    callback: (comments: DareComment[]) => void,
  ): Unsubscribe {
    let active = true; const load = async () => { const { data, error } = await this.client.from("dare_comments").select("id,dare_id,user_id,username,display_name,avatar_url,text,likes,parent_id,created_at").eq("dare_id", dareId).order("created_at", { ascending: true }).order("id", { ascending: true }).limit(100); if (active && !error) callback((data ?? []).map((row) => this.mapComment(row.id, row))); }; const refresh = scheduleRefresh(() => void load()); void load(); const channel = this.client.channel(`dare-comments:${dareId}`).on("postgres_changes", { event: "*", schema: "public", table: "dare_comments", filter: `dare_id=eq.${dareId}` }, () => { refresh.schedule(); }).subscribe(); return () => { active = false; refresh.cancel(); void this.client.removeChannel(channel); };
  }

  /** Subscribe to real-time comment count for a dare. */
  subscribeToCommentCount(
    dareId: string,
    callback: (count: number) => void,
  ): Unsubscribe {
    return this.subscribeCount("dare_comments", "dare_id", dareId, callback);
  }

  /** Like a comment. Idempotent: one like doc per user per comment. */
  async likeComment(commentId: string, userId: string): Promise<void> {
    try {
      const { error } = await this.client.from("dare_comment_likes").upsert({
        comment_id: commentId,
        user_id: userId,
        created_at: new Date().toISOString(),
      }, { onConflict: "comment_id,user_id", ignoreDuplicates: true });
      if (error) throw error;
    } catch (error) {
      console.error("âŒ likeComment:", error);
      throw error;
    }
  }

  /** Subscribe to comment like count. */
  subscribeToCommentLikeCount(
    commentId: string,
    callback: (count: number) => void,
  ): Unsubscribe {
    return this.subscribeCount("dare_comment_likes", "comment_id", commentId, callback);
  }

  /** Subscribe to whether the current user already liked this comment. */
  subscribeToUserCommentLike(
    commentId: string,
    userId: string,
    callback: (liked: boolean) => void,
  ): Unsubscribe {
    let active = true; const load = async () => { const { data, error } = await this.client.from("dare_comment_likes").select("comment_id").eq("comment_id", commentId).eq("user_id", userId).maybeSingle(); if (active && !error) callback(Boolean(data)); }; const refresh = scheduleRefresh(() => { void load(); }); void load(); const channel = this.client.channel(`dare-comment-like:${commentId}:${userId}`).on("postgres_changes", { event: "*", schema: "public", table: "dare_comment_likes", filter: `comment_id=eq.${commentId}` }, refresh.schedule).subscribe(); return () => { active = false; refresh.cancel(); void this.client.removeChannel(channel); };
  }

  // â”€â”€ Share to DM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /** Send a dare to a friend via DM. Creates or gets conversation, then sends a message. */
  async shareDareToDM(
    senderId: string,
    recipientId: string,
    dareId: string,
    dareDescription: string,
    challengerName: string,
    receiverName: string,
  ): Promise<boolean> {
    try {
      // Get or create conversation between the two users
      const conversation = await messagingService.getOrCreateConversation(
        senderId,
        recipientId,
      );

      // Send the dare as a message
      const content = `Check out this dare! ${challengerName} dared ${receiverName}: "${dareDescription}"`;
      await messagingService.sendMessage({
        conversation_id: conversation.id,
        sender_id: senderId,
        content,
      });

      return true;
    } catch (error) {
      console.error("âŒ shareDareToDM:", error);
      return false;
    }
  }

  // â”€â”€ Votes (Real / Fake) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /** Record a user's vote on a dare. Idempotent â€” updates if already voted. */
  async recordVote(
    dareId: string,
    voterId: string,
    vote: "REAL" | "FAKE",
  ): Promise<void> {
    try {
      // Check for existing vote
      const { error } = await this.client.from("dare_votes").upsert({
        dare_id: dareId,
        voter_id: voterId,
        vote: vote === "REAL" ? "APPROVE" : "REJECT",
        created_at: new Date().toISOString(),
      }, { onConflict: "dare_id,voter_id" });
      if (error) throw error;
    } catch (error) {
      console.error("âŒ recordVote:", error);
      throw error;
    }
  }

  /** Subscribe to real-time vote data for a dare, enriched with voter profiles. */
  subscribeToVotes(
    dareId: string,
    currentUserId: string,
    callback: (data: DareVoteData) => void,
  ): Unsubscribe {
    let active = true;
    const load = async () => {
      const { data, error } = await this.client.rpc("get_dare_vote_snapshot", { p_dare_id: dareId });
      if (!active || error || !data || typeof data !== "object") return;
      const snapshot = data as { voters?: any[]; realCount?: number; fakeCount?: number; total?: number; userVote?: "REAL" | "FAKE" | null; revision?: number };
      const realVoters: DareVoter[] = [];
      const fakeVoters: DareVoter[] = [];
      const voters = Array.isArray(snapshot.voters) ? snapshot.voters : [];
      const profileMap = await this.getUserProfiles(voters.map((row) => String(row.voter_id || "")));

      for (const row of voters) {
        const profile = profileMap.get(String(row.voter_id)) ?? row;
        const voter = this.mapVoter(String(row.id || `${row.dare_id}_${row.voter_id}`), row, profile);
        const normalizedVote = row.vote === "REAL" || row.vote === "APPROVE" ? "REAL" : "FAKE";
        voter.vote = normalizedVote;
        if (normalizedVote === "REAL") {
          realVoters.push(voter);
        } else {
          fakeVoters.push(voter);
        }
      }

      callback({
        realVoters,
        fakeVoters,
        realCount: Number(snapshot.realCount ?? realVoters.length),
        fakeCount: Number(snapshot.fakeCount ?? fakeVoters.length),
        total: Number(snapshot.total ?? (snapshot.realCount ?? realVoters.length) + (snapshot.fakeCount ?? fakeVoters.length)),
        userVote: snapshot.userVote ?? null,
        revision: Number(snapshot.revision ?? 0),
      });
    };
    const refresh = scheduleRefresh(() => { void load(); });
    void load();
    const channel = this.client.channel(`dare-votes:${dareId}`).on("postgres_changes", { event: "*", schema: "public", table: "dare_votes", filter: `dare_id=eq.${dareId}` }, refresh.schedule).subscribe();
    return () => { active = false; refresh.cancel(); void this.client.removeChannel(channel); };
  }

  // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /** Fetch a user profile from Postgres. Cached in-memory for 5 minutes. */
  private profileCache = new Map<string, { data: any; ts: number }>();

  private async getUserProfile(userId: string): Promise<any> {
    const cached = this.profileCache.get(userId);
    if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
      return cached.data;
    }
    try {
      const { data, error } = await this.client.from("profiles")
        .select("id,username,display_name,avatar_url").eq("id", userId).maybeSingle();
      if (error) throw error;
      if (data) {
        this.profileCache.set(userId, { data, ts: Date.now() });
      }
      return data;
    } catch (error) {
      logBackendError("getUserProfile failed:", error);
      return null;
    }
  }

  private async getUserProfiles(userIds: string[]): Promise<Map<string, any>> {
    const unique = [...new Set(userIds.filter(Boolean))];
    const result = new Map<string, any>();
    const missing: string[] = [];
    unique.forEach((id) => { const cached = this.profileCache.get(id); if (cached && Date.now() - cached.ts < 5 * 60 * 1000) result.set(id, cached.data); else missing.push(id); });
    for (let i = 0; i < missing.length; i += 100) {
      const batch = missing.slice(i, i + 100);
      try {
        const { data, error } = await this.client.from("profiles").select("id,username,display_name,avatar_url").in("id", batch);
        if (error) throw error;
        (data ?? []).forEach((profile: any) => { result.set(profile.id, profile); this.profileCache.set(profile.id, { data: profile, ts: Date.now() }); });
      } catch (error) { logBackendError("getUserProfiles failed:", error); }
    }
    return result;
  }

  private mapVoter(docId: string, data: any, profile: any): DareVoter {
    let createdAt = new Date().toISOString();
    if (data.created_at) {
      if (typeof data.created_at === "object" && data.created_at.toDate) {
        createdAt = data.created_at.toDate().toISOString();
      } else if (
        typeof data.created_at === "object" &&
        data.created_at.seconds
      ) {
        createdAt = new Date(data.created_at.seconds * 1000).toISOString();
      } else if (typeof data.created_at === "string") {
        createdAt = data.created_at;
      }
    }

    return {
      id: docId,
      odareId: data.dare_id,
      oduserId: data.voter_id,
      vote: data.vote,
      displayName: profile?.display_name || profile?.username || "User",
      username: profile?.username || "",
      avatarUrl: profile?.avatar_url || profile?.avatar || "",
      createdAt,
    };
  }

  private mapComment(id: string, data: any): DareComment {
    let createdAt = new Date().toISOString();
    if (data.created_at) {
      if (typeof data.created_at === "object" && data.created_at.toDate) {
        createdAt = data.created_at.toDate().toISOString();
      } else if (
        typeof data.created_at === "object" &&
        data.created_at.seconds
      ) {
        createdAt = new Date(data.created_at.seconds * 1000).toISOString();
      } else if (typeof data.created_at === "string") {
        createdAt = data.created_at;
      }
    }

    return {
      id,
      dareId: data.dare_id,
      userId: data.user_id,
      username: data.username || "",
      displayName: data.display_name || data.username || "Unknown",
      avatarUrl: data.avatar_url || "",
      text: data.text || "",
      likes: data.likes || 0,
      parentId: data.parent_id || null,
      createdAt,
    };
  }
}

export const dareInteractionsService = new DareInteractionsService();
