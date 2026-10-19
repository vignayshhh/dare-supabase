import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { scheduleRefresh } from "@/lib/realtime/scheduleRefresh";

export interface StoryReaction {
  storyId: string;
  userId: string;
  type: "like" | "hate";
  createdAt: string;
}

export interface StoryReactionStats {
  storyId: string;
  likeCount: number;
  hateCount: number;
}

export interface StoryReactionPageOptions {
  cursor?: string;
  limit?: number;
  type?: "like" | "hate";
}

export interface StoryReactionPage {
  reactions: StoryReaction[];
  nextCursor?: string;
  hasMore: boolean;
}

export const encodeStoryReactionCursor = (value: { createdAt: string; userId: string }) =>
  btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
export const decodeStoryReactionCursor = (value?: string): { createdAt: string; userId: string } | undefined => {
  if (!value) return undefined;
  try { return JSON.parse(atob(value.replace(/-/g, "+").replace(/_/g, "/"))); } catch { return undefined; }
};

class StoryReactionService {
  async toggleReaction(storyId: string, _userId: string, type: "like" | "hate") {
    const { data, error } = await getSupabaseBrowserClient().rpc(
      "toggle_story_reaction",
      { p_story_id: storyId, p_reaction: type },
    );
    if (error) {
      console.error("Error toggling story reaction:", error);
      return { success: false, currentReaction: null };
    }
    const current = data?.currentReaction;
    return {
      success: true,
      currentReaction: current === "like" || current === "hate" ? current : null,
    } as { success: boolean; currentReaction: "like" | "hate" | null };
  }

  async getUserReaction(storyId: string, userId: string): Promise<"like" | "hate" | null> {
    const { data, error } = await getSupabaseBrowserClient()
      .from("story_reactions").select("reaction")
      .eq("story_id", storyId).eq("user_id", userId).maybeSingle();
    if (error) return null;
    return data?.reaction === "like" || data?.reaction === "hate" ? data.reaction : null;
  }

  async getStoryReactions(storyId: string): Promise<StoryReaction[]> {
    return (await this.getStoryReactionPage(storyId, { limit: 500 })).reactions;
  }

  async getStoryReactionPage(storyId: string, options: StoryReactionPageOptions = {}): Promise<StoryReactionPage> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
    const cursor = decodeStoryReactionCursor(options.cursor);
    let query = getSupabaseBrowserClient()
      .from("story_reactions")
      .select("story_id,user_id,reaction,created_at")
      .eq("story_id", storyId)
      .order("created_at", { ascending: false })
      .order("user_id", { ascending: false })
      .limit(limit + 1);
    if (options.type) query = query.eq("reaction", options.type);
    if (cursor) query = query.or("created_at.lt." + cursor.createdAt + ",and(created_at.eq." + cursor.createdAt + ",user_id.lt." + cursor.userId + ")");
    const { data, error } = await query;
    if (error) return { reactions: [], hasMore: false };
    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const visible = rows.slice(0, limit);
    return {
      hasMore,
      nextCursor: hasMore && visible.length ? encodeStoryReactionCursor({ createdAt: visible[visible.length - 1].created_at, userId: visible[visible.length - 1].user_id }) : undefined,
      reactions: visible.map((row) => ({
      storyId: row.story_id,
      userId: row.user_id,
      type: row.reaction as "like" | "hate",
      createdAt: row.created_at,
      })),
    };
  }

  async getStoryStats(storyId: string): Promise<StoryReactionStats> {
    const client = getSupabaseBrowserClient();
    const [likes, hates] = await Promise.all([
      client.from("story_reactions").select("story_id", { count: "exact", head: true }).eq("story_id", storyId).eq("reaction", "like"),
      client.from("story_reactions").select("story_id", { count: "exact", head: true }).eq("story_id", storyId).eq("reaction", "hate"),
    ]);
    return {
      storyId,
      likeCount: likes.error ? 0 : likes.count ?? 0,
      hateCount: hates.error ? 0 : hates.count ?? 0,
    };
  }

  subscribeToStoryStats(storyId: string, callback: (stats: StoryReactionStats) => void) {
    const client = getSupabaseBrowserClient();
    let active = true;
    const refresh = async () => {
      const stats = await this.getStoryStats(storyId);
      if (active) callback(stats);
    };
    void refresh();
    const scheduledRefresh = scheduleRefresh(() => { void refresh(); });
    const channel = client.channel(`story-reactions:${storyId}`).on(
      "postgres_changes",
      { event: "*", schema: "public", table: "story_reactions", filter: `story_id=eq.${storyId}` },
      scheduledRefresh.schedule,
    ).subscribe();
    return () => { active = false; scheduledRefresh.cancel(); void client.removeChannel(channel); };
  }

  async getUserReactions(userId: string): Promise<Map<string, "like" | "hate">> {
    const { data, error } = await getSupabaseBrowserClient()
      .from("story_reactions").select("story_id,reaction").eq("user_id", userId).limit(500);
    if (error) return new Map();
    return new Map((data ?? []).map((row) => [row.story_id, row.reaction as "like" | "hate"]));
  }

  async deleteStoryReactions(storyId: string): Promise<void> {
    void storyId;
    // Story deletion cascades reactions in PostgreSQL.
  }
}

export const storyReactionService = new StoryReactionService();
