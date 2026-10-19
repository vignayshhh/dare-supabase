"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type TouchEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  CalendarClock,
  Check,
  Gift,
  Handshake,
  Hourglass,
  Laugh,
  MessageCircle,
  RefreshCw,
  Send,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore-v2";
import {
  type PredictionPost,
  type PredictionVote,
  type PredictionVerdict,
  type PredictionComment,
  usePredictionStore,
} from "@/stores/usePredictionStore";
import {
  type DealPost,
  type DealResult,
  useDealStore,
} from "@/stores/useDealStore";
import {
  type CustomPost,
  type CustomVote,
  type DramaComment,
  type DramaParticipant,
  type PromisePost,
  type PromiseVote,
  type RumourPost,
  type RumourVote,
  useDramaStore,
} from "@/stores/useDramaStore";
import { loadDramaFeed, subscribeToDramaCards } from "@/stores/dramaBackend";
import { InteractionReceipt } from "../circles/InteractionReceipt";
import { InteractionConfirmation } from "../circles/InteractionConfirmation";
import { PromiseTugFigures } from "../circles/PromiseTugFigures";
import { Avatar } from "../ui/Avatar";

type DramaFeedKind = "all" | "predictions" | "rumours" | "promises" | "custom";
type UploadRequestKind =
  | "prediction"
  | "deal"
  | "rumour"
  | "promise"
  | "custom";

export type TextCardUploadRequest = {
  kind: UploadRequestKind;
  nonce: number;
};

export type PredictionFeedExternalItem = {
  type: "external";
  id: string;
  createdAt: string;
  render: (isActive: boolean, isScrolling: boolean) => ReactNode;
};

type PredictionFeedItem =
  | PredictionFeedExternalItem
  | {
      type: "prediction";
      id: string;
      createdAt: string;
      prediction: PredictionPost;
    }
  | {
      type: "deal";
      id: string;
      createdAt: string;
      deal: DealPost;
    }
  | {
      type: "rumour";
      id: string;
      createdAt: string;
      rumour: RumourPost;
    }
  | {
      type: "promise";
      id: string;
      createdAt: string;
      promise: PromisePost;
    }
  | {
      type: "custom";
      id: string;
      createdAt: string;
      custom: CustomPost;
    };

function sortFeedItemsByNewest<T extends { createdAt: string }>(items: T[]) {
  return [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function isDeadlineReviewItem(item: PredictionFeedItem, now: number) {
  // Truth cards are embedded external cards and custom cards have no outcome
  // lifecycle, so both always stay in Upcoming.
  if (item.type === "external" || item.type === "custom") return false;
  if (item.type === "prediction") {
    return now >= new Date(item.prediction.deadline).getTime();
  }
  if (item.type === "deal") {
    return now >= new Date(item.deal.resolutionDate).getTime();
  }
  if (item.type === "promise") {
    return now >= new Date(item.promise.dueAt).getTime();
  }
  if (item.type === "rumour") {
    const deadlineMs = new Date(item.rumour.deadline).getTime();
    return Number.isFinite(deadlineMs) && now >= deadlineMs;
  }
  return false;
}

function formatElapsedSince(date: string, now: number) {
  const elapsedMs = Math.max(0, now - new Date(date).getTime());
  const elapsedDays = Math.floor(elapsedMs / 86_400_000);
  if (elapsedDays < 1) return "today";
  if (elapsedDays < 30) return `${elapsedDays} day${elapsedDays === 1 ? "" : "s"} ago`;
  const elapsedMonths = Math.floor(elapsedDays / 30);
  return `${elapsedMonths} month${elapsedMonths === 1 ? "" : "s"} ago`;
}

function getDeadlineReviewCopy(item: PredictionFeedItem, now: number) {
  if (item.type === "prediction") {
    return `${item.prediction.poster.name} and ${getSubjectLabel(item.prediction)} made this prediction ${formatElapsedSince(item.prediction.createdAt, now)}. Now what happened?`;
  }
  if (item.type === "deal") {
    return `${item.deal.creator.name} and ${getDealSubjectLabel(item.deal)} made this deal ${formatElapsedSince(item.deal.createdAt, now)}. Now what happened?`;
  }
  if (item.type === "promise") {
    return `${item.promise.maker.name} made this promise to ${item.promise.targetLabel} ${formatElapsedSince(item.promise.createdAt, now)}. Now what happened?`;
  }
  if (item.type === "rumour") {
    return `${item.rumour.poster.name} shared this rumour ${formatElapsedSince(item.rumour.createdAt, now)}. The room has heard the outcome.`;
  }
  return "The deadline has passed. Now what happened?";
}

const DEADLINE_REVIEW_INTRO_KEY = "dare:deadline-review-intro-hidden";

function DeadlineReviewPrompt({
  item,
  now,
  onClose,
  onDontShowAgain,
}: {
  item: PredictionFeedItem;
  now: number;
  onClose: () => void;
  onDontShowAgain: (checked: boolean) => void;
}) {
  return (
    <article className="relative w-full max-w-[440px] overflow-hidden rounded-[24px] border border-[#facc15]/28 bg-[radial-gradient(circle_at_18%_0%,rgba(250,204,21,0.18),transparent_45%),linear-gradient(180deg,rgba(31,25,12,0.98),rgba(7,8,8,0.98))] p-4 shadow-[0_22px_70px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-xl sm:p-5">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(253,230,138,0.9),transparent)]" />
      <div className="relative flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#facc15]/30 bg-[#facc15]/12 text-[#fde68a]">
          <CalendarClock size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="m-0 text-[11px] font-black uppercase tracking-[0.16em] text-[#fde68a]">
              Outcome reveal
            </p>
            <button type="button" onClick={onClose} className="-mr-1 -mt-1 flex h-7 w-7 items-center justify-center rounded-full text-white/45 hover:bg-white/10 hover:text-white" aria-label="Close outcome explanation">
              <X size={15} />
            </button>
          </div>
          <p className="m-0 mt-1 text-[14px] font-black leading-tight text-white">
            This is where the outcome is revealed
          </p>
          <p className="m-0 mt-1.5 text-[12px] font-bold leading-snug text-white/58">
            {getDeadlineReviewCopy(item, now)} Review the card, then vote on what actually happened.
          </p>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-[11px] font-black text-white/55">
            <input type="checkbox" onChange={(event) => onDontShowAgain(event.target.checked)} className="h-4 w-4 accent-[#facc15]" />
            Don’t show next time
          </label>
        </div>
      </div>
    </article>
  );
}

const uploadCopy: Record<
  UploadRequestKind,
  { title: string; done: string; tone: string }
> = {
  prediction: {
    title: "Posting prediction",
    done: "Prediction posted",
    tone: "#4ade80",
  },
  deal: {
    title: "Posting deal",
    done: "Deal posted",
    tone: "#4ade80",
  },
  rumour: {
    title: "Posting rumour",
    done: "Rumour posted",
    tone: "#fb7185",
  },
  promise: {
    title: "Posting promise",
    done: "Promise posted",
    tone: "#38bdf8",
  },
  custom: {
    title: "Posting custom card",
    done: "Custom card posted",
    tone: "#2dd4bf",
  },
};

function mixFeedTypesEvenly(
  groups: Array<{ type: string; items: PredictionFeedItem[] }>,
) {
  const queues = groups
    .map((group) => ({
      type: group.type,
      items: sortFeedItemsByNewest(group.items),
    }))
    .filter((group) => group.items.length > 0);
  const mixed: PredictionFeedItem[] = [];

  while (queues.some((queue) => queue.items.length > 0)) {
    const activeQueues = queues
      .filter((queue) => queue.items.length > 0)
      .sort(
        (a, b) =>
          new Date(b.items[0]?.createdAt || 0).getTime() -
          new Date(a.items[0]?.createdAt || 0).getTime(),
      );

    if (activeQueues.length === 1) {
      mixed.push(...activeQueues[0].items.splice(0));
      break;
    }

    const lastType = mixed[mixed.length - 1]?.type;
    if (lastType && activeQueues[0]?.type === lastType) {
      activeQueues.push(activeQueues.shift()!);
    }

    activeQueues.forEach((queue) => {
      const nextItem = queue.items.shift();
      if (nextItem) mixed.push(nextItem);
    });
  }

  return mixed;
}

function getSubjectLabel(prediction: PredictionPost) {
  if (prediction.subject.type === "friend") return prediction.subject.name;
  if (prediction.subject.type === "event") return prediction.subject.name;
  return "the whole group";
}

function getDealSubjectLabel(deal: DealPost) {
  if (deal.subject.type === "friend") return deal.subject.name;
  if (deal.subject.type === "event") return deal.subject.name;
  return deal.scope === "crew" ? "the crew" : "the group";
}

function formatCountdown(deadline: string, now: number) {
  const target = new Date(deadline).getTime();
  const diff = target - now;
  const abs = Math.abs(diff);
  const totalMinutes = Math.floor(abs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (diff <= 0) return "Resolution due";
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

function isFinalDay(deadline: string, now: number) {
  const diff = new Date(deadline).getTime() - now;
  return diff > 0 && diff <= 24 * 60 * 60 * 1000;
}

function getCurrentParticipant(
  user: ReturnType<typeof useAuthStore.getState>["user"],
) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.displayName || user.username || "You",
    username: user.username,
    avatar: user.avatar || "",
  };
}

function PredictionAvatarStack({
  prediction,
  side,
}: {
  prediction: PredictionPost;
  side: "happens" | "wont";
}) {
  const voters = Object.entries(prediction.votes)
    .filter(([, vote]) => vote === side)
    .map(([id]) => prediction.voters[id])
    .filter(Boolean)
    .slice(0, 4);

  return (
    <div className="flex min-h-7 items-center">
      {voters.length === 0 ? (
        <span className="text-[11px] font-bold text-white/24">No one yet</span>
      ) : (
        voters.map((voter, index) => (
          <Avatar
            key={voter.id}
            src={voter.avatar}
            alt={voter.name}
            size={28}
            fallbackText={voter.name.charAt(0)}
            userId={voter.id}
            username={voter.username}
            disableRealtime
            className="-ml-2 first:ml-0 ring-2 ring-[#070907]"
            style={{
              opacity: prediction.verdict
                ? prediction.votes[voter.id] === side
                  ? 1
                  : 0.55
                : 1,
              transform:
                prediction.verdict &&
                ((prediction.verdict === "happened" && side === "happens") ||
                  (prediction.verdict === "didnt" && side === "wont"))
                  ? "translateY(-2px)"
                  : undefined,
            }}
          />
        ))
      )}
    </div>
  );
}

