"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ChangeEvent,
  type MouseEvent,
} from "react";
import {
  Target,
  Eye,
  Settings,
  Camera,
  Heart,
  MessageCircle,
  Share2,
  Clock,
  CheckCircle,
  Zap,
  LogOut,
  Play,
  X,
  Star,
  MessageSquare,
  ChevronRight,
  Menu,
  Search,
} from "lucide-react";
import "@/styles/design-system.css";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { usePostsStore } from "../../stores/usePostsStore";
import { useUserProfileStore } from "../../stores/useUserProfileStore";
import { useDareStore } from "../../stores/useDareStore";
import { PostsScreen } from "./PostsScreen";
import { ProfileEditScreen } from "./ProfileEditScreen";
import { FriendsScreen } from "./FriendsScreen";
import { Avatar } from "../ui/Avatar";
import { AppearanceToggleInline } from "../ui/AppearanceToggle";
import { useProfileDataStore } from "../../stores/profileDataStore";
import { getAggressiveAvatar, useAvatarStore } from "../../stores/avatarStore";
import { avatarSyncService } from "@/services/avatarSyncService";
import { friendsService } from "../../middleware/services/service-factory";
import { closeFriendsService } from "../../middleware/services/service-factory";
import { formatTimeAgo } from "../../utils/timeFormat";
import { TruthsListScreen } from "./TruthsListScreen";
import { DaresListScreen } from "./DaresListScreen";
import { RelationshipsScreen } from "./RelationshipsScreen";
import { SocialProfileView } from "../profile/SocialProfileView";
import {
  dareService,
  truthService,
} from "../../middleware/services/service-factory";
import type {
  TruthPost,
  DarePost,
} from "../../middleware/adapters/data-adapters";
import { resolveUserProfile } from "../../utils/profileResolver";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { TruthEntity } from "../../backend/domain/entities/Truth";
import { useAuraStore } from "../../stores/useAuraStore";
import { StickmanCustomizationScreen } from "./StickmanCustomizationScreen";
import {
  DEFAULT_STICKMAN_CUSTOMIZATION,
  getStickmanCustomization,
  type StickmanCustomization,
} from "../../services/stickmanCustomizationService";

interface ProfileStats {
  daresCompleted: number;
  daresSurrendered: number;
  friends: number;
}

type ProfileTabLoadState = {
  truthsLoadedForUserId: string | null;
  daresLoadedForUserId: string | null;
};

type ProfileHeaderCounts = {
  dares: number | null;
  truths: number | null;
};

type ProfileCountCollection = "dares" | "truths";

interface ProfileScreenProps {
  isActive?: boolean;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToSearch?: () => void;
  onNavigateToTruthPost?: (truth: TruthPost) => void;
  onNavigateToDarePost?: (dare: DarePost) => void;
}

function toSafeCount(value: unknown): number {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : 0;

  return Number.isFinite(numericValue) ? numericValue : 0;
}

function formatProfileCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  }
  if (value >= 10_000) {
    return `${Math.round(value / 1_000)}K`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toLocaleString();
}

const profileCache = new Map<string, any>();

async function fetchProfile(userId: string): Promise<any | null> {
  if (!userId) return null;
  if (profileCache.has(userId)) return profileCache.get(userId);

  const resolvedProfile = await resolveUserProfile(userId);
  if (resolvedProfile) {
    profileCache.set(userId, resolvedProfile);
    return resolvedProfile;
  }

  profileCache.set(userId, null);
  return null;
}

function extractName(profile: any, userId: string): string {
  if (profile && typeof profile === "object") {
    const name =
      profile.displayName ||
      profile.username ||
      profile.nickname ||
      profile.display_name;

    if (typeof name === "string" && name.trim().length > 0) {
      return name.trim();
    }
  }

  return userId || "Unknown";
}

function extractAvatar(profile: any): string {
  if (profile && typeof profile === "object") {
    const url = profile.avatarUrl || profile.avatar_url || profile.photoURL;
    if (typeof url === "string" && url.trim().length > 0) {
      return url.trim();
    }
  }

  return "/default-avatar.png";
}

async function countUserChallengeDocs(
  collectionName: ProfileCountCollection,
  userId: string,
  state: string,
): Promise<number> {
  const { count, error } = await getSupabaseBrowserClient()
    .from(collectionName)
    .select("id", { count: "exact", head: true })
    .or(`challenger_id.eq.${userId},receiver_id.eq.${userId}`)
    .eq("state", state);
  if (error) throw error;
  return count ?? 0;
}

async function buildTruthPost(truth: TruthEntity): Promise<TruthPost | null> {
  try {
    const [challengerProfile, receiverProfile] = await Promise.all([
      fetchProfile(truth.challengerId),
      fetchProfile(truth.receiverId),
    ]);

    return {
      id: truth.id,
      challengerId: truth.challengerId,
      receiverId: truth.receiverId,
      challenger: {
        nickname: extractName(challengerProfile, truth.challengerId),
        avatar: extractAvatar(challengerProfile),
        verified: false,
      },
      receiver: {
        nickname: extractName(receiverProfile, truth.receiverId),
        avatar: extractAvatar(receiverProfile),
        verified: false,
      },
      question: truth.question,
      state: truth.state as TruthPost["state"],
      createdAt: truth.createdAt,
      answer: truth.answer,
    };
  } catch (error) {
    console.error(`[ProfileScreen] Failed to build truth ${truth.id}:`, error);
    return null;
  }
}

async function buildDarePost(dare: any): Promise<DarePost | null> {
  try {
    const [challengerProfile, receiverProfile] = await Promise.all([
      fetchProfile(dare.challengerId),
      fetchProfile(dare.receiverId),
    ]);

    return {
      id: dare.id,
      challengerId: dare.challengerId,
      receiverId: dare.receiverId,
      challenger: {
        nickname: extractName(challengerProfile, dare.challengerId),
        avatar: extractAvatar(challengerProfile),
        verified: false,
      },
      receiver: {
        nickname: extractName(receiverProfile, dare.receiverId),
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
            thumbnail: dare.proofMediaUrl,
          }
        : undefined,
      state: dare.state as DarePost["state"],
      createdAt: dare.createdAt,
    };
  } catch (error) {
    console.error(`[ProfileScreen] Failed to build dare ${dare.id}:`, error);
    return null;
  }
}

