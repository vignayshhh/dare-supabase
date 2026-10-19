import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { logBackendError } from "@/utils/backendErrors";
import { recordResourceMetric } from "@/lib/observability/resourceMetrics";

export interface UserProfile {
  id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  is_18_plus: boolean;
  consent_accepted: boolean;
  dares_completed: number;
  dares_refused: number;
  created_at: string;
  updated_at: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  email?: string | null;
  hasCompletedProfileCreation?: boolean;
}

export interface CreateProfileRequest {
  user_id: string;
  username: string;
  display_name: string;
  is_18_plus: boolean;
  consent_accepted: boolean;
  bio?: string;
  avatar_url?: string;
  visibility?: "PUBLIC" | "PRIVATE";
}

class UserService {
  private get client() {
    return getSupabaseBrowserClient();
  }
  private readonly profileFields = "id,username,display_name,bio,avatar_url,visibility,is_18_plus,consent_accepted,dares_completed,dares_refused,created_at,updated_at";
  private profileCache = new Map<
    string,
    { data: UserProfile; expiresAt: number }
  >();
  private readonly profileCacheTtlMs = 15 * 60 * 1000;
  private profileRequests = new Map<string, Promise<UserProfile | null>>();
  private cacheGeneration = 0;
  private allUsersCache: { data: UserProfile[]; expiresAt: number } | null =
    null;

  clearCache(): void {
    this.cacheGeneration += 1;
    this.profileCache.clear();
    this.profileRequests.clear();
    this.allUsersCache = null;
  }

  private getProfileTimestamp(value: unknown): number {
    if (!value) return 0;

    if (typeof value === "string" || typeof value === "number") {
      const time = new Date(value).getTime();
      return Number.isFinite(time) ? time : 0;
    }

    if (typeof value === "object") {
      const timestamp = value as {
        toDate?: () => Date;
        seconds?: number;
        nanoseconds?: number;
      };

      if (typeof timestamp.toDate === "function") {
        const time = timestamp.toDate().getTime();
        return Number.isFinite(time) ? time : 0;
      }

      if (typeof timestamp.seconds === "number") {
        return (
          timestamp.seconds * 1000 +
          Math.floor((timestamp.nanoseconds || 0) / 1000000)
        );
      }
    }

    return 0;
  }

  private getCreatedTime(profile: Partial<UserProfile>): number {
    return this.getProfileTimestamp(profile.created_at ?? profile.createdAt);
  }

  private isKnownMockProfile(profile: Partial<UserProfile>): boolean {
    const profileId = String(profile.user_id || profile.id || "").toLowerCase();
    const username = String(profile.username || "").toLowerCase();
    const email = String(profile.email || "").toLowerCase();

    return (
      profileId === "guest-demo-user" ||
      username === "project_guest" ||
      email.endsWith("@demo.local")
    );
  }

  private isDiscoverableProfile(profile: Partial<UserProfile>): boolean {
    const username = String(profile.username || "").trim();

    if (!username) return false;
    if (profile.visibility === "PRIVATE") return false;
    if (profile.hasCompletedProfileCreation === false) return false;
    if (this.isKnownMockProfile(profile)) return false;

    return true;
  }

