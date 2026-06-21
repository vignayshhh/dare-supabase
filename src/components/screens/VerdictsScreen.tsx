"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TouchEvent, WheelEvent } from "react";
import {
  ArrowLeft,
  Send,
  Sparkles,
  Users,
  Globe2,
  Filter,
} from "lucide-react";
import { Avatar } from "../ui/Avatar";
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
    description: "Sale ends tonight. The wallet is scared. The outfit is ready.",
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
    my_vote: null,
    created_at: new Date(Date.now() - 1000 * 60 * 132).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 132).toISOString(),
  },
];

function percent(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
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
      className="relative mx-3 block min-h-0 flex-1 overflow-hidden rounded-[26px] border border-white/10 bg-[radial-gradient(circle_at_24%_18%,rgba(74,222,128,0.24),transparent_28%),radial-gradient(circle_at_78%_22%,rgba(56,189,248,0.16),transparent_30%),linear-gradient(145deg,#081008,#020403)] text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_rgba(0,0,0,0.4)]"
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
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/78 to-transparent" />
      <div className="absolute bottom-3 left-3 right-3">
        <div className="inline-flex max-w-full rounded-full border border-white/14 bg-black/50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.13em] text-white/76 backdrop-blur-md">
          Tap for comments
        </div>
      </div>
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
    accent: "#4ade80",
    idleBg:
      "radial-gradient(circle at 18% 0%,rgba(134,239,172,0.28),transparent 60%),linear-gradient(150deg,rgba(74,222,128,0.20),rgba(34,197,94,0.06))",
    fill: "linear-gradient(90deg,rgba(74,222,128,0.55),rgba(34,197,94,0.14))",
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
  const leading =
    verdict.choice_one_votes === verdict.choice_two_votes
      ? null
      : verdict.choice_one_votes > verdict.choice_two_votes
        ? "one"
        : "two";

  return (
    <div className="relative grid grid-cols-2 gap-3">
      {VERDICT_SIDES.map((side) => {
        const active = verdict.my_vote === side.choice;
        const isWinner = voted && leading === side.choice;
        const label =
          side.choice === "one"
            ? verdict.choice_one_text
            : verdict.choice_two_text;
        const pct = side.choice === "one" ? onePct : twoPct;
        const votes =
          side.choice === "one"
            ? verdict.choice_one_votes
            : verdict.choice_two_votes;
        const isGreen = side.choice === "one";

        return (
          <button
            key={side.choice}
            type="button"
            onClick={() => onVote(side.choice)}
            className={`verdict-choice relative flex min-h-[72px] flex-col justify-between overflow-hidden rounded-[18px] border p-2.5 text-left transition-transform duration-200 active:scale-[0.94] ${
              isWinner ? "verdict-winner" : ""
            }`}
            style={{
              background: isGreen
                ? "linear-gradient(158deg,#0e1f14,#060a07)"
                : "linear-gradient(158deg,#1f0e12,#0a0506)",
              borderColor: active ? side.accent : `${side.accent}38`,
              boxShadow: active
                ? `0 0 0 1px ${side.accent}, 0 16px 36px ${side.accent}40, inset 0 1px 0 rgba(255,255,255,0.14)`
                : `inset 0 1px 0 rgba(255,255,255,0.06), 0 12px 28px ${side.accent}18`,
              ["--verdict-accent" as string]: side.accent,
            }}
          >
            {/* radial color blob */}
            <span
              className="pointer-events-none absolute inset-0 rounded-[18px]"
              style={{
                background: isGreen
                  ? "radial-gradient(circle at 22% 10%, rgba(74,222,128,0.30), transparent 60%)"
                  : "radial-gradient(circle at 78% 10%, rgba(251,113,133,0.30), transparent 60%)",
              }}
            />

            {/* top shimmer edge */}
            <span
              className="pointer-events-none absolute inset-x-4 top-0 h-px"
              style={{
                background: `linear-gradient(90deg,transparent,${side.accent}b0,transparent)`,
              }}
            />

            {/* liquid fill after vote */}
            {voted && (
              <span
                className="pointer-events-none absolute inset-y-0 rounded-[18px] transition-[width] duration-700 ease-out"
                style={{
                  width: `${pct}%`,
                  background: side.fill,
                  ...(side.align === "left" ? { left: 0 } : { right: 0 }),
                }}
              />
            )}

            {/* corner glow circle */}
            <span
              className="pointer-events-none absolute bottom-0 h-16 w-16 rounded-full"
              style={{
                background: `${side.accent}0e`,
                ...(isGreen ? { right: "-8px", bottom: "-8px" } : { left: "-8px", bottom: "-8px" }),
              }}
            />

            {/* top row: micro label + SVG icon */}
            <div className="relative z-10 flex items-center justify-between">
              <span
                className="text-[8px] font-black uppercase tracking-[.16em]"
                style={{ color: side.accent, opacity: active ? 1 : 0.65 }}
              >
                {isGreen ? "VOTE A" : "VOTE B"}
                {active && " ✓"}
              </span>
              <span style={{ color: side.accent, opacity: 0.5 }}>
                {isGreen ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9z" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                )}
              </span>
            </div>

            {/* bottom: choice label + percent or vote count */}
            <div className="relative z-10">
              <p
                className="truncate font-black leading-none text-white transition-[font-size] duration-300"
                style={{ fontSize: voted ? "13px" : "15px" }}
              >
                {label}
              </p>
              {voted ? (
                <p
                  className="mt-0.5 text-[17px] font-black leading-none tabular-nums"
                  style={{ color: side.accent }}
                >
                  {pct}%
                </p>
              ) : (
                <p className="mt-1 text-[9px] font-bold tabular-nums text-white/28">
                  {votes.toLocaleString()} votes
                </p>
              )}
            </div>
          </button>
        );
      })}
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
        const isGreen = side.choice === "one";

        return (
          <button
            key={side.choice}
            type="button"
            onClick={() => onVote(side.choice)}
            className={`verdict-choice relative flex min-h-[84px] flex-col justify-between overflow-hidden rounded-[20px] border p-3 text-left transition-transform active:scale-[0.96] ${
              isWinner ? "verdict-winner" : ""
            }`}
            style={{
              background: isGreen
                ? "linear-gradient(158deg,#0e1f14,#060a07)"
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
                background: isGreen
                  ? "radial-gradient(circle at 22% 10%, rgba(74,222,128,0.30), transparent 60%)"
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
                ...(isGreen
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
                {isGreen ? "VOTE A" : "VOTE B"}
                {active && " ✓"}
              </span>
              <span style={{ color: side.accent, opacity: 0.5 }}>
                {isGreen ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9z" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

function VerdictCard({
  verdict,
  onVote,
  onOpen,
}: {
  verdict: VerdictDTO;
  onVote: (choice: VerdictChoice) => void;
  onOpen: () => void;
}) {
  return (
    <article className="pop-verdict-card flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(19,25,21,0.95),rgba(6,9,7,0.98))] shadow-[0_24px_70px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="flex shrink-0 items-center gap-3 px-4 py-3">
        <Avatar
          src={verdict.author.avatar_url}
          alt={verdict.author.display_name || verdict.author.username}
          userId={verdict.author.id}
          username={verdict.author.username}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-black text-white">
            {verdict.author.display_name || verdict.author.username}
          </div>
          <div className="truncate text-[12px] font-bold text-white/38">
            @{verdict.author.username.replace(/^@/, "")} · {timeAgo(verdict.created_at)}
          </div>
        </div>
      </div>

      <MediaBlock verdict={verdict} onOpen={onOpen} />

      <div className="shrink-0 p-4">
        <h2 className="m-0 line-clamp-2 text-center text-[21px] font-black leading-tight tracking-[-0.03em] text-white">
          {verdict.question}
        </h2>
        <div className="mt-2 flex items-center justify-center gap-2 text-[12px] font-bold text-white/42">
          <span className="tabular-nums">
            {verdict.total_votes.toLocaleString()} votes
          </span>
          <span className="h-1 w-1 rounded-full bg-white/25" />
          <span className="tabular-nums">
            {verdict.comments_count.toLocaleString()} comments
          </span>
        </div>
        <div className="mt-3.5">
          <VerdictButtons verdict={verdict} onVote={onVote} />
        </div>
      </div>
    </article>
  );
}

function CommentItem({
  comment,
  replies,
  onReply,
}: {
  comment: VerdictCommentDTO;
  replies: VerdictCommentDTO[];
  onReply: (comment: VerdictCommentDTO) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-3">
        <Avatar
          src={comment.author.avatar_url}
          alt={comment.author.display_name || comment.author.username}
          userId={comment.user_id}
          username={comment.author.username}
          size="sm"
        />
        <div className="min-w-0 flex-1 rounded-[18px] border border-white/8 bg-white/[0.04] px-3 py-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="truncate text-[13px] font-black text-white">
              {comment.author.display_name || comment.author.username}
            </span>
            <span className="shrink-0 text-[11px] font-bold text-white/30">
              {timeAgo(comment.created_at)}
            </span>
          </div>
          <p className="m-0 text-[14px] font-medium leading-relaxed text-white/76">
            {comment.text}
          </p>
          <button
            type="button"
            onClick={() => onReply(comment)}
            className="mt-2 text-[12px] font-black uppercase tracking-[0.12em] text-[#86efac]"
          >
            Reply
          </button>
        </div>
      </div>
      {replies.length > 0 && (
        <div className="ml-10 space-y-2 border-l border-white/8 pl-3">
          {replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              replies={[]}
              onReply={onReply}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VerdictDetail({
  verdict,
  comments,
  loading,
  hasMoreComments,
  onClose,
  onVote,
  onSendComment,
  onLoadMoreComments,
}: {
  verdict: VerdictDTO;
  comments: VerdictCommentDTO[];
  loading: boolean;
  hasMoreComments: boolean;
  onClose: () => void;
  onVote: (choice: VerdictChoice) => void;
  onSendComment: (text: string, parentId?: string | null) => Promise<void>;
  onLoadMoreComments: () => void;
}) {
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<VerdictCommentDTO | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const roots = comments.filter((comment) => !comment.parent_id);
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

  return (
    <div className="fixed inset-0 z-[10000] bg-[#050705] text-white">
      <div className="sticky top-0 z-20 bg-[#050705]/92 px-4 pb-2 pt-[calc(var(--safe-area-top)+10px)] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/80"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="sr-only">
            <div className="text-[18px] font-black">Verdict room</div>
            <div className="truncate text-[12px] font-bold text-white/38">
              {verdict.total_votes} votes · {verdict.comments_count} comments
            </div>
          </div>
        </div>
      </div>

      <div className="h-[calc(100dvh-var(--safe-area-top)-64px)] overflow-y-auto px-4 pb-[calc(28px+var(--safe-area-bottom))] pt-2">
        <div className="mx-auto max-w-2xl space-y-4">
          <section className="pop-verdict-card rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(19,25,21,0.92),rgba(6,9,7,0.98))] p-4 shadow-[0_20px_58px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.05)]">
            <h1 className="m-0 text-center text-[26px] font-black leading-tight tracking-[-0.03em]">
              {verdict.question}
            </h1>
            <div className="mt-4 overflow-hidden rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_24%_18%,rgba(74,222,128,0.24),transparent_28%),radial-gradient(circle_at_78%_22%,rgba(56,189,248,0.16),transparent_30%),linear-gradient(145deg,#081008,#020403)]">
              {verdict.media_type === "VIDEO" ? (
                <video
                  src={verdict.media_url}
                  controls
                  playsInline
                  className="max-h-[42dvh] w-full bg-black object-contain"
                />
              ) : (
                <img
                  src={verdict.media_url}
                  alt={verdict.question}
                  className="max-h-[42dvh] w-full bg-black object-contain"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              )}
            </div>
            {verdict.description && (
              <p className="mx-auto mt-4 max-w-xl whitespace-pre-line text-[15px] font-semibold leading-relaxed text-white/68">
                {verdict.description}
              </p>
            )}
            <div className="mt-5">
              <VerdictResultsSplit verdict={verdict} onVote={onVote} />
            </div>
          </section>

          <section className="rounded-[26px] border border-white/10 bg-white/[0.035] p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="m-0 text-[18px] font-black">Comments</h2>
              <span className="text-[12px] font-bold text-white/38">
                {verdict.comments_count.toLocaleString()}
              </span>
            </div>
            {loading ? (
              <div className="py-8 text-center text-sm font-bold text-white/40">
                Loading comments...
              </div>
            ) : roots.length === 0 ? (
              <div className="py-8 text-center text-sm font-bold text-white/40">
                Be the first to start the argument.
              </div>
            ) : (
              <div className="space-y-4">
                {roots.map((comment) => (
                  <CommentItem
                    key={comment.id}
                    comment={comment}
                    replies={repliesByParent[comment.id] || []}
                    onReply={setReplyTo}
                  />
                ))}
                {hasMoreComments && (
                  <button
                    type="button"
                    onClick={onLoadMoreComments}
                    disabled={loading}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-[13px] font-black uppercase tracking-[0.12em] text-[#86efac] transition-colors hover:bg-white/[0.07] disabled:opacity-45"
                  >
                    Load more comments
                  </button>
                )}
              </div>
            )}

            <div className="mt-5 border-t border-white/8 pt-4">
              <div className="mb-2 text-[12px] font-black uppercase tracking-[0.14em] text-[#86efac]">
                Leave a comment
              </div>
              {replyTo && (
                <div className="mb-2 flex items-center justify-between rounded-full border border-[#4ade80]/18 bg-[#4ade80]/10 px-3 py-1.5 text-[12px] font-bold text-[#86efac]">
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
                  className="min-w-0 flex-1 rounded-[18px] border border-white/14 bg-white/[0.075] px-4 py-3 text-[15px] font-semibold text-white outline-none placeholder:text-white/34 focus:border-[#4ade80]/45 focus:bg-white/[0.095]"
                />
                <button
                  type="submit"
                  disabled={!text.trim() || submitting}
                  className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[#4ade80] text-black disabled:opacity-40"
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

export function VerdictsScreen({ isActive = true }: { isActive?: boolean }) {
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
    loadComments,
    addComment,
  } = useVerdictsStore();
  const [scope, setScope] = useState<VerdictScope>("friends");
  const [topic, setTopic] = useState("Memes");
  const [selected, setSelected] = useState<VerdictDTO | null>(null);
  const [topicMenuOpen, setTopicMenuOpen] = useState(false);
  const activeItems = scope === "friends" ? friends : topics;
  const reelItems = activeItems;
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
  const maxReelIndex = Math.max(0, reelItems.length - 1);

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
    setActiveReelIndex(0);
  }, [scope, topic]);

  useEffect(() => {
    setActiveReelIndex((current) => Math.min(current, maxReelIndex));
  }, [maxReelIndex]);

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
    return [...friends, ...topics].find((item) => item.id === selected.id) || selected;
  }, [friends, selected, topics]);

  const openDetail = (verdict: VerdictDTO) => {
    setSelected(verdict);
    if (!verdict.id.startsWith("mock-verdict-")) {
      void loadComments(verdict.id);
    }
  };

  const handleVote = (verdict: VerdictDTO, choice: VerdictChoice) => {
    void vote(verdict.id, choice);
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
        Math.abs(totalDeltaX) > Math.abs(totalDeltaY) ? "horizontal" : "vertical";
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
      return;
    }

    const totalDeltaY = lastTouchYRef.current - startY;
    const velocity = velocityRef.current; // px/ms, negative = upward
    const flicked = Math.abs(velocity) > VERDICT_REEL_VELOCITY_THRESHOLD;
    const dragged = Math.abs(totalDeltaY) > VERDICT_REEL_DISTANCE_THRESHOLD_PX;

    if (flicked || dragged) {
      // up (negative delta / velocity) => advance to next card
      const upward = (flicked ? velocity : totalDeltaY) < 0;
      settleReel(upward ? 1 : -1);
    } else {
      settleReel(0); // snap back
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
    settleReel(wheelAccumRef.current > 0 ? 1 : -1);
    wheelAccumRef.current = 0;
  };
  const reelTopPadding = "pt-[calc(var(--safe-area-top)+78px)]";
  const reelBottomPadding =
    "pb-[calc(var(--bottom-nav-total-height,82px)+28px)]";
  const reelSectionClass = `flex h-full min-h-full snap-start snap-always items-stretch justify-center overflow-hidden ${reelTopPadding} ${reelBottomPadding}`;

  return (
    <div className="screen-container pop-verdicts-screen relative overflow-hidden bg-[#050705] text-white">
      <style>{`
        @keyframes verdictWinnerGlow {
          0%, 100% {
            box-shadow: 0 0 0 1px var(--verdict-accent),
              0 10px 30px color-mix(in srgb, var(--verdict-accent) 22%, transparent),
              inset 0 1px 0 rgba(255,255,255,0.1);
          }
          50% {
            box-shadow: 0 0 0 1px var(--verdict-accent),
              0 16px 46px color-mix(in srgb, var(--verdict-accent) 42%, transparent),
              inset 0 1px 0 rgba(255,255,255,0.14);
          }
        }
        .verdict-winner { animation: verdictWinnerGlow 2.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .verdict-winner { animation: none; }
        }
      `}</style>
      <div className="pop-verdicts-bg pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-12%,rgba(74,222,128,0.16),transparent_34%),radial-gradient(circle_at_14%_22%,rgba(56,189,248,0.08),transparent_28%),linear-gradient(180deg,#050705_0%,#081008_52%,#030403_100%)]" />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-[calc(var(--safe-area-top)+8px)]">
        <div className="pointer-events-auto mx-auto max-w-2xl">
          <div className="relative">
            <div className="flex gap-2">
              <div className="pop-verdicts-toggle grid min-w-0 flex-1 grid-cols-2 rounded-full border border-white/10 bg-black/38 p-1 shadow-[0_18px_44px_rgba(0,0,0,0.32),0_0_34px_rgba(74,222,128,0.08),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
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
                          ? "bg-[#4ade80] text-black shadow-[0_14px_30px_rgba(74,222,128,0.2)]"
                          : "text-white/45"
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
                  className={`pop-verdicts-filter flex h-[52px] min-w-[52px] items-center justify-center rounded-full border text-[#86efac] shadow-[0_18px_44px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl transition-all ${
                    topicMenuOpen
                      ? "border-[#4ade80]/36 bg-[#4ade80]/16"
                      : "border-white/10 bg-black/38"
                  }`}
                  aria-label={`Filter topic: ${topic}`}
                >
                  <Filter size={18} />
                </button>
              )}
            </div>

            {scope === "topics" && topicMenuOpen && (
              <div className="pop-verdicts-dropdown absolute right-0 top-[58px] w-full max-w-[420px] rounded-[24px] border border-white/10 bg-[#050805]/94 p-3 shadow-[0_26px_70px_rgba(0,0,0,0.52),0_0_42px_rgba(74,222,128,0.1),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#86efac]">
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
                          ? "border-[#4ade80]/42 bg-[#4ade80]/18 text-[#bbf7d0] shadow-[0_12px_28px_rgba(74,222,128,0.12)]"
                          : "border-white/8 bg-white/[0.045] text-white/48"
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
              <section
                key={item}
                className={reelSectionClass}
              >
                <div className="h-full w-full animate-pulse rounded-[28px] border border-white/8 bg-white/[0.035]" />
              </section>
            ))
          ) : reelItems.length === 0 ? (
            <section className={reelSectionClass}>
              <div className="w-full rounded-[28px] border border-white/10 bg-white/[0.04] px-5 py-12 text-center">
                <Sparkles className="mx-auto mb-4 text-[#86efac]" size={30} />
                <h2 className="m-0 text-[22px] font-black">No verdicts yet</h2>
                <p className="mx-auto mt-2 max-w-xs text-sm font-semibold leading-relaxed text-white/45">
                  Start one from the plus button and give everyone something to choose.
                </p>
              </div>
            </section>
          ) : (
            reelItems.map((verdict) => (
              <section
                key={verdict.id}
                className={reelSectionClass}
              >
                <VerdictCard
                  verdict={verdict}
                  onVote={(choice) => handleVote(verdict, choice)}
                  onOpen={() => openDetail(verdict)}
                />
              </section>
            ))
          )}

          {activeItems.length > 0 && loadingMore && (
            <section className={reelSectionClass}>
              <div className="flex h-full w-full items-center justify-center rounded-[28px] border border-white/8 bg-white/[0.035] text-sm font-black text-white/42">
                Loading more verdicts...
              </div>
            </section>
          )}
        </div>
      </main>

      {selectedFresh && (
        <VerdictDetail
          verdict={selectedFresh}
          comments={commentsByVerdictId[selectedFresh.id] || []}
          loading={Boolean(commentLoadingById[selectedFresh.id])}
          hasMoreComments={Boolean(commentsHasMoreByVerdictId[selectedFresh.id])}
          onClose={() => setSelected(null)}
          onVote={(choice) => handleVote(selectedFresh, choice)}
          onSendComment={(text, parentId) => {
            return addComment(selectedFresh.id, text, parentId);
          }}
          onLoadMoreComments={() => {
            void loadComments(selectedFresh.id, { append: true });
          }}
        />
      )}
    </div>
  );
}