function VoterRail({
  voters,
  total,
  votes,
  options,
  viewerVote,
  resultsAvailable = false,
  colors,
}: {
  voters: Array<{
    id: string;
    name: string;
    avatar?: string;
    username?: string;
  }>;
  total: number;
  votes: Record<string, string>;
  options: Record<string, string>;
  viewerVote?: string;
  resultsAvailable?: boolean;
  colors: { primary: string; secondary: string };
}) {
  const [isOpen, setIsOpen] = useState(false);
  const optionEntries = Object.entries(options);
  const [activeOption, setActiveOption] = useState(optionEntries[0]?.[0] || "");
  const visibleVoters = voters.slice(0, 5);
  const remaining = Math.max(0, voters.length - visibleVoters.length);
  const voteGroups = Object.entries(options)
    .map(([value, label]) => ({
      value,
      label,
      voters: voters.filter((voter) => votes[voter.id] === value),
    }))
    .filter((group) => group.voters.length > 0);
  const activeGroup = voteGroups.find((group) => group.value === activeOption);
  const activeCount = activeGroup?.voters.length || 0;
  const activePct = total ? Math.round((activeCount / total) * 100) : 0;
  const handleClick = () => setIsOpen(true);

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="voter-rail mb-3 flex min-h-9 w-full items-center justify-between gap-3 px-1 py-1 text-left"
        aria-label="See who voted"
      >
        <span className="flex min-w-0 items-center pl-1">
          {visibleVoters.length ? (
            visibleVoters.map((voter, index) => (
              <Avatar
                key={voter.id}
                src={voter.avatar || ""}
                alt={voter.name}
                size={26}
                fallbackText={voter.name.charAt(0)}
                userId={voter.id}
                username={voter.username}
                disableRealtime
                className="-ml-1.5 first:ml-0 shrink-0 ring-2 ring-[#090b0d] transition-transform duration-200 group-hover:translate-y-[-2px]"
                style={{ zIndex: visibleVoters.length - index }}
              />
            ))
          ) : (
            <span className="text-[11px] font-bold text-white/30">
              Tap after voting
            </span>
          )}
          {remaining ? (
            <span className="ml-2 text-[10px] font-black text-white/38">
              +{remaining}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.1em] text-white/38">
          {total} {total === 1 ? "vote" : "votes"}
        </span>
      </button>
      {isOpen
        ? createPortal(
            (
        <div
          className={`fixed inset-0 z-[95] flex items-end justify-center bg-black/25 px-0 backdrop-blur-[2px] sm:px-0 ${
            viewerVote
              ? "pb-0"
              : "pb-[calc(var(--safe-area-bottom)+24px)]"
          }`}
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            onClick={() => setIsOpen(false)}
            aria-label="Close voters"
          />
          {viewerVote || resultsAvailable ? (
            <div
              className="voter-results-pop relative z-[1] flex h-[68vh] max-h-[620px] w-full max-w-[520px] flex-col overflow-hidden rounded-[28px_28px_0_0] border border-white/14 shadow-[0_-8px_40px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl"
              style={{
                background: `radial-gradient(circle at 12% -10%, ${colors.primary}24, transparent 32%), radial-gradient(circle at 92% 0%, ${colors.secondary}1f, transparent 30%), linear-gradient(180deg, rgba(14,18,22,0.79), rgba(5,7,10,0.89))`,
              }}
            >
              <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-white/20" />
              <div className="shrink-0 border-b border-white/8 px-4 pb-4 pt-3 sm:px-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p
                      className="m-0 text-[11px] font-black uppercase tracking-[0.16em]"
                      style={{ color: `${colors.primary}b3` }}
                    >
                      Roll call
                    </p>
                    <p className="m-0 mt-1 text-[22px] font-black leading-none text-white">
                      Who picked what?
                    </p>
                    <p className="m-0 mt-2 text-[12px] font-bold text-white/42">
                      {total} {total === 1 ? "take" : "takes"} from the room
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/65"
                    aria-label="Close voters"
                  >
                    <X size={17} />
                  </button>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span
                    className="text-[22px] font-black"
                    style={{ color: colors.primary }}
                  >
                    {activePct}% {options[activeOption] || "Selected"}
                  </span>
                  <span className="text-[12px] font-black uppercase tracking-[0.1em] text-white/35">
                    {activeCount} votes
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{
                      width: `${activePct}%`,
                      background: `linear-gradient(90deg, ${colors.primary}, ${colors.secondary})`,
                    }}
                  />
                </div>
                <div className="mt-4 flex gap-2">
                  {optionEntries.map(([value, label], index) => {
                    const count = voteGroups.find((group) => group.value === value)?.voters.length || 0;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setActiveOption(value)}
                        className={`min-w-0 flex-1 rounded-[14px] border px-2 py-2.5 text-[11px] font-black uppercase tracking-[0.06em] transition-all ${
                          activeOption === value
                            ? "border-white/30 text-white"
                            : "border-white/8 bg-white/[0.04] text-white/38"
                        }`}
                        style={
                          activeOption === value
                            ? {
                                borderColor:
                                  index % 2 === 0
                                    ? `${colors.primary}99`
                                    : `${colors.secondary}99`,
                                background:
                                  index % 2 === 0
                                    ? `${colors.primary}24`
                                    : `${colors.secondary}24`,
                                color:
                                  index % 2 === 0
                                    ? colors.primary
                                    : colors.secondary,
                              }
                            : undefined
                        }
                      >
                        {label} · {count}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
                {activeGroup?.voters.length ? (
                  <div className="space-y-2">
                    {activeGroup.voters.map((voter) => (
                        <div
                          key={voter.id}
                          className="flex items-center gap-3 rounded-[20px] border border-white/8 bg-white/[0.045] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                        >
                          <Avatar
                            src={voter.avatar || ""}
                            alt={voter.name}
                            size={36}
                            fallbackText={voter.name.charAt(0)}
                            userId={voter.id}
                            username={voter.username}
                            disableRealtime
                          />
                          <div className="min-w-0 flex-1">
                            <p className="m-0 truncate text-[13px] font-black text-white">
                              {voter.name}
                            </p>
                            <p className="m-0 mt-0.5 truncate text-[11px] font-bold text-white/38">
                              cast their take
                            </p>
                          </div>
                          <span
                            className="text-[11px] font-black uppercase tracking-[0.08em]"
                            style={{ color: colors.primary }}
                          >
                            {activeGroup.label}
                          </span>
                        </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex min-h-[140px] items-center justify-center text-center">
                    <p className="m-0 text-[13px] font-bold text-white/38">
                      Nobody picked this side yet.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div
              className="voter-first-pop relative z-[1] w-[min(340px,calc(100vw-32px))] rounded-[24px] border border-white/16 px-5 py-5 text-left shadow-[0_22px_65px_rgba(0,0,0,0.54),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-2xl"
              style={{
                background: `linear-gradient(145deg, ${colors.primary}20, ${colors.secondary}18), rgba(14,17,20,0.94)`,
              }}
            >
              <div
                className="mb-2 h-1 w-12 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${colors.primary}, ${colors.secondary})`,
                }}
              />
              <p className="m-0 text-[15px] font-black text-white">
                Vote first to see the results
              </p>
              <p className="m-0 mt-1 text-[12px] font-bold text-white/52">
                Cast your take, then unlock the tea from the crew.
              </p>
            </div>
          )}
        </div>
            ),
            document.body,
          )
        : null}
    </>
  );
}

function getDramaPct<T extends string>(votes: Record<string, T>, option: T) {
  const values = Object.values(votes);
  if (values.length === 0) return 50;
  return Math.round(
    (values.filter((value) => value === option).length / values.length) * 100,
  );
}

const RESULT_REVEAL_SECONDS = 10;

function useResultRevealCountdown(shouldDelay: boolean) {
  const [revealAt, setRevealAt] = useState(() =>
    shouldDelay ? Date.now() + RESULT_REVEAL_SECONDS * 1000 : 0,
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!shouldDelay) {
      setRevealAt(0);
      setNow(Date.now());
      return;
    }
    const nextRevealAt = Date.now() + RESULT_REVEAL_SECONDS * 1000;
    setRevealAt(nextRevealAt);
    setNow(Date.now());
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= nextRevealAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [shouldDelay]);

  const seconds = shouldDelay && revealAt
    ? Math.max(0, Math.ceil((revealAt - now) / 1000))
    : 0;
  return { isRevealed: !shouldDelay || seconds === 0, seconds };
}

function ResultRevealCountdown({ accent, seconds }: { accent: string; seconds: number }) {
  return (
    <div className="flex min-h-[92px] flex-col items-center justify-center rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-center">
      <span className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">
        What happened will be revealed in
      </span>
      <span className="mt-1 text-[34px] font-black leading-none tabular-nums" style={{ color: accent }}>
        {seconds}
      </span>
    </div>
  );
}

function VoteConfirmationGroup({
  options,
  selectedVote,
  onCommit,
  onUndo,
}: {
  options: Array<{
    value: string;
    label: string;
    baseClass: string;
    selectedClass: string;
  }>;
  selectedVote?: string;
  onCommit: (value: string) => void;
  onUndo?: () => void;
}) {
  const [confirmedVote, setConfirmedVote] = useState<string | null>(
    selectedVote || null,
  );
  const [isConfirming, setIsConfirming] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const isUndoingRef = useRef(false);
  const localCommitRef = useRef<string | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const didUndoRef = useRef(false);

  useEffect(() => {
    if (isUndoingRef.current) return;
    if (
      localCommitRef.current &&
      localCommitRef.current === confirmedVote &&
      selectedVote !== confirmedVote
    ) {
      return;
    }
    if (selectedVote === confirmedVote) {
      localCommitRef.current = null;
      return;
    }
    setConfirmedVote(selectedVote || null);
    setIsConfirming(false);
  }, [confirmedVote, selectedVote]);

  const handleTap = (value: string) => {
    if (didUndoRef.current) {
      didUndoRef.current = false;
      return;
    }
    if (confirmedVote) return;
    localCommitRef.current = value;
    setConfirmedVote(value);
    setIsConfirming(true);
    onCommit(value);
    window.setTimeout(() => setIsConfirming(false), 720);
  };

  const clearUndoTimer = () => {
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  };

  const startUndoHold = (_event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!confirmedVote || !onUndo) return;
    clearUndoTimer();
    undoTimerRef.current = window.setTimeout(() => {
      didUndoRef.current = true;
      undoTimerRef.current = null;
      isUndoingRef.current = true;
      localCommitRef.current = null;
      setIsUndoing(true);
      onUndo();
      window.setTimeout(() => {
        setConfirmedVote(null);
        setIsConfirming(false);
        setIsUndoing(false);
        isUndoingRef.current = false;
      }, 440);
      // The confirmation button may unmount before the browser emits its
      // release click. Expire suppression with the visual undo transition so
      // the next fresh tap is never lost.
      window.setTimeout(() => {
        didUndoRef.current = false;
      }, 460);
    }, 700);
  };

  const endUndoHold = () => clearUndoTimer();
  const preventUndoContextMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (confirmedVote && onUndo) event.preventDefault();
  };

  const confirmedOption = options.find(
    (option) => option.value === confirmedVote,
  );
  const activeOption = confirmedOption;
  if (activeOption) {
    return (
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => handleTap(activeOption.value)}
          onPointerDown={startUndoHold}
          onPointerUp={endUndoHold}
          onPointerLeave={endUndoHold}
          onPointerCancel={endUndoHold}
          onContextMenu={preventUndoContextMenu}
          aria-pressed={Boolean(confirmedOption)}
          className={`prediction-pressable min-h-14 w-full rounded-[18px] border px-4 text-[14px] font-black leading-tight tracking-[0.01em] shadow-[0_14px_32px_rgba(0,0,0,0.24)] ${activeOption.selectedClass}`}
          style={{
            animation: isUndoing
              ? "predictionVoteUndo 440ms cubic-bezier(0.22,1,0.36,1) both"
              : isConfirming
                ? "predictionVoteConfirm 720ms cubic-bezier(0.22,1,0.36,1) both"
                : "none",
            willChange: isUndoing ? "transform, opacity" : undefined,
          }}
        >
          You think this is {activeOption.label}
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((option, index) => {
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => handleTap(option.value)}
            className={`prediction-pressable h-14 rounded-[18px] border px-2 text-center text-[13px] font-black leading-tight transition-all ${
              selectedVote === option.value
                ? option.selectedClass
                : option.baseClass
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function RumourCard({ rumour, isHappenedAlready = false }: { rumour: RumourPost; isHappenedAlready?: boolean }) {
  const { user } = useAuthStore();
  const voteRumour = useDramaStore((state) => state.voteRumour);
  const removeVoteRumour = useDramaStore((state) => state.removeVoteRumour);
  const resolveRumour = useDramaStore((state) => state.resolveRumour);
  const participant = getCurrentParticipant(user);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const believePct = getDramaPct(rumour.votes, "believe");
  const capPct = 100 - believePct;
  const totalVotes = Object.keys(rumour.votes).length;
  const voters = Object.keys(rumour.votes)
    .map((id) => rumour.voters[id])
    .filter(Boolean);
  const userVote = participant ? rumour.votes[participant.id] : undefined;
  const isPoster = participant?.id === rumour.poster.id;
  const isSubject = Boolean(
    participant && rumour.subject && participant.id === rumour.subject.id,
  );
  const isInvolved = isPoster || isSubject;
  const isDue = now >= new Date(rumour.deadline).getTime();
  const isResolved = rumour.status !== "open";
  const shouldDelayResultReveal = isHappenedAlready && isDue && !isInvolved;
  const { isRevealed: resultRevealReady, seconds: resultRevealSeconds } =
    useResultRevealCountdown(shouldDelayResultReveal);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const handleVote = (vote: RumourVote) => {
    if (!participant || rumour.status !== "open") return;
    voteRumour(rumour.id, participant as DramaParticipant, vote);
  };

  return (
    <article className="pop-prediction-card drama-card drama-card--rumour relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[30px] border border-[#67e8f9]/18 bg-[#05070a] p-4 shadow-[0_30px_90px_rgba(0,0,0,0.58),0_0_55px_rgba(56,189,248,0.1),inset_0_1px_0_rgba(255,255,255,0.06)] sm:p-5 md:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(56,189,248,0.12),transparent_26%),radial-gradient(circle_at_90%_4%,rgba(255,255,255,0.05),transparent_30%),linear-gradient(180deg,rgba(12,14,16,0.98),rgba(3,4,6,1))]" />
      <div className="relative drama-card-inner flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="drama-card-header mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative">
              <div className="absolute -inset-1 rounded-full bg-[#38bdf8]/18 blur-md" />
              <Avatar
                src={rumour.poster.avatar || ""}
                alt={rumour.poster.name}
                size={44}
                fallbackText={rumour.poster.name.charAt(0)}
                userId={rumour.poster.id}
                username={rumour.poster.username}
                disableRealtime
                className="relative shrink-0 ring-2 ring-[#041015]"
              />
            </div>
            <div className="min-w-0">
              <p className="drama-kicker m-0 text-[10px] font-black uppercase tracking-[0.22em] text-[#67e8f9]">
                Rumour file
              </p>
              <p className="drama-title m-0 mt-1 truncate text-[15px] font-black text-white">
                {rumour.poster.name} heard a rumour
              </p>
            </div>
          </div>
          <div className="drama-status-chip shrink-0 rotate-3 rounded-[10px] border border-[#67e8f9]/35 bg-[#67e8f9]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#a5f3fc] shadow-[0_10px_26px_rgba(56,189,248,0.12)]">
            {rumour.status === "open"
              ? isDue
                ? "Outcome due"
                : formatCountdown(rumour.deadline, now)
              : "Revealed"}
          </div>
        </div>

        <div className="drama-statement-panel relative mb-3 min-h-[216px] overflow-hidden rounded-[30px] border border-[#67e8f9]/18 bg-[linear-gradient(145deg,rgba(7,20,25,0.94),rgba(1,5,8,0.98))] px-4 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_20px_50px_rgba(0,0,0,0.36)]">
          <div className="rumour-source-chip drama-chip absolute left-4 top-4 rounded-full border border-white/10 bg-black/28 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/44">
            {rumour.sourceLabel}
          </div>
          <div className="flex h-full min-h-[176px] items-center justify-center">
            <p className="drama-statement-text m-0 text-center text-[28px] font-black leading-[1.06] tracking-[-0.02em] text-white [overflow-wrap:anywhere]">
              {rumour.statement}
            </p>
          </div>
        </div>

        <DramaCommentPreview
          comments={rumour.comments}
          accent="#67e8f9"
          emptyLabel="Be the first to call it out"
          onOpen={() => setIsCommentsOpen(true)}
        />

        <div className="drama-stats-panel mb-3 overflow-hidden rounded-[26px] border border-white/8 bg-black/24 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" style={isHappenedAlready ? { paddingTop: "18px", paddingBottom: "18px" } : undefined}>
          {shouldDelayResultReveal && !resultRevealReady ? (
            <ResultRevealCountdown accent="#67e8f9" seconds={resultRevealSeconds} />
          ) : <>
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-white/46">
              {isHappenedAlready ? "What your friends thought" : "What your friends think"}
            </span>
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/28">
              {totalVotes
                ? `${totalVotes} votes`
                : isResolved
                  ? "No friend votes"
                  : null}
            </span>
          </div>
          <div className="mb-3 flex h-5 gap-1 overflow-hidden rounded-full border border-white/8 bg-white/[0.07] p-0.5">
            <div
              className={`${isDue ? "prediction-tug-frozen" : "prediction-tug-happens"} min-w-[8%] rounded-full bg-[linear-gradient(90deg,#38bdf8,#67e8f9)]`}
              style={{
                flexGrow: believePct,
                minWidth: isDue && totalVotes > 0 && believePct === 0 ? 0 : "8%",
                display: isDue && totalVotes > 0 && believePct === 0 ? "none" : undefined,
                opacity: isResolved
                  ? rumour.status === "confirmed" ? 1 : 0.46
                  : totalVotes ? 1 : 0.42,
              }}
            />
            <div
              className={`${isDue ? "prediction-tug-frozen" : "prediction-tug-wont"} min-w-[8%] rounded-full bg-[linear-gradient(90deg,#fb7185,#fda4af)]`}
              style={{
                flexGrow: capPct,
                minWidth: isDue && totalVotes > 0 && capPct === 0 ? 0 : "8%",
                display: isDue && totalVotes > 0 && capPct === 0 ? "none" : undefined,
                opacity: isResolved
                  ? rumour.status === "false" ? 1 : 0.46
                  : totalVotes ? 1 : 0.42,
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[0.1em]">
            <span className="text-[#67e8f9]">
              {isResolved ? `${believePct}% believed it` : `${isDue ? "Believed it" : "Believe it"} ${believePct}%`}
            </span>
            <span className="text-right text-[#fda4af]">
              {isResolved ? `${capPct}% called cap` : `${isDue ? "Called cap" : "Call cap"} ${capPct}%`}
            </span>
          </div>
          </>}
        </div>

        {!shouldDelayResultReveal || resultRevealReady ? <VoterRail
          voters={voters}
          total={totalVotes}
          votes={rumour.votes}
          options={{
            believe: isDue ? "Believed it" : "Believe",
            cap: isDue ? "Called cap" : "Call cap",
          }}
          viewerVote={userVote}
          resultsAvailable={isHappenedAlready}
          colors={{ primary: "#67e8f9", secondary: "#fda4af" }}
        /> : null}
        {shouldDelayResultReveal && !resultRevealReady ? null : rumour.status === "open" && isInvolved && isDue ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void resolveRumour(rumour.id, "confirmed")}
              className="prediction-pressable min-h-14 rounded-[18px] border border-[#4ade80]/25 bg-[#4ade80]/12 px-3 text-[12px] font-black text-[#86efac]"
            >
              CONFIRM TRUE
            </button>
            <button
              type="button"
              onClick={() => void resolveRumour(rumour.id, "false")}
              className="prediction-pressable min-h-14 rounded-[18px] border border-[#fb7185]/24 bg-[#fb7185]/10 px-3 text-[12px] font-black text-[#fda4af]"
            >
              CALL IT FALSE
            </button>
          </div>
        ) : rumour.status === "open" && isDue ? (
          <div className="flex min-h-14 items-center justify-center rounded-[18px] border border-[#67e8f9]/14 bg-[#67e8f9]/[0.045] px-4 text-center text-[11px] font-black uppercase tracking-[0.1em] text-[#a5f3fc]/55">
            Waiting for {rumour.poster.name}
            {rumour.subject ? ` or ${rumour.subject.name}` : ""} to confirm the rumour
          </div>
        ) : rumour.status === "open" ? <VoteConfirmationGroup
          selectedVote={userVote}
          onCommit={(vote) => handleVote(vote as RumourVote)}
          onUndo={() => participant && removeVoteRumour(rumour.id, participant.id)}
          options={[
            {
              value: "believe",
              label: "BELIEVE IT",
              baseClass: "drama-action-btn drama-action-btn--positive border-[#38bdf8]/22 bg-[#38bdf8]/10 text-[#93c5fd]",
              selectedClass: "drama-action-btn drama-action-btn--positive border-[#38bdf8]/38 bg-[linear-gradient(135deg,#38bdf8,#4ade80)] text-[#031014]",
            },
            {
              value: "cap",
              label: "CALL CAP",
              baseClass: "border-[#fb7185]/22 bg-[#fb7185]/9 text-[#fda4af]",
              selectedClass: "border-[#fb7185]/40 bg-[linear-gradient(135deg,#fb7185,#7f1d1d)] text-white",
            },
          ]}
        /> : (
          <div className="rounded-[18px] border border-white/8 bg-white/[0.04] px-4 py-3 text-center text-[12px] font-black uppercase tracking-[0.12em] text-white/65">
            {rumour.status === "confirmed" ? "Confirmed true" : "Confirmed false"}
          </div>
        )}
      </div>
      {isCommentsOpen ? (
        <DramaCommentsModal
          postId={rumour.id}
          kind="rumour"
          title="Rumour replies"
          context={rumour.statement}
          comments={rumour.comments}
          accent="#67e8f9"
          participant={participant}
          onClose={() => setIsCommentsOpen(false)}
        />
      ) : null}
    </article>
  );
}

export function PromiseCard({ promise, isHappenedAlready = false }: { promise: PromisePost; isHappenedAlready?: boolean }) {
  const { user } = useAuthStore();
  const votePromise = useDramaStore((state) => state.votePromise);
  const removeVotePromise = useDramaStore((state) => state.removeVotePromise);
  const resolvePromise = useDramaStore((state) => state.resolvePromise);
  const participant = getCurrentParticipant(user);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const keepPct = getDramaPct(promise.votes, "keep");
  const breakPct = 100 - keepPct;
  const totalVotes = Object.keys(promise.votes).length;
  const voters = Object.keys(promise.votes)
    .map((id) => promise.voters[id])
    .filter(Boolean);
  const userVote = participant ? promise.votes[participant.id] : undefined;
  const isMaker = participant?.id === promise.maker.id;
  const isDue = Date.now() >= new Date(promise.dueAt).getTime();
  const isResolved = promise.status !== "open";
  const shouldDelayResultReveal = isHappenedAlready && isDue && !isMaker;
  const { isRevealed: resultRevealReady, seconds: resultRevealSeconds } =
    useResultRevealCountdown(shouldDelayResultReveal);
  const signatureDate = new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(promise.createdAt));

  const handleVote = (vote: PromiseVote) => {
    if (!participant || promise.status !== "open") return;
    votePromise(promise.id, participant as DramaParticipant, vote);
  };

  return (
    <article className="pop-prediction-card drama-card drama-card--promise relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[30px] border border-[#facc15]/16 bg-[linear-gradient(180deg,#111214,#050607)] p-4 shadow-[0_30px_90px_rgba(0,0,0,0.56),0_0_42px_rgba(250,204,21,0.045),inset_0_1px_0_rgba(255,255,255,0.07)] sm:p-5 md:p-6">
      <InteractionReceipt id={promise.id} table="drama_posts" />
      <InteractionConfirmation postId={promise.id} confirmations={promise.confirmations} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-8%,rgba(250,204,21,0.1),transparent_30%),radial-gradient(circle_at_96%_12%,rgba(255,255,255,0.045),transparent_30%)]" />
      <div className="relative drama-card-inner flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="drama-card-header mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar
              src={promise.maker.avatar || ""}
              alt={promise.maker.name}
              size={46}
              fallbackText={promise.maker.name.charAt(0)}
              userId={promise.maker.id}
              username={promise.maker.username}
              disableRealtime
              className="shrink-0 ring-2 ring-[#1d1608]"
            />
            <div className="min-w-0">
              <p className="drama-kicker m-0 text-[10px] font-black uppercase tracking-[0.22em] text-[#facc15]">
                Promise ledger
              </p>
              <p className="drama-title m-0 mt-1 truncate text-[15px] font-black text-white">
                {promise.maker.name} made a promise
              </p>
            </div>
          </div>
        </div>

        <div className="drama-statement-panel relative mb-4 flex min-h-[216px] shrink-0 items-center justify-center overflow-hidden rounded-[26px] border border-[#f0c35d]/28 bg-[#4a3612] px-5 py-7 text-center text-white shadow-[0_18px_42px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="absolute inset-x-0 top-0 h-px bg-white/[0.06]" />
          <div className="promise-signature-row absolute left-4 right-4 top-3 flex items-center justify-between border-b border-white/12 pb-2">
            <span className="drama-muted-label text-[11px] font-black uppercase tracking-[0.16em] text-white/58">
              Signed publicly
            </span>
            <span className="drama-chip rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/72">
              {promise.audience}
            </span>
          </div>
          <p className="drama-statement-text relative m-0 px-1 pb-8 pt-7 text-[24px] font-black leading-[1.1] tracking-normal text-white [overflow-wrap:anywhere] sm:text-[26px]">
            {promise.promise}
          </p>
          <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-4 border-t border-white/12 pt-2">
            <span className="shrink-0 pb-1 text-[9px] font-black uppercase tracking-[0.16em] text-white/58">
              {signatureDate}
            </span>
            <div
              className="min-w-0 max-w-[68%] -rotate-2 border-b border-dashed border-white/40 pb-1 text-right text-[23px] leading-none text-white/92"
              style={{
                fontFamily: "var(--font-ui)",
              }}
            >
              {promise.maker.name}
            </div>
          </div>
        </div>

        <DramaCommentPreview
          comments={promise.comments}
          accent="#facc15"
          emptyLabel="Add the first take on this promise"
          onOpen={() => setIsCommentsOpen(true)}
        />

        <div className="drama-stats-panel mb-3 overflow-hidden rounded-[26px] border border-white/8 bg-black/24 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" style={isHappenedAlready ? { paddingTop: "18px", paddingBottom: "18px" } : undefined}>
          {shouldDelayResultReveal && !resultRevealReady ? (
            <ResultRevealCountdown accent="#facc15" seconds={resultRevealSeconds} />
          ) : <>
          <div className="mb-1 flex items-center justify-end gap-3">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/28">
              {totalVotes
                ? `${totalVotes} votes`
                : isResolved
                  ? "No friend votes"
                  : null}
            </span>
          </div>
          <div className="promise-tug-stage">
          <PromiseTugFigures voters={voters} votes={promise.votes} reveal={isHappenedAlready && resultRevealReady} active={!isDue && !isResolved} />
          <div className="promise-tug-rope mb-3 flex h-5 gap-1 overflow-hidden rounded-full border border-white/8 bg-white/[0.07] p-0.5">
            <div
              className="min-w-[8%] rounded-full bg-[linear-gradient(90deg,#facc15,#fde68a)]"
              style={{
                flexGrow: keepPct,
                minWidth: isDue && totalVotes > 0 && keepPct === 0 ? 0 : "8%",
                display: isDue && totalVotes > 0 && keepPct === 0 ? "none" : undefined,
                opacity: isResolved
                  ? promise.status === "kept" ? 1 : 0.46
                  : totalVotes ? 1 : 0.42,
              }}
            />
            <div
              className="min-w-[8%] rounded-full bg-[linear-gradient(90deg,#3a290e,#4a3612)]"
              style={{
                flexGrow: breakPct,
                minWidth: isDue && totalVotes > 0 && breakPct === 0 ? 0 : "8%",
                display: isDue && totalVotes > 0 && breakPct === 0 ? "none" : undefined,
                opacity: isResolved
                  ? promise.status === "broken" ? 1 : 0.46
                  : totalVotes ? 1 : 0.42,
              }}
            />
          </div>
          </div>
          <div className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[0.1em]">
            <span className="text-[#fde68a]">
              {isResolved ? `${keepPct}% will keep` : `${isDue ? "Expected kept" : "Will keep"} ${keepPct}%`}
            </span>
            <span className="text-right text-[#b89a57]">
              {isResolved ? `${breakPct}% will break` : `${isDue ? "Expected broken" : "Will break"} ${breakPct}%`}
            </span>
          </div>
          </>}
        </div>

        {!shouldDelayResultReveal || resultRevealReady ? <VoterRail
          voters={voters}
          total={totalVotes}
          votes={promise.votes}
          options={{
            keep: isDue ? "Expected kept" : "Will keep",
            break: isDue ? "Expected broken" : "Will break",
          }}
          viewerVote={userVote}
          resultsAvailable={isHappenedAlready}
          colors={{ primary: "#facc15", secondary: "#fb7185" }}
        /> : null}
        {shouldDelayResultReveal && !resultRevealReady ? null : promise.status === "open" && isMaker && isDue && !(promise.confirmations || []).some(item => item.status !== "accepted") ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void resolvePromise(promise.id, "kept")}
              className="prediction-pressable min-h-14 rounded-[18px] border border-[#4ade80]/25 bg-[#4ade80]/12 px-3 text-[12px] font-black text-[#86efac]"
            >
              PROMISE KEPT
            </button>
            <button
              type="button"
              onClick={() => void resolvePromise(promise.id, "broken")}
              className="prediction-pressable min-h-14 rounded-[18px] border border-[#fb7185]/24 bg-[#fb7185]/10 px-3 text-[12px] font-black text-[#fda4af]"
            >
              BROKE IT
            </button>
          </div>
        ) : promise.status === "open" && isDue ? (
          <div className="flex min-h-14 items-center justify-center rounded-[18px] border border-[#facc15]/14 bg-[#facc15]/[0.045] px-4 text-center text-[11px] font-black uppercase tracking-[0.1em] text-[#fde68a]/55">
            Waiting for {promise.maker.name} to confirm the promise
          </div>
        ) : promise.status === "open" ? <VoteConfirmationGroup
          selectedVote={userVote}
          onCommit={(vote) => handleVote(vote as PromiseVote)}
          onUndo={() => participant && removeVotePromise(promise.id, participant.id)}
          options={[
            {
              value: "keep",
              label: "WILL KEEP",
              baseClass: "prediction-emphasis-happens drama-action-btn drama-action-btn--positive border-[#4ade80]/22 bg-[#4ade80]/9 text-[#86efac]",
              selectedClass: "prediction-emphasis-happens drama-action-btn drama-action-btn--positive border-[#4ade80]/35 bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-[#061006]",
            },
            {
              value: "break",
              label: "WILL BREAK",
              baseClass: "prediction-emphasis-wont drama-action-btn drama-action-btn--negative border-[#fb7185]/22 bg-[#fb7185]/9 text-[#fda4af]",
              selectedClass: "prediction-emphasis-wont drama-action-btn drama-action-btn--negative border-[#fb7185]/40 bg-[linear-gradient(135deg,#fb7185,#f97316)] text-[#160605]",
            },
          ]}
        /> : (
          <div className="rounded-[18px] border border-white/8 bg-white/[0.04] px-4 py-3 text-center text-[12px] font-black uppercase tracking-[0.12em] text-white/65">
            {promise.status === "kept" ? "Promise kept" : "Promise broken"}
          </div>
        )}
      </div>
      {isCommentsOpen ? (
        <DramaCommentsModal
          postId={promise.id}
          kind="promise"
          title="Promise replies"
          context={promise.promise}
          comments={promise.comments}
          accent="#facc15"
          participant={participant}
          onClose={() => setIsCommentsOpen(false)}
        />
      ) : null}
    </article>
  );
}