  private dedupeProfiles(profiles: UserProfile[]): UserProfile[] {
    const seen = new Set<string>();

    return profiles.filter((profile) => {
      const key = profile.user_id || profile.id;
      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    const now = Date.now();
    const cached = this.profileCache.get(userId);
    if (cached && cached.expiresAt > now) {
      recordResourceMetric("cache_hits");
      return cached.data;
    }
    const existing = this.profileRequests.get(userId);
    if (existing) {
      recordResourceMetric("cache_hits");
      return existing;
    }
    recordResourceMetric("cache_misses");
    const request = this.fetchProfile(userId).finally(() => {
      this.profileRequests.delete(userId);
    });
    this.profileRequests.set(userId, request);
    return request;
  }

  private async fetchProfile(userId: string): Promise<UserProfile | null> {
    try {
      const generation = this.cacheGeneration;
      const now = Date.now();
      const { data: userData, error } = await this.client.from("profiles")
        .select(this.profileFields).eq("id", userId).maybeSingle();
      if (error) throw error;
      if (!userData) return null;

      // Debug logging to see what fields are stored
      console.log("ðŸ” getProfile - Document ID:", userId);
      console.log("ðŸ” getProfile - Document data:", userData);

      const profile = { id: userData.id, user_id: userData.id, ...userData } as UserProfile;

      // Cache result
      if (generation === this.cacheGeneration) {
        this.profileCache.set(userId, {
          data: profile,
          expiresAt: now + this.profileCacheTtlMs,
        });
      }

      return profile;
    } catch (error) {
      logBackendError("Error fetching profile:", error);
      return null;
    }
  }

  async getProfiles(userIds: string[]): Promise<Map<string, UserProfile>> {
    const result = new Map<string, UserProfile>();
    const generation = this.cacheGeneration;
    const now = Date.now();
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    const missingIds: string[] = [];

    uniqueIds.forEach((userId) => {
      const cached = this.profileCache.get(userId);
      if (cached && cached.expiresAt > now) {
        result.set(userId, cached.data);
      } else {
        missingIds.push(userId);
      }
    });

    for (let index = 0; index < missingIds.length; index += 100) {
      const chunk = missingIds.slice(index, index + 100);
      const { data: profiles, error } = await this.client.from("profiles")
        .select(this.profileFields).in("id", chunk);
      if (error) throw error;
      (profiles ?? []).forEach((profileData) => {
        const profile = {
          id: profileData.id,
          user_id: profileData.id,
          ...profileData,
        } as UserProfile;
        const userId = profile.user_id || profile.id;
        result.set(userId, profile);
        result.set(profile.id, profile);
        if (generation === this.cacheGeneration) {
          this.profileCache.set(userId, {
            data: profile,
            expiresAt: now + this.profileCacheTtlMs,
          });
        }
      });
    }

    return result;
  }

  async createProfile(
    request: CreateProfileRequest,
  ): Promise<UserProfile | null> {
    try {
      const profileData = {
        user_id: request.user_id,
        username: request.username,
        display_name: request.display_name,
        bio: request.bio || null,
        avatar_url: request.avatar_url || null,
        visibility: request.visibility || "PUBLIC",
        is_18_plus: request.is_18_plus,
        consent_accepted: request.consent_accepted,
        current_aura: 100,
        lifetime_aura: 100,
        dares_completed: 0,
        dares_refused: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error } = await this.client.from("profiles").upsert({
        id: request.user_id, ...profileData,
      }, { onConflict: "id" });
      if (error) throw error;
      return { id: request.user_id, ...profileData } as UserProfile;
    } catch (error) {
      console.error("Error creating profile:", error);
      return null;
    }
  }

  async updateProfile(
    userId: string,
    updates: Partial<UserProfile>,
  ): Promise<UserProfile | null> {
    try {
      const updatedAt = new Date().toISOString();
      let serverProfile: UserProfile | null = null;
      if (typeof window !== "undefined") {
        try {
          const { apiFetch } = await import("@/lib/apiClient");
          const response = await apiFetch<{ ok: boolean; profile: UserProfile }>(
            "/api/users/me/profile",
            {
              method: "PATCH",
              body: JSON.stringify(updates),
            },
          );
          serverProfile = response.profile || null;
        } catch (apiError) {
          console.warn("[userService] updateProfile API fallback:", apiError);
        }
      }

      if (!serverProfile) {
        const { error } = await this.client.from("profiles").update({
          ...updates,
          updated_at: updatedAt,
        }).eq("id", userId);
        if (error) throw error;
      }

      // Build result from cached profile + updates (skip re-read)
      const cached = this.profileCache.get(userId);
      const base = cached?.data ?? ({ id: userId } as UserProfile);
      const result = serverProfile || {
        ...base,
        ...updates,
        id: userId,
        updated_at: updatedAt,
      } as UserProfile;

      // Update caches
      this.profileCache.set(userId, {
        data: result,
        expiresAt: Date.now() + this.profileCacheTtlMs,
      });
      this.allUsersCache = null; // Invalidate search cache

      // The authenticated API invalidates server caches in the same request.
      // Direct adapter fallback still needs the explicit invalidation route.
      if (typeof window !== "undefined" && !serverProfile) {
        import("@/lib/apiClient")
          .then(({ apiFetch }) =>
            apiFetch("/api/users/me/cache", { method: "POST" }),
          )
          .catch(() => {});
      }

      // Background: propagate denormalized author to user's posts
      if (updates.username || updates.display_name || updates.avatar_url) {
        this.propagateDenormalizedAuthor(userId, result).catch(() => {});
      }

      return result;
    } catch (error) {
      console.error("Error updating profile:", error);
      return null;
    }
  }

  private async propagateDenormalizedAuthor(
    userId: string,
    profile: UserProfile,
  ): Promise<void> {
    try {
      const { error } = await this.client.from("posts").update({
            author_username: profile.username || "",
            author_display_name: profile.display_name || "",
            author_avatar_url: profile.avatar_url || "",
      }).eq("author_id", userId);
      if (error) throw error;
    } catch {
      // non-fatal background task
    }
  }

  async searchProfiles(searchQuery: string): Promise<UserProfile[]> {
    try {
      if (!searchQuery.trim() || searchQuery.length < 1) {
        return [];
      }

      const searchTerm = searchQuery.toLowerCase().trim();
      if (searchTerm.length > 50) return [];
      const { data: found, error } = await this.client.rpc("search_profiles", {
        p_query: searchTerm, p_limit: 20,
      });
      if (error) throw error;
      const allUsers = (found ?? [])
        .map((item: UserProfile) => ({ ...item, id: item.id, user_id: item.id }) as UserProfile)
        .filter((profile) => this.isDiscoverableProfile(profile));

      console.log(
        `ðŸ” Real-time search for "${searchQuery}" - Total users in DB: ${allUsers.length}`,
      );

      const filteredUsers = allUsers.filter((user: UserProfile) => {
        const usernameMatch = user.username?.toLowerCase().includes(searchTerm);
        const displayNameMatch = user.display_name
          ?.toLowerCase()
          .includes(searchTerm);
        return (usernameMatch || displayNameMatch) && this.isDiscoverableProfile(user);
      });

      const sortedUsers = filteredUsers.sort((a, b) => {
        const aUsername = a.username?.toLowerCase() || "";
        const bUsername = b.username?.toLowerCase() || "";
        const aDisplayName = a.display_name?.toLowerCase() || "";
        const bDisplayName = b.display_name?.toLowerCase() || "";

        // Exact username match gets highest priority
        if (aUsername === searchTerm) return -1;
        if (bUsername === searchTerm) return 1;

        // Username starts with search term gets high priority
        const aStartsWith = aUsername.startsWith(searchTerm);
        const bStartsWith = bUsername.startsWith(searchTerm);
        if (aStartsWith && !bStartsWith) return -1;
        if (!aStartsWith && bStartsWith) return 1;

        // Display name starts with search term
        const aDisplayNameStarts = aDisplayName.startsWith(searchTerm);
        const bDisplayNameStarts = bDisplayName.startsWith(searchTerm);
        if (aDisplayNameStarts && !bDisplayNameStarts) return -1;
        if (!aDisplayNameStarts && bDisplayNameStarts) return 1;

        const createdTimeDiff = this.getCreatedTime(b) - this.getCreatedTime(a);
        if (createdTimeDiff !== 0) return createdTimeDiff;

        return aUsername.localeCompare(bUsername);
      });

      console.log(
        `ðŸ” Real-time search for "${searchQuery}" - Filtered users: ${sortedUsers.length}`,
      );

      const uniqueUsers = this.dedupeProfiles(sortedUsers);

      console.log(
        `ðŸ” Real-time search for "${searchQuery}" - Unique users: ${uniqueUsers.length}`,
      );
      console.log(
        `ðŸ” Search results:`,
        uniqueUsers.map((u) => ({
          id: u.id,
          user_id: u.user_id,
          username: u.username,
          display_name: u.display_name,
        })),
      );

      return uniqueUsers;
    } catch (error) {
      logBackendError("Error searching profiles:", error);
      return [];
    }
  }

  async getPublicProfiles(limitCount = 50): Promise<UserProfile[]> {
    try {
      const { data: allUsers, error } = await this.client.from("profiles")
        .select("id,username,display_name,bio,avatar_url,visibility,is_18_plus,consent_accepted,dares_completed,dares_refused,created_at,updated_at")
        .order("created_at", { ascending: false }).limit(Math.min(limitCount, 100));
      if (error) throw error;

      const publicUsers = this.dedupeProfiles(
        allUsers
          .filter((user) => this.isDiscoverableProfile(user))
          .sort((a, b) => {
            const createdTimeDiff = this.getCreatedTime(b) - this.getCreatedTime(a);
            if (createdTimeDiff !== 0) return createdTimeDiff;

            return (a.username || "").localeCompare(b.username || "");
          }),
      );

      console.log(
        `ðŸ“Š getPublicProfiles - Total users: ${allUsers.length}, Public/Undefined: ${publicUsers.length}`,
      );

      return publicUsers.slice(0, limitCount);
    } catch (error) {
      logBackendError("Error fetching public profiles:", error);
      return [];
    }
  }

  async deleteProfile(userId: string): Promise<boolean> {
    try {
      const { error } = await this.client.from("profiles").delete().eq("id", userId);
      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Error deleting profile:", error);
      return false;
    }
  }

  async updateDaresStats(userId: string, completed: boolean): Promise<boolean> {
    try {
      const field = completed ? "dares_completed" : "dares_refused";
      const { error } = await this.client.rpc("increment_profile_dare_stat", {
        p_user_id: userId, p_field: field, p_amount: 1,
      });
      if (error) throw error;
      return true;
    } catch (error) {
      logBackendError("Error updating dares stats:", error);
      return false;
    }
  }

}

export const userService = new UserService();
