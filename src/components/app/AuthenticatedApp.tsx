"use client";

import {
  memo,
  type ComponentProps,
  type FunctionComponent,
  useEffect,
  useRef,
  useState,
} from "react";
import { MainScreen } from "../screens/MainScreen";
import { FeedScreen } from "../screens/FeedScreen";
import { DaresReceivedScreen } from "../screens/DaresReceivedScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { CreateDareScreen } from "../screens/CreateDareScreen";
import { CreateCommunityDareScreen } from "../screens/CreateCommunityDareScreen";
import { CreateFeedPostScreen } from "../screens/CreateFeedPostScreen";
import { BottomNavigation } from "../navigation/BottomNavigation";
import { ChatListScreen } from "../screens/ChatListScreen";
import MessagingScreen from "../screens/MessagingScreen";
import { DarrenChatScreen } from "../screens/DarrenChatScreen";
import { LaunchGate } from "../LaunchScreen";
import { AuthScreen } from "../screens/AuthScreen";
import { GuestApp } from "./GuestApp";
import { ActionPickerScreen } from "../screens/ActionPickerScreen";
import { CreateInteractionScreen } from "../screens/CreateInteractionScreen";
import { CreatePredictionScreen } from "../screens/CreatePredictionScreen";
import { CreateDealScreen } from "../screens/CreateDealScreen";
import { CreateCustomScreen } from "../screens/CreateCustomScreen";
import { CreateRumourScreen } from "../screens/CreateRumourScreen";
import { CreatePromiseScreen } from "../screens/CreatePromiseScreen";
import { CreateVerdictScreen } from "../screens/CreateVerdictScreen";
import { ProfileCreationScreen } from "../screens/ProfileCreationScreen";
import { AlertsScreen } from "../screens/AlertsScreen";
import { ChallengeFriendTimelineScreen } from "../screens/ChallengeFriendTimelineScreen";
import { FriendsInviteAlertsScreen } from "../screens/FriendsInviteAlertsScreen";
import { UserSearchScreen } from "../screens/UserSearchScreen";
import { UserProfileScreen } from "../screens/UserProfileScreen";
import { ProfileEditScreen } from "../screens/ProfileEditScreen";
import {
  DailyChallengeScreen,
  type DailyChallengeDraft,
} from "../screens/DailyChallengeScreen";
import { DailyChallengeRevealScreen } from "../screens/DailyChallengeRevealScreen";
import { DareCenterScreen } from "../screens/DareCenterScreen";
import { BirthdayRoomScreen } from "../screens/BirthdayRoomScreen";
import { BirthdayPartyRoomScreen } from "../screens/BirthdayPartyRoomScreen";
import { VerdictsScreen } from "../screens/VerdictsScreen";
import { FriendCircleScreen } from "../screens/FriendCircleScreen";
import { AppearanceThemeRuntime } from "../ui/AppearanceToggle";
import type {
  BirthdayDrop,
  BirthdayRoom,
} from "../../middleware/services/birthday-room.service";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { useImmersiveOverlayStore } from "../../stores/useImmersiveOverlayStore";
import { useMessagingStore } from "../../stores/useMessagingStore";
import { useAlertStore } from "../../stores/useAlertStore";
import { useCirclesStore } from "../../stores/useCirclesStore";
import { messagingService } from "../../middleware/services/messaging.service";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { startAvatarSync } from "../../utils/avatarSync";
import { avatarSyncService } from "../../services/avatarSyncService";
import { profileSyncService } from "../../services/profileSyncService";
import { useProfileDataStore } from "../../stores/profileDataStore";
import { backgroundPreCache } from "../../utils/backgroundPreCache";
import { resolveUserProfile } from "../../utils/profileResolver";
import { isBackendUnavailable } from "@/utils/backendErrors";
import { usePwaScreenHistory } from "../../hooks/usePwaScreenHistory";
import { dareService } from "../../middleware/services/service-factory";
import { DARREN_CONVERSATION_ID, DARREN_USER_ID } from "@/lib/darren";
import type {
  TruthPost,
  DarePost,
} from "../../middleware/adapters/data-adapters";
import type { DareEntity } from "../../backend/domain/entities/Dare";
import type { AlertEntity } from "../../backend/domain/entities/Alert";
import { setActiveEventId } from "@/lib/circleContext";
import { CircleGate } from "../circles/CircleExperience";
import { CircleChatScreen } from "../circles/CircleChatScreen";
import { ChatInteractionScreen } from "../circles/ChatInteractionScreen";
import { CircleJailVotesScreen } from "../circles/CircleJailVotesScreen";
import { setChatSource, type ChatSource } from "@/lib/chatContext";
import { circleChatService } from "@/middleware/services/circle-chat.service";
import { getActiveCircleId } from "@/lib/circleContext";
import type { CircleChatMessage } from "@/middleware/services/circle-chat.service";
import { AuraSystemHost } from "../aura/AuraSystem";

type Screen =
  | "truth"
  | "main"
  | "dares"
  | "profile"
  | "profile-edit"
  | "create-dare"
  | "create-community-dare"
  | "create-feed"
  | "create-verdict"
  | "feed"
  | "verdicts"
  | "circle"
  | "auth"
  | "circle-chat"
  | "chat-interaction"
  | "circle-jail-votes"
  | "chat-list"
  | "chat"
  | "action-picker"
  | "create-truth"
  | "create-prediction"
  | "create-deal"
  | "create-custom"
  | "create-rumour"
  | "create-promise"
  | "create-dare-interaction"
  | "alerts"
  | "chat-invites"
  | "profile-creation"
  | "user-search"
  | "user-profile"
  | "daily"
  | "daily-reveal"
  | "dare-center"
  | "birthday-room"
  | "birthday-party-room"
  | "challenge-timeline";

type DaresNavigationRequest = {
  tab?: "received" | "sent";
  highlightDareId?: string;
  highlightTruthId?: string;
  nonce: number;
};

type AppHistorySnapshot = {
  chatConversationId: string;
  daresNavigationRequest: DaresNavigationRequest | null;
  dailyChallengeSkipWait: boolean;
  lastActiveChatUserId: string;
  lastActiveConversationId: string;
  previousScreen: Screen;
  selectedUserCommentId: string;
  selectedUserDareId: string;
  selectedUserId: string;
  selectedUserPostId: string;
  selectedUserTruthId: string;
  selectedChallengeFriendAlert: AlertEntity | null;
};

