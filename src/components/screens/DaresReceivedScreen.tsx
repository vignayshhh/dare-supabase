"use client";

import { useState, useEffect, memo, useCallback, useRef, useMemo } from "react";
import {
  Clock,
  Inbox,
  Image as ImageIcon,
  Mic,
  Play,
  Target,
  Video,
  X,
  CheckCircle,
} from "lucide-react";
import "@/styles/design-system.css";
import { TruthAnswerScreen } from "./TruthAnswerScreen";
import { DareCompletionScreen } from "./DareCompletionScreen";
import { DareSubmittedCinematicScreen } from "./DareSubmittedCinematicScreen";
import { ReviewScreen } from "./ReviewScreen";
import {
  friendsService,
  dareService,
  truthService,
  userService,
} from "@/middleware/services/service-factory";
import { useProfileDataStore } from "@/stores/profileDataStore";
import { useAlertStore } from "@/stores/useAlertStore";
import { Avatar } from "../ui/Avatar";
import { useAuthStore } from "@/stores/useAuthStore-v2";
import { useAvatarStore } from "@/stores/avatarStore";
import {
  type PredictionPost,
  type PredictionVote,
  usePredictionStore,
} from "@/stores/usePredictionStore";
import { InteractionReceipt } from "../circles/InteractionReceipt";
import { InteractionInbox } from "../circles/InteractionInbox";
import { ChatSourceQuote } from "../circles/CircleChatScreen";
import type { ChatSource } from "@/lib/chatContext";
import { loadDramaFeed } from "@/stores/dramaBackend";
import { resolveUserProfile } from "@/utils/profileResolver";

interface Challenge {
  id: string;
  type: "truth" | "dare";
  challengerId?: string;
  receiverId?: string;
  challenger: {
    name: string;
    avatar: string;
    username: string;
    verified?: boolean;
  };
  receiver?: {
    name: string;
    avatar: string;
    username: string;
    verified?: boolean;
  };
  question?: string;
  answer?: string; // Add answer field for truths
  action?: string;
  poll?: {
    question: string;
    options: string[];
    votes: { [key: string]: number };
    totalVotes: number;
  };
  state: string;
  createdAt: string;
  sortAt: string;
  updatedAt?: string;
  isCompleted?: boolean;
  completedAt?: string;
  proof?: {
    type: "image" | "video" | "audio";
    url: string;
    thumbnail?: string;
  };
}

type PredictionMention = {
  kind: "prediction";
  prediction: PredictionPost;
  sortAt: string;
};

type ReceivedFeedItem = Challenge | PredictionMention;

const stripAtSymbol = (username?: string) =>
  (username || "unknown").replace(/^@/, "");

const sharedChallengeCardClass =
  "dares-received-item relative isolate overflow-hidden rounded-[20px] border border-white/9 bg-[#0d100d] p-3.5 text-white shadow-[0_16px_34px_rgba(0,0,0,0.24)] transition-[transform,border-color,background-color] duration-200 active:scale-[0.995]";
const highlightedChallengeRingClass =
  "ring-2 ring-[#4ade80] ring-offset-2 ring-offset-[#050705]";
const curvedActionButtonClass =
  "dares-received-action-button flex-1 rounded-[14px] px-5 py-2.5 text-[13px] font-black transition-[transform,background-color,border-color] duration-200 active:scale-[0.98]";
const curvedModalButtonClass =
  "dares-received-action-button w-full rounded-[16px] py-3.5 text-base font-black";

function formatRelativeChallengeTime(value?: string | null) {
  const timestamp = parseChallengeTime(value);
  if (!timestamp) return "";

  const elapsedMinutes = Math.max(
    1,
    Math.floor((Date.now() - timestamp) / 60_000),
  );
  if (elapsedMinutes < 60) return `${elapsedMinutes}m`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return `${elapsedDays}d`;

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}

const TimerDisplay = memo(
  ({
    time,
    formatTime,
  }: {
    time: number;
    formatTime: (s: number) => string;
  }) => (
    <span className="font-mono text-[12px] font-black tabular-nums text-[#bbf7d0]">
      {formatTime(time)} left
    </span>
  ),
);
TimerDisplay.displayName = "TimerDisplay";

