"use client";
import { useCirclesStore } from "@/stores/useCirclesStore";
import { circlesService } from "@/middleware/services/circles.service";

import React, { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  UserPlus,
  Check,
  Users,
  MessageCircle,
  X,
  Grid3X3,
  Play,
  Target,
  MessageSquare,
  Eye,
  Heart,
  Star,
  ChevronRight,
} from "lucide-react";
import { useUserProfileStore } from "../../stores/useUserProfileStore";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { usePostsStore } from "../../stores/usePostsStore";
import { useTruthStore } from "../../stores/useTruthStore";
import { useDareStore } from "../../stores/useDareStore";
import { useTruthInteractionStore } from "../../stores/useTruthInteractionStore";
import { useDareInteractionStore } from "../../stores/useDareInteractionStore";
import { Avatar } from "../ui/Avatar";
import { CommentSection, type CommentItem } from "../ui/CommentSection";
import { formatTimeAgo } from "../../utils/timeFormat";
import { formatJoinDate } from "../../utils/profileDateFormat";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { commentLikePersistence } from "../../utils/commentLikePersistence";
import { PostsScreen } from "./PostsScreen";
import { TruthsListScreen } from "./TruthsListScreen";
import { DaresListScreen } from "./DaresListScreen";
import { RelationshipsScreen } from "./RelationshipsScreen";
import {
  SocialProfileView,
  socialProfileActionClass,
  socialProfilePrimaryActionClass,
} from "../profile/SocialProfileView";
import {
  truthService,
  dareService,
  userService,
  closeFriendsService,
} from "../../middleware/services/service-factory";
import { resolveUserProfile } from "../../utils/profileResolver";
import { getStickmanCustomization } from "../../services/stickmanCustomizationService";
import type {
  TruthPost as FeedTruthPost,
  DarePost as FeedDarePost,
} from "../../middleware/adapters/data-adapters";

interface UserProfileScreenProps {
  onBack: () => void;
  userId: string;
  onMessage?: (targetUserId: string, targetUsername: string) => void;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToTruthPost?: (truth: FeedTruthPost) => void;
  onNavigateToDarePost?: (dare: FeedDarePost) => void;
  initialPostId?: string;
  initialCommentId?: string;
  initialTruthId?: string;
  initialDareId?: string;
}

type PublishedTruthCard = FeedTruthPost;

type PublishedDareCard = FeedDarePost;

interface ProfileCommentPreview {
  id: string;
  displayName: string;
  avatarUrl: string;
  text: string;
  createdAt: string;
}

async function fetchContentProfile(userId: string): Promise<any | null> {
  if (!userId) return null;
  return resolveUserProfile(userId);
}

function extractProfileName(profile: any, fallback: string) {
  return (
    profile?.displayName ||
    profile?.username ||
    profile?.nickname ||
    profile?.display_name ||
    fallback
  );
}

function extractProfileAvatar(profile: any) {
  return profile?.avatarUrl || profile?.avatar_url || "/default-avatar.png";
}

function formatProfileTime(timestamp: any): string {
  if (!timestamp) return "Recently";
  let formatted = "Recently";
  if (typeof timestamp === "object" && timestamp !== null) {
    if ("toDate" in timestamp && typeof timestamp.toDate === "function") {
      formatted = formatTimeAgo(timestamp.toDate().toISOString());
    } else if ("seconds" in timestamp && "nanoseconds" in timestamp) {
      formatted = formatTimeAgo(
        new Date(timestamp.seconds * 1000).toISOString(),
      );
    }
  } else if (typeof timestamp === "string") {
    formatted = formatTimeAgo(timestamp);
  }
  return formatted === "just now" ? "Recently" : formatted;
}
// PostAvatar now uses the global Avatar component for consistent avatar handling
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
      size={size >= 52 ? "xl" : size >= 48 ? "lg" : size >= 40 ? "md" : "sm"}
      fallbackText={name?.charAt(0)?.toUpperCase()}
      className={className}
      userId={userId}
      username={username}
    />
  );
}

function ProfilePostAvatar({
  src,
  name,
  size = 52,
}: {
  src?: string;
  name: string;
  size?: number;
}) {
  return <PostAvatar src={src} name={name} size={size} />;
}