type BirthdayPartyRoomContext = {
  room: BirthdayRoom;
  drops: BirthdayDrop[];
};

type InteractionRecipient = {
  id: string;
  name: string;
  username: string;
  avatar: string;
};

type TextCardPostKind =
  | "prediction"
  | "deal"
  | "rumour"
  | "promise"
  | "custom";

type TextCardReturnRequest = {
  kind: TextCardPostKind;
  nonce: number;
};

function getScreenLayerClassName(
  isActive: boolean,
  className = "full-height-scroll",
) {
  return `app-screen-layer ${isActive ? "is-active" : ""} ${className}`;
}

// Keep hidden tabs mounted for instant return navigation, but avoid asking
// their large component trees to render when the parent changes tabs.
function memoizeInactiveScreen<P extends { isActive?: boolean }>(
  ScreenComponent: FunctionComponent<P>,
) {
  return memo<P>(ScreenComponent, (previous, next) => {
    if (previous.isActive !== next.isActive) return false;
    return previous.isActive !== true;
  });
}

const MemoMainScreen = memoizeInactiveScreen(MainScreen);
const MemoDaresReceivedScreen = memoizeInactiveScreen(DaresReceivedScreen);
const MemoProfileScreen = memoizeInactiveScreen<
  NonNullable<ComponentProps<typeof ProfileScreen>>
>(ProfileScreen);
const MemoFeedScreen = memoizeInactiveScreen(FeedScreen);
const MemoVerdictsScreen = memoizeInactiveScreen(VerdictsScreen);
const MemoFriendCircleScreen = memoizeInactiveScreen(FriendCircleScreen);
const MemoDailyChallengeScreen = memoizeInactiveScreen(DailyChallengeScreen);
const MemoChatListScreen = memoizeInactiveScreen(ChatListScreen);

async function buildDareFocusPost(dare: DareEntity): Promise<DarePost> {
  const [challengerProfile, receiverProfile] = await Promise.all([
    resolveUserProfile(dare.challengerId).catch(() => null),
    resolveUserProfile(dare.receiverId).catch(() => null),
  ]);

  const getName = (profile: any, fallback: string) =>
    profile?.displayName ||
    profile?.display_name ||
    profile?.nickname ||
    profile?.username ||
    fallback;
  const getAvatar = (profile: any) =>
    profile?.avatarUrl || profile?.avatar_url || profile?.avatar || "";

  return {
    id: dare.id,
    challengerId: dare.challengerId,
    receiverId: dare.receiverId,
    challenger: {
      nickname: getName(challengerProfile, dare.challengerId),
      avatar: getAvatar(challengerProfile),
      verified: false,
    },
    receiver: {
      nickname: getName(receiverProfile, dare.receiverId),
      avatar: getAvatar(receiverProfile),
      verified: false,
    },
    description: dare.description,
    proof: dare.proofMediaUrl
      ? {
          type: dare.proofMediaType === "VIDEO" ? "video" : "image",
          url: dare.proofMediaUrl,
          thumbnail: dare.proofThumbnailUrl || dare.proofMediaUrl,
        }
      : undefined,
    state: dare.state as DarePost["state"],
    createdAt: dare.createdAt,
  };
}

