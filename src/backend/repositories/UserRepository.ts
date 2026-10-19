import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { IUserRepository, UserProfile, UserProfileUpdate } from "@/backend/domain/interfaces/IUserRepository";

type ProfileRow = {
  id: string;
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
};

const PROFILE_COLUMNS = "id,username,display_name,bio,avatar_url,visibility,is_18_plus,consent_accepted,dares_completed,dares_refused,created_at,updated_at";

export class UserRepository implements IUserRepository {
  async getProfileById(profileId: string): Promise<UserProfile | null> {
    const { data, error } = await getSupabaseBrowserClient()
      .from("profiles").select(PROFILE_COLUMNS).eq("id", profileId).maybeSingle();
    if (error) throw error;
    return data ? this.mapToUserProfile(data as ProfileRow) : null;
  }

  getProfileByUserId(userId: string): Promise<UserProfile | null> {
    return this.getProfileById(userId);
  }

  async getProfilesByUserIds(userIds: string[]): Promise<UserProfile[]> {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return [];
    const { data, error } = await getSupabaseBrowserClient()
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .in("id", ids);
    if (error) throw error;
    return ((data ?? []) as ProfileRow[]).map((row) => this.mapToUserProfile(row));
  }

  async updateProfile(profileId: string, updates: UserProfileUpdate): Promise<UserProfile> {
    const values: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.displayName !== undefined) values.display_name = updates.displayName;
    if (updates.bio !== undefined) values.bio = updates.bio;
    if (updates.avatarUrl !== undefined) values.avatar_url = updates.avatarUrl;
    if (updates.visibility !== undefined) values.visibility = updates.visibility;
    if (updates.daresCompleted !== undefined) values.dares_completed = updates.daresCompleted;
    if (updates.daresRefused !== undefined) values.dares_refused = updates.daresRefused;

    const { data, error } = await getSupabaseBrowserClient()
      .from("profiles").update(values).eq("id", profileId).select(PROFILE_COLUMNS).single();
    if (error) throw error;
    return this.mapToUserProfile(data as ProfileRow);
  }

  async searchProfiles(searchQuery: string, limitCount = 20): Promise<UserProfile[]> {
    const query = searchQuery.trim();
    if (!query) return [];
    if (query.length > 50) throw new Error("Search query too long (max 50 characters)");
    const { data, error } = await getSupabaseBrowserClient().rpc("search_profiles", {
      p_query: query,
      p_limit: Math.min(Math.max(limitCount, 1), 20),
    });
    if (error) throw error;
    return ((data || []) as ProfileRow[]).map((profile) => this.mapToUserProfile(profile));
  }

  async canViewProfile(profileId: string, viewerId?: string): Promise<boolean> {
    if (viewerId === profileId) return true;
    const { data, error } = await getSupabaseBrowserClient()
      .from("profiles").select("id").eq("id", profileId).maybeSingle();
    return !error && Boolean(data);
  }

  private mapToUserProfile(data: ProfileRow): UserProfile {
    const displayName = data.display_name || data.username;
    return {
      id: data.id,
      userId: data.id,
      username: data.username,
      nickname: displayName,
      displayName,
      bio: data.bio,
      avatarUrl: data.avatar_url,
      visibility: data.visibility,
      is18Plus: data.is_18_plus,
      consentAccepted: data.consent_accepted,
      daresCompleted: data.dares_completed,
      daresRefused: data.dares_refused,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }
}
