import { create } from "zustand";
import { userService, UserProfile } from "@/middleware/services/user.service";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { recordResourceMetric } from "@/lib/observability/resourceMetrics";

type ProfileSocialContext = {
  friends_count: number;
  friends_preview: any[];
  friendship: any | null;
};

const socialContextCache = new Map<
  string,
  { value: ProfileSocialContext; expiresAt: number }
>();
const socialContextRequests = new Map<string, Promise<ProfileSocialContext>>();

const socialContextKey = (viewerId: string, profileId: string) =>
  `${viewerId}:${profileId}`;

const invalidateSocialContext = (...userIds: string[]) => {
  for (const key of socialContextCache.keys()) {
    if (userIds.some((id) => key.includes(id))) socialContextCache.delete(key);
  }
};

const getProfileSocialContext = async (
  viewerId: string,
  profileId: string,
): Promise<ProfileSocialContext> => {
  const key = socialContextKey(viewerId, profileId);
  const cached = socialContextCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    recordResourceMetric("cache_hits");
    return cached.value;
  }
  const existing = socialContextRequests.get(key);
  if (existing) {
    recordResourceMetric("cache_hits");
    return existing;
  }
  recordResourceMetric("cache_misses");
  const request = (async () => {
    const { data, error } = await getSupabaseBrowserClient().rpc(
      "get_profile_social_context",
      { p_profile_id: profileId },
    );
    let value: ProfileSocialContext;
    if (error) {
      // Upgrade-safe fallback until forward migration is applied.
      const { friendsService } = await import(
        "@/middleware/services/service-factory"
      );
      const [friendsResult, friendshipResult] = await Promise.all([
        friendsService.getFriends(profileId),
        friendsService.getFriendshipStatus(viewerId, profileId),
      ]);
      const friends = friendsResult.success ? friendsResult.friends || [] : [];
      value = {
        friends_count: friends.length,
        friends_preview: friends.slice(0, 6),
        friendship: friendshipResult.success
          ? friendshipResult.friendship || null
          : null,
      };
    } else {
      value = (data || {}) as ProfileSocialContext;
    }
    const normalized = {
      friends_count: Number(value.friends_count) || 0,
      friends_preview: Array.isArray(value.friends_preview)
        ? value.friends_preview
        : [],
      friendship: value.friendship || null,
    };
    socialContextCache.set(key, {
      value: normalized,
      expiresAt: Date.now() + 30_000,
    });
    return normalized;
  })().finally(() => socialContextRequests.delete(key));
  socialContextRequests.set(key, request);
  return request;
};

interface UserProfileState {
  // Data
  profile: UserProfile | null;
  friends: any[]; // Using any[] for now since new service returns UserProfileEntity[]
  isFriend: boolean;
  friendshipStatus: "none" | "pending" | "accepted" | "rejected";
  friendsCount: number;
  loading: boolean;
  error: string | null;

  // Actions
  loadProfile: (userId: string) => Promise<void>;
  sendFriendRequest: (targetUserId: string) => Promise<boolean>;
  cancelFriendRequest: (targetUserId: string) => Promise<boolean>;
  unfriendUser: (targetUserId: string) => Promise<boolean>;
  checkFriendshipStatus: (targetUserId: string) => Promise<void>;
  incrementFriendsCount: (userId: string) => Promise<void>;
  decrementFriendsCount: (userId: string) => Promise<void>;
  clearError: () => void;
  setError: (error: string | null) => void;
}

