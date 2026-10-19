export interface UserProfileResponse {
  success: boolean;
  profile?: any;
  error?: string;
}

export interface UserProfileListResponse {
  success: boolean;
  profiles?: any[];
  error?: string;
}

export interface UpdateProfileRequest {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  visibility?: "PUBLIC" | "PRIVATE";
}

export interface SearchProfilesResponse {
  success: boolean;
  profiles?: any[];
  error?: string;
}


export interface OnlineStatusRequest {
  isOnline: boolean;
}

export interface ProfileViewRequest {
  profileId: string;
}
