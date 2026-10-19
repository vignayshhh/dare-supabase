import { useState, useEffect } from "react";
import { useAvatarStore } from "../stores/avatarStore";
import { userDocSubscriptionService } from "../services/userDocSubscriptionService";

/**
 * Custom hook for fetching and caching user avatars with real-time updates
 *
 * Features:
 * - Checks avatarStore cache first for instant display
 * - Fetches from Postgres if not cached
 * - Subscribes to real-time avatar updates
 * - Automatically updates when user changes their avatar
 *
 * @param userId - The user ID to fetch avatar for
 * @returns Object containing avatar URL and loading state
 */
export function useUserAvatar(userId: string | undefined) {
  const [avatar, setAvatar] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setAvatar("");
      setLoading(false);
      return;
    }

    // Use getState() directly to avoid depending on store function references
    const { getStoredAvatar } = useAvatarStore.getState();

    // Check cache first for instant display
    const cachedAvatar = getStoredAvatar(userId);
    // Persisted Supabase signed links are short-lived. Do not paint a cached
    // signed URL before the profile subscription can refresh it; otherwise the
    // browser emits a guaranteed failed request for the expired link first.
    const cachedAvatarIsSigned = cachedAvatar.includes("/storage/v1/object/sign/");
    if (cachedAvatar && !cachedAvatarIsSigned) {
      setAvatar(cachedAvatar);
      setLoading(false);
    }

    let active = true;
    void userDocSubscriptionService.load(userId).then((data) => {
      if (!active) return;
      const avatarUrl = data?.avatarUrl || "";
      setAvatar(avatarUrl);
      if (avatarUrl) useAvatarStore.getState().setUserAvatar(userId, avatarUrl);
      setLoading(false);
    });
    return () => { active = false; };
  }, [userId]);

  return { avatar, loading };
}

/**
 * Hook for fetching multiple user avatars at once
 * Useful for lists of users (e.g., likes modal, friend lists)
 *
 * @param userIds - Array of user IDs to fetch avatars for
 * @returns Map of userId -> avatar URL
 */
export function useUserAvatars(userIds: string[]) {
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const userIdsKey = userIds.join(",");

  useEffect(() => {
    if (!userIds || userIds.length === 0) {
      setAvatars({});
      setLoading(false);
      return;
    }

    const avatarMap: Record<string, string> = {};
    let active = true;

    // Check cache first using getState() to avoid unstable deps
    const { getStoredAvatar } = useAvatarStore.getState();
    userIds.forEach((userId) => {
      const cached = getStoredAvatar(userId);
      if (cached && !cached.includes("/storage/v1/object/sign/")) {
        avatarMap[userId] = cached;
      }
    });
    setAvatars({ ...avatarMap });

    userIds.forEach((userId) => {
      void userDocSubscriptionService.load(userId).then((data) => {
        if (!active) return;
        avatarMap[userId] = data?.avatarUrl || "";
        setAvatars({ ...avatarMap });

        if (data?.avatarUrl) {
          useAvatarStore.getState().setUserAvatar(userId, data.avatarUrl);
        }
      });
    });
    setLoading(false);

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userIdsKey]);

  return { avatars, loading };
}
