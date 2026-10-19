//feed screen
"use client";

import {
  Fragment,
  startTransition,
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  useLayoutEffect,
  useImperativeHandle,
  forwardRef,
  memo,
  type PointerEvent,
} from "react";
import {
  Heart,
  MessageCircle,
  Plus,
  MessageSquare,
  Send,
  Volume2,
  X,
  Music,
  Search,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Gift,
  UserRound,
  ImagePlus,
  Check,
  Type,
  Wand2,
  Sparkles,
  Play,
  PauseCircle,
  MoreHorizontal,
  Pencil,
  Undo2,
  Redo2,
  Palette,
  AlignCenter,
  ChevronDown,
  ArrowRight,
  SlidersHorizontal,
  Target,
  Trophy,
  Users,
  Scale,
  Bookmark,
  EyeOff,
  Flag,
  UserMinus,
  TrendingUp,
  Zap,
  Info,
} from "lucide-react";
import { Avatar } from "../ui/Avatar";
import { LikeTapBadge } from "../ui/LikeTapBadge";
import { CommentSection, type CommentItem } from "../ui/CommentSection";
import { useMessagingStore } from "../../stores/useMessagingStore";
import { usePostsStore, type FeedPost } from "../../stores/usePostsStore";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { useStoryStore } from "../../stores/useStoryStore";
import { useContentStore } from "../../stores/useContentStore";
import type {
  DarePost,
  TruthPost,
} from "../../middleware/adapters/data-adapters";
import {
  StoryDTO,
  CreateStoryDTO,
  StoryType,
  storyService,
} from "../../middleware/services/story.service";
import { formatTimeAgo } from "../../utils/timeFormat";
import {
  friendsService,
  type Friend,
} from "../../middleware/services/friends.service";
import { useProfileDataStore } from "../../stores/profileDataStore";
import { useAlertStore } from "../../stores/useAlertStore";
import { useJailStore } from "../../stores/useJailStore";
import { loadDramaFeed } from "../../stores/dramaBackend";
import {
  usePredictionStore,
  type PredictionPost,
} from "../../stores/usePredictionStore";
import { useDealStore, type DealPost } from "../../stores/useDealStore";
import {
  useDramaStore,
  type CustomPost,
  type PromisePost,
  type RumourPost,
} from "../../stores/useDramaStore";
import { useVerdictsStore } from "../../stores/useVerdictsStore";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import type { VerdictChoice, VerdictDTO } from "../../types/verdict";
import { commentLikePersistence } from "../../utils/commentLikePersistence";
import { createFeedLikeFeedback, feedHeartColor, likeDanceVariant, LIKE_DANCE_INTERVAL } from "../../utils/feedLikeEffects";
import { StoryViewer } from "../app/StoryViewer";
import { CommunityChallengePreviewScreen } from "./CommunityChallengePreviewScreen";
import { ChallengeHubScreen } from "./ChallengeHubScreen";
import { DareEventsScreen } from "./DareEventsScreen";
import { RoastJailScreen } from "./RoastJailScreen";
import { FriendshipCourtScreen } from "./FriendshipCourtScreen";
import { useCirclesStore } from "@/stores/useCirclesStore";
import { CircleJailScreen } from "./CircleJailScreen";
import {
  COMMUNITY_CHALLENGES,
  getCommunityChallengeTitle,
  type CommunityChallenge,
} from "./communityChallengeData";
import {
  communityChallengeService,
  type CommunityChallengeSummary,
} from "../../middleware/services/community-challenge.service";
import {
  circleService,
  type CircleRecord,
} from "../../middleware/services/circle.service";
import { storyReactionService } from "../../middleware/services/story-reaction.service";
import alertService from "../../middleware/services/alert.service.new";
import {
  createGeneratedStoryMusicPlayer,
  STORY_FILTER_PRESETS,
  STORY_MUSIC_PRESETS,
  getStoryFilterPreset,
  getStoryMusicPreset,
  type StoryFilterId,
} from "../../utils/storyEnhancements";
import {
  buildSharedPostPayload,
  buildSharedStoryPayload,
  encodeSharedPostPayload,
  encodeSharedStoryPayload,
  SHARED_POST_FALLBACK_TEXT,
} from "../../utils/sharedPostMessage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UserLikeEntry {
  userId: string;
  name: string;
  username: string;
  avatar: string;
  tapCount: number;
}

interface HeartBurst {
  id: number;
  x: number;
  y: number;
  scale: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOUBLE_TAP_DELAY = 320;
const BURST_LIFETIME = 950;
const LIKE_MILESTONE_CELEBRATION_MS = 8_200;
const LIKE_PREVIEW_BATCH_SIZE = 12;
const HEART_SIZES = [52, 68, 44, 60, 56];
const LIKE_MILESTONE_HEARTS = Array.from({ length: 28 }, (_, index) => ({
  left: 28 + ((index * 37) % 45),
  size: 8 + ((index * 7) % 8),
  delay: 3600 + (index % 14) * 90 + Math.floor(index / 14) * 380,
  duration: 900 + ((index * 83) % 360),
  drift: -10 + ((index * 17) % 21),
  driftMid: 4 - ((index * 11) % 9),
  rotate: -28 + ((index * 29) % 57),
  rotateMid: 12 - ((index * 19) % 25),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const totalLikes = (post: FeedPost) => {
  if (typeof post.likes_count === "number") {
    return post.likes_count;
  }
  return Object.keys(getLikesByUser(post)).length;
};

const getLikesByUser = (post?: FeedPost | null) => post?.likesByUser || {};

const totalLikeTaps = (post: FeedPost) =>
  Object.values(getLikesByUser(post)).reduce(
    (sum, entry) => sum + entry.tapCount,
    0,
  );

const iLiked = (post: FeedPost, currentUserId: string) =>
  (getLikesByUser(post)[currentUserId]?.tapCount ?? 0) > 0;

const formatNumber = (n: number | undefined) =>
  n === undefined || n === 0
    ? "0"
    : n >= 1000
      ? `${(n / 1000).toFixed(1)}k`
      : n.toString();

const stripAtSymbol = (username?: string) =>
  (username || "unknown").replace(/^@/, "");

const getLikeEntryName = (entry: UserLikeEntry) =>
  stripAtSymbol(entry.username).trim() || entry.name?.trim() || "Someone";

const isDisplayableLikeEntry = (entry: UserLikeEntry) => {
  const name = entry.name?.trim().toLowerCase();
  const username = stripAtSymbol(entry.username).trim().toLowerCase();

  return (
    entry.tapCount > 0 &&
    Boolean(entry.userId) &&
    Boolean(name || username) &&
    !["anonymous", "unknown", "someone"].includes(name || "") &&
    !["anonymous", "unknown", "someone"].includes(username)
  );
};

const getTopLikeTapper = (
  post: FeedPost,
  optimisticLike?: UserLikeEntry,
) => {
  const persistedLikes = getLikesByUser(post);
  const persistedOptimisticUserLike = optimisticLike
    ? persistedLikes[optimisticLike.userId]
    : undefined;
  const mergedOptimisticLike = optimisticLike
    ? {
        ...persistedOptimisticUserLike,
        ...optimisticLike,
        tapCount: Math.max(
          optimisticLike.tapCount,
          persistedOptimisticUserLike?.tapCount || 0,
        ),
      }
    : undefined;
  const likesByUser = {
    ...persistedLikes,
    ...(mergedOptimisticLike
      ? { [mergedOptimisticLike.userId]: mergedOptimisticLike }
      : {}),
  };

  return Object.values(likesByUser)
    .filter(isDisplayableLikeEntry)
    .sort((a, b) => b.tapCount - a.tapCount)[0];
};

const getNumericPostMeta = (post: FeedPost, keys: string[]) => {
  const data = post as FeedPost & Record<string, unknown>;

  for (const key of keys) {
    const value = data[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, value);
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return Math.max(0, parsed);
    }
  }

  return 0;
};

const getPostSparkParts = (post: FeedPost) =>
  [
    {
      label: "predictions",
      singular: "prediction",
      tone: "text-[#7dd3fc]",
      count: getNumericPostMeta(post, [
        "startedPredictions",
        "started_predictions",
        "predictionsStarted",
        "predictions_started",
        "predictionCount",
        "prediction_count",
        "predictionsCount",
        "predictions_count",
      ]),
    },
    {
      label: "rumours",
      singular: "rumour",
      tone: "text-[#f0abfc]",
      count: getNumericPostMeta(post, [
        "startedRumours",
        "startedRumors",
        "started_rumours",
        "started_rumors",
        "rumoursStarted",
        "rumorsStarted",
        "rumourCount",
        "rumorCount",
        "rumours_count",
        "rumors_count",
      ]),
    },
  ];

const getFeedPostCaption = (post: FeedPost) => {
  const postData = post as FeedPost & Record<string, unknown>;
  const candidates = [post.content, postData.body, postData.caption, postData.text];

  return (
    candidates.find(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    )?.trim() || ""
  );
};

const getStoryCreatedAtTime = (story: StoryDTO) => {
  const createdAt = new Date(story.createdAt).getTime();
  return Number.isFinite(createdAt) ? createdAt : 0;
};

const sortStoriesForPlayback = (stories: StoryDTO[]) =>
  [...stories].sort((a, b) => {
    const timeDifference = getStoryCreatedAtTime(a) - getStoryCreatedAtTime(b);
    return timeDifference || a.id.localeCompare(b.id);
  });

const STORY_REPLY_PAYLOAD_URL_LIMIT = 7000;
const STORY_REPLY_ENCODED_PAYLOAD_LIMIT = 15000;
const STORY_TEXT_COLORS = [
  "#ffffff",
  "#4ade80",
  "#facc15",
  "#777777",
  "#38bdf8",
];
const STORY_TEXT_FONTS = ["Bubble", "Deco", "Squeeze", "Typewriter", "Classic"];
const STORY_TEXT_SIZE_MIN = 16;
const STORY_TEXT_SIZE_MAX = 72;
const STORY_BRUSHES = ["Pen", "Neon", "Marker", "Chalk"] as const;
const STORY_TEXT_VERTICAL_SNAP_THRESHOLD = 2.4;
const STORY_MEDIA_VERTICAL_SNAP_THRESHOLD = 18;

type StoryComposerStage = "audience" | "capture" | "editor";
type StoryGallerySnap = 25 | 60 | 100;
type StoryBrushId = (typeof STORY_BRUSHES)[number];

type FeedStickmanProps = {
  label: string;
  avatar?: string;
  accent: string;
  placement: "top" | "bottom";
  animate?: boolean;
};

const TEMP_FEED_STICKMEN = [
  { label: "mock 01", accent: "#4ade80", placement: "bottom" as const },
  { label: "mock 02", accent: "#38bdf8", placement: "top" as const },
  { label: "mock 03", accent: "#fb7185", placement: "bottom" as const },
  { label: "mock 04", accent: "#facc15", placement: "top" as const },
  { label: "mock 05", accent: "#c084fc", placement: "bottom" as const },
  { label: "mock 06", accent: "#4ade80", placement: "top" as const },
  { label: "mock 07", accent: "#38bdf8", placement: "bottom" as const },
  { label: "mock 08", accent: "#fb7185", placement: "top" as const },
];

function FeedStickman({
  label,
  avatar,
  accent,
  placement,
  animate = true,
}: FeedStickmanProps) {
  const [failedAvatarSrc, setFailedAvatarSrc] = useState<string | null>(null);
  const avatarSrc = typeof avatar === "string" ? avatar.trim() : "";
  const showAvatar = Boolean(avatarSrc) && avatarSrc !== failedAvatarSrc;
  const motionVariant = Array.from(label).reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  ) % 4;

  return (
    <div
      className={`feed-stickman chat-stickman-motion feed-stickman-${placement}`}
      data-animated={animate}
      data-hand-motion={motionVariant}
      aria-hidden="true"
    >
      <div
        className="chat-stickman-head flex items-center justify-center overflow-hidden rounded-full border-2 bg-[#101611] text-[13px] font-black text-white"
        style={{ borderColor: accent, width: "80px", height: "80px" }}
      >
        {showAvatar ? (
          <img src={avatarSrc} alt="" className="h-full w-full object-cover" onError={() => setFailedAvatarSrc(avatarSrc)} />
        ) : (
          <span className="chat-stickman-face" />
        )}
      </div>
      <div className="chat-stickman-body relative mt-[-1px]" style={{ width: "38px", height: "38px" }}>
        <span className="feed-story-spine" />
        <span className="feed-story-arm feed-story-arm-left" />
        <span className="feed-story-arm feed-story-arm-right" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

function smoothSnapToCenter(value: number, center: number, threshold: number) {
  const distance = value - center;
  const absoluteDistance = Math.abs(distance);
  if (absoluteDistance > threshold) {
    return { value, snapped: false };
  }

  const closeness = 1 - absoluteDistance / threshold;
  const pull = 0.38 + closeness * 0.42;
  const snappedValue = value - distance * pull;

  return {
    value:
      Math.abs(snappedValue - center) < threshold * 0.08
        ? center
        : snappedValue,
    snapped: true,
  };
}

async function createStoryReplyPreviewUrl(story: StoryDTO): Promise<string> {
  const mediaUrl = story.media.url;
  if (!mediaUrl) return "";

  if (!mediaUrl.startsWith("data:")) {
    return mediaUrl.length <= STORY_REPLY_PAYLOAD_URL_LIMIT ? mediaUrl : "";
  }

  if (story.media.type !== "image") {
    return "";
  }

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const maxWidth = 120;
        const scale = Math.min(1, maxWidth / image.width);
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve("");
          return;
        }
        ctx.drawImage(image, 0, 0, width, height);
        const thumbnail = canvas.toDataURL("image/jpeg", 0.42);
        resolve(
          thumbnail.length <= STORY_REPLY_PAYLOAD_URL_LIMIT ? thumbnail : "",
        );
      } catch (error) {
        console.error("Failed to create story reply preview:", error);
        resolve("");
      }
    };
    image.onerror = () => resolve("");
    image.src = mediaUrl;
  });
}

// ---------------------------------------------------------------------------
// HeartBurstLayer
// ---------------------------------------------------------------------------

