"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  MouseEvent as ReactMouseEvent,
  TouchEvent,
  WheelEvent,
} from "react";
import {
  ArrowLeft,
  Filter,
  Globe2,
  MessageCircle,
  RefreshCw,
  Send,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { Avatar } from "../ui/Avatar";
import { apiFetch } from "@/lib/apiClient";
import { useImmersiveOverlayStore } from "@/stores/useImmersiveOverlayStore";
import { useVerdictsStore } from "@/stores/useVerdictsStore";
import type {
  VerdictChoice,
  VerdictCommentDTO,
  VerdictDTO,
  VerdictScope,
} from "@/types/verdict";

const TOPICS = [
  "Memes",
  "Movies",
  "Sports",
  "Gaming",
  "AI",
  "Technology",
  "Anime",
  "Music",
  "Celebrities",
  "College Life",
  "Relationships",
  "Food",
  "Travel",
  "Fashion",
];

const VERDICT_REEL_DISTANCE_THRESHOLD_PX = 58;
const VERDICT_REEL_VELOCITY_THRESHOLD = 0.3; // px per ms — flick detection
const VERDICT_REEL_TRANSITION_MS = 420;
const VERDICT_REEL_EDGE_RESISTANCE = 0.32; // rubber-band drag past first/last card

const MOCK_VOTERS: VerdictDTO["voter_preview"] = [
  {
    id: "mock-voter-isha",
    username: "isha",
    display_name: "Isha",
    avatar_url: "https://i.pravatar.cc/120?img=49",
    choice: "one",
  },
  {
    id: "mock-voter-dev",
    username: "dev",
    display_name: "Dev",
    avatar_url: "https://i.pravatar.cc/120?img=14",
    choice: "two",
  },
  {
    id: "mock-voter-maya",
    username: "maya",
    display_name: "Maya",
    avatar_url: "https://i.pravatar.cc/120?img=32",
    choice: "one",
  },
  {
    id: "mock-voter-kai",
    username: "kai",
    display_name: "Kai",
    avatar_url: "https://i.pravatar.cc/120?img=11",
    choice: "two",
  },
];

const MOCK_VERDICTS: VerdictDTO[] = [
  {
    id: "mock-verdict-haircut",
    author_id: "mock-aakash",
    author: {
      id: "mock-aakash",
      username: "aakash",
      display_name: "Aakash",
      avatar_url: "https://i.pravatar.cc/120?img=12",
    },
    question: "Keep the haircut?",
    description:
      "Fresh cut before Monday. Be honest before this becomes the new personality.",
    choice_one_text: "Keep",
    choice_two_text: "Change",
    media_url:
      "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=1200&q=86",
    media_type: "PHOTO",
    scope: "friends",
    topic: null,
    total_votes: 48,
    choice_one_votes: 37,
    choice_two_votes: 11,
    comments_count: 6,
    voter_preview: MOCK_VOTERS,
    my_vote: null,
    created_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
  },
  {
    id: "mock-verdict-shoes",
    author_id: "mock-vignesh",
    author: {
      id: "mock-vignesh",
      username: "vignesh",
      display_name: "Vignesh",
      avatar_url: "https://i.pravatar.cc/120?img=33",
    },
    question: "Worth buying?",
    description:
      "Sale ends tonight. The wallet is scared. The outfit is ready.",
    choice_one_text: "Buy It",
    choice_two_text: "Skip",
    media_url:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=86",
    media_type: "PHOTO",
    scope: "friends",
    topic: null,
    total_votes: 71,
    choice_one_votes: 52,
    choice_two_votes: 19,
    comments_count: 9,
    voter_preview: MOCK_VOTERS,
    my_vote: null,
    created_at: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
  },
  {
    id: "mock-verdict-meme",
    author_id: "mock-varsha",
    author: {
      id: "mock-varsha",
      username: "varshhh",
      display_name: "Varsha",
      avatar_url: "https://i.pravatar.cc/120?img=47",
    },
    question: "Facts or cap?",
    description: "This meme attacked three people in the group chat directly.",
    choice_one_text: "Facts",
    choice_two_text: "Cap",
    media_url:
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=86",
    media_type: "PHOTO",
    scope: "topics",
    topic: "Memes",
    total_votes: 126,
    choice_one_votes: 94,
    choice_two_votes: 32,
    comments_count: 14,
    voter_preview: MOCK_VOTERS,
    my_vote: null,
    created_at: new Date(Date.now() - 1000 * 60 * 67).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 67).toISOString(),
  },
  {
    id: "mock-verdict-movie",
    author_id: "mock-nina",
    author: {
      id: "mock-nina",
      username: "nina",
      display_name: "Nina",
      avatar_url: "https://i.pravatar.cc/120?img=44",
    },
    question: "Overrated movie?",
    description: "Everyone says masterpiece. I need the room to settle this.",
    choice_one_text: "Overrated",
    choice_two_text: "Classic",
    media_url:
      "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1200&q=86",
    media_type: "PHOTO",
    scope: "topics",
    topic: "Movies",
    total_votes: 203,
    choice_one_votes: 88,
    choice_two_votes: 115,
    comments_count: 21,
    voter_preview: MOCK_VOTERS,
    my_vote: null,
    created_at: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
  },
  {
    id: "mock-verdict-food",
    author_id: "mock-rain",
    author: {
      id: "mock-rain",
      username: "rain",
      display_name: "Rain",
      avatar_url: "https://i.pravatar.cc/120?img=68",
    },
    question: "Midnight food run?",
    description: "Group decision. If the vote passes, nobody gets to back out.",
    choice_one_text: "Go",
    choice_two_text: "Sleep",
    media_url:
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=86",
    media_type: "PHOTO",
    scope: "topics",
    topic: "Food",
    total_votes: 64,
    choice_one_votes: 45,
    choice_two_votes: 19,
    comments_count: 8,
    voter_preview: MOCK_VOTERS,
    my_vote: null,
    created_at: new Date(Date.now() - 1000 * 60 * 132).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 132).toISOString(),
  },
];

