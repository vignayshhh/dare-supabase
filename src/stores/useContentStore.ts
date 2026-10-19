// UseContentStore - Single source of truth for all content data
// Uses service factory and follows architecture contract strictly
// UI components only interact with this store - never directly with services

import { create } from "zustand";
import {
  dareService,
  truthService,
} from "@/middleware/services/service-factory";
import { TruthPost, DarePost } from "@/middleware/adapters/data-adapters";
import { useAuthStore } from "./useAuthStore-v2";
import { TruthEntity } from "@/backend/domain/entities/Truth";
import { resolveUserProfile } from "@/utils/profileResolver";
import { apiFetch } from "@/lib/apiClient";

interface ContentState {
  truthPosts: TruthPost[];
  darePosts: DarePost[];
  loadingTruth: boolean;
  loadingDares: boolean;
  hasLoadedTruth: boolean;
  hasLoadedDares: boolean;
  truthPostsUserId: string | null;
  darePostsUserId: string | null;
  truthPostsScope: "feed" | "profile" | null;
  darePostsScope: "feed" | "profile" | null;
  refreshing: boolean;
  truthError: string | null;
  dareError: string | null;
  hasMoreTruth: boolean;
  hasMoreDares: boolean;
  loadTruthPosts: (refresh?: boolean, scope?: "feed" | "profile") => Promise<void>;
  loadDarePosts: (refresh?: boolean, scope?: "feed" | "profile") => Promise<void>;
  addDarePost: (dare: DarePost) => void;
  addTruthPost: (truth: TruthPost) => void;
  voteOnDare: (dareId: string, vote: "real" | "fake") => Promise<void>;
  voteOnTruth: (truthId: string, vote: "truth" | "lie") => Promise<void>;
  invalidateFeedRailCache: (userId?: string) => void;
  refreshContent: () => Promise<void>;
  clearErrors: () => void;
}

// â”€â”€â”€ Profile cache (one Postgres read per userId per session) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const profileCache = new Map<string, any>();
const FEED_RAIL_CACHE_TTL_MS = 5 * 60 * 1000;

function getFeedRailCacheKey(
  kind: "truth" | "dare",
  userId: string,
): string {
  return `dare:${kind}-feed-rail:${userId}`;
}

function readFeedRailCache<T>(
  kind: "truth" | "dare",
  userId: string,
): T[] | null {
  if (typeof window === "undefined" || !userId) return null;

  try {
    const raw = window.sessionStorage.getItem(getFeedRailCacheKey(kind, userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      items?: unknown;
      cachedAt?: unknown;
    };
    if (
      typeof parsed.cachedAt !== "number" ||
      Date.now() - parsed.cachedAt > FEED_RAIL_CACHE_TTL_MS ||
      !Array.isArray(parsed.items) ||
      parsed.items.length === 0
    ) {
      window.sessionStorage.removeItem(getFeedRailCacheKey(kind, userId));
      return null;
    }

    return parsed.items as T[];
  } catch {
    return null;
  }
}

function writeFeedRailCache(
  kind: "truth" | "dare",
  userId: string,
  items: TruthPost[] | DarePost[],
): void {
  if (typeof window === "undefined" || !userId) return;
  if (items.length === 0) return;

  try {
    window.sessionStorage.setItem(
      getFeedRailCacheKey(kind, userId),
      JSON.stringify({
        cachedAt: Date.now(),
        items: items.slice(0, 20),
      }),
    );
  } catch {
    // Session storage can be unavailable; API cache remains the fallback.
  }
}

// â”€â”€â”€ fetchProfile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function clearFeedRailCache(userId: string): void {
  if (typeof window === "undefined" || !userId) return;

  try {
    window.sessionStorage.removeItem(getFeedRailCacheKey("truth", userId));
    window.sessionStorage.removeItem(getFeedRailCacheKey("dare", userId));
  } catch {
    // A storage failure must not prevent a relationship update from completing.
  }
}

