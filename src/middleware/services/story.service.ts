import { guardCircleResult } from "./guardCircleResult";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  Story,
  CreateStoryRequest,
  StoryWithViewerInfo,
  StoryMediaType,
  StoryTextOverlay,
  StoryMusic,
  StoryDrawPath,
} from "../../backend/domain/interfaces/IStoryRepository";
import { StoryRepository } from "../../backend/repositories/StoryRepository";
import { userService, UserProfile } from "./user.service";
import { storyReactionService } from "./story-reaction.service";
import { getDefaultAvatarUrl } from "@/utils/placeholderImages";
import { uploadOptimizedMedia } from "@/utils/mediaUpload";
const pendingStoryAssets = new Map<string, string>();

export type StoryType = "personal" | "dedication";

export interface StoryDTO {
  id: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatar: string;
  };
  media: {
    type: StoryMediaType;
    url: string;
  };
  storyType: StoryType;
  dedicatedTo?: {
    id: string;
    username: string;
    displayName: string;
    avatar: string;
  } | null;
  storyText?: StoryTextOverlay | null;
  storyFilter?: string | null;
  storyMusic?: StoryMusic | null;
  storyDrawPaths?: StoryDrawPath[];
  visibility?: "PUBLIC" | "FRIENDS" | "PRIVATE" | "CLOSE_FRIENDS";
  caption: string | null;
  createdAt: string;
  expiresAt: string;
  viewCount: number;
  hasViewed: boolean;
}

export interface CreateStoryDTO {
  mediaUrl: string;
  mediaType: StoryMediaType;
  storyType?: StoryType;
  dedicatedToUserId?: string | null;
  storyText?: StoryTextOverlay | null;
  storyFilter?: string | null;
  storyMusic?: StoryMusic | null;
  storyDrawPaths?: StoryDrawPath[];
  visibility?: "PUBLIC" | "FRIENDS" | "PRIVATE" | "CLOSE_FRIENDS";
  caption?: string;
}

export interface StoryAudienceEntry {
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  viewCount: number;
}

export interface StoryAudienceDTO {
  viewers: StoryAudienceEntry[];
  likes: StoryAudienceEntry[];
  hates: StoryAudienceEntry[];
  viewersNextCursor?: string;
  viewersHasMore?: boolean;
  reactionsNextCursor?: string;
  reactionsHasMore?: boolean;
}

export type StoryAudienceScope = "views" | "likes" | "hates" | "all";
export interface StoryAudienceOptions {
  cursor?: string;
  limit?: number;
}

const encodeAudienceCursor = (value: string) => {
  if (typeof btoa !== "undefined") return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return value;
};
const decodeAudienceCursor = (value: string | undefined) => {
  if (!value) return undefined;
  try {
    if (typeof atob === "undefined") return value;
    return atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  } catch { return undefined; }
};

class StoryService {
  private get client() {
    return getSupabaseBrowserClient();
  }
  private storyRepository: StoryRepository;
  private audienceCache = new Map<
    string,
    { data: StoryAudienceDTO; expiresAt: number }
  >();
  private profileCache = new Map<
    string,
    { data: UserProfile | null; expiresAt: number }
  >();
  private readonly audienceCacheTtlMs = 60 * 1000;
  private readonly profileCacheTtlMs = 5 * 60 * 1000;

  constructor() {
    this.storyRepository = new StoryRepository();
  }

  private clearAudienceCacheForStory(storyId: string) {
    for (const cacheKey of this.audienceCache.keys()) {
      if (cacheKey === storyId || cacheKey.startsWith(`${storyId}:`)) {
        this.audienceCache.delete(cacheKey);
      }
    }
  }

