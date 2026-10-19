import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  storyService,
  StoryDTO,
  CreateStoryDTO,
} from "@/middleware/services/story.service";
import type { Unsubscribe } from "@/types/realtime";
import { apiFetch } from "@/lib/apiClient";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { recordResourceMetric } from "@/lib/observability/resourceMetrics";

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Race-guard counter for story bootstrap/subscription replacement.
let _friendsSubCounter = 0;
const viewedStoryIdsThisSession = new Set<string>();

const hasViewedStoryLocally = (storyId: string, userId: string) => {
  const key = `${userId}:${storyId}`;
  if (viewedStoryIdsThisSession.has(key)) return true;

  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(`story_viewed:${key}`) === "1";
};

const rememberViewedStory = (storyId: string, userId: string) => {
  const key = `${userId}:${storyId}`;
  viewedStoryIdsThisSession.add(key);
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(`story_viewed:${key}`, "1");
  }
};

type StoryBootstrapRow = {
  id: string;
  userId: string;
  mediaUrl: string | null;
  mediaType: "image" | "video" | null;
  storyType?: "personal" | "dedication";
  storyText?: StoryDTO["storyText"];
  storyFilter?: string | null;
  storyMusic?: StoryDTO["storyMusic"];
  storyDrawPaths?: StoryDTO["storyDrawPaths"];
  visibility?: StoryDTO["visibility"];
  caption?: string | null;
  createdAt: string;
  expiresAt: string;
  viewCount?: number;
  hasViewed?: boolean;
  author: StoryDTO["author"];
  dedicatedTo?: StoryDTO["dedicatedTo"];
};

const storyBootstrapRequests = new Map<string, Promise<StoryDTO[]>>();

const fetchStoryBootstrap = (userId: string): Promise<StoryDTO[]> => {
  const existing = storyBootstrapRequests.get(userId);
  if (existing) {
    recordResourceMetric("cache_hits");
    return existing;
  }
  recordResourceMetric("cache_misses");
  const request = apiFetch<{ ok: true; data: StoryBootstrapRow[] }>(
    "/api/stories/friends",
  )
    .then(({ data }) =>
      data.map((story) => ({
        id: story.id,
        author: story.author,
        media: { type: story.mediaType || "image", url: story.mediaUrl || "" },
        storyType: story.storyType || "personal",
        dedicatedTo: story.dedicatedTo || null,
        storyText: story.storyText || null,
        storyFilter: story.storyFilter || "original",
        storyMusic: story.storyMusic || null,
        storyDrawPaths: story.storyDrawPaths || [],
        visibility: story.visibility,
        caption: story.caption ?? null,
        createdAt: story.createdAt,
        expiresAt: story.expiresAt,
        viewCount: Number(story.viewCount) || 0,
        hasViewed:
          Boolean(story.hasViewed) || hasViewedStoryLocally(story.id, userId),
      })),
    )
    .finally(() => storyBootstrapRequests.delete(userId));
  storyBootstrapRequests.set(userId, request);
  return request;
};

const isDataUrl = (url?: string) =>
  typeof url === "string" && url.startsWith("data:");

const sanitizeStoryForPersist = (story: StoryDTO): StoryDTO => ({
  ...story,
  media: isDataUrl(story.media.url) ? { ...story.media, url: "" } : story.media,
  author: {
    ...story.author,
    avatar: isDataUrl(story.author.avatar) ? "" : story.author.avatar,
  },
  dedicatedTo: story.dedicatedTo
    ? {
        ...story.dedicatedTo,
        avatar: isDataUrl(story.dedicatedTo.avatar)
          ? ""
          : story.dedicatedTo.avatar,
      }
    : null,
});

// Legacy request-ID guards (used by one-shot loaders)
let friendsStoriesRequestId = 0;
let userStoriesRequestId = 0;
let inFlightStoryLoads = 0;

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface StoryState {
  // Data
  stories: StoryDTO[];
  userStories: StoryDTO[];
  isLoading: boolean;
  error: string | null;

  // Upload state
  isUploading: boolean;
  uploadProgress: number;

  // Active subscription handles (never persisted)
  _friendsUnsub: Unsubscribe | null;
  _userUnsub: Unsubscribe | null;

  // Real-time subscription actions
  subscribeToFriendsStories: (userId: string) => Promise<void>;
  subscribeToUserStories: (userId: string) => Promise<void>;
  unsubscribeFromAllStories: () => void;

  // Legacy one-shot loaders (kept for createStory / deleteStory fallbacks)
  loadFriendsStories: (userId: string) => Promise<void>;
  loadUserStories: (userId: string) => Promise<void>;

  createStory: (
    userId: string,
    request: CreateStoryDTO,
  ) => Promise<StoryDTO | null>;
  markStoryAsViewed: (storyId: string, viewerId: string) => Promise<void>;
  deleteStory: (storyId: string, userId: string) => Promise<void>;
  cleanupExpiredStories: (userId: string) => Promise<void>;
  clearError: () => void;
  reset: () => void;
  clearAllStories: () => void;
}