// Strategy 1: getProfileByUserIdForContent(userId)
//   â†’ UserRepository.getProfileByUserId â†’ row(db,"users",userId)
//   Works when Postgres doc ID === userId on dare/truth records.
//
// Strategy 2: buildQuery filterWhere("user_id","==",userId)
//   Works when doc IDs are Auth UIDs but stored userId values differ (e.g. "user8").
//   Manually maps snake_case â†’ camelCase to match UserProfileEntity shape.
async function fetchProfile(userId: string): Promise<any | null> {
  if (!userId) return null;
  if (profileCache.has(userId)) return profileCache.get(userId);

  // Strategy 1
  try {
    const resolvedProfile = await resolveUserProfile(userId);
    if (resolvedProfile) {
      profileCache.set(userId, resolvedProfile);
      return resolvedProfile;
    }
  } catch {
    /* fall through */
  }

  profileCache.set(userId, null);
  return null;
}

// â”€â”€â”€ extractName â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// UserProfileEntity has camelCase fields (mapped by UserRepository.mapToUserProfile).
function extractName(profile: any, userId: string): string {
  if (profile && typeof profile === "object") {
    const name =
      profile.displayName ||
      profile.username ||
      profile.nickname ||
      profile.display_name; // raw Postgres safety net
    if (name && typeof name === "string" && name.trim().length > 0) {
      return name.trim();
    }
  }
  return userId ?? "Unknown";
}

// â”€â”€â”€ extractAvatar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function extractAvatar(profile: any): string {
  if (profile && typeof profile === "object") {
    const url = profile.avatarUrl || profile.avatar_url || profile.photoURL;
    if (url && typeof url === "string" && url.trim().length > 0) {
      return url.trim();
    }
  }
  return "/default-avatar.png";
}

// â”€â”€â”€ buildTruthPost â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Each card is built in full isolation â€” one failure never blocks the others.
async function buildTruthPost(truth: TruthEntity): Promise<TruthPost | null> {
  try {
    const [challengerProfile, receiverProfile] = await Promise.all([
      fetchProfile(truth.challengerId),
      fetchProfile(truth.receiverId),
    ]);

    const challengerName = extractName(challengerProfile, truth.challengerId);
    const receiverName = extractName(receiverProfile, truth.receiverId);

    if (
      challengerName === receiverName &&
      truth.challengerId !== truth.receiverId
    ) {
      console.warn(
        `[buildTruthPost] Same name "${challengerName}" for both sides on truth ${truth.id}. ` +
          `challengerId=${truth.challengerId} receiverId=${truth.receiverId}`,
      );
    }

    return {
      id: truth.id,
      challengerId: truth.challengerId,
      receiverId: truth.receiverId,
      challenger: {
        nickname: challengerName,
        avatar: extractAvatar(challengerProfile),
        verified: false,
      },
      receiver: {
        nickname: receiverName,
        avatar: extractAvatar(receiverProfile),
        verified: false,
      },
      question: truth.question,
      state: truth.state as TruthPost["state"],
      createdAt: truth.createdAt,
      answer: truth.answer,
    };
  } catch (error) {
    console.error(`[buildTruthPost] Failed for truth ${truth.id}:`, error);
    return null;
  }
}

// â”€â”€â”€ buildDarePost â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Each card is built in full isolation â€” one failure never blocks the others.
async function buildDarePost(dare: any): Promise<DarePost | null> {
  try {
    const [challengerProfile, receiverProfile] = await Promise.all([
      fetchProfile(dare.challengerId),
      fetchProfile(dare.receiverId),
    ]);

    const challengerName = extractName(challengerProfile, dare.challengerId);
    const receiverName = extractName(receiverProfile, dare.receiverId);

    if (
      challengerName === receiverName &&
      dare.challengerId !== dare.receiverId
    ) {
      console.warn(
        `[buildDarePost] Same name "${challengerName}" for both sides on dare ${dare.id}. ` +
          `challengerId=${dare.challengerId} receiverId=${dare.receiverId}`,
      );
    }

    return {
      id: dare.id,
      challengerId: dare.challengerId,
      receiverId: dare.receiverId,
      challenger: {
        nickname: challengerName,
        avatar: extractAvatar(challengerProfile),
        verified: false,
      },
      receiver: {
        nickname: receiverName,
        avatar: extractAvatar(receiverProfile),
        verified: false,
      },
      description: dare.description,
      proof: dare.proofMediaUrl
        ? {
            type: (dare.proofMediaType === "VIDEO" ? "video" : "image") as
              | "video"
              | "image",
            url: dare.proofMediaUrl,
            thumbnail: dare.proofThumbnailUrl || dare.proofMediaUrl,
          }
        : undefined,
      state: dare.state as DarePost["state"],
      createdAt: dare.createdAt,
    };
  } catch (error) {
    console.error(`[buildDarePost] Failed for dare ${dare.id}:`, error);
    return null;
  }
}