  async createStory(
    userId: string,
    request: CreateStoryDTO,
  ): Promise<StoryDTO | null> {
    try {
      const storyRequest: CreateStoryRequest = {
        userId,
        mediaUrl: request.mediaUrl,
        mediaType: request.mediaType,
        storyType: request.storyType || "personal",
        dedicatedToUserId:
          request.storyType === "dedication" ? request.dedicatedToUserId : null,
        storyText: request.storyText || null,
        storyFilter: request.storyFilter || "original",
        storyMusic: request.storyMusic || null,
        storyDrawPaths: request.storyDrawPaths || [],
        visibility: request.visibility || "FRIENDS",
        caption: request.caption,
      };

      const story = await this.storyRepository.createStory(storyRequest);
      const pendingAssetId = pendingStoryAssets.get(request.mediaUrl);
      if (pendingAssetId) {
        await getSupabaseBrowserClient().rpc("attach_media_asset", {
          p_asset_id: pendingAssetId,
          p_reference_type: "story",
          p_reference_id: story.id,
        });
        pendingStoryAssets.delete(request.mediaUrl);
      }

      const [userProfile, dedicatedProfile] = await Promise.all([
        userService.getProfile(userId),
        story.dedicatedToUserId
          ? userService.getProfile(story.dedicatedToUserId)
          : Promise.resolve(null),
      ]);
      if (!userProfile) {
        throw new Error("User profile not found");
      }

      const storyDTO = this.convertToStoryDTO(
        story,
        userProfile,
        dedicatedProfile,
      );


      return storyDTO;
    } catch (error) {
      console.error("Error creating story:", error);
      return null;
    }
  }