export default function AuthenticatedApp() {
  const { user, isAuthenticated, signIn, signUp, initializeAuth } =
    useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const activeCircleId = useCirclesStore((state) => state.activeId);
  const circleReady = useCirclesStore((state) => state.ready);
  const subscribeToAlerts = useAlertStore((s) => s.subscribeToAlerts);
  const [currentScreen, setCurrentScreen] = useState<Screen>("feed");
  const [chatOrigin, setChatOrigin] = useState<ChatSource | null>(null);
  const [chatInteraction, setChatInteraction] = useState<CircleChatMessage | null>(null);
  const [jailCaseId, setJailCaseId] = useState<string | undefined>();
  useEffect(() => { if (!currentScreen.startsWith("create-")) setChatSource(null); }, [currentScreen]);
  const [dailyChallengeSkipWait, setDailyChallengeSkipWait] = useState(false);
  const [dailyChallengeDraft, setDailyChallengeDraft] =
    useState<DailyChallengeDraft | null>(null);
  const [mainDareAudience, setMainDareAudience] = useState<
    "friends" | "community"
  >("friends");
  const [textCardReturnRequest, setTextCardReturnRequest] =
    useState<TextCardReturnRequest | null>(null);
  const [birthdayPartyRoomContext, setBirthdayPartyRoomContext] =
    useState<BirthdayPartyRoomContext | null>(null);
  const [birthdayRoomReturnScreen, setBirthdayRoomReturnScreen] =
    useState<Screen>("feed");

  // Mark as mounted after first client render to avoid SSR/client hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Initialize auth on mount
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // Check localStorage for guest mode on client
  useEffect(() => {
    if (typeof window !== "undefined") {
      const guestModeFromStorage =
        window.localStorage.getItem("dare_guest_mode") === "true";
      setIsGuestMode(guestModeFromStorage);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (isGuestMode) {
      window.localStorage.setItem("dare_guest_mode", "true");
    } else {
      window.localStorage.removeItem("dare_guest_mode");
    }
  }, [isGuestMode]);

  // Handle login/signup from AuthScreen
  const handleAuth = async (
    action:
      | { type: "signin"; email: string; password: string }
      | {
          type: "signup";
          email: string;
          password: string;
          username: string;
          displayName: string;
        },
  ) => {
    setIsGuestMode(false);

    if (action.type === "signin") {
      const response = await signIn(action.email, action.password);
      if (!response.success) {
        throw new Error(response.error || "Unable to sign in.");
      }
    } else {
      const response = await signUp({
        email: action.email,
        password: action.password,
        username: action.username,
        displayName: action.displayName,
      });
      if (!response.success) {
        throw new Error(response.error || "Unable to create your account.");
      }
      return {
        requiresEmailConfirmation: response.requiresEmailConfirmation,
      };
    }
  };

  const [chatConversationId, setChatConversationId] = useState<string>("");
  const [lastActiveConversationId, setLastActiveConversationId] =
    useState<string>("");
  const [lastActiveChatUserId, setLastActiveChatUserId] = useState<string>("");
  const chatConversationIdRef = useRef<string>("");
  const lastActiveConversationIdRef = useRef<string>("");
  const lastActiveChatUserIdRef = useRef<string>("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedUserPostId, setSelectedUserPostId] = useState<string>("");
  const [selectedUserCommentId, setSelectedUserCommentId] =
    useState<string>("");
  const [selectedUserTruthId, setSelectedUserTruthId] = useState<string>("");
  const [selectedUserDareId, setSelectedUserDareId] = useState<string>("");
  const [previousScreen, setPreviousScreen] = useState<Screen>("feed");
  const [mainFocusRequest, setMainFocusRequest] = useState<{
    view: "truth" | "dares";
    post: TruthPost | DarePost;
    nonce: number;
  } | null>(null);
  const [mainScreenResetKey, setMainScreenResetKey] = useState(0);
  const [communityHubRequestKey, setCommunityHubRequestKey] = useState(0);
  const [interactionRecipient, setInteractionRecipient] =
    useState<InteractionRecipient | null>(null);
  const [daresScreenResetKey, setDaresScreenResetKey] = useState(0);
  const [pendingVerdictId, setPendingVerdictId] = useState<string | null>(null);
  const [daresNavigationRequest, setDaresNavigationRequest] =
    useState<DaresNavigationRequest | null>(null);
  const [isStoryViewerOpen, setIsStoryViewerOpen] = useState(false);
  const [isStoryComposerOpen, setIsStoryComposerOpen] = useState(false);
  const [isFeedCommentsOpen, setIsFeedCommentsOpen] = useState(false);
  const [isFeedPostOptionsOpen, setIsFeedPostOptionsOpen] = useState(false);
  const isImmersiveOverlayActive = useImmersiveOverlayStore((s) => s.active);
  const [selectedChallengeFriendAlert, setSelectedChallengeFriendAlert] =
    useState<AlertEntity | null>(null);
  const goBackInApp = usePwaScreenHistory<Screen, AppHistorySnapshot>(
    currentScreen,
    setCurrentScreen,
    {
      enabled: mounted && isAuthenticated && !!user,
      snapshot: {
        chatConversationId,
        daresNavigationRequest,
        dailyChallengeSkipWait,
        lastActiveChatUserId,
        lastActiveConversationId,
        previousScreen,
        selectedUserCommentId,
        selectedUserDareId,
        selectedUserId,
        selectedUserPostId,
        selectedUserTruthId,
        selectedChallengeFriendAlert,
      },
      restoreSnapshot: (snapshot) => {
        setChatConversationId(snapshot.chatConversationId);
        setDaresNavigationRequest(snapshot.daresNavigationRequest);
        setDailyChallengeSkipWait(snapshot.dailyChallengeSkipWait);
        setLastActiveChatUserId(snapshot.lastActiveChatUserId);
        setLastActiveConversationId(snapshot.lastActiveConversationId);
        setPreviousScreen(snapshot.previousScreen);
        setSelectedUserCommentId(snapshot.selectedUserCommentId);
        setSelectedUserDareId(snapshot.selectedUserDareId);
        setSelectedUserId(snapshot.selectedUserId);
        setSelectedUserPostId(snapshot.selectedUserPostId);
        setSelectedUserTruthId(snapshot.selectedUserTruthId);
        setSelectedChallengeFriendAlert(
          snapshot.selectedChallengeFriendAlert,
        );
      },
    },
  );

  useEffect(() => {
    if (!user?.id || !isAuthenticated) return;

    backgroundPreCache.preCache(user.id).catch(() => {
      // Non-fatal - pre-cache failures should not break the app
    });
  }, [user?.id, isAuthenticated]);

  useEffect(() => {
    chatConversationIdRef.current = chatConversationId;
  }, [chatConversationId]);

  useEffect(() => {
    lastActiveConversationIdRef.current = lastActiveConversationId;
  }, [lastActiveConversationId]);

  useEffect(() => {
    lastActiveChatUserIdRef.current = lastActiveChatUserId;
  }, [lastActiveChatUserId]);

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      startAvatarSync();

      const { setCurrentUserProfile } = useProfileDataStore.getState();
      setCurrentUserProfile(
        user.id,
        user.displayName || "",
        user.username || "",
        user.avatar || "",
      );
      const unsubAvatarUser = avatarSyncService.subscribeToUserAvatar(user.id);
      const unsubProfileUser = profileSyncService.subscribeToUserProfile(
        user.id,
      );

      return () => {
        unsubAvatarUser();
        unsubProfileUser();
      };
    }
  }, [
    isAuthenticated,
    user?.id,
    user?.displayName,
    user?.username,
    user?.avatar,
  ]);

  useEffect(() => {
    // Direct inbox rows are Circle-scoped. Starting before Circle bootstrap
    // completes produces an unauthorised empty snapshot that never refreshes.
    if (!isAuthenticated || !user?.id || !circleReady || !activeCircleId) return;

    const messagingStore = useMessagingStore.getState();
    const targetUserId = user.id;
    let cancelled = false;
    let started = false;

    const start = () => {
      if (cancelled || started) return;
      started = true;
      console.log(
        "🔍 [AuthenticatedApp DEBUG] Starting Realtime subscriptions for user:",
        targetUserId,
      );
      messagingStore.subscribeToRealTimeConversations(targetUserId);
      messagingStore.setOnlineStatus(true);
    };

    const authSubscription = getSupabaseBrowserClient().auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user?.id === targetUserId) start();
      },
    );

    // Wait until Supabase Auth has actually restored the session for THIS
    // user before subscribing to Supabase presence/typing. On a page
    // reload the auth store hydrates synchronously from localStorage but
    // Supabase Auth's currentUser is still null for a brief moment — if we
    // attach private Realtime channels during that window; policies deny the
    // read and the listeners are stuck reporting "offline" forever, which
    // is why the chat list and messaging header never showed active /
    // typing status.
    void getSupabaseBrowserClient().auth.getUser().then(({ data }) => {
      if (!cancelled && data.user?.id === targetUserId) start();
    });

    const onVisibility = () => {
      // A backgrounded mobile tab is still connected and reachable. Treating
      // `hidden` as offline makes peers flicker offline whenever the user
      // switches apps or the browser changes the focused window. Supabase
      // Presence removes the device automatically when its socket disconnects.
      if (started && document.visibilityState === "visible") {
        messagingStore.setOnlineStatus(true);
      }
    };
    const onFocus = () => {
      if (started) messagingStore.setOnlineStatus(true);
    };
    const onBeforeUnload = () => {
      if (started) messagingStore.setOnlineStatus(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      cancelled = true;
      if (started) {
        messagingStore.unsubscribeFromRealTimeConversations();
        messagingStore.setOnlineStatus(false);
      }
      authSubscription.data.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [activeCircleId, circleReady, isAuthenticated, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    return subscribeToAlerts(user.id);
  }, [isAuthenticated, subscribeToAlerts, user?.id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (
        user &&
        isAuthenticated &&
        (user.hasCompletedProfileCreation === false ||
          user.hasCompletedProfileCreation === undefined) &&
        currentScreen !== "profile-creation"
      ) {
        setCurrentScreen("profile-creation");
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [user, isAuthenticated, currentScreen, user?.hasCompletedProfileCreation]);

  const handleProfileCreationComplete = () => {
    setCurrentScreen("feed");
  };

  const openCategoryInteraction = async (kind: string, id: string, chatMessageId?: string) => {
    if (kind === "jail") { setChatOrigin(null); setJailCaseId(id); setCurrentScreen("circle-jail-votes"); return; }
    if (!["prediction", "deal", "promise"].includes(kind)) return;
    let message: CircleChatMessage | null = null;
    if (chatMessageId) { try { message = await circleChatService.source(chatMessageId); } catch {} }
    setChatInteraction(message || { id, seq: 0, circle_id: getActiveCircleId() || "", author_id: "", author_name: "", body: "", created_at: new Date().toISOString(), source_message_id: null, interaction_kind: kind as CircleChatMessage["interaction_kind"], interaction_id: id, status: null });
    setCurrentScreen("chat-interaction");
  };

  const handleBackToMain = () => {
    if (chatOrigin && currentScreen.startsWith("create-")) { setChatSource(null); setCurrentScreen("circle-chat"); return; }
    goBackInApp("feed");
  };

  const openBirthdayRoom = (returnScreen: Screen = "feed") => {
    setBirthdayRoomReturnScreen(returnScreen);
    setBirthdayPartyRoomContext(null);
    setCurrentScreen("birthday-room");
  };

  const closeBirthdayFlow = () => {
    setBirthdayPartyRoomContext(null);
    setCurrentScreen(birthdayRoomReturnScreen);
  };

  const updateCurrentChatPresence = (
    nextUserId: string,
    nextUsername: string,
  ) => {
    if (!user?.id || !nextUserId) return;
    messagingService.setCurrentChatPresence(
      user.id,
      nextUserId,
      nextUsername || "someone",
    );
  };

  const emitChatSwitchForPreviousConversation = (
    nextConversationId: string,
    nextUserId: string,
    nextUsername: string,
  ) => {
    const fromConversationId =
      lastActiveConversationIdRef.current || chatConversationIdRef.current;
    const logChatSwitch = (label: string, details: Record<string, unknown>) => {
      console.info(`[DARE_LIVE_DEBUG][app] ${label}`, {
        at: new Date().toISOString(),
        currentUserId: user?.id ?? null,
        ...details,
      });
    };

    if (
      !fromConversationId ||
      !nextConversationId ||
      fromConversationId === nextConversationId
    ) {
      logChatSwitch("chat_switch_emit_skipped_conversation", {
        fromConversationId,
        nextConversationId,
      });
      return;
    }

    const state = useMessagingStore.getState();
    const previousConversation =
      state.currentConversation?.id === fromConversationId
        ? state.currentConversation
        : state.conversations.find((c: any) => c.id === fromConversationId);
    const previousChatUserId =
      lastActiveChatUserIdRef.current ||
      previousConversation?.other_user?.user_id ||
      previousConversation?.other_user?.id ||
      "";

    if (!user?.id || !previousChatUserId || previousChatUserId === nextUserId) {
      logChatSwitch("chat_switch_emit_skipped_recipient", {
        fromConversationId,
        nextConversationId,
        previousChatUserId,
        nextUserId,
        hasUser: !!user?.id,
      });
      return;
    }

    void (async () => {
      try {
        const nextConversation = state.conversations.find(
          (c: any) => c.id === nextConversationId,
        );
        const targetUserName =
          nextUsername ||
          nextConversation?.other_user?.display_name ||
          nextConversation?.other_user?.username ||
          "someone";
        logChatSwitch("chat_switch_emit_started", {
          fromConversationId,
          nextConversationId,
          previousChatUserId,
          nextUserId,
          targetUserName,
        });

        logChatSwitch("chat_switch_emit_finished", {
          fromConversationId,
          nextConversationId,
          previousChatUserId,
          nextUserId,
        });
      } catch (error) {
        if (isBackendUnavailable(error)) {
          return;
        }
        console.error("Error emitting chat switch:", error);
      }
    })();
  };

  const handleChatSelect = async (
    userId: string,
    username: string,
    conversationId?: string,
  ) => {
    const nextConversationId = conversationId || "";
    if (userId === DARREN_USER_ID || nextConversationId === DARREN_CONVERSATION_ID) {
      setChatConversationId(DARREN_CONVERSATION_ID);
      setCurrentScreen("chat");
      return;
    }
    emitChatSwitchForPreviousConversation(nextConversationId, userId, username);
    updateCurrentChatPresence(userId, username);
    setChatConversationId(nextConversationId);
    setCurrentScreen("chat");
  };

  const handleUserSelect = (userId: string) => {
    if (userId === user?.id) {
      setSelectedUserId("");
      setSelectedUserPostId("");
      setSelectedUserCommentId("");
      setSelectedUserTruthId("");
      setSelectedUserDareId("");
      setPreviousScreen(currentScreen);
      setCurrentScreen("profile");
      return;
    }

    setSelectedUserId(userId);
    setSelectedUserPostId("");
    setSelectedUserCommentId("");
    setSelectedUserTruthId("");
    setSelectedUserDareId("");
    setPreviousScreen(currentScreen);
    setCurrentScreen("user-profile");
  };

  const handleOpenSharedPost = (userId: string, postId: string) => {
    setSelectedUserId(userId);
    setSelectedUserPostId(postId);
    setSelectedUserCommentId("");
    setSelectedUserTruthId("");
    setSelectedUserDareId("");
    setPreviousScreen(currentScreen);
    setCurrentScreen("user-profile");
  };

  const handleMessageUser = async (
    targetUserId: string,
    targetUsername: string,
  ) => {
    if (!user?.id) return;
    try {
      const convId = await useMessagingStore
        .getState()
        .getOrCreateConversation(user.id, targetUserId);

      emitChatSwitchForPreviousConversation(
        convId,
        targetUserId,
        targetUsername,
      );
      updateCurrentChatPresence(targetUserId, targetUsername);
      setChatConversationId(convId);
      setCurrentScreen("chat");
    } catch (error) {
      console.error("Error starting conversation:", error);
    }
  };

  const handleNavigateToSearch = () => {
    setCurrentScreen("user-search");
  };

  const handleOpenTruthPost = (truth: TruthPost) => {
    setMainFocusRequest({
      view: "truth",
      post: truth,
      nonce: Date.now(),
    });
    setCurrentScreen("truth");
  };

  const handleOpenDarePost = (dare: DarePost) => {
    setMainFocusRequest({
      view: "dares",
      post: dare,
      nonce: Date.now(),
    });
    setCurrentScreen("main");
  };

  const handleOpenFriendCompletedDareAlert = async (alert: AlertEntity) => {
    try {
      const response = await dareService.getDareById(alert.entityId);
      if (!response.success || !response.dare) {
        throw new Error(response.error || "Dare not found");
      }

      const darePost = await buildDareFocusPost(response.dare);
      setMainFocusRequest({
        view: "dares",
        post: darePost,
        nonce: Date.now(),
      });
      setCurrentScreen("main");
    } catch (error) {
      console.error("Error opening completed friend dare alert:", error);
      setSelectedChallengeFriendAlert(alert);
      setCurrentScreen("challenge-timeline");
    }
  };

  const handleCreateClick = () => {
    setCurrentScreen("action-picker");
  };

  const handleTextCardCreated = (kind: TextCardPostKind) => {
    setMainFocusRequest(null);
    setTextCardReturnRequest({ kind, nonce: Date.now() });
    setMainScreenResetKey((key) => key + 1);
    setCurrentScreen("truth");
  };

  const handleActionSelect = (action: "truth" | "prediction" | "deal" | "custom" | "rumour" | "promise" | "dare" | "community-dare" | "feed" | "verdict") => {
    setChatSource(null);
    setChatOrigin(null);
    setInteractionRecipient(null);
    switch (action) {
      case "truth":
        setCurrentScreen("create-truth");
        break;
      case "prediction":
        setCurrentScreen("create-prediction");
        break;
      case "deal":
        setCurrentScreen("create-deal");
        break;
      case "custom":
        setCurrentScreen("create-custom");
        break;
      case "rumour":
        setCurrentScreen("create-rumour");
        break;
      case "promise":
        setCurrentScreen("create-promise");
        break;
      case "dare":
        setCurrentScreen("create-dare-interaction");
        break;
      case "community-dare":
        setCurrentScreen("create-community-dare");
        break;
      case "feed":
        setCurrentScreen("create-feed");
        break;
      case "verdict":
        setCurrentScreen("create-verdict");
        break;
    }
  };

  const handleTabScreenChange = (screen: "truth" | "main" | "dares" | "profile" | "feed" | "verdicts") => {
    setChatOrigin(null);
    setActiveEventId(null);
    // Commit the destination first so the new tab can paint before any
    // scroll/reset bookkeeping runs on the large mounted screen trees.
    setCurrentScreen(screen);

    if (screen === "truth" || screen === "main") {
      window.requestAnimationFrame(() => {
        setMainFocusRequest(null);
        if (screen === "main") {
          setMainDareAudience("friends");
        }
        setMainScreenResetKey((key) => key + 1);
      });
    }

    if (screen === "dares") {
      window.requestAnimationFrame(() => {
        setDaresNavigationRequest(null);
        setDaresScreenResetKey((key) => key + 1);
      });
    }
  };

  const TAB_SCREENS = [
    "feed",
    "dares",
    "profile",
    "truth",
    "main",
    "verdicts",
    "circle",
    "chat-list",
    "daily",
  ];
  const effectiveScreen =
    isAuthenticated &&
    (user?.hasCompletedProfileCreation === false ||
      user?.hasCompletedProfileCreation === undefined) &&
    currentScreen !== "profile-edit"
      ? "profile-creation"
      : currentScreen;
  const isTabScreen = TAB_SCREENS.includes(effectiveScreen);
  useEffect(() => { if (effectiveScreen !== "circle" && !effectiveScreen.startsWith("create-")) setActiveEventId(null); }, [effectiveScreen]);

  const renderOverlayScreen = () => {
    switch (effectiveScreen) {
      case "circle-chat":
        return <div className="app-overlay-screen chat-viewport-overlay h-full overflow-hidden"><CircleChatScreen
          onBack={() => setCurrentScreen("chat-list")}
          onCreate={(kind, source) => {
            setChatOrigin(source);
            setChatSource(source);
            setActiveEventId(null);
            setInteractionRecipient(source.author_id !== user?.id ? { id: source.author_id, name: source.author_name, username: "", avatar: "" } : null);
            if (kind === "jail") { setJailCaseId(undefined); setCurrentScreen("circle-jail-votes"); }
            else setCurrentScreen(kind === "dare" ? "create-dare-interaction" : (`create-${kind}` as Screen));
          }}
          onOpen={message => {
            setChatInteraction(message);
            if (message.interaction_kind === "jail") { setChatOrigin(null); setJailCaseId(message.interaction_id!); setCurrentScreen("circle-jail-votes"); }
            else setCurrentScreen("chat-interaction");
          }} /></div>;
      case "chat-interaction":
        return chatInteraction ? <div className="app-overlay-screen h-full overflow-hidden"><ChatInteractionScreen message={chatInteraction} onBack={() => setCurrentScreen("circle-chat")} onOpenChallenge={async (message, source) => {
          setChatOrigin(source);
          const { data, error } = await getSupabaseBrowserClient().from(message.interaction_kind === "dare" ? "dares" : "truths").select("creator_id,receiver_id").eq("id", message.interaction_id!).single();
          if (error || !data) throw new Error("This interaction is no longer available.");
          if (data.creator_id !== user?.id && data.receiver_id !== user?.id) {
            setSelectedUserId(data.creator_id); setSelectedUserPostId(""); setSelectedUserCommentId("");
            setSelectedUserDareId(message.interaction_kind === "dare" ? message.interaction_id! : "");
            setSelectedUserTruthId(message.interaction_kind === "truth" ? message.interaction_id! : "");
            setPreviousScreen("chat-interaction"); setCurrentScreen("user-profile"); return;
          }
          setDaresNavigationRequest({ tab: message.author_id === user?.id ? "sent" : "received", ...(message.interaction_kind === "dare" ? { highlightDareId: message.interaction_id! } : { highlightTruthId: message.interaction_id! }), nonce: Date.now() });
          setCurrentScreen("dares");
        }} /></div> : null;
      case "circle-jail-votes":
        return <div className="app-overlay-screen h-full overflow-hidden"><CircleJailVotesScreen onBack={() => { setChatOrigin(null); setCurrentScreen("circle-chat"); }} source={jailCaseId ? null : chatOrigin} initialId={jailCaseId} /></div>;
      case "profile-edit":
        return (
          <div className="app-overlay-screen full-height-scroll">
            <ProfileEditScreen onBack={handleBackToMain} />
          </div>
        );
      case "create-dare":
        return (
          <div className="app-overlay-screen interaction-flow-screen full-height-scroll">
            <CreateDareScreen onBack={handleBackToMain} />
          </div>
        );
      case "create-feed":
        return (
          <div className="app-overlay-screen interaction-flow-screen full-height-scroll">
            <CreateFeedPostScreen onBack={() => { setActiveEventId(null); setCurrentScreen("feed"); }} />
          </div>
        );
      case "create-verdict":
        return (
          <div className="app-overlay-screen interaction-flow-screen h-full overflow-hidden">
            <CreateVerdictScreen
              onBack={handleBackToMain}
              onCreated={() => setCurrentScreen("verdicts")}
            />
          </div>
        );
      case "create-community-dare":
        return (
          <div className="app-overlay-screen interaction-flow-screen h-full overflow-hidden">
            <CreateCommunityDareScreen
              onBack={() => goBackInApp("action-picker")}
              onCreated={() => {
                setMainFocusRequest(null);
                setMainDareAudience("community");
                setMainScreenResetKey((key) => key + 1);
                setCurrentScreen("main");
              }}
            />
          </div>
        );
      case "chat":
        if (chatConversationId === DARREN_CONVERSATION_ID) {
          return (
            <div className="app-overlay-screen full-height-scroll">
              <DarrenChatScreen onBack={() => goBackInApp("chat-list")} />
            </div>
          );
        }
        return (
          <div className="app-overlay-screen chat-viewport-overlay">
            <MessagingScreen
              onBack={() => goBackInApp("chat-list")}
              conversationId={chatConversationId || undefined}
              onConversationActiveChange={(id, otherUserId) => {
                lastActiveConversationIdRef.current = id;
                setLastActiveConversationId(id);
                lastActiveChatUserIdRef.current = otherUserId || "";
                setLastActiveChatUserId(otherUserId || "");
              }}
              onOpenSharedPost={handleOpenSharedPost}
              onOpenUserProfile={handleUserSelect}
            />
          </div>
        );
      case "action-picker":
        return (
          <div className="app-overlay-screen full-height-scroll">
            <ActionPickerScreen
              onClose={handleBackToMain}
              onSelectAction={handleActionSelect}
            />
          </div>
        );
      case "create-truth":
        return (
          <div className="app-overlay-screen interaction-flow-screen full-height-scroll">
            <CreateInteractionScreen
              mode="truth"
              onBack={handleBackToMain}
              initialRecipient={interactionRecipient}
            />
          </div>
        );
      case "create-prediction":
        return (
          <div className="app-overlay-screen interaction-flow-screen full-height-scroll">
            <CreatePredictionScreen
              onBack={handleBackToMain}
              onCreated={() => handleTextCardCreated("prediction")}
            />
          </div>
        );
      case "create-deal":
        return (
          <div className="app-overlay-screen interaction-flow-screen full-height-scroll">
            <CreateDealScreen
              onBack={handleBackToMain}
              onCreated={() => handleTextCardCreated("deal")}
            />
          </div>
        );
      case "create-custom":
        return (
          <div className="app-overlay-screen interaction-flow-screen full-height-scroll">
            <CreateCustomScreen
              onBack={handleBackToMain}
              onCreated={() => handleTextCardCreated("custom")}
            />
          </div>
        );
      case "create-rumour":
        return (
          <div className="app-overlay-screen interaction-flow-screen full-height-scroll">
            <CreateRumourScreen
              onBack={handleBackToMain}
              onCreated={() => handleTextCardCreated("rumour")}
            />
          </div>
        );
      case "create-promise":
        return (
          <div className="app-overlay-screen interaction-flow-screen full-height-scroll">
            <CreatePromiseScreen
              onBack={handleBackToMain}
              onCreated={() => handleTextCardCreated("promise")}
            />
          </div>
        );
      case "create-dare-interaction":
        return (
          <div className="app-overlay-screen interaction-flow-screen full-height-scroll">
            <CreateInteractionScreen
              mode="dare"
              onBack={handleBackToMain}
              initialRecipient={interactionRecipient}
            />
          </div>
        );
      case "alerts":
        return (
          <div className="app-overlay-screen full-height-scroll">
            <AlertsScreen
              onOpenInteraction={(kind, id, messageId) => void openCategoryInteraction(kind, id, messageId)}
              onBack={handleBackToMain}
              onNavigateToDares={(request) => {
                setDaresNavigationRequest({
                  ...request,
                  nonce: Date.now(),
                });
                setCurrentScreen("dares");
              }}
              onNavigateToFeed={() => setCurrentScreen("feed")}
              onNavigateToChallengeTimeline={(alert) => {
                setSelectedChallengeFriendAlert(alert);
                setCurrentScreen("challenge-timeline");
              }}
              onNavigateToFriendCompletedDare={
                handleOpenFriendCompletedDareAlert
              }
            />
          </div>
        );
      case "challenge-timeline":
        return (
          <div className="app-overlay-screen full-height-scroll">
            <ChallengeFriendTimelineScreen
              alert={selectedChallengeFriendAlert}
              onBack={() => goBackInApp("alerts")}
            />
          </div>
        );
      case "chat-invites":
        return (
          <div className="app-overlay-screen full-height-scroll">
            <FriendsInviteAlertsScreen
              onBack={() => goBackInApp("chat-list")}
              onOpenConversation={(conversationId) => {
                setChatConversationId(conversationId);
                setCurrentScreen("chat");
              }}
            />
          </div>
        );
      case "profile-creation":
        return (
          <div className="app-overlay-screen full-height-scroll">
            <ProfileCreationScreen
              onComplete={handleProfileCreationComplete}
              onBack={handleBackToMain}
            />
          </div>
        );
      case "user-search":
        return (
          <div className="app-overlay-screen full-height-scroll">
            <UserSearchScreen
              onBack={handleBackToMain}
              onUserSelect={handleUserSelect}
            />
          </div>
        );
      case "user-profile":
        return (
          <div className="app-overlay-screen full-height-scroll">
            <UserProfileScreen
              onBack={() => goBackInApp(previousScreen)}
              userId={selectedUserId}
              onMessage={handleMessageUser}
              onNavigateToProfile={handleUserSelect}
              onNavigateToTruthPost={handleOpenTruthPost}
              onNavigateToDarePost={handleOpenDarePost}
              initialPostId={selectedUserPostId || undefined}
              initialCommentId={selectedUserCommentId || undefined}
              initialTruthId={selectedUserTruthId || undefined}
              initialDareId={selectedUserDareId || undefined}
            />
          </div>
        );
      case "daily-reveal":
        return (
          <div className="app-overlay-screen h-full overflow-hidden">
            <DailyChallengeRevealScreen
              isActive={effectiveScreen === "daily-reveal"}
              initialChallenge={dailyChallengeDraft}
              onBack={() => goBackInApp("daily")}
              onOpenConversation={handleChatSelect}
            />
          </div>
        );
      case "dare-center":
        return (
          <div className="app-overlay-screen h-full overflow-hidden">
            <DareCenterScreen
              onBack={() => goBackInApp("feed")}
              onOpenCreate={() => setCurrentScreen("action-picker")}
              onOpenDares={() => setCurrentScreen("dares")}
              onOpenDaily={() => setCurrentScreen("daily")}
              onOpenFeed={() => setCurrentScreen("feed")}
              onOpenMain={() => setCurrentScreen("main")}
              onOpenAlerts={() => setCurrentScreen("alerts")}
              onOpenChat={() => setCurrentScreen("chat-list")}
              onOpenBirthdayRoom={() => openBirthdayRoom("dare-center")}
            />
          </div>
        );
      case "birthday-room":
        return (
          <div className="app-overlay-screen h-full overflow-hidden">
            <BirthdayRoomScreen
              onBack={closeBirthdayFlow}
              onOpenPartyRoom={(room, drops) => {
                setBirthdayPartyRoomContext({ room, drops });
                setCurrentScreen("birthday-party-room");
              }}
            />
          </div>
        );
      case "birthday-party-room":
        return (
          <div className="app-overlay-screen h-full overflow-hidden">
            <BirthdayPartyRoomScreen
              initialRoom={birthdayPartyRoomContext?.room ?? null}
              initialDrops={birthdayPartyRoomContext?.drops ?? []}
              onBack={closeBirthdayFlow}
            />
          </div>
        );
      default:
        return null;
    }
  };

  const showBottomNav =
    isTabScreen &&
    effectiveScreen !== "dares" &&
    !isStoryViewerOpen &&
    !isStoryComposerOpen &&
    !isFeedCommentsOpen &&
    !isFeedPostOptionsOpen &&
    !isImmersiveOverlayActive;

  // Render a neutral shell during SSR and first client paint to avoid hydration mismatch.
  // Auth state from the persisted Zustand store is only safe to consume after mount.
  if (!mounted) {
    return <div className="app-fixed-viewport bg-[#0a0f0a]" />;
  }

  if (isGuestMode && !isAuthenticated) {
    return <GuestApp onExitGuestMode={() => setIsGuestMode(false)} />;
  }

  // Show AuthScreen when not authenticated (after all hooks have been called)
  if (!isAuthenticated || !user) {
    return (
      <AuthScreen
        onLogin={handleAuth}
        onContinueAsGuest={() => setIsGuestMode(true)}
      />
    );
  }

  if (effectiveScreen === "profile-creation") return renderOverlayScreen();

  return (
    <CircleGate userId={user.id} onEnter={() => setCurrentScreen("feed")}><LaunchGate>
      <AppearanceThemeRuntime />
      <AuraSystemHost />
      <div className="app-fixed-viewport relative overflow-hidden bg-[#0a0f0a]">
        <div className={getScreenLayerClassName(effectiveScreen === "truth")}>
          <MemoMainScreen
            isActive={effectiveScreen === "truth"}
            onDaresClick={() => setCurrentScreen("dares")}
            onNavigateToChat={() => setCurrentScreen("chat-list")}
            onNavigateToProfile={handleUserSelect}
            focusRequest={mainFocusRequest}
            activeView="truth"
            showViewToggle={false}
            resetKey={mainScreenResetKey}
            textCardReturnRequest={textCardReturnRequest}
          />
        </div>
        <div className={getScreenLayerClassName(effectiveScreen === "main")}>
          <MemoMainScreen
            isActive={effectiveScreen === "main"}
            onDaresClick={() => setCurrentScreen("dares")}
            onNavigateToChat={() => setCurrentScreen("chat-list")}
            onNavigateToProfile={handleUserSelect}
            focusRequest={mainFocusRequest}
            activeView="dares"
            initialDareAudience={mainDareAudience}
            showViewToggle={false}
            resetKey={mainScreenResetKey}
            openCommunityHubRequestKey={communityHubRequestKey}
          />
        </div>
        <div className={getScreenLayerClassName(effectiveScreen === "dares")}>
          <MemoDaresReceivedScreen
            chatSource={chatOrigin}
            onOpenInteraction={(kind, id) => void openCategoryInteraction(kind, id)}
            isActive={effectiveScreen === "dares"}
            navigationRequest={daresNavigationRequest}
            resetKey={daresScreenResetKey}
          />
        </div>
        <div className={getScreenLayerClassName(effectiveScreen === "profile")}>
          <MemoProfileScreen
            isActive={effectiveScreen === "profile"}
            onNavigateToProfile={handleUserSelect}
            onNavigateToSearch={handleNavigateToSearch}
            onNavigateToTruthPost={handleOpenTruthPost}
            onNavigateToDarePost={handleOpenDarePost}
          />
        </div>
        <div className={getScreenLayerClassName(effectiveScreen === "feed")}>
          <MemoFeedScreen
            isActive={effectiveScreen === "feed"}
            onBack={handleBackToMain}
            onCreatePost={() => setCurrentScreen("create-feed")}
            onNavigateToChat={() => setCurrentScreen("chat-list")}
            onNavigateToAlerts={() => setCurrentScreen("alerts")}
            onNavigateToSearch={handleNavigateToSearch}
            onNavigateToDares={() => handleTabScreenChange("dares")}
            onNavigateToSocialDares={(dare?: DarePost) => {
              setMainFocusRequest(
                dare
                  ? {
                      view: "dares",
                      post: dare,
                      nonce: Date.now(),
                    }
                  : null,
              );
              setMainDareAudience("friends");
              setMainScreenResetKey((key) => key + 1);
              setCurrentScreen("main");
            }}
            onNavigateToTruths={(truth?: TruthPost) => {
              if (!truth) {
                handleTabScreenChange("truth");
                return;
              }

              setMainFocusRequest({
                view: "truth",
                post: truth,
                nonce: Date.now(),
              });
              setMainScreenResetKey((key) => key + 1);
              setCurrentScreen("truth");
            }}
            onNavigateToCommunityDares={() => {
              setMainFocusRequest(null);
              setMainDareAudience("community");
              setMainScreenResetKey((key) => key + 1);
              setCurrentScreen("main");
            }}
            onNavigateToDareCenter={() => setCurrentScreen("dare-center")}
            onNavigateToBirthdayRoom={() => openBirthdayRoom("feed")}
            onNavigateToProfile={handleUserSelect}
            onNavigateToVerdict={(verdictId) => {
              setPendingVerdictId(verdictId);
              setCurrentScreen("verdicts");
            }}
            onDareUser={(targetUser) => {
              setInteractionRecipient(targetUser);
              setCurrentScreen("create-dare-interaction");
            }}
            onAskTruthUser={(targetUser) => {
              setInteractionRecipient(targetUser);
              setCurrentScreen("create-truth");
            }}
            onCreatePrediction={() => setCurrentScreen("create-prediction")}
            onCreateRumour={() => setCurrentScreen("create-rumour")}
            onSendToDarren={() => {
              setChatConversationId(DARREN_CONVERSATION_ID);
              setCurrentScreen("chat");
            }}
            onStoryComposerOpenChange={setIsStoryComposerOpen}
            onStoryViewerOpenChange={setIsStoryViewerOpen}
            onCommentsModalOpenChange={setIsFeedCommentsOpen}
            onPostOptionsOpenChange={setIsFeedPostOptionsOpen}
          />
        </div>
        <div className={getScreenLayerClassName(effectiveScreen === "verdicts")}>
          <MemoVerdictsScreen
            isActive={effectiveScreen === "verdicts"}
            initialVerdictId={pendingVerdictId}
          />
        </div>
        <div className={getScreenLayerClassName(effectiveScreen === "circle")}>
          <MemoFriendCircleScreen
            isActive={effectiveScreen === "circle"}
            onNavigateToOwnProfile={() => handleTabScreenChange("profile")}
          />
        </div>
        <div
          className={getScreenLayerClassName(
            effectiveScreen === "daily",
            "h-full overflow-hidden",
          )}
        >
          <MemoDailyChallengeScreen
            isActive={effectiveScreen === "daily"}
            skipWaitEnabled={dailyChallengeSkipWait}
            onBack={() => goBackInApp("feed")}
            onSkipWait={() => setDailyChallengeSkipWait(true)}
            onStartMatch={(challenge) => {
              setDailyChallengeDraft(challenge);
              setCurrentScreen("daily-reveal");
            }}
          />
        </div>
        <div
          className={getScreenLayerClassName(effectiveScreen === "chat-list")}
        >
          <MemoChatListScreen
            isActive={effectiveScreen === "chat-list"}
            onBack={handleBackToMain}
            onChatSelect={handleChatSelect}
            onCircleChatClick={() => { setChatOrigin(null); setCurrentScreen("circle-chat"); }}
            onInviteAlertsClick={() => setCurrentScreen("chat-invites")}
            onDailyChallengeClick={() => setCurrentScreen("daily")}
            onNavigateToCommunityDares={() => {
              setMainFocusRequest(null);
              setMainDareAudience("friends");
              setCommunityHubRequestKey((key) => key + 1);
              setCurrentScreen("main");
            }}
          />
        </div>

        {!isTabScreen && renderOverlayScreen()}

        {showBottomNav && (
          <BottomNavigation
            currentScreen={
              effectiveScreen as
                | "truth"
                | "main"
                | "dares"
                | "profile"
                | "feed"
                | "verdicts"
                | "circle"
            }
            onScreenChange={handleTabScreenChange}
            onCreateClick={handleCreateClick}
            onVerdictsClick={() => setCurrentScreen("verdicts")}
            onCircleClick={() => setCurrentScreen("circle")}
          />
        )}
      </div>
    </LaunchGate></CircleGate>
  );
}