const ChallengeCard = memo(
  ({
    challenge,
    timeRemaining,
    formatTime,
    onAccept,
    onSurrender,
    onComplete,
    isHighlighted,
  }: {
    challenge: Challenge;
    timeRemaining: number | undefined;
    formatTime: (s: number) => string;
    onAccept: (c: Challenge) => void;
    onSurrender: (c: Challenge) => void;
    onComplete: (c: Challenge) => void;
    isHighlighted?: boolean;
  }) => {
    const isChickenOut = challenge.state === "CHICKEN_OUT";
    const isTimedOut = challenge.state === "ACCEPTED" && timeRemaining === 0;
    const isExpired =
      challenge.state === "ACCEPTED" &&
      (isTimedOut ||
        localStorage.getItem(`dare_expired_${challenge.id}`) === "true");
    const isCompleted = challenge.state === "ACCEPTED_REAL";
    const isMarkedFake = challenge.state === "REJECTED_FAKE";
    const isAnswered =
      challenge.type === "truth" &&
      (challenge.state === "APPROVED" || challenge.state === "REJECTED");
    const canAccept = challenge.state === "SENT";
    const isLegacySubmissionProcessing =
      challenge.state === "ANSWERED" ||
      challenge.state === "PROOF_SUBMITTED" ||
      challenge.state === "UNDER_REVIEW" ||
      challenge.state === "FRIENDS_VALIDATION";

    const prompt = challenge.type === "truth" ? challenge.question : challenge.action;
    const relativeTime = formatRelativeChallengeTime(challenge.sortAt || challenge.createdAt);
    const statusText = isChickenOut
      ? "You backed away like a loser"
      : isExpired
        ? "Dare expired"
        : isTimedOut
          ? "Time up! You lost professionally"
          : isCompleted || isAnswered
            ? challenge.type === "truth"
              ? "Truth completed"
              : "Dare completed"
            : isMarkedFake
              ? "Dare rejected"
              : isLegacySubmissionProcessing
                ? "Finishing submission"
                : "Challenge updated";
    const statusTone =
      isChickenOut || isExpired || isMarkedFake
        ? "text-red-300"
        : isCompleted || isAnswered
          ? "text-[#86efac]"
          : isLegacySubmissionProcessing
            ? "text-white/48"
            : "text-white/42";

    return (
      <article
        className={`${sharedChallengeCardClass} ${isHighlighted ? highlightedChallengeRingClass : ""}`}
      >
        <InteractionReceipt id={challenge.id} table={challenge.type === "dare" ? "dares" : "truths"} />
        <div className="relative z-10 flex items-start gap-3">
          <div className="relative shrink-0">
            <Avatar
              src={challenge.challenger.avatar}
              alt={challenge.challenger.name}
              size="md"
              userId={challenge.challengerId}
              username={challenge.challenger.username}
              className="ring-1 ring-white/10"
            />
            {challenge.challenger.verified && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#4ade80]">
                <CheckCircle size={10} className="text-[#061007]" />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-extrabold leading-5 text-white">
                  {challenge.challenger.name || `@${stripAtSymbol(challenge.challenger.username)}`}
                  <span className="font-medium text-white/46">
                    {challenge.type === "truth" ? " asked a truth" : " dared you"}
                  </span>
                </p>
                <p className="mt-0.5 text-[12px] font-medium text-white/36">
                  @{stripAtSymbol(challenge.challenger.username)}
                  {relativeTime ? ` · ${relativeTime}` : ""}
                </p>
              </div>
              <span className="shrink-0 pt-0.5 text-[11px] font-black uppercase tracking-[0.14em] text-[#72e994]">
                {challenge.type}
              </span>
            </div>

            <p className="mt-2.5 pr-1 text-[18px] font-black leading-[1.14] tracking-[-0.02em] text-white">
              {prompt}
            </p>

            {challenge.type === "dare" && challenge.state === "ACCEPTED" && !isExpired && (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-bold text-white/45">
                <span className="inline-flex items-center gap-1.5">
                  <Video size={14} className="text-[#72e994]" />
                  Proof required
                </span>
                {timeRemaining !== undefined && timeRemaining > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock size={14} className="text-[#72e994]" />
                    <TimerDisplay time={timeRemaining} formatTime={formatTime} />
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {challenge.type === "truth" && challenge.poll && (
          <div className="relative z-10 mt-3 border-y border-white/8 py-2.5">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h4 className="text-[13px] font-extrabold text-white/82">{challenge.poll.question}</h4>
              <span className="shrink-0 text-[11px] font-bold text-white/32">
                {challenge.poll.totalVotes} votes
              </span>
            </div>
            <div className="space-y-2">
              {challenge.poll.options.map((option, index) => {
                const votes = challenge.poll!.votes[option] || 0;
                const percentage = challenge.poll!.totalVotes > 0
                  ? Math.round((votes / challenge.poll!.totalVotes) * 100)
                  : 0;
                return (
                  <div key={index}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-[12px]">
                      <span className="font-bold text-white/74">{option}</span>
                      <span className="font-bold tabular-nums text-white/34">{percentage}%</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-white/8">
                      <div className="h-full rounded-full bg-[#4ade80]" style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="relative z-10 mt-3 flex items-center gap-3 border-t border-white/8 pt-3">
          {challenge.state === "ACCEPTED" && !isExpired ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onComplete(challenge);
              }}
              className={`btn btn-primary ${curvedActionButtonClass}`}
            >
              Complete now
            </button>
          ) : canAccept ? (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAccept(challenge);
                }}
                className={`btn btn-primary ${curvedActionButtonClass}`}
              >
                Accept
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSurrender(challenge);
                }}
                className={`btn btn-secondary ${curvedActionButtonClass}`}
              >
                Refuse
              </button>
            </>
          ) : (
            <div className="min-w-0 flex-1">
              <p className={`text-[12px] font-bold ${statusTone}`}>
                {statusText}
              </p>
            </div>
          )}
        </div>
      </article>
    );
  },
);
ChallengeCard.displayName = "ChallengeCard";

function PredictionMentionCard({
  mention,
  onRespond,
}: {
  mention: PredictionMention;
  onRespond: (prediction: PredictionPost) => void;
}) {
  const { prediction } = mention;
  const hasResponded = Boolean(prediction.subjectThought);

  return (
    <article className={`${sharedChallengeCardClass} border-[#4ade80]/16`}>
      <div className="relative z-10 flex items-start gap-3">
        <Avatar
          src={prediction.poster.avatar}
          alt={prediction.poster.name}
          size="md"
          userId={prediction.poster.id}
          username={prediction.poster.username}
          className="shrink-0 ring-1 ring-white/10"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-extrabold leading-5 text-white">
                {prediction.poster.name}
                <span className="font-medium text-white/46"> predicted about you</span>
              </p>
              <p className="mt-0.5 text-[12px] font-medium text-white/36">
                @{stripAtSymbol(prediction.poster.username)} · {formatRelativeChallengeTime(mention.sortAt)}
              </p>
            </div>
            <span className="shrink-0 pt-0.5 text-[11px] font-black uppercase tracking-[0.14em] text-[#72e994]">
              Prediction
            </span>
          </div>
          <p className="mt-2.5 pr-1 text-[18px] font-black leading-[1.14] tracking-[-0.02em] text-white">
            {prediction.text}
          </p>
        </div>
      </div>

      <div className="relative z-10 mt-3 border-t border-white/8 pt-3">
        <button
          type="button"
          onClick={() => onRespond(prediction)}
          className={`btn btn-primary ${curvedActionButtonClass} w-full`}
        >
          {hasResponded ? "Edit your thought" : "Say something"}
        </button>
      </div>
    </article>
  );
}

function PredictionResponseScreen({
  prediction,
  onBack,
}: {
  prediction: PredictionPost;
  onBack: () => void;
}) {
  const respondAsSubject = usePredictionStore((s) => s.respondAsSubject);
  const [outcome, setOutcome] = useState<PredictionVote>(
    prediction.subjectOutcome || "happens",
  );
  const [thought, setThought] = useState(prediction.subjectThought || "");

  const submit = () => {
    if (!thought.trim()) return;
    respondAsSubject(prediction.id, outcome, thought);
    onBack();
  };

  return (
    <div className="screen-container flex flex-col bg-[#050705] px-5 text-white">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col pt-[calc(var(--safe-area-top)+16px)]">
        <button
          type="button"
          onClick={onBack}
          className="mb-8 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Back"
        >
          <X size={18} />
        </button>

        <p className="mb-3 text-[12px] font-black uppercase tracking-[0.16em] text-[#72e994]">Your take</p>
        <h1 className="mb-8 text-[30px] font-black leading-[1.06] tracking-[-0.035em] text-white">
          {prediction.text}
        </h1>

        <p className="mb-2.5 text-[13px] font-bold text-white/48">Will it happen?</p>
        <div className="mb-6 grid grid-cols-2 rounded-[18px] bg-white/[0.055] p-1">
          <button
            type="button"
            onClick={() => setOutcome("happens")}
            className={`rounded-[14px] px-3 py-3 text-[14px] font-black transition-colors ${
              outcome === "happens"
                ? "bg-[#4ade80] text-[#041006]"
                : "text-white/50"
            }`}
          >
            It happens
          </button>
          <button
            type="button"
            onClick={() => setOutcome("wont")}
            className={`rounded-[14px] px-3 py-3 text-[14px] font-black transition-colors ${
              outcome === "wont"
                ? "bg-white text-[#0a0c0a]"
                : "text-white/50"
            }`}
          >
            Won&apos;t happen
          </button>
        </div>

        <textarea
          value={thought}
          onChange={(e) => setThought(e.target.value)}
          maxLength={240}
          placeholder="Write what you think..."
          className="min-h-[190px] w-full resize-none rounded-[20px] border border-white/9 bg-[#0d100d] p-4 text-[16px] font-semibold leading-relaxed text-white outline-none transition-colors placeholder:text-white/24 focus:border-[#4ade80]/40"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs font-bold tabular-nums text-white/32">
            {thought.length}/240
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={!thought.trim()}
            className="rounded-[15px] bg-[#4ade80] px-5 py-3 text-sm font-black text-[#041006] transition-transform active:scale-[0.98] disabled:opacity-35"
          >
            Post thought
          </button>
        </div>
      </div>
    </div>
  );
}

const SentChallengeCard = memo(
  ({
    challenge,
    isHighlighted,
    onReview,
  }: {
    challenge: Challenge;
    isHighlighted?: boolean;
    onReview: (challenge: Challenge) => void;
  }) => {
    const isLegacySubmissionProcessing =
      (challenge.type === "dare" &&
        (challenge.state === "PROOF_SUBMITTED" ||
          challenge.state === "FRIENDS_VALIDATION")) ||
      (challenge.type === "truth" && challenge.state === "ANSWERED");
    const isAwaitingCompletion =
      challenge.type === "dare" &&
      (challenge.state === "SENT" || challenge.state === "ACCEPTED");
    const isCompleted =
      (challenge.type === "dare" && challenge.state === "ACCEPTED_REAL") ||
      (challenge.type === "truth" &&
        (challenge.state === "APPROVED" || challenge.state === "REJECTED"));
    const isSurrendered =
      challenge.type === "dare" && challenge.state === "CHICKEN_OUT";
    const isMarkedFake =
      challenge.type === "dare" && challenge.state === "REJECTED_FAKE";
    const isReadyForChallengerReview =
      challenge.type === "dare" && challenge.state === "PROOF_SUBMITTED";
    const prompt = challenge.type === "truth" ? challenge.question : challenge.action;
    const recipientName = challenge.receiver?.name || `@${stripAtSymbol(challenge.receiver?.username)}`;
    const relativeTime = formatRelativeChallengeTime(challenge.sortAt || challenge.createdAt);
    const statusText = isCompleted
      ? challenge.type === "truth"
        ? "Truth completed"
        : "Dare completed"
      : isSurrendered
        ? `${stripAtSymbol(challenge.receiver?.username)} surrendered`
        : isMarkedFake
          ? "Dare rejected"
          : isLegacySubmissionProcessing
            ? challenge.type === "truth"
              ? "Answer is being posted"
                : "Proof waiting for your review"
            : isAwaitingCompletion
              ? "Waiting for them to complete it"
              : challenge.type === "truth" && challenge.state === "SENT"
                ? "Waiting for them to answer"
                : "Challenge updated";

    return (
      <article
        className={`${sharedChallengeCardClass} ${
          isHighlighted ? highlightedChallengeRingClass : ""
        }`}
      >
        <div className="relative z-10 flex items-start gap-3">
          <div className="relative shrink-0">
            <Avatar
              src={challenge.receiver?.avatar || "/default-avatar.png"}
              alt={challenge.receiver?.name || "Unknown"}
              size="md"
              userId={challenge.receiverId}
              username={challenge.receiver?.username}
              className="ring-1 ring-white/10"
            />
            {challenge.receiver?.verified && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#4ade80]">
                <CheckCircle size={10} className="text-[#061007]" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-extrabold leading-5 text-white">
                  Sent to {recipientName}
                </p>
                <p className="mt-0.5 text-[12px] font-medium text-white/36">
                  @{stripAtSymbol(challenge.receiver?.username)}
                  {relativeTime ? ` · ${relativeTime}` : ""}
                </p>
              </div>
              <span className="shrink-0 pt-0.5 text-[11px] font-black uppercase tracking-[0.14em] text-[#72e994]">
                {challenge.type}
              </span>
            </div>
            <p className="mt-2.5 pr-1 text-[18px] font-black leading-[1.14] tracking-[-0.02em] text-white">
              {prompt}
            </p>
          </div>
        </div>

        {challenge.proof && (
        <div className="relative z-10 mt-3 overflow-hidden rounded-[16px] border border-white/8 bg-black/30">
            {challenge.proof.type === "image" ? (
              <div className="relative aspect-[16/7]">
                <img
                  src={challenge.proof.url}
                  alt={`Proof submitted by ${recipientName}`}
                  className="h-full w-full object-cover"
                />
                <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/68 px-2.5 py-1.5 text-[11px] font-extrabold text-white backdrop-blur-md">
                  <ImageIcon size={13} /> Proof submitted
                </span>
              </div>
            ) : challenge.proof.type === "video" ? (
              <div className="relative aspect-[16/7]">
                <video
                  src={challenge.proof.url}
                  poster={challenge.proof.thumbnail}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-cover"
                />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/62 text-white backdrop-blur-md">
                    <Play size={20} fill="currentColor" />
                  </span>
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-3.5 py-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#4ade80]/12 text-[#72e994]">
                  <Mic size={18} />
                </span>
                <div>
                  <p className="text-[13px] font-extrabold text-white">Audio proof</p>
                  <p className="mt-0.5 text-[11px] font-semibold text-white/38">Posted to the feed</p>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="relative z-10 mt-3 flex items-center gap-3 border-t border-white/8 pt-3">
          <div className="min-w-0 flex-1">
            <p className={`text-[12px] font-bold ${
              isCompleted
                ? "text-[#86efac]"
                : isSurrendered || isMarkedFake
                  ? "text-red-300"
                  : isLegacySubmissionProcessing
                    ? "text-white/72"
                    : "text-white/42"
            }`}>
              {statusText}
            </p>
          </div>
          {isReadyForChallengerReview && (
            <button
              type="button"
              onClick={() => onReview(challenge)}
              className="dares-received-action-button shrink-0 rounded-[12px] bg-[#f5b942] px-3.5 py-2 text-[12px] font-black text-[#191203] transition-transform active:scale-[0.98]"
            >
              Review proof
            </button>
          )}
        </div>
      </article>
    );
  },
);
SentChallengeCard.displayName = "SentChallengeCard";

// In production mode, challenges come from backend
// Start with empty arrays - will be populated by real data
const initialChallenges: Challenge[] = [];
const initialSentChallenges: Challenge[] = [];

function mapDareProofToChallengeProof(
  proofMediaType?: string | null,
  proofMediaUrl?: string | null,
  proofThumbnailUrl?: string | null,
) {
  if (!proofMediaUrl) return undefined;

  return {
    type:
      proofMediaType === "VIDEO"
        ? ("video" as const)
        : proofMediaType === "AUDIO" ||
            (proofMediaType === "TEXT" &&
              proofMediaUrl.startsWith("data:audio"))
          ? ("audio" as const)
          : ("image" as const),
    url: proofMediaUrl,
    thumbnail:
      proofThumbnailUrl ||
      (proofMediaType === "VIDEO" ? proofMediaUrl : undefined),
  };
}

function mapProofTypeToDareMediaType(type: "image" | "video" | "audio") {
  if (type === "video") return "VIDEO" as const;
  if (type === "image") return "PHOTO" as const;
  return "TEXT" as const;
}

function parseChallengeTime(value?: string | null): number {
  if (!value) return 0;
  // Handle Postgres Timestamp objects accidentally passed through
  if (typeof value === "object" && "toMillis" in (value as any)) {
    return (value as any).toMillis();
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function getChallengeSortTime(challenge: Challenge): number {
  return parseChallengeTime(
    challenge.sortAt ||
      challenge.completedAt ||
      challenge.updatedAt ||
      challenge.createdAt,
  );
}

function getChallengeCreatedTime(challenge: Challenge): number {
  return parseChallengeTime(challenge.createdAt);
}

function sortChallengesByLatestActivity(challenges: Challenge[]): Challenge[] {
  return [...challenges].sort((a, b) => {
    // Primary: sortAt (tracks latest activity — proof, completion, sending, etc.)
    const sortDiff = getChallengeSortTime(b) - getChallengeSortTime(a);
    if (sortDiff !== 0) return sortDiff;
    // Fallback: createdAt
    return getChallengeCreatedTime(b) - getChallengeCreatedTime(a);
  });
}

function sortChallengesByNewestCreated(challenges: Challenge[]): Challenge[] {
  return [...challenges].sort((a, b) => {
    const createdDiff = getChallengeCreatedTime(b) - getChallengeCreatedTime(a);
    if (createdDiff !== 0) return createdDiff;
    return getChallengeSortTime(b) - getChallengeSortTime(a);
  });
}

function isPredictionMention(item: ReceivedFeedItem): item is PredictionMention {
  return "kind" in item && item.kind === "prediction";
}

function getReceivedItemSortTime(item: ReceivedFeedItem): number {
  return isPredictionMention(item)
    ? parseChallengeTime(item.sortAt || item.prediction.createdAt)
    : getChallengeSortTime(item);
}

function sortReceivedFeedItems(items: ReceivedFeedItem[]): ReceivedFeedItem[] {
  return [...items].sort(
    (a, b) => getReceivedItemSortTime(b) - getReceivedItemSortTime(a),
  );
}

function getSortAtValue(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (value) return value;
  }
  return new Date(0).toISOString();
}

type ResolvedUserProfile = {
  displayName: string;
  username: string;
  avatarUrl: string;
};

type DaresNavigationRequest = {
  tab?: "received" | "sent";
  highlightDareId?: string;
  highlightTruthId?: string;
  nonce: number;
};

export function DaresReceivedScreen({
  chatSource,
  onOpenInteraction,
  isActive = true,
  navigationRequest,
  resetKey,
}: {
  chatSource?: ChatSource | null;
  onOpenInteraction?: (kind: string, id: string) => void;
  isActive?: boolean;
  navigationRequest?: DaresNavigationRequest | null;
  resetKey?: number;
}) {
  const submissionCinematicTimeoutsRef = useRef<number[]>([]);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<"received" | "sent">("received");
  const [showAcceptPrompt, setShowAcceptPrompt] = useState<Challenge | null>(
    null,
  );
  const [challenges, setChallenges] = useState<Challenge[]>(initialChallenges);
  const [sentChallenges, setSentChallenges] = useState<Challenge[]>(
    initialSentChallenges,
  );
  const [currentScreen, setCurrentScreen] = useState<
    | "dares"
    | "truth"
    | "dare"
    | "review"
    | "submitted"
    | "prediction-response"
  >("dares");
  const [activeChallenge, setActiveChallenge] = useState<Challenge | null>(
    null,
  );
  const [activePrediction, setActivePrediction] =
    useState<PredictionPost | null>(null);
  const [isSubmissionCinematicExiting, setIsSubmissionCinematicExiting] =
    useState(false);
  const [acceptedTimers, setAcceptedTimers] = useState<{
    [key: string]: number;
  }>({});

  const formatTime = useCallback((seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setAcceptedTimers((prev) => {
        const next: { [key: string]: number } = {};
        let hasActive = false;

        for (const id in prev) {
          // Check if dare is expired in localStorage
          const expiredKey = `dare_expired_${id}`;
          if (localStorage.getItem(expiredKey) === "true") {
            next[id] = 0;
            continue;
          }

          // Get timer from localStorage for sync
          const timerKey = `dare_timer_${id}`;
          const savedTime = localStorage.getItem(timerKey);
          const localStorageTime = savedTime ? parseInt(savedTime, 10) : null;

          // Use localStorage time if available and different from local state
          const currentTime =
            localStorageTime !== null && localStorageTime !== prev[id]
              ? localStorageTime
              : prev[id];

          const newTime = currentTime > 0 ? currentTime - 1 : 0;
          next[id] = newTime;

          if (newTime > 0) {
            hasActive = true;
            // Update localStorage
            localStorage.setItem(timerKey, newTime.toString());
          } else {
            // Mark as expired in localStorage
            localStorage.setItem(expiredKey, "true");
            localStorage.removeItem(timerKey);
          }
        }

        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      submissionCinematicTimeoutsRef.current.forEach((timeoutId) =>
        window.clearTimeout(timeoutId),
      );
    };
  }, []);

  // Load truth data from backend
  const { user } = useAuthStore();
  const predictions = usePredictionStore((s) => s.predictions);
  const { userProfiles, setUserProfile } = useProfileDataStore();
  const { setUserAvatar } = useAvatarStore();
  const alerts = useAlertStore((s) => s.alerts);

  const profileCache = useRef<Map<string, ResolvedUserProfile>>(new Map());

  const getUserProfileCached = useCallback(
    async (userId: string): Promise<ResolvedUserProfile> => {
      if (profileCache.current.has(userId)) {
        return profileCache.current.get(userId)!;
      }
      if (userProfiles[userId]) {
        const profile: ResolvedUserProfile = {
          displayName: userProfiles[userId].displayName,
          username: userProfiles[userId].username,
          avatarUrl: userProfiles[userId].avatarUrl || "/default-avatar.png",
        };
        if (userProfiles[userId].avatarUrl) {
          setUserAvatar(userId, userProfiles[userId].avatarUrl!);
        }
        profileCache.current.set(userId, profile);
        return profile;
      }
      try {
        const profile = await resolveUserProfile(userId);
        if (profile) {
          setUserProfile(
            userId,
            profile.displayName || profile.username || "Unknown",
            profile.username || "unknown",
            profile.avatarUrl || "/default-avatar.png",
          );
          if (profile.avatarUrl) {
            setUserAvatar(userId, profile.avatarUrl);
          }
          const profileData: ResolvedUserProfile = {
            displayName: profile.displayName || profile.username || "Unknown",
            username: profile.username || "unknown",
            avatarUrl: profile.avatarUrl || "/default-avatar.png",
          };
          profileCache.current.set(userId, profileData);
          return profileData;
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
      }
      const defaultProfile: ResolvedUserProfile = {
        displayName: "Someone",
        username: "someone",
        avatarUrl: "/default-avatar.png",
      };
      profileCache.current.set(userId, defaultProfile);
      return defaultProfile;
    },
    [userProfiles, setUserProfile, setUserAvatar],
  );
  const [shouldRefresh, setShouldRefresh] = useState(0);
  const [highlightedTruthId, setHighlightedTruthId] = useState<string | null>(
    null,
  );
  const [highlightedDareId, setHighlightedDareId] = useState<string | null>(
    null,
  );
  const handledCompletedAlertIds = useRef<Set<string>>(new Set());
  const handledNavigationNonceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!navigationRequest) return;
    if (handledNavigationNonceRef.current === navigationRequest.nonce) return;
    handledNavigationNonceRef.current = navigationRequest.nonce;

    if (navigationRequest.tab) {
      setActiveTab(navigationRequest.tab);
    }

    if (navigationRequest.highlightDareId) {
      setHighlightedDareId(navigationRequest.highlightDareId);
    }

    if (navigationRequest.highlightTruthId) {
      setHighlightedTruthId(navigationRequest.highlightTruthId);
    }
  }, [navigationRequest]);

  useEffect(() => {
    if (resetKey === undefined) return;

    setCurrentScreen("dares");
    setActiveChallenge(null);
    setActivePrediction(null);
    window.scrollTo(0, 0);
    if (listScrollRef.current) {
      listScrollRef.current.scrollTop = 0;
    }
  }, [resetKey]);

  useEffect(() => {
    const storedTab = sessionStorage.getItem("openDaresTab");
    const storedDareId = sessionStorage.getItem("highlightDareId");
    const storedTruthId = sessionStorage.getItem("highlightTruthId");

    if (storedTab === "received" || storedTab === "sent") {
      setActiveTab(storedTab);
      sessionStorage.removeItem("openDaresTab");
    }

    if (storedDareId) {
      setHighlightedDareId(storedDareId);
      sessionStorage.removeItem("highlightDareId");
    }

    if (storedTruthId) {
      setHighlightedTruthId(storedTruthId);
      sessionStorage.removeItem("highlightTruthId");
    }
  }, [navigationRequest?.nonce]);

  const mergeSentChallenges = useCallback(
    (prev: Challenge[], liveSentDares: Challenge[]) => {
      const truthChallenges = prev.filter(
        (challenge) => challenge.type === "truth",
      );
      const mergedById = new Map<string, Challenge>();

      prev
        .filter((challenge) => challenge.type === "dare")
        .forEach((challenge) => {
          mergedById.set(challenge.id, challenge);
        });

      liveSentDares.forEach((challenge) => {
        const existing = mergedById.get(challenge.id);
        mergedById.set(challenge.id, {
          ...existing,
          ...challenge,
          challenger: challenge.challenger,
          receiver: challenge.receiver,
          proof: challenge.proof || existing?.proof,
          sortAt: challenge.sortAt || existing?.sortAt || challenge.createdAt,
        });
      });

      return sortChallengesByLatestActivity([
        ...truthChallenges,
        ...Array.from(mergedById.values()),
      ]);
    },
    [],
  );

  const mergeReceivedChallenges = useCallback(
    (prev: Challenge[], liveReceivedDares: Challenge[]) => {
      const truthChallenges = prev.filter(
        (challenge) => challenge.type !== "dare",
      );
      const dareById = new Map<string, Challenge>();

      prev
        .filter((challenge) => challenge.type === "dare")
        .forEach((challenge) => {
          dareById.set(challenge.id, challenge);
        });

      liveReceivedDares.forEach((challenge) => {
        const existing = dareById.get(challenge.id);
        dareById.set(challenge.id, {
          ...existing,
          ...challenge,
          challenger: challenge.challenger,
          proof: challenge.proof || existing?.proof,
          sortAt: challenge.sortAt || existing?.sortAt || challenge.createdAt,
        });
      });

      return sortChallengesByLatestActivity([
        ...truthChallenges,
        ...Array.from(dareById.values()),
      ]);
    },
    [],
  );

  const getCurrentUserChallengeProfile =
    useCallback((): ResolvedUserProfile => {
      return {
        displayName: user?.displayName || user?.username || "You",
        username: user?.username || "you",
        avatarUrl: user?.avatar || "/default-avatar.png",
      };
    }, [user?.avatar, user?.displayName, user?.username]);

  const resolveLiveProfileForUser = useCallback(
    (
      targetUserId?: string,
      fallback?: { name?: string; username?: string; avatar?: string },
    ) => {
      if (!targetUserId) {
        return {
          name: fallback?.name || "Someone",
          username: fallback?.username || "someone",
          avatar: fallback?.avatar || "/default-avatar.png",
        };
      }

      if (targetUserId === user?.id) {
        const current = getCurrentUserChallengeProfile();
        return {
          name: current.displayName,
          username: current.username,
          avatar: current.avatarUrl,
        };
      }

      const cached = userProfiles[targetUserId];
      if (cached) {
        return {
          name: cached.displayName || fallback?.name || "Someone",
          username: cached.username || fallback?.username || "someone",
          avatar: cached.avatarUrl || fallback?.avatar || "/default-avatar.png",
        };
      }

      return {
        name: fallback?.name || "Someone",
        username: fallback?.username || "someone",
        avatar: fallback?.avatar || "/default-avatar.png",
      };
    },
    [getCurrentUserChallengeProfile, user?.id, userProfiles],
  );

  const mapReceivedTruthToChallenge = useCallback(
    async (truth: any): Promise<Challenge> => {
      const challengerProfile = truth.challengerId
        ? await getUserProfileCached(truth.challengerId)
        : {
            displayName: "Someone",
            username: "someone",
            avatarUrl: "/default-avatar.png",
          };

      return {
        id: truth.id,
        type: "truth" as const,
        challengerId: truth.challengerId,
        receiverId: truth.receiverId,
        challenger: {
          name: challengerProfile.displayName,
          avatar: challengerProfile.avatarUrl,
          username: challengerProfile.username,
        },
        question: truth.question,
        answer: truth.answer,
        state: truth.state as any,
        createdAt: truth.createdAt,
        sortAt: getSortAtValue(
          truth.reviewedAt,
          truth.answeredAt,
          truth.updatedAt,
          truth.createdAt,
        ),
        updatedAt:
          truth.reviewedAt ||
          truth.answeredAt ||
          truth.updatedAt ||
          truth.createdAt,
        completedAt: truth.reviewedAt || truth.answeredAt || undefined,
      };
    },
    [getUserProfileCached],
  );

  const mapSentTruthToChallenge = useCallback(
    async (truth: any): Promise<Challenge> => {
      const receiverProfile = await getUserProfileCached(truth.receiverId);
      const currentUserProfile = getCurrentUserChallengeProfile();

      return {
        id: truth.id,
        type: "truth" as const,
        challengerId: truth.challengerId,
        receiverId: truth.receiverId,
        challenger: {
          name: currentUserProfile.displayName,
          avatar: currentUserProfile.avatarUrl,
          username: currentUserProfile.username,
        },
        receiver: {
          name: receiverProfile.displayName,
          avatar: receiverProfile.avatarUrl,
          username: receiverProfile.username,
        },
        question: truth.question,
        answer: truth.answer,
        state: truth.state as any,
        createdAt: truth.createdAt,
        sortAt: getSortAtValue(
          truth.reviewedAt,
          truth.answeredAt,
          truth.updatedAt,
          truth.createdAt,
        ),
        updatedAt:
          truth.reviewedAt ||
          truth.answeredAt ||
          truth.updatedAt ||
          truth.createdAt,
        completedAt: truth.reviewedAt || truth.answeredAt || undefined,
      };
    },
    [getCurrentUserChallengeProfile, getUserProfileCached],
  );

  const mapSentDareToChallenge = useCallback(
    async (dare: any): Promise<Challenge> => {
      const receiverProfile = await getUserProfileCached(dare.receiverId);
      const currentUserProfile = getCurrentUserChallengeProfile();

      return {
        id: dare.id,
        type: "dare" as const,
        challengerId: dare.challengerId,
        receiverId: dare.receiverId,
        challenger: {
          name: currentUserProfile.displayName,
          avatar: currentUserProfile.avatarUrl,
          username: currentUserProfile.username,
        },
        receiver: {
          name: receiverProfile.displayName,
          avatar: receiverProfile.avatarUrl,
          username: receiverProfile.username,
        },
        action: dare.description,
        state: dare.state as any,
        createdAt: dare.createdAt,
        sortAt: getSortAtValue(
          dare.completedAt,
          dare.proofSubmittedAt,
          dare.updatedAt,
          dare.createdAt,
        ),
        updatedAt: dare.proofSubmittedAt || dare.updatedAt || dare.createdAt,
        completedAt: dare.completedAt || undefined,
        proof: mapDareProofToChallengeProof(
          dare.proofMediaType,
          dare.proofMediaUrl,
          dare.proofThumbnailUrl,
        ),
      };
    },
    [getCurrentUserChallengeProfile, getUserProfileCached],
  );

  const mapReceivedDareToChallenge = useCallback(
    async (dare: any): Promise<Challenge> => {
      const challengerProfile = await getUserProfileCached(dare.challengerId);

      return {
        id: dare.id,
        type: "dare" as const,
        challengerId: dare.challengerId,
        receiverId: dare.receiverId,
        challenger: {
          name: challengerProfile.displayName,
          avatar: challengerProfile.avatarUrl,
          username: challengerProfile.username,
        },
        action: dare.description,
        state: dare.state as any,
        createdAt: dare.createdAt,
        sortAt: getSortAtValue(
          dare.completedAt,
          dare.proofSubmittedAt,
          dare.updatedAt,
          dare.createdAt,
        ),
        updatedAt: dare.proofSubmittedAt || dare.updatedAt || dare.createdAt,
        completedAt: dare.completedAt || undefined,
        proof: mapDareProofToChallengeProof(
          dare.proofMediaType,
          dare.proofMediaUrl,
          dare.proofThumbnailUrl,
        ),
      };
    },
    [getUserProfileCached],
  );

  const refreshSentDares = useCallback(async () => {
    if (!isActive || !user?.id) return;

    try {
      const sentDaresResponse = await dareService.getSentDares(user.id);
      if (!sentDaresResponse.success || !sentDaresResponse.dares) return;

      const liveSentDares = await Promise.all(
        sentDaresResponse.dares.map((dare) => mapSentDareToChallenge(dare)),
      );

      setSentChallenges((prev) => mergeSentChallenges(prev, liveSentDares));
    } catch (error) {
      console.error("Error refreshing sent dares:", error);
    }
  }, [isActive, mapSentDareToChallenge, mergeSentChallenges, user?.id]);

  // Keep rendered cards in sync with real-time profile/avatar updates.
  // Re-sort after mapping so truths and dares always interleave by latest activity,
  // regardless of which type profile data resolved first.
  useEffect(() => {
    setChallenges((prev) =>
      sortChallengesByLatestActivity(
        prev.map((challenge) => {
          const challenger = resolveLiveProfileForUser(challenge.challengerId, {
            name: challenge.challenger.name,
            username: challenge.challenger.username,
            avatar: challenge.challenger.avatar,
          });

          const receiver = challenge.receiver
            ? resolveLiveProfileForUser(challenge.receiverId, {
                name: challenge.receiver.name,
                username: challenge.receiver.username,
                avatar: challenge.receiver.avatar,
              })
            : null;

          return {
            ...challenge,
            challenger: {
              ...challenge.challenger,
              name: challenger.name,
              username: challenger.username,
              avatar: challenger.avatar,
            },
            ...(receiver
              ? {
                  receiver: {
                    ...challenge.receiver!,
                    name: receiver.name,
                    username: receiver.username,
                    avatar: receiver.avatar,
                  },
                }
              : {}),
            sortAt:
              challenge.sortAt || challenge.updatedAt || challenge.createdAt,
          };
        }),
      ),
    );

    setSentChallenges((prev) =>
      sortChallengesByLatestActivity(
        prev.map((challenge) => {
          const challenger = resolveLiveProfileForUser(challenge.challengerId, {
            name: challenge.challenger.name,
            username: challenge.challenger.username,
            avatar: challenge.challenger.avatar,
          });

          const receiver = challenge.receiver
            ? resolveLiveProfileForUser(challenge.receiverId, {
                name: challenge.receiver.name,
                username: challenge.receiver.username,
                avatar: challenge.receiver.avatar,
              })
            : null;

          return {
            ...challenge,
            challenger: {
              ...challenge.challenger,
              name: challenger.name,
              username: challenger.username,
              avatar: challenger.avatar,
            },
            ...(receiver
              ? {
                  receiver: {
                    ...challenge.receiver!,
                    name: receiver.name,
                    username: receiver.username,
                    avatar: receiver.avatar,
                  },
                }
              : {}),
            sortAt:
              challenge.sortAt || challenge.updatedAt || challenge.createdAt,
          };
        }),
      ),
    );
  }, [resolveLiveProfileForUser]);

  useEffect(() => {
    if (!isActive || !user?.id) return;

    const loadTruths = async () => {
      try {
        console.log("Loading truths and dares for user:", user.id);

        // Check for highlighted truth ID from sessionStorage
        const storedHighlightId = sessionStorage.getItem("highlightTruthId");
        if (storedHighlightId) {
          console.log("🎯 Found highlighted truth ID:", storedHighlightId);
          setHighlightedTruthId(storedHighlightId);
          // Clear it after using
          sessionStorage.removeItem("highlightTruthId");
        }

        // Load received truths
        const receivedResponse = await truthService.getUserTruths(
          user.id,
          "received",
        );
        console.log("Received truths response:", receivedResponse);

        let receivedTruthChallenges: Challenge[] = [];

        if (receivedResponse.success && receivedResponse.truths) {
          receivedTruthChallenges = await Promise.all(
            receivedResponse.truths.map((truth) =>
              mapReceivedTruthToChallenge(truth),
            ),
          );
        }

        // Load received dares
        const receivedDaresResponse = await dareService.getReceivedDares(
          user.id,
        );
        console.log("Received dares response:", receivedDaresResponse);

        let receivedDareChallenges: Challenge[] = [];

        if (receivedDaresResponse.success && receivedDaresResponse.dares) {
          receivedDareChallenges = await Promise.all(
            receivedDaresResponse.dares.map((dare) =>
              mapReceivedDareToChallenge(dare),
            ),
          );
        }

        const sortedReceivedChallenges = sortChallengesByLatestActivity([
          ...receivedTruthChallenges,
          ...receivedDareChallenges,
        ]);
        console.log(
          "All received challenges (truths + dares):",
          sortedReceivedChallenges,
        );
        setChallenges(sortedReceivedChallenges);

        // Load sent truths and dares together so the Sent tab is complete on
        // first render, even before realtime listeners deliver snapshots.
        const [sentResponse, sentDaresResponse] = await Promise.all([
          truthService.getUserTruths(user.id, "sent"),
          dareService.getSentDares(user.id),
        ]);
        console.log("Sent truths response:", sentResponse);
        console.log("Sent dares response:", sentDaresResponse);
        console.log("🔍 SENT TRUTHS DEBUG:", {
          userId: user.id,
          type: "sent",
          success: sentResponse.success,
          truthsCount: sentResponse.truths?.length,
          truths: sentResponse.truths?.map((t) => ({
            id: t.id,
            challengerId: t.challengerId,
            receiverId: t.receiverId,
            question: t.question,
            state: t.state,
          })),
        });

        let allSentChallenges: Challenge[] = [];

        if (sentResponse.success && sentResponse.truths) {
          const sentTruthChallenges: Challenge[] = await Promise.all(
            sentResponse.truths.map((truth) => mapSentTruthToChallenge(truth)),
          );

          allSentChallenges = [...allSentChallenges, ...sentTruthChallenges];
        } else {
          console.log("No sent truths found or error:", sentResponse.error);
        }

        if (sentDaresResponse.success && sentDaresResponse.dares) {
          const sentDareChallenges: Challenge[] = await Promise.all(
            sentDaresResponse.dares.map((dare) => mapSentDareToChallenge(dare)),
          );

          allSentChallenges = [...allSentChallenges, ...sentDareChallenges];
        } else {
          console.log("No sent dares found or error:", sentDaresResponse.error);
        }

        const sortedSentChallenges =
          sortChallengesByLatestActivity(allSentChallenges);
        console.log("Loaded sent challenges:", sortedSentChallenges);
        setSentChallenges(sortedSentChallenges);
      } catch (error) {
        console.error("Error loading truths:", error);
      }
    };

    loadTruths();
  }, [
    mapReceivedTruthToChallenge,
    mapReceivedDareToChallenge,
    mapSentTruthToChallenge,
    mapSentDareToChallenge,
    shouldRefresh,
    isActive,
    user?.id,
  ]); // Add shouldRefresh as dependency

  useEffect(() => {
    if (!isActive || !user?.id) return;

    let isMounted = true;
    const unsubscribe = dareService.subscribeToUserDares(
      user.id,
      "sent",
      (dares) => {
        void (async () => {
          const liveSentDares = await Promise.all(
            dares.map((dare) => mapSentDareToChallenge(dare)),
          );

          if (!isMounted) return;

          setSentChallenges((prev) => mergeSentChallenges(prev, liveSentDares));
        })();
      },
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [isActive, mapSentDareToChallenge, mergeSentChallenges, user?.id]);

  useEffect(() => {
    if (!isActive || !user?.id) return;

    let isMounted = true;
    const unsubscribe = dareService.subscribeToUserDares(
      user.id,
      "received",
      (dares) => {
        void (async () => {
          const liveReceivedDares = await Promise.all(
            dares.map((dare) => mapReceivedDareToChallenge(dare)),
          );

          if (!isMounted) return;

          setChallenges((prev) =>
            mergeReceivedChallenges(prev, liveReceivedDares),
          );
        })();
      },
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [isActive, mapReceivedDareToChallenge, mergeReceivedChallenges, user?.id]);

  // Real-time listener for received truths
  useEffect(() => {
    if (!isActive || !user?.id) return;

    let isMounted = true;
    const unsubscribe = truthService.subscribeToUserTruths(
      user.id,
      "received",
      async (truths) => {
        const mapped = await Promise.all(
          truths.map((t) => mapReceivedTruthToChallenge(t)),
        );
        if (!isMounted) return;
        setChallenges((prev) => {
          const dares = prev.filter((c) => c.type === "dare");
          return sortChallengesByLatestActivity([...dares, ...mapped]);
        });
      },
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [isActive, mapReceivedTruthToChallenge, user?.id]);

  // Real-time listener for sent truths
  useEffect(() => {
    if (!isActive || !user?.id) return;

    let isMounted = true;
    const unsubscribe = truthService.subscribeToUserTruths(
      user.id,
      "sent",
      async (truths) => {
        const mapped = await Promise.all(
          truths.map((t) => mapSentTruthToChallenge(t)),
        );
        if (!isMounted) return;
        setSentChallenges((prev) => {
          const dares = prev.filter((c) => c.type === "dare");
          return sortChallengesByLatestActivity([...dares, ...mapped]);
        });
      },
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [isActive, mapSentTruthToChallenge, user?.id]);

  useEffect(() => {
    if (!isActive || !user?.id || alerts.length === 0) return;

    const pendingCompletedAlerts = alerts.filter(
      (alert) =>
        alert.userId === user.id &&
        (alert.type === "DARE_COMPLETED" ||
          alert.type === "DARE_PROOF_SUBMITTED") &&
        !!alert.entityId &&
        !handledCompletedAlertIds.current.has(alert.id),
    );

    if (pendingCompletedAlerts.length === 0) return;

    void (async () => {
      for (const alert of pendingCompletedAlerts) {
        handledCompletedAlertIds.current.add(alert.id);

        try {
          const dareResponse = await dareService.getDareById(alert.entityId);
          if (!dareResponse.success || !dareResponse.dare) continue;

          const liveChallenge = await mapSentDareToChallenge(dareResponse.dare);

          setSentChallenges((prev) =>
            mergeSentChallenges(prev, [liveChallenge]),
          );
        } catch (error) {
          console.error("Error syncing sent dare from alert:", error);
          handledCompletedAlertIds.current.delete(alert.id);
        }
      }
    })();
  }, [alerts, isActive, mapSentDareToChallenge, mergeSentChallenges, user?.id]);

  // Function to trigger refresh when coming back from TruthAnswerScreen
  const refreshTruths = useCallback(() => {
    console.log("Refreshing truths...");
    setShouldRefresh((prev) => prev + 1);
  }, []);

  const syncReceivedDare = useCallback(
    async (dareId: string) => {
      const dareResponse = await dareService.getDareById(dareId);
      if (!dareResponse.success || !dareResponse.dare) return null;

      const liveChallenge = await mapReceivedDareToChallenge(dareResponse.dare);
      setChallenges((prev) => mergeReceivedChallenges(prev, [liveChallenge]));
      return liveChallenge;
    },
    [mapReceivedDareToChallenge, mergeReceivedChallenges],
  );

  const handleAccept = useCallback(
    async (challenge: Challenge) => {
      if (challenge.type === "truth") {
        try {
          // Navigate to truth answer screen directly
          setActiveChallenge(challenge);
          setCurrentScreen("truth");
        } catch (error) {
          console.error("Error accepting truth:", error);
        }
      } else {
        if (challenge.state !== "SENT") {
          await syncReceivedDare(challenge.id);
          return;
        }

        // For dares, persist ACCEPTED state first so completion screen validation passes.
        if (!user?.id) {
          console.warn("Cannot accept dare: missing current user");
          return;
        }
        try {
          const acceptResponse = await dareService.acceptDare(
            challenge.id,
            user.id,
          );
          if (!acceptResponse?.success) {
            const liveChallenge = await syncReceivedDare(challenge.id);
            if (liveChallenge?.state === "ACCEPTED") {
              setAcceptedTimers((prev) => ({ ...prev, [challenge.id]: 900 }));
              setShowAcceptPrompt(liveChallenge);
            }
            return;
          }

          setChallenges((prev) =>
            sortChallengesByLatestActivity(
              prev.map((c) =>
                c.id === challenge.id
                  ? {
                      ...c,
                      state: "ACCEPTED" as const,
                      updatedAt: new Date().toISOString(),
                      sortAt: new Date().toISOString(),
                    }
                  : c,
              ),
            ),
          );
          setAcceptedTimers((prev) => ({ ...prev, [challenge.id]: 900 }));
          setShowAcceptPrompt(challenge);
        } catch (error) {
          console.warn("Error accepting dare:", error);
          await syncReceivedDare(challenge.id).catch(() => null);
        }
      }
    },
    [syncReceivedDare, user?.id],
  );

  const handleSurrender = useCallback(async (challenge: Challenge) => {
    if (challenge.type !== "dare" || !user?.id) return;

    try {
      // Persist the refusal before updating the local inbox. Without this
      // call, the UI showed CHICKEN_OUT only until the next reload.
      await dareService.chickenOut(challenge.id, user.id);

      // Increment the challenger's refused count only after the state change
      // has been accepted by the server.
      if (challenge.challengerId) {
        try {
          await userService.incrementDaresRefused(challenge.challengerId);
        } catch (error) {
          console.error("Failed to increment dares refused count:", error);
        }
      }

      const now = new Date().toISOString();
      setChallenges((prev) =>
        sortChallengesByLatestActivity(
          prev.map((c) =>
            c.id === challenge.id
              ? {
                  ...c,
                  state: "CHICKEN_OUT" as const,
                  updatedAt: now,
                  completedAt: now,
                  sortAt: now,
                }
              : c,
          ),
        ),
      );
    } catch (error) {
      console.warn("Error refusing dare:", error);
      await syncReceivedDare(challenge.id).catch(() => null);
    }
  }, [syncReceivedDare, user?.id]);

  const handleComplete = useCallback((challenge: Challenge) => {
    setActiveChallenge(challenge);
    setCurrentScreen(challenge.type === "truth" ? "truth" : "dare");

    // Initialize timer in localStorage when opening completion screen
    if (challenge.type === "dare") {
      const timerKey = `dare_timer_${challenge.id}`;
      const expiredKey = `dare_expired_${challenge.id}`;

      // Clear expired flag if it exists
      localStorage.removeItem(expiredKey);

      // Initialize timer if not already set
      if (!localStorage.getItem(timerKey)) {
        localStorage.setItem(timerKey, (15 * 60).toString()); // 15 minutes
      }

      console.log("Opening dare completion for:", challenge.id);
    }
  }, []);

  const handleReview = useCallback((challenge: Challenge) => {
    setActiveChallenge(challenge);
    setCurrentScreen("review");
  }, []);

  const handlePredictionResponse = useCallback((prediction: PredictionPost) => {
    setActivePrediction(prediction);
    setCurrentScreen("prediction-response");
  }, []);

  const handleBackToDares = useCallback(() => {
    console.log("Coming back to dares, refreshing truths and dares...");
    refreshTruths(); // Refresh truths to get updated state
    submissionCinematicTimeoutsRef.current.forEach((timeoutId) =>
      window.clearTimeout(timeoutId),
    );
    submissionCinematicTimeoutsRef.current = [];
    setIsSubmissionCinematicExiting(false);
    setCurrentScreen("dares");
    setActiveChallenge(null);
    setActivePrediction(null);

    // Clear expired flags for completed dares
    if (activeChallenge?.type === "dare") {
      const expiredKey = `dare_expired_${activeChallenge.id}`;
      localStorage.removeItem(expiredKey);
    }
  }, [refreshTruths, activeChallenge]);

  const handleReviewDecision = useCallback(
    async (decision: "ACCEPT" | "REJECT") => {
      if (!activeChallenge || !user?.id) return;
      const response = await dareService.challengerReviewDare(
        activeChallenge.id,
        user.id,
        decision,
      );
      if (!response.success) {
        throw new Error(response.error || "Could not review this dare");
      }
      await refreshTruths();
      handleBackToDares();
    },
    [activeChallenge, handleBackToDares, refreshTruths, user?.id],
  );

  const handleDareSubmit = (_proof: {
    type: "image" | "video" | "audio";
    url: string;
    thumbnail?: string;
  }) => {
    console.log("🔥 [NUCLEAR] Most powerful fix - complete UI reset");

    if (activeChallenge) {
      console.log("🔥 [NUCLEAR] Target challenge:", activeChallenge.id);

      // NUCLEAR OPTION 1: Direct state mutation (bypass React)
      challenges.forEach((c, index) => {
        if (c.id === activeChallenge.id) {
          console.log(
            "🔥 [NUCLEAR] Direct mutation of challenge at index",
            index,
          );
          // Force mutate the object directly
          (c as any).state = "PROOF_SUBMITTED";
        }
      });

      // NUCLEAR OPTION 2: Force complete state reset
      console.log("🔥 [NUCLEAR] Resetting all state");
      const nuclearChallenges = challenges.map((c) => {
        if (c.id === activeChallenge.id) {
          return {
            ...c,
            state: "PROOF_SUBMITTED" as const,
            updatedAt: new Date().toISOString(),
            sortAt: new Date().toISOString(),
          };
        }
        return c;
      });

      // NUCLEAR OPTION 3: Set state multiple times to force re-render
      setChallenges([]); // Clear first
      setTimeout(() => {
        setChallenges(nuclearChallenges); // Then set new data
        console.log("🔥 [NUCLEAR] State reset complete");
      }, 10);

      // NUCLEAR OPTION 4: Update sent challenges too
      const nuclearSentChallenges = sentChallenges.map((c) => {
        if (c.id === activeChallenge.id) {
          return {
            ...c,
            state: "PROOF_SUBMITTED" as const,
            updatedAt: new Date().toISOString(),
            sortAt: new Date().toISOString(),
          };
        }
        return c;
      });
      setSentChallenges(sortChallengesByLatestActivity(nuclearSentChallenges));

      // NUCLEAR OPTION 5: Force navigation and refresh
      setCurrentScreen("dares"); // Go to dares state first
      setActiveChallenge(null);

      setTimeout(() => {
        setCurrentScreen("dares"); // Then back to dares
        console.log("🔥 [NUCLEAR] Navigation reset complete");
      }, 100);

      // NUCLEAR OPTION 6: Force multiple refreshes
      setTimeout(() => refreshTruths(), 150);
      setTimeout(() => refreshTruths(), 300);
      setTimeout(() => refreshTruths(), 500);

      console.log("🔥 [NUCLEAR] All nuclear options deployed");
    }
  };

  useEffect(() => {
    if (!isActive || !user?.id) return;
    void loadDramaFeed(true);
  }, [isActive, user?.id]);

  const predictionMentions = useMemo<PredictionMention[]>(() => {
    if (!user?.id) return [];
    const viewerId = String(user.id).trim();
    return predictions
      .filter((prediction) => {
        if (prediction.subject.type !== "friend" || prediction.verdict) {
          return false;
        }
        return String(prediction.subject.id).trim() === viewerId;
      })
      .map((prediction) => ({
        kind: "prediction" as const,
        prediction,
        sortAt: prediction.createdAt,
      }));
  }, [predictions, user?.id]);

  const receivedChallengesForDisplay = useMemo<ReceivedFeedItem[]>(
    () =>
      sortReceivedFeedItems([
        ...sortChallengesByLatestActivity(challenges),
        ...predictionMentions,
      ]),
    [challenges, predictionMentions],
  );

  const sentChallengesForDisplay = useMemo(
    () => sortChallengesByLatestActivity(sentChallenges),
    [sentChallenges],
  );

  const receivedQueueSummary = useMemo(() => {
    let waiting = 0;
    let active = 0;
    receivedChallengesForDisplay.forEach((item) => {
      if (isPredictionMention(item)) {
        if (!item.prediction.subjectThought) waiting += 1;
        return;
      }
      if (item.state === "SENT") waiting += 1;
      if (item.state === "ACCEPTED") active += 1;
    });
    return { waiting, active };
  }, [receivedChallengesForDisplay]);

  const receivedUnreadSummary = useMemo(() => {
    let dares = 0;
    let truths = 0;
    let predictions = 0;

    receivedChallengesForDisplay.forEach((item) => {
      if (isPredictionMention(item)) {
        if (!item.prediction.subjectThought) predictions += 1;
        return;
      }

      if (item.state !== "SENT") return;
      if (item.type === "dare") dares += 1;
      if (item.type === "truth") truths += 1;
    });

    return { total: dares + truths + predictions };
  }, [receivedChallengesForDisplay]);

  const handleDareSubmittedCinematic = async (proof: {
    type: "image" | "video" | "audio";
    url: string;
    thumbnail?: string;
  }) => {
    if (!activeChallenge) return;
    if (!user?.id) {
      throw new Error("Cannot submit proof without a signed-in user");
    }

    const now = new Date().toISOString();
    const challengeId = activeChallenge.id;
    const submittedProof = proof;

    setChallenges((prev) =>
      sortChallengesByLatestActivity(
        prev.map((c) =>
          c.id === challengeId
            ? {
                ...c,
                state: "PROOF_SUBMITTED" as const,
                updatedAt: now,
                sortAt: now,
                proof: submittedProof,
              }
            : c,
        ),
      ),
    );

    setSentChallenges((prev) =>
      sortChallengesByLatestActivity(
        prev.map((c) =>
          c.id === challengeId
            ? {
                ...c,
                state: "PROOF_SUBMITTED" as const,
                updatedAt: now,
                sortAt: now,
                proof: submittedProof,
              }
            : c,
        ),
      ),
    );

    submissionCinematicTimeoutsRef.current.forEach((timeoutId) =>
      window.clearTimeout(timeoutId),
    );
    submissionCinematicTimeoutsRef.current = [];
    setIsSubmissionCinematicExiting(false);
    setCurrentScreen("submitted");

    submissionCinematicTimeoutsRef.current.push(
      window.setTimeout(() => {
        setIsSubmissionCinematicExiting(true);
      }, 2200),
    );

    submissionCinematicTimeoutsRef.current.push(
      window.setTimeout(() => {
        setCurrentScreen("dares");
        setActiveChallenge(null);
        setIsSubmissionCinematicExiting(false);
        submissionCinematicTimeoutsRef.current = [];
      }, 2800),
    );

    // Persist after UI updates, so network latency cannot block completion feedback.
    void dareService
      .submitProof(
        challengeId,
        user.id,
        proof.url,
        mapProofTypeToDareMediaType(proof.type),
        proof.thumbnail,
      )
      .then((submitResponse) => {
        if (!submitResponse.success || !submitResponse.dare) {
          throw new Error(submitResponse.error || "Failed to submit proof");
        }
        void refreshTruths();
      })
      .catch((error) => {
        console.error("[DaresReceived] Background proof submission failed:", error);
      });
  };

  if (currentScreen === "truth" && activeChallenge) {
    return (
      <TruthAnswerScreen
        truthId={activeChallenge.id}
        onBack={handleBackToDares}
      />
    );
  }

  if (currentScreen === "dare" && activeChallenge) {
    return (
      <DareCompletionScreen
        challenge={{
          id: activeChallenge.id,
          challengerId: activeChallenge.challengerId,
          challenger: activeChallenge.challenger,
          action: activeChallenge.action!,
        }}
        onBack={handleBackToDares}
        onSubmit={handleDareSubmittedCinematic}
        skipValidation={true}
        initialTimeRemaining={acceptedTimers[activeChallenge.id] || 15 * 60}
      />
    );
  }

  if (currentScreen === "review" && activeChallenge?.type === "dare") {
    return (
      <ReviewScreen
        challenge={activeChallenge}
        onBack={handleBackToDares}
        onAccept={() => handleReviewDecision("ACCEPT")}
        onReject={() => handleReviewDecision("REJECT")}
      />
    );
  }

  if (currentScreen === "submitted" && activeChallenge?.type === "dare") {
    return (
      <DareSubmittedCinematicScreen
        recipientLabel={stripAtSymbol(activeChallenge.challenger.username)}
        isExiting={isSubmissionCinematicExiting}
      />
    );
  }

  if (currentScreen === "prediction-response" && activePrediction) {
    return (
      <PredictionResponseScreen
        prediction={activePrediction}
        onBack={handleBackToDares}
      />
    );
  }

  return (
    <div className="dares-received-screen screen-container relative flex flex-col overflow-hidden bg-[#050705] text-white">
      <style>
        {`@keyframes daresReceivedEnter {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .dares-received-screen::before {
            content: "";
            position: absolute;
            inset: 0;
            opacity: 0.14;
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.95' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.12'/%3E%3C/svg%3E");
            pointer-events: none;
          }
          .dares-received-item {
            animation: daresReceivedEnter 0.38s cubic-bezier(0.22, 1, 0.36, 1) both;
          }
          .dares-received-action-button {
            min-height: 44px;
          }
          .dares-received-action-button.btn-primary {
            background: #4ade80;
            color: #041006;
            box-shadow: none;
          }
          .dares-received-action-button.btn-primary:hover {
            background: #22c55e;
          }
          .dares-received-action-button.btn-secondary {
            border: 1px solid rgba(255,255,255,0.1);
            background: rgba(255,255,255,0.04);
            color: rgba(255,255,255,0.62);
          }
          .dares-received-action-button.btn-secondary:hover {
            border-color: rgba(255,255,255,0.16);
            background: rgba(255,255,255,0.07);
            color: white;
          }`}
      </style>
      <header
        className="relative z-10 px-5"
        style={{ paddingTop: "calc(var(--safe-area-top) + 16px)" }}
      >
        <div className="mx-auto max-w-2xl">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-[32px] font-black leading-none tracking-[-0.045em] text-white">Dares</h1>
              <p className="mt-2 text-[13px] font-semibold text-white/38">
                {activeTab === "received"
                  ? `${receivedUnreadSummary.total} new · ${receivedQueueSummary.active} active`
                  : `${sentChallengesForDisplay.length} sent`}
              </p>
            </div>
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.055] text-white/68">
              <Inbox size={20} strokeWidth={2.2} />
              {activeTab === "received" && receivedUnreadSummary.total > 0 && (
                <span className="absolute -right-1 -top-1 text-[11px] font-black leading-none text-[#4ade80]">
                  {receivedUnreadSummary.total > 99 ? "99+" : receivedUnreadSummary.total}
                </span>
              )}
            </div>
          </div>

          <nav className="grid grid-cols-2 rounded-[17px] bg-white/[0.055] p-1" aria-label="Dare inbox">
            <button
              type="button"
              onClick={() => setActiveTab("received")}
              className={`min-h-[38px] rounded-[13px] px-4 text-[13px] font-black transition-colors ${
                activeTab === "received"
                  ? "bg-white text-[#090b09]"
                  : "text-white/42 hover:text-white/70"
              }`}
            >
              <span className="inline-flex items-center gap-2">
                Received
                {receivedUnreadSummary.total > 0 && (
                  <span className="text-[11px] font-black text-[#16a34a]">
                    {receivedUnreadSummary.total > 99 ? "99+" : receivedUnreadSummary.total}
                  </span>
                )}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("sent")}
              className={`min-h-[38px] rounded-[13px] px-4 text-[13px] font-black transition-colors ${
                activeTab === "sent"
                  ? "bg-white text-[#090b09]"
                  : "text-white/42 hover:text-white/70"
              }`}
            >
              Sent
            </button>
          </nav>
        </div>
      </header>

      <div
        ref={listScrollRef}
        className="custom-scrollbar relative z-10 mt-3 flex-1 overflow-y-auto px-3"
        style={{
          paddingBottom: "calc(var(--safe-area-bottom) + 20px)",
        }}
      >
        <div className="mx-auto max-w-2xl space-y-2.5">
          {chatSource && <ChatSourceQuote source={chatSource} />}
          {activeTab === "received" && <InteractionInbox onOpen={onOpenInteraction} />}
          {activeTab === "received"
            ? receivedChallengesForDisplay.length > 0
              ? receivedChallengesForDisplay.map((item) =>
                  isPredictionMention(item) ? (
                    <PredictionMentionCard
                      key={`prediction-${item.prediction.id}`}
                      mention={item}
                      onRespond={handlePredictionResponse}
                    />
                  ) : (
                    <ChallengeCard
                      key={`${item.type}-${item.id}`}
                      challenge={item}
                      timeRemaining={acceptedTimers[item.id]}
                      formatTime={formatTime}
                      onAccept={handleAccept}
                      onSurrender={handleSurrender}
                      onComplete={handleComplete}
                      isHighlighted={
                        item.id === highlightedTruthId || item.id === highlightedDareId
                      }
                    />
                  ),
                )
              : (
                  <div className="flex min-h-[280px] flex-col items-center justify-center px-8 text-center">
                    <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.05] text-white/32">
                      <Inbox size={23} />
                    </span>
                    <h2 className="text-[18px] font-black text-white">Nothing waiting</h2>
                    <p className="mt-2 max-w-[240px] text-[13px] font-medium leading-5 text-white/36">
                      New truths, dares, and predictions will land here.
                    </p>
                  </div>
                )
            : sentChallengesForDisplay.length > 0
              ? sentChallengesForDisplay.map((challenge) => (
                  <SentChallengeCard
                    key={`${challenge.type}-${challenge.id}`}
                    challenge={challenge}
                    isHighlighted={
                      challenge.id === highlightedTruthId || challenge.id === highlightedDareId
                    }
                    onReview={handleReview}
                  />
                ))
              : (
                  <div className="flex min-h-[280px] flex-col items-center justify-center px-8 text-center">
                    <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.05] text-white/32">
                      <Target size={23} />
                    </span>
                    <h2 className="text-[18px] font-black text-white">No sent dares yet</h2>
                    <p className="mt-2 max-w-[240px] text-[13px] font-medium leading-5 text-white/36">
                      Challenges you send to friends will stay organized here.
                    </p>
                  </div>
                )}
        </div>
      </div>

      {showAcceptPrompt && (
        <div
          className="app-modal-backdrop fixed inset-0 z-50 flex items-end bg-black/74 backdrop-blur-[3px]"
          onClick={() => setShowAcceptPrompt(null)}
        >
          <div
            className="app-modal-dialog mx-auto w-full max-w-2xl overflow-y-auto rounded-t-[30px] border-x border-t border-white/9 bg-[#111411] px-5 pb-[calc(var(--safe-area-bottom)+20px)] pt-3 shadow-[0_-24px_70px_rgba(0,0,0,0.5)]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="accepted-challenge-title"
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/14" />
            <div className="mb-7 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#4ade80]/10 text-[#72e994]">
                <Target size={23} strokeWidth={2.3} />
              </div>
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#72e994]">
                Challenge accepted
              </p>
              <h3 id="accepted-challenge-title" className="text-[24px] font-black leading-tight tracking-[-0.025em] text-white">
                {showAcceptPrompt.type === "truth" ? "Ready to answer?" : "Ready to prove it?"}
              </h3>
              <p className="mx-auto mt-2 max-w-[280px] text-[14px] font-medium leading-5 text-white/42">
                {showAcceptPrompt.type === "truth"
                  ? "Answer honestly now, or return to it from your active queue."
                  : "Your timer is already running. Complete the dare and submit proof."}
              </p>
            </div>

            <div className="space-y-2.5">
              <button
                onClick={async () => {
                  setShowAcceptPrompt(null);
                  // For dares, validate state before navigating to prevent error page flash
                  if (showAcceptPrompt.type === "dare") {
                    try {
                      const dareResponse = await dareService.getDareById(
                        showAcceptPrompt.id,
                      );
                      if (
                        dareResponse.success &&
                        dareResponse.dare?.state === "ACCEPTED"
                      ) {
                        setActiveChallenge(showAcceptPrompt);
                        setCurrentScreen("dare");
                      } else {
                        console.error(
                          "Dare not in ACCEPTED state, cannot navigate to completion screen",
                        );
                        // Stay on the main screen
                        return;
                      }
                    } catch (error) {
                      console.error("Error validating dare state:", error);
                      return;
                    }
                  } else {
                    // For truths, navigate directly
                    setActiveChallenge(showAcceptPrompt);
                    setCurrentScreen("truth");
                  }
                }}
                className={`btn btn-primary ${curvedModalButtonClass}`}
              >
                Start now
              </button>
              <button
                onClick={() => setShowAcceptPrompt(null)}
                className={`btn btn-secondary ${curvedModalButtonClass}`}
              >
                Do it later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DaresReceivedScreen;