  async getFriendsStories(userId: string): Promise<StoryDTO[]> {
    try {
      const storiesWithViewerInfo =
        await this.storyRepository.getFriendsStories(userId);

      // Native story-feed rows already include the authorized author projection.
      // Reuse it instead of issuing another profile batch request for every feed
      // open. The fallback below remains for older repository implementations.
      if (storiesWithViewerInfo.every((story) => Boolean(story.author))) {
        return storiesWithViewerInfo.map((story) => ({
          id: story.id,
          author: story.author,
          media: { type: story.mediaType, url: story.mediaUrl },
          storyType: story.storyType || "personal",
          dedicatedTo: story.dedicatedTo || null,
          storyText: story.storyText || null,
          storyFilter: story.storyFilter || "original",
          storyMusic: story.storyMusic || null,
          storyDrawPaths: story.storyDrawPaths || [],
          visibility: story.visibility,
          caption: story.caption,
          createdAt: story.createdAt,
          expiresAt: story.expiresAt,
          viewCount: story.viewCount,
          hasViewed: story.hasViewed,
        }));
      }

      const authorIds = [
        ...new Set(
          storiesWithViewerInfo
            .flatMap((s) => [s.userId, s.dedicatedToUserId])
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const authorProfiles = await this.getAuthorProfiles(authorIds);

      return storiesWithViewerInfo.map((story) => {
        let authorProfile = authorProfiles.find(
          (p) => p.user_id === story.userId,
        );
        const dedicatedProfile = story.dedicatedToUserId
          ? authorProfiles.find(
              (p) =>
                p.user_id === story.dedicatedToUserId ||
                p.id === story.dedicatedToUserId,
            )
          : null;

        console.log(
          `ðŸ” Processing story ${story.id} - Looking for profile with userId: ${story.userId}`,
        );
        console.log(
          `ðŸ” Available profiles:`,
          authorProfiles.map((p) => ({
            user_id: p.user_id,
            id: p.id,
            username: p.username,
            display_name: p.display_name,
          })),
        );
        console.log(`ðŸ” Found author profile by user_id:`, authorProfile);

        // Fallback: try matching by id field if user_id doesn't match
        if (!authorProfile) {
          authorProfile = authorProfiles.find((p) => p.id === story.userId);
          console.log(`ðŸ” Found author profile by id:`, authorProfile);
        }

        // Final fallback: try partial matching
        if (!authorProfile) {
          authorProfile = authorProfiles.find(
            (p) =>
              (p.user_id && p.user_id.includes(story.userId)) ||
              story.userId.includes(p.user_id || ""),
          );
          console.log(
            `ðŸ” Found author profile by partial match:`,
            authorProfile,
          );
        }

        if (!authorProfile) {
          console.warn(
            `âš ï¸ No profile found for story author ${story.userId}, using fallback`,
          );
          return {
            id: story.id,
            author: {
              id: story.userId,
              username: `@user_${story.userId.slice(-6)}`,
              displayName: "Unknown User",
              avatar: getDefaultAvatarUrl(story.userId),
            },
            media: {
              type: story.mediaType,
              url: story.mediaUrl,
            },
            storyType: story.storyType || "personal",
            dedicatedTo:
              story.dedicatedToUserId && dedicatedProfile
                ? this.profileToStoryUser(dedicatedProfile, story.dedicatedToUserId)
                : null,
            storyText: story.storyText || null,
            storyFilter: story.storyFilter || "original",
            storyMusic: story.storyMusic || null,
            storyDrawPaths: story.storyDrawPaths || [],
            visibility: story.visibility,
            caption: story.caption,
            createdAt: story.createdAt,
            expiresAt: story.expiresAt,
            viewCount: story.viewCount,
            hasViewed: story.hasViewed,
          };
        }

        console.log(
          `âœ… Using real profile for ${story.userId}:`,
          authorProfile.display_name || authorProfile.username,
        );
        return this.convertToStoryDTO(story, authorProfile, dedicatedProfile);
      });
    } catch (error) {
      console.error("Error fetching friends stories:", error);
      return [];
    }
  }

  async getUserStories(userId: string): Promise<StoryDTO[]> {
    try {
      const stories = await this.storyRepository.getStoriesByUserId(userId);
      const dedicatedIds = [
        ...new Set(
          stories
            .map((story) => story.dedicatedToUserId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const [userProfile, profilesById] = await Promise.all([
        userService.getProfile(userId),
        this.getProfilesByIdsBatch(dedicatedIds),
      ]);
      const viewCounts = await this.getStoryViewCounts(
        stories.map((story) => story.id),
      );

      if (!userProfile) {
        return [];
      }

      return stories.map((story) =>
        this.convertToStoryDTO(
          {
            ...story,
            viewCount: viewCounts.get(story.id) ?? story.viewCount,
          },
          userProfile,
          story.dedicatedToUserId
            ? profilesById.get(story.dedicatedToUserId) || null
            : null,
        ),
      );
    } catch (error) {
      console.error("Error fetching user stories:", error);
      return [];
    }
  }

  async markStoryAsViewed(storyId: string, viewerId: string): Promise<void> {
    try {
      await this.storyRepository.markStoryAsViewed(storyId, viewerId);
    } catch (error) {
      console.error("Error marking story as viewed:", error);
      throw error;
    }
  }

  async deleteStory(storyId: string): Promise<void> {
    try {
      await this.storyRepository.deleteStory(storyId);
      this.clearAudienceCacheForStory(storyId);
    } catch (error) {
      console.error("Error deleting story:", error);
      throw error;
    }
  }

  async cleanupExpiredStories(userId: string): Promise<void> {
    try {
      await this.storyRepository.deleteExpiredStories(userId);
    } catch (error) {
      console.error("Error cleaning up expired stories:", error);
    }
  }

  async getStoryAudience(
    storyId: string,
    scope: StoryAudienceScope = "all",
    options: StoryAudienceOptions = {},
  ): Promise<StoryAudienceDTO> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
    const cursor = decodeAudienceCursor(options.cursor);
    const cacheKey = `${storyId}:${scope}:${options.cursor ?? "first"}:${limit}`;
    const cached = this.audienceCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    try {
      const needsViewers = scope === "views" || scope === "all";
      const story = needsViewers
        ? (await this.client.from("stories").select("id").eq("id", storyId).maybeSingle()).data
        : null;

      if (needsViewers && !story) {
        return { viewers: [], likes: [], hates: [] };
      }

      let viewEntries: Array<{ userId: string; viewCount: number }> = [];
      let viewersNextCursor: string | undefined;
      let viewersHasMore = false;
      if (needsViewers) {
        let viewQuery = this.client.from("story_views")
          .select("viewer_id").eq("story_id", storyId)
          .order("viewer_id", { ascending: true })
          .limit(limit + 1);
        if (cursor) viewQuery = viewQuery.gt("viewer_id", cursor);
        const { data: rows, error } = await viewQuery;
        if (error) throw error;
        const pageRows = rows ?? [];
        viewersHasMore = pageRows.length > limit;
        const visibleRows = pageRows.slice(0, limit);
        if (viewersHasMore && visibleRows.length) {
          viewersNextCursor = encodeAudienceCursor(String(visibleRows[visibleRows.length - 1].viewer_id));
        }
        viewEntries = visibleRows
          .map((data) => {
            return {
              userId: data.viewer_id,
              viewCount: 1,
            };
          })
          .filter((entry) => Boolean(entry.userId));
      }

      const needsLikes = scope === "likes" || scope === "all";
      const needsHates = scope === "hates" || scope === "all";
      const reactionPage =
        needsLikes || needsHates
          ? await storyReactionService.getStoryReactionPage(storyId, {
              cursor: options.cursor,
              limit,
              type: scope === "likes" || scope === "hates" ? scope.slice(0, -1) as "like" | "hate" : undefined,
            })
          : { reactions: [], hasMore: false };
      const reactions = reactionPage.reactions;
      const likeUserIds = needsLikes
        ? reactions
            .filter((reaction) => reaction.type === "like")
            .map((reaction) => reaction.userId)
        : [];
      const hateUserIds = needsHates
        ? reactions
            .filter((reaction) => reaction.type === "hate")
            .map((reaction) => reaction.userId)
        : [];
      const allUserIds = [
        ...new Set([
          ...viewEntries.map((entry) => entry.userId),
          ...likeUserIds,
          ...hateUserIds,
        ]),
      ];

      const profilesById = await this.getProfilesByIdsBatch(allUserIds);

      const toEntry = (userId: string): StoryAudienceEntry | null => {
        const profile = profilesById.get(userId);
        if (!profile) return null;
        const viewCount =
          viewEntries.find((entry) => entry.userId === userId)?.viewCount ?? 1;

        return {
          userId,
          username: profile.username.startsWith("@")
            ? profile.username
            : `@${profile.username}`,
          displayName: profile.display_name || profile.username,
          avatar: profile.avatar_url || getDefaultAvatarUrl(userId),
          viewCount,
        };
      };

      const audience: StoryAudienceDTO = {
        viewers:
          viewEntries
            .map((entry) => toEntry(entry.userId))
            .filter((entry): entry is StoryAudienceEntry => Boolean(entry)),
        likes: [...new Set(likeUserIds)]
          .map((userId) => toEntry(userId))
          .filter((entry): entry is StoryAudienceEntry => Boolean(entry)),
        hates: [...new Set(hateUserIds)]
          .map((userId) => toEntry(userId))
          .filter((entry): entry is StoryAudienceEntry => Boolean(entry)),
        viewersNextCursor,
        viewersHasMore,
        reactionsNextCursor: reactionPage.nextCursor,
        reactionsHasMore: reactionPage.hasMore,
      };

      this.audienceCache.set(cacheKey, {
        data: audience,
        expiresAt: Date.now() + this.audienceCacheTtlMs,
      });

      return audience;
    } catch (error) {
      console.error("Error fetching story audience:", error);
      return { viewers: [], likes: [], hates: [] };
    }
  }

  async uploadStoryMedia(
    file: File,
    userId: string,
    onProgress?: (percent: number) => void,
  ): Promise<string> {
    if (!userId || userId === "me") {
      throw new Error("Please log in before posting a story.");
    }

    try {
      onProgress?.(5);
      const mediaKind = file.type.startsWith("video/") ? "video" : "image";
      const uploadedStoryMedia = await uploadOptimizedMedia({
        source: file,
        userId,
        context: "story",
        fileName: file.name,
        mediaKind,
      });

      onProgress?.(100);
      if (uploadedStoryMedia.assetId) pendingStoryAssets.set(uploadedStoryMedia.url, uploadedStoryMedia.assetId);
      return uploadedStoryMedia.url;
    } catch (error) {
      console.error("Story media upload failed:", error);
      throw error instanceof Error
        ? error
        : new Error("Failed to upload story media");
    }
  }

  private async getAuthorProfiles(authorIds: string[]): Promise<UserProfile[]> {
    const profiles: UserProfile[] = [];

    console.log("ðŸ” getAuthorProfiles - Fetching profiles for IDs:", authorIds);

    for (const authorId of authorIds) {
      console.log(
        `ðŸ” getAuthorProfiles - Fetching profile for author: ${authorId}`,
      );
      const profile = await userService.getProfile(authorId);
      console.log(
        `ðŸ” getAuthorProfiles - Profile result for ${authorId}:`,
        profile,
      );
      if (profile) {
        profiles.push(profile);
      } else {
        console.warn(
          `âš ï¸ getAuthorProfiles - No profile found for author: ${authorId}`,
        );
      }
    }

    console.log("ðŸ” getAuthorProfiles - Final profiles array:", profiles);
    return profiles;
  }

  private async getProfilesByIdsBatch(
    userIds: string[],
  ): Promise<Map<string, UserProfile | null>> {
    const uniqueUserIds = [...new Set(userIds)].filter(Boolean);
    const profiles = new Map<string, UserProfile | null>();
    const now = Date.now();
    const uncachedUserIds: string[] = [];

    if (uniqueUserIds.length === 0) {
      return profiles;
    }

    uniqueUserIds.forEach((userId) => {
      const cached = this.profileCache.get(userId);
      if (cached && cached.expiresAt > now) {
        profiles.set(userId, cached.data);
        return;
      }

      this.profileCache.delete(userId);
      uncachedUserIds.push(userId);
    });

    if (uncachedUserIds.length === 0) {
      return profiles;
    }

    const chunks: string[][] = [];
    for (let index = 0; index < uncachedUserIds.length; index += 10) {
      chunks.push(uncachedUserIds.slice(index, index + 10));
    }

    await Promise.all(
      chunks.map(async (chunk) => {
        const batch = await userService.getProfiles(chunk);
        batch.forEach((profile, id) => {
          profiles.set(id, profile);
          this.profileCache.set(id, {
            data: profile,
            expiresAt: Date.now() + this.profileCacheTtlMs,
          });
        });

        chunk.forEach((userId) => {
          if (!profiles.has(userId)) {
            profiles.set(userId, null);
            this.profileCache.set(userId, {
              data: null,
              expiresAt: Date.now() + this.profileCacheTtlMs,
            });
          }
        });
      }),
    );

    return profiles;
  }

  private async getStoryViewCounts(
    storyIds: string[],
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();

    for (let i = 0; i < storyIds.length; i += 30) {
      const chunk = storyIds.slice(i, i + 30);
      if (chunk.length === 0) continue;

      try {
        const { data: rows, error } = await this.client.rpc("get_story_view_counts", {
          p_story_ids: chunk,
        });
        if (error) throw error;
        for (const row of rows ?? []) counts.set(String(row.story_id), Number(row.view_count) || 0);
        continue;
      } catch (error) {
        console.warn("Unable to read grouped story view counts; using bounded compatibility paging:", error);
        const fallback = new Map<string, number>();
        for (let page = 0;; page += 1) {
          const result = await this.client.from("story_views").select("story_id").in("story_id", chunk).range(page * 500, (page + 1) * 500 - 1);
          if (result.error) throw result.error;
          for (const row of result.data ?? []) fallback.set(String(row.story_id), (fallback.get(String(row.story_id)) ?? 0) + 1);
          if ((result.data ?? []).length < 500) break;
        }
        fallback.forEach((count, storyId) => counts.set(storyId, count));
      }
    }

    return counts;
  }

  private convertToStoryDTO(
    story: Story | StoryWithViewerInfo,
    userProfile: UserProfile,
    dedicatedProfile?: UserProfile | null,
  ): StoryDTO {
    const baseStory = story as Story;
    const storyWithViewer = story as StoryWithViewerInfo;

    return {
      id: baseStory.id,
      author: {
        id: userProfile.user_id,
        username: userProfile.username.startsWith("@")
          ? userProfile.username
          : `@${userProfile.username}`,
        displayName: userProfile.display_name || userProfile.username,
        avatar:
          userProfile.avatar_url || getDefaultAvatarUrl(userProfile.user_id),
      },
      media: {
        type: baseStory.mediaType,
        url: baseStory.mediaUrl,
      },
      storyType: baseStory.storyType || "personal",
      dedicatedTo:
        baseStory.dedicatedToUserId && dedicatedProfile
          ? this.profileToStoryUser(dedicatedProfile, baseStory.dedicatedToUserId)
          : storyWithViewer.dedicatedTo || null,
      storyText: baseStory.storyText || null,
      storyFilter: baseStory.storyFilter || "original",
      storyMusic: baseStory.storyMusic || null,
      storyDrawPaths: baseStory.storyDrawPaths || [],
      visibility: baseStory.visibility,
      caption: baseStory.caption,
      createdAt: baseStory.createdAt,
      expiresAt: baseStory.expiresAt,
      viewCount: baseStory.viewCount,
      hasViewed: storyWithViewer.hasViewed || false,
    };
  }

  private profileToStoryUser(profile: UserProfile, fallbackId: string) {
    const id = profile.user_id || profile.id || fallbackId;
    return {
      id,
      username: profile.username?.startsWith("@")
        ? profile.username
        : `@${profile.username || `user_${id.slice(-6)}`}`,
      displayName: profile.display_name || profile.username || "Someone",
      avatar: profile.avatar_url || getDefaultAvatarUrl(id),
    };
  }

  isStoryExpired(story: StoryDTO): boolean {
    return new Date(story.expiresAt) <= new Date();
  }

  getTimeRemaining(story: StoryDTO): string {
    const now = new Date();
    const expiresAt = new Date(story.expiresAt);
    const diffMs = expiresAt.getTime() - now.getTime();

    if (diffMs <= 0) {
      return "Expired";
    }

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }
}

export const storyService = guardCircleResult(new StoryService());