function percent(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function verdictCreatedAtMs(verdict: VerdictDTO) {
  const time = new Date(verdict.created_at).getTime();
  return Number.isFinite(time) ? time : 0;
}

function sortVerdictsForSocialFeed(
  items: VerdictDTO[],
  sessionVotedIds: Set<string>,
) {
  const byRecency = (a: VerdictDTO, b: VerdictDTO) =>
    verdictCreatedAtMs(b) - verdictCreatedAtMs(a) || b.id.localeCompare(a.id);

  return [...items].sort((a, b) => {
    // Keep unanswered verdicts first, then keep each group newest-first.
    // Session votes override stale server data while the vote request settles.
    const aVoted = Boolean(a.my_vote) || sessionVotedIds.has(a.id);
    const bVoted = Boolean(b.my_vote) || sessionVotedIds.has(b.id);
    if (aVoted !== bVoted) return aVoted ? 1 : -1;
    return byRecency(a, b);
  });
}

function timeAgo(value: string) {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "";
  const diff = Math.max(0, Date.now() - ms);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function MediaBlock({
  verdict,
  onOpen,
}: {
  verdict: VerdictDTO;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative mx-3 block min-h-0 flex-1 overflow-hidden rounded-[26px] border border-white/10 bg-[radial-gradient(circle_at_24%_18%,rgba(255,255,255,0.08),transparent_28%),radial-gradient(circle_at_78%_22%,rgba(255,255,255,0.045),transparent_30%),linear-gradient(145deg,#101010,#020202)] text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_rgba(0,0,0,0.4)]"
      aria-label="Open verdict details"
    >
      {verdict.media_type === "VIDEO" ? (
        <video
          src={verdict.media_url}
          className="h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
        />
      ) : (
        <img
          src={verdict.media_url}
          alt={verdict.question}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/42 to-transparent" />
    </button>
  );
}

type VerdictSideStyle = {
  choice: VerdictChoice;
  accent: string;
  idleBg: string;
  fill: string;
  align: "left" | "right";
};

const VERDICT_SIDES: VerdictSideStyle[] = [
  {
    choice: "one",
    accent: "#f8fafc",
    idleBg:
      "radial-gradient(circle at 18% 0%,rgba(255,255,255,0.18),transparent 60%),linear-gradient(150deg,rgba(255,255,255,0.12),rgba(255,255,255,0.04))",
    fill: "linear-gradient(90deg,rgba(255,255,255,0.36),rgba(255,255,255,0.10))",
    align: "left",
  },
  {
    choice: "two",
    accent: "#fb7185",
    idleBg:
      "radial-gradient(circle at 82% 0%,rgba(251,113,133,0.30),transparent 60%),linear-gradient(210deg,rgba(251,113,133,0.20),rgba(244,63,94,0.06))",
    fill: "linear-gradient(270deg,rgba(251,113,133,0.55),rgba(244,63,94,0.14))",
    align: "right",
  },
];

function VerdictButtons({
  verdict,
  onVote,
}: {
  verdict: VerdictDTO;
  onVote: (choice: VerdictChoice) => void;
}) {
  const onePct = percent(verdict.choice_one_votes, verdict.total_votes);
  const twoPct = percent(verdict.choice_two_votes, verdict.total_votes);
  const voted = Boolean(verdict.my_vote);

  const btnBase =
    "relative min-h-[56px] overflow-hidden rounded-full border-2 px-4 text-center transition-transform duration-200 active:scale-[0.95]";

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Choice one */}
      <button
        type="button"
        onClick={() => onVote("one")}
        className={btnBase}
        style={{
          borderColor:
            verdict.my_vote === "one" ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.22)",
          background:
            "radial-gradient(circle at 18% 0%,rgba(255,255,255,0.16),transparent 60%),linear-gradient(150deg,rgba(255,255,255,0.10),rgba(255,255,255,0.035))",
          boxShadow:
            verdict.my_vote === "one"
              ? "0 0 0 1px rgba(255,255,255,0.45), 0 14px 32px rgba(255,255,255,0.12), inset 0 1px 0 rgba(255,255,255,0.18)"
              : "inset 0 1px 0 rgba(255,255,255,0.07), 0 10px 22px rgba(255,255,255,0.045)",
        }}
      >
        <span className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.48),transparent)]" />
        {voted && (
          <span
            className="absolute inset-y-0 left-0 transition-[width] duration-700 ease-out"
            style={{
              width: `${onePct}%`,
              background:
                "linear-gradient(90deg,rgba(255,255,255,0.32),rgba(255,255,255,0.10))",
            }}
          />
        )}
        <span className="relative z-10 flex items-center justify-center gap-2">
          <span className="text-[15px] font-black text-white">
            {verdict.choice_one_text}
          </span>
          {voted && (
            <span className="shrink-0 text-[13px] font-black tabular-nums text-white/84">
              {onePct}%
            </span>
          )}
        </span>
      </button>

      {/* Choice two — pink */}
      <button
        type="button"
        onClick={() => onVote("two")}
        className={btnBase}
        style={{
          borderColor:
            verdict.my_vote === "two" ? "#fb7185" : "rgba(251,113,133,0.35)",
          background:
            "radial-gradient(circle at 82% 0%,rgba(251,113,133,0.22),transparent 60%),linear-gradient(210deg,rgba(251,113,133,0.14),rgba(244,63,94,0.05))",
          boxShadow:
            verdict.my_vote === "two"
              ? "0 0 0 1px #fb7185, 0 14px 32px rgba(251,113,133,0.24), inset 0 1px 0 rgba(255,255,255,0.14)"
              : "inset 0 1px 0 rgba(255,255,255,0.07), 0 10px 22px rgba(251,113,133,0.08)",
        }}
      >
        <span className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.48),transparent)]" />
        {voted && (
          <span
            className="absolute inset-y-0 right-0 transition-[width] duration-700 ease-out"
            style={{
              width: `${twoPct}%`,
              background:
                "linear-gradient(270deg,rgba(251,113,133,0.42),rgba(244,63,94,0.12))",
            }}
          />
        )}
        <span className="relative z-10 flex items-center justify-center gap-2">
          <span className="text-[15px] font-black text-white">
            {verdict.choice_two_text}
          </span>
          {voted && (
            <span className="shrink-0 text-[13px] font-black tabular-nums text-[#fb7185]">
              {twoPct}%
            </span>
          )}
        </span>
      </button>
    </div>
  );
}

