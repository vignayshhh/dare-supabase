import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { userService, UserProfile } from "./user.service";
import { logBackendError } from "@/utils/backendErrors";

export type FriendshipStatus = "pending" | "accepted" | "rejected";

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  accepted_at: string | null;
}

type FriendshipRow = Omit<Friendship, "status" | "accepted_at"> & {
  status: string;
  updated_at: string;
};

const FRIENDSHIP_FIELDS =
  "id,requester_id,addressee_id,status,created_at,updated_at";

function toFriendship(row: FriendshipRow): Friendship {
  const status = row.status.toLowerCase() as FriendshipStatus;
  return {
    id: row.id,
    requester_id: row.requester_id,
    addressee_id: row.addressee_id,
    status,
    created_at: row.created_at,
    accepted_at: status === "accepted" ? row.updated_at : null,
  };
}

export interface FriendRequest {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  accepted_at: string | null;
  requester_profile: UserProfile;
}

export interface Friend extends UserProfile {
  friendship_id: string;
  friendship_status: FriendshipStatus;
  friendship_created_at: string;
  friendship_accepted_at: string | null;
}

class FriendsService {
  private get client() {
    return getSupabaseBrowserClient();
  }
  private readonly friendsCacheTtlMs = 15 * 60 * 1000;
  private friendsCache = new Map<
    string,
    { data: Friend[]; expiresAt: number }
  >();
  private friendshipBetweenCache = new Map<
    string,
    { data: Friendship | null; expiresAt: number }
  >();
  private inFlightFriendsRequests = new Map<string, Promise<Friend[]>>();

  private getCanonicalFriendshipId(userId1: string, userId2: string): string {
    return [userId1, userId2].sort().join("_");
  }