export function CustomCard({ custom }: { custom: CustomPost }) {
  const { user } = useAuthStore();
  const voteCustom = useDramaStore((state) => state.voteCustom);
  const removeVoteCustom = useDramaStore((state) => state.removeVoteCustom);
  const participant = getCurrentParticipant(user);
  const choiceOnePct = getDramaPct(custom.votes, "choiceOne");
  const choiceTwoPct = 100 - choiceOnePct;
  const totalVotes = Object.keys(custom.votes).length;
  const voters = Object.keys(custom.votes)
    .map((id) => custom.voters[id])
    .filter(Boolean);
  const userVote = participant ? custom.votes[participant.id] : undefined;
  const splitTension = Math.round(100 - Math.abs(choiceOnePct - 50) * 1.5);

  const handleVote = (vote: CustomVote) => {
    if (!participant) return;
    voteCustom(custom.id, participant as DramaParticipant, vote);
  };

  return (
    <article className="pop-prediction-card drama-card drama-card--custom relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#050607] p-4 shadow-[0_30px_90px_rgba(0,0,0,0.58),0_0_58px_rgba(45,212,191,0.1),inset_0_1px_0_rgba(255,255,255,0.07)] sm:p-5 md:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_8%,rgba(45,212,191,0.11),transparent_28%),radial-gradient(circle_at_88%_18%,rgba(255,255,255,0.05),transparent_26%),linear-gradient(180deg,rgba(12,14,15,0.98),rgba(3,4,5,1))]" />
      <div className="relative drama-card-inner flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="drama-card-header mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative">
              <div className="absolute -inset-1 rounded-full bg-[conic-gradient(from_120deg,#2dd4bf,#facc15,#fb7185,#2dd4bf)] opacity-40 blur-sm" />
              <Avatar
                src={custom.creator.avatar || ""}
                alt={custom.creator.name}
                size={46}
                fallbackText={custom.creator.name.charAt(0)}
                userId={custom.creator.id}
                username={custom.creator.username}
                disableRealtime
                className="relative shrink-0 ring-2 ring-[#060607]"
              />
            </div>
            <div className="min-w-0">
              <p className="drama-kicker m-0 text-[10px] font-black uppercase tracking-[0.22em] text-[#5eead4]">
                Custom
              </p>
              <p className="drama-title m-0 mt-1 truncate text-[15px] font-black text-white">
                {custom.creator.name} made the rules
              </p>
            </div>
          </div>
          <div className="drama-status-chip shrink-0 rounded-[12px] border border-[#facc15]/28 bg-[#facc15]/12 px-2.5 py-1.5 text-center text-[10px] font-black uppercase leading-tight tracking-[0.1em] text-[#fde68a]">
            {custom.scope}
          </div>
        </div>

        <div className="drama-statement-panel relative mb-4 flex min-h-[208px] flex-col justify-between overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(145deg,rgba(17,19,20,0.96),rgba(5,7,8,0.98))] p-3 shadow-[0_20px_52px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.07)]">
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-white/[0.06]" />
          <div className="relative flex items-center justify-between gap-2">
            <span className="custom-tone-chip drama-chip rounded-full border border-[#5eead4]/22 bg-[#5eead4]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#99f6e4]">
              {custom.toneLabel}
            </span>
            <span className="drama-chip rotate-2 rounded-[10px] border border-[#fb7185]/28 bg-[#fb7185]/12 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#fda4af]">
              Anything
            </span>
          </div>
          <div className="relative flex flex-1 items-center justify-center py-3">
            <p className="drama-statement-text m-0 text-center text-[30px] font-black leading-[1.04] text-white [overflow-wrap:anywhere]">
              {custom.statement}
            </p>
          </div>
          <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="custom-choice-rail custom-choice-rail--one h-2 rounded-full bg-[linear-gradient(90deg,#2dd4bf,#5eead4)]" />
            <div className="drama-chip rounded-full border border-white/12 bg-black/45 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/58">
              pick one
            </div>
            <div className="custom-choice-rail custom-choice-rail--two h-2 rounded-full bg-[linear-gradient(90deg,#facc15,#fb7185)]" />
          </div>
        </div>

        <div className="mb-4 rounded-[24px] border border-white/9 bg-white/[0.045] p-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-[19px] border border-[#2dd4bf]/18 bg-[#2dd4bf]/10 p-3 text-center">
              <div className="text-[25px] font-black leading-none text-[#5eead4]">
                {choiceOnePct}%
              </div>
              <div className="drama-muted-label mt-1 truncate text-[10px] font-black uppercase tracking-[0.12em] text-white/46">
                {custom.choiceOneText}
              </div>
            </div>
            <div className="rounded-[19px] border border-[#fb7185]/18 bg-[#fb7185]/10 p-3 text-center">
              <div className="text-[25px] font-black leading-none text-[#fda4af]">
                {choiceTwoPct}%
              </div>
              <div className="drama-muted-label mt-1 truncate text-[10px] font-black uppercase tracking-[0.12em] text-white/46">
                {custom.choiceTwoText}
              </div>
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#2dd4bf,#facc15,#fb7185)]"
              style={{ width: `${choiceOnePct}%` }}
            />
          </div>
          <p className="drama-note m-0 mt-2 text-[12px] font-bold leading-snug text-white/50">
            {totalVotes} votes. Split tension {splitTension}%.{" "}
            {custom.darrenNote ||
              "Darren saves the best weird formats for future callbacks."}
          </p>
        </div>

        <VoterRail
          voters={voters}
          total={totalVotes}
          votes={custom.votes}
          options={{
            choiceOne: custom.choiceOneText,
            choiceTwo: custom.choiceTwoText,
          }}
          viewerVote={userVote}
          colors={{ primary: "#5eead4", secondary: "#fb7185" }}
        />
        <VoteConfirmationGroup
          selectedVote={userVote}
          onCommit={(vote) => handleVote(vote as CustomVote)}
          onUndo={() => participant && removeVoteCustom(custom.id, participant.id)}
          options={[
            {
              value: "choiceOne",
              label: custom.choiceOneText,
              baseClass: "drama-action-btn drama-action-btn--positive border-[#2dd4bf]/22 bg-[#2dd4bf]/9 text-[#99f6e4]",
              selectedClass: "drama-action-btn drama-action-btn--positive border-[#2dd4bf]/38 bg-[linear-gradient(135deg,#2dd4bf,#a3e635)] text-[#031014]",
            },
            {
              value: "choiceTwo",
              label: custom.choiceTwoText,
              baseClass: "border-[#fb7185]/22 bg-[#fb7185]/9 text-[#fda4af]",
              selectedClass: "border-[#fb7185]/40 bg-[linear-gradient(135deg,#facc15,#fb7185)] text-[#170606]",
            },
          ]}
        />
      </div>
    </article>
  );
}

