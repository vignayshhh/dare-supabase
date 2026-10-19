//MainScreen

"use client";
import { InteractionReceipt } from "../circles/InteractionReceipt";

import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { formatTimeAgo } from "../../utils/timeFormat";
import {
  ArrowLeft,
  Clock,
  Heart,
  MessageCircle,
  Play,
  Eye,
  RefreshCw,
  SlidersHorizontal,
  Share2,
  Sparkles,
} from "lucide-react";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { useContentStore } from "../../stores/useContentStore";
import { Avatar } from "../ui/Avatar";
import { CommentSection, type CommentItem } from "../ui/CommentSection";
import {
  friendsService,
  type Friend,
} from "../../middleware/services/friends.service";
import { dareService } from "@/middleware/services/service-factory";
import { useDareInteractionStore } from "../../stores/useDareInteractionStore";
import { useTruthInteractionStore } from "../../stores/useTruthInteractionStore";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { commentLikePersistence } from "../../utils/commentLikePersistence";
import { useAlertStore } from "../../stores/useAlertStore";
import { votePersistence } from "../../utils/votePersistence";
import { CommunityChallengeFeed } from "./CommunityChallengeFeed";
import { CommunityChallengePreviewScreen } from "./CommunityChallengePreviewScreen";
import { ChallengeHubScreen } from "./ChallengeHubScreen";
import {
  PredictionFeedScreen,
  type PredictionFeedExternalItem,
} from "./PredictionFeedScreen";
import {
  COMMUNITY_CHALLENGES,
  type CommunityChallenge,
} from "./communityChallengeData";
import {
  communityChallengeService,
  type CommunityChallengeSummary,
} from "../../middleware/services/community-challenge.service";

import "@/styles/design-system.css";

interface TruthPost {
  id: string;
  challengerId?: string;
  receiverId?: string;
  challenger: { nickname: string; avatar: string; verified?: boolean };
  receiver: { nickname: string; avatar: string; verified?: boolean };
  question: string;
  state: "SENT" | "ANSWERED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";
  createdAt: string;
  expiresAt?: string;
  answer?: string;
  poll?: {
    question: string;
    options: string[];
    votes: { [key: string]: number };
    totalVotes: number;
  };
}

interface DarePost {
  id: string;
  challengerId?: string;
  receiverId?: string;
  challenger: { nickname: string; avatar: string; verified?: boolean };
  receiver: { nickname: string; avatar: string; verified?: boolean };
  description: string;
  proof?: { type: "image" | "video"; url: string; thumbnail?: string };
  state:
    | "SENT"
    | "ACCEPTED"
    | "CHICKEN_OUT"
    | "PROOF_SUBMITTED"
    | "UNDER_REVIEW"
    | "FRIENDS_VALIDATION"
    | "ACCEPTED_REAL"
    | "REJECTED_FAKE";
  createdAt: string;
  expiresAt?: string;
  votes?: {
    real: number;
    fake: number;
    userVote?: "real" | "fake";
    total?: number;
  };
}

const FEED_SCREEN_SURFACE_BACKGROUND =
  "radial-gradient(circle at 50% -12%, rgba(251,113,133,0.16), transparent 34%), radial-gradient(circle at 12% 18%, rgba(56,189,248,0.10), transparent 28%), radial-gradient(circle at 88% 8%, rgba(192,132,252,0.10), transparent 26%), linear-gradient(180deg, #12070d 0%, #0a0a12 48%, #030303 100%)";

const DARE_CARD_ACCENT_THEMES = [
  { color: "#fb7185", rgb: "251,113,133", bg: "#12070d" },
  { color: "#38bdf8", rgb: "56,189,248", bg: "#071018" },
  { color: "#c084fc", rgb: "192,132,252", bg: "#10091a" },
  { color: "#facc15", rgb: "250,204,21", bg: "#151008" },
] as const;

function getDareCardAccentTheme(cardId: string) {
  let hash = 0;
  for (let i = 0; i < cardId.length; i += 1) {
    hash = (hash * 31 + cardId.charCodeAt(i)) | 0;
  }
  return DARE_CARD_ACCENT_THEMES[
    Math.abs(hash) % DARE_CARD_ACCENT_THEMES.length
  ];
}

function getPostCreatedAtMs(createdAt: unknown): number {
  if (!createdAt) return 0;
  if (typeof createdAt === "object" && createdAt !== null) {
    if ("seconds" in createdAt && typeof createdAt.seconds === "number") {
      return createdAt.seconds * 1000;
    }
    if ("toDate" in createdAt && typeof createdAt.toDate === "function") {
      return createdAt.toDate().getTime();
    }
  }
  if (typeof createdAt === "string" || typeof createdAt === "number") {
    const ms = new Date(createdAt).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }
  return 0;
}

function rankDeckByVoteState<T extends { id: string; createdAt: unknown }>(
  posts: T[],
  hasUserVote: (postId: string) => boolean,
): T[] {
  const newestFirst = [...posts].sort(
    (a, b) => getPostCreatedAtMs(b.createdAt) - getPostCreatedAtMs(a.createdAt),
  );
  const unvotedPosts = newestFirst.filter((post) => !hasUserVote(post.id));

  if (unvotedPosts.length === 0) {
    return newestFirst;
  }

  const votedPosts = newestFirst.filter((post) => hasUserVote(post.id));
  return [...unvotedPosts, ...votedPosts];
}

type TruthPoll = NonNullable<TruthPost["poll"]>;

function getTruthAnswerText(post: Pick<TruthPost, "answer">): string {
  return typeof post.answer === "string" ? post.answer.trim() : "";
}

function getTruthAnswerPreview(answer: string): string {
  const words = answer.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  return `${words.slice(0, 2).join(" ")}..`;
}

function getPollOptionVoteCount(poll: TruthPoll, option: string): number {
  const normalizedOption = option.trim();
  const candidateKeys = new Set([
    option,
    normalizedOption,
    normalizedOption.toLowerCase(),
    normalizedOption.toUpperCase(),
  ]);

  for (const key of candidateKeys) {
    const count = Number(poll.votes[key]);
    if (Number.isFinite(count) && count > 0) {
      return count;
    }
  }

  return 0;
}

function getSafePollTotal(poll: TruthPoll): number {
  const explicitTotal = Number(poll.totalVotes);
  if (Number.isFinite(explicitTotal) && explicitTotal > 0) {
    return explicitTotal;
  }

  const summedTotal = poll.options.reduce(
    (sum, option) => sum + getPollOptionVoteCount(poll, option),
    0,
  );
  return Number.isFinite(summedTotal) && summedTotal > 0 ? summedTotal : 0;
}

function getPollPercentage(votes: number, total: number): number {
  if (!Number.isFinite(votes) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((votes / total) * 100)));
}

function hasRenderablePoll(poll?: TruthPoll): poll is TruthPoll {
  return Boolean(poll?.options?.length && getSafePollTotal(poll) > 0);
}

// ─── PostAvatar — now uses global Avatar component for consistent avatar handling ─────────────────────────
function PostAvatar({
  src,
  name,
  size,
  style,
  className,
  userId,
  username,
}: {
  src?: string;
  name?: string;
  size: number;
  style?: React.CSSProperties;
  className?: string;
  userId?: string;
  username?: string;
}) {
  return (
    <Avatar
      src={src}
      alt={name || ""}
      size={size}
      fallbackText={name?.charAt(0)?.toUpperCase()}
      style={style}
      className={className}
      userId={userId}
      username={username}
      disableRealtime
    />
  );
}
// ─── AnimatedModalWrapper ─────────────────────────────────────────────────────
function AnimatedModalWrapper({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  useLayoutEffect(() => {
    if (isOpen) {
      setMounted(true);
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 320);
      return () => clearTimeout(t);
    }
  }, [isOpen]);
  if (!mounted) return null;
  return (
    <div
      className="app-modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1999,
        /* TEMPORARILY DISABLED FOR MOBILE DEBUGGING - pointerEvents blocking touch */
        /* DISABLED: pointerEvents: "none", */
      }}
    >
      <style>{`
        @keyframes dareSlideUp   { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes dareSlideDown { from { transform: translateY(0); }    to { transform: translateY(100%); } }
        .dare-modal-sheet { animation: ${visible ? "dareSlideUp 0.35s cubic-bezier(0.32,0.72,0,1) forwards" : "dareSlideDown 0.3s cubic-bezier(0.32,0.72,0,1) forwards"}; pointer-events: all; }
        .dare-modal-backdrop { pointer-events: all; transition: opacity 0.3s ease; opacity: ${visible ? 1 : 0}; }
      `}</style>
      <div
        className="app-modal-backdrop dare-modal-backdrop"
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.01)",
        }}
        onClick={onClose}
      />
      <div
        className="app-modal-sheet dare-modal-sheet"
        style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── TruthVoteModal ───────────────────────────────────────────────────────────
function TruthVoteModal({
  isOpen,
  onClose,
  post,
  initialTab,
}: {
  isOpen: boolean;
  onClose: () => void;
  post: TruthPost;
  initialTab: "truth" | "lie" | "comments";
}) {
  const { user } = useAuthStore();
  const {
    voteData,
    comments,
    loadingVotes,
    loadingComments,
    subscribeToVotes,
    unsubscribeFromVotes,
    subscribeToComments,
    unsubscribeFromComments,
    addComment,
    likeComment,
  } = useTruthInteractionStore();
  const [activeTab, setActiveTab] = useState<"truth" | "lie" | "comments">(
    initialTab,
  );
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  useBodyScrollLock(isOpen || closing);

  useLayoutEffect(() => {
    if (isOpen) {
      setClosing(false);
      requestAnimationFrame(() => setVisible(true));
      setActiveTab(initialTab);
      if (user?.id) {
        subscribeToVotes(post.id, user.id);
        subscribeToComments(post.id);
      }
    }
    return () => {
      if (!isOpen) {
        unsubscribeFromVotes(post.id);
        unsubscribeFromComments(post.id);
      }
    };
  }, [
    isOpen,
    post.id,
    user?.id,
    initialTab,
    subscribeToVotes,
    subscribeToComments,
    unsubscribeFromVotes,
    unsubscribeFromComments,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const navs = Array.from(document.querySelectorAll<HTMLElement>(
      ".app-bottom-nav, .app-bottom-nav-motion",
    ));
    const previous = navs.map((nav) => nav.style.pointerEvents);
    navs.forEach((nav) => {
      nav.style.pointerEvents = "none";
    });
    return () => {
      navs.forEach((nav, index) => {
        nav.style.pointerEvents = previous[index];
      });
    };
  }, [isOpen]);

  const handleClose = () => {
    setClosing(true);
    setVisible(false);
    unsubscribeFromVotes(post.id);
    unsubscribeFromComments(post.id);
    setTimeout(onClose, 320);
  };
  const handlePost = async (text: string, parentId?: string | null) => {
    if (!text.trim() || !user) return;
    try {
      await addComment(
        post.id,
        user.id,
        user.username || "",
        user.displayName || user.username || "You",
        user.avatar || "",
        text.trim(),
        parentId,
      );
    } catch (error) {
      console.error("Failed to post comment:", error);
    }
  };

  if (!isOpen && !closing) return null;
  const data = voteData[post.id];
  const isLoadingVote = loadingVotes[post.id];
  const isLoadingComments = loadingComments[post.id];
  const truthCount = data?.truthCount ?? 0;
  const lieCount = data?.lieCount ?? 0;
  const total = data?.total ?? 0;
  const truthPct = total > 0 ? Math.round((truthCount / total) * 100) : 0;
  const liePct = total > 0 ? 100 - truthPct : 0;
  const voters =
    activeTab === "truth"
      ? (data?.truthVoters ?? [])
      : activeTab === "lie"
        ? (data?.lieVoters ?? [])
        : [];
  const truthComments = comments[post.id] ?? [];

  return (
    <div
      className="app-modal-backdrop"
      onClick={handleClose}
      style={{
        position: "fixed",
        inset: 0,
        // The persistent bottom navigation uses z-index 9999; Truth voting
        // and comment controls must remain actionable above it.
        zIndex: 10000,
        background: visible ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0)",
        backdropFilter: visible ? "blur(6px)" : "blur(0px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        transition: "background 0.3s ease, backdrop-filter 0.3s ease",
        boxSizing: "border-box",
        overscrollBehavior: "contain" as const,
      }}
    >
      <style>{`
        body:has(.app-modal-backdrop) .app-bottom-nav,
        body:has(.app-modal-backdrop) .app-bottom-nav-motion {
          pointer-events: none !important;
        }
        @keyframes slideUp   { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slideDown { from { transform: translateY(0); }    to { transform: translateY(100%); } }
      `}</style>
      <div
        className="app-modal-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "#111",
          borderRadius: "28px 28px 0 0",
          overflow: "hidden",
          height: "85vh",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          touchAction: "pan-y",
          animation:
            visible && !closing
              ? "slideUp 0.35s cubic-bezier(0.32,0.72,0,1) forwards"
              : "slideDown 0.3s cubic-bezier(0.32,0.72,0,1) forwards",
        }}
      >
        {/* Drag handle */}
        <div
          className="pop-micro-pill"
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "12px 0 4px",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: "40px",
              height: "4px",
              borderRadius: "99px",
              background: "rgba(255,255,255,0.2)",
            }}
          />
        </div>
        {/* Fixed header — non-scrollable */}
        <div style={{ padding: "12px 20px 0", flexShrink: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "14px",
            }}
          >
            <PostAvatar
              src={post.challenger.avatar}
              name={post.challenger.nickname}
              size={36}
              style={{ border: "2px solid rgba(74,222,128,0.5)" }}
            />
            <span
              style={{
                color: "#fff",
                fontWeight: 700,
                fontSize: "15px",
                whiteSpace: "nowrap",
              }}
            >
              {post.challenger.nickname.split(" ")[0]}
            </span>
            <span
              style={{
                color: "#4ade80",
                fontWeight: 700,
                fontSize: "15px",
                whiteSpace: "nowrap",
              }}
            >
              asked
            </span>
            <PostAvatar
              src={post.receiver.avatar}
              name={post.receiver.nickname}
              size={36}
            />
            <span
              style={{
                color: "#fff",
                fontWeight: 700,
                fontSize: "15px",
                whiteSpace: "nowrap",
              }}
            >
              {post.receiver.nickname.split(" ")[0]}
            </span>
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              borderRadius: "14px",
              padding: "12px 16px",
              marginBottom: "16px",
            }}
          >
            <p
              style={{
                color: "#fff",
                fontSize: "15px",
                fontWeight: 600,
                margin: 0,
              }}
            >
              {post.question}
            </p>
          </div>
          <div style={{ marginBottom: "16px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "6px",
              }}
            >
              <span
                style={{ color: "#4ade80", fontWeight: 700, fontSize: "14px" }}
              >
                Truth {truthPct}%
              </span>
              <span
                style={{
                  color: "rgba(255,255,255,0.5)",
                  fontWeight: 700,
                  fontSize: "14px",
                }}
              >
                Lie {liePct}%
              </span>
            </div>
            <div
              style={{
                height: "8px",
                borderRadius: "99px",
                background: "rgba(255,255,255,0.1)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${truthPct}%`,
                  background: "linear-gradient(90deg, #4ade80, #22c55e)",
                  borderRadius: "99px",
                  transition: "width 0.6s ease",
                }}
              />
            </div>
            <p
              style={{
                color: "rgba(255,255,255,0.4)",
                fontSize: "12px",
                marginTop: "6px",
                textAlign: "center",
              }}
            >
              {total} votes
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            {(["truth", "lie", "comments"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: "12px",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: "13px",
                  transition: "all 0.2s",
                  background:
                    activeTab === tab
                      ? tab === "truth"
                        ? "#4ade80"
                        : "rgba(255,255,255,0.12)"
                      : "rgba(255,255,255,0.06)",
                  color:
                    activeTab === tab
                      ? tab === "truth"
                        ? "#000"
                        : "#fff"
                      : "rgba(255,255,255,0.45)",
                }}
              >
                {tab === "truth"
                  ? "Truth"
                  : tab === "lie"
                    ? "Lie"
                    : `Comments${truthComments.length ? ` ${truthComments.length}` : ""}`}
              </button>
            ))}
          </div>
        </div>
        <div
          style={{
            height: "1px",
            background: "rgba(255,255,255,0.07)",
            margin: "14px 0 0",
            flexShrink: 0,
          }}
        />
        {/* Scrollable content area */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: activeTab === "comments" ? "hidden" : "auto",
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-y",
            padding:
              activeTab === "comments"
                ? "0"
                : "16px 20px calc(32px + var(--safe-area-bottom))",
          }}
        >
          {activeTab === "comments" ? (
            <div
              style={{
                height: "100%",
                minHeight: 0,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column" as const,
                paddingBottom: "24px",
              }}
            >
              {user && (
                <CommentSection
                  comments={truthComments.map(
                    (c): CommentItem => ({
                      id: c.id,
                      userId: c.userId,
                      name: c.displayName,
                      username: c.username || "",
                      avatar: c.avatarUrl,
                      text: c.text,
                      createdAt: c.createdAt,
                      likes: c.likes,
                      parentId: c.parentId || null,
                      likedByCurrentUser: commentLikePersistence.hasLiked(
                        "truth",
                        user.id,
                        c.id,
                      ),
                    }),
                  )}
                  loading={isLoadingComments}
                  currentUser={{
                    userId: user.id,
                    name: user.displayName || user.username || "You",
                    username: user.username || "",
                    avatar: user.avatar || "",
                  }}
                  onSubmitComment={handlePost}
                  onLikeComment={(commentId) => {
                    likeComment(commentId);
                  }}
                  autoFocusInput={false}
                />
              )}
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "16px" }}
            >
              {isLoadingVote ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "40px 0",
                    color: "rgba(255,255,255,0.4)",
                    fontSize: 14,
                  }}
                >
                  Loading votes...
                </div>
              ) : voters.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "40px 0",
                    color: "rgba(255,255,255,0.4)",
                    fontSize: 14,
                  }}
                >
                  No {activeTab === "truth" ? "Truth" : "Lie"} votes yet
                </div>
              ) : (
                voters.map((v: any) => (
                  <div
                    key={`truth-voter-${v.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <div style={{ flexShrink: 0 }}>
                      <Avatar
                        src={v.avatarUrl}
                        alt={v.displayName}
                        size="md"
                        userId={v.ouserId}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          color: "#fff",
                          fontWeight: 600,
                          fontSize: "15px",
                          margin: 0,
                        }}
                      >
                        {v.displayName}
                      </p>
                      <p
                        style={{
                          color: "rgba(255,255,255,0.4)",
                          fontSize: "12px",
                          margin: "2px 0 0",
                        }}
                      >
                        {formatTimeAgo(v.createdAt)}
                      </p>
                    </div>
                    <span
                      style={{
                        padding: "5px 14px",
                        borderRadius: "99px",
                        fontWeight: 700,
                        fontSize: "13px",
                        background:
                          activeTab === "truth"
                            ? "rgba(74,222,128,0.15)"
                            : "rgba(255,255,255,0.08)",
                        color:
                          activeTab === "truth"
                            ? "#4ade80"
                            : "rgba(255,255,255,0.6)",
                        border:
                          activeTab === "truth"
                            ? "1px solid rgba(74,222,128,0.3)"
                            : "1px solid rgba(255,255,255,0.12)",
                      }}
                    >
                      {activeTab === "truth" ? "Truth" : "Lie"}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── DareVoteModal ────────────────────────────────────────────────────────────
function DareVoteModal({
  isOpen,
  onClose,
  dare,
}: {
  isOpen: boolean;
  onClose: () => void;
  dare: DarePost;
}) {
  const { user } = useAuthStore();
  const { voteData, loadingVotes, subscribeToVotes, unsubscribeFromVotes } =
    useDareInteractionStore();
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [activeTab, setActiveTab] = useState<"real" | "fake">("real");

  useEffect(() => {
    if (isOpen) {
      setClosing(false);
      requestAnimationFrame(() => setVisible(true));
      if (user?.id) subscribeToVotes(dare.id, user.id);
    }
    return () => {
      if (!isOpen) unsubscribeFromVotes(dare.id);
    };
  }, [isOpen, dare.id, user?.id, subscribeToVotes, unsubscribeFromVotes]);

  const handleClose = () => {
    setClosing(true);
    setVisible(false);
    unsubscribeFromVotes(dare.id);
    setTimeout(onClose, 340);
  };

  if (!isOpen && !closing) return null;
  const data = voteData[dare.id];
  const isLoading = loadingVotes[dare.id];
  const realCount = data?.realCount ?? 0;
  const fakeCount = data?.fakeCount ?? 0;
  const total = data?.total ?? 0;
  const realPct = total > 0 ? Math.round((realCount / total) * 100) : 0;
  const fakePct = total > 0 ? 100 - realPct : 0;
  const voters =
    activeTab === "real" ? (data?.realVoters ?? []) : (data?.fakeVoters ?? []);
  const accentTheme = getDareCardAccentTheme(dare.id);

  return (
    <div
      className="app-modal-backdrop"
      onClick={handleClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: visible ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0)",
        backdropFilter: visible ? "blur(8px)" : "blur(0px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        transition: "background 0.34s ease, backdrop-filter 0.34s ease",
        boxSizing: "border-box",
        overscrollBehavior: "contain" as const,
      }}
    >
      <style>{`
        @keyframes dvmSlideUp   { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes dvmSlideDown { from { transform: translateY(0); opacity: 1; } to { transform: translateY(100%); opacity: 0; } }
        .modal-voter-list::-webkit-scrollbar { display: none; }
      `}</style>
      <div
        className="app-modal-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "linear-gradient(180deg, #161616 0%, #111 100%)",
          borderRadius: "28px 28px 0 0",
          height: "82vh",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.6)",
          overflow: "hidden",
          animation:
            visible && !closing
              ? "dvmSlideUp 0.38s cubic-bezier(0.32,0.72,0,1) forwards"
              : "dvmSlideDown 0.32s cubic-bezier(0.32,0.72,0,1) forwards",
        }}
      >
        {/* Drag handle */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "14px 0 0",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: "36px",
              height: "4px",
              borderRadius: "99px",
              background: "rgba(255,255,255,0.18)",
            }}
          />
        </div>
        {/* Fixed header */}
        <div style={{ padding: "16px 20px 0", flexShrink: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "18px",
            }}
          >
            <div style={{ display: "flex", flexShrink: 0 }}>
              <PostAvatar
                src={dare.challenger.avatar}
                name={dare.challenger.nickname}
                size={44}
                style={{
                  border: "2px solid rgba(255,255,255,0.2)",
                  zIndex: 1,
                  position: "relative",
                }}
              />
              <PostAvatar
                src={dare.receiver.avatar}
                name={dare.receiver.nickname}
                size={44}
                style={{
                  border: "2px solid rgba(255,255,255,0.2)",
                  marginLeft: -14,
                  position: "relative",
                }}
              />
            </div>
            <p
              style={{
                color: "#fff",
                fontWeight: 800,
                fontSize: 18,
                margin: 0,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                flex: 1,
              }}
            >
              {dare.challenger.nickname.split(" ")[0]}&nbsp;
              <span style={{ color: accentTheme.color }}>dared</span>&nbsp;
              {dare.receiver.nickname.split(" ")[0]}&nbsp;
              <span
                style={{
                  color: "rgba(255,255,255,0.4)",
                  fontWeight: 600,
                  fontSize: 16,
                }}
              >
                - {dare.description}
              </span>
            </p>
            <button
              onClick={handleClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.08)",
                border: "none",
                color: "rgba(255,255,255,0.6)",
                fontSize: 16,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              X
            </button>
          </div>
          <div style={{ marginBottom: "20px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  color: accentTheme.color,
                  fontWeight: 800,
                  fontSize: 22,
                }}
              >
                {realPct}% Real
              </span>
              <span
                style={{
                  color: "rgba(255,255,255,0.4)",
                  fontWeight: 700,
                  fontSize: 22,
                }}
              >
                {fakePct}% Fake
              </span>
            </div>
            <div
              style={{
                height: 10,
                borderRadius: 99,
                background: "rgba(255,255,255,0.08)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  borderRadius: 99,
                  background: `linear-gradient(90deg, rgba(${accentTheme.rgb},0.52), rgba(${accentTheme.rgb},0.92))`,
                  width: `${realPct}%`,
                  transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
                }}
              />
            </div>
            <p
              style={{
                color: "rgba(255,255,255,0.3)",
                fontSize: 12,
                textAlign: "center",
                margin: "8px 0 0",
              }}
            >
              {total.toLocaleString()} votes total
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            {(["real", "fake"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: "11px 0",
                  borderRadius: 14,
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 800,
                  fontSize: 15,
                  transition: "all 0.2s",
                  background:
                    activeTab === tab
                      ? tab === "real"
                        ? accentTheme.color
                        : "rgba(255,255,255,0.12)"
                      : "rgba(255,255,255,0.05)",
                  color:
                    activeTab === tab
                      ? tab === "real"
                        ? "#000"
                        : "#fff"
                      : "rgba(255,255,255,0.35)",
                }}
              >
                {tab === "real"
                  ? `Real - ${realCount}`
                  : `Fake - ${fakeCount}`}
              </button>
            ))}
          </div>
        </div>
        <div
          style={{
            height: 1,
            background: "rgba(255,255,255,0.06)",
            margin: "14px 0 0",
            flexShrink: 0,
          }}
        />
        {/* Scrollable voter list */}
        <div
          className="modal-voter-list"
          style={{
            flex: 1,
            overflowY: "auto",
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
            padding: "12px 20px calc(48px + var(--safe-area-bottom))",
          }}
        >
          {isLoading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px 0",
                color: "rgba(255,255,255,0.4)",
                fontSize: 14,
              }}
            >
              Loading votes...
            </div>
          ) : voters.length === 0 ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px 0",
                color: "rgba(255,255,255,0.4)",
                fontSize: 14,
              }}
            >
              No {activeTab === "real" ? "Real" : "Fake"} votes yet
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {voters.map((v: any, i: number) => (
                <div
                  key={`dare-voter-${v.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "10px 12px",
                    borderRadius: 16,
                    background:
                      i % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent",
                  }}
                >
                  <div style={{ flexShrink: 0 }}>
                    <Avatar
                      src={v.avatarUrl}
                      alt={v.displayName}
                      size="md"
                      userId={v.oduserId}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p
                      style={{
                        color: "#fff",
                        fontWeight: 600,
                        fontSize: 15,
                        margin: 0,
                      }}
                    >
                      {v.displayName}
                    </p>
                    <p
                      style={{
                        color: "rgba(255,255,255,0.35)",
                        fontSize: 12,
                        margin: "3px 0 0",
                      }}
                    >
                      {formatTimeAgo(v.createdAt)}
                    </p>
                  </div>
                  <span
                    style={{
                      padding: "5px 14px",
                      borderRadius: 99,
                      fontWeight: 700,
                      fontSize: 13,
                      background:
                        activeTab === "real"
                          ? `rgba(${accentTheme.rgb},0.12)`
                          : "rgba(255,255,255,0.07)",
                      color:
                        activeTab === "real"
                          ? accentTheme.color
                          : "rgba(255,255,255,0.5)",
                      border:
                        activeTab === "real"
                          ? `1px solid rgba(${accentTheme.rgb},0.25)`
                          : "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    {activeTab === "real" ? "Real" : "Fake"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── DoubleTapLike ────────────────────────────────────────────────────────────
function DoubleTapLike({ trigger }: { trigger: number }) {
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>(
    [],
  );
  useEffect(() => {
    if (trigger === 0) return;
    const id = Date.now();
    setHearts((h) => [
      ...h,
      { id, x: 40 + Math.random() * 20, y: 40 + Math.random() * 20 },
    ]);
    setTimeout(() => setHearts((h) => h.filter((x) => x.id !== id)), 900);
  }, [trigger]);
  return (
    <>
      <style>{`@keyframes heartPop { 0%{transform:translate(-50%,-50%) scale(0);opacity:0} 20%{transform:translate(-50%,-50%) scale(1.4);opacity:1} 60%{transform:translate(-50%,-50%) scale(1.1);opacity:1} 100%{transform:translate(-50%,-50%) scale(1.3);opacity:0} }`}</style>
      {hearts.map((h) => (
        <div
          key={h.id}
          style={{
            position: "absolute",
            left: `${h.x}%`,
            top: `${h.y}%`,
            zIndex: 50,
            // The heart animation is visual-only; it must never cover card
            // actions such as the proof-view vote controls.
            pointerEvents: "none",
            animation: "heartPop 0.85s cubic-bezier(0.34,1.56,0.64,1) forwards",
          }}
        >
          <Heart
            size={80}
            fill="#ff4d6d"
            color="#ff4d6d"
            style={{ filter: "drop-shadow(0 0 12px rgba(255,77,109,0.6))" }}
          />
        </div>
      ))}
    </>
  );
}

// ─── AnimatedDareCapsule — CINEMATIC timing ───────────────────────────────────
// Timings stretched for a slow, theatrical reveal:
//   t=200ms  capsule + challenger name fade in together
//   t=600ms  pill expands
//   t=3.2s   DARED label + receiver appear
//   t=7.5s   description slides up
//   t=18s    fade-out begins
//   t=19.2s  fully hidden
const AnimatedDareCapsule = React.memo(
  function AnimatedDareCapsule({
    cardId,
    challenger,
    receiver,
    description,
    isActive,
    onNavigateToProfile,
    challengerId,
    receiverId,
    revealDescription = true,
    persist = false,
    animate = true,
    animationKey,
  }: {
    cardId: string;
    challenger: DarePost["challenger"];
    receiver: DarePost["receiver"];
    description: string;
    isActive: boolean;
    onNavigateToProfile?: (userId: string) => void;
    challengerId?: string;
    receiverId?: string;
    revealDescription?: boolean;
    persist?: boolean;
    animate?: boolean;
    animationKey?: string | number;
  }) {
    const [expanded, setExpanded] = useState(false);
    const [showChallengerName, setShowChallengerName] = useState(false);
    const [showReceiver, setShowReceiver] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const [fading, setFading] = useState(false);
    const [showDescription, setShowDescription] = useState(false);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const capsuleVisible = animate ? showAll && !fading : true;
    const capsuleExpanded = animate ? expanded : true;
    const capsuleShowChallenger = animate ? showChallengerName : true;
    const capsuleShowReceiver = animate ? showReceiver : true;
    const capsuleShowDescription = animate ? showDescription : true;
    const accentTheme = getDareCardAccentTheme(cardId);

    useEffect(() => {
      timers.current.forEach(clearTimeout);
      timers.current = [];

      if (!animate) {
        setShowAll(true);
        setExpanded(true);
        setShowChallengerName(true);
        setShowReceiver(true);
        setFading(false);
        setShowDescription(true);
        return;
      }

      if (!isActive) {
        setShowAll(false);
        setExpanded(false);
        setShowChallengerName(false);
        setShowReceiver(false);
        setFading(false);
        setShowDescription(false);
        return;
      }

      // Reset state first
      setShowAll(false);
      setExpanded(false);
      setShowChallengerName(false);
      setShowReceiver(false);
      setFading(false);
      setShowDescription(false);

      // Cinematic sequence — all delays from t=0 (card becomes active)
      const t0 = setTimeout(() => setShowAll(true), 200); // capsule appears
      const t1 = setTimeout(() => setExpanded(true), 500); // pill expands
      const t2 = setTimeout(() => setShowChallengerName(true), 200); // name drifts in with capsule
      const t3 = setTimeout(() => setShowReceiver(true), 1500); // DARED + receiver
      const t4 = setTimeout(() => {
        if (revealDescription) setShowDescription(true);
      }, 3500); // description rises

      timers.current.push(t0, t1, t2, t3, t4);
      if (!persist) {
        const t5 = setTimeout(() => setFading(true), 12000); // fade out
        const t6 = setTimeout(() => setShowAll(false), 12500); // unmount
        timers.current.push(t5, t6);
      }
      return () => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
      };
    }, [animate, animationKey, cardId, isActive, persist, revealDescription]);

    const COLLAPSED_WIDTH = 64;

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity: capsuleVisible ? 1 : 0,
          transition: animate
            ? fading
              ? "opacity 1.4s ease"
              : "opacity 0.6s ease"
            : "none",
          /* TEMPORARILY DISABLED FOR MOBILE DEBUGGING - pointerEvents blocking touch */
          /* DISABLED: pointerEvents: "none", */
          willChange: "opacity, transform",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
        }}
      >
        {/* Pill */}
        <div
          className="dare-liquid-capsule"
          style={{
            position: "relative",
            isolation: "isolate",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            background: `radial-gradient(circle at 50% -12%, rgba(${accentTheme.rgb},0.18), transparent 34%), linear-gradient(180deg, ${accentTheme.bg} 0%, #070707 58%, #030303 100%)`,
            borderRadius: "999px",
            border: `1px solid rgba(${accentTheme.rgb},0.24)`,
            height: "64px",
            padding: capsuleExpanded ? "0 18px 0 8px" : "0 8px",
            backdropFilter: "blur(30px) saturate(1.32)",
            WebkitBackdropFilter: "blur(30px) saturate(1.32)",
            boxShadow:
              `0 22px 52px rgba(0,0,0,0.50), 0 8px 20px rgba(0,0,0,0.32), 0 0 30px rgba(${accentTheme.rgb},0.14), inset 0 1px 0 rgba(255,255,255,0.30), inset 0 -1px 0 rgba(${accentTheme.rgb},0.10)`,
            overflow: "hidden",
            whiteSpace: "nowrap",
            maxWidth: capsuleExpanded ? "420px" : `${COLLAPSED_WIDTH}px`,
            width: capsuleExpanded ? "max-content" : `${COLLAPSED_WIDTH}px`,
            // Smooth, slower expand — 2.0s with ease-in-out for smooth FPS
            transition: animate
              ? "max-width 2.0s cubic-bezier(0.4, 0, 0.2, 1), width 2.0s cubic-bezier(0.4, 0, 0.2, 1), padding 2.0s cubic-bezier(0.4, 0, 0.2, 1)"
              : "none",
            willChange: "max-width, width, padding",
            transform: "translateZ(0)",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: "1px",
              borderRadius: 999,
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02) 42%, rgba(0,0,0,0.12))",
              pointerEvents: "none",
              zIndex: 0,
            }}
          />
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              left: 16,
              right: 16,
              top: 7,
              height: 18,
              borderRadius: 999,
              background:
                `linear-gradient(90deg, transparent, rgba(${accentTheme.rgb},0.16), rgba(${accentTheme.rgb},0.08), transparent)`,
              opacity: 0.32,
              filter: "blur(8px)",
              pointerEvents: "none",
              zIndex: 0,
            }}
          />
          {/* Challenger avatar */}
          <PostAvatar
            src={challenger.avatar}
            name={challenger.nickname}
            size={48}
            style={{
              minWidth: 48,
              border: "2px solid rgba(255,255,255,0.62)",
              boxShadow: "0 10px 24px rgba(0,0,0,0.34)",
              opacity: capsuleShowChallenger ? 1 : 0,
              transition: animate ? "opacity 1.2s ease" : "none",
              willChange: "opacity",
              transform: "translateZ(0)",
            }}
          />
          {/* Challenger name — slow fade */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onNavigateToProfile && challengerId) {
                onNavigateToProfile(challengerId);
              }
            }}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "#fff",
              fontWeight: 700,
              fontSize: 16,
              flexShrink: 0,
              opacity: capsuleShowChallenger ? 1 : 0,
              transition: animate ? "opacity 1.2s ease" : "none",
              letterSpacing: "-0.01em",
              lineHeight: 1,
              textShadow: "0 2px 8px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.6)",
              cursor: onNavigateToProfile ? "pointer" : "default",
              textDecoration: "none",
            }}
          >
            {challenger.nickname.split(" ")[0]}
          </button>
          {/* DARED label */}
          <span
            className="dare-capsule-dared-label"
            style={{
              color: accentTheme.color,
              fontWeight: 900,
              fontSize: 16,
              flexShrink: 0,
              opacity: capsuleShowReceiver ? 1 : 0,
              transition: animate ? "opacity 1.2s ease" : "none",
              letterSpacing: "0.06em",
              textTransform: "uppercase" as const,
              lineHeight: 1,
              textShadow:
                `0 2px 8px rgba(0,0,0,0.86), 0 0 12px rgba(${accentTheme.rgb},0.58), 0 0 24px rgba(${accentTheme.rgb},0.22)`,
            }}
          >
            DARED
          </span>
          {/* Receiver avatar */}
          <PostAvatar
            src={receiver.avatar}
            name={receiver.nickname}
            size={48}
            style={{
              minWidth: 48,
              border: "2px solid rgba(255,255,255,0.62)",
              boxShadow: "0 10px 24px rgba(0,0,0,0.34)",
              opacity: capsuleShowReceiver ? 1 : 0,
              transition: animate ? "opacity 1.2s ease 0.3s" : "none",
            }}
          />
          {/* Receiver name */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onNavigateToProfile && receiverId) {
                onNavigateToProfile(receiverId);
              }
            }}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "#fff",
              fontWeight: 700,
              fontSize: 16,
              flexShrink: 0,
              opacity: capsuleShowReceiver ? 1 : 0,
              transition: animate ? "opacity 1.2s ease 0.5s" : "none",
              letterSpacing: "-0.01em",
              lineHeight: 1,
              textShadow: "0 2px 8px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.6)",
              cursor: onNavigateToProfile ? "pointer" : "default",
              textDecoration: "none",
            }}
          >
            {receiver.nickname.split(" ")[0]}
          </button>
        </div>
        {/* Description — cinematic slide up */}
        {revealDescription && (
          <p
            style={{
              color: "#fff",
              fontSize: 20,
              fontWeight: 800,
              textAlign: "center",
              textShadow:
                "0 2px 12px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.8)",
              margin: "12px 0 0",
              padding: "0 32px",
              opacity: capsuleShowDescription ? 1 : 0,
              transform: capsuleShowDescription
                ? "translateY(0)"
                : "translateY(18px)",
              transition: animate
                ? "opacity 1.4s cubic-bezier(0.25,0.46,0.45,0.94), transform 1.4s cubic-bezier(0.25,0.46,0.45,0.94)"
                : "none",
            }}
          >
            {description}
          </p>
        )}
      </div>
    );
  },
  (prev, next) => {
    if (prev.isActive !== next.isActive) return false;
    if (
      prev.challenger !== next.challenger ||
      prev.receiver !== next.receiver ||
      prev.description !== next.description ||
      prev.revealDescription !== next.revealDescription ||
      prev.persist !== next.persist ||
      prev.animate !== next.animate ||
      prev.animationKey !== next.animationKey
    )
      return false;
    return true;
  },
);

