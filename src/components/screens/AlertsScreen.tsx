"use client";
import { useCirclesStore } from "@/stores/useCirclesStore";

import { useState, useEffect, useRef } from "react";
import {
  Heart,
  Eye,
  MessageCircle,
  Camera,
  CheckCircle,
  XCircle,
  Target,
  AlertTriangle,
  MessageSquare,
  Star,
  ArrowLeft,
  BellRing,
  Sparkles,
  Users,
} from "lucide-react";
import { Avatar } from "../ui/Avatar";
import { useAlertStore } from "../../stores/useAlertStore";
import { AlertEntity } from "@/backend/domain/entities/Alert";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { useProfileDataStore } from "../../stores/profileDataStore";
import { useAvatarStore } from "../../stores/avatarStore";
import { resolveUserProfile } from "../../utils/profileResolver";

// Helper function to fetch user profile if not cached — also stores avatar
// Uses getProfileByUserIdForContent to bypass privacy checks (avatars should
// always be visible in alerts regardless of profile visibility settings)
const isGoodValue = (v?: string) =>
  !!v && v !== "Unknown User" && v !== "unknown" && v !== "dare";

const inFlightProfileFetches = new Map<string, Promise<void>>();
const failedProfileFetches = new Map<string, number>();
const PROFILE_FETCH_RETRY_TTL = 30 * 60 * 1000;

const fetchUserProfileIfNeeded = async (
  userId: string,
  metadata?: {
    actorName?: string;
    actorUsername?: string;
    actorAvatar?: string;
  },
) => {
  if (!userId) return;

  const cachedProfile = useProfileDataStore.getState().userProfiles[userId];
  const hasAvatar = !!useAvatarStore.getState().userAvatars[userId];
  const hasGoodName = isGoodValue(cachedProfile?.displayName);
  const metadataName = metadata?.actorName || metadata?.actorUsername || "";
  const metadataUsername = metadata?.actorUsername || metadata?.actorName || "";
  const hasGoodMetadataName =
    isGoodValue(metadata?.actorName) || isGoodValue(metadata?.actorUsername);

  if (!cachedProfile && hasGoodMetadataName) {
    useProfileDataStore
      .getState()
      .setUserProfile(
        userId,
        isGoodValue(metadataName) ? metadataName : metadataUsername,
        isGoodValue(metadataUsername) ? metadataUsername : metadataName,
        metadata?.actorAvatar,
      );
  }

  if (!hasAvatar && metadata?.actorAvatar) {
    useAvatarStore.getState().setUserAvatar(userId, metadata.actorAvatar);
  }

  if (hasGoodMetadataName) {
    return;
  }

  const lastFailedAt = failedProfileFetches.get(userId);
  if (lastFailedAt && Date.now() - lastFailedAt < PROFILE_FETCH_RETRY_TTL) {
    return;
  }

  // Only fetch from Postgres when we're actually missing data
  if (!hasAvatar || !hasGoodName) {
    try {
      const p = await resolveUserProfile(userId);
      if (p) {
        const newDisplayName = p.displayName || p.username || "";
        const newUsername = p.username || "";
        const avatarUrl = p.avatarUrl || "";

        // Only write to profileDataStore if the NEW data is actually better
        // than what's already cached — never overwrite good data with worse data
        const existingName = cachedProfile?.displayName || "";
        const existingUsername = cachedProfile?.username || "";
        const shouldUpdateName =
          isGoodValue(newDisplayName) && !isGoodValue(existingName);
        const shouldUpdateUsername =
          isGoodValue(newUsername) && !isGoodValue(existingUsername);
        const noCacheYet = !cachedProfile;

        if (noCacheYet || shouldUpdateName || shouldUpdateUsername) {
          useProfileDataStore
            .getState()
            .setUserProfile(
              userId,
              isGoodValue(newDisplayName) ? newDisplayName : existingName,
              isGoodValue(newUsername) ? newUsername : existingUsername,
            );
        }

        if (avatarUrl) {
          useAvatarStore.getState().setUserAvatar(userId, avatarUrl);
        }
        failedProfileFetches.delete(userId);
      } else {
        failedProfileFetches.set(userId, Date.now());
      }
    } catch (error) {
      failedProfileFetches.set(userId, Date.now());
      console.error("Error fetching user profile:", error);
    }
  }
};

const fetchUserProfileIfNeededDedup = async (
  userId: string,
  metadata?: {
    actorName?: string;
    actorUsername?: string;
    actorAvatar?: string;
  },
) => {
  if (!userId) return;

  const existingFetch = inFlightProfileFetches.get(userId);
  if (existingFetch) {
    return existingFetch;
  }

  const fetchPromise = fetchUserProfileIfNeeded(userId, metadata).finally(
    () => {
      inFlightProfileFetches.delete(userId);
    },
  );

  inFlightProfileFetches.set(userId, fetchPromise);
  return fetchPromise;
};

