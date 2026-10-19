export interface UserProfile {
  id: string;
  userId: string;
  username: string;
  nickname: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  is18Plus: boolean;
  consentAccepted: boolean;
  daresCompleted: number;
  daresRefused: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfileUpdate {
  displayName?: string;
  nickname?: string;
  bio?: string;
  avatarUrl?: string;
  visibility?: "PUBLIC" | "PRIVATE";
  daresCompleted?: number;
  daresRefused?: number;
}

export interface IUserRepository {
  getProfileById(profileId: string): Promise<UserProfile | null>;
  getProfileByUserId(userId: string): Promise<UserProfile | null>;
  /** Fetch visible profiles in one request; preserves RLS visibility. */
  getProfilesByUserIds(userIds: string[]): Promise<UserProfile[]>;
  updateProfile(
    profileId: string,
    updates: UserProfileUpdate,
  ): Promise<UserProfile>;
  searchProfiles(query: string, limit?: number): Promise<UserProfile[]>;
  canViewProfile(profileId: string, viewerId?: string): Promise<boolean>;
}