function HeartBurstLayer({ bursts, color }: { bursts: HeartBurst[]; color: string }) {
  return (
    <div
      className="absolute inset-0 z-10 overflow-hidden pointer-events-none"
      style={{ pointerEvents: "none" }}
    >
      {bursts.map((burst) => {
        const size = HEART_SIZES[burst.id % HEART_SIZES.length];
        return (
          <div
            key={burst.id}
            className="feed-heart-burst"
            style={{
              position: "absolute",
              left: burst.x - size / 2,
              top: burst.y - size / 2,
              width: size,
              height: size,
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: -size * 0.6,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${color}60 0%, transparent 68%)`,
                animation: `hbGlow ${BURST_LIFETIME}ms ease-out forwards`,
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: -4,
                borderRadius: "50%",
                border: `2px solid ${color}80`,
                transition: "border-color 650ms ease",
                animation: `hbRing ${BURST_LIFETIME * 0.75}ms ease-out forwards`,
              }}
            />
            <div
              style={{
                animation: `hbFloat ${BURST_LIFETIME}ms cubic-bezier(0.22, 1, 0.36, 1) forwards`,
                transformOrigin: "center bottom",
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill={color}
                width={size}
                height={size}
                style={{
                  transition: "fill 650ms ease, filter 650ms ease",
                  filter: `drop-shadow(0 0 ${size * 0.18}px ${color}dd) drop-shadow(0 2px 6px #0008)`,
                  transform: `scale(${burst.scale})`,
                  transformOrigin: "center",
                }}
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PostSkeleton — shimmer placeholder while posts load
// ---------------------------------------------------------------------------

function PostSkeleton() {
  return (
    <div className="feed-post-skeleton relative overflow-hidden rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,22,18,0.97),rgba(6,9,8,0.99))] shadow-[0_22px_62px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.05)] animate-pulse">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.68),rgba(14,165,233,0.38),rgba(74,222,128,0))]" />
      {/* Header skeleton */}
      <div className="flex items-center gap-3 px-3 pt-3 pb-2">
        <div className="h-[42px] w-[42px] rounded-full bg-[#1a2a1a]/60 ring-2 ring-[#4ade80]/20" />
        <div className="min-w-0 flex-1">
          <div className="h-4 w-28 bg-[#1a2a1a]/60 rounded mb-1.5" />
          <div className="h-3 w-20 bg-[#1a2a1a]/50 rounded" />
        </div>
      </div>
      {/* Media skeleton */}
      <div className="px-1">
        <div
          className="w-full bg-[#0a120a]/80 rounded-3xl"
          style={{ height: "525px" }}
        />
      </div>
      {/* Actions skeleton */}
      <div className="px-3 pt-3">
        <div className="flex items-center justify-between gap-2 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(21,27,21,0.92),rgba(10,14,10,0.96))] px-4 py-3">
          <div className="h-[42px] flex-1 bg-[#1a2a1a]/50 rounded-full" />
          <div className="h-[42px] flex-1 bg-[#1a2a1a]/50 rounded-full" />
          <div className="h-[42px] w-[42px] bg-[#1a2a1a]/50 rounded-full" />
        </div>
      </div>
      {/* Caption skeleton */}
      <div className="px-4 pt-3 pb-5">
        <div className="h-4 w-3/4 bg-[#1a2a1a]/60 rounded mb-2" />
        <div className="h-3 w-24 bg-[#1a2a1a]/50 rounded" />
      </div>
    </div>
  );
}

const COMMUNITY_RAIL_REPEAT_EVERY = 12;
const SOCIAL_DARES_RAIL_FIRST_INSERT_AFTER = 3;
const TRUTHS_RAIL_FIRST_INSERT_AFTER = 6;
const COMMUNITY_RAIL_FIRST_INSERT_AFTER = 9;
const SOCIAL_CONTENT_RAIL_REPEAT_EVERY = 12;
const VERDICT_CARD_FIRST_INSERT_AFTER = 4;
const VERDICT_CARD_REPEAT_EVERY = 5;

const shouldShowRailAfterPost = (
  postIndex: number,
  totalPosts: number,
  firstInsertAfter: number,
  repeatEvery: number,
) => {
  const visiblePostNumber = postIndex + 1;
  if (totalPosts < firstInsertAfter) return false;
  if (visiblePostNumber === firstInsertAfter) return true;
  if (visiblePostNumber < firstInsertAfter) return false;
  return (visiblePostNumber - firstInsertAfter) % repeatEvery === 0;
};

const getCreatedAtMs = (createdAt?: string) => {
  if (!createdAt) return 0;
  const parsed = new Date(createdAt).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const getTruthPreviewText = (truth: TruthPost) =>
  truth.answer?.trim() || truth.question;

const getTruthRailActor = (truth: TruthPost) =>
  truth.receiver || truth.challenger;

const getTruthRailAction = (truth: TruthPost) =>
  truth.answer?.trim() ? "answered" : "was asked";

const getCommunityRailJoinPreviewText = (challenges: CommunityChallenge[]) => {
  const joinedUsers = challenges
    .flatMap((challenge) => challenge.joinPreview || [])
    .filter((user, index, users) => {
      return (
        user?.id &&
        users.findIndex((candidate) => candidate.id === user.id) === index
      );
    })
    .slice(0, 3);

  if (joinedUsers.length === 0) return "Open now";

  const names = joinedUsers.map(
    (user) => user.username || user.displayName || "Someone",
  );

  if (names.length === 1) return `${names[0]} joined recently`;
  if (names.length === 2) return `${names[0]} and ${names[1]} joined recently`;
  return `${names[0]}, ${names[1]} and ${names[2]} joined recently`;
};

function CommunityDareFeedRail({
  challenges,
  joinedChallengeIds,
  onPreview,
  onExploreAll,
}: {
  challenges: CommunityChallenge[];
  joinedChallengeIds: Set<string>;
  onPreview: (challenge: CommunityChallenge) => void;
  onExploreAll: () => void;
}) {
  const displayChallenges = challenges.slice(0, 5);
  const joinPreviewText = getCommunityRailJoinPreviewText(displayChallenges);

  return (
    <section
      aria-label="Community dares"
      className="feed-editorial-rail relative overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,23,18,0.94),rgba(7,10,8,0.98))] py-3 shadow-[0_16px_38px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.055)]"
    >
      <style>{`
        .community-feed-rail::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.16),transparent)]" />
      <div className="mb-3 flex items-center justify-between gap-3 px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-white/[0.055] text-white/82 shadow-[0_10px_24px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.08)]">
              <Sparkles size={16} fill="currentColor" strokeWidth={0} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-black uppercase tracking-[0.13em] text-white/88">
                Community dares
              </p>
              <p className="truncate text-xs font-semibold text-white/38">
                {joinPreviewText}
              </p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onExploreAll}
          className="app-pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/76 transition-colors hover:border-white/18 hover:text-white"
          aria-label="Explore community dares"
        >
          <ArrowRight size={16} />
        </button>
      </div>

      <div
        className="community-feed-rail flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1"
        style={{
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          scrollPaddingInline: "16px",
        }}
      >
        {displayChallenges.map((challenge) => {
          const challengeTitle = getCommunityChallengeTitle(challenge);
          const isJoined = joinedChallengeIds.has(challenge.id);
          const hasStarted = challenge.batchStatus === "started";

          return (
            <button
              key={challenge.id}
              type="button"
              onClick={() => onPreview(challenge)}
              className="feed-rail-card app-pressable relative flex h-[228px] w-[148px] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-[24px] border text-left shadow-[0_18px_40px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.06)] transition-transform active:scale-[0.985]"
              style={{
                borderColor: `${challenge.accent}38`,
                background:
                  "linear-gradient(180deg, rgba(10,15,11,0.98), rgba(5,8,6,0.99))",
              }}
              aria-label={`Open ${challengeTitle}`}
            >
              {challenge.imageUrl && (
                <img
                  src={challenge.imageUrl}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{
                    objectPosition: challenge.imagePosition || "center",
                  }}
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              )}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                style={{
                  background: challenge.imageUrl
                    ? "linear-gradient(180deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.22) 38%, rgba(0,0,0,0.82) 100%)"
                    : challenge.banner,
                }}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-8 -top-12 h-28 w-28 rounded-full opacity-30 blur-2xl"
                style={{ backgroundColor: challenge.accent }}
              />
              <span className="relative z-[1] m-2.5 inline-flex w-fit items-center rounded-full border border-white/12 bg-black/42 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white/84 shadow-[0_10px_22px_rgba(0,0,0,0.28)] backdrop-blur-md">
                {hasStarted && !isJoined
                  ? "Wait next batch"
                  : isJoined
                    ? "Joined"
                    : challenge.durationLabel}
              </span>
              <div className="relative z-[1] mt-auto p-3">
                <span className="mb-2 inline-flex rounded-full border border-[#4ade80]/18 bg-[#4ade80]/12 px-2 py-0.5 text-[8.5px] font-black uppercase tracking-[0.12em] text-[#bbf7d0]">
                  Dare official
                </span>
                <p className="feed-rail-title line-clamp-4 text-[14px] font-black uppercase leading-[1.08] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.65)]">
                  {challengeTitle}
                </p>
                <p className="mt-1.5 truncate text-[10px] font-bold text-white/68">
                  {challenge.joinedCount > 0
                    ? `${challenge.joinedCount} joined`
                    : "Open community run"}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SocialDaresFeedRail({
  dares,
  onExploreAll,
  onOpenDare,
}: {
  dares: DarePost[];
  onExploreAll: () => void;
  onOpenDare: (dare: DarePost) => void;
}) {
  if (dares.length === 0) return null;

  return (
    <section
      aria-label="Social dares"
      className="feed-editorial-rail relative overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,23,20,0.94),rgba(7,9,8,0.98))] py-3 shadow-[0_16px_38px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.055)]"
    >
      <style>{`
        .feed-inline-rail::-webkit-scrollbar { display: none; }
      `}</style>
      <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.16),transparent)]" />
      <div className="mb-3 flex items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-white/[0.055] text-white/82 shadow-[0_10px_24px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.08)]">
            <Trophy size={16} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-black uppercase tracking-[0.13em] text-white/88">
              Social dares
            </p>
            <p className="truncate text-xs font-semibold text-white/38">
              Challenges your friends completed
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onExploreAll}
          className="app-pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/76 transition-colors hover:border-white/18 hover:text-white"
          aria-label="Explore social dares"
        >
          <ArrowRight size={16} />
        </button>
      </div>

      <div
        className="feed-inline-rail flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1"
        style={{
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          scrollPaddingInline: "16px",
        }}
      >
        {dares.map((dare) => {
          const thumbnailUrl = dare.proof?.thumbnail || dare.proof?.url;

          return (
            <button
              key={dare.id}
              type="button"
              onClick={() => onOpenDare(dare)}
              className="feed-rail-card app-pressable relative flex h-[224px] w-[188px] shrink-0 snap-start flex-col justify-end overflow-hidden rounded-[24px] border border-white/10 bg-[#030403] p-3 text-left shadow-[0_16px_34px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.06)] transition-transform active:scale-[0.985]"
              aria-label={`Open dare ${dare.description}`}
            >
              {thumbnailUrl ? (
                <>
                  <img
                    src={thumbnailUrl}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full scale-110 object-cover opacity-42 blur-xl"
                    loading="lazy"
                  />
                  <img
                    src={thumbnailUrl}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                </>
              ) : (
                <span className="absolute inset-0 bg-[linear-gradient(135deg,rgba(74,222,128,0.16),rgba(56,189,248,0.1),rgba(8,12,10,0.98))]" />
              )}
              <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.06),rgba(0,0,0,0.2)_44%,rgba(0,0,0,0.9))]" />
              <span className="feed-rail-title relative z-[1] line-clamp-3 text-[14px] font-black uppercase leading-[1.08] text-white">
                {dare.description}
              </span>
              <div className="relative z-[1] mt-2 flex min-w-0 items-center gap-1 text-[10.5px] font-bold leading-none text-white/72">
                <span className="inline-flex min-w-0 flex-1 items-center gap-1">
                  <Avatar
                    src={dare.challenger.avatar}
                    alt={dare.challenger.nickname}
                    size={17}
                    userId={dare.challengerId}
                    username={dare.challenger.nickname}
                    className="shrink-0 border border-white/12 bg-black/35"
                  />
                  <span className="truncate">{dare.challenger.nickname}</span>
                </span>
                <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.12em] text-[#4ade80] drop-shadow-[0_0_10px_rgba(74,222,128,0.55)]">
                  DARED
                </span>
                <span className="inline-flex min-w-0 flex-1 items-center gap-1">
                  <Avatar
                    src={dare.receiver.avatar}
                    alt={dare.receiver.nickname}
                    size={17}
                    userId={dare.receiverId}
                    username={dare.receiver.nickname}
                    className="shrink-0 border border-white/12 bg-black/35"
                  />
                  <span className="truncate">{dare.receiver.nickname}</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

type FeedHotTakeItem =
  | { type: "truth"; id: string; createdAt: string; truth: TruthPost }
  | {
      type: "prediction";
      id: string;
      createdAt: string;
      prediction: PredictionPost;
    }
  | { type: "deal"; id: string; createdAt: string; deal: DealPost }
  | { type: "rumour"; id: string; createdAt: string; rumour: RumourPost }
  | { type: "promise"; id: string; createdAt: string; promise: PromisePost }
  | { type: "custom"; id: string; createdAt: string; custom: CustomPost };

type FeedHotTakeCard = {
  key: string;
  type: FeedHotTakeItem["type"];
  label: string;
  action: string;
  title: string;
  kicker: string;
  actorName: string;
  actorAvatar: string;
  actorId?: string;
  stat: string;
  accent: string;
  accentSoft: string;
  onOpen: () => void;
};

function voteCount(votes?: Record<string, unknown>) {
  return Object.keys(votes || {}).length;
}

// ---------------------------------------------------------------------------
// LikeMilestoneStickman — per-user 50-tap celebration.
// Mirrors the avatar-headed, rounded-limb character language used by the
// birthday room and roast jail, then turns the post header avatar into the
// character instead of introducing a separate mascot.
// ---------------------------------------------------------------------------

function LikeMilestoneStickman({
  author,
  postId,
  heartColor,
  milestone,
}: {
  author: FeedPost["author"];
  postId: string;
  heartColor: string;
  milestone: number;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const stickmanRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    const stickman = stickmanRef.current;
    if (!layer || !stickman) return;
    const media = layer.parentElement?.querySelector<HTMLElement>(
      "[data-feed-post-media]",
    );
    const avatar = layer.parentElement?.querySelector<HTMLElement>(
      "[data-feed-author-avatar]",
    );

    const measure = () => {
      const layerRect = layer.getBoundingClientRect();
      const { height, width } = layerRect;
      const mediaBottom = media
        ? media.getBoundingClientRect().bottom - layerRect.top
        : height;
      const jumpX = Math.max(0, width * 0.5 - 36);
      const heartTravel = Math.max(70, mediaBottom - 90);
      layer.style.setProperty("--like-milestone-heart-travel", `${heartTravel}px`);
      layer.style.setProperty(
        "--like-milestone-heart-travel-mid",
        `${heartTravel * 0.46}px`,
      );

      const avatarRect = avatar?.getBoundingClientRect();
      const head = stickman.querySelector<HTMLElement>(".like-milestone-head");
      const headSize = head?.offsetWidth || 50;
      stickman.style.transformOrigin = `36px ${headSize / 2}px`;
      return {
        jumpX,
        travel: Math.max(0, mediaBottom - 112),
        homeX: avatarRect ? avatarRect.left + avatarRect.width / 2 - layerRect.left - 36 : -4,
        homeY: avatarRect ? avatarRect.top + avatarRect.height / 2 - layerRect.top - 11 - headSize / 2 : -4,
        homeScale: avatarRect ? avatarRect.width / headSize : 0.8,
      };
    };

    // Shared choreography timeline:
    // 0–11.5% anatomy reveal + anticipation, 11.5–52% jump arc,
    // 52–61% impact + recovery, 61–88% party-style groove,
    // 88–98% continuous eased return; the final hold makes the avatar handoff seamless.
    const jumpFrames = ({
      jumpX,
      travel,
      homeX,
      homeY,
      homeScale,
    }: {
      jumpX: number;
      travel: number;
      homeX: number;
      homeY: number;
      homeScale: number;
    }): Keyframe[] => [
      { offset: 0, transform: `translate3d(${homeX}px, ${homeY}px, 0) scale(${homeScale})` },
      { offset: 0.08, transform: "translate3d(0px, 0px, 0px)" },
      {
        offset: 0.115,
        transform: "translate3d(0px, 5px, 0px)",
        easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      },
      {
        offset: 0.2,
        transform: `translate3d(${jumpX * 0.28}px, -28px, 0px)`,
      },
      {
        offset: 0.32,
        transform: `translate3d(${jumpX * 0.56}px, -72px, 0px)`,
        easing: "cubic-bezier(0.77, 0, 0.175, 1)",
      },
      {
        offset: 0.43,
        transform: `translate3d(${jumpX * 0.82}px, ${travel - 76}px, 0px)`,
      },
      {
        offset: 0.52,
        transform: `translate3d(${jumpX}px, ${travel + 7}px, 0px)`,
        easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      },
      {
        offset: 0.565,
        transform: `translate3d(${jumpX}px, ${travel - 5}px, 0px)`,
      },
      {
        offset: 0.61,
        transform: `translate3d(${jumpX}px, ${travel}px, 0px)`,
      },
      ...Array.from({ length: 31 }, (_, index) => {
        const t = index / 30;
        // Quintic easing has zero velocity and acceleration at both ends.
        const progress = t * t * t * (t * (6 * t - 15) + 10);
        const x = jumpX + (homeX - jumpX) * progress;
        const y = travel + (homeY - travel) * progress - 24 * Math.sin(Math.PI * progress);
        const scale = 1 + (homeScale - 1) * progress;
        return { offset: 0.88 + t * 0.1, transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})` };
      }),
      { offset: 1, transform: `translate3d(${homeX}px, ${homeY}px, 0) scale(${homeScale})` },
    ];

    let metrics = measure();
    stickman.style.transform = `translate3d(${metrics.homeX}px, ${metrics.homeY}px, 0) scale(${metrics.homeScale})`;
    let jumpAnimation: Animation | null = null;
    const danceAnimations: Animation[] = [];
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const animationFrame = window.requestAnimationFrame(() => {
      if (reduceMotion) {
        stickman.style.transform = `translate3d(${metrics.homeX}px, ${metrics.homeY}px, 0) scale(${metrics.homeScale})`;
        return;
      }

      jumpAnimation = stickman.animate(jumpFrames(metrics), {
        duration: LIKE_MILESTONE_CELEBRATION_MS,
        easing: "linear",
        fill: "both",
      });

      if (likeDanceVariant(milestone) === "shuffle") {
        // Replace only the grounded dance phrase. Entry, landing, and the
        // measured return to the avatar keep their existing choreography.
        const phrases: Array<[string, string[]]> = [
          [".like-milestone-puppet", [
            "translate3d(0,0,0) rotate(0deg)",
            "translate3d(-12px,-5px,0) rotate(-12deg)",
            "translate3d(-6px,0,0) rotate(4deg)",
            "translate3d(12px,-7px,0) rotate(12deg)",
            "translate3d(6px,0,0) rotate(-4deg)",
            "translate3d(-9px,-9px,0) rotate(-10deg)",
            "translate3d(9px,-4px,0) rotate(10deg)",
            "translate3d(0,0,0) rotate(0deg)",
          ]],
          [".like-milestone-head", [
            "rotate(0deg)", "rotate(9deg)", "rotate(-5deg)", "rotate(-9deg)",
            "rotate(5deg)", "rotate(8deg)", "rotate(-8deg)", "rotate(0deg)",
          ]],
          [".like-milestone-arm-left", [
            "rotate(-32deg)", "rotate(125deg)", "rotate(145deg)", "rotate(-12deg)",
            "rotate(-45deg)", "rotate(130deg)", "rotate(115deg)", "rotate(-32deg)",
          ]],
          [".like-milestone-arm-right", [
            "rotate(32deg)", "rotate(12deg)", "rotate(45deg)", "rotate(-125deg)",
            "rotate(-145deg)", "rotate(-130deg)", "rotate(-115deg)", "rotate(32deg)",
          ]],
          [".like-milestone-leg-left", [
            "rotate(-58deg)", "rotate(-18deg)", "rotate(-72deg)", "rotate(-90deg)",
            "rotate(-58deg)", "rotate(-12deg)", "rotate(-85deg)", "rotate(-58deg)",
          ]],
          [".like-milestone-leg-right", [
            "rotate(58deg)", "rotate(90deg)", "rotate(58deg)", "rotate(18deg)",
            "rotate(72deg)", "rotate(85deg)", "rotate(12deg)", "rotate(58deg)",
          ]],
        ];
        for (const [selector, transforms] of phrases) {
          const part = stickman.querySelector<HTMLElement>(selector);
          if (!part) continue;
          danceAnimations.push(part.animate(transforms.map((transform) => ({ transform })), {
            delay: LIKE_MILESTONE_CELEBRATION_MS * 0.61,
            duration: LIKE_MILESTONE_CELEBRATION_MS * 0.27,
            easing: "cubic-bezier(0.37, 0, 0.63, 1)",
            fill: "none",
          }));
        }
      }
    });

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            metrics = measure();
            const effect = jumpAnimation?.effect as KeyframeEffect | null;
            effect?.setKeyframes(jumpFrames(metrics));
          });
    observer?.observe(layer);
    if (media) observer?.observe(media);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      jumpAnimation?.cancel();
      danceAnimations.forEach((animation) => animation.cancel());
      observer?.disconnect();
    };
  }, [postId, milestone]);

  return (
    <div
      ref={layerRef}
      className="like-milestone-layer pointer-events-none absolute inset-0 z-40 overflow-hidden"
      style={{ pointerEvents: "none" }}
      aria-hidden="true"
      data-dance={likeDanceVariant(milestone)}
    >
      <div className="like-milestone-shower absolute inset-0">
        {LIKE_MILESTONE_HEARTS.map((heart, index) => (
          <Heart
            key={index}
            className="like-milestone-heart absolute -top-5"
            size={heart.size}
            fill={heartColor}
            strokeWidth={0}
            style={
              {
                left: `${heart.left}%`,
                color: heartColor,
                transition: "fill 650ms ease, color 650ms ease",
                animationDelay: `${heart.delay}ms`,
                animationDuration: `${heart.duration}ms`,
                "--like-milestone-heart-drift": `${heart.drift}px`,
                "--like-milestone-heart-drift-mid": `${heart.driftMid}px`,
                "--like-milestone-heart-rotate": `${heart.rotate}deg`,
                "--like-milestone-heart-rotate-mid": `${heart.rotateMid}deg`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div
        ref={stickmanRef}
        className="like-milestone-stickman absolute left-0 top-[11px] flex w-[72px] flex-col items-center"
      >
        <div className="like-milestone-puppet relative flex flex-col items-center">
          <div className="like-milestone-head relative rounded-full bg-[linear-gradient(135deg,#666,#3f3f3f,#8a8a8a)] p-[2px] shadow-[0_12px_24px_rgba(0,0,0,0.42)]">
            <Avatar
              src={author.avatar}
              alt={author.name}
              fallbackText={author.name.charAt(0)}
              size={46}
              userId={author.id}
              username={author.username}
            />
          </div>
          <div className="like-milestone-body relative mt-[-2px] h-[58px] w-[58px]">
            <span className="like-milestone-arm-left absolute right-1/2 top-[10px] z-0 h-[4px] w-[22px] origin-right rotate-[-32deg]">
              <span className="like-milestone-bone-left absolute inset-0 rounded-full bg-white/75" />
            </span>
            <span className="like-milestone-arm-right absolute left-1/2 top-[10px] z-0 h-[4px] w-[22px] origin-left rotate-[32deg]">
              <span className="like-milestone-bone-right absolute inset-0 rounded-full bg-white/75" />
            </span>
            <span className="like-milestone-leg-left absolute right-1/2 top-[30px] z-0 h-[4px] w-[26px] origin-right rotate-[-58deg]">
              <span className="like-milestone-bone-left absolute inset-0 rounded-full bg-white/75" />
            </span>
            <span className="like-milestone-leg-right absolute left-1/2 top-[30px] z-0 h-[4px] w-[26px] origin-left rotate-[58deg]">
              <span className="like-milestone-bone-right absolute inset-0 rounded-full bg-white/75" />
            </span>
            <span className="like-milestone-torso absolute left-1/2 top-0 z-10 h-[33px] w-[4px] -translate-x-1/2 rounded-full bg-white/80" />
          </div>
        </div>
        <span className="like-milestone-shadow absolute bottom-[3px] left-1/2 h-2 w-14 -translate-x-1/2 rounded-full bg-black/60 blur-[2px]" />
        <span className="like-milestone-impact absolute -bottom-1 left-1/2 h-5 w-16 -translate-x-1/2 rounded-[50%] border-2 border-white/30" />
      </div>
    </div>
  );
}

function getSubjectName(subject: PredictionPost["subject"]) {
  return subject.type === "friend"
    ? subject.name || subject.username || "someone"
    : subject.name;
}

function buildFeedHotTakeCards({
  items,
  onExploreAll,
  onOpenTruth,
}: {
  items: FeedHotTakeItem[];
  onExploreAll: () => void;
  onOpenTruth: (truth: TruthPost) => void;
}): FeedHotTakeCard[] {
  return items.map((item) => {
    if (item.type === "truth") {
      const actor = getTruthRailActor(item.truth);
      const action = getTruthRailAction(item.truth);
      const actorName = actor.nickname || "Someone";
      const question =
        item.truth.question?.trim() || getTruthPreviewText(item.truth);

      return {
        key: `truth-${item.id}`,
        type: "truth",
        label: "Truth",
        action,
        title: question,
        kicker: `Question from ${item.truth.challenger.nickname}`,
        actorName,
        actorAvatar: actor.avatar,
        actorId: item.truth.receiverId || item.truth.challengerId,
        stat: item.truth.state === "ANSWERED" ? "answered" : "waiting",
        accent: "#4ade80",
        accentSoft: "rgba(74,222,128,0.14)",
        onOpen: () => onOpenTruth(item.truth),
      };
    }

    if (item.type === "prediction") {
      const votes = voteCount(item.prediction.votes);
      return {
        key: `prediction-${item.id}`,
        type: "prediction",
        label: "Prediction",
        action: `called it on ${getSubjectName(item.prediction.subject)}`,
        title: item.prediction.text,
        kicker: item.prediction.verdict ? "verdict dropped" : "room is voting",
        actorName: item.prediction.poster.name || "Someone",
        actorAvatar: item.prediction.poster.avatar || "",
        actorId: item.prediction.poster.id,
        stat: `${votes} vote${votes === 1 ? "" : "s"}`,
        accent: "#a78bfa",
        accentSoft: "rgba(167,139,250,0.15)",
        onOpen: onExploreAll,
      };
    }

    if (item.type === "deal") {
      const votes = voteCount(item.deal.votes);
      return {
        key: `deal-${item.id}`,
        type: "deal",
        label: "Stake",
        action: `bet on ${getSubjectName(item.deal.subject)}`,
        title: item.deal.event,
        kicker: `${item.deal.winOutcome} or ${item.deal.loseOutcome}`,
        actorName: item.deal.creator.name || "Someone",
        actorAvatar: item.deal.creator.avatar || "",
        actorId: item.deal.creator.id,
        stat: item.deal.result || `${votes} vote${votes === 1 ? "" : "s"}`,
        accent: "#38bdf8",
        accentSoft: "rgba(56,189,248,0.14)",
        onOpen: onExploreAll,
      };
    }

    if (item.type === "rumour") {
      const votes = voteCount(item.rumour.votes);
      return {
        key: `rumour-${item.id}`,
        type: "rumour",
        label: "Rumour",
        action: item.rumour.subject
          ? `about ${item.rumour.subject.name}`
          : item.rumour.sourceLabel,
        title: item.rumour.statement,
        kicker: item.rumour.heatLabel || item.rumour.status,
        actorName: item.rumour.poster.name || "Someone",
        actorAvatar: item.rumour.poster.avatar || "",
        actorId: item.rumour.poster.id,
        stat: `${votes} vote${votes === 1 ? "" : "s"}`,
        accent: "#777777",
        accentSoft: "rgba(251,113,133,0.15)",
        onOpen: onExploreAll,
      };
    }

    if (item.type === "promise") {
      const votes = voteCount(item.promise.votes);
      return {
        key: `promise-${item.id}`,
        type: "promise",
        label: "Promise",
        action: `promised ${item.promise.targetLabel || "the room"}`,
        title: item.promise.promise,
        kicker: item.promise.status === "open" ? "receipts pending" : item.promise.status,
        actorName: item.promise.maker.name || "Someone",
        actorAvatar: item.promise.maker.avatar || "",
        actorId: item.promise.maker.id,
        stat: `${votes} watcher${votes === 1 ? "" : "s"}`,
        accent: "#facc15",
        accentSoft: "rgba(250,204,21,0.14)",
        onOpen: onExploreAll,
      };
    }

    const votes = voteCount(item.custom.votes);
    return {
      key: `custom-${item.id}`,
      type: "custom",
      label: "Pick",
      action: item.custom.toneLabel || "choose sides",
      title: item.custom.statement,
      kicker: `${item.custom.choiceOneText} vs ${item.custom.choiceTwoText}`,
      actorName: item.custom.creator.name || "Someone",
      actorAvatar: item.custom.creator.avatar || "",
      actorId: item.custom.creator.id,
      stat: `${votes} tap${votes === 1 ? "" : "s"}`,
      accent: "#f97316",
      accentSoft: "rgba(249,115,22,0.15)",
      onOpen: onExploreAll,
    };
  });
}

function HotTakesFeedRail({
  items,
  onExploreAll,
  onOpenTruth,
}: {
  items: FeedHotTakeItem[];
  onExploreAll: () => void;
  onOpenTruth: (truth: TruthPost) => void;
}) {
  if (items.length === 0) return null;

  const cards = buildFeedHotTakeCards({ items, onExploreAll, onOpenTruth });

  return (
    <section
      aria-label="Hot takes"
      className="feed-editorial-rail relative overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,18,22,0.95),rgba(6,7,10,0.98))] py-3 shadow-[0_16px_38px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.055)]"
    >
      <style>{`
        .feed-inline-rail::-webkit-scrollbar { display: none; }
      `}</style>
      <div className="mb-3 flex items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-white/[0.055] text-white/82 shadow-[0_10px_24px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.08)]">
            <MessageSquare size={16} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-black uppercase tracking-[0.13em] text-white/88">
              Hot Takes
            </p>
            <p className="truncate text-xs font-semibold text-white/38">
              Truths, stakes, rumours, promises
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onExploreAll}
          className="app-pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/76 transition-colors hover:border-white/18 hover:text-white"
          aria-label="Explore truths"
        >
          <ArrowRight size={16} />
        </button>
      </div>

      <div
        className="feed-inline-rail flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1"
        style={{
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          scrollPaddingInline: "16px",
        }}
      >
        {cards.map((card) => {
          return (
            <button
              key={card.key}
              type="button"
              onClick={card.onOpen}
              className="feed-rail-card app-pressable relative flex h-[168px] w-[292px] shrink-0 snap-start flex-col overflow-hidden rounded-[24px] border bg-[linear-gradient(145deg,rgba(255,255,255,0.055),rgba(255,255,255,0.026)_46%,rgba(255,255,255,0.045)),linear-gradient(180deg,rgba(9,15,12,0.98),rgba(5,8,6,0.99))] p-3.5 text-left shadow-[0_16px_34px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.06)] transition-transform active:scale-[0.985]"
              style={{
                borderColor: `${card.accent}2c`,
                ["--hot-take-accent" as string]: card.accent,
                ["--hot-take-soft" as string]: card.accentSoft,
              }}
              aria-label={`${card.actorName} ${card.action} ${card.title}`}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-8 -top-12 h-28 w-28 rounded-full opacity-20 blur-2xl"
                style={{ background: card.accent }}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-4 top-0 h-px"
                style={{
                  background: `linear-gradient(90deg,transparent,${card.accent}cc,rgba(255,255,255,0.24),transparent)`,
                }}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-0 right-0 h-16 w-28 rounded-tl-full"
                style={{ background: card.accentSoft }}
              />

              <div className="relative z-[1] flex items-start gap-3">
                <Avatar
                  src={card.actorAvatar}
                  alt={card.actorName}
                  size={40}
                  userId={card.actorId}
                  username={card.actorName}
                  fallbackText={card.actorName.charAt(0)}
                  style={{
                    border: "2px solid rgba(3,4,3,0.94)",
                    boxShadow: `0 0 0 1px ${card.accent}66, 0 10px 24px rgba(0,0,0,0.34)`,
                  }}
                />
                <div className="min-w-0 flex-1 pr-1">
                  <p className="truncate text-[14px] font-black leading-tight text-white">
                    {card.actorName}
                  </p>
                  <p
                    className="mt-0.5 truncate text-[10.5px] font-black uppercase tracking-[0.14em]"
                    style={{ color: card.accent }}
                  >
                    {card.action}
                  </p>
                </div>
              </div>

              <div className="feed-rail-title relative z-[1] mt-3 line-clamp-3 text-[16px] font-black leading-[1.16] text-white">
                {card.title}
              </div>

              <div className="relative z-[1] mt-auto flex min-w-0 items-center justify-between gap-2 pt-2">
                <p className="min-w-0 truncate text-[11px] font-bold text-white/48">
                  {card.kicker}
                </p>
                <span
                  className="shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em]"
                  style={{ background: card.accentSoft, color: card.accent }}
                >
                  {card.stat}
                </span>
              </div>

            </button>
          );
        })}
      </div>
    </section>
  );
}

function CircleScrapbookScreen({
  circle,
  isCustomCircle,
  posts,
  stories,
  dares,
  truths,
  onClose,
  onManage,
}: {
  circle: CircleRecord;
  isCustomCircle: boolean;
  posts: FeedPost[];
  stories: StoryDTO[];
  dares: DarePost[];
  truths: TruthPost[];
  onClose: () => void;
  onManage: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"memories" | "highlights">(
    "memories",
  );

  const mediaPosts = useMemo(
    () =>
      posts
        .filter((post) => post.media?.url && post.media.type === "image")
        .slice(0, 6),
    [posts],
  );

  const memoryCards = useMemo(() => {
    const cards: Array<{
      id: string;
      kind: string;
      title: string;
      caption: string;
      meta: string;
      source: string;
      imageUrl: string;
      accent: string;
    }> = [];

    mediaPosts.forEach((post, index) => {
      cards.push({
        id: `${post.id}-media-${index}`,
        kind: "Feed memory",
        title: post.content
          ? post.content.trim().slice(0, 42)
          : "Shared moment",
        caption:
          post.content?.trim() || "A post that belongs in the circle archive.",
        meta: formatTimeAgo(post.timestamp),
        source: "Feed",
        imageUrl: post.media?.url || "",
        accent: "from-[#4ade80]/18",
      });
    });

    stories.slice(0, 2).forEach((story, index) => {
      cards.push({
        id: `${story.id}-story-${index}`,
        kind: "Story memory",
        title:
          story.storyType === "dedication" ? "Dedicated story" : "Story moment",
        caption: story.caption || "A story that the circle would remember.",
        meta: formatTimeAgo(story.createdAt),
        source: "Story",
        imageUrl: story.media.url,
        accent: "from-[#38bdf8]/18",
      });
    });

    dares.slice(0, 2).forEach((dare, index) => {
      cards.push({
        id: `${dare.id}-dare-${index}`,
        kind: "Dare memory",
        title: dare.description.slice(0, 42),
        caption:
          dare.state === "ACCEPTED_REAL"
            ? "A dare that made it through the full proof loop."
            : "A dare card that stayed loud in the room.",
        meta: formatTimeAgo(dare.createdAt),
        source: "Dare",
        imageUrl:
          dare.proof?.thumbnail ||
          dare.proof?.url ||
          mediaPosts[0]?.media?.url ||
          "",
        accent: "from-white/10",
      });
    });

    truths.slice(0, 2).forEach((truth, index) => {
      cards.push({
        id: `${truth.id}-truth-${index}`,
        kind: "Truth memory",
        title: truth.question.slice(0, 42),
        caption:
          truth.answer?.trim() ||
          "A truth prompt that turned into a full-thread debate.",
        meta: formatTimeAgo(truth.createdAt),
        source: "Truth",
        imageUrl:
          mediaPosts[index]?.media?.url || mediaPosts[0]?.media?.url || "",
        accent: "from-[#facc15]/18",
      });
    });

    return cards.slice(0, 6);
  }, [dares, mediaPosts, stories, truths]);

  const highlights = useMemo(
    () => [
      {
        label: "Members",
        value: `${circle.member_ids.length}`,
        note: isCustomCircle ? "Custom circle" : "Shared circle",
        icon: Users,
        accent: "#4ade80",
      },
      {
        label: "Memories",
        value: `${memoryCards.length}`,
        note: "Saved moments",
        icon: Sparkles,
        accent: "#38bdf8",
      },
      {
        label: "Dares",
        value: `${dares.length}`,
        note: "Proof moments",
        icon: Trophy,
        accent: "#facc15",
      },
      {
        label: "Truths",
        value: `${truths.length}`,
        note: "Debate cards",
        icon: MessageSquare,
        accent: "#777777",
      },
    ],
    [
      circle.member_ids.length,
      dares.length,
      isCustomCircle,
      memoryCards.length,
      truths.length,
    ],
  );

  const heroImages = memoryCards.slice(0, 6);
  const heroSlots = heroImages.length > 0 ? heroImages : Array(6).fill(null);

  return (
    <div className="fixed inset-0 z-[145] bg-[#030706] text-white">
      <style>{`
        @keyframes scrapbookFloat {
          0%, 100% { transform: translate3d(0,0,0) rotate(-0.6deg); }
          50% { transform: translate3d(0,-4px,0) rotate(0.8deg); }
        }
        .circle-paper-tile {
          box-shadow:
            0 18px 45px rgba(0,0,0,0.32),
            inset 0 1px 0 rgba(255,255,255,0.08);
          animation: scrapbookFloat 6s ease-in-out infinite;
        }
      `}</style>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_4%,rgba(74,222,128,0.18),transparent_30%),radial-gradient(circle_at_88%_12%,rgba(56,189,248,0.12),transparent_30%),linear-gradient(180deg,#07100b,#030706_48%,#020303)]" />
      <div className="absolute inset-x-0 top-0 h-[240px] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),transparent)]" />

      <div className="relative z-10 h-full overflow-y-auto px-4 pb-[calc(var(--safe-area-bottom)+22px)] pt-[calc(var(--safe-area-top)+12px)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/12 text-white/76 backdrop-blur-xl active:scale-95"
            aria-label="Close circle"
          >
            <ChevronLeft size={21} />
          </button>
          <button
            type="button"
            onClick={onManage}
            className="rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-4 py-2 text-sm font-black text-[#bbf7d0]"
          >
            Members
          </button>
        </div>

        {isCustomCircle && (
          <div className="mb-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onManage}
              className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.06] px-4 py-2 text-xs font-black text-white/74"
            >
              <Pencil size={14} />
              Rename circle
            </button>
            <button
              type="button"
              onClick={onManage}
              className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-4 py-2 text-xs font-black text-white/72"
            >
              <Trash2 size={14} />
              Delete circle
            </button>
          </div>
        )}

        <div className="relative overflow-hidden rounded-[36px] border border-white/10 bg-[linear-gradient(145deg,rgba(18,25,22,0.92),rgba(10,15,14,0.96))] p-3 shadow-[0_12px_32px_rgba(74,222,128,0.15),inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(250,204,21,0.14),transparent_30%),radial-gradient(circle_at_82%_18%,rgba(74,222,128,0.18),transparent_32%)]" />
          <div className="relative h-[250px] overflow-hidden rounded-[30px] border border-white/10 bg-[#0a0f0b]">
            <div className="grid h-full grid-cols-3 gap-1 p-1 opacity-88">
              {heroSlots.map((entry, index) =>
                entry ? (
                  <img
                    key={entry.id}
                    src={entry.imageUrl}
                    alt=""
                    className={`h-full w-full object-cover ${index === 0 ? "col-span-2 row-span-2" : ""}`}
                  />
                ) : (
                  <div
                    key={`hero-placeholder-${index}`}
                    className={`rounded-[18px] bg-[linear-gradient(135deg,rgba(74,222,128,0.12),rgba(14,165,233,0.10))] ${index === 0 ? "col-span-2 row-span-2" : ""}`}
                  />
                ),
              )}
            </div>
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(74,222,128,0.04),rgba(56,189,248,0.08)_48%,rgba(18,25,20,0.92))]" />
            <div className="absolute bottom-4 left-4 right-4">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-[#bbf7d0] backdrop-blur-xl">
                <Sparkles size={12} />
                Digital scrapbook
              </div>
              <h1 className="m-0 text-[30px] font-black leading-none tracking-tight">
                {circle.name} Circle
              </h1>
              <p className="m-0 mt-1 text-sm font-bold text-white/68">
                Created {formatTimeAgo(circle.created_at)} ·{" "}
                {circle.member_ids.length} members
              </p>
            </div>
          </div>

          <div className="relative mt-3 grid grid-cols-2 gap-2">
            {highlights.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="rounded-[20px] border border-white/8 bg-white/8 px-3 py-2.5"
                >
                  <p className="m-0 text-[10px] font-black uppercase tracking-[0.14em] text-white/38">
                    {item.label}
                  </p>
                  <p className="m-0 mt-1 flex items-center gap-2 text-base font-black text-white">
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full"
                      style={{ color: item.accent }}
                    >
                      <Icon size={12} />
                    </span>
                    {item.value}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 rounded-full border border-white/8 bg-white/12 p-1">
          {(["memories", "highlights"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-2 py-2.5 text-xs font-black transition-all ${
                activeTab === tab
                  ? "bg-[#4ade80] text-[#061006] shadow-[0_10px_24px_rgba(74,222,128,0.24)]"
                  : "text-white/54"
              }`}
            >
              {tab === "memories" ? "📖 Memories" : "✨ Highlights"}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {activeTab === "memories" ? (
            <div className="space-y-4 pb-4">
              {memoryCards.map((card, index) => (
                <div
                  key={card.id}
                  className="circle-paper-tile relative w-full overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.1),rgba(74,222,128,0.05)),linear-gradient(180deg,rgba(17,25,20,0.98),rgba(7,10,8,0.99))] p-3"
                  style={{
                    transform: `rotate(${index % 2 === 0 ? "-0.9deg" : "0.8deg"})`,
                  }}
                >
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${card.accent} to-transparent opacity-80`}
                  />
                  <div className="relative overflow-hidden rounded-[26px] border border-white/10 bg-white/8">
                    <div className="relative">
                      {card.imageUrl ? (
                        <img
                          src={card.imageUrl}
                          alt={card.title}
                          className="h-[320px] w-full object-cover sm:h-[360px]"
                        />
                      ) : (
                        <div className="h-[320px] w-full bg-[linear-gradient(135deg,rgba(74,222,128,0.08),rgba(56,189,248,0.08))]" />
                      )}
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(74,222,128,0.06)_48%,rgba(18,25,20,0.92))]" />
                      <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white/86 backdrop-blur-xl">
                        {card.source}
                      </div>
                      <div className="absolute bottom-4 left-4 right-4">
                        <p className="m-0 text-[11px] font-black uppercase tracking-[0.16em] text-[#bbf7d0]">
                          {card.kind}
                        </p>
                        <p className="m-0 mt-2 text-[26px] font-black leading-none text-white">
                          {card.title}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-3 p-4">
                      <p className="m-0 text-sm font-semibold leading-relaxed text-white/68">
                        {card.caption}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-white/50">
                          {card.meta}
                        </span>
                        <span className="rounded-full border border-[#67e8f9]/16 bg-[#67e8f9]/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-[#8be8ff]">
                          {card.source}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3 pb-4">
              {highlights.map((item, index) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className="circle-paper-tile relative overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(145deg,rgba(56,189,248,0.08),rgba(74,222,128,0.06)),linear-gradient(180deg,rgba(15,23,20,0.96),rgba(6,9,8,0.99))] p-4"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] border border-white/10 bg-white/10 text-2xl"
                        style={{ color: item.accent }}
                      >
                        <Icon size={22} />
                      </div>
                      <div className="min-w-0">
                        <p className="m-0 text-[11px] font-black uppercase tracking-[0.16em] text-[#86efac]">
                          {item.label}
                        </p>
                        <p className="m-0 mt-1 text-lg font-black leading-tight text-white">
                          {item.note}
                        </p>
                        <p className="m-0 mt-2 text-sm font-bold text-white/45">
                          {item.value}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FeedVerdictCard — inline verdict teaser card inserted every N feed posts
// ---------------------------------------------------------------------------

function mergeFeedVerdicts(friends: VerdictDTO[], topics: VerdictDTO[]) {
  const seen = new Set<string>();
  return [...friends, ...topics]
    .filter((verdict) => {
      if (!verdict.id || seen.has(verdict.id)) return false;
      seen.add(verdict.id);
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime() ||
        b.id.localeCompare(a.id),
    );
}

type FeedVerdictPreview = {
  id: string;
  verdictId: string;
  authorAvatar: string;
  authorName: string;
  authorUsername: string;
  question: string;
  description: string;
  choiceOne: string;
  choiceTwo: string;
  imageUrl: string;
  mediaType: VerdictDTO["media_type"];
  totalVotes: number;
  oneVotes: number;
  twoVotes: number;
  commentsCount: number;
  myVote: VerdictChoice | null;
};

function toFeedVerdictPreview(verdict: VerdictDTO): FeedVerdictPreview {
  return {
    id: `fv-${verdict.id}`,
    verdictId: verdict.id,
    authorAvatar: verdict.author.avatar_url,
    authorName:
      verdict.author.display_name || verdict.author.username || "Someone",
    authorUsername: verdict.author.username || "verdict",
    question: verdict.question,
    description: verdict.description,
    choiceOne: verdict.choice_one_text,
    choiceTwo: verdict.choice_two_text,
    imageUrl: verdict.media_url,
    mediaType: verdict.media_type,
    totalVotes: verdict.total_votes,
    oneVotes: verdict.choice_one_votes,
    twoVotes: verdict.choice_two_votes,
    commentsCount: verdict.comments_count,
    myVote: verdict.my_vote,
  };
}

// ---------------------------------------------------------------------------
// PostActionSheet — bottom sheet for per-post actions
// ---------------------------------------------------------------------------

function PostActionSheet({
  post,
  author,
  isOwn,
  onClose,
  onDare,
  onTruth,
  onPrediction,
  onRumour,
  onDelete,
  onNavigateToProfile,
}: {
  post: FeedPost;
  author: { id?: string; name: string; username: string; avatar: string };
  isOwn: boolean;
  onClose: () => void;
  onDare?: (u: {
    id: string;
    name: string;
    username: string;
    avatar: string;
  }) => void;
  onTruth?: (u: {
    id: string;
    name: string;
    username: string;
    avatar: string;
  }) => void;
  onPrediction?: () => void;
  onRumour?: () => void;
  onDelete?: () => void | Promise<void>;
  onNavigateToProfile?: (userId: string) => void;
}) {
  const [closing, setClosing] = useState(false);

  const dismiss = () => {
    setClosing(true);
    setTimeout(onClose, 270);
  };

  const section1 = [
    {
      icon: <TrendingUp size={18} />,
      label: "Make a prediction",
      color: "#818cf8",
      bg: "rgba(129,140,248,0.15)",
      action: () => {
        onPrediction?.();
        dismiss();
      },
    },
    {
      icon: <MessageSquare size={18} />,
      label: "Start a rumour",
      color: "#f472b6",
      bg: "rgba(244,114,182,0.15)",
      action: () => {
        onRumour?.();
        dismiss();
      },
    },
    {
      icon: <Target size={18} />,
      label: "Ask a truth",
      color: "#38bdf8",
      bg: "rgba(56,189,248,0.15)",
      action: () => {
        if (!isOwn && author.id && onTruth) {
          onTruth({
            id: author.id,
            name: author.name,
            username: author.username,
            avatar: author.avatar,
          });
        }
        dismiss();
      },
    },
    {
      icon: <Zap size={18} />,
      label: "Give a dare",
      color: "#4ade80",
      bg: "rgba(74,222,128,0.15)",
      action: () => {
        if (!isOwn && author.id && onDare) {
          onDare({
            id: author.id,
            name: author.name,
            username: author.username,
            avatar: author.avatar,
          });
        }
        dismiss();
      },
    },
  ];

  const section2 = [
    {
      icon: <Bookmark size={18} />,
      label: "Save",
      color: "#a3e635",
      bg: "rgba(163,230,53,0.13)",
      warning: false,
      action: dismiss,
    },
    {
      icon: <EyeOff size={18} />,
      label: "Hide post",
      color: "#94a3b8",
      bg: "rgba(148,163,184,0.11)",
      warning: false,
      action: dismiss,
    },
    {
      icon: <Info size={18} />,
      label: "About this account",
      color: "#94a3b8",
      bg: "rgba(148,163,184,0.11)",
      warning: false,
      action: () => {
        if (author.id && onNavigateToProfile) onNavigateToProfile(author.id);
        dismiss();
      },
    },
    {
      icon: <Flag size={18} />,
      label: "Report",
      color: "#fb923c",
      bg: "rgba(251,146,60,0.13)",
      warning: true,
      action: dismiss,
    },
    {
      icon: <UserMinus size={18} />,
      label: "Unfriend",
      color: "#f87171",
      bg: "rgba(248,113,113,0.13)",
      warning: true,
      action: dismiss,
    },
  ];

  if (isOwn) {
    section2.splice(
      3,
      2,
      {
        icon: <Trash2 size={18} />,
        label: "Delete post",
        color: "#f87171",
        bg: "rgba(248,113,113,0.13)",
        warning: true,
        action: async () => {
          await onDelete?.();
          dismiss();
        },
      },
    );
  }

  const quickActions = [
    {
      label: "Prediction",
      icon: <TrendingUp size={16} strokeWidth={2.4} />,
      accent: "#c084fc",
      bg: "rgba(192,132,252,0.12)",
      border: "rgba(192,132,252,0.22)",
      action: section1[0].action,
    },
    {
      label: "Rumour",
      icon: <MessageSquare size={16} strokeWidth={2.4} />,
      accent: "#f472b6",
      bg: "rgba(244,114,182,0.12)",
      border: "rgba(244,114,182,0.22)",
      action: section1[1].action,
    },
    {
      label: "Ask Truth",
      icon: <Target size={16} strokeWidth={2.4} />,
      accent: "#38bdf8",
      bg: "rgba(56,189,248,0.12)",
      border: "rgba(56,189,248,0.22)",
      action: section1[2].action,
    },
    {
      label: "Give Dare",
      icon: <Zap size={16} strokeWidth={2.4} fill="currentColor" />,
      accent: "#4ade80",
      bg: "rgba(74,222,128,0.12)",
      border: "rgba(74,222,128,0.22)",
      action: section1[3].action,
    },
  ];

  return (
    <div
      className="app-modal-backdrop fixed inset-0 z-[10000] flex items-end"
      style={{
        zIndex: 10000,
        backgroundColor: closing ? "rgba(0,0,0,0)" : "rgba(0,0,0,0.78)",
        backdropFilter: closing ? "blur(0px)" : "blur(10px)",
        transition: "background-color 0.26s ease, backdrop-filter 0.26s ease",
      }}
      onClick={dismiss}
    >
      <style>{`
        @keyframes postSheetUp {
          from { opacity:0; transform:translateY(100%); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes postSheetDown {
          from { opacity:1; transform:translateY(0); }
          to   { opacity:0; transform:translateY(100%); }
        }
        .pas-chip:active  { opacity:0.72; transform:scale(0.94); }
        .pas-row:active   { background:rgba(255,255,255,0.05); }
      `}</style>

      <div
        className="relative w-full overflow-hidden rounded-t-[28px] border-t border-white/[0.09] bg-[#0f1512] shadow-[0_-1px_0_rgba(255,255,255,0.06),0_-28px_56px_rgba(0,0,0,0.65)]"
        style={{
          paddingBottom: "max(env(safe-area-inset-bottom,0px),36px)",
          animation: closing
            ? "postSheetDown 0.24s cubic-bezier(0.32,0.72,0,1) forwards"
            : "postSheetUp 0.32s cubic-bezier(0.22,1,0.36,1) forwards",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* shimmer top edge */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(74,222,128,0.62),rgba(56,189,248,0.34),transparent)]" />

        {/* handle */}
        <div className="flex justify-center pt-3.5 pb-4">
          <div className="h-[4px] w-9 rounded-full bg-white/[0.16]" />
        </div>

        {/* ── Author row ── */}
        <div className="flex items-center gap-3 px-4 pb-4">
          <Avatar
            src={author.avatar}
            alt={author.name}
            size={40}
            userId={author.id}
            username={author.username}
            style={{ border: "2px solid rgba(74,222,128,0.26)" }}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-black leading-tight text-white">
              {author.name}
            </p>
            <p className="truncate text-[12px] font-semibold text-[#4d5e56]">
              @{author.username}
            </p>
          </div>
        </div>

        {/* ── Section 1: quick-action chips ── */}
        <div className="px-4 pb-3">
          <p className="mb-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#3a5248]">
            Based on this post
          </p>
          <div className="grid grid-cols-2 gap-2">
            {quickActions.map((qa) => (
              <button
                key={qa.label}
                type="button"
                onClick={qa.action}
                className="pas-chip flex items-center gap-2.5 rounded-[14px] border px-3 py-3 text-left transition-transform"
                style={{
                  background: qa.bg,
                  borderColor: qa.border,
                }}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                  style={{ background: `${qa.accent}22`, color: qa.accent }}
                >
                  {qa.icon}
                </span>
                <span
                  className="text-[13.5px] font-black leading-tight"
                  style={{ color: qa.accent }}
                >
                  {qa.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* divider */}
        <div className="mx-4 mb-1 h-px bg-white/[0.06]" />

        {/* ── Section 2: post actions ── */}
        <div className="px-2 py-1">
          {section2.map((item, i) => (
            <button
              key={item.label}
              type="button"
              onClick={item.action}
              className="pas-row flex w-full items-center gap-3 rounded-[12px] px-3 py-[11px] text-left"
            >
              <span
                className="shrink-0"
                style={{ color: item.warning ? item.color : "#3d5248" }}
              >
                {item.icon}
              </span>
              <span
                className="flex-1 text-[14.5px] font-semibold"
                style={{ color: item.warning ? item.color : "#c8d4cd" }}
              >
                {item.label}
              </span>
              {!item.warning && (
                <ChevronRight size={15} className="shrink-0 text-[#2d3d35]" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeedVerdictCard({
  data,
  onNavigate,
  onVote,
  voting,
}: {
  data: FeedVerdictPreview;
  onNavigate?: () => void;
  onVote?: (choice: VerdictChoice) => void;
  voting?: boolean;
}) {
  const [counts, setCounts] = useState({
    one: data.oneVotes,
    two: data.twoVotes,
    total: data.totalVotes,
  });
  const [localVote, setLocalVote] = useState<VerdictChoice | null>(data.myVote);
  const myVote = localVote;

  useEffect(() => {
    setCounts({
      one: data.oneVotes,
      two: data.twoVotes,
      total: data.totalVotes,
    });
    setLocalVote(data.myVote);
  }, [data.oneVotes, data.twoVotes, data.totalVotes, data.myVote]);

  const onePct = Math.round((counts.one / Math.max(counts.total, 1)) * 100);
  const twoPct = 100 - onePct;

  const handleVote = (choice: "one" | "two") => {
    if (myVote === choice || voting) return;
    setLocalVote(choice);
    onVote?.(choice);
    setCounts((v) => ({
      one:
        v.one +
        (choice === "one" ? 1 : 0) -
        (myVote === "one" ? 1 : 0),
      two:
        v.two +
        (choice === "two" ? 1 : 0) -
        (myVote === "two" ? 1 : 0),
      total: myVote ? v.total : v.total + 1,
    }));
  };

  const btnBase =
    "relative min-h-[56px] overflow-hidden rounded-full border-2 px-4 text-center transition-transform duration-200 active:scale-[0.95] disabled:opacity-60";

  return (
    <div className="feed-verdict-card relative overflow-hidden rounded-[20px]">
      <div className="premium-card-glow" />
      <div className="premium-card-ring" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between gap-3 px-3 pb-3 pt-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar
            src={data.authorAvatar}
            alt={data.authorName}
            size={46}
            style={{ border: "2px solid rgba(74,222,128,0.22)" }}
          />
          <div className="min-w-0">
            <h3 className="truncate text-[16px] font-black leading-tight text-white">
              {data.authorName}
            </h3>
            <p className="mt-0.5 truncate text-[13px] font-semibold leading-tight text-[#94a3b8]">
              @{data.authorUsername}
            </p>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-1.5 rounded-full border border-white/14 bg-white/[0.06] px-2.5 py-1 text-[10.5px] font-black uppercase tracking-[0.14em] text-white/72">
          <Scale size={11} />
          Verdict
        </div>
      </div>

      {/* Media with overlaid question — tap to open in Verdicts */}
      <div
        className="relative mx-1 overflow-hidden rounded-[22px] cursor-pointer"
        onClick={onNavigate}
      >
        {data.mediaType === "VIDEO" ? (
          <video
            src={data.imageUrl}
            className="h-[190px] w-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <img
            src={data.imageUrl}
            alt={data.question}
            className="h-[190px] w-full object-cover"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}
        {/* top sheen */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),transparent)]" />
        {/* bottom scrim */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(0deg,rgba(0,0,0,0.88)_0%,rgba(0,0,0,0.48)_58%,transparent_100%)]" />
        {/* Question + meta */}
        <div className="absolute inset-x-4 bottom-4">
          <h2 className="text-[18px] font-semibold leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]">
            {data.question}
          </h2>
          <p className="mt-1 text-[11.5px] font-bold text-white/52">
            {counts.total.toLocaleString()} votes · {data.commentsCount}{" "}
            comments
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="relative z-10 px-4 pb-4 pt-4">
        {data.description && (
          <p className="mb-3.5 line-clamp-1 text-[13px] font-semibold leading-snug text-white/44">
            {data.description}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          {/* Choice one — green */}
          <button
            type="button"
            onClick={() => handleVote("one")}
            disabled={voting || myVote === "one"}
            className={btnBase}
            style={{
              borderColor:
                myVote === "one" ? "#4ade80" : "rgba(74,222,128,0.35)",
              background:
                "radial-gradient(circle at 12% 0%,rgba(74,222,128,0.24),transparent 58%),linear-gradient(150deg,rgba(74,222,128,0.16),rgba(255,255,255,0.035))",
              boxShadow:
                myVote === "one"
                  ? "0 0 0 1px #4ade80, 0 14px 32px rgba(74,222,128,0.16), inset 0 1px 0 rgba(255,255,255,0.14)"
                  : "inset 0 1px 0 rgba(255,255,255,0.07), 0 10px 22px rgba(74,222,128,0.08)",
            }}
          >
            <span className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.48),transparent)]" />
            {myVote && (
              <span
                className="absolute inset-y-0 left-0 transition-[width] duration-700 ease-out"
                style={{
                  width: `${onePct}%`,
                  background:
                    "linear-gradient(90deg,rgba(74,222,128,0.32),rgba(74,222,128,0.08))",
                }}
              />
            )}
            <span className="relative z-10 flex items-center justify-center gap-2">
              <span className="text-[15px] font-black text-white">
                {data.choiceOne}
              </span>
              {myVote && (
                <span className="shrink-0 text-[13px] font-black tabular-nums text-[#4ade80]">
                  {onePct}%
                </span>
              )}
            </span>
          </button>

          {/* Choice two — pink */}
          <button
            type="button"
            onClick={() => handleVote("two")}
            disabled={voting || myVote === "two"}
            className={btnBase}
            style={{
              borderColor:
                myVote === "two" ? "#fb7185" : "rgba(251,113,133,0.35)",
              background:
                "radial-gradient(circle at 88% 0%,rgba(251,113,133,0.24),transparent 58%),linear-gradient(210deg,rgba(251,113,133,0.15),rgba(255,255,255,0.03))",
              boxShadow:
                myVote === "two"
                  ? "0 0 0 1px #fb7185, 0 14px 32px rgba(251,113,133,0.16), inset 0 1px 0 rgba(255,255,255,0.14)"
                  : "inset 0 1px 0 rgba(255,255,255,0.07), 0 10px 22px rgba(251,113,133,0.08)",
            }}
          >
            <span className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.48),transparent)]" />
            {myVote && (
              <span
                className="absolute inset-y-0 right-0 transition-[width] duration-700 ease-out"
                style={{
                  width: `${twoPct}%`,
                  background:
                    "linear-gradient(270deg,rgba(251,113,133,0.32),rgba(251,113,133,0.08))",
                }}
              />
            )}
            <span className="relative z-10 flex items-center justify-center gap-2">
              <span className="text-[15px] font-black text-white">
                {data.choiceTwo}
              </span>
              {myVote && (
                <span className="shrink-0 text-[13px] font-black tabular-nums text-white/72">
                  {twoPct}%
                </span>
              )}
            </span>
          </button>
        </div>

        {/* Post-vote nudge */}
        {!myVote && (
          <p className="mt-3 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-white/28">
            Tap to weigh in
          </p>
        )}
        {myVote && (
          <p className="mt-3 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-[#4ade80]/60">
            Vote cast · see more in Verdicts
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CarouselMedia — swipeable multi-image carousel for feed posts
// ---------------------------------------------------------------------------

function HorizontalCarouselMedia({ urls }: { urls: string[] }) {
  const [index, setIndex] = useState(0);
  const mediaRef = useRef<HTMLDivElement>(null);
  const n = urls.length;
  const isCarousel = n > 1;
  const cardHeight = 525;
  const sidePeek = 10;
  const gap = 12;
  const cardOverlap = 6;

  const goTo = useCallback(
    (next: number) => {
      const targetIndex = Math.max(0, Math.min(n - 1, next));
      const rail = mediaRef.current;
      const firstCard = rail?.querySelector<HTMLElement>("[data-carousel-slide]");
      const step = firstCard
        ? firstCard.offsetWidth + gap - (isCarousel ? cardOverlap : 0)
        : rail?.clientWidth ?? 0;
      rail?.scrollTo({ left: targetIndex * step, behavior: "smooth" });
      setIndex(targetIndex);
    },
    [n],
  );

  useEffect(() => {
    setIndex((current) => Math.min(current, Math.max(0, n - 1)));
  }, [n]);

  useEffect(() => {
    const rail = mediaRef.current;
    if (!rail || !isCarousel) return;

    const updateIndex = () => {
      const firstCard = rail.querySelector<HTMLElement>(
        "[data-carousel-slide]",
      );
      if (!firstCard) return;
      const step = firstCard.offsetWidth + gap - cardOverlap;
      const nextIndex = Math.max(
        0,
        Math.min(n - 1, Math.round(rail.scrollLeft / step)),
      );
      setIndex((current) => (current === nextIndex ? current : nextIndex));
    };

    rail.addEventListener("scrollend", updateIndex);
    return () => rail.removeEventListener("scrollend", updateIndex);
  }, [cardOverlap, gap, isCarousel, n]);

  return (
    <div className="relative w-full select-none" style={{ height: `${cardHeight}px` }}>
      <div
        ref={mediaRef}
        className="flex h-full w-full gap-3 overflow-x-auto scrollbar-hide"
        style={{
          paddingLeft: 0,
          paddingRight: isCarousel ? `${sidePeek}px` : 0,
          scrollSnapType: isCarousel ? "x mandatory" : "none",
          touchAction: "pan-x pan-y",
          overflowX: isCarousel ? "scroll" : "hidden",
          overflowY: "hidden",
          overscrollBehaviorX: "contain",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}
      >
        {urls.map((url, i) => (
          <div
            key={i}
            data-carousel-slide
            className="relative h-full shrink-0 overflow-hidden rounded-[28px] border border-white/[0.08]"
            style={{
              width: isCarousel ? `calc(100% - ${sidePeek}px)` : "100%",
              marginLeft: isCarousel && i > 0 ? `-${cardOverlap}px` : 0,
              scrollSnapAlign: isCarousel ? "start" : "none",
              scrollSnapStop: "normal",
              boxShadow: "none",
            }}
          >
            <img
              src={url}
              alt={`Slide ${i + 1}`}
              className="pointer-events-none h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              fetchPriority="auto"
              draggable={false}
              onError={(event) => {
                event.currentTarget.src =
                  "https://picsum.photos/seed/fallback/800/600.jpg";
              }}
            />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[linear-gradient(180deg,rgba(255,255,255,0.11),transparent)]" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.60))]" />
          </div>
        ))}
      </div>

      {n > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous image"
            disabled={index === 0}
            onClick={(event) => {
              event.stopPropagation();
              goTo(index - 1);
            }}
            className="absolute left-3 top-1/2 z-20 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/35 text-white backdrop-blur-md transition hover:bg-black/55 disabled:pointer-events-none disabled:opacity-0"
          >
            <ChevronLeft size={18} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            aria-label="Next image"
            disabled={index === n - 1}
            onClick={(event) => {
              event.stopPropagation();
              goTo(index + 1);
            }}
            className="absolute right-3 top-1/2 z-20 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/35 text-white backdrop-blur-md transition hover:bg-black/55 disabled:pointer-events-none disabled:opacity-0"
          >
            <ChevronRight size={18} strokeWidth={2.5} />
          </button>
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/15 bg-black/35 px-2.5 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md">
            {urls.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all duration-300 ${
                  i === index
                    ? "w-4 bg-white shadow-[0_0_8px_rgba(255,255,255,0.55)]"
                    : "w-1 bg-white/30"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LegacyCarouselMedia({ urls }: { urls: string[] }) {
  const [index, setIndex] = useState(0);
  const [dragDX, setDragDX] = useState(0); // live horizontal drag offset (px)
  const [isDragging, setIsDragging] = useState(false);
  const mediaRef = useRef<HTMLDivElement>(null);
  const startX = useRef<number | null>(null);
  const startY = useRef(0);
  const startT = useRef(0);
  const dragging = useRef(false);
  const movedH = useRef(false);
  const ignoreMouseUntil = useRef(0);
  // rAF-coalesced drag offset: touchmove fires faster than the screen paints,
  // so we stash the latest value and flush at most once per frame. One render
  // per frame = no backlog no matter how fast/often you swipe back and forth.
  const pendingDX = useRef(0);
  const rafId = useRef<number | null>(null);
  const n = urls.length;

  const flushDrag = () => {
    rafId.current = null;
    setDragDX(pendingDX.current);
  };
  const queueDrag = (v: number) => {
    pendingDX.current = v;
    if (rafId.current === null)
      rafId.current = requestAnimationFrame(flushDrag);
  };
  const cancelDrag = () => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
  };
  useEffect(() => cancelDrag, []);

  // Keep index in range if the number of images shrinks.
  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, urls.length - 1)));
  }, [urls.length]);

  // Swipe is driven by native NON-PASSIVE touch listeners: React onTouch* are
  // passive (preventDefault ignored) so we call preventDefault() the moment a
  // horizontal drag is detected — nothing above can hijack the gesture.
  const finish = (cx: number, cy: number) => {
    if (!dragging.current) return;
    dragging.current = false;
    const dx = startX.current === null ? 0 : cx - startX.current;
    const dy = cy - startY.current;
    const dt = Date.now() - startT.current;
    cancelDrag();
    setIsDragging(false);
    setDragDX(0);
    const width = mediaRef.current?.clientWidth ?? 1;
    const passed =
      Math.abs(dx) > width * 0.18 || (Math.abs(dx) > 40 && dt < 300);
    if (movedH.current && passed) {
      const dir = dx < 0 ? 1 : -1;
      setIndex((i) => Math.max(0, Math.min(n - 1, i + dir)));
    }
    startX.current = null;
  };

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;

    const begin = (cx: number, cy: number) => {
      startX.current = cx;
      startY.current = cy;
      startT.current = Date.now();
      dragging.current = true;
      movedH.current = false;
      setDragDX(0);
    };

    const move = (cx: number, cy: number, ev: Event) => {
      if (!dragging.current || startX.current === null) return;
      const dx = cx - startX.current;
      const dy = cy - startY.current;
      if (!movedH.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        if (Math.abs(dx) > Math.abs(dy)) {
          movedH.current = true;
          setIsDragging(true);
        } else {
          // vertical intent — release the gesture so the feed can scroll
          dragging.current = false;
          setDragDX(0);
          return;
        }
      }
      if (movedH.current) {
        ev.preventDefault(); // block ancestor scroll-steal
        let eff = dx;
        if ((index === 0 && dx > 0) || (index === n - 1 && dx < 0))
          eff = dx * 0.35;
        queueDrag(eff);
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) begin(t.clientX, t.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) move(t.clientX, t.clientY, e);
    };
    const onTouchEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      // Mobile browsers may replay this touch as mouse events. Those events
      // must not become a second tap and accidentally trigger a like.
      ignoreMouseUntil.current = Date.now() + 500;
      finish(
        t ? t.clientX : (startX.current ?? 0),
        t ? t.clientY : startY.current,
      );
    };
    const onTouchCancel = () => {
      dragging.current = false;
      cancelDrag();
      setIsDragging(false);
      setDragDX(0);
      startX.current = null;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchCancel);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [index, n]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mouse (desktop) — no scroll-steal, plain React handlers suffice.
  const onMouseDown = (e: React.MouseEvent) => {
    if (Date.now() < ignoreMouseUntil.current) return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    startT.current = Date.now();
    dragging.current = true;
    movedH.current = false;
    setDragDX(0);
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current || startX.current === null) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (!movedH.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      if (Math.abs(dx) > Math.abs(dy)) {
        movedH.current = true;
        setIsDragging(true);
      }
    }
    if (movedH.current) {
      let eff = dx;
      if ((index === 0 && dx > 0) || (index === n - 1 && dx < 0))
        eff = dx * 0.35;
      queueDrag(eff);
    }
  };
  const onMouseUp = (e: React.MouseEvent) => {
    if (Date.now() < ignoreMouseUntil.current) return;
    finish(e.clientX, e.clientY);
  };

  // ── Peek geometry ──────────────────────────────────────────────────────────
  // Cards are top-anchored. Behind cards have a smaller `top` value so they
  // sit higher in the container and peek out above the front card's top edge.
  // A rightward x-nudge pushes the peek strip toward the top-right corner.
  const CARD_H = 456; // front-card height (px)
  const PEEK_Y = 20; // px — each depth level peeks this far above the previous
  const PEEK_X = 10; // px — rightward nudge per depth level
  const MAX_PEEK = 2; // cards visible behind front
  // Container is taller than CARD_H by the total peek space so behind cards
  // that sit higher in the container are not clipped at the top.
  const CONTAINER_H = CARD_H + MAX_PEEK * PEEK_Y; // 508

  return (
    <div
      ref={mediaRef}
      className="relative w-full cursor-pointer select-none"
      style={{
        height: `${CONTAINER_H}px`,
        touchAction: "pan-y",
        // Isolate painting so sibling elements never trigger carousel repaints.
        isolation: "isolate",
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {urls.map((url, i) => {
        const pos = i - index; // 0 = front · >0 = behind · <0 = gone
        const gone = pos < 0;
        const front = pos === 0;
        const depth = Math.min(Math.max(pos, 0), MAX_PEEK + 1);

        // ── Vertical position (CSS `top`) ──
        // Front card's top = MAX_PEEK * PEEK_Y so behind cards (lower top
        // values) rise above it and peek.
        // Gone cards keep the front top-value so they slide out horizontally
        // without any vertical jump.
        const topPx = gone ? MAX_PEEK * PEEK_Y : (MAX_PEEK - depth) * PEEK_Y;

        // ── Horizontal ──
        // Center all cards, then nudge behind cards right.
        // During drag the front card follows the finger.
        const txPx = front ? dragDX : depth * PEEK_X;

        // Very gentle drag rotation on the front card only.
        const dragRot = front ? dragDX * 0.025 : 0;

        // Subtle scale recession (depth perception without exaggerating).
        const scale = front ? 1 : 1 - depth * 0.022;

        const opacity = pos < 0 || pos > MAX_PEEK + 1 ? 0 : 1;

        // Front card casts a strong shadow; behind cards much lighter.
        const shadow = front
          ? "0 22px 56px -10px rgba(0,0,0,0.68), 0 0 0 1px rgba(255,255,255,0.08)"
          : `0 ${10 + depth * 5}px 32px -14px rgba(0,0,0,0.42)`;

        // Animate `top` + `transform` + `opacity` together.
        // Disable all transitions during active drag to keep response instant.
        const transition = isDragging
          ? "none"
          : [
              "top 460ms cubic-bezier(0.22,1,0.36,1)",
              "transform 460ms cubic-bezier(0.22,1,0.36,1)",
              "opacity 280ms ease",
            ].join(", ");

        return (
          <div
            key={i}
            className="absolute left-1/2 overflow-hidden rounded-[28px] border border-white/[0.08]"
            style={{
              // Fixed card size.
              width: "100%",
              height: `${CARD_H}px`,
              touchAction: "pan-y",
              // Position driven by `top` for peek; transform for drag + scale.
              top: `${topPx}px`,
              transform: gone
                ? `translateX(calc(-50% + ${txPx}px - 200%)) scale(${scale}) translateZ(0)`
                : `translateX(calc(-50% + ${txPx}px)) scale(${scale}) rotate(${dragRot}deg) translateZ(0)`,
              // Promote front + next card to own GPU layer — compositor-only
              // swipe = zero repaint on every touchmove frame.
              willChange: pos >= 0 && pos <= 1 ? "transform, top" : "auto",
              backfaceVisibility: "hidden",
              transformStyle: "flat",
              opacity,
              zIndex: urls.length - Math.abs(pos),
              transition,
              boxShadow: shadow,
              pointerEvents: front ? "auto" : "none",
            }}
          >
            {/* ── Image ── */}
            <img
              src={url}
              alt={`Slide ${i + 1}`}
              className="h-full w-full touch-pan-y object-cover pointer-events-none"
              style={{ touchAction: "pan-y" }}
              // Eagerly load current + next; defer everything else.
              loading="lazy"
              decoding="async"
              // Hint the network scheduler: current card is high-priority,
              // next card low, rest auto — helps on slow connections.
              fetchPriority="auto"
              draggable={false}
              onError={(e) => {
                e.currentTarget.src =
                  "https://picsum.photos/seed/fallback/800/600.jpg";
              }}
            />

            {/* Top-edge glassy sheen — front card only */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[linear-gradient(180deg,rgba(255,255,255,0.11),transparent)]"
              style={{
                opacity: front ? 1 : 0,
                transition: "opacity 300ms ease",
              }}
            />

            {/* Bottom gradient for dot/badge legibility — front card only */}
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.60))]"
              style={{
                opacity: front ? 1 : 0,
                transition: "opacity 300ms ease",
              }}
            />

            {/* Progressive darkening on behind cards */}
            <div
              className="pointer-events-none absolute inset-0 bg-black"
              style={{
                opacity: front ? 0 : Math.min(0.14 + depth * 0.09, 0.32),
                transition: "opacity 300ms ease",
              }}
            />
          </div>
        );
      })}

      {/* ── Dot indicators ── anchored to the front card's bottom interior */}
      {n > 1 && (
        <div
          className="pointer-events-none absolute left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/15 bg-black/35 px-2.5 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md"
          style={{ bottom: "14px" }}
        >
          {urls.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === index
                  ? "w-4 bg-white shadow-[0_0_8px_rgba(255,255,255,0.55)]"
                  : "w-1 bg-white/30"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PostMedia — self-contained media + heart-burst layer.
//
// Owns its OWN burst state + double-tap detection so spawning a burst
// re-renders only this one post's media subtree, never the whole feed list.
// Exposes `burstAtCenter()` so the parent's heart-icon button can trigger a
// burst here. The actual like write (onLike) is deferred a frame so the burst
// paints instantly instead of waiting on the parent's heavy re-render.
// ---------------------------------------------------------------------------

interface PostMediaHandle {
  burstAtCenter: () => void;
}

const mediaResourceKey = (url?: string) =>
  typeof url === "string" ? url.split(/[?#]/, 1)[0] : "";

const PostMedia = memo(
  forwardRef<
    PostMediaHandle,
    {
      post: FeedPost;
      onLike: (postId: string) => void;
      heartColor: string;
      topLikeTapper?: UserLikeEntry;
      topLikeBadgeSide?: "left" | "right";
      onOpenLikes?: () => void;
    }
  >(function PostMedia(
    {
      post,
      onLike,
      heartColor,
      topLikeTapper,
      topLikeBadgeSide = "left",
      onOpenLikes,
    },
    ref,
  ) {
    const [bursts, setBursts] = useState<HeartBurst[]>([]);
    // Keep media mounted during optimistic/realtime like updates. Backend
    // envelopes can briefly omit media while post likes refresh.
    const stableMediaRef = useRef(post.media);
    const stableMediaUrlsRef = useRef(post.media_urls);
    if (
      post.media?.url &&
      mediaResourceKey(post.media.url) !==
        mediaResourceKey(stableMediaRef.current?.url)
    ) {
      stableMediaRef.current = post.media;
    }
    if (
      post.media_urls?.length &&
      (post.media_urls.length !== stableMediaUrlsRef.current?.length ||
        post.media_urls.some(
          (url, index) =>
            mediaResourceKey(url) !==
            mediaResourceKey(stableMediaUrlsRef.current?.[index]),
        ))
    ) {
      stableMediaUrlsRef.current = post.media_urls;
    }
    const resolvedMedia = stableMediaRef.current ?? post.media;
    const resolvedMediaUrls = stableMediaUrlsRef.current ?? post.media_urls;
    const pendingTapRef = useRef<{
      time: number;
      clientX: number;
      clientY: number;
    } | null>(null);
    const burstIdCounter = useRef(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const pointerStartRef = useRef<{
      pointerId: number;
      clientX: number;
      clientY: number;
    } | null>(null);

    const spawnBurst = useCallback((x: number, y: number) => {
      const id = ++burstIdCounter.current;
      const burst: HeartBurst = {
        id,
        x: x + (Math.random() - 0.5) * 28,
        y: y + (Math.random() - 0.5) * 18,
        scale: 0.8 + Math.random() * 0.5,
      };
      setBursts((prev) => [...prev.slice(-23), burst]);
      setTimeout(() => {
        setBursts((prev) => prev.filter((b) => b.id !== id));
      }, BURST_LIFETIME + 100);
    }, []);

    // Keep feedback inside the user gesture so mobile audio can unlock.
    const fireLike = useCallback(() => {
      onLike(post.id);
    }, [onLike, post.id]);

    useImperativeHandle(
      ref,
      () => ({
        burstAtCenter: () => {
          const el = containerRef.current;
          spawnBurst(
            el ? el.clientWidth / 2 : 160,
            el ? el.clientHeight / 2 : 160,
          );
        },
      }),
      [spawnBurst],
    );

    const handleTap = useCallback(
      (
        clientX: number,
        clientY: number,
        element: HTMLElement,
        eventTime: number,
      ) => {
        const pendingTap = pendingTapRef.current;
        if (
          !pendingTap ||
          eventTime - pendingTap.time > DOUBLE_TAP_DELAY
        ) {
          pendingTapRef.current = { time: eventTime, clientX, clientY };
          return;
        }

        // Consume a strict pair. The next physical tap always starts a fresh
        // pair, even while earlier heart bursts are still animating.
        pendingTapRef.current = null;
        const rect = element.getBoundingClientRect();
        spawnBurst(clientX - rect.left, clientY - rect.top);
        fireLike();
      },
      [spawnBurst, fireLike],
    );

    const handlePointerDown = useCallback(
      (event: PointerEvent<HTMLDivElement>) => {
        if (event.target instanceof Element && event.target.closest('button,a,input,textarea,select,video,audio,[role="button"]')) {
          pointerStartRef.current = null;
          pendingTapRef.current = null;
          return;
        }
        if (!event.isPrimary || event.button !== 0) return;
        pointerStartRef.current = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
        };
      },
      [],
    );

    const handlePointerUp = useCallback(
      (event: PointerEvent<HTMLDivElement>) => {
        const start = pointerStartRef.current;
        pointerStartRef.current = null;
        if (event.target instanceof Element && event.target.closest('button,a,input,textarea,select,video,audio,[role="button"]')) {
          pendingTapRef.current = null;
          return;
        }

        if (!start || start.pointerId !== event.pointerId) return;
        if (
          Math.hypot(
            event.clientX - start.clientX,
            event.clientY - start.clientY,
          ) >= 10
        ) {
          return;
        }

        event.stopPropagation();
        handleTap(
          event.clientX,
          event.clientY,
          event.currentTarget,
          event.timeStamp,
        );
      },
      [handleTap],
    );

    const handlePointerCancel = useCallback(() => {
      pointerStartRef.current = null;
    }, []);

    const topLikeBadge = topLikeTapper ? (
      <LikeTapBadge
        count={topLikeTapper.tapCount}
        actorId={topLikeTapper.userId}
        actorName={getLikeEntryName(topLikeTapper)}
        color={heartColor}
        side={topLikeBadgeSide}
        onOpen={onOpenLikes}
      />
    ) : null;

    if (resolvedMediaUrls && resolvedMediaUrls.length > 0) {
      return (
        <div className="feed-post-media-frame px-1 -mt-2">
          <div
            ref={containerRef}
            id={`media-${post.id}`}
            data-feed-post-media
            className="relative"
            style={{ touchAction: "auto" }}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            <HorizontalCarouselMedia urls={resolvedMediaUrls} />
            <HeartBurstLayer bursts={bursts} color={heartColor} />
            {topLikeBadge}
          </div>
        </div>
      );
    }

    if (resolvedMedia && resolvedMedia.url) {
      return (
        <div className="feed-post-media-frame feed-post-single-media-frame px-1">
          <div
            ref={containerRef}
            id={`media-${post.id}`}
            data-feed-post-media
            className="w-full relative cursor-pointer rounded-3xl overflow-hidden"
            style={{ touchAction: "pan-y" }}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            {resolvedMedia.type === "image" ? (
              <img
                src={resolvedMedia.url}
                alt="Post media"
                className="w-full object-cover"
                style={{
                  aspectRatio: "4 / 5",
                  maxHeight: "min(70dvh, 600px)",
                }}
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  e.currentTarget.src =
                    "https://picsum.photos/seed/fallback/800/600.jpg";
                }}
              />
            ) : resolvedMedia.type === "video" ? (
              <video
                src={resolvedMedia.url}
                aria-label="Post video"
                controls
                playsInline
                preload="metadata"
                className="w-full bg-black object-contain rounded-3xl"
                style={{
                  aspectRatio: "4 / 5",
                  maxHeight: "min(70dvh, 600px)",
                }}
              />
            ) : (
              <div
                className="w-full bg-black flex flex-col items-center justify-center gap-4 rounded-3xl px-6"
                style={{
                  aspectRatio: "4 / 5",
                  maxHeight: "min(70dvh, 600px)",
                }}
              >
                <div className="text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-[#4ade80] to-[#22c55e] rounded-2xl flex items-center justify-center mb-3 mx-auto">
                    <Music size={28} className="text-black" />
                  </div>
                  <p className="text-white font-medium">Audio File</p>
                  {resolvedMedia.duration && (
                    <p className="text-[#94a3b8] text-sm mt-1">
                      {resolvedMedia.duration}
                    </p>
                  )}
                </div>
                <audio
                  src={resolvedMedia.url}
                  aria-label="Post audio"
                  controls
                  preload="metadata"
                  className="w-full max-w-md"
                />
              </div>
            )}
            <HeartBurstLayer bursts={bursts} color={heartColor} />
            {topLikeBadge}
          </div>
        </div>
      );
    }

    return null;
  }),
  (previous, next) => {
    const previousMedia = previous.post.media;
    const nextMedia = next.post.media;
    const previousUrls = previous.post.media_urls;
    const nextUrls = next.post.media_urls;

    return (
      previous.onLike === next.onLike &&
      previous.heartColor === next.heartColor &&
      previous.post.id === next.post.id &&
      previous.topLikeTapper?.userId === next.topLikeTapper?.userId &&
      previous.topLikeTapper?.avatar === next.topLikeTapper?.avatar &&
      previous.topLikeTapper?.tapCount === next.topLikeTapper?.tapCount &&
      previous.topLikeBadgeSide === next.topLikeBadgeSide &&
      previousUrls?.length === nextUrls?.length &&
      (!previousUrls ||
        !nextUrls ||
        previousUrls.every((url, index) => url === nextUrls[index])) &&
      previousMedia?.url === nextMedia?.url &&
      previousMedia?.type === nextMedia?.type &&
      previousMedia?.duration === nextMedia?.duration
    );
  },
);

// ---------------------------------------------------------------------------
// Main FeedScreen
// ---------------------------------------------------------------------------

function FeedHeaderJailIcon() {
  return (
    <span className="relative flex h-[30px] w-[30px] items-center justify-center rounded-[10px] border border-white/20 bg-black/34 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_8px_18px_rgba(0,0,0,0.28)]">
      <svg
        width="24"
        height="24"
        viewBox="0 0 18 18"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="9" cy="5.2" r="2.2" stroke="currentColor" strokeWidth="1.45" />
        <path
          d="M9 7.6v4.2M5.8 9.1 9 10.6l3.2-1.5M7.1 15l1.9-3.2L10.9 15"
          stroke="currentColor"
          strokeWidth="1.45"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {[3.6, 7.2, 10.8, 14.4].map((x) => (
          <path
            key={x}
            d={`M${x} 2.1v13.8`}
            stroke="currentColor"
            strokeWidth="1.05"
            strokeLinecap="round"
            opacity="0.62"
          />
        ))}
      </svg>
      <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-white/70 shadow-[0_0_10px_rgba(255,255,255,0.42)]" />
    </span>
  );
}

export function FeedScreen({
  isActive = true,
  onBack,
  onCreatePost,
  onNavigateToChat,
  onNavigateToAlerts,
  onNavigateToSearch,
  onNavigateToDares,
  onNavigateToSocialDares,
  onNavigateToTruths,
  onNavigateToCommunityDares,
  onNavigateToDareCenter,
  onNavigateToBirthdayRoom,
  onNavigateToProfile,
  onNavigateToVerdict,
  onDareUser,
  onAskTruthUser,
  onCreatePrediction,
  onCreateRumour,
  onSendToDarren,
  onStoryComposerOpenChange,
  onStoryViewerOpenChange,
  onCommentsModalOpenChange,
  onPostOptionsOpenChange,
}: {
  isActive?: boolean;
  onBack: () => void;
  onCreatePost: () => void;
  onNavigateToChat: () => void;
  onNavigateToAlerts: () => void;
  onNavigateToSearch: () => void;
  onNavigateToDares: () => void;
  onNavigateToSocialDares: (dare?: DarePost) => void;
  onNavigateToTruths: (truth?: TruthPost) => void;
  onNavigateToCommunityDares: () => void;
  onNavigateToDareCenter: () => void;
  onNavigateToBirthdayRoom?: () => void;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToVerdict?: (verdictId: string) => void;
  onDareUser?: (targetUser: {
    id: string;
    name: string;
    username: string;
    avatar: string;
  }) => void;
  onAskTruthUser?: (targetUser: {
    id: string;
    name: string;
    username: string;
    avatar: string;
  }) => void;
  onCreatePrediction?: () => void;
  onCreateRumour?: () => void;
  onSendToDarren?: () => void;
  onStoryComposerOpenChange?: (isOpen: boolean) => void;
  onStoryViewerOpenChange?: (isOpen: boolean) => void;
  onCommentsModalOpenChange?: (isOpen: boolean) => void;
  onPostOptionsOpenChange?: (isOpen: boolean) => void;
}) {
  const { getOrCreateConversation, sendRealTimeMessage } = useMessagingStore();
  const unreadCount = useMessagingStore((s) =>
    s.conversations.reduce(
      (total: number, conv: any) => total + (conv.unread_count || 0),
      0,
    ),
  );
  const {
    posts,
    loading,
    feedBootstrapping,
    addLike: storeAddLike,
    addComment: storeAddComment,
    likeComment: storeLikeComment,
    deletePost: storeDeletePost,
    incrementViews: storeIncrementViews,
    subscribeToPostComments,
    unsubscribeFromPostComments,
    subscribeToPostLikes,
    unsubscribeFromPostLikes,
    loadPostLikePreviews,
    loadMorePosts,
    pendingUpload,
  } = usePostsStore();
  const {
    truthPosts,
    darePosts,
    truthPostsUserId,
    darePostsUserId,
    truthPostsScope,
    darePostsScope,
    loadTruthPosts,
    loadDarePosts,
  } = useContentStore();
  const { user } = useAuthStore();
  const userProfiles = useProfileDataStore((s) => s.userProfiles);
  const currentDisplayName = useProfileDataStore((s) => s.currentDisplayName);
  const currentUsername = useProfileDataStore((s) => s.currentUsername);
  const currentProfileUserId = useProfileDataStore((s) => s.currentUserId);
  const alertUnreadCount = useAlertStore((s) => s.unreadCount);
  const predictions = usePredictionStore((s) => s.predictions);
  const deals = useDealStore((s) => s.deals);
  const rumours = useDramaStore((s) => s.rumours);
  const promises = useDramaStore((s) => s.promises);
  const customs = useDramaStore((s) => s.customs || []);
  const feedVerdictFriends = useVerdictsStore((s) => s.friends);
  const feedVerdictTopics = useVerdictsStore((s) => s.topics);
  const verdictsLoading = useVerdictsStore((s) => s.loading);
  const verdictsLoadingMore = useVerdictsStore((s) => s.loadingMore);
  const verdictsError = useVerdictsStore((s) => s.error);
  const votingByVerdictId = useVerdictsStore((s) => s.votingById);
  const loadVerdicts = useVerdictsStore((s) => s.loadVerdicts);
  const voteVerdict = useVerdictsStore((s) => s.vote);
  const feedVerdicts = useMemo(
    () => mergeFeedVerdicts(feedVerdictFriends, feedVerdictTopics),
    [feedVerdictFriends, feedVerdictTopics],
  );
  const feedHotTakes = useMemo<FeedHotTakeItem[]>(() => {
    const items: FeedHotTakeItem[] = [
      ...truthPosts
        .filter((truth) => truth.state === "APPROVED" && truth.answer?.trim())
        .slice(0, 8)
        .map((truth) => ({
          type: "truth" as const,
          id: truth.id,
          createdAt: truth.createdAt,
          truth,
        })),
      ...predictions.slice(0, 8).map((prediction) => ({
        type: "prediction" as const,
        id: prediction.id,
        createdAt: prediction.createdAt,
        prediction,
      })),
      ...deals.slice(0, 8).map((deal) => ({
        type: "deal" as const,
        id: deal.id,
        createdAt: deal.createdAt,
        deal,
      })),
      ...rumours.slice(0, 8).map((rumour) => ({
        type: "rumour" as const,
        id: rumour.id,
        createdAt: rumour.createdAt,
        rumour,
      })),
      ...promises.slice(0, 8).map((promise) => ({
        type: "promise" as const,
        id: promise.id,
        createdAt: promise.createdAt,
        promise,
      })),
      ...customs.slice(0, 8).map((custom) => ({
        type: "custom" as const,
        id: custom.id,
        createdAt: custom.createdAt,
        custom,
      })),
    ];

    return items
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
          b.id.localeCompare(a.id),
      )
      .slice(0, 18);
  }, [customs, deals, predictions, promises, rumours, truthPosts]);
  const predictionMentionCount = useMemo(() => {
    if (!user?.id) return 0;
    const viewerId = String(user.id).trim();
    return predictions.filter(
      (prediction) =>
        prediction.subject.type === "friend" &&
        String(prediction.subject.id).trim() === viewerId &&
        !prediction.subjectThought &&
        !prediction.verdict,
    ).length;
  }, [predictions, user?.id]);
  const { markAllAsRead } = useAlertStore();
  const jailSession = useJailStore((s) => s.session);
  const hasLiveJail = Boolean(jailSession && !jailSession.released);
  const [showJailEventIcon, setShowJailEventIcon] = useState(false);

  useEffect(() => {
    if (!isActive || !user?.id) return;
    void loadDramaFeed(false);
  }, [isActive, user?.id]);

  useEffect(() => {
    if (
      !isActive ||
      !user?.id ||
      feedVerdicts.length > 0 ||
      verdictsLoading ||
      verdictsLoadingMore ||
      verdictsError
    ) {
      return;
    }
    void loadVerdicts("friends");
  }, [
    feedVerdicts.length,
    isActive,
    loadVerdicts,
    user?.id,
    verdictsLoading,
    verdictsLoadingMore,
    verdictsError,
  ]);

  useEffect(() => {
    if (!hasLiveJail || !isActive) {
      setShowJailEventIcon(false);
      return;
    }

    const interval = window.setInterval(() => {
      setShowJailEventIcon((current) => !current);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [hasLiveJail, isActive]);

  // Helper: resolve author display name and username from profileDataStore
  const resolveAuthor = useCallback(
    (author: {
      id?: string;
      name: string;
      username: string;
      avatar: string;
    }) => {
      const authorId = author.id;
      const isCurrentUser =
        authorId && currentProfileUserId && authorId === currentProfileUserId;

      let name = author.name;
      let username = author.username;

      if (isCurrentUser && currentDisplayName) {
        name = currentDisplayName;
      } else if (authorId && userProfiles[authorId]) {
        name = userProfiles[authorId].displayName || name;
      }

      if (isCurrentUser && currentUsername) {
        username = currentUsername;
      } else if (authorId && userProfiles[authorId]) {
        username = userProfiles[authorId].username || username;
      }

      return { ...author, name, username };
    },
    [userProfiles, currentDisplayName, currentUsername, currentProfileUserId],
  );

  const [activeMenuPostId, setActiveMenuPostId] = useState<string | null>(null);
  const [activeMenuPost, setActiveMenuPost] = useState<FeedPost | null>(null);
  const [locallyDeletedPostIds, setLocallyDeletedPostIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [activeMenuAuthor, setActiveMenuAuthor] = useState<{
    id?: string;
    name: string;
    username: string;
    avatar: string;
  } | null>(null);
  const [showLikesModal, setShowLikesModal] = useState(false);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [expandedSparkPostIds, setExpandedSparkPostIds] = useState<Set<string>>(
    new Set(),
  );
  const [showDareCenterPrompt, setShowDareCenterPrompt] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const lastScrollYRef = useRef(0);
  const headerScrollAnchorRef = useRef(0);
  const headerScrollDirectionRef = useRef<"up" | "down" | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const optimisticLikeProofRef = useRef<Record<string, UserLikeEntry>>({});
  const [animatingPosts, setAnimatingPosts] = useState<Set<string>>(new Set());
  const [likeMilestonePosts, setLikeMilestonePosts] = useState<Record<string, number>>(
    {},
  );
  const likeMilestoneTimersRef = useRef<Record<string, number>>({});
  const pendingLikeMilestonesRef = useRef<Record<string, number[]>>({});
  const likeFeedbackRef = useRef<ReturnType<typeof createFeedLikeFeedback> | null>(null);
  const [showStoryTypeSheet, setShowStoryTypeSheet] = useState(false);
  const [showStoryUploadModal, setShowStoryUploadModal] = useState(false);
  const [storyComposerStage, setStoryComposerStage] =
    useState<StoryComposerStage>("audience");
  const [storyPostedPulse, setStoryPostedPulse] = useState(false);
  const [storyUploadMode, setStoryUploadMode] = useState<StoryType | null>(
    null,
  );
  const [storyGallerySnap, setStoryGallerySnap] =
    useState<StoryGallerySnap>(25);
  const [dedicationRecipient, setDedicationRecipient] = useState<Friend | null>(
    null,
  );
  const [storyDraftFiles, setStoryDraftFiles] = useState<File[]>([]);
  const [storyDraftPreviewUrls, setStoryDraftPreviewUrls] = useState<string[]>(
    [],
  );
  const [selectedStoryDraftIndex, setSelectedStoryDraftIndex] = useState(0);
  const [storyMediaTransform, setStoryMediaTransform] = useState({
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
  });
  const [isStoryMediaDragging, setIsStoryMediaDragging] = useState(false);
  const [storyDraftText, setStoryDraftText] = useState("");
  const [storyDraftTextColor, setStoryDraftTextColor] = useState("#ffffff");
  const [storyDraftTextX, setStoryDraftTextX] = useState(50);
  const [storyDraftTextY, setStoryDraftTextY] = useState(50);
  const [storyDraftTextSize, setStoryDraftTextSize] = useState(22);
  const [storyDraftTextScale, setStoryDraftTextScale] = useState(1);
  const [storyDraftTextRotation, setStoryDraftTextRotation] = useState(0);
  const [storyDraftTextFont, setStoryDraftTextFont] = useState("Bubble");
  const [storyDraftTextBg, setStoryDraftTextBg] = useState(true);
  const [storyDraftTextAlign, setStoryDraftTextAlign] = useState<
    "left" | "center" | "right"
  >("center");
  const [isStoryTextDragging, setIsStoryTextDragging] = useState(false);
  const [isStoryTextEditorOpen, setIsStoryTextEditorOpen] = useState(false);
  const [storyTextSelected, setStoryTextSelected] = useState(false);
  const [storyDeleteActive, setStoryDeleteActive] = useState(false);
  const [storyDeleteArmed, setStoryDeleteArmed] = useState(false);
  const [storyDraftFilter, setStoryDraftFilter] =
    useState<StoryFilterId>("original");
  const [storyDraftMusicId, setStoryDraftMusicId] = useState("none");
  const [storyPublishAudience, setStoryPublishAudience] = useState<
    "story" | "close-friends"
  >("story");
  const [storyToolbarCollapsed, setStoryToolbarCollapsed] = useState(false);
  const [isStoryMusicModalOpen, setIsStoryMusicModalOpen] = useState(false);
  const [storyMusicSearch, setStoryMusicSearch] = useState("");
  const [storyMusicTrim, setStoryMusicTrim] = useState(15);
  const [storyPreviewMusicId, setStoryPreviewMusicId] = useState<string | null>(
    null,
  );
  const [isStoryDrawMode, setIsStoryDrawMode] = useState(false);
  const [storyBrush, setStoryBrush] = useState<StoryBrushId>("Pen");
  const [storyBrushSize, setStoryBrushSize] = useState(7);
  const [storyBrushColor, setStoryBrushColor] = useState("#ffffff");
  const [storyDrawPaths, setStoryDrawPaths] = useState<
    {
      id: string;
      d: string;
      color: string;
      width: number;
      brush: StoryBrushId;
    }[]
  >([]);
  const [showStoryViewerModal, setShowStoryViewerModal] = useState(false);
  const [selectedStoryIndex, setSelectedStoryIndex] = useState(0);
  const [viewerStories, setViewerStories] = useState<StoryDTO[]>([]);
  const [viewerIsOwner, setViewerIsOwner] = useState(false);
  const [viewerStoryAuthorId, setViewerStoryAuthorId] = useState<string | null>(
    null,
  );
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [sendingRecipientId, setSendingRecipientId] = useState<string | null>(
    null,
  );
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [selectedCommunityChallenge, setSelectedCommunityChallenge] =
    useState<CommunityChallenge | null>(null);
  const [showCommunityChallengeHub, setShowCommunityChallengeHub] =
    useState(false);
  const [showDareEventsScreen, setShowDareEventsScreen] = useState(false);
  const [showRoastJailScreen, setShowRoastJailScreen] = useState(false);
  const [showFriendshipCourtScreen, setShowFriendshipCourtScreen] =
    useState(false);
  const [showCircleJailScreen, setShowCircleJailScreen] = useState(false);
  const [showCircleSelector, setShowCircleSelector] = useState(false);
  const [showCircleCreateModal, setShowCircleCreateModal] = useState(false);
  const [openCircleId, setOpenCircleId] = useState<string | null>(null);
  const [circleManageId, setCircleManageId] = useState<string | null>(null);
  const [customCircles, setCustomCircles] = useState<CircleRecord[]>([]);
  const [circleDraftName, setCircleDraftName] = useState("");
  const [circleManageName, setCircleManageName] = useState("");
  const [communityChallengeSummaries, setCommunityChallengeSummaries] =
    useState<Record<string, CommunityChallengeSummary>>({});
  const [joinedCommunityChallengeIds, setJoinedCommunityChallengeIds] =
    useState<Set<string>>(() => new Set());
  const storyDraftFile = storyDraftFiles[selectedStoryDraftIndex] ?? null;
  const storyDraftPreviewUrl =
    storyDraftPreviewUrls[selectedStoryDraftIndex] ?? "";
  const filteredStoryMusicPresets = useMemo(() => {
    const query = storyMusicSearch.trim().toLowerCase();
    if (!query) return STORY_MUSIC_PRESETS;
    return STORY_MUSIC_PRESETS.filter(
      (music) =>
        music.label.toLowerCase().includes(query) ||
        music.description.toLowerCase().includes(query),
    );
  }, [storyMusicSearch]);

  const {
    stories,
    userStories,
    isLoading: storiesLoading,
    markStoryAsViewed,
    deleteStory,
    isUploading,
    uploadProgress,
    subscribeToFriendsStories,
    subscribeToUserStories,
    unsubscribeFromAllStories,
  } = useStoryStore();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isLoadingMoreRef = useRef(false);
  const postsCountRef = useRef(0);
  const exhaustedLoadAttemptsRef = useRef(0);
  const hasScrolledSinceFeedActivatedRef = useRef(false);
  const requestedLikePreviewPostIdsRef = useRef<Set<string>>(new Set());
  const [likePreviewBatchTick, setLikePreviewBatchTick] = useState(0);
  const [hasMorePosts, setHasMorePosts] = useState(true);

  // Imperative handles to each post's PostMedia child so the heart-icon
  // button can trigger a burst inside the media without lifting burst state
  // up to this (heavy) parent component.
  const postMediaRefs = useRef<Record<string, PostMediaHandle | null>>({});
  const storyDraftPreviewRef = useRef<HTMLDivElement | null>(null);
  const storyMediaMainRef = useRef<HTMLDivElement | null>(null);
  const storyTextLayerRef = useRef<HTMLDivElement | null>(null);
  const storyDraftPreviewUrlsRef = useRef<string[]>([]);
  const storyFilterTouchStartXRef = useRef<number | null>(null);
  const storyGalleryTouchStartYRef = useRef<number | null>(null);
  const storyMediaPointersRef = useRef<Map<number, { x: number; y: number }>>(
    new Map(),
  );
  const storyMediaGestureRef = useRef<{
    distance: number;
    angle: number;
    centerX: number;
    centerY: number;
    startX: number;
    startY: number;
    transform: typeof storyMediaTransform;
  } | null>(null);
  const storyMediaVisualRef = useRef(storyMediaTransform);
  const storyMediaMovedRef = useRef(false);
  const storyTextPointersRef = useRef<Map<number, { x: number; y: number }>>(
    new Map(),
  );
  const storyTextGestureRef = useRef<{
    distance: number;
    angle: number;
    scale: number;
    rotation: number;
  } | null>(null);
  const storyTextDragOffsetRef = useRef({ x: 0, y: 0 });
  const storyTextVisualRef = useRef({
    x: storyDraftTextX,
    y: storyDraftTextY,
    scale: storyDraftTextScale,
    rotation: storyDraftTextRotation,
  });
  const storyTextPositionFrameRef = useRef<number | null>(null);
  const storyMediaPositionFrameRef = useRef<number | null>(null);
  const storyDeleteArmedRef = useRef(false);
  const storyTextWasEmptyBeforeEditRef = useRef(true);
  const storyTextTapStartRef = useRef<{ x: number; y: number } | null>(null);
  const storyTextMovedRef = useRef(false);
  const storyActiveDrawPathIdRef = useRef<string | null>(null);
  const storyTypeLongPressTimerRef = useRef<number | null>(null);
  const storyTypeLongPressTriggeredRef = useRef(false);
  const storyPreviewMusicPlayerRef = useRef<{ stop: () => void } | null>(null);
  const storyPostedPulseTimeoutRef = useRef<number | null>(null);
  const dareCenterLongPressTimerRef = useRef<number | null>(null);
  const dareCenterLongPressTriggeredRef = useRef(false);
  const storyTextVerticalSnapActiveRef = useRef(false);
  const storyMediaVerticalSnapActiveRef = useRef(false);

  useEffect(
    () => () => {
      Object.values(likeMilestoneTimersRef.current).forEach((timer) =>
        window.clearTimeout(timer),
      );
      likeFeedbackRef.current?.dispose();
      likeFeedbackRef.current = null;
      pendingLikeMilestonesRef.current = {};
    },
    [],
  );

  const clearDareCenterLongPressTimer = useCallback(() => {
    if (dareCenterLongPressTimerRef.current !== null) {
      window.clearTimeout(dareCenterLongPressTimerRef.current);
      dareCenterLongPressTimerRef.current = null;
    }
  }, []);

  const openDareCenterPrompt = useCallback(() => {
    clearDareCenterLongPressTimer();
    dareCenterLongPressTriggeredRef.current = true;
    setIsHeaderVisible(true);
    setShowDareCenterPrompt(true);
  }, [clearDareCenterLongPressTimer]);

  const handleDareLogoPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      clearDareCenterLongPressTimer();
      dareCenterLongPressTriggeredRef.current = false;
      dareCenterLongPressTimerRef.current = window.setTimeout(() => {
        openDareCenterPrompt();
      }, 650);
    },
    [clearDareCenterLongPressTimer, openDareCenterPrompt],
  );

  const handleDareLogoPointerUp = useCallback(() => {
    clearDareCenterLongPressTimer();
  }, [clearDareCenterLongPressTimer]);

  const handleEnterDareCenter = useCallback(() => {
    setShowDareCenterPrompt(false);
    onNavigateToDareCenter();
  }, [onNavigateToDareCenter]);

  const refreshCustomCircles = useCallback(() => {
    if (!user?.id) return;
    setCustomCircles(circleService.getCachedCircles(user.id));
  }, [user?.id]);

  const hydratedCommunityChallenges = useMemo(
    () =>
      communityChallengeService.hydrateChallenges(
        COMMUNITY_CHALLENGES,
        communityChallengeSummaries,
      ),
    [communityChallengeSummaries],
  );

  const selectedHydratedCommunityChallenge = selectedCommunityChallenge
    ? hydratedCommunityChallenges.find(
        (challenge) => challenge.id === selectedCommunityChallenge.id,
      ) || selectedCommunityChallenge
    : null;

  const activeCircle = useMemo(
    () => customCircles.find((circle) => circle.id === openCircleId) || null,
    [customCircles, openCircleId],
  );

  useEffect(() => {
    if (!circleManageId) {
      setCircleManageName("");
      return;
    }
    const target = customCircles.find((circle) => circle.id === circleManageId);
    setCircleManageName(target?.name || "");
  }, [circleManageId, customCircles]);

  const handleJoinCommunityChallenge = useCallback(
    async (challenge: CommunityChallenge) => {
      if (!user?.id) return false;

      setJoinedCommunityChallengeIds((current) => {
        if (current.has(challenge.id)) return current;
        const next = new Set(current);
        next.add(challenge.id);
        return next;
      });

      const result = await communityChallengeService.joinChallenge(challenge, {
        id: user.id,
        username: user.username,
        displayName: user.displayName || user.username,
        avatar: user.avatar || "",
      });

      if (!result.success) {
        setJoinedCommunityChallengeIds((current) => {
          const next = new Set(current);
          next.delete(challenge.id);
          return next;
        });
        return false;
      }

      return true;
    },
    [user?.avatar, user?.displayName, user?.id, user?.username],
  );

  const openCircleManageModal = useCallback((circleId: string) => {
    setCircleManageId(circleId);
    setShowCircleSelector(false);
  }, []);

  const handleCreateCircle = useCallback(async () => {
    if (!user?.id) return;
    const name = circleDraftName.trim();
    if (!name) return;
    const created = await circleService.createCircle(user.id, name);
    setCustomCircles(circleService.getCachedCircles(user.id));
    setCircleDraftName("");
    setShowCircleCreateModal(false);
    setShowCircleSelector(false);
    setOpenCircleId(created.id);
  }, [circleDraftName, user?.id]);

  const handleRenameCircle = useCallback(async () => {
    if (!user?.id || !circleManageId) return;
    const trimmed = circleManageName.trim();
    if (!trimmed) return;
    await circleService.renameCircle(user.id, circleManageId, trimmed);
    refreshCustomCircles();
    setCircleManageId(null);
  }, [circleManageId, circleManageName, refreshCustomCircles, user?.id]);

  const handleDeleteCircle = useCallback(async () => {
    if (!user?.id || !circleManageId) return;
    const target = customCircles.find((circle) => circle.id === circleManageId);
    if (!target) return;
    if (!window.confirm(`Delete ${target.name}? This cannot be undone.`)) {
      return;
    }
    await circleService.deleteCircle(user.id, circleManageId);
    refreshCustomCircles();
    setCircleManageId(null);
    if (openCircleId === circleManageId) {
      setOpenCircleId(null);
    }
  }, [
    circleManageId,
    customCircles,
    openCircleId,
    refreshCustomCircles,
    user?.id,
  ]);

  useEffect(() => {
    return () => clearDareCenterLongPressTimer();
  }, [clearDareCenterLongPressTimer]);

  useEffect(() => {
    return communityChallengeService.subscribeToSummaries(
      COMMUNITY_CHALLENGES.map((challenge) => challenge.id),
      setCommunityChallengeSummaries,
    );
  }, []);

  useEffect(() => {
    return communityChallengeService.subscribeToJoinedChallengeIds(
      user?.id,
      setJoinedCommunityChallengeIds,
    );
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setCustomCircles([]);
      return;
    }

    let active = true;
    setCustomCircles(circleService.getCachedCircles(user.id));

    void circleService
      .loadCircles(user.id)
      .then((circles) => {
        if (active) {
          setCustomCircles(circles);
        }
      })
      .catch((error) => {
        console.error("Failed to load circles:", error);
      });

    return () => {
      active = false;
    };
  }, [user?.id]);

  // ── Header hide/show logic ──
  useEffect(() => {
    const scrollElement = scrollContainerRef.current;
    if (!scrollElement) return;

    const handleScroll = () => {
      if (scrollRafRef.current !== null) return;
      scrollRafRef.current = window.requestAnimationFrame(() => {
        const currentScrollY = scrollElement.scrollTop;
        const scrollDifference = currentScrollY - lastScrollYRef.current;

        const direction =
          scrollDifference > 0 ? "down" : scrollDifference < 0 ? "up" : null;
        if (direction && direction !== headerScrollDirectionRef.current) {
          headerScrollDirectionRef.current = direction;
          headerScrollAnchorRef.current = lastScrollYRef.current;
        }

        const directionalTravel = Math.abs(
          currentScrollY - headerScrollAnchorRef.current,
        );
        if (currentScrollY <= 8) {
          setIsHeaderVisible(true);
        } else if (
          direction === "down" &&
          currentScrollY >= 64 &&
          directionalTravel >= 24
        ) {
          setIsHeaderVisible(false);
        } else if (direction === "up" && directionalTravel >= 20) {
          setIsHeaderVisible(true);
        }

        lastScrollYRef.current = currentScrollY;
        scrollRafRef.current = null;
      });
    };

    scrollElement.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      scrollElement.removeEventListener("scroll", handleScroll);
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, []);

  const currentUser = user
    ? {
        userId: user.id,
        name:
          currentProfileUserId === user.id && currentDisplayName
            ? currentDisplayName
            : user.displayName || user.username,
        username: (() => {
          const uname =
            currentProfileUserId === user.id && currentUsername
              ? currentUsername
              : user.username;
          return uname.startsWith("@") ? uname : `@${uname}`;
        })(),
        avatar: user.avatar || "", // Use actual avatar or empty string
      }
    : {
        userId: "me",
        name: "You",
        username: "@you",
        avatar: "https://picsum.photos/seed/you/100/100.jpg", // Only fallback if no user
      };

  // Subscribe to real-time feed before first paint to avoid stale persisted flashes
  useLayoutEffect(() => {
    if (isActive && currentUser.userId !== "me") {
      usePostsStore.getState().subscribeToFeed(currentUser.userId);
    }
    return () => {
      usePostsStore.getState().unsubscribeFromFeed();
    };
     
  }, [isActive, currentUser.userId]);

  useEffect(() => {
    if (!isActive || currentUser.userId === "me") return;

    const shouldLoadTruths =
      truthPostsUserId !== currentUser.userId || truthPostsScope !== "feed";
    const shouldLoadDares =
      darePostsUserId !== currentUser.userId || darePostsScope !== "feed";

    if (shouldLoadTruths) {
      void loadTruthPosts(false, "feed");
    }
    if (shouldLoadDares) {
      void loadDarePosts(false, "feed");
    }
  }, [
    currentUser.userId,
    darePostsScope,
    darePostsUserId,
    isActive,
    loadDarePosts,
    loadTruthPosts,
    truthPostsScope,
    truthPostsUserId,
  ]);

  const sortedPosts = useMemo(
    () =>
      posts.filter((post) => !locallyDeletedPostIds.has(post.id)).sort((a, b) => {
        const aTime = new Date(a.timestamp).getTime();
        const bTime = new Date(b.timestamp).getTime();
        const normalizedATime = Number.isFinite(aTime) ? aTime : 0;
        const normalizedBTime = Number.isFinite(bTime) ? bTime : 0;

        if (normalizedBTime !== normalizedATime) {
          return normalizedBTime - normalizedATime;
        }

        return b.id.localeCompare(a.id);
      }),
    [locallyDeletedPostIds, posts],
  );

  const feedSocialDares = useMemo(
    () =>
      [...darePosts]
        .filter((dare) => dare.state === "ACCEPTED_REAL" && dare.proof?.url)
        .sort(
          (a, b) => getCreatedAtMs(b.createdAt) - getCreatedAtMs(a.createdAt),
        )
        .slice(0, 8),
    [darePosts],
  );

  // Derive selectedPost from live store data (not a stale snapshot)
  const selectedPost = useMemo(
    () => sortedPosts.find((p) => p.id === selectedPostId) || null,
    [sortedPosts, selectedPostId],
  );

  useEffect(() => {
    if (!isActive || currentUser.userId === "me") return;

    const postIdsNeedingPreview = sortedPosts
      .filter((post) => {
        if (totalLikes(post) <= 0) return false;
        if (requestedLikePreviewPostIdsRef.current.has(post.id)) return false;
        return !Object.values(getLikesByUser(post)).some(
          isDisplayableLikeEntry,
        );
      })
      .map((post) => post.id);

    if (postIdsNeedingPreview.length === 0) return;

    let cancelled = false;
    const batchPostIds = postIdsNeedingPreview.slice(
      0,
      LIKE_PREVIEW_BATCH_SIZE,
    );

    batchPostIds.forEach((postId) =>
      requestedLikePreviewPostIdsRef.current.add(postId),
    );
    void loadPostLikePreviews(batchPostIds).finally(() => {
      if (cancelled) return;
      if (postIdsNeedingPreview.length > batchPostIds.length) {
        window.setTimeout(
          () => setLikePreviewBatchTick((tick) => tick + 1),
          80,
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    currentUser.userId,
    isActive,
    likePreviewBatchTick,
    loadPostLikePreviews,
    sortedPosts,
  ]);

  const storyGroups = useMemo(() => {
    const groups = new Map<
      string,
      { authorId: string; latestAt: number; stories: StoryDTO[] }
    >();

    stories.forEach((story) => {
      const authorId = story.author.id;
      const createdAt = new Date(story.createdAt).getTime();
      const latestAt = Number.isFinite(createdAt) ? createdAt : 0;
      const existing = groups.get(authorId);

      if (existing) {
        existing.stories.push(story);
        existing.latestAt = Math.max(existing.latestAt, latestAt);
      } else {
        groups.set(authorId, {
          authorId,
          latestAt,
          stories: [story],
        });
      }
    });

    return Array.from(groups.values())
      .map((group) => {
        const playbackStories = sortStoriesForPlayback(group.stories);
        const displayStory =
          playbackStories.find((story) => !story.hasViewed) ??
          playbackStories[playbackStories.length - 1];

        return {
          ...group,
          stories: playbackStories,
          displayStory,
          hasViewed: playbackStories.every((story) => story.hasViewed),
        };
      })
      .filter((group) => Boolean(group.displayStory))
      .sort((a, b) => b.latestAt - a.latestAt);
  }, [stories]);
  // Real-time story subscriptions — fire immediately and keep circles live
  useEffect(() => {
    if (isActive && currentUser.userId !== "me") {
      void subscribeToFriendsStories(currentUser.userId);
      void subscribeToUserStories(currentUser.userId);
    }
    return () => {
      unsubscribeFromAllStories();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, currentUser.userId]);

  // Load friends for share modal
  useEffect(() => {
    if (isActive && currentUser.userId !== "me") {
      friendsService
        .getFriends(currentUser.userId)
        .then(setFriends)
        .catch(console.error);
    }
  }, [isActive, currentUser.userId]);

  // Handle opening comments from alert navigation
  useEffect(() => {
    const openCommentsForPost = sessionStorage.getItem("openCommentsForPost");
    const highlightPostId = sessionStorage.getItem("highlightPostId");

    if (openCommentsForPost && posts.length > 0) {
      const post = posts.find((p) => p.id === openCommentsForPost);
      if (post) {
        setSelectedPostId(post.id);
        setShowCommentsModal(true);
        // Clear the flags after using them
        sessionStorage.removeItem("openCommentsForPost");
        sessionStorage.removeItem("highlightPostId");
      }
    }
  }, [posts]);

  useEffect(() => {
    const highlightPostId = sessionStorage.getItem("highlightPostId");
    const openCommentsForPost = sessionStorage.getItem("openCommentsForPost");

    if (!highlightPostId || openCommentsForPost || posts.length === 0) return;

    const target = document.getElementById(`feed-post-${highlightPostId}`);
    if (!target) return;

    const timer = window.setTimeout(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      sessionStorage.removeItem("highlightPostId");
    }, 120);

    return () => window.clearTimeout(timer);
  }, [posts]);

  // Subscribe to likes/comments only for the post the user is interacting with
  // (instead of all visible posts, which created 40+ unnecessary listeners)
  useEffect(() => {
    if (!selectedPost) return;
    const postId = selectedPost.id;

    if (showLikesModal) {
      subscribeToPostLikes(postId);
      return () => unsubscribeFromPostLikes(postId);
    }
    if (showCommentsModal) {
      subscribeToPostComments(postId);
      return () => unsubscribeFromPostComments(postId);
    }
  }, [selectedPost?.id, showLikesModal, showCommentsModal]);

  // Reset spinner whenever the tab becomes inactive so it never shows on return
  useEffect(() => {
    if (!isActive) {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
      exhaustedLoadAttemptsRef.current = 0;
    }
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    const scrollElement = scrollContainerRef.current;
    if (!scrollElement) return;

    hasScrolledSinceFeedActivatedRef.current = false;
    const markScrolled = () => {
      hasScrolledSinceFeedActivatedRef.current = true;
    };

    scrollElement.addEventListener("scroll", markScrolled, { passive: true });

    return () => {
      scrollElement.removeEventListener("scroll", markScrolled);
    };
  }, [isActive]);

  useEffect(() => {
    postsCountRef.current = sortedPosts.length;
    if (sortedPosts.length === 0) {
      exhaustedLoadAttemptsRef.current = 0;
      setHasMorePosts(true);
    }
  }, [sortedPosts.length]);

  // ── Infinite Scroll ──
  // Dependency array intentionally excludes isLoadingMore — use a ref instead
  // so state updates never recreate the observer (which re-fires it immediately).
  useEffect(() => {
    if (!isActive || !hasMorePosts) return;
    const sentinel = loadMoreRef.current;
    if (!sentinel || sortedPosts.length === 0) return;

    const observer = new IntersectionObserver(
      async (entries) => {
        if (
          entries[0].isIntersecting &&
          hasScrolledSinceFeedActivatedRef.current &&
          !isLoadingMoreRef.current
        ) {
          const beforeCount = postsCountRef.current;
          isLoadingMoreRef.current = true;
          setIsLoadingMore(true);
          try {
            await loadMorePosts();
          } finally {
            const afterCount = postsCountRef.current;
            if (afterCount <= beforeCount) {
              exhaustedLoadAttemptsRef.current += 1;
              if (exhaustedLoadAttemptsRef.current >= 2) {
                setHasMorePosts(false);
              }
            } else {
              exhaustedLoadAttemptsRef.current = 0;
            }

            isLoadingMoreRef.current = false;
            setIsLoadingMore(false);
          }
        }
      },
      { rootMargin: "200px", threshold: 0.1 },
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
     
  }, [hasMorePosts, isActive, sortedPosts.length, loadMorePosts]);

  useBodyScrollLock(
    showLikesModal ||
      showCommentsModal ||
      showShareModal ||
      showStoryTypeSheet ||
      showStoryUploadModal ||
      showStoryViewerModal ||
      showCommunityChallengeHub ||
      showDareEventsScreen ||
      showRoastJailScreen ||
      showFriendshipCourtScreen ||
      showCircleSelector ||
      showCircleCreateModal ||
      circleManageId !== null ||
      openCircleId !== null,
  );

  // ── Story handlers ──

  useEffect(() => {
    if (!showShareModal || !user?.id) return;

    let isActive = true;

    const loadFriendsForShare = async () => {
      setLoadingFriends(true);
      try {
        const response = await friendsService.getFriends(user.id);
        if (!isActive) return;
        setFriends(response || []);
      } catch (error) {
        console.error("Failed to load friends for sharing:", error);
        if (isActive) setFriends([]);
      } finally {
        if (isActive) setLoadingFriends(false);
      }
    };

    void loadFriendsForShare();

    return () => {
      isActive = false;
    };
  }, [showShareModal, user?.id]);

  useEffect(() => {
    if (
      !showStoryUploadModal ||
      storyUploadMode !== "dedication" ||
      !user?.id ||
      friends.length > 0
    ) {
      return;
    }

    let isMounted = true;
    setLoadingFriends(true);
    friendsService
      .getFriends(user.id)
      .then((response) => {
        if (isMounted) setFriends(response || []);
      })
      .catch((error) => {
        console.error("Failed to load friends for story dedication:", error);
        if (isMounted) setFriends([]);
      })
      .finally(() => {
        if (isMounted) setLoadingFriends(false);
      });

    return () => {
      isMounted = false;
    };
  }, [showStoryUploadModal, storyUploadMode, user?.id, friends.length]);

  useEffect(() => {
    storyDraftPreviewUrlsRef.current = storyDraftPreviewUrls;
  }, [storyDraftPreviewUrls]);

  const applyStoryMediaTransform = useCallback(() => {
    const element = storyMediaMainRef.current;
    if (!element) return;
    const { x, y, scale, rotation } = storyMediaVisualRef.current;
    element.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale}) rotate(${rotation}deg)`;
  }, []);

  const applyStoryTextTransform = useCallback(() => {
    const element = storyTextLayerRef.current;
    if (!element) return;
    const { x, y, scale, rotation } = storyTextVisualRef.current;
    element.style.left = `${x}%`;
    element.style.top = `${y}%`;
    element.style.transform = `translate3d(-50%, -50%, 0) scale(${scale}) rotate(${rotation}deg)`;
  }, []);

  useLayoutEffect(() => {
    storyMediaVisualRef.current = storyMediaTransform;
    applyStoryMediaTransform();
  }, [applyStoryMediaTransform, storyMediaTransform]);

  useLayoutEffect(() => {
    storyTextVisualRef.current = {
      x: storyDraftTextX,
      y: storyDraftTextY,
      scale: storyDraftTextScale,
      rotation: storyDraftTextRotation,
    };
    applyStoryTextTransform();
  }, [
    applyStoryTextTransform,
    storyDraftTextRotation,
    storyDraftTextScale,
    storyDraftTextX,
    storyDraftTextY,
  ]);

  useEffect(() => {
    onStoryComposerOpenChange?.(showStoryUploadModal || showStoryTypeSheet);
    return () => onStoryComposerOpenChange?.(false);
  }, [onStoryComposerOpenChange, showStoryTypeSheet, showStoryUploadModal]);

  useEffect(() => {
    onCommentsModalOpenChange?.(showCommentsModal);
    return () => onCommentsModalOpenChange?.(false);
  }, [onCommentsModalOpenChange, showCommentsModal]);

  useEffect(() => {
    if (!isStoryMusicModalOpen) {
      stopStoryMusicPreview();
    }
  }, [isStoryMusicModalOpen]);

  useEffect(() => {
    return () => {
      storyDraftPreviewUrlsRef.current.forEach((url) =>
        URL.revokeObjectURL(url),
      );
      storyPreviewMusicPlayerRef.current?.stop();
      if (storyTypeLongPressTimerRef.current !== null) {
        window.clearTimeout(storyTypeLongPressTimerRef.current);
      }
      if (storyPostedPulseTimeoutRef.current !== null) {
        window.clearTimeout(storyPostedPulseTimeoutRef.current);
      }
    };
  }, []);

  const triggerStoryPostedPulse = () => {
    if (storyPostedPulseTimeoutRef.current !== null) {
      window.clearTimeout(storyPostedPulseTimeoutRef.current);
    }

    setStoryPostedPulse(false);
    window.requestAnimationFrame(() => {
      setStoryPostedPulse(true);
      storyPostedPulseTimeoutRef.current = window.setTimeout(() => {
        setStoryPostedPulse(false);
        storyPostedPulseTimeoutRef.current = null;
      }, 2400);
    });
  };

  const openStoryTypeSheet = () => {
    setShowStoryTypeSheet(true);
  };

  const closeStoryTypeSheet = () => {
    setShowStoryTypeSheet(false);
  };

  const clearStoryTypeLongPressTimer = () => {
    if (storyTypeLongPressTimerRef.current !== null) {
      window.clearTimeout(storyTypeLongPressTimerRef.current);
      storyTypeLongPressTimerRef.current = null;
    }
  };

  const handleYourStoryPressStart = (
    event: React.PointerEvent<HTMLElement>,
  ) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    clearStoryTypeLongPressTimer();
    storyTypeLongPressTriggeredRef.current = false;
    storyTypeLongPressTimerRef.current = window.setTimeout(() => {
      storyTypeLongPressTriggeredRef.current = true;
      openStoryTypeSheet();
    }, 420);
  };

  const handleYourStoryPressEnd = () => {
    clearStoryTypeLongPressTimer();
  };

  const handleYourStoryClick = () => {
    if (storyTypeLongPressTriggeredRef.current) {
      storyTypeLongPressTriggeredRef.current = false;
      return;
    }
    if (userStories.length > 0) {
      setViewerStories(sortStoriesForPlayback(userStories));
      setSelectedStoryIndex(0);
      setViewerIsOwner(true);
      setViewerStoryAuthorId(currentUser.userId);
      setShowStoryViewerModal(true);
      onStoryViewerOpenChange?.(true);
      return;
    }
    // No active story — tapping the avatar opens your own profile.
    // The "+" badge remains the affordance for creating a story.
    if (onNavigateToProfile && currentUser.userId) {
      onNavigateToProfile(currentUser.userId);
      return;
    }
    openStoryTypeSheet();
  };

  const openStoryComposer = (mode?: StoryType) => {
    setShowStoryTypeSheet(false);
    setStoryComposerStage(mode ? "capture" : "audience");
    setStoryUploadMode(mode ?? null);
    setDedicationRecipient(null);
    clearStoryDraft();
    setShowStoryUploadModal(true);
    onStoryComposerOpenChange?.(true);
  };

  const closeStoryComposer = () => {
    if (isUploading) return;
    setShowStoryUploadModal(false);
    onStoryComposerOpenChange?.(false);
    setStoryComposerStage("audience");
    setStoryUploadMode(null);
    setDedicationRecipient(null);
    clearStoryDraft();
  };

  const clearStoryDraft = () => {
    storyDraftPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    setStoryDraftFiles([]);
    setStoryDraftPreviewUrls([]);
    setSelectedStoryDraftIndex(0);
    setStoryMediaTransform({ x: 0, y: 0, scale: 1, rotation: 0 });
    setIsStoryMediaDragging(false);
    setStoryDraftText("");
    setStoryDraftTextColor("#ffffff");
    setStoryDraftTextX(50);
    setStoryDraftTextY(50);
    setStoryDraftTextSize(22);
    setStoryDraftTextScale(1);
    setStoryDraftTextRotation(0);
    setStoryDraftTextFont("Bubble");
    setStoryDraftTextBg(true);
    setStoryDraftTextAlign("center");
    setIsStoryTextDragging(false);
    setIsStoryTextEditorOpen(false);
    setStoryTextSelected(false);
    setStoryDeleteActive(false);
    setStoryDeleteArmed(false);
    setStoryDraftFilter("original");
    setStoryDraftMusicId("none");
    setStoryPublishAudience("story");
    setStoryToolbarCollapsed(false);
    setIsStoryMusicModalOpen(false);
    setStoryMusicSearch("");
    setStoryMusicTrim(15);
    setStoryPreviewMusicId(null);
    setIsStoryDrawMode(false);
    setStoryBrush("Pen");
    setStoryBrushSize(7);
    setStoryBrushColor("#ffffff");
    setStoryDrawPaths([]);
    storyFilterTouchStartXRef.current = null;
    storyGalleryTouchStartYRef.current = null;
    storyMediaPointersRef.current.clear();
    storyMediaGestureRef.current = null;
    storyMediaMovedRef.current = false;
    storyMediaVisualRef.current = { x: 0, y: 0, scale: 1, rotation: 0 };
    storyTextPointersRef.current.clear();
    storyTextGestureRef.current = null;
    storyTextDragOffsetRef.current = { x: 0, y: 0 };
    storyTextVisualRef.current = { x: 50, y: 50, scale: 1, rotation: 0 };
    storyDeleteArmedRef.current = false;
    storyTextVerticalSnapActiveRef.current = false;
    storyMediaVerticalSnapActiveRef.current = false;
    storyPreviewMusicPlayerRef.current?.stop();
    storyPreviewMusicPlayerRef.current = null;
    if (storyTextPositionFrameRef.current !== null) {
      window.cancelAnimationFrame(storyTextPositionFrameRef.current);
      storyTextPositionFrameRef.current = null;
    }
    if (storyMediaPositionFrameRef.current !== null) {
      window.cancelAnimationFrame(storyMediaPositionFrameRef.current);
      storyMediaPositionFrameRef.current = null;
    }
    storyActiveDrawPathIdRef.current = null;
  };

  const beginStoryCapture = (mode: StoryType) => {
    setStoryUploadMode(mode);
    setStoryComposerStage("capture");
    setStoryGallerySnap(25);
    setStoryTextSelected(false);
  };

  const triggerStoryHaptic = (duration = 8) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(duration);
    }
  };

  const setStoryFilterByOffset = (offset: number) => {
    const currentIndex = STORY_FILTER_PRESETS.findIndex(
      (filter) => filter.id === storyDraftFilter,
    );
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex =
      (safeIndex + offset + STORY_FILTER_PRESETS.length) %
      STORY_FILTER_PRESETS.length;
    setStoryDraftFilter(STORY_FILTER_PRESETS[nextIndex].id);
  };

  const updateStoryTextPosition = (clientX: number, clientY: number) => {
    const preview = storyDraftPreviewRef.current;
    if (!preview) return;

    const rect = preview.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const nextX =
      ((clientX - rect.left) / rect.width) * 100 -
      storyTextDragOffsetRef.current.x;
    const nextY =
      ((clientY - rect.top) / rect.height) * 100 -
      storyTextDragOffsetRef.current.y;
    const clampedX = Math.min(180, Math.max(-80, nextX));
    const verticalSnap = smoothSnapToCenter(
      nextY,
      50,
      STORY_TEXT_VERTICAL_SNAP_THRESHOLD,
    );
    const clampedY = Math.min(180, Math.max(-80, verticalSnap.value));
    const inDeleteZone = clampedY > 106;
    if (storyTextPositionFrameRef.current !== null) {
      window.cancelAnimationFrame(storyTextPositionFrameRef.current);
    }
    storyTextPositionFrameRef.current = window.requestAnimationFrame(() => {
      storyTextVisualRef.current = {
        ...storyTextVisualRef.current,
        x: clampedX,
        y: clampedY,
      };
      applyStoryTextTransform();
      startTransition(() => {
        setStoryDeleteArmed(inDeleteZone);
      });
      storyTextPositionFrameRef.current = null;
    });
    if (verticalSnap.snapped && !storyTextVerticalSnapActiveRef.current) {
      triggerStoryHaptic(4);
    }
    if (inDeleteZone && !storyDeleteArmedRef.current) {
      triggerStoryHaptic(6);
    }
    storyTextVerticalSnapActiveRef.current = verticalSnap.snapped;
    storyDeleteArmedRef.current = inDeleteZone;
  };

  const getStoryPointerPair = () => {
    const points = Array.from(storyTextPointersRef.current.values());
    if (points.length < 2) return null;
    const [first, second] = points;
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    return {
      distance: Math.hypot(dx, dy),
      angle: Math.atan2(dy, dx) * (180 / Math.PI),
    };
  };

  const handleStoryTextPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setStoryTextSelected(true);
    setStoryDeleteActive(true);
    setIsStoryTextDragging(true);
    storyTextTapStartRef.current = { x: event.clientX, y: event.clientY };
    storyTextMovedRef.current = false;
    storyTextPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
    const pair = getStoryPointerPair();
    const preview = storyDraftPreviewRef.current;
    if (preview && !pair) {
      const rect = preview.getBoundingClientRect();
      storyTextDragOffsetRef.current = {
        x:
          ((event.clientX - rect.left) / rect.width) * 100 -
          storyTextVisualRef.current.x,
        y:
          ((event.clientY - rect.top) / rect.height) * 100 -
          storyTextVisualRef.current.y,
      };
    }
    storyTextGestureRef.current = pair
      ? {
          distance: pair.distance || 1,
          angle: pair.angle,
          scale: storyTextVisualRef.current.scale,
          rotation: storyTextVisualRef.current.rotation,
        }
      : null;
  };

  const handleStoryTextPointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!isStoryTextDragging) return;
    event.preventDefault();
    event.stopPropagation();
    if (!storyTextPointersRef.current.has(event.pointerId)) return;
    const tapStart = storyTextTapStartRef.current;
    if (
      tapStart &&
      Math.hypot(event.clientX - tapStart.x, event.clientY - tapStart.y) > 7
    ) {
      storyTextMovedRef.current = true;
    }
    storyTextPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const pair = getStoryPointerPair();
    if (pair && storyTextGestureRef.current) {
      const nextScale =
        storyTextGestureRef.current.scale *
        (pair.distance / storyTextGestureRef.current.distance);
      storyTextVisualRef.current = {
        ...storyTextVisualRef.current,
        scale: Math.min(6, Math.max(0.25, nextScale)),
        rotation:
          storyTextGestureRef.current.rotation +
          pair.angle -
          storyTextGestureRef.current.angle,
      };
      applyStoryTextTransform();
      return;
    }
    updateStoryTextPosition(event.clientX, event.clientY);
  };

  const handleStoryTextPointerUp = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    storyTextPointersRef.current.delete(event.pointerId);
    const remainingPair = getStoryPointerPair();
    storyTextGestureRef.current = remainingPair
      ? {
          distance: remainingPair.distance || 1,
          angle: remainingPair.angle,
          scale: storyTextVisualRef.current.scale,
          rotation: storyTextVisualRef.current.rotation,
        }
      : null;
    if (!remainingPair && storyTextPointersRef.current.size === 1) {
      const remainingPointer = Array.from(
        storyTextPointersRef.current.values(),
      )[0];
      const preview = storyDraftPreviewRef.current;
      if (preview && remainingPointer) {
        const rect = preview.getBoundingClientRect();
        storyTextDragOffsetRef.current = {
          x:
            ((remainingPointer.x - rect.left) / rect.width) * 100 -
            storyTextVisualRef.current.x,
          y:
            ((remainingPointer.y - rect.top) / rect.height) * 100 -
            storyTextVisualRef.current.y,
        };
      }
    }
    if (storyTextPointersRef.current.size === 0) {
      const shouldOpenEditor =
        event.type !== "pointercancel" &&
        !storyTextMovedRef.current &&
        !storyDeleteArmed &&
        storyDraftText.trim();
      if (storyDeleteArmed) {
        setStoryDraftText("");
        setStoryTextSelected(false);
        triggerStoryHaptic(18);
      }
      setStoryDraftTextX(storyTextVisualRef.current.x);
      setStoryDraftTextY(storyTextVisualRef.current.y);
      setStoryDraftTextScale(storyTextVisualRef.current.scale);
      setStoryDraftTextRotation(storyTextVisualRef.current.rotation);
      setIsStoryTextDragging(false);
      setStoryDeleteActive(false);
      setStoryDeleteArmed(false);
      storyTextVerticalSnapActiveRef.current = false;
      storyDeleteArmedRef.current = false;
      storyTextTapStartRef.current = null;
      storyTextMovedRef.current = false;
      if (shouldOpenEditor) {
        window.setTimeout(() => openStoryTextEditor(), 0);
      }
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const stopStoryMusicPreview = () => {
    storyPreviewMusicPlayerRef.current?.stop();
    storyPreviewMusicPlayerRef.current = null;
    setStoryPreviewMusicId(null);
  };

  const previewStoryMusic = (musicId: string) => {
    if (musicId === "none") {
      stopStoryMusicPreview();
      setStoryDraftMusicId("none");
      return;
    }

    if (storyPreviewMusicId === musicId) {
      stopStoryMusicPreview();
      return;
    }

    storyPreviewMusicPlayerRef.current?.stop();
    storyPreviewMusicPlayerRef.current = createGeneratedStoryMusicPlayer(
      musicId,
      {
        masterGain: 0.05,
        noteDurationMs: Math.max(160, Math.min(280, storyMusicTrim * 12)),
      },
    );
    setStoryPreviewMusicId(storyPreviewMusicPlayerRef.current ? musicId : null);
    setStoryDraftMusicId(musicId);
    triggerStoryHaptic(10);
  };

  const getStoryCanvasPoint = (clientX: number, clientY: number) => {
    const preview = storyDraftPreviewRef.current;
    if (!preview) return null;
    const rect = preview.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    };
  };

  const getStoryMediaPointerPair = () => {
    const points = Array.from(storyMediaPointersRef.current.values());
    if (points.length < 2) return null;
    const [first, second] = points;
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    return {
      distance: Math.hypot(dx, dy),
      angle: Math.atan2(dy, dx) * (180 / Math.PI),
      centerX: (first.x + second.x) / 2,
      centerY: (first.y + second.y) / 2,
    };
  };

  const undoStoryEditorStep = () => {
    if (storyDrawPaths.length > 0) {
      setStoryDrawPaths((paths) => paths.slice(0, -1));
      triggerStoryHaptic(8);
      return;
    }
    if (
      storyMediaTransform.x !== 0 ||
      storyMediaTransform.y !== 0 ||
      storyMediaTransform.scale !== 1 ||
      storyMediaTransform.rotation !== 0
    ) {
      setStoryMediaTransform({ x: 0, y: 0, scale: 1, rotation: 0 });
      triggerStoryHaptic(8);
      return;
    }
    if (storyDraftText.trim()) {
      setStoryDraftText("");
      setStoryTextSelected(false);
      triggerStoryHaptic(8);
    }
  };

  const getStoryTextFontClassName = (font: string) => {
    switch (font) {
      case "Bubble":
        return "story-font-bubble";
      case "Deco":
        return "story-font-deco";
      case "Squeeze":
        return "story-font-squeeze";
      case "Typewriter":
        return "story-font-typewriter";
      case "Classic":
        return "story-font-classic";
      default:
        return "story-font-bubble";
    }
  };

  const openStoryTextEditor = useCallback(() => {
    storyTextWasEmptyBeforeEditRef.current = !storyDraftText.trim();
    setIsStoryTextEditorOpen(true);
  }, [storyDraftText]);

  const finishStoryTextEditing = useCallback(() => {
    if (storyDraftText.trim()) {
      if (storyTextWasEmptyBeforeEditRef.current) {
        setStoryDraftTextX(50);
        setStoryDraftTextY(44);
      }
      setStoryTextSelected(true);
    } else {
      setStoryTextSelected(false);
    }
    setIsStoryTextEditorOpen(false);
  }, [storyDraftText]);

  const handleStoryCanvasPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (isStoryDrawMode) {
      handleStoryDrawPointerDown(event);
      return;
    }
    if (
      event.target instanceof Element &&
      event.target.closest(
        ".story-text-layer,button,input,textarea,.story-panel,.story-bottom-caption,.story-share-row,.story-right-toolbar",
      )
    ) {
      return;
    }

    event.preventDefault();
    setStoryTextSelected(false);
    setIsStoryMediaDragging(true);
    storyMediaMovedRef.current = false;
    storyMediaPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    event.currentTarget.setPointerCapture(event.pointerId);

    const pair = getStoryMediaPointerPair();
    storyMediaGestureRef.current = pair
      ? {
          distance: pair.distance || 1,
          angle: pair.angle,
          centerX: pair.centerX,
          centerY: pair.centerY,
          startX: event.clientX,
          startY: event.clientY,
          transform: storyMediaVisualRef.current,
        }
      : {
          distance: 1,
          angle: 0,
          centerX: event.clientX,
          centerY: event.clientY,
          startX: event.clientX,
          startY: event.clientY,
          transform: storyMediaVisualRef.current,
        };
  };

  const handleStoryCanvasPointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (isStoryDrawMode) {
      handleStoryDrawPointerMove(event);
      return;
    }
    if (!storyMediaPointersRef.current.has(event.pointerId)) return;

    event.preventDefault();
    storyMediaPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const gesture = storyMediaGestureRef.current;
    if (!gesture) return;

    const pair = getStoryMediaPointerPair();
    if (pair) {
      const nextScale =
        gesture.transform.scale * (pair.distance / gesture.distance);
      const nextRotation =
        gesture.transform.rotation + pair.angle - gesture.angle;
      const nextX = gesture.transform.x + pair.centerX - gesture.centerX;
      const nextY = gesture.transform.y + pair.centerY - gesture.centerY;
      const verticalSnap = smoothSnapToCenter(
        nextY,
        0,
        STORY_MEDIA_VERTICAL_SNAP_THRESHOLD,
      );
      if (
        Math.abs(nextX - gesture.transform.x) > 3 ||
        Math.abs(nextY - gesture.transform.y) > 3
      ) {
        storyMediaMovedRef.current = true;
      }
      if (storyMediaPositionFrameRef.current !== null) {
        window.cancelAnimationFrame(storyMediaPositionFrameRef.current);
      }
      storyMediaPositionFrameRef.current = window.requestAnimationFrame(() => {
        storyMediaVisualRef.current = {
          x: Math.max(-1200, Math.min(1200, nextX)),
          y: Math.max(-1600, Math.min(1600, verticalSnap.value)),
          scale: Math.min(6, Math.max(0.25, nextScale)),
          rotation: nextRotation,
        };
        applyStoryMediaTransform();
        storyMediaPositionFrameRef.current = null;
      });
      if (verticalSnap.snapped && !storyMediaVerticalSnapActiveRef.current) {
        triggerStoryHaptic(4);
      }
      storyMediaVerticalSnapActiveRef.current = verticalSnap.snapped;
      return;
    }

    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    const verticalSnap = smoothSnapToCenter(
      gesture.transform.y + dy,
      0,
      STORY_MEDIA_VERTICAL_SNAP_THRESHOLD,
    );
    if (Math.hypot(dx, dy) > 3) storyMediaMovedRef.current = true;
    if (storyMediaPositionFrameRef.current !== null) {
      window.cancelAnimationFrame(storyMediaPositionFrameRef.current);
    }
    storyMediaPositionFrameRef.current = window.requestAnimationFrame(() => {
      storyMediaVisualRef.current = {
        ...gesture.transform,
        x: Math.max(-1200, Math.min(1200, gesture.transform.x + dx)),
        y: Math.max(-1600, Math.min(1600, verticalSnap.value)),
      };
      applyStoryMediaTransform();
      storyMediaPositionFrameRef.current = null;
    });
    if (verticalSnap.snapped && !storyMediaVerticalSnapActiveRef.current) {
      triggerStoryHaptic(4);
    }
    storyMediaVerticalSnapActiveRef.current = verticalSnap.snapped;
  };

  const handleStoryCanvasPointerUp = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (isStoryDrawMode) {
      handleStoryDrawPointerUp(event);
      return;
    }
    if (!storyMediaPointersRef.current.has(event.pointerId)) return;

    event.preventDefault();
    storyMediaPointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const pair = getStoryMediaPointerPair();
    if (pair) {
      storyMediaGestureRef.current = {
        distance: pair.distance || 1,
        angle: pair.angle,
        centerX: pair.centerX,
        centerY: pair.centerY,
        startX: pair.centerX,
        startY: pair.centerY,
        transform: storyMediaVisualRef.current,
      };
    } else {
      const remaining = Array.from(storyMediaPointersRef.current.values())[0];
      storyMediaGestureRef.current = remaining
        ? {
            distance: 1,
            angle: 0,
            centerX: remaining.x,
            centerY: remaining.y,
            startX: remaining.x,
            startY: remaining.y,
            transform: storyMediaVisualRef.current,
          }
        : null;
    }

    if (storyMediaPointersRef.current.size === 0) {
      setStoryMediaTransform(storyMediaVisualRef.current);
      setIsStoryMediaDragging(false);
      storyMediaVerticalSnapActiveRef.current = false;
    }
  };

  const handleStoryDrawPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!isStoryDrawMode) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getStoryCanvasPoint(event.clientX, event.clientY);
    if (!point) return;
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    storyActiveDrawPathIdRef.current = id;
    setStoryDrawPaths((paths) => [
      ...paths,
      {
        id,
        d: `M ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
        color: storyBrushColor,
        width: storyBrushSize,
        brush: storyBrush,
      },
    ]);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleStoryDrawPointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!isStoryDrawMode || !storyActiveDrawPathIdRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getStoryCanvasPoint(event.clientX, event.clientY);
    if (!point) return;
    const segment = ` L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    const activeId = storyActiveDrawPathIdRef.current;
    setStoryDrawPaths((paths) =>
      paths.map((path) =>
        path.id === activeId ? { ...path, d: `${path.d}${segment}` } : path,
      ),
    );
  };

  const handleStoryDrawPointerUp = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!isStoryDrawMode) return;
    event.preventDefault();
    event.stopPropagation();
    storyActiveDrawPathIdRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleStoryClick = async (index: number) => {
    const storyGroup = storyGroups[index];
    if (!storyGroup) return;

    const firstUnviewedIndex = storyGroup.stories.findIndex(
      (story) => !story.hasViewed,
    );
    const nextSelectedIndex = firstUnviewedIndex >= 0 ? firstUnviewedIndex : 0;
    const nextViewerStories = storyGroup.stories.map((story, storyIndex) =>
      storyIndex === nextSelectedIndex ? { ...story, hasViewed: true } : story,
    );

    setSelectedStoryIndex(nextSelectedIndex);
    setViewerStories(nextViewerStories);
    setViewerIsOwner(false);
    setViewerStoryAuthorId(storyGroup.authorId);
    setShowStoryViewerModal(true);
    onStoryViewerOpenChange?.(true);

    const story = storyGroup.stories[nextSelectedIndex];
    if (story && !story.hasViewed) {
      await markStoryAsViewed(story.id, currentUser.userId);
    }
  };

  const handleStoryUpload = async (files: File[]) => {
    try {
      if (files.length === 0) return;
      if (storyUploadMode === "dedication" && !dedicationRecipient) {
        alert("Pick who this story is for first.");
        return;
      }

      useStoryStore.setState({ isUploading: true, uploadProgress: 0 });
      let createdCount = 0;

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const mediaUrl = await storyService.uploadStoryMedia(
          file,
          currentUser.userId,
          (percent) => {
            const overallProgress = Math.round(
              ((index + percent / 100) / files.length) * 100,
            );
            useStoryStore.setState({ uploadProgress: overallProgress });
          },
        );
        const mediaType = file.type.startsWith("video/") ? "video" : "image";

        const request: CreateStoryDTO = {
          mediaUrl,
          mediaType,
          storyType: storyUploadMode || "personal",
          dedicatedToUserId:
            storyUploadMode === "dedication"
              ? dedicationRecipient?.user_id || dedicationRecipient?.id
              : null,
          storyText: storyDraftText.trim()
            ? {
                text: storyDraftText.trim().slice(0, 120),
                color: storyDraftTextColor,
                style: "bold",
                xPct: Math.round(storyDraftTextX),
                yPct: Math.round(storyDraftTextY),
                fontSize: Math.round(storyDraftTextSize * storyDraftTextScale),
                rotation: storyDraftTextRotation,
                font: storyDraftTextFont,
                background: storyDraftTextBg,
                align: storyDraftTextAlign,
              }
            : null,
          storyFilter: storyDraftFilter,
          storyMusic:
            storyDraftMusicId === "none"
              ? null
              : {
                  id: storyDraftMusicId,
                  label: getStoryMusicPreset(storyDraftMusicId).label,
                },
          storyDrawPaths,
          visibility:
            storyPublishAudience === "close-friends"
              ? "CLOSE_FRIENDS"
              : "FRIENDS",
        };

        const newStory = await storyService.createStory(
          currentUser.userId,
          request,
        );
        if (newStory) createdCount += 1;
      }

      useStoryStore.setState({ uploadProgress: 100, isUploading: false });
      window.setTimeout(
        () => useStoryStore.setState({ uploadProgress: 0 }),
        1000,
      );

      if (createdCount > 0) {
        const storyState = useStoryStore.getState();
        if (!storyState._userUnsub) {
          await storyState.loadUserStories(currentUser.userId);
        }
        closeStoryComposer();
        triggerStoryPostedPulse();
      }
    } catch (error) {
      console.error("Error uploading story:", error);
      // Show user-friendly error message
      alert(
        `Upload failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      // Reset upload progress
      useStoryStore.setState({ isUploading: false, uploadProgress: 0 });
    }
  };

  const openStoryFilePicker = () => {
    if (isUploading) return;
    if (storyUploadMode === "dedication" && !dedicationRecipient) return;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*";
    input.multiple = true;
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (files.length > 0 && !isUploading) {
        storyDraftPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
        setStoryDraftFiles(files);
        setStoryDraftPreviewUrls(
          files.map((file) => URL.createObjectURL(file)),
        );
        setSelectedStoryDraftIndex(0);
        setStoryMediaTransform({ x: 0, y: 0, scale: 1, rotation: 0 });
        setStoryComposerStage("editor");
        setStoryTextSelected(false);
      }
    };
    input.click();
  };

  const publishStoryDraft = async () => {
    console.log("🚀 publishStoryDraft called", {
      storyDraftFilesLength: storyDraftFiles.length,
      isUploading,
      storyDraftFiles: storyDraftFiles.map((f) => ({
        name: f.name,
        type: f.type,
        size: f.size,
      })),
    });

    if (storyDraftFiles.length === 0 || isUploading) {
      console.log("❌ publishStoryDraft early return", {
        filesEmpty: storyDraftFiles.length === 0,
        isUploading,
      });
      return;
    }

    try {
      await handleStoryUpload(storyDraftFiles);
      console.log("✅ Story upload completed successfully");
    } catch (error) {
      console.error("❌ Story upload failed:", error);
    }
  };

  const handleDeleteStory = async (storyId: string) => {
    await deleteStory(storyId, currentUser.userId);
    // Close viewer if no more stories left
    const remaining = userStories.filter((s) => s.id !== storyId);
    if (remaining.length === 0) {
      setShowStoryViewerModal(false);
      setViewerStoryAuthorId(null);
      onStoryViewerOpenChange?.(false);
    } else {
      // Stay on previous index if possible
      setViewerStories(remaining);
      setSelectedStoryIndex((prev) => Math.min(prev, remaining.length - 1));
    }
  };

  useEffect(() => {
    if (!showStoryViewerModal) return;
    if (viewerIsOwner) {
      setViewerStories(sortStoriesForPlayback(userStories));
      setSelectedStoryIndex((prev) =>
        Math.min(prev, Math.max(userStories.length - 1, 0)),
      );
      return;
    }

    if (!viewerStoryAuthorId) return;

    const nextViewerStories = sortStoriesForPlayback(
      stories.filter((story) => story.author.id === viewerStoryAuthorId),
    );

    if (nextViewerStories.length === 0) {
      setShowStoryViewerModal(false);
      setViewerStoryAuthorId(null);
      onStoryViewerOpenChange?.(false);
      return;
    }

    setViewerStories(nextViewerStories);
    setSelectedStoryIndex((prev) =>
      Math.min(prev, nextViewerStories.length - 1),
    );
  }, [
    showStoryViewerModal,
    viewerIsOwner,
    viewerStoryAuthorId,
    userStories,
    stories,
    onStoryViewerOpenChange,
  ]);

  // ── Story reaction handler ──
  // Uses a deterministic Postgres doc ID so no reads are needed —
  // The idempotent reaction mutation overwrites on double-tap and removes on toggle-off.
  const handleStoryReact = useCallback(
    async (storyId: string, authorId: string, type: "like" | "hate") => {
      if (!currentUser.userId || authorId === currentUser.userId) return null;

      try {
        const result = await storyReactionService.toggleReaction(
          storyId,
          currentUser.userId,
          type,
        );

        if (!result.success) {
          throw new Error("Failed to save story reaction");
        }

        if (result.currentReaction) {
          await alertService.createAlert({
            userId: authorId,
            type: "STORY_REACTION",
            entityId: storyId,
            actorId: currentUser.userId,
            actorName: currentUser.name,
            actorUsername: currentUser.username,
            actorAvatar: currentUser.avatar,
            message: `${currentUser.name} ${result.currentReaction === "like" ? "liked" : "hated"} your story`,
            metadata: {
              reactionType: result.currentReaction,
            },
          });
        }

        return result.currentReaction;
      } catch (err) {
        console.error("Story reaction failed:", err);
        return null;
      }
    },
    [currentUser],
  );

  // ── Story reply handler ──
  // Gets or creates a DM conversation then sends the reply text.
  const handleStoryReply = useCallback(
    async (storyId: string, authorId: string, text: string) => {
      if (
        !text.trim() ||
        !currentUser.userId ||
        authorId === currentUser.userId
      )
        return;
      try {
        const convId = await getOrCreateConversation(
          currentUser.userId,
          authorId,
        );
        const story = viewerStories.find((item) => item.id === storyId);
        const previewUrl = story ? await createStoryReplyPreviewUrl(story) : "";
        const storyPayload = story
          ? buildSharedStoryPayload(story, text.trim(), previewUrl)
          : null;
        const encodedStoryPayload = storyPayload
          ? encodeSharedStoryPayload(storyPayload)
          : "";
        const safeStoryPayload =
          encodedStoryPayload.length <= STORY_REPLY_ENCODED_PAYLOAD_LIMIT
            ? encodedStoryPayload
            : "";
        const storyReplyPreviewText = `Replied to your story: ${text.trim()}`;

        await sendRealTimeMessage(
          convId,
          safeStoryPayload ? storyReplyPreviewText : text.trim(),
          safeStoryPayload || undefined,
          safeStoryPayload ? "TEXT" : undefined,
        );
      } catch (err) {
        console.error("Story reply failed:", err);
      }
    },
    [currentUser, getOrCreateConversation, sendRealTimeMessage, viewerStories],
  );

  const startLikeMilestone = useCallback(function startCelebration(postId: string, milestone: number) {
    setLikeMilestonePosts((prev) => ({ ...prev, [postId]: milestone }));
    likeMilestoneTimersRef.current[postId] = window.setTimeout(() => {
      delete likeMilestoneTimersRef.current[postId];
      const nextMilestone = pendingLikeMilestonesRef.current[postId]?.shift();
      if (nextMilestone !== undefined) {
        startCelebration(postId, nextMilestone);
      } else {
        delete pendingLikeMilestonesRef.current[postId];
        setLikeMilestonePosts((prev) => {
          const next = { ...prev };
          delete next[postId];
          return next;
        });
      }
    }, LIKE_MILESTONE_CELEBRATION_MS);
  }, []);

  const addLike = useCallback(
    (postId: string) => {
      const storedPost = usePostsStore
        .getState()
        .posts.find((post) => post.id === postId);
      const existingEntry =
        optimisticLikeProofRef.current[postId];
      const persistedEntry = storedPost?.likesByUser[currentUser.userId];

      const nextTapCount =
        Math.max(
          existingEntry?.tapCount || 0,
          persistedEntry?.tapCount || 0,
        ) + 1;

      optimisticLikeProofRef.current[postId] = {
        userId: currentUser.userId,
        name: currentUser.name,
        username: currentUser.username,
        avatar: currentUser.avatar,
        tapCount: nextTapCount,
      };

      likeFeedbackRef.current ??= createFeedLikeFeedback();
      likeFeedbackRef.current.play(nextTapCount);
      void storeAddLike(postId, currentUser.userId);

      // Reaching another milestone during a dance queues its new routine;
      // every like still registers immediately and the current dance can finish.
      if (nextTapCount % LIKE_DANCE_INTERVAL === 0) {
        if (likeMilestoneTimersRef.current[postId]) {
          (pendingLikeMilestonesRef.current[postId] ??= []).push(nextTapCount);
          return;
        }
        setAnimatingPosts((prev) => new Set(prev).add(postId));
        setTimeout(() => {
          setAnimatingPosts((prev) => {
            const next = new Set(prev);
            next.delete(postId);
            return next;
          });
        }, 1800); // Animation duration

        startLikeMilestone(postId, nextTapCount);
      }
    },
    [
      storeAddLike,
      startLikeMilestone,
      currentUser.avatar,
      currentUser.name,
      currentUser.userId,
      currentUser.username,
    ],
  );

  const handleHeartIconClick = useCallback(
    (postId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      // Burst is owned by the PostMedia child — fire it there, then like.
      postMediaRefs.current[postId]?.burstAtCenter();
      addLike(postId);
    },
    [addLike],
  );

  const handleSubmitComment = useCallback(
    async (text: string, parentId?: string | null) => {
      if (!text.trim() || !selectedPost) return;
      try {
        await storeAddComment(selectedPost.id, {
          userId: currentUser.userId,
          name: currentUser.name,
          username: currentUser.username,
          avatar: currentUser.avatar,
          text: text.trim(),
          parentId: parentId || null,
        });
      } catch (error) {
        console.error("Failed to post comment:", error);
      }
    },
    [selectedPost, storeAddComment, currentUser],
  );

  const handleSendToDM = useCallback(
    async (friend: Friend) => {
      if (!selectedPost || !user?.id) {
        return;
      }

      const recipientId = friend.user_id || friend.id;
      if (
        !recipientId ||
        sentTo.has(recipientId) ||
        sendingRecipientId === recipientId
      ) {
        return;
      }

      const payload = buildSharedPostPayload({
        ...selectedPost,
        author: resolveAuthor(selectedPost.author),
      });
      if (!payload) {
        return;
      }

      setSendingRecipientId(recipientId);
      try {
        const conversationId = await getOrCreateConversation(
          user.id,
          recipientId,
        );
        await sendRealTimeMessage(
          conversationId,
          SHARED_POST_FALLBACK_TEXT,
          encodeSharedPostPayload(payload),
          "TEXT",
        );
        setSentTo((prev) => new Set(prev).add(recipientId));
      } catch (error) {
        console.error("Failed to share post to DM:", error);
      } finally {
        setSendingRecipientId((current) =>
          current === recipientId ? null : current,
        );
      }
    },
    [
      selectedPost,
      user?.id,
      sentTo,
      sendingRecipientId,
      resolveAuthor,
      getOrCreateConversation,
      sendRealTimeMessage,
    ],
  );

  // Only skeleton-gate when there are genuinely no posts to show.
  // If posts are already in memory (from a previous load or persist cache),
  // render them immediately and let the background subscription refresh silently.
  const isFeedBootstrapping = feedBootstrapping && sortedPosts.length === 0;

  return (
    <div
      className="feed-screen-premium screen-container"
      style={{
        /* ORIGINAL BG (green gradient):
           "radial-gradient(circle at 50% -12%, rgba(74,222,128,0.16), transparent 34%), radial-gradient(circle at 12% 18%, rgba(14,165,233,0.10), transparent 28%), linear-gradient(180deg, #060806 0%, #0a0f0a 48%, #030403 100%)"
        */
        background:
          "#000000",
      }}
    >
      <style>{`
        @keyframes premiumBorderSweep {
          0% {
            opacity: 0;
            transform: rotate(0deg) scale(0.96);
          }
          20% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: rotate(360deg) scale(1.08);
          }
        }
        @keyframes premiumCardGlow {
          0% {
            box-shadow:
              0 18px 44px rgba(0, 0, 0, 0.34),
              0 0 0 1px rgba(74, 222, 128, 0.08);
          }
          35% {
            box-shadow:
              0 22px 52px rgba(0, 0, 0, 0.4),
              0 0 0 1px rgba(74, 222, 128, 0.22),
              0 0 34px rgba(34, 197, 94, 0.18);
          }
          100% {
            box-shadow:
              0 18px 44px rgba(0, 0, 0, 0.34),
              0 0 0 1px rgba(74, 222, 128, 0.08);
          }
        }
        .premium-card-burst {
          animation: premiumCardGlow 1.65s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .premium-card-ring {
          position: absolute;
          inset: -1px;
          border-radius: 26px;
          padding: 1px;
          background:
            linear-gradient(130deg,
              rgba(250, 204, 21, 0.12),
              rgba(74, 222, 128, 0.95),
              rgba(16, 185, 129, 0.85),
              rgba(250, 204, 21, 0.14));
          -webkit-mask:
            linear-gradient(#fff 0 0) content-box,
            linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          opacity: 0;
          pointer-events: none;
        }
        .premium-card-burst .premium-card-ring {
          animation: premiumBorderSweep 1.65s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .premium-card-glow {
          position: absolute;
          inset: -18px;
          border-radius: 32px;
          background:
            radial-gradient(circle at 20% 20%, rgba(250, 204, 21, 0.1), transparent 34%),
            radial-gradient(circle at 80% 25%, rgba(74, 222, 128, 0.18), transparent 38%),
            radial-gradient(circle at 50% 100%, rgba(16, 185, 129, 0.12), transparent 42%);
          opacity: 0;
          filter: blur(18px);
          pointer-events: none;
        }
        .premium-card-burst .premium-card-glow {
          animation: premiumBorderSweep 1.65s cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes likeMilestoneTorsoReveal {
          0% {
            opacity: 0;
            clip-path: inset(0 0 100% 0);
            transform: translateX(-50%) scale(0.96);
          }
          4% {
            opacity: 0.74;
            clip-path: inset(0 0 46% 0);
          }
          8%, 94% {
            opacity: 1;
            clip-path: inset(0 0 0 0);
            transform: translateX(-50%) scale(1);
          }
          97% { opacity: 0.72; clip-path: inset(0 0 52% 0); }
          100% { opacity: 0; clip-path: inset(0 0 100% 0); transform: translateX(-50%) scale(0.96); }
        }
        @keyframes likeMilestoneHeadChoreography {
          0%, 8% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
          11.5% { transform: translate3d(0, 4px, 0) rotate(-2deg) scale(1.04, 0.95); }
          20% { transform: translate3d(0, -2px, 0) rotate(3deg) scale(0.97, 1.04); }
          32% { transform: translate3d(1px, -1px, 0) rotate(5deg) scale(1); }
          43% { transform: translate3d(-1px, 0, 0) rotate(-4deg) scale(1); }
          52% { transform: translate3d(0, 5px, 0) rotate(0deg) scale(1.08, 0.91); }
          56.5% { transform: translate3d(0, -2px, 0) rotate(0deg) scale(0.97, 1.04); }
          61% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
          69% { transform: translate3d(-1px, -2px, 0) rotate(-5deg) scale(1.01); }
          77% { transform: translate3d(1px, 0, 0) rotate(4deg) scale(1); }
          85% { transform: translate3d(-1px, -2px, 0) rotate(-4deg) scale(1.01); }
          88% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
          93% { transform: translate3d(0, -1px, 0) rotate(-2deg) scale(1); }
          98% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
          100% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
        }
        @keyframes likeMilestoneBodyChoreography {
          0%, 8% {
            transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
          }
          11.5% { transform: translate3d(0, 5px, 0) rotate(-3deg) scale(1.06, 0.9); }
          20% { transform: translate3d(0, -3px, 0) rotate(5deg) scale(0.95, 1.07); }
          32% { transform: translate3d(0, 0, 0) rotate(10deg) scale(0.98, 1.03); }
          43% { transform: translate3d(0, 1px, 0) rotate(-7deg) scale(1); }
          52% { transform: translate3d(0, 7px, 0) rotate(0deg) scale(1.11, 0.86); }
          56.5% { transform: translate3d(0, -3px, 0) rotate(0deg) scale(0.97, 1.04); }
          61% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
          69% { transform: translate3d(-3px, -3px, 0) rotate(-7deg) scale(1.02); }
          77% { transform: translate3d(3px, 0, 0) rotate(6deg) scale(0.99); }
          85% { transform: translate3d(-2px, -4px, 0) rotate(-8deg) scale(1.03); }
          88% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
          93% { transform: translate3d(0, -1px, 0) rotate(-2deg) scale(1); }
          98% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
          100% { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
        }
        @keyframes likeMilestoneLeftArmChoreography {
          0% { opacity: 0; transform: rotate(-32deg); }
          4% { opacity: 0.72; }
          8% { opacity: 1; transform: rotate(-32deg); }
          11.5% { transform: rotate(-18deg); }
          20% { transform: rotate(-124deg); }
          32% { transform: rotate(-150deg); }
          43% { transform: rotate(-112deg); }
          52% { transform: rotate(-28deg); }
          56.5% { transform: rotate(-84deg); }
          61% { transform: rotate(-32deg); }
          69% { transform: rotate(-82deg); }
          77% { transform: rotate(-24deg); }
          85% { transform: rotate(-96deg); }
          88% { transform: rotate(-32deg); }
          89.5% { transform: rotate(-18deg); }
          93% { transform: rotate(-142deg); }
          97% { opacity: 1; transform: rotate(-104deg); }
          100% { opacity: 0; transform: rotate(-32deg); }
        }
        @keyframes likeMilestoneRightArmChoreography {
          0% { opacity: 0; transform: rotate(32deg); }
          4.8% { opacity: 0.72; }
          8.8% { opacity: 1; transform: rotate(32deg); }
          11.5% { transform: rotate(18deg); }
          20% { transform: rotate(124deg); }
          32% { transform: rotate(150deg); }
          43% { transform: rotate(112deg); }
          52% { transform: rotate(28deg); }
          56.5% { transform: rotate(84deg); }
          61% { transform: rotate(32deg); }
          69% { transform: rotate(26deg); }
          77% { transform: rotate(86deg); }
          85% { transform: rotate(18deg); }
          88% { transform: rotate(32deg); }
          89.5% { transform: rotate(18deg); }
          93% { transform: rotate(142deg); }
          97% { opacity: 1; transform: rotate(104deg); }
          100% { opacity: 0; transform: rotate(32deg); }
        }
        @keyframes likeMilestoneLeftLegChoreography {
          0%, 2% { opacity: 0; transform: rotate(-58deg); }
          6% { opacity: 0.72; }
          10% { opacity: 1; transform: rotate(-58deg); }
          11.5% { transform: rotate(-72deg); }
          20% { transform: rotate(-94deg); }
          32% { transform: rotate(-24deg); }
          43% { transform: rotate(-108deg); }
          52% { transform: rotate(-72deg); }
          56.5%, 61% { transform: rotate(-58deg); }
          69% { transform: rotate(-74deg); }
          77% { transform: rotate(-42deg); }
          85% { transform: rotate(-78deg); }
          88% { transform: rotate(-58deg); }
          89.5% { transform: rotate(-76deg); }
          93% { transform: rotate(-92deg); }
          97% { opacity: 1; transform: rotate(-42deg); }
          100% { opacity: 0; transform: rotate(-58deg); }
        }
        @keyframes likeMilestoneRightLegChoreography {
          0%, 2.8% { opacity: 0; transform: rotate(58deg); }
          6.8% { opacity: 0.72; }
          10.8% { opacity: 1; transform: rotate(58deg); }
          11.5% { transform: rotate(72deg); }
          20% { transform: rotate(94deg); }
          32% { transform: rotate(108deg); }
          43% { transform: rotate(24deg); }
          52% { transform: rotate(72deg); }
          56.5%, 61% { transform: rotate(58deg); }
          69% { transform: rotate(42deg); }
          77% { transform: rotate(76deg); }
          85% { transform: rotate(40deg); }
          88% { transform: rotate(58deg); }
          89.5% { transform: rotate(76deg); }
          93% { transform: rotate(92deg); }
          97% { opacity: 1; transform: rotate(42deg); }
          100% { opacity: 0; transform: rotate(58deg); }
        }
        @keyframes likeMilestoneLeftBoneReveal {
          0% { clip-path: inset(0 0 0 100%); }
          5% { clip-path: inset(0 0 0 46%); }
          10%, 100% { clip-path: inset(0 0 0 0); }
        }
        @keyframes likeMilestoneRightBoneReveal {
          0% { clip-path: inset(0 100% 0 0); }
          5.8% { clip-path: inset(0 46% 0 0); }
          10.8%, 100% { clip-path: inset(0 0 0 0); }
        }
        @keyframes likeMilestoneLandingShadow {
          0%, 49% { opacity: 0; transform: translateX(-50%) scaleX(0.3); }
          52% { opacity: 0.8; transform: translateX(-50%) scaleX(1.2); }
          56.5% { opacity: 0.42; transform: translateX(-50%) scaleX(0.84); }
          61%, 86% { opacity: 0.32; transform: translateX(-50%) scaleX(0.9); }
          89%, 100% { opacity: 0; transform: translateX(-50%) scaleX(0.7); }
        }
        @keyframes likeMilestoneImpactRing {
          0%, 51% { opacity: 0; transform: translateX(-50%) scale(0.84); }
          52% { opacity: 0.84; transform: translateX(-50%) scale(0.92); }
          59%, 100% { opacity: 0; transform: translateX(-50%) scale(1.82); }
        }
        @keyframes likeMilestoneHeartFall {
          0% {
            opacity: 0;
            transform: translate3d(0, 0, 0) rotate(0deg) scale(0.9);
          }
          9% { opacity: 1; }
          46% {
            opacity: 1;
            transform: translate3d(var(--like-milestone-heart-drift-mid), var(--like-milestone-heart-travel-mid), 0)
              rotate(var(--like-milestone-heart-rotate-mid)) scale(1.04);
          }
          82% { opacity: 1; }
          100% {
            opacity: 0;
            transform: translate3d(var(--like-milestone-heart-drift), var(--like-milestone-heart-travel), 0)
              rotate(var(--like-milestone-heart-rotate)) scale(1.12);
          }
        }
        .like-milestone-stickman {
          animation: none;
          transform-origin: 36px 25px;
          backface-visibility: hidden;
          will-change: transform;
        }
        .like-milestone-puppet {
          animation: likeMilestoneBodyChoreography ${LIKE_MILESTONE_CELEBRATION_MS}ms cubic-bezier(0.77, 0, 0.175, 1) both;
          backface-visibility: hidden;
          transform-origin: 50% 18%;
          will-change: transform;
        }
        .like-milestone-head {
          animation: likeMilestoneHeadChoreography ${LIKE_MILESTONE_CELEBRATION_MS}ms cubic-bezier(0.77, 0, 0.175, 1) both;
          backface-visibility: hidden;
          transform-origin: center bottom;
          will-change: transform;
        }
        .like-milestone-torso {
          animation: likeMilestoneTorsoReveal ${LIKE_MILESTONE_CELEBRATION_MS}ms cubic-bezier(0.23, 1, 0.32, 1) both;
          transform-origin: center top;
          will-change: transform, opacity, clip-path;
        }
        .like-milestone-arm-left {
          animation: likeMilestoneLeftArmChoreography ${LIKE_MILESTONE_CELEBRATION_MS}ms cubic-bezier(0.77, 0, 0.175, 1) both;
          will-change: transform, opacity;
        }
        .like-milestone-arm-right {
          animation: likeMilestoneRightArmChoreography ${LIKE_MILESTONE_CELEBRATION_MS}ms cubic-bezier(0.77, 0, 0.175, 1) both;
          will-change: transform, opacity;
        }
        .like-milestone-leg-left {
          animation: likeMilestoneLeftLegChoreography ${LIKE_MILESTONE_CELEBRATION_MS}ms cubic-bezier(0.77, 0, 0.175, 1) both;
          will-change: transform, opacity;
        }
        .like-milestone-leg-right {
          animation: likeMilestoneRightLegChoreography ${LIKE_MILESTONE_CELEBRATION_MS}ms cubic-bezier(0.77, 0, 0.175, 1) both;
          will-change: transform, opacity;
        }
        .like-milestone-bone-left {
          animation: likeMilestoneLeftBoneReveal ${LIKE_MILESTONE_CELEBRATION_MS}ms cubic-bezier(0.23, 1, 0.32, 1) both;
          will-change: clip-path;
        }
        .like-milestone-bone-right {
          animation: likeMilestoneRightBoneReveal ${LIKE_MILESTONE_CELEBRATION_MS}ms cubic-bezier(0.23, 1, 0.32, 1) both;
          will-change: clip-path;
        }
        .like-milestone-shadow {
          opacity: 0;
          animation: likeMilestoneLandingShadow ${LIKE_MILESTONE_CELEBRATION_MS}ms cubic-bezier(0.23, 1, 0.32, 1) both;
        }
        .like-milestone-impact {
          opacity: 0;
          animation: likeMilestoneImpactRing ${LIKE_MILESTONE_CELEBRATION_MS}ms cubic-bezier(0.23, 1, 0.32, 1) both;
        }
        .like-milestone-heart {
          opacity: 0;
          animation-name: likeMilestoneHeartFall;
          animation-timing-function: linear;
          animation-fill-mode: both;
          filter: drop-shadow(0 2px 5px rgba(244, 63, 94, 0.42));
          will-change: transform, opacity;
        }
        @media (prefers-reduced-motion: reduce) {
          .feed-heart-burst div {
            animation: none !important;
          }
          .feed-heart-burst > div:not(:last-child) {
            display: none;
          }
          .premium-card-burst,
          .premium-card-burst .premium-card-ring,
          .premium-card-burst .premium-card-glow {
            animation: none;
          }
          .like-milestone-stickman {
            animation: none;
            transform: translate3d(0, 0, 0);
          }
          .like-milestone-puppet,
          .like-milestone-head,
          .like-milestone-body,
          .like-milestone-torso,
          .like-milestone-arm-left,
          .like-milestone-arm-right,
          .like-milestone-leg-left,
          .like-milestone-leg-right,
          .like-milestone-bone-left,
          .like-milestone-bone-right,
          .like-milestone-shadow,
          .like-milestone-impact {
            animation: none;
          }
          .like-milestone-heart {
            display: none;
          }
        }
        @keyframes ownStoryPostedRing {
          0% {
            opacity: 0;
            transform: translateZ(0) scale(0.9);
          }
          18% {
            opacity: 0.9;
            transform: translateZ(0) scale(1.02);
          }
          100% {
            opacity: 0;
            transform: translateZ(0) scale(1.14);
          }
        }
        .own-story-posted-ring {
          animation: ownStoryPostedRing 1.35s cubic-bezier(0.22, 1, 0.36, 1) both;
          backface-visibility: hidden;
          transform-origin: center;
          will-change: transform, opacity;
        }

        /* Feed visual layer: Yope intimacy + Retro's quiet, photo-first rhythm. */
        .feed-screen-premium {
          --feed-ink: #f4f5f2;
          --feed-muted: #8b8b8b;
          --feed-line: rgba(236, 240, 234, 0.075);
          --feed-surface: rgba(22, 22, 22, 0.9);
          --feed-accent: #d2d2d2;
          position: relative;
          color: var(--feed-ink);
          font-family: var(--font-ui);
          background:
            radial-gradient(circle at 20% 30%, rgba(255,255,255,0.018) 0 0.45px, transparent 0.6px) 0 0 / 7px 7px,
            radial-gradient(circle at 70% 65%, rgba(255,255,255,0.014) 0 0.4px, transparent 0.55px) 0 0 / 9px 9px,
            radial-gradient(circle at 18% -8%, rgba(255, 255, 255, 0.035), transparent 28%),
            radial-gradient(circle at 92% 18%, rgba(255, 255, 255, 0.025), transparent 22%),
            linear-gradient(180deg, #171717 0%, #111111 52%, #0b0b0b 100%) !important;
        }
        .feed-main-header {
          border-bottom: 1px solid var(--feed-line);
          background: rgba(18, 18, 18, 0.94) !important;
          box-shadow: none !important;
          backdrop-filter: blur(22px) saturate(1.18);
          -webkit-backdrop-filter: blur(22px) saturate(1.18);
          opacity: 1;
          transition:
            transform 280ms cubic-bezier(0.22, 1, 0.36, 1),
            opacity 180ms ease;
          will-change: transform, opacity;
        }
        .feed-main-header.feed-main-header--hidden {
          background: transparent !important;
          border-bottom-color: transparent !important;
          box-shadow: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
          opacity: 0;
          pointer-events: none;
        }
        .feed-main-header button {
          border-radius: 14px;
          color: rgba(236, 240, 234, 0.62);
        }
        .feed-main-header button:active {
          background: rgba(255,255,255,0.06);
          transform: scale(0.94);
        }
        .feed-scroll-surface {
          scrollbar-width: none;
          overscroll-behavior-y: contain;
          -webkit-overflow-scrolling: touch;
        }
        .feed-scroll-surface::-webkit-scrollbar {
          display: none;
        }
        .feed-post-card {
          content-visibility: auto;
          contain: layout paint style;
          contain-intrinsic-size: 680px;
        }
        .feed-stickman-shell {
          width: min(100%, 540px);
          margin: 0 auto 10px;
          overflow: hidden;
          border-top: 1px solid rgba(244,246,244,.12);
          border-bottom: 1px solid var(--feed-line);
          background: transparent;
        }
        .feed-stickman-row {
          display: flex;
          height: 148px;
          align-items: stretch;
          justify-content: flex-start;
          gap: 14px;
          overflow-x: auto;
          overflow-y: hidden;
          padding: 0 14px;
          scrollbar-width: none;
        }
        .feed-stickman-row::-webkit-scrollbar { display: none; }
        .feed-stickman-item {
          position: relative;
          width: calc((100% - 42px) / 4);
          min-width: calc((100% - 42px) / 4);
          height: 148px;
          border: 0;
          background: transparent;
          color: inherit;
          cursor: pointer;
          isolation: isolate;
        }
        .feed-stickman-item-top { z-index: 2; }
        .feed-stickman-item-bottom { z-index: 1; }
        .feed-stickman-button { position: absolute; inset: 0; width: 100%; padding: 0; border: 0; background: transparent; color: inherit; cursor: pointer; }
        /* Keep the figure itself free to sit outside the item; the old inset rule made every pose collapse to the bottom edge. */
        .feed-stickman-item-top > .feed-stickman { position: absolute; top: -12px !important; right: auto; bottom: auto; left: 50%; width: 80px; border: 0; background: transparent; }
        .feed-stickman-button:focus-visible,
        .feed-stickman-item-top:focus-visible { outline: 2px solid #4ade80; outline-offset: -3px; border-radius: 14px; }
        .feed-stickman-button:hover .feed-stickman,
        .feed-stickman-item-top:hover .feed-stickman { filter: brightness(1.08); }
        .feed-stickman {
          --stick-head: 80px;
          --stick-body: 38px;
          --stick-line: 2px;
          --stick-spine: 22px;
          --stick-limb: 15px;
          --stick-arm-y: 8px;
          position: absolute;
          left: 50%;
          display: flex;
          width: 80px;
          align-items: center;
          flex-direction: column;
          transform: translateX(-50%);
          transform-origin: 50% 72%;
          will-change: transform;
        }
        /* Top figures hang in upside-down, with their torso and arms entering first. */
        .feed-stickman-top {
          top: -12px !important;
          transform: translateX(-50%);
        }
        .feed-stickman-top .chat-stickman-body {
          order: -1;
          height: 42px !important;
          margin-top: 0 !important;
          margin-bottom: -1px;
          transform: rotate(180deg);
        }
        /* Bottom figures peek upward; only the head, torso, and arms can enter the strip. */
        .feed-stickman-bottom,
        .feed-stickman-button .feed-stickman-bottom { top: 48px; right: auto; bottom: auto; left: 50%; }
        .feed-stickman .chat-stickman-head { width: var(--stick-head); height: var(--stick-head); font-size: 13px; }
        .feed-stickman .chat-stickman-body { width: var(--stick-body); height: var(--stick-body); }
        .feed-stickman .chat-stickman-face { position: relative; width: 3px; height: 3px; margin-right: 9px; border-radius: 50%; background: #e8f1eb; box-shadow: 9px 0 #e8f1eb; }
        .feed-stickman .chat-stickman-face::after { content: ""; position: absolute; top: 5px; left: 3px; width: 7px; height: 4px; border-bottom: 1.5px solid #e8f1eb; border-radius: 50%; }
        .feed-stickman .feed-story-spine {
          position: absolute;
          top: 0;
          left: 50%;
          width: var(--stick-line);
          height: var(--stick-spine);
          border-radius: 999px;
          background: rgba(255,255,255,.8);
          transform: translateX(-50%);
        }
        .feed-stickman .feed-story-arm {
          position: absolute;
          top: var(--stick-arm-y);
          width: var(--stick-limb);
          height: var(--stick-line);
          border-radius: 999px;
          background: rgba(255,255,255,.75);
          animation-timing-function: ease-in-out !important;
          animation-iteration-count: infinite !important;
          animation-play-state: running !important;
          will-change: transform;
        }
        .feed-stickman .feed-story-arm-left {
          left: 50%;
          margin-left: calc(-1 * var(--stick-limb));
          transform: rotate(-8deg);
          transform-origin: right center;
        }
        .feed-stickman .feed-story-arm-right {
          left: 50%;
          transform: rotate(30deg);
          transform-origin: left center;
        }
        .feed-stickman[data-animated="false"] .feed-story-arm { animation: none !important; }
        .feed-stickman[data-animated="true"][data-hand-motion="0"] .feed-story-arm-left { animation-name: feedStoryLeftA !important; animation-duration: 1.25s !important; }
        .feed-stickman[data-animated="true"][data-hand-motion="0"] .feed-story-arm-right { animation-name: feedStoryRightA !important; animation-duration: 1.55s !important; }
        .feed-stickman[data-animated="true"][data-hand-motion="1"] .feed-story-arm-left { animation-name: feedStoryLeftB !important; animation-duration: 1.7s !important; animation-delay: -.45s !important; }
        .feed-stickman[data-animated="true"][data-hand-motion="1"] .feed-story-arm-right { animation-name: feedStoryRightB !important; animation-duration: 1.35s !important; animation-delay: -.2s !important; }
        .feed-stickman[data-animated="true"][data-hand-motion="2"] .feed-story-arm-left { animation-name: feedStoryLeftC !important; animation-duration: 1.9s !important; animation-delay: -.8s !important; }
        .feed-stickman[data-animated="true"][data-hand-motion="2"] .feed-story-arm-right { animation-name: feedStoryRightC !important; animation-duration: 1.6s !important; animation-delay: -.55s !important; }
        .feed-stickman[data-animated="true"][data-hand-motion="3"] .feed-story-arm-left { animation-name: feedStoryLeftD !important; animation-duration: 1.45s !important; animation-delay: -.25s !important; }
        .feed-stickman[data-animated="true"][data-hand-motion="3"] .feed-story-arm-right { animation-name: feedStoryRightD !important; animation-duration: 1.85s !important; animation-delay: -.7s !important; }
        .feed-stickman-mock { pointer-events: none; opacity: .78; }
        .feed-stickman[data-animated="true"] { animation: feedStickmanFloat 5.8s ease-in-out infinite; }
        .feed-stickman-item:nth-child(3n) .feed-stickman[data-animated="true"] { animation-delay: -1.1s; }
        .feed-stickman-item:nth-child(4n) .feed-stickman[data-animated="true"] { animation-delay: -2.1s; }
        .feed-stickman-item:active { transform: scale(.96); }
        .feed-stickman-label { position: absolute; left: 50%; width: 88px; transform: translateX(-50%); color: rgba(244,246,244,.48); font-size: 10px; font-weight: 600; line-height: 1.1; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .feed-stickman-item-top .feed-stickman-label { bottom: 4px; }
        .feed-stickman-item-bottom .feed-stickman-label { top: 4px; }
        .feed-stickman-item:not(:first-child) .feed-stickman-label { display: none; }
        .feed-stickman-plus { position: absolute; top: 59px; left: calc(50% + 24px); z-index: 4; display: grid; width: 24px; height: 24px; place-items: center; border: 2px solid #070807; border-radius: 50%; background: #4ade80; color: #070807; }
        .feed-stickman-skeleton { display: grid; place-items: start center; padding-top: 2px; }
        .feed-stickman-skeleton-head { width: 80px; height: 80px; border: 2px solid rgba(255,255,255,.08); border-radius: 50%; background: #1b211e; }
        @keyframes feedStickmanFloat { 0%,100% { margin-top: 0; } 50% { margin-top: 1px; } }
        @keyframes feedStoryLeftA { 0%,100% { transform: rotate(-8deg); } 50% { transform: rotate(-17deg); } }
        @keyframes feedStoryRightA { 0%,100% { transform: rotate(30deg); } 50% { transform: rotate(20deg); } }
        @keyframes feedStoryLeftB { 0%,100% { transform: rotate(-8deg); } 35% { transform: rotate(1deg); } 70% { transform: rotate(-13deg); } }
        @keyframes feedStoryRightB { 0%,100% { transform: rotate(30deg); } 45% { transform: rotate(38deg); } 75% { transform: rotate(25deg); } }
        @keyframes feedStoryLeftC { 0%,100% { transform: rotate(-8deg); } 40% { transform: rotate(-20deg); } 65% { transform: rotate(-4deg); } }
        @keyframes feedStoryRightC { 0%,100% { transform: rotate(30deg); } 30% { transform: rotate(17deg); } 70% { transform: rotate(34deg); } }
        @keyframes feedStoryLeftD { 0%,100% { transform: rotate(-8deg); } 50% { transform: rotate(-2deg); } }
        @keyframes feedStoryRightD { 0%,100% { transform: rotate(30deg); } 35% { transform: rotate(21deg); } 68% { transform: rotate(36deg); } }
        @media (prefers-reduced-motion: reduce) {
          .feed-stickman[data-animated="true"] { animation: none; }
        }

        .feed-stories-shell {
          margin: 4px auto 12px;
          width: min(100%, 500px);
          padding: 0 10px !important;
        }
        .feed-stories-row {
          gap: 14px !important;
          padding: 14px 6px 13px !important;
          border-bottom: 1px solid var(--feed-line);
          scroll-padding-inline: 6px;
        }
        .feed-stories-row > * {
          scroll-snap-align: start;
        }
        .feed-story-item {
          width: 76px;
        }
        .feed-story-avatar {
          width: 76px !important;
          height: 76px !important;
        }
        .feed-story-ring {
          width: 100% !important;
          height: 100% !important;
          padding: 2.5px !important;
          filter: grayscale(1) saturate(0.12) brightness(0.84);
          box-shadow: 0 13px 30px rgba(0,0,0,0.32) !important;
        }
        .feed-story-item > span,
        .feed-story-item > button:not(.feed-story-avatar),
        .feed-story-item > div:last-child {
          max-width: 76px;
        }
        .feed-stories-row img {
          filter: saturate(0.94) contrast(1.025);
        }
        .feed-post-list {
          width: min(100%, 540px);
          margin-inline: auto;
          padding-inline: 10px !important;
        }
        .feed-post-card,
        .feed-verdict-card {
          border-radius: 0 !important;
          border-bottom: 1px solid var(--feed-line);
          background: transparent;
          box-shadow: none;
          padding-bottom: 7px;
        }
        .feed-post-header {
          padding: 13px 6px 11px !important;
        }
        .feed-post-header h3 {
          font-size: 15px;
          font-weight: 600;
          letter-spacing: -0.015em;
        }
        .feed-post-header p {
          color: var(--feed-muted);
          font-size: 12px;
          font-weight: 500;
        }
        .feed-post-media-frame {
          margin-top: 0 !important;
          padding-inline: 0 !important;
        }
        .feed-post-single-media-frame {
          width: calc(100% + 16px);
          margin-inline: -8px;
        }
        .feed-post-media-frame [data-feed-post-media] {
          overflow: hidden;
          border-radius: 24px;
          background: #000000;
          box-shadow: 0 16px 44px rgba(0,0,0,0.25);
        }
        .feed-post-media-frame img,
        .feed-post-media-frame video {
          filter: saturate(0.96) contrast(1.018);
        }
        .feed-post-actions {
          padding: 8px 4px 0 !important;
        }
        .feed-post-actions > div {
          min-height: 44px;
          padding: 7px 3px !important;
          border-bottom: 1px solid rgba(236, 240, 234, 0.055);
        }
        .feed-post-actions button {
          min-height: 36px;
        }
        .feed-post-actions button:active {
          transform: scale(0.92);
        }
        .feed-post-actions svg {
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .feed-like-proof {
          padding: 8px 7px 0 !important;
        }
        .feed-like-proof button {
          border-radius: 12px !important;
          padding-inline: 0 !important;
        }
        .feed-like-proof p {
          color: #a8afa6;
          font-weight: 500;
        }
        .feed-post-caption {
          padding: 9px 7px 17px !important;
        }
        .feed-post-caption > p:first-child {
          color: #e9ece7;
          font-size: 14px;
          font-weight: 500;
          line-height: 1.48;
          letter-spacing: -0.006em;
        }
        .feed-post-caption > p:last-child {
          margin-top: 6px;
          color: #727970;
          font-size: 11px;
          font-weight: 500;
          font-variant-numeric: tabular-nums;
        }
        .feed-editorial-rail {
          margin-block: 5px 17px;
          border: 0 !important;
          border-top: 1px solid var(--feed-line) !important;
          border-bottom: 1px solid var(--feed-line) !important;
          border-radius: 0 !important;
          background: #000000 !important;
          box-shadow: none !important;
          padding-block: 14px !important;
        }
        .feed-editorial-rail > div.mb-3 p:first-child {
          font-weight: 600;
          letter-spacing: 0.025em;
          text-transform: none;
        }
        .feed-rail-card {
          border-color: rgba(255,255,255,0.075) !important;
          border-radius: 21px !important;
          box-shadow: 0 13px 32px rgba(0,0,0,0.24) !important;
        }
        .feed-rail-card:active {
          transform: scale(0.975) !important;
        }
        .feed-rail-title {
          font-weight: 600 !important;
          line-height: 1.18 !important;
          letter-spacing: -0.012em !important;
          text-transform: none !important;
          text-wrap: pretty;
        }
        .feed-verdict-card {
          padding-top: 3px;
        }
        .feed-post-skeleton {
          border: 0 !important;
          border-bottom: 1px solid var(--feed-line) !important;
          border-radius: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
        }
        .feed-screen-premium .app-modal-backdrop {
          background: rgba(0,0,0,0.72) !important;
          backdrop-filter: blur(9px);
          -webkit-backdrop-filter: blur(9px);
        }
        .feed-screen-premium .app-modal-sheet {
          border-color: rgba(255,255,255,0.085) !important;
          background: linear-gradient(180deg, rgba(20,23,20,0.99), rgba(8,10,8,1)) !important;
          box-shadow: 0 -22px 70px rgba(0,0,0,0.52) !important;
        }
        .feed-screen-premium .app-modal-sheet h2,
        .feed-screen-premium .app-modal-sheet h3 {
          font-weight: 600 !important;
          letter-spacing: -0.025em;
        }
        .feed-screen-premium .app-modal-sheet input,
        .feed-screen-premium .app-modal-sheet textarea {
          caret-color: var(--feed-accent);
        }
        .feed-screen-premium .app-modal-sheet button {
          transition-duration: 180ms;
        }
        .feed-screen-premium button,
        .feed-screen-premium [role="button"] {
          -webkit-tap-highlight-color: transparent;
        }
        .feed-screen-premium button:focus-visible,
        .feed-screen-premium [role="button"]:focus-visible {
          outline: 2px solid rgba(255, 255, 255, 0.72);
          outline-offset: 3px;
        }
        /* Matte mode: quiet ink surfaces, no red/green UI accents. */
        .feed-screen-premium .feed-editorial-rail,
        .feed-screen-premium .feed-rail-card,
        .feed-screen-premium .feed-post-skeleton,
        .feed-screen-premium .feed-verdict-card,
        .feed-screen-premium .circle-paper-tile {
          border-color: rgba(255,255,255,.1) !important;
          background-color: #171717 !important;
          box-shadow: 0 16px 34px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.035) !important;
        }
        .feed-screen-premium .feed-story-ring {
          background: transparent !important;
          border: 0 !important;
          box-shadow: none !important;
        }
        .feed-screen-premium {
          --feed-ink: #F4F6F4;
          --feed-muted: #858C86;
          --feed-line: rgba(255,255,255,.07);
          --feed-surface: #101210;
          --feed-raised: #151815;
          --feed-accent: #4ADE80;
          background: #000000 !important;
        }
        .feed-main-header {
          background: rgba(0,0,0,.96) !important;
          border-bottom-color: var(--feed-line) !important;
          box-shadow: none !important;
        }
        .feed-title-mark > * {
          pointer-events: none;
        }
        .feed-scroll-surface > .pointer-events-none {
          display: none;
        }
        .feed-stories-shell {
          margin: 0 auto 10px !important;
          width: min(100%, 540px) !important;
          padding: 0 !important;
          overflow: hidden !important;
        }
        .feed-stories-row {
          gap: 0 !important;
          padding: 18px 26px 16px !important;
          border-bottom: 1px solid var(--feed-line) !important;
          scroll-padding-inline: 26px !important;
        }
        .feed-stories-row > :not([hidden]) ~ :not([hidden]) {
          margin-left: -17px !important;
        }
        .feed-story-item {
          width: 100px !important;
          min-width: 100px !important;
          align-items: flex-start !important;
          isolation: isolate !important;
        }
        .feed-story-avatar,
        .feed-story-avatar .feed-story-ring,
        .feed-story-ring {
          width: 100px !important;
          height: 132px !important;
          border-radius: 26px !important;
        }
        .feed-story-avatar .rounded-full,
        .feed-story-ring .rounded-full {
          border-radius: 23px !important;
        }
        .feed-story-ring {
          padding: 0 !important;
          border: 0 !important;
          outline: 0 !important;
          filter: none !important;
          box-shadow: none !important;
          overflow: hidden !important;
        }
        .feed-story-avatar,
        .feed-story-avatar > div,
        .feed-story-ring > div,
        .feed-story-ring > div > div {
          background: transparent !important;
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
        }
        .feed-story-avatar [class*="ring-"] {
          border: 0 !important;
          box-shadow: none !important;
        }
        .feed-story-ring::after,
        .feed-story-avatar::after {
          display: none !important;
          content: none !important;
        }
        .feed-story-ring::before,
        .feed-story-avatar::before {
          display: none !important;
          content: none !important;
        }
        .feed-story-item button + div,
        .feed-story-item > span,
        .feed-story-item > button:not(.feed-story-avatar),
        .feed-story-item > div:last-child {
          width: 100px !important;
          max-width: 100px !important;
          margin-top: 8px !important;
          font-size: 11px !important;
          font-weight: 500 !important;
          color: rgba(244,246,244,.46) !important;
          text-align: center !important;
          opacity: .55 !important;
        }
        .feed-story-item > div:first-child,
        .feed-story-item > .feed-story-avatar {
          transform: translateY(0) rotate(0deg);
          transform-origin: 50% 90%;
          transition: transform 220ms ease, opacity 220ms ease;
        }
        .feed-story-item:nth-child(1) {
          z-index: 5;
        }
        .feed-story-item:nth-child(2) {
          z-index: 7;
        }
        .feed-story-item:nth-child(3) {
          z-index: 9;
        }
        .feed-story-item:nth-child(4) {
          z-index: 8;
        }
        .feed-story-item:nth-child(5) {
          z-index: 6;
        }
        .feed-story-item:nth-child(1) > div:first-child,
        .feed-story-item:nth-child(1) > .feed-story-avatar,
        .feed-story-item:nth-child(5n + 1) > .feed-story-avatar .feed-story-ring {
          background: transparent !important;
        }
        .feed-story-item:nth-child(5n + 2) > .feed-story-avatar .feed-story-ring {
          background: transparent !important;
        }
        .feed-story-item:nth-child(5n + 3) > .feed-story-avatar .feed-story-ring {
          background: transparent !important;
        }
        .feed-story-item:nth-child(5n + 4) > .feed-story-avatar .feed-story-ring {
          background: transparent !important;
        }
        .feed-story-item:nth-child(5n) > .feed-story-avatar .feed-story-ring {
          background: transparent !important;
        }
        .feed-story-item .feed-story-avatar img {
          opacity: 1 !important;
          filter: none !important;
        }
        .feed-story-item .feed-story-avatar [class*="bg-[#4ade80]"] {
          background: rgba(244,246,244,.1) !important;
          color: rgba(244,246,244,.9) !important;
        }
        .feed-story-item .feed-story-avatar svg {
          color: rgba(244,246,244,.86) !important;
          filter: drop-shadow(0 2px 8px rgba(0,0,0,.32)) !important;
        }
        .feed-story-item:nth-child(1) > div:first-child,
        .feed-story-item:nth-child(1) > .feed-story-avatar {
          transform: translateY(8px) rotate(-6deg);
        }
        .feed-story-item:nth-child(2) > div:first-child,
        .feed-story-item:nth-child(2) > .feed-story-avatar {
          transform: translateY(-10px) rotate(3deg);
        }
        .feed-story-item:nth-child(3) > div:first-child,
        .feed-story-item:nth-child(3) > .feed-story-avatar {
          transform: translateY(4px) rotate(-2deg);
        }
        .feed-story-item:nth-child(4) > div:first-child,
        .feed-story-item:nth-child(4) > .feed-story-avatar {
          transform: translateY(-4px) rotate(6deg);
        }
        .feed-story-item:nth-child(5) > div:first-child,
        .feed-story-item:nth-child(5) > .feed-story-avatar {
          transform: translateY(10px) rotate(-4deg);
        }
        .feed-story-item:nth-child(6) > div:first-child,
        .feed-story-item:nth-child(6) > .feed-story-avatar {
          transform: translateY(-6px) rotate(2deg);
        }
        .feed-story-item:hover > div:first-child,
        .feed-story-item:hover > .feed-story-avatar,
        .feed-story-item:focus-within > div:first-child,
        .feed-story-item:focus-within > .feed-story-avatar {
          transform: translateY(-10px) rotate(0deg) scale(1.035);
        }
        .feed-story-item.is-viewed .feed-story-avatar {
          opacity: 1;
        }
        .feed-story-item:first-child .own-story-posted-ring {
          display: none !important;
        }
        .feed-story-item:first-child .feed-story-avatar + button {
          right: 10px !important;
          bottom: 10px !important;
          width: 24px !important;
          height: 24px !important;
          border: 2px solid #070807 !important;
          background: rgba(244,246,244,.92) !important;
          color: #070807 !important;
        }
        .feed-story-item.is-viewed .feed-story-ring {
          opacity: 1;
        }
        .feed-story-item.is-viewed .feed-story-ring::after,
        .feed-story-item.is-viewed .feed-story-avatar::after {
          opacity: 0;
        }
        .feed-story-item.is-dedication .feed-story-ring::before {
          display: none !important;
          content: none !important;
        }
        .feed-story-item:first-child .feed-story-avatar {
          border-color: transparent !important;
          outline: 0 !important;
          box-shadow: none !important;
        }
        .feed-story-item:first-child .feed-story-avatar + button {
          box-shadow: none !important;
        }
        .feed-post-list {
          width: min(100%, 560px) !important;
          padding-inline: 14px !important;
          gap: 18px !important;
        }
        .feed-post-card {
          display: flex !important;
          flex-direction: column !important;
          overflow: visible !important;
          border-radius: 0 !important;
          border: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
          filter: none !important;
          padding: 0 !important;
          margin-bottom: 0 !important;
        }
        .feed-post-card::before,
        .feed-post-card::after,
        .feed-post-card > .premium-card-glow,
        .feed-post-card > .premium-card-ring {
          display: none !important;
          box-shadow: none !important;
        }
        .feed-post-card .premium-card-glow,
        .feed-post-card .premium-card-ring,
        .feed-verdict-card .premium-card-glow,
        .feed-verdict-card .premium-card-ring,
        .feed-editorial-rail .pointer-events-none.absolute.inset-x-5.top-0 {
          display: none !important;
        }
        .feed-post-header {
          margin: 0 2px 4px !important;
          padding: 13px 6px 11px !important;
          border: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
        }
        .feed-post-caption {
          order: 1;
        }
        .feed-post-actions {
          order: 2;
        }
        .feed-spark-summary {
          order: 3;
        }
        .feed-post-header h3 {
          font-size: 16px !important;
          font-weight: 800 !important;
          letter-spacing: 0 !important;
          color: #f7fff9 !important;
        }
        .feed-post-header p {
          display: none !important;
        }
        .feed-post-media-frame {
          padding-inline: 0 !important;
          margin-top: 0 !important;
        }
        .feed-post-single-media-frame {
          width: calc(100% + 18px);
          margin-inline: -9px !important;
        }
        .feed-post-media-frame [data-feed-post-media],
        .feed-post-media-frame [data-feed-post-media] > div:first-child {
          overflow: hidden !important;
          border-radius: 32px !important;
          background: #000000 !important;
          box-shadow:
            0 12px 30px rgba(0,0,0,.28) !important;
        }
        .feed-post-media-frame [data-feed-post-media] > div {
          box-shadow: none !important;
        }
        .feed-post-media-frame [data-feed-post-media] [class*="rounded-"] {
          border-radius: 32px !important;
        }
        .feed-post-media-frame img,
        .feed-post-media-frame video {
          filter: none !important;
        }
        .feed-post-card {
          contain: layout paint style;
          content-visibility: auto;
          contain-intrinsic-size: auto 650px;
        }
        .feed-post-actions {
          padding: 8px 4px 1px !important;
        }
        .feed-post-actions > div {
          display: flex !important;
          grid-template-columns: none !important;
          justify-content: flex-start !important;
          gap: 16px !important;
          min-height: 40px !important;
          padding: 0 !important;
          border: 0 !important;
        }
        .feed-post-actions > div > div {
          justify-content: flex-start !important;
          flex: 0 0 auto !important;
        }
        .feed-post-actions button {
          min-height: 40px !important;
          font-weight: 500 !important;
          color: #F4F6F4 !important;
        }
        .feed-post-actions button:hover {
          color: #F4F6F4 !important;
        }
        .feed-post-actions button[aria-label="Add another like"] svg,
        .feed-post-actions button[aria-label="Like post"]:active svg {
          color: #ef4444 !important;
          fill: #ef4444 !important;
          stroke-width: 0 !important;
        }
        .feed-like-proof {
          display: none !important;
        }
        .feed-post-caption {
          padding: 12px 4px 0 !important;
        }
        .feed-post-caption > p:first-child {
          font-size: 14px !important;
          font-weight: 560 !important;
          line-height: 1.48 !important;
          color: rgba(244,246,244,.92) !important;
          text-wrap: pretty;
        }
        /* Caption cards currently contain one primary paragraph. Keep this
           legacy metadata selector scoped so it cannot hide that caption. */
        .feed-post-caption > p.feed-post-caption-meta:last-child {
          display: none !important;
        }
        .feed-spark-summary {
          padding-inline: 4px !important;
          padding-top: 4px !important;
          padding-bottom: 16px !important;
        }
        .feed-spark-pill {
          display: inline-flex;
          max-width: 100%;
          align-items: center;
          gap: 4px;
          overflow: visible;
          border: 0;
          border-radius: 0;
          background: transparent;
          padding: 9px 0;
          color: #f5f3ff;
          white-space: nowrap;
          scrollbar-width: none;
        }
        .feed-spark-pill::-webkit-scrollbar {
          display: none;
        }
        .feed-spark-word,
        .feed-spark-count {
          flex: 0 0 auto;
          font-size: 14px;
          font-weight: 850;
          line-height: 1;
          letter-spacing: 0;
        }
        .feed-spark-word {
          color: #ffffff;
          margin-right: 0;
        }
        .feed-spark-count {
          color: #ffffff !important;
        }
        .feed-spark-dot {
          flex: 0 0 auto;
          color: rgba(244,246,244,.28);
          font-weight: 900;
        }
        @keyframes feedFanFloat {
          0%, 100% {
            transform: translateY(0) rotate(-2deg);
          }
          50% {
            transform: translateY(-5px) rotate(2deg);
          }
        }
        .feed-editorial-rail {
          margin: 8px 0 18px !important;
          padding: 14px 0 16px !important;
          border: 0 !important;
          border-top: 1px solid var(--feed-line) !important;
          border-bottom: 1px solid var(--feed-line) !important;
          border-radius: 0 !important;
          background: #000000 !important;
          box-shadow: none !important;
        }
        .feed-editorial-rail > div.mb-3 {
          padding-inline: 0 !important;
        }
        .feed-editorial-rail > div.mb-3 span:first-child {
          width: 7px !important;
          height: 7px !important;
          align-self: flex-start !important;
          margin-top: 7px !important;
          border: 0 !important;
          background: #4ADE80 !important;
          color: transparent !important;
          box-shadow: none !important;
        }
        .feed-editorial-rail > div.mb-3 span:first-child svg {
          display: none !important;
        }
        .feed-editorial-rail > div.mb-3 p:first-child {
          color: #F4F6F4 !important;
          font-size: 13px !important;
          font-weight: 600 !important;
          letter-spacing: 0 !important;
          text-transform: lowercase !important;
        }
        .feed-editorial-rail > div.mb-3 p:last-child {
          color: #858C86 !important;
          font-size: 12px !important;
          font-weight: 500 !important;
        }
        .feed-inline-rail,
        .community-feed-rail {
          padding-inline: 0 !important;
          gap: 10px !important;
        }
        .feed-rail-card {
          border-color: rgba(255,255,255,.08) !important;
          border-radius: 18px !important;
          box-shadow: none !important;
          background: #000000 !important;
          background-color: #000000 !important;
        }
        .feed-screen-premium .feed-editorial-rail,
        .feed-screen-premium .feed-rail-card {
          background: #000000 !important;
          background-color: #000000 !important;
        }
        .feed-rail-card:active {
          transform: scale(.98) !important;
        }
        .feed-rail-title {
          font-weight: 600 !important;
          letter-spacing: 0 !important;
          text-transform: none !important;
        }
        .community-feed-rail .feed-rail-card,
        .feed-inline-rail .feed-rail-card {
          width: 150px !important;
          height: 190px !important;
        }
        .feed-inline-rail .feed-rail-card[aria-label*="answered"],
        .feed-inline-rail .feed-rail-card[aria-label*="was asked"],
        .feed-inline-rail .feed-rail-card[aria-label*="predicted"],
        .feed-inline-rail .feed-rail-card[aria-label*="promised"],
        .feed-inline-rail .feed-rail-card[aria-label*="started"] {
          width: 250px !important;
          height: 140px !important;
        }
        .feed-verdict-card {
          margin: 8px 0 18px !important;
          padding: 0 !important;
          overflow: hidden !important;
          border: 1px solid var(--feed-line) !important;
          border-radius: 20px !important;
          background: #151815 !important;
          box-shadow: none !important;
        }
        .feed-verdict-card > div:first-of-type:not(.premium-card-glow):not(.premium-card-ring) {
          padding: 9px 10px !important;
        }
        .feed-verdict-card h3 {
          font-size: 14px !important;
          font-weight: 600 !important;
        }
        .feed-verdict-card h2 {
          font-size: 18px !important;
          font-weight: 600 !important;
          letter-spacing: 0 !important;
        }
        .feed-verdict-card button {
          min-height: 42px !important;
          border-width: 1px !important;
          border-radius: 14px !important;
          box-shadow: none !important;
          background-image: none !important;
        }
        .feed-screen-premium .app-modal-sheet {
          border: 1px solid rgba(255,255,255,.07) !important;
          border-bottom: 0 !important;
          border-radius: 26px 26px 0 0 !important;
          background: #101210 !important;
          box-shadow: none !important;
        }
        .feed-screen-premium .app-modal-sheet [class*="bg-[linear-gradient"],
        .feed-screen-premium .app-modal-sheet [class*="shadow-"] {
          background-image: none !important;
          box-shadow: none !important;
        }
        .feed-screen-premium .app-modal-sheet h3,
        .feed-screen-premium .app-modal-sheet h2 {
          font-weight: 600 !important;
          letter-spacing: 0 !important;
        }
        .feed-screen-premium .app-modal-sheet .rounded-2xl,
        .feed-screen-premium .app-modal-sheet [class*="rounded-[22px]"] {
          border-radius: 14px !important;
        }
        .feed-screen-premium .app-modal-sheet .space-y-2\\.5 > div,
        .feed-screen-premium .app-modal-sheet .space-y-2 > div,
        .feed-screen-premium .app-modal-sheet-scroll > div {
          border-color: rgba(255,255,255,.07) !important;
          background: transparent !important;
          box-shadow: none !important;
        }
        .feed-screen-premium .app-modal-sheet [class*="size=xl"],
        .feed-screen-premium .app-modal-sheet img {
          max-width: 40px;
          max-height: 40px;
        }
        .feed-screen-premium .app-modal-sheet button {
          min-height: 40px;
        }
        @media (max-width: 390px) {
          .feed-stories-shell,
          .feed-post-list {
            padding-inline: 7px !important;
          }
          .feed-stories-row {
            gap: 11px !important;
          }
          .feed-story-item {
            width: 78px !important;
          }
          .feed-story-avatar,
          .feed-story-avatar .feed-story-ring,
          .feed-story-ring {
            width: 78px !important;
            height: 104px !important;
          }
          .feed-story-item button + div,
          .feed-story-item > span,
          .feed-story-item > button:not(.feed-story-avatar),
          .feed-story-item > div:last-child {
            width: 78px !important;
            max-width: 78px !important;
          }
        }
      `}</style>
      {/* ── Header ── */}
      <div
        className={`feed-main-header safe-area-top relative overflow-hidden shadow-[0_14px_38px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-transform duration-300 ease-in-out ${
          isHeaderVisible
            ? "translate-y-0"
            : "feed-main-header--hidden -translate-y-full"
        }`}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          /* ORIGINAL HEADER BG (green gradient):
             "radial-gradient(ellipse at 28% -42%, rgba(74,222,128,0.11), transparent 66%), radial-gradient(ellipse at 76% -34%, rgba(14,165,233,0.07), transparent 64%), linear-gradient(180deg, rgba(6,8,6,0.94) 0%, rgba(10,15,10,0.93) 54%, rgba(3,4,3,0.92) 100%)"
          */
          background:
            "linear-gradient(180deg, rgba(20,20,20,0.98) 0%, rgba(15,15,15,0.97) 100%)",
        }}
      >
        <div className="px-4 pb-3 pt-3">
          <div className="relative flex items-center justify-between">
            <div className="z-10 flex items-center gap-2">
              <button
                onClick={onNavigateToDares}
                className="relative flex h-10 w-10 items-center justify-center text-[#94a3b8] transition-all duration-200 hover:text-[#4ade80]"
                aria-label="Dares received"
              >
                <Target size={18} />
                {predictionMentionCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex min-w-[20px] items-center justify-center rounded-full border border-black bg-[#4ade80] px-1.5 py-0.5 text-[10px] font-bold leading-none text-black shadow-md">
                    {predictionMentionCount > 99
                      ? "99+"
                      : predictionMentionCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setShowDareEventsScreen(true)}
                className="flex h-10 w-10 items-center justify-center text-[#94a3b8] transition-all duration-200 hover:text-[#4ade80]"
                aria-label={
                  hasLiveJail
                    ? `${jailSession?.prisoner.name || "Someone"} is in jail. Open event rooms`
                    : "Open event rooms"
                }
              >
                <span className="relative flex h-[32px] w-[32px] items-center justify-center">
                  <span
                    className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ease-out ${
                      hasLiveJail && showJailEventIcon
                        ? "scale-75 opacity-0 blur-[1px]"
                        : "scale-100 opacity-100 blur-0"
                    }`}
                  >
                    <Trophy size={18} />
                  </span>
                  <span
                    className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ease-out ${
                      hasLiveJail && showJailEventIcon
                        ? "scale-100 opacity-100 blur-0"
                        : "scale-75 opacity-0 blur-[1px]"
                    }`}
                  >
                    <FeedHeaderJailIcon />
                  </span>
                </span>
              </button>
            </div>
            <div
              className="absolute left-1/2 flex min-w-[88px] -translate-x-1/2 items-center justify-center sm:min-w-[148px]"
              onPointerDown={handleDareLogoPointerDown}
              onPointerUp={handleDareLogoPointerUp}
              onPointerCancel={handleDareLogoPointerUp}
              onPointerLeave={handleDareLogoPointerUp}
              onContextMenu={(event) => {
                event.preventDefault();
                openDareCenterPrompt();
              }}
              aria-label="Long press Dare to open Dare Center"
            >
              <h1
                className="absolute inset-0 flex items-center justify-center text-center text-[27px] font-extrabold tracking-[-0.04em] text-white"
                style={{
                  textShadow: "0 0 10px rgba(74, 222, 128, 0.22)",
                  fontFamily: "var(--font-ui)",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                }}
              >
                <span>dare</span>
                <span
                  style={{
                    display: "inline-block",
                    marginLeft: "3px",
                    verticalAlign: "sub",
                    transform: "translateY(-5px)",
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    backgroundColor: "#4ade80",
                  }}
                />
              </h1>
            </div>
            <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center space-x-1">
              <button
                onClick={() => {
                  if (alertUnreadCount > 0) {
                    markAllAsRead().catch(() => {});
                  }
                  onNavigateToAlerts();
                }}
                className="relative flex h-11 w-11 items-center justify-center text-[#94a3b8] transition-all duration-200 hover:text-white"
                aria-label="Notifications"
              >
                <Heart size={18} />
                {alertUnreadCount > 0 && (
                  <span className="pointer-events-none absolute right-2 top-1.5 text-[10px] font-black leading-none text-[#cbd5e1]">
                    {alertUnreadCount > 99 ? "99+" : alertUnreadCount}
                  </span>
                )}
              </button>
              <button
                onClick={onNavigateToChat}
                className="relative flex h-11 w-11 items-center justify-center text-[#94a3b8] transition-all duration-200 hover:text-[#4ade80]"
                aria-label="Messages"
              >
                <MessageSquare size={18} />
                {unreadCount > 0 && (
                  <span className="pointer-events-none absolute right-2 top-1.5 text-[10px] font-black leading-none text-[#4ade80]">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      {showDareCenterPrompt && (
        <div
          className="app-modal-backdrop fixed inset-0 z-[120] flex items-end bg-black/70 backdrop-blur-sm"
          onClick={() => setShowDareCenterPrompt(false)}
        >
          <div
            className="app-modal-sheet mb-[calc(var(--safe-area-bottom)+86px)] flex h-[min(348px,calc(100dvh-var(--safe-area-top)-var(--safe-area-bottom)-124px))] max-h-[calc(100dvh-var(--safe-area-top)-var(--safe-area-bottom)-124px)] w-full flex-col overflow-hidden rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(19,24,20,0.98),rgba(6,8,7,0.99))] shadow-[0_-24px_70px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-[#3a3a3a]" />
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 scrollbar-hide">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#86efac]">
                    <Sparkles size={13} />
                    Hidden hub
                  </div>
                  <h3 className="text-[24px] font-black leading-tight text-white">
                    Enter Dare Center?
                  </h3>
                  <p className="mt-1.5 text-[13px] font-semibold leading-relaxed text-[#94a3b8]">
                    A guided tour of the features that make Dare different, with
                    animated screens and quick ways to understand each flow.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDareCenterPrompt(false)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-[#94a3b8] transition-colors hover:text-white"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 pb-3">
                {[
                  ["Proof", "real/fake"],
                  ["Signals", "live alerts"],
                ].map(([top, bottom]) => (
                  <div
                    key={`${top}-${bottom}`}
                    className="rounded-[20px] border border-white/8 bg-white/[0.035] px-3 py-3 text-center"
                  >
                    <p className="text-base font-black text-white">{top}</p>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#64748b]">
                      {bottom}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-3 border-t border-white/8 bg-[linear-gradient(180deg,rgba(6,8,7,0.72),rgba(6,8,7,0.99))] px-5 pb-4 pt-3">
              <button
                type="button"
                onClick={() => setShowDareCenterPrompt(false)}
                className="min-h-[48px] rounded-full border border-white/8 bg-white/[0.04] px-5 text-sm font-black text-white transition-colors hover:bg-white/[0.07]"
              >
                Stay here
              </button>
              <button
                type="button"
                onClick={handleEnterDareCenter}
                className="min-h-[48px] rounded-full bg-[linear-gradient(135deg,#4ade80,#22c55e)] px-5 text-sm font-black text-black shadow-[0_16px_36px_rgba(74,222,128,0.28)] transition-transform active:scale-[0.98]"
              >
                Enter center
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        ref={scrollContainerRef}
        className="feed-scroll-surface flex-1 overflow-y-auto"
        style={{
          paddingTop: "calc(var(--safe-area-top) + 64px)",
          paddingBottom: "calc(var(--bottom-nav-total-height) + 24px)",
        }}
      >
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.78),rgba(74,222,128,0))]" />
        {/* ── Stories row ── */}
        <div className="feed-stickman-shell">
          <div className="feed-stickman-row scrollbar-hide">
            <button
              type="button"
              className="feed-stickman-item feed-stickman-item-top"
              onPointerDown={handleYourStoryPressStart}
              onPointerUp={handleYourStoryPressEnd}
              onPointerCancel={handleYourStoryPressEnd}
              onPointerLeave={handleYourStoryPressEnd}
              onContextMenu={(event) => {
                event.preventDefault();
                storyTypeLongPressTriggeredRef.current = true;
                openStoryTypeSheet();
              }}
              onClick={handleYourStoryClick}
              aria-label="Open your story"
            >
              <FeedStickman
                label="Your story"
                avatar={currentUser.avatar}
                accent="#f5f5f5"
                placement="top"
              />
              <span className="feed-stickman-plus" aria-hidden="true">
                <Plus size={12} strokeWidth={3} />
              </span>
            </button>

            {storiesLoading && stories.length === 0 &&
              [1, 2, 3, 4].map((i) => (
                <div key={`story-skel-${i}`} className="feed-stickman-item feed-stickman-skeleton">
                  <div className="feed-stickman-skeleton-head animate-pulse" />
                </div>
              ))}

            {storyGroups.map((storyGroup, index) => {
              const story = storyGroup.displayStory;
              if (!story) return null;
              const placement = index % 2 === 0 ? "bottom" : "top";
              return (
                <div
                  key={storyGroup.authorId}
                  className={`feed-stickman-item feed-stickman-item-${placement} ${storyGroup.hasViewed ? "is-viewed" : "is-new"}`}
                >
                  <button
                    type="button"
                    className="feed-stickman-button"
                    onClick={() => handleStoryClick(index)}
                    aria-label={`Open ${story.author.displayName}'s story`}
                  >
                    <FeedStickman
                      label={story.author.displayName}
                      avatar={story.author.avatar}
                      accent={storyGroup.hasViewed ? "#7d8790" : story.storyType === "dedication" ? "#facc15" : "#4ade80"}
                      placement={placement}
                    />
                    <span className="feed-stickman-label">{story.author.displayName}</span>
                  </button>
                </div>
              );
            })}

            {TEMP_FEED_STICKMEN.map((mock) => (
              <div
                key={mock.label}
                className={`feed-stickman-item feed-stickman-item-${mock.placement} feed-stickman-mock`}
                aria-hidden="true"
              >
                <FeedStickman
                  label={mock.label}
                  accent={mock.accent}
                  placement={mock.placement}
                  animate
                />
              </div>
            ))}
          </div>
        </div>

        <div className="feed-stories-shell hidden px-4 pt-2 pb-1">
          <div className="feed-stories-row flex space-x-4 overflow-x-auto px-3 py-2 scrollbar-hide">
            {/* Your Story Circle */}
            <div
              className="feed-story-item shrink-0 flex flex-col items-center cursor-pointer group"
              onPointerDown={handleYourStoryPressStart}
              onPointerUp={handleYourStoryPressEnd}
              onPointerCancel={handleYourStoryPressEnd}
              onPointerLeave={handleYourStoryPressEnd}
              onContextMenu={(event) => {
                event.preventDefault();
                storyTypeLongPressTriggeredRef.current = true;
                openStoryTypeSheet();
              }}
              onClick={handleYourStoryClick}
            >
              <div className="relative">
                {storyPostedPulse && userStories.length > 0 && (
                  <div className="own-story-posted-ring pointer-events-none absolute -inset-[5px] rounded-full ring-2 ring-[#79d99a]/75" />
                )}
                {userStories.length > 0 ? (
                  // User has active stories — show profile picture avatar with green ring
                  <div className="feed-story-avatar relative h-[84px] w-[84px] rounded-full bg-transparent p-[3px] shadow-[0_18px_40px_rgba(10,14,12,0.45)] transition-all duration-300 group-hover:scale-[1.04]">
                    <div className="w-full h-full rounded-full bg-[#050505] p-[3px]">
                      {currentUser.avatar ? (
                        <Avatar
                          src={currentUser.avatar}
                          alt="Your story"
                          userId={currentUser.userId}
                          username={currentUser.username}
                          fallbackText={currentUser.name || currentUser.username || "You"}
                          className="!h-full !w-full"
                        />
                      ) : (
                        <div className="w-full h-full rounded-full bg-[#1a1a1a] flex items-center justify-center">
                          <span className="text-white text-2xl font-bold">
                            {currentUser.name?.charAt(0) ||
                              currentUser.username?.charAt(0) ||
                              "U"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  // No stories — keep the avatar visible and let the corner badge act as the add affordance
                  <div className="feed-story-avatar relative h-[84px] w-[84px] rounded-full border border-white/10 bg-[radial-gradient(circle_at_top,#1b2321_0%,#101513_58%,#070908_100%)] p-[3px] shadow-[0_18px_40px_rgba(0,0,0,0.45)] transition-all duration-300 group-hover:scale-[1.04] group-hover:border-[#4ade80]/60">
                    <div className="h-full w-full rounded-full bg-[#050505] p-[3px]">
                      <Avatar
                        src={currentUser.avatar}
                        alt="Your story"
                        userId={currentUser.userId}
                        username={currentUser.username}
                        fallbackText={
                          currentUser.name || currentUser.username || "You"
                        }
                        className="!h-full !w-full"
                      />
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openStoryTypeSheet();
                  }}
                  className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-black bg-gradient-to-br from-[#4ade80] to-[#22c55e] shadow-md transition-transform duration-300 group-hover:scale-110"
                  aria-label="Create story"
                >
                  <Plus size={12} className="text-black" />
                </button>
              </div>
            </div>

            {/* Shimmer skeleton circles while stories are loading and no cached data */}
            {storiesLoading &&
              stories.length === 0 &&
              [1, 2, 3, 4].map((i) => (
                <div
                  key={`story-skel-${i}`}
                  className="shrink-0 flex flex-col items-center"
                >
                  <div className="h-[84px] w-[84px] animate-pulse rounded-full bg-[#1e1e1e]" />
                  <div className="w-14 h-2.5 bg-[#1e1e1e] rounded-full mt-3 animate-pulse" />
                </div>
              ))}

            {/* Friends' Stories — live through Supabase Realtime */}
            {storyGroups.map((storyGroup, index) => {
              const story = storyGroup.displayStory;
              const hasViewed = storyGroup.hasViewed;
              if (!story) return null;

              return (
                <div
                  key={storyGroup.authorId}
                  className={`feed-story-item shrink-0 flex flex-col items-center group ${
                    hasViewed ? "is-viewed" : "is-new"
                  } ${
                    story.storyType === "dedication"
                      ? "is-dedication"
                      : "is-personal"
                  }`}
                  >
                    <button
                      type="button"
                      className="feed-story-avatar relative h-[84px] w-[84px] cursor-pointer"
                      onClick={() => handleStoryClick(index)}
                    >
                    <div
                      className={`feed-story-ring relative h-[84px] w-[84px] rounded-full p-[3px] shadow-[0_18px_40px_rgba(0,0,0,0.45)] transition-all duration-300 group-hover:scale-[1.04] ${
                        hasViewed
                          ? "bg-gradient-to-br from-[#2b2f35] via-[#353941] to-[#44474f]"
                          : story.storyType === "dedication"
                            ? "bg-gradient-to-br from-[#5a5a5a] via-[#858585] to-[#303030]"
                            : "bg-gradient-to-br from-[#454545] via-[#6e6e6e] to-[#262626]"
                      }`}
                    >
                      <div
                        className={`w-full h-full rounded-full ${
                          hasViewed ? "bg-[#111315]" : "bg-[#050505]"
                        } p-[3px]`}
                      >
                        <div className="w-full h-full rounded-full overflow-hidden">
                          <Avatar
                            src={story.author.avatar}
                            alt={story.author.displayName}
                            size="2xl"
                            userId={story.author.id}
                            username={story.author.username}
                            className="!h-full !w-full"
                          />
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Posts ── show only the most recent post per user */}
        {pendingUpload && (
          <div className="mx-2 mt-8 mb-5 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              {pendingUpload.previewUrl ? (
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[15px] border border-white/[0.14] bg-black">
                  <img src={pendingUpload.previewUrl} alt="Your post preview" className="h-full w-full object-cover opacity-90" />
                </div>
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[15px] border border-white/[0.12] bg-black text-[10px] font-black tracking-[0.16em] text-white/45">POST</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-[13px] font-bold tracking-[-0.01em] text-white">
                    {pendingUpload.status === "error" ? "Post failed" : "Posting your update"}
                  </p>
                  <span className={`shrink-0 text-[11px] font-bold tabular-nums ${pendingUpload.status === "error" ? "text-white/55" : "text-white/65"}`}>
                    {pendingUpload.status === "error" ? "Failed" : `${pendingUpload.progress}%`}
                  </span>
                </div>
                <p className="mt-1 truncate text-[12px] text-white/42">{pendingUpload.caption}</p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.12]" role="progressbar" aria-valuenow={pendingUpload.progress} aria-valuemin={0} aria-valuemax={100}>
                  <div className={`h-full rounded-full transition-[width] duration-300 ${pendingUpload.status === "error" ? "bg-white/35" : "bg-white"}`} style={{ width: `${pendingUpload.progress}%` }} />
                </div>
                {pendingUpload.error && <p className="mt-1 text-[11px] text-white/55">{pendingUpload.error}</p>}
              </div>
            </div>
          </div>
        )}

        {isFeedBootstrapping ? (
          <div className="feed-post-list px-2 pb-6 space-y-5">
            <PostSkeleton />
            <PostSkeleton />
            <PostSkeleton />
          </div>
        ) : (
          <div className="feed-post-list px-2 pb-6 space-y-5">
            {sortedPosts.map((post: FeedPost, index) => {
              const liked = iLiked(post, currentUser.userId);
              const likeCount = totalLikes(post);
              const heartColor = feedHeartColor(Math.max(
                post.likesByUser?.[currentUser.userId]?.tapCount ?? 0,
                optimisticLikeProofRef.current[post.id]?.tapCount ?? 0,
              ));
              const likeMilestone = likeMilestonePosts[post.id];
              const isLikeMilestoneCelebrating = Boolean(likeMilestone);
              const topLikeTapper = getTopLikeTapper(
                post,
                optimisticLikeProofRef.current[post.id],
              );
              const sparkParts = getPostSparkParts(post);
              const caption = getFeedPostCaption(post);
              const isSparkExpanded = expandedSparkPostIds.has(post.id);
              const author = resolveAuthor(post.author);
              const showCommunityRail = shouldShowRailAfterPost(
                index,
                sortedPosts.length,
                COMMUNITY_RAIL_FIRST_INSERT_AFTER,
                COMMUNITY_RAIL_REPEAT_EVERY,
              );
              const showVerdictCard = shouldShowRailAfterPost(
                index,
                sortedPosts.length,
                VERDICT_CARD_FIRST_INSERT_AFTER,
                VERDICT_CARD_REPEAT_EVERY,
              ) && feedVerdicts.length > 0;
              const feedVerdictIndex =
                feedVerdicts.length > 0
                  ? (Math.floor(
                      (index - VERDICT_CARD_FIRST_INSERT_AFTER + 1) /
                        VERDICT_CARD_REPEAT_EVERY,
                    ) +
                      feedVerdicts.length) %
                    feedVerdicts.length
                  : 0;
              const feedVerdict = feedVerdicts[feedVerdictIndex];
              const showSocialDaresRail = shouldShowRailAfterPost(
                index,
                sortedPosts.length,
                SOCIAL_DARES_RAIL_FIRST_INSERT_AFTER,
                SOCIAL_CONTENT_RAIL_REPEAT_EVERY,
              );
              const showTruthsRail = shouldShowRailAfterPost(
                index,
                sortedPosts.length,
                TRUTHS_RAIL_FIRST_INSERT_AFTER,
                SOCIAL_CONTENT_RAIL_REPEAT_EVERY,
              );

              return (
                <Fragment key={post.id}>
                  <div
                    id={`feed-post-${post.id}`}
                    className={`feed-post-card relative ${
                      animatingPosts.has(post.id) ? "premium-card-burst" : ""
                    }`}
                  >
                    <div className="premium-card-glow" />
                    <div className="premium-card-ring" />
                    {isLikeMilestoneCelebrating && (
                      <LikeMilestoneStickman
                        key={`${post.id}-${likeMilestone}`}
                        author={author}
                        postId={post.id}
                        heartColor={heartColor}
                        milestone={likeMilestone}
                      />
                    )}
                    {/* Post header */}
                    <div className="feed-post-header feed-post-glass-header relative z-10 flex items-center justify-between gap-3 px-3 py-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div
                          data-feed-author-avatar
                          className={`shrink-0 ${
                            isLikeMilestoneCelebrating ? "opacity-0" : "opacity-100"
                          }`}
                        >
                          <Avatar
                            src={author.avatar}
                            alt={author.name}
                            size={40}
                            userId={author.id}
                            username={author.username}
                            style={{ border: "2px solid rgba(74,222,128,0.22)" }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (onNavigateToProfile && author.id) {
                              onNavigateToProfile(author.id);
                            }
                          }}
                          className={`min-w-0 text-left ${
                            onNavigateToProfile && author.id
                              ? "cursor-pointer"
                              : "cursor-default"
                          }`}
                        >
                          <h3 className="truncate text-[14px] font-semibold leading-tight text-white">
                            {author.name}
                          </h3>
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuPostId(post.id);
                          setActiveMenuPost(post);
                          setActiveMenuAuthor(author);
                          onPostOptionsOpenChange?.(true);
                        }}
                        className="ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/40 transition-colors active:bg-white/[0.09] active:text-white"
                        aria-label="Post options"
                      >
                        <MoreHorizontal size={20} />
                      </button>
                    </div>

                    {/* Media — carousel or single (self-contained burst layer) */}
                    <PostMedia
                      ref={(h) => {
                        postMediaRefs.current[post.id] = h;
                      }}
                      post={post}
                      onLike={addLike}
                      heartColor={heartColor}
                      topLikeTapper={topLikeTapper}
                      topLikeBadgeSide={index % 2 === 0 ? "left" : "right"}
                      onOpenLikes={() => {
                        setSelectedPostId(post.id);
                        setShowLikesModal(true);
                      }}
                    />

                    {/* Caption — primary post copy */}
                    {caption && (
                      <div className="feed-post-caption relative z-10 px-4 pt-3">
                        <p className="text-[15px] font-medium leading-relaxed text-white">
                          <span className="font-semibold text-[#F4F6F4]">
                            {author.name}
                          </span>{" "}
                          {caption}
                        </p>
                      </div>
                    )}

                    {sparkParts.length > 0 && (
                      <div className="feed-spark-summary relative z-10 px-4 pt-3">
                        <button
                          type="button"
                          className="feed-spark-pill app-pressable w-full justify-between text-left"
                          aria-expanded={isSparkExpanded}
                          aria-controls={`feed-spark-details-${post.id}`}
                          onClick={() => {
                            setExpandedSparkPostIds((current) => {
                              const next = new Set(current);
                              if (next.has(post.id)) next.delete(post.id);
                              else next.add(post.id);
                              return next;
                            });
                          }}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <Zap size={15} className="shrink-0 text-[#7dd3fc]" />
                            <span className="truncate text-[12px] font-bold text-white/60">
                              This post started {sparkParts.map((item, sparkIndex) => (
                                <Fragment key={item.label}>
                                  {sparkIndex > 0 ? ", " : ""}
                                  {formatNumber(item.count)} {item.count === 1 ? item.singular : item.label}
                                </Fragment>
                              ))}
                            </span>
                          </span>
                          <ChevronDown
                            size={16}
                            className={`shrink-0 text-white/45 transition-transform duration-200 ${
                              isSparkExpanded ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                        {isSparkExpanded && (
                          <div
                            id={`feed-spark-details-${post.id}`}
                            className="mt-1 flex flex-wrap items-center gap-2 pb-1 pl-7"
                          >
                            {sparkParts.map((item) => (
                              <span
                                key={item.label}
                                className={`rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-bold ${item.tone}`}
                              >
                                {formatNumber(item.count)} {item.count === 1 ? item.singular : item.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="feed-post-actions relative z-10 px-2 pt-3">
                      <div className="grid grid-cols-3 items-center gap-1 px-3 py-2.5">
                        <div className="flex min-w-0 items-center justify-center">
                          <button
                            onClick={(e) => handleHeartIconClick(post.id, e)}
                            className="group app-pressable flex min-w-0 items-center justify-center text-white transition-colors hover:text-[#4ade80]"
                            aria-label={liked ? "Add another like" : "Like post"}
                          >
                            <Heart
                              size={20}
                              fill={liked ? "currentColor" : "none"}
                              style={{ color: liked ? heartColor : undefined, transition: "color 650ms ease, transform 200ms ease" }}
                              strokeWidth={liked ? 0 : 2}
                              className={`shrink-0 transition-all duration-200 ${
                                liked
                                  ? "scale-110 text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.42)]"
                                  : "text-white group-hover:scale-110"
                              }`}
                            />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedPostId(post.id);
                              setShowLikesModal(true);
                            }}
                            className="ml-1 truncate text-sm font-bold text-white transition-colors hover:text-[#4ade80]"
                            aria-label="Open likes"
                          >
                            {formatNumber(likeCount)}
                          </button>
                        </div>
                        <div className="flex min-w-0 items-center justify-center">
                          <button
                            onClick={() => {
                              setSentTo(new Set());
                              setSelectedPostId(post.id);
                              setShowCommentsModal(true);
                            }}
                            className="app-pressable flex min-w-0 items-center justify-center gap-2 text-white transition-colors hover:text-[#4ade80]"
                            aria-label="Open comments"
                          >
                            <MessageCircle
                              size={20}
                              fill="none"
                              strokeWidth={2}
                              className="shrink-0"
                            />
                            <span className="truncate text-sm font-bold">
                              {formatNumber(post.comments_count)}
                            </span>
                          </button>
                        </div>
                        <div className="flex items-center justify-center">
                          <button
                            onClick={() => {
                              setSelectedPostId(post.id);
                              setSentTo(new Set());
                              setShowShareModal(true);
                            }}
                            className="app-pressable flex items-center justify-center text-white transition-colors hover:text-[#4ade80]"
                            aria-label="Share to DM"
                          >
                            <Send size={18} fill="none" strokeWidth={2} />
                          </button>
                        </div>
                      </div>
                    </div>

                  </div>
                  {showVerdictCard && (
                    <FeedVerdictCard
                      data={toFeedVerdictPreview(feedVerdict!)}
                      voting={Boolean(votingByVerdictId[feedVerdict!.id])}
                      onVote={(choice) => {
                        void voteVerdict(feedVerdict!.id, choice);
                      }}
                      onNavigate={
                        onNavigateToVerdict
                          ? () => onNavigateToVerdict(feedVerdict!.id)
                          : undefined
                      }
                    />
                  )}
                  {showSocialDaresRail && feedSocialDares.length > 0 && (
                    <SocialDaresFeedRail
                      dares={feedSocialDares}
                      onExploreAll={onNavigateToSocialDares}
                      onOpenDare={onNavigateToSocialDares}
                    />
                  )}
                  {showTruthsRail && feedHotTakes.length > 0 && (
                    <HotTakesFeedRail
                      items={feedHotTakes}
                      onExploreAll={onNavigateToTruths}
                      onOpenTruth={onNavigateToTruths}
                    />
                  )}
                  {showCommunityRail && (
                    <CommunityDareFeedRail
                      challenges={hydratedCommunityChallenges}
                      joinedChallengeIds={joinedCommunityChallengeIds}
                      onPreview={setSelectedCommunityChallenge}
                      onExploreAll={onNavigateToCommunityDares}
                    />
                  )}
                </Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════
          COMMENTS MODAL
      ══════════════════════════════════════════ */}
      {showCommentsModal && selectedPost && (
        <div
          className="app-modal-backdrop fixed inset-0 z-50 flex items-end"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            animation: "backdropFadeIn 0.25s ease-out forwards",
          }}
          onClick={() => setShowCommentsModal(false)}
        >
          <style>{`
            @keyframes backdropFadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideUpFromBottom {
              from { transform: translateY(100%); }
              to { transform: translateY(0); }
            }
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            .modal-slide-up { 
              animation: slideUpFromBottom 0.3s cubic-bezier(0.32, 0.72, 0, 1) forwards; 
            }
            .comment-fade-in { animation: fadeIn 0.2s ease-out forwards; }
          `}</style>
          <div
            className="app-modal-sheet w-full overflow-hidden rounded-t-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(19,24,20,0.98),rgba(6,8,7,0.99))] shadow-[0_-24px_70px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] flex flex-col"
            style={{
              minHeight: "min(68dvh, 720px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-4 pb-3 border-b border-white/8 shrink-0">
              <div className="w-10 h-1 bg-white/18 rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between">
                <h3 className="text-white font-bold text-lg">Comments</h3>
                <button
                  onClick={() => setShowCommentsModal(false)}
                  className="text-[#64748b] hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="app-modal-sheet-content">
              <CommentSection
                comments={selectedPost.comments.map(
                  (c): CommentItem => ({
                    id: c.id,
                    userId: c.userId,
                    name: c.name,
                    username: c.username,
                    avatar: c.avatar,
                    text: c.text,
                    createdAt: c.createdAt,
                    likes: c.likes,
                    parentId: c.parentId || null,
                    likedByCurrentUser: commentLikePersistence.hasLiked(
                      "post",
                      currentUser.userId,
                      c.id,
                    ),
                  }),
                )}
                loading={selectedPost.commentsLoading}
                currentUser={{
                  userId: currentUser.userId,
                  name: currentUser.name,
                  username: currentUser.username,
                  avatar: currentUser.avatar,
                }}
                onSubmitComment={handleSubmitComment}
                onLikeComment={(commentId) =>
                  storeLikeComment(selectedPost.id, commentId)
                }
                onNavigateToProfile={onNavigateToProfile}
                autoFocusInput={false}
              />
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          LIKES MODAL
      ══════════════════════════════════════════ */}
      {showLikesModal && selectedPost && (
        <div
          className="app-modal-backdrop fixed inset-0 z-50 flex items-end"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            animation: "backdropFadeIn 0.25s ease-out forwards",
          }}
          onClick={() => setShowLikesModal(false)}
        >
          <style>{`
            @keyframes backdropFadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideUpFromBottom { 
              from { transform: translateY(100%); } 
              to { transform: translateY(0); } 
            }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            .modal-slide-up { animation: slideUpFromBottom 0.3s cubic-bezier(0.32, 0.72, 0, 1) forwards; }
            .modal-fade-in { animation: fadeIn 0.2s ease-out forwards; }
          `}</style>
          <div
            className="app-modal-sheet w-full rounded-t-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(19,24,20,0.98),rgba(6,8,7,0.99))] shadow-[0_-24px_70px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] flex flex-col"
            style={{
              minHeight: "min(60dvh, 640px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-4 pb-3 shrink-0">
              <div className="w-10 h-1 bg-white/18 rounded-full mx-auto mb-5" />
              <h3 className="text-white font-bold text-lg mb-1">Likes</h3>
              <p className="text-[#64748b] text-sm mb-3">
                {totalLikeTaps(selectedPost)} total likes ·{" "}
                {Object.keys(getLikesByUser(selectedPost)).length}{" "}
                {Object.keys(getLikesByUser(selectedPost)).length === 1
                  ? "person"
                  : "people"}
              </p>
            </div>
            {selectedPost.likesLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-[#64748b] text-sm">Loading likes...</div>
              </div>
            ) : Object.keys(getLikesByUser(selectedPost)).length === 0 ? (
              <p className="text-[#64748b] text-center py-8 text-sm">
                No likes yet
              </p>
            ) : (
              <div className="app-modal-sheet-scroll px-5 pb-[calc(var(--safe-area-bottom)+16px)] space-y-2.5">
                {Object.values(getLikesByUser(selectedPost))
                  .sort((a, b) => b.tapCount - a.tapCount)
                  .map((entry, index) => (
                    <div
                      key={entry.userId}
                      className="flex items-center gap-3 rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(15,22,18,0.96),rgba(7,10,8,0.98))] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] modal-fade-in"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <Avatar
                        src={entry.avatar}
                        alt={entry.name}
                        size={52}
                        userId={entry.userId}
                      />
                      <div className="flex-1">
                        <p
                          onClick={() => {
                            if (onNavigateToProfile && entry.userId) {
                              onNavigateToProfile(entry.userId);
                            }
                          }}
                          className="cursor-pointer text-[14px] font-bold leading-tight text-white transition-colors hover:text-[#4ade80]"
                        >
                          {entry.name}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            if (onNavigateToProfile && entry.userId) {
                              onNavigateToProfile(entry.userId);
                            }
                          }}
                          className={`text-[12px] font-semibold leading-tight text-[#94a3b8] transition-colors ${
                            onNavigateToProfile && entry.userId
                              ? "cursor-pointer hover:text-[#4ade80]"
                              : "cursor-default"
                          }`}
                        >
                          {entry.username}
                        </button>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/8 bg-[#101713] px-3 py-1.5">
                        <Heart
                          size={12}
                          fill="#f0f0f0"
                          className="text-white"
                        />
                        <span className="text-[12px] font-bold text-white">
                          liked {entry.tapCount}{" "}
                          {entry.tapCount === 1 ? "time" : "times"}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Infinite Scroll Sentinel ── */}
      {sortedPosts.length > 0 && hasMorePosts && (
        <>
          <div
            ref={loadMoreRef}
            aria-hidden="true"
            className="h-px w-full pointer-events-none"
          />
          {isLoadingMore && (
            <div className="px-4 pb-6 pt-2">
              <div className="flex items-center justify-center">
                <div className="rounded-full border border-white/8 bg-[#111] px-5 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.28)]">
                  <div className="w-6 h-6 border-2 border-[#4ade80] border-t-transparent rounded-full animate-spin"></div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════
          SHARE MODAL
      ══════════════════════════════════════════ */}
      {showShareModal && selectedPost && (
        <div
          className="app-modal-backdrop fixed inset-0 z-50 flex items-end"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            animation: "backdropFadeIn 0.25s ease-out forwards",
          }}
          onClick={() => setShowShareModal(false)}
        >
          <style>{`
            @keyframes backdropFadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideUpFromBottom { 
              from { transform: translateY(100%); } 
              to { transform: translateY(0); } 
            }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            .modal-slide-up { animation: slideUpFromBottom 0.3s cubic-bezier(0.32, 0.72, 0, 1) forwards; }
            .share-fade-in { animation: fadeIn 0.2s ease-out forwards; }
          `}</style>
          <div
            className="app-modal-sheet w-full rounded-t-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(19,24,20,0.98),rgba(6,8,7,0.99))] shadow-[0_-24px_70px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] flex flex-col"
            style={{
              height: "min(86dvh, 760px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-4 pb-3 border-b border-white/8 shrink-0">
              <div className="w-10 h-1 bg-white/18 rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between">
                <h3 className="text-white font-bold text-lg">Send to…</h3>
                <button
                  onClick={() => setShowShareModal(false)}
                  className="text-[#64748b] hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            {selectedPost.media && (
              <div className="px-6 py-4 shrink-0 border-b border-white/8">
                <div className="flex items-center space-x-3">
                  <img
                    src={selectedPost.media.url}
                    alt="Post"
                    className="w-14 h-14 rounded-xl object-cover"
                  />
                  <div>
                    <p className="text-white text-sm font-semibold">
                      {resolveAuthor(selectedPost.author).name}
                    </p>
                    <p className="text-[#94a3b8] text-xs line-clamp-2">
                      {selectedPost.content}
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="app-modal-sheet-scroll px-4 py-3 pb-[calc(var(--safe-area-bottom)+12px)] space-y-2">
              {loadingFriends ? (
                <p className="text-[#64748b] text-center py-10 text-sm">
                  Loading friends...
                </p>
              ) : friends.length === 0 ? (
                <p className="text-[#64748b] text-center py-10 text-sm">
                  No friends to share with
                </p>
              ) : (
                friends.map((friend, index) => {
                  const recipientId = friend.user_id || friend.id;
                  const sent = recipientId ? sentTo.has(recipientId) : false;
                  const sending =
                    !!recipientId && sendingRecipientId === recipientId;
                  return (
                    <div
                      key={recipientId || friend.id || index}
                      className="flex items-center space-x-4 rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(15,22,18,0.96),rgba(7,10,8,0.98))] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-[#4ade80]/24 hover:bg-[#101713] share-fade-in"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <Avatar
                        src={friend.avatar_url || ""}
                        alt={
                          (friend.user_id &&
                            userProfiles[friend.user_id]?.displayName) ||
                          friend.display_name ||
                          friend.username
                        }
                        size="xl"
                        userId={friend.user_id}
                      />
                      <div className="flex-1">
                        <p
                          onClick={() => {
                            if (onNavigateToProfile && friend.user_id) {
                              onNavigateToProfile(friend.user_id);
                            }
                          }}
                          className="text-white font-semibold text-base cursor-pointer hover:text-[#4ade80] transition-colors"
                        >
                          {(friend.user_id &&
                            userProfiles[friend.user_id]?.displayName) ||
                            friend.display_name ||
                            friend.username}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            if (onNavigateToProfile && friend.user_id) {
                              onNavigateToProfile(friend.user_id);
                            }
                          }}
                          className={`text-sm text-[#94a3b8] transition-colors ${
                            onNavigateToProfile && friend.user_id
                              ? "cursor-pointer hover:text-[#4ade80]"
                              : "cursor-default"
                          }`}
                        >
                          {(friend.user_id &&
                            userProfiles[friend.user_id]?.username) ||
                            friend.username}
                        </button>
                      </div>
                      <button
                        onClick={() => void handleSendToDM(friend)}
                        disabled={!recipientId || sent || sending}
                        className={`min-h-9 min-w-9 justify-center rounded-full px-3 text-sm font-semibold transition-all duration-200 flex items-center space-x-1.5 ${sent ? "bg-[#101713] text-[#64748b] cursor-default" : sending ? "bg-[#d9fbe5] text-[#18532c] cursor-wait" : "bg-[#4ade80] text-black hover:bg-[#22c55e] active:scale-95"} disabled:bg-[#101713] disabled:text-[#64748b] disabled:cursor-default`}
                      >
                        {sent ? (
                          <span>Sent ✓</span>
                        ) : sending ? (
                          <span>Sending...</span>
                        ) : (
                          <>
                            <Send
                              size={18}
                              fill="currentColor"
                              strokeWidth={0}
                            />
                            <span className="sr-only">Send</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          STORY UPLOAD MODAL
      ══════════════════════════════════════════ */}
      {showStoryTypeSheet && (
        <div
          className="app-modal-backdrop fixed inset-0 z-[130] flex items-end bg-black/72 backdrop-blur-sm"
          onClick={closeStoryTypeSheet}
        >
          <div
            className="app-modal-sheet w-full overflow-hidden rounded-t-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(19,24,20,0.98),rgba(6,8,7,0.99))] p-5 shadow-[0_-24px_70px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-[#3a3a3a]" />
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#86efac]">
                  <Sparkles size={13} />
                  Story setup
                </div>
                <h3 className="text-[26px] font-black leading-tight text-white">
                  Choose your story type
                </h3>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-[#94a3b8]">
                  Pick the story style first, then continue into the story
                  picker flow.
                </p>
              </div>
              <button
                type="button"
                onClick={closeStoryTypeSheet}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-[#94a3b8] transition-colors hover:text-white"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => openStoryComposer("personal")}
                className="group rounded-[24px] border border-white/8 bg-white/[0.04] p-4 text-left transition-all hover:border-[#4ade80]/35 hover:bg-[#4ade80]/8"
              >
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-[#4ade80]/20 bg-[#4ade80]/10 text-[#4ade80] shadow-[0_12px_28px_rgba(74,222,128,0.12)]">
                  <UserRound size={20} />
                </div>
                <p className="font-bold text-white">Normal story</p>
                <p className="mt-1 text-xs leading-relaxed text-[#94a3b8]">
                  Continue with the regular story flow.
                </p>
              </button>
              <button
                type="button"
                onClick={() => openStoryComposer("dedication")}
                className="group rounded-[24px] border border-white/8 bg-white/[0.04] p-4 text-left transition-all hover:border-[#facc15]/35 hover:bg-[#facc15]/8"
              >
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-[#facc15]/20 bg-[#facc15]/10 text-[#facc15] shadow-[0_12px_28px_rgba(250,204,21,0.12)]">
                  <Gift size={20} />
                </div>
                <p className="font-bold text-white">Dedication story</p>
                <p className="mt-1 text-xs leading-relaxed text-[#94a3b8]">
                  Choose one person, then keep building the story.
                </p>
              </button>
            </div>
          </div>
        </div>
      )}

      {showStoryUploadModal && (
        <div
          className="story-composer app-story-shell"
          onClick={() => {
            if (storyTextSelected && !isStoryTextDragging) {
              setStoryTextSelected(false);
            }
          }}
        >
          {storyDraftFile && storyDraftPreviewUrl ? (
            <div
              ref={storyDraftPreviewRef}
              className={`story-canvas ${
                isStoryMediaDragging ? "is-media-dragging" : ""
              }`}
              onPointerDown={handleStoryCanvasPointerDown}
              onPointerMove={handleStoryCanvasPointerMove}
              onPointerUp={handleStoryCanvasPointerUp}
              onPointerCancel={handleStoryCanvasPointerUp}
              onTouchStart={(event) => {
                storyFilterTouchStartXRef.current = event.touches[0].clientX;
              }}
              onTouchEnd={(event) => {
                if (isStoryDrawMode) return;
                if (storyMediaMovedRef.current) {
                  storyMediaMovedRef.current = false;
                  storyFilterTouchStartXRef.current = null;
                  return;
                }
                const startX = storyFilterTouchStartXRef.current;
                storyFilterTouchStartXRef.current = null;
                if (startX === null) return;
                const dx = event.changedTouches[0].clientX - startX;
                if (Math.abs(dx) < 52) return;
                setStoryFilterByOffset(dx < 0 ? 1 : -1);
              }}
            >
              {!storyDraftFile.type.startsWith("video/") && (
                <div
                  className="story-media-blur"
                  style={{ backgroundImage: `url(${storyDraftPreviewUrl})` }}
                />
              )}
              <div ref={storyMediaMainRef} className="story-media-main">
                {storyDraftFile.type.startsWith("video/") ? (
                  <video
                    src={storyDraftPreviewUrl}
                    style={{
                      filter: getStoryFilterPreset(storyDraftFilter).cssFilter,
                    }}
                    muted
                    playsInline
                    autoPlay
                    loop
                  />
                ) : (
                  <img
                    src={storyDraftPreviewUrl}
                    alt="Story preview"
                    style={{
                      filter: getStoryFilterPreset(storyDraftFilter).cssFilter,
                    }}
                  />
                )}
              </div>
              <div
                className="pointer-events-none absolute inset-0 z-[12]"
                style={{
                  background: getStoryFilterPreset(storyDraftFilter).overlay,
                }}
              />
              <svg
                className="story-draw-svg"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                {storyDrawPaths.map((path) => (
                  <path
                    key={path.id}
                    d={path.d}
                    fill="none"
                    stroke={path.color}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={
                      path.brush === "Marker"
                        ? path.width * 1.35
                        : path.brush === "Chalk"
                          ? path.width * 0.9
                          : path.width
                    }
                    opacity={path.brush === "Chalk" ? 0.72 : 1}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
              {isStoryDrawMode && <div className="story-draw-hotspot" />}
              <div className="story-overlay-layer">
                {storyDraftText.trim() && (
                  <div
                    ref={storyTextLayerRef}
                    className={`story-text-layer ${
                      storyTextSelected ? "is-selected" : ""
                    }`}
                    style={{
                      left: `${storyDraftTextX}%`,
                      top: `${storyDraftTextY}%`,
                      transform: `translate3d(-50%, -50%, 0) scale(${storyDraftTextScale}) rotate(${storyDraftTextRotation}deg)`,
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      setStoryTextSelected(true);
                    }}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      openStoryTextEditor();
                    }}
                    onPointerDown={handleStoryTextPointerDown}
                    onPointerMove={handleStoryTextPointerMove}
                    onPointerUp={handleStoryTextPointerUp}
                    onPointerCancel={handleStoryTextPointerUp}
                  >
                    <span
                      className={`story-text-chip ${getStoryTextFontClassName(
                        storyDraftTextFont,
                      )} ${storyDraftTextBg ? "" : "is-plain"}`}
                      style={{
                        background: storyDraftTextBg
                          ? "rgba(0, 0, 0, 0.32)"
                          : "transparent",
                        color: storyDraftTextColor,
                        fontSize: `${storyDraftTextSize}px`,
                        textAlign: storyDraftTextAlign,
                        textShadow: "0 2px 14px rgba(0,0,0,0.72)",
                      }}
                    >
                      {storyDraftText}
                    </span>
                  </div>
                )}
                {storyDraftMusicId !== "none" && (
                  <div className="story-music-widget">
                    <div
                      className="flex h-[42px] w-[42px] items-center justify-center rounded-xl"
                      style={{
                        background:
                          getStoryMusicPreset(storyDraftMusicId).color,
                        color: "#07110a",
                      }}
                    >
                      <Music size={20} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white">
                        {getStoryMusicPreset(storyDraftMusicId).label}
                      </p>
                      <p className="truncate text-[11px] font-semibold text-white/70">
                        {getStoryMusicPreset(storyDraftMusicId).description}
                      </p>
                      <div className="story-eq mt-1">
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="absolute bottom-[142px] left-1/2 z-[52] -translate-x-1/2 rounded-full bg-black/45 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-white/90 backdrop-blur-md">
                {getStoryFilterPreset(storyDraftFilter).label}
              </div>
              <div
                className={`story-delete-zone ${
                  storyDeleteActive ? "is-visible" : ""
                } ${storyDeleteArmed ? "is-armed" : ""}`}
              >
                <Trash2 size={18} />
                <span className="text-sm font-black">Drag here to remove</span>
              </div>
            </div>
          ) : (
            <div
              className="story-camera-surface"
              onTouchStart={(event) => {
                storyGalleryTouchStartYRef.current = event.touches[0].clientY;
              }}
              onTouchEnd={(event) => {
                const startY = storyGalleryTouchStartYRef.current;
                storyGalleryTouchStartYRef.current = null;
                if (startY === null) return;
                const dy = event.changedTouches[0].clientY - startY;
                if (dy < -46) setStoryGallerySnap(60);
                if (dy > 46) setStoryGallerySnap(25);
              }}
            >
              <div className="absolute inset-x-6 top-[18%] rounded-[28px] border border-white/10 bg-white/[0.06] p-5 text-center shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur-md">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/12 text-white">
                  <ImagePlus size={25} />
                </div>
                <p className="text-lg font-black text-white">
                  {storyComposerStage === "audience"
                    ? "Create story"
                    : storyUploadMode === "dedication"
                      ? "Dedication story"
                      : "Your story"}
                </p>
                <p className="mt-1 text-sm font-semibold text-white/62">
                  Fullscreen preview with gallery, effects, text, music, and
                  draw.
                </p>
              </div>
              {storyComposerStage === "audience" ? (
                <div className="story-audience-picks">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      beginStoryCapture("personal");
                    }}
                    className="story-audience-card app-pressable"
                  >
                    <UserRound size={22} className="mb-5 text-[#4ade80]" />
                    <p className="text-base font-black">Personal</p>
                    <p className="mt-1 text-xs font-semibold text-white/58">
                      Your regular story.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      beginStoryCapture("dedication");
                    }}
                    className="story-audience-card app-pressable"
                  >
                    <Gift size={22} className="mb-5 text-[#facc15]" />
                    <p className="text-base font-black">Dedication</p>
                    <p className="mt-1 text-xs font-semibold text-white/58">
                      Pick one person.
                    </p>
                  </button>
                </div>
              ) : (
                <>
                  <div className="story-camera-bottom">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openStoryFilePicker();
                      }}
                      className="story-shutter app-pressable"
                      disabled={
                        isUploading ||
                        (storyUploadMode === "dedication" &&
                          !dedicationRecipient)
                      }
                      aria-label="Select story media"
                    />
                  </div>
                  <div
                    className="story-gallery-sheet"
                    style={{ height: `${storyGallerySnap}dvh` }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="flex items-center justify-center px-4 pt-3">
                      <button
                        type="button"
                        onClick={() =>
                          setStoryGallerySnap((snap) =>
                            snap === 25 ? 60 : snap === 60 ? 100 : 25,
                          )
                        }
                        className="h-5 w-16 rounded-full"
                        aria-label="Resize gallery"
                      >
                        <span className="mx-auto block h-1.5 w-12 rounded-full bg-white/28" />
                      </button>
                    </div>
                    {storyUploadMode === "dedication" && (
                      <div className="px-4 pb-2 pt-1">
                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                          {loadingFriends ? (
                            [1, 2, 3].map((item) => (
                              <div
                                key={`story-friend-loading-${item}`}
                                className="h-12 w-32 shrink-0 animate-pulse rounded-full bg-white/10"
                              />
                            ))
                          ) : friends.length === 0 ? (
                            <div className="rounded-full bg-white/10 px-4 py-3 text-xs font-bold text-white/70">
                              No friends available
                            </div>
                          ) : (
                            friends.map((friend) => {
                              const friendId = friend.user_id || friend.id;
                              const selected =
                                dedicationRecipient &&
                                (dedicationRecipient.user_id ||
                                  dedicationRecipient.id) === friendId;
                              return (
                                <button
                                  key={friendId}
                                  type="button"
                                  onClick={() => setDedicationRecipient(friend)}
                                  className={`flex h-12 shrink-0 items-center gap-2 rounded-full border px-2 pr-4 ${
                                    selected
                                      ? "border-[#4ade80]/60 bg-[#4ade80]/18"
                                      : "border-white/10 bg-white/8"
                                  }`}
                                >
                                  <Avatar
                                    src={friend.avatar_url || ""}
                                    alt={friend.display_name || friend.username}
                                    size="sm"
                                    userId={friendId}
                                    username={friend.username}
                                  />
                                  <span className="max-w-24 truncate text-xs font-black text-white">
                                    {friend.display_name || friend.username}
                                  </span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                    <div className="story-gallery-grid">
                      <button
                        type="button"
                        onClick={openStoryFilePicker}
                        disabled={
                          isUploading ||
                          (storyUploadMode === "dedication" &&
                            !dedicationRecipient)
                        }
                        className="story-gallery-tile flex flex-col items-center justify-center gap-2 text-white disabled:opacity-45"
                      >
                        <ImagePlus size={24} />
                        <span className="text-xs font-black">Gallery</span>
                      </button>
                      {storyDraftPreviewUrls.map((url, index) => (
                        <button
                          key={`${url}-${index}`}
                          type="button"
                          onClick={() => {
                            setSelectedStoryDraftIndex(index);
                            setStoryComposerStage("editor");
                          }}
                          className="story-gallery-tile"
                          aria-label={`Select story media ${index + 1}`}
                        >
                          {storyDraftFiles[index]?.type.startsWith("video/") ? (
                            <video
                              src={url}
                              className="h-full w-full object-cover"
                              muted
                              playsInline
                            />
                          ) : (
                            <img
                              src={url}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          )}
                        </button>
                      ))}
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => (
                        <div
                          key={`story-gallery-empty-${item}`}
                          className="story-gallery-tile bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]"
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="story-safe-top">
            {isStoryDrawMode ? (
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setStoryDrawPaths((paths) => paths.slice(0, -1));
                  }}
                  className="story-glass-button"
                  aria-label="Undo"
                >
                  <Undo2 size={20} />
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled
                    className="story-glass-button opacity-45"
                    aria-label="Redo"
                  >
                    <Redo2 size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setIsStoryDrawMode(false);
                    }}
                    className="story-glass-button px-4 text-sm font-black"
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (isUploading) return;
                    if (storyDraftFile) {
                      clearStoryDraft();
                      setStoryComposerStage("capture");
                    } else if (storyComposerStage === "capture") {
                      setShowStoryUploadModal(false);
                      setShowStoryTypeSheet(true);
                      setStoryComposerStage("audience");
                      setStoryUploadMode(null);
                      setDedicationRecipient(null);
                    } else {
                      closeStoryComposer();
                    }
                  }}
                  className="story-glass-button"
                  aria-label="Back"
                >
                  <ChevronLeft size={22} />
                </button>
                <div className="flex gap-2">
                  {storyDraftFile && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        undoStoryEditorStep();
                      }}
                      className="story-glass-button"
                      aria-label="Undo story edit"
                    >
                      <Undo2 size={20} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (storyDraftFile) openStoryFilePicker();
                    }}
                    className="story-glass-button"
                    aria-label="More"
                  >
                    <MoreHorizontal size={22} />
                  </button>
                </div>
              </>
            )}
          </div>

          {storyDraftFile && (
            <>
              <div
                className={`story-right-toolbar ${
                  storyToolbarCollapsed ||
                  isStoryTextEditorOpen ||
                  isStoryDrawMode ||
                  isStoryTextDragging
                    ? "is-collapsed"
                    : ""
                }`}
              >
                <button
                  type="button"
                  className="story-glass-button story-tool-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openStoryTextEditor();
                  }}
                  aria-label="Add text"
                >
                  <Type size={21} />
                </button>
                <button
                  type="button"
                  className="story-glass-button story-tool-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsStoryMusicModalOpen(true);
                  }}
                  aria-label="Add music"
                >
                  <Music size={21} />
                </button>
                <button
                  type="button"
                  className="story-glass-button story-tool-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsStoryDrawMode(true);
                  }}
                  aria-label="Draw"
                >
                  <Pencil size={21} />
                </button>
                <button
                  type="button"
                  className="story-glass-button story-tool-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setStoryFilterByOffset(1);
                  }}
                  aria-label="Effects"
                >
                  <Sparkles size={21} />
                </button>
                <button
                  type="button"
                  className="story-glass-button story-tool-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setStoryToolbarCollapsed(true);
                    window.setTimeout(
                      () => setStoryToolbarCollapsed(false),
                      1200,
                    );
                  }}
                  aria-label="Collapse tools"
                >
                  <ChevronDown size={22} />
                </button>
              </div>

              <div className="story-share-panel">
                <div className="story-share-row">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setStoryPublishAudience("story");
                    }}
                    className={`story-share-pill ${
                      storyPublishAudience === "story" ? "is-active" : ""
                    }`}
                  >
                    Your Story
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setStoryPublishAudience("close-friends");
                    }}
                    className={`story-share-pill ${
                      storyPublishAudience === "close-friends"
                        ? "is-active"
                        : ""
                    }`}
                  >
                    Close Friends
                  </button>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void publishStoryDraft();
                  }}
                  disabled={isUploading}
                  className="story-post-button"
                >
                  {isUploading ? (
                    <span>{`Posting ${uploadProgress}%`}</span>
                  ) : (
                    <>
                      <span>
                        {storyPublishAudience === "close-friends"
                          ? "Post to Close Friends"
                          : "Post to Your Story"}
                      </span>
                      <ArrowRight size={20} strokeWidth={3} />
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {isStoryTextEditorOpen && (
            <div
              className="story-panel"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsStoryTextEditorOpen(false)}
                  className="story-glass-button"
                  aria-label="Close text editor"
                >
                  <X size={20} />
                </button>
                <button
                  type="button"
                  onClick={finishStoryTextEditing}
                  className="story-glass-button px-5 text-sm font-black"
                >
                  Done
                </button>
              </div>
              <div className="story-text-editor-stage">
                <div className="story-text-size-rail">
                  <button
                    type="button"
                    onClick={() =>
                      setStoryDraftTextSize((size) =>
                        Math.max(STORY_TEXT_SIZE_MIN, size - 2),
                      )
                    }
                    className="story-glass-button story-size-stepper"
                    aria-label="Decrease story text size"
                  >
                    -
                  </button>
                  <div className="story-text-size-slider-wrap">
                    <input
                      type="range"
                      min={STORY_TEXT_SIZE_MIN}
                      max={STORY_TEXT_SIZE_MAX}
                      value={storyDraftTextSize}
                      onChange={(event) =>
                        setStoryDraftTextSize(Number(event.target.value))
                      }
                      className="story-text-size-slider"
                      aria-label="Story text size"
                    />
                  </div>
                  <span className="story-text-size-badge">
                    {storyDraftTextSize}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setStoryDraftTextSize((size) =>
                        Math.min(STORY_TEXT_SIZE_MAX, size + 2),
                      )
                    }
                    className="story-glass-button story-size-stepper"
                    aria-label="Increase story text size"
                  >
                    +
                  </button>
                </div>
                <textarea
                  value={storyDraftText}
                  maxLength={120}
                  onChange={(event) => setStoryDraftText(event.target.value)}
                  autoFocus
                  placeholder="Type"
                  className={`story-textarea ${getStoryTextFontClassName(
                    storyDraftTextFont,
                  )}`}
                  style={{
                    color: storyDraftTextColor,
                    textAlign: storyDraftTextAlign,
                    fontSize: `${storyDraftTextSize}px`,
                    lineHeight: 1.05,
                  }}
                />
              </div>
              <div className="story-tool-row">
                <button
                  type="button"
                  className="story-control-pill"
                  onClick={() =>
                    setStoryDraftTextColor((color) => {
                      const nextIndex =
                        (STORY_TEXT_COLORS.indexOf(color) + 1) %
                        STORY_TEXT_COLORS.length;
                      return STORY_TEXT_COLORS[nextIndex];
                    })
                  }
                >
                  <Palette size={16} className="mr-2 inline" />
                  Color
                </button>
                <button
                  type="button"
                  className={`story-control-pill ${storyDraftTextBg ? "is-active" : ""}`}
                  onClick={() => setStoryDraftTextBg((enabled) => !enabled)}
                >
                  Bg
                </button>
                <button
                  type="button"
                  className="story-control-pill"
                  onClick={() =>
                    setStoryDraftTextAlign((align) =>
                      align === "center"
                        ? "left"
                        : align === "left"
                          ? "right"
                          : "center",
                    )
                  }
                >
                  <AlignCenter size={16} className="mr-2 inline" />
                  Align
                </button>
                <button type="button" className="story-control-pill">
                  <Play size={16} className="mr-2 inline" />
                  Animate
                </button>
              </div>
              <div className="story-font-carousel scrollbar-hide">
                {STORY_TEXT_FONTS.map((font) => (
                  <button
                    key={font}
                    type="button"
                    onClick={() => setStoryDraftTextFont(font)}
                    className={`story-control-pill story-font-pill ${getStoryTextFontClassName(
                      font,
                    )} ${storyDraftTextFont === font ? "is-active" : ""}`}
                  >
                    {font}
                  </button>
                ))}
              </div>
              <div className="story-tool-row items-center">
                {STORY_TEXT_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setStoryDraftTextColor(color)}
                    className={`h-10 w-10 shrink-0 rounded-full border-2 ${
                      storyDraftTextColor === color
                        ? "border-white"
                        : "border-white/20"
                    }`}
                    style={{ backgroundColor: color }}
                    aria-label={`Use ${color}`}
                  />
                ))}
                <span className="rounded-full border border-[#4ade80]/18 bg-white/8 px-3 py-2 text-xs font-black text-[#d7ffe6]">
                  {storyDraftTextSize}px
                </span>
              </div>
            </div>
          )}

          {isStoryMusicModalOpen && (
            <div
              className="story-panel"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    stopStoryMusicPreview();
                    setIsStoryMusicModalOpen(false);
                  }}
                  className="story-glass-button"
                  aria-label="Close music"
                >
                  <X size={20} />
                </button>
                <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full bg-white/12 px-4">
                  <Search size={17} className="text-white/65" />
                  <input
                    value={storyMusicSearch}
                    onChange={(event) =>
                      setStoryMusicSearch(event.target.value)
                    }
                    placeholder="Search music"
                    className="min-w-0 flex-1 bg-transparent text-sm font-bold text-white outline-none placeholder:text-white/50"
                  />
                </div>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide">
                {["Trending", "For You", "Recent"].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className="story-control-pill"
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 scrollbar-hide">
                {filteredStoryMusicPresets.map((music) => (
                  <button
                    key={music.id}
                    type="button"
                    onClick={() => previewStoryMusic(music.id)}
                    className={`grid w-full grid-cols-[54px_1fr] gap-3 rounded-[22px] border p-3 text-left ${
                      storyDraftMusicId === music.id
                        ? "border-[#4ade80]/60 bg-[#4ade80]/14"
                        : "border-white/10 bg-white/[0.07]"
                    }`}
                  >
                    <div
                      className="flex h-[54px] w-[54px] items-center justify-center rounded-2xl"
                      style={{ background: music.color, color: "#081108" }}
                    >
                      <Music size={24} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-base font-black text-white">
                            {music.label}
                          </p>
                          <p className="truncate text-xs font-semibold text-white/58">
                            {music.description}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {storyDraftMusicId === music.id && (
                            <span className="rounded-full bg-[#4ade80]/18 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#d7ffe6]">
                              Selected
                            </span>
                          )}
                          {music.id !== "none" && (
                            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/24 text-white">
                              {storyPreviewMusicId === music.id ? (
                                <PauseCircle size={18} />
                              ) : (
                                <Volume2 size={18} />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 flex h-6 items-center gap-1">
                        {[8, 14, 9, 18, 11, 20, 12, 16, 10, 15, 7].map(
                          (height, index) => (
                            <span
                              key={`${music.id}-wave-${index}`}
                              className="w-1 rounded-full bg-white/55"
                              style={{ height }}
                            />
                          ),
                        )}
                      </div>
                    </div>
                  </button>
                ))}
                {filteredStoryMusicPresets.length === 0 && (
                  <div className="rounded-[22px] border border-white/10 bg-white/[0.07] px-4 py-5 text-center text-sm font-semibold text-white/62">
                    No free tracks match that search.
                  </div>
                )}
              </div>
              <div className="mt-3 rounded-[22px] border border-white/10 bg-white/[0.07] p-4">
                <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-[0.14em] text-white/58">
                  <span>Timeline</span>
                  <span>{storyMusicTrim}s</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={30}
                  value={storyMusicTrim}
                  onChange={(event) =>
                    setStoryMusicTrim(Number(event.target.value))
                  }
                  className="w-full accent-[#4ade80]"
                  aria-label="Music trim"
                />
                <p className="mt-2 text-[11px] font-semibold text-white/50">
                  Tap a track to preview it. Close this sheet when you want to
                  keep the selected one.
                </p>
              </div>
            </div>
          )}

          {isStoryDrawMode && (
            <div
              className="absolute inset-x-0 bottom-0 z-[72] px-4 pb-[calc(env(safe-area-inset-bottom,0px)+14px)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="rounded-[28px] border border-white/10 bg-black/64 p-3 shadow-[0_-16px_48px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                <div className="story-tool-row scrollbar-hide">
                  {STORY_BRUSHES.map((brush) => (
                    <button
                      key={brush}
                      type="button"
                      onClick={() => setStoryBrush(brush)}
                      className={`story-control-pill ${storyBrush === brush ? "is-active" : ""}`}
                    >
                      {brush}
                    </button>
                  ))}
                </div>
                <div className="story-tool-row items-center">
                  {STORY_TEXT_COLORS.map((color) => (
                    <button
                      key={`brush-${color}`}
                      type="button"
                      onClick={() => setStoryBrushColor(color)}
                      className={`h-10 w-10 shrink-0 rounded-full border-2 ${
                        storyBrushColor === color
                          ? "border-white"
                          : "border-white/20"
                      }`}
                      style={{ backgroundColor: color }}
                      aria-label={`Use brush ${color}`}
                    />
                  ))}
                  <SlidersHorizontal size={18} className="text-white/70" />
                  <input
                    type="range"
                    min={2}
                    max={18}
                    value={storyBrushSize}
                    onChange={(event) =>
                      setStoryBrushSize(Number(event.target.value))
                    }
                    className="min-w-28 flex-1 accent-[#4ade80]"
                    aria-label="Brush size"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {false && showStoryUploadModal && (
        <div
          className="app-modal-backdrop fixed inset-0 bg-black/75 z-[100] flex items-end backdrop-blur-sm"
          onClick={closeStoryComposer}
        >
          <div
            className="app-modal-sheet max-h-[92dvh] w-full overflow-y-auto rounded-t-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(19,22,20,0.98),rgba(8,9,8,0.98))] p-5 shadow-[0_-24px_70px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)] scrollbar-hide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-[#3a3a3a] rounded-full mx-auto mb-6" />
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#86efac]">
                  Story
                </p>
                <h3 className="mt-1 text-lg font-bold text-white">
                  {storyUploadMode === "dedication"
                    ? "Dedicate a story"
                    : storyUploadMode === "personal"
                      ? "Personal story"
                      : "Create story"}
                </h3>
              </div>
              {storyUploadMode && !isUploading && (
                <button
                  type="button"
                  onClick={() => {
                    setStoryUploadMode(null);
                    setDedicationRecipient(null);
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-[#94a3b8] transition-colors hover:text-white"
                  aria-label="Back"
                >
                  <ChevronLeft size={18} />
                </button>
              )}
            </div>
            <div className="space-y-4">
              {isUploading && (
                <div className="rounded-[24px] border border-[#4ade80]/15 bg-[#08110b]/80 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white text-sm font-medium">
                      Uploading{" "}
                      {storyDraftFiles.length > 1 ? "stories" : "story"}
                    </span>
                    <span className="text-[#4ade80] text-sm font-medium">
                      {uploadProgress}%
                    </span>
                  </div>
                  <div className="w-full bg-[#2a2a2a] rounded-full h-2">
                    <div
                      className="bg-[#4ade80] h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {storyDraftFile && storyDraftPreviewUrl && (
                <div className="space-y-4">
                  {storyDraftFiles.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                      {storyDraftFiles.map((file, index) => (
                        <button
                          key={`${file.name}-${file.lastModified}-${index}`}
                          type="button"
                          onClick={() => setSelectedStoryDraftIndex(index)}
                          className={`relative h-16 w-11 shrink-0 overflow-hidden rounded-xl border transition-all ${
                            selectedStoryDraftIndex === index
                              ? "border-[#4ade80] ring-2 ring-[#4ade80]/25"
                              : "border-white/10"
                          }`}
                          aria-label={`Preview story media ${index + 1}`}
                        >
                          {file.type.startsWith("video/") ? (
                            <video
                              src={storyDraftPreviewUrls[index]}
                              className="h-full w-full object-cover"
                              muted
                              playsInline
                            />
                          ) : (
                            <img
                              src={storyDraftPreviewUrls[index]}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          )}
                          <span className="absolute bottom-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-black/70 px-1 text-[10px] font-bold text-white">
                            {index + 1}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div
                    ref={storyDraftPreviewRef}
                    className="relative mx-auto aspect-[9/16] max-h-[54vh] w-full max-w-[300px] overflow-hidden rounded-[28px] border border-white/10 bg-black shadow-[0_22px_60px_rgba(0,0,0,0.45)]"
                    onTouchStart={(event) => {
                      storyFilterTouchStartXRef.current =
                        event.touches[0].clientX;
                    }}
                    onTouchEnd={(event) => {
                      const startX = storyFilterTouchStartXRef.current;
                      storyFilterTouchStartXRef.current = null;
                      if (startX === null) return;
                      const dx = event.changedTouches[0].clientX - startX;
                      if (Math.abs(dx) < 45) return;
                      setStoryFilterByOffset(dx < 0 ? 1 : -1);
                    }}
                  >
                    {storyDraftFile.type.startsWith("video/") ? (
                      <video
                        src={storyDraftPreviewUrl}
                        className="h-full w-full object-contain object-center"
                        style={{
                          filter:
                            getStoryFilterPreset(storyDraftFilter).cssFilter,
                        }}
                        muted
                        playsInline
                        autoPlay
                        loop
                      />
                    ) : (
                      <img
                        src={storyDraftPreviewUrl}
                        alt="Story preview"
                        className="h-full w-full object-contain object-center"
                        style={{
                          filter:
                            getStoryFilterPreset(storyDraftFilter).cssFilter,
                        }}
                      />
                    )}
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        background:
                          getStoryFilterPreset(storyDraftFilter).overlay,
                      }}
                    />
                    {storyDraftText.trim() && (
                      <div
                        className={`absolute z-20 max-w-[86%] cursor-grab touch-none select-none text-center active:cursor-grabbing ${
                          isStoryTextDragging
                            ? "ring-2 ring-[#4ade80]/60"
                            : "ring-1 ring-white/12"
                        } rounded-2xl`}
                        style={{
                          left: `${storyDraftTextX}%`,
                          top: `${storyDraftTextY}%`,
                          transform: "translate(-50%, -50%)",
                        }}
                        onPointerDown={handleStoryTextPointerDown}
                        onPointerMove={handleStoryTextPointerMove}
                        onPointerUp={handleStoryTextPointerUp}
                        onPointerCancel={handleStoryTextPointerUp}
                      >
                        <span
                          className="inline-block max-w-full break-words rounded-2xl bg-black/28 px-3.5 py-2 font-black leading-tight shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-sm"
                          style={{
                            color: storyDraftTextColor,
                            fontSize: `${storyDraftTextSize}px`,
                            textShadow: "0 2px 12px rgba(0,0,0,0.8)",
                          }}
                        >
                          {storyDraftText}
                        </span>
                      </div>
                    )}
                    <div className="absolute bottom-3 left-3 rounded-full border border-white/12 bg-black/45 px-3 py-1 text-[11px] font-bold text-white/90 backdrop-blur-sm">
                      {getStoryFilterPreset(storyDraftFilter).label}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-white/8 bg-white/[0.035] p-3">
                    <div className="mb-2 flex items-center gap-2 text-[#d1d5db]">
                      <Type size={15} className="text-[#4ade80]" />
                      <span className="text-xs font-bold uppercase tracking-[0.16em]">
                        Text
                      </span>
                    </div>
                    <input
                      value={storyDraftText}
                      maxLength={120}
                      onChange={(event) =>
                        setStoryDraftText(event.target.value)
                      }
                      placeholder="Add text"
                      className="w-full rounded-2xl border border-white/8 bg-black/30 px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-[#64748b] focus:border-[#4ade80]/45"
                    />
                    <div className="mt-3 flex gap-2">
                      {STORY_TEXT_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setStoryDraftTextColor(color)}
                          className={`h-7 w-7 rounded-full border-2 transition-transform ${
                            storyDraftTextColor === color
                              ? "scale-110 border-white"
                              : "border-white/15"
                          }`}
                          style={{ backgroundColor: color }}
                          aria-label={`Use text color ${color}`}
                        />
                      ))}
                    </div>
                    <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-bold text-[#cbd5e1]">
                          Text size
                        </span>
                        <span className="text-xs font-bold text-[#86efac]">
                          {storyDraftTextSize}px
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            setStoryDraftTextSize((size) =>
                              Math.max(16, size - 2),
                            )
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-lg font-bold text-white"
                          aria-label="Decrease story text size"
                        >
                          -
                        </button>
                        <input
                          type="range"
                          min={16}
                          max={42}
                          value={storyDraftTextSize}
                          onChange={(event) =>
                            setStoryDraftTextSize(Number(event.target.value))
                          }
                          className="min-w-0 flex-1 accent-[#4ade80]"
                          aria-label="Story text size"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setStoryDraftTextSize((size) =>
                              Math.min(42, size + 2),
                            )
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-lg font-bold text-white"
                          aria-label="Increase story text size"
                        >
                          +
                        </button>
                      </div>
                      <p className="mt-2 text-[11px] font-medium text-[#64748b]">
                        Drag the text on the preview to place it.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-[0.16em] text-[#94a3b8]">
                      <Wand2 size={14} className="text-[#4ade80]" />
                      Swipe preview or tap a filter
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                      {STORY_FILTER_PRESETS.map((filter) => (
                        <button
                          key={filter.id}
                          type="button"
                          onClick={() => setStoryDraftFilter(filter.id)}
                          className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition-all ${
                            storyDraftFilter === filter.id
                              ? "border-[#4ade80]/55 bg-[#4ade80]/15 text-[#bbf7d0]"
                              : "border-white/8 bg-white/[0.04] text-[#cbd5e1]"
                          }`}
                        >
                          {filter.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-[0.16em] text-[#94a3b8]">
                      <Music size={14} className="text-[#facc15]" />
                      Generated copyright-free music
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {STORY_MUSIC_PRESETS.map((music) => (
                        <button
                          key={music.id}
                          type="button"
                          onClick={() => setStoryDraftMusicId(music.id)}
                          className={`rounded-[18px] border p-3 text-left transition-all ${
                            storyDraftMusicId === music.id
                              ? "border-[#4ade80]/45 bg-[#4ade80]/10"
                              : "border-white/8 bg-white/[0.035]"
                          }`}
                        >
                          <p className="text-sm font-bold text-white">
                            {music.label}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[#94a3b8]">
                            {music.description}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!storyUploadMode && !storyDraftFile && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setStoryUploadMode("personal")}
                    className="group rounded-[24px] border border-white/8 bg-white/[0.04] p-4 text-left transition-all hover:border-[#4ade80]/35 hover:bg-[#4ade80]/8"
                  >
                    <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-[#4ade80]/20 bg-[#4ade80]/10 text-[#4ade80] shadow-[0_12px_28px_rgba(74,222,128,0.12)]">
                      <UserRound size={20} />
                    </div>
                    <p className="font-bold text-white">Personal</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#94a3b8]">
                      Your regular story.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStoryUploadMode("dedication")}
                    className="group rounded-[24px] border border-white/8 bg-white/[0.04] p-4 text-left transition-all hover:border-[#facc15]/35 hover:bg-[#facc15]/8"
                  >
                    <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-[#facc15]/20 bg-[#facc15]/10 text-[#facc15] shadow-[0_12px_28px_rgba(250,204,21,0.12)]">
                      <Gift size={20} />
                    </div>
                    <p className="font-bold text-white">Dedication</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#94a3b8]">
                      Pick one person.
                    </p>
                  </button>
                </div>
              )}

              {storyUploadMode === "dedication" && !storyDraftFile && (
                <div className="space-y-3">
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1 scrollbar-hide">
                    {loadingFriends ? (
                      [1, 2, 3].map((item) => (
                        <div
                          key={`dedication-friend-skel-${item}`}
                          className="flex items-center gap-3 rounded-[22px] border border-white/8 bg-white/[0.035] p-3"
                        >
                          <div className="h-11 w-11 animate-pulse rounded-full bg-white/10" />
                          <div className="flex-1 space-y-2">
                            <div className="h-3 w-28 animate-pulse rounded-full bg-white/10" />
                            <div className="h-2.5 w-20 animate-pulse rounded-full bg-white/8" />
                          </div>
                        </div>
                      ))
                    ) : friends.length === 0 ? (
                      <div className="rounded-[22px] border border-white/8 bg-white/[0.03] p-4 text-center text-sm text-[#94a3b8]">
                        No friends available
                      </div>
                    ) : (
                      friends.map((friend) => {
                        const friendId = friend.user_id || friend.id;
                        const selected =
                          dedicationRecipient &&
                          (dedicationRecipient.user_id ||
                            dedicationRecipient.id) === friendId;

                        return (
                          <button
                            key={friendId}
                            type="button"
                            onClick={() => setDedicationRecipient(friend)}
                            className={`flex w-full items-center gap-3 rounded-[22px] border p-3 text-left transition-all ${
                              selected
                                ? "border-[#4ade80]/45 bg-[#4ade80]/10 shadow-[0_12px_30px_rgba(74,222,128,0.12)]"
                                : "border-white/8 bg-white/[0.035] hover:border-white/16 hover:bg-white/[0.055]"
                            }`}
                          >
                            <Avatar
                              src={friend.avatar_url || ""}
                              alt={friend.display_name || friend.username}
                              size="md"
                              userId={friendId}
                              username={friend.username}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold text-white">
                                {friend.display_name || friend.username}
                              </p>
                              <p className="truncate text-xs text-[#94a3b8]">
                                @{stripAtSymbol(friend.username)}
                              </p>
                            </div>
                            {selected && (
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#4ade80] text-black">
                                <Check size={15} strokeWidth={3} />
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {storyUploadMode && !storyDraftFile && (
                <button
                  onClick={openStoryFilePicker}
                  disabled={
                    isUploading ||
                    (storyUploadMode === "dedication" && !dedicationRecipient)
                  }
                  className={`flex w-full items-center justify-center space-x-2 rounded-2xl py-4 font-semibold transition-colors ${
                    isUploading ||
                    (storyUploadMode === "dedication" && !dedicationRecipient)
                      ? "cursor-not-allowed bg-[#2a2a2a] text-[#64748b]"
                      : "bg-[#4ade80] text-black hover:bg-[#22c55e]"
                  }`}
                >
                  <ImagePlus size={20} />
                  <span>{isUploading ? "Uploading..." : "Select media"}</span>
                </button>
              )}
              {storyDraftFile && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={openStoryFilePicker}
                    disabled={isUploading}
                    className="rounded-2xl bg-[#2a2a2a] py-4 font-semibold text-white transition-colors hover:bg-[#3a3a3a] disabled:cursor-not-allowed disabled:text-[#64748b]"
                  >
                    Change media
                  </button>
                  <button
                    type="button"
                    onClick={() => void publishStoryDraft()}
                    disabled={isUploading}
                    className="rounded-2xl bg-[#4ade80] py-4 font-bold text-black transition-colors hover:bg-[#22c55e] disabled:cursor-not-allowed disabled:bg-[#2a2a2a] disabled:text-[#64748b]"
                  >
                    {isUploading
                      ? "Posting..."
                      : storyDraftFiles.length > 1
                        ? `Post ${storyDraftFiles.length} stories`
                        : "Post story"}
                  </button>
                </div>
              )}
              <button
                onClick={closeStoryComposer}
                disabled={isUploading}
                className={`w-full font-semibold py-4 rounded-2xl transition-colors ${isUploading ? "bg-[#1a1a1a] text-[#64748b] cursor-not-allowed" : "bg-[#2a2a2a] text-white hover:bg-[#3a3a3a]"}`}
              >
                {isUploading ? "Please wait..." : "Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          STORY VIEWER
      ══════════════════════════════════════════ */}
      {selectedCommunityChallenge && (
        <CommunityChallengePreviewScreen
          challenge={
            selectedHydratedCommunityChallenge || selectedCommunityChallenge
          }
          isJoined={joinedCommunityChallengeIds.has(
            selectedCommunityChallenge.id,
          )}
          onClose={() => setSelectedCommunityChallenge(null)}
          onJoin={() =>
            handleJoinCommunityChallenge(
              selectedHydratedCommunityChallenge || selectedCommunityChallenge,
            )
          }
          onOpenHub={() => {
            setSelectedCommunityChallenge(null);
            setShowCommunityChallengeHub(true);
          }}
        />
      )}

      {showCommunityChallengeHub && (
        <div className="fixed inset-0 z-[10000] bg-[#030403]">
          <ChallengeHubScreen
            isActive
            onBack={() => setShowCommunityChallengeHub(false)}
          />
        </div>
      )}

      {showDareEventsScreen && (
        <DareEventsScreen
          onClose={() => setShowDareEventsScreen(false)}
          onOpenDareCenter={() => {
            setShowDareEventsScreen(false);
            handleEnterDareCenter();
          }}
          onOpenRoastRoom={() => {
            setShowDareEventsScreen(false);
            setShowRoastJailScreen(true);
          }}
          onOpenFriendshipCourt={() => {
            setShowDareEventsScreen(false);
            setShowFriendshipCourtScreen(true);
          }}
          onOpenJail={() => {
            setShowDareEventsScreen(false);
            setShowCircleJailScreen(true);
          }}
        />
      )}

      {showRoastJailScreen && (
        <RoastJailScreen onClose={() => setShowRoastJailScreen(false)} />
      )}

      {showFriendshipCourtScreen && (
        <FriendshipCourtScreen
          onClose={() => setShowFriendshipCourtScreen(false)}
          onSentenced={() => {
            setShowFriendshipCourtScreen(false);
            setShowCircleJailScreen(true);
          }}
        />
      )}

      {showCircleJailScreen && (
        <CircleJailScreen
          onClose={() => {
            setShowCircleJailScreen(false);
            setShowDareEventsScreen(true);
          }}
        />
      )}

      {showCircleSelector && (
        <div
          className="fixed inset-0 z-[141] flex items-end bg-black/70 backdrop-blur-sm"
          onClick={() => setShowCircleSelector(false)}
        >
          <div
            className="relative w-full overflow-hidden rounded-t-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,24,20,0.99),rgba(5,8,6,1))] p-4 pb-[calc(var(--safe-area-bottom)+16px)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/18" />
            <div className="mb-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="m-0 text-[11px] font-black uppercase tracking-[0.18em] text-[#86efac]">
                  Circles
                </p>
                <h3 className="m-0 mt-1 text-xl font-black text-white">
                  Choose a scrapbook
                </h3>
                <p className="m-0 mt-1 text-sm font-bold text-[#94a3b8]">
                  Open a circle, rename it, or create a new one.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCircleSelector(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/[0.04] text-[#94a3b8]"
                aria-label="Close circles"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid max-h-[42dvh] grid-cols-2 gap-2 overflow-y-auto pr-1 scrollbar-hide">
              {customCircles.map((circle) => (
                <div
                  key={circle.id}
                  className="rounded-[24px] border border-white/8 bg-white/[0.04] p-3"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOpenCircleId(circle.id);
                      setShowCircleSelector(false);
                    }}
                    className="block w-full text-left"
                  >
                    <p className="m-0 truncate text-sm font-black text-white">
                      {circle.name}
                    </p>
                    <p className="m-0 mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/38">
                      {circle.member_ids.length} members
                    </p>
                  </button>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCircleManageId(circle.id);
                        setShowCircleSelector(false);
                      }}
                      className="flex h-9 flex-1 items-center justify-center gap-2 rounded-full border border-white/8 bg-white/[0.035] text-xs font-black text-white/72"
                    >
                      <Pencil size={13} />
                      Manage
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenCircleId(circle.id);
                        setShowCircleSelector(false);
                      }}
                      className="flex h-9 flex-1 items-center justify-center gap-2 rounded-full bg-[#4ade80] text-xs font-black text-[#061006]"
                    >
                      Open
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowCircleCreateModal(true)}
              className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-dashed border-[#4ade80]/28 bg-white/[0.03] px-3 text-left text-white transition-all duration-200 hover:bg-white/[0.06]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4ade80]/12 text-[#86efac]">
                <Plus size={16} />
              </span>
              <div className="min-w-0">
                <p className="m-0 truncate text-sm font-black">Create circle</p>
                <p className="m-0 mt-0.5 text-[10px] font-bold uppercase tracking-[0.11em] text-[#64748b]">
                  Add a new friend-group world
                </p>
              </div>
            </button>
          </div>
        </div>
      )}

      {showCircleCreateModal && (
        <div
          className="fixed inset-0 z-[142] flex items-end bg-black/70 backdrop-blur-sm"
          onClick={() => setShowCircleCreateModal(false)}
        >
          <div
            className="relative w-full overflow-hidden rounded-t-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,24,20,0.99),rgba(5,8,6,1))] p-4 pb-[calc(var(--safe-area-bottom)+16px)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/18" />
            <p className="m-0 text-xl font-black text-white">Create circle</p>
            <p className="m-0 mt-1 text-sm font-bold text-[#94a3b8]">
              Give this friend group a name and keep it private to you for now.
            </p>
            <div className="mt-4 rounded-[22px] border border-white/8 bg-white/[0.04] p-3">
              <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.14em] text-[#86efac]">
                Circle name
              </label>
              <input
                value={circleDraftName}
                onChange={(event) => setCircleDraftName(event.target.value)}
                placeholder="College crew"
                className="w-full bg-transparent text-[17px] font-black text-white outline-none placeholder:text-white/28"
              />
            </div>
            <button
              type="button"
              onClick={() => void handleCreateCircle()}
              className="mt-3 flex min-h-12 w-full items-center justify-center rounded-full bg-[#4ade80] text-sm font-black text-[#061006]"
            >
              Create circle
            </button>
          </div>
        </div>
      )}

      {circleManageId && activeCircle && (
        <div
          className="fixed inset-0 z-[143] flex items-end bg-black/70 backdrop-blur-sm"
          onClick={() => setCircleManageId(null)}
        >
          <div
            className="relative w-full overflow-hidden rounded-t-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,24,20,0.99),rgba(5,8,6,1))] p-4 pb-[calc(var(--safe-area-bottom)+16px)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/18" />
            <p className="m-0 text-xl font-black text-white">Manage circle</p>
            <p className="m-0 mt-1 text-sm font-bold text-[#94a3b8]">
              Rename or delete this circle.
            </p>
            <div className="mt-4 space-y-2">
              <div className="rounded-[22px] border border-white/8 bg-white/[0.04] p-3">
                <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.14em] text-[#86efac]">
                  Circle name
                </label>
                <input
                  value={circleManageName}
                  onChange={(event) => setCircleManageName(event.target.value)}
                  className="w-full bg-transparent text-[16px] font-black text-white outline-none placeholder:text-white/28"
                  placeholder="Circle name"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleRenameCircle()}
                className="flex min-h-12 w-full items-center justify-center rounded-full bg-[#4ade80] text-sm font-black text-[#061006]"
              >
                Save rename
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteCircle()}
                className="flex min-h-12 w-full items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-sm font-black text-white/78"
              >
                Delete circle
              </button>
            </div>
          </div>
        </div>
      )}

      {activeCircle && openCircleId && (
        <CircleScrapbookScreen
          circle={activeCircle}
          isCustomCircle={true}
          posts={posts}
          stories={stories}
          dares={darePosts}
          truths={truthPosts}
          onClose={() => setOpenCircleId(null)}
          onManage={() => {
            setCircleManageId(activeCircle.id);
            setOpenCircleId(null);
          }}
        />
      )}

      {showStoryViewerModal && viewerStories.length > 0 && (
        <StoryViewer
          stories={viewerStories}
          initialIndex={selectedStoryIndex}
          isOwner={viewerIsOwner}
          currentUserId={currentUser.userId}
          onClose={() => {
            setShowStoryViewerModal(false);
            setViewerStoryAuthorId(null);
            onStoryViewerOpenChange?.(false);
          }}
          onDelete={viewerIsOwner ? handleDeleteStory : undefined}
          onNavigateToProfile={onNavigateToProfile}
          onReact={!viewerIsOwner ? handleStoryReact : undefined}
          onReply={!viewerIsOwner ? handleStoryReply : undefined}
        />
      )}

      {activeMenuPostId && activeMenuPost && activeMenuAuthor && (
        <PostActionSheet
          post={activeMenuPost}
          author={activeMenuAuthor}
          isOwn={activeMenuAuthor.id === currentUser.userId}
          onClose={() => {
            setActiveMenuPostId(null);
            setActiveMenuPost(null);
            setActiveMenuAuthor(null);
            onPostOptionsOpenChange?.(false);
          }}
          onDare={onDareUser}
          onTruth={onAskTruthUser}
          onPrediction={onCreatePrediction}
          onRumour={onCreateRumour}
          onDelete={async () => {
            if (!window.confirm("Delete this post? This cannot be undone.")) return;
            const deleted = await storeDeletePost(activeMenuPost.id, currentUser.userId);
            if (deleted) {
              setLocallyDeletedPostIds((current) => {
                const next = new Set(current);
                next.add(activeMenuPost.id);
                return next;
              });
            } else {
              window.alert("Unable to delete this post.");
            }
          }}
          onNavigateToProfile={onNavigateToProfile}
        />
      )}
    </div>
  );
}