  private getCachedFriends(userId: string): Friend[] | null {
    const cached = this.friendsCache.get(userId);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.friendsCache.delete(userId);
      return null;
    }
    return cached.data;
  }

  private setCachedFriends(userId: string, friends: Friend[]): void {
    this.friendsCache.set(userId, {
      data: friends,
      expiresAt: Date.now() + this.friendsCacheTtlMs,
    });
  }

  private invalidateFriendsCache(...userIds: Array<string | undefined>): void {
    const validIds = userIds.filter((id): id is string => !!id);
    validIds.forEach((userId) => {
      this.friendsCache.delete(userId);
      this.inFlightFriendsRequests.delete(userId);
    });
    // Clear friendship-between cache entries involving these users
    if (validIds.length >= 2) {
      const pairKey = validIds.slice(0, 2).sort().join(":");
      this.friendshipBetweenCache.delete(pairKey);
    }
  }

  private invalidateServerSocialCache(...userIds: Array<string | undefined>): void {
    const validIds = userIds.filter((id): id is string => !!id);
    if (validIds.length === 0 || typeof window === "undefined") return;

    import("@/lib/apiClient")
      .then(({ apiFetch }) =>
        apiFetch("/api/cache/social", {
          method: "POST",
          body: JSON.stringify({ userIds: validIds }),
        }),
      )
      .catch(() => {});
  }

  async sendFriendRequest(
    requesterId: string,
    addresseeId: string,
  ): Promise<Friendship> {
    try {
      if (typeof window !== "undefined") {
        try {
          const { apiFetch } = await import("@/lib/apiClient");
          const response = await apiFetch<{
            ok: boolean;
            friendship: Friendship;
          }>("/api/friends/request", {
            method: "POST",
            body: JSON.stringify({ addresseeId }),
          });
          if (response.friendship) {
            this.invalidateFriendsCache(requesterId, addresseeId);
            return response.friendship;
          }
        } catch (apiError) {
          console.warn("[friendsService] sendFriendRequest API fallback:", apiError);
        }
      }

      const existing = await this.getFriendshipBetweenUsers(
        requesterId,
        addresseeId,
      );
      if (existing) {
        throw new Error("Friendship already exists");
      }

      if (requesterId === addresseeId) {
        throw new Error("Cannot send friend request to yourself");
      }

      const friendshipData = {
        requester_id: requesterId,
        addressee_id: addresseeId,
        status: "PENDING",
      };

      const { data: created, error } = await this.client.from("friendships")
        .insert(friendshipData).select(FRIENDSHIP_FIELDS).single();
      if (error) throw error;
      this.invalidateFriendsCache(requesterId, addresseeId);
      this.invalidateServerSocialCache(requesterId, addresseeId);
      return toFriendship(created as FriendshipRow);
    } catch (error) {
      console.error("Error sending friend request:", error);
      throw error;
    }
  }

  async acceptFriendRequest(friendshipId: string): Promise<Friendship> {
    try {
      if (typeof window !== "undefined") {
        try {
          const { apiFetch } = await import("@/lib/apiClient");
          const response = await apiFetch<{
            ok: boolean;
            friendship: Friendship;
          }>(`/api/friends/${encodeURIComponent(friendshipId)}`, {
            method: "PATCH",
            body: JSON.stringify({ status: "accepted" }),
          });
          if (response.friendship) {
            this.invalidateFriendsCache(
              response.friendship.requester_id,
              response.friendship.addressee_id,
            );
            return response.friendship;
          }
        } catch (apiError) {
          console.warn("[friendsService] acceptFriendRequest API fallback:", apiError);
        }
      }

      const { data: updated, error: updateError } = await this.client.from("friendships")
        .update({
        status: "ACCEPTED",
        updated_at: new Date().toISOString(),
      }).eq("id", friendshipId).select(FRIENDSHIP_FIELDS).maybeSingle();
      if (updateError) throw updateError;
      if (!updated) {
        throw new Error("Friendship not found");
      }
      const accepted = toFriendship(updated as FriendshipRow);
      this.invalidateFriendsCache(accepted.requester_id, accepted.addressee_id);
      this.invalidateServerSocialCache(
        accepted.requester_id,
        accepted.addressee_id,
      );
      return accepted;
    } catch (error) {
      console.error("Error accepting friend request:", error);
      throw error;
    }
  }

  async rejectFriendRequest(friendshipId: string): Promise<Friendship> {
    try {
      if (typeof window !== "undefined") {
        try {
          const { apiFetch } = await import("@/lib/apiClient");
          const response = await apiFetch<{
            ok: boolean;
            friendship: Friendship;
          }>(`/api/friends/${encodeURIComponent(friendshipId)}`, {
            method: "PATCH",
            body: JSON.stringify({ status: "rejected" }),
          });
          if (response.friendship) {
            this.invalidateFriendsCache(
              response.friendship.requester_id,
              response.friendship.addressee_id,
            );
            return response.friendship;
          }
        } catch (apiError) {
          console.warn("[friendsService] rejectFriendRequest API fallback:", apiError);
        }
      }

      const { data: updated, error: updateError } = await this.client.from("friendships")
        .update({ status: "DECLINED" }).eq("id", friendshipId)
        .select(FRIENDSHIP_FIELDS).maybeSingle();
      if (updateError) throw updateError;
      if (!updated) {
        throw new Error("Friendship not found");
      }
      const rejected = toFriendship(updated as FriendshipRow);
      this.invalidateFriendsCache(rejected.requester_id, rejected.addressee_id);
      this.invalidateServerSocialCache(
        rejected.requester_id,
        rejected.addressee_id,
      );
      return rejected;
    } catch (error) {
      console.error("Error rejecting friend request:", error);
      throw error;
    }
  }

  async cancelFriendRequest(
    requesterId: string,
    addresseeId: string,
  ): Promise<boolean> {
    try {
      console.log(
        "ðŸ”„ FriendsService: Cancelling friend request between",
        requesterId,
        "and",
        addresseeId,
      );

      // Find the friendship document
      const friendship = await this.getFriendshipBetweenUsers(
        requesterId,
        addresseeId,
      );

      if (!friendship) {
        console.log("âŒ No friendship found to cancel");
        return false;
      }

      if (friendship.status !== "pending") {
        console.log("âŒ Friendship is not pending, cannot cancel");
        return false;
      }

      if (typeof window !== "undefined") {
        try {
          const { apiFetch } = await import("@/lib/apiClient");
          await apiFetch(`/api/friends/${encodeURIComponent(friendship.id)}`, {
            method: "DELETE",
          });
          this.invalidateFriendsCache(requesterId, addresseeId);
          return true;
        } catch (apiError) {
          console.warn("[friendsService] cancelFriendRequest API fallback:", apiError);
        }
      }

      // Delete the friendship document
      const { error } = await this.client.from("friendships").delete().eq("id", friendship.id);
      if (error) throw error;
      this.invalidateFriendsCache(requesterId, addresseeId);
      this.invalidateServerSocialCache(requesterId, addresseeId);

      console.log("âœ… Friend request cancelled successfully");
      return true;
    } catch (error) {
      console.error("âŒ Error cancelling friend request:", error);
      throw error;
    }
  }

  async getFriendshipBetweenUsers(
    userId1: string,
    userId2: string,
  ): Promise<Friendship | null> {
    try {
      // Cache key is sorted so (A,B) and (B,A) hit same entry
      const pairKey = [userId1, userId2].sort().join(":");
      const now = Date.now();
      const cached = this.friendshipBetweenCache.get(pairKey);
      if (cached && cached.expiresAt > now) {
        return cached.data;
      }

      const { data: direct, error: directError } = await this.client.from("friendships")
        .select(FRIENDSHIP_FIELDS)
        .or(`and(requester_id.eq.${userId1},addressee_id.eq.${userId2}),and(requester_id.eq.${userId2},addressee_id.eq.${userId1})`)
        .limit(1).maybeSingle();
      if (directError) throw directError;
      if (direct) {
        const result = toFriendship(direct as FriendshipRow);
        this.friendshipBetweenCache.set(pairKey, {
          data: result,
          expiresAt: now + this.friendsCacheTtlMs,
        });
        return result;
      }

      if (!direct) {
        this.friendshipBetweenCache.set(pairKey, {
          data: null,
          expiresAt: now + this.friendsCacheTtlMs,
        });
        return null;
      }

      return null;
    } catch (error) {
      logBackendError("Error getting friendship between users:", error);
      return null;
    }
  }

  async getFriendRequests(userId: string): Promise<FriendRequest[]> {
    try {
      const { data: rows, error } = await this.client.from("friendships")
        .select(FRIENDSHIP_FIELDS)
        .eq("addressee_id", userId).eq("status", "PENDING")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const requests: FriendRequest[] = [];
      for (const friendshipRow of (rows ?? []) as FriendshipRow[]) {
        const friendship = toFriendship(friendshipRow);
        const requesterProfile = await userService.getProfile(
          friendship.requester_id,
        );

        if (requesterProfile) {
          requests.push({
            ...friendship,
            requester_profile: requesterProfile,
          });
        }
      }

      return requests;
    } catch (error) {
      logBackendError("Error getting friend requests:", error);
      return [];
    }
  }

  async getFriends(userId: string): Promise<Friend[]> {
    try {
      const cachedFriends = this.getCachedFriends(userId);
      if (cachedFriends) {
        return cachedFriends;
      }

      const existingRequest = this.inFlightFriendsRequests.get(userId);
      if (existingRequest) {
        return existingRequest;
      }

      const request = this.fetchFriends(userId).finally(() => {
        this.inFlightFriendsRequests.delete(userId);
      });
      this.inFlightFriendsRequests.set(userId, request);
      return request;
    } catch (error) {
      logBackendError("Error getting friends:", error);
      return [];
    }
  }

  private async fetchFriends(userId: string): Promise<Friend[]> {
    try {
      const { data: rows, error } = await this.client.from("friendships")
        .select(FRIENDSHIP_FIELDS)
        .eq("status", "ACCEPTED")
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
      if (error) throw error;
      const seenIds = new Set<string>();
      const friendshipsByOtherUser = new Map<string, Friendship>();

      for (const friendshipRow of (rows ?? []) as FriendshipRow[]) {
        const friendship = toFriendship(friendshipRow);
        if (seenIds.has(friendship.id)) continue;
        seenIds.add(friendship.id);
        const otherUserId =
          friendship.requester_id === userId
            ? friendship.addressee_id
            : friendship.requester_id;
        friendshipsByOtherUser.set(otherUserId, friendship);
      }

      // Batch fetch all friend profiles in a single buildQuery
      const profileIds = Array.from(friendshipsByOtherUser.keys());
      const profilesMap = new Map<string, UserProfile>();

      if (profileIds.length > 0) {
        const chunks: string[][] = [];
        for (let i = 0; i < profileIds.length; i += 10) {
          chunks.push(profileIds.slice(i, i + 10));
        }

        for (const chunk of chunks) {
          const { data: profiles, error } = await this.client.from("profiles")
            .select("id,username,display_name,bio,avatar_url,visibility,is_18_plus,consent_accepted,dares_completed,dares_refused,created_at,updated_at").in("id", chunk);
          if (error) throw error;
          (profiles ?? []).forEach((profile) => {
            profilesMap.set(profile.id, {
              id: profile.id,
              ...profile,
            } as UserProfile);
          });
        }
      }

      // Build friends array with profiles
      const friends: Friend[] = [];
      for (const [otherUserId, friendship] of friendshipsByOtherUser) {
        const profile = profilesMap.get(otherUserId);

        if (profile) {
          friends.push({
            ...profile,
            friendship_id: friendship.id,
            friendship_status: friendship.status,
            friendship_created_at: friendship.created_at,
            friendship_accepted_at: friendship.accepted_at,
          });
        }
      }

      this.setCachedFriends(userId, friends);
      return friends;
    } catch (error) {
      logBackendError("Error getting friends:", error);
      return [];
    }
  }

  async removeFriend(friendshipId: string): Promise<boolean> {
    try {
      if (typeof window !== "undefined") {
        try {
          const { apiFetch } = await import("@/lib/apiClient");
          await apiFetch(`/api/friends/${encodeURIComponent(friendshipId)}`, {
            method: "DELETE",
          });
          this.friendsCache.clear();
          return true;
        } catch (apiError) {
          console.warn("[friendsService] removeFriend API fallback:", apiError);
        }
      }

      const { data: friendship, error } = await this.client.from("friendships")
        .delete().eq("id", friendshipId)
        .select("requester_id,addressee_id").maybeSingle();
      if (error) throw error;
      if (friendship) {
        this.invalidateFriendsCache(
          friendship.requester_id,
          friendship.addressee_id,
        );
        this.invalidateServerSocialCache(
          friendship.requester_id,
          friendship.addressee_id,
        );
      }
      return true;
    } catch (error) {
      logBackendError("Error removing friend:", error);
      return false;
    }
  }

  async unfriendUser(
    currentUserId: string,
    targetUserId: string,
  ): Promise<boolean> {
    try {
      // Find the friendship between these two users
      const friendship = await this.getFriendshipBetweenUsers(
        currentUserId,
        targetUserId,
      );

      if (!friendship) {
        console.error("No friendship found between users");
        return false;
      }

      if (friendship.status !== "accepted") {
        console.error("Users are not friends");
        return false;
      }

      // Remove the friendship
      let success: boolean;
      if (typeof window !== "undefined") {
        try {
          const { apiFetch } = await import("@/lib/apiClient");
          await apiFetch(
            `/api/friends/between?userId=${encodeURIComponent(targetUserId)}`,
            { method: "DELETE" },
          );
          success = true;
        } catch (apiError) {
          console.warn("[friendsService] unfriendUser API fallback:", apiError);
          success = await this.removeFriend(friendship.id);
        }
      } else {
        success = await this.removeFriend(friendship.id);
      }

      if (success) {
        console.log("âœ… Successfully unfriended user");
        this.invalidateFriendsCache(currentUserId, targetUserId);
        return true;
      } else {
        console.error("âŒ Failed to unfriend user");
        return false;
      }
    } catch (error) {
      console.error("Error unfriending user:", error);
      return false;
    }
  }

  async areFriends(userId1: string, userId2: string): Promise<boolean> {
    try {
      const friendship = await this.getFriendshipBetweenUsers(userId1, userId2);
      return friendship?.status === "accepted" || false;
    } catch (error) {
      logBackendError("Error checking friendship status:", error);
      return false;
    }
  }

  async getFriendsCount(userId: string): Promise<number> {
    try {
      const friends = await this.getFriends(userId);
      return friends.length;
    } catch (error) {
      logBackendError("Error getting friends count:", error);
      return 0;
    }
  }
}

export const friendsService = new FriendsService();