async function fetchTruthFeedFromApi(
  refresh: boolean,
): Promise<TruthPost[] | null> {
  if (typeof window === "undefined") return null;

  try {
    const params = new URLSearchParams({ limit: "20" });
    if (refresh) params.set("refresh", "1");

    const response = await apiFetch<{
      ok?: boolean;
      truths?: TruthPost[];
    }>(`/api/truth/feed?${params.toString()}`, { method: "GET" });

    return Array.isArray(response.truths) ? response.truths : null;
  } catch (error) {
    console.warn("[useContentStore] cached truth feed unavailable:", error);
    return null;
  }
}

async function fetchDareFeedFromApi(
  refresh: boolean,
): Promise<DarePost[] | null> {
  if (typeof window === "undefined") return null;

  try {
    const params = new URLSearchParams({ limit: "20" });
    if (refresh) params.set("refresh", "1");

    const response = await apiFetch<{
      ok?: boolean;
      dares?: DarePost[];
    }>(`/api/dares/feed?${params.toString()}`, { method: "GET" });

    return Array.isArray(response.dares) ? response.dares : null;
  } catch (error) {
    console.warn("[useContentStore] cached dare feed unavailable:", error);
    return null;
  }
}

// â”€â”€â”€ Store â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const useContentStore = create<ContentState>((set, get) => ({
  truthPosts: [],
  darePosts: [],
  loadingTruth: false,
  loadingDares: false,
  hasLoadedTruth: false,
  hasLoadedDares: false,
  truthPostsUserId: null,
  darePostsUserId: null,
  truthPostsScope: null,
  darePostsScope: null,
  refreshing: false,
  truthError: null,
  dareError: null,
  hasMoreTruth: true,
  hasMoreDares: true,

  // â”€â”€ Load truth posts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // getUserTruths returns ALL truths the user is involved in (sent + received).
  // This is the correct source for the Truth feed â€” friends' truths involving
  // the current user show up here naturally.
  loadTruthPosts: async (refresh = false, scope = "profile") => {
    const { loadingTruth } = get();
    if (loadingTruth && !refresh) return;
    const currentUser = useAuthStore.getState().user;

    set({ loadingTruth: true, truthError: null, refreshing: refresh });

    try {
      if (!currentUser) throw new Error("User not authenticated");

      if (scope === "feed") {
        const sessionTruthPosts = !refresh
          ? readFeedRailCache<TruthPost>("truth", currentUser.id)
          : null;
        if (sessionTruthPosts) {
          set({
            truthPosts: sessionTruthPosts,
            loadingTruth: false,
            hasLoadedTruth: true,
            truthPostsUserId: currentUser.id,
            truthPostsScope: scope,
            refreshing: false,
            hasMoreTruth: sessionTruthPosts.length > 0,
          });
          return;
        }

        const cachedTruthPosts = await fetchTruthFeedFromApi(refresh);
        if (cachedTruthPosts && cachedTruthPosts.length > 0) {
          writeFeedRailCache("truth", currentUser.id, cachedTruthPosts);
          set({
            truthPosts: cachedTruthPosts,
            loadingTruth: false,
            hasLoadedTruth: true,
            truthPostsUserId: currentUser.id,
            truthPostsScope: scope,
            refreshing: false,
            hasMoreTruth: cachedTruthPosts.length > 0,
          });
          return;
        }

        const [friendTruthsResponse, userTruthsResponse] = await Promise.all([
          truthService.getFriendsTruths(currentUser.id),
          truthService.getUserTruths(currentUser.id, "all"),
        ]);
        const fallbackRawTruths = [
          ...(friendTruthsResponse.success ? friendTruthsResponse.truths ?? [] : []),
          ...(userTruthsResponse.success ? userTruthsResponse.truths ?? [] : []),
        ];
        const seenFallbackTruthIds = new Set<string>();
        const fallbackUniqueTruths = fallbackRawTruths.filter((truth: TruthEntity) => {
          if (!truth?.id || seenFallbackTruthIds.has(truth.id)) return false;
          seenFallbackTruthIds.add(truth.id);
          return true;
        });
        const fallbackTruthResults = await Promise.all(
          fallbackUniqueTruths.map(buildTruthPost),
        );
        const fallbackTruthPosts = fallbackTruthResults
          .filter((post): post is TruthPost => post !== null)
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );

        if (fallbackTruthPosts.length > 0) {
          writeFeedRailCache("truth", currentUser.id, fallbackTruthPosts);
          set({
            truthPosts: fallbackTruthPosts,
            loadingTruth: false,
            hasLoadedTruth: true,
            truthPostsUserId: currentUser.id,
            truthPostsScope: scope,
            refreshing: false,
            hasMoreTruth: true,
          });
          return;
        }

        set({
          truthPosts: [],
          loadingTruth: false,
          hasLoadedTruth: true,
          truthPostsUserId: currentUser.id,
          truthPostsScope: scope,
          refreshing: false,
          hasMoreTruth: false,
        });
        return;
      }

      const response = await truthService.getUserTruths(
        currentUser.id,
        "all",
      );

      // getUserTruths returns { success: false } when user has no truths at all
      // â€” treat that as an empty list, not a hard error
      if (!response.success) {
        console.warn(
          "[useContentStore] getUserTruths returned failure:",
          response.error,
        );
        set({
          truthPosts: [],
          loadingTruth: false,
          hasLoadedTruth: true,
          truthPostsUserId: currentUser.id,
          truthPostsScope: scope,
          refreshing: false,
          hasMoreTruth: false,
        });
        return;
      }

      const rawTruths = response.truths ?? [];

      // Deduplicate by ID
      const seen = new Set<string>();
      const uniqueTruths = rawTruths.filter((t: TruthEntity) => {
        if (!t?.id || seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });

      // Build each card in isolation â€” one bad card never blocks the rest
      const results = await Promise.all(uniqueTruths.map(buildTruthPost));
      const truthPosts = results.filter((p): p is TruthPost => p !== null);
      set({
        truthPosts,
        loadingTruth: false,
        hasLoadedTruth: true,
        truthPostsUserId: currentUser.id,
        truthPostsScope: scope,
        refreshing: false,
        hasMoreTruth: truthPosts.length > 0,
      });
    } catch (error) {
      console.error("[useContentStore] loadTruthPosts error:", error);
      set({
        truthError:
          error instanceof Error ? error.message : "Failed to load truth posts",
        loadingTruth: false, // â† always cleared â€” prevents infinite loading
        hasLoadedTruth: true,
        truthPostsUserId: currentUser?.id ?? null,
        truthPostsScope: scope,
        refreshing: false,
      });
    }
  },

  // â”€â”€ Load dare posts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // For profile screen: only load dares the user is involved in (sent + received).
  // Uses getDaresForUser which returns the user's own sent/received dares.
  loadDarePosts: async (refresh = false, scope = "profile") => {
    const { loadingDares } = get();
    if (loadingDares && !refresh) return;
    const currentUser = useAuthStore.getState().user;

    set({ loadingDares: true, dareError: null, refreshing: refresh });

    try {
      if (!currentUser) throw new Error("User not authenticated");

      if (scope === "feed") {
        const sessionDarePosts = !refresh
          ? readFeedRailCache<DarePost>("dare", currentUser.id)
          : null;
        if (sessionDarePosts) {
          set({
            darePosts: sessionDarePosts,
            loadingDares: false,
            hasLoadedDares: true,
            darePostsUserId: currentUser.id,
            darePostsScope: scope,
            refreshing: false,
            hasMoreDares: sessionDarePosts.length > 0,
          });
          return;
        }

        const cachedDarePosts = await fetchDareFeedFromApi(refresh);
        if (cachedDarePosts && cachedDarePosts.length > 0) {
          writeFeedRailCache("dare", currentUser.id, cachedDarePosts);
          set({
            darePosts: cachedDarePosts,
            loadingDares: false,
            hasLoadedDares: true,
            darePostsUserId: currentUser.id,
            darePostsScope: scope,
            refreshing: false,
            hasMoreDares: cachedDarePosts.length > 0,
          });
          return;
        }

        const [friendDaresResponse, userDaresResponse] = await Promise.all([
          dareService.getFriendsDares(currentUser.id),
          dareService.getDaresForUser(currentUser.id),
        ]);
        const fallbackRawDares = [
          ...(friendDaresResponse.success ? friendDaresResponse.dares ?? [] : []),
          ...(userDaresResponse.success ? userDaresResponse.dares ?? [] : []),
        ];
        const seenFallbackDareIds = new Set<string>();
        const fallbackUniqueDares = fallbackRawDares.filter((dare: any) => {
          if (!dare?.id || seenFallbackDareIds.has(dare.id)) return false;
          seenFallbackDareIds.add(dare.id);
          return true;
        });
        const fallbackDareResults = await Promise.all(
          fallbackUniqueDares.map(buildDarePost),
        );
        const fallbackDarePosts = fallbackDareResults
          .filter((post): post is DarePost => post !== null)
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );

        if (fallbackDarePosts.length > 0) {
          writeFeedRailCache("dare", currentUser.id, fallbackDarePosts);
          set({
            darePosts: fallbackDarePosts,
            loadingDares: false,
            hasLoadedDares: true,
            darePostsUserId: currentUser.id,
            darePostsScope: scope,
            refreshing: false,
            hasMoreDares: true,
          });
          return;
        }

        set({
          darePosts: [],
          loadingDares: false,
          hasLoadedDares: true,
          darePostsUserId: currentUser.id,
          darePostsScope: scope,
          refreshing: false,
          hasMoreDares: false,
        });
        return;
      }

      // Only load dares the current user is involved in (as challenger or receiver)
      const response = await dareService.getDaresForUser(currentUser.id);

      if (!response.success || !response.dares || response.dares.length === 0) {
        set({
          darePosts: [],
          loadingDares: false,
          hasLoadedDares: true,
          darePostsUserId: currentUser.id,
          darePostsScope: scope,
          refreshing: false,
          hasMoreDares: false,
        });
        return;
      }

      const rawDares = response.dares;

      // Deduplicate by ID
      const seen = new Set<string>();
      const uniqueDares = rawDares.filter((d: any) => {
        if (!d?.id || seen.has(d.id)) return false;
        seen.add(d.id);
        return true;
      });

      // Sort newest first
      uniqueDares.sort(
        (a: any, b: any) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      // Build each card in isolation â€” one bad card never blocks the rest
      const results = await Promise.all(uniqueDares.map(buildDarePost));
      const darePosts = results.filter((p): p is DarePost => p !== null);
      set({
        darePosts,
        loadingDares: false,
        hasLoadedDares: true,
        darePostsUserId: currentUser.id,
        darePostsScope: scope,
        refreshing: false,
        hasMoreDares: darePosts.length > 0,
      });
    } catch (error) {
      console.error("[useContentStore] loadDarePosts error:", error);
      set({
        dareError:
          error instanceof Error ? error.message : "Failed to load dare posts",
        loadingDares: false,
        hasLoadedDares: true,
        darePostsUserId: currentUser?.id ?? null,
        darePostsScope: scope,
        refreshing: false,
      });
    }
  },

  // â”€â”€ Vote on dare â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  voteOnDare: async (dareId: string, vote: "real" | "fake") => {
    try {
      const currentUser = useAuthStore.getState().user;
      if (!currentUser) throw new Error("User not authenticated");
      const response = await dareService.voteOnDare(
        dareId,
        currentUser.id,
        vote.toUpperCase() as "REAL" | "FAKE",
      );
      if (response.success) {
        await get().loadDarePosts(true, get().darePostsScope || "profile");
      } else {
        throw new Error(response.error || "Failed to vote on dare");
      }
    } catch (error) {
      set({
        dareError:
          error instanceof Error ? error.message : "Failed to vote on dare",
      });
    }
  },

  // â”€â”€ Vote on truth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  voteOnTruth: async (truthId: string, vote: "truth" | "lie") => {
    try {
      const currentUser = useAuthStore.getState().user;
      if (!currentUser) throw new Error("User not authenticated");
      const response = await truthService.voteOnTruth(
        truthId,
        currentUser.id,
        vote.toUpperCase() as "TRUTH" | "LIE",
      );
      if (response.success) {
        await get().loadTruthPosts(true, get().truthPostsScope || "profile");
      } else {
        throw new Error(response.error || "Failed to vote on truth");
      }
    } catch (error) {
      set({
        truthError:
          error instanceof Error ? error.message : "Failed to vote on truth",
      });
    }
  },

  // â”€â”€ Refresh all content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  invalidateFeedRailCache: (userId) => {
    const currentUserId = userId || useAuthStore.getState().user?.id;
    if (currentUserId) clearFeedRailCache(currentUserId);
  },

  refreshContent: async () => {
    set({ refreshing: true });
    const state = get();
    await Promise.all([
      state.loadTruthPosts(true, state.truthPostsScope || "profile"),
      state.loadDarePosts(true, state.darePostsScope || "profile"),
    ]);
    set({ refreshing: false });
  },

  // â”€â”€ Add a new dare post â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  addDarePost: (dare: DarePost) => {
    set((state) => {
      const existing = state.darePosts.find((post) => post.id === dare.id);
      const mergedDare: DarePost = existing
        ? {
            ...existing,
            ...dare,
            challenger: {
              ...existing.challenger,
              ...dare.challenger,
              avatar:
                dare.challenger.avatar &&
                dare.challenger.avatar !== "/default-avatar.png"
                  ? dare.challenger.avatar
                  : existing.challenger.avatar,
            },
            receiver: {
              ...existing.receiver,
              ...dare.receiver,
              avatar:
                dare.receiver.avatar &&
                dare.receiver.avatar !== "/default-avatar.png"
                  ? dare.receiver.avatar
                  : existing.receiver.avatar,
            },
            proof: dare.proof || existing.proof,
          }
        : dare;

      return {
        darePosts: [
          mergedDare,
          ...state.darePosts.filter((post) => post.id !== dare.id),
        ],
      };
    });
  },

  // â”€â”€ Add a new truth post â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  addTruthPost: (truth: TruthPost) => {
    set((state) => {
      const existing = state.truthPosts.find((post) => post.id === truth.id);
      const mergedTruth: TruthPost = existing
        ? {
            ...existing,
            ...truth,
            challenger: {
              ...existing.challenger,
              ...truth.challenger,
              avatar:
                truth.challenger.avatar &&
                truth.challenger.avatar !== "/default-avatar.png"
                  ? truth.challenger.avatar
                  : existing.challenger.avatar,
            },
            receiver: {
              ...existing.receiver,
              ...truth.receiver,
              avatar:
                truth.receiver.avatar &&
                truth.receiver.avatar !== "/default-avatar.png"
                  ? truth.receiver.avatar
                  : existing.receiver.avatar,
            },
            answer: truth.answer || existing.answer,
          }
        : truth;

      return {
        truthPosts: [
          mergedTruth,
          ...state.truthPosts.filter((post) => post.id !== truth.id),
        ],
      };
    });
  },

  // â”€â”€ Clear errors â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  clearErrors: () => {
    set({ truthError: null, dareError: null });
  },
}));