export function ProfileScreen({
  isActive = true,
  onNavigateToProfile,
  onNavigateToSearch,
  onNavigateToTruthPost,
  onNavigateToDarePost,
}: ProfileScreenProps = {}) {
  const currentAura = useAuraStore((state) => state.currentAura);
  const openAuraSheet = useAuraStore((state) => state.openSheet);
  const [activeTab, setActiveTab] = useState<"posts" | "truths" | "dares">(
    "posts",
  );
  const { user, signOut, subscribe, uploadAvatar } = useAuthStore();
  const {
    posts: storePosts,
    userPosts,
    loadUserPosts,
    loadingUserPosts,
    subscribeToUserPosts,
    unsubscribeFromUserPosts,
  } = usePostsStore();
  const { profile, friends, friendsCount, loadProfile } = useUserProfileStore();
  const { sentDares, receivedDares, loadUserDares } = useDareStore();
  const [showPostsScreen, setShowPostsScreen] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [showFriendsScreen, setShowFriendsScreen] = useState(false);
  const [showAvatarPreview, setShowAvatarPreview] = useState(false);
  const [showTruthsListScreen, setShowTruthsListScreen] = useState(false);
  const [showDaresListScreen, setShowDaresListScreen] = useState(false);
  const [showRelationshipsScreen, setShowRelationshipsScreen] = useState(false);
  const [showStickmanCustomization, setShowStickmanCustomization] = useState(false);
  const [stickmanCustomization, setStickmanCustomization] = useState<StickmanCustomization>(
    DEFAULT_STICKMAN_CUSTOMIZATION,
  );
  const [initialTruthId, setInitialTruthId] = useState<string | undefined>(
    undefined,
  );
  const [initialDareId, setInitialDareId] = useState<string | undefined>(
    undefined,
  );
  const [truthPosts, setTruthPosts] = useState<TruthPost[]>([]);
  const [darePosts, setDarePosts] = useState<DarePost[]>([]);
  const [loadingTruth, setLoadingTruth] = useState(false);
  const [loadingDares, setLoadingDares] = useState(false);
  const [loadedState, setLoadedState] = useState<ProfileTabLoadState>({
    truthsLoadedForUserId: null,
    daresLoadedForUserId: null,
  });
  const [profileHeaderCounts, setProfileHeaderCounts] =
    useState<ProfileHeaderCounts>({
      dares: null,
      truths: null,
    });
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile || user) {
      setStickmanCustomization(getStickmanCustomization(profile || user));
    }
  }, [profile, user]);

  // Handle logout
  const handleLogout = async () => {
    // TEMPORARILY DISABLED FOR MOBILE DEBUGGING - Remove isLoggingOut state to prevent button being stuck disabled
    // DISABLED: setIsLoggingOut(true);

    try {
      console.log("ðŸšª Attempting logout...");
      await signOut();
      console.log("âœ… Logout successful");
      // The app should automatically redirect to auth screen due to isAuthenticated change
    } catch (error) {
      console.error("âŒ LOGOUT ERROR:", error);
      alert(
        `Logout failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      // DISABLED: setIsLoggingOut(false);
    }
  };

  // Subscribe to auth changes to ensure profile updates are reflected
  useEffect(() => {
    const unsubscribe = subscribe((_updatedUser) => {});
    return () => unsubscribe();
  }, [subscribe]);

  // Load user profile and friends count when component mounts or user changes
  useEffect(() => {
    if (isActive && user?.id) {
      subscribeToUserPosts(user.id);
      loadProfile(user.id);
      loadUserDares(user.id, "all");

      // Cleanup subscription when user changes or component unmounts
      return () => {
        unsubscribeFromUserPosts();
      };
    }
  }, [
    isActive,
    user?.id,
    subscribeToUserPosts,
    unsubscribeFromUserPosts,
    loadProfile,
    loadUserDares,
  ]);

  const loadProfileHeaderCounts = useCallback(async (userId: string) => {
    const { data, error } = await getSupabaseBrowserClient().rpc("get_profile_content_counts", {
      p_user_id: userId,
    });
    if (!error && data?.[0]) {
      return { dares: Number(data[0].dares) || 0, truths: Number(data[0].truths) || 0 };
    }
    const [dares, truths] = await Promise.all([
      countUserChallengeDocs("dares", userId, "ACCEPTED_REAL"),
      countUserChallengeDocs("truths", userId, "APPROVED"),
    ]);
    return { dares, truths };
  }, []);

  useEffect(() => {
    if (!isActive || !user?.id) {
      setProfileHeaderCounts({ dares: null, truths: null });
      return;
    }

    let isCancelled = false;
    setProfileHeaderCounts({ dares: null, truths: null });
    void loadProfileHeaderCounts(user.id)
      .then((counts) => {
        if (!isCancelled) {
          setProfileHeaderCounts(counts);
        }
      })
      .catch((error) => {
        console.warn("[ProfileScreen] Failed to load profile counts:", error);
        if (!isCancelled) {
          setProfileHeaderCounts({ dares: null, truths: null });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isActive, user?.id, loadProfileHeaderCounts]);

  const loadProfileTruthPosts = useCallback(async (userId: string) => {
    setLoadingTruth(true);

    try {
      const response = await truthService.getUserTruths(userId, "all");
      const rawTruths = (response.success ? response.truths : []) ?? [];
      const uniqueTruths = rawTruths.filter((truth: TruthEntity, index) => {
        return (
          rawTruths.findIndex((candidate: TruthEntity) => {
            return candidate?.id === truth?.id;
          }) === index
        );
      });
      const approvedTruths = uniqueTruths.filter(
        (truth: TruthEntity) => truth.state === "APPROVED",
      );
      const builtTruths = await Promise.all(approvedTruths.map(buildTruthPost));

      setTruthPosts(
        builtTruths.filter((truth): truth is TruthPost => truth !== null),
      );
      setLoadedState((current) => ({
        ...current,
        truthsLoadedForUserId: userId,
      }));
    } catch (error) {
      console.error("[ProfileScreen] Failed to load profile truths:", error);
      setTruthPosts([]);
      setLoadedState((current) => ({
        ...current,
        truthsLoadedForUserId: userId,
      }));
    } finally {
      setLoadingTruth(false);
    }
  }, []);

  const loadProfileDarePosts = useCallback(async (userId: string) => {
    setLoadingDares(true);

    try {
      const response = await dareService.getDaresForUser(userId);
      const rawDares = (response.success ? response.dares : []) ?? [];
      const uniqueDares = rawDares.filter((dare: any, index: number) => {
        return (
          rawDares.findIndex((candidate: any) => {
            return candidate?.id === dare?.id;
          }) === index
        );
      });

      const completedDares = uniqueDares.filter(
        (dare: any) =>
          dare.state === "ACCEPTED_REAL" && !!dare.proofMediaUrl,
      );

      completedDares.sort(
        (a: any, b: any) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      const builtDares = await Promise.all(completedDares.map(buildDarePost));

      setDarePosts(
        builtDares.filter((dare): dare is DarePost => dare !== null),
      );
      setLoadedState((current) => ({
        ...current,
        daresLoadedForUserId: userId,
      }));
    } catch (error) {
      console.error("[ProfileScreen] Failed to load profile dares:", error);
      setDarePosts([]);
      setLoadedState((current) => ({
        ...current,
        daresLoadedForUserId: userId,
      }));
    } finally {
      setLoadingDares(false);
    }
  }, []);

  // Load truth/dare posts when those tabs are activated without sharing feed state.
  useEffect(() => {
    if (!isActive || !user?.id) return;
    if (
      activeTab !== "posts" &&
      !loadingTruth &&
      loadedState.truthsLoadedForUserId !== user.id
    ) {
      void loadProfileTruthPosts(user.id);
    }
    if (
      activeTab !== "posts" &&
      !loadingDares &&
      loadedState.daresLoadedForUserId !== user.id
    ) {
      void loadProfileDarePosts(user.id);
    }
  }, [
    activeTab,
    isActive,
    user?.id,
    loadingTruth,
    loadingDares,
    loadedState.truthsLoadedForUserId,
    loadedState.daresLoadedForUserId,
    loadProfileTruthPosts,
    loadProfileDarePosts,
  ]);

  // Handler for opening friends screen
  const handleFriendsClick = () => {
    setShowFriendsScreen(true);
  };

  const profileData = useProfileDataStore();
  const displayName =
    user?.id &&
    profileData.currentUserId === user.id &&
    profileData.currentDisplayName
      ? profileData.currentDisplayName
      : user?.displayName || user?.username || "User";
  const username =
    user?.id &&
    profileData.currentUserId === user.id &&
    profileData.currentUsername
      ? profileData.currentUsername
      : user?.username || "user";
  const profileHeaderUsername = username.startsWith("@")
    ? username
    : `@${username}`;
  const currentAvatarFromStore = useAvatarStore((state) =>
    user?.id
      ? state.userAvatars[user.id] || state.globalAvatar
      : state.globalAvatar,
  );
  const avatarPreviewSrc =
    getAggressiveAvatar(
      currentAvatarFromStore || user?.avatar,
      "/default-avatar.png",
      user?.id,
      username,
    ) || "/default-avatar.png";

  const handleAvatarTap = () => {
    setShowAvatarPreview(true);
  };

  const handleAvatarUploadClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    avatarFileInputRef.current?.click();
  };

  const handleAvatarFileSelect = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setIsUploadingAvatar(true);
    try {
      const response = await uploadAvatar(file);
      if (!response.success) {
        alert(response.error || "Unable to upload avatar.");
        return;
      }

      if (user?.id) {
        await avatarSyncService.refreshUserAvatar(user.id);
      }
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "Unable to upload avatar.",
      );
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const allUserDares = [...sentDares, ...receivedDares];
  const loadedUserDaresCount = new Set(
    allUserDares.map((dare) => dare.id).filter(Boolean),
  ).size;
  const surrenderedDaresCount = allUserDares.filter(
    (dare) => dare.state === "CHICKEN_OUT",
  ).length;
  const fallbackProfileDaresCount = toSafeCount(
    (profile as any)?.daresCount ??
      (profile as any)?.dares_count ??
      (profile as any)?.daresCompleted ??
      (profile as any)?.dares_completed,
  );
  const profileDaresCount =
    profileHeaderCounts.dares ??
    (loadedUserDaresCount > 0
      ? loadedUserDaresCount
      : fallbackProfileDaresCount);

  // In production mode, profile stats come from backend
  // Start with empty stats - will be populated by real data
  const profileStats: ProfileStats = {
    daresCompleted: profileDaresCount,
    daresSurrendered:
      surrenderedDaresCount > 0
        ? surrenderedDaresCount
        : toSafeCount(
            (profile as any)?.daresRefused ?? (profile as any)?.dares_refused,
          ),
    friends: toSafeCount(friendsCount), // Use actual friends count from useUserProfileStore
  };
  // Keep ProfileScreen locked to the authenticated user's own posts only.
  // `userPosts` is shared in the store and can temporarily hold another user's
  // posts when visiting their profile, so we hard-filter here.
  const currentUserPosts = (userPosts || []).filter(
    (post) => !user?.id || post.author?.id === user.id,
  );

  // Deduplicate the current user's posts so profile grid and posts screen stay in sync.
  const uniquePosts = currentUserPosts.filter(
    (post, index, self) => self.findIndex((p) => p.id === post.id) === index,
  );

  // Sort posts by timestamp descending (latest first) like Instagram
  const sortedPosts = [...uniquePosts].sort((a, b) => {
    const timestampA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const timestampB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return timestampB - timestampA;
  });

  const feedPostById = new Map((storePosts || []).map((post) => [post.id, post]));
  const getUniqueLikeCountFromPost = (
    post?: (typeof sortedPosts)[number] | null,
  ) => {
    if (!post) return 0;
    const explicitCount = toSafeCount(
      post.likes_count ??
        (post as any).likesCount ??
        (post as any).like_count ??
        (post as any).stats?.likes,
    );
    const uniqueLikedUsers = Object.keys(post.likesByUser || {}).length;

    return Math.max(explicitCount, uniqueLikedUsers);
  };

  const getPostLikeCount = (post: (typeof sortedPosts)[number]) => {
    const feedPost = feedPostById.get(post.id) as
      | (typeof sortedPosts)[number]
      | undefined;

    return Math.max(
      getUniqueLikeCountFromPost(feedPost),
      getUniqueLikeCountFromPost(post),
    );
  };

  const userTruthPosts = truthPosts.filter(
    (truth) =>
      !user?.id ||
      truth.challengerId === user.id ||
      truth.receiverId === user.id,
  );
  const approvedUserTruthPosts = userTruthPosts.filter(
    (truth) => truth.state === "APPROVED",
  );
  const fallbackProfileTruthsCount = toSafeCount(
    (profile as any)?.truthsCount ??
      (profile as any)?.truths_count ??
      (profile as any)?.truthsAnswered ??
      (profile as any)?.truths_answered,
  );
  const profileTruthsCount =
    profileHeaderCounts.truths ??
    (userTruthPosts.length > 0
      ? userTruthPosts.length
      : fallbackProfileTruthsCount);

  const userDarePosts = darePosts.filter(
    (dare) =>
      !user?.id || dare.challengerId === user.id || dare.receiverId === user.id,
  );
  const completedUserDarePosts = userDarePosts.filter(
    (dare) => dare.state === "ACCEPTED_REAL" && !!dare.proof,
  );
  const profileTopStats = [
    {
      label: "Friends",
      value: profileStats.friends,
      onClick: handleFriendsClick,
    },
    {
      label: "Truths",
      value: profileTruthsCount,
      onClick: () => {
        setActiveTab("truths");
      },
    },
    {
      label: "Dares",
      value: profileStats.daresCompleted,
      onClick: () => {
        setActiveTab("dares");
      },
    },
  ];

  if (showPostsScreen) {
    return (
      <PostsScreen
        onBack={() => {
          setShowPostsScreen(false);
        }}
        posts={sortedPosts}
        onNavigateToProfile={onNavigateToProfile}
        userName={displayName}
        targetUserId={user?.id}
      />
    );
  }

  if (showTruthsListScreen) {
    return (
      <TruthsListScreen
        userId={user?.id}
        onBack={() => {
          setShowTruthsListScreen(false);
          setInitialTruthId(undefined);
        }}
        truthPosts={approvedUserTruthPosts}
        loading={loadingTruth}
        initialTruthId={initialTruthId}
        titleName={displayName || username}
        onSelectTruth={(truth) => {
          setShowTruthsListScreen(false);
          setInitialTruthId(undefined);
          onNavigateToTruthPost?.(truth);
        }}
      />
    );
  }

  if (showDaresListScreen) {
    return (
      <DaresListScreen
        userId={user?.id}
        onBack={() => {
          setShowDaresListScreen(false);
          setInitialDareId(undefined);
        }}
        darePosts={completedUserDarePosts}
        loading={loadingDares}
        initialDareId={initialDareId}
        titleName={displayName || username}
        onSelectDare={(dare) => {
          setShowDaresListScreen(false);
          setInitialDareId(undefined);
          onNavigateToDarePost?.(dare);
        }}
      />
    );
  }

  const PostCard = ({ post }: { post: any }) => {
    const [touched, setTouched] = useState(false);
    return (
      <div
        onMouseDown={() => setTouched(true)}
        onMouseUp={() => setTouched(false)}
        onMouseLeave={() => setTouched(false)}
        onTouchStart={() => setTouched(true)}
        onTouchEnd={() => setTouched(false)}
        style={{
          background: "rgba(255,255,255,0.04)",
          border: touched
            ? "2px solid rgba(74,222,128,0.7)"
            : "2px solid rgba(255,255,255,0.08)",
          borderRadius: "28px",
          padding: "20px 20px 18px",
          marginBottom: "24px",
          marginLeft: "-6px",
          marginRight: "-6px",
          backdropFilter: "blur(10px)",
          boxShadow: touched
            ? "0 0 0 1px rgba(74,222,128,0.15), 0 0 30px rgba(74,222,128,0.18), 0 4px 24px rgba(0,0,0,0.4)"
            : "0 4px 24px rgba(0,0,0,0.3)",
          transition: "border 0.15s ease, box-shadow 0.15s ease",
          cursor: "pointer",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "14px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ position: "relative" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #4ade80, #22c55e)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "2px solid rgba(74,222,128,0.5)",
                }}
              >
                <span
                  style={{ color: "#000", fontWeight: 700, fontSize: "17px" }}
                >
                  Y
                </span>
              </div>
              <div
                style={{
                  position: "absolute",
                  bottom: "-2px",
                  right: "-2px",
                  width: "18px",
                  height: "18px",
                  background: "#4ade80",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1.5px solid #0a0a0a",
                }}
              >
                <CheckCircle size={11} color="#000" />
              </div>
            </div>
            <div>
              <p
                style={{
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: "16px",
                  margin: 0,
                }}
              >
                {displayName}
              </p>
              <p
                style={{
                  color: "rgba(255,255,255,0.4)",
                  fontSize: "13px",
                  margin: 0,
                }}
              >
                {username}
              </p>
            </div>
          </div>
          <button
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "none",
              borderRadius: "50%",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "rgba(255,255,255,0.5)",
            }}
          >
            <Settings size={15} />
          </button>
        </div>

        {/* Dare badge (before image for dare posts) */}
        {post.type === "dare" && post.dareState && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              background: "rgba(74,222,128,0.15)",
              border: "1px solid rgba(74,222,128,0.4)",
              borderRadius: "999px",
              padding: "4px 12px",
              marginBottom: "12px",
            }}
          >
            <Target size={12} color="#4ade80" />
            <span
              style={{ color: "#4ade80", fontSize: "12px", fontWeight: 600 }}
            >
              Completed
            </span>
          </div>
        )}

        {/* Image â€” full width, tall, edge-to-edge inside card */}
        {post.media && (
          <div style={{ margin: "6px -17px 16px -17px" }}>
            <div style={{ borderRadius: "14px", overflow: "hidden" }}>
              {post.media.type === "image" ? (
                <img
                  src={post.media.url}
                  alt="Post"
                  style={{
                    width: "100%",
                    height: "440px",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              ) : (
                <div style={{ position: "relative", height: "440px" }}>
                  <img
                    src={post.media.thumbnail || post.media.url}
                    alt="Video"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(0,0,0,0.3)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <div
                      style={{
                        width: "52px",
                        height: "52px",
                        background: "rgba(255,255,255,0.15)",
                        borderRadius: "50%",
                        display: "none",
                        alignItems: "center",
                        justifyContent: "center",
                        backdropFilter: "blur(4px)",
                      }}
                    >
                      <Zap size={22} color="#fff" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action row â€” like, comment, share â€” matching reference layout */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            marginBottom: "12px",
          }}
        >
          <button
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.7)",
              cursor: "pointer",
              fontSize: "15px",
              fontWeight: 500,
              padding: 0,
            }}
          >
            <Heart size={22} strokeWidth={1.8} />
            <span>{post.stats.likes}</span>
          </button>
          <button
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.7)",
              cursor: "pointer",
              fontSize: "15px",
              fontWeight: 500,
              padding: 0,
            }}
          >
            <MessageCircle size={22} strokeWidth={1.8} />
            <span>{post.stats.comments}</span>
          </button>
          <button
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.7)",
              cursor: "pointer",
              fontSize: "15px",
              fontWeight: 500,
              padding: 0,
              marginLeft: "2px",
            }}
          >
            <Share2 size={20} strokeWidth={1.8} />
          </button>
        </div>

        {/* Caption â€” @username bold + text inline, like reference */}
        <p
          style={{
            color: "rgba(255,255,255,0.9)",
            fontSize: "14px",
            lineHeight: "1.55",
            margin: "0 0 6px",
          }}
        >
          <span style={{ fontWeight: 700 }}>@{username}</span> {post.content}
        </p>

        {/* DatabaseTimestamp */}
        <p
          style={{
            color: "rgba(255,255,255,0.3)",
            fontSize: "12px",
            margin: 0,
          }}
        >
          {formatTimeAgo(post.timestamp)}
        </p>
      </div>
    );
  };

  return (
    <div
      style={{
        height: "100%",
        minHeight: 0,
        background:
          "linear-gradient(180deg, #141414 0%, #0e0e0e 52%, #0a0a0a 100%)",
        fontFamily:
          "var(--font-ui)",
        paddingTop: "calc(var(--safe-area-top) + 12px)",
        paddingBottom: "calc(var(--bottom-nav-total-height) + 24px)",
        position: "relative",
        overflowX: "hidden",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        overscrollBehaviorY: "contain",
        touchAction: "pan-y",
      }}
    >
      <style>{`
        .profile-posts-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
          margin-bottom: 0;
        }
        .profile-hero-card {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .profile-proof-stat-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0;
          width: 100%;
          min-height: 76px;
          align-items: stretch;
        }
        .profile-proof-stat {
          align-items: center;
          background: transparent;
          border: 0;
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          gap: 7px;
          justify-content: center;
          min-height: 76px;
          min-width: 0;
          padding: 11px 6px 10px;
          position: relative;
          text-align: center;
          transition: background 0.18s ease, transform 0.18s ease;
        }
        .profile-proof-stat:not(:first-child)::before {
          content: "";
          position: absolute;
          left: 0;
          top: 18px;
          bottom: 18px;
          width: 1px;
          background: linear-gradient(180deg, transparent, rgba(255,255,255,0.16), transparent);
        }
        .profile-proof-stat:hover {
          background: rgba(255,255,255,0.055);
        }
        .profile-proof-stat-value {
          color: #fff;
          font-size: 25px;
          font-weight: 950;
          line-height: 1;
          margin: 0;
          letter-spacing: 0;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .profile-proof-stat-label {
          color: #cbd5e1;
          font-size: 12.5px;
          font-weight: 850;
          line-height: 1;
          margin: 0;
          letter-spacing: 0;
        }
        @media (max-width: 480px) {
          .profile-posts-grid {
            gap: 18px;
          }
          .profile-hero-card {
            gap: 15px;
            padding: 8px 4px 16px !important;
            border-radius: 28px !important;
          }
          .profile-hero-card h2 {
            font-size: 20px !important;
          }
          .profile-proof-stat {
            min-height: 70px;
            padding: 10px 3px 9px;
          }
          .profile-proof-stat:not(:first-child)::before {
            top: 17px;
            bottom: 17px;
          }
          .profile-proof-stat-value {
            font-size: 22px;
          }
          .profile-proof-stat-label {
            font-size: 11.5px;
          }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes dailySweep {
          0% { transform: translateX(-120%); }
          42% { transform: translateX(120%); }
          100% { transform: translateX(120%); }
        }
        @keyframes dailyFloatIn {
          from { opacity: 0; transform: translateY(16px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-fade-in-up {
          animation: dailyFloatIn 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .animate-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .shimmer {
          background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }
        .profile-daily-shine::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.13), transparent);
          animation: dailySweep 6.6s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes activityRadarSweep {
          0% { transform: translateX(-135%) skewX(-18deg); opacity: 0; }
          12% { opacity: 1; }
          44% { transform: translateX(260%) skewX(-18deg); opacity: 1; }
          100% { transform: translateX(260%) skewX(-18deg); opacity: 0; }
        }
        @keyframes activityRadarPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(74,222,128,0.22), 0 0 20px rgba(74,222,128,0.18); }
          50% { box-shadow: 0 0 0 7px rgba(74,222,128,0), 0 0 30px rgba(56,189,248,0.24); }
        }
        .activity-radar-cta {
          position: relative;
          min-height: 58px;
          width: 100%;
          overflow: hidden;
          border: 1px solid rgba(74,222,128,0.42);
          border-radius: 22px;
          background:
            radial-gradient(circle at 18% 0%, rgba(255,255,255,0.18), transparent 34%),
            radial-gradient(circle at 82% 120%, rgba(56,189,248,0.22), transparent 40%),
            linear-gradient(135deg, rgba(8,15,10,0.98), rgba(12,28,18,0.98) 48%, rgba(4,14,18,0.98));
          color: #dfffea;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 12px;
          padding: 10px 16px 10px 12px;
          cursor: pointer;
          box-shadow:
            0 18px 42px rgba(0,0,0,0.38),
            0 0 34px rgba(74,222,128,0.16),
            inset 0 1px 0 rgba(255,255,255,0.08);
          transition:
            transform 180ms ease,
            border-color 180ms ease,
            box-shadow 180ms ease,
            filter 180ms ease;
        }
        .activity-radar-cta::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
          animation: activityRadarSweep 4.2s ease-in-out infinite;
          pointer-events: none;
        }
        .activity-radar-cta::after {
          content: "";
          position: absolute;
          inset: 1px;
          border-radius: 21px;
          background: radial-gradient(circle at 16% 50%, rgba(74,222,128,0.18), transparent 34%);
          pointer-events: none;
        }
        .activity-radar-cta:hover {
          transform: translateY(-2px);
          border-color: rgba(134,239,172,0.68);
          filter: brightness(1.08);
          box-shadow:
            0 22px 52px rgba(0,0,0,0.42),
            0 0 46px rgba(74,222,128,0.24),
            inset 0 1px 0 rgba(255,255,255,0.12);
        }
        .activity-radar-cta:disabled {
          cursor: default;
          opacity: 0.52;
          filter: grayscale(0.35);
        }
        .activity-radar-orb {
          position: relative;
          z-index: 1;
          transform: translateX(-3px);
          display: inline-flex;
          width: 38px;
          height: 38px;
          flex: 0 0 auto;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.08);
          background: linear-gradient(180deg, rgba(18,24,18,0.98), rgba(7,10,8,0.98));
          color: #86efac;
          box-shadow:
            0 10px 24px rgba(74,222,128,0.16),
            inset 0 1px 0 rgba(255,255,255,0.08),
            inset 0 -14px 28px rgba(74,222,128,0.06);
          animation: activityRadarPulse 2.8s ease-in-out infinite;
        }
        .activity-radar-copy {
          position: relative;
          z-index: 1;
          display: flex;
          min-width: 0;
          flex-direction: column;
          align-items: flex-start;
          line-height: 1.02;
        }
        .activity-radar-title {
          font-size: 15px;
          font-weight: 950;
          letter-spacing: 0;
          color: #f0fff5;
        }
        .activity-radar-subtitle {
          margin-top: 4px;
          font-size: 11px;
          font-weight: 850;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(187,247,208,0.72);
        }
      `}</style>

      <SocialProfileView
        username={username}
        name={displayName}
        bio={user?.bio}
        avatarUrl={avatarPreviewSrc}
        profileUserId={user?.id}
        aura={currentAura}
        friendsCount={profileStats.friends}
        posts={sortedPosts.map((post) => ({
          id: post.id,
          content: post.content,
          media: post.media,
          likes: getPostLikeCount(post),
        }))}
        truths={approvedUserTruthPosts}
        dares={completedUserDarePosts}
        backedOutCount={profileStats.daresSurrendered}
        activeTab={activeTab === "posts" ? "posts" : "drama"}
        onTabChange={(tab) => setActiveTab(tab === "posts" ? "posts" : "truths")}
        onOpenPost={() => setShowPostsScreen(true)}
        onOpenTruth={(truthId) => {
          setInitialTruthId(truthId);
          setShowTruthsListScreen(true);
        }}
        onOpenDare={(dareId) => {
          setInitialDareId(dareId);
          setShowDaresListScreen(true);
        }}
        onOpenFriends={handleFriendsClick}
        onOpenRelationships={() => setShowRelationshipsScreen(true)}
        stickmanCustomization={stickmanCustomization}
        onOpenStickmanCustomization={() => setShowStickmanCustomization(true)}
        onOpenAura={openAuraSheet}
        onOpenAvatar={handleAvatarTap}
        onChangeAvatar={() => avatarFileInputRef.current?.click()}
        onOpenMenu={() => setShowEditProfile(true)}
        onSearch={onNavigateToSearch}
        onLogout={handleLogout}
        topbarAccessory={<AppearanceToggleInline />}
        isOwnProfile
        friendFaces={(friends || []).map((friend: any) => ({
          id: friend.userId || friend.id,
          name: friend.displayName || friend.display_name || friend.username,
          avatar: friend.avatarUrl || friend.avatar_url || friend.avatar,
        }))}
      />

      {showStickmanCustomization && user?.id && (
        <div className="app-story-shell" style={{ position: "fixed", inset: 0, zIndex: 1100, background: "#0a0f0a" }}>
          <StickmanCustomizationScreen
            userId={user.id}
            name={displayName}
            avatarUrl={avatarPreviewSrc}
            initialCustomization={stickmanCustomization}
            onBack={() => setShowStickmanCustomization(false)}
            onSaved={(next) => {
              setStickmanCustomization(next);
              setShowStickmanCustomization(false);
            }}
          />
        </div>
      )}

      <div style={{ display: "none" }} aria-hidden="true">
      {/* Legacy profile markup retained temporarily while the new profile settles. */}
      {/* Ambient background glow */}
      <div
        style={{
          position: "fixed",
          top: "-240px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "110%",
          height: "320px",
          background:
            "radial-gradient(ellipse 70% 32% at 50% 0%, rgba(74,222,128,0.09) 0%, transparent 100%)",
          pointerEvents: "none",
          zIndex: -1,
        }}
      />

      <div
        className="animate-fade-in-up"
        style={{
          padding: "0 12px 16px",
          position: "relative",
          zIndex: 1,
          maxWidth: "430px",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: "8px",
            minHeight: "42px",
            margin: "0 2px 4px",
          }}
        >
          <div
            style={{
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span
              style={{
                color: "#f8fafc",
                fontSize: "20px",
                fontWeight: 950,
                lineHeight: 1,
                letterSpacing: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {profileHeaderUsername}
            </span>
          </div>
          <AppearanceToggleInline />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              justifyContent: "flex-end",
            }}
          >
            {onNavigateToSearch && (
              <button
                type="button"
                onClick={onNavigateToSearch}
                aria-label="Search users"
                title="Search users"
                style={{
                  width: "36px",
                  height: "36px",
                  flexShrink: 0,
                  borderRadius: "12px",
                  border: "none",
                  background: "transparent",
                  color: "#f8fafc",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  boxShadow: "none",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <Search size={19} strokeWidth={2.45} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowEditProfile(true)}
              aria-label="Profile options"
              title="Profile options"
              style={{
                width: "36px",
                height: "36px",
                flexShrink: 0,
                borderRadius: "12px",
                border: "none",
                background: "transparent",
                color: "#f8fafc",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: "none",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <Menu size={20} strokeWidth={2.55} />
            </button>
          </div>
        </div>

        <div
          className="profile-hero-card"
          style={{
            marginBottom: "20px",
            padding: "2px 4px 12px",
            borderRadius: 0,
            border: "none",
            background: "transparent",
            boxShadow: "none",
            overflow: "visible",
            position: "relative",
          }}
        >
          {/* Instagram-style horizontal layout */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "18px",
              width: "100%",
              position: "relative",
              zIndex: 1,
              marginBottom: 0,
            }}
          >
            {/* Avatar - Left side */}
            <div
              style={{
                position: "relative",
                flexShrink: 0,
                overflow: "visible",
                isolation: "isolate",
              }}
            >
              <div
                onClick={handleAvatarTap}
                onContextMenu={(event) => event.preventDefault()}
                style={{
                  padding: 0,
                  borderRadius: "50%",
                  background:
                    "linear-gradient(135deg, #4ade80 0%, #38bdf8 100%)",
                  border: "none",
                  boxShadow:
                    "0 16px 34px rgba(0,0,0,0.36), 0 0 0 1px rgba(255,255,255,0.06)",
                  width: "82px",
                  height: "82px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  zIndex: 1,
                  cursor: "zoom-in",
                  touchAction: "manipulation",
                  WebkitUserSelect: "none",
                  userSelect: "none",
                }}
              >
                <div
                  style={{
                    width: "78px",
                    height: "78px",
                    borderRadius: "50%",
                    overflow: "hidden",
                    border: "2px solid #07100b",
                  }}
                >
                  <Avatar
                    src={user?.avatar || ""}
                    alt={displayName || "User"}
                    size={82}
                    userId={user?.id}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleAvatarUploadClick}
                disabled={isUploadingAvatar}
                aria-label="Change avatar"
                style={{
                  position: "absolute",
                  bottom: "-3px",
                  right: "-3px",
                  width: "30px",
                  height: "30px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #4ade80, #22c55e)",
                  border: "3px solid #07100b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: isUploadingAvatar ? "default" : "pointer",
                  color: "#000",
                  boxShadow:
                    "0 8px 18px rgba(0,0,0,0.42), 0 4px 12px rgba(74,222,128,0.4)",
                  opacity: isUploadingAvatar ? 0.72 : 1,
                  zIndex: 5,
                  pointerEvents: "auto",
                }}
              >
                {isUploadingAvatar ? (
                  <span
                    style={{
                      width: "12px",
                      height: "12px",
                      borderRadius: "999px",
                      border: "2px solid rgba(0,0,0,0.3)",
                      borderTopColor: "#000",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                ) : (
                  <Camera size={13} strokeWidth={2.6} />
                )}
              </button>
            </div>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                className="profile-proof-stat-row"
                style={{ position: "relative", zIndex: 1 }}
              >
                {profileTopStats.map((stat) => (
                  <button
                    key={stat.label}
                    type="button"
                    onClick={stat.onClick}
                    className="profile-proof-stat"
                    style={{
                      cursor: "pointer",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    <span className="profile-proof-stat-value">
                      {formatProfileCount(stat.value)}
                    </span>
                    <span className="profile-proof-stat-label">
                      {stat.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Identity and bio */}
          <div
            style={{
              position: "relative",
              zIndex: 1,
            }}
          >
            <h2
              style={{
                color: "#fff",
                fontSize: "22px",
                fontWeight: 900,
                lineHeight: 1.1,
                margin: "0 0 5px",
                letterSpacing: "-0.025em",
              }}
            >
              {displayName}
            </h2>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                margin: "0 0 12px",
                minWidth: 0,
              }}
            >
              <p
                style={{
                  color: "#94a3b8",
                  fontSize: "13px",
                  fontWeight: 750,
                  lineHeight: 1,
                  margin: 0,
                  minWidth: 0,
                }}
              >
                {username.startsWith("@") ? username : `@${username}`}
              </p>
            </div>
            <p
              style={{
                color: "rgba(255,255,255,0.78)",
                fontSize: "14px",
                lineHeight: 1.42,
                margin: "0",
                maxWidth: "100%",
                whiteSpace: "normal",
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                fontWeight: 600,
                letterSpacing: "-0.01em",
              }}
            >
              {user?.bio?.trim() ||
                "Proof-first posts, real dares, close-friend stories."}
            </p>
          </div>
        </div>

        {/* Subtle profile actions */}
        <div
          style={{
            margin: "-22px 16px 18px",
            padding: 0,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: "8px",
            }}
          >
            <button
              type="button"
              onClick={() => setShowRelationshipsScreen(true)}
              className="activity-radar-cta"
            >
              <span className="activity-radar-orb">
                <Heart size={18} strokeWidth={2.8} />
              </span>
              <span className="activity-radar-copy">
                <span className="activity-radar-title">Relationships</span>
                <span className="activity-radar-subtitle">Conflicts, allies, rivals</span>
              </span>
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            background:
              "linear-gradient(180deg, rgba(5,19,18,0.72), rgba(4,10,9,0.9))",
            borderRadius: "999px",
            padding: "5px",
            margin: "0 16px 28px",
            border: "1px solid rgba(74,222,128,0.14)",
            boxShadow:
              "0 18px 48px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
            overflow: "hidden",
          }}
        >
          {(["posts", "truths", "dares"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "12px 8px",
                borderRadius: "999px",
                border: "none",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 900,
                textTransform: "capitalize",
                transition: "all 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
                background:
                  activeTab === tab
                    ? "linear-gradient(135deg, #4ade80, #22c55e)"
                    : "transparent",
                color: activeTab === tab ? "#061006" : "#94a3b8",
                boxShadow:
                  activeTab === tab
                    ? "0 4px 24px rgba(74,222,128,0.35), inset 0 1px 0 rgba(255,255,255,0.3)"
                    : "none",
                letterSpacing: 0,
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "posts" && (
          <div
            style={{
              padding: "0 16px",
              borderRadius: 0,
              border: "none",
              background: "transparent",
              boxShadow: "none",
            }}
          >
            {sortedPosts.length === 0 ? (
              <div
                style={{
                  minHeight: "300px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  padding: "40px 20px",
                }}
              >
                <div>
                  <Camera
                    size={48}
                    strokeWidth={1.5}
                    style={{
                      color: "rgba(255,255,255,0.2)",
                      margin: "0 auto 16px",
                    }}
                  />
                  <p
                    style={{
                      color: "#fff",
                      fontSize: "22px",
                      fontWeight: 700,
                      margin: "0 0 8px",
                    }}
                  >
                    No Posts Yet
                  </p>
                  <p
                    style={{
                      color: "rgba(255,255,255,0.5)",
                      fontSize: "14px",
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    Share your first photo or video
                  </p>
                </div>
              </div>
            ) : (
              <div className="profile-posts-grid">
                {sortedPosts.map((post) => (
                  <div
                    key={post.id}
                    style={{
                      width: "100%",
                      aspectRatio: "1/1",
                      borderRadius: "28px",
                      overflow: "hidden",
                      border: "1px solid rgba(255,255,255,0.06)",
                      cursor: "pointer",
                      position: "relative",
                      transition: "all 0.2s cubic-bezier(0.32, 0.72, 0, 1)",
                      background:
                        "linear-gradient(180deg, rgba(18,28,21,0.96), rgba(7,12,10,0.98))",
                      boxShadow:
                        "0 18px 44px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.045)",
                      WebkitUserSelect: "none",
                      userSelect: "none",
                      WebkitTapHighlightColor: "transparent",
                      touchAction: "manipulation",
                      zIndex: 1,
                    }}
                  >
                    <button
                      onClick={() => {
                        setShowPostsScreen(true);
                      }}
                      onMouseDown={(e) => {
                        const parent = e.currentTarget.parentElement;
                        if (parent) {
                          parent.style.opacity = "0.7";
                        }
                      }}
                      onMouseUp={(e) => {
                        const parent = e.currentTarget.parentElement;
                        if (parent) {
                          parent.style.opacity = "1";
                        }
                      }}
                      onMouseLeave={(e) => {
                        const parent = e.currentTarget.parentElement;
                        if (parent) {
                          parent.style.opacity = "1";
                        }
                      }}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        zIndex: 2,
                        padding: 0,
                        margin: 0,
                      }}
                    />
                    {post.media ? (
                      <img
                        src={post.media.url}
                        alt="Post"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          borderRadius: "28px",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          background:
                            "radial-gradient(circle at 25% 20%, rgba(74,222,128,0.16), transparent 44%), radial-gradient(circle at 80% 70%, rgba(56,189,248,0.12), transparent 42%), linear-gradient(135deg, rgba(14,24,18,0.98), rgba(5,8,6,0.98))",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "12px",
                          textAlign: "center",
                          borderRadius: "28px",
                        }}
                      >
                        <p
                          style={{
                            color: "rgba(255,255,255,0.6)",
                            fontSize: "11px",
                            lineHeight: "1.4",
                            margin: 0,
                          }}
                        >
                          {post.content.slice(0, 40)}
                          {post.content.length > 40 ? "..." : ""}
                        </p>
                      </div>
                    )}
                    {/* Dark overlay with stats on each grid item */}
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background:
                          "linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.16) 46%, transparent 78%)",
                        display: "flex",
                        alignItems: "flex-end",
                        justifyContent: "space-between",
                        padding: "10px",
                        opacity: 0,
                        transition: "opacity 0.2s ease",
                        borderRadius: "28px",
                        pointerEvents: "none",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "7px",
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            color: "#fff",
                            fontSize: "11px",
                            fontWeight: 700,
                          }}
                        >
                          â™¥ {formatProfileCount(getPostLikeCount(post))}
                        </span>
                        <span
                          style={{
                            color: "#fff",
                            fontSize: "11px",
                            fontWeight: 700,
                          }}
                        >
                          ðŸ’¬ {formatProfileCount(toSafeCount(post.comments_count))}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "flex-end",
                        padding: "0 24px 14px",
                        borderRadius: "28px",
                        background:
                          "linear-gradient(to top, rgba(0,0,0,0.74) 0%, rgba(0,0,0,0.14) 44%, transparent 76%)",
                        pointerEvents: "none",
                      }}
                    >
                      <div style={{ width: "100%" }}>
                        <div
                          style={{
                            height: "1px",
                            width: "100%",
                            background:
                              "linear-gradient(90deg, rgba(255,255,255,0.18), rgba(255,255,255,0.04))",
                            marginBottom: "10px",
                          }}
                        />
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            color: "#8da3b6",
                            fontSize: "11px",
                            fontWeight: 950,
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                            textShadow: "0 2px 8px rgba(0,0,0,0.45)",
                          }}
                        >
                          {post.media?.type === "video"
                            ? `Views ${post.stats?.views ?? 0}`
                            : `Likes ${formatProfileCount(getPostLikeCount(post))}`}
                        </span>
                      </div>
                    </div>

                    {post.media && post.media.type === "video" && (
                      <div
                        style={{
                          position: "absolute",
                          bottom: "0",
                          left: "0",
                          right: "0",
                          background:
                            "linear-gradient(to top, rgba(0,0,0,0.8), transparent)",
                          padding: "10px",
                          display: "flex",
                          alignItems: "center",
                          borderRadius: "0 0 28px 28px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "3px",
                          }}
                        >
                          <Play size={10} color="#fff" strokeWidth={2} />
                          <span
                            style={{
                              color: "#fff",
                              fontSize: "11px",
                              fontWeight: 600,
                            }}
                          >
                            {post.stats.views}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "truths" && (
          <div
            style={{
              padding: 0,
              borderRadius: 0,
              border: "none",
              background: "transparent",
              boxShadow: "none",
              touchAction: "pan-y",
            }}
          >
            {loadingTruth ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "72px 20px",
                  gap: "16px",
                }}
              >
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    border: "3px solid rgba(96,165,250,0.15)",
                    borderTopColor: "#60a5fa",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                    willChange: "transform",
                    transformStyle: "preserve-3d",
                  }}
                />
                <span
                  style={{
                    color: "rgba(255,255,255,0.4)",
                    fontSize: "14px",
                    fontWeight: 500,
                  }}
                >
                  Loading truths...
                </span>
              </div>
            ) : approvedUserTruthPosts.length === 0 ? (
              <div style={{ padding: "64px 24px", textAlign: "center" }}>
                <MessageSquare
                  size={36}
                  color="rgba(255,255,255,0.12)"
                  style={{ margin: "0 auto 14px" }}
                />
                <p
                  style={{
                    color: "rgba(255,255,255,0.4)",
                    fontSize: "15px",
                    fontWeight: 600,
                    margin: "0 0 4px",
                  }}
                >
                  No truths yet
                </p>
                <p
                  style={{
                    color: "rgba(255,255,255,0.2)",
                    fontSize: "13px",
                    margin: 0,
                  }}
                >
                  Truths you take part in will appear here
                </p>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                {approvedUserTruthPosts.map((truth, index) => {
                  const badge =
                    truth.state === "APPROVED"
                      ? { label: "Approved", color: "#4ade80" }
                      : truth.state === "ANSWERED"
                        ? { label: "Answered", color: "#22c55e" }
                        : truth.state === "REJECTED"
                          ? { label: "Rejected", color: "#ef4444" }
                          : truth.state === "UNDER_REVIEW"
                            ? { label: "Under Review", color: "#fbbf24" }
                            : {
                                label: "Pending",
                                color: "rgba(255,255,255,0.4)",
                              };
                  return (
                    <div
                      key={truth.id}
                      onClick={() => {
                        setInitialTruthId(truth.id);
                        setShowTruthsListScreen(true);
                      }}
                      style={{
                        animationDelay: `${index * 0.04}s`,
                        width: "100%",
                        background:
                          "radial-gradient(circle at 10% 0%, rgba(74,222,128,0.13), transparent 34%), radial-gradient(circle at 96% 0%, rgba(56,189,248,0.08), transparent 34%), linear-gradient(180deg, rgba(19,28,22,0.98), rgba(6,10,8,0.99))",
                        border: `1px solid ${badge.color}36`,
                        borderRadius: "25px",
                        padding: "14px",
                        color: "#fff",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "12px",
                        position: "relative",
                        overflow: "hidden",
                        boxShadow:
                          "0 18px 44px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.07)",
                        transition:
                          "border-color 0.2s ease, transform 0.15s ease, filter 0.15s ease",
                        WebkitTapHighlightColor: "transparent",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-1px)";
                        e.currentTarget.style.filter = "brightness(1.04)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.filter = "brightness(1)";
                      }}
                    >
                      <div
                        style={{
                          width: "38px",
                          height: "38px",
                          borderRadius: "16px",
                          background:
                            "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.025))",
                          border: `1px solid ${badge.color}36`,
                          color: badge.color,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: `0 12px 28px rgba(0,0,0,0.28), 0 0 20px ${badge.color}24`,
                          flexShrink: 0,
                        }}
                      >
                        <MessageSquare size={18} strokeWidth={2.7} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "6px",
                            margin: 0,
                            fontSize: "13px",
                            fontWeight: 800,
                            lineHeight: 1.3,
                            color: "rgba(255,255,255,0.58)",
                            letterSpacing: 0,
                          }}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onNavigateToProfile && truth.challengerId) {
                                onNavigateToProfile(truth.challengerId);
                              }
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              cursor: onNavigateToProfile
                                ? "pointer"
                                : "default",
                              textDecoration: "none",
                            }}
                          >
                            <img
                              src={truth.challenger.avatar}
                              alt=""
                              style={{
                                width: "20px",
                                height: "20px",
                                borderRadius: "50%",
                                objectFit: "cover",
                                border: "1px solid rgba(255,255,255,0.14)",
                                boxShadow: "0 5px 12px rgba(0,0,0,0.26)",
                              }}
                            />
                              <span
                                style={{
                                color: "rgba(255,255,255,0.92)",
                                fontSize: "13px",
                                fontWeight: 850,
                              }}
                            >
                              {truth.challenger.nickname}
                            </span>
                          </button>
                          <span
                            style={{
                              margin: "0 6px",
                              color: "#86efac",
                              fontSize: "10.5px",
                              fontWeight: 950,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              textShadow: "0 0 14px rgba(74,222,128,0.34)",
                            }}
                          >
                            Asked
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onNavigateToProfile && truth.receiverId) {
                                onNavigateToProfile(truth.receiverId);
                              }
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              cursor: onNavigateToProfile
                                ? "pointer"
                                : "default",
                              textDecoration: "none",
                            }}
                          >
                            <img
                              src={truth.receiver.avatar}
                              alt=""
                              style={{
                                width: "20px",
                                height: "20px",
                                borderRadius: "50%",
                                objectFit: "cover",
                                border: "1px solid rgba(255,255,255,0.14)",
                                boxShadow: "0 5px 12px rgba(0,0,0,0.26)",
                              }}
                            />
                              <span
                                style={{
                                color: "rgba(255,255,255,0.92)",
                                fontSize: "13px",
                                fontWeight: 850,
                              }}
                            >
                              {truth.receiver.nickname}
                            </span>
                          </button>
                        </div>
                        {truth.question && (
                          <p
                            style={{
                              margin: "10px 0 0",
                              fontSize: "16px",
                              fontWeight: 900,
                              lineHeight: 1.35,
                              letterSpacing: 0,
                              color: "#fff",
                              overflow: "hidden",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                            }}
                          >
                            {truth.question}
                          </p>
                        )}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "8px",
                            marginTop: "14px",
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              color: "rgba(255,255,255,0.4)",
                              fontSize: "12px",
                              fontWeight: 750,
                            }}
                          >
                            {formatTimeAgo(truth.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "dares" && (
          <div
            style={{
              padding: 0,
              borderRadius: 0,
              border: "none",
              background: "transparent",
              boxShadow: "none",
              touchAction: "pan-y",
            }}
          >
            {loadingDares ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "72px 20px",
                  gap: "16px",
                }}
              >
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    border: "3px solid rgba(74, 222, 128, 0.15)",
                    borderTopColor: "#4ade80",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                    willChange: "transform",
                    transformStyle: "preserve-3d",
                  }}
                />
                <span
                  style={{
                    color: "rgba(255,255,255,0.4)",
                    fontSize: "14px",
                    fontWeight: 500,
                  }}
                >
                  Loading dares...
                </span>
              </div>
            ) : completedUserDarePosts.length === 0 ? (
              <div style={{ padding: "64px 24px", textAlign: "center" }}>
                <Target
                  size={36}
                  color="rgba(255,255,255,0.12)"
                  style={{ margin: "0 auto 14px" }}
                />
                <p
                  style={{
                    color: "rgba(255,255,255,0.4)",
                    fontSize: "15px",
                    fontWeight: 600,
                    margin: "0 0 4px",
                  }}
                >
                  No dares yet
                </p>
                <p
                  style={{
                    color: "rgba(255,255,255,0.2)",
                    fontSize: "13px",
                    margin: 0,
                  }}
                >
                  Dares you take part in will appear here
                </p>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                {completedUserDarePosts.map((dare, index) => {
                  const badge =
                    dare.state === "ACCEPTED_REAL"
                      ? { label: "Completed", color: "#4ade80" }
                      : dare.state === "CHICKEN_OUT"
                        ? { label: "Surrendered", color: "#fbbf24" }
                        : dare.state === "REJECTED_FAKE"
                          ? { label: "Rejected", color: "#ef4444" }
                          : dare.state === "PROOF_SUBMITTED" ||
                              dare.state === "UNDER_REVIEW" ||
                              dare.state === "FRIENDS_VALIDATION"
                            ? { label: "Under Review", color: "#fbbf24" }
                            : dare.state === "ACCEPTED"
                              ? { label: "Accepted", color: "#22c55e" }
                              : {
                                  label: "Pending",
                                  color: "rgba(255,255,255,0.4)",
                                };
                  const darePreviewUrl =
                    dare.proof?.thumbnail || dare.proof?.url || "";
                  return (
                    <div
                      key={dare.id}
                      onClick={() => {
                        setInitialDareId(dare.id);
                        setShowDaresListScreen(true);
                      }}
                      style={{
                        animationDelay: `${index * 0.04}s`,
                        width: "100%",
                        background:
                          "radial-gradient(circle at 10% 0%, rgba(74,222,128,0.13), transparent 34%), radial-gradient(circle at 96% 0%, rgba(56,189,248,0.08), transparent 34%), linear-gradient(180deg, rgba(19,28,22,0.98), rgba(6,10,8,0.99))",
                        border: `1px solid ${badge.color}36`,
                        borderRadius: "25px",
                        padding: "14px",
                        color: "#fff",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "12px",
                        position: "relative",
                        overflow: "hidden",
                        boxShadow:
                          "0 18px 44px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.07)",
                        transition:
                          "border-color 0.2s ease, transform 0.15s ease, filter 0.15s ease",
                        WebkitTapHighlightColor: "transparent",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-1px)";
                        e.currentTarget.style.filter = "brightness(1.04)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.filter = "brightness(1)";
                      }}
                    >
                      <div
                        style={{
                          width: "38px",
                          height: "38px",
                          borderRadius: "16px",
                          background:
                            "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.025))",
                          border: `1px solid ${badge.color}36`,
                          color: badge.color,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: `0 12px 28px rgba(0,0,0,0.28), 0 0 20px ${badge.color}24`,
                          flexShrink: 0,
                        }}
                      >
                        <Target size={18} strokeWidth={2.7} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "6px",
                            margin: 0,
                            fontSize: "13px",
                            fontWeight: 800,
                            lineHeight: 1.3,
                            color: "rgba(255,255,255,0.58)",
                            letterSpacing: 0,
                          }}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onNavigateToProfile && dare.challengerId) {
                                onNavigateToProfile(dare.challengerId);
                              }
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              cursor: onNavigateToProfile
                                ? "pointer"
                                : "default",
                              textDecoration: "none",
                            }}
                          >
                            <img
                              src={dare.challenger.avatar}
                              alt=""
                              style={{
                                width: "20px",
                                height: "20px",
                                borderRadius: "50%",
                                objectFit: "cover",
                                border: "1px solid rgba(255,255,255,0.14)",
                                boxShadow: "0 5px 12px rgba(0,0,0,0.26)",
                              }}
                            />
                              <span
                                style={{
                                color: "rgba(255,255,255,0.92)",
                                fontSize: "13px",
                                fontWeight: 850,
                              }}
                            >
                              {dare.challenger.nickname}
                            </span>
                          </button>
                          <span
                            style={{
                              margin: "0 6px",
                              color: "#86efac",
                              fontSize: "10.5px",
                              fontWeight: 950,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              textShadow: "0 0 14px rgba(74,222,128,0.34)",
                            }}
                          >
                            Dared
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onNavigateToProfile && dare.receiverId) {
                                onNavigateToProfile(dare.receiverId);
                              }
                            }}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                              cursor: onNavigateToProfile
                                ? "pointer"
                                : "default",
                              textDecoration: "none",
                            }}
                          >
                            <img
                              src={dare.receiver.avatar}
                              alt=""
                              style={{
                                width: "20px",
                                height: "20px",
                                borderRadius: "50%",
                                objectFit: "cover",
                                border: "1px solid rgba(255,255,255,0.14)",
                                boxShadow: "0 5px 12px rgba(0,0,0,0.26)",
                              }}
                            />
                              <span
                                style={{
                                color: "rgba(255,255,255,0.92)",
                                fontSize: "13px",
                                fontWeight: 850,
                              }}
                            >
                              {dare.receiver.nickname}
                            </span>
                          </button>
                        </div>
                        {dare.description && (
                          <p
                            style={{
                              margin: "10px 0 0",
                              fontSize: "16px",
                              fontWeight: 900,
                              lineHeight: 1.35,
                              letterSpacing: 0,
                              color: "#fff",
                              overflow: "hidden",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                            }}
                          >
                            {dare.description}
                          </p>
                        )}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "8px",
                            marginTop: "14px",
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              color: "rgba(255,255,255,0.4)",
                              fontSize: "12px",
                              fontWeight: 750,
                            }}
                          >
                            {formatTimeAgo(dare.createdAt)}
                          </span>
                        </div>
                      </div>
                      <div
                        aria-hidden="true"
                        style={{
                          width: "74px",
                          height: "92px",
                          flexShrink: 0,
                          alignSelf: "stretch",
                          minHeight: "92px",
                          borderRadius: "18px",
                          overflow: "hidden",
                          border: `1px solid ${badge.color}30`,
                          background:
                            "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))",
                          boxShadow:
                            "0 14px 30px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.08)",
                          position: "relative",
                        }}
                      >
                        {darePreviewUrl ? (
                          <>
                            <img
                              src={darePreviewUrl}
                              alt=""
                              loading="lazy"
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                display: "block",
                              }}
                            />
                            <span
                              style={{
                                position: "absolute",
                                inset: 0,
                                background:
                                  "linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.34))",
                              }}
                            />
                            {dare.proof?.type === "video" && (
                              <span
                                style={{
                                  position: "absolute",
                                  right: "7px",
                                  bottom: "7px",
                                  width: "24px",
                                  height: "24px",
                                  borderRadius: "999px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  background: "rgba(0,0,0,0.58)",
                                  border: "1px solid rgba(255,255,255,0.16)",
                                  color: "#fff",
                                  backdropFilter: "blur(8px)",
                                  WebkitBackdropFilter: "blur(8px)",
                                }}
                              >
                                <Play size={12} fill="currentColor" />
                              </span>
                            )}
                          </>
                        ) : (
                          <div
                            style={{
                              width: "100%",
                              height: "100%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: badge.color,
                              background:
                                "radial-gradient(circle at 35% 24%, rgba(74,222,128,0.18), transparent 44%), linear-gradient(180deg, rgba(10,18,13,0.95), rgba(4,8,6,0.98))",
                            }}
                          >
                            <Target size={22} strokeWidth={2.5} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Logout button */}
        <button
          onClick={handleLogout}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            padding: "12px",
            borderRadius: "0",
            border: "none",
            background: "transparent",
            color: "rgba(255,255,255,0.25)",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: 500,
            marginTop: "8px",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "#ef4444";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color =
              "rgba(255,255,255,0.25)";
          }}
        >
          <LogOut size={14} />
          <span>Logout</span>
        </button>
      </div>
      </div>

      <input
        ref={avatarFileInputRef}
        type="file"
        accept="image/*"
        onChange={handleAvatarFileSelect}
        style={{ display: "none" }}
      />

      {showAvatarPreview && (
        <div
          className="app-modal-backdrop"
          onClick={() => setShowAvatarPreview(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1600,
            background:
              "linear-gradient(180deg, #141414 0%, #0e0e0e 52%, #0a0a0a 100%)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "28px",
            cursor: "zoom-out",
          }}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setShowAvatarPreview(false);
            }}
            style={{
              position: "absolute",
              top: "calc(18px + var(--safe-area-top))",
              right: "18px",
              width: "42px",
              height: "42px",
              borderRadius: "999px",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.07)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: "0 14px 34px rgba(0,0,0,0.36)",
            }}
            aria-label="Close avatar preview"
          >
            <X size={20} />
          </button>
          <div
            className="app-modal-dialog"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(76vw, 380px)",
              height: "min(76vw, 380px)",
              maxHeight: "72vh",
              maxWidth: "72vh",
              borderRadius: "50%",
              padding: "4px",
              background:
                "linear-gradient(180deg, #141414 0%, #0e0e0e 52%, #0a0a0a 100%)",
              boxShadow:
                "0 30px 100px rgba(0,0,0,0.58), 0 0 60px rgba(74,222,128,0.14), inset 0 1px 0 rgba(255,255,255,0.2)",
              position: "relative",
            }}
          >
            <Avatar
              src={avatarPreviewSrc}
              alt={`${displayName}'s avatar`}
              size={400}
              userId={user?.id}
              disableRealtime
              style={{
                width: "100%",
                height: "100%",
                borderRadius: "50%",
                background: "#111611",
              }}
            />
            <button
              type="button"
              onClick={handleAvatarUploadClick}
              disabled={isUploadingAvatar}
              aria-label="Change avatar"
              style={{
                position: "absolute",
                right: "10px",
                bottom: "10px",
                width: "48px",
                height: "48px",
                borderRadius: "999px",
                border: "3px solid #080d08",
                background: "#4ade80",
                color: "#061006",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: isUploadingAvatar ? "default" : "pointer",
                boxShadow:
                  "0 16px 32px rgba(0,0,0,0.42), 0 0 0 1px rgba(255,255,255,0.16)",
                opacity: isUploadingAvatar ? 0.78 : 1,
              }}
            >
              {isUploadingAvatar ? (
                <span
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "999px",
                    border: "2px solid rgba(6,16,6,0.32)",
                    borderTopColor: "#061006",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
              ) : (
                <Camera size={21} />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Show ProfileEditScreen if settings is clicked */}
      {showEditProfile && (
        <div
          className="app-story-shell"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1000,
            backgroundColor: "#0a0f0a",
          }}
        >
          <ProfileEditScreen
            onBack={() => {
              setShowEditProfile(false);
            }}
          />
        </div>
      )}

      {showFriendsScreen && (
        <div
          className="app-story-shell"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            /* TEMPORARILY DISABLED FOR MOBILE DEBUGGING - Reduce zIndex to prevent blocking */
            /* DISABLED: zIndex: 9999, */
            zIndex: 1000,
            backgroundColor: "#0a0a0a",
          }}
        >
          <FriendsScreen
            onBack={() => setShowFriendsScreen(false)}
            onNavigateToProfile={onNavigateToProfile}
          />
        </div>
      )}

      {showRelationshipsScreen && user?.id && (
        <div
          className="app-story-shell"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1000,
            backgroundColor: "#050806",
          }}
        >
          <RelationshipsScreen
            onBack={() => setShowRelationshipsScreen(false)}
            currentUser={{
              id: user.id,
              display_name: displayName,
              username: username.replace(/^@/, ""),
              avatar_url: user.avatar || avatarPreviewSrc || "",
            }}
            profileUser={{
              id: user.id,
              display_name: displayName,
              username: username.replace(/^@/, ""),
              avatar_url: user.avatar || avatarPreviewSrc || "",
            }}
          />
        </div>
      )}
    </div>
  );
}