function PredictionCommentsModal({
  prediction,
  subjectName,
  subjectAvatar,
  subjectId,
  subjectUsername,
  subjectResponseLabel,
  subjectResponseLine,
  participant,
  onClose,
}: {
  prediction: PredictionPost;
  subjectName: string;
  subjectAvatar: string;
  subjectId?: string;
  subjectUsername?: string;
  subjectResponseLabel: string;
  subjectResponseLine: string;
  participant: ReturnType<typeof getCurrentParticipant>;
  onClose: () => void;
}) {
  const addPredictionComment = usePredictionStore(
    (state) => state.addPredictionComment,
  );
  const [draft, setDraft] = useState("");
  const comments = prediction.comments || [];
  const canSend = Boolean(participant && draft.trim());

  const send = () => {
    if (!participant || !draft.trim()) return;
    addPredictionComment(prediction.id, participant, draft);
    setDraft("");
  };

  const useCounterTemplate = () => {
    setDraft((current) =>
      current.trim() ? current : "If this happens I'll ",
    );
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center px-0 pb-0"
      style={{
        background: "rgba(0, 0, 0, 0.32)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label="Close prediction comments"
      />
      <div
        className="prediction-comments-modal relative z-[1] flex h-[68vh] max-h-[620px] w-full max-w-[520px] flex-col overflow-hidden rounded-[28px_28px_0_0] border border-white/14 shadow-[0_-8px_40px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(255,255,255,0.05)]"
        style={{
          background:
            "radial-gradient(circle at 18% -10%, rgba(74, 222, 128, 0.11), transparent 36%), radial-gradient(circle at 92% 4%, rgba(56, 189, 248, 0.07), transparent 30%), linear-gradient(180deg, rgba(17, 24, 20, 0.38), rgba(5, 8, 7, 0.48))",
          backdropFilter: "blur(24px) saturate(135%)",
          WebkitBackdropFilter: "blur(24px) saturate(135%)",
        }}
      >
        <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-white/18" />
        <div className="shrink-0 border-b border-white/8 bg-white/[0.018] px-4 py-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <MessageCircle size={18} className="text-[#86efac]" />
              <p className="m-0 truncate text-[14px] font-black text-white">
                Prediction replies
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-white/70"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
          <div className="rounded-[24px] border border-[#4ade80]/20 bg-[#4ade80]/[0.075] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
            <div className="flex items-start gap-3">
              <Avatar
                src={subjectAvatar}
                alt={subjectName}
                size={40}
                fallbackText={subjectName.charAt(0)}
                userId={subjectId}
                username={subjectUsername}
                disableRealtime
                className="shrink-0 ring-2 ring-[#071009]"
              />
              <div className="min-w-0">
                <p className="m-0 text-[11px] font-black uppercase tracking-[0.12em] text-[#86efac]">
                  {subjectResponseLabel}
                </p>
                <p className="m-0 mt-1 text-[14px] font-black leading-snug text-white [overflow-wrap:anywhere]">
                  {subjectResponseLine}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {comments.length ? (
            <div className="space-y-3">
              {comments.map((comment: PredictionComment) => (
                <div key={comment.id} className="flex items-start gap-2.5">
                  <Avatar
                    src={comment.commenter.avatar}
                    alt={comment.commenter.name}
                    size={34}
                    fallbackText={comment.commenter.name.charAt(0)}
                    userId={comment.commenter.id}
                    username={comment.commenter.username}
                    disableRealtime
                    className="shrink-0 ring-2 ring-[#071009]"
                  />
                  <div className="min-w-0 flex-1 rounded-[20px] border border-white/10 bg-white/[0.045] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
                    <p className="m-0 truncate text-[12px] font-black text-white">
                      {comment.commenter.name}
                    </p>
                    <p className="m-0 mt-0.5 text-[13px] font-bold leading-snug text-white/78 [overflow-wrap:anywhere]">
                      {comment.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[140px] items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-white/[0.025] px-6 text-center">
              <p className="m-0 text-[13px] font-bold leading-relaxed text-white/42">
                No comments yet. Start the chaos politely.
              </p>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-white/8 bg-white/[0.018] px-4 py-3">
          <div className="mb-2 flex items-center gap-2 overflow-x-auto">
            <button
              type="button"
              onClick={useCounterTemplate}
              className="shrink-0 rounded-full border border-[#38bdf8]/22 bg-[#38bdf8]/10 px-3 py-2 text-[12px] font-black text-[#bae6fd]"
            >
              If this happens I'll...
            </button>
            <button
              type="button"
              onClick={() => setDraft("")}
              className="shrink-0 rounded-full border border-white/8 bg-white/[0.04] px-3 py-2 text-[12px] font-black text-white/52"
            >
              Normal comment
            </button>
          </div>
          <div className="flex items-end gap-2 rounded-[22px] border border-white/10 bg-white/[0.045] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
              maxLength={220}
              placeholder={
                participant ? "Add a comment..." : "Sign in to comment"
              }
              disabled={!participant}
              className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[14px] font-bold leading-snug text-white outline-none placeholder:text-white/32 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={send}
              disabled={!canSend}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#4ade80] text-[#041006] disabled:opacity-35"
              aria-label="Post comment"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DramaCommentPreview({
  comments,
  accent,
  emptyLabel,
  onOpen,
}: {
  comments?: DramaComment[];
  accent: string;
  emptyLabel: string;
  onOpen: () => void;
}) {
  const [commentIndex, setCommentIndex] = useState(0);
  const visibleComments = comments || [];

  useEffect(() => {
    setCommentIndex(0);
    if (visibleComments.length <= 1) return;
    const timer = window.setInterval(() => {
      setCommentIndex((current) => (current + 1) % visibleComments.length);
    }, 6800);
    return () => window.clearInterval(timer);
  }, [visibleComments.length]);

  const comment = visibleComments[commentIndex] || visibleComments[0];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="drama-comment-preview mb-3 flex w-full items-center gap-3 rounded-[22px] border px-3 py-2.5 text-left transition-transform active:scale-[0.99]"
      style={{
        borderColor: `${accent}2e`,
        background: `linear-gradient(135deg, ${accent}12, rgba(255,255,255,0.035))`,
      }}
      aria-label="Open replies"
    >
      {comment ? (
        <div
          key={comment.id}
          className="flex min-w-0 flex-1 items-center gap-2.5"
          style={{ animation: "predictionCommentSwap 900ms cubic-bezier(0.16,1,0.3,1) both" }}
        >
          <Avatar
            src={comment.commenter.avatar || ""}
            alt={comment.commenter.name}
            size={32}
            fallbackText={comment.commenter.name.charAt(0)}
            userId={comment.commenter.id}
            username={comment.commenter.username}
            disableRealtime
            className="shrink-0 ring-2 ring-[#070907]"
          />
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-[11px] font-black text-white/72">
              {comment.commenter.name}
            </p>
            <p className="m-0 mt-0.5 truncate text-[13px] font-black text-white">
              {comment.text}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border"
            style={{ borderColor: `${accent}40`, color: accent }}
          >
            <MessageCircle size={15} />
          </span>
          <span className="truncate text-[12px] font-black text-white/52">
            {emptyLabel}
          </span>
        </div>
      )}
      <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: accent }}>
        {visibleComments.length ? `${visibleComments.length} ${visibleComments.length === 1 ? "reply" : "replies"}` : "Reply"}
      </span>
    </button>
  );
}

function DramaCommentsModal({
  postId,
  kind,
  title,
  context,
  comments,
  accent,
  participant,
  onClose,
}: {
  postId: string;
  kind: "rumour" | "promise";
  title: string;
  context: string;
  comments?: DramaComment[];
  accent: string;
  participant: ReturnType<typeof getCurrentParticipant>;
  onClose: () => void;
}) {
  const addDramaComment = useDramaStore((state) => state.addDramaComment);
  const [draft, setDraft] = useState("");
  const canSend = Boolean(participant && draft.trim());
  const send = () => {
    if (!participant || !draft.trim()) return;
    addDramaComment(postId, kind, participant, draft);
    setDraft("");
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center px-0 pb-0" style={{ background: "rgba(0,0,0,0.32)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label={`Close ${title}`} />
      <div
        className="prediction-comments-modal relative z-[1] flex h-[68vh] max-h-[620px] w-full max-w-[520px] flex-col overflow-hidden rounded-[28px_28px_0_0] border border-white/14 shadow-[0_-8px_40px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(255,255,255,0.12)]"
        style={{ background: `radial-gradient(circle at 18% -10%, ${accent}1c, transparent 36%), linear-gradient(180deg, rgba(17,20,23,0.72), rgba(5,7,9,0.96))`, backdropFilter: "blur(24px) saturate(135%)", WebkitBackdropFilter: "blur(24px) saturate(135%)" }}
      >
        <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-white/18" />
        <div className="shrink-0 border-b border-white/8 px-4 py-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <MessageCircle size={18} style={{ color: accent }} />
              <p className="m-0 truncate text-[14px] font-black text-white">{title}</p>
            </div>
            <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-white/70" aria-label="Close">
              <X size={16} />
            </button>
          </div>
          <div className="rounded-[22px] border px-3 py-3" style={{ borderColor: `${accent}2e`, background: `${accent}10` }}>
            <p className="m-0 text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: accent }}>The room is talking</p>
            <p className="m-0 mt-1 text-[14px] font-black leading-snug text-white [overflow-wrap:anywhere]">{context}</p>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {comments?.length ? (
            <div className="space-y-3">
              {comments.map((comment) => (
                <div key={comment.id} className="flex items-start gap-2.5">
                  <Avatar src={comment.commenter.avatar || ""} alt={comment.commenter.name} size={34} fallbackText={comment.commenter.name.charAt(0)} userId={comment.commenter.id} username={comment.commenter.username} disableRealtime className="shrink-0 ring-2 ring-[#071009]" />
                  <div className="min-w-0 flex-1 rounded-[20px] border border-white/10 bg-white/[0.045] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                    <p className="m-0 truncate text-[12px] font-black text-white">{comment.commenter.name}</p>
                    <p className="m-0 mt-0.5 text-[13px] font-bold leading-snug text-white/78 [overflow-wrap:anywhere]">{comment.text}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[140px] items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-white/[0.025] px-6 text-center">
              <p className="m-0 text-[13px] font-bold leading-relaxed text-white/42">No replies yet. Start the thread.</p>
            </div>
          )}
        </div>
        <div className="shrink-0 border-t border-white/8 bg-white/[0.018] px-4 py-3">
          <div className="flex items-end gap-2 rounded-[22px] border border-white/10 bg-white/[0.045] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} maxLength={220} placeholder={participant ? "Add a reply..." : "Sign in to reply"} disabled={!participant} className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[14px] font-bold leading-snug text-white outline-none placeholder:text-white/32 disabled:opacity-50" />
            <button type="button" onClick={send} disabled={!canSend} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#061014] disabled:opacity-35" style={{ background: accent }} aria-label="Post reply">
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function PredictionCard({ prediction, isHappenedAlready = false }: { prediction: PredictionPost; isHappenedAlready?: boolean }) {
  const { user } = useAuthStore();
  const votePrediction = usePredictionStore((state) => state.votePrediction);
  const removeVotePrediction = usePredictionStore(
    (state) => state.removeVotePrediction,
  );
  const resolvePrediction = usePredictionStore(
    (state) => state.resolvePrediction,
  );
  const [now, setNow] = useState(() => Date.now());
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [subjectResponseIndex, setSubjectResponseIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const participant = getCurrentParticipant(user);
  const isPoster = Boolean(
    participant && participant.id === prediction.poster.id,
  );
  const isSubject = Boolean(
    participant &&
      prediction.subject.type === "friend" &&
      participant.id === prediction.subject.id,
  );
  const isInvolved = isPoster || isSubject;
  const deadlineMs = new Date(prediction.deadline).getTime();
  const isDue = now >= deadlineMs;
  const isResolved = Boolean(prediction.verdict);
  const voteValues = Object.values(prediction.votes);
  const happensCount = voteValues.filter((vote) => vote === "happens").length;
  const wontCount = voteValues.filter((vote) => vote === "wont").length;
  const totalVotes = happensCount + wontCount;
  const voters = Object.keys(prediction.votes)
    .map((id) => prediction.voters[id])
    .filter(Boolean);
  const happensPct = totalVotes
    ? Math.round((happensCount / totalVotes) * 100)
    : 50;
  const wontPct = 100 - happensPct;
  const happensBarFlex = totalVotes ? happensCount : 1;
  const wontBarFlex = totalVotes ? wontCount : 1;
  const dramaScore = totalVotes ? 100 - Math.abs(happensPct - 50) * 2 : 76;
  const userVote = participant ? prediction.votes[participant.id] : undefined;
  const shouldDelayResultReveal = isHappenedAlready && isDue && !isInvolved;
  const { isRevealed: resultRevealReady, seconds: resultRevealSeconds } =
    useResultRevealCountdown(shouldDelayResultReveal);
  const hasRevealedStats = shouldDelayResultReveal
    ? resultRevealReady
    : Boolean(userVote || isDue || prediction.verdict);
  const subjectName = getSubjectLabel(prediction);
  const subjectAvatar =
    prediction.subject.type === "friend" ? prediction.subject.avatar || "" : "";
  const subjectUsername =
    prediction.subject.type === "friend"
      ? prediction.subject.username
      : undefined;
  const subjectId =
    prediction.subject.type === "friend" ? prediction.subject.id : undefined;
  const subjectResponseLine =
    prediction.subjectThought || `${subjectName} hasn't said anything about this yet.`;
  const subjectResponseLabel = prediction.subjectThought
    ? `${subjectName} thinks it ${prediction.subjectOutcome === "wont" ? "won't happen" : "will happen"}`
    : subjectName;
  const subjectResponseItems = useMemo(
    () => [
      {
        kind: "thought" as const,
        label: subjectUsername || subjectName,
        line: subjectResponseLine,
      },
      ...(prediction.comments || []).map((comment) => ({
        kind: "comment" as const,
        label: comment.commenter.username || comment.commenter.name,
        line: comment.text,
      })),
    ],
    [prediction.comments, subjectName, subjectResponseLine, subjectUsername],
  );

  useEffect(() => {
    setSubjectResponseIndex(0);
    if (subjectResponseItems.length <= 1) return;
    const rotationTimer = window.setInterval(() => {
      setSubjectResponseIndex((current) =>
        (current + 1) % subjectResponseItems.length,
      );
    }, 6800);
    return () => window.clearInterval(rotationTimer);
  }, [prediction.id, subjectResponseItems.length]);

  const displayedSubjectResponse =
    subjectResponseItems[subjectResponseIndex] || subjectResponseItems[0]!;
  const handleVote = (vote: "happens" | "wont") => {
    if (!participant || prediction.verdict) return;
    votePrediction(prediction.id, participant, vote);
  };

  const handleResolve = (verdict: PredictionVerdict) => {
    if (!isInvolved || !isDue) return;
    resolvePrediction(prediction.id, verdict);
  };

  return (
    <article className="pop-prediction-card drama-card drama-card--prediction relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_50%_-18%,rgba(255,255,255,0.07),transparent_34%),radial-gradient(circle_at_96%_8%,rgba(56,189,248,0.08),transparent_30%),linear-gradient(180deg,rgba(16,18,20,0.98),rgba(5,6,8,0.99))] p-4 shadow-[0_28px_86px_rgba(0,0,0,0.5),0_0_38px_rgba(56,189,248,0.045),inset_0_1px_0_rgba(255,255,255,0.07)] sm:p-5 md:p-6">
      <InteractionReceipt id={prediction.id} table="drama_posts" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),transparent_18%,rgba(0,0,0,0.22)_100%)]" />
      <div className="prediction-card-content relative flex min-h-0 flex-1 touch-pan-y flex-col overflow-hidden">
        <div className="prediction-card-header drama-statement-panel relative mb-4 shrink-0 overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_18%_0%,rgba(255,255,255,0.07),transparent_35%),radial-gradient(circle_at_84%_16%,rgba(56,189,248,0.08),transparent_34%),linear-gradient(180deg,rgba(14,16,17,0.96),rgba(3,5,6,0.78))] p-3.5 shadow-[0_18px_44px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.065)]">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(187,247,208,0.76),rgba(56,189,248,0.42),transparent)]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(112deg,transparent_0%,rgba(255,255,255,0.055)_42%,transparent_58%)]" />
          <div className="relative grid min-w-0 gap-2.5">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar
                  src={prediction.poster.avatar}
                  alt={prediction.poster.name}
                  size={42}
                  fallbackText={prediction.poster.name.charAt(0)}
                  userId={prediction.poster.id}
                  username={prediction.poster.username}
                  disableRealtime
                  className="shrink-0 ring-2 ring-[#071009]"
                />
                <p className="drama-title m-0 min-w-0 truncate text-[14px] font-black text-white">
                  {prediction.poster.name}
                </p>
              </div>
              <div className="prediction-time-chip drama-status-chip flex shrink-0 items-center gap-1.5 rounded-full border border-[#86efac]/16 bg-white/[0.055] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#bbf7d0] shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]">
                <Hourglass size={13} />
                {prediction.verdict
                  ? "Final"
                  : isDue
                    ? "Outcome due"
                    : formatCountdown(prediction.deadline, now)}
              </div>
            </div>
            <div className="grid min-w-0 grid-cols-1 items-center gap-2.5 min-[390px]:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] min-[390px]:gap-3">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-[21px] font-black uppercase leading-none text-[#86efac] drop-shadow-[0_0_18px_rgba(74,222,128,0.3)]">
                    {isDue ? "predicted" : "predicts"}
                  </span>
                  <span className="min-w-0 truncate text-[11px] font-black uppercase tracking-[0.12em] text-white/32">
                    about
                  </span>
                </div>
              </div>
              <div className="flex min-w-0 items-center justify-end gap-2 overflow-hidden">
                <div className="min-w-0 max-w-full text-right">
                  <p className="m-0 max-w-full truncate text-[15px] font-black text-white">
                    {subjectName}
                  </p>
                  <p className="m-0 truncate text-[10px] font-black uppercase tracking-[0.12em] text-white/34">
                    {prediction.subject.type === "group"
                      ? "Group"
                      : prediction.subject.type === "event"
                        ? "Event"
                        : "Friend"}
                  </p>
                </div>
                <Avatar
                  src={subjectAvatar}
                  alt={subjectName}
                  size={40}
                  fallbackText={subjectName.charAt(0)}
                  userId={subjectId}
                  username={subjectUsername}
                  disableRealtime
                  className="shrink-0 ring-2 ring-[#071009]"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4 flex min-h-[184px] shrink-0 items-center justify-center rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(3,5,4,0.42),rgba(255,255,255,0.035))] px-5 py-6 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
          <p className="m-0 text-[24px] font-black leading-[1.1] tracking-normal text-white [overflow-wrap:anywhere] sm:text-[26px]">
            {prediction.text}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCommentsOpen(true)}
          aria-label="Open prediction comments"
          className="mb-4 w-full rounded-[22px] border px-3 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.045)] transition-transform active:scale-[0.99]"
          style={{
            borderColor:
              prediction.subjectThought
                ? "#4ade8033"
                : "rgba(255,255,255,0.075)",
            background:
              prediction.subjectThought
                ? "linear-gradient(135deg, #4ade801f, rgba(255,255,255,0.035))"
                : "linear-gradient(135deg, rgba(255,255,255,0.045), rgba(0,0,0,0.12))",
          }}
        >
          <div
            key={`${prediction.id}-subject-response-${subjectResponseIndex}`}
            className="flex items-start gap-3"
            style={{
              animation:
                "predictionCommentSwap 900ms cubic-bezier(0.16,1,0.3,1) both",
            }}
          >
            <Avatar
              src={subjectAvatar}
              alt={subjectName}
              size={38}
              fallbackText={subjectName.charAt(0)}
              userId={subjectId}
              username={subjectUsername}
              disableRealtime
              className="shrink-0 ring-2 ring-[#070907]"
            />
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-[12px] font-black text-white">
                {displayedSubjectResponse.label}
              </p>
              <p
                className="m-0 mt-0.5 text-[13px] font-black leading-snug text-white"
                style={{
                  color: displayedSubjectResponse.kind === "thought"
                    ? "#fff"
                    : "rgba(255,255,255,0.78)",
                }}
              >
                {displayedSubjectResponse.line}
              </p>
            </div>
          </div>
        </button>

        <div className="mb-4 overflow-hidden rounded-[26px] border border-white/8 bg-black/24 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" style={isHappenedAlready ? { paddingTop: "18px", paddingBottom: "18px" } : undefined}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-white/46">
              {isHappenedAlready ? "What your friends thought" : "What your friends think"}
            </span>
            {!hasRevealedStats ? (
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-white/28">
              </span>
            ) : null}
          </div>
          {prediction.id === 'local-prediction-card-preview' ? (
            <div className="promise-tug-stage">
              <PromiseTugFigures voters={[]} votes={{}} reveal={false} colors={['#86efac', '#fda4af']} />
              <div className="promise-tug-rope mb-3 flex h-5 gap-1 overflow-hidden rounded-full border border-white/8 bg-white/[0.07] p-0.5">
                <div className="flex-1 rounded-full bg-[linear-gradient(90deg,#4ade80,#86efac)]" />
                <div className="flex-1 rounded-full bg-[linear-gradient(90deg,#fb7185,#f97316)]" />
              </div>
            </div>
          ) : hasRevealedStats ? (
            <>
              <div className="mb-3 flex h-5 gap-1 overflow-hidden rounded-full border border-white/8 bg-white/[0.07] p-0.5">
                {(happensCount > 0 || totalVotes === 0) && (
                  <div
                    className="prediction-tug-frozen min-w-[8%] rounded-full bg-[linear-gradient(90deg,#4ade80,#86efac)] transition-[flex-grow] duration-500"
                    style={{
                      flexGrow: happensBarFlex,
                      opacity: isResolved
                        ? prediction.verdict === "happened" ? 1 : 0.46
                        : totalVotes === 0 ? 0.42 : 1,
                    }}
                  />
                )}
                {(wontCount > 0 || totalVotes === 0) && (
                  <div
                    className="prediction-tug-frozen min-w-[8%] rounded-full bg-[linear-gradient(90deg,#fb7185,#f97316)] transition-[flex-grow] duration-500"
                    style={{
                      flexGrow: wontBarFlex,
                      opacity: isResolved
                        ? prediction.verdict === "didnt" ? 1 : 0.46
                        : totalVotes === 0 ? 0.42 : 1,
                    }}
                  />
                )}
              </div>
              <div className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-[0.1em]">
                <span className="inline-flex min-w-0 max-w-[48%] items-center gap-1 leading-tight text-[#86efac]">
                  {isResolved ? `${happensPct}% would happen` : isDue ? "Predicted yes" : "Happens"}
                  {!isResolved ? (
                    <span className="rounded-full bg-[#4ade80]/12 px-1.5 py-0.5 text-[9px] text-[#bbf7d0]">
                      {happensPct}%
                    </span>
                  ) : null}
                </span>
                <span className="inline-flex min-w-0 max-w-[48%] items-center gap-1 text-right leading-tight text-[#fda4af]">
                  {isResolved ? `${wontPct}% wouldn't happen` : isDue ? "Predicted no" : "Won't happen"}
                  {!isResolved ? (
                    <span className="rounded-full bg-[#fb7185]/12 px-1.5 py-0.5 text-[9px] text-[#fecdd3]">
                      {wontPct}%
                    </span>
                  ) : null}
                </span>
              </div>
            </>
          ) : shouldDelayResultReveal ? (
            <ResultRevealCountdown accent="#86efac" seconds={resultRevealSeconds} />
          ) : (
            <div className="mb-3 flex h-5 gap-1 overflow-hidden rounded-full border border-white/8 bg-white/[0.07] p-0.5">
              <div className="prediction-tug-happens rounded-full bg-[linear-gradient(90deg,#4ade80,#86efac)]" />
              <div className="prediction-tug-wont rounded-full bg-[linear-gradient(90deg,#fb7185,#f97316)]" />
            </div>
          )}
        </div>

        {!shouldDelayResultReveal || resultRevealReady ? <VoterRail
          voters={voters}
          total={totalVotes}
          votes={prediction.votes}
          options={{
            happens: isDue ? "Predicted yes" : "Will happen",
            wont: isDue ? "Predicted no" : "Won't happen",
          }}
          viewerVote={userVote}
          resultsAvailable={isHappenedAlready}
          colors={{ primary: "#86efac", secondary: "#fda4af" }}
        /> : null}
        <div className="mt-0">
          {shouldDelayResultReveal && !resultRevealReady ? null : prediction.verdict ? (
            <div
              className={`prediction-verdict-card flex min-h-14 items-center justify-between gap-3 rounded-[18px] border px-3.5 py-2.5 ${
                prediction.verdict === "happened"
                  ? "border-[#86efac]/28 bg-[#4ade80]/10 text-[#bbf7d0] shadow-[0_10px_26px_rgba(74,222,128,0.1)]"
                  : "border-[#fda4af]/28 bg-[#fb7185]/10 text-[#fecdd3] shadow-[0_10px_26px_rgba(251,113,133,0.1)]"
              }`}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border ${
                    prediction.verdict === "happened"
                      ? "border-[#86efac]/25 bg-[#4ade80]/14 text-[#bbf7d0]"
                      : "border-[#fda4af]/25 bg-[#fb7185]/14 text-[#fecdd3]"
                  }`}
                >
                  {prediction.verdict === "happened" ? <Check size={17} /> : <X size={17} />}
                </div>
                <p className="m-0 min-w-0 truncate text-[13px] font-black leading-tight">
                  {prediction.verdict === "happened" ? "It happened" : "It didn't happen"}
                </p>
              </div>
              <p className="m-0 shrink-0 text-right text-[11px] font-black uppercase leading-tight tracking-[0.08em]">
                {prediction.poster.name} was {prediction.verdict === "happened" ? "right" : "wrong"}
              </p>
            </div>
          ) : isDue && isInvolved ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleResolve("happened")}
                className="prediction-pressable min-h-14 rounded-[20px] border border-[#4ade80]/35 bg-[#4ade80]/14 px-3 text-[13px] font-black text-[#86efac] shadow-[0_12px_28px_rgba(74,222,128,0.12)]"
              >
                IT HAPPENED
              </button>
              <button
                type="button"
                onClick={() => handleResolve("didnt")}
                className="prediction-pressable min-h-14 rounded-[20px] border border-white/10 bg-white/[0.045] px-3 text-[13px] font-black text-white/80 shadow-[0_12px_28px_rgba(0,0,0,0.2)]"
              >
                DIDN'T HAPPEN
              </button>
            </div>
          ) : isDue ? (
            <div className="flex min-h-14 items-center justify-center rounded-[20px] border border-white/10 bg-white/[0.035] px-4 text-center text-[11px] font-black uppercase tracking-[0.1em] text-white/48">
              Waiting for {prediction.poster.name}
              {prediction.subject.type === "friend"
                ? ` or ${prediction.subject.name}`
                : ""}{" "}
              to confirm what happened
            </div>
          ) : (
            <VoteConfirmationGroup
              selectedVote={userVote}
              onCommit={(vote) => handleVote(vote as PredictionVote)}
              onUndo={() => participant && removeVotePrediction(prediction.id, participant.id)}
              options={[
                {
                  value: "happens",
                  label: "HAPPENS",
                  baseClass: "prediction-emphasis-happens drama-action-btn drama-action-btn--positive border-[#4ade80]/22 bg-[#4ade80]/9 text-[#86efac]",
                  selectedClass: "prediction-emphasis-happens drama-action-btn drama-action-btn--positive border-[#4ade80]/35 bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-[#061006] shadow-[0_10px_24px_rgba(74,222,128,0.24)]",
                },
                {
                  value: "wont",
                  label: "WON'T HAPPEN",
                  baseClass: "prediction-emphasis-wont drama-action-btn drama-action-btn--negative border-[#fb7185]/22 bg-[#fb7185]/9 text-[#fda4af]",
                  selectedClass: "prediction-emphasis-wont drama-action-btn drama-action-btn--negative border-[#fb7185]/40 bg-[linear-gradient(135deg,#fb7185,#f97316)] text-[#160605] shadow-[0_10px_24px_rgba(251,113,133,0.2)]",
                },
              ]}
            />
          )}

        </div>
      </div>
      {isCommentsOpen ? (
        <PredictionCommentsModal
          prediction={prediction}
          subjectName={subjectName}
          subjectAvatar={subjectAvatar}
          subjectId={subjectId}
          subjectUsername={subjectUsername}
          subjectResponseLabel={subjectResponseLabel}
          subjectResponseLine={subjectResponseLine}
          participant={participant}
          onClose={() => setIsCommentsOpen(false)}
        />
      ) : null}
    </article>
  );
}

export function DealCard({ deal, isHappenedAlready = false }: { deal: DealPost; isHappenedAlready?: boolean }) {
  const { user } = useAuthStore();
  const voteDeal = useDealStore((state) => state.voteDeal);
  const removeVoteDeal = useDealStore((state) => state.removeVoteDeal);
  const resolveDeal = useDealStore((state) => state.resolveDeal);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const participant = getCurrentParticipant(user);
  const isCreator = Boolean(participant && participant.id === deal.creator.id);
  const isSubject = Boolean(
    participant &&
      deal.subject.type === "friend" &&
      participant.id === deal.subject.id,
  );
  const isInvolved = (isCreator || isSubject) && !(deal.confirmations || []).some(item => item.status !== "accepted");
  const isDue = now >= new Date(deal.resolutionDate).getTime();
  const isResolved = Boolean(deal.result);
  const voteValues = Object.values(deal.votes);
  const happensCount = voteValues.filter((vote) => vote === "happens").length;
  const wontCount = voteValues.filter((vote) => vote === "wont").length;
  const totalVotes = happensCount + wontCount;
  const voters = Object.keys(deal.votes)
    .map((id) => deal.voters[id])
    .filter(Boolean);
  const happensPct = totalVotes
    ? Math.round((happensCount / totalVotes) * 100)
    : 50;
  const wontPct = 100 - happensPct;
  const userVote = participant ? deal.votes[participant.id] : undefined;
  const shouldDelayResultReveal = isHappenedAlready && isDue && !isInvolved;
  const { isRevealed: resultRevealReady, seconds: resultRevealSeconds } =
    useResultRevealCountdown(shouldDelayResultReveal);
  const subjectName = getDealSubjectLabel(deal);
  const subjectAvatar =
    deal.subject.type === "friend" ? deal.subject.avatar || "" : "";
  const subjectId =
    deal.subject.type === "friend" ? deal.subject.id : undefined;
  const subjectUsername =
    deal.subject.type === "friend" ? deal.subject.username : undefined;
  const resultCopy: Record<
    DealResult,
    { label: string; line: string; color: string }
  > = {
    won: {
      label: "Deal Won",
      line: `${deal.creator.name} won the deal.`,
      color: "#86efac",
    },
    lost: {
      label: "Deal Lost",
      line: `${deal.creator.name} lost the deal.`,
      color: "#fda4af",
    },
    progress: {
      label: "Still In Progress",
      line: "The story is not finished yet.",
      color: "#67e8f9",
    },
  };

  const handleVote = (vote: "happens" | "wont") => {
    if (!participant || deal.result) return;
    voteDeal(deal.id, participant, vote);
  };

  return (
    <article className="pop-prediction-card drama-card drama-card--deal relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[30px] border border-[#f97316]/18 bg-[linear-gradient(180deg,#111010,#060708)] p-4 shadow-[0_30px_90px_rgba(0,0,0,0.58),0_0_42px_rgba(249,115,22,0.045),inset_0_1px_0_rgba(255,255,255,0.07)] sm:p-5 md:p-6">
      <InteractionReceipt id={deal.id} table="drama_posts" />
      <InteractionConfirmation postId={deal.id} confirmations={deal.confirmations} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_8%,rgba(249,115,22,0.11),transparent_28%),radial-gradient(circle_at_86%_0%,rgba(255,255,255,0.05),transparent_30%),linear-gradient(180deg,rgba(15,13,13,0.98),rgba(5,6,7,1))]" />
      <div className="prediction-card-content drama-card-inner relative flex min-h-0 flex-1 touch-pan-y flex-col overflow-hidden">
        <div className="deal-card-header relative mb-4 overflow-hidden rounded-[26px] border border-[#f97316]/18 bg-[linear-gradient(135deg,rgba(249,115,22,0.09),rgba(0,0,0,0.2)),linear-gradient(180deg,rgba(17,16,16,0.96),rgba(5,6,7,0.84))] p-3.5 shadow-[0_18px_44px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.065)]">
          <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar
                src={deal.creator.avatar}
                alt={deal.creator.name}
                size={42}
                fallbackText={deal.creator.name.charAt(0)}
                userId={deal.creator.id}
                username={deal.creator.username}
                disableRealtime
                className="shrink-0 ring-2 ring-[#1b0d06]"
              />
              <p className="drama-title m-0 min-w-0 truncate text-[14px] font-black text-white">
                {deal.creator.name}
              </p>
            </div>
            <div className="deal-time-chip drama-status-chip flex shrink-0 items-center gap-1.5 rounded-full border border-[#f97316]/24 bg-[#f97316]/12 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#fdba74]">
              <Hourglass size={13} />
              {deal.result
                ? "Result"
                : isDue
                  ? "Outcome due"
                  : formatCountdown(deal.resolutionDate, now)}
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,auto)] items-center gap-3">
            <div className="min-w-0">
              <div className="deal-stake-mark flex min-w-0 items-center gap-2">
                <Handshake
                  size={21}
                  className="shrink-0 text-[#fdba74] drop-shadow-[0_0_18px_rgba(249,115,22,0.32)]"
                />
                <span className="shrink-0 text-[17px] font-black uppercase leading-none text-[#fdba74] drop-shadow-[0_0_18px_rgba(249,115,22,0.32)]">
                  made a Deal with
                </span>
              </div>
            </div>
            <div className="flex min-w-0 items-center justify-end gap-2">
              <div className="min-w-0 text-right">
                <p className="m-0 truncate text-[15px] font-black text-white">
                  {subjectName}
                </p>
                <p className="m-0 truncate text-[10px] font-black uppercase tracking-[0.12em] text-white/34">
                  {deal.scope}
                </p>
              </div>
              <Avatar
                src={subjectAvatar}
                alt={subjectName}
                size={40}
                fallbackText={subjectName.charAt(0)}
                userId={subjectId}
                username={subjectUsername}
                disableRealtime
                className="shrink-0 ring-2 ring-[#1b0d06]"
              />
            </div>
          </div>
        </div>

        <div className="drama-statement-panel mb-4 rounded-[28px] border border-[#f97316]/16 bg-[linear-gradient(180deg,rgba(28,13,7,0.52),rgba(255,255,255,0.03))] px-4 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
          <div className="drama-chip mb-3 inline-flex rounded-full border border-[#f97316]/22 bg-[#f97316]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#fdba74]">
            The deal
          </div>
          <p className="drama-statement-text m-0 text-[23px] font-black leading-[1.1] tracking-[-0.015em] text-white [overflow-wrap:anywhere]">
            {deal.event}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="deal-outcome-tile deal-outcome-tile--win rounded-[22px] border border-[#4ade80]/18 bg-[#4ade80]/10 px-3 py-3">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#86efac]">
                <Gift size={14} /> {isDue ? "If I won" : "If I win"}
              </div>
              <p className="m-0 text-[14px] font-black leading-snug text-white">
                {deal.winOutcome}
              </p>
            </div>
            <div className="deal-outcome-tile deal-outcome-tile--loss rounded-[22px] border border-[#fb7185]/18 bg-[#fb7185]/10 px-3 py-3">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-[#fda4af]">
                <Laugh size={14} /> {isDue ? "If I lost" : "If I lose"}
              </div>
              <p className="m-0 text-[14px] font-black leading-snug text-white">
                {deal.loseOutcome}
              </p>
            </div>
          </div>
        </div>

        <div className="drama-stats-panel mb-4 overflow-hidden rounded-[26px] border border-[#f97316]/14 bg-black/26 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" style={isHappenedAlready ? { paddingTop: "18px", paddingBottom: "18px" } : undefined}>
          {shouldDelayResultReveal && !resultRevealReady ? (
            <ResultRevealCountdown accent="#fdba74" seconds={resultRevealSeconds} />
          ) : <>
          <div className="mb-3 flex items-center justify-between">
            <span className="deal-watch-label drama-muted-label text-[11px] font-black uppercase tracking-[0.14em] text-white/46">
              {isHappenedAlready ? "What your friends thought" : "Friends are watching"}
            </span>
            <span className="text-[11px] font-black text-[#67e8f9]">
              {totalVotes} votes
            </span>
          </div>
          <div className={deal.id === 'local-deal-card-preview' ? 'promise-tug-stage' : undefined}>
          {deal.id === 'local-deal-card-preview' && <PromiseTugFigures voters={[]} votes={{}} reveal={false} colors={['#fdba74', '#f97316']} />}
          <div className={`${deal.id === 'local-deal-card-preview' ? 'promise-tug-rope ' : ''}mb-3 flex h-5 gap-1 overflow-hidden rounded-full border border-white/8 bg-white/[0.07] p-0.5`}>
            <div
              className={`${deal.id === 'local-deal-card-preview' ? '' : isDue ? "prediction-tug-frozen" : "prediction-tug-happens"} min-w-[8%] rounded-full bg-[linear-gradient(90deg,#fb923c,#fdba74)]`}
              style={{
                flexGrow: totalVotes ? happensCount : 1,
                minWidth: isDue && totalVotes > 0 && happensCount === 0 ? 0 : "8%",
                display: isDue && totalVotes > 0 && happensCount === 0 ? "none" : undefined,
                opacity: isResolved
                  ? deal.result === "won" ? 1 : deal.result === "progress" ? 0.72 : 0.46
                  : totalVotes ? 1 : 0.42,
              }}
            />
            <div
              className={`${deal.id === 'local-deal-card-preview' ? '' : isDue ? "prediction-tug-frozen" : "prediction-tug-wont"} min-w-[8%] rounded-full bg-[linear-gradient(90deg,#c2410c,#f97316)]`}
              style={{
                flexGrow: totalVotes ? wontCount : 1,
                minWidth: isDue && totalVotes > 0 && wontCount === 0 ? 0 : "8%",
                display: isDue && totalVotes > 0 && wontCount === 0 ? "none" : undefined,
                opacity: isResolved
                  ? deal.result === "lost" ? 1 : deal.result === "progress" ? 0.72 : 0.46
                  : totalVotes ? 1 : 0.42,
              }}
            />
          </div>
          </div>
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.1em]">
            <span className="text-[#fdba74]">
              {isResolved ? `${happensPct}% would happen` : `${isDue ? "Predicted yes" : "Will happen"} ${happensPct}%`}
            </span>
            <span className="text-[#fb923c]">
              {isResolved ? `${wontPct}% wouldn't happen` : `${isDue ? "Predicted no" : "Won't happen"} ${wontPct}%`}
            </span>
          </div>
          </>}
        </div>

        {!shouldDelayResultReveal || resultRevealReady ? <VoterRail
          voters={voters}
          total={totalVotes}
          votes={deal.votes}
          options={{
            happens: isDue ? "Predicted yes" : "Will happen",
            wont: isDue ? "Predicted no" : "Won't happen",
          }}
          viewerVote={userVote}
          resultsAvailable={isHappenedAlready}
          colors={{ primary: "#fdba74", secondary: "#fda4af" }}
        /> : null}
        <div className="mt-0">
          {shouldDelayResultReveal && !resultRevealReady ? null : deal.result ? (
            <div className="prediction-verdict-card flex min-h-14 items-center gap-2.5 rounded-[18px] border border-[#fdba74]/30 bg-[linear-gradient(135deg,rgba(249,115,22,0.16),rgba(253,186,116,0.06)),rgba(8,8,8,0.7)] px-3.5 py-2.5 text-[#fed7aa] shadow-[0_12px_30px_rgba(249,115,22,0.12),inset_0_1px_0_rgba(255,255,255,0.08)]">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-[#fdba74]/30 bg-[#f97316]/16 text-[#fdba74]">
                {deal.result === "won" ? <Check size={17} /> : deal.result === "lost" ? <X size={17} /> : <Handshake size={17} />}
              </div>
              <p className="m-0 min-w-0 flex-1 truncate text-[13px] font-black leading-tight">
                <span className="uppercase tracking-[0.06em]">{resultCopy[deal.result].label}</span>
                <span className="mx-1.5 text-[#fdba74]/60">—</span>
                {deal.result === "won"
                  ? deal.winOutcome
                  : deal.result === "lost"
                    ? deal.loseOutcome
                    : resultCopy[deal.result].line}
              </p>
            </div>
          ) : isDue && isInvolved ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => resolveDeal(deal.id, "won")}
                className="prediction-pressable min-h-14 rounded-[20px] border border-[#f97316]/30 bg-[#f97316]/12 px-3 text-[12px] font-black text-[#fdba74]"
              >
                IT HAPPENED
              </button>
              <button
                type="button"
                onClick={() => resolveDeal(deal.id, "lost")}
                className="prediction-pressable min-h-14 rounded-[20px] border border-white/10 bg-white/[0.045] px-3 text-[12px] font-black text-white/80"
              >
                DIDN'T HAPPEN
              </button>
            </div>
          ) : isDue ? (
            <div className="flex min-h-14 items-center justify-center rounded-[20px] border border-[#f97316]/14 bg-[#f97316]/[0.045] px-4 text-center text-[11px] font-black uppercase tracking-[0.1em] text-[#fdba74]/55">
              Waiting for {deal.creator.name}
              {deal.subject.type === "friend" ? ` or ${deal.subject.name}` : ""} to confirm the deal
            </div>
          ) : (
            <VoteConfirmationGroup
              selectedVote={userVote}
              onCommit={(vote) => handleVote(vote as PredictionVote)}
              onUndo={() => participant && removeVoteDeal(deal.id, participant.id)}
              options={[
                {
                  value: "happens",
                  label: "WILL HAPPEN",
                  baseClass: "prediction-emphasis-happens drama-action-btn drama-action-btn--positive border-[#4ade80]/22 bg-[#4ade80]/9 text-[#86efac]",
                  selectedClass: "prediction-emphasis-happens drama-action-btn drama-action-btn--positive border-[#4ade80]/35 bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-[#061006]",
                },
                {
                  value: "wont",
                  label: "WON'T HAPPEN",
                  baseClass: "prediction-emphasis-wont drama-action-btn drama-action-btn--negative border-[#fb7185]/22 bg-[#fb7185]/9 text-[#fda4af]",
                  selectedClass: "prediction-emphasis-wont drama-action-btn drama-action-btn--negative border-[#fb7185]/40 bg-[linear-gradient(135deg,#fb7185,#f97316)] text-[#160605]",
                },
              ]}
            />
          )}

          {!deal.result && isFinalDay(deal.resolutionDate, now) && (
            <div className="mt-3 flex items-center gap-2 rounded-full border border-[#fb7185]/18 bg-[#fb7185]/9 px-3 py-2 text-[11px] font-black uppercase tracking-[0.1em] text-[#fda4af]">
              <CalendarClock size={13} />
              Darren is watching the deadline.
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function PredictionFeedScreen({
  kind = "predictions",
  externalItems = [],
  uploadRequest,
  focusId,
  onRefresh,
  deadlineReviewOpen,
  onDeadlineReviewOpenChange,
  onDeadlineReviewCountChange,
}: {
  kind?: DramaFeedKind;
  externalItems?: PredictionFeedExternalItem[];
  uploadRequest?: TextCardUploadRequest | null;
  focusId?: string;
  onRefresh?: () => Promise<void> | void;
  deadlineReviewOpen: boolean;
  onDeadlineReviewOpenChange: (open: boolean) => void;
  onDeadlineReviewCountChange: (count: number) => void;
}) {
  const predictions = usePredictionStore((state) => state.predictions);
  const deals = useDealStore((state) => state.deals);
  const rumours = useDramaStore((state) => state.rumours);
  const promises = useDramaStore((state) => state.promises);
  const customs = useDramaStore((state) => state.customs || []);
  const dramaPostIds = [...predictions, ...deals, ...rumours, ...promises, ...customs]
    .map((post) => post.id).sort().join(",");
  useEffect(() => subscribeToDramaCards(dramaPostIds.split(",")), [dramaPostIds]);
  useEffect(() => {
    void loadDramaFeed();
  }, []);
  useEffect(() => {
    const refreshSharedResults = () => {
      if (document.visibilityState === "visible") {
        void loadDramaFeed();
      }
    };
    window.addEventListener("focus", refreshSharedResults);
    document.addEventListener("visibilitychange", refreshSharedResults);
    return () => {
      window.removeEventListener("focus", refreshSharedResults);
      document.removeEventListener("visibilitychange", refreshSharedResults);
    };
  }, []);
  const reelRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const scrollSettleTimerRef = useRef<number | null>(null);
  const isFeedScrollingRef = useRef(false);
  const [currentFeedIndex, setCurrentFeedIndex] = useState(0);
  const [refreshingLatest, setRefreshingLatest] = useState(false);
  const [refreshPullProgress, setRefreshPullProgress] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [deadlineIntroHidden, setDeadlineIntroHidden] = useState(false);
  const [deadlineIntroPreferenceLoaded, setDeadlineIntroPreferenceLoaded] =
    useState(false);
  const [showDeadlineIntro, setShowDeadlineIntro] = useState(false);
  const [doneUploadNonce, setDoneUploadNonce] = useState<number | null>(null);
  const [hiddenUploadNonce, setHiddenUploadNonce] = useState<number | null>(
    null,
  );
  const visibleUploadRequest =
    uploadRequest && hiddenUploadNonce !== uploadRequest.nonce
      ? uploadRequest
      : null;
  const uploadDone =
    Boolean(visibleUploadRequest) &&
    doneUploadNonce === visibleUploadRequest?.nonce;
  const pullStartYRef = useRef<number | null>(null);
  const pullStartXRef = useRef<number | null>(null);
  const pullProgressRef = useRef(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      setDeadlineIntroHidden(
        window.localStorage.getItem(DEADLINE_REVIEW_INTRO_KEY) === "1",
      );
    } finally {
      setDeadlineIntroPreferenceLoaded(true);
    }
  }, []);

  const refreshLatestCards = () => {
    const reel = reelRef.current;
    if (refreshingLatest) {
      setRefreshPullProgress(0);
      pullProgressRef.current = 0;
      return;
    }
    setRefreshingLatest(true);
    setRefreshPullProgress(1);
    void Promise.all([loadDramaFeed(true), onRefresh?.()]).finally(() => {
      window.setTimeout(() => {
        setRefreshingLatest(false);
        setRefreshPullProgress(0);
        pullProgressRef.current = 0;
        setCurrentFeedIndex(0);
        reel?.scrollTo({ top: 0, behavior: "smooth" });
      }, 260);
    });
  };
  const orderedItems = useMemo(() => {
    if (kind === "rumours") {
      return sortFeedItemsByNewest(
        rumours.map((rumour) => ({
          type: "rumour" as const,
          id: rumour.id,
          createdAt: rumour.createdAt,
          rumour,
        })),
      );
    }

    if (kind === "promises") {
      return sortFeedItemsByNewest(
        promises.map((promise) => ({
          type: "promise" as const,
          id: promise.id,
          createdAt: promise.createdAt,
          promise,
        })),
      );
    }

    if (kind === "custom") {
      return sortFeedItemsByNewest(
        customs.map((custom) => ({
          type: "custom" as const,
          id: custom.id,
          createdAt: custom.createdAt,
          custom,
        })),
      );
    }

    const predictionItems = predictions.map((prediction) => ({
      type: "prediction" as const,
      id: prediction.id,
      createdAt: prediction.createdAt,
      prediction,
    }));
    const dealItems = deals.map((deal) => ({
      type: "deal" as const,
      id: deal.id,
      createdAt: deal.createdAt,
      deal,
    }));
    const rumourItems = rumours.map((rumour) => ({
      type: "rumour" as const,
      id: rumour.id,
      createdAt: rumour.createdAt,
      rumour,
    }));
    const promiseItems = promises.map((promise) => ({
      type: "promise" as const,
      id: promise.id,
      createdAt: promise.createdAt,
      promise,
    }));
    const customItems = customs.map((custom) => ({
      type: "custom" as const,
      id: custom.id,
      createdAt: custom.createdAt,
      custom,
    }));

    if (kind === "all") {
      return mixFeedTypesEvenly([
        { type: "external", items: externalItems },
        { type: "prediction", items: predictionItems },
        { type: "deal", items: dealItems },
        { type: "rumour", items: rumourItems },
        { type: "promise", items: promiseItems },
        { type: "custom", items: customItems },
      ]);
    }

    return sortFeedItemsByNewest([...predictionItems, ...dealItems]);
  }, [customs, deals, externalItems, kind, predictions, promises, rumours]);

  const deadlineReviewItems = useMemo(
    () => orderedItems.filter((item) => isDeadlineReviewItem(item, now)),
    [now, orderedItems],
  );
  const activeItems = useMemo(
    () => {
      const items = orderedItems.filter((item) => !isDeadlineReviewItem(item, now));
      const previews: PredictionFeedItem[] = [];
      if (process.env.NODE_ENV === 'development' && (kind === 'all' || kind === 'predictions')) {
        const createdAt = new Date(now).toISOString();
        const deadline = new Date(now + 86_400_000).toISOString();
        const poster = { id: 'local-preview-mira', name: 'Mira · preview' };
        const prediction: PredictionPost = {
          id: 'local-prediction-card-preview', text: 'Arjun will cancel the Goa plan at the last minute.',
          subject: { type: 'friend', id: 'local-preview-arjun', name: 'Arjun' },
          deadline, createdAt, poster, votes: {}, voters: {},
        };
        const deal: DealPost = {
          id: 'local-deal-card-preview', scope: 'friend',
          subject: { type: 'friend', id: 'local-preview-arjun', name: 'Arjun' },
          event: 'Arjun makes it to the gym before 7 AM.',
          winOutcome: 'I buy him breakfast.', loseOutcome: 'He buys the crew coffee.',
          resolutionDate: deadline, createdAt, creator: poster, votes: {}, voters: {},
        };
        previews.push(
          { type: 'prediction', id: prediction.id, createdAt, prediction },
          { type: 'deal', id: deal.id, createdAt, deal },
        );
      }
      // TEMPORARY visual preview: frontend only, development only, no store writes.
      if (process.env.NODE_ENV === 'development' && (kind === 'all' || kind === 'promises')) {
        const preview: PromisePost = {
          id: 'local-promise-tug-preview',
          promise: 'I will finally book our Goa tickets.',
          audience: 'crew', targetLabel: 'the crew',
          dueAt: new Date(now + 86_400_000).toISOString(),
          createdAt: new Date(now).toISOString(),
          maker: { id: 'local-preview-mira', name: 'Mira · preview' },
          votes: {}, voters: {}, status: 'open',
        };
        return [{ type: 'promise' as const, id: preview.id, createdAt: preview.createdAt, promise: preview }, ...previews, ...items];
      }
      return [...previews, ...items];
    },
    [kind, now, orderedItems],
  );
  const selectedItems = focusId ? orderedItems.filter(item => item.id === focusId) : deadlineReviewOpen ? deadlineReviewItems : activeItems;

  useEffect(() => {
    setShowDeadlineIntro(
      deadlineReviewOpen &&
        deadlineReviewItems.length > 0 &&
        deadlineIntroPreferenceLoaded &&
        !deadlineIntroHidden,
    );
  }, [
    deadlineIntroHidden,
    deadlineIntroPreferenceLoaded,
    deadlineReviewItems.length,
    deadlineReviewOpen,
  ]);

  useEffect(() => {
    onDeadlineReviewCountChange(deadlineReviewItems.length);
    if (deadlineReviewItems.length === 0 && deadlineReviewOpen) {
      onDeadlineReviewOpenChange(false);
    }
  }, [
    deadlineReviewItems.length,
    deadlineReviewOpen,
    onDeadlineReviewCountChange,
    onDeadlineReviewOpenChange,
  ]);

  useEffect(() => {
    const reel = reelRef.current;
    if (!reel) return;
    setCurrentFeedIndex(0);
    reel.scrollTo({ top: 0, behavior: "auto" });
  }, [deadlineReviewOpen]);

  const displayItems = useMemo(() => {
    if (!visibleUploadRequest || uploadDone || deadlineReviewOpen) return selectedItems;

    const isRecentUploadCandidate = (item: PredictionFeedItem) =>
      Math.abs(new Date(item.createdAt).getTime() - visibleUploadRequest.nonce) <
      10_000;
    const pendingIndex = selectedItems.findIndex((item) => {
      if (!isRecentUploadCandidate(item)) return false;
      if (visibleUploadRequest.kind === "prediction") return item.type === "prediction";
      if (visibleUploadRequest.kind === "deal") return item.type === "deal";
      if (visibleUploadRequest.kind === "rumour") return item.type === "rumour";
      if (visibleUploadRequest.kind === "promise") return item.type === "promise";
      return item.type === "custom";
    });

    if (pendingIndex < 0) return selectedItems;
    return selectedItems.filter((_, index) => index !== pendingIndex);
  }, [deadlineReviewOpen, selectedItems, uploadDone, visibleUploadRequest]);

  useEffect(() => {
    if (!uploadRequest) return;

    const reel = reelRef.current;
    window.requestAnimationFrame(() => {
      setCurrentFeedIndex(0);
      if (reel) reel.scrollTo({ top: 0, behavior: "auto" });
    });

    const doneTimer = window.setTimeout(
      () => setDoneUploadNonce(uploadRequest.nonce),
      1350,
    );
    const hideTimer = window.setTimeout(() => {
      setHiddenUploadNonce(uploadRequest.nonce);
    }, 3200);

    return () => {
      window.clearTimeout(doneTimer);
      window.clearTimeout(hideTimer);
    };
  }, [uploadRequest]);

  useEffect(() => {
    if (!visibleUploadRequest) return;
    const reel = reelRef.current;
    if (!reel) return;
    reel.scrollTo({ top: 0, behavior: "auto" });
  }, [displayItems.length, visibleUploadRequest]);

  useEffect(() => {
    if (!uploadDone) return;
    const reel = reelRef.current;
    if (!reel) return;
    window.requestAnimationFrame(() => {
      reel.scrollTo({ top: 0, behavior: "auto" });
    });
  }, [uploadDone]);

  useEffect(() => {
    const reel = reelRef.current;
    if (!reel) return;

    const updateCurrentIndex = () => {
      scrollFrameRef.current = null;
      const nextIndex = Math.round(
        reel.scrollTop / Math.max(1, reel.clientHeight),
      );
      setCurrentFeedIndex((current) =>
        current === nextIndex ? current : nextIndex,
      );
    };

    updateCurrentIndex();
    const pauseCardMotion = () => {
      if (!isFeedScrollingRef.current) {
        isFeedScrollingRef.current = true;
        reel.classList.add(
          "prediction-reel-is-scrolling",
          "truth-reel-is-scrolling",
        );
      }
      if (scrollSettleTimerRef.current !== null) {
        window.clearTimeout(scrollSettleTimerRef.current);
      }
      scrollSettleTimerRef.current = window.setTimeout(() => {
        isFeedScrollingRef.current = false;
        reel.classList.remove(
          "prediction-reel-is-scrolling",
          "truth-reel-is-scrolling",
        );
        scrollSettleTimerRef.current = null;
        updateCurrentIndex();
      }, 130);
    };

    const handleScroll = () => {
      pauseCardMotion();

      if (scrollFrameRef.current !== null) return;
      scrollFrameRef.current = window.requestAnimationFrame(updateCurrentIndex);
    };

    reel.addEventListener("touchstart", pauseCardMotion, { passive: true });
    reel.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      reel.removeEventListener("touchstart", pauseCardMotion);
      reel.removeEventListener("scroll", handleScroll);
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
      if (scrollSettleTimerRef.current !== null) {
        window.clearTimeout(scrollSettleTimerRef.current);
      }
      isFeedScrollingRef.current = false;
      reel.classList.remove(
        "prediction-reel-is-scrolling",
        "truth-reel-is-scrolling",
      );
    };
  }, [displayItems.length]);
  const emptyCopy =
    kind === "all"
      ? {
          title: "No drama yet",
          body: "Predictions, deals, rumours, promises, and custom cards will appear here together.",
        }
      : kind === "rumours"
        ? {
            title: "No rumours yet",
            body: "Start a mystery and let the room decide if they buy it.",
          }
        : kind === "promises"
          ? {
              title: "No promises yet",
              body: "Make the first public commitment and let friends hold it.",
            }
          : kind === "custom"
            ? {
                title: "No custom cards yet",
                body: "Create any two-sided prompt and let the room pick a side.",
              }
            : {
                title: "No predictions yet",
                body: "Use the plus button and make the first public call.",
              };

  const handlePullStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    pullStartYRef.current = touch.clientY;
    pullStartXRef.current = touch.clientX;
    pullProgressRef.current = 0;
    setRefreshPullProgress(0);
  };

  const handlePullMove = (event: TouchEvent<HTMLDivElement>) => {
    if (refreshingLatest) return;
    const reel = reelRef.current;
    const touch = event.touches[0];
    const startY = pullStartYRef.current;
    const startX = pullStartXRef.current;
    if (!reel || !touch || startY === null || startX === null) return;

    const deltaY = touch.clientY - startY;
    const deltaX = touch.clientX - startX;
    if (Math.abs(deltaX) > Math.abs(deltaY)) return;

    const maxScrollTop = Math.max(0, reel.scrollHeight - reel.clientHeight);
    const atTop = reel.scrollTop <= 2 && deltaY > 0;
    const atBottom = reel.scrollTop >= maxScrollTop - 2 && deltaY < 0;
    const nextProgress =
      atTop || atBottom ? Math.min(1, Math.abs(deltaY) / 76) : 0;
    pullProgressRef.current = nextProgress;
    setRefreshPullProgress(nextProgress);
  };

  const handlePullEnd = () => {
    const shouldRefresh = pullProgressRef.current >= 0.72;
    pullStartYRef.current = null;
    pullStartXRef.current = null;
    pullProgressRef.current = 0;
    if (shouldRefresh) {
      refreshLatestCards();
    } else {
      setRefreshPullProgress(0);
    }
  };
  return (
    <div
      ref={reelRef}
      onTouchStart={handlePullStart}
      onTouchMove={handlePullMove}
      onTouchEnd={handlePullEnd}
      onTouchCancel={handlePullEnd}
      className="prediction-reel h-full min-h-0 overflow-y-auto overflow-x-hidden px-1"
    >
      <style>{`
        .prediction-reel {
          position: relative;
          scroll-snap-type: y mandatory;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          scroll-behavior: auto;
          touch-action: pan-y;
          contain: layout paint style;
        }
        .prediction-reel::-webkit-scrollbar {
          display: none;
        }
        .prediction-feed-page {
          contain: layout paint style;
          content-visibility: auto;
          contain-intrinsic-size: 100dvh;
          transform: translate3d(0,0,0);
          backface-visibility: hidden;
          touch-action: pan-y;
        }
        .prediction-feed-card-shell {
          contain: layout paint style;
          transform: translate3d(0,0,0);
          backface-visibility: hidden;
          isolation: isolate;
          touch-action: pan-y;
        }
        .prediction-feed-card-shell > article,
        .prediction-feed-card-shell > div {
          transform: translate3d(0,0,0);
          backface-visibility: hidden;
        }
        .prediction-card-content {
          touch-action: pan-y;
        }
        .prediction-card-content,
        .drama-card-inner {
          gap: 1rem;
        }
        .prediction-card-content > *,
        .drama-card-inner > * {
          margin-top: 0 !important;
          margin-bottom: 0 !important;
        }
        .prediction-card-content > .voter-rail,
        .drama-card-inner > .voter-rail {
          margin-top: auto !important;
        }
        .drama-card:not(.drama-card--prediction):not(.drama-card--deal) .drama-card-header {
          padding: 0.875rem;
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 1.75rem;
          background:
            radial-gradient(circle at 18% 0%, rgba(255,255,255,0.065), transparent 38%),
            linear-gradient(180deg, rgba(16,18,20,0.94), rgba(4,6,7,0.78));
          box-shadow:
            0 18px 44px rgba(0,0,0,0.3),
            inset 0 1px 0 rgba(255,255,255,0.055);
        }
        .drama-card-inner {
          overflow-x: hidden;
          overflow: hidden;
          overscroll-behavior: auto;
          touch-action: pan-y;
        }
        .drama-card {
          touch-action: pan-y;
        }
        .drama-card--rumour .drama-comment-preview,
        .drama-card--promise .drama-comment-preview {
          min-height: 3.5rem;
          padding-top: 0.75rem;
          padding-bottom: 0.75rem;
        }
        .drama-card--rumour .drama-stats-panel {
          padding: 0.875rem;
        }
        .drama-card-inner > * {
          flex-shrink: 0;
        }
        .pop-prediction-card {
          transform: translate3d(0,0,0);
          backface-visibility: hidden;
        }
        .prediction-comments-modal {
          animation: predictionCommentsSlideUp 260ms cubic-bezier(0.22,1,0.36,1) both;
          transform-origin: bottom center;
        }
        .voter-results-pop {
          animation: voterResultsIn 220ms cubic-bezier(0.22,1,0.36,1) both;
        }
        .voter-first-pop {
          animation: voterFirstIn 460ms cubic-bezier(0.22,1,0.36,1) both;
          transform-origin: center bottom;
        }
        .prediction-pressable[data-vote-removed="true"] {
          animation: voteRemovedPop 560ms cubic-bezier(0.22,1,0.36,1) both !important;
          border-color: rgba(103,232,249,0.54) !important;
          background:
            radial-gradient(circle at 50% 42%, rgba(103,232,249,0.28), transparent 58%),
            linear-gradient(135deg, rgba(56,189,248,0.22), rgba(251,113,133,0.14)) !important;
          color: white !important;
        }
        @keyframes voterResultsIn {
          from { opacity: 0; transform: translate3d(0,10px,0) scale(0.97); }
          to { opacity: 1; transform: translate3d(0,0,0) scale(1); }
        }
        @keyframes voterFirstIn {
          0% { opacity: 0; transform: translate3d(0,24px,0) rotate(-1.5deg) scale(0.92); }
          58% { opacity: 1; transform: translate3d(0,-4px,0) rotate(0.7deg) scale(1.02); }
          78% { transform: translate3d(0,1px,0) rotate(-0.25deg) scale(0.995); }
          100% { opacity: 1; transform: translate3d(0,0,0) rotate(0) scale(1); }
        }
        @keyframes voteRemovedPop {
          0% { opacity: 1; transform: translate3d(0,0,0) scale(1); }
          24% { transform: translate3d(0,-4px,0) scale(1.045) rotate(-1deg); }
          52% { opacity: 0.92; transform: translate3d(0,2px,0) scale(0.97) rotate(1deg); }
          76% { opacity: 0.7; transform: translate3d(0,0,0) scale(1.01); }
          100% { opacity: 1; transform: translate3d(0,0,0) scale(1); }
        }
        @keyframes predictionCommentsSlideUp {
          from {
            opacity: 0;
            transform: translate3d(0,26px,0) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translate3d(0,0,0) scale(1);
          }
        }
        .prediction-tug-happens,
        .prediction-tug-wont {
          flex: 1 1 50%;
          min-width: 8%;
          will-change: transform, opacity;
        }
        .prediction-tug-frozen {
          flex: 1 1 0%;
          min-width: 8%;
          animation: none !important;
          transform: none !important;
          will-change: auto;
        }
        .prediction-tug-happens {
          transform-origin: left center;
          animation: predictionTugHappens 3s cubic-bezier(0.45,0,0.2,1) infinite;
        }
        .prediction-tug-wont {
          transform-origin: right center;
          animation: predictionTugWont 3s cubic-bezier(0.45,0,0.2,1) infinite;
        }
        .stake-tug-happens,
        .stake-tug-wont {
          transition: flex-grow 500ms cubic-bezier(0.22,1,0.36,1);
          will-change: transform, opacity;
        }
        .stake-tug-happens {
          transform-origin: left center;
          animation: stakeTugHappens 3.4s cubic-bezier(0.45,0,0.2,1) infinite;
        }
        .stake-tug-wont {
          transform-origin: right center;
          animation: stakeTugWont 3.4s cubic-bezier(0.45,0,0.2,1) infinite;
        }
        @keyframes predictionTugHappens {
          0%, 100% { transform: translate3d(0,0,0) scaleX(0.92); opacity: 0.78; }
          45% { transform: translate3d(0,0,0) scaleX(1.18); opacity: 1; }
          72% { transform: translate3d(0,0,0) scaleX(0.76); opacity: 0.84; }
        }
        @keyframes predictionTugWont {
          0%, 100% { transform: translate3d(0,0,0) scaleX(1.08); opacity: 0.86; }
          45% { transform: translate3d(0,0,0) scaleX(0.82); opacity: 0.78; }
          72% { transform: translate3d(0,0,0) scaleX(1.24); opacity: 1; }
        }
        @keyframes stakeTugHappens {
          0%, 100% { transform: translate3d(0,0,0) scaleX(0.94); opacity: 0.72; }
          46% { transform: translate3d(0,0,0) scaleX(1.16); opacity: 0.96; }
          74% { transform: translate3d(0,0,0) scaleX(0.8); opacity: 0.78; }
        }
        @keyframes stakeTugWont {
          0%, 100% { transform: translate3d(0,0,0) scaleX(1.06); opacity: 0.82; }
          46% { transform: translate3d(0,0,0) scaleX(0.84); opacity: 0.74; }
          74% { transform: translate3d(0,0,0) scaleX(1.2); opacity: 0.96; }
        }
        .prediction-feed-page:not(.prediction-feed-page--active) *,
        .prediction-feed-page:not(.prediction-feed-page--active) *::before,
        .prediction-feed-page:not(.prediction-feed-page--active) *::after {
          animation-play-state: paused !important;
        }
        .drama-card-header,
        .prediction-card-header,
        .deal-card-header {
          will-change: transform, opacity;
          animation: dramaHeaderBreathe 8.4s cubic-bezier(0.45,0,0.2,1) infinite;
        }
        .prediction-card-header { animation-delay: -2.1s; }
        .deal-card-header { animation-delay: -4.2s; }
        @keyframes dramaHeaderBreathe {
          0%, 100% { transform: translate3d(0,0,0); opacity: 1; }
          50% { transform: translate3d(0,-1px,0); opacity: 0.985; }
        }
        .prediction-time-chip,
        .deal-time-chip {
          will-change: transform, opacity;
          animation: dramaTimePulse 4.8s cubic-bezier(0.22,1,0.36,1) infinite;
        }
        .deal-time-chip { animation-delay: -1.8s; }
        @keyframes dramaTimePulse {
          0%, 100% { transform: translate3d(0,0,0) scale(1); opacity: 0.88; }
          44% { transform: translate3d(0,-1px,0) scale(1.025); opacity: 1; }
        }
        .drama-card--rumour .drama-statement-panel::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(105deg, transparent 36%, rgba(103,232,249,0.13) 50%, transparent 64%);
          opacity: 0;
          transform: translate3d(-52%,0,0);
          animation: rumourScanSweep 7.6s cubic-bezier(0.45,0,0.2,1) infinite;
        }
        .rumour-source-chip {
          will-change: transform, opacity;
          animation: rumourSourceDrift 6.8s cubic-bezier(0.45,0,0.2,1) infinite;
        }
        @keyframes rumourScanSweep {
          0%, 64%, 100% { opacity: 0; transform: translate3d(-52%,0,0); }
          16% { opacity: 0.62; }
          42% { opacity: 0.16; transform: translate3d(52%,0,0); }
        }
        @keyframes rumourSourceDrift {
          0%, 100% { transform: translate3d(0,0,0); opacity: 0.74; }
          50% { transform: translate3d(2px,-1px,0); opacity: 1; }
        }
        .drama-card--promise .drama-statement-panel::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(112deg, transparent 36%, rgba(255,255,255,0.3) 50%, transparent 64%);
          opacity: 0;
          transform: translate3d(-55%,0,0);
          animation: promiseLedgerShimmer 9s cubic-bezier(0.45,0,0.2,1) infinite;
        }
        .promise-signature-row {
          will-change: transform, opacity;
          animation: promiseSignatureSettle 7.2s cubic-bezier(0.45,0,0.2,1) infinite;
        }
        .promise-trust-tile {
          will-change: transform, opacity;
          animation: promiseTrustBalance 5.8s cubic-bezier(0.45,0,0.2,1) infinite;
        }
        .promise-trust-tile--break { animation-delay: -2.9s; }
        @keyframes promiseLedgerShimmer {
          0%, 68%, 100% { opacity: 0; transform: translate3d(-55%,0,0); }
          18% { opacity: 0.34; }
          48% { opacity: 0; transform: translate3d(55%,0,0); }
        }
        @keyframes promiseSignatureSettle {
          0%, 100% { transform: translate3d(0,0,0); opacity: 0.78; }
          50% { transform: translate3d(1px,0,0); opacity: 1; }
        }
        @keyframes promiseTrustBalance {
          0%, 100% { transform: translate3d(0,0,0); opacity: 0.88; }
          50% { transform: translate3d(0,-2px,0); opacity: 1; }
        }
        .custom-tone-chip {
          will-change: transform, opacity;
          animation: customToneNudge 6.4s cubic-bezier(0.45,0,0.2,1) infinite;
        }
        .custom-choice-rail {
          will-change: transform, opacity;
          animation: customChoiceTug 4.4s cubic-bezier(0.45,0,0.2,1) infinite;
        }
        .custom-choice-rail--one { transform-origin: right center; }
        .custom-choice-rail--two { transform-origin: left center; animation-delay: -2.2s; }
        @keyframes customToneNudge {
          0%, 100% { transform: translate3d(0,0,0); opacity: 0.88; }
          50% { transform: translate3d(0,-1px,0); opacity: 1; }
        }
        @keyframes customChoiceTug {
          0%, 100% { transform: scaleX(0.92); opacity: 0.72; }
          50% { transform: scaleX(1.04); opacity: 1; }
        }
        .deal-stake-mark {
          will-change: transform, opacity;
          animation: dealStakeNudge 5.8s cubic-bezier(0.45,0,0.2,1) infinite;
        }
        .deal-outcome-tile {
          will-change: transform, opacity;
          animation: dealOutcomeBalance 6.2s cubic-bezier(0.45,0,0.2,1) infinite;
        }
        .deal-outcome-tile--loss { animation-delay: -3.1s; }
        .deal-watch-label {
          animation: dealWatchPulse 4.8s cubic-bezier(0.45,0,0.2,1) infinite;
        }
        @keyframes dealStakeNudge {
          0%, 100% { transform: translate3d(0,0,0); opacity: 0.9; }
          50% { transform: translate3d(2px,0,0); opacity: 1; }
        }
        @keyframes dealOutcomeBalance {
          0%, 100% { transform: translate3d(0,0,0); opacity: 0.86; }
          50% { transform: translate3d(0,-2px,0); opacity: 1; }
        }
        @keyframes dealWatchPulse {
          0%, 100% { opacity: 0.54; }
          50% { opacity: 1; }
        }
        .voter-rail > span {
          will-change: transform, opacity;
          animation: voterRailBreathe 7.4s cubic-bezier(0.45,0,0.2,1) infinite;
        }
        @keyframes voterRailBreathe {
          0%, 100% { transform: translate3d(0,0,0); opacity: 0.88; }
          50% { transform: translate3d(2px,0,0); opacity: 1; }
        }
        .prediction-upload-strip {
          animation: predictionUploadIn 260ms cubic-bezier(0.22,1,0.36,1) both;
        }
        .prediction-upload-line {
          transform-origin: left center;
          animation: predictionUploadProgress 1.35s cubic-bezier(0.22,1,0.36,1) forwards;
        }
        @keyframes predictionUploadIn {
          from { opacity: 0; transform: translate3d(0,-10px,0) scale(0.98); }
          to { opacity: 1; transform: translate3d(0,0,0) scale(1); }
        }
        @keyframes predictionUploadProgress {
          0% { transform: scaleX(0.08); opacity: 0.78; }
          58% { transform: scaleX(0.72); opacity: 1; }
          100% { transform: scaleX(1); opacity: 1; }
        }
        .prediction-reel-is-scrolling .prediction-pressable,
        .prediction-reel-is-scrolling .prediction-emphasis-happens,
        .prediction-reel-is-scrolling .prediction-emphasis-wont,
        .prediction-reel-is-scrolling .prediction-emphasis-happens::after,
        .prediction-reel-is-scrolling .prediction-emphasis-wont::after,
        .prediction-reel-is-scrolling .prediction-verdict-icon,
        .prediction-reel-is-scrolling .prediction-verdict-winner {
          animation: none !important;
          transition-duration: 80ms !important;
        }
        .prediction-reel-is-scrolling .pop-prediction-card,
        .prediction-reel-is-scrolling .stake-tug-happens,
        .prediction-reel-is-scrolling .stake-tug-wont,
        .prediction-reel-is-scrolling .drama-card-header,
        .prediction-reel-is-scrolling .prediction-card-header,
        .prediction-reel-is-scrolling .deal-card-header,
        .prediction-reel-is-scrolling .prediction-time-chip,
        .prediction-reel-is-scrolling .deal-time-chip,
        .prediction-reel-is-scrolling .rumour-source-chip,
        .prediction-reel-is-scrolling .promise-signature-row,
        .prediction-reel-is-scrolling .promise-trust-tile,
        .prediction-reel-is-scrolling .custom-tone-chip,
        .prediction-reel-is-scrolling .custom-choice-rail,
        .prediction-reel-is-scrolling .deal-stake-mark,
        .prediction-reel-is-scrolling .deal-outcome-tile,
        .prediction-reel-is-scrolling .deal-watch-label,
        .prediction-reel-is-scrolling .voter-rail > span,
        .prediction-reel-is-scrolling .drama-card--rumour .drama-statement-panel::after,
        .prediction-reel-is-scrolling .drama-card--promise .drama-statement-panel::after {
          animation: none !important;
        }
        .prediction-reel-is-scrolling .prediction-pressable,
        .prediction-reel-is-scrolling .prediction-emphasis-happens,
        .prediction-reel-is-scrolling .prediction-emphasis-wont {
          box-shadow: none !important;
        }
        .prediction-reel-is-scrolling .prediction-emphasis-happens::after,
        .prediction-reel-is-scrolling .prediction-emphasis-wont::after {
          opacity: 0 !important;
        }
        .prediction-verdict-card::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          border: 1px solid rgba(187,247,208,0.12);
          opacity: 0.72;
          pointer-events: none;
        }
        .prediction-verdict-icon {
          animation: predictionVerdictIconPulse 3.6s ease-in-out infinite;
        }
        .prediction-verdict-winner {
          text-shadow:
            0 0 16px rgba(74,222,128,0.24),
            0 8px 22px rgba(0,0,0,0.32);
          animation: predictionVerdictWinnerPop 3.8s ease-in-out infinite;
        }
        @keyframes predictionVerdictIconPulse {
          0%, 100% { transform: translate3d(0,0,0) scale(1); opacity: 0.9; }
          50% { transform: translate3d(0,-1px,0) scale(1.045); opacity: 1; }
        }
        @keyframes predictionVerdictWinnerPop {
          0%, 100% { opacity: 0.88; transform: translate3d(0,0,0) scale(1); }
          45% { opacity: 1; transform: translate3d(0,-1px,0) scale(1.018); }
        }
        .prediction-pressable {
          position: relative;
          overflow: hidden;
          isolation: isolate;
          transform: translate3d(0,0,0) scale(1);
          transition:
            transform 180ms cubic-bezier(0.22,1,0.36,1),
            border-color 220ms ease,
            background 220ms ease,
            opacity 180ms ease;
          will-change: transform, opacity;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }
        .prediction-pressable::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 0;
          border-radius: inherit;
          opacity: 0;
          transform: translate3d(0,0,0) scale(0.96);
          pointer-events: none;
          will-change: opacity, transform;
        }
        .prediction-pressable:active {
          transform: translate3d(0,1px,0) scale(0.965);
          transition-duration: 80ms;
        }
        .prediction-emphasis-happens {
          box-shadow:
            0 10px 26px rgba(74,222,128,0.06),
            inset 0 1px 0 rgba(255,255,255,0.08),
            inset 0 0 0 1px rgba(134,239,172,0.08);
          animation: predictionPulseHappens 7.5s ease-in-out infinite;
        }
        .prediction-emphasis-happens::after {
          background:
            radial-gradient(ellipse at 50% 0%, rgba(187,247,208,0.2), transparent 58%),
            linear-gradient(105deg, transparent 18%, rgba(134,239,172,0.12) 50%, transparent 82%);
          animation: predictionGlowHappens 7.5s cubic-bezier(0.45,0,0.2,1) infinite;
        }
        .prediction-emphasis-wont {
          box-shadow:
            0 10px 26px rgba(251,113,133,0.045),
            inset 0 1px 0 rgba(255,255,255,0.08),
            inset 0 0 0 1px rgba(253,164,175,0.07);
          animation: predictionPulseWont 7.5s ease-in-out infinite;
        }
        .prediction-emphasis-wont::after {
          background:
            radial-gradient(ellipse at 50% 0%, rgba(253,164,175,0.17), transparent 58%),
            linear-gradient(105deg, transparent 18%, rgba(251,113,133,0.1) 50%, transparent 82%);
          animation: predictionGlowWont 7.5s cubic-bezier(0.45,0,0.2,1) infinite;
        }
        @keyframes predictionPulseHappens {
          0%, 100% {
            opacity: 0.9;
          }
          16% {
            opacity: 1;
          }
          34% {
            opacity: 0.96;
          }
          52% {
            opacity: 0.9;
          }
        }
        @keyframes predictionGlowHappens {
          0%, 100% { opacity: 0; transform: translate3d(0,0,0) scale(0.96); }
          16% { opacity: 0.42; transform: translate3d(0,0,0) scale(1); }
          34% { opacity: 0.12; transform: translate3d(0,0,0) scale(1.01); }
          52% { opacity: 0; transform: translate3d(0,0,0) scale(0.98); }
        }
        @keyframes predictionPulseWont {
          0%, 52%, 100% {
            opacity: 0.88;
          }
          72% {
            opacity: 1;
          }
          88% {
            opacity: 0.94;
          }
        }
        @keyframes predictionGlowWont {
          0%, 52%, 100% { opacity: 0; transform: translate3d(0,0,0) scale(0.96); }
          72% { opacity: 0.38; transform: translate3d(0,0,0) scale(1); }
          88% { opacity: 0.1; transform: translate3d(0,0,0) scale(1.01); }
        }
        @media (prefers-reduced-motion: reduce) {
          .pop-prediction-card,
          .prediction-tug-happens,
          .prediction-tug-wont,
          .stake-tug-happens,
          .stake-tug-wont,
          .drama-card-header,
          .prediction-card-header,
          .deal-card-header,
          .prediction-time-chip,
          .deal-time-chip,
          .rumour-source-chip,
          .promise-signature-row,
          .promise-trust-tile,
          .custom-tone-chip,
          .custom-choice-rail,
          .deal-stake-mark,
          .deal-outcome-tile,
          .deal-watch-label,
          .voter-rail > span,
          .drama-card--rumour .drama-statement-panel::after,
          .drama-card--promise .drama-statement-panel::after,
          .voter-first-pop,
          .prediction-pressable[data-vote-removed="true"],
          .prediction-emphasis-happens,
          .prediction-emphasis-wont,
          .prediction-verdict-icon,
          .prediction-verdict-winner {
            animation: none !important;
          }
        }
      `}</style>
      <div
        className="pointer-events-none absolute inset-x-0 top-3 z-40 flex justify-center transition-all duration-300"
        style={{
          pointerEvents: "none",
          opacity: refreshingLatest ? 1 : refreshPullProgress,
          transform: `scale(${refreshingLatest ? 1 : 0.9 + refreshPullProgress * 0.1})`,
        }}
        aria-hidden="true"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/78 text-white shadow-[0_20px_48px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-xl">
          <RefreshCw
            size={20}
            strokeWidth={2.2}
            className={refreshingLatest ? "animate-spin" : ""}
            style={{
              transform: refreshingLatest
                ? undefined
                : `rotate(${refreshPullProgress * 180}deg)`,
            }}
          />
        </div>
      </div>
      {visibleUploadRequest ? (
        <div className="pointer-events-none sticky left-0 right-0 top-3 z-30 mx-auto -mb-[76px] w-[calc(100%-20px)] max-w-[520px] pt-1">
          <div className="prediction-upload-strip overflow-hidden rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,24,19,0.94),rgba(5,7,5,0.96))] p-3 shadow-[0_18px_44px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
                style={{
                  borderColor: `${uploadCopy[visibleUploadRequest.kind].tone}38`,
                  background: `${uploadCopy[visibleUploadRequest.kind].tone}18`,
                  color: uploadCopy[visibleUploadRequest.kind].tone,
                }}
              >
                {uploadDone ? <Check size={17} /> : <Upload size={16} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-[13px] font-black text-white">
                  {uploadDone
                    ? uploadCopy[visibleUploadRequest.kind].done
                    : uploadCopy[visibleUploadRequest.kind].title}
                </p>
                <p className="m-0 mt-0.5 truncate text-[11px] font-bold text-white/38">
                  {uploadDone ? "Showing latest card" : "Sending to text cards"}
                </p>
              </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/8">
              <div
                className="prediction-upload-line h-full rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${uploadCopy[visibleUploadRequest.kind].tone}, #ffffff)`,
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
      {displayItems.length > 0 ? (
        displayItems.map((item, index) => (
          <section
            key={`${item.type}-${item.id}`}
            className={`prediction-feed-page flex h-full min-h-full snap-start snap-always items-center justify-center px-0.5 pb-2 pt-3 ${
              index === currentFeedIndex ? "prediction-feed-page--active" : ""
            }`}
          >
            <div className="prediction-feed-card-shell flex h-[calc(100%-12px)] max-h-[820px] min-h-[min(620px,calc(100%-12px))] w-full max-w-[720px] items-center justify-center">
              {item.type === "external" ? (
                item.render(index === currentFeedIndex, false)
              ) : item.type === "prediction" ? (
                item.id === 'local-prediction-card-preview' ? (
                  <div className="h-full pointer-events-none" inert>
                    <PredictionCard prediction={item.prediction} isHappenedAlready={false} />
                  </div>
                ) : <PredictionCard prediction={item.prediction} isHappenedAlready={deadlineReviewOpen} />
              ) : item.type === "deal" ? (
                item.id === 'local-deal-card-preview' ? (
                  <div className="h-full pointer-events-none" inert>
                    <DealCard deal={item.deal} isHappenedAlready={false} />
                  </div>
                ) : <DealCard deal={item.deal} isHappenedAlready={deadlineReviewOpen} />
              ) : item.type === "rumour" ? (
                <RumourCard rumour={item.rumour} isHappenedAlready={deadlineReviewOpen} />
              ) : item.type === "promise" ? (
                item.id === 'local-promise-tug-preview' ? (
                  <div className="h-full pointer-events-none" inert>
                    <PromiseCard promise={item.promise} isHappenedAlready={false} />
                  </div>
                ) : <PromiseCard promise={item.promise} isHappenedAlready={deadlineReviewOpen} />
              ) : (
                <CustomCard custom={item.custom} />
              )}
            </div>
          </section>
        ))
      ) : (
        <section className="flex h-full min-h-full snap-start snap-always items-center justify-center py-4">
          <div className="flex min-h-[55dvh] w-full max-w-[520px] flex-col items-center justify-center rounded-[32px] border border-white/10 bg-white/[0.035] px-6 text-center">
            {refreshingLatest ? (
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/78 text-white shadow-[0_20px_48px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.14)]">
                <RefreshCw size={20} strokeWidth={2.2} className="animate-spin" />
              </div>
            ) : (
              <Sparkles size={34} className="mb-3 text-[#86efac]" />
            )}
            <p className="m-0 text-lg font-black text-white">
              {emptyCopy.title}
            </p>
            <p className="m-0 mt-2 text-sm font-bold text-white/35">
              {emptyCopy.body}
            </p>
          </div>
        </section>
      )}
      {showDeadlineIntro && displayItems.length > 0 ? (
        <div className="pointer-events-none absolute inset-x-3 top-5 z-40 flex justify-center sm:inset-x-6">
          <div className="pointer-events-auto w-full max-w-[720px]">
            <DeadlineReviewPrompt
              item={deadlineReviewItems[0]!}
              now={now}
              onClose={() => setShowDeadlineIntro(false)}
              onDontShowAgain={(checked) => {
                setDeadlineIntroHidden(checked);
                if (checked) {
                  window.localStorage.setItem(DEADLINE_REVIEW_INTRO_KEY, "1");
                  setShowDeadlineIntro(false);
                }
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
