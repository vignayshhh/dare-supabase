import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAvatarStore } from "../stores/avatarStore";
import { userDocSubscriptionService } from "./userDocSubscriptionService";
import { logBackendError } from "@/utils/backendErrors";

/**
 * Avatar Synchronization Service
 * Handles real-time avatar updates for friends and current user
 */
class AvatarSyncService {
  private unsubscribers: Map<string, () => void> = new Map();
  private friendsCache = new Map<
    string,
    { friendIds: Set<string>; expiresAt: number }
  >();
  private readonly friendsCacheTtlMs = 15 * 60 * 1000;

  /**
   * Subscribe to avatar updates for a specific user
   * @param userId - User ID to monitor for avatar changes
   */
  subscribeToUserAvatar(userId: string): () => void {
    if (this.unsubscribers.has(userId)) {
      console.log(`Already subscribed to avatar updates for user: ${userId}`);
      return this.unsubscribers.get(userId)!;
    }

    const unsubscribe = userDocSubscriptionService.subscribe(userId, (data) => {
      const avatarUrl = data?.avatarUrl || "";

      if (avatarUrl) {
        const { setUserAvatar } = useAvatarStore.getState();
        setUserAvatar(userId, avatarUrl);
        console.log(
          `âœ… Avatar updated for user ${userId}:`,
          avatarUrl.substring(0, 50) + "...",
        );
      }
    });

    this.unsubscribers.set(userId, unsubscribe);
    console.log(`ðŸ“¡ Subscribed to avatar updates for user: ${userId}`);
    return unsubscribe;
  }

  /**
   * Get cached friend IDs or fetch from Postgres
   */
  async getFriendIds(currentUserId: string): Promise<Set<string>> {
    const now = Date.now();
    const cached = this.friendsCache.get(currentUserId);

    if (cached && cached.expiresAt > now) {
      return cached.friendIds;
    }

    const { data, error } = await getSupabaseBrowserClient()
      .from("friendships")
      .select("requester_id,addressee_id")
      .eq("status", "ACCEPTED")
      .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`);
    if (error) throw error;
    const friendIds = new Set<string>();
    for (const friendship of data || []) {
      friendIds.add(friendship.requester_id === currentUserId ? friendship.addressee_id : friendship.requester_id);
    }

    // Cache result
    this.friendsCache.set(currentUserId, {
      friendIds,
      expiresAt: now + this.friendsCacheTtlMs,
    });

    return friendIds;
  }

  /**
   * Invalidate friends cache (call when friendship changes)
   */
  invalidateFriendsCache(userId: string): void {
    this.friendsCache.delete(userId);
  }

  /**
   * Subscribe to avatar updates for all friends of the current user
   * @param currentUserId - Current user's ID
   */
  async subscribeToFriendsAvatars(currentUserId: string): Promise<() => void> {
    try {
      const friendIds = await this.getFriendIds(currentUserId);

      console.log(
        `ðŸ“¡ Found ${friendIds.size} friends, subscribing to their avatars...`,
      );

      // Subscribe to each friend's avatar
      const unsubscribers: (() => void)[] = [];
      friendIds.forEach((friendId) => {
        const unsub = this.subscribeToUserAvatar(friendId);
        unsubscribers.push(unsub);
      });

      // Return cleanup function
      return () => {
        unsubscribers.forEach((unsub) => unsub());
        console.log(`ðŸ”Œ Unsubscribed from ${friendIds.size} friends' avatars`);
      };
    } catch (error) {
      console.error("Error subscribing to friends' avatars:", error);
      return () => {};
    }
  }

  /**
   * Unsubscribe from a specific user's avatar updates
   * @param userId - User ID to unsubscribe from
   */
  unsubscribeFromUserAvatar(userId: string): void {
    const unsubscribe = this.unsubscribers.get(userId);
    if (unsubscribe) {
      unsubscribe();
      this.unsubscribers.delete(userId);
      console.log(`ðŸ”Œ Unsubscribed from avatar updates for user: ${userId}`);
    }
  }

  /**
   * Unsubscribe from all avatar updates
   */
  unsubscribeAll(): void {
    this.unsubscribers.forEach((unsubscribe, userId) => {
      unsubscribe();
      console.log(`ðŸ”Œ Unsubscribed from avatar updates for user: ${userId}`);
    });
    this.unsubscribers.clear();
    console.log("ðŸ”Œ Unsubscribed from all avatar updates");
  }

  /**
   * Force refresh avatar for a specific user
   * Useful when you know an avatar has changed
   * @param userId - User ID to refresh avatar for
   */
  async refreshUserAvatar(userId: string): Promise<void> {
    try {
      const { data, error } = await getSupabaseBrowserClient()
        .from("profiles").select("avatar_url").eq("id", userId).maybeSingle();
      if (error) throw error;
      if (data?.avatar_url) {
        const { setUserAvatar } = useAvatarStore.getState();
        setUserAvatar(userId, data.avatar_url);
        console.log(`ðŸ”„ Force refreshed avatar for user ${userId}`);
      }
    } catch (error) {
      logBackendError(`Error refreshing avatar for user ${userId}:`, error);
    }
  }

  /**
   * Batch refresh avatars for multiple users
   * @param userIds - Array of user IDs to refresh
   */
  async refreshMultipleAvatars(userIds: string[]): Promise<void> {
    console.log(`ðŸ”„ Batch refreshing avatars for ${userIds.length} users...`);
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return;
    const { data, error } = await getSupabaseBrowserClient()
      .from("profiles").select("id,avatar_url").in("id", ids);
    if (error) throw error;
    const { setUserAvatar } = useAvatarStore.getState();
    for (const profile of data || []) {
      if (profile.avatar_url) setUserAvatar(profile.id, profile.avatar_url);
    }
    console.log(`âœ… Batch refresh complete`);
  }
}

export const avatarSyncService = new AvatarSyncService();