export const useUserProfileStore = create<UserProfileState>((set, get) => ({
  // Initial state
  profile: null,
  friends: [],
  isFriend: false,
  friendshipStatus: "none",
  friendsCount: 0,
  loading: false,
  error: null,

  // Load user profile
  loadProfile: async (userId: string) => {
    set({ loading: true, error: null });

    try {
      const { useAuthStore } = await import("./useAuthStore-v2");
      const viewerId = useAuthStore.getState().user?.id;
      const [profile, social] = await Promise.all([
        userService.getProfile(userId),
        viewerId
          ? getProfileSocialContext(viewerId, userId)
          : Promise.resolve<ProfileSocialContext>({
              friends_count: 0,
              friends_preview: [],
              friendship: null,
            }),
      ]);

      if (profile) {
        const friends = social.friends_preview;
        const friendsCount = social.friends_count;
        const databaseProfile = profile as any;
        if (
          databaseProfile &&
          friendsCount !== (databaseProfile.followersCount || 0)
        ) {
          (profile as any).followersCount = friendsCount;
        }

        set({
          profile,
          friends,
          friendsCount,
          isFriend: social.friendship?.status === "accepted",
          friendshipStatus: social.friendship?.status || "none",
          loading: false,
        });
      } else {
        set({ loading: false, error: "Profile not found" });
      }
    } catch (error) {
      console.error("âŒ Error loading profile:", error);
      set({ loading: false, error: (error as Error).message });
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load profile";
      set({
        error: errorMessage,
        loading: false,
      });
    }
  },

  // Send friend request
  sendFriendRequest: async (targetUserId: string) => {
    try {
      // Get current user
      const { useAuthStore } = await import("./useAuthStore-v2");
      const currentUser = useAuthStore.getState().user;

      if (!currentUser?.id) {
        throw new Error("You must be logged in to send friend requests");
      }

      if (currentUser.id === targetUserId) {
        throw new Error("You cannot send a friend request to yourself");
      }

      // Check if already friends or request exists
      const { friendsService } =
        await import("@/middleware/services/service-factory");
      const statusResponse = await friendsService.getFriendshipStatus(
        currentUser.id,
        targetUserId,
      );
      const existingFriendship = statusResponse.success
        ? statusResponse.friendship
        : null;

      if (existingFriendship) {
        if (existingFriendship.status === "pending") {
          throw new Error("Friend request already sent");
        } else if (existingFriendship.status === "accepted") {
          throw new Error("You are already friends");
        }
      }

      // Send friend request
      console.log("ðŸ”„ Sending friend request...");
      const friendshipResponse = await friendsService.sendFriendRequest(
        currentUser.id,
        targetUserId,
      );
      console.log("ðŸ”„ Friend request response:", friendshipResponse);

      if (!friendshipResponse.success || !friendshipResponse.friendship) {
        throw new Error(
          friendshipResponse.error || "Failed to send friend request",
        );
      }

      // Immediately update friendship status in store
      set({ friendshipStatus: "pending" });
      invalidateSocialContext(currentUser.id, targetUserId);
      // `/api/friends/request` atomically creates the request and recipient
      // alert. Creating a second client-side alert duplicates notifications.
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to send friend request";
      set({ error: errorMessage });
      return false;
    }
  },

  // Cancel friend request
  cancelFriendRequest: async (targetUserId: string) => {
    try {
      // Get current user
      const { useAuthStore } = await import("./useAuthStore-v2");
      const currentUser = useAuthStore.getState().user;

      if (!currentUser?.id) {
        return false;
      }

      console.log("ðŸ”„ About to cancel friend request for user:", targetUserId);

      const { friendsService } =
        await import("@/middleware/services/service-factory");
      const friendshipResponse = await friendsService.getFriendshipStatus(
        currentUser.id,
        targetUserId,
      );

      if (!friendshipResponse.success) {
        throw new Error(
          friendshipResponse.error || "Failed to load friend request status",
        );
      }

      const friendship = friendshipResponse.friendship;

      if (!friendship) {
        set({ friendshipStatus: "none" });
        return true;
      }

      if (friendship.status !== "pending") {
        set({ friendshipStatus: friendship.status || "none" });
        return friendship.status === "rejected";
      }

      if (friendship.requesterId !== currentUser.id) {
        throw new Error("Only the sender can cancel this friend request");
      }

      const removeResponse = await friendsService.removeFriend(
        friendship.id,
        currentUser.id,
      );

      if (!removeResponse.success) {
        throw new Error(
          removeResponse.error || "Failed to cancel friend request",
        );
      }

      const { error: alertDeleteError } = await getSupabaseBrowserClient().rpc(
        "delete_sent_friend_request_alert",
        { p_recipient_id: targetUserId, p_friendship_id: friendship.id },
      );
      if (alertDeleteError) console.warn("Friend request alert cleanup failed:", alertDeleteError.message);

      set({ friendshipStatus: "none" });
      invalidateSocialContext(currentUser.id, targetUserId);
      console.log("âœ… Friend request cancelled successfully");

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to cancel friend request";
      set({ error: errorMessage });
      return false;
    }
  },

  // Check friendship status
  checkFriendshipStatus: async (targetUserId: string) => {
    try {
      // Get current user
      const { useAuthStore } = await import("./useAuthStore-v2");
      const currentUser = useAuthStore.getState().user;

      if (!currentUser?.id) {
        return;
      }

      const { friendsService } =
        await import("@/middleware/services/service-factory");

      const friendshipResponse = await friendsService.getFriendshipStatus(
        currentUser.id,
        targetUserId,
      );

      const areFriends =
        friendshipResponse.success &&
        friendshipResponse.friendship?.status === "accepted";
      const friendship = friendshipResponse.success
        ? friendshipResponse.friendship
        : null;

      set({
        isFriend: areFriends,
        friendshipStatus: friendship?.status || "none",
      });
    } catch (error) {
      console.error("Error checking friendship status:", error);
    }
  },

  // Clear profile
  clearProfile: () => {
    set({
      profile: null,
      friends: [],
      isFriend: false,
      friendshipStatus: "none",
      friendsCount: 0,
      error: null,
    });
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },

  // Set error
  setError: (error: string | null) => {
    set({ error });
  },

  // Increment friends count (called when friend request is accepted)
  incrementFriendsCount: async (userId: string) => {
    try {
      console.log("ðŸ”„ Incrementing friends count for user:", userId);

      // Get current friends count
      const currentCount = get().friendsCount;
      const newCount = currentCount + 1;

      console.log(
        "ðŸ”„ Updating friends count from",
        currentCount,
        "to",
        newCount,
      );

      // Update local state
      set({ friendsCount: newCount });

      invalidateSocialContext(userId);

      console.log("âœ… Friends count incremented to:", newCount);
    } catch (error) {
      console.error("âŒ Error incrementing friends count:", error);
    }
  },

  // Unfriend user
  unfriendUser: async (targetUserId: string) => {
    try {
      // Get current user
      const { useAuthStore } = await import("./useAuthStore-v2");
      const currentUser = useAuthStore.getState().user;

      if (!currentUser?.id) {
        throw new Error("You must be logged in to unfriend someone");
      }

      if (currentUser.id === targetUserId) {
        throw new Error("You cannot unfriend yourself");
      }

      console.log("ðŸ”„ Unfriending user:", targetUserId);

      // Unfriend the user
      const { friendsService } =
        await import("@/middleware/services/service-factory");
      const response = await friendsService.unfriendUser(
        currentUser.id,
        targetUserId,
      );

      if (response.success) {
        invalidateSocialContext(currentUser.id, targetUserId);
        // Update friendship status
        set({
          isFriend: false,
          friendshipStatus: "none",
        });

        // Decrement friends count for both users
        await get().decrementFriendsCount(currentUser.id);
        await get().decrementFriendsCount(targetUserId);

        console.log("âœ… Successfully unfriended user");
        return true;
      } else {
        throw new Error(response.error || "Failed to unfriend user");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to unfriend user";
      set({ error: errorMessage });
      return false;
    }
  },

  // Decrement friends count (called when user is unfriended)
  decrementFriendsCount: async (userId: string) => {
    try {
      console.log("ðŸ”„ Decrementing friends count for user:", userId);

      // Get current friends count
      const currentCount = get().friendsCount;
      const newCount = Math.max(0, currentCount - 1);

      console.log(
        "ðŸ”„ Updating friends count from",
        currentCount,
        "to",
        newCount,
      );

      // Update local state
      set({ friendsCount: newCount });

      invalidateSocialContext(userId);

      console.log("âœ… Friends count decremented to:", newCount);
    } catch (error) {
      console.error("âŒ Error decrementing friends count:", error);
    }
  },
}));