export const useStoryStore = create<StoryState>()(
  persist(
    (set, get) => ({
      // Initial state
      stories: [],
      userStories: [],
      isLoading: false,
      error: null,
      isUploading: false,
      uploadProgress: 0,
      _friendsUnsub: null,
      _userUnsub: null,

      // â”€â”€ Real-time subscriptions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

      subscribeToFriendsStories: async (userId: string) => {
        get()._friendsUnsub?.();
        set({ _friendsUnsub: null });
        if (!userId) {
          set({ stories: [], userStories: [], isLoading: false });
          return;
        }

        const subId = ++_friendsSubCounter;
        let disposed = false;
        let refreshTimer: ReturnType<typeof setTimeout> | null = null;
        const client = getSupabaseBrowserClient();
        let channel: ReturnType<typeof client.channel> | null = null;
        const unsubscribe = () => {
          if (disposed) return;
          disposed = true;
          if (refreshTimer) clearTimeout(refreshTimer);
          if (channel) void client.removeChannel(channel);
        };
        set({ _friendsUnsub: unsubscribe });
        const refresh = async () => {
          try {
            const allStories = await fetchStoryBootstrap(userId);
            if (disposed || subId !== _friendsSubCounter) return;
            set({
              stories: allStories.filter((story) => story.author.id !== userId),
              userStories: allStories.filter((story) => story.author.id === userId),
              isLoading: false,
              error: null,
            });
          } catch (error) {
            if (!disposed && subId === _friendsSubCounter) {
              set({
                isLoading: false,
                error: error instanceof Error ? error.message : "Failed to load stories",
              });
            }
          }
        };
        const scheduleRefresh = () => {
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => void refresh(), 100);
        };

        set({ isLoading: true, error: null });
        await refresh();
        if (disposed || subId !== _friendsSubCounter) return;

        channel = client
          .channel(`story-feed:${userId}`, { config: { private: true } })
          .on("broadcast", { event: "story_changed" }, () => {
            recordResourceMetric("realtime_messages");
            scheduleRefresh();
          });
        recordResourceMetric("realtime_joins");
        void channel.subscribe((status) => {
          if (status === "SUBSCRIBED" && !disposed) scheduleRefresh();
        });
      },

      // Own and friend stories now share one bootstrap and one Realtime channel.
      subscribeToUserStories: async (userId: string) => {
        if (!userId) set({ userStories: [] });
        if (!get()._friendsUnsub && userId) {
          await get().subscribeToFriendsStories(userId);
        }
        set({ _userUnsub: () => {} });
      },

      unsubscribeFromAllStories: () => {
        const { _friendsUnsub, _userUnsub } = get();
        if (_friendsUnsub) _friendsUnsub();
        if (_userUnsub) _userUnsub();
        set({ _friendsUnsub: null, _userUnsub: null });
      },

      // â”€â”€ Legacy one-shot loaders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

      // Load friends' stories (no blob migration)
      loadFriendsStories: async (userId: string) => {
        const requestId = ++friendsStoriesRequestId;
        inFlightStoryLoads += 1;
        set({ isLoading: true, error: null });
        try {
          const stories = await storyService.getFriendsStories(userId);
          if (requestId === friendsStoriesRequestId) {
            set({ stories });
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to load stories";
          if (requestId === friendsStoriesRequestId) {
            set({ error: errorMessage });
          }
        } finally {
          inFlightStoryLoads = Math.max(0, inFlightStoryLoads - 1);
          set({ isLoading: inFlightStoryLoads > 0 });
        }
      },

      // Load user stories
      loadUserStories: async (userId: string) => {
        const requestId = ++userStoriesRequestId;
        inFlightStoryLoads += 1;
        set({ isLoading: true, error: null });
        try {
          const stories = await storyService.getUserStories(userId);
          if (requestId === userStoriesRequestId) {
            set({ userStories: stories });
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to load user stories";
          if (requestId === userStoriesRequestId) {
            set({ error: errorMessage });
          }
        } finally {
          inFlightStoryLoads = Math.max(0, inFlightStoryLoads - 1);
          set({ isLoading: inFlightStoryLoads > 0 });
        }
      },

      // Create story â€” real Supabase Storage upload with live progress
      createStory: async (userId: string, request: CreateStoryDTO) => {
        set({ isUploading: true, uploadProgress: 0, error: null });
        try {
          const story = await storyService.createStory(userId, request);

          set({ uploadProgress: 100, isUploading: false });

          setTimeout(() => set({ uploadProgress: 0 }), 1000);

          // The scoped realtime channel reconciles the new story.
          // Only fall back to manual reload if no subscription is active.
          const { _friendsUnsub, _userUnsub } = get();
          if (!_friendsUnsub) await get().loadFriendsStories(userId);
          if (!_userUnsub) await get().loadUserStories(userId);

          return story;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to create story";
          set({ error: errorMessage, isUploading: false, uploadProgress: 0 });
          return null;
        }
      },

      // Mark story as viewed
      markStoryAsViewed: async (storyId: string, viewerId: string) => {
        try {
          await storyService.markStoryAsViewed(storyId, viewerId);
          rememberViewedStory(storyId, viewerId);
          set((state) => ({
            stories: state.stories.map((story) =>
              story.id === storyId
                ? { ...story, hasViewed: true, viewCount: story.viewCount + 1 }
                : story,
            ),
            userStories: state.userStories.map((story) =>
              story.id === storyId
                ? { ...story, hasViewed: true, viewCount: story.viewCount + 1 }
                : story,
            ),
          }));
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to mark story as viewed";
          set({ error: errorMessage });
        }
      },

      // Delete story â€” removes from both lists and refreshes
      deleteStory: async (storyId: string, userId: string) => {
        try {
          await storyService.deleteStory(storyId);
          set((state) => ({
            stories: state.stories.filter((s) => s.id !== storyId),
            userStories: state.userStories.filter((s) => s.id !== storyId),
          }));
          // The active subscription receives the deletion. Only reconcile
          // manually when this store is being used without a listener.
          if (!get()._userUnsub) {
            await get().loadUserStories(userId);
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to delete story";
          set({ error: errorMessage });
        }
      },

      // Cleanup expired story docs from Postgres.
      // The scoped realtime channel reconciles deletions automatically;
      // only falls back to a manual reload when no subscription is active.
      cleanupExpiredStories: async (userId: string) => {
        try {
          if (!userId) return;
          await storyService.cleanupExpiredStories(userId);
          const { _friendsUnsub, _userUnsub } = get();
          if (!_friendsUnsub) get().loadFriendsStories(userId);
          if (!_userUnsub) get().loadUserStories(userId);
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to cleanup expired stories";
          set({ error: errorMessage });
        }
      },

      clearError: () => set({ error: null }),

      reset: () =>
        set({
          stories: [],
          userStories: [],
          isLoading: false,
          error: null,
          isUploading: false,
          uploadProgress: 0,
        }),

      clearAllStories: () => {
        friendsStoriesRequestId += 1;
        userStoriesRequestId += 1;
        _friendsSubCounter += 1;
        inFlightStoryLoads = 0;
        const { _friendsUnsub, _userUnsub } = get();
        if (_friendsUnsub) _friendsUnsub();
        if (_userUnsub) _userUnsub();
        set({
          stories: [],
          userStories: [],
          isLoading: false,
          _friendsUnsub: null,
          _userUnsub: null,
        });
      },
    }),

    // â”€â”€ Persist config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    {
      skipHydration: true,
      name: "dare-stories",
      storage: createJSONStorage(() => sessionStorage),
      // Only persist the data arrays; functions / unsubscribers are never serialisable
      partialize: (state) => ({
        stories: state.stories
          .map(sanitizeStoryForPersist)
          .filter((s) => !!s.media.url),
        userStories: state.userStories
          .map(sanitizeStoryForPersist)
          .filter((s) => !!s.media.url),
      }),
    },
  ),
);

// Selectors
export const useFriendsStories = () => useStoryStore((state) => state.stories);
export const useUserStories = () => useStoryStore((state) => state.userStories);
export const useStoryLoading = () => useStoryStore((state) => state.isLoading);
export const useStoryError = () => useStoryStore((state) => state.error);
export const useStoryUploadState = () =>
  useStoryStore((state) => ({
    isUploading: state.isUploading,
    uploadProgress: state.uploadProgress,
  }));