function TruthReplicaCard({
  truth,
  comments,
  commentCount,
  voteCount,
  onVoteClick,
  onOpenVoteModal,
}: {
  truth: PublishedTruthCard;
  comments: ProfileCommentPreview[];
  commentCount: number;
  voteCount: number;
  onVoteClick?: (truth: PublishedTruthCard, vote: "truth" | "lie") => void;
  onOpenVoteModal?: (
    truth: PublishedTruthCard,
    tab: "truth" | "lie" | "comments",
  ) => void;
}) {
  const { getUserVote, setUserVote } = useTruthInteractionStore();
  const priorVote = getUserVote(truth.id);
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
    if (!vote) return;
    setUserVote(truth.id, vote);
    onVoteClick?.(truth, vote);
    setPhase("voted");
  };

  return (
    <div
      className="bg-[#1a1a1a] rounded-2xl p-4 mb-4 border border-gray-800 card transition-all duration-300 w-full overflow-hidden"
      style={{
        WebkitTapHighlightColor: "transparent",
        outline: "none",
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
        padding: "16px",
      }}
    >
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
          src={truth.challenger.avatar}
          name={truth.challenger.nickname}
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
          {truth.challenger.nickname.split(" ")[0]}
        </span>
        <span
          style={{
            color: "#86efac",
            fontWeight: 950,
            fontSize: "13px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            textShadow: "0 0 14px rgba(74,222,128,0.34)",
            whiteSpace: "nowrap",
            flexShrink: 0,
            animation: "truthFade 3s ease-in-out infinite",
          }}
        >
          Asked
        </span>
        <PostAvatar
          src={truth.receiver.avatar}
          name={truth.receiver.nickname}
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
          {truth.receiver.nickname.split(" ")[0]}
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
      <div className="bg-[#2a2a2a] rounded-xl p-5 mt-2 mb-4">
        <p className="text-white font-semibold text-lg leading-snug">
          {truth.question}
        </p>
      </div>

      {truth.answer && (
        <div className="mb-4 mt-4">
          <div className="flex items-start space-x-4">
            <PostAvatar
              src={truth.receiver.avatar}
              name={truth.receiver.nickname}
              size={48}
              className="w-12 h-12 rounded-full object-cover shrink-0 mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                <span className="text-white font-semibold text-base truncate">
                  {truth.receiver.nickname}
                </span>
                <span className="text-gray-400 text-sm shrink-0">
                  {formatProfileTime(truth.createdAt)}
                </span>
              </div>
              <p className="text-white text-base leading-relaxed">
                {truth.answer}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col pt-3 border-t border-gray-800 gap-3">
        {truth.answer && (
          <div className="flex items-center space-x-5">
            <button
              type="button"
              onClick={() => onOpenVoteModal?.(truth, "truth")}
              className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors"
            >
              <Heart size={19} />
              <span className="text-sm">{voteCount}</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenVoteModal?.(truth, "comments")}
              className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors"
            >
              <MessageCircle size={19} />
              <span className="text-sm">{commentCount}</span>
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
                  "expandBtn 0.8s cubic-bezier(0.34,1.56,0.64,1) forwards",
              }}
            >
              {vote === "truth"
                ? "You think this is the Truth ✓"
                : "You think this is a Lie ✓"}
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
            <button
              type="button"
              onClick={() => onOpenVoteModal?.(truth, vote || "truth")}
              style={{
                width: "100%",
                background: "none",
                border: "none",
                padding: 0,
                color: vote === "truth" ? "#4ade80" : "rgba(255,255,255,0.6)",
                fontWeight: 700,
                fontSize: "15px",
                cursor: "pointer",
              }}
            >
              You voted: {vote === "truth" ? "Truth ✓" : "Lie ✓"}
            </button>
          </div>
        )}
        {comments.length > 0 && (
          <div className="mt-4 rounded-xl border border-gray-800 bg-[#202020] p-3">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">
              Comments
            </div>
            <div className="space-y-3">
              {comments.slice(0, 2).map((comment) => (
                <div key={comment.id} className="flex items-start gap-3">
                  <ProfilePostAvatar
                    src={comment.avatarUrl}
                    name={comment.displayName}
                    size={32}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-white">
                        {comment.displayName}
                      </span>
                      <span className="shrink-0 text-xs text-[#64748b]">
                        {formatTimeAgo(comment.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm leading-6 text-[#d1d5db]">
                      {comment.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <style>{`
          @keyframes expandBtn { from { width: 50%; opacity: 0.5; transform: scale(0.93); } to { width: 80%; opacity: 1; transform: scale(1); } }
          @keyframes truthFade { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
          @keyframes btnPulseTruth { 0%{box-shadow:0 0 0px 0px rgba(74,222,128,0);opacity:0.72} 15%{box-shadow:0 0 22px 6px rgba(74,222,128,0.4);opacity:1} 35%{box-shadow:0 0 0px 0px rgba(74,222,128,0);opacity:0.72} 100%{box-shadow:0 0 0px 0px rgba(74,222,128,0);opacity:0.72} }
          @keyframes btnPulseLie { 0%{box-shadow:0 0 0px 0px rgba(255,255,255,0);opacity:0.72} 55%{box-shadow:0 0 0px 0px rgba(255,255,255,0);opacity:0.72} 70%{box-shadow:0 0 22px 6px rgba(255,255,255,0.18);opacity:1} 88%{box-shadow:0 0 0px 0px rgba(255,255,255,0);opacity:0.72} 100%{box-shadow:0 0 0px 0px rgba(255,255,255,0);opacity:0.72} }
          .card:focus, .card:active { outline: none !important; box-shadow: none !important; }
        `}</style>
      </div>
    </div>
  );
}

function DareReplicaCard({
  dare,
  viewCount,
  voteCount,
  commentCount,
  comments,
  onVoteClick,
  onOpenComments,
}: {
  dare: PublishedDareCard;
  viewCount: number;
  voteCount: number;
  commentCount: number;
  comments: ProfileCommentPreview[];
  onVoteClick?: (dare: PublishedDareCard) => void;
  onOpenComments?: (dare: PublishedDareCard) => void;
}) {
  const { getUserVote, setUserVote } = useDareInteractionStore();
  const priorVote = getUserVote(dare.id);
  const [vote, setVote] = useState<"real" | "fake" | null>(priorVote);
  const [phase, setPhase] = useState<"idle" | "confirming" | "voted">(
    priorVote ? "voted" : "idle",
  );
  const challengerName = dare.challenger.nickname;
  const receiverName = dare.receiver.nickname;
  const challengerAvatar = dare.challenger.avatar;
  const proofUrl = dare.proof?.url;
  const proofType = dare.proof?.type;
  const proofThumb = dare.proof?.thumbnail || proofUrl;
  const isVideo = String(proofType || "").toLowerCase() === "video";
  const hasVoted = phase === "voted" && vote !== null;

  const handleVote = (choice: "real" | "fake") => {
    if (phase !== "idle") return;
    setVote(choice);
    setPhase("confirming");
  };

  const handleConfirm = () => {
    if (!vote) return;
    setUserVote(dare.id, vote);
    setPhase("voted");
    onVoteClick?.(dare);
  };

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
          <ProfilePostAvatar
            src={challengerAvatar}
            name={challengerName}
            size={52}
          />
          <span
            style={{
              color: "#fff",
              fontWeight: 700,
              fontSize: "19px",
              whiteSpace: "nowrap",
            }}
          >
            {challengerName.split(" ")[0]}
          </span>
          <span
            style={{
              color: "#4ade80",
              fontWeight: 800,
              fontSize: "19px",
              whiteSpace: "nowrap",
            }}
          >
            {receiverName.split(" ")[0]}
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
      {proofUrl && (
        <div
          className="bg-[#1a1a1a] rounded-2xl border border-gray-800 mx-4 mb-4 overflow-hidden"
          style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.5)" }}
        >
          <div
            style={{
              borderRadius: "16px",
              overflow: "hidden",
              position: "relative",
            }}
          >
            {isVideo ? (
              <div
                style={{ position: "relative", width: "100%", height: "32rem" }}
              >
                <img
                  src={proofThumb}
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
            ) : (
              <img
                src={proofUrl}
                alt="Dare proof"
                style={{
                  width: "100%",
                  height: "32rem",
                  objectFit: "cover",
                  display: "block",
                }}
              />
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
                  val: viewCount,
                },
                {
                  icon: <Heart size={14} color="rgba(255,255,255,0.85)" />,
                  val: voteCount,
                },
                {
                  icon: (
                    <MessageCircle size={14} color="rgba(255,255,255,0.85)" />
                  ),
                  val: commentCount,
                },
              ].map((item, i) => (
                <div
                  key={`profile-dare-chip-${dare.id}-${i}`}
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
        <div style={{ display: "flex", justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => onVoteClick?.(dare)}
            style={{
              width: "80%",
              padding: "14px",
              borderRadius: "14px",
              border: "none",
              background: "#4ade80",
              color: "#000",
              fontWeight: 800,
              fontSize: "17px",
              textAlign: "center",
              cursor: "pointer",
            }}
          >
            Completed • Real
          </button>
        </div>
        {comments.length > 0 && (
          <div className="mt-4 rounded-xl border border-gray-800 bg-[#202020] p-3">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#64748b]">
              Comments
            </div>
            <div className="space-y-3">
              {comments.slice(0, 2).map((comment) => (
                <div key={comment.id} className="flex items-start gap-3">
                  <ProfilePostAvatar
                    src={comment.avatarUrl}
                    name={comment.displayName}
                    size={32}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-white">
                        {comment.displayName}
                      </span>
                      <span className="shrink-0 text-xs text-[#64748b]">
                        {formatTimeAgo(comment.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm leading-6 text-[#d1d5db]">
                      {comment.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function UserProfileScreen({
  onBack,
  userId,
  onMessage,
  onNavigateToProfile,
  onNavigateToTruthPost,
  onNavigateToDarePost,
  initialPostId,
  initialCommentId,
  initialTruthId,
  initialDareId,
}: UserProfileScreenProps) {
  const circleId=useCirclesStore(s=>s.activeId);
  const [circleAura,setCircleAura]=useState(100);
  useEffect(()=>{let alive=true;setCircleAura(100);if(circleId)circlesService.aura(circleId,userId).then(value=>{if(alive)setCircleAura(value);}).catch(()=>{});return()=>{alive=false;};},[circleId,userId]);
  const [friendRequestSent, setFriendRequestSent] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [activeTab, setActiveTab] = useState<"posts" | "truths" | "dares">(
    "posts",
  );
  const [showPostsScreen, setShowPostsScreen] = useState(false);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [showAvatarPreview, setShowAvatarPreview] = useState(false);
  const [friendsList, setFriendsList] = useState<any[]>([]);
  const [showTruthsListScreen, setShowTruthsListScreen] = useState(false);
  const [showDaresListScreen, setShowDaresListScreen] = useState(false);
  const [showRelationshipsScreen, setShowRelationshipsScreen] = useState(false);
  const [selectedTruthId, setSelectedTruthId] = useState<string | undefined>(
    undefined,
  );
  const [selectedDareId, setSelectedDareId] = useState<string | undefined>(
    undefined,
  );
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [isCloseFriend, setIsCloseFriend] = useState(false);
  const [closeFriendBusy, setCloseFriendBusy] = useState(false);
  const [showUnfriendModal, setShowUnfriendModal] = useState(false);
  const [isUnfriending, setIsUnfriending] = useState(false);
  const [publishedTruths, setPublishedTruths] = useState<PublishedTruthCard[]>(
    [],
  );
  const [publishedDares, setPublishedDares] = useState<PublishedDareCard[]>([]);
  const [loadingPublishedTruths, setLoadingPublishedTruths] = useState(false);
  const [loadingPublishedDares, setLoadingPublishedDares] = useState(false);
  const consumedInitialPostsLinkRef = useRef<string | null>(null);
  const consumedInitialTruthLinkRef = useRef<string | null>(null);
  const consumedInitialDareLinkRef = useRef<string | null>(null);
  const friendsCapsuleLongPressTimerRef = useRef<number | null>(null);
  const friendsCapsuleLongPressTriggeredRef = useRef(false);
  const stripAtSymbol = (username?: string) =>
    (username || "unknown").replace(/^@/, "");

  const {
    profile,
    friends,
    isFriend,
    friendshipStatus,
    friendsCount,
    loading,
    error,
    loadProfile,
    sendFriendRequest,
    cancelFriendRequest,
    unfriendUser,
    checkFriendshipStatus,
  } = useUserProfileStore();

  const { user: currentUser } = useAuthStore();

  const {
    posts: storePosts,
    userPosts,
    loadUserPosts,
    loadingUserPosts,
    subscribeToUserPosts,
    unsubscribeFromUserPosts,
  } = usePostsStore();
  const { sentDares, receivedDares, loadUserDares } = useDareStore();
  const { sentTruths, receivedTruths, loadUserTruths } = useTruthStore();
  const truthCommentsMap = useTruthInteractionStore((s) => s.comments);
  const truthVoteDataMap = useTruthInteractionStore((s) => s.voteData);
  const subscribeToTruthComments = useTruthInteractionStore(
    (s) => s.subscribeToComments,
  );
  const unsubscribeFromTruthComments = useTruthInteractionStore(
    (s) => s.unsubscribeFromComments,
  );
  const subscribeToTruthVotes = useTruthInteractionStore(
    (s) => s.subscribeToVotes,
  );
  const unsubscribeFromTruthVotes = useTruthInteractionStore(
    (s) => s.unsubscribeFromVotes,
  );
  const dareCommentsMap = useDareInteractionStore((s) => s.comments);
  const dareCommentCounts = useDareInteractionStore((s) => s.commentCounts);
  const dareViewCounts = useDareInteractionStore((s) => s.viewCounts);
  const dareVoteDataMap = useDareInteractionStore((s) => s.voteData);
  const subscribeToDareComments = useDareInteractionStore(
    (s) => s.subscribeToComments,
  );
  const unsubscribeFromDareComments = useDareInteractionStore(
    (s) => s.unsubscribeFromComments,
  );
  const subscribeToDareCommentCount = useDareInteractionStore(
    (s) => s.subscribeToCommentCount,
  );
  const subscribeToDareViewCount = useDareInteractionStore(
    (s) => s.subscribeToViewCount,
  );
  const unsubscribeFromDareCommentCount = useDareInteractionStore(
    (s) => s.unsubscribeFromCommentCount,
  );
  const unsubscribeFromDareViewCount = useDareInteractionStore(
    (s) => s.unsubscribeFromViewCount,
  );
  const subscribeToDareVotes = useDareInteractionStore(
    (s) => s.subscribeToVotes,
  );
  const unsubscribeFromDareVotes = useDareInteractionStore(
    (s) => s.unsubscribeFromVotes,
  );

  // Load profile and user content on component mount
  useEffect(() => {
    if (userId) {
      loadProfile(userId);
      loadUserPosts(userId);
      loadUserDares(userId, "all");
      loadUserTruths(userId, "all");

      return () => {
        if (currentUser?.id && currentUser.id !== userId) {
          loadUserPosts(currentUser.id);
        }
      };
    }
  }, [
    userId,
    currentUser?.id,
    loadProfile,
    loadUserPosts,
    loadUserDares,
    loadUserTruths,
  ]);

  useEffect(() => {
    let isMounted = true;

    const loadPublishedCards = async () => {
      if (!userId) return;

      setLoadingPublishedTruths(true);
      setLoadingPublishedDares(true);

      try {
        const [truthResponse, dareResponse] = await Promise.all([
          truthService.getUserTruths(userId, "all"),
          dareService.getDaresForUser(userId),
        ]);

        const truthEntities =
          (truthResponse.success ? truthResponse.truths : []) || [];
        const dareEntities =
          (dareResponse.success ? dareResponse.dares : []) || [];

        const builtTruths = await Promise.all(
          truthEntities
            .filter(
              (truth: any) =>
                truth.state === "APPROVED" &&
                (truth.answer || truth.state !== "SENT"),
            )
            .map(async (truth: any) => {
              const [challengerProfile, receiverProfile] = await Promise.all([
                fetchContentProfile(truth.challengerId),
                fetchContentProfile(truth.receiverId),
              ]);

              return {
                id: truth.id,
                challengerId: truth.challengerId,
                receiverId: truth.receiverId,
                challenger: {
                  nickname: extractProfileName(
                    challengerProfile,
                    truth.challengerId || "Someone",
                  ),
                  avatar: extractProfileAvatar(challengerProfile),
                },
                receiver: {
                  nickname: extractProfileName(
                    receiverProfile,
                    truth.receiverId || "Someone",
                  ),
                  avatar: extractProfileAvatar(receiverProfile),
                },
                question: truth.question,
                state: truth.state,
                createdAt:
                  truth.reviewedAt ||
                  truth.answeredAt ||
                  truth.updatedAt ||
                  truth.createdAt,
                answer: truth.answer,
              } as PublishedTruthCard;
            }),
        );

        const builtDares = await Promise.all(
          dareEntities
            .filter(
              (dare: any) =>
                dare.state === "ACCEPTED_REAL" && !!dare.proofMediaUrl,
            )
            .map(async (dare: any) => {
              const [challengerProfile, receiverProfile] = await Promise.all([
                fetchContentProfile(dare.challengerId),
                fetchContentProfile(dare.receiverId),
              ]);

              return {
                id: dare.id,
                challengerId: dare.challengerId,
                receiverId: dare.receiverId,
                challenger: {
                  nickname: extractProfileName(
                    challengerProfile,
                    dare.challengerId || "Someone",
                  ),
                  avatar: extractProfileAvatar(challengerProfile),
                },
                receiver: {
                  nickname: extractProfileName(
                    receiverProfile,
                    dare.receiverId || "Someone",
                  ),
                  avatar: extractProfileAvatar(receiverProfile),
                },
                description: dare.description,
                proof: {
                  type: dare.proofMediaType === "VIDEO" ? "video" : "image",
                  url: dare.proofMediaUrl,
                  thumbnail: dare.proofMediaUrl,
                },
                state: dare.state,
                createdAt: dare.completedAt || dare.updatedAt || dare.createdAt,
              } as PublishedDareCard;
            }),
        );

        if (!isMounted) return;

        setPublishedTruths(
          builtTruths.sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          ),
        );
        setPublishedDares(
          builtDares.sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          ),
        );
      } catch (error) {
        console.error("Error loading published user cards:", error);
        if (isMounted) {
          setPublishedTruths([]);
          setPublishedDares([]);
        }
      } finally {
        if (isMounted) {
          setLoadingPublishedTruths(false);
          setLoadingPublishedDares(false);
        }
      }
    };

    void loadPublishedCards();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  useEffect(() => {
    if (activeTab === "posts") {
      return;
    }

    const truthIds = publishedTruths.map((truth) => truth.id);

    truthIds.forEach((truthId) => {
      subscribeToTruthComments(truthId);
      if (currentUser?.id) {
        subscribeToTruthVotes(truthId, currentUser.id);
      }
    });

    return () => {
      truthIds.forEach((truthId) => {
        unsubscribeFromTruthComments(truthId);
        unsubscribeFromTruthVotes(truthId);
      });
    };
  }, [
    publishedTruths,
    subscribeToTruthComments,
    subscribeToTruthVotes,
    unsubscribeFromTruthComments,
    unsubscribeFromTruthVotes,
    currentUser?.id,
    activeTab,
  ]);

  useEffect(() => {
    if (activeTab === "posts") {
      return;
    }

    const dareIds = publishedDares.map((dare) => dare.id);

    dareIds.forEach((dareId) => {
      subscribeToDareCommentCount(dareId);
      subscribeToDareViewCount(dareId);
    });

    return () => {
      dareIds.forEach((dareId) => {
        unsubscribeFromDareCommentCount(dareId);
        unsubscribeFromDareViewCount(dareId);
      });
    };
  }, [
    publishedDares,
    subscribeToDareCommentCount,
    subscribeToDareViewCount,
    unsubscribeFromDareCommentCount,
    unsubscribeFromDareViewCount,
    activeTab,
  ]);

  // Update local state when friendship status changes
  useEffect(() => {
    setFriendRequestSent(friendshipStatus === "pending");
  }, [friendshipStatus]);

  // Re-check friendship status periodically
  useEffect(() => {
    if (!userId || !currentUser?.id) {
      return;
    }

    const refreshFriendshipStatus = () => {
      checkFriendshipStatus(userId);
    };

    refreshFriendshipStatus();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshFriendshipStatus();
      }
    };

    const handleFocus = () => {
      refreshFriendshipStatus();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [userId, currentUser?.id, checkFriendshipStatus]);

  useEffect(() => {
    let isMounted = true;

    const loadCloseFriendStatus = async () => {
      if (!currentUser?.id || currentUser.id === userId || !isFriend) {
        if (isMounted) {
          setIsCloseFriend(false);
        }
        return;
      }

      const response = await closeFriendsService.isCloseFriend(
        currentUser.id,
        userId,
      );

      if (isMounted) {
        setIsCloseFriend(!!response.isCloseFriend);
      }
    };

    void loadCloseFriendStatus();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.id, userId, isFriend]);

  const handleSendFriendRequest = async () => {
    if (!currentUser?.id) return;
    setIsAnimating(true);
    try {
      const success = await sendFriendRequest(userId);
      if (success) {
        setFriendRequestSent(true);
        await checkFriendshipStatus(userId);
      }
    } catch (error) {
      console.error("Error sending friend request:", error);
    } finally {
      setIsAnimating(false);
    }
  };

  const handleResendFriendRequest = async () => {
    if (!currentUser?.id) return;
    setIsCancelling(true);
    try {
      const success = await cancelFriendRequest(userId);
      if (success) {
        setFriendRequestSent(false);
        await checkFriendshipStatus(userId);
        console.log("Friend request cancelled successfully");
      }
    } catch (error) {
      console.error("Error cancelling friend request:", error);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleToggleCloseFriend = async () => {
    if (!currentUser?.id || currentUser.id === userId || !isFriend) return;

    setCloseFriendBusy(true);
    try {
      const response = isCloseFriend
        ? await closeFriendsService.removeCloseFriend(currentUser.id, userId)
        : await closeFriendsService.addCloseFriend(currentUser.id, userId);

      if (response.success) {
        setIsCloseFriend(!isCloseFriend);
      }
    } catch (error) {
      console.error("Error toggling close friend:", error);
    } finally {
      setCloseFriendBusy(false);
    }
  };

  const clearFriendsCapsuleLongPress = () => {
    if (friendsCapsuleLongPressTimerRef.current !== null) {
      window.clearTimeout(friendsCapsuleLongPressTimerRef.current);
      friendsCapsuleLongPressTimerRef.current = null;
    }
  };

  const handleFriendsCapsulePressStart = () => {
    if (!showFriendsButton) return;
    friendsCapsuleLongPressTriggeredRef.current = false;
    clearFriendsCapsuleLongPress();
    friendsCapsuleLongPressTimerRef.current = window.setTimeout(() => {
      friendsCapsuleLongPressTriggeredRef.current = true;
      setShowUnfriendModal(true);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.(12);
      }
    }, 650);
  };

  const handleFriendsCapsulePressEnd = () => {
    clearFriendsCapsuleLongPress();
  };

  const handleFriendsCapsuleClick = () => {
    if (friendsCapsuleLongPressTriggeredRef.current) {
      friendsCapsuleLongPressTriggeredRef.current = false;
      return;
    }
    setShowFriendsModal(true);
    setLoadingFriends(true);
    handleFriendsClick();
  };

  // Filter posts by the current user
  const userFeedPosts = userPosts.filter((post) => {
    const postAuthorId = post.author?.id;
    return postAuthorId === userId;
  });

  useEffect(() => {
    if (!initialPostId) return;
    if (!userFeedPosts.some((post) => post.id === initialPostId)) return;
    const linkKey = `${initialPostId}:${initialCommentId || ""}`;
    if (consumedInitialPostsLinkRef.current === linkKey) return;
    consumedInitialPostsLinkRef.current = linkKey;
    setShowPostsScreen(true);
  }, [initialCommentId, initialPostId, userFeedPosts]);

  useEffect(() => {
    if (!initialTruthId) return;
    if (!publishedTruths.some((truth) => truth.id === initialTruthId)) return;
    if (consumedInitialTruthLinkRef.current === initialTruthId) return;
    consumedInitialTruthLinkRef.current = initialTruthId;
    setShowTruthsListScreen(true);
  }, [initialTruthId, publishedTruths]);

  useEffect(() => {
    if (!initialDareId) return;
    if (!publishedDares.some((dare) => dare.id === initialDareId)) return;
    if (consumedInitialDareLinkRef.current === initialDareId) return;
    consumedInitialDareLinkRef.current = initialDareId;
    setShowDaresListScreen(true);
  }, [initialDareId, publishedDares]);

  const userAllDares = [...sentDares, ...receivedDares].filter(
    (dare) => dare.challenger_id === userId || dare.receiver_id === userId,
  );
  const userAllTruths = [...sentTruths, ...receivedTruths].filter(
    (truth) => truth.challengerId === userId || truth.receiverId === userId,
  );
  // Keep both sides of the user's truth history available to the shared profile
  // view so received questions can lead the Drama tab while posted verdicts stay
  // available at the end.
  const profileTruths = Array.from(
    new Map(
      [...publishedTruths, ...userAllTruths]
        .filter((truth: any) => !truth.state || truth.state === "APPROVED")
        .map((truth: any) => [truth.id, truth]),
    ).values(),
  );
  const completedTruths = userAllTruths.filter(
    (truth: any) => truth.state === "APPROVED",
  );
  const completedDares = userAllDares.filter(
    (dare: any) => dare.state === "ACCEPTED_REAL",
  );

  // Handler for opening friends modal
  const handleFriendsClick = async () => {
    if (!userId) return;
    try {
      const { friendsService } =
        await import("@/middleware/services/service-factory");
      const [response, closeFriendResponse] = await Promise.all([
        friendsService.getFriends(userId),
        currentUser?.id && currentUser.id !== userId && isFriend
          ? closeFriendsService.isCloseFriend(currentUser.id, userId)
          : Promise.resolve({ success: true, isCloseFriend: false }),
      ]);
      const friends = response.success ? response.friends || [] : [];
      setFriendsList(friends);
      setIsCloseFriend(!!closeFriendResponse.isCloseFriend);
    } catch (error) {
      console.error("Error loading friends:", error);
      setFriendsList([]);
    } finally {
      setLoadingFriends(false);
    }
  };

  // Handler for unfriending a user
  const handleUnfriend = async () => {
    if (!userId) return;

    setIsUnfriending(true);
    try {
      const success = await unfriendUser(userId);
      if (success) {
        if (currentUser?.id) {
          await closeFriendsService.removeCloseFriend(currentUser.id, userId);
        }
        setIsCloseFriend(false);
        setShowUnfriendModal(false);
        await checkFriendshipStatus(userId);
        // Remove user's posts from feed (Instagram-like behavior)
        const { usePostsStore } = await import("../../stores/usePostsStore");
        const postsStore = usePostsStore.getState();
        const filteredPosts = postsStore.posts.filter(
          (post) => post.author?.id !== userId,
        );
        usePostsStore.setState({ posts: filteredPosts });
      }
    } catch (error) {
      console.error("Error unfriending user:", error);
    } finally {
      setIsUnfriending(false);
    }
  };

  if (loading) {
    return (
      <div className="screen-container bg-black min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#4ade80] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="screen-container bg-black min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-lg mb-4">{error || "User not found"}</p>
          <button
            onClick={onBack}
            className="bg-[#4ade80] text-black px-6 py-2 rounded-full font-semibold hover:bg-[#22c55e] transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const showFriendButton =
    currentUser?.id !== userId && !isFriend && friendshipStatus === "none";
  const showPendingButton =
    currentUser?.id !== userId && friendshipStatus === "pending";
  const showFriendsButton = currentUser?.id !== userId && isFriend;

  return (
    <div
      className="screen-container"
      style={{
        height: "100%",
        minHeight: "100dvh",
        overflowX: "hidden",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        overscrollBehaviorY: "contain",
        background:
          "linear-gradient(180deg, #141414 0%, #0e0e0e 52%, #0a0a0a 100%)",
        fontFamily:
          "var(--font-ui)",
      }}
    >
      <style>{`
        .profile-hero-card {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .profile-proof-stat-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0;
          min-width: 0;
        }
        .profile-proof-stat {
          position: relative;
          min-width: 0;
          border: 0;
          background: transparent;
          padding: 6px 7px;
          text-align: center;
          color: #fff;
          border-radius: 18px;
          transition: background 180ms ease, transform 180ms ease;
        }
        .profile-proof-stat:not(:first-child)::before {
          content: "";
          position: absolute;
          left: 0;
          top: 18%;
          bottom: 18%;
          width: 1px;
          background: rgba(255,255,255,0.08);
        }
        .profile-proof-stat:hover {
          background: rgba(255,255,255,0.04);
        }
        .profile-proof-stat-value {
          display: block;
          font-size: 21px;
          font-weight: 950;
          line-height: 1;
          letter-spacing: 0;
          color: #fff;
        }
        .profile-proof-stat-label {
          display: block;
          margin-top: 5px;
          font-size: 10px;
          font-weight: 900;
          line-height: 1;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #64748b;
        }
        @media (max-width: 380px) {
          .profile-hero-card {
            padding: 6px 4px 12px !important;
          }
          .profile-proof-stat {
            padding-left: 4px;
            padding-right: 4px;
          }
          .profile-proof-stat-value {
            font-size: 18px;
          }
          .profile-proof-stat-label {
            font-size: 9px;
          }
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
        .activity-radar-orb {
          position: relative;
          z-index: 1;
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
        .profile-posts-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }
        @media (max-width: 380px) {
          .profile-posts-grid {
            gap: 14px;
          }
        }
      `}</style>
      {/* Header */}
      <div
        className="animate-fade-in-up"
        style={{
          padding: "calc(var(--safe-area-top) + 12px) 14px 12px",
          maxWidth: "430px",
          margin: "0 auto",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={onBack}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[17px] border border-white/8 bg-white/[0.045] text-[#94a3b8] shadow-[0_14px_34px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-200 hover:border-[#4ade80]/35 hover:bg-[#4ade80]/8 hover:text-white"
              aria-label="Back"
            >
              <ArrowLeft size={19} />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-[18px] font-[850] leading-tight tracking-[0] text-white">
                @{stripAtSymbol(profile.username)}
              </h1>
            </div>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[17px] border border-[#4ade80]/14 bg-[#4ade80]/[0.045] text-[#86efac] shadow-[0_14px_34px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)]">
            <Users size={18} />
          </div>
        </div>
      </div>

      {/* Show PostsScreen if navigation is triggered */}
      {showPostsScreen && (
        <div className="app-story-shell fixed inset-0 z-50 bg-black">
          <PostsScreen
            onBack={() => setShowPostsScreen(false)}
            posts={userFeedPosts}
            onNavigateToProfile={onNavigateToProfile}
            userName={profile.display_name || profile.username}
            targetUserId={userId}
            initialPostId={initialPostId}
            initialCommentId={initialCommentId}
          />
        </div>
      )}

      {/* Show TruthsListScreen if navigation is triggered */}
      {showTruthsListScreen && (
        <div className="app-story-shell fixed inset-0 z-50 bg-black">
          <TruthsListScreen
            userId={userId}
            onBack={() => {
              setShowTruthsListScreen(false);
              setSelectedTruthId(undefined);
            }}
            truthPosts={publishedTruths}
            loading={loadingPublishedTruths}
            initialTruthId={selectedTruthId || initialTruthId}
            titleName={profile.display_name || profile.username}
            onSelectTruth={(truth) => {
              setShowTruthsListScreen(false);
              setSelectedTruthId(undefined);
              onNavigateToTruthPost?.(truth);
            }}
          />
        </div>
      )}

      {/* Show DaresListScreen if navigation is triggered */}
      {showDaresListScreen && (
        <div className="app-story-shell fixed inset-0 z-50 bg-black">
          <DaresListScreen
            userId={userId}
            onBack={() => {
              setShowDaresListScreen(false);
              setSelectedDareId(undefined);
            }}
            darePosts={publishedDares}
            loading={loadingPublishedDares}
            initialDareId={selectedDareId || initialDareId}
            titleName={profile.display_name || profile.username}
            onSelectDare={(dare) => {
              setShowDaresListScreen(false);
              setSelectedDareId(undefined);
              onNavigateToDarePost?.(dare);
            }}
          />
        </div>
      )}

      <SocialProfileView
        username={profile.username}
        name={profile.display_name || profile.username}
        bio={profile.bio}
        avatarUrl={profile.avatar_url}
        profileUserId={userId}
        stickmanCustomization={getStickmanCustomization(profile)}
        aura={circleAura}
        friendsCount={friendsCount}
        posts={userFeedPosts.map((post) => ({
          id: post.id,
          content: post.content,
          media: post.media,
          likes: Number(post.likes_count || 0),
        }))}
        truths={profileTruths}
        dares={publishedDares}
        backedOutCount={userAllDares.filter((dare: any) => dare.state === "CHICKEN_OUT").length}
        activeTab={activeTab === "posts" ? "posts" : "drama"}
        onTabChange={(tab) => setActiveTab(tab === "posts" ? "posts" : "truths")}
        onOpenPost={() => setShowPostsScreen(true)}
        onOpenTruth={(truthId) => {
          setSelectedTruthId(truthId);
          setShowTruthsListScreen(true);
        }}
        onOpenDare={(dareId) => {
          setSelectedDareId(dareId);
          setShowDaresListScreen(true);
        }}
        onOpenFriends={isFriend ? handleFriendsCapsuleClick : undefined}
        onOpenRelationships={
          currentUser?.id && currentUser.id !== userId
            ? () => setShowRelationshipsScreen(true)
            : undefined
        }
        onOpenAvatar={() => setShowAvatarPreview(true)}
        showTopbar={false}
        canSeeContent={isFriend || currentUser?.id === userId}
        friendFaces={(friends || []).map((friend: any) => ({
          id: friend.userId || friend.id,
          name: friend.displayName || friend.display_name || friend.username,
          avatar: friend.avatarUrl || friend.avatar_url || friend.avatar,
        }))}
        actions={
          <>
            {showFriendButton && (
              <button
                type="button"
                onClick={handleSendFriendRequest}
                disabled={isAnimating}
                className={socialProfilePrimaryActionClass}
              >
                <UserPlus size={16} />
                {isAnimating ? "Sending…" : "Add friend"}
              </button>
            )}
            {showPendingButton && (
              <button
                type="button"
                onClick={handleResendFriendRequest}
                disabled={isCancelling}
                className={socialProfileActionClass}
              >
                <Check size={16} />
                {isCancelling ? "Cancelling…" : "Request sent"}
              </button>
            )}
          </>
        }
      />

      <div style={{ display: "none" }} aria-hidden="true">
      {/* Legacy profile markup retained temporarily while the new profile settles. */}
      {/* Profile Content */}
      <div className="custom-scrollbar flex-1 overflow-y-auto pb-[var(--bottom-nav-total-height)]">
        {/* Avatar and Basic Info */}
        <div className="mx-auto w-full max-w-[430px] px-3 pb-2">
          <div className="profile-hero-card relative mb-2 overflow-visible rounded-none border-0 bg-transparent px-1 pb-2 pt-1 shadow-none">
            <div className="relative z-10 flex w-full items-center gap-[18px]">
              <div className="relative shrink-0 overflow-visible">
                <button
                  type="button"
                  onClick={() => setShowAvatarPreview(true)}
                  className="flex h-[82px] w-[82px] items-center justify-center rounded-full bg-[linear-gradient(135deg,#4ade80_0%,#38bdf8_100%)] p-0 shadow-[0_16px_34px_rgba(0,0,0,0.36),0_0_0_1px_rgba(255,255,255,0.06)] transition-transform duration-200 hover:scale-[1.02]"
                >
                  <span className="block h-[78px] w-[78px] overflow-hidden rounded-full border-2 border-[#07100b]">
                    <Avatar
                      src={profile.avatar_url || ""}
                      alt={profile.display_name || profile.username}
                      size={82}
                      userId={userId}
                    />
                  </span>
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="profile-proof-stat-row">
                  <button
                    type="button"
                    onClick={() => setActiveTab("posts")}
                    className="profile-proof-stat"
                  >
                    <span className="profile-proof-stat-value">
                      {userFeedPosts.length}
                    </span>
                    <span className="profile-proof-stat-label">Posts</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("truths")}
                    className="profile-proof-stat"
                  >
                    <span className="profile-proof-stat-value">
                      {publishedTruths.length}
                    </span>
                    <span className="profile-proof-stat-label">Truths</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("dares")}
                    className="profile-proof-stat"
                  >
                    <span className="profile-proof-stat-value">
                      {publishedDares.length}
                    </span>
                    <span className="profile-proof-stat-label">Dares</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="relative z-10">
              <h2 className="m-0 mb-[5px] text-[22px] font-black leading-[1.1] tracking-[0] text-white">
                {profile.display_name || profile.username}
              </h2>
              <p className="m-0 mb-3 text-[13px] font-bold leading-none text-[#94a3b8]">
                @{stripAtSymbol(profile.username)}
              </p>
              <p className="m-0 line-clamp-2 max-w-full text-[14px] font-semibold leading-[1.42] tracking-[0] text-white/80">
                {profile.bio || "Proof-first posts, real dares, close-friend stories."}
              </p>
            </div>

            <div className="relative z-10 -mt-0.5 flex flex-col gap-2">
              {currentUser?.id && currentUser.id !== userId && (
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
                    <span className="activity-radar-subtitle">
                      Declare the dynamic
                    </span>
                  </span>
                </button>
              )}
              {showFriendButton && (
                <button
                  onClick={handleSendFriendRequest}
                  disabled={isAnimating}
                  className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-bold transition-all duration-200 sm:px-5 sm:py-2.5 ${
                    isAnimating
                      ? "cursor-not-allowed bg-[#2a2a2a] text-[#64748b]"
                      : "bg-[#4ade80] text-black shadow-[0_12px_30px_rgba(74,222,128,0.22)] hover:bg-[#34d399]"
                  }`}
                >
                  <UserPlus size={18} />
                  Send Friend Request
                </button>
              )}

              {showPendingButton && (
                <>
                <button
                  disabled
                  className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-full bg-[#2a2a2a] px-4 py-3 text-sm font-bold text-[#64748b] sm:py-2.5"
                >
                  <Check size={18} />
                  Request Sent
                  </button>
                  <button
                    onClick={handleResendFriendRequest}
                    disabled={isCancelling}
                    className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-bold transition-colors sm:py-2.5 ${
                      isCancelling
                        ? "cursor-not-allowed bg-[#2a2a2a] text-[#64748b]"
                        : "bg-[#ef4444] text-white hover:bg-[#dc2626]"
                    }`}
                  >
                    <X size={18} />
                    {isCancelling ? "Cancelling..." : "Cancel"}
                  </button>
                </>
              )}

              {showFriendsButton && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      if (onMessage && profile) {
                        onMessage(
                          userId,
                          profile.username || profile.display_name || "user",
                        );
                      }
                    }}
                    className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-[18px] bg-[#4ade80] px-3 py-2.5 text-[13px] font-extrabold text-black shadow-[0_12px_30px_rgba(74,222,128,0.22)] transition-colors hover:bg-[#34d399]"
                  >
                    <MessageCircle size={16} />
                    Message
                  </button>
                  <button
                    onClick={handleFriendsCapsuleClick}
                    onPointerDown={handleFriendsCapsulePressStart}
                    onPointerUp={handleFriendsCapsulePressEnd}
                    onPointerCancel={handleFriendsCapsulePressEnd}
                    onPointerLeave={handleFriendsCapsulePressEnd}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setShowUnfriendModal(true);
                    }}
                    className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-2.5 text-[13px] font-extrabold text-white transition-colors hover:border-[#4ade80]/30 hover:text-[#86efac]"
                    title="Long press to unfriend"
                  >
                    <Users size={16} />
                    Friends
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content Tabs - Only show if friends or own profile */}
        {(isFriend || currentUser?.id === userId) && (
          <>
            {/* Tab Navigation */}
            <div className="mx-auto -mt-1 w-full max-w-[430px] px-3">
              <div className="flex rounded-full border border-white/8 bg-[linear-gradient(180deg,rgba(21,27,21,0.92),rgba(10,14,10,0.96))] p-1.5 shadow-[0_24px_70px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.05)]">
                <button
                  onClick={() => setActiveTab("posts")}
                  className={`flex-1 rounded-full px-3 py-3 text-center font-black transition-all sm:px-4 ${
                    activeTab === "posts"
                      ? "bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-[#061006] shadow-[0_10px_26px_rgba(74,222,128,0.28)]"
                      : "text-[#94a3b8] hover:text-white"
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                    <Grid3X3 size={16} />
                    <span className="text-sm">Posts</span>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setActiveTab("truths");
                  }}
                  className={`flex-1 rounded-full px-3 py-3 text-center font-black transition-all sm:px-4 ${
                    activeTab === "truths"
                      ? "bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-[#061006] shadow-[0_10px_26px_rgba(74,222,128,0.28)]"
                      : "text-[#94a3b8] hover:text-white"
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                    <MessageSquare size={16} />
                    <span className="text-sm">Truths</span>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setActiveTab("dares");
                  }}
                  className={`flex-1 rounded-full px-3 py-3 text-center font-black transition-all sm:px-4 ${
                    activeTab === "dares"
                      ? "bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-[#061006] shadow-[0_10px_26px_rgba(74,222,128,0.28)]"
                      : "text-[#94a3b8] hover:text-white"
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                    <Play size={16} />
                    <span className="text-sm">Dares</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="mx-auto w-full max-w-[430px] px-3 py-5">
              {activeTab === "posts" && (
                <div className="rounded-[34px] border border-white/8 bg-[linear-gradient(180deg,rgba(16,20,17,0.96),rgba(7,9,8,0.98))] p-4 shadow-[0_30px_80px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.04)]">
                  {userFeedPosts.length === 0 ? (
                    <div className="rounded-[28px] border border-white/8 bg-white/[0.035] px-6 py-12 text-center">
                      <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-[28px] border border-white/8 bg-white/[0.04] text-[#64748b]">
                        <Grid3X3 size={26} />
                      </div>
                      <p className="text-lg font-black text-white">No posts yet</p>
                      <p className="mt-2 text-sm font-semibold text-[#64748b]">
                        Posts will show up here once something gets shared.
                      </p>
                    </div>
                  ) : (
                    <div className="profile-posts-grid">
                      {userFeedPosts.map((post) => (
                        <div
                          key={post.id}
                          onClick={() => setShowPostsScreen(true)}
                          className="aspect-square min-h-[132px] cursor-pointer overflow-hidden rounded-[24px] border border-white/6 bg-[#151515] shadow-[0_14px_34px_rgba(0,0,0,0.2)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#4ade80]/20 hover:opacity-95"
                        >
                          {post.media ? (
                            <img
                              src={post.media.url}
                              alt="Post"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[#64748b]">
                              <MessageSquare size={24} />
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
                  }}
                >
                  {loadingPublishedTruths ? (
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
                  ) : publishedTruths.length === 0 ? (
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
                        Truths will appear here
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
                      {publishedTruths.map((truth, index) => {
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
                              setSelectedTruthId(truth.id);
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
                              e.currentTarget.style.transform =
                                "translateY(-1px)";
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
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: "13px",
                                  fontWeight: 800,
                                  lineHeight: 1.3,
                                  color: "rgba(255,255,255,0.58)",
                                  letterSpacing: 0,
                                }}
                              >
                                <span
                                  style={{
                                    color: "rgba(255,255,255,0.92)",
                                    fontWeight: 850,
                                  }}
                                >
                                  {truth.challenger.nickname}
                                </span>
                                <span
                                  style={{
                                    margin: "0 6px",
                                    color: "#86efac",
                                    fontSize: "10.5px",
                                    fontWeight: 950,
                                    letterSpacing: "0.08em",
                                    textTransform: "uppercase",
                                    textShadow:
                                      "0 0 14px rgba(74,222,128,0.34)",
                                  }}
                                >
                                  Asked
                                </span>
                                <span
                                  style={{
                                    color: "rgba(255,255,255,0.92)",
                                    fontWeight: 850,
                                  }}
                                >
                                  {truth.receiver.nickname}
                                </span>
                              </p>
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
                  }}
                >
                  {loadingPublishedDares ? (
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
                          border: "3px solid rgba(74,222,128,0.15)",
                          borderTopColor: "#4ade80",
                          borderRadius: "50%",
                          animation: "spin 0.8s linear infinite",
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
                  ) : publishedDares.length === 0 ? (
                    <div style={{ padding: "64px 24px", textAlign: "center" }}>
                      <Play
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
                        Dares will appear here
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
                      {publishedDares.map((dare, index) => {
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
                        return (
                          <div
                            key={dare.id}
                            onClick={() => {
                              setSelectedDareId(dare.id);
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
                              e.currentTarget.style.transform =
                                "translateY(-1px)";
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
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: "13px",
                                  fontWeight: 800,
                                  lineHeight: 1.3,
                                  color: "rgba(255,255,255,0.58)",
                                  letterSpacing: 0,
                                }}
                              >
                                <span
                                  style={{
                                    color: "rgba(255,255,255,0.92)",
                                    fontWeight: 850,
                                  }}
                                >
                                  {dare.challenger.nickname}
                                </span>
                                <span
                                  style={{
                                    margin: "0 6px",
                                    color: "#86efac",
                                    fontSize: "10.5px",
                                    fontWeight: 950,
                                    letterSpacing: "0.08em",
                                    textTransform: "uppercase",
                                    textShadow:
                                      "0 0 14px rgba(74,222,128,0.34)",
                                  }}
                                >
                                  Dared
                                </span>
                                <span
                                  style={{
                                    color: "rgba(255,255,255,0.92)",
                                    fontWeight: 850,
                                  }}
                                >
                                  {dare.receiver.nickname}
                                </span>
                              </p>
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
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Posts Notice - Only show if not friends and not own profile */}
        {!isFriend && currentUser?.id !== userId && (
          <div className="px-6 pb-6">
            <div className="rounded-[30px] border border-white/6 bg-[linear-gradient(180deg,rgba(24,29,24,0.98),rgba(16,19,16,0.98))] p-6 text-center shadow-[0_18px_46px_rgba(0,0,0,0.24)]">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-[#4ade80]/18 bg-[#4ade80]/10">
                <svg
                  className="w-8 h-8 text-[#4ade80]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8h.01"
                  />
                </svg>
              </div>
              <p className="mb-2 font-medium text-white">Posts are hidden</p>
              <p className="text-sm leading-relaxed text-[#64748b]">
                Send a friend request to see{" "}
                {profile.display_name || profile.username}&apos;s truth and dare
                posts
              </p>
            </div>
          </div>
        )}

      </div>
      </div>

      {showRelationshipsScreen && currentUser?.id && profile && (
          <div className="app-story-shell fixed inset-0 z-[70] bg-[#050806]">
            <RelationshipsScreen
              onBack={() => setShowRelationshipsScreen(false)}
              currentUser={{
                id: currentUser.id,
                display_name:
                  currentUser.displayName || currentUser.username || "User",
                username: (currentUser.username || "user").replace(/^@/, ""),
                avatar_url: currentUser.avatar || "",
              }}
              profileUser={{
                id: currentUser.id,
                display_name:
                  currentUser.displayName || currentUser.username || "User",
                username: (currentUser.username || "user").replace(/^@/, ""),
                avatar_url: currentUser.avatar || "",
              }}
              initialTarget={{
                id: userId,
                display_name: profile.display_name || profile.username || "User",
                username: stripAtSymbol(profile.username || "user"),
                avatar_url: profile.avatar_url || "",
              }}
            />
          </div>
        )}

        {/* Friends Modal */}
        {showAvatarPreview && (
          <div
            className="app-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/88 px-6"
            onClick={() => setShowAvatarPreview(false)}
          >
            <div
              className="app-modal-dialog relative flex h-[min(72vw,320px)] w-[min(72vw,320px)] items-center justify-center rounded-full border border-white/10 bg-[linear-gradient(180deg,#141414_0%,#0e0e0e_52%,#0a0a0a_100%)] p-2 shadow-[0_30px_100px_rgba(0,0,0,0.55)]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setShowAvatarPreview(false)}
                className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/80 transition-colors hover:text-white"
              >
                <X size={18} />
              </button>
              <div className="h-full w-full overflow-hidden rounded-full border border-white/8 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <Avatar
                  src={profile.avatar_url || ""}
                  alt={profile.display_name || profile.username || "Profile"}
                  size={400}
                  userId={userId}
                  disableRealtime
                  className="h-full w-full"
                  style={{ width: "100%", height: "100%" }}
                />
              </div>
            </div>
          </div>
        )}

        {showFriendsModal && (
          <div
            className="app-modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setShowFriendsModal(false)}
          >
            <div
              className="app-modal-sheet w-full max-w-md rounded-t-[30px] border border-white/8 bg-[linear-gradient(180deg,#141414_0%,#0e0e0e_52%,#0a0a0a_100%)] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.52)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[22px] font-[850] tracking-[-0.04em] text-white">
                  Friends ({friendsList.length})
                </h3>
                <button
                  onClick={() => setShowFriendsModal(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-[13px] border border-white/8 bg-white/[0.04] text-[#94a3b8] transition-colors hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              {currentUser?.id !== userId && isFriend && (
                <button
                  type="button"
                  onClick={() => void handleToggleCloseFriend()}
                  disabled={closeFriendBusy}
                  className={`mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${
                    isCloseFriend
                      ? "border-[#facc15]/30 bg-[#facc15]/10 text-[#facc15]"
                      : "border-white/10 bg-white/[0.045] text-white hover:border-[#fb7185]/40 hover:text-[#fb7185]"
                  } ${closeFriendBusy ? "cursor-not-allowed opacity-70" : ""}`}
                >
                  <Star size={16} />
                  {closeFriendBusy
                    ? "Updating..."
                    : isCloseFriend
                      ? "Remove from Close Friends"
                      : "Add to Close Friends"}
                </button>
              )}

              {loadingFriends ? (
                <div className="text-center py-8">
                  <p className="text-[#64748b]">Loading friends...</p>
                </div>
              ) : friendsList.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-[#64748b]">No friends yet</p>
                </div>
              ) : (
                <div className="max-h-72 space-y-2.5 overflow-y-auto">
                  {friendsList.map((friend: any) => (
                    <div
                      key={friend.userId}
                      className="flex items-center space-x-3 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(20,20,20,0.98),rgba(10,10,10,0.99))] p-3.5 shadow-[0_14px_28px_rgba(0,0,0,0.2)]"
                    >
                      <Avatar
                        src={friend.avatarUrl || ""}
                        alt={friend.displayName || friend.username}
                        size="sm"
                        userId={friend.userId}
                      />
                      <div className="flex-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (onNavigateToProfile && friend.userId) {
                              onNavigateToProfile(friend.userId);
                            }
                          }}
                          className={`text-left font-medium text-white ${
                            onNavigateToProfile && friend.userId
                              ? "cursor-pointer hover:text-[#fb7185]"
                              : "cursor-default"
                          }`}
                        >
                          {friend.displayName || friend.username}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (onNavigateToProfile && friend.userId) {
                              onNavigateToProfile(friend.userId);
                            }
                          }}
                            className={`block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8] ${
                              onNavigateToProfile && friend.userId
                              ? "cursor-pointer hover:text-[#fb7185]"
                              : "cursor-default"
                          }`}
                        >
                          {stripAtSymbol(friend.username)}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Unfriend Confirmation Modal */}
        {showUnfriendModal && (
          <div
            className="app-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70"
            onClick={() => setShowUnfriendModal(false)}
          >
            <div
              className="app-modal-dialog mx-4 w-full max-w-sm rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,#141414_0%,#0e0e0e_52%,#0a0a0a_100%)] p-6 shadow-[0_28px_80px_rgba(0,0,0,0.42)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-[#ef4444]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <X size={24} className="text-[#ef4444]" />
                </div>
                <h3 className="text-white font-bold text-lg mb-2">
                  Unfriend {profile.display_name || profile.username}?
                </h3>
                <p className="text-[#64748b] text-sm">
                  Their posts will be removed from your feed and you won&apos;t
                  see their content anymore.
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleUnfriend}
                  disabled={isUnfriending}
                  className={`w-full py-3 rounded-full font-semibold transition-colors ${
                    isUnfriending
                      ? "bg-[#2a2a2a] text-[#64748b] cursor-not-allowed"
                      : "bg-[#ef4444] text-white hover:bg-[#dc2626]"
                  }`}
                >
                  {isUnfriending ? "Unfriending..." : "Unfriend"}
                </button>
                <button
                  onClick={() => setShowUnfriendModal(false)}
                  disabled={isUnfriending}
                  className="w-full py-3 rounded-full font-semibold bg-[#1e1e1e] text-white hover:bg-[#2a2a2a] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}