// ─── ReelCommentsModal ────────────────────────────────────────────────────────
function ReelCommentsModal({
  isOpen,
  onClose,
  dare,
}: {
  isOpen: boolean;
  onClose: () => void;
  dare: DarePost;
}) {
  const { user } = useAuthStore();
  const {
    comments,
    loadingComments,
    subscribeToComments,
    unsubscribeFromComments,
    addComment,
    likeComment,
    commentLikeCounts,
    commentLikedByUser,
    subscribeToCommentLikeCount,
    subscribeToUserCommentLike,
  } = useDareInteractionStore();
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  useBodyScrollLock(isOpen || closing);

  useEffect(() => {
    if (isOpen) {
      setClosing(false);
      requestAnimationFrame(() => setVisible(true));
      subscribeToComments(dare.id);
    }
    return () => {
      if (!isOpen) unsubscribeFromComments(dare.id);
    };
  }, [isOpen, dare.id, subscribeToComments, unsubscribeFromComments]);

  useEffect(() => {
    if (!user) return;
    const dareComments = comments[dare.id] || [];
    dareComments.forEach((comment) => {
      subscribeToCommentLikeCount(comment.id);
      subscribeToUserCommentLike(comment.id, user.id);
    });
  }, [
    comments,
    dare.id,
    user,
    subscribeToCommentLikeCount,
    subscribeToUserCommentLike,
  ]);

  const handleClose = () => {
    setClosing(true);
    setVisible(false);
    unsubscribeFromComments(dare.id);
    setTimeout(onClose, 340);
  };
  const handlePost = async (text: string, parentId?: string | null) => {
    if (!text.trim() || !user || posting) return;
    setPosting(true);
    const comment = await addComment(
      dare.id,
      user.id,
      user.username || "",
      user.displayName || user.username || "You",
      user.avatar || "",
      text.trim(),
      parentId,
    );
    setPosting(false);
    if (!comment) return;
    setCommentText("");
    setTimeout(
      () => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      100,
    );
  };

  if (!isOpen && !closing) return null;
  const dareComments = comments[dare.id] || [];
  const isLoading = loadingComments[dare.id];

  return (
    <div
      className="app-modal-backdrop"
      onClick={handleClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: visible ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0)",
        backdropFilter: visible ? "blur(8px)" : "blur(0px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        transition: "background 0.34s ease, backdrop-filter 0.34s ease",
        overscrollBehavior: "contain" as const,
      }}
    >
      <style>{`
        @keyframes rcSlideUp   { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes rcSlideDown { from { transform: translateY(0); opacity: 1; } to { transform: translateY(100%); opacity: 0; } }
        .rc-list::-webkit-scrollbar { display: none; }
      `}</style>
      <div
        className="app-modal-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "linear-gradient(180deg, #161616 0%, #111 100%)",
          borderRadius: "28px 28px 0 0",
          minHeight: "75vh",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.6)",
          overflow: "hidden",
          touchAction: "pan-y",
          animation:
            visible && !closing
              ? "rcSlideUp 0.38s cubic-bezier(0.32,0.72,0,1) forwards"
              : "rcSlideDown 0.32s cubic-bezier(0.32,0.72,0,1) forwards",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "14px 0 0",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: "36px",
              height: "4px",
              borderRadius: "99px",
              background: "rgba(255,255,255,0.18)",
            }}
          />
        </div>
        <div
          style={{
            padding: "14px 20px 12px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <p
              style={{
                color: "#fff",
                fontWeight: 800,
                fontSize: 17,
                margin: 0,
              }}
            >
              Comments
            </p>
            <p
              style={{
                color: "rgba(255,255,255,0.35)",
                fontSize: 13,
                margin: "3px 0 0",
              }}
            >
              {dare.challenger.nickname.split(" ")[0]} dared{" "}
              {dare.receiver.nickname.split(" ")[0]} - {dare.description}
            </p>
          </div>
          <button
            onClick={handleClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.08)",
              border: "none",
              color: "rgba(255,255,255,0.6)",
              fontSize: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            X
          </button>
        </div>
        <div
          style={{
            height: 1,
            background: "rgba(255,255,255,0.06)",
            flexShrink: 0,
          }}
        />
        {/* Comment input — fixed */}
        <div
          style={{
            padding: "12px 16px",
            flexShrink: 0,
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            display: "flex",
            gap: 10,
            alignItems: "center",
            background: "#111",
          }}
        >
          <div style={{ flexShrink: 0 }}>
            <Avatar
              src={user?.avatar || ""}
              alt="You"
              size="sm"
              userId={user?.id}
            />
          </div>
          <div
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.07)",
              borderRadius: 99,
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handlePost(commentText);
              }}
              placeholder="Add a comment..."
              style={{
                background: "none",
                border: "none",
                outline: "none",
                color: "#fff",
                fontSize: 14,
                width: "100%",
                fontFamily: "inherit",
              }}
            />
          </div>
          {commentText.trim() && (
            <button
              type="button"
              aria-label="Post dare comment"
              onClick={() => handlePost(commentText)}
              disabled={posting}
              style={{
                background: posting ? "rgba(255,255,255,0.5)" : "#f8fafc",
                border: "none",
                borderRadius: 99,
                padding: "9px 16px",
                color: "#000",
                fontWeight: 800,
                fontSize: 14,
                cursor: posting ? "default" : "pointer",
                flexShrink: 0,
              }}
            >
              {posting ? "..." : "Post"}
            </button>
          )}
        </div>
        {/* Scrollable comments */}
        <div
          className="rc-list"
          onWheel={(e) => e.stopPropagation()}
          // TEMPORARILY DISABLED FOR MOBILE DEBUGGING - onTouchMove stopPropagation blocking touch events
          // DISABLED: onTouchMove={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-y",
            padding: "12px 20px 8px",
          }}
        >
          {isLoading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px 0",
                color: "rgba(255,255,255,0.4)",
                fontSize: 14,
              }}
            >
              Loading comments...
            </div>
          ) : dareComments.length === 0 ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px 0",
                color: "rgba(255,255,255,0.4)",
                fontSize: 14,
              }}
            >
              No comments yet. Be the first!
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {dareComments.map((c: any, i: number) => (
                <div
                  key={`reel-comment-${c.id}`}
                  style={{
                    display: "flex",
                    gap: "12px",
                    alignItems: "flex-start",
                    padding: "12px 0",
                    borderBottom:
                      i < dareComments.length - 1
                        ? "1px solid rgba(255,255,255,0.05)"
                        : "none",
                  }}
                >
                  <div style={{ flexShrink: 0 }}>
                    <Avatar
                      src={c.avatarUrl}
                      alt={c.displayName}
                      size="sm"
                      userId={c.userId}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}
                      >
                        {c.displayName}
                      </span>
                      <span
                        style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}
                      >
                        {formatTimeAgo(c.createdAt)}
                      </span>
                    </div>
                    <p
                      style={{
                        color: "rgba(255,255,255,0.85)",
                        fontSize: 14,
                        lineHeight: 1.5,
                        margin: 0,
                      }}
                    >
                      {c.text}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Like dare comment"
                    aria-pressed={Boolean(commentLikedByUser[c.id])}
                    onClick={() => {
                      if (user && !commentLikedByUser[c.id]) {
                        likeComment(c.id, user.id);
                      }
                    }}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 3,
                      flexShrink: 0,
                      paddingTop: 2,
                      border: "none",
                      background: "transparent",
                      cursor:
                        user && commentLikedByUser[c.id]
                          ? "default"
                          : "pointer",
                    }}
                  >
                    <Heart
                      size={14}
                      color={
                        user && commentLikedByUser[c.id]
                          ? "#ef4444"
                          : "rgba(255,255,255,0.35)"
                      }
                      fill={
                        user && commentLikedByUser[c.id] ? "#ef4444" : "none"
                      }
                    />
                    <span
                      style={{
                        color:
                          user && commentLikedByUser[c.id]
                            ? "#ef4444"
                            : "rgba(255,255,255,0.35)",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {commentLikeCounts[c.id] || 0}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ReelShareModal ───────────────────────────────────────────────────────────
function ReelShareModal({
  isOpen,
  onClose,
  dare,
}: {
  isOpen: boolean;
  onClose: () => void;
  dare: DarePost;
}) {
  const { user } = useAuthStore();
  const { shareDareToDM } = useDareInteractionStore();
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [sentTo, setSentTo] = useState<string[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setClosing(false);
      setSentTo([]);
      requestAnimationFrame(() => setVisible(true));
      if (user?.id) {
        setLoadingFriends(true);
        friendsService
          .getFriends(user.id)
          .then((r) => setFriends(r))
          .catch(console.error)
          .finally(() => setLoadingFriends(false));
      }
    }
  }, [isOpen, user?.id]);

  const handleClose = () => {
    setClosing(true);
    setVisible(false);
    setTimeout(onClose, 340);
  };
  const toggleSend = (id: string) =>
    setSentTo((prev) =>
      prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id],
    );
  const handleSendToDMs = async () => {
    if (!user?.id || sentTo.length === 0 || sending) return;
    setSending(true);
    try {
      await Promise.all(
        sentTo.map((recipientId) =>
          shareDareToDM(
            user.id,
            recipientId,
            dare.id,
            dare.description,
            dare.challenger.nickname,
            dare.receiver.nickname,
          ),
        ),
      );
      handleClose();
    } catch (error) {
      console.error("Error sending dare to DMs:", error);
    } finally {
      setSending(false);
    }
  };

  if (!isOpen && !closing) return null;

  return (
    <div
      className="app-modal-backdrop"
      onClick={handleClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: visible ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0)",
        backdropFilter: visible ? "blur(8px)" : "blur(0px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        transition: "background 0.34s ease, backdrop-filter 0.34s ease",
        overscrollBehavior: "contain" as const,
      }}
    >
      <style>{`
        @keyframes rsSlideUp   { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes rsSlideDown { from { transform: translateY(0); opacity: 1; } to { transform: translateY(100%); opacity: 0; } }
        .rs-scroll::-webkit-scrollbar { display: none; }
      `}</style>
      <div
        className="app-modal-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "linear-gradient(180deg, #161616 0%, #111 100%)",
          borderRadius: "28px 28px 0 0",
          minHeight: "75vh",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.6)",
          overflow: "hidden",
          animation:
            visible && !closing
              ? "rsSlideUp 0.38s cubic-bezier(0.32,0.72,0,1) forwards"
              : "rsSlideDown 0.32s cubic-bezier(0.32,0.72,0,1) forwards",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "14px 0 0",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: "36px",
              height: "4px",
              borderRadius: "99px",
              background: "rgba(255,255,255,0.18)",
            }}
          />
        </div>
        <div
          style={{
            padding: "14px 20px 12px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <p
              style={{
                color: "#fff",
                fontWeight: 800,
                fontSize: 17,
                margin: 0,
              }}
            >
              Send to Friends
            </p>
            <p
              style={{
                color: "rgba(255,255,255,0.35)",
                fontSize: 13,
                margin: "3px 0 0",
              }}
            >
              {dare.challenger.nickname.split(" ")[0]} dared{" "}
              {dare.receiver.nickname.split(" ")[0]} - {dare.description}
            </p>
          </div>
          <button
            onClick={handleClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.08)",
              border: "none",
              color: "rgba(255,255,255,0.6)",
              fontSize: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            X
          </button>
        </div>
        <div
          style={{
            height: 1,
            background: "rgba(255,255,255,0.06)",
            flexShrink: 0,
          }}
        />
        {/* Scrollable friends list */}
        <div
          className="rs-scroll"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
            padding: "8px 0",
          }}
        >
          {loadingFriends ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px 20px",
                color: "rgba(255,255,255,0.4)",
                fontSize: 14,
              }}
            >
              Loading friends...
            </div>
          ) : friends.length === 0 ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px 20px",
                color: "rgba(255,255,255,0.4)",
                fontSize: 14,
              }}
            >
              No friends yet
            </div>
          ) : (
            friends.map((f, i) => {
              const friendId = f.user_id || f.id;
              const selected = sentTo.includes(friendId);
              return (
                <div
                  key={`friend-${friendId}-${i}`}
                  onClick={() => toggleSend(friendId)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "11px 20px",
                    cursor: "pointer",
                    background: selected
                      ? "rgba(255,255,255,0.06)"
                      : "transparent",
                    transition: "background 0.15s",
                  }}
                >
                  <div
                    style={{
                      flexShrink: 0,
                      border: selected
                        ? "2px solid #f8fafc"
                        : "2px solid rgba(255,255,255,0.1)",
                      borderRadius: "50%",
                      transition: "border 0.15s",
                    }}
                  >
                    <Avatar
                      src={f.avatar_url || ""}
                      alt={f.display_name || f.username}
                      size="lg"
                      userId={f.user_id}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        color: "#fff",
                        fontWeight: 700,
                        fontSize: 15,
                        margin: 0,
                      }}
                    >
                      {f.display_name || f.username}
                    </p>
                    <p
                      style={{
                        color: "rgba(255,255,255,0.35)",
                        fontSize: 13,
                        margin: "2px 0 0",
                      }}
                    >
                      @{f.username}
                    </p>
                  </div>
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      border: selected
                        ? "none"
                        : "2px solid rgba(255,255,255,0.2)",
                      background: selected ? "#f8fafc" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      transition: "all 0.15s",
                    }}
                  >
                    {selected && (
                      <span
                        style={{ color: "#000", fontSize: 14, fontWeight: 900 }}
                      >
                        OK
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div
          style={{
            height: 1,
            background: "rgba(255,255,255,0.06)",
            flexShrink: 0,
          }}
        />
        <div
          style={{
            padding: "12px 20px calc(12px + var(--safe-area-bottom))",
            flexShrink: 0,
          }}
        >
          {sentTo.length > 0 && (
            <button
              onClick={handleSendToDMs}
              disabled={sending}
              style={{
                width: "100%",
                padding: "15px",
                borderRadius: 16,
                border: "none",
                background: sending ? "rgba(255,255,255,0.5)" : "#f8fafc",
                color: "#000",
                fontWeight: 800,
                fontSize: 16,
                cursor: sending ? "default" : "pointer",
              }}
            >
              {sending
                ? "Sending..."
                : `Send to ${sentTo.length} ${sentTo.length === 1 ? "friend" : "friends"}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── DareCard ─────────────────────────────────────────────────────────────────
// Key changes:
//   1. Reads sessionVotes on mount — if already voted, skip progress bar and show voted state immediately
//   2. On vote confirm, writes to sessionVotes
//   3. Progress bar only renders when card hasn't been voted on yet
interface DareCardProps {
  dare: DarePost;
  reelMode?: boolean;
  isActive?: boolean;
  hasPlayedEntryAnimation?: boolean;
  playEntryAnimation?: boolean;
  onVoteClick: (dare: DarePost) => void;
  onOpenComments?: (dare: DarePost) => void;
  onOpenShare?: (dare: DarePost) => void;
  onVote?: (dareId: string, vote: "real" | "fake") => void;
  onNavigateToProfile?: (userId: string) => void;
  picModeEnabled?: boolean;
  picModeAnimationKey?: number;
  proofViewMode?: boolean;
  onOpenProofView?: () => void;
  showProofTitleContext?: boolean;
}

export function DareCard({
  dare,
  reelMode,
  isActive,
  hasPlayedEntryAnimation = false,
  playEntryAnimation = true,
  onVoteClick,
  onOpenComments,
  onOpenShare,
  onVote,
  onNavigateToProfile,
  picModeEnabled = true,
  picModeAnimationKey = 0,
  proofViewMode = false,
  onOpenProofView,
  showProofTitleContext = false,
}: DareCardProps) {
  const { user } = useAuthStore();
  const {
    viewCounts,
    commentCounts,
    mediaLikeCounts,
    mediaLikedByUser,
    voteData,
    recordView,
    subscribeToViewCount,
    subscribeToCommentCount,
    subscribeToMediaLikeCount,
    subscribeToUserMediaLike,
    subscribeToVotes,
    unsubscribeFromViewCount,
    unsubscribeFromCommentCount,
    unsubscribeFromMediaLikeCount,
    unsubscribeFromUserMediaLike,
    unsubscribeFromVotes,
    likeMedia,
    recordVote: recordVoteAction,
    getUserVote,
    setUserVote,
  } = useDareInteractionStore();

  // Initialise from persistent storage — if previously voted, jump straight to voted state
  const priorVote = getUserVote(dare.id);
  const [vote, setVote] = useState<"real" | "fake" | null>(priorVote);
  const [phase, setPhase] = useState<"idle" | "confirming" | "voted">(
    priorVote ? "voted" : "idle",
  );
  const [likeTrigger, setLikeTrigger] = useState(0);

  // Progress bar / buttons visibility
  // If already voted: buttons are immediately visible, no progress bar
  const [buttonsVisible, setButtonsVisible] = useState(
    priorVote ? true : false,
  );
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerKey, setTimerKey] = useState(0);
  const [exiting, setExiting] = useState(false);
  const btnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipVoteUntilRef = useRef<number>(0);
  const coverEntryTapRef = useRef(0);
  const [proofViewOpen, setProofViewOpen] = useState(false);
  const [arrivalSweepKey, setArrivalSweepKey] = useState(0);
  const effectiveProofViewOpen = proofViewMode || proofViewOpen;
  const activeVoteData = voteData[dare.id];
  const dareAccentTheme = getDareCardAccentTheme(dare.id);

  useEffect(() => {
    if (!isActive || !dare.id) {
      return;
    }

    subscribeToViewCount(dare.id);
    subscribeToCommentCount(dare.id);
    subscribeToMediaLikeCount(dare.id);
    if (user?.id) {
      subscribeToUserMediaLike(dare.id, user.id);
      recordView(dare.id, user.id);
    }

    return () => {
      unsubscribeFromViewCount(dare.id);
      unsubscribeFromCommentCount(dare.id);
      unsubscribeFromMediaLikeCount(dare.id);
      unsubscribeFromUserMediaLike(dare.id);
    };
  }, [
    dare.id,
    isActive,
    user?.id,
    subscribeToViewCount,
    subscribeToCommentCount,
    subscribeToMediaLikeCount,
    subscribeToUserMediaLike,
    unsubscribeFromViewCount,
    unsubscribeFromCommentCount,
    unsubscribeFromMediaLikeCount,
    unsubscribeFromUserMediaLike,
    recordView,
  ]);

  useEffect(() => {
    if (!reelMode || !isActive || effectiveProofViewOpen || !user?.id) return;
    subscribeToVotes(dare.id, user.id);
    return () => unsubscribeFromVotes(dare.id);
  }, [
    dare.id,
    effectiveProofViewOpen,
    isActive,
    reelMode,
    subscribeToVotes,
    unsubscribeFromVotes,
    user?.id,
  ]);

  const hasVoted = phase === "voted" && vote !== null;
  const realViewCount = viewCounts[dare.id] ?? 0;
  const realCommentCount = commentCounts[dare.id] ?? 0;
  const realLikeCount = mediaLikeCounts[dare.id] ?? 0;
  const hasLikedMedia = Boolean(mediaLikedByUser[dare.id]);
  const voteControlsVisible =
    buttonsVisible || hasVoted || phase === "confirming";
  const shouldRunVoteTimer = Boolean(
    isActive && (!reelMode || effectiveProofViewOpen),
  );

  useEffect(() => {
    if (btnTimerRef.current) clearTimeout(btnTimerRef.current);

    // If this card was already voted on, always show buttons immediately — no timer, no progress bar
    if (getUserVote(dare.id)) {
      setButtonsVisible(true);
      setTimerRunning(false);
      return;
    }

    if (shouldRunVoteTimer) {
      if (buttonsVisible || phase !== "idle") {
        setTimerRunning(false);
        return;
      }

      setTimerRunning(false);
      setTimerKey((k) => k + 1);
      const tStart = setTimeout(() => setTimerRunning(true), 50);
      btnTimerRef.current = setTimeout(() => {
        setButtonsVisible(true);
        setTimerRunning(false);
      }, 10000);
      return () => clearTimeout(tStart);
    } else if (!isActive) {
      setButtonsVisible(false);
      setTimerRunning(false);
    } else {
      setTimerRunning(false);
    }
    return () => {
      if (btnTimerRef.current) clearTimeout(btnTimerRef.current);
    };
  }, [
    buttonsVisible,
    dare.id,
    getUserVote,
    isActive,
    phase,
    shouldRunVoteTimer,
  ]);

  useEffect(() => {
    if (proofViewMode) return;
    if (isActive) return;
    setProofViewOpen(false);
  }, [isActive, dare.id, proofViewMode]);

  useEffect(() => {
    if (!reelMode || !isActive) return;
    setArrivalSweepKey((key) => key + 1);
  }, [dare.id, isActive, reelMode]);

  const handleVote = (choice: "real" | "fake") => {
    if (phase !== "idle" || exiting || Date.now() < skipVoteUntilRef.current)
      return;
    setExiting(true);
    setTimeout(() => {
      setVote(choice);
      setExiting(false);
      setPhase("confirming");
    }, 260);
  };

  const handleConfirm = () => {
    if (vote && user?.id)
      recordVoteAction(dare.id, user.id, vote.toUpperCase() as "REAL" | "FAKE");
    if (vote && onVote) onVote(dare.id, vote);
    // Persist to localStorage
    if (vote) setUserVote(dare.id, vote);
    setPhase("voted");
    onVoteClick(dare);
  };

  const handleMediaLike = async () => {
    if (!user?.id || hasLikedMedia) return;
    setLikeTrigger((t) => t + 1);
    await likeMedia(dare.id, user.id);
  };

  const fastForwardVoteProgress = (clientX: number, target: HTMLElement) => {
    skipVoteUntilRef.current = Date.now() + 650;
    const rect = target.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const remaining = Math.max(0, Math.round((1 - pct) * 10));

    if (btnTimerRef.current) clearTimeout(btnTimerRef.current);

    if (remaining <= 0) {
      setButtonsVisible(true);
      setTimerRunning(false);
      return;
    }

    setTimerRunning(false);
    requestAnimationFrame(() => {
      const bar = target.querySelector(
        "[data-progress-bar]",
      ) as HTMLElement | null;
      if (bar) {
        bar.style.transition = "none";
        bar.style.width = `${pct * 100}%`;
        bar.getBoundingClientRect();
        bar.style.transition = `width ${remaining}s linear`;
        bar.style.width = "100%";
      }
      setTimerRunning(true);
      btnTimerRef.current = setTimeout(() => {
        setButtonsVisible(true);
        setTimerRunning(false);
      }, remaining * 1000);
    });
  };

  const openProofView = () => {
    coverEntryTapRef.current = 0;
    setProofViewOpen(true);
    onOpenProofView?.();
  };

  const registerCoverEntryTap = () => {
    const now = Date.now();
    if (now - coverEntryTapRef.current <= 560) {
      return true;
    }

    coverEntryTapRef.current = now;
    return false;
  };

  const handleCoverEntryClick = (event: React.MouseEvent<HTMLElement>) => {
    if (effectiveProofViewOpen) return;
    if ((event.target as HTMLElement | null)?.closest("button,a")) return;

    if (event.detail >= 2 || registerCoverEntryTap()) {
      event.preventDefault();
      event.stopPropagation();
      openProofView();
    }
  };
  const shouldHoldChallengeForEntry =
    reelMode && !isActive && !hasPlayedEntryAnimation;
  const showSettledCover =
    !shouldHoldChallengeForEntry && (!isActive || !playEntryAnimation);
  const coverSlideClassName = [
    "dare-cover-slide",
    picModeEnabled ? "dare-cover-slide-pic-mode" : "",
    shouldHoldChallengeForEntry ? "dare-cover-slide-awaiting-entry" : "",
    isActive && playEntryAnimation ? "dare-cover-slide-active" : "",
    isActive ? "dare-cover-slide-arrival-sweep" : "",
    showSettledCover ? "dare-cover-slide-entered" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const coverThumbnailUrl = dare.proof?.thumbnail || dare.proof?.url;
  const coverRealVotes = activeVoteData?.realCount ?? dare.votes?.real ?? 0;
  const coverFakeVotes = activeVoteData?.fakeCount ?? dare.votes?.fake ?? 0;
  const coverVoteTotal =
    activeVoteData?.total ?? dare.votes?.total ?? coverRealVotes + coverFakeVotes;
  const coverRealScore =
    coverVoteTotal > 0 ? Math.round((coverRealVotes / coverVoteTotal) * 100) : 0;
  const coverVoterPreview = [
    ...(activeVoteData?.realVoters ?? []),
    ...(activeVoteData?.fakeVoters ?? []),
  ].slice(0, 3);
  const dareCoverPosterFrameStyle: React.CSSProperties = {
    position: "absolute",
    left: 10,
    right: 10,
    top: 18,
    bottom: "calc(82px + var(--safe-area-bottom))",
    borderRadius: 32,
    overflow: "hidden",
    boxShadow:
      `0 28px 78px rgba(0,0,0,0.48), 0 0 42px rgba(${dareAccentTheme.rgb},0.12), inset 0 1px 0 rgba(255,255,255,0.08)`,
  };

  if (reelMode) {
    return (
      <div
        className="pop-dare-reel"
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: "#0a0a0a",
          WebkitTapHighlightColor: "transparent",
          outline: "none",
          contain: "layout paint style",
          transform: "translateZ(0)",
          backfaceVisibility: "hidden",
        }}
      >
        <div className="absolute bottom-24 right-4 z-50 max-w-[80%] rounded-xl bg-black/70"><InteractionReceipt id={dare.id} table="dares" /></div>
        <DoubleTapLike trigger={likeTrigger} />
        <div
          className="dare-reel-proof-entry pop-dare-card"
          onClickCapture={handleCoverEntryClick}
          onDoubleClickCapture={(event) => {
            if (effectiveProofViewOpen) return;
            event.preventDefault();
            event.stopPropagation();
            openProofView();
          }}
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            overflow: "hidden",
            touchAction: "pan-y",
            contain: "layout paint style",
            ["--dare-accent-rgb" as string]: dareAccentTheme.rgb,
          }}
        >
          <section
            className={`${coverSlideClassName} pop-dare-cover-card`}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        openProofView();
      }
            }}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              overflow: "hidden",
              background:
                `radial-gradient(circle at 50% 18%, rgba(${dareAccentTheme.rgb},0.18), transparent 18%), radial-gradient(circle at 16% 76%, rgba(${dareAccentTheme.rgb},0.14), transparent 24%), radial-gradient(circle at 86% 72%, rgba(${dareAccentTheme.rgb},0.10), transparent 28%), linear-gradient(180deg, ${dareAccentTheme.bg} 0%, #0b0b12 38%, #030303 100%)`,
              contain: "layout paint style",
              // Keep the cover above the pre-rendered proof until a deliberate
              // double-tap opens it; opacity alone does not remove descendants
              // from hit-testing in every browser.
              zIndex: effectiveProofViewOpen ? 0 : 1,
              opacity: effectiveProofViewOpen ? 0 : 1,
              transform: effectiveProofViewOpen
                ? "translate3d(0,-10px,0) scale(0.985)"
                : "translate3d(0,0,0) scale(1)",
              transition:
                "opacity 0.32s ease, transform 0.42s cubic-bezier(0.22,1,0.36,1)",
              pointerEvents: effectiveProofViewOpen ? "none" : "auto",
              backfaceVisibility: "hidden",
            }}
          >
            <div
              className="dare-cover-lattice"
              style={{
                position: "absolute",
                inset: 0,
                background:
                  `linear-gradient(115deg, rgba(${dareAccentTheme.rgb},0.13) 0 1px, transparent 1px 22px), linear-gradient(245deg, rgba(${dareAccentTheme.rgb},0.08) 0 1px, transparent 1px 28px), radial-gradient(ellipse at 50% 30%, rgba(${dareAccentTheme.rgb},0.10), transparent 42%)`,
                backgroundSize: "100% 100%, 100% 100%, 100% 100%",
                opacity: 0.9,
                mixBlendMode: picModeEnabled ? "soft-light" : "normal",
              }}
            />
            <div
              className="dare-cover-metal"
              style={{
                position: "absolute",
                inset: 0,
                background:
                  `conic-gradient(from 210deg at 50% 52%, rgba(${dareAccentTheme.rgb},0.18), rgba(255,255,255,0.06), rgba(${dareAccentTheme.rgb},0.12), rgba(255,255,255,0.04), rgba(${dareAccentTheme.rgb},0.16)), radial-gradient(ellipse at 50% 108%, rgba(0,0,0,0.72), transparent 50%)`,
                opacity: picModeEnabled ? 0.28 : 0.72,
                mixBlendMode: "screen",
              }}
            />
            <div
              className="dare-cover-ribbon"
              style={{
                position: "absolute",
                top: "50%",
                left: "-22%",
                width: "144%",
                height: 220,
                transform: "translateY(-50%) rotate(12deg)",
                background:
                  `linear-gradient(90deg, transparent 0%, rgba(${dareAccentTheme.rgb},0.04) 18%, rgba(${dareAccentTheme.rgb},0.18) 46%, rgba(${dareAccentTheme.rgb},0.12) 61%, transparent 100%)`,
                opacity: picModeEnabled ? 0.2 : 0.68,
                filter: "blur(0.2px)",
              }}
            />
            <div
              className="dare-cover-stage"
              style={{
                position: "absolute",
                left: "7%",
                right: "7%",
                top: "15%",
                bottom: "16%",
                borderRadius: 36,
                border: "1px solid rgba(255,255,255,0.12)",
                boxShadow:
                  `inset 0 1px 0 rgba(255,255,255,0.16), inset 0 0 90px rgba(${dareAccentTheme.rgb},0.06), inset 0 -44px 90px rgba(0,0,0,0.34), 0 30px 94px rgba(0,0,0,0.38), 0 0 46px rgba(${dareAccentTheme.rgb},0.08)`,
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01))",
                transform: "translateY(-38px) perspective(900px) rotateX(2deg)",
                opacity: picModeEnabled ? 0 : 1,
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                border: "1px solid rgba(255,255,255,0.06)",
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -120px 160px rgba(0,0,0,0.58), inset 0 120px 160px rgba(255,255,255,0.025)",
              }}
            />
            {coverThumbnailUrl && (
              <div
                className="dare-cover-full-thumbnail"
                aria-hidden="true"
                style={{
                  ...dareCoverPosterFrameStyle,
                  zIndex: 0,
                }}
              >
                <img
                  src={coverThumbnailUrl}
                  alt=""
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                    transform: "scale(1.01)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "linear-gradient(180deg, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.10) 34%, rgba(0,0,0,0.84) 100%)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    boxShadow:
                      "inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 -160px 180px rgba(0,0,0,0.52)",
                  }}
                />
              </div>
            )}
            <div
              aria-hidden="true"
              style={{
                ...dareCoverPosterFrameStyle,
                zIndex: 1,
                border: "1px solid rgba(255,255,255,0.09)",
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                ...dareCoverPosterFrameStyle,
                zIndex: 2,
                display: "flex",
                flexDirection: "column",
                padding: "18px 18px 16px",
              }}
            >
              <div
                className="dare-cover-poster-copy"
                style={{
                  width: "min(100%, 368px)",
                  marginTop: "auto",
                  marginBottom: 30,
                  marginLeft: "auto",
                  marginRight: "auto",
                  borderRadius: "32px",
                  background:
                    `radial-gradient(circle at 18% 0%, rgba(${dareAccentTheme.rgb},0.14), transparent 34%), linear-gradient(180deg, rgba(24,24,26,0.86), rgba(0,0,0,0.76))`,
                  border: "1px solid rgba(255,255,255,0.10)",
                  boxShadow:
                    "0 20px 56px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.055)",
                  padding: "20px 20px 21px",
                  backdropFilter: "blur(20px) saturate(1.18)",
                  WebkitBackdropFilter: "blur(20px) saturate(1.18)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    minWidth: 0,
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    marginBottom: 9,
                    color: "rgba(255,255,255,0.86)",
                    fontSize: 16,
                    fontWeight: 900,
                  }}
                >
                  <PostAvatar
                    src={dare.challenger.avatar}
                    name={dare.challenger.nickname}
                    size={26}
                    style={{
                      flex: "0 0 auto",
                      border: "2px solid rgba(4,7,5,0.92)",
                      boxShadow: "0 8px 16px rgba(0,0,0,0.34)",
                    }}
                  />
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {dare.challenger.nickname}
                  </span>
                  <span
                    style={{
                      color: dareAccentTheme.color,
                      fontSize: 12,
                      fontWeight: 950,
                      letterSpacing: "0.12em",
                      textShadow: `0 0 16px rgba(${dareAccentTheme.rgb},0.30)`,
                    }}
                  >
                    DARED
                  </span>
                  <PostAvatar
                    src={dare.receiver.avatar}
                    name={dare.receiver.nickname}
                    size={26}
                    style={{
                      flex: "0 0 auto",
                      border: "2px solid rgba(4,7,5,0.92)",
                      boxShadow: "0 8px 16px rgba(0,0,0,0.34)",
                    }}
                  />
                  <span
                    style={{
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: "rgba(255,255,255,0.86)",
                      fontWeight: 900,
                    }}
                  >
                    {dare.receiver.nickname}
                  </span>
                </div>
                <p
                  style={{
                    color: "#fff",
                    fontSize: "clamp(22px, 5.9vw, 30px)",
                    lineHeight: 1.12,
                    fontWeight: 950,
                    margin: 0,
                    letterSpacing: 0,
                    textAlign: "center",
                    textShadow: "0 10px 26px rgba(0,0,0,0.42)",
                    overflowWrap: "anywhere",
                  }}
                >
                  {dare.description}
                </p>
              </div>

              <div
                className="dare-cover-poster-strip"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  marginTop: 0,
                  padding: "0 4px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
                  {coverVoterPreview.map((voter, index) => (
                    <PostAvatar
                      key={`${dare.id}-cover-voter-${voter.id || index}`}
                      src={voter.avatarUrl}
                      name={voter.displayName || voter.username || "Voter"}
                      size={30}
                      userId={voter.oduserId}
                      username={voter.username}
                      style={{
                        marginLeft: index === 0 ? 0 : -8,
                        border: "2px solid rgba(4,7,5,0.92)",
                        boxShadow: "0 8px 16px rgba(0,0,0,0.32)",
                      }}
                    />
                  ))}
                  {coverVoteTotal > coverVoterPreview.length && (
                    <span
                      style={{
                        width: 30,
                        height: 30,
                        marginLeft: coverVoterPreview.length > 0 ? -8 : 0,
                        borderRadius: "50%",
                        border: "2px solid rgba(4,7,5,0.92)",
                        background:
                          "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))",
                        color: "rgba(255,255,255,0.86)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        fontWeight: 950,
                        boxShadow: "0 8px 16px rgba(0,0,0,0.32)",
                      }}
                    >
                      +{Math.max(0, coverVoteTotal - coverVoterPreview.length)}
                    </span>
                  )}
                  <span
                    style={{
                      marginLeft: 8,
                      color: "rgba(255,255,255,0.82)",
                      fontSize: 12,
                      fontWeight: 900,
                      textShadow: "0 2px 8px rgba(0,0,0,0.55)",
                    }}
                  >
                    {coverVoteTotal.toLocaleString()} voted
                  </span>
                </div>
                <div
                  style={{
                    flex: 1,
                    maxWidth: 174,
                    minWidth: 96,
                    display: "flex",
                    flexDirection: "column",
                    gap: 5,
                  }}
                >
                  <div
                    style={{
                      height: 4,
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.16)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${coverRealScore}%`,
                        height: "100%",
                        borderRadius: 999,
                        background:
                          "linear-gradient(90deg,rgba(255,255,255,0.52),rgba(255,255,255,0.82))",
                        boxShadow: "0 0 12px rgba(255,255,255,0.12)",
                      }}
                    />
                  </div>
                  <span
                    style={{
                      color: "rgba(255,255,255,0.72)",
                      fontSize: 12,
                      fontWeight: 950,
                      textAlign: "right",
                      textShadow: "0 2px 8px rgba(0,0,0,0.5)",
                    }}
                  >
                    {coverRealScore}% Real Score
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section
            className="pop-dare-proof-card"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              overflow: "hidden",
              background: "#0a0a0a",
              contain: "layout paint style",
              zIndex: effectiveProofViewOpen ? 1 : 0,
              opacity: effectiveProofViewOpen ? 1 : 0,
              transform: effectiveProofViewOpen
                ? "translate3d(0,0,0) scale(1)"
                : "translate3d(0,24px,0) scale(0.985)",
              transition:
                "opacity 0.34s ease 0.04s, transform 0.46s cubic-bezier(0.22,1,0.36,1)",
              pointerEvents: effectiveProofViewOpen ? "auto" : "none",
              backfaceVisibility: "hidden",
            }}
          >
            {dare.proof && (
              <div
                style={{ position: "absolute", inset: 0, zIndex: 0 }}
              >
                <img
                  src={
                    dare.proof.type === "video"
                      ? dare.proof.thumbnail || dare.proof.url
                      : dare.proof.url
                  }
                  alt="Dare proof"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: "35%",
                    background:
                      "linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)",
                    // Decorative gradient: leave proof-card controls reachable.
                    pointerEvents: "none",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: "45%",
                    background:
                      "linear-gradient(to top, rgba(0,0,0,0.92) 0%, transparent 100%)",
                    // Decorative gradient: leave proof-card controls reachable.
                    pointerEvents: "none",
                  }}
                />
                {dare.proof.type === "video" && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      pointerEvents: "none",
                    }}
                  >
                    <div
                      style={{
                        width: "64px",
                        height: "64px",
                        background: "rgba(255,255,255,0.18)",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backdropFilter: "blur(6px)",
                        border: "1.5px solid rgba(255,255,255,0.25)",
                      }}
                    >
                      <Play size={30} color="#fff" fill="#fff" />
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Sidebar icons appear with the Real/Fake controls after the progress line finishes. */}
            {voteControlsVisible && (
              <div
                style={{
                  position: "absolute",
                  right: 14,
                  bottom: "calc(200px + var(--safe-area-bottom))",
                  zIndex: 10,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "16px",
                  opacity: voteControlsVisible ? 1 : 0,
                  transform: voteControlsVisible
                    ? "translateY(0)"
                    : "translateY(10px)",
                  transition: "opacity 0.35s ease, transform 0.35s ease",
                }}
              >
                <button
                  type="button"
                  aria-label="Like dare proof"
                  aria-pressed={hasLikedMedia}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "5px",
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    cursor: hasLikedMedia ? "default" : "pointer",
                    WebkitTapHighlightColor: "transparent",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleMediaLike();
                  }}
                >
                  <Heart
                    size={29}
                    color={hasLikedMedia ? "#fb7185" : "rgba(255,255,255,0.68)"}
                    fill={hasLikedMedia ? "#fb7185" : "transparent"}
                    style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.6))" }}
                  />
                  <span
                    style={{
                      color: hasLikedMedia
                        ? "#fecdd3"
                        : "rgba(255,255,255,0.6)",
                      fontSize: "12px",
                      fontWeight: 800,
                      textShadow: "0 1px 4px rgba(0,0,0,0.6)",
                    }}
                  >
                    {realLikeCount}
                  </span>
                </button>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <Eye
                    size={28}
                    color="rgba(255,255,255,0.55)"
                    style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.6))" }}
                  />
                  <span
                    aria-label="Dare proof views"
                    style={{
                      color: "rgba(255,255,255,0.55)",
                      fontSize: "12px",
                      fontWeight: 700,
                      textShadow: "0 1px 4px rgba(0,0,0,0.6)",
                    }}
                  >
                    {realViewCount}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Open dare comments"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "5px",
                    cursor: "pointer",
                    WebkitTapHighlightColor: "transparent",
                    border: "none",
                    background: "transparent",
                    padding: 0,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenComments?.(dare);
                  }}
                >
                  <MessageCircle
                    size={28}
                    color="rgba(255,255,255,0.55)"
                    style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.6))" }}
                  />
                  <span
                    style={{
                      color: "rgba(255,255,255,0.55)",
                      fontSize: "12px",
                      fontWeight: 700,
                      textShadow: "0 1px 4px rgba(0,0,0,0.6)",
                    }}
                  >
                    {realCommentCount}
                  </span>
                </button>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "5px",
                    cursor: "pointer",
                    WebkitTapHighlightColor: "transparent",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenShare?.(dare);
                  }}
                >
                  <Share2
                    size={28}
                    color="rgba(255,255,255,0.55)"
                    style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.6))" }}
                  />
                  <span
                    style={{
                      color: "rgba(255,255,255,0.55)",
                      fontSize: "12px",
                      fontWeight: 700,
                      textShadow: "0 1px 4px rgba(0,0,0,0.6)",
                    }}
                  >
                    Share
                  </span>
                </div>
              </div>
            )}

            {showProofTitleContext && effectiveProofViewOpen && (
              <div
                key={`proof-context-${dare.id}`}
                className="dare-proof-context-title"
                style={{
                  position: "absolute",
                  left: 14,
                  right: 14,
                  top: "calc(var(--safe-area-top) + 18px)",
                  zIndex: 9,
                  maxWidth: 368,
                  margin: "0 auto",
                  borderRadius: 32,
                  background:
                    `radial-gradient(circle at 18% 0%, rgba(${dareAccentTheme.rgb},0.13), transparent 34%), linear-gradient(180deg, rgba(24,24,26,0.90), rgba(0,0,0,0.78))`,
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow:
                    "0 20px 56px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.055)",
                  padding: "20px 20px 21px",
                  pointerEvents: "none",
                  overflow: "hidden",
                  backdropFilter: "blur(20px) saturate(1.18)",
                  WebkitBackdropFilter:
                    "blur(20px) saturate(1.18)",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    zIndex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    marginBottom: 9,
                    color: "rgba(255,255,255,0.86)",
                    fontSize: 16,
                    fontWeight: 900,
                    minWidth: 0,
                  }}
                >
                  <PostAvatar
                    src={dare.challenger.avatar}
                    name={dare.challenger.nickname}
                    size={26}
                    style={{
                      flex: "0 0 auto",
                      border: "2px solid rgba(4,7,5,0.92)",
                      boxShadow: "0 8px 16px rgba(0,0,0,0.34)",
                    }}
                  />
                  <span
                    style={{
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {dare.challenger.nickname}
                  </span>
                  <span
                    style={{
                      color: dareAccentTheme.color,
                      fontSize: 12,
                      fontWeight: 950,
                      letterSpacing: "0.12em",
                      textShadow: `0 0 16px rgba(${dareAccentTheme.rgb},0.30)`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    DARED
                  </span>
                  <PostAvatar
                    src={dare.receiver.avatar}
                    name={dare.receiver.nickname}
                    size={26}
                    style={{
                      flex: "0 0 auto",
                      border: "2px solid rgba(4,7,5,0.92)",
                      boxShadow: "0 8px 16px rgba(0,0,0,0.34)",
                    }}
                  />
                  <span
                    style={{
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: "rgba(255,255,255,0.86)",
                      fontWeight: 900,
                    }}
                  >
                    {dare.receiver.nickname}
                  </span>
                </div>
                <p
                  style={{
                    position: "relative",
                    zIndex: 1,
                    color: "#fff",
                    fontSize: "clamp(22px, 5.9vw, 30px)",
                    lineHeight: 1.12,
                    fontWeight: 950,
                    margin: 0,
                    letterSpacing: 0,
                    textAlign: "center",
                    textShadow: "0 12px 30px rgba(0,0,0,0.56)",
                    overflowWrap: "anywhere",
                  }}
                >
                  {dare.description}
                </p>
              </div>
            )}

            {/* Progress bar — only shown when not yet voted and buttons not yet visible */}
            {!hasVoted && !buttonsVisible && phase === "idle" && (
              <div
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  fastForwardVoteProgress(e.clientX, e.currentTarget);
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                }}
                style={{
                  position: "absolute",
                  top: "calc(100% - 100px - var(--safe-area-bottom))", // decreased further to move down more
                  left: "14px",
                  right: "14px",
                  zIndex: 100,
                  height: "5px", // thinner than 8px, slightly thicker than original 2px
                  borderRadius: "99px",
                  background: "rgba(255,255,255,0.10)",
                  overflow: "visible",
                  cursor: "pointer",
                  touchAction: "none",
                  WebkitUserSelect: "none",
                  userSelect: "none",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: "-20px",
                    zIndex: 1,
                  }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const parent = e.currentTarget.parentElement;
                    if (parent) {
                      fastForwardVoteProgress(e.clientX, parent);
                    }
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                />
                <div
                  data-progress-bar // ← used by the querySelector above
                  key={timerKey}
                  style={{
                    height: "100%",
                    borderRadius: "99px",
                    background:
                      `linear-gradient(90deg, rgba(${dareAccentTheme.rgb},0.52), rgba(${dareAccentTheme.rgb},0.92))`,
                    width: timerRunning ? "100%" : "0%",
                    transition: timerRunning ? `width 10s linear` : "none",
                    pointerEvents: "none",
                    position: "relative",
                    zIndex: 2,
                  }}
                />
              </div>
            )}

            {/* Vote buttons / voted state */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 1,
                padding: "0 14px calc(95px + var(--safe-area-bottom))",
              }}
            >
              <div
                style={{
                  opacity:
                    buttonsVisible || hasVoted || phase === "confirming"
                      ? 1
                      : 0,
                  transform:
                    buttonsVisible || hasVoted || phase === "confirming"
                      ? "translateY(0)"
                      : "translateY(16px)",
                  transition: "opacity 0.5s ease, transform 0.5s ease",
                  pointerEvents:
                    buttonsVisible || hasVoted || phase === "confirming"
                      ? "auto"
                      : "none",
                }}
              >
                {hasVoted ? (
                  // Voted state — show locked-in choice, clicking reopens the modal
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <button
                      onClick={() => onVoteClick(dare)}
                      style={{
                        width: "80%",
                        padding: "16px",
                        borderRadius: "16px",
                        border:
                          vote === "fake"
                            ? "1px solid rgba(255,255,255,0.18)"
                            : `1px solid rgba(${dareAccentTheme.rgb},0.32)`,
                        background:
                          vote === "real"
                            ? `linear-gradient(180deg, rgba(${dareAccentTheme.rgb},0.94), rgba(${dareAccentTheme.rgb},0.72))`
                            : "rgba(255,255,255,0.1)",
                        color:
                          vote === "real" ? "#fff" : "rgba(255,255,255,0.9)",
                        fontWeight: 800,
                        fontSize: "18px",
                        cursor: "pointer",
                        textAlign: "center",
                        backdropFilter: "blur(8px)",
                      }}
                    >
                      {vote === "real"
                        ? "You think this is Real"
                        : "You think this is Fake"}
                    </button>
                  </div>
                ) : phase === "idle" ? (
                  <div
                    style={{
                      display: "flex",
                      gap: "12px",
                      opacity: exiting ? 0 : 1,
                      transform: exiting
                        ? "scale(0.93) translateY(5px)"
                        : "scale(1) translateY(0)",
                      transition: "opacity 0.22s ease, transform 0.22s ease",
                    }}
                  >
                    <button
                      className="dare-real-btn"
                      onClick={() => handleVote("real")}
                      style={{
                        flex: 1,
                        padding: "16px",
                        borderRadius: "16px",
                        border: `1px solid rgba(${dareAccentTheme.rgb},0.32)`,
                        background:
                          `linear-gradient(180deg, rgba(${dareAccentTheme.rgb},0.94), rgba(${dareAccentTheme.rgb},0.72))`,
                        color: "#fff",
                        fontWeight: 800,
                        fontSize: "18px",
                        cursor: "pointer",
                        touchAction: "manipulation",
                        WebkitTapHighlightColor: "transparent",
                        animation: "btnPulseReal 6s ease-in-out infinite",
                      }}
                    >
                      Real
                    </button>
                    <button
                      className="dare-fake-btn"
                      onClick={() => handleVote("fake")}
                      style={{
                        flex: 1,
                        padding: "16px",
                        borderRadius: "16px",
                        border: "1px solid rgba(255,255,255,0.2)",
                        background: "rgba(255,255,255,0.1)",
                        color: "rgba(255,255,255,0.9)",
                        fontWeight: 800,
                        fontSize: "18px",
                        cursor: "pointer",
                        backdropFilter: "blur(8px)",
                        touchAction: "manipulation",
                        WebkitTapHighlightColor: "transparent",
                        animation: "btnPulseFake 6s ease-in-out infinite",
                      }}
                    >
                      Fake
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <button
                      onClick={handleConfirm}
                      style={{
                        width: "80%",
                        padding: "16px",
                        borderRadius: "16px",
                        border:
                          vote === "fake"
                            ? "1px solid rgba(255,255,255,0.18)"
                            : `1px solid rgba(${dareAccentTheme.rgb},0.32)`,
                        background:
                          vote === "real"
                            ? `linear-gradient(180deg, rgba(${dareAccentTheme.rgb},0.94), rgba(${dareAccentTheme.rgb},0.72))`
                            : "rgba(255,255,255,0.1)",
                        color:
                          vote === "real" ? "#fff" : "rgba(255,255,255,0.9)",
                        fontWeight: 800,
                        fontSize: "18px",
                        cursor: "pointer",
                        textAlign: "center",
                        backdropFilter: "blur(8px)",
                        animation:
                          "expandBtn 0.8s cubic-bezier(0.34,1.56,0.64,1) forwards",
                      }}
                    >
                      {vote === "real"
                        ? "You think this is Real"
                        : "You think this is Fake"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
        <style>{`
          .dare-proof-context-title {
            animation: dareProofContextTitle 5s cubic-bezier(0.22,1,0.36,1) both;
          }
          .dare-cover-slide {
            isolation: isolate;
          }
          .dare-cover-lattice {
            opacity: 0;
          }
          .dare-cover-metal {
            opacity: 0;
          }
          .dare-cover-ribbon {
            opacity: 0;
          }
          .dare-cover-stage {
            opacity: 1;
          }
          .dare-cover-avatar-stack {
            opacity: 0;
          }
          .dare-cover-avatar {
            transform-origin: center;
          }
          .dare-cover-avatar::before,
          .dare-cover-avatar::after {
            content: "";
            position: absolute;
            inset: -12px;
            border-radius: 999px;
            pointer-events: none;
          }
          .dare-cover-avatar::before {
            border: 1.5px solid rgba(var(--dare-accent-rgb),0.55);
            background: radial-gradient(circle, rgba(var(--dare-accent-rgb),0.18) 0%, rgba(var(--dare-accent-rgb),0.08) 44%, transparent 72%);
            box-shadow: 0 0 26px rgba(var(--dare-accent-rgb),0.28), 0 0 52px rgba(var(--dare-accent-rgb),0.13);
            animation: none;
          }
          .dare-cover-avatar::after {
            inset: -6px;
            padding: 1.5px;
            background: conic-gradient(from 90deg, rgba(255,255,255,0), rgba(var(--dare-accent-rgb),0.82), rgba(var(--dare-accent-rgb),0.62), rgba(var(--dare-accent-rgb),0.44), rgba(var(--dare-accent-rgb),0.56), rgba(255,255,255,0));
            opacity: 0.78;
            -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
            -webkit-mask-composite: xor;
            mask-composite: exclude;
            animation: none;
          }
          .dare-cover-capsule {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
          .dare-cover-full-thumbnail {
            opacity: 1;
            transform: scale(1);
          }
          .dare-cover-pic-frame {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          .dare-cover-slide-pic-mode .dare-cover-capsule {
            margin-top: 4px;
          }
          .dare-cover-challenge {
            position: relative;
            overflow: hidden;
            transform-origin: center top;
            opacity: 1;
          }
          .dare-cover-challenge::before {
            content: "";
            position: absolute;
            inset: 0;
            background: linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.16) 42%, rgba(255,255,255,0.13) 50%, transparent 64%);
            transform: translateX(-120%);
            pointer-events: none;
          }
          .dare-cover-arrival-sweep {
            position: absolute;
            inset: 0;
            border-radius: 24px;
            background: linear-gradient(105deg, transparent 0%, rgba(var(--dare-accent-rgb),0.18) 42%, rgba(var(--dare-accent-rgb),0.15) 50%, transparent 64%);
            transform: translateX(-120%);
            opacity: 0;
            pointer-events: none;
            z-index: 2;
          }
          .dare-cover-kicker {
            opacity: 0;
          }
          .dare-cover-copy {
            opacity: 0;
          }
          .dare-cover-slide-active .dare-cover-lattice {
            animation: dareCoverLatticeIn 1s ease-out both;
          }
          .dare-cover-slide-active .dare-cover-metal {
            animation: dareCoverMetalIn 0.8s ease-out both, dareCoverSheen 8s ease-in-out 0.8s infinite;
          }
          .dare-cover-slide-active .dare-cover-ribbon {
            animation: dareCoverRibbonIn 1.1s cubic-bezier(0.22,1,0.36,1) 0.12s both, dareCoverRibbonDrift 7s ease-in-out 1.2s infinite;
          }
          .dare-cover-slide-active .dare-cover-avatar-stack {
            animation: dareCoverAvatarStackIn 0.72s cubic-bezier(0.22,1,0.36,1) 0.18s both;
          }
          .dare-cover-slide-active .dare-cover-avatar {
            animation: dareCoverAvatarBreathe 4.6s ease-in-out 1.25s infinite;
          }
          .dare-cover-slide-active .dare-cover-avatar::before {
            animation: dareCoverAvatarRing 2.65s ease-out 0.45s infinite;
          }
          .dare-cover-slide-active .dare-cover-avatar::after {
            animation: dareCoverAvatarHalo 4.8s linear infinite;
          }
          .dare-cover-slide-active .dare-cover-avatar-right::before {
            animation-delay: 0.78s;
          }
          .dare-cover-slide-active .dare-cover-avatar-right::after {
            animation-delay: -1.9s;
          }
          .dare-cover-slide-active .dare-cover-capsule {
            animation: none;
          }
          .dare-cover-slide-active .dare-cover-full-thumbnail {
            animation: none;
          }
          .dare-cover-slide-active .dare-cover-pic-frame {
            animation: none;
          }
          .dare-cover-slide-active .dare-cover-challenge {
            animation: none;
          }
          .dare-cover-slide-active .dare-cover-challenge::before {
            animation: none;
          }
          .dare-cover-slide-active .dare-cover-kicker {
            animation: dareCoverKickerIn 0.5s ease-out 0.3s both;
          }
          .dare-cover-slide-active .dare-cover-copy {
            animation: dareCoverCopyIn 0.72s cubic-bezier(0.22,1,0.36,1) 0.4s both;
          }
          .dare-cover-slide-awaiting-entry .dare-cover-kicker,
          .dare-cover-slide-awaiting-entry .dare-cover-copy {
            opacity: 0;
            transform: translateY(14px);
            filter: blur(6px);
          }
          .dare-cover-slide-active .dare-capsule-dared-label,
          .dare-cover-slide-entered .dare-capsule-dared-label {
            animation: dareCapsuleDaredGlow 4.8s ease-in-out infinite;
          }
          .dare-cover-slide-entered .dare-cover-lattice {
            opacity: 1;
            transform: scale(1);
          }
          .dare-cover-slide-entered .dare-cover-metal {
            opacity: 0.86;
            animation: none;
          }
          .dare-cover-slide-entered .dare-cover-ribbon {
            opacity: 0.68;
            transform: translateY(-50%) rotate(12deg) scale(1);
            animation: none;
          }
          .dare-cover-slide-entered .dare-cover-avatar-stack {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0) drop-shadow(0 18px 34px rgba(0,0,0,0.5));
          }
          .dare-cover-slide-entered .dare-cover-avatar {
            animation: none;
            transform: translateY(0) scale(1);
          }
          .dare-cover-slide-entered .dare-cover-avatar::before {
            animation: dareCoverAvatarRing 3.15s ease-out 0.45s infinite;
          }
          .dare-cover-slide-entered .dare-cover-avatar::after {
            animation: dareCoverAvatarHalo 5.6s linear infinite;
          }
          .dare-cover-slide-entered .dare-cover-avatar-right::before {
            animation-delay: 1.08s;
          }
          .dare-cover-slide-entered .dare-cover-avatar-right::after {
            animation-delay: -2.2s;
          }
          .dare-cover-slide-entered .dare-cover-capsule {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
          .dare-cover-slide-entered .dare-cover-full-thumbnail {
            opacity: 1;
            transform: scale(1);
          }
          .dare-cover-slide-entered .dare-cover-pic-frame {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          .dare-cover-slide-entered .dare-cover-challenge::before {
            animation: dareCoverChallengeSweepLoop 9s cubic-bezier(0.22,1,0.36,1) 1.4s infinite;
            transform: translateX(-120%);
          }
          .dare-cover-slide-arrival-sweep .dare-cover-arrival-sweep {
            animation: dareCoverChallengeArrivalSweep 2.15s cubic-bezier(0.22,1,0.36,1) 1.22s both;
            transform: translateX(-120%);
          }
          .dare-cover-slide-entered .dare-cover-kicker,
          .dare-cover-slide-entered .dare-cover-copy {
            opacity: 1;
            transform: translateY(0);
            filter: blur(0);
          }
          @keyframes dareCoverLatticeIn {
            from { opacity: 0; transform: scale(1.04); }
            to { opacity: 1; transform: scale(1); }
          }
          @keyframes dareCoverSheen {
            0%, 100% { opacity: 0.68; transform: translateX(-1.5%); }
            50% { opacity: 0.95; transform: translateX(1.5%); }
          }
          @keyframes dareCoverMetalIn {
            from { opacity: 0; }
            to { opacity: 0.86; }
          }
          @keyframes dareCoverRibbonIn {
            from { opacity: 0; transform: translateY(calc(-50% + 28px)) rotate(12deg) scale(0.98); }
            to { opacity: 0.68; transform: translateY(-50%) rotate(12deg) scale(1); }
          }
          @keyframes dareCoverRibbonDrift {
            0%, 100% { transform: translateY(-50%) rotate(12deg); }
            50% { transform: translateY(calc(-50% + 10px)) rotate(12deg); }
          }
          @keyframes dareCoverAvatarStackIn {
            from { opacity: 0; transform: translateY(22px) scale(0.88); filter: blur(8px) drop-shadow(0 18px 34px rgba(0,0,0,0.5)); }
            to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0) drop-shadow(0 18px 34px rgba(0,0,0,0.5)); }
          }
          @keyframes dareCoverAvatarBreathe {
            0%, 100% { transform: translateY(0) scale(1); }
            50% { transform: translateY(-3px) scale(1.015); }
          }
          @keyframes dareCoverAvatarRing {
            0% { opacity: 0.95; transform: scale(0.84); filter: blur(0); }
            52% { opacity: 0.28; transform: scale(1.2); filter: blur(0.4px); }
            78% { opacity: 0; transform: scale(1.36); filter: blur(1px); }
            100% { opacity: 0; transform: scale(1.36); filter: blur(1px); }
          }
          @keyframes dareCoverAvatarHalo {
            0% { transform: rotate(0deg) scale(1); opacity: 0.72; }
            50% { transform: rotate(180deg) scale(1.04); opacity: 0.95; }
            100% { transform: rotate(360deg) scale(1); opacity: 0.72; }
          }
          @keyframes dareCoverCapsuleSettle {
            from { opacity: 0; transform: translateY(14px) scale(0.96); filter: blur(5px); }
            to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
          }
          @keyframes dareCoverFullThumbnailIn {
            from { opacity: 0; transform: scale(1.035); filter: blur(8px); }
            to { opacity: 1; transform: scale(1); filter: blur(0); }
          }
          @keyframes dareCoverPicFrameIn {
            from { opacity: 0; transform: translateY(18px) scale(0.98); filter: blur(8px); }
            to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
          }
          @keyframes dareCoverChallengeSweep {
            from { transform: translateX(-120%); }
            to { transform: translateX(120%); }
          }
          @keyframes dareProofContextTitle {
            0% {
              opacity: 0;
              transform: translate3d(0,18px,0) scale(0.975);
              filter: blur(4px);
            }
            14% {
              opacity: 1;
              transform: translate3d(0,0,0) scale(1);
              filter: blur(0);
            }
            76% {
              opacity: 1;
              transform: translate3d(0,0,0) scale(1);
              filter: blur(0);
            }
            100% {
              opacity: 0;
              transform: translate3d(0,16px,0) scale(0.985);
              filter: blur(3px);
            }
          }
          @keyframes dareCoverChallengeArrivalSweep {
            0% { transform: translateX(-120%); opacity: 0; }
            10% { opacity: 0.95; }
            74% { opacity: 0.95; }
            100% { transform: translateX(120%); opacity: 0; }
          }
          @keyframes dareCoverChallengeSweepLoop {
            0% { transform: translateX(-120%); }
            28% { transform: translateX(120%); }
            100% { transform: translateX(120%); }
          }
          @keyframes dareCapsuleDaredGlow {
            0%, 100% {
              text-shadow: 0 2px 8px rgba(0,0,0,0.86), 0 0 12px rgba(var(--dare-accent-rgb),0.58), 0 0 24px rgba(var(--dare-accent-rgb),0.22);
              filter: brightness(1);
            }
            45% {
              text-shadow: 0 2px 8px rgba(0,0,0,0.86), 0 0 22px rgba(var(--dare-accent-rgb),0.82), 0 0 38px rgba(var(--dare-accent-rgb),0.32);
              filter: brightness(1.16);
            }
          }
          @keyframes dareCoverKickerIn {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes dareCoverCopyIn {
            from { opacity: 0; transform: translateY(14px); filter: blur(6px); }
            to { opacity: 1; transform: translateY(0); filter: blur(0); }
          }
          @keyframes expandBtn { from { width: 50%; opacity: 0.5; transform: scale(0.93); } to { width: 80%; opacity: 1; transform: scale(1); } }
          .dare-real-btn { transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1); }
          .dare-real-btn:active { transform: scale(0.88); transition: transform 0.06s ease; }
          .dare-fake-btn { transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1); }
          .dare-fake-btn:active { transform: scale(0.88); transition: transform 0.06s ease; }
          @keyframes btnPulseReal { 0%{box-shadow:0 0 0px 0px rgba(var(--dare-accent-rgb),0);opacity:0.72} 15%{box-shadow:0 0 24px 7px rgba(var(--dare-accent-rgb),0.34);opacity:1} 35%{box-shadow:0 0 0px 0px rgba(var(--dare-accent-rgb),0);opacity:0.72} 100%{box-shadow:0 0 0px 0px rgba(var(--dare-accent-rgb),0);opacity:0.72} }
          @keyframes btnPulseFake { 0%{box-shadow:0 0 0px 0px rgba(255,255,255,0);opacity:0.72} 55%{box-shadow:0 0 0px 0px rgba(255,255,255,0);opacity:0.72} 70%{box-shadow:0 0 22px 6px rgba(255,255,255,0.18);opacity:1} 88%{box-shadow:0 0 0px 0px rgba(255,255,255,0);opacity:0.72} 100%{box-shadow:0 0 0px 0px rgba(255,255,255,0);opacity:0.72} }
        `}</style>
      </div>
    );
  }

  // ── Non-reel card (feed view) ──────────────────────────────────────────────
  return (
    <div
      className="overflow-hidden bg-[#1a1a1a] rounded-2xl border border-gray-800"
      style={{
        padding: "0",
        WebkitTapHighlightColor: "transparent",
        outline: "none",
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ height: "32px" }} />
      <div
        style={{
          padding: "0 14px 12px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "12px",
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
            borderRadius: "999px",
            padding: "10px 24px 10px 10px",
            backdropFilter: "blur(12px)",
            boxShadow:
              "0 10px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)",
          }}
        >
          <PostAvatar
            src={dare.challenger.avatar}
            name={dare.challenger.nickname}
            size={52}
            style={{ border: "2px solid rgba(255,255,255,0.2)" }}
          />
          <span
            style={{
              color: "#fff",
              fontWeight: 700,
              fontSize: "19px",
              whiteSpace: "nowrap",
            }}
          >
            {dare.challenger.nickname.split(" ")[0]}
          </span>
          <span
            style={{
              color: "rgba(255,255,255,0.68)",
              fontWeight: 800,
              fontSize: "19px",
              whiteSpace: "nowrap",
            }}
          >
            {dare.receiver.nickname.split(" ")[0]}
          </span>
        </div>
      </div>
      <div className="px-4 pb-2">
        <p
          className="text-white text-2xl font-bold text-center"
          style={{ marginTop: "8px" }}
        >
          {dare.description}
        </p>
      </div>
      {dare.proof && (
        <div
          className="bg-[#1a1a1a] rounded-2xl border border-gray-800 mx-4 mb-4 overflow-hidden"
          style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.5)" }}
        >
          <div
            style={{
              borderRadius: "16px",
              overflow: "hidden",
              cursor: "pointer",
              position: "relative",
            }}
          >
            {dare.proof.type === "image" ? (
              <img
                src={dare.proof.url}
                alt="Dare proof"
                style={{
                  width: "100%",
                  height: "32rem",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            ) : (
              <div
                style={{ position: "relative", width: "100%", height: "32rem" }}
              >
                <img
                  src={dare.proof.thumbnail || dare.proof.url}
                  alt="Video thumbnail"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(0,0,0,0.25)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div
                    style={{
                      width: "64px",
                      height: "64px",
                      background: "rgba(255,255,255,0.18)",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backdropFilter: "blur(6px)",
                      border: "1.5px solid rgba(255,255,255,0.25)",
                    }}
                  >
                    <Play size={30} color="#fff" fill="#fff" />
                  </div>
                </div>
              </div>
            )}
            <div
              style={{
                position: "absolute",
                bottom: "14px",
                left: "14px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              {[
                {
                  icon: <Eye size={14} color="rgba(255,255,255,0.85)" />,
                  val: realViewCount,
                },
                {
                  icon: <Heart size={14} color="rgba(255,255,255,0.85)" />,
                  val: dare.votes ? dare.votes.real + 4 : 24,
                },
                {
                  icon: (
                    <MessageCircle size={14} color="rgba(255,255,255,0.85)" />
                  ),
                  val: realCommentCount,
                },
              ].map((item, i) => (
                <div
                  key={`vote-option-${i}`}
                  onClick={() => {
                    if (i === 2) onOpenComments?.(dare);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    background: "rgba(0,0,0,0.6)",
                    backdropFilter: "blur(8px)",
                    borderRadius: "999px",
                    padding: "6px 12px",
                    cursor: i === 2 ? "pointer" : "default",
                  }}
                >
                  {item.icon}
                  <span
                    style={{
                      color: "rgba(255,255,255,0.9)",
                      fontSize: "13px",
                      fontWeight: 600,
                    }}
                  >
                    {item.val}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="p-4 pt-4">
        {hasVoted ? (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button
              onClick={() => onVoteClick(dare)}
              style={{
                width: "80%",
                padding: "14px",
                borderRadius: "14px",
                border: "none",
                background:
                  vote === "real"
                    ? `linear-gradient(180deg, rgba(${dareAccentTheme.rgb},0.94), rgba(${dareAccentTheme.rgb},0.72))`
                    : "rgba(255,255,255,0.08)",
                color: vote === "real" ? "#fff" : "rgba(255,255,255,0.8)",
                fontWeight: 800,
                fontSize: "17px",
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              {vote === "real"
                ? "You think this is Real"
                : "You think this is Fake"}
            </button>
          </div>
        ) : phase === "idle" ? (
          <div
            style={{
              display: "flex",
              gap: "12px",
              opacity: exiting ? 0 : 1,
              transform: exiting
                ? "scale(0.93) translateY(5px)"
                : "scale(1) translateY(0)",
              transition: "opacity 0.22s ease, transform 0.22s ease",
            }}
          >
            <button
              className="dare-real-btn"
              onClick={() => handleVote("real")}
              style={{
                flex: 1,
                padding: "14px",
                borderRadius: "14px",
                border: `1px solid rgba(${dareAccentTheme.rgb},0.28)`,
                background:
                  `linear-gradient(180deg, rgba(${dareAccentTheme.rgb},0.94), rgba(${dareAccentTheme.rgb},0.72))`,
                color: "#fff",
                fontWeight: 800,
                fontSize: "17px",
                cursor: "pointer",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              Real
            </button>
            <button
              className="dare-fake-btn"
              onClick={() => handleVote("fake")}
              style={{
                flex: 1,
                padding: "14px",
                borderRadius: "14px",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.8)",
                fontWeight: 800,
                fontSize: "17px",
                cursor: "pointer",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              Fake
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button
              onClick={handleConfirm}
              style={{
                width: "80%",
                padding: "14px",
                borderRadius: "14px",
                border: "none",
                background:
                  vote === "real"
                    ? `linear-gradient(180deg, rgba(${dareAccentTheme.rgb},0.94), rgba(${dareAccentTheme.rgb},0.72))`
                    : "rgba(255,255,255,0.08)",
                color: vote === "real" ? "#fff" : "rgba(255,255,255,0.8)",
                fontWeight: 800,
                fontSize: "17px",
                cursor: "pointer",
                textAlign: "center",
                animation:
                  "expandBtn 0.8s cubic-bezier(0.34,1.56,0.64,1) forwards",
              }}
            >
              {vote === "real"
                ? "You think this is Real"
                : "You think this is Fake"}
            </button>
          </div>
        )}
        <style>{`
          @keyframes expandBtn { from { width: 50%; opacity: 0.5; transform: scale(0.93); } to { width: 80%; opacity: 1; transform: scale(1); } }
          @keyframes daredPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
        `}</style>
      </div>
    </div>
  );
}

// ─── SwipeableTruthCard ───────────────────────────────────────────────────────
type TruthCardBackgroundTheme = {
  activeShadow: string;
  answerBubble: string;
  legacyAnswer: string;
  legacyQuestion: string;
  legacyShell: string;
  questionBubble: string;
  shell: string;
  texture: string;
  wash: string;
};

const TRUTH_CARD_BACKGROUND_THEMES: TruthCardBackgroundTheme[] = [
  {
    shell:
      "radial-gradient(circle at 50% -12%, rgba(74,222,128,0.18), transparent 34%), radial-gradient(circle at 12% 74%, rgba(34,197,94,0.11), transparent 28%), radial-gradient(circle at 88% 70%, rgba(20,184,166,0.1), transparent 32%), linear-gradient(180deg, #061109 0%, #030b06 48%, #020403 100%)",
    texture:
      "linear-gradient(115deg, rgba(74,222,128,0.11) 0 1px, transparent 1px 22px), linear-gradient(245deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 28px), radial-gradient(ellipse at 50% 30%, rgba(74,222,128,0.08), transparent 42%)",
    wash: "conic-gradient(from 210deg at 50% 52%, rgba(74,222,128,0.15), rgba(255,255,255,0.04), rgba(20,184,166,0.1), rgba(34,197,94,0.08), rgba(74,222,128,0.15)), radial-gradient(ellipse at 50% 108%, rgba(0,0,0,0.76), transparent 50%)",
    questionBubble:
      "linear-gradient(180deg, rgba(22,32,25,0.92), rgba(8,13,10,0.86)), radial-gradient(circle at 0% 0%, rgba(255,255,255,0.11), transparent 54%)",
    answerBubble:
      "linear-gradient(180deg, rgba(74,222,128,0.13), rgba(8,16,11,0.78)), radial-gradient(circle at 100% 0%, rgba(34,197,94,0.13), transparent 46%)",
    legacyShell:
      "linear-gradient(180deg, rgba(9,19,13,0.98) 0%, rgba(6,14,10,0.99) 52%, rgba(3,6,4,0.99) 100%)",
    legacyQuestion:
      "linear-gradient(180deg, rgba(23,34,27,0.78), rgba(10,17,12,0.78))",
    legacyAnswer:
      "linear-gradient(180deg, rgba(255,255,255,0.09), rgba(8,16,11,0.72))",
    activeShadow:
      "0 0 0 1.5px rgba(74,222,128,0.28), 0 26px 70px rgba(0,0,0,0.88), 0 0 92px rgba(74,222,128,0.07) inset, 0 0 84px rgba(34,197,94,0.05) inset",
  },
  {
    shell:
      "radial-gradient(circle at 50% -12%, rgba(74,222,128,0.16), transparent 32%), radial-gradient(circle at 18% 76%, rgba(255,255,255,0.06), transparent 30%), radial-gradient(circle at 88% 66%, rgba(20,184,166,0.12), transparent 32%), linear-gradient(180deg, #06120c 0%, #04100a 50%, #020503 100%)",
    texture:
      "linear-gradient(115deg, rgba(74,222,128,0.09) 0 1px, transparent 1px 24px), linear-gradient(245deg, rgba(255,255,255,0.055) 0 1px, transparent 1px 30px), radial-gradient(ellipse at 50% 28%, rgba(34,197,94,0.075), transparent 42%)",
    wash: "conic-gradient(from 220deg at 52% 50%, rgba(74,222,128,0.12), rgba(255,255,255,0.035), rgba(34,197,94,0.08), rgba(14,116,84,0.095), rgba(74,222,128,0.12)), radial-gradient(ellipse at 50% 108%, rgba(0,0,0,0.78), transparent 50%)",
    questionBubble:
      "linear-gradient(180deg, rgba(18,31,24,0.92), rgba(6,13,9,0.86)), radial-gradient(circle at 0% 0%, rgba(74,222,128,0.105), transparent 54%)",
    answerBubble:
      "linear-gradient(180deg, rgba(74,222,128,0.105), rgba(6,15,10,0.78)), radial-gradient(circle at 100% 0%, rgba(255,255,255,0.09), transparent 46%)",
    legacyShell:
      "linear-gradient(180deg, rgba(8,18,23,0.98) 0%, rgba(5,14,17,0.99) 52%, rgba(2,5,6,0.99) 100%)",
    legacyQuestion:
      "linear-gradient(180deg, rgba(20,33,38,0.78), rgba(8,16,18,0.78))",
    legacyAnswer:
      "linear-gradient(180deg, rgba(56,189,248,0.075), rgba(7,16,17,0.72))",
    activeShadow:
      "0 0 0 1.5px rgba(74,222,128,0.26), 0 26px 70px rgba(0,0,0,0.88), 0 0 92px rgba(255,255,255,0.04) inset, 0 0 84px rgba(74,222,128,0.06) inset",
  },
  {
    shell:
      "radial-gradient(ellipse at 50% 16%, rgba(74,222,128,0.08), transparent 30%), radial-gradient(circle at 50% -8%, rgba(74,222,128,0.14), transparent 36%), radial-gradient(circle at 86% 74%, rgba(34,197,94,0.1), transparent 30%), linear-gradient(180deg, #08110b 0%, #040804 54%, #020302 100%)",
    texture:
      "linear-gradient(115deg, rgba(74,222,128,0.075) 0 1px, transparent 1px 26px), linear-gradient(245deg, rgba(255,255,255,0.055) 0 1px, transparent 1px 32px), radial-gradient(ellipse at 50% 24%, rgba(74,222,128,0.075), transparent 38%)",
    wash: "conic-gradient(from 190deg at 50% 44%, rgba(74,222,128,0.065), rgba(255,255,255,0.08), rgba(34,197,94,0.075), rgba(255,255,255,0.04), rgba(74,222,128,0.105)), radial-gradient(ellipse at 50% 108%, rgba(0,0,0,0.78), transparent 50%)",
    questionBubble:
      "linear-gradient(180deg, rgba(25,32,27,0.92), rgba(9,12,10,0.86)), radial-gradient(circle at 50% -10%, rgba(255,255,255,0.09), transparent 52%)",
    answerBubble:
      "linear-gradient(180deg, rgba(74,222,128,0.11), rgba(9,15,11,0.78)), radial-gradient(circle at 100% 0%, rgba(34,197,94,0.09), transparent 46%)",
    legacyShell:
      "linear-gradient(180deg, rgba(10,17,13,0.98) 0%, rgba(7,10,8,0.99) 56%, rgba(2,3,2,0.99) 100%)",
    legacyQuestion:
      "linear-gradient(180deg, rgba(27,33,28,0.78), rgba(11,14,11,0.78))",
    legacyAnswer:
      "linear-gradient(180deg, rgba(255,255,255,0.085), rgba(9,15,11,0.72))",
    activeShadow:
      "0 0 0 1.5px rgba(74,222,128,0.22), 0 26px 70px rgba(0,0,0,0.88), 0 0 92px rgba(74,222,128,0.055) inset, 0 0 84px rgba(255,255,255,0.03) inset",
  },
  {
    shell:
      "radial-gradient(circle at 48% -12%, rgba(74,222,128,0.15), transparent 34%), radial-gradient(circle at 14% 70%, rgba(34,197,94,0.08), transparent 28%), radial-gradient(circle at 88% 68%, rgba(20,184,166,0.09), transparent 32%), linear-gradient(180deg, #0b1109 0%, #060907 50%, #020402 100%)",
    texture:
      "linear-gradient(115deg, rgba(74,222,128,0.065) 0 1px, transparent 1px 24px), linear-gradient(245deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 30px), radial-gradient(ellipse at 50% 30%, rgba(74,222,128,0.07), transparent 42%)",
    wash: "conic-gradient(from 215deg at 50% 52%, rgba(74,222,128,0.085), rgba(255,255,255,0.035), rgba(34,197,94,0.095), rgba(20,184,166,0.07), rgba(74,222,128,0.085)), radial-gradient(ellipse at 50% 108%, rgba(0,0,0,0.78), transparent 50%)",
    questionBubble:
      "linear-gradient(180deg, rgba(24,31,22,0.92), rgba(9,12,8,0.86)), radial-gradient(circle at 0% 0%, rgba(74,222,128,0.085), transparent 54%)",
    answerBubble:
      "linear-gradient(180deg, rgba(74,222,128,0.105), rgba(10,13,9,0.78)), radial-gradient(circle at 100% 0%, rgba(34,197,94,0.085), transparent 46%)",
    legacyShell:
      "linear-gradient(180deg, rgba(18,10,15,0.98) 0%, rgba(9,8,11,0.99) 52%, rgba(3,2,4,0.99) 100%)",
    legacyQuestion:
      "linear-gradient(180deg, rgba(32,24,31,0.78), rgba(13,10,13,0.78))",
    legacyAnswer:
      "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(13,9,11,0.72))",
    activeShadow:
      "0 0 0 1.5px rgba(74,222,128,0.24), 0 26px 70px rgba(0,0,0,0.88), 0 0 92px rgba(74,222,128,0.05) inset, 0 0 84px rgba(255,255,255,0.04) inset",
  },
  {
    shell:
      "radial-gradient(circle at 24% 16%, rgba(74,222,128,0.115), transparent 30%), radial-gradient(circle at 76% 20%, rgba(34,197,94,0.105), transparent 31%), radial-gradient(circle at 50% 84%, rgba(255,255,255,0.055), transparent 28%), linear-gradient(180deg, #06110c 0%, #040806 50%, #020303 100%)",
    texture:
      "linear-gradient(115deg, rgba(74,222,128,0.08) 0 1px, transparent 1px 26px), linear-gradient(245deg, rgba(34,197,94,0.065) 0 1px, transparent 1px 32px), radial-gradient(ellipse at 50% 30%, rgba(255,255,255,0.06), transparent 42%)",
    wash: "conic-gradient(from 230deg at 50% 52%, rgba(74,222,128,0.09), rgba(34,197,94,0.085), rgba(255,255,255,0.035), rgba(39,39,42,0.075), rgba(74,222,128,0.09)), radial-gradient(ellipse at 50% 108%, rgba(0,0,0,0.78), transparent 50%)",
    questionBubble:
      "linear-gradient(180deg, rgba(20,31,24,0.92), rgba(7,11,8,0.86)), radial-gradient(circle at 0% 0%, rgba(74,222,128,0.09), transparent 54%)",
    answerBubble:
      "linear-gradient(180deg, rgba(74,222,128,0.09), rgba(7,14,9,0.78)), radial-gradient(circle at 100% 0%, rgba(255,255,255,0.08), transparent 46%)",
    legacyShell:
      "linear-gradient(180deg, rgba(7,17,14,0.98) 0%, rgba(5,10,11,0.99) 52%, rgba(2,3,3,0.99) 100%)",
    legacyQuestion:
      "linear-gradient(180deg, rgba(20,32,29,0.78), rgba(8,14,14,0.78))",
    legacyAnswer:
      "linear-gradient(180deg, rgba(56,189,248,0.065), rgba(7,14,13,0.72))",
    activeShadow:
      "0 0 0 1.5px rgba(74,222,128,0.24), 0 26px 70px rgba(0,0,0,0.88), 0 0 92px rgba(74,222,128,0.055) inset, 0 0 84px rgba(255,255,255,0.04) inset",
  },
];

function getTruthCardBackgroundTheme(postId: string): TruthCardBackgroundTheme {
  let hash = 0;
  for (let i = 0; i < postId.length; i += 1) {
    hash = (hash * 31 + postId.charCodeAt(i)) | 0;
  }
  return TRUTH_CARD_BACKGROUND_THEMES[
    Math.abs(hash) % TRUTH_CARD_BACKGROUND_THEMES.length
  ];
}

function TruthConversationScreen({
  post,
  onClose,
  onNavigateToProfile,
}: {
  post: TruthPost;
  onClose: () => void;
  onNavigateToProfile?: (userId: string) => void;
}) {
  useBodyScrollLock(true);
  useEffect(() => {
    const bottomNavElements = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".app-bottom-nav, .app-bottom-nav-motion",
      ),
    );
    const previousDisplay = bottomNavElements.map((element) => ({
      element,
      display: element.style.display,
    }));

    bottomNavElements.forEach((element) => {
      element.style.display = "none";
    });

    return () => {
      previousDisplay.forEach(({ element, display }) => {
        element.style.display = display;
      });
    };
  }, []);
  const { user } = useAuthStore();
  const { voteData, subscribeToVotes, unsubscribeFromVotes, getUserVote } =
    useTruthInteractionStore();
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");
  const theme = getTruthCardBackgroundTheme(post.id);
  const answerText = post.answer?.trim() || "No reply has been posted yet.";
  const isLongQuestion = post.question.length > 120;
  const isLongAnswer = answerText.length > 220;
  const isShortAnswer = answerText.length <= 90;
  const isMediumAnswer = answerText.length > 90 && answerText.length <= 180;
  const conversationTime = formatTimeAgo(post.createdAt);
  const userVote = getUserVote(post.id);
  const data = voteData[post.id];
  const truthCount = data?.truthCount ?? 0;
  const lieCount = data?.lieCount ?? 0;
  const totalVotes = data?.total ?? truthCount + lieCount;
  const truthPct =
    totalVotes > 0 ? Math.round((truthCount / totalVotes) * 100) : 0;
  const liePct = totalVotes > 0 ? 100 - truthPct : 0;
  const leadingChoice =
    totalVotes > 0 ? (truthPct >= 50 ? "truth" : "lie") : null;
  const leadingPct = leadingChoice === "truth" ? truthPct : liePct;
  const trailingPct = leadingChoice === "truth" ? liePct : truthPct;
  const leadingLabel = leadingChoice === "truth" ? "Truth" : "Lie";
  const trailingLabel = leadingChoice === "truth" ? "Lie" : "Truth";
  const resultAccent =
    leadingChoice === "truth"
      ? {
          border: "rgba(255,255,255,0.26)",
          glow: "rgba(255,255,255,0.14)",
          iconBg: "rgba(255,255,255,0.12)",
          iconText: "#d4d4d8",
          gradient: "linear-gradient(90deg,#f8fafc,#d4d4d8,#67e8f9)",
          wash:
            "radial-gradient(circle at 18% -18%, rgba(255,255,255,0.2), transparent 42%), radial-gradient(circle at 88% 118%, rgba(56,189,248,0.12), transparent 38%), linear-gradient(180deg, rgba(8,18,14,0.98), rgba(3,4,3,0.99))",
        }
      : {
          border: "rgba(248,113,113,0.24)",
          glow: "rgba(248,113,113,0.13)",
          iconBg: "rgba(248,113,113,0.12)",
          iconText: "#fca5a5",
          gradient: "linear-gradient(90deg,#f87171,#fb7185,#fbbf24)",
          wash:
            "radial-gradient(circle at 18% -18%, rgba(248,113,113,0.18), transparent 42%), radial-gradient(circle at 88% 118%, rgba(251,191,36,0.1), transparent 38%), linear-gradient(180deg, rgba(18,9,10,0.98), rgba(3,4,3,0.99))",
        };

  useEffect(() => {
    if (!user?.id) return;
    subscribeToVotes(post.id, user.id);
    return () => unsubscribeFromVotes(post.id);
  }, [post.id, subscribeToVotes, unsubscribeFromVotes, user?.id]);

  const handleShareConversation = React.useCallback(async () => {
    const text = `${post.receiver.nickname} replied to ${post.challenger.nickname}'s truth\n\nQuestion: ${post.question}\n\nAnswer: ${answerText}`;

    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: "DARE truth reply",
          text,
        });
        return;
      }

      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setShareState("copied");
        window.setTimeout(() => setShareState("idle"), 1500);
      }
    } catch (error) {
      if ((error as { name?: string })?.name !== "AbortError") {
        console.warn("Unable to share truth conversation:", error);
      }
    }
  }, [
    answerText,
    post.challenger.nickname,
    post.question,
    post.receiver.nickname,
  ]);

  return (
    <div
      className="fixed inset-0 z-[30000] bg-[#030403] text-white"
      style={{ zIndex: 30000 }}
    >
      <style>{`
        @keyframes truthConversationIn {
          from { opacity: 0; transform: translateY(18px) scale(0.985); filter: blur(8px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes truthConversationBubbleIn {
          from { opacity: 0; transform: translateY(18px) scale(0.975); filter: blur(8px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes truthConversationTimeIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes truthConversationActionPop {
          0% { opacity: 0; transform: translateY(8px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .truth-conversation-screen {
          animation: truthConversationIn 0.42s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .truth-conversation-bubble {
          animation: truthConversationBubbleIn 0.52s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .truth-conversation-time-chip {
          animation: truthConversationTimeIn 0.42s cubic-bezier(0.16, 1, 0.3, 1) 0.08s both;
        }
        .truth-conversation-action {
          animation: truthConversationActionPop 0.46s cubic-bezier(0.16, 1, 0.3, 1) 0.22s both;
        }
      `}</style>

      <div
        className="truth-conversation-screen flex h-full flex-col overflow-hidden"
        style={{
          background:
            "radial-gradient(circle at 50% -12%, rgba(255,255,255,0.18), transparent 34%), radial-gradient(circle at 12% 22%, rgba(56,189,248,0.12), transparent 28%), linear-gradient(180deg,#07100d,#030403 62%,#010201)",
        }}
      >
        <div className="relative z-20 shrink-0 px-4 pb-3 pt-[calc(var(--safe-area-top)+10px)]">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.68),rgba(56,189,248,0.34),transparent)]" />
          <div className="relative flex min-h-[78px] items-center gap-3 overflow-hidden rounded-[26px] border border-white/8 bg-[radial-gradient(circle_at_18%_-28%,rgba(255,255,255,0.13),transparent_38%),radial-gradient(circle_at_92%_8%,rgba(56,189,248,0.08),transparent_34%),linear-gradient(180deg,rgba(6,8,6,0.96)_0%,rgba(10,15,10,0.94)_52%,rgba(3,4,3,0.98)_100%)] px-3.5 py-3 shadow-[0_18px_48px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.055)] backdrop-blur-2xl">
            <div className="pointer-events-none absolute inset-[1px] rounded-[25px] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),transparent_48%,rgba(0,0,0,0.16))]" />
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClose();
              }}
              aria-label="Back"
              className="app-pressable relative z-[1] flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/[0.045] text-[#cbd5e1] shadow-[0_12px_28px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.045)] backdrop-blur-xl"
              style={{ touchAction: "manipulation" }}
            >
              <ArrowLeft size={19} />
            </button>
            <div className="relative z-[1] min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      post.challengerId &&
                      onNavigateToProfile?.(post.challengerId)
                    }
                    className="rounded-full"
                    aria-label={`Open ${post.challenger.nickname}'s profile`}
                  >
                    <Avatar
                      src={post.challenger.avatar}
                      alt={post.challenger.nickname}
                      size={38}
                      fallbackText={post.challenger.nickname.charAt(0)}
                      style={{
                        border: "2px solid rgba(3,4,3,0.96)",
                        boxShadow:
                          "0 0 0 1px rgba(255,255,255,0.28), 0 10px 24px rgba(0,0,0,0.34)",
                      }}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      post.receiverId && onNavigateToProfile?.(post.receiverId)
                    }
                    className="rounded-full"
                    aria-label={`Open ${post.receiver.nickname}'s profile`}
                  >
                    <Avatar
                      src={post.receiver.avatar}
                      alt={post.receiver.nickname}
                      size={38}
                      fallbackText={post.receiver.nickname.charAt(0)}
                      style={{
                        border: "2px solid rgba(3,4,3,0.96)",
                        boxShadow:
                          "0 0 0 1px rgba(56,189,248,0.24), 0 10px 24px rgba(0,0,0,0.34)",
                      }}
                    />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[15px] font-black leading-tight text-white">
                    {post.receiver.nickname} answered
                  </h2>
                  <p className="mt-0.5 truncate text-[12px] font-bold text-[#94a3b8]">
                    Question from {post.challenger.nickname}
                  </p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleShareConversation}
              aria-label="Share truth conversation"
              className="app-pressable relative z-[1] flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full border border-[#f8fafc]/18 bg-[#f8fafc]/10 px-3 text-[#d4d4d8] shadow-[0_12px_30px_rgba(0,0,0,0.24)]"
            >
              {shareState === "copied" ? (
                <span className="text-[10px] font-black uppercase tracking-[0.12em]">
                  Copied
                </span>
              ) : (
                <Share2 size={16} />
              )}
            </button>
          </div>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(var(--safe-area-bottom)+22px)] pt-5"
          style={{
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
          }}
        >
          <div className="mx-auto flex max-w-[520px] flex-col gap-5 pb-4 pt-1">
            <div className="truth-conversation-time-chip flex justify-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.055] px-3.5 py-1.5 text-[11px] font-black text-[#cbd5e1] shadow-[0_14px_34px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
                <span>{conversationTime}</span>
              </div>
            </div>

            <div className="truth-conversation-bubble flex flex-col items-start gap-1.5">
              <div className="flex max-w-[86%] items-center gap-2.5 pl-1">
                <button
                  type="button"
                  onClick={() =>
                    post.challengerId &&
                    onNavigateToProfile?.(post.challengerId)
                  }
                  className="shrink-0 rounded-full"
                >
                  <Avatar
                    src={post.challenger.avatar}
                    alt={post.challenger.nickname}
                    size={38}
                    fallbackText={post.challenger.nickname.charAt(0)}
                    style={{
                      border: "2px solid rgba(255,255,255,0.42)",
                      boxShadow: "0 10px 26px rgba(0,0,0,0.34)",
                    }}
                  />
                </button>
                <span className="min-w-0 truncate text-sm font-black text-white/86">
                  {post.challenger.nickname}
                </span>
              </div>
              <div
                className="relative max-w-[92%] overflow-hidden rounded-[28px] rounded-tl-[10px] border border-white/10 p-4 shadow-[0_20px_54px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.08)]"
                style={{ background: theme.questionBubble }}
              >
                <span className="absolute -left-1 top-4 h-4 w-4 rotate-45 border-b border-l border-white/10 bg-[inherit]" />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-[-35%] blur-xl"
                  style={{
                    background:
                      "radial-gradient(circle at 22% 12%, rgba(255,255,255,0.16), transparent 34%), radial-gradient(circle at 80% 76%, rgba(255,255,255,0.14), transparent 36%)",
                  }}
                />
                <div className="relative z-[1]">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="rounded-full border border-white/10 bg-black/24 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/54">
                      Question
                    </span>
                  </div>
                  <p
                    className={`m-0 font-black text-white ${
                      isLongQuestion ? "text-[18px]" : "text-[20px]"
                    }`}
                    style={{
                      lineHeight: isLongQuestion ? 1.42 : 1.28,
                      overflowWrap: "anywhere",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {post.question}
                  </p>
                  <div className="truth-conversation-status mt-3 flex items-center justify-end gap-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/46">
                    <span>Asked</span>
                    <span className="text-[#d4d4d8]">&gt;&gt;</span>
                  </div>
                </div>
              </div>
            </div>

            <div
              className="truth-conversation-bubble flex flex-col items-end gap-1.5"
              style={{ animationDelay: "0.12s" }}
            >
              <div className="flex max-w-[86%] items-center justify-end gap-2.5 pr-1">
                <span className="min-w-0 truncate text-right text-sm font-black text-white/86">
                  {post.receiver.nickname}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    post.receiverId && onNavigateToProfile?.(post.receiverId)
                  }
                  className="shrink-0 rounded-full"
                >
                  <Avatar
                    src={post.receiver.avatar}
                    alt={post.receiver.nickname}
                    size={34}
                    fallbackText={post.receiver.nickname.charAt(0)}
                    style={{
                      border: "2px solid rgba(255,255,255,0.44)",
                      boxShadow: "0 10px 26px rgba(0,0,0,0.34)",
                    }}
                  />
                </button>
              </div>
              <div
                className="relative max-w-[92%] overflow-hidden rounded-[28px] rounded-tr-[10px] border border-[#f8fafc]/24 p-4 shadow-[0_20px_54px_rgba(0,0,0,0.34),0_0_42px_rgba(255,255,255,0.08),inset_0_1px_0_rgba(255,255,255,0.09)]"
                style={{ background: theme.answerBubble }}
              >
                <span className="absolute -right-1 top-4 h-4 w-4 rotate-45 border-r border-t border-[#f8fafc]/18 bg-[inherit]" />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-[-35%] blur-xl"
                  style={{
                    background:
                      "radial-gradient(circle at 78% 16%, rgba(255,255,255,0.18), transparent 34%), radial-gradient(circle at 14% 80%, rgba(56,189,248,0.12), transparent 34%)",
                  }}
                />
                <div className="relative z-[1]">
                  <p
                    className={`m-0 font-bold text-white/92 ${
                      isShortAnswer
                        ? "text-[22px] font-black"
                        : isMediumAnswer
                          ? "text-[19px] font-extrabold"
                          : isLongAnswer
                            ? "text-[16px]"
                            : "text-[17px]"
                    }`}
                    style={{
                      lineHeight: isShortAnswer
                        ? 1.34
                        : isMediumAnswer
                          ? 1.48
                          : isLongAnswer
                            ? 1.7
                            : 1.55,
                      overflowWrap: "anywhere",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {answerText}
                  </p>
                  <div className="truth-conversation-status mt-3 flex items-center justify-end gap-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#e5e7eb]/70">
                    <span>Replied</span>
                    <span
                      className={`relative ml-1 inline-flex h-3.5 w-5 items-center ${
                        userVote ? "text-[#d4d4d8]" : "text-[#a1a1aa]"
                      }`}
                    >
                      <span className="absolute left-[2px] top-0.5 h-2.5 w-1.5 rotate-45 border-b-2 border-r-2 border-current" />
                      <span className="absolute left-[8px] top-0.5 h-2.5 w-1.5 rotate-45 border-b-2 border-r-2 border-current" />
                    </span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {totalVotes > 0 && leadingChoice && (
          <div className="truth-conversation-action shrink-0 px-4 pb-[calc(var(--safe-area-bottom)+18px)] pt-0.5">
            <div
              className="relative mx-auto max-w-[520px] overflow-hidden rounded-[26px] border p-3.5 shadow-[0_20px_54px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.065)] backdrop-blur-2xl sm:p-4"
              style={{
                background: resultAccent.wash,
                borderColor: resultAccent.border,
                boxShadow: `0 20px 54px rgba(0,0,0,0.38), 0 0 42px ${resultAccent.glow}, inset 0 1px 0 rgba(255,255,255,0.065)`,
              }}
            >
              <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.28),transparent)]" />
              <div className="flex items-start gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border shadow-[0_12px_28px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.08)]"
                  style={{
                    background: resultAccent.iconBg,
                    borderColor: resultAccent.border,
                    color: resultAccent.iconText,
                  }}
                >
                  <Sparkles size={17} strokeWidth={2.6} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="m-0 text-[10px] font-black uppercase text-white/46">
                      Room verdict
                    </p>
                    <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.055] px-2.5 py-0.5 text-[9.5px] font-black uppercase text-[#cbd5e1]">
                      {totalVotes.toLocaleString()} votes
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p
                        className="m-0 text-[34px] font-black leading-none text-white sm:text-[40px]"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {leadingPct}%
                      </p>
                      <p className="mt-0.5 text-[13px] font-black leading-tight text-white/92">
                        users think this is {leadingLabel.toLowerCase()}
                      </p>
                    </div>
                    <div className="shrink-0 rounded-[14px] border border-white/8 bg-black/20 px-2.5 py-1.5 text-right">
                      <p className="m-0 text-[9px] font-black uppercase text-white/38">
                        Other side
                      </p>
                      <p className="m-0 mt-0.5 text-[13px] font-black text-white/78">
                        {trailingPct}% {trailingLabel}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30 shadow-[inset_0_1px_3px_rgba(0,0,0,0.42)]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${leadingPct}%`,
                        background: resultAccent.gradient,
                        boxShadow: `0 0 24px ${resultAccent.glow}`,
                      }}
                    />
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <div className="rounded-[14px] border border-[#f8fafc]/14 bg-[#f8fafc]/[0.055] px-2.5 py-1.5">
                      <p className="m-0 text-[9px] font-black uppercase text-[#e5e7eb]/54">
                        Truth
                      </p>
                      <p className="m-0 text-[12px] font-black text-[#e5e7eb]">
                        {truthPct}%
                      </p>
                    </div>
                    <div className="rounded-[14px] border border-[#f87171]/14 bg-[#f87171]/[0.055] px-2.5 py-1.5">
                      <p className="m-0 text-[9px] font-black uppercase text-[#fecaca]/54">
                        Lie
                      </p>
                      <p className="m-0 text-[12px] font-black text-[#fecaca]">
                        {liePct}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface SwipeableTruthCardProps {
  post: TruthPost;
  onVoteClick: (post: TruthPost, choice: "truth" | "lie") => void;
  onOpenVoteModal: (post: TruthPost, tab: "truth" | "lie" | "comments") => void;
  onOpenConversation?: (post: TruthPost) => void;
  cardIndex: number;
  currentIndex: number;
  isDragging?: boolean;
  isCurrentCard?: boolean;
  lockInternalScroll?: boolean;
  compactTopInset?: boolean;
  onNavigateToProfile?: (userId: string) => void;
}

export const SwipeableTruthCard = React.memo(function SwipeableTruthCard({
  post,
  onVoteClick,
  onOpenVoteModal,
  onOpenConversation,
  cardIndex,
  currentIndex,
  isDragging = false,
  isCurrentCard,
  lockInternalScroll = false,
  compactTopInset = false,
  onNavigateToProfile,
}: SwipeableTruthCardProps) {
  const { user } = useAuthStore();
  const {
    getUserVote,
    setUserVote,
    voteData,
    subscribeToVotes,
    unsubscribeFromVotes,
  } = useTruthInteractionStore();

  // Initialise from persistent storage — if previously voted, jump straight to voted state
  const priorVote = getUserVote(post.id);
  const [vote, setVote] = useState<"truth" | "lie" | null>(priorVote);
  const [phase, setPhase] = useState<"idle" | "confirming" | "voted">(
    priorVote ? "voted" : "idle",
  );
  const [exiting, setExiting] = useState(false);
  const lastConversationTapRef = useRef(0);
  const conversationTapStartRef = useRef<{ x: number; y: number } | null>(null);
  const isActive = isCurrentCard ?? cardIndex === currentIndex;
  const useNativeReelLayout = lockInternalScroll;
  const shouldRunPremiumMotion =
    isActive && !isDragging && !useNativeReelLayout;
  const reduceMotionDuringDrag = isDragging;
  const truthBackground = getTruthCardBackgroundTheme(post.id);
  const interactionData = voteData[post.id];
  const answerText = getTruthAnswerText(post);
  const showAnswer = answerText.length > 0;
  const suspenseAnswerPreview = getTruthAnswerPreview(answerText);
  const renderablePoll =
    !showAnswer && hasRenderablePoll(post.poll) ? post.poll : null;
  const pollTotalVotes = renderablePoll ? getSafePollTotal(renderablePoll) : 0;
  const truthAvatarRingStyle: React.CSSProperties = {
    padding: "3px",
    borderRadius: "50%",
    background:
      "linear-gradient(135deg, #4ade80, #16a34a)",
    boxShadow:
      "0 0 16px rgba(74,222,128,0.3), inset 0 1px 0 rgba(255,255,255,0.18)",
  };

  useEffect(() => {
    if (!isActive || !user?.id) return;
    subscribeToVotes(post.id, user.id);
    return () => {
      unsubscribeFromVotes(post.id);
    };
  }, [
    isActive,
    post.id,
    user?.id,
    subscribeToVotes,
    unsubscribeFromVotes,
  ]);

  useEffect(() => {
    const storedVote = getUserVote(post.id);
    setVote(storedVote);
    setPhase(storedVote ? "voted" : "idle");
  }, [getUserVote, post.id]);

  // Truth cards keep their two answer actions available immediately.
  const showVoteGate = false;
  const voteGateCountdownLabel = "";
  const handleSkipVoteGate = () => undefined;

  const handleVote = (choice: "truth" | "lie") => {
    if (phase !== "idle" || exiting) return;
    setExiting(true);
    setTimeout(() => {
      setVote(choice);
      setExiting(false);
      setPhase("confirming");
    }, 260);
  };

  const handleConfirm = () => {
    if (vote) {
      setUserVote(post.id, vote);
      onVoteClick(post, vote);
    }
    setPhase("voted");
  };
  const handleOpenVotedStateModal = () => {
    if (vote) onOpenVoteModal(post, vote);
  };


  const handleConversationPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!isActive || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }
    conversationTapStartRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
  };

  const handleConversationPointerUp = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!isActive || !onOpenConversation) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest("button,a,input,textarea,select")) {
      lastConversationTapRef.current = 0;
      conversationTapStartRef.current = null;
      return;
    }

    const start = conversationTapStartRef.current;
    conversationTapStartRef.current = null;
    if (!start) return;

    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved > 12) {
      lastConversationTapRef.current = 0;
      return;
    }

    const now = Date.now();
    if (now - lastConversationTapRef.current <= 320) {
      lastConversationTapRef.current = 0;
      onOpenConversation(post);
      return;
    }

    lastConversationTapRef.current = now;
  };

  const offset = cardIndex - currentIndex;
  const translateY = offset === 0 ? "0%" : offset < 0 ? "-105%" : "105%";
  const isNearby = Math.abs(offset) <= 1;
  const opacity = useNativeReelLayout || isNearby ? 1 : 0;

  return (
    <div
      className="truth-card-slide"
      data-truth-card-active={isActive ? "true" : undefined}
      onPointerDown={handleConversationPointerDown}
      onPointerUp={handleConversationPointerUp}
      style={{
        position: useNativeReelLayout ? "relative" : "absolute",
        inset: useNativeReelLayout ? undefined : 0,
        width: "100%",
        height: "100%",
        transform: useNativeReelLayout
          ? "translate3d(0,0,0)"
          : `translate3d(0, calc(${translateY} + var(--truth-drag-y, 0px)), 0)`,
        opacity,
        transition: useNativeReelLayout || isDragging
          ? "none"
          : "transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.16s ease-out",
        pointerEvents: isActive ? "auto" : "none",
        willChange: useNativeReelLayout ? "auto" : isNearby ? "transform" : "auto",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        perspective: 1000,
        contain: "layout paint style",
        isolation: "isolate",
        zIndex: isActive ? 2 : offset > 0 ? 1 : 0,
        padding: compactTopInset
          ? "12px 0 16px"
          : "calc(var(--safe-area-top) + 18px) 0 16px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        @keyframes truthGlow {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.06); }
        }
        @keyframes expandBtn { from { opacity:0.72;transform:translate3d(0,5px,0) scale(0.97);} to {opacity:1;transform:translate3d(0,0,0) scale(1);} }
        .truth-vote-btn,
        .lie-vote-btn {
          transition:
            transform 180ms cubic-bezier(0.22,1,0.36,1),
            box-shadow 240ms ease,
            opacity 180ms ease;
          will-change: transform, opacity;
        }
        .truth-vote-btn:active,
        .lie-vote-btn:active {
          transform: translate3d(0,1px,0) scale(0.965);
          transition-duration: 80ms;
        }
        @keyframes truthButtonPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0), inset 0 1px 0 rgba(255,255,255,0.08); opacity: .78; }
          15% { box-shadow: 0 0 22px 6px rgba(255,255,255,0.16), inset 0 1px 0 rgba(255,255,255,0.14); opacity: 1; }
          35%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0), inset 0 1px 0 rgba(255,255,255,0.08); opacity: .78; }
        }
        @keyframes lieButtonPulse {
          0%, 55% { box-shadow: 0 0 0 0 rgba(255,255,255,0), inset 0 1px 0 rgba(255,255,255,0.08); opacity: .78; }
          70% { box-shadow: 0 0 22px 6px rgba(255,255,255,0.16), inset 0 1px 0 rgba(255,255,255,0.14); opacity: 1; }
          88%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0), inset 0 1px 0 rgba(255,255,255,0.08); opacity: .78; }
        }
        .truth-vote-btn, .lie-vote-btn { position: relative; overflow: hidden; }
        .truth-vote-btn::before, .lie-vote-btn::before {
          content: ""; position: absolute; inset: 0; pointer-events: none;
          background: radial-gradient(circle at 50% 0%, rgba(255,255,255,.18), transparent 58%);
          opacity: .36;
        }
        .truth-vote-btn { animation: truthButtonPulse 6s ease-in-out infinite; }
        .lie-vote-btn { animation: lieButtonPulse 6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .truth-vote-btn, .lie-vote-btn { animation: none !important; } }
        .truth-reel-is-scrolling [data-truth-premium-motion="true"] {
          display: none !important;
          animation: none !important;
        }
        .truth-reel-is-scrolling .truth-card-slide,
        .truth-reel-is-scrolling .pop-truth-card-shell,
        .truth-reel-is-scrolling .pop-truth-question-card,
        .truth-reel-is-scrolling .pop-truth-answer-card,
        .truth-reel-is-scrolling .pop-truth-vote-area {
          transition: none !important;
          animation: none !important;
          filter: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }
        .truth-reel-is-scrolling .pop-truth-card-shell,
        .truth-reel-is-scrolling .pop-truth-question-card,
        .truth-reel-is-scrolling .pop-truth-answer-card,
        .truth-reel-is-scrolling .truth-vote-btn,
        .truth-reel-is-scrolling .lie-vote-btn {
          box-shadow: none !important;
        }
        .truth-reel-is-scrolling .truth-vote-btn,
        .truth-reel-is-scrolling .lie-vote-btn {
          animation: none !important;
          box-shadow: none !important;
          transition: none !important;
        }
        @keyframes btnPulseTruth {
          0%,100%{opacity:0.88}
          16%{opacity:1}
          34%{opacity:0.94}
          52%{opacity:0.88}
        }
        @keyframes btnPulseLie {
          0%,52%,100%{opacity:0.82}
          72%{opacity:1}
          88%{opacity:0.9}
        }
        @keyframes questionReveal {
          from { opacity:0; transform: translate3d(0,10px,0) scale(0.985); }
          to   { opacity:1; transform: translate3d(0,0,0) scale(1); }
        }
        @keyframes answerReveal {
          from { opacity:0; transform: translate3d(0,12px,0) scale(0.985); }
          to   { opacity:1; transform: translate3d(0,0,0) scale(1); }
        }
        @keyframes truthBubbleAura {
          0%, 100% { opacity: 0.18; transform: translate3d(-6%, -4%, 0) scale(1); }
          50% { opacity: 0.34; transform: translate3d(4%, 3%, 0) scale(1.06); }
        }
        .truth-scroll::-webkit-scrollbar { display:none; }
      `}</style>

      {/* Card shell */}
      <div
        className="pop-truth-card-shell"
        style={{
          flex: 1,
          position: "relative",
          borderRadius: "32px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background:
            "radial-gradient(circle at 50% -18%, rgba(255,255,255,0.07), transparent 34%), radial-gradient(circle at 96% 8%, rgba(56,189,248,0.08), transparent 30%), linear-gradient(180deg, rgba(16,18,20,0.98), rgba(5,6,8,0.99))",
          boxShadow: reduceMotionDuringDrag
            ? "0 12px 34px rgba(0,0,0,0.72)"
            : shouldRunPremiumMotion
              ? truthBackground.activeShadow
              : "0 8px 32px rgba(0,0,0,0.7)",
          transition: shouldRunPremiumMotion ? "box-shadow 0.35s ease" : "none",
          transform: "translateZ(0)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: truthBackground.texture,
            backgroundSize: "100% 100%, 100% 100%, 100% 100%",
            opacity: shouldRunPremiumMotion ? 0.56 : 0.2,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: truthBackground.wash,
            opacity: shouldRunPremiumMotion ? 0.44 : 0.16,
            mixBlendMode: shouldRunPremiumMotion ? "screen" : "normal",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0.2))",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -120px 160px rgba(0,0,0,0.58), inset 0 120px 160px rgba(74,222,128,0.035)",
            pointerEvents: "none",
          }}
        />
        {/* Scrollable content */}
        <div
          className="truth-scroll"
          data-truth-scroll="true"
          style={{
            flex: 1,
            overflowY: lockInternalScroll ? "hidden" : "auto",
            padding: "28px 22px 12px",
            WebkitOverflowScrolling: lockInternalScroll ? undefined : "touch",
            overscrollBehavior: lockInternalScroll ? "none" : "contain",
            touchAction: "pan-y",
            position: "relative",
            zIndex: 1,
            pointerEvents: lockInternalScroll ? "none" : undefined,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* "TRUTH OR LIE" label */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              marginBottom: "22px",
            }}
          >
            <div
              style={{
                height: "1px",
                flex: 1,
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.24))",
              }}
            />
            <span
              style={{
                color: "#a7f3d0",
                fontWeight: 900,
                fontSize: "11px",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                opacity: 0.75,
                textShadow: "0 0 18px rgba(74,222,128,0.18)",
              }}
            >
              Truth or Lie
            </span>
            <div
              style={{
                height: "1px",
                flex: 1,
                background:
                  "linear-gradient(90deg, rgba(74,222,128,0.2), transparent)",
              }}
            />
          </div>

          {/* Avatars + names */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0px",
              marginBottom: "26px",
            }}
          >
            {/* Challenger */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <div
                style={truthAvatarRingStyle}
              >
                <PostAvatar
                  src={post.challenger.avatar}
                  name={post.challenger.nickname}
                  size={52}
                  style={{ display: "block", border: "2px solid #111" }}
                />
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onNavigateToProfile && post.challengerId) {
                    onNavigateToProfile(post.challengerId);
                  }
                }}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "rgba(255,255,255,0.9)",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: onNavigateToProfile ? "pointer" : "default",
                  textDecoration: "none",
                }}
              >
                {post.challenger.nickname.split(" ")[0]}
              </button>
            </div>

            {/* Center "asked" badge */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "4px",
                padding: "0 16px",
                zIndex: 1,
              }}
            >
              <div
                style={{
                  background:
                    "linear-gradient(135deg, rgba(74,222,128,0.18), rgba(34,197,94,0.1))",
                  border: "1px solid rgba(74,222,128,0.28)",
                  borderRadius: "99px",
                  padding: "5px 14px",
                  boxShadow:
                    "0 10px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)",
                }}
              >
                <span
                  style={{
                    color: "#4ade80",
                    fontWeight: 800,
                    fontSize: "12px",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    animation: shouldRunPremiumMotion
                      ? "truthGlow 3s ease-in-out infinite"
                      : "none",
                    display: "inline-block",
                  }}
                >
                  asked
                </span>
              </div>
            </div>

            {/* Receiver */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <div
                style={truthAvatarRingStyle}
              >
                <PostAvatar
                  src={post.receiver.avatar}
                  name={post.receiver.nickname}
                  size={52}
                  style={{ display: "block", border: "2px solid #111" }}
                />
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onNavigateToProfile && post.receiverId) {
                    onNavigateToProfile(post.receiverId);
                  }
                }}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "rgba(255,255,255,0.9)",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: onNavigateToProfile ? "pointer" : "default",
                  textDecoration: "none",
                }}
              >
                {post.receiver.nickname.split(" ")[0]}
              </button>
            </div>
          </div>

          {/* Question block */}
          <div
            className="pop-truth-question-card"
            style={{
              position: "relative",
              borderRadius: "26px 26px 26px 12px",
              padding: "17px 17px 19px",
              marginBottom: showAnswer ? "24px" : "12px",
              marginRight: "28px",
              background: truthBackground.questionBubble,
              border: "1px solid rgba(74,222,128,0.16)",
              boxShadow:
                "0 16px 38px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -28px 60px rgba(74,222,128,0.035)",
              overflow: "hidden",
              isolation: "isolate",
              animation: "none",
            }}
          >
            <span
              data-truth-premium-motion="true"
              aria-hidden="true"
              style={{
                display: "block",
                position: "absolute",
                inset: "-40% -25%",
                zIndex: 0,
                background:
                  "radial-gradient(circle at 24% 20%, rgba(255,255,255,0.14), transparent 34%), radial-gradient(circle at 70% 72%, rgba(74,222,128,0.1), transparent 34%)",
                filter: "blur(10px)",
                opacity: shouldRunPremiumMotion ? 0.24 : 0.12,
                animation:
                  shouldRunPremiumMotion
                    ? "truthBubbleAura 7s ease-in-out 0.8s infinite"
                    : "none",
                willChange: shouldRunPremiumMotion
                  ? "transform, opacity"
                  : "auto",
                pointerEvents: "none",
              }}
              />
              <div
                style={{
                  position: "relative",
                zIndex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
                marginBottom: "10px",
              }}
            >
              <span
                style={{
                  color: "#d4d4d8",
                  fontSize: "10px",
                  fontWeight: 900,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                The question
              </span>
              <span
                style={{
                  minWidth: 0,
                  color: "rgba(255,255,255,0.32)",
                  fontSize: "11px",
                  fontWeight: 700,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {post.challenger.nickname.split(" ")[0]}
              </span>
            </div>
            <p
              style={{
                position: "relative",
                zIndex: 1,
                color: "#fff",
                fontWeight: 950,
                fontSize: post.question.length > 120 ? "19px" : "22px",
                lineHeight: post.question.length > 120 ? 1.4 : 1.3,
                textAlign: "left",
                margin: 0,
                letterSpacing: "0",
                textShadow: "0 10px 26px rgba(0,0,0,0.34)",
                overflowWrap: "anywhere",
                display: "-webkit-box",
                WebkitLineClamp: post.question.length > 160 ? 4 : 5,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {post.question}
            </p>
          </div>

          {/* Poll or answer */}
          {renderablePoll ? (
            <div style={{ marginBottom: "8px" }}>
              {renderablePoll.options.map((option, index) => {
                const votes = getPollOptionVoteCount(renderablePoll, option);
                const percentage = getPollPercentage(votes, pollTotalVotes);
                const leadingPercentage = Math.max(
                  ...renderablePoll.options.map((o) =>
                    getPollPercentage(
                      getPollOptionVoteCount(renderablePoll, o),
                      pollTotalVotes,
                    ),
                  ),
                );
                const isLeading =
                  percentage > 0 && percentage === leadingPercentage;
                return (
                  <div
                    key={`${post.id}-option-${index}`}
                    style={{ marginBottom: "12px" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "7px",
                      }}
                    >
                      <span
                        style={{
                          color: isLeading ? "#fff" : "rgba(255,255,255,0.6)",
                          fontSize: "14px",
                          fontWeight: isLeading ? 700 : 500,
                        }}
                      >
                        {option}
                      </span>
                      <span
                        style={{
                          color: isLeading
                            ? "#4ade80"
                            : "rgba(255,255,255,0.4)",
                          fontSize: "14px",
                          fontWeight: 800,
                        }}
                      >
                        {percentage}%
                      </span>
                    </div>
                    <div
                      style={{
                        height: "6px",
                        borderRadius: "99px",
                        background: "rgba(255,255,255,0.07)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${percentage}%`,
                          background: isLeading
                            ? "linear-gradient(90deg, #4ade80, #22c55e)"
                            : "rgba(255,255,255,0.2)",
                          borderRadius: "99px",
                          transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              <p
                style={{
                  color: "rgba(255,255,255,0.25)",
                  fontSize: "12px",
                  textAlign: "center",
                  margin: "8px 0 0",
                }}
              >
                {pollTotalVotes.toLocaleString()} votes
              </p>
            </div>
          ) : showAnswer ? (
            <div
              className="pop-truth-answer-card"
              style={{
                position: "relative",
                borderRadius: "26px 26px 12px 26px",
                padding: "15px 15px 14px",
                marginTop: "4px",
                marginBottom: "14px",
                marginLeft: "28px",
                background: truthBackground.answerBubble,
                border: "1px solid rgba(74,222,128,0.2)",
                boxShadow:
                  "0 14px 34px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.06)",
                overflow: "hidden",
                isolation: "isolate",
                animation: "none",
              }}
            >
              <span
                data-truth-premium-motion="true"
                aria-hidden="true"
                style={{
                  display: "none",
                  position: "absolute",
                  inset: "-42% -24%",
                zIndex: 0,
                background:
                    "radial-gradient(circle at 76% 20%, rgba(255,255,255,0.12), transparent 34%), radial-gradient(circle at 18% 74%, rgba(74,222,128,0.11), transparent 34%)",
                  filter: "blur(10px)",
                  opacity: shouldRunPremiumMotion ? 0.22 : 0.1,
                  animation:
                    shouldRunPremiumMotion
                      ? "truthBubbleAura 7.6s ease-in-out 1.1s infinite"
                      : "none",
                  willChange: shouldRunPremiumMotion
                    ? "transform, opacity"
                    : "auto",
                  pointerEvents: "none",
                }}
              />
              <span
                data-truth-premium-motion="true"
                aria-hidden="true"
                style={{
                  display: "none",
                  position: "absolute",
                  inset: 0,
                  borderRadius: "inherit",
                  padding: "2px",
                  background:
                    "linear-gradient(110deg, rgba(255,255,255,0.04), rgba(74,222,128,0.86), rgba(34,197,94,0.66), rgba(16,185,129,0.58), rgba(255,255,255,0.08), rgba(167,243,208,0.5), rgba(74,222,128,0.18), rgba(255,255,255,0.04))",
                  backgroundSize: "240% 100%",
                  WebkitMask:
                    "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                  WebkitMaskComposite: "xor",
                  maskComposite: "exclude",
                  animation: shouldRunPremiumMotion
                    ? "answerBorderTrace 3.8s ease-in-out infinite"
                    : "none",
                  transform: "translateZ(0)",
                  willChange: "opacity",
                  pointerEvents: "none",
                  zIndex: 1,
                }}
              />
              <span
                data-truth-premium-motion="true"
                aria-hidden="true"
                style={{
                  display: "none",
                  position: "absolute",
                  inset: "1px",
                  borderRadius: "inherit",
                  border: "1px solid rgba(74,222,128,0.24)",
                  boxShadow:
                    "0 0 0 1px rgba(74,222,128,0.24), 0 0 24px rgba(74,222,128,0.18), inset 0 0 18px rgba(74,222,128,0.09)",
                  animation: shouldRunPremiumMotion
                    ? "answerBorderGlow 2.6s ease-in-out infinite"
                    : "none",
                  transform: "translateZ(0)",
                  willChange: "opacity",
                  pointerEvents: "none",
                  zIndex: 1,
                }}
              />
              <div
                style={{
                  position: "relative",
                  zIndex: 2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  marginBottom: "12px",
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    minWidth: 0,
                    color: "#e5e7eb",
                    fontSize: "11px",
                    fontWeight: 950,
                    letterSpacing: "0.09em",
                    textTransform: "uppercase",
                  }}
                >
                  Answered
                </div>
                <button
                  type="button"
                  aria-label="Reveal full reply"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenConversation?.(post);
                  }}
                  style={{
                    height: "32px",
                    minWidth: "78px",
                    padding: "0 12px",
                    borderRadius: "999px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "5px",
                    color: "#d4d4d8",
                    background:
                      "linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.075))",
                    border: "1px solid rgba(255,255,255,0.24)",
                    boxShadow:
                      "0 10px 22px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.08)",
                    fontSize: "10px",
                    fontWeight: 950,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    cursor: onOpenConversation ? "pointer" : "default",
                    flexShrink: 0,
                    pointerEvents: "auto",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <Eye size={13} strokeWidth={2.8} />
                  Reveal
                </button>
              </div>
              <div
                style={{
                  position: "relative",
                  zIndex: 2,
                  display: "flex",
                  gap: "12px",
                  alignItems: "center",
                }}
              >
                <PostAvatar
                  src={post.receiver.avatar}
                  name={post.receiver.nickname}
                  size={36}
                  style={{ flexShrink: 0 }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p
                    style={{
                      color: "#fff",
                      fontSize:
                        suspenseAnswerPreview.length <= 16 ? "22px" : "19px",
                      lineHeight: 1.18,
                      margin: 0,
                      fontWeight: 950,
                      letterSpacing: "0",
                      overflowWrap: "anywhere",
                      textShadow: "0 12px 28px rgba(0,0,0,0.34)",
                    }}
                  >
                    {suspenseAnswerPreview}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

        </div>

        {/* Bottom vote area */}
        <div
          className="pop-truth-vote-area"
          style={{
            padding: "14px 20px 22px",
            background:
              "linear-gradient(180deg, rgba(2,4,3,0.58), rgba(2,4,3,0.94))",
            backdropFilter: shouldRunPremiumMotion ? "blur(12px)" : "none",
            WebkitBackdropFilter: shouldRunPremiumMotion
              ? "blur(12px)"
              : "none",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            flexShrink: 0,
            position: "relative",
            zIndex: 1,
          }}
        >
          {/* Micro-hint */}
          {phase === "idle" && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", margin: "0 0 12px" }}>
              <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "11px", textAlign: "center", margin: 0, letterSpacing: "0.04em" }}>
                {showVoteGate ? "Watch before you vote." : "Call it."}
              </p>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenVoteModal(post, vote === "lie" ? "lie" : "truth");
                }}
                aria-label="See who voted"
                style={{ display: "flex", alignItems: "center", padding: 0, border: 0, background: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer" }}
              >
                {(interactionData?.truthVoters || []).concat(interactionData?.lieVoters || []).slice(0, 5).map((voter, index) => (
                  <Avatar key={voter.id} src={voter.avatarUrl} alt={voter.displayName} size={22} fallbackText={voter.displayName.charAt(0)} userId={voter.ouserId} username={voter.username} disableRealtime className="-ml-1.5 first:ml-0 shrink-0 ring-2 ring-[#101214]" style={{ zIndex: 5 - index }} />
                ))}
                {interactionData?.total && interactionData.total > 5 ? <span style={{ marginLeft: "7px", fontSize: "10px", fontWeight: 900 }}>+{interactionData.total - 5}</span> : null}
              </button>
            </div>
          )}

          {showVoteGate ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: "10px",
                alignItems: "stretch",
              }}
            >
              <div
                aria-label={`Voting opens in ${voteGateCountdownLabel}`}
                style={{
                  minHeight: "58px",
                  borderRadius: "18px",
                  border: "1px solid rgba(255,255,255,0.18)",
                  background:
                    "linear-gradient(135deg, rgba(255,255,255,0.1), rgba(56,189,248,0.07)), rgba(255,255,255,0.035)",
                  boxShadow:
                    "0 14px 34px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.06)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  color: "#e5e7eb",
                  padding: "0 16px",
                  overflow: "hidden",
                }}
              >
                <Clock size={18} strokeWidth={2.6} />
                <span
                  style={{
                    fontSize: "20px",
                    fontWeight: 950,
                    letterSpacing: "0.03em",
                    fontVariantNumeric: "tabular-nums",
                    lineHeight: 1,
                  }}
                >
                  {voteGateCountdownLabel}
                </span>
                <span
                  style={{
                    color: "rgba(255,255,255,0.42)",
                    fontSize: "10px",
                    fontWeight: 900,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}
                >
                  to vote
                </span>
              </div>
              <button
                type="button"
                onClick={handleSkipVoteGate}
                style={{
                  minHeight: "58px",
                  minWidth: "86px",
                  padding: "0 16px",
                  borderRadius: "18px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.045))",
                  color: "rgba(255,255,255,0.86)",
                  fontSize: "13px",
                  fontWeight: 950,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  boxShadow:
                    "0 12px 28px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.08)",
                }}
              >
                Skip
              </button>
            </div>
          ) : phase === "idle" ? (
            <div
              style={{
                display: "flex",
                gap: "10px",
                opacity: exiting ? 0 : 1,
                transform: exiting
                  ? "scale(0.93) translateY(5px)"
                  : "scale(1) translateY(0)",
                transition: "opacity 0.22s ease, transform 0.22s ease",
              }}
            >
              <button
                className="truth-vote-btn"
                onClick={() => handleVote("truth")}
                style={{
                  flex: 1,
                  padding: "17px",
                  borderRadius: "18px",
                  border: "1px solid rgba(74,222,128,0.25)",
                  background: "rgba(74,222,128,0.08)",
                  color: "rgba(74,222,128,0.9)",
                  fontWeight: 900,
                  fontSize: "16px",
                  cursor: "pointer",
                  letterSpacing: "0.02em",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  boxShadow: "0 9px 26px rgba(74,222,128,0.18)",
                  animation: shouldRunPremiumMotion
                    ? "truthButtonPulse 6s ease-in-out infinite"
                    : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "7px",
                }}
              >
                <span style={{ fontSize: "18px" }}>T</span> Truth
              </button>
              <button
                className="lie-vote-btn"
                onClick={() => handleVote("lie")}
                style={{
                  flex: 1,
                  padding: "17px",
                  borderRadius: "18px",
                  border: "1px solid rgba(255,80,80,0.25)",
                  background: "rgba(255,80,80,0.08)",
                  color: "rgba(255,160,160,0.9)",
                  fontWeight: 900,
                  fontSize: "16px",
                  cursor: "pointer",
                  letterSpacing: "0.02em",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  boxShadow: "0 9px 24px rgba(255,80,80,0.14)",
                  animation: shouldRunPremiumMotion
                    ? "lieButtonPulse 6s ease-in-out infinite"
                    : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "7px",
                }}
              >
                <span style={{ fontSize: "18px" }}>L</span> Lie
              </button>
            </div>
          ) : phase === "confirming" ? (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <button
                onClick={handleConfirm}
                style={{
                  width: "80%",
                  padding: "17px",
                  borderRadius: "18px",
                  border:
                    vote === "lie" ? "1px solid rgba(255,80,80,0.3)" : "none",
                  background:
                    vote === "truth" ? "#4ade80" : "rgba(255,80,80,0.12)",
                  color: vote === "truth" ? "#000" : "rgba(255,160,160,0.9)",
                  fontWeight: 900,
                  fontSize: "16px",
                  cursor: "pointer",
                  textAlign: "center",
                  animation:
                    "expandBtn 0.34s cubic-bezier(0.22,1,0.36,1) forwards",
                  boxShadow:
                    vote === "truth"
                      ? "0 10px 24px rgba(74,222,128,0.28)"
                      : "none",
                  letterSpacing: "0.02em",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  transition:
                    "transform 160ms cubic-bezier(0.22,1,0.36,1), box-shadow 220ms ease, opacity 160ms ease",
                }}
              >
                {vote === "truth"
                  ? "You think this is truth"
                  : "You think this is a lie"}
              </button>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                padding: "17px",
                borderRadius: "18px",
                background:
                  vote === "truth"
                    ? "rgba(74,222,128,0.1)"
                    : "rgba(255,80,80,0.08)",
                border:
                  vote === "truth"
                    ? "1px solid rgba(74,222,128,0.3)"
                    : "1px solid rgba(255,80,80,0.2)",
              }}
            >
              <button
                onClick={handleOpenVotedStateModal}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color:
                    vote === "truth" ? "#4ade80" : "rgba(255,160,160,0.85)",
                  fontWeight: 800,
                  fontSize: "16px",
                  letterSpacing: "0.02em",
                  cursor: "pointer",
                }}
              >
                {vote === "truth"
                  ? "You think this is truth"
                  : "You think this is a lie"}
              </button>
              <span
                style={{
                  color: "rgba(255,255,255,0.25)",
                  fontSize: "12px",
                  marginLeft: "auto",
                }}
              >
                tap to see results
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// ─── TruthCard (feed view) ────────────────────────────────────────────────────
interface TruthCardProps {
  post: TruthPost;
  onVoteClick: (post: TruthPost, choice: "truth" | "lie") => void;
}
export function TruthCard({ post, onVoteClick }: TruthCardProps) {
  const { getUserVote, setUserVote } = useTruthInteractionStore();

  // Initialise from persistent storage — if previously voted, jump straight to voted state
  const priorVote = getUserVote(post.id);
  const [vote, setVote] = useState<"truth" | "lie" | null>(priorVote);
  const [phase, setPhase] = useState<"idle" | "confirming" | "voted">(
    priorVote ? "voted" : "idle",
  );

  const handleVote = (choice: "truth" | "lie") => {
    if (phase !== "idle") return;
    setVote(choice);
    setPhase("confirming");
  };

  const handleConfirm = () => {
    if (vote) {
      setUserVote(post.id, vote);
      onVoteClick(post, vote);
    }
    setPhase("voted");
  };
  const truthBackground = getTruthCardBackgroundTheme(post.id);
  const answerText = getTruthAnswerText(post);
  const showAnswer = answerText.length > 0;
  const suspenseAnswerPreview = getTruthAnswerPreview(answerText);
  const renderablePoll =
    !showAnswer && hasRenderablePoll(post.poll) ? post.poll : null;
  const pollTotalVotes = renderablePoll ? getSafePollTotal(renderablePoll) : 0;

  return (
    <div
      className="rounded-2xl p-4 mb-4 border card transition-all duration-300 w-full overflow-hidden"
      style={{
        WebkitTapHighlightColor: "transparent",
        outline: "none",
        background: truthBackground.legacyShell,
        borderColor: "rgba(255,255,255,0.08)",
        boxShadow:
          "0 18px 44px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.055)",
        padding: "16px",
      }}
    >
      <InteractionReceipt id={post.id} table="truths" />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "14px",
          flexWrap: "nowrap",
          overflow: "hidden",
        }}
      >
        <PostAvatar
          src={post.challenger.avatar}
          name={post.challenger.nickname}
          size={52}
        />
        <span
          style={{
            color: "#fff",
            fontWeight: 700,
            fontSize: "18px",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {post.challenger.nickname.split(" ")[0]}
        </span>
        <span
          style={{
            color: "#4ade80",
            fontWeight: 700,
            fontSize: "18px",
            whiteSpace: "nowrap",
            flexShrink: 0,
            animation: "truthFade 3s ease-in-out infinite",
          }}
        >
          asked
        </span>
        <PostAvatar
          src={post.receiver.avatar}
          name={post.receiver.nickname}
          size={52}
        />
        <span
          style={{
            color: "#fff",
            fontWeight: 700,
            fontSize: "18px",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {post.receiver.nickname.split(" ")[0]}
        </span>
      </div>
      <p className="text-white text-lg">
        to say <span className="text-white font-bold text-lg">the</span>{" "}
        <span
          className="text-[#4ade80] font-bold text-lg"
          style={{ animation: "truthFade 3s ease-in-out infinite" }}
        >
          TRUTH
        </span>{" "}
        about
      </p>
      <div
        className="rounded-xl p-5 mt-2 mb-4"
        style={{
          background: truthBackground.legacyQuestion,
          border: "1px solid rgba(74,222,128,0.16)",
          boxShadow:
            "0 14px 34px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.055)",
        }}
      >
        <p
          className="text-white font-black text-lg leading-snug"
          style={{
            overflowWrap: "anywhere",
            display: "-webkit-box",
            WebkitLineClamp: post.question.length > 160 ? 4 : 5,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            textShadow: "0 10px 24px rgba(0,0,0,0.3)",
          }}
        >
          {post.question}
        </p>
      </div>
      {renderablePoll ? (
        <div className="mb-4 mt-4 space-y-3">
          {renderablePoll.options.map((option, index) => {
            const votes = getPollOptionVoteCount(renderablePoll, option);
            const percentage = getPollPercentage(votes, pollTotalVotes);
            return (
              <div key={`${post.id}-option-${index}`} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-white text-base font-medium">
                    {option}
                  </span>
                  <span className="text-gray-400 text-base font-semibold">
                    {percentage}%
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-3">
                  <div
                    className="bg-linear-to-r from-[#4ade80] to-[#22c55e] h-3 rounded-full"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : showAnswer ? (
        <div
          className="mb-4 mt-4 rounded-xl p-4"
          style={{
            background: truthBackground.legacyAnswer,
            border: "1px solid rgba(74,222,128,0.16)",
            boxShadow:
              "0 14px 34px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.09em] text-[#e5e7eb]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80] shadow-[0_0_12px_rgba(74,222,128,0.38)]" />
            Answered
          </div>
          <div className="flex items-center space-x-4">
            <PostAvatar
              src={post.receiver.avatar}
              name={post.receiver.nickname}
              size={48}
              className="w-12 h-12 rounded-full object-cover shrink-0 mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1.5">
                <span className="text-white font-semibold text-base truncate">
                  {post.receiver.nickname}
                </span>
              </div>
              <p
                className="text-white leading-tight"
                style={{
                  fontSize: suspenseAnswerPreview.length <= 16 ? 22 : 19,
                  fontWeight: 950,
                  overflowWrap: "anywhere",
                  textShadow: "0 10px 24px rgba(0,0,0,0.3)",
                  margin: 0,
                }}
              >
                {suspenseAnswerPreview}
              </p>
            </div>
          </div>
        </div>
      ) : null}
      <div className="flex flex-col pt-3 border-t border-gray-800 gap-3">
        {showAnswer && (
          <div className="flex items-center space-x-5">
            <button className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors">
              <Heart size={19} />
              <span className="text-sm">312</span>
            </button>
            <button className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors">
              <MessageCircle size={19} />
              <span className="text-sm">47</span>
            </button>
          </div>
        )}
        {phase === "idle" ? (
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={() => handleVote("truth")}
              style={{
                flex: 1,
                padding: "14px",
                borderRadius: "14px",
                border: "none",
                background: "#4ade80",
                color: "#000",
                fontWeight: 800,
                fontSize: "16px",
                cursor: "pointer",
                animation: "btnPulseTruth 6s ease-in-out infinite",
              }}
            >
              Truth
            </button>
            <button
              onClick={() => handleVote("lie")}
              style={{
                flex: 1,
                padding: "14px",
                borderRadius: "14px",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.8)",
                fontWeight: 800,
                fontSize: "16px",
                cursor: "pointer",
                animation: "btnPulseLie 6s ease-in-out infinite",
              }}
            >
              Lie
            </button>
          </div>
        ) : phase === "confirming" ? (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button
              onClick={handleConfirm}
              style={{
                width: "80%",
                padding: "14px",
                borderRadius: "14px",
                border:
                  vote === "lie" ? "1px solid rgba(255,255,255,0.15)" : "none",
                background:
                  vote === "truth" ? "#4ade80" : "rgba(255,255,255,0.08)",
                color: vote === "truth" ? "#000" : "rgba(255,255,255,0.8)",
                fontWeight: 800,
                fontSize: "16px",
                cursor: "pointer",
                textAlign: "center",
                animation:
                  "expandBtn 0.34s cubic-bezier(0.22,1,0.36,1) forwards",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                transition:
                  "transform 160ms cubic-bezier(0.22,1,0.36,1), box-shadow 220ms ease, opacity 160ms ease",
              }}
            >
              {vote === "truth"
                ? "You think this is truth"
                : "You think this is a lie"}
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "14px",
              borderRadius: "14px",
              background:
                vote === "truth"
                  ? "rgba(74,222,128,0.15)"
                  : "rgba(255,255,255,0.08)",
              border:
                vote === "truth"
                  ? "1px solid rgba(74,222,128,0.3)"
                  : "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <span
              style={{
                color: vote === "truth" ? "#4ade80" : "rgba(255,255,255,0.6)",
                fontWeight: 700,
                fontSize: "15px",
              }}
            >
              {vote === "truth"
                ? "You think this is truth"
                : "You think this is a lie"}
            </span>
          </div>
        )}
        <style>{`
          @keyframes expandBtn { from { opacity: 0.72; transform: translate3d(0,5px,0) scale(0.97); } to { opacity: 1; transform: translate3d(0,0,0) scale(1); } }
          @keyframes truthFade { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
          @keyframes btnPulseTruth { 0%,100%{opacity:0.88} 16%{opacity:1} 34%{opacity:0.94} 52%{opacity:0.88} }
          @keyframes btnPulseLie { 0%,52%,100%{opacity:0.82} 72%{opacity:1} 88%{opacity:0.9} }
          .card:focus, .card:active { outline: none !important; box-shadow: none !important; }
        `}</style>
      </div>
    </div>
  );
}

const formatTimestamp = (timestamp: any): string => {
  if (!timestamp) return "Recently";
  if (typeof timestamp === "object" && timestamp !== null) {
    if ("toDate" in timestamp && typeof timestamp.toDate === "function")
      return formatTimeAgo(timestamp.toDate().toISOString());
    if ("seconds" in timestamp && "nanoseconds" in timestamp)
      return formatTimeAgo(new Date(timestamp.seconds * 1000).toISOString());
  }
  if (typeof timestamp === "string") return formatTimeAgo(timestamp);
  return "Recently";
};

// ─── MainScreen ───────────────────────────────────────────────────────────────
type MainScreenView = "truth" | "dares";
type DareAudience = "friends" | "community";
type TruthSectionView =
  | "truths"
  | "all"
  | "predictions"
  | "rumours"
  | "promises"
  | "custom";
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

function getTruthSectionForTextCard(_kind: TextCardPostKind): TruthSectionView {
  return "all";
}

export function MainScreen({
  isActive,
  onDaresClick,
  onNavigateToChat,
  onNavigateToProfile: _onNavigateToProfile,
  focusRequest,
  activeView: activeViewProp,
  initialDareAudience = "friends",
  showViewToggle = true,
  resetKey,
  openCommunityHubRequestKey,
  textCardReturnRequest,
}: {
  isActive?: boolean;
  onDaresClick: () => void;
  onNavigateToChat: () => void;
  onNavigateToProfile?: (userId: string) => void;
  activeView?: MainScreenView;
  initialDareAudience?: DareAudience;
  showViewToggle?: boolean;
  resetKey?: number;
  openCommunityHubRequestKey?: number;
  textCardReturnRequest?: TextCardReturnRequest | null;
  focusRequest?: {
    view: MainScreenView;
    post: TruthPost | DarePost;
    nonce: number;
  } | null;
}) {
  const { user } = useAuthStore();
  const userId = user?.id;
  const {
    truthPosts,
    darePosts,
    loadingTruth,
    loadingDares,
    truthPostsUserId,
    darePostsUserId,
    truthPostsScope,
    darePostsScope,
    loadTruthPosts,
    loadDarePosts,
    voteOnDare,
    voteOnTruth,
  } = useContentStore();
  const alerts = useAlertStore((s) => s.alerts);
  const handledRealtimeAlertIds = useRef<Set<string>>(new Set());
  const publishedRealtimeDareIds = useRef<Set<string>>(new Set());
  const hasSeededRealtimeAlertIds = useRef(false);
  const hasSeededPublishedRealtimeDareIds = useRef(false);
  const [activeView, setActiveView] = useState<MainScreenView>(
    activeViewProp ?? "dares",
  );
  const [truthSectionView, setTruthSectionView] =
    useState<TruthSectionView>("all");
  const [showTruthFilters, setShowTruthFilters] = useState(false);
  const [deadlineReviewOpen, setDeadlineReviewOpen] = useState(false);
  const [deadlineReviewCount, setDeadlineReviewCount] = useState(0);
  const [selectedDare, setSelectedDare] = useState<DarePost | null>(null);
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [selectedTruth, setSelectedTruth] = useState<TruthPost | null>(null);
  const [selectedTruthConversation, setSelectedTruthConversation] =
    useState<TruthPost | null>(null);
  const [showTruthModal, setShowTruthModal] = useState(false);
  const [truthModalTab, setTruthModalTab] = useState<
    "truth" | "lie" | "comments"
  >("truth");
  const [activeReelIndex, setActiveReelIndex] = useState(0);
  const [dareProofReelMode, setDareProofReelMode] = useState(false);
  const [dareProofContextDareId, setDareProofContextDareId] =
    useState<string | null>(null);
  const [reelCommentsDare, setReelCommentsDare] = useState<DarePost | null>(
    null,
  );
  const [reelShareDare, setReelShareDare] = useState<DarePost | null>(null);
  const picModeEnabled = true;
  const picModeAnimationKey = 0;
  const [dareAudience, setDareAudience] =
    useState<DareAudience>(initialDareAudience);
  const [selectedCommunityChallenge, setSelectedCommunityChallenge] =
    useState<CommunityChallenge | null>(null);
  const [showCommunityChallengeHub, setShowCommunityChallengeHub] =
    useState(false);
  const [communityChallengeSummaries, setCommunityChallengeSummaries] =
    useState<Record<string, CommunityChallengeSummary>>({});
  const [customCommunityChallenges, setCustomCommunityChallenges] =
    useState<CommunityChallenge[]>([]);
  const [joinedCommunityChallengeIds, setJoinedCommunityChallengeIds] =
    useState<Set<string>>(() => new Set());
  const canSwitchViewsInternally = showViewToggle;

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [currentTruthIndex, setCurrentTruthIndex] = useState(0);
  const [truthRefreshingLatest, setTruthRefreshingLatest] = useState(false);
  const [truthRefreshPullProgress, setTruthRefreshPullProgress] = useState(0);
  const isTruthReelScrollingRef = useRef(false);
  const activeReelIndexRef = useRef(0);
  const dareProofContextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const truthScrollSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastProofContextIndexRef = useRef(0);
  const mainTouchStartX = useRef<number | null>(null);
  const mainTouchStartY = useRef<number | null>(null);
  const mainTouchLastX = useRef<number | null>(null);
  const mainTouchLastY = useRef<number | null>(null);

  useEffect(() => {
    if (!activeViewProp) return;
    setActiveView(activeViewProp);
    setIsTransitioning(false);
  }, [activeViewProp]);

  useEffect(() => {
    if (!textCardReturnRequest) return;
    if (activeViewProp && activeViewProp !== "truth") return;

    const frame = window.requestAnimationFrame(() => {
      setActiveView("truth");
      setTruthSectionView(getTruthSectionForTextCard(textCardReturnRequest.kind));
      setShowTruthFilters(false);
      currentTruthIndexRef.current = 0;
      setCurrentTruthIndex(0);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeViewProp, textCardReturnRequest]);
  const reelWheelLockRef = useRef(false);
  const reelWheelUnlockTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const reelScrollFrame = useRef<number | null>(null);
  const dareReelTouchStartX = useRef<number | null>(null);
  const dareReelTouchStartY = useRef<number | null>(null);
  const dareReelTouchStartIndex = useRef(0);
  const visitedDareEntryIds = useRef<Set<string>>(new Set());
  const [animatedDareEntryIds, setAnimatedDareEntryIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [sessionVoteSnapshot] = useState(() => ({
    truthVotes: votePersistence.getAllTruthVotes(),
    dareVotes: votePersistence.getAllDareVotes(),
  }));
  const minSwipeDistance = 20;

  const displayTruthPosts = React.useMemo(() => {
    const seenIds = new Set<string>();
    const focusedTruth =
      focusRequest?.view === "truth" ? (focusRequest.post as TruthPost) : null;

    const isPublishableTruth = (post: TruthPost) =>
      post.state === "APPROVED" && Boolean(post.answer?.trim());

    return [focusedTruth, ...truthPosts].filter((post): post is TruthPost => {
      if (!post?.id || seenIds.has(post.id) || !isPublishableTruth(post)) {
        return false;
      }

      seenIds.add(post.id);
      return true;
    });
  }, [focusRequest, truthPosts]);

  const displayDarePosts = React.useMemo(() => {
    const seen = new Set<string>();
    const focusedDare =
      focusRequest?.view === "dares" ? (focusRequest.post as DarePost) : null;

    return [focusedDare, ...darePosts].filter((post): post is DarePost => {
      if (!post?.id || seen.has(post.id)) return false;
      seen.add(post.id);
      return true;
    });
  }, [focusRequest, darePosts]);

  const orderedTruthPosts = React.useMemo(
    () => {
      const rankedTruths = rankDeckByVoteState(displayTruthPosts, (postId) =>
        Boolean(sessionVoteSnapshot.truthVotes[postId]),
      );
      const focusedTruthId =
        focusRequest?.view === "truth" ? focusRequest.post.id : null;

      if (!focusedTruthId) return rankedTruths;

      const focusedTruth = rankedTruths.find(
        (truth) => truth.id === focusedTruthId,
      );
      if (!focusedTruth) return rankedTruths;

      return [
        focusedTruth,
        ...rankedTruths.filter((truth) => truth.id !== focusedTruthId),
      ];
    },
    [displayTruthPosts, focusRequest, sessionVoteSnapshot],
  );
  const truthReelContainerRef = useRef<HTMLDivElement>(null);
  const truthScrollFrame = useRef<number | null>(null);
  const currentTruthIndexRef = useRef(0);
  const truthPullStartYRef = useRef<number | null>(null);
  const truthPullStartXRef = useRef<number | null>(null);
  const truthPullProgressRef = useRef(0);

  const refreshLatestTruthPosts = () => {
    const container = truthReelContainerRef.current;
    if (loadingTruth || truthRefreshingLatest) {
      setTruthRefreshPullProgress(0);
      truthPullProgressRef.current = 0;
      return;
    }
    setTruthRefreshingLatest(true);
    setTruthRefreshPullProgress(1);
    void loadTruthPosts(true, "feed").finally(() => {
      window.setTimeout(() => {
        setTruthRefreshingLatest(false);
        setTruthRefreshPullProgress(0);
        truthPullProgressRef.current = 0;
        currentTruthIndexRef.current = 0;
        setCurrentTruthIndex(0);
        container?.scrollTo({ top: 0, behavior: "smooth" });
      }, 260);
    });
  };

  const handleTruthPullStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    truthPullStartYRef.current = touch.clientY;
    truthPullStartXRef.current = touch.clientX;
    truthPullProgressRef.current = 0;
    setTruthRefreshPullProgress(0);
  };

  const handleTruthPullMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (truthRefreshingLatest) return;
    const container = truthReelContainerRef.current;
    const touch = event.touches[0];
    const startY = truthPullStartYRef.current;
    const startX = truthPullStartXRef.current;
    if (!container || !touch || startY === null || startX === null) return;

    const deltaY = touch.clientY - startY;
    const deltaX = touch.clientX - startX;
    if (Math.abs(deltaX) > Math.abs(deltaY)) return;

    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const atTop = container.scrollTop <= 2 && deltaY > 0;
    const atBottom = container.scrollTop >= maxScrollTop - 2 && deltaY < 0;
    const nextProgress =
      atTop || atBottom ? Math.min(1, Math.abs(deltaY) / 76) : 0;
    truthPullProgressRef.current = nextProgress;
    setTruthRefreshPullProgress(nextProgress);
  };

  const handleTruthPullEnd = () => {
    const shouldRefresh = truthPullProgressRef.current >= 0.72;
    truthPullStartYRef.current = null;
    truthPullStartXRef.current = null;
    truthPullProgressRef.current = 0;
    if (shouldRefresh) {
      refreshLatestTruthPosts();
    } else {
      setTruthRefreshPullProgress(0);
    }
  };

  useEffect(() => {
    if (!isActive || !userId) return;
    const shouldLoadTruths =
      truthPostsUserId !== userId || truthPostsScope !== "feed";
    const shouldLoadDares =
      darePostsUserId !== userId || darePostsScope !== "feed";

    if (shouldLoadTruths) {
      void loadTruthPosts(false, "feed");
    }
    if (shouldLoadDares) {
      void loadDarePosts(false, "feed");
    }
  }, [
    userId,
    truthPostsUserId,
    darePostsUserId,
    truthPostsScope,
    darePostsScope,
    loadTruthPosts,
    loadDarePosts,
    isActive,
  ]);

  useEffect(() => {
    if (!isActive || !userId || alerts.length === 0) return;

    const relevantAlerts = alerts.filter(
      (alert) =>
        alert.userId === userId &&
        (alert.type === "TRUTH_ANSWERED" ||
          alert.type === "TRUTH_COMPLETED" ||
          alert.type === "DARE_COMPLETED" ||
          alert.type === "DARE_PROOF_SUBMITTED" ||
          alert.type === "DARE_POSTED" ||
          alert.type === "DARE_APPROVED" ||
          alert.type === "TRUTH_RECEIVED" ||
          alert.type === "DARE_RECEIVED") &&
        !handledRealtimeAlertIds.current.has(alert.id),
    );

    if (relevantAlerts.length === 0) return;

    relevantAlerts.forEach((alert) =>
      handledRealtimeAlertIds.current.add(alert.id),
    );

    if (!hasSeededRealtimeAlertIds.current) {
      hasSeededRealtimeAlertIds.current = true;
      return;
    }

    const shouldRefreshTruths = relevantAlerts.some(
      (alert) =>
        alert.type === "TRUTH_ANSWERED" ||
        alert.type === "TRUTH_COMPLETED" ||
        alert.type === "TRUTH_RECEIVED",
    );
    const shouldRefreshDares = relevantAlerts.some(
      (alert) =>
        alert.type === "DARE_COMPLETED" ||
        alert.type === "DARE_PROOF_SUBMITTED" ||
        alert.type === "DARE_POSTED" ||
        alert.type === "DARE_APPROVED" ||
        alert.type === "DARE_RECEIVED",
    );

    void Promise.all([
      shouldRefreshTruths ? loadTruthPosts(true, "feed") : Promise.resolve(),
      shouldRefreshDares ? loadDarePosts(true, "feed") : Promise.resolve(),
    ]);
  }, [alerts, isActive, loadDarePosts, loadTruthPosts, userId]);

  useEffect(() => {
    if (!isActive || !userId) return;

    return dareService.subscribeToUserDares(userId, "all", (dares) => {
      const publishedDareIds = dares
        .filter((dare) => dare.state === "ACCEPTED_REAL")
        .map((dare) => dare.id);

      const hasNewPublishedDare = publishedDareIds.some(
        (dareId) => !publishedRealtimeDareIds.current.has(dareId),
      );

      publishedRealtimeDareIds.current = new Set(publishedDareIds);

      if (!hasSeededPublishedRealtimeDareIds.current) {
        hasSeededPublishedRealtimeDareIds.current = true;
        return;
      }

      if (hasNewPublishedDare) {
        void loadDarePosts(true, "feed");
      }
    });
  }, [isActive, loadDarePosts, userId]);

  useEffect(() => {
    if (!isActive) return;
    return communityChallengeService.subscribeToSummaries(
      COMMUNITY_CHALLENGES.map((challenge) => challenge.id),
      setCommunityChallengeSummaries,
    );
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    return communityChallengeService.subscribeToCustomChallenges(
      setCustomCommunityChallenges,
    );
  }, [isActive]);

  useEffect(() => {
    if (!isActive || !userId) return;
    return communityChallengeService.subscribeToJoinedChallengeIds(
      userId,
      setJoinedCommunityChallengeIds,
    );
  }, [isActive, userId]);

  const handleVoteClick = React.useCallback((dare: DarePost) => {
    setSelectedDare(dare);
    setShowVoteModal(true);
  }, []);
  const handleCloseVoteModal = React.useCallback(() => {
    setShowVoteModal(false);
    setSelectedDare(null);
  }, []);
  const handleOpenTruthModal = React.useCallback(
    (post: TruthPost, tab: "truth" | "lie" | "comments") => {
      setSelectedTruth(post);
      setTruthModalTab(tab);
      setShowTruthModal(true);
    },
    [],
  );
  const handleDareVote = React.useCallback(
    (dareId: string, vote: "real" | "fake") => {
      voteOnDare(dareId, vote);
      handleCloseVoteModal();
    },
    [voteOnDare, handleCloseVoteModal],
  );
  const handleTruthVoteClick = React.useCallback(
    (post: TruthPost, choice: "truth" | "lie") => {
      if (userId) {
        const { recordVote } = useTruthInteractionStore.getState();
        recordVote(post.id, userId, choice.toUpperCase() as "TRUTH" | "LIE");
      }
      voteOnTruth(post.id, choice);
      handleOpenTruthModal(post, choice);
    },
    [voteOnTruth, userId, handleOpenTruthModal],
  );
  const allTruthFeedItems = React.useMemo<PredictionFeedExternalItem[]>(
    () =>
      orderedTruthPosts.map((post) => ({
        type: "external",
        id: `truth-${post.id}`,
        createdAt: post.createdAt,
        render: (isActive, isScrolling) => (
          <SwipeableTruthCard
            post={post}
            onVoteClick={handleTruthVoteClick}
            onOpenVoteModal={handleOpenTruthModal}
            onOpenConversation={setSelectedTruthConversation}
            cardIndex={0}
            currentIndex={0}
            isDragging={isScrolling}
            isCurrentCard={isActive}
            lockInternalScroll
            compactTopInset
            onNavigateToProfile={_onNavigateToProfile}
          />
        ),
      })),
    [
      _onNavigateToProfile,
      handleOpenTruthModal,
      handleTruthVoteClick,
      orderedTruthPosts,
    ],
  );
  const handleCloseTruthModal = React.useCallback(() => {
    setShowTruthModal(false);
    setSelectedTruth(null);
  }, []);

  const hydratedCommunityChallenges = React.useMemo(
    () => [
      ...customCommunityChallenges,
      ...communityChallengeService.hydrateChallenges(
        COMMUNITY_CHALLENGES,
        communityChallengeSummaries,
      ),
    ],
    [communityChallengeSummaries, customCommunityChallenges],
  );

  const selectedHydratedCommunityChallenge = selectedCommunityChallenge
    ? hydratedCommunityChallenges.find(
        (challenge) => challenge.id === selectedCommunityChallenge.id,
      ) || selectedCommunityChallenge
    : null;

  const handleJoinCommunityChallenge = React.useCallback(
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
  const handleOpenComments = React.useCallback((dare: DarePost) => {
    setReelCommentsDare(dare);
  }, []);
  const handleOpenShare = React.useCallback((dare: DarePost) => {
    setReelShareDare(dare);
  }, []);

  const handleOpenDareProofView = React.useCallback(() => {
    lastProofContextIndexRef.current = activeReelIndexRef.current;
    setDareProofReelMode(true);
  }, []);

  // Lock outer reel scroll when any modal is open
  const anyModalOpen = !!(
    reelCommentsDare ||
    reelShareDare ||
    showVoteModal ||
    showTruthModal ||
    selectedTruthConversation ||
    selectedCommunityChallenge ||
    showCommunityChallengeHub
  );

  useEffect(() => {
    if (!openCommunityHubRequestKey) return;

    setSelectedCommunityChallenge(null);
    setShowCommunityChallengeHub(true);
  }, [openCommunityHubRequestKey]);

  const reelContainerRef = useRef<HTMLDivElement>(null);
  const isDareScreenVisible =
    Boolean(isActive) && activeView === "dares" && dareAudience === "friends";
  useEffect(() => {
    const el = reelContainerRef.current;
    if (!el) return;
    el.style.overflowY = anyModalOpen ? "hidden" : "auto";
    el.style.overflowX = "hidden";
    // Also lock body scroll when modal open so overscroll doesn't bleed
    document.body.style.overflow = anyModalOpen ? "hidden" : "";
    return () => {
      el.style.overflowY = "";
      el.style.overflowX = "";
      document.body.style.overflow = "";
    };
  }, [anyModalOpen]);

  const sortedDarePosts = React.useMemo(() => {
    const seen = new Set<string>();

    // Publish gate for MainScreen:
    // show only dares that are explicitly approved as real and include proof media.
    const isPublishableDare = (d: DarePost) =>
      d.state === "ACCEPTED_REAL" && Boolean(d.proof?.url);

    const publishableDares = [...displayDarePosts].filter((d) => {
      if (!d || !d.id || seen.has(d.id)) return false;
      seen.add(d.id);
      return isPublishableDare(d);
    });

    const rankedDares = rankDeckByVoteState(publishableDares, (postId) =>
      Boolean(sessionVoteSnapshot.dareVotes[postId]),
    );
    const focusedDareId =
      focusRequest?.view === "dares" ? focusRequest.post.id : null;

    if (!focusedDareId) return rankedDares;

    const focusedDare = rankedDares.find((dare) => dare.id === focusedDareId);
    if (!focusedDare) return rankedDares;

    return [
      focusedDare,
      ...rankedDares.filter((dare) => dare.id !== focusedDareId),
    ];
  }, [displayDarePosts, focusRequest, sessionVoteSnapshot]);

  const registerDareCardVisit = React.useCallback((dareId: string) => {
    if (visitedDareEntryIds.current.has(dareId)) {
      setAnimatedDareEntryIds((current) => {
        if (current.has(dareId)) return current;
        return current.size > 0 ? new Set() : current;
      });
      return;
    }

    visitedDareEntryIds.current.add(dareId);
    setAnimatedDareEntryIds(new Set([dareId]));
  }, []);

  useEffect(() => {
    if (!isDareScreenVisible) {
      setAnimatedDareEntryIds((current) =>
        current.size > 0 ? new Set() : current,
      );
      return;
    }

    const activeDare = sortedDarePosts[activeReelIndex];
    if (!activeDare?.id) return;
    registerDareCardVisit(activeDare.id);
  }, [
    activeReelIndex,
    isDareScreenVisible,
    registerDareCardVisit,
    sortedDarePosts,
  ]);

  const shouldPlayDareEntryAnimation = React.useCallback(
    (dareId: string, cardIsActive: boolean) => {
      if (!cardIsActive) return false;
      return (
        animatedDareEntryIds.has(dareId) ||
        !visitedDareEntryIds.current.has(dareId)
      );
    },
    [animatedDareEntryIds],
  );

  const hasPlayedDareEntryAnimation = React.useCallback((dareId: string) => {
    return visitedDareEntryIds.current.has(dareId);
  }, []);

  useEffect(() => {
    activeReelIndexRef.current = activeReelIndex;
  }, [activeReelIndex]);

  useEffect(() => {
    currentTruthIndexRef.current = currentTruthIndex;
  }, [currentTruthIndex]);

  useEffect(() => {
    return () => {
      if (reelWheelUnlockTimer.current) {
        clearTimeout(reelWheelUnlockTimer.current);
      }
      if (reelScrollFrame.current !== null) {
        window.cancelAnimationFrame(reelScrollFrame.current);
      }
      if (truthScrollFrame.current !== null) {
        window.cancelAnimationFrame(truthScrollFrame.current);
      }
      if (truthScrollSettleTimerRef.current) {
        clearTimeout(truthScrollSettleTimerRef.current);
      }
      if (dareProofContextTimerRef.current) {
        clearTimeout(dareProofContextTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isDareScreenVisible) return;
    setDareProofReelMode(false);
    setDareProofContextDareId(null);
    lastProofContextIndexRef.current = activeReelIndex;
    if (dareProofContextTimerRef.current) {
      clearTimeout(dareProofContextTimerRef.current);
      dareProofContextTimerRef.current = null;
    }
  }, [activeReelIndex, isDareScreenVisible]);

  useEffect(() => {
    if (!dareProofReelMode || !isDareScreenVisible) {
      lastProofContextIndexRef.current = activeReelIndex;
      return;
    }

    if (lastProofContextIndexRef.current === activeReelIndex) return;
    lastProofContextIndexRef.current = activeReelIndex;

    const activeDare = sortedDarePosts[activeReelIndex];
    if (!activeDare?.id) return;

    setDareProofContextDareId(activeDare.id);
    if (dareProofContextTimerRef.current) {
      clearTimeout(dareProofContextTimerRef.current);
    }
    dareProofContextTimerRef.current = setTimeout(() => {
      setDareProofContextDareId((current) =>
        current === activeDare.id ? null : current,
      );
      dareProofContextTimerRef.current = null;
    }, 5000);
  }, [
    activeReelIndex,
    dareProofReelMode,
    isDareScreenVisible,
    sortedDarePosts,
  ]);

  const scrollDareReelToIndex = React.useCallback(
    (index: number) => {
      const container = reelContainerRef.current;
      if (!container) return;

      const maxIndex = Math.max(0, sortedDarePosts.length - 1);
      const targetIndex = Math.min(maxIndex, Math.max(0, index));
      const activeDare = sortedDarePosts[targetIndex];
      if (activeDare?.id) registerDareCardVisit(activeDare.id);

      activeReelIndexRef.current = targetIndex;
      setActiveReelIndex(targetIndex);
      container.scrollTo({
        top: container.clientHeight * targetIndex,
        behavior: "auto",
      });
    },
    [registerDareCardVisit, sortedDarePosts],
  );

  const handleDareReelWheel = React.useCallback(
    (e: WheelEvent) => {
      if (!isDareScreenVisible || anyModalOpen) return;

      const verticalDelta = Math.abs(e.deltaY);
      const horizontalDelta = Math.abs(e.deltaX);
      if (verticalDelta < 10 || horizontalDelta > verticalDelta) return;

      e.preventDefault();
      if (reelWheelLockRef.current) return;

      const direction = e.deltaY > 0 ? 1 : -1;
      const currentIndex = activeReelIndexRef.current;
      const nextIndex = Math.min(
        Math.max(0, sortedDarePosts.length - 1),
        Math.max(0, currentIndex + direction),
      );

      if (nextIndex === currentIndex) return;

      reelWheelLockRef.current = true;
      scrollDareReelToIndex(nextIndex);

      if (reelWheelUnlockTimer.current) {
        clearTimeout(reelWheelUnlockTimer.current);
      }
      reelWheelUnlockTimer.current = setTimeout(() => {
        reelWheelLockRef.current = false;
      }, 520);
    },
    [
      anyModalOpen,
      isDareScreenVisible,
      scrollDareReelToIndex,
      sortedDarePosts.length,
    ],
  );

  useEffect(() => {
    const container = reelContainerRef.current;
    if (!container) return;

    container.addEventListener("wheel", handleDareReelWheel, {
      passive: false,
    });
    return () => {
      container.removeEventListener("wheel", handleDareReelWheel);
    };
  }, [handleDareReelWheel]);

  const handleDareReelTouchStart = React.useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const touch = e.touches[0];
      dareReelTouchStartX.current = touch.clientX;
      dareReelTouchStartY.current = touch.clientY;
      dareReelTouchStartIndex.current = activeReelIndexRef.current;
    },
    [],
  );

  const handleDareReelTouchEnd = React.useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const startX = dareReelTouchStartX.current;
      const startY = dareReelTouchStartY.current;
      dareReelTouchStartX.current = null;
      dareReelTouchStartY.current = null;

      if (startX === null || startY === null) return;

      const touch = e.changedTouches[0];
      const deltaX = startX - touch.clientX;
      const deltaY = startY - touch.clientY;
      const verticalDistance = Math.abs(deltaY);

      if (verticalDistance < 48 || verticalDistance < Math.abs(deltaX) * 1.15) {
        return;
      }

      const direction = deltaY > 0 ? 1 : -1;
      scrollDareReelToIndex(dareReelTouchStartIndex.current + direction);
    },
    [scrollDareReelToIndex],
  );

  const handleDareReelTouchCancel = React.useCallback(() => {
    dareReelTouchStartX.current = null;
    dareReelTouchStartY.current = null;
  }, []);

  useEffect(() => {
    if (activeView !== "dares") return;
    const container = reelContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      if (reelScrollFrame.current !== null) return;
      reelScrollFrame.current = window.requestAnimationFrame(() => {
        reelScrollFrame.current = null;
        const slideHeight = container.clientHeight;
        if (!slideHeight) return;
        const maxIndex = Math.max(0, sortedDarePosts.length - 1);
        const idx = Math.min(
          maxIndex,
          Math.max(0, Math.round(container.scrollTop / slideHeight)),
        );
        if (idx === activeReelIndexRef.current) return;

        const activeDare = sortedDarePosts[idx];
        if (activeDare?.id) registerDareCardVisit(activeDare.id);
        activeReelIndexRef.current = idx;
        setActiveReelIndex(idx);
      });
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (reelScrollFrame.current !== null) {
        window.cancelAnimationFrame(reelScrollFrame.current);
        reelScrollFrame.current = null;
      }
    };
  }, [activeView, registerDareCardVisit, sortedDarePosts]);

  useEffect(() => {
    if (activeView !== "truth") return;
    const container = truthReelContainerRef.current;
    if (!container) return;

    const pauseTruthMotionForScroll = () => {
      if (!isTruthReelScrollingRef.current) {
        isTruthReelScrollingRef.current = true;
        container.classList.add("truth-reel-is-scrolling");
      }
      if (truthScrollSettleTimerRef.current) {
        clearTimeout(truthScrollSettleTimerRef.current);
      }
      truthScrollSettleTimerRef.current = setTimeout(() => {
        isTruthReelScrollingRef.current = false;
        container.classList.remove("truth-reel-is-scrolling");
        truthScrollSettleTimerRef.current = null;
      }, 180);
    };

    const handleScroll = () => {
      pauseTruthMotionForScroll();

      if (truthScrollFrame.current !== null) return;
      truthScrollFrame.current = window.requestAnimationFrame(() => {
        truthScrollFrame.current = null;
        const slideHeight = container.clientHeight;
        if (!slideHeight) return;
        const maxIndex = Math.max(0, orderedTruthPosts.length - 1);
        const idx = Math.min(
          maxIndex,
          Math.max(0, Math.round(container.scrollTop / slideHeight)),
        );
        if (idx === currentTruthIndexRef.current) return;
        currentTruthIndexRef.current = idx;
        setCurrentTruthIndex(idx);
      });
    };

    const handleTouchStart = () => pauseTruthMotionForScroll();

    container.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    container.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("scroll", handleScroll);
      if (truthScrollFrame.current !== null) {
        window.cancelAnimationFrame(truthScrollFrame.current);
        truthScrollFrame.current = null;
      }
      if (truthScrollSettleTimerRef.current) {
        clearTimeout(truthScrollSettleTimerRef.current);
        truthScrollSettleTimerRef.current = null;
      }
      if (isTruthReelScrollingRef.current) {
        isTruthReelScrollingRef.current = false;
      }
      container.classList.remove("truth-reel-is-scrolling");
    };
  }, [activeView, orderedTruthPosts.length]);

  useEffect(() => {
    if (!focusRequest || focusRequest.view !== "truth") return;
    if (activeViewProp && activeViewProp !== "truth") return;

    setActiveView("truth");
    const targetIndex = orderedTruthPosts.findIndex(
      (truth) => truth.id === focusRequest.post.id,
    );
    if (targetIndex >= 0) {
      setCurrentTruthIndex(targetIndex);
    }
  }, [activeViewProp, focusRequest, orderedTruthPosts]);

  useEffect(() => {
    if (
      !focusRequest ||
      focusRequest.view !== "truth" ||
      (activeViewProp && activeViewProp !== "truth") ||
      activeView !== "truth"
    ) {
      return;
    }

    const targetIndex = orderedTruthPosts.findIndex(
      (truth) => truth.id === focusRequest.post.id,
    );

    if (targetIndex < 0) return;

    setCurrentTruthIndex(targetIndex);

    const container = truthReelContainerRef.current;
    if (!container) return;
    container.scrollTop = container.clientHeight * targetIndex;
  }, [activeView, activeViewProp, focusRequest, orderedTruthPosts]);

  useEffect(() => {
    if (!focusRequest || focusRequest.view !== "dares") return;
    if (activeViewProp && activeViewProp !== "dares") return;

    setActiveView("dares");
    setDareAudience("friends");
  }, [activeViewProp, focusRequest]);

  useEffect(() => {
    if (
      !focusRequest ||
      focusRequest.view !== "dares" ||
      (activeViewProp && activeViewProp !== "dares") ||
      activeView !== "dares"
    ) {
      return;
    }

    const targetIndex = sortedDarePosts.findIndex(
      (dare) => dare.id === focusRequest.post.id,
    );

    if (targetIndex < 0) return;

    setDareAudience("friends");
    setActiveReelIndex(targetIndex);

    const container = reelContainerRef.current;
    if (!container) return;
    container.scrollTop = container.clientHeight * targetIndex;
  }, [activeView, activeViewProp, focusRequest, sortedDarePosts]);

  useEffect(() => {
    if (activeView === "truth") {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [activeView]);

  useEffect(() => {
    if (!isActive) return;

    window.scrollTo(0, 0);

    if (activeView === "dares") {
      setDareAudience(initialDareAudience);
      setActiveReelIndex(0);
      if (reelContainerRef.current) reelContainerRef.current.scrollTop = 0;
    }
  }, [activeView, initialDareAudience, isActive, resetKey]);

  useLayoutEffect(() => {
    if (activeView !== "truth") return;
    if (focusRequest?.view === "truth") return;

    const container = truthReelContainerRef.current;
    if (!container) return;

    const targetIndex = Math.min(
      Math.max(0, orderedTruthPosts.length - 1),
      Math.max(0, currentTruthIndexRef.current),
    );

    setCurrentTruthIndex((prev) => (prev === targetIndex ? prev : targetIndex));
    container.scrollTop = container.clientHeight * targetIndex;
  }, [activeView, focusRequest, orderedTruthPosts.length]);

  useEffect(() => {
    if (activeView !== "dares") return;

    setActiveReelIndex(0);
    activeReelIndexRef.current = 0;
    if (reelContainerRef.current) {
      reelContainerRef.current.scrollTop = 0;
    }
  }, [activeView, dareAudience]);

  const onTouchStart = (e: React.TouchEvent) => {
    const touch = e.targetTouches[0];
    mainTouchStartX.current = touch.clientX;
    mainTouchStartY.current = touch.clientY;
    mainTouchLastX.current = touch.clientX;
    mainTouchLastY.current = touch.clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const touch = e.targetTouches[0];
    mainTouchLastX.current = touch.clientX;
    mainTouchLastY.current = touch.clientY;
  };
  const onTouchEnd = () => {
    const touchStart = mainTouchStartX.current;
    const touchEnd = mainTouchLastX.current;
    const touchStartY = mainTouchStartY.current;
    const touchEndY = mainTouchLastY.current;
    mainTouchStartX.current = null;
    mainTouchStartY.current = null;
    mainTouchLastX.current = null;
    mainTouchLastY.current = null;

    if (
      touchStart === null ||
      touchEnd === null ||
      touchStartY === null ||
      touchEndY === null ||
      isTransitioning ||
      !canSwitchViewsInternally
    ) {
      return;
    }

    const distanceX = touchStart - touchEnd;
    const distanceY = Math.abs(touchStartY - touchEndY);
    if (Math.abs(distanceX) > minSwipeDistance && distanceX > distanceY * 0.6) {
      setIsTransitioning(true);
      if (distanceX > 0) setActiveView("truth");
      else setActiveView("dares");
      setTimeout(() => setIsTransitioning(false), 300);
    }
  };

  const NavHeader = () => (
    <div
      className="pop-main-nav-header"
      style={{
        flexShrink: 0,
        paddingTop: "calc(var(--safe-area-top) + 6px)",
        background: "transparent",
        borderBottom: "none",
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
        position: "relative",
        overflow: "visible",
        zIndex: 4,
      }}
    >
      <div className="px-4 pb-4">
        {showViewToggle ? (
          <div className="pop-main-toggle mx-auto grid max-w-sm grid-cols-2 rounded-full border border-white/10 bg-black/46 p-1 shadow-[0_18px_44px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.07),inset_0_-1px_0_rgba(255,255,255,0.03)] backdrop-blur-xl">
            <button
              onClick={() => setActiveView("dares")}
              className={`flex min-h-[44px] items-center justify-center rounded-full px-4 text-[14px] font-black transition-all ${
                activeView === "dares"
                  ? "bg-white text-black shadow-[0_14px_30px_rgba(255,255,255,0.16),inset_0_1px_0_rgba(255,255,255,0.72)]"
                  : "text-white/48 hover:text-white/72"
              }`}
            >
              Dares
            </button>
            <button
              onClick={() => setActiveView("truth")}
              className={`flex min-h-[44px] items-center justify-center rounded-full px-4 text-[14px] font-black transition-all ${
                activeView === "truth"
                  ? "bg-white text-black shadow-[0_14px_30px_rgba(255,255,255,0.16),inset_0_1px_0_rgba(255,255,255,0.72)]"
                  : "text-white/48 hover:text-white/72"
              }`}
            >
              Truth
            </button>
          </div>
        ) : activeView === "dares" ? (
          <div
            className="mx-auto grid max-w-sm grid-cols-2"
            style={{
              borderRadius: "999px",
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(0,0,0,0.46)",
              boxShadow:
                "0 18px 44px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(255,255,255,0.03)",
              padding: 4,
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
            }}
          >
            {(["friends", "community"] as const).map((section) => (
              <button
                key={section}
                type="button"
                onClick={() => setDareAudience(section)}
                className={`flex min-h-[44px] items-center justify-center rounded-full px-4 text-[14px] font-black capitalize transition-all ${
                  dareAudience === section
                    ? "bg-white text-black shadow-[0_14px_30px_rgba(255,255,255,0.16),inset_0_1px_0_rgba(255,255,255,0.72)]"
                    : "text-white/48 hover:text-white/72"
                }`}
              >
                {section}
              </button>
            ))}
          </div>
        ) : (
          <div className="pop-main-toggle mx-auto flex max-w-sm items-center justify-center rounded-full border border-white/10 bg-black/46 px-4 py-3 shadow-[0_18px_44px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.07),inset_0_-1px_0_rgba(255,255,255,0.03)] backdrop-blur-xl">
            <span className="text-sm font-black uppercase tracking-[0.18em] text-white/72">
              {activeView === "truth" ? "Truth" : "Feed"}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  const truthFilterOptions = [
    ["all", "All cards"],
    ["truths", "Truths"],
    ["predictions", "Predictions"],
    ["rumours", "Rumours"],
    ["promises", "Promises"],
    ["custom", "Custom"],
  ] as const;
  const activeTruthFilterLabel =
    truthFilterOptions.find(([section]) => section === truthSectionView)?.[1] ||
    "All cards";

  const TruthSectionHeader = () => (
    <div
      className="pop-truth-section-header"
      style={{
        flexShrink: 0,
        paddingTop: "calc(var(--safe-area-top) + 8px)",
        background:
          "radial-gradient(circle at 50% -45%, rgba(255,255,255,0.06), transparent 56%), linear-gradient(180deg, rgba(14,15,17,0.97), rgba(5,6,8,0.74), rgba(4,5,7,0))",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        position: "relative",
        overflow: "visible",
        zIndex: 8,
      }}
    >
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.28),rgba(56,189,248,0.22),transparent)]" />
      <div className="relative px-4 pb-2">
        <div className="mx-auto flex max-w-[720px] items-center justify-between gap-3">
          <div className="grid min-w-0 flex-1 grid-cols-2 rounded-full border border-white/10 bg-black/46 p-1 shadow-[0_14px_34px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setDeadlineReviewOpen(false)}
              aria-pressed={!deadlineReviewOpen}
              className={`flex min-h-10 items-center justify-center rounded-full px-3 text-[11px] font-black uppercase tracking-[0.08em] transition-all duration-200 ${
                !deadlineReviewOpen
                  ? "bg-white text-black shadow-[0_10px_24px_rgba(255,255,255,0.14),inset_0_1px_0_rgba(255,255,255,0.72)]"
                  : "text-white/48 hover:text-white/72"
              }`}
            >
              Upcoming
            </button>
            <button
              type="button"
              onClick={() => deadlineReviewCount > 0 && setDeadlineReviewOpen(true)}
              aria-pressed={deadlineReviewOpen}
              disabled={deadlineReviewCount === 0}
              className={`flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[11px] font-black uppercase tracking-[0.08em] transition-all duration-200 ${
                deadlineReviewOpen
                  ? "bg-white text-black shadow-[0_10px_24px_rgba(255,255,255,0.14),inset_0_1px_0_rgba(255,255,255,0.72)]"
                  : deadlineReviewCount > 0
                    ? "text-white/48 hover:text-white/72"
                    : "cursor-not-allowed text-white/22"
              }`}
            >
              Happened already
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowTruthFilters((current) => !current)}
            className="pop-main-filter-button flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/12 bg-[linear-gradient(180deg,rgba(28,30,33,0.86),rgba(8,9,11,0.95))] text-white shadow-[0_14px_34px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.07)] transition-all duration-200 active:scale-[0.97]"
            aria-expanded={showTruthFilters}
            aria-label={`Filter cards: ${activeTruthFilterLabel}`}
          >
            <SlidersHorizontal size={15} className="text-white/65" />
          </button>
        </div>
        {showTruthFilters ? (
          <div className="pop-main-filter-dropdown absolute right-4 top-[calc(100%-2px)] z-20 w-[min(360px,calc(100vw-32px))] overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(22,22,24,0.98),rgba(5,5,6,0.98))] p-2 shadow-[0_26px_70px_rgba(0,0,0,0.52),inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(255,255,255,0.03)]">
            <div className="grid grid-cols-2 gap-2">
              {truthFilterOptions.map(([section, label]) => (
                <button
                  key={section}
                  type="button"
                  onClick={() => {
                    setTruthSectionView(section);
                    setDeadlineReviewOpen(false);
                    setShowTruthFilters(false);
                  }}
                  className={`min-h-11 rounded-[18px] border px-3 text-left text-[12px] font-black transition-all duration-200 ${
                    truthSectionView === section
                      ? "border-white/18 bg-[linear-gradient(180deg,rgba(255,255,255,0.17),rgba(255,255,255,0.075))] text-white shadow-[0_10px_24px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.14)]"
                      : "border-white/8 bg-white/[0.045] text-white/58 hover:bg-white/[0.07] hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div
      className="screen-container pop-main-screen"
      style={{
        transition: isTransitioning ? "transform 0.3s ease-out" : "none",
        touchAction: "auto",
      }}
      onTouchStart={
        activeView === "dares" && canSwitchViewsInternally
          ? onTouchStart
          : undefined
      }
      onTouchMove={
        activeView === "dares" && canSwitchViewsInternally
          ? onTouchMove
          : undefined
      }
      onTouchEnd={
        activeView === "dares" && canSwitchViewsInternally
          ? onTouchEnd
          : undefined
      }
    >
      {activeView === "dares" ? (
        <div
          className="pop-main-reel-surface"
          style={{
            height: "100dvh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background:
              "radial-gradient(circle at 50% -12%, rgba(251,113,133,0.16), transparent 34%), radial-gradient(circle at 12% 20%, rgba(56,189,248,0.10), transparent 28%), radial-gradient(circle at 88% 12%, rgba(192,132,252,0.10), transparent 28%), linear-gradient(180deg, #12070d 0%, #090912 50%, #030303 100%)",
          }}
        >
          <NavHeader />
          {dareAudience === "friends" ? (
            <div
              ref={reelContainerRef}
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                overflowX: "hidden",
                scrollSnapType: "y mandatory",
                scrollBehavior: "auto",
                WebkitOverflowScrolling: "touch",
                overscrollBehavior: "contain",
                touchAction: "pan-y",
                contain: "layout paint style",
                willChange: "scroll-position",
              }}
            >
              <div
                data-reel-index="0"
                style={{
                  height: "100%",
                  minHeight: "100%",
                  scrollSnapAlign: "start",
                  scrollSnapStop: "always",
                  overflow: "hidden",
                  contain: "layout paint style",
                  transform: "translateZ(0)",
                  backfaceVisibility: "hidden",
                }}
              >
                {sortedDarePosts[0] ? (
                  <DareCard
                    dare={sortedDarePosts[0]}
                    reelMode
                    isActive={isDareScreenVisible && activeReelIndex === 0}
                    hasPlayedEntryAnimation={hasPlayedDareEntryAnimation(
                      sortedDarePosts[0].id,
                    )}
                    playEntryAnimation={shouldPlayDareEntryAnimation(
                      sortedDarePosts[0].id,
                      isDareScreenVisible && activeReelIndex === 0,
                    )}
                    onVoteClick={handleVoteClick}
                    onOpenComments={handleOpenComments}
                    onOpenShare={handleOpenShare}
                    onVote={handleDareVote}
                    onNavigateToProfile={_onNavigateToProfile}
                    picModeEnabled={picModeEnabled}
                    picModeAnimationKey={picModeAnimationKey}
                    proofViewMode={dareProofReelMode}
                    onOpenProofView={handleOpenDareProofView}
                    showProofTitleContext={
                      dareProofContextDareId === sortedDarePosts[0].id
                    }
                  />
                ) : (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: "100%",
                      color: "rgba(255,255,255,0.6)",
                    }}
                  >
                    {loadingDares
                      ? "Loading dares..."
                      : "No approved dares yet"}
                  </div>
                )}
              </div>
              {sortedDarePosts
                .slice(1)
                .filter((dare) => dare && dare.id)
                .map((dare, i) => (
                  <div
                    key={dare.id}
                    data-reel-index={String(i + 1)}
                    style={{
                      height: "100%",
                      minHeight: "100%",
                      scrollSnapAlign: "start",
                      scrollSnapStop: "always",
                      overflow: "hidden",
                      contain: "layout paint style",
                      contentVisibility: "auto",
                      containIntrinsicSize: "100dvh",
                      transform: "translateZ(0)",
                      backfaceVisibility: "hidden",
                    }}
                  >
                    <DareCard
                      dare={dare}
                      reelMode
                      isActive={
                        isDareScreenVisible && activeReelIndex === i + 1
                      }
                      hasPlayedEntryAnimation={hasPlayedDareEntryAnimation(
                        dare.id,
                      )}
                      playEntryAnimation={shouldPlayDareEntryAnimation(
                        dare.id,
                        isDareScreenVisible && activeReelIndex === i + 1,
                      )}
                      onVoteClick={handleVoteClick}
                      onOpenComments={handleOpenComments}
                      onOpenShare={handleOpenShare}
                      onVote={handleDareVote}
                      onNavigateToProfile={_onNavigateToProfile}
                      picModeEnabled={picModeEnabled}
                      picModeAnimationKey={picModeAnimationKey}
                      proofViewMode={dareProofReelMode}
                      onOpenProofView={handleOpenDareProofView}
                      showProofTitleContext={
                        dareProofContextDareId === dare.id
                      }
                    />
                  </div>
                ))}
            </div>
          ) : (
            <CommunityChallengeFeed
              challenges={hydratedCommunityChallenges}
              joinedChallengeIds={joinedCommunityChallengeIds}
              onPreview={setSelectedCommunityChallenge}
            />
          )}
        </div>
      ) : (
        <div
          style={{
            height: "100dvh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background:
              "radial-gradient(circle at 50% -12%, rgba(74,222,128,0.14), transparent 34%), linear-gradient(180deg, #060806 0%, #030403 100%)",
            paddingBottom: "calc(80px + var(--safe-area-bottom))",
          }}
        >
          <TruthSectionHeader />
          {truthSectionView === "truths" ? (
            <div
              className="pointer-events-none absolute inset-x-0 top-[calc(var(--safe-area-top)+64px)] z-30 flex justify-center transition-all duration-300"
              style={{
                opacity: truthRefreshingLatest ? 1 : truthRefreshPullProgress,
                transform: `scale(${truthRefreshingLatest ? 1 : 0.9 + truthRefreshPullProgress * 0.1})`,
              }}
              aria-hidden="true"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/78 text-white shadow-[0_20px_48px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-xl">
                <RefreshCw
                  size={20}
                  strokeWidth={2.2}
                  className={truthRefreshingLatest ? "animate-spin" : ""}
                  style={{
                    transform: truthRefreshingLatest
                      ? undefined
                      : `rotate(${truthRefreshPullProgress * 180}deg)`,
                  }}
                />
              </div>
            </div>
          ) : null}
          {truthSectionView !== "truths" ? (
            <PredictionFeedScreen
              kind={truthSectionView}
              externalItems={truthSectionView === "all" ? allTruthFeedItems : []}
            uploadRequest={textCardReturnRequest}
            onRefresh={() => loadTruthPosts(true, "feed")}
            deadlineReviewOpen={deadlineReviewOpen}
            onDeadlineReviewOpenChange={setDeadlineReviewOpen}
            onDeadlineReviewCountChange={setDeadlineReviewCount}
          />
          ) : (
            <div
              ref={truthReelContainerRef}
              onTouchStart={handleTruthPullStart}
              onTouchMove={handleTruthPullMove}
              onTouchEnd={handleTruthPullEnd}
              onTouchCancel={handleTruthPullEnd}
              data-active-truth-index={currentTruthIndex}
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                overflowX: "hidden",
                scrollSnapType: "y mandatory",
                scrollBehavior: "auto",
                WebkitOverflowScrolling: "touch",
                touchAction: "pan-y",
                overscrollBehavior: "contain",
                position: "relative",
                contain: "layout paint style",
                willChange: "scroll-position",
              }}
            >
              {orderedTruthPosts.length > 0 ? (
                orderedTruthPosts.map((post, index) => (
                  <div
                    key={`truth-reel-${post.id}-${index}`}
                    data-truth-reel-index={String(index)}
                    style={{
                      height: "100%",
                      minHeight: "100%",
                      scrollSnapAlign: "start",
                      scrollSnapStop: "always",
                      overflow: "hidden",
                      position: "relative",
                      contain: "layout paint style",
                      contentVisibility: index === currentTruthIndex ? "visible" : "auto",
                      containIntrinsicSize: "100dvh",
                    }}
                  >
                    <SwipeableTruthCard
                      post={post}
                      onVoteClick={handleTruthVoteClick}
                      onOpenVoteModal={handleOpenTruthModal}
                      onOpenConversation={setSelectedTruthConversation}
                      cardIndex={0}
                      currentIndex={0}
                      isDragging={false}
                      isCurrentCard={index === currentTruthIndex}
                      lockInternalScroll
                      compactTopInset
                      onNavigateToProfile={_onNavigateToProfile}
                    />
                  </div>
                ))
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    gap: "12px",
                  }}
                >
                  {loadingTruth ? (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/78 text-white shadow-[0_20px_48px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.14)]">
                      <RefreshCw size={20} strokeWidth={2.2} className="animate-spin" />
                    </div>
                  ) : (
                    <div style={{ fontSize: "36px" }}>?</div>
                  )}
                  <p
                    style={{
                      color: "rgba(255,255,255,0.5)",
                      fontSize: "15px",
                      fontWeight: 600,
                      margin: 0,
                    }}
                  >
                    {loadingTruth
                      ? "Loading truth questions..."
                      : "No approved truths yet"}
                  </p>
                  <p
                    style={{
                      color: "rgba(255,255,255,0.2)",
                      fontSize: "13px",
                      margin: 0,
                    }}
                  >
                    {loadingTruth
                      ? "Dare someone to reveal their truth"
                      : "Approved truth answers will appear here"}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {selectedCommunityChallenge && (
        <CommunityChallengePreviewScreen
          challenge={selectedHydratedCommunityChallenge || selectedCommunityChallenge}
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
            communityChallengeSummaries={communityChallengeSummaries}
            customCommunityChallenges={customCommunityChallenges}
            registeredChallengeIds={joinedCommunityChallengeIds}
          />
        </div>
      )}
      {selectedTruthConversation && (
        <TruthConversationScreen
          post={selectedTruthConversation}
          onClose={() => setSelectedTruthConversation(null)}
          onNavigateToProfile={_onNavigateToProfile}
        />
      )}
      {selectedDare && (
        <DareVoteModal
          isOpen={showVoteModal}
          onClose={handleCloseVoteModal}
          dare={selectedDare}
        />
      )}
      {selectedTruth && (
        <TruthVoteModal
          isOpen={showTruthModal}
          onClose={handleCloseTruthModal}
          post={selectedTruth}
          initialTab={truthModalTab}
        />
      )}
      {reelCommentsDare && (
        <ReelCommentsModal
          isOpen={!!reelCommentsDare}
          onClose={() => setReelCommentsDare(null)}
          dare={reelCommentsDare}
        />
      )}
      {reelShareDare && (
        <ReelShareModal
          isOpen={!!reelShareDare}
          onClose={() => setReelShareDare(null)}
          dare={reelShareDare}
        />
      )}
    </div>
  );
}