function VerdictResultsSplit({
  verdict,
  onVote,
}: {
  verdict: VerdictDTO;
  onVote: (choice: VerdictChoice) => void;
}) {
  const onePct = percent(verdict.choice_one_votes, verdict.total_votes);
  const twoPct = percent(verdict.choice_two_votes, verdict.total_votes);

  const leading =
    verdict.choice_one_votes === verdict.choice_two_votes
      ? null
      : verdict.choice_one_votes > verdict.choice_two_votes
        ? "one"
        : "two";

  return (
    <div className="grid grid-cols-2 gap-3">
      {VERDICT_SIDES.map((side) => {
        const active = verdict.my_vote === side.choice;
        const isWinner = leading === side.choice;
        const label =
          side.choice === "one"
            ? verdict.choice_one_text
            : verdict.choice_two_text;
        const pct = side.choice === "one" ? onePct : twoPct;
        const votes =
          side.choice === "one"
            ? verdict.choice_one_votes
            : verdict.choice_two_votes;
        const isPrimary = side.choice === "one";

        return (
          <button
            key={side.choice}
            type="button"
            onClick={() => onVote(side.choice)}
            className={`verdict-choice relative flex min-h-[84px] flex-col justify-between overflow-hidden rounded-[20px] border p-3 text-left transition-transform active:scale-[0.96] ${
              isWinner ? "verdict-winner" : ""
            }`}
            style={{
              background: isPrimary
                ? "linear-gradient(158deg,#181818,#070707)"
                : "linear-gradient(158deg,#1f0e12,#0a0506)",
              borderColor: active ? side.accent : `${side.accent}38`,
              boxShadow: active
                ? `0 0 0 1px ${side.accent}, 0 18px 40px ${side.accent}4d, inset 0 1px 0 rgba(255,255,255,0.14)`
                : `inset 0 1px 0 rgba(255,255,255,0.07), 0 14px 30px ${side.accent}20`,
              ["--verdict-accent" as string]: side.accent,
            }}
          >
            {/* radial blob */}
            <span
              className="pointer-events-none absolute inset-0 rounded-[20px]"
              style={{
                background: isPrimary
                  ? "radial-gradient(circle at 22% 10%, rgba(255,255,255,0.18), transparent 60%)"
                  : "radial-gradient(circle at 78% 10%, rgba(251,113,133,0.30), transparent 60%)",
              }}
            />

            {/* top shimmer */}
            <span
              className="pointer-events-none absolute inset-x-4 top-0 h-px"
              style={{
                background: `linear-gradient(90deg,transparent,${side.accent}b0,transparent)`,
              }}
            />

            {/* liquid fill */}
            <span
              className="pointer-events-none absolute inset-y-0 rounded-[20px] transition-[width] duration-700 ease-out"
              style={{
                width: `${pct}%`,
                background: side.fill,
                ...(side.align === "left" ? { left: 0 } : { right: 0 }),
              }}
            />

            {/* corner glow */}
            <span
              className="pointer-events-none absolute h-14 w-14 rounded-full"
              style={{
                background: `${side.accent}0c`,
                ...(isPrimary
                  ? { right: "-8px", bottom: "-8px" }
                  : { left: "-8px", bottom: "-8px" }),
              }}
            />

            {/* top row: micro label + icon */}
            <div className="relative z-10 flex items-center justify-between">
              <span
                className="text-[8px] font-black uppercase tracking-[.16em]"
                style={{ color: side.accent, opacity: active ? 1 : 0.65 }}
              >
                {isPrimary ? "VOTE A" : "VOTE B"}
                {active && " ✓"}
              </span>
              <span style={{ color: side.accent, opacity: 0.5 }}>
                {isPrimary ? (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M13 2L3 14h9l-1 8 10-12h-9z" />
                  </svg>
                ) : (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                )}
              </span>
            </div>

            {/* bottom: label + percent */}
            <div className="relative z-10">
              <p className="truncate text-[11px] font-black uppercase tracking-[.07em] text-white leading-none">
                {label}
              </p>
              <div className="mt-1 flex items-baseline gap-1">
                <span
                  className="text-[20px] font-black leading-none tabular-nums"
                  style={{ color: side.accent }}
                >
                  {pct}%
                </span>
                <span className="text-[10px] font-bold text-white/38 tabular-nums">
                  {votes.toLocaleString()}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function VerdictVoterRail({
  verdict,
  onOpen,
}: {
  verdict: VerdictDTO;
  onOpen?: () => void;
}) {
  const voters = (verdict.voter_preview || []).slice(0, 5);
  if (voters.length === 0) return null;

  const content = (
    <>
      <span className="flex items-center">
        {voters.map((voter, index) => (
          <span
            key={voter.id}
            className="rounded-full border-[2.5px] border-[#070907] shadow-[0_6px_14px_rgba(0,0,0,0.28)]"
            style={{ marginLeft: index === 0 ? 0 : -9 }}
          >
            <Avatar
              src={voter.avatar_url}
              alt={voter.display_name || voter.username}
              userId={voter.id}
              username={voter.username}
              size={30}
              disableRealtime
            />
          </span>
        ))}
      </span>
      <span className="ml-2 text-[12px] font-extrabold leading-none text-white/58">
        voted
      </span>
    </>
  );

  if (!onOpen) {
    return (
      <div className="flex min-h-9 items-center justify-start text-left">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-9 items-center justify-start text-left transition-opacity active:opacity-70"
      aria-label="See who voted"
    >
      {content}
    </button>
  );
}

type VerdictVoter = VerdictDTO["voter_preview"][number];

function VerdictVotersModal({
  verdict,
  voters,
  loading,
  onClose,
}: {
  verdict: VerdictDTO;
  voters: VerdictVoter[];
  loading: boolean;
  onClose: () => void;
}) {
  const [activeChoice, setActiveChoice] = useState<VerdictChoice>(
    verdict.my_vote || "one",
  );
  const [visible, setVisible] = useState(false);
  const closingTimerRef = useRef<number | null>(null);
  const onePct = percent(verdict.choice_one_votes, verdict.total_votes);
  const twoPct = verdict.total_votes > 0 ? 100 - onePct : 0;
  const activeCount =
    activeChoice === "one"
      ? verdict.choice_one_votes
      : verdict.choice_two_votes;
  const activePct = activeChoice === "one" ? onePct : twoPct;
  const activeLabel =
    activeChoice === "one"
      ? verdict.choice_one_text
      : verdict.choice_two_text;
  const activeAccent = activeChoice === "one" ? "#f8fafc" : "#fb7185";
  const activeVoters = voters.filter(
    (voter) => voter.choice === activeChoice,
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setVisible(true));
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.cancelAnimationFrame(frame);
      if (closingTimerRef.current !== null) {
        window.clearTimeout(closingTimerRef.current);
      }
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setVisible(false);
        closingTimerRef.current = window.setTimeout(onClose, 280);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const close = () => {
    if (!visible) return;
    setVisible(false);
    closingTimerRef.current = window.setTimeout(onClose, 280);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[10020] flex items-end justify-center"
      style={{
        background: visible ? "rgba(0,0,0,0.62)" : "rgba(0,0,0,0)",
        backdropFilter: visible ? "blur(5px)" : "blur(0px)",
        WebkitBackdropFilter: visible ? "blur(5px)" : "blur(0px)",
        transition: "background 280ms ease, backdrop-filter 280ms ease",
      }}
      onClick={close}
    >
      <section
        className="flex h-[68dvh] max-h-[620px] w-full max-w-[520px] flex-col overflow-hidden rounded-[28px_28px_0_0] border border-white/14 shadow-[0_-8px_40px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl"
        style={{
          background:
            "radial-gradient(circle at 12% -10%,rgba(255,255,255,0.08),transparent 32%),radial-gradient(circle at 92% 0%,rgba(251,113,133,0.12),transparent 30%),linear-gradient(180deg,rgba(16,16,16,0.88),rgba(5,5,5,0.96))",
          transform: visible ? "translate3d(0,0,0)" : "translate3d(0,100%,0)",
          transition: "transform 340ms cubic-bezier(0.32,0.72,0,1)",
        }}
        onClick={(event) => event.stopPropagation()}
        aria-modal="true"
        role="dialog"
        aria-label="Verdict voter results"
      >
        <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-white/20" />
        <div className="shrink-0 border-b border-white/8 px-4 pb-4 pt-3 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="m-0 text-[11px] font-black uppercase tracking-[0.16em] text-white/55">
                Roll call
              </p>
              <h2 className="m-0 mt-1 text-[22px] font-black leading-none text-white">
                Who picked what?
              </h2>
              <p className="m-0 mt-2 truncate text-[12px] font-bold text-white/42">
                {verdict.total_votes.toLocaleString()} {verdict.total_votes === 1 ? "take" : "takes"} from the room
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/65 transition-colors active:bg-white/10"
              aria-label="Close voter results"
            >
              <X size={17} />
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <span
              className="min-w-0 truncate text-[21px] font-black"
              style={{ color: activeAccent }}
            >
              {activePct}% {activeLabel}
            </span>
            <span className="shrink-0 text-[12px] font-black uppercase tracking-[0.08em] text-white/35">
              {activeCount.toLocaleString()} {activeCount === 1 ? "vote" : "votes"}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-[width,background] duration-500"
              style={{
                width: `${activePct}%`,
                background:
                  activeChoice === "one"
                    ? "linear-gradient(90deg,rgba(255,255,255,0.92),rgba(255,255,255,0.34))"
                    : "linear-gradient(90deg,#fb7185,#f43f5e)",
              }}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {(["one", "two"] as const).map((choice) => {
              const isOne = choice === "one";
              const selected = activeChoice === choice;
              const label = isOne
                ? verdict.choice_one_text
                : verdict.choice_two_text;
              const count = isOne
                ? verdict.choice_one_votes
                : verdict.choice_two_votes;
              const accent = isOne ? "#f8fafc" : "#fb7185";
              return (
                <button
                  key={choice}
                  type="button"
                  onClick={() => setActiveChoice(choice)}
                  className={`min-w-0 rounded-[14px] border px-2 py-2.5 text-[11px] font-black uppercase tracking-[0.04em] transition-all ${
                    selected
                      ? "text-white"
                      : "border-white/8 bg-white/[0.04] text-white/38"
                  }`}
                  style={
                    selected
                      ? {
                          borderColor: `${accent}99`,
                          background: `${accent}20`,
                          color: accent,
                        }
                      : undefined
                  }
                >
                  <span className="block truncate">{label} · {count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[calc(16px+var(--safe-area-bottom))] sm:px-6">
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="h-[62px] animate-pulse rounded-[20px] border border-white/6 bg-white/[0.04]"
                />
              ))}
            </div>
          ) : activeVoters.length > 0 ? (
            <div className="space-y-2">
              {activeVoters.map((voter) => {
                const name =
                  voter.display_name || voter.username || "Dare user";
                return (
                  <div
                    key={voter.id}
                    className="flex items-center gap-3 rounded-[20px] border border-white/8 bg-white/[0.045] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  >
                    <Avatar
                      src={voter.avatar_url}
                      alt={name}
                      size={36}
                      fallbackText={name.charAt(0)}
                      userId={voter.id}
                      username={voter.username}
                      disableRealtime
                    />
                    <div className="min-w-0 flex-1">
                      <p className="m-0 truncate text-[13px] font-black text-white">
                        {name}
                      </p>
                      <p className="m-0 mt-0.5 truncate text-[11px] font-bold text-white/38">
                        cast their take
                      </p>
                    </div>
                    <span
                      className="max-w-[42%] truncate text-[11px] font-black uppercase tracking-[0.05em]"
                      style={{ color: activeAccent }}
                    >
                      {activeLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-[150px] items-center justify-center text-center">
              <p className="m-0 text-[13px] font-bold text-white/38">
                Nobody picked this side yet.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}

function VerdictVoteActions({
  verdict,
  onVote,
  onUndo,
}: {
  verdict: VerdictDTO;
  onVote: (choice: VerdictChoice) => void;
  onUndo: () => void;
}) {
  const [localSelected, setLocalSelected] = useState<VerdictChoice | null>(
    verdict.my_vote,
  );
  const [isConfirming, setIsConfirming] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const undoTimerRef = useRef<number | null>(null);
  const undoingRef = useRef(false);
  const selected = localSelected;
  const selectedLabel = selected === "one" ? verdict.choice_one_text : verdict.choice_two_text;

  useEffect(() => {
    const syncTimer = window.setTimeout(() => {
      if (undoingRef.current) return;
      setLocalSelected(verdict.my_vote);
    }, 0);
    return () => window.clearTimeout(syncTimer);
  }, [verdict.my_vote]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current !== null) {
        window.clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  const commitVote = (choice: VerdictChoice) => {
    if (localSelected) return;
    setLocalSelected(choice);
    setIsConfirming(true);
    onVote(choice);
    window.setTimeout(() => setIsConfirming(false), 720);
  };

  const clearUndoTimer = () => {
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  };

  const startUndoHold = () => {
    if (!localSelected) return;
    clearUndoTimer();
    undoTimerRef.current = window.setTimeout(() => {
      undoTimerRef.current = null;
      undoingRef.current = true;
      setIsUndoing(true);
      onUndo();
      window.setTimeout(() => {
        setLocalSelected(null);
        setIsConfirming(false);
        setIsUndoing(false);
        undoingRef.current = false;
      }, 460);
    }, 700);
  };

  const preventUndoContextMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (localSelected) event.preventDefault();
  };

  if (selected) {
    return (
      <button
        type="button"
        onPointerDown={startUndoHold}
        onPointerUp={clearUndoTimer}
        onPointerLeave={clearUndoTimer}
        onPointerCancel={clearUndoTimer}
        onContextMenu={preventUndoContextMenu}
        className={`verdict-vote-confirm verdict-vote-confirm-${selected} relative flex min-h-[54px] w-full flex-col items-center justify-center overflow-hidden rounded-[16px] border border-[#4ade80]/55 bg-[#4ade80] px-4 text-center text-[#051007] active:scale-[0.98]`}
        style={{
          animation: isUndoing
            ? "verdictVoteUndo 460ms cubic-bezier(0.22, 1, 0.36, 1) both"
            : isConfirming
              ? "verdictVoteCommit 720ms cubic-bezier(0.22, 1, 0.36, 1) both"
              : undefined,
        }}
      >
        <span className="relative z-10 text-[14px] font-black">
          You think this is {selectedLabel}
        </span>
        <span className="relative z-10 mt-0.5 text-[9px] font-black uppercase tracking-[0.13em] opacity-45">
          Hold to undo
        </span>
      </button>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {(["one", "two"] as const).map((choice) => {
        const label = choice === "one" ? verdict.choice_one_text : verdict.choice_two_text;
        return (
          <button
            key={choice}
            type="button"
            onClick={() => commitVote(choice)}
            className={`verdict-vote-option verdict-vote-option-${choice} relative min-h-[54px] overflow-hidden rounded-[16px] border border-white/9 bg-white/[0.045] px-3 text-center transition-[transform,border-color,background-color] duration-200 hover:border-[#4ade80]/28 hover:bg-white/[0.065] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4ade80]`}
          >
            <span className="relative z-10 block truncate text-[14px] font-black text-white/84">
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function VerdictCard({
  verdict,
  onVote,
  onUndoVote,
  onOpen,
  onOpenVoters,
}: {
  verdict: VerdictDTO;
  onVote: (choice: VerdictChoice) => void;
  onUndoVote: () => void;
  onOpen: () => void;
  onOpenVoters: () => void;
}) {
  return (
    <article className="pop-verdict-card flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[24px] border border-white/9 bg-[#0d100d] shadow-[0_20px_54px_rgba(0,0,0,0.3)]">
      <div className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-3.5">
        <Avatar
          src={verdict.author.avatar_url}
          alt={verdict.author.display_name || verdict.author.username}
          userId={verdict.author.id}
          username={verdict.author.username}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-extrabold text-white">
            {verdict.author.display_name || verdict.author.username}
          </div>
          <div className="mt-0.5 truncate text-[12px] font-semibold text-white/34">
            @{verdict.author.username.replace(/^@/, "")} ·{" "}
            {timeAgo(verdict.created_at)}
          </div>
        </div>
      </div>

      <div className="shrink-0 px-4 pb-3">
        <h2 className="m-0 line-clamp-2 text-left text-[23px] font-black leading-[1.08] tracking-[-0.035em] text-white [text-wrap:balance]">
          {verdict.question}
        </h2>
        {verdict.description && (
          <p className="mt-1.5 line-clamp-1 max-w-[30rem] text-left text-[12px] font-medium leading-snug text-white/40">
            {verdict.description}
          </p>
        )}
      </div>

      <MediaBlock verdict={verdict} onOpen={onOpen} />

      <div className="shrink-0 px-4 pb-4 pt-2.5">
        <div className="flex min-h-10 items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <VerdictVoterRail verdict={verdict} onOpen={onOpenVoters} />
          </div>
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-[12px] bg-white/[0.055] px-3 text-[11px] font-black text-white/58 transition-[transform,background-color,color] duration-200 hover:bg-white/[0.085] hover:text-white/82 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4ade80]"
            aria-label="Open comments"
          >
            <MessageCircle size={13} strokeWidth={2.3} />
            {verdict.comments_count.toLocaleString()} comments
          </button>
        </div>
        <div className="mt-2.5">
          <VerdictVoteActions
            verdict={verdict}
            onVote={onVote}
            onUndo={onUndoVote}
          />
        </div>
      </div>
    </article>
  );
}

function CommentItem({
  comment,
  replies,
  repliesByParent,
  onReply,
  depth = 0,
}: {
  comment: VerdictCommentDTO;
  replies: VerdictCommentDTO[];
  repliesByParent: Record<string, VerdictCommentDTO[]>;
  onReply: (comment: VerdictCommentDTO) => void;
  depth?: number;
}) {
  const displayName =
    comment.author.display_name || comment.author.username || "Someone";
  const username = comment.author.username
    ? comment.author.username.replace(/^@/, "")
    : "user";
  const nested = depth > 0;

  return (
    <article className="relative">
      <div
        className={`flex gap-3 px-4 py-4 ${nested ? "pl-3" : ""}`}
        style={{
          paddingLeft: nested ? Math.min(18 + depth * 14, 58) : undefined,
        }}
      >
        {nested && (
          <span
            className="absolute bottom-0 top-0 w-px bg-[#4ade80]/14"
            style={{ left: Math.min(depth * 14, 42) }}
            aria-hidden="true"
          />
        )}
        <div className="shrink-0 pt-0.5">
          <Avatar
            src={comment.author.avatar_url}
            alt={displayName}
            userId={comment.user_id}
            username={comment.author.username}
            size="sm"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-[13.5px] font-extrabold leading-none text-white/92">
              {displayName}
            </span>
            <span className="shrink-0 text-[12px] font-semibold leading-none text-white/30">
              @{username}
            </span>
            <span className="shrink-0 font-mono text-[11px] font-bold leading-none text-white/22">
              {timeAgo(comment.created_at)}
            </span>
          </div>
          <p className="m-0 mt-2 whitespace-pre-wrap break-words text-[14px] font-medium leading-[1.5] text-white/70">
            {comment.text}
          </p>
          <div className="mt-2 flex items-center gap-4">
            <button
              type="button"
              onClick={() => onReply(comment)}
              className="rounded-[10px] px-0 py-1 text-[11px] font-black text-[#72e994]/68 transition-colors hover:text-[#72e994] active:text-[#4ade80] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4ade80]"
            >
              Reply
            </button>
          </div>
        </div>
      </div>
      {replies.length > 0 && (
        <div className="relative">
          {replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              replies={repliesByParent[reply.id] || []}
              repliesByParent={repliesByParent}
              onReply={onReply}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </article>
  );
}

function VerdictDetail({
  verdict,
  comments,
  loading,
  hasMoreComments,
  onClose,
  onSendComment,
  onLoadMoreComments,
}: {
  verdict: VerdictDTO;
  comments: VerdictCommentDTO[];
  loading: boolean;
  hasMoreComments: boolean;
  onClose: () => void;
  onSendComment: (text: string, parentId?: string | null) => Promise<void>;
  onLoadMoreComments: () => void;
}) {
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<VerdictCommentDTO | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const roots = comments.filter((comment) => !comment.parent_id);
  const onePct = percent(verdict.choice_one_votes, verdict.total_votes);
  const twoPct = verdict.total_votes > 0 ? 100 - onePct : 0;
  const repliesByParent = comments.reduce<Record<string, VerdictCommentDTO[]>>(
    (acc, comment) => {
      if (!comment.parent_id) return acc;
      acc[comment.parent_id] = [...(acc[comment.parent_id] || []), comment];
      return acc;
    },
    {},
  );

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onSendComment(trimmed, replyTo?.id || null);
      setText("");
      setReplyTo(null);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    useImmersiveOverlayStore.getState().setActive(true);
    return () => useImmersiveOverlayStore.getState().setActive(false);
  }, []);

  return (
    <div className="fixed inset-0 z-[10000] bg-[#050505] text-white">
      <div className="sticky top-0 z-20 border-b border-white/8 bg-[#050505]/92 px-3 pb-2 pt-[calc(var(--safe-area-top)+8px)] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/80"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="sr-only">
            <div className="text-[18px] font-black">Verdict room</div>
            <div className="truncate text-[12px] font-bold text-white/38">
              {verdict.total_votes} votes · {verdict.comments_count} comments
            </div>
          </div>
        </div>
      </div>

      <div className="h-[calc(100dvh-var(--safe-area-top)-52px)] overflow-y-auto px-3 pb-[calc(18px+var(--safe-area-bottom))] pt-3">
        <div className="mx-auto max-w-xl space-y-3">
          <section className="pop-verdict-card rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.94),rgba(7,7,7,0.98))] p-3 shadow-[0_14px_36px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)]">
            <h1 className="m-0 text-center text-[18px] font-black leading-tight">
              {verdict.question}
            </h1>
            <div className="mt-3 overflow-hidden rounded-[18px] border border-white/10 bg-[radial-gradient(circle_at_24%_18%,rgba(255,255,255,0.08),transparent_28%),radial-gradient(circle_at_78%_22%,rgba(255,255,255,0.045),transparent_30%),linear-gradient(145deg,#101010,#020202)]">
              {verdict.media_type === "VIDEO" ? (
                <video
                  src={verdict.media_url}
                  controls
                  playsInline
                  className="max-h-[220px] w-full bg-black object-contain"
                />
              ) : (
                <img
                  src={verdict.media_url}
                  alt={verdict.question}
                  className="max-h-[220px] w-full bg-black object-contain"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              )}
            </div>
            {verdict.description && (
              <p className="mx-auto mt-2 max-w-xl whitespace-pre-line text-[13px] font-semibold leading-snug text-white/58">
                {verdict.description}
              </p>
            )}
          </section>

          <section className="rounded-[22px] border border-white/10 bg-white/[0.035] p-3">
            <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-[15px] border border-white/10 bg-black/24 px-3 py-2.5">
              <div className="min-w-0 text-left">
                <div className="truncate text-[12px] font-black text-white">
                  {verdict.choice_one_text}
                </div>
                <div className="mt-0.5 text-[11px] font-black tabular-nums text-white/50">
                  {onePct}% · {verdict.choice_one_votes.toLocaleString()}
                </div>
              </div>
              <div className="text-[9.5px] font-black uppercase tracking-[0.12em] text-white/28">
                results
              </div>
              <div className="min-w-0 text-right">
                <div className="truncate text-[12px] font-black text-white">
                  {verdict.choice_two_text}
                </div>
                <div className="mt-0.5 text-[11px] font-black tabular-nums text-white/50">
                  {twoPct}% · {verdict.choice_two_votes.toLocaleString()}
                </div>
              </div>
            </div>

            <div className="mb-3 flex items-center justify-between">
              <h2 className="m-0 text-[16px] font-black">Comments</h2>
              <span className="text-[12px] font-bold text-white/38">
                {verdict.comments_count.toLocaleString()}
              </span>
            </div>
            {loading ? (
              <div className="py-7 text-center text-sm font-bold text-white/40">
                Loading comments...
              </div>
            ) : roots.length === 0 ? (
              <div className="py-7 text-center text-sm font-bold text-white/40">
                Be the first to start the argument.
              </div>
            ) : (
              <div className="space-y-3">
                {roots.map((comment) => (
                  <CommentItem
                    key={comment.id}
                    comment={comment}
                    replies={repliesByParent[comment.id] || []}
                    repliesByParent={repliesByParent}
                    onReply={setReplyTo}
                  />
                ))}
                {hasMoreComments && (
                  <button
                    type="button"
                    onClick={onLoadMoreComments}
                    disabled={loading}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-2.5 text-[12px] font-black uppercase tracking-[0.12em] text-white/68 transition-colors hover:bg-white/[0.07] disabled:opacity-45"
                  >
                    Load more comments
                  </button>
                )}
              </div>
            )}

            <div className="mt-4 border-t border-white/8 pt-3">
              <div className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-white/54">
                Leave a comment
              </div>
              {replyTo && (
                <div className="mb-2 flex items-center justify-between rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-[11.5px] font-bold text-white/64">
                  Replying to @{replyTo.author.username.replace(/^@/, "")}
                  <button type="button" onClick={() => setReplyTo(null)}>
                    Clear
                  </button>
                </div>
              )}
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
              >
                <input
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Write a comment..."
                  aria-label="Write a comment"
                  maxLength={1000}
                  className="min-w-0 flex-1 rounded-[16px] border border-white/14 bg-white/[0.075] px-3.5 py-2.5 text-[14px] font-semibold text-white outline-none placeholder:text-white/34 focus:border-white/30 focus:bg-white/[0.095]"
                />
                <button
                  type="submit"
                  disabled={!text.trim() || submitting}
                  className="flex h-10 w-10 items-center justify-center rounded-[15px] bg-white text-black shadow-[0_10px_24px_rgba(255,255,255,0.12)] disabled:opacity-40"
                >
                  <Send size={18} />
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function VerdictThreadScreen({
  verdict,
  comments,
  loading,
  hasMoreComments,
  onClose,
  onSendComment,
  onLoadMoreComments,
}: {
  verdict: VerdictDTO;
  comments: VerdictCommentDTO[];
  loading: boolean;
  hasMoreComments: boolean;
  onClose: () => void;
  onSendComment: (text: string, parentId?: string | null) => Promise<void>;
  onLoadMoreComments: () => void;
}) {
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<VerdictCommentDTO | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const roots = comments.filter((comment) => !comment.parent_id);
  const onePct = percent(verdict.choice_one_votes, verdict.total_votes);
  const twoPct = verdict.total_votes > 0 ? 100 - onePct : 0;
  const repliesByParent = comments.reduce<Record<string, VerdictCommentDTO[]>>(
    (acc, comment) => {
      if (!comment.parent_id) return acc;
      acc[comment.parent_id] = [...(acc[comment.parent_id] || []), comment];
      return acc;
    },
    {},
  );
  const replyName =
    replyTo?.author.display_name || replyTo?.author.username || "";

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onSendComment(trimmed, replyTo?.id || null);
      setText("");
      setReplyTo(null);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    useImmersiveOverlayStore.getState().setActive(true);
    return () => useImmersiveOverlayStore.getState().setActive(false);
  }, []);

  return (
    <div className="fixed inset-0 z-[10000] bg-[#0b0b0b] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-18%,rgba(255,255,255,0.06),transparent_32%),linear-gradient(180deg,#101010_0%,#090909_42%,#050505_100%)]" />
      <div className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#0b0b0b]/94 px-3 pb-2.5 pt-[calc(var(--safe-area-top)+8px)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.07] text-white/84 transition-colors active:bg-white/[0.12]"
            aria-label="Back to verdicts"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-black text-white/92">
              Verdict thread
            </div>
            <div className="truncate text-[12px] font-bold text-white/38">
              {verdict.total_votes.toLocaleString()} votes ·{" "}
              {verdict.comments_count.toLocaleString()} comments
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 h-[calc(100dvh-var(--safe-area-top)-54px)] overflow-y-auto pb-[calc(88px+var(--safe-area-bottom))]">
        <div className="mx-auto max-w-2xl">
          <section className="border-b border-white/[0.07] px-4 pb-4 pt-4">
            <div className="flex items-center gap-3">
              <Avatar
                src={verdict.author.avatar_url}
                alt={verdict.author.display_name || verdict.author.username}
                userId={verdict.author.id}
                username={verdict.author.username}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-black text-white/90">
                  {verdict.author.display_name || verdict.author.username}
                </div>
                <div className="truncate text-[12px] font-bold text-white/34">
                  @{verdict.author.username.replace(/^@/, "")} ·{" "}
                  {timeAgo(verdict.created_at)}
                </div>
              </div>
            </div>

            <h1 className="m-0 mt-3 text-[21px] font-black leading-[1.12] tracking-[-0.01em] text-white/94">
              {verdict.question}
            </h1>
            {verdict.description && (
              <p className="m-0 mt-2 whitespace-pre-line text-[14px] font-medium leading-[1.42] text-white/58">
                {verdict.description}
              </p>
            )}
            <div className="mt-3 overflow-hidden rounded-[14px] bg-black/50">
              {verdict.media_type === "VIDEO" ? (
                <video
                  src={verdict.media_url}
                  controls
                  playsInline
                  className="max-h-[260px] w-full bg-black object-contain"
                />
              ) : (
                <img
                  src={verdict.media_url}
                  alt={verdict.question}
                  className="max-h-[260px] w-full bg-black object-contain"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              )}
            </div>
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
              <div className="min-w-0 text-left">
                <div className="truncate text-[13px] font-black text-white/84">
                  {verdict.choice_one_text}
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.075]">
                  <div
                    className="h-full rounded-full bg-white/72"
                    style={{ width: `${onePct}%` }}
                  />
                </div>
                <div className="mt-1 text-[11px] font-black tabular-nums text-white/38">
                  {onePct}% · {verdict.choice_one_votes.toLocaleString()}
                </div>
              </div>
              <div className="text-[10px] font-black text-white/28">results</div>
              <div className="min-w-0 text-right">
                <div className="truncate text-[13px] font-black text-white/84">
                  {verdict.choice_two_text}
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.075]">
                  <div
                    className="ml-auto h-full rounded-full bg-rose-300/76"
                    style={{ width: `${twoPct}%` }}
                  />
                </div>
                <div className="mt-1 text-[11px] font-black tabular-nums text-white/38">
                  {twoPct}% · {verdict.choice_two_votes.toLocaleString()}
                </div>
              </div>
            </div>
          </section>

          <section>
            <div className="sticky top-0 z-20 flex items-center justify-between border-b border-white/[0.06] bg-[#0b0b0b]/92 px-4 py-3 backdrop-blur-xl">
              <h2 className="m-0 text-[15px] font-black text-white/86">
                Comments
              </h2>
              <span className="text-[12px] font-bold text-white/36">
                {roots.length.toLocaleString()} top-level
              </span>
            </div>
            {loading ? (
              <div className="px-4 py-10 text-center text-sm font-bold text-white/36">
                Loading comments...
              </div>
            ) : roots.length === 0 ? (
              <div className="px-8 py-14 text-center text-sm font-bold leading-relaxed text-white/36">
                Be the first to start the argument.
              </div>
            ) : (
              <div className="divide-y divide-white/[0.055]">
                {roots.map((comment) => (
                  <CommentItem
                    key={comment.id}
                    comment={comment}
                    replies={repliesByParent[comment.id] || []}
                    repliesByParent={repliesByParent}
                    onReply={setReplyTo}
                  />
                ))}
                {hasMoreComments && (
                  <div className="px-4 py-4">
                    <button
                      type="button"
                      onClick={onLoadMoreComments}
                      disabled={loading}
                      className="w-full rounded-full bg-white/[0.07] px-4 py-3 text-[12px] font-black text-white/70 transition-colors active:bg-white/[0.11] disabled:opacity-45"
                    >
                      Load more comments
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-[#0b0b0b]/96 px-3 pb-[calc(var(--safe-area-bottom)+10px)] pt-2.5 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl">
          {replyTo && (
            <div className="mb-2 flex items-center justify-between gap-3 px-1 text-[12px] font-bold text-white/46">
              <span className="min-w-0 truncate">Replying to {replyName}</span>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="shrink-0 text-white/70"
              >
                Cancel
              </button>
            </div>
          )}
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={replyTo ? "Write a reply..." : "Add a comment..."}
              aria-label={replyTo ? "Write a reply" : "Write a comment"}
              maxLength={1000}
              className="min-h-11 min-w-0 flex-1 rounded-full bg-white/[0.075] px-4 py-3 text-[14px] font-semibold text-white outline-none placeholder:text-white/34 focus:bg-white/[0.105]"
            />
            <button
              type="submit"
              disabled={!text.trim() || submitting}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-[0_10px_24px_rgba(255,255,255,0.11)] transition-transform active:scale-95 disabled:opacity-40"
              aria-label="Send comment"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function VerdictsScreen({
  isActive = true,
  initialVerdictId,
}: {
  isActive?: boolean;
  initialVerdictId?: string | null;
}) {
  const {
    friends,
    topics,
    loading,
    loadingMore,
    hasMoreByScope,
    commentsByVerdictId,
    commentsHasMoreByVerdictId,
    commentLoadingById,
    loadVerdicts,
    vote,
    removeVote,
    loadComments,
    addComment,
  } = useVerdictsStore();
  const [scope, setScope] = useState<VerdictScope>("friends");
  const [topic, setTopic] = useState("Memes");
  const [selected, setSelected] = useState<VerdictDTO | null>(null);
  const [voterModalVerdictId, setVoterModalVerdictId] = useState<string | null>(
    null,
  );
  const [votersByVerdictId, setVotersByVerdictId] = useState<
    Record<string, VerdictVoter[]>
  >({});
  const [votersLoadingById, setVotersLoadingById] = useState<
    Record<string, boolean>
  >({});
  const [topicMenuOpen, setTopicMenuOpen] = useState(false);
  const [refreshingLatest, setRefreshingLatest] = useState(false);
  const [refreshPullProgress, setRefreshPullProgress] = useState(0);
  const [sessionVotedIds, setSessionVotedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const activeItems = scope === "friends" ? friends : topics;
  const reelItems = useMemo(
    () => sortVerdictsForSocialFeed(activeItems, sessionVotedIds),
    [activeItems, sessionVotedIds],
  );
  const [activeReelIndex, setActiveReelIndex] = useState(0);
  const reelTrackRef = useRef<HTMLDivElement | null>(null);
  const reelViewportRef = useRef<HTMLElement | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const lastTouchYRef = useRef<number>(0);
  const lastTouchTimeRef = useRef<number>(0);
  const velocityRef = useRef<number>(0);
  const draggingRef = useRef(false);
  const axisLockRef = useRef<"none" | "vertical" | "horizontal">("none");
  const activeReelIndexRef = useRef(0);
  const wheelAccumRef = useRef(0);
  const wheelResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showLoadingPanel = activeItems.length > 0 && loadingMore;
  const showEndPanel =
    activeItems.length > 0 && !loadingMore && !hasMoreByScope[scope];
  const maxReelIndex = Math.max(
    0,
    reelItems.length + (showLoadingPanel || showEndPanel ? 1 : 0) - 1,
  );

  // Keep a ref of the current index so DOM-driven drag handlers stay in sync
  // without re-binding listeners every render.
  useEffect(() => {
    activeReelIndexRef.current = activeReelIndex;
  }, [activeReelIndex]);

  useEffect(() => {
    if (!isActive) return;
    void loadVerdicts(scope, { reset: activeItems.length === 0, topic });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, scope, topic]);

  useEffect(() => {
    if (isActive) return;
    setSessionVotedIds(new Set());
  }, [isActive]);

  useEffect(() => {
    setActiveReelIndex(0);
  }, [scope, topic]);

  useEffect(() => {
    setActiveReelIndex((current) => Math.min(current, maxReelIndex));
  }, [maxReelIndex]);

  useEffect(() => {
    if (!isActive || !initialVerdictId) return;
    const target = [...friends, ...topics].find(
      (verdict) => verdict.id === initialVerdictId,
    );
    if (!target) return;
    if (target.scope !== scope) {
      setScope(target.scope);
    }
    if (target.scope === "topics" && target.topic && target.topic !== topic) {
      setTopic(target.topic);
    }
  }, [friends, initialVerdictId, isActive, scope, topic, topics]);

  // Jump to a specific verdict when navigated from the feed
  useEffect(() => {
    if (!isActive || !initialVerdictId) return;
    const idx = reelItems.findIndex((v) => v.id === initialVerdictId);
    if (idx < 0) return;
    activeReelIndexRef.current = idx;
    setActiveReelIndex(idx);
    const track = reelTrackRef.current;
    if (track) {
      track.style.transition = "none";
      track.style.transform = `translate3d(0, -${idx * 100}%, 0)`;
    }
  }, [isActive, initialVerdictId, reelItems]);

  useEffect(() => {
    if (
      activeItems.length === 0 ||
      loading ||
      loadingMore ||
      !hasMoreByScope[scope] ||
      activeReelIndex < activeItems.length - 2
    ) {
      return;
    }
    void loadVerdicts(scope, { topic });
  }, [
    activeItems.length,
    activeReelIndex,
    hasMoreByScope,
    loadVerdicts,
    loading,
    loadingMore,
    scope,
    topic,
  ]);

  useEffect(() => {
    return () => {
      if (wheelResetTimerRef.current) {
        clearTimeout(wheelResetTimerRef.current);
        wheelResetTimerRef.current = null;
      }
    };
  }, []);

  const selectedFresh = useMemo(() => {
    if (!selected) return null;
    return (
      [...friends, ...topics].find((item) => item.id === selected.id) ||
      selected
    );
  }, [friends, selected, topics]);

  const voterModalVerdict = useMemo(() => {
    if (!voterModalVerdictId) return null;
    return [...friends, ...topics].find(
      (item) => item.id === voterModalVerdictId,
    ) || null;
  }, [friends, topics, voterModalVerdictId]);

  const openDetail = (verdict: VerdictDTO) => {
    setSelected(verdict);
    if (!verdict.id.startsWith("mock-verdict-")) {
      void loadComments(verdict.id);
    }
  };

  const openVoterResults = (verdict: VerdictDTO) => {
    setVoterModalVerdictId(verdict.id);
    if (
      Object.prototype.hasOwnProperty.call(votersByVerdictId, verdict.id)
    ) {
      return;
    }
    if (verdict.id.startsWith("mock-verdict-")) {
      setVotersByVerdictId((current) => ({
        ...current,
        [verdict.id]: verdict.voter_preview,
      }));
      return;
    }

    setVotersLoadingById((current) => ({
      ...current,
      [verdict.id]: true,
    }));
    void apiFetch<{ ok: boolean; voters: VerdictVoter[] }>(
      `/api/verdicts/${encodeURIComponent(verdict.id)}/vote`,
      { method: "GET", skipCsrf: true } as RequestInit & {
        skipCsrf?: boolean;
      },
    )
      .then((response) => {
        setVotersByVerdictId((current) => ({
          ...current,
          [verdict.id]: response.voters,
        }));
      })
      .catch(() => {
        setVotersByVerdictId((current) => ({
          ...current,
          [verdict.id]: verdict.voter_preview,
        }));
      })
      .finally(() => {
        setVotersLoadingById((current) => ({
          ...current,
          [verdict.id]: false,
        }));
      });
  };

  const handleVote = (verdict: VerdictDTO, choice: VerdictChoice) => {
    setSessionVotedIds((current) => {
      const next = new Set(current);
      next.add(verdict.id);
      return next;
    });
    setVotersByVerdictId((current) => {
      if (!(verdict.id in current)) return current;
      const next = { ...current };
      delete next[verdict.id];
      return next;
    });
    void vote(verdict.id, choice);
  };

  const handleRemoveVote = (verdict: VerdictDTO) => {
    setSessionVotedIds((current) => {
      const next = new Set(current);
      next.delete(verdict.id);
      return next;
    });
    setVotersByVerdictId((current) => {
      if (!(verdict.id in current)) return current;
      const next = { ...current };
      delete next[verdict.id];
      return next;
    });
    void removeVote(verdict.id);
  };

  // Write the track transform directly to the DOM so live dragging never
  // triggers a React re-render (smooth on low-end mobile). `dragPx` is the
  // finger offset on top of the resting position for the current index.
  const paintTrack = (dragPx: number, animate: boolean) => {
    const track = reelTrackRef.current;
    if (!track) return;
    track.style.transition = animate
      ? `transform ${VERDICT_REEL_TRANSITION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
      : "none";
    track.style.transform = `translate3d(0, calc(${
      -activeReelIndexRef.current * 100
    }% + ${dragPx}px), 0)`;
  };

  const refreshLatestVerdicts = () => {
    if (loading || loadingMore || refreshingLatest) {
      paintTrack(0, true);
      setRefreshPullProgress(0);
      return;
    }
    activeReelIndexRef.current = 0;
    setActiveReelIndex(0);
    setSessionVotedIds(new Set());
    paintTrack(0, true);
    setRefreshPullProgress(1);
    setRefreshingLatest(true);
    void loadVerdicts(scope, { reset: true, topic }).finally(() => {
      window.setTimeout(() => {
        setRefreshingLatest(false);
        setRefreshPullProgress(0);
      }, 260);
    });
  };

  const settleReel = (direction: 1 | -1 | 0) => {
    const next = Math.min(
      maxReelIndex,
      Math.max(0, activeReelIndexRef.current + direction),
    );
    activeReelIndexRef.current = next;
    paintTrack(0, true);
    setActiveReelIndex(next);
  };

  const handleReelTouchStart = (event: TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    draggingRef.current = true;
    axisLockRef.current = "none";
    touchStartYRef.current = touch.clientY;
    touchStartXRef.current = touch.clientX;
    lastTouchYRef.current = touch.clientY;
    lastTouchTimeRef.current = event.timeStamp;
    velocityRef.current = 0;
    setRefreshPullProgress(0);
  };

  const handleReelTouchMove = (event: TouchEvent<HTMLElement>) => {
    if (!draggingRef.current) return;
    const touch = event.touches[0];
    const startY = touchStartYRef.current;
    const startX = touchStartXRef.current;
    if (!touch || startY === null || startX === null) return;

    const totalDeltaY = touch.clientY - startY;
    const totalDeltaX = touch.clientX - startX;

    // Decide gesture axis once, after a small movement, to avoid jitter.
    if (axisLockRef.current === "none") {
      if (Math.abs(totalDeltaY) < 6 && Math.abs(totalDeltaX) < 6) return;
      axisLockRef.current =
        Math.abs(totalDeltaX) > Math.abs(totalDeltaY)
          ? "horizontal"
          : "vertical";
    }
    if (axisLockRef.current === "horizontal") return;

    // Track instantaneous velocity for flick detection.
    const dt = event.timeStamp - lastTouchTimeRef.current;
    if (dt > 0) {
      velocityRef.current = (touch.clientY - lastTouchYRef.current) / dt;
    }
    lastTouchYRef.current = touch.clientY;
    lastTouchTimeRef.current = event.timeStamp;

    let dragPx = totalDeltaY;
    const atFirst = activeReelIndexRef.current === 0 && dragPx > 0;
    const atLast = activeReelIndexRef.current === maxReelIndex && dragPx < 0;
    if (atFirst || atLast) {
      dragPx *= VERDICT_REEL_EDGE_RESISTANCE; // rubber-band at the edges
      setRefreshPullProgress(Math.min(1, Math.abs(dragPx) / 46));
    } else {
      setRefreshPullProgress(0);
    }
    paintTrack(dragPx, false);
  };

  const handleReelTouchEnd = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const wasVertical = axisLockRef.current === "vertical";
    axisLockRef.current = "none";
    const startY = touchStartYRef.current;
    touchStartYRef.current = null;
    touchStartXRef.current = null;
    if (!wasVertical || startY === null) {
      paintTrack(0, true);
      setRefreshPullProgress(0);
      return;
    }

    const totalDeltaY = lastTouchYRef.current - startY;
    const velocity = velocityRef.current; // px/ms, negative = upward
    const flicked = Math.abs(velocity) > VERDICT_REEL_VELOCITY_THRESHOLD;
    const dragged = Math.abs(totalDeltaY) > VERDICT_REEL_DISTANCE_THRESHOLD_PX;

    if (flicked || dragged) {
      // up (negative delta / velocity) => advance to next card
      const upward = (flicked ? velocity : totalDeltaY) < 0;
      const atLast = activeReelIndexRef.current === maxReelIndex;
      const atFirst = activeReelIndexRef.current === 0;
      if (!upward && atFirst) {
        refreshLatestVerdicts();
        return;
      }
      if (upward && atLast) {
        settleReel(0);
        setRefreshPullProgress(0);
        return;
      }
      settleReel(upward ? 1 : -1);
    } else {
      settleReel(0); // snap back
      setRefreshPullProgress(0);
    }
  };

  const handleReelWheel = (event: WheelEvent<HTMLElement>) => {
    const verticalDelta = Math.abs(event.deltaY);
    const horizontalDelta = Math.abs(event.deltaX);
    if (verticalDelta < 4 || horizontalDelta > verticalDelta) return;

    event.preventDefault();
    // Accumulate small trackpad deltas so one gesture advances exactly one card.
    wheelAccumRef.current += event.deltaY;
    if (wheelResetTimerRef.current) clearTimeout(wheelResetTimerRef.current);
    wheelResetTimerRef.current = setTimeout(() => {
      wheelAccumRef.current = 0;
    }, 180);

    if (Math.abs(wheelAccumRef.current) < 28) return;
    const direction = wheelAccumRef.current > 0 ? 1 : -1;
    if (direction === -1 && activeReelIndexRef.current === 0) {
      refreshLatestVerdicts();
    } else if (direction === 1 && activeReelIndexRef.current === maxReelIndex) {
      settleReel(0);
    } else {
      settleReel(direction);
    }
    setRefreshPullProgress(0);
    wheelAccumRef.current = 0;
  };
  const reelTopPadding = "pt-[calc(var(--safe-area-top)+78px)]";
  const reelBottomPadding =
    "pb-[calc(var(--bottom-nav-total-height,82px)+28px)]";
  const reelSectionClass = `flex h-full min-h-full snap-start snap-always items-stretch justify-center overflow-hidden ${reelTopPadding} ${reelBottomPadding}`;

  return (
    <div className="screen-container pop-verdicts-screen relative overflow-hidden bg-[#050705] text-white">
      <style>{`
        @keyframes verdictButtonPulseOne {
          0% {
            box-shadow: 0 0 0 0 rgba(255,255,255,0), inset 0 1px 0 rgba(255,255,255,0.08);
            opacity: 0.78;
          }
          15% {
            box-shadow: 0 0 22px 6px rgba(255,255,255,0.16), inset 0 1px 0 rgba(255,255,255,0.14);
            opacity: 1;
          }
          35%, 100% {
            box-shadow: 0 0 0 0 rgba(255,255,255,0), inset 0 1px 0 rgba(255,255,255,0.08);
            opacity: 0.78;
          }
        }
        @keyframes verdictButtonPulseTwo {
          0%, 55% {
            box-shadow: 0 0 0 0 rgba(255,255,255,0), inset 0 1px 0 rgba(255,255,255,0.08);
            opacity: 0.78;
          }
          70% {
            box-shadow: 0 0 22px 6px rgba(255,255,255,0.16), inset 0 1px 0 rgba(255,255,255,0.14);
            opacity: 1;
          }
          88%, 100% {
            box-shadow: 0 0 0 0 rgba(255,255,255,0), inset 0 1px 0 rgba(255,255,255,0.08);
            opacity: 0.78;
          }
        }
        @keyframes verdictVoteCommit {
          0% { opacity: 0; transform: translate3d(0, 8px, 0) scale(0.96); }
          55% { opacity: 1; transform: translate3d(0, -1px, 0) scale(1.01); }
          100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }
        @keyframes verdictVoteUndo {
          0% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
          48% { opacity: 0.78; transform: translate3d(0, 3px, 0) scale(0.97); }
          100% { opacity: 0; transform: translate3d(0, 10px, 0) scale(0.94); }
        }
        .verdict-vote-option,
        .verdict-vote-confirm { transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1); }
        .verdict-vote-sheen {
          opacity: 0.36;
          background: radial-gradient(circle at 50% 0%, rgba(255,255,255,0.20), transparent 58%);
        }
        .verdict-vote-option-one {
          animation: verdictButtonPulseOne 6s ease-in-out infinite;
        }
        .verdict-vote-option-one .verdict-vote-sheen,
        .verdict-vote-confirm-one .verdict-vote-sheen {
          background: radial-gradient(circle at 50% 0%, rgba(255,255,255,0.18), transparent 58%);
        }
        .verdict-vote-option-two {
          animation: verdictButtonPulseTwo 6s ease-in-out infinite;
        }
        .verdict-vote-option-two .verdict-vote-sheen,
        .verdict-vote-confirm-two .verdict-vote-sheen {
          background: radial-gradient(circle at 50% 0%, rgba(255,255,255,0.18), transparent 58%);
        }
        .verdict-vote-confirm { animation: verdictVoteCommit 440ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        @media (prefers-reduced-motion: reduce) {
          .verdict-vote-option, .verdict-vote-confirm { animation: none !important; }
        }
      `}</style>
      <div className="pop-verdicts-bg pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-14%,rgba(255,255,255,0.075),transparent_34%),radial-gradient(circle_at_12%_20%,rgba(255,255,255,0.035),transparent_28%),linear-gradient(180deg,#070707_0%,#0b0b0b_52%,#030303_100%)]" />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-[calc(var(--safe-area-top)+8px)]">
        <div className="pointer-events-auto mx-auto max-w-2xl">
          <div className="relative">
            <div className="flex gap-2">
              <div className="pop-verdicts-toggle grid min-w-0 flex-1 grid-cols-2 rounded-full border border-white/10 bg-black/46 p-1 shadow-[0_18px_44px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.07),inset_0_-1px_0_rgba(255,255,255,0.03)] backdrop-blur-xl">
                {[
                  {
                    id: "friends" as VerdictScope,
                    label: "Friends",
                    icon: Users,
                  },
                  {
                    id: "topics" as VerdictScope,
                    label: "Topics",
                    icon: Globe2,
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  const active = scope === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setScope(item.id);
                        setTopicMenuOpen(false);
                      }}
                      className={`flex min-h-[44px] items-center justify-center gap-2 rounded-full text-[14px] font-black transition-all ${
                        active
                          ? "bg-white text-black shadow-[0_14px_30px_rgba(255,255,255,0.16),inset_0_1px_0_rgba(255,255,255,0.72)]"
                          : "text-white/48 hover:text-white/72"
                      }`}
                    >
                      <Icon size={16} />
                      {item.label}
                    </button>
                  );
                })}
              </div>

              {scope === "topics" && (
                <button
                  type="button"
                  onClick={() => setTopicMenuOpen((open) => !open)}
                  className={`pop-verdicts-filter flex h-[52px] min-w-[52px] items-center justify-center rounded-full border text-white/72 shadow-[0_18px_44px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-xl transition-all ${
                    topicMenuOpen
                      ? "border-white/18 bg-white/[0.08]"
                      : "border-white/10 bg-black/46 hover:text-white"
                  }`}
                  aria-label={`Filter topic: ${topic}`}
                >
                  <Filter size={18} />
                </button>
              )}
            </div>

            {scope === "topics" && topicMenuOpen && (
              <div className="pop-verdicts-dropdown absolute right-0 top-[58px] w-full max-w-[420px] rounded-[24px] border border-white/10 bg-[#070707]/94 p-3 shadow-[0_26px_70px_rgba(0,0,0,0.56),inset_0_1px_0_rgba(255,255,255,0.07),inset_0_-1px_0_rgba(255,255,255,0.03)] backdrop-blur-2xl">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-[11px] font-black uppercase tracking-[0.16em] text-white/62">
                    Topic filter
                  </span>
                  <span className="max-w-[150px] truncate text-[12px] font-black text-white/54">
                    {topic}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {TOPICS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setTopic(item);
                        setTopicMenuOpen(false);
                      }}
                      className={`min-h-[38px] rounded-full border px-3 text-[12px] font-black transition-all ${
                        topic === item
                          ? "border-white/22 bg-white/[0.12] text-white shadow-[0_12px_28px_rgba(255,255,255,0.08)]"
                          : "border-white/8 bg-white/[0.045] text-white/48 hover:text-white/72"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-area-top)+72px)] z-20 flex justify-center transition-all duration-300"
        style={{
          opacity: refreshingLatest ? 1 : refreshPullProgress,
          transform: `translateY(${
            refreshingLatest ? 0 : -8 + refreshPullProgress * 8
          }px) scale(${refreshingLatest ? 1 : 0.9 + refreshPullProgress * 0.1})`,
        }}
        aria-hidden="true"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-black/56 text-white/76 shadow-[0_16px_38px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
          <RefreshCw
            size={18}
            strokeWidth={2.4}
            className={refreshingLatest ? "animate-spin" : ""}
            style={{
              transform: refreshingLatest
                ? undefined
                : `rotate(${refreshPullProgress * 180}deg)`,
            }}
          />
        </div>
      </div>

      <main
        ref={reelViewportRef}
        onTouchStart={handleReelTouchStart}
        onTouchMove={handleReelTouchMove}
        onTouchEnd={handleReelTouchEnd}
        onTouchCancel={handleReelTouchEnd}
        onWheel={handleReelWheel}
        className="verdicts-reel relative z-10 flex-1 overflow-hidden px-2"
        style={{
          touchAction: "pan-y",
          overscrollBehaviorY: "contain",
        }}
      >
        <div
          ref={reelTrackRef}
          className="mx-auto h-full max-w-2xl will-change-transform"
          style={{
            transform: `translate3d(0, -${activeReelIndex * 100}%, 0)`,
          }}
        >
          {loading && activeItems.length === 0 && reelItems.length === 0 ? (
            [1, 2, 3].map((item) => (
              <section key={item} className={reelSectionClass}>
                <div className="h-full w-full animate-pulse rounded-[28px] border border-white/8 bg-white/[0.035]" />
              </section>
            ))
          ) : reelItems.length === 0 ? (
            <section className={reelSectionClass}>
              <div className="w-full rounded-[28px] border border-white/10 bg-white/[0.04] px-5 py-12 text-center">
                <Sparkles className="mx-auto mb-4 text-white/70" size={30} />
                <h2 className="m-0 text-[22px] font-black">No verdicts yet</h2>
                <p className="mx-auto mt-2 max-w-xs text-sm font-semibold leading-relaxed text-white/45">
                  Start one from the plus button and give everyone something to
                  choose.
                </p>
              </div>
            </section>
          ) : (
            <>
              {reelItems.map((verdict) => (
                <section key={verdict.id} className={reelSectionClass}>
                  <VerdictCard
                    verdict={verdict}
                    onVote={(choice) => handleVote(verdict, choice)}
                    onUndoVote={() => handleRemoveVote(verdict)}
                    onOpen={() => openDetail(verdict)}
                    onOpenVoters={() => openVoterResults(verdict)}
                  />
                </section>
              ))}

              {showEndPanel && (
                <section className={reelSectionClass}>
                  <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.92),rgba(5,5,5,0.98))] px-6 text-center shadow-[0_24px_70px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.055)]">
                    <div className="pointer-events-none absolute inset-x-10 top-1/2 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.38),transparent)]" />
                    <div className="relative z-[1] flex max-w-[320px] flex-col items-center">
                      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-white/12 bg-white/[0.055] text-white/76 shadow-[0_18px_42px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.08)]">
                        <Sparkles size={22} />
                      </div>
                      <p className="m-0 text-[11px] font-black uppercase tracking-[0.18em] text-white/38">
                        You are caught up
                      </p>
                      <h2 className="m-0 mt-2 text-[26px] font-black leading-[1.02] text-white">
                        Post a verdict for the room
                      </h2>
                      <p className="m-0 mt-3 text-[14px] font-semibold leading-relaxed text-white/48">
                        The feed needs your next hot take. Ask friends to choose and watch the votes roll in.
                      </p>
                    </div>
                  </div>
                </section>
              )}
            </>
          )}

          {showLoadingPanel && (
            <section className={reelSectionClass}>
              <div className="flex h-full w-full items-center justify-center rounded-[28px] border border-white/8 bg-white/[0.035] text-sm font-black text-white/42">
                Loading more verdicts...
              </div>
            </section>
          )}
        </div>
      </main>

      {selectedFresh && (
        <VerdictThreadScreen
          verdict={selectedFresh}
          comments={commentsByVerdictId[selectedFresh.id] || []}
          loading={Boolean(commentLoadingById[selectedFresh.id])}
          hasMoreComments={Boolean(
            commentsHasMoreByVerdictId[selectedFresh.id],
          )}
          onClose={() => setSelected(null)}
          onSendComment={(text, parentId) => {
            return addComment(selectedFresh.id, text, parentId);
          }}
          onLoadMoreComments={() => {
            void loadComments(selectedFresh.id, { append: true });
          }}
        />
      )}

      {voterModalVerdict && (
        <VerdictVotersModal
          verdict={voterModalVerdict}
          voters={
            votersByVerdictId[voterModalVerdict.id] ||
            voterModalVerdict.voter_preview
          }
          loading={Boolean(votersLoadingById[voterModalVerdict.id])}
          onClose={() => setVoterModalVerdictId(null)}
        />
      )}
    </div>
  );
}
