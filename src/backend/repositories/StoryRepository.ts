import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  IStoryRepository,
  Story,
  CreateStoryRequest,
  StoryWithViewerInfo,
} from "../domain/interfaces/IStoryRepository";

type StoryRow = {
  id: string;
  author_id: string;
  body: string;
  media_path: string | null;
  visibility: "PUBLIC" | "FRIENDS" | "PRIVATE" | "CLOSE_FRIENDS";
  expires_at: string;
  created_at: string;
  legacy_payload: Record<string, any> | null;
};

function mapStory(row: StoryRow, views: Array<{ viewer_id: string }> = []): Story {
  const extra = row.legacy_payload ?? {};
  const viewers = views.map((item) => item.viewer_id);
  return {
    id: row.id,
    userId: row.author_id,
    mediaUrl: typeof extra.mediaUrl === "string" ? extra.mediaUrl : row.media_path ?? "",
    mediaType: extra.mediaType === "video" ? "video" : "image",
    storyType: extra.storyType === "dedication" ? "dedication" : "personal",
    dedicatedToUserId: typeof extra.dedicatedToUserId === "string" ? extra.dedicatedToUserId : null,
    storyText: extra.storyText ?? null,
    storyFilter: typeof extra.storyFilter === "string" ? extra.storyFilter : "original",
    storyMusic: extra.storyMusic ?? null,
    storyDrawPaths: Array.isArray(extra.storyDrawPaths) ? extra.storyDrawPaths : [],
    visibility: row.visibility || "FRIENDS",
    caption: row.body || null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    viewCount: viewers.length,
    viewers,
    viewerViewCounts: Object.fromEntries(viewers.map((id) => [id, 1])),
  };
}

export class StoryRepository implements IStoryRepository {
  private get client() { return getSupabaseBrowserClient(); }

  async createStory(request: CreateStoryRequest): Promise<Story> {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const extra = {
      mediaUrl: request.mediaUrl,
      mediaType: request.mediaType,
      storyType: request.storyType || "personal",
      dedicatedToUserId: request.dedicatedToUserId || null,
      storyText: request.storyText || null,
      storyFilter: request.storyFilter || "original",
      storyMusic: request.storyMusic || null,
      storyDrawPaths: request.storyDrawPaths || [],
    };
    const { data, error } = await this.client.from("stories").insert({
      author_id: request.userId,
      body: request.caption || "",
      media_path: request.mediaUrl,
      visibility: request.visibility || "FRIENDS",
      expires_at: expiresAt,
      legacy_payload: extra,
    }).select("id,author_id,body,media_path,visibility,expires_at,created_at,legacy_payload").single();
    if (error) throw error;
    return mapStory(data as StoryRow);
  }

  async getStoryById(storyId: string): Promise<Story | null> {
    const [{ data, error }, views] = await Promise.all([
      this.client.from("stories").select("id,author_id,body,media_path,visibility,expires_at,created_at,legacy_payload").eq("id", storyId).maybeSingle(),
      this.client.from("story_views").select("viewer_id").eq("story_id", storyId).limit(1000),
    ]);
    if (error || !data) return null;
    return mapStory(data as StoryRow, views.data ?? []);
  }

  async getStoriesByUserId(userId: string): Promise<Story[]> {
    const { data, error } = await this.client.from("stories")
      .select("id,author_id,body,media_path,visibility,expires_at,created_at,legacy_payload")
      .eq("author_id", userId).gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100);
    if (error) return [];
    // Viewer rows are loaded separately as one grouped count RPC by StoryService.
    // Do not transfer every viewer just to render the owner's story list.
    return (data as StoryRow[] | null ?? []).map((row) => mapStory(row));
  }

  async getActiveStoriesForUser(userId: string): Promise<Story[]> {
    return this.getStoriesByUserId(userId);
  }

  async getFriendsStories(userId: string): Promise<StoryWithViewerInfo[]> {
    const { data, error } = await this.client.rpc("get_friend_stories", {
      p_user_id: userId,
      p_limit: 200,
    });
    if (error) return [];

    // The bounded RPC joins authorized friendships, profiles, active stories,
    // viewer state, and view counts in one request. Do not recreate the old
    // friendship -> stories -> views -> profiles request chain here.
    return ((data ?? []) as Array<Record<string, any>>).map((row) => {
      const metadata = row.metadata ?? row.legacy_payload ?? {};
      const hasViewed = Boolean(row.has_viewed);
      const story: Story = {
        id: String(row.id),
        userId: String(row.author_id),
        mediaUrl: metadata.mediaUrl ?? metadata.media_url ?? row.media_path ?? "",
        mediaType: metadata.mediaType === "video" || metadata.media_type === "video" ? "video" : "image",
        storyType: metadata.storyType === "dedication" ? "dedication" : "personal",
        dedicatedToUserId: row.dedicated_to_id ?? metadata.dedicatedToUserId ?? null,
        storyText: row.body || metadata.storyText || null,
        storyFilter: metadata.storyFilter ?? "original",
        storyMusic: metadata.storyMusic ?? null,
        storyDrawPaths: Array.isArray(metadata.storyDrawPaths) ? metadata.storyDrawPaths : [],
        visibility: row.visibility || "FRIENDS",
        caption: row.body || null,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        viewCount: Number(row.view_count ?? 0),
        viewers: hasViewed ? [userId] : [],
        viewerViewCounts: hasViewed ? { [userId]: 1 } : {},
      };
      const dedicatedTo = row.dedicated_to_id
        ? {
            id: String(row.dedicated_to_id),
            username: row.dedicated_to_username || `user_${String(row.dedicated_to_id).slice(-6)}`,
            displayName: row.dedicated_to_display_name || row.dedicated_to_username || "User",
            avatar: row.dedicated_to_avatar || "",
          }
        : null;
      return {
        ...story,
        author: {
          id: String(row.author_id),
          username: row.author_username || `user_${String(row.author_id).slice(-6)}`,
          displayName: row.author_display_name || row.author_username || "User",
          avatar: row.author_avatar || "",
        },
        dedicatedTo,
        hasViewed,
      };
    });
  }

  async markStoryAsViewed(storyId: string, _viewerId: string): Promise<void> {
    void _viewerId;
    const { error } = await this.client.rpc("record_story_view", { p_story_id: storyId });
    if (error) throw error;
  }

  async deleteStory(storyId: string): Promise<void> {
    const { error } = await this.client.from("stories").delete().eq("id", storyId);
    if (error) throw error;
  }

  async deleteExpiredStories(userId: string): Promise<void> {
    const { error } = await this.client.from("stories").delete().eq("author_id", userId).lte("expires_at", new Date().toISOString());
    if (error) throw error;
  }

  async isUserViewerOfStory(storyId: string, viewerId: string): Promise<boolean> {
    const { data } = await this.client.from("story_views").select("story_id").eq("story_id", storyId).eq("viewer_id", viewerId).maybeSingle();
    return Boolean(data);
  }
}