export function AlertsScreen({
  onBack,
  onNavigateToDares,
  onNavigateToFeed,
  onNavigateToChallengeTimeline,
  onNavigateToFriendCompletedDare,
  onOpenInteraction,
}: {
  onOpenInteraction?: (kind: string, id: string, chatMessageId?: string) => void;
  onBack: () => void;
  onNavigateToDares: (request?: {
    tab?: "received" | "sent";
    highlightDareId?: string;
    highlightTruthId?: string;
  }) => void;
  onNavigateToFeed: () => void;
  onNavigateToChallengeTimeline: (alert: AlertEntity) => void;
  onNavigateToFriendCompletedDare: (alert: AlertEntity) => void;
}) {
  const [activeTab, setActiveTab] = useState<"social">("social");
  const [alertMode, setAlertMode] = useState<"main" | "dare">("main");
  const [dareAlertTab, setDareAlertTab] = useState<"personal" | "friends">(
    "personal",
  );
  const [friendshipStatuses, setFriendshipStatuses] = useState<
    Map<string, "accepted" | "rejected">
  >(new Map());
  const [clockTick, setClockTick] = useState(() => Date.now());
  const { alerts, markAsRead, loadAlerts, loadOlderAlerts, hasMore, olderCursor, loading } = useAlertStore();
  const { user: currentUser } = useAuthStore();
  const checkedFriendshipActorsRef = useRef<Set<string>>(new Set());
  const inFlightFriendshipActorsRef = useRef<Set<string>>(new Set());
  const knownAlertIdsRef = useRef<Set<string>>(new Set());
  const hasHydratedAlertsRef = useRef(false);
  const newestKnownAlertTimeRef = useRef(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setClockTick(Date.now());
    }, 60000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    checkedFriendshipActorsRef.current.clear();
    inFlightFriendshipActorsRef.current.clear();
    knownAlertIdsRef.current.clear();
    hasHydratedAlertsRef.current = false;
    newestKnownAlertTimeRef.current = 0;
  }, [currentUser?.id]);

  useEffect(() => {
    if (currentUser?.id) void loadAlerts(true);
  }, [currentUser?.id, loadAlerts]);

  // Handle navigation to dares screen
  const handleAlertClick = async (alert: AlertEntity) => {
    const circleId = alert.metadata?.circleId;
    if (typeof circleId === 'string' && circleId !== useCirclesStore.getState().activeId) {
      if (!currentUser?.id) return;
      await useCirclesStore.getState().load(currentUser.id);
      if (!useCirclesStore.getState().circles.some(c => c.id === circleId)) return;
      await useCirclesStore.getState().select(circleId);
    }
    // Mark as read first. Temporary mock entries are display-only.
    if (!alert.id.startsWith("mock-")) {
      const alertIds = Array.isArray(alert.metadata?.aggregatedAlertIds)
        ? alert.metadata.aggregatedAlertIds
        : [alert.id];

      await Promise.all(
        alertIds
          .filter((id): id is string => typeof id === "string" && id.length > 0)
          .map((id) => markAsRead(id)),
      );
    }

    if (
      alert.type === "DARE_FRIEND_ACTIVITY" ||
      alert.type === "TRUTH_FRIEND_ACTIVITY"
    ) {
      if (
        alert.type === "DARE_FRIEND_ACTIVITY" &&
        alert.metadata?.activityType === "completed"
      ) {
        onNavigateToFriendCompletedDare(alert);
        return;
      }

      onNavigateToChallengeTimeline(alert);
      return;
    }

    if (typeof alert.metadata?.interactionKind === "string") {
      onOpenInteraction?.(alert.metadata.interactionKind, alert.entityId, alert.metadata.chatMessageId);
      return;
    }

    // Navigate based on alert type
    if (
      alert.type === "DARE_COMPLETED" ||
      alert.type === "DARE_PROOF_SUBMITTED"
    ) {
      console.log(
        "🔄 Navigating to dares sent tab for DARE_COMPLETED alert:",
        alert.entityId,
      );
      sessionStorage.setItem("highlightDareId", alert.entityId);
      sessionStorage.setItem("openDaresTab", "sent");
      onNavigateToDares({
        tab: "sent",
        highlightDareId: alert.entityId,
      });
      return;
    }

    if (alert.type === "DARE_APPROVED" || alert.type === "DARE_REJECTED") {
      sessionStorage.setItem("highlightDareId", alert.entityId);
      sessionStorage.setItem("openDaresTab", "received");
      onNavigateToDares({
        tab: "received",
        highlightDareId: alert.entityId,
      });
      return;
    }

    // Handle comment alerts - navigate to post and open comments
    if (alert.type === "COMMENT_RECEIVED" || alert.type === "COMMENT_REPLY") {
      const truthId = alert.metadata?.truthId;
      const dareId = alert.metadata?.dareId;

      if (truthId || dareId) {
        sessionStorage.setItem("openDaresTab", "received");

        if (truthId) {
          sessionStorage.setItem("highlightTruthId", truthId);
        }

        if (dareId) {
          sessionStorage.setItem("highlightDareId", dareId);
        }

        onNavigateToDares({
          tab: "received",
          highlightDareId: dareId || undefined,
          highlightTruthId: truthId || undefined,
        });
        return;
      }

      console.log(
        "🔄 Navigating to post and opening comments for comment alert:",
        alert.type,
        alert.entityId,
      );

      // Store the post ID to highlight and open comments
      sessionStorage.setItem("highlightPostId", alert.entityId);
      sessionStorage.setItem("openCommentsForPost", alert.entityId);

      // Navigate to feed
      onNavigateToFeed();
      return;
    }

    if (
      alert.type === "DARE_RECEIVED" ||
      alert.type === "DARE_ACCEPTED" ||
      alert.type === "DARE_REFUSED" ||
      alert.type === "TRUTH_RECEIVED" ||
      alert.type === "TRUTH_ANSWERED"
    ) {
      console.log(
        "🔄 Navigating to dares received tab for alert:",
        alert.type,
        alert.entityId,
      );

      // Set the correct highlight ID based on alert type
      if (alert.type === "TRUTH_RECEIVED" || alert.type === "TRUTH_ANSWERED") {
        sessionStorage.setItem("highlightTruthId", alert.entityId);
        console.log("🎯 Stored truth ID to highlight:", alert.entityId);
      } else {
        sessionStorage.setItem("highlightDareId", alert.entityId);
        console.log("🎯 Stored dare ID to highlight:", alert.entityId);
      }

      // Ensure we open the received tab (not sent tab)
      sessionStorage.setItem("openDaresTab", "received");

      // Navigate to dares screen
      onNavigateToDares({
        tab: "received",
        highlightDareId:
          alert.type === "TRUTH_RECEIVED" || alert.type === "TRUTH_ANSWERED"
            ? undefined
            : alert.entityId,
        highlightTruthId:
          alert.type === "TRUTH_RECEIVED" || alert.type === "TRUTH_ANSWERED"
            ? alert.entityId
            : undefined,
      });
    }
  };

  // Check friendship status for friend request alerts to ensure persistence
  useEffect(() => {
    if (!currentUser?.id) return;

    const checkFriendshipStatuses = async () => {
      const actorIds = [
        ...new Set(
          alerts
            .filter((alert) => alert.type === "FRIEND_REQUEST" && alert.actorId)
            .map((alert) => alert.actorId as string),
        ),
      ];

      for (const actorId of actorIds) {
        const cacheKey = `${currentUser.id}:${actorId}`;
        if (
          checkedFriendshipActorsRef.current.has(cacheKey) ||
          inFlightFriendshipActorsRef.current.has(cacheKey)
        ) {
          continue;
        }

        inFlightFriendshipActorsRef.current.add(cacheKey);

        try {
          const { friendsService } =
            await import("@/middleware/services/service-factory");
          const statusResponse = await friendsService.getFriendshipStatus(
            currentUser.id,
            actorId,
          );

          if (statusResponse.success && statusResponse.friendship) {
            const status = statusResponse.friendship.status;
            if (status === "accepted" || status === "rejected") {
              setFriendshipStatuses((prev) => {
                const next = new Map(prev);
                alerts
                  .filter(
                    (alert) =>
                      alert.type === "FRIEND_REQUEST" &&
                      alert.actorId === actorId,
                  )
                  .forEach((alert) => {
                    next.set(alert.id, status);
                  });
                return next;
              });
            }
          }

          checkedFriendshipActorsRef.current.add(cacheKey);
        } catch (error) {
          console.error("Error checking friendship status:", error);
        } finally {
          inFlightFriendshipActorsRef.current.delete(cacheKey);
        }
      }
    };

    checkFriendshipStatuses();
  }, [alerts, currentUser?.id]);

  // Fetch user profiles when alerts change
  useEffect(() => {
    const alertsByActorId = new Map<string, AlertEntity>();
    alerts.forEach((alert) => {
      if (alert.actorId && !alertsByActorId.has(alert.actorId)) {
        alertsByActorId.set(alert.actorId, alert);
      }
    });

    alertsByActorId.forEach((alert, actorId) => {
      fetchUserProfileIfNeededDedup(actorId, {
        actorName: alert.metadata?.actorName,
        actorUsername: alert.metadata?.actorUsername,
        actorAvatar: alert.metadata?.actorAvatar,
      });
    });
  }, [alerts]);

  const getAlertActivityTime = (alert: AlertEntity) => {
    const latestAggregatedAt =
      alert.metadata?.lastActivityAt ||
      alert.metadata?.lastReactionAt ||
      alert.metadata?.lastInteractionAt;

    if (latestAggregatedAt) {
      return typeof latestAggregatedAt === "number"
        ? new Date(latestAggregatedAt).toISOString()
        : latestAggregatedAt;
    }

    return alert.createdAt;
  };

  // Group alerts by time
  const groupAlertsByTime = (alerts: AlertEntity[]) => {
    const today: AlertEntity[] = [];
    const yesterday: AlertEntity[] = [];

    alerts.forEach((alert) => {
      const alertTime = new Date(getAlertActivityTime(alert));
      const now = new Date();
      const diffInHours =
        (now.getTime() - alertTime.getTime()) / (1000 * 60 * 60);

      if (diffInHours < 24) {
        today.push(alert);
      } else {
        yesterday.push(alert);
      }
    });

    return { today, yesterday };
  };

  const isFriendChallengeAlert = (alert: AlertEntity) =>
    alert.type === "DARE_FRIEND_ACTIVITY" ||
    alert.type === "TRUTH_FRIEND_ACTIVITY";

  const isPersonalDareAlert = (alert: AlertEntity) =>
    !isFriendChallengeAlert(alert) &&
    (alert.type.startsWith("DARE_") || alert.type.startsWith("TRUTH_"));

  // Filter alerts by type. Personal dare/truth workflow cards are displayed
  // under the D organizer only; alert creation and click behavior stay unchanged.
  const personalDareAlerts = alerts.filter(
    (alert) => alert.isSocialAlert() && isPersonalDareAlert(alert),
  );
  const friendChallengeAlerts = alerts.filter(
    (alert) => alert.isSocialAlert() && isFriendChallengeAlert(alert),
  );
  const mockFriendChallengeAlerts = [
    AlertEntity.create({
      id: "mock-friend-dare-activity-1",
      userId: currentUser?.id || "mock-current-user",
      type: "DARE_FRIEND_ACTIVITY",
      entityId: "mock-friend-dare-1",
      actorId: "mock-ria",
      message: "Ria dared Kabir to send a voice note without deleting it",
      metadata: {
        mock: true,
        challengeKind: "dare",
        challengerId: "mock-ria",
        challengerName: "Ria",
        challengerUsername: "ria",
        receiverId: "mock-kabir",
        receiverName: "Kabir",
        receiverUsername: "kabir",
        prompt: "Send a voice note saying the thing you have been avoiding.",
        mockState: "PROOF_SUBMITTED",
        mockCreatedAt: new Date(clockTick - 1000 * 60 * 42).toISOString(),
        mockAcceptedAt: new Date(clockTick - 1000 * 60 * 31).toISOString(),
        mockProofSubmittedAt: new Date(clockTick - 1000 * 60 * 8).toISOString(),
      },
      isRead: false,
      createdAt: new Date(clockTick - 1000 * 60 * 42).toISOString(),
      updatedAt: new Date(clockTick - 1000 * 60 * 8).toISOString(),
    }),
    AlertEntity.create({
      id: "mock-friend-truth-activity-1",
      userId: currentUser?.id || "mock-current-user",
      type: "TRUTH_FRIEND_ACTIVITY",
      entityId: "mock-friend-truth-1",
      actorId: "mock-meera",
      message: "Meera asked Aarav a truth about who knows them best",
      metadata: {
        mock: true,
        challengeKind: "truth",
        challengerId: "mock-meera",
        challengerName: "Meera",
        challengerUsername: "meera",
        receiverId: "mock-aarav",
        receiverName: "Aarav",
        receiverUsername: "aarav",
        prompt:
          "Who in your life understands the version of you nobody else sees?",
        mockState: "ANSWERED",
        mockCreatedAt: new Date(clockTick - 1000 * 60 * 78).toISOString(),
        mockAnsweredAt: new Date(clockTick - 1000 * 60 * 19).toISOString(),
      },
      isRead: true,
      createdAt: new Date(clockTick - 1000 * 60 * 78).toISOString(),
      updatedAt: new Date(clockTick - 1000 * 60 * 19).toISOString(),
    }),
    AlertEntity.create({
      id: "mock-friend-dare-activity-2",
      userId: currentUser?.id || "mock-current-user",
      type: "DARE_FRIEND_ACTIVITY",
      entityId: "mock-friend-dare-2",
      actorId: "mock-isha",
      message: "Isha dared Dev to post an unfiltered throwback",
      metadata: {
        mock: true,
        challengeKind: "dare",
        challengerId: "mock-isha",
        challengerName: "Isha",
        challengerUsername: "isha",
        receiverId: "mock-dev",
        receiverName: "Dev",
        receiverUsername: "dev",
        prompt: "Post an old photo and tell the real story behind it.",
        mockState: "SENT",
        mockCreatedAt: new Date(clockTick - 1000 * 60 * 11).toISOString(),
      },
      isRead: false,
      createdAt: new Date(clockTick - 1000 * 60 * 11).toISOString(),
      updatedAt: new Date(clockTick - 1000 * 60 * 11).toISOString(),
    }),
  ];
  const friendChallengeAlertsForDisplay =
    friendChallengeAlerts.length > 0
      ? friendChallengeAlerts
      : mockFriendChallengeAlerts;
  const socialAlerts = alerts.filter(
    (alert) =>
      alert.isSocialAlert() &&
      alert.type !== "STORY_REPLY" &&
      !isPersonalDareAlert(alert) &&
      !isFriendChallengeAlert(alert),
  );

  // ── Aggregate POST_LIKED alerts by postId (Instagram-style) ──
  // Groups multiple likes on the same post into one entry:
  //   "@user1 and 3 others liked your post"
  const aggregateLikeAlerts = (alertsList: AlertEntity[]) => {
    const likeAlerts = alertsList.filter((a) => a.type === "POST_LIKED");
    const nonLikeAlerts = alertsList.filter((a) => a.type !== "POST_LIKED");

    // Group likes by postId
    const likesByPost = new Map<string, AlertEntity[]>();
    for (const alert of likeAlerts) {
      const postId = alert.metadata?.postId || alert.entityId;
      if (!likesByPost.has(postId)) {
        likesByPost.set(postId, []);
      }
      likesByPost.get(postId)!.push(alert);
    }

    // Convert grouped likes into aggregated alert entries
    // Use the most recent like alert as the "primary" and attach others count
    const aggregatedLikes: AlertEntity[] = [];
    for (const [, postLikes] of likesByPost) {
      // Sort by createdAt descending — most recent first
      const sorted = [...postLikes].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      const primary = sorted[0];
      const othersCount = sorted.length - 1;

      if (othersCount > 0) {
        // Create aggregated alert with updated metadata
        const aggregatedAlert = AlertEntity.create({
          ...primary,
          metadata: {
            ...primary.metadata,
            aggregatedCount: sorted.length,
            actors: sorted.map((a) => ({
              id: a.actorId,
              name: a.metadata?.actorName || "Someone",
              username: a.metadata?.actorUsername || "someone",
              avatar: a.metadata?.actorAvatar || "",
            })),
          },
          message: `${primary.metadata?.actorName || "Someone"} and ${othersCount} ${othersCount === 1 ? "other" : "others"} liked your post`,
        });
        aggregatedLikes.push(aggregatedAlert);
      } else {
        aggregatedLikes.push(primary);
      }
    }

    return [...aggregatedLikes, ...nonLikeAlerts];
  };

  // ── Aggregate STORY_REACTION alerts by storyId (Instagram-style) ──
  const aggregateStoryReactionAlerts = (alertsList: AlertEntity[]) => {
    const storyReactionAlerts = alertsList.filter(
      (a) => a.type === "STORY_REACTION",
    );
    const nonStoryReactionAlerts = alertsList.filter(
      (a) => a.type !== "STORY_REACTION",
    );

    const buildStoryReactionMessage = (
      reactionType: "like" | "hate",
      primaryAlert: AlertEntity,
      count: number,
    ) => {
      const username =
        primaryAlert.metadata?.actorUsername ||
        primaryAlert.metadata?.actorName ||
        "someone";
      const actorLabel = username.startsWith("@") ? username : `@${username}`;

      if (count <= 1) {
        return reactionType === "hate"
          ? `${actorLabel} hated your story`
          : `${actorLabel} liked your story`;
      }

      return reactionType === "hate"
        ? `${actorLabel} and ${count - 1} ${count - 1 === 1 ? "other" : "others"} hated your story`
        : `${actorLabel} and ${count - 1} ${count - 1 === 1 ? "other" : "others"} liked your story`;
    };

    // Group reactions by storyId + reactionType
    const reactionsByStory = new Map<string, AlertEntity[]>();
    for (const alert of storyReactionAlerts) {
      const reactionType =
        alert.metadata?.reactionType === "hate" ? "hate" : "like";
      const storyReactionKey = `${alert.entityId}:${reactionType}`;
      if (!reactionsByStory.has(storyReactionKey)) {
        reactionsByStory.set(storyReactionKey, []);
      }
      reactionsByStory.get(storyReactionKey)!.push(alert);
    }

    // Convert grouped reactions into aggregated alert entries
    const aggregatedReactions: AlertEntity[] = [];
    for (const [, storyReactions] of reactionsByStory) {
      const sorted = [...storyReactions].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      const primary = sorted[0];
      const othersCount = sorted.length - 1;

      if (othersCount > 0) {
        const aggregatedAlert = AlertEntity.create({
          ...primary,
          metadata: {
            ...primary.metadata,
            aggregatedCount: sorted.length,
            reactionType:
              primary.metadata?.reactionType === "hate" ? "hate" : "like",
            actors: sorted.map((a) => ({
              id: a.actorId,
              name: a.metadata?.actorName || "Someone",
              username: a.metadata?.actorUsername || "someone",
              avatar: a.metadata?.actorAvatar || "",
              reactionType: a.metadata?.reactionType || "like",
            })),
          },
          message: buildStoryReactionMessage(
            primary.metadata?.reactionType === "hate" ? "hate" : "like",
            primary,
            sorted.length,
          ),
        });
        aggregatedReactions.push(aggregatedAlert);
      } else {
        aggregatedReactions.push(
          AlertEntity.create({
            ...primary,
            metadata: {
              ...primary.metadata,
              reactionType:
                primary.metadata?.reactionType === "hate" ? "hate" : "like",
            },
            message: buildStoryReactionMessage(
              primary.metadata?.reactionType === "hate" ? "hate" : "like",
              primary,
              1,
            ),
          }),
        );
      }
    }

    return [...aggregatedReactions, ...nonStoryReactionAlerts];
  };

  const legacyAlertAggregators = [
    aggregateLikeAlerts,
    aggregateStoryReactionAlerts,
  ];
  void legacyAlertAggregators;

  const aggregationTargetForAlert = (alert: AlertEntity) => {
    switch (alert.type) {
      case "POST_LIKED":
        return `post-like:${alert.metadata?.postId || alert.entityId}`;
      case "STORY_REACTION":
        return `story-reaction:${alert.entityId}`;
      case "COMMENT_RECEIVED":
        return `post-comment:${alert.metadata?.postId || alert.entityId}`;
      case "COMMENT_REPLY":
        return `comment-reply:${
          alert.metadata?.parentCommentId ||
          alert.metadata?.commentId ||
          alert.metadata?.postId ||
          alert.entityId
        }`;
      case "STORY_REPLY":
        return `story-reply:${alert.entityId}`;
      default:
        return null;
    }
  };

  const getAggregatedActor = (alert: AlertEntity) => ({
    id: alert.actorId || alert.metadata?.actorId || alert.id,
    name: alert.metadata?.actorName || "Someone",
    username: String(alert.metadata?.actorUsername || "someone").replace(
      /^@/,
      "",
    ),
    avatar: alert.metadata?.actorAvatar || "",
    reactionType: alert.metadata?.reactionType || undefined,
    reactionTypes: alert.metadata?.reactionType
      ? [alert.metadata.reactionType === "hate" ? "hate" : "like"]
      : [],
    lastActivityAt: getAlertActivityTime(alert),
  });

  const getUniqueAggregatedActors = (sortedAlerts: AlertEntity[]) => {
    const uniqueActors = new Map<
      string,
      ReturnType<typeof getAggregatedActor>
    >();

    for (const alert of sortedAlerts) {
      const metadataActors = Array.isArray(alert.metadata?.actors)
        ? [...alert.metadata.actors].reverse()
        : [];

      for (const metadataActor of metadataActors) {
        const actor = {
          id: metadataActor.id || metadataActor.userId || alert.actorId,
          name: metadataActor.name || metadataActor.displayName || "Someone",
          username: String(metadataActor.username || "someone").replace(
            /^@/,
            "",
          ),
          avatar: metadataActor.avatar || metadataActor.actorAvatar || "",
          reactionType:
            metadataActor.reactionType || alert.metadata?.reactionType,
          reactionTypes: [
            ...new Set([
              ...(Array.isArray(metadataActor.reactionTypes)
                ? metadataActor.reactionTypes
                : []),
              ...(metadataActor.reactionType
                ? [metadataActor.reactionType]
                : []),
              ...(alert.metadata?.reactionType
                ? [alert.metadata.reactionType]
                : []),
            ]),
          ].map((type) => (type === "hate" ? "hate" : "like")),
          lastActivityAt: getAlertActivityTime(alert),
        };

        const existingActor = uniqueActors.get(actor.id);
        if (existingActor) {
          uniqueActors.set(actor.id, {
            ...existingActor,
            reactionTypes: [
              ...new Set([
                ...(existingActor.reactionTypes || []),
                ...actor.reactionTypes,
              ]),
            ],
          });
        } else {
          uniqueActors.set(actor.id, actor);
        }
      }

      if (metadataActors.length === 0) {
        const actor = getAggregatedActor(alert);
        const existingActor = uniqueActors.get(actor.id);
        if (existingActor) {
          uniqueActors.set(actor.id, {
            ...existingActor,
            reactionTypes: [
              ...new Set([
                ...(existingActor.reactionTypes || []),
                ...actor.reactionTypes,
              ]),
            ],
          });
        } else {
          uniqueActors.set(actor.id, actor);
        }
      }
    }

    return [...uniqueActors.values()];
  };

  const formatActorName = (actor: ReturnType<typeof getAggregatedActor>) => {
    const username = actor.username || actor.name || "someone";
    return username.startsWith("@") ? username : `@${username}`;
  };

  const formatAggregatedActorLine = (
    actors: ReturnType<typeof getAggregatedActor>[],
  ) => {
    const names = actors.slice(0, 3).map(formatActorName);

    if (actors.length <= 1) return names[0] || "@someone";
    if (actors.length === 2) return `${names[0]} and ${names[1]}`;
    if (actors.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;

    return `${names[0]}, ${names[1]} and ${actors.length - 2} others`;
  };

  const getAggregatedActionPhrase = (
    alert: AlertEntity,
    actors: ReturnType<typeof getAggregatedActor>[] = [],
  ) => {
    switch (alert.type) {
      case "POST_LIKED":
        return "liked your post";
      case "STORY_REACTION": {
        const allReactionTypes = new Set(
          actors.flatMap((actor) => actor.reactionTypes || []),
        );

        if (allReactionTypes.has("like") && allReactionTypes.has("hate")) {
          return actors.length === 1
            ? "liked and hated your story"
            : "reacted to your story";
        }

        return allReactionTypes.has("hate")
          ? "hated your story"
          : "liked your story";
      }
      case "COMMENT_RECEIVED":
        return "commented on your post";
      case "COMMENT_REPLY":
        return "replied to your comment";
      case "FRIENDSHIP_ESTABLISHED":
        return "you are now friends";
      case "STORY_REPLY":
        return "replied to your story";
      default:
        return alert.message || "sent you an alert";
    }
  };

  const aggregateAllSocialAlerts = (alertsList: AlertEntity[]) => {
    const groupedAlerts = new Map<string, AlertEntity[]>();
    const passthroughAlerts: AlertEntity[] = [];

    for (const alert of alertsList) {
      const aggregationTarget = aggregationTargetForAlert(alert);

      if (!aggregationTarget) {
        passthroughAlerts.push(alert);
        continue;
      }

      const groupKey = `${alert.type}:${aggregationTarget}`;
      groupedAlerts.set(groupKey, [
        ...(groupedAlerts.get(groupKey) || []),
        alert,
      ]);
    }

    const aggregatedAlerts = [...groupedAlerts.values()].map((group) => {
      const sorted = [...group].sort(
        (a, b) =>
          new Date(getAlertActivityTime(b)).getTime() -
          new Date(getAlertActivityTime(a)).getTime(),
      );
      const latestAlert = sorted[0];
      const actors = getUniqueAggregatedActors(sorted);
      const latestActor = actors[0] || getAggregatedActor(latestAlert);
      const lastActivityAt = getAlertActivityTime(latestAlert);

      return AlertEntity.create({
        id: latestAlert.id,
        userId: latestAlert.userId,
        type: latestAlert.type,
        entityId: latestAlert.entityId,
        actorId: latestActor.id || latestAlert.actorId,
        message:
          actors.length > 1
            ? `${formatAggregatedActorLine(actors)} ${getAggregatedActionPhrase(latestAlert, actors)}`
            : `${formatActorName(latestActor)} ${getAggregatedActionPhrase(latestAlert, actors)}`,
        metadata: {
          ...latestAlert.metadata,
          actorName: latestActor.name,
          actorUsername: latestActor.username,
          actorAvatar: latestActor.avatar,
          actors,
          aggregatedCount: actors.length,
          aggregatedAlertIds: sorted.map((alert) => alert.id),
          lastActivityAt,
          commentText: latestAlert.metadata?.commentText,
          reactionType:
            latestAlert.type === "STORY_REACTION"
              ? actors.some((actor) => actor.reactionTypes?.includes("like")) &&
                actors.some((actor) => actor.reactionTypes?.includes("hate"))
                ? "mixed"
                : latestAlert.metadata?.reactionType === "hate"
                  ? "hate"
                  : "like"
              : latestAlert.metadata?.reactionType,
        },
        isRead: sorted.every((alert) => alert.isRead),
        createdAt: lastActivityAt,
        updatedAt: lastActivityAt,
      });
    });

    return [...aggregatedAlerts, ...passthroughAlerts].sort(
      (a, b) =>
        new Date(getAlertActivityTime(b)).getTime() -
        new Date(getAlertActivityTime(a)).getTime(),
    );
  };

  const aggregatedSocialAlerts = aggregateAllSocialAlerts(socialAlerts);

  // Deduplicate alerts by ID to prevent key conflicts
  const deduplicateAlerts = (alerts: any[]) => {
    const seen = new Set();
    return alerts.filter((alert) => {
      if (seen.has(alert.id)) {
        return false;
      }
      seen.add(alert.id);
      return true;
    });
  };

  const { today: socialToday, yesterday: socialYesterday } = groupAlertsByTime(
    deduplicateAlerts(aggregatedSocialAlerts),
  );
  const { today: personalDareToday, yesterday: personalDareYesterday } =
    groupAlertsByTime(deduplicateAlerts(personalDareAlerts));
  const { today: friendChallengeToday, yesterday: friendChallengeYesterday } =
    groupAlertsByTime(deduplicateAlerts(friendChallengeAlertsForDisplay));

  const currentAlerts =
    alertMode === "dare"
      ? dareAlertTab === "personal"
        ? deduplicateAlerts(personalDareAlerts)
        : deduplicateAlerts(friendChallengeAlertsForDisplay)
      : deduplicateAlerts(aggregatedSocialAlerts);

  const isRealUnreadAlert = (alert: AlertEntity) =>
    !alert.id.startsWith("mock-") && !alert.isRead;
  const dareUnreadCount = [
    ...personalDareAlerts,
    ...friendChallengeAlerts,
  ].filter(isRealUnreadAlert).length;
  const mainUnreadCount = deduplicateAlerts(aggregatedSocialAlerts).filter(
    isRealUnreadAlert,
  ).length;
  const currentUnreadCount = currentAlerts.filter(isRealUnreadAlert).length;
  const currentLaneLabel =
    alertMode === "dare"
      ? dareAlertTab === "personal"
        ? "Dare queue"
        : "Friends queue"
      : "Social notifications";
  const currentLaneCaption =
    alertMode === "dare"
      ? dareAlertTab === "personal"
        ? "Dares and truth updates"
        : "Friend challenge updates"
      : "Posts, comments, and requests";

  // Helper method to get time ago
  const getTimeAgo = (createdAt: string): string => {
    const alertTime = new Date(createdAt);
    const now = new Date(clockTick);
    const diffInMs = now.getTime() - alertTime.getTime();
    const diffInMins = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInMins < 1) return "Just now";
    if (diffInMins < 60) return `${diffInMins}m ago`;
    if (diffInHours < 24) return `${diffInHours}h ago`;
    return `${diffInDays}d ago`;
  };

  useEffect(() => {
    const realAlerts = alerts.filter((alert) => !alert.id.startsWith("mock-"));
    const currentIds = new Set(realAlerts.map((alert) => alert.id));
    const newestTime = Math.max(0, ...realAlerts.map((alert) => new Date(alert.createdAt || alert.updatedAt).getTime()));

    if (!hasHydratedAlertsRef.current) {
      knownAlertIdsRef.current = currentIds;
      hasHydratedAlertsRef.current = true;
      newestKnownAlertTimeRef.current = newestTime;
      return;
    }

    const newlyArrivedAlerts = realAlerts.filter(
      (alert) => !knownAlertIdsRef.current.has(alert.id) &&
        new Date(alert.createdAt || alert.updatedAt).getTime() > newestKnownAlertTimeRef.current,
    );
    newestKnownAlertTimeRef.current = Math.max(newestKnownAlertTimeRef.current, newestTime);
    knownAlertIdsRef.current = currentIds;

    if (newlyArrivedAlerts.length === 0) return;

    const latestAlert = [...newlyArrivedAlerts].sort(
      (a, b) =>
        new Date(b.createdAt || b.updatedAt).getTime() -
        new Date(a.createdAt || a.updatedAt).getTime(),
    )[0];

    if (!latestAlert) return;

    if (isPersonalDareAlert(latestAlert)) {
      setAlertMode("dare");
      setDareAlertTab("personal");
      return;
    }

    if (isFriendChallengeAlert(latestAlert)) {
      setAlertMode("dare");
      setDareAlertTab("friends");
      return;
    }

    if (latestAlert.isSocialAlert()) {
      setAlertMode("main");
      setActiveTab("social");
    }
  }, [alerts]);

  // Get actor info from metadata (resolve from profileDataStore + avatarStore)
  const alertUserProfiles = useProfileDataStore((s) => s.userProfiles);
  const userAvatars = useAvatarStore((s) => s.userAvatars);
  const getActorInfo = (alert: AlertEntity) => {
    const cachedProfile = alert.actorId
      ? alertUserProfiles[alert.actorId]
      : null;

    // Resolve username: cached profile > metadata > fallback
    let username = "unknown";
    if (cachedProfile?.username) {
      username = cachedProfile.username;
    } else if (
      alert.metadata.actorUsername &&
      alert.metadata.actorUsername !== "dare" &&
      alert.metadata.actorUsername !== "unknown"
    ) {
      username = alert.metadata.actorUsername;
    } else if (
      alert.metadata.actorName &&
      alert.metadata.actorName !== "dare" &&
      alert.metadata.actorName !== "Unknown User"
    ) {
      username = alert.metadata.actorName.toLowerCase().replace(/\s+/g, "_");
    }

    // Resolve display name: cached profile > metadata > fallback
    let displayName = "Unknown User";
    const cachedName = cachedProfile?.displayName;
    if (
      cachedName &&
      cachedName !== "Unknown User" &&
      cachedName !== "unknown"
    ) {
      displayName = cachedName;
    } else if (
      alert.metadata.actorName &&
      alert.metadata.actorName !== "dare" &&
      alert.metadata.actorName !== "Unknown User"
    ) {
      displayName = alert.metadata.actorName;
    } else if (
      alert.metadata.actorUsername &&
      alert.metadata.actorUsername !== "dare" &&
      alert.metadata.actorUsername !== "unknown"
    ) {
      displayName = alert.metadata.actorUsername;
    } else if (
      cachedProfile?.username &&
      cachedProfile.username !== "unknown"
    ) {
      displayName = cachedProfile.username;
    }

    // Resolve avatar: avatarStore (freshest) > metadata > empty
    let avatar = "";
    if (alert.actorId && userAvatars[alert.actorId]) {
      avatar = userAvatars[alert.actorId];
    } else if (alert.metadata.actorAvatar) {
      avatar = alert.metadata.actorAvatar;
    }

    return {
      name: displayName,
      avatar,
      username,
      userId: alert.actorId,
    };
  };

  const getActorHandle = (actorInfo: ReturnType<typeof getActorInfo>) => {
    return actorInfo.username && actorInfo.username !== "unknown"
      ? `@${actorInfo.username.replace(/^@/, "")}`
      : actorInfo.name;
  };

  const escapeRegex = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const getAlertActionMessage = (
    alert: AlertEntity,
    actorInfo: ReturnType<typeof getActorInfo>,
  ) => {
    if (alert.type === "FRIENDSHIP_ESTABLISHED") {
      return "you are now friends";
    }
    let message = String(alert.message || "").trim();
    const actorVariants = [
      actorInfo.name,
      actorInfo.username,
      actorInfo.username ? `@${actorInfo.username.replace(/^@/, "")}` : "",
      alert.metadata?.actorName,
      alert.metadata?.actorUsername,
      alert.metadata?.actorUsername
        ? `@${String(alert.metadata.actorUsername).replace(/^@/, "")}`
        : "",
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim())
      .filter(
        (value, index, values) =>
          value.length > 0 &&
          value.toLowerCase() !== "unknown" &&
          value.toLowerCase() !== "unknown user" &&
          values.findIndex(
            (candidate) => candidate.toLowerCase() === value.toLowerCase(),
          ) === index,
      )
      .sort((a, b) => b.length - a.length);

    for (const variant of actorVariants) {
      const pattern = new RegExp(
        `^\\s*${escapeRegex(variant)}\\s*(?:[-:•]|\\s+)\\s*`,
        "i",
      );
      if (pattern.test(message)) {
        message = message.replace(pattern, "").trim();
        break;
      }
    }

    return message || alert.message;
  };

  const handleAcceptFriendRequest = async (
    alertId: string,
    friendshipId: string,
  ) => {
    if (!currentUser?.id) return;

    try {
      const alertData = alerts.find((a: any) => a.id === alertId);
      if (!alertData) {
        throw new Error("Alert not found");
      }

      // Special handling for legacy alerts with "pending" entityId or invalid values
      if (
        friendshipId === "pending" ||
        friendshipId === "friendships" ||
        !friendshipId ||
        friendshipId.length < 10
      ) {
        const { friendsService } =
          await import("@/middleware/services/service-factory");
        const friendshipResponse = await friendsService.getFriendshipStatus(
          currentUser.id,
          alertData.actorId,
        );

        if (friendshipResponse.success && friendshipResponse.friendship) {
          friendshipId = friendshipResponse.friendship.id;
        } else {
          throw new Error(
            "Friend request not found - unable to locate friendship",
          );
        }
      }

      const { friendsService } =
        await import("@/middleware/services/service-factory");

      const result = await friendsService.acceptFriendRequest(
        friendshipId,
        currentUser.id,
      );

      if (!result.success) {
        throw new Error(result.error || "Failed to accept friend request");
      }

      // Mark this alert as accepted in local state
      setFriendshipStatuses((prev: Map<string, "accepted" | "rejected">) =>
        new Map(prev).set(alertId, "accepted"),
      );

      // Update the existing alert to show friendship established
      const { alertService } =
        await import("@/middleware/services/service-factory");
      const alertResponse = await alertService.getAlerts({
        userId: currentUser.id,
        limit: 1,
      });
      const originalAlert = alertResponse.alerts?.find(
        (a: any) => a.id === alertId,
      );

      if (originalAlert) {
        const actorName = originalAlert.metadata.actorName || "Someone";
        const actorUsername = originalAlert.metadata.actorUsername || "someone";

        await alertService.updateAlert(alertId, currentUser.id, {
          type: "FRIENDSHIP_ESTABLISHED",
          message: `You and ${actorName} (@${actorUsername}) are now friends!`,
          metadata: {
            ...originalAlert.metadata,
            status: "accepted",
          },
        });
      }

      await markAsRead(alertId);

      // A friendship changes both network rails. Drop the pre-relationship
      // session snapshot before repopulating them from the authenticated APIs.
      const { useContentStore } = await import("../../stores/useContentStore");
      useContentStore.getState().invalidateFeedRailCache(currentUser.id);
      await Promise.all([
        useContentStore.getState().loadTruthPosts(true, "feed"),
        useContentStore.getState().loadDarePosts(true, "feed"),
      ]);

      // Trigger post-feed refresh to include friend's posts.
      const { usePostsStore } = await import("../../stores/usePostsStore");
      usePostsStore.getState().clearPersistedData();
      await usePostsStore.getState().loadPosts(currentUser.id);

      // Increment friends count for both users
      const { useUserProfileStore } =
        await import("../../stores/useUserProfileStore");
      useUserProfileStore.getState().incrementFriendsCount(currentUser.id);

      if (originalAlert?.actorId) {
        useUserProfileStore
          .getState()
          .incrementFriendsCount(originalAlert.actorId);
      }
    } catch (error) {
      console.error("Error accepting friend request:", error);
    }
  };

  const handleRejectFriendRequest = async (
    alertId: string,
    friendshipId: string,
  ) => {
    if (!currentUser?.id) return;

    try {
      const { friendsService } =
        await import("@/middleware/services/service-factory");
      await friendsService.rejectFriendRequest(friendshipId, currentUser.id);
      await markAsRead(alertId);
    } catch (error) {
      console.error("Error rejecting friend request:", error);
    }
  };

  const getSocialAlertMeta = (alert: AlertEntity) => {
    switch (alert.type) {
      case "DARE_RECEIVED":
        return {
          label: "Dare Received",
          accentBarClass: "bg-[#f59e0b]",
          pillClass: "border-[#f59e0b]/30 bg-[#f59e0b]/12 text-[#fbbf24]",
          iconWrapClass: "border-[#f59e0b]/24 bg-[#f59e0b]/12 text-[#fbbf24]",
          glowClass: "bg-[#f59e0b]/14",
          railClass: "from-[#f59e0b]/0 via-[#f59e0b]/80 to-[#f59e0b]/0",
          icon: <Target size={12} />,
        };
      case "DARE_ACCEPTED":
        return {
          label: "Dare Accepted",
          accentBarClass: "bg-[#4ade80]",
          pillClass: "border-[#4ade80]/30 bg-[#4ade80]/12 text-[#86efac]",
          iconWrapClass: "border-[#4ade80]/24 bg-[#4ade80]/12 text-[#86efac]",
          glowClass: "bg-[#4ade80]/14",
          railClass: "from-[#4ade80]/0 via-[#4ade80]/80 to-[#4ade80]/0",
          icon: <CheckCircle size={12} />,
        };
      case "DARE_REFUSED":
        return {
          label: "Dare Refused",
          accentBarClass: "bg-red-400",
          pillClass: "border-red-500/25 bg-red-500/12 text-red-300",
          iconWrapClass: "border-red-500/24 bg-red-500/12 text-red-300",
          glowClass: "bg-red-500/14",
          railClass: "from-red-500/0 via-red-500/80 to-red-500/0",
          icon: <XCircle size={12} />,
        };
      case "DARE_COMPLETED":
        return {
          label: "Dare Completed",
          accentBarClass: "bg-[#fcd34d]",
          pillClass: "border-[#f59e0b]/25 bg-[#f59e0b]/10 text-[#fcd34d]",
          iconWrapClass: "border-[#f59e0b]/24 bg-[#f59e0b]/12 text-[#fcd34d]",
          glowClass: "bg-[#f59e0b]/14",
          railClass: "from-[#f59e0b]/0 via-[#f59e0b]/80 to-[#f59e0b]/0",
          icon: <Target size={12} />,
        };
      case "DARE_PROOF_SUBMITTED":
        return {
          label: "Proof Submitted",
          accentBarClass: "bg-[#60a5fa]",
          pillClass: "border-[#60a5fa]/25 bg-[#60a5fa]/10 text-[#93c5fd]",
          iconWrapClass: "border-[#60a5fa]/24 bg-[#60a5fa]/12 text-[#93c5fd]",
          glowClass: "bg-[#60a5fa]/14",
          railClass: "from-[#60a5fa]/0 via-[#60a5fa]/80 to-[#60a5fa]/0",
          icon: <Target size={12} />,
        };
      case "DARE_POSTED":
        return {
          label: "Dare Posted",
          accentBarClass: "bg-[#4ade80]",
          pillClass: "border-[#4ade80]/30 bg-[#4ade80]/12 text-[#86efac]",
          iconWrapClass: "border-[#4ade80]/24 bg-[#4ade80]/12 text-[#86efac]",
          glowClass: "bg-[#4ade80]/14",
          railClass: "from-[#4ade80]/0 via-[#4ade80]/80 to-[#4ade80]/0",
          icon: <CheckCircle size={12} />,
        };
      case "DARE_APPROVED":
        return {
          label: "Dare Approved",
          accentBarClass: "bg-[#4ade80]",
          pillClass: "border-[#4ade80]/30 bg-[#4ade80]/12 text-[#86efac]",
          iconWrapClass: "border-[#4ade80]/24 bg-[#4ade80]/12 text-[#86efac]",
          glowClass: "bg-[#4ade80]/14",
          railClass: "from-[#4ade80]/0 via-[#4ade80]/80 to-[#4ade80]/0",
          icon: <CheckCircle size={12} />,
        };
      case "DARE_REJECTED":
        return {
          label: "Dare Rejected",
          accentBarClass: "bg-red-400",
          pillClass: "border-red-500/25 bg-red-500/12 text-red-300",
          iconWrapClass: "border-red-500/24 bg-red-500/12 text-red-300",
          glowClass: "bg-red-500/14",
          railClass: "from-red-500/0 via-red-500/80 to-red-500/0",
          icon: <XCircle size={12} />,
        };
      case "DARE_FRIEND_ACTIVITY":
        return {
          label:
            alert.metadata?.activityType === "completed"
              ? "Friend Completed"
              : "Friends Dare",
          accentBarClass: "bg-[#4ade80]",
          pillClass: "border-[#4ade80]/25 bg-[#4ade80]/10 text-[#86efac]",
          iconWrapClass: "border-[#4ade80]/24 bg-[#4ade80]/12 text-[#86efac]",
          glowClass: "bg-[#4ade80]/14",
          railClass: "from-[#4ade80]/0 via-[#4ade80]/80 to-[#4ade80]/0",
          icon: <Users size={12} />,
        };
      case "TRUTH_RECEIVED":
        return {
          label: "Truth Question",
          accentBarClass: "bg-sky-400",
          pillClass: "border-sky-500/25 bg-sky-500/10 text-sky-300",
          iconWrapClass: "border-sky-500/24 bg-sky-500/12 text-sky-300",
          glowClass: "bg-sky-500/14",
          railClass: "from-sky-500/0 via-sky-500/80 to-sky-500/0",
          icon: <MessageCircle size={12} />,
        };
      case "TRUTH_ANSWERED":
        return {
          label: "Truth Answered",
          accentBarClass: "bg-[#4ade80]",
          pillClass: "border-[#4ade80]/30 bg-[#4ade80]/12 text-[#86efac]",
          iconWrapClass: "border-[#4ade80]/24 bg-[#4ade80]/12 text-[#86efac]",
          glowClass: "bg-[#4ade80]/14",
          railClass: "from-[#4ade80]/0 via-[#4ade80]/80 to-[#4ade80]/0",
          icon: <CheckCircle size={12} />,
        };
      case "TRUTH_FRIEND_ACTIVITY":
        return {
          label: "Friends Truth",
          accentBarClass: "bg-sky-400",
          pillClass: "border-sky-500/25 bg-sky-500/10 text-sky-300",
          iconWrapClass: "border-sky-500/24 bg-sky-500/12 text-sky-300",
          glowClass: "bg-sky-500/14",
          railClass: "from-sky-500/0 via-sky-500/80 to-sky-500/0",
          icon: <Users size={12} />,
        };
      case "COMMENT_RECEIVED":
        return {
          label: "New Comment",
          accentBarClass: "bg-sky-400",
          pillClass: "border-sky-500/25 bg-sky-500/10 text-sky-300",
          iconWrapClass: "border-sky-500/24 bg-sky-500/12 text-sky-300",
          glowClass: "bg-sky-500/14",
          railClass: "from-sky-500/0 via-sky-500/80 to-sky-500/0",
          icon: <MessageCircle size={12} />,
        };
      case "COMMENT_REPLY":
        return {
          label: "Comment Reply",
          accentBarClass: "bg-violet-400",
          pillClass: "border-violet-500/25 bg-violet-500/10 text-violet-300",
          iconWrapClass:
            "border-violet-500/24 bg-violet-500/12 text-violet-300",
          glowClass: "bg-violet-500/14",
          railClass: "from-violet-500/0 via-violet-500/80 to-violet-500/0",
          icon: <MessageSquare size={12} />,
        };
      case "STORY_REACTION": {
        const isMixedReaction = alert.metadata?.reactionType === "mixed";
        const isHateReaction =
          alert.metadata?.reactionType === "hate" ||
          String(alert.message || "")
            .toLowerCase()
            .includes("hated your story");

        return {
          label: isMixedReaction
            ? "Story Reacted"
            : isHateReaction
              ? "Story Hated"
              : "Story Liked",
          accentBarClass: isMixedReaction
            ? "bg-fuchsia-400"
            : isHateReaction
              ? "bg-red-400"
              : "bg-[#4ade80]",
          pillClass: isMixedReaction
            ? "border-fuchsia-500/25 bg-fuchsia-500/12 text-fuchsia-300"
            : isHateReaction
              ? "border-red-500/25 bg-red-500/12 text-red-300"
              : "border-[#4ade80]/25 bg-[#4ade80]/10 text-[#86efac]",
          iconWrapClass: isMixedReaction
            ? "border-fuchsia-500/24 bg-fuchsia-500/12 text-fuchsia-300"
            : isHateReaction
              ? "border-red-500/24 bg-red-500/12 text-red-300"
              : "border-[#4ade80]/24 bg-[#4ade80]/12 text-[#86efac]",
          glowClass: isMixedReaction
            ? "bg-fuchsia-500/14"
            : isHateReaction
              ? "bg-red-500/14"
              : "bg-[#4ade80]/14",
          railClass: isMixedReaction
            ? "from-fuchsia-500/0 via-fuchsia-500/80 to-fuchsia-500/0"
            : isHateReaction
              ? "from-red-500/0 via-red-500/80 to-red-500/0"
              : "from-[#4ade80]/0 via-[#4ade80]/80 to-[#4ade80]/0",
          icon: isMixedReaction ? (
            <Sparkles size={12} />
          ) : isHateReaction ? (
            <XCircle size={12} />
          ) : (
            <Heart size={12} fill="currentColor" />
          ),
        };
      }
      case "POST_LIKED":
        return {
          label: "Post Liked",
          accentBarClass: "bg-pink-400",
          pillClass: "border-pink-500/25 bg-pink-500/10 text-pink-300",
          iconWrapClass: "border-pink-500/24 bg-pink-500/12 text-pink-300",
          glowClass: "bg-pink-500/14",
          railClass: "from-pink-500/0 via-pink-500/80 to-pink-500/0",
          icon: <Heart size={12} fill="currentColor" />,
        };
      case "FRIEND_REQUEST":
        return {
          label: "Friend Request",
          accentBarClass: "bg-[#4ade80]",
          pillClass: "border-[#4ade80]/25 bg-[#4ade80]/10 text-[#86efac]",
          iconWrapClass: "border-[#4ade80]/24 bg-[#4ade80]/12 text-[#86efac]",
          glowClass: "bg-[#4ade80]/14",
          railClass: "from-[#4ade80]/0 via-[#4ade80]/80 to-[#4ade80]/0",
          icon: <Users size={12} />,
        };
      case "FRIENDSHIP_ESTABLISHED":
        return {
          label: "Friends",
          accentBarClass: "bg-[#4ade80]",
          pillClass: "border-[#4ade80]/25 bg-[#4ade80]/10 text-[#86efac]",
          iconWrapClass: "border-[#4ade80]/24 bg-[#4ade80]/12 text-[#86efac]",
          glowClass: "bg-[#4ade80]/14",
          railClass: "from-[#4ade80]/0 via-[#4ade80]/80 to-[#4ade80]/0",
          icon: <Users size={12} />,
        };
      default:
        return {
          label: "Alert",
          accentBarClass: "bg-[#4ade80]",
          pillClass: "border-white/10 bg-white/[0.05] text-white",
          iconWrapClass: "border-[#4ade80]/20 bg-[#4ade80]/10 text-[#86efac]",
          glowClass: "bg-[#4ade80]/10",
          railClass: "from-[#4ade80]/0 via-[#4ade80]/60 to-[#4ade80]/0",
          icon: <BellRing size={12} />,
        };
    }
  };

  const renderSectionHeader = (
    title: string,
    tone: "primary" | "muted" | "danger" = "primary",
  ) => {
    const toneClasses =
      tone === "danger"
        ? {
            text: "text-red-300",
            line: "from-red-500/0 via-red-500/70 to-red-500/0",
            iconWrap: "border-red-500/20 bg-red-500/10 text-red-300",
          }
        : tone === "muted"
          ? {
              text: "text-[#94a3b8]",
              line: "from-white/0 via-white/14 to-white/0",
              iconWrap: "border-white/10 bg-white/[0.04] text-[#94a3b8]",
            }
          : {
              text: "text-[#86efac]",
              line: "from-[#4ade80]/0 via-[#4ade80]/70 to-[#4ade80]/0",
              iconWrap: "border-[#4ade80]/20 bg-[#4ade80]/10 text-[#86efac]",
            };

    return (
      <div className="alerts-section-header mb-3 flex items-center gap-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-[16px] border shadow-[0_14px_34px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.04)] ${toneClasses.iconWrap}`}
        >
          {tone === "danger" ? (
            <AlertTriangle size={14} />
          ) : tone === "primary" ? (
            <Sparkles size={14} />
          ) : (
            <BellRing size={14} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={`text-[11px] font-bold uppercase tracking-[0.24em] ${toneClasses.text}`}
          >
            {title}
          </p>
          <div
            className={`mt-2 h-px w-full bg-[linear-gradient(90deg,var(--tw-gradient-stops))] ${toneClasses.line}`}
          />
        </div>
      </div>
    );
  };

  const renderSocialAlertMessage = (
    alert: AlertEntity,
    message = alert.message,
  ) => message;

  const renderAlertItem = (alert: AlertEntity) => {
    const actorInfo = getActorInfo(alert);
    const meta = getSocialAlertMeta(alert);
    const actorHandle = getActorHandle(actorInfo);
    const actionMessage = getAlertActionMessage(alert, actorInfo);
    const isAggregatedAlert = Number(alert.metadata?.aggregatedCount || 0) > 1;
    const isDareOrTruth =
      alert.type === "DARE_RECEIVED" ||
      alert.type === "DARE_ACCEPTED" ||
      alert.type === "DARE_COMPLETED" ||
      alert.type === "DARE_PROOF_SUBMITTED" ||
      alert.type === "DARE_POSTED" ||
      alert.type === "DARE_APPROVED" ||
      alert.type === "DARE_REJECTED" ||
      alert.type === "DARE_REFUSED" ||
      alert.type === "TRUTH_RECEIVED" ||
      alert.type === "TRUTH_ANSWERED" ||
      alert.type === "DARE_FRIEND_ACTIVITY" ||
      alert.type === "TRUTH_FRIEND_ACTIVITY";

    const isClickable =
      typeof alert.metadata?.interactionKind === "string" ||
      isDareOrTruth ||
      alert.type === "COMMENT_RECEIVED" ||
      alert.type === "COMMENT_REPLY";
    return (
      <div
        key={`${alert.id}-${alert.createdAt}`}
        className={`alerts-row alerts-card flex items-start gap-3 py-3.5 ${!alert.isRead ? "alerts-row-unread" : ""} ${isClickable ? "cursor-pointer active:opacity-70" : ""}`}
        data-alert-type={alert.type}
        data-entity-id={alert.entityId || undefined}
        data-unread={!alert.isRead ? "true" : "false"}
        onClick={() => isClickable && handleAlertClick(alert)}
      >
        {/* Unread dot */}
        <div className="flex w-2.5 shrink-0 items-center justify-center self-center">
          {!alert.isRead && (
            <div className="h-[7px] w-[7px] rounded-full bg-[#4ade80] shadow-[0_0_7px_rgba(74,222,128,0.65)]" />
          )}
        </div>

        {/* Avatar + type badge */}
        <div className="alerts-avatar relative shrink-0">
          <Avatar
            src={actorInfo.avatar}
            alt={actorInfo.name}
            size="sm"
            userId={actorInfo.userId}
            username={actorInfo.username}
            disableRealtime
          />
          <div
            className={`absolute -bottom-1 -right-1 flex h-[20px] w-[20px] items-center justify-center rounded-full border border-[#090d09] shadow-[0_4px_10px_rgba(0,0,0,0.5)] [&_svg]:h-[10px] [&_svg]:w-[10px] ${meta.iconWrapClass}`}
          >
            {meta.icon}
          </div>
          {alert.metadata.isLive && (
            <div className="absolute -top-1 -right-1 h-3 w-3 animate-pulse rounded-full border-2 border-[#090d09] bg-[#4ade80]" />
          )}
        </div>

        {/* Text content */}
        <div className="alerts-copy min-w-0 flex-1">
          {alert.metadata?.circleName && <p className="text-[10px] font-bold text-[#86efac]">{alert.metadata.circleName}</p>}
          <p className="text-[13.5px] leading-[1.48] text-[#c4c8cf]">
            {isAggregatedAlert ? (
              <span>{renderSocialAlertMessage(alert, alert.message)}</span>
            ) : (
              <>
                <span className="font-bold text-white">{actorHandle}</span>{" "}
                <span>{renderSocialAlertMessage(alert, actionMessage)}</span>
              </>
            )}{" "}
            <span className="alerts-time text-[11px] font-medium text-[#475569]">
              {getTimeAgo(getAlertActivityTime(alert))}
            </span>
          </p>

          {/* Live duration inline */}
          {alert.metadata.isLive && alert.metadata.liveDuration && (
            <div className="mt-1 flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#4ade80]" />
              <span className="text-[11px] font-semibold text-[#4ade80]">
                {alert.metadata.liveDuration}
              </span>
            </div>
          )}

          {/* Comment quote */}
          {(alert.type === "COMMENT_RECEIVED" ||
            alert.type === "COMMENT_REPLY") &&
            alert.metadata.commentText && (
              <p className="mt-1.5 line-clamp-2 border-l-2 border-white/18 pl-2.5 text-[12px] leading-snug text-[#94a3b8]">
                {alert.metadata.commentText}
              </p>
            )}

          {/* Friend request actions */}
          {alert.type === "FRIEND_REQUEST" && (
            <div className="alerts-friend-actions mt-2.5 flex gap-2">
              {friendshipStatuses.get(alert.id) === "accepted" ? (
                <div className="rounded-xl border border-[#4ade80]/25 bg-[#4ade80]/10 px-3 py-1.5 text-[12px] font-semibold text-[#86efac]">
                  Friends ✓
                </div>
              ) : (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAcceptFriendRequest(alert.id, alert.entityId);
                    }}
                    className="rounded-xl bg-[linear-gradient(135deg,#4ade80,#22c55e)] px-4 py-1.5 text-[12px] font-bold text-black shadow-[0_6px_16px_rgba(74,222,128,0.22)] transition-all hover:brightness-105"
                  >
                    Accept
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRejectFriendRequest(alert.id, alert.entityId);
                    }}
                    className="rounded-xl border border-white/12 bg-white/5 px-4 py-1.5 text-[12px] font-semibold text-white/55 transition-colors hover:text-white/90"
                  >
                    Decline
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Right: post thumbnail or stacked like avatars */}
        {alert.type === "POST_LIKED" && alert.metadata.postThumbnail ? (
          <div className="alerts-thumbnail h-11 w-11 shrink-0 overflow-hidden rounded-[10px] border border-white/8">
            <img
              src={alert.metadata.postThumbnail}
              alt="Post"
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </div>
        ) : alert.type === "POST_LIKED" &&
          alert.metadata.allLikers?.length > 1 ? (
          <div className="flex shrink-0 -space-x-2 self-center">
            {alert.metadata.allLikers
              .slice(0, 3)
              .map((liker: any, i: number) => (
                <Avatar
                  key={i}
                  src={liker.avatar}
                  alt={liker.username}
                  size="xs"
                  userId={liker.userId}
                  username={liker.username}
                />
              ))}
            {alert.metadata.allLikers.length > 3 && (
              <div className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-[#191d19] text-[10px] font-bold text-[#94a3b8]">
                +{alert.metadata.allLikers.length - 3}
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  };

  // ── Render sus activity alert item with specialized UI ──
  /*
          {alert.type === "SUS_REPEATED_LIKES" && meta.tapCount && (
            <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-pink-400">
              <Heart size={10} fill="currentColor" />
              {meta.tapCount}× times
            </div>
          )}
          {alert.type === "SUS_PHOTO_VIEWS" && meta.viewCount && (
            <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-amber-400">
              <Eye size={10} />
              {meta.viewCount} views
            </div>
          )}
          {alert.type === "SUS_CLOSE_FRIEND_ACTIVITY" &&
            meta.interactionType && (
              <div className="mt-1 text-[11px] font-semibold text-yellow-300">
                {meta.interactionType === "commented"
                  ? "Left a comment"
                  : meta.interactionType === "repeated_like"
                    ? `${meta.tapCount || 0}× likes`
                    : meta.interactionType === "dedicated_story"
                      ? `Story dedicated to @${meta.targetUsername || "someone"}`
                      : `${meta.distinctLikedPosts || 0} posts liked`}
              </div>
            )}
          {alert.type === "SUS_CLOSE_FRIEND_ACTIVITY" && meta.commentText && (
            <p className="mt-1.5 line-clamp-2 border-l-2 border-yellow-400/25 pl-2.5 text-[12px] leading-snug text-[#94a3b8]">
              {meta.commentText}
            </p>
          )}
          {alert.type === "SUS_MENTION_TALKING" &&
            (meta.actorUsername || meta.otherUsername) && (
              <div className="mt-1 text-[11px] font-semibold text-purple-300">
                @{meta.actorUsername} &amp; @{meta.otherUsername}
                {meta.time ? ` · ${meta.time}` : ""}
              </div>
            )}
        </div>

        {(alert.type === "SUS_REPEATED_LIKES" ||
          alert.type === "SUS_PHOTO_VIEWS" ||
          alert.type === "SUS_CLOSE_FRIEND_ACTIVITY") &&
          (meta.postThumbnail || meta.storyThumbnail) && (
            <div className="alerts-thumbnail h-11 w-11 shrink-0 overflow-hidden rounded-[10px] border border-white/8">
              <img
                src={meta.postThumbnail || meta.storyThumbnail}
                alt={meta.storyThumbnail ? "Story" : "Post"}
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
          )}
      </div>
    );
  };

  */
  return (
    <div className="screen-container alerts-screen alerts-screen-premium flex flex-col bg-[radial-gradient(circle_at_50%_-12%,rgba(74,222,128,0.18),transparent_34%),radial-gradient(circle_at_12%_18%,rgba(14,165,233,0.12),transparent_28%),linear-gradient(180deg,#060806_0%,#0a0f0a_48%,#030403_100%)]">
      <style>{`
        .alerts-screen {
          font-family: var(--font-ui);
        }
        @keyframes alertsFloatIn {
          from { opacity: 0; transform: translateY(14px) scale(0.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes alertsSweep {
          from { transform: translateX(-120%); }
          to { transform: translateX(120%); }
        }
        @keyframes alertsSignalSweep {
          0% { transform: translateX(-125%); }
          42% { transform: translateX(125%); }
          100% { transform: translateX(125%); }
        }
        @keyframes alertsSignalPulse {
          0%, 100% { opacity: 0.56; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.08); }
        }
        .alerts-card {
          animation: alertsFloatIn 0.46s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .alerts-signal-card {
          animation: alertsFloatIn 0.42s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .alerts-signal-card::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.105), transparent);
          animation: alertsSignalSweep 6.8s ease-in-out infinite;
          pointer-events: none;
        }
        .alerts-signal-dot {
          animation: alertsSignalPulse 2.2s ease-in-out infinite;
        }
        .alerts-card::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.055), transparent);
          opacity: 0;
          transform: translateX(-120%);
          pointer-events: none;
        }
        .alerts-card:hover::after {
          animation: alertsSweep 1.4s ease-in-out;
          opacity: 1;
        }
        .alerts-section-header {
          animation: alertsFloatIn 0.42s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .alerts-screen-premium {
          --alerts-ink: #f2f4ef;
          --alerts-muted: #8b9288;
          --alerts-line: rgba(237, 241, 235, 0.075);
          --alerts-accent: #75d895;
          color: var(--alerts-ink);
          font-family: var(--font-ui);
          background:
            radial-gradient(circle at 22% 28%, rgba(255,255,255,0.015) 0 0.45px, transparent 0.6px) 0 0 / 8px 8px,
            radial-gradient(circle at 78% 63%, rgba(255,255,255,0.012) 0 0.4px, transparent 0.55px) 0 0 / 10px 10px,
            radial-gradient(circle at 50% -12%, rgba(117,216,149,0.07), transparent 31%),
            linear-gradient(180deg, #0b0c0b 0%, #080908 54%, #060706 100%) !important;
        }
        .alerts-header {
          border-color: var(--alerts-line) !important;
          background: rgba(9,10,9,0.91) !important;
          box-shadow: none !important;
          backdrop-filter: blur(22px) saturate(1.15);
          -webkit-backdrop-filter: blur(22px) saturate(1.15);
        }
        .alerts-header h1 {
          font-size: 28px;
          font-weight: 600;
          letter-spacing: -0.045em;
        }
        .alerts-header button[aria-label="Back"] {
          width: 40px;
          height: 40px;
          border: 0 !important;
          border-radius: 13px !important;
          background: transparent !important;
          box-shadow: none !important;
        }
        .alerts-header button[aria-label="Back"]:active {
          background: rgba(255,255,255,0.055) !important;
          transform: scale(0.94);
        }
        .alerts-mode-switch {
          gap: 3px !important;
          padding: 3px;
          border: 1px solid var(--alerts-line);
          border-radius: 16px;
          background: rgba(255,255,255,0.025);
        }
        .alerts-mode-button {
          width: 40px !important;
          height: 40px !important;
          border: 0 !important;
          border-radius: 12px !important;
          background: transparent !important;
          box-shadow: none !important;
          color: #8b9288 !important;
        }
        .alerts-mode-button[aria-pressed="true"] {
          background: rgba(117,216,149,0.11) !important;
          color: #9be5b2 !important;
          box-shadow: inset 0 0 0 1px rgba(117,216,149,0.12) !important;
        }
        .alerts-tabs {
          gap: 4px;
          border: 0 !important;
          border-radius: 15px !important;
          background: rgba(255,255,255,0.035) !important;
          box-shadow: none !important;
          padding: 3px !important;
        }
        .alerts-tabs button {
          min-height: 40px;
          border-radius: 12px !important;
          padding-block: 8px !important;
          background: transparent !important;
          box-shadow: none !important;
          color: #7e867c !important;
          font-size: 13px;
          font-weight: 600;
        }
        .alerts-tabs button[aria-pressed="true"] {
          background: rgba(237,241,235,0.09) !important;
          color: #f1f4ef !important;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.055) !important;
        }
        .alerts-tabs button[data-tone="sus"][aria-pressed="true"] {
          background: rgba(239,68,68,0.11) !important;
          color: #fca5a5 !important;
          box-shadow: inset 0 0 0 1px rgba(248,113,113,0.1) !important;
        }
        .alerts-content {
          width: min(100%, 520px);
          margin-inline: auto;
          padding: 14px 12px calc(var(--safe-area-bottom) + 2rem) !important;
          scrollbar-width: none;
        }
        .alerts-content::-webkit-scrollbar {
          display: none;
        }
        .alerts-summary {
          margin-bottom: 20px !important;
          border: 0 !important;
          border-radius: 20px !important;
          background: rgba(255,255,255,0.035) !important;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05) !important;
          padding: 13px 14px !important;
        }
        .alerts-summary::after {
          opacity: 0.32;
        }
        .alerts-summary > div:last-child > div:first-child {
          width: 44px !important;
          height: 44px !important;
          border: 0 !important;
          border-radius: 15px !important;
          box-shadow: none !important;
        }
        .alerts-summary p {
          font-weight: 500;
        }
        .alerts-summary > div:last-child > div:nth-child(2) > p:last-child {
          font-size: 14px;
          letter-spacing: -0.01em;
        }
        .alerts-section {
          margin-bottom: 23px !important;
        }
        .alerts-section-header {
          margin: 0 4px 8px !important;
          gap: 9px !important;
        }
        .alerts-section-header > div:first-child {
          width: 28px !important;
          height: 28px !important;
          border: 0 !important;
          border-radius: 10px !important;
          background: rgba(255,255,255,0.035) !important;
          box-shadow: none !important;
        }
        .alerts-section-header p {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: none;
        }
        .alerts-section-header > div:last-child > div {
          display: none;
        }
        .alerts-list {
          overflow: hidden;
          border-top: 1px solid var(--alerts-line);
        }
        .alerts-row {
          position: relative;
          gap: 11px !important;
          margin: 0;
          padding: 13px 8px !important;
          border-radius: 16px;
          transition: background-color 180ms ease, transform 180ms ease;
        }
        .alerts-row::after {
          display: none;
        }
        .alerts-row:hover {
          background: rgba(255,255,255,0.027);
        }
        .alerts-row:active {
          transform: scale(0.988);
          opacity: 0.86 !important;
        }
        .alerts-row-unread {
          background: linear-gradient(90deg, rgba(117,216,149,0.065), rgba(117,216,149,0.012) 62%, transparent);
        }
        .alerts-row-sus.alerts-row-unread {
          background: linear-gradient(90deg, rgba(248,113,113,0.07), rgba(248,113,113,0.012) 62%, transparent);
        }
        .alerts-avatar {
          margin-top: 1px;
        }
        .alerts-avatar > div:first-child,
        .alerts-avatar > span:first-child {
          box-shadow: 0 7px 18px rgba(0,0,0,0.24);
        }
        .alerts-copy > p:first-child {
          color: #c7cdc5;
          font-size: 13.5px;
          line-height: 1.43;
          letter-spacing: -0.006em;
        }
        .alerts-copy > p:first-child > span:first-child {
          font-weight: 600;
        }
        .alerts-time {
          margin-left: 2px;
          color: #686f66 !important;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .alerts-thumbnail {
          width: 48px !important;
          height: 48px !important;
          border: 0 !important;
          border-radius: 14px !important;
          background: #141614;
          box-shadow: 0 8px 20px rgba(0,0,0,0.24);
        }
        .alerts-thumbnail img {
          filter: saturate(0.94) contrast(1.02);
        }
        .alerts-friend-actions button,
        .alerts-friend-actions > div {
          min-height: 34px;
          border-radius: 11px !important;
          padding: 7px 13px !important;
          font-size: 12px;
          font-weight: 600;
        }
        /* Activity grammar: each alert gets a quiet, semantic accent instead of a card. */
        .alerts-row {
          --alert-accent: #75d895;
          position: relative;
          min-height: 72px;
          isolation: isolate;
        }
        .alerts-row::before {
          content: "";
          position: absolute;
          z-index: 2;
          left: 0;
          top: 14px;
          bottom: 14px;
          width: 2px;
          border-radius: 999px;
          background: var(--alert-accent);
          opacity: 0;
          transform: scaleY(.72);
          transition: opacity 180ms ease, transform 180ms ease;
        }
        .alerts-row[data-unread="true"]::before {
          opacity: .9;
          transform: scaleY(1);
        }
        .alerts-row[data-alert-type="POST_LIKED"] { --alert-accent: #f39ab0; }
        .alerts-row[data-alert-type="COMMENT_RECEIVED"],
        .alerts-row[data-alert-type="COMMENT_REPLY"] { --alert-accent: #73d9e6; }
        .alerts-row[data-alert-type="FRIEND_REQUEST"] { --alert-accent: #8de29d; }
        .alerts-row[data-alert-type^="DARE_"] { --alert-accent: #f4c66b; }
        .alerts-row[data-alert-type^="TRUTH_"] { --alert-accent: #a9a1ff; }
        .alerts-row[data-alert-type="FRIEND_ACCEPTED"] { --alert-accent: #79d8bd; }
        .alerts-row[data-alert-type="FRIEND_REQUEST"] .alerts-avatar > div:first-child {
          box-shadow: 0 0 0 1px rgba(141,226,157,.34), 0 8px 20px rgba(0,0,0,.24);
        }
        .alerts-row[data-alert-type^="DARE_"] .alerts-avatar > div:first-child {
          box-shadow: 0 0 0 1px rgba(244,198,107,.30), 0 8px 20px rgba(0,0,0,.24);
        }
        .alerts-row[data-alert-type] .alerts-avatar > div:nth-child(2) {
          border: 1px solid color-mix(in srgb, var(--alert-accent) 48%, transparent) !important;
          background: color-mix(in srgb, var(--alert-accent) 17%, #141614) !important;
          color: var(--alert-accent) !important;
          box-shadow: 0 4px 10px rgba(0,0,0,.22);
        }
        .alerts-copy > p:first-child {
          text-wrap: pretty;
        }
        .alerts-row .border-l-2 {
          border-left-color: color-mix(in srgb, var(--alert-accent) 55%, #303630) !important;
          background: color-mix(in srgb, var(--alert-accent) 8%, transparent) !important;
        }
        .alerts-row-sus {
          --alert-accent: #ff907e;
        }
        /* The lane explainer is a lightweight status strip, not a second card. */
        .alerts-summary {
          --summary-accent: #75d895;
          margin-bottom: 18px !important;
          padding: 8px 2px 16px !important;
          border: 0 !important;
          border-bottom: 1px solid rgba(255,255,255,.07) !important;
          border-radius: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
        }
        .alerts-summary--sus { --summary-accent: #ff907e; }
        .alerts-summary--dare { --summary-accent: #f4c66b; }
        .alerts-summary--social { --summary-accent: #75d895; }
        .alerts-summary::after {
          display: none !important;
        }
        .alerts-summary > div:first-child {
          display: none;
        }
        .alerts-summary > div:last-child {
          gap: 12px !important;
        }
        .alerts-summary > div:last-child > div:first-child {
          width: 42px !important;
          height: 42px !important;
          border: 1px solid color-mix(in srgb, var(--summary-accent) 42%, transparent) !important;
          border-radius: 15px !important;
          background: color-mix(in srgb, var(--summary-accent) 12%, #111511) !important;
          color: var(--summary-accent) !important;
          box-shadow: 0 8px 18px rgba(0,0,0,.18) !important;
        }
        .alerts-summary > div:last-child > div:nth-child(2) p:first-of-type {
          color: color-mix(in srgb, var(--summary-accent) 82%, #d7ded7) !important;
          font-size: 10px !important;
          letter-spacing: .13em !important;
        }
        .alerts-summary > div:last-child > div:nth-child(2) p:last-child {
          color: #c8d0c8 !important;
          font-size: 13px !important;
          font-weight: 500 !important;
        }
        .alerts-summary > div:last-child > div:last-child {
          min-width: 38px;
          padding-left: 8px;
          border-left: 1px solid rgba(255,255,255,.08);
        }
        .alerts-summary > div:last-child > div:last-child > div:first-child {
          color: var(--summary-accent) !important;
          font-size: 18px !important;
        }
        .alerts-summary > div:last-child > div:last-child > div:last-child {
          color: #69736a !important;
          font-size: 9px !important;
        }
        /* Entries breathe as a continuous feed; no divider rules between alerts. */
        .alerts-list,
        .alerts-list.divide-y {
          border-top: 0 !important;
        }
        .alerts-list.divide-y > :not([hidden]) ~ :not([hidden]) {
          border-top-width: 0 !important;
          border-top-color: transparent !important;
        }
        .alerts-row {
          border-top: 0 !important;
          border-bottom: 0 !important;
          margin-bottom: 4px;
          border-radius: 16px;
        }
        .alerts-empty {
          border: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
          padding-block: 54px !important;
        }
        .alerts-empty::after {
          display: none;
        }
        .alerts-empty > div:first-child {
          width: 66px !important;
          height: 66px !important;
          border: 0 !important;
          border-radius: 22px !important;
          background: rgba(117,216,149,0.075) !important;
          box-shadow: none !important;
        }
        .alerts-screen-premium button:focus-visible,
        .alerts-screen-premium [role="button"]:focus-visible {
          outline: 2px solid rgba(117,216,149,0.88);
          outline-offset: 3px;
        }
        @media (prefers-reduced-motion: reduce) {
          .alerts-card,
          .alerts-signal-card,
          .alerts-section-header,
          .alerts-signal-dot {
            animation: none !important;
          }
        }
      `}</style>
      {/* Header */}
      <div className="alerts-header safe-area-top sticky top-0 z-10 overflow-hidden border-b border-white/8 bg-[radial-gradient(circle_at_50%_-40%,rgba(74,222,128,0.18),transparent_58%),linear-gradient(180deg,rgba(10,15,11,0.98)_0%,rgba(4,7,5,0.94)_100%)] shadow-[0_20px_54px_rgba(0,0,0,0.38)] backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.78),rgba(74,222,128,0))]" />
        <div className="px-4 pb-2 pt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <button
              onClick={onBack}
              className="z-10 flex h-11 w-11 items-center justify-center rounded-[18px] border border-white/8 bg-white/[0.04] text-[#94a3b8] shadow-[0_16px_38px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-[#4ade80]/35 hover:bg-[#4ade80]/10 hover:text-white"
              aria-label="Back"
            >
              <ArrowLeft size={19} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-[30px] font-black leading-none tracking-tight text-white">
                  Alerts
                </h1>
              </div>
            </div>
            <div className="alerts-mode-switch flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setAlertMode("dare");
                  setDareAlertTab("personal");
                }}
                className={`alerts-mode-button relative flex h-[52px] w-[52px] items-center justify-center rounded-[20px] border text-lg font-black shadow-[0_16px_38px_rgba(0,0,0,0.3)] transition-colors ${
                  alertMode === "dare"
                    ? "border-[#4ade80]/28 bg-[#4ade80]/12 text-[#86efac]"
                    : "border-white/8 bg-white/[0.04] text-[#94a3b8] hover:border-[#4ade80]/24 hover:text-white"
                }`}
                aria-label="Open dare alert organizer"
                aria-pressed={alertMode === "dare"}
              >
                D
                {dareUnreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full border border-black bg-[#4ade80] px-1 text-[9px] font-black leading-none text-black shadow-[0_0_16px_rgba(74,222,128,0.42)]">
                    {dareUnreadCount > 9 ? "9+" : dareUnreadCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setAlertMode("main")}
                className={`alerts-mode-button relative flex h-[52px] w-[52px] items-center justify-center rounded-[20px] border shadow-[0_16px_38px_rgba(0,0,0,0.3)] transition-colors ${
                  alertMode === "main"
                    ? "border-[#4ade80]/24 bg-white/[0.04] text-[#4ade80]"
                    : "border-white/8 bg-white/[0.04] text-[#94a3b8] hover:border-[#4ade80]/24 hover:text-white"
                }`}
                aria-label="Open main alerts"
                aria-pressed={alertMode === "main"}
              >
                <BellRing size={22} />
                {mainUnreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full border border-black bg-[#4ade80] px-1 text-[9px] font-black leading-none text-black shadow-[0_0_16px_rgba(74,222,128,0.42)]">
                    {mainUnreadCount > 9 ? "9+" : mainUnreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="px-4 pb-3.5">
          <div className="alerts-tabs flex rounded-full border border-white/8 bg-[linear-gradient(180deg,rgba(21,27,21,0.94),rgba(10,14,10,0.98))] p-1.5 shadow-[0_24px_70px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.05)]">
            {alertMode === "main" ? (
              <>
                <button
                  onClick={() => setActiveTab("social")}
                  className={`flex-1 rounded-full px-4 py-3 text-sm font-extrabold transition-all duration-200 ${
                    activeTab === "social"
                      ? "bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-black shadow-[0_10px_28px_rgba(74,222,128,0.32)]"
                      : "text-[#64748b] hover:text-white"
                  }`}
                  aria-pressed={activeTab === "social"}
                >
                  Social
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setDareAlertTab("personal")}
                  className={`flex-1 rounded-full px-4 py-3 text-sm font-extrabold transition-all duration-200 ${
                    dareAlertTab === "personal"
                      ? "bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-black shadow-[0_10px_28px_rgba(74,222,128,0.32)]"
                      : "text-[#64748b] hover:text-white"
                  }`}
                  aria-pressed={dareAlertTab === "personal"}
                >
                  Personal
                </button>
                <button
                  onClick={() => setDareAlertTab("friends")}
                  className={`flex-1 rounded-full px-4 py-3 text-sm font-extrabold transition-all duration-200 ${
                    dareAlertTab === "friends"
                      ? "bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-black shadow-[0_10px_28px_rgba(74,222,128,0.32)]"
                      : "text-[#64748b] hover:text-white"
                  }`}
                  aria-pressed={dareAlertTab === "friends"}
                >
                  Friends
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="alerts-content flex-1 overflow-y-auto px-4 pb-[calc(var(--safe-area-bottom)+2rem)] pt-4">
        <div
          className={`alerts-summary alerts-signal-card ${
            alertMode === "dare" ? "alerts-summary--dare" : "alerts-summary--social"
          } relative mb-4 overflow-hidden rounded-[28px] border px-4 py-3.5 shadow-[0_18px_44px_rgba(0,0,0,0.34),0_0_28px_rgba(74,222,128,0.08),inset_0_1px_0_rgba(255,255,255,0.05)] ${
            "border-[#4ade80]/22 bg-[radial-gradient(circle_at_18%_-18%,rgba(74,222,128,0.16),transparent_34%),radial-gradient(circle_at_92%_16%,rgba(14,165,233,0.12),transparent_32%),linear-gradient(180deg,rgba(22,28,23,0.98),rgba(8,12,9,0.98))]"
          }`}
        >
          <div
            className={`pointer-events-none absolute inset-x-8 top-0 z-[1] h-px ${
              "bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.82),rgba(14,165,233,0.42),rgba(74,222,128,0))]"
            }`}
          />
          <div className="relative z-[1] flex items-center gap-3">
            <div
              className={`flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-[22px] border shadow-[0_14px_34px_rgba(74,222,128,0.1)] ${
                "border-[#4ade80]/20 bg-[#4ade80]/10 text-[#86efac]"
              }`}
            >
              {alertMode === "dare" ? (
                <Target size={22} strokeWidth={2.5} />
              ) : (
                <BellRing size={22} strokeWidth={2.5} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`alerts-signal-dot h-2 w-2 shrink-0 rounded-full ${
                    "bg-[#4ade80] shadow-[0_0_14px_rgba(74,222,128,0.55)]"
                  }`}
                />
                <p
                  className={`truncate text-[11px] font-black uppercase tracking-[0.16em] ${
                    "text-[#86efac]"
                  }`}
                >
                  {currentLaneLabel}
                </p>
              </div>
              <p className="text-[15px] font-black leading-snug text-white">
                {currentLaneCaption}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <div
                className={`text-[22px] font-black leading-none ${
                  "text-[#4ade80]"
                }`}
              >
                {currentUnreadCount}
              </div>
              <div className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#94a3b8]">
                unread
              </div>
            </div>
          </div>
        </div>
        {alertMode === "dare" ? (
          <>
            {dareAlertTab === "personal" && personalDareToday.length > 0 && (
              <div className="alerts-section mb-6">
                {renderSectionHeader("Today", "primary")}
                <div className="alerts-list divide-y divide-white/[0.06]">
                  {personalDareToday.map(renderAlertItem)}
                </div>
              </div>
            )}
            {dareAlertTab === "personal" &&
              personalDareYesterday.length > 0 && (
                <div className="alerts-section mb-6">
                  {renderSectionHeader("Yesterday", "muted")}
                  <div className="alerts-list divide-y divide-white/[0.06]">
                    {personalDareYesterday.map(renderAlertItem)}
                  </div>
                </div>
              )}
            {dareAlertTab === "friends" && friendChallengeToday.length > 0 && (
              <div className="alerts-section mb-6">
                {renderSectionHeader("Today", "primary")}
                <div className="alerts-list divide-y divide-white/[0.06]">
                  {friendChallengeToday.map(renderAlertItem)}
                </div>
              </div>
            )}
            {dareAlertTab === "friends" &&
              friendChallengeYesterday.length > 0 && (
                <div className="alerts-section mb-6">
                  {renderSectionHeader("Yesterday", "muted")}
                  <div className="alerts-list divide-y divide-white/[0.06]">
                    {friendChallengeYesterday.map(renderAlertItem)}
                  </div>
                </div>
              )}
          </>
        ) : (
          <>
            {socialToday.length > 0 && (
              <div className="alerts-section mb-6">
                {renderSectionHeader("Today", "primary")}
                <div className="alerts-list divide-y divide-white/[0.06]">
                  {socialToday.map(renderAlertItem)}
                </div>
              </div>
            )}
            {socialYesterday.length > 0 && (
              <div className="alerts-section mb-6">
                {renderSectionHeader("Yesterday", "muted")}
                <div className="alerts-list divide-y divide-white/[0.06]">
                  {socialYesterday.map(renderAlertItem)}
                </div>
              </div>
            )}
          </>
        )}
        {/* {susToday.length > 0 && (
              <div className="alerts-section mb-6">
                {renderSectionHeader("Today", "danger")}
                <div className="alerts-list divide-y divide-white/[0.06]">
                  {susToday.map(renderSusAlertItem)}
                </div>
              </div>
            )}
            {susYesterday.length > 0 && (
              <div className="alerts-section mb-6">
                {renderSectionHeader("Yesterday", "muted")}
                <div className="alerts-list divide-y divide-white/[0.06]">
                  {susYesterday.map(renderSusAlertItem)}
                </div>
              </div>
            )}
          </>
        )} */}

        {hasMore && olderCursor && (
          <button
            type="button"
            onClick={() => void loadOlderAlerts()}
            disabled={loading}
            className="my-4 min-h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {loading ? "Loading older alerts..." : "Load older alerts"}
          </button>
        )}
        {currentAlerts.length === 0 && (
            <div className="alerts-empty alerts-card rounded-[34px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,24,18,0.98),rgba(7,10,8,0.98))] px-6 py-12 text-center shadow-[0_24px_70px_rgba(0,0,0,0.44),inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(74,222,128,0.12),rgba(255,255,255,0.03))] shadow-[0_18px_48px_rgba(74,222,128,0.1)]">
                {alertMode === "dare" ? (
                  <span className="text-[30px] font-black text-[#86efac]">
                    D
                  </span>
                ) : activeTab === "social" ? (
                  <Heart size={28} className="text-[#86efac]" />
                ) : (
                  <Eye size={28} className="text-red-300" />
                )}
              </div>
              <p className="mb-2 text-lg font-bold text-white">
                {alertMode === "dare"
                  ? dareAlertTab === "personal"
                    ? "No personal dare alerts"
                    : "No friends challenge alerts"
                  : activeTab === "social"
                    ? "No alerts yet"
                    : "No suspicious activity detected"}
              </p>
              <p className="mx-auto max-w-xs text-sm leading-relaxed text-[#94a3b8]">
                {alertMode === "dare"
                  ? dareAlertTab === "personal"
                    ? "Dare and truth workflow alerts will appear here."
                    : "Dares and truths between mutual friends will appear here."
                  : activeTab === "social"
                    ? "New reactions, comments, and requests will appear here."
                    : "Nothing suspicious has surfaced yet."}
              </p>
            </div>
          )}
      </div>
    </div>
  );
}
