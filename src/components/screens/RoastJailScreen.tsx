"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Send, Share2, Sparkles, Trophy, Users, X } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore-v2";
import { Avatar } from "../ui/Avatar";

/* ────────────────────────────────────────────────────────────
   Roast Room — a live circle event.
   Other players are mocked; the current user's side is real.
   3 prisoners cycle (mock → mock → you), then highlights.
   Visual-only (no audio), all state client-side.
──────────────────────────────────────────────────────────── */

const PALETTE = ["#4ade80", "#38bdf8", "#fb7185", "#facc15", "#c084fc"];
const ANIMALS = ["🐧", "🦝", "🦈", "🐸", "🦊", "🐼", "🦉", "🐙", "🐯", "🦄", "🐺", "🐨", "🦅"];

type Member = {
  id: string;
  name: string;
  username: string;
  colorSeed: number;
  avatarUrl?: string;
  isMe?: boolean;
};

const MOCK_MEMBERS: Member[] = [
  { id: "m-rahul", name: "Rahul", username: "rahul", colorSeed: 0 },
  { id: "m-priya", name: "Priya", username: "priya_k", colorSeed: 1 },
  { id: "m-arjun", name: "Arjun", username: "arjunnn", colorSeed: 2 },
  { id: "m-sana", name: "Sana", username: "sanavibes", colorSeed: 3 },
  { id: "m-dev", name: "Dev", username: "devdev", colorSeed: 4 },
  { id: "m-meera", name: "Meera", username: "meeraa", colorSeed: 0 },
  { id: "m-kabir", name: "Kabir", username: "kabir01", colorSeed: 1 },
  { id: "m-zoya", name: "Zoya", username: "zoya", colorSeed: 2 },
  { id: "m-ishan", name: "Ishan", username: "ishan_x", colorSeed: 3 },
  { id: "m-tara", name: "Tara", username: "taraaa", colorSeed: 4 },
  { id: "m-veer", name: "Veer", username: "veer", colorSeed: 0 },
  { id: "m-nina", name: "Nina", username: "ninaa", colorSeed: 1 },
  { id: "m-omar", name: "Omar", username: "omar_g", colorSeed: 2 },
];

const CRIMES = [
  "Being Late Since Birth",
  "Main Character Syndrome",
  "Eating Everyone's Snacks",
  "Replying 'k' To Paragraphs",
  "Lurking In Every Group Chat",
  "Owning 0 Reusable Bags",
  "Screenshotting Everything",
];

type ModeKey = "roast" | "title" | "compliment" | "prediction" | "darren";

type VoteCategory = { key: string; label: string; emoji: string };

type Mode = {
  key: ModeKey;
  emoji: string;
  label: string;
  prompt: (name: string) => string;
  placeholder: string;
  categories: VoteCategory[];
  pool: string[];
};

const MODES: Record<ModeKey, Mode> = {
  roast: {
    key: "roast",
    emoji: "😂",
    label: "Roast Round",
    prompt: (n) => `Roast ${n}.`,
    placeholder: "Drop your best one-liner…",
    categories: [
      { key: "funniest", label: "Funniest", emoji: "🏆" },
      { key: "deadliest", label: "Deadliest", emoji: "💀" },
      { key: "accurate", label: "Most Accurate", emoji: "🎯" },
    ],
    pool: [
      "Bro's alarm clock resigned.",
      "Most likely to miss his own wedding.",
      "Walks in late like the plot needed him.",
      "His personality is just 'low battery'.",
      "Texts back in 3-5 business days.",
      "Confidence of a final boss, skills of a tutorial.",
      "Brings the vibe and then immediately leaves it.",
    ],
  },
  title: {
    key: "title",
    emoji: "🏷️",
    label: "Title Round",
    prompt: (n) => `Give ${n} a title.`,
    placeholder: "Crown them with a legendary title…",
    categories: [{ key: "best", label: "Best Title", emoji: "🏆" }],
    pool: [
      "The Human Snooze Button",
      "CEO of Last Minute",
      "Chief Vibe Saboteur",
      "Director of Unread Messages",
      "Lord of the Left-On-Read",
      "The Snack Bandit",
      "Ambassador of 'I'm Almost There'",
    ],
  },
  compliment: {
    key: "compliment",
    emoji: "❤️",
    label: "Compliment Ambush",
    prompt: (n) => `Say something ${n} doesn't realize people appreciate.`,
    placeholder: "Say the kind thing out loud…",
    categories: [{ key: "heartfelt", label: "Most Heartfelt", emoji: "❤️" }],
    pool: [
      "You're always there when someone's down, no questions asked.",
      "You make the quiet people feel included.",
      "You hype everyone's wins like they're your own.",
      "You remember the small stuff nobody else does.",
      "The group chat is just better when you're in it.",
      "You make new people feel like old friends instantly.",
    ],
  },
  prediction: {
    key: "prediction",
    emoji: "🔮",
    label: "Prediction Round",
    prompt: (n) => `Predict ${n}'s future.`,
    placeholder: "Call their future right now…",
    categories: [{ key: "likely", label: "Most Likely", emoji: "🏆" }],
    pool: [
      "Will name a child after a Wi-Fi network.",
      "Becomes a millionaire, still asks to split the bill.",
      "Marries someone they met in a comment section.",
      "Will be late to the apocalypse.",
      "Starts 6 side hustles, finishes the group chat.",
    ],
  },
  darren: {
    key: "darren",
    emoji: "🤖",
    label: "Darren Round",
    prompt: (n) => `Darren says: describe ${n} as a weather forecast.`,
    placeholder: "Answer Darren's prompt…",
    categories: [{ key: "best", label: "Best Answer", emoji: "🏆" }],
    pool: [
      "Mostly cloudy with a 100% chance of drama.",
      "Sunny, but emotionally overcast by 6pm.",
      "Cold mornings, chaotic evenings, no umbrella.",
    ],
  },
};

type RoundConfig = {
  prisonerId: string;
  mode: ModeKey;
  crime: string;
  anonymous: boolean;
};

// 3 rounds: mock → mock(anonymous) → you
const ROUND_PLAN: RoundConfig[] = [
  { prisonerId: "m-rahul", mode: "roast", crime: CRIMES[0], anonymous: false },
  { prisonerId: "m-priya", mode: "prediction", crime: CRIMES[2], anonymous: true },
  { prisonerId: "__me__", mode: "compliment", crime: CRIMES[4], anonymous: false },
];

const REACTION_EMOJIS = ["😂", "💀", "🔥", "🤡", "🚔"];
const SUBMISSION_SECONDS = 40;
const LOBBY_SECONDS = 30;

type Submission = {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  isMe: boolean;
  reactions: number;
};

type FloatReaction = { id: number; emoji: string; left: number; dur: number };

type RoundResult = {
  roundIndex: number;
  prisonerName: string;
  mode: ModeKey;
  topText: string;
  topAuthor: string;
  topVotes: number;
  totalReactions: number;
  anonymous: boolean;
};

type SubPhase = "arrest" | "crime" | "submission" | "reveal" | "voting" | "release";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/* ── Cartoon stickman held in place by two opposing chains ── */
function JailStickman({
  member,
  color,
  released,
}: {
  member: Member;
  color: string;
  released: boolean;
}) {
  return (
    <div
      className={`roast-stickman relative flex w-[72px] flex-col items-center ${
        released ? "roast-stickman--free" : ""
      }`}
    >
      <div className="roast-stickman-inner relative flex flex-col items-center">
        <div
          className="relative rounded-full p-[2.5px] shadow-[0_14px_26px_rgba(0,0,0,0.42)]"
          style={{ background: `linear-gradient(135deg,${color},rgba(255,255,255,0.3))` }}
        >
          <Avatar
            src={member.avatarUrl}
            alt={member.name}
            fallbackText={member.name.charAt(0)}
            size={48}
            userId={member.isMe ? member.id : undefined}
            username={member.username}
            disableRealtime
          />
        </div>
        <div className="relative mt-[-2px] h-[58px] w-[58px]">
          <span className="absolute left-1/2 top-0 h-[32px] w-[4px] -translate-x-1/2 rounded-full bg-white/80" />
          <span className="roast-arm-left absolute left-[8px] top-[10px] h-[4px] w-[22px] origin-right rotate-[-32deg] rounded-full bg-white/72" />
          <span className="roast-arm-right absolute right-[8px] top-[10px] h-[4px] w-[22px] origin-left rotate-[32deg] rounded-full bg-white/72" />
          <span className="roast-leg-left absolute bottom-[2px] left-[18px] h-[4px] w-[24px] origin-left rotate-[58deg] rounded-full bg-white/72" />
          <span className="roast-leg-right absolute bottom-[2px] right-[18px] h-[4px] w-[24px] origin-right rotate-[-58deg] rounded-full bg-white/72" />
        </div>
      </div>
    </div>
  );
}

function RoastChain({ side }: { side: "left" | "right" }) {
  return (
    <div
      aria-hidden="true"
      className={`roast-chain roast-chain--${side} pointer-events-none absolute top-[116px] flex w-[calc(50%_-_34px)] items-center gap-0 ${
        side === "left" ? "left-0 justify-end" : "right-0 justify-start"
      }`}
    >
      {Array.from({ length: 9 }).map((_, index) => (
        <span
          key={index}
          className="roast-chain-link shrink-0"
          style={{ ["--link" as any]: index }}
        />
      ))}
    </div>
  );
}

function RoastRoomRig({
  prisoner,
  prisonerColor,
  released,
}: {
  prisoner: Member;
  prisonerColor: string;
  released: boolean;
}) {
  return (
    <div className="roast-room-rig relative mx-[-20px] mt-4 flex h-[230px] items-end justify-center overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-[114px] h-px bg-white/[0.04]" />
      <RoastChain side="left" />
      <RoastChain side="right" />
      <div className="relative z-10 mb-5 flex flex-col items-center">
        <JailStickman member={prisoner} color={prisonerColor} released={released} />
        <p className="mt-1 text-[15px] font-black text-white">
          {prisoner.name}
        </p>
      </div>
    </div>
  );
}

export function RoastJailScreen({ onClose }: { onClose: () => void }) {
  const { user } = useAuthStore();

  const me: Member = useMemo(
    () => ({
      id: user?.id || "__me__",
      name: (user as any)?.displayName || (user as any)?.username || "Vignesh",
      username: ((user as any)?.username || "vignesh").replace(/^@/, ""),
      colorSeed: 4,
      avatarUrl: (user as any)?.avatarUrl || (user as any)?.avatar_url || "",
      isMe: true,
    }),
    [user],
  );

  // Full circle: mocks + me (14 total).
  const members: Member[] = useMemo(() => [...MOCK_MEMBERS, me], [me]);
  const memberById = useMemo(() => {
    const map = new Map<string, Member>();
    members.forEach((m) => map.set(m.id, m));
    map.set("__me__", me);
    return map;
  }, [members, me]);

  const [phase, setPhase] = useState<"lobby" | "round" | "results">("lobby");
  const [roundIndex, setRoundIndex] = useState(0);
  const [subPhase, setSubPhase] = useState<SubPhase>("arrest");

  // lobby
  const [joined, setJoined] = useState(6);
  const [lobbyLeft, setLobbyLeft] = useState(LOBBY_SECONDS);

  // submission
  const [secondsLeft, setSecondsLeft] = useState(SUBMISSION_SECONDS);
  const [myText, setMyText] = useState("");
  const [mySubmitted, setMySubmitted] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0);

  // reveal / voting
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [revealCount, setRevealCount] = useState(0);
  const [votes, setVotes] = useState<Record<string, string>>({}); // categoryKey -> submissionId
  const [voteTally, setVoteTally] = useState<Record<string, number>>({}); // submissionId -> count

  // reactions
  const [floats, setFloats] = useState<FloatReaction[]>([]);
  const floatId = useRef(0);

  const [results, setResults] = useState<RoundResult[]>([]);
  const [copied, setCopied] = useState(false);

  // Render via portal to document.body so the overlay escapes the
  // transformed/contain:paint `.app-screen-layer` ancestor (which otherwise
  // traps `position: fixed` + z-index inside the feed tab, letting the
  // bottom nav paint over it and breaking interaction).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const round = ROUND_PLAN[roundIndex];
  const mode = MODES[round.mode];
  const prisoner = memberById.get(round.prisonerId) || me;
  const prisonerColor = PALETTE[prisoner.colorSeed % PALETTE.length];
  const prisonerIsMe = prisoner.id === me.id || round.prisonerId === "__me__";
  const submitters = useMemo(
    () => members.filter((m) => m.id !== prisoner.id),
    [members, prisoner.id],
  );
  const totalSubmitters = submitters.length;

  const spawnReaction = useCallback((emoji: string) => {
    floatId.current += 1;
    const id = floatId.current;
    setFloats((prev) => [
      ...prev.slice(-24),
      { id, emoji, left: 8 + Math.random() * 84, dur: 1.6 + Math.random() * 1.2 },
    ]);
    window.setTimeout(() => {
      setFloats((prev) => prev.filter((f) => f.id !== id));
    }, 3000);
  }, []);

  const startRound = useCallback((index: number) => {
    setRoundIndex(index);
    setSubPhase("arrest");
    setMyText("");
    setMySubmitted(false);
    setSubmittedCount(0);
    setSecondsLeft(SUBMISSION_SECONDS);
    setSubmissions([]);
    setRevealCount(0);
    setVotes({});
    setVoteTally({});
    setFloats([]);
    setPhase("round");
  }, []);

  /* ── Lobby: members join + countdown (value-driven) ── */
  useEffect(() => {
    if (phase !== "lobby") return;
    const join = window.setInterval(() => {
      setJoined((j) => (j < members.length ? j + 1 : j));
    }, 900);
    const tick = window.setInterval(() => {
      setLobbyLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => {
      window.clearInterval(join);
      window.clearInterval(tick);
    };
  }, [phase, members.length]);

  useEffect(() => {
    if (phase === "lobby" && lobbyLeft <= 0) startRound(0);
  }, [phase, lobbyLeft, startRound]);

  /* ── arrest → crime → submission auto-advance ── */
  useEffect(() => {
    if (phase !== "round") return;
    if (subPhase === "arrest") {
      const t = window.setTimeout(() => setSubPhase("crime"), 1900);
      return () => window.clearTimeout(t);
    }
    if (subPhase === "crime") {
      const t = window.setTimeout(() => setSubPhase("submission"), 2200);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [phase, subPhase]);

  /* ── submission: mock members auto-submit on staggered timers ── */
  useEffect(() => {
    if (phase !== "round" || subPhase !== "submission") return;
    const mockSubmitters = submitters.filter((m) => !m.isMe);
    const timers = mockSubmitters.map(() =>
      window.setTimeout(
        () => setSubmittedCount((c) => c + 1),
        700 + Math.random() * (SUBMISSION_SECONDS * 1000 - 6000),
      ),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [phase, subPhase, roundIndex, submitters]);

  /* ── submission: countdown tick ── */
  useEffect(() => {
    if (phase !== "round" || subPhase !== "submission") return;
    const tick = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(tick);
  }, [phase, subPhase, roundIndex]);

  /* ── submission: auto-advance to reveal when time runs out ── */
  useEffect(() => {
    if (phase === "round" && subPhase === "submission" && secondsLeft <= 0) {
      goToReveal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, subPhase, secondsLeft]);

  const buildSubmissions = useCallback((): Submission[] => {
    const pool = shuffle(mode.pool);
    const mockOnes = submitters
      .filter((m) => !m.isMe)
      .map((m, i) => ({
        id: `sub-${roundIndex}-${m.id}`,
        authorId: m.id,
        authorName: m.name,
        text: pool[i % pool.length],
        isMe: false,
        reactions: Math.floor(Math.random() * 9),
      }));
    const mine: Submission[] = mySubmitted
      ? [
          {
            id: `sub-${roundIndex}-me`,
            authorId: me.id,
            authorName: me.name,
            text: myText.trim() || pool[0],
            isMe: true,
            reactions: 0,
          },
        ]
      : [];
    return shuffle([...mockOnes, ...mine]);
  }, [mode.pool, submitters, roundIndex, mySubmitted, myText, me]);

  const goToReveal = useCallback(() => {
    const built = buildSubmissions();
    setSubmissions(built);
    setSubPhase("reveal");
    setRevealCount(0);
    // seed mock votes so tallies feel alive
    const seedTally: Record<string, number> = {};
    built.forEach((s) => {
      seedTally[s.id] = Math.floor(Math.random() * 5);
    });
    setVoteTally(seedTally);
  }, [buildSubmissions]);

  const handleSubmitMine = () => {
    if (mySubmitted || !myText.trim()) return;
    setMySubmitted(true);
    setSubmittedCount((c) => c + 1);
  };

  /* ── reveal: stagger cards in + ambient reactions ── */
  useEffect(() => {
    if (phase !== "round" || subPhase !== "reveal") return;
    const stagger = window.setInterval(() => {
      setRevealCount((c) => {
        if (c >= submissions.length) {
          window.clearInterval(stagger);
          return c;
        }
        return c + 1;
      });
    }, 520);
    const ambient = window.setInterval(() => {
      spawnReaction(REACTION_EMOJIS[Math.floor(Math.random() * REACTION_EMOJIS.length)]);
    }, 850);
    return () => {
      window.clearInterval(stagger);
      window.clearInterval(ambient);
    };
  }, [phase, subPhase, submissions.length, spawnReaction]);

  const castVote = (categoryKey: string, submissionId: string) => {
    setVotes((prev) => {
      const previous = prev[categoryKey];
      if (previous === submissionId) return prev;
      setVoteTally((tally) => {
        const next = { ...tally };
        if (previous) next[previous] = Math.max(0, (next[previous] || 0) - 1);
        next[submissionId] = (next[submissionId] || 0) + 1;
        return next;
      });
      return { ...prev, [categoryKey]: submissionId };
    });
  };

  const finishRound = () => {
    // record highlight from this round
    const ranked = [...submissions].sort(
      (a, b) => (voteTally[b.id] || 0) - (voteTally[a.id] || 0),
    );
    const top = ranked[0];
    const totalReactions = submissions.reduce((sum, s) => sum + s.reactions, 0) + floats.length;
    setResults((prev) => [
      ...prev,
      {
        roundIndex,
        prisonerName: prisoner.name,
        mode: round.mode,
        topText: top?.text || "—",
        topAuthor: round.anonymous ? "Anonymous" : top?.authorName || "—",
        topVotes: top ? voteTally[top.id] || 0 : 0,
        totalReactions,
        anonymous: round.anonymous,
      },
    ]);
    setSubPhase("release");
  };

  /* ── release: confetti, then next round or results ── */
  useEffect(() => {
    if (phase !== "round" || subPhase !== "release") return;
    const t = window.setTimeout(() => {
      if (roundIndex + 1 < ROUND_PLAN.length) {
        startRound(roundIndex + 1);
      } else {
        setPhase("results");
      }
    }, 3200);
    return () => window.clearTimeout(t);
  }, [phase, subPhase, roundIndex, startRound]);

  const mostFun = useMemo(
    () => [...results].sort((a, b) => b.topVotes - a.topVotes)[0],
    [results],
  );
  const mostReacted = useMemo(
    () => [...results].sort((a, b) => b.totalReactions - a.totalReactions)[0],
    [results],
  );

  const handleShare = async () => {
    const text = mostFun
      ? `🚔 Roast Room highlight — "${mostFun.topText}" (${mostFun.topVotes} votes) 😂`
      : "🚔 Roast Room was chaos.";
    try {
      if (navigator.share) {
        await navigator.share({ title: "Roast Room", text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* user dismissed share sheet */
    }
  };

  const anonLabelFor = (s: Submission, idx: number) =>
    round.anonymous ? `${ANIMALS[idx % ANIMALS.length]} Anonymous` : s.authorName;

  const overlay = (
    <div className="fixed inset-0 z-[12000] bg-[#030403] text-white">
      <RoastStyles />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-12%,rgba(74,222,128,0.16),transparent_36%),radial-gradient(circle_at_14%_16%,rgba(56,189,248,0.12),transparent_30%),radial-gradient(circle_at_88%_22%,rgba(251,113,133,0.1),transparent_30%),linear-gradient(180deg,#070907_0%,#0a0f0b_48%,#030403_100%)]" />

      {/* floating reactions overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
        style={{ pointerEvents: "none" }}
      >
        {floats.map((f) => (
          <span
            key={f.id}
            className="roast-float pointer-events-none absolute bottom-[18%] text-[28px]"
            style={{ left: `${f.left}%`, animationDuration: `${f.dur}s`, pointerEvents: "none" }}
          >
            {f.emoji}
          </span>
        ))}
      </div>

      <div className="relative z-10 flex h-full flex-col">
        {/* header */}
        <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-[calc(var(--safe-area-top)+12px)]">
          <button
            type="button"
            onClick={onClose}
            aria-label="Leave Roast Room"
            className="app-pressable flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] border border-white/8 bg-white/[0.045] text-[#cbd5e1] shadow-[0_16px_38px_rgba(0,0,0,0.3)]"
          >
            <ChevronLeft size={23} />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#bbf7d0]">
              🚔 Roast Room
            </div>
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] border border-white/8 bg-white/[0.045] text-[#94a3b8]">
            <span className="text-[11px] font-black">
              {phase === "results" ? "END" : `${Math.min(roundIndex + 1, ROUND_PLAN.length)}/${ROUND_PLAN.length}`}
            </span>
          </div>
        </header>

        {phase === "lobby" && (
          <LobbyView
            joined={joined}
            total={members.length}
            secondsLeft={lobbyLeft}
            onStart={() => startRound(0)}
          />
        )}

        {phase === "round" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-[calc(var(--safe-area-bottom)+20px)]">
            {/* Roast Room: the prisoner is pulled from both sides by the circle. */}
            <section className="roast-panel relative mt-1 overflow-hidden rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,22,18,0.96),rgba(7,9,8,0.98))] p-5 shadow-[0_28px_70px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="pointer-events-none absolute left-1/2 top-6 h-44 w-44 -translate-x-1/2 rounded-full bg-[#4ade80]/8 blur-3xl" />

              <p className="text-center text-[10px] font-black uppercase tracking-[0.24em] text-[#94a3b8]">
                {subPhase === "arrest"
                  ? "⚡ New Round"
                  : subPhase === "release"
                    ? "✨ Round Complete"
                    : `${mode.emoji} ${mode.label}`}
              </p>

              <RoastRoomRig
                prisoner={prisoner}
                prisonerColor={prisonerColor}
                released={subPhase === "release"}
              />

              {/* timer / status */}
              <div className="mt-4 flex items-center justify-center">
                {subPhase === "submission" ? (
                  <div className="roast-timer flex items-center gap-2 rounded-full border border-[#4ade80]/25 bg-[#4ade80]/10 px-5 py-2">
                    <span className="text-[20px] font-black tabular-nums text-white">
                      {fmtClock(secondsLeft)}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#86efac]">
                      remaining
                    </span>
                  </div>
                ) : subPhase === "release" ? (
                  <p className="text-[15px] font-black text-[#bbf7d0]">
                    {prisoner.name} is free 🎉
                  </p>
                ) : (
                  <div className="rounded-full border border-white/8 bg-black/25 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-[#cbd5e1]">
                    Crime: {round.crime}
                  </div>
                )}
              </div>
            </section>

            {/* phase body */}
            {subPhase === "crime" && (
              <CrimeBanner crime={round.crime} mode={mode} prisonerName={prisonerIsMe ? me.name : prisoner.name} />
            )}

            {subPhase === "submission" && (
              <SubmissionPanel
                mode={mode}
                prisonerName={prisonerIsMe ? me.name : prisoner.name}
                myText={myText}
                setMyText={setMyText}
                mySubmitted={mySubmitted}
                onSubmit={handleSubmitMine}
                submittedCount={Math.min(submittedCount, totalSubmitters)}
                total={totalSubmitters}
                onReveal={goToReveal}
              />
            )}

            {(subPhase === "reveal" || subPhase === "voting") && (
              <RevealVoting
                submissions={submissions}
                revealCount={subPhase === "voting" ? submissions.length : revealCount}
                mode={mode}
                anonymous={round.anonymous}
                anonLabelFor={anonLabelFor}
                subPhase={subPhase}
                votes={votes}
                voteTally={voteTally}
                onVote={castVote}
                onSpawnReaction={spawnReaction}
                onStartVoting={() => setSubPhase("voting")}
                onFinish={finishRound}
                roundLabel={`Round ${roundIndex + 1} of ${ROUND_PLAN.length}`}
              />
            )}

            {subPhase === "release" && (
              <ReleaseOverlay
                prisonerName={prisoner.name}
                nextName={
                  roundIndex + 1 < ROUND_PLAN.length
                    ? (memberById.get(ROUND_PLAN[roundIndex + 1].prisonerId)?.name ?? "Next")
                    : null
                }
              />
            )}
          </div>
        )}

        {phase === "results" && (
          <ResultsView
            mostFun={mostFun}
            mostReacted={mostReacted}
            results={results}
            onShare={handleShare}
            copied={copied}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}

/* ────────────────────────── sub-views ────────────────────────── */

function LobbyView({
  joined,
  total,
  secondsLeft,
  onStart,
}: {
  joined: number;
  total: number;
  secondsLeft: number;
  onStart: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 pb-[calc(var(--safe-area-bottom)+24px)]">
      <div className="roast-panel relative w-full max-w-[360px] overflow-hidden rounded-[34px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,22,18,0.96),rgba(7,9,8,0.98))] p-7 text-center shadow-[0_30px_80px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(74,222,128,0.8),transparent)]" />
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-[26px] border border-[#4ade80]/25 bg-[#4ade80]/10 text-[40px]">
          🚔
        </div>
        <h1 className="text-[30px] font-black leading-none tracking-tight text-white">Roast Room</h1>
        <p className="mx-auto mt-3 max-w-[260px] text-[13px] font-semibold leading-relaxed text-[#9bb1a6]">
          Take turns in the room. Everyone gets <span className="text-white">one</span> submission. Roast, title, predict, hype — then vote the best.
        </p>

        <div className="mt-6 flex items-center justify-center gap-2 text-[#cbd5e1]">
          <Users size={16} className="text-[#4ade80]" />
          <span className="roast-count text-[16px] font-black text-white">{joined}</span>
          <span className="text-[13px] font-bold text-[#94a3b8]">/ {total} joined</span>
        </div>

        <div className="mt-5 rounded-[22px] border border-white/8 bg-black/25 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#94a3b8]">Starting in</p>
          <p className="mt-1 text-[34px] font-black tabular-nums leading-none text-white">
            {fmtClock(secondsLeft)}
          </p>
        </div>

        <button
          type="button"
          onClick={onStart}
          className="app-pressable mt-6 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-[16px] font-black text-black shadow-[0_18px_40px_rgba(74,222,128,0.3)]"
        >
          <Sparkles size={18} /> Start now
        </button>
      </div>
    </div>
  );
}

function CrimeBanner({
  crime,
  mode,
  prisonerName,
}: {
  crime: string;
  mode: Mode;
  prisonerName: string;
}) {
  return (
    <section className="roast-panel mt-3 rounded-[28px] border border-white/8 bg-[linear-gradient(145deg,rgba(251,113,133,0.1),rgba(255,255,255,0.04)_55%),linear-gradient(180deg,rgba(16,20,17,0.96),rgba(7,9,8,0.98))] p-5 text-center shadow-[0_18px_52px_rgba(0,0,0,0.34)]">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#fb7185]">Crime</p>
      <p className="mt-2 text-[24px] font-black leading-tight text-white">{crime}</p>
      <p className="mt-3 text-[13px] font-semibold text-[#9bb1a6]">
        {mode.emoji} Get ready — {mode.prompt(prisonerName).toLowerCase()}
      </p>
    </section>
  );
}

function SubmissionPanel({
  mode,
  prisonerName,
  myText,
  setMyText,
  mySubmitted,
  onSubmit,
  submittedCount,
  total,
  onReveal,
}: {
  mode: Mode;
  prisonerName: string;
  myText: string;
  setMyText: (v: string) => void;
  mySubmitted: boolean;
  onSubmit: () => void;
  submittedCount: number;
  total: number;
  onReveal: () => void;
}) {
  const MAX = 120;
  return (
    <section className="roast-panel mt-3 rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(16,20,17,0.96),rgba(7,9,8,0.98))] p-5 shadow-[0_18px_52px_rgba(0,0,0,0.34)]">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#94a3b8]">
        {mode.emoji} Your one submission
      </p>
      <h2 className="mt-1 text-[19px] font-black leading-tight text-white">
        {mode.prompt(prisonerName)}
      </h2>

      {mySubmitted ? (
        <div className="mt-4 flex items-center gap-3 rounded-[20px] border border-[#4ade80]/25 bg-[#4ade80]/10 px-4 py-4">
          <span className="text-[22px]">✅</span>
          <div className="min-w-0">
            <p className="text-[13px] font-black text-[#bbf7d0]">Submitted</p>
            <p className="truncate text-[13px] font-semibold text-[#9bb1a6]">{myText}</p>
          </div>
        </div>
      ) : (
        <>
          <textarea
            value={myText}
            onChange={(e) => setMyText(e.target.value.slice(0, MAX))}
            placeholder={mode.placeholder}
            rows={3}
            className="mt-3 w-full resize-none rounded-[20px] border border-white/10 bg-black/30 px-4 py-3 text-[15px] font-semibold text-white outline-none placeholder:text-[#5b6b60] focus:border-[#4ade80]/40"
          />
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#64748b]">One shot. Make it count.</span>
            <span className="text-[11px] font-bold tabular-nums text-[#64748b]">
              {myText.length}/{MAX}
            </span>
          </div>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!myText.trim()}
            className="app-pressable mt-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-[15px] font-black text-black shadow-[0_16px_36px_rgba(74,222,128,0.28)] disabled:cursor-not-allowed disabled:bg-none disabled:bg-[#161a16] disabled:text-[#64748b] disabled:shadow-none"
          >
            <Send size={16} /> Submit
          </button>
        </>
      )}

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-black uppercase tracking-[0.14em] text-[#94a3b8]">
          <span>Submitted</span>
          <span className="tabular-nums text-white">
            {submittedCount}/{total}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,#4ade80,#22c55e)] transition-all duration-500"
            style={{ width: `${total ? (submittedCount / total) * 100 : 0}%` }}
          />
        </div>
        {mySubmitted && (
          <button
            type="button"
            onClick={onReveal}
            className="app-pressable mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.05] text-[14px] font-black text-white"
          >
            Skip to reveal
          </button>
        )}
      </div>
    </section>
  );
}

function RevealVoting({
  submissions,
  revealCount,
  mode,
  anonymous,
  anonLabelFor,
  subPhase,
  votes,
  voteTally,
  onVote,
  onSpawnReaction,
  onStartVoting,
  onFinish,
  roundLabel,
}: {
  submissions: Submission[];
  revealCount: number;
  mode: Mode;
  anonymous: boolean;
  anonLabelFor: (s: Submission, idx: number) => string;
  subPhase: SubPhase;
  votes: Record<string, string>;
  voteTally: Record<string, number>;
  onVote: (cat: string, subId: string) => void;
  onSpawnReaction: (emoji: string) => void;
  onStartVoting: () => void;
  onFinish: () => void;
  roundLabel: string;
}) {
  const isVoting = subPhase === "voting";
  const [activeCat, setActiveCat] = useState(mode.categories[0].key);
  const allRevealed = revealCount >= submissions.length;

  return (
    <section className="mt-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#94a3b8]">
          {isVoting ? "🗳️ Vote the best" : "Reveal"}
        </p>
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#64748b]">
          {roundLabel}
        </span>
      </div>

      {/* reaction bar */}
      {!isVoting && (
        <div className="mb-3 flex justify-center gap-2">
          {REACTION_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onSpawnReaction(e)}
              className="app-pressable flex h-11 w-11 items-center justify-center rounded-full border border-white/8 bg-white/[0.05] text-[20px] active:scale-90"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {/* category tabs while voting */}
      {isVoting && mode.categories.length > 1 && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {mode.categories.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setActiveCat(c.key)}
              className={`app-pressable shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-black ${
                activeCat === c.key
                  ? "border-[#4ade80]/40 bg-[#4ade80]/15 text-[#bbf7d0]"
                  : "border-white/8 bg-white/[0.04] text-[#94a3b8]"
              }`}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-2.5">
        {submissions.slice(0, revealCount).map((s, idx) => {
          const cat = isVoting
            ? mode.categories.length > 1
              ? activeCat
              : mode.categories[0].key
            : "";
          const voted = isVoting && votes[cat] === s.id;
          return (
            <div
              key={s.id}
              className={`roast-reveal-card relative overflow-hidden rounded-[22px] border p-4 ${
                s.isMe
                  ? "border-[#4ade80]/30 bg-[linear-gradient(145deg,rgba(74,222,128,0.12),rgba(16,20,17,0.96))]"
                  : "border-white/8 bg-[linear-gradient(180deg,rgba(16,20,17,0.96),rgba(7,9,8,0.98))]"
              } ${voted ? "ring-2 ring-[#4ade80]/60" : ""}`}
              style={{ animationDelay: `${idx * 40}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#64748b]">
                    {anonLabelFor(s, idx)}
                    {s.isMe && " (you)"}
                  </p>
                  <p className="mt-1 text-[15px] font-bold leading-snug text-white">{s.text}</p>
                </div>
                {isVoting && (
                  <button
                    type="button"
                    onClick={() => onVote(cat, s.id)}
                    className={`app-pressable flex shrink-0 flex-col items-center justify-center rounded-[16px] border px-3 py-2 ${
                      voted
                        ? "border-[#4ade80]/50 bg-[#4ade80]/20 text-[#bbf7d0]"
                        : "border-white/10 bg-white/[0.05] text-[#cbd5e1]"
                    }`}
                  >
                    <span className="text-[15px] font-black tabular-nums">{voteTally[s.id] || 0}</span>
                    <span className="text-[9px] font-black uppercase tracking-[0.1em]">votes</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* progression CTA */}
      <div className="mt-4">
        {!isVoting ? (
          <button
            type="button"
            onClick={onStartVoting}
            disabled={!allRevealed}
            className="app-pressable flex min-h-[54px] w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-[15px] font-black text-black shadow-[0_16px_36px_rgba(74,222,128,0.28)] disabled:cursor-not-allowed disabled:bg-none disabled:bg-[#161a16] disabled:text-[#64748b] disabled:shadow-none"
          >
            {allRevealed ? "🗳️ Open voting" : "Revealing…"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onFinish}
            className="app-pressable flex min-h-[54px] w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-[15px] font-black text-black shadow-[0_16px_36px_rgba(74,222,128,0.28)]"
          >
            🚔 Lock votes & release
          </button>
        )}
      </div>
    </section>
  );
}

function ReleaseOverlay({
  prisonerName,
  nextName,
}: {
  prisonerName: string;
  nextName: string | null;
}) {
  return (
    <section className="roast-panel relative mt-3 overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(16,20,17,0.96),rgba(7,9,8,0.98))] p-6 text-center shadow-[0_18px_52px_rgba(0,0,0,0.34)]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 18 }).map((_, i) => (
          <span
            key={i}
            className="roast-confetti absolute top-0 h-3 w-1.5 rounded-full"
            style={{
              left: `${(i * 5.5 + 4) % 96}%`,
              background: PALETTE[i % PALETTE.length],
              animationDelay: `${(i % 6) * 0.12}s`,
              animationDuration: `${1.6 + (i % 4) * 0.3}s`,
            }}
          />
        ))}
      </div>
      <p className="relative text-[34px]">🎉</p>
        <p className="relative mt-1 text-[20px] font-black text-white">Round Complete</p>
      <p className="relative mt-1 text-[14px] font-semibold text-[#9bb1a6]">
        {prisonerName} released.
      </p>
      {nextName && (
        <div className="relative mt-4 inline-flex items-center gap-2 rounded-full border border-white/8 bg-black/25 px-4 py-2 text-[12px] font-black uppercase tracking-[0.14em] text-[#cbd5e1]">
          🚔 Next up · {nextName}
        </div>
      )}
    </section>
  );
}

function ResultsView({
  mostFun,
  mostReacted,
  results,
  onShare,
  copied,
  onClose,
}: {
  mostFun?: RoundResult;
  mostReacted?: RoundResult;
  results: RoundResult[];
  onShare: () => void;
  copied: boolean;
  onClose: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-[calc(var(--safe-area-bottom)+24px)] pt-2">
      <div className="roast-panel mb-4 rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,22,18,0.96),rgba(7,9,8,0.98))] p-6 text-center shadow-[0_28px_70px_rgba(0,0,0,0.5)]">
        <p className="text-[34px]">🏁</p>
        <h1 className="mt-1 text-[26px] font-black leading-none text-white">Roast Room Recap</h1>
        <p className="mt-2 text-[13px] font-semibold text-[#9bb1a6]">
          {results.length} rounds of circle lore. Here are tonight's highlights.
        </p>
      </div>

      {mostFun && (
        <HighlightCard
          eyebrow="🏆 Most Fun Moment"
          accent="#facc15"
          text={mostFun.topText}
          meta={`${mostFun.topAuthor} · roasting ${mostFun.prisonerName} · ${mostFun.topVotes} votes`}
        />
      )}
      {mostReacted && (
        <HighlightCard
          eyebrow="🔥 Most Reacted Moment"
          accent="#fb7185"
          text={mostReacted.topText}
          meta={`${mostReacted.prisonerName}'s round · ${mostReacted.totalReactions} reactions`}
        />
      )}

      <div className="mt-2 grid gap-2">
        {results.map((r) => (
          <div
            key={r.roundIndex}
            className="flex items-center justify-between gap-3 rounded-[20px] border border-white/8 bg-white/[0.035] px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#64748b]">
                {MODES[r.mode].emoji} {r.prisonerName}
              </p>
              <p className="truncate text-[13px] font-bold text-white">{r.topText}</p>
            </div>
            <span className="shrink-0 rounded-full border border-white/8 bg-black/25 px-2.5 py-1 text-[11px] font-black tabular-nums text-[#cbd5e1]">
              {r.topVotes} 🏆
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onShare}
        className="app-pressable mt-5 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-[16px] font-black text-black shadow-[0_18px_40px_rgba(74,222,128,0.3)]"
      >
        <Share2 size={18} /> {copied ? "Copied!" : "Share the highlight"}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="app-pressable mt-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.05] text-[15px] font-black text-white"
      >
        <X size={16} /> Leave room
      </button>
    </div>
  );
}

function HighlightCard({
  eyebrow,
  accent,
  text,
  meta,
}: {
  eyebrow: string;
  accent: string;
  text: string;
  meta: string;
}) {
  return (
    <section
      className="roast-panel relative mb-3 overflow-hidden rounded-[26px] border border-white/8 p-5 shadow-[0_18px_52px_rgba(0,0,0,0.34)]"
      style={{
        background: `linear-gradient(145deg,${accent}1f,rgba(255,255,255,0.04)_55%),linear-gradient(180deg,rgba(16,20,17,0.96),rgba(7,9,8,0.98))`,
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full opacity-25 blur-3xl"
        style={{ backgroundColor: accent }}
      />
      <div className="relative flex items-center gap-2">
        <Trophy size={15} style={{ color: accent }} />
        <p className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: accent }}>
          {eyebrow}
        </p>
      </div>
      <p className="relative mt-2 text-[18px] font-black leading-snug text-white">"{text}"</p>
      <p className="relative mt-2 text-[12px] font-semibold text-[#9bb1a6]">{meta}</p>
    </section>
  );
}

/* ────────────────────────── styles ────────────────────────── */
function RoastStyles() {
  return (
    <style>{`
      @keyframes roastFloatIn {
        from { opacity: 0; transform: translateY(14px) scale(0.985); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .roast-panel { animation: roastFloatIn 0.42s cubic-bezier(0.16,1,0.3,1) both; }

      @keyframes roastReveal {
        from { opacity: 0; transform: translateY(18px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .roast-reveal-card { animation: roastReveal 0.4s cubic-bezier(0.16,1,0.3,1) both; }

      @keyframes roastFloatUp {
        0% { opacity: 0; transform: translateY(0) scale(0.7); }
        15% { opacity: 1; }
        100% { opacity: 0; transform: translateY(-220px) scale(1.25); }
      }
      .roast-float { animation-name: roastFloatUp; animation-timing-function: ease-out; animation-fill-mode: forwards; }

      @keyframes roastConfetti {
        0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
        100% { transform: translateY(240px) rotate(420deg); opacity: 0; }
      }
      .roast-confetti { animation-name: roastConfetti; animation-timing-function: ease-in; animation-fill-mode: forwards; }

      @keyframes roastTimerPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(74,222,128,0.0); }
        50% { box-shadow: 0 0 0 6px rgba(74,222,128,0.12); }
      }
      .roast-timer { animation: roastTimerPulse 1.6s ease-in-out infinite; }

      @keyframes roastIdleSway {
        0%, 100% { transform: rotate(-2deg); }
        50% { transform: rotate(2deg); }
      }
      .roast-stickman-inner { animation: roastIdleSway 2.6s ease-in-out infinite; transform-origin: 50% 18%; }

      .roast-room-rig { isolation: isolate; }
      .roast-chain { height: 28px; transform-origin: center; }
      .roast-chain--left { animation: roastChainPullLeft 1.8s ease-in-out infinite; }
      .roast-chain--right { animation: roastChainPullRight 1.8s ease-in-out infinite; }
      .roast-chain-link {
        display: block;
        width: 19px;
        height: 10px;
        margin-left: -4px;
        border: 2px solid #52606d;
        border-radius: 999px;
        background: rgba(15,23,42,0.86);
        box-shadow: 0 1px 2px rgba(0,0,0,0.75), inset 0 1px 1px rgba(255,255,255,0.2);
        transform: rotate(calc(var(--link) * 14deg));
      }
      .roast-chain-link:nth-child(even) { transform: rotate(90deg); }
      .roast-chain--right .roast-chain-link { margin-left: -4px; }
      @keyframes roastChainPullLeft {
        0%, 100% { transform: rotate(8deg) translateX(0); }
        50% { transform: rotate(8deg) translateX(-7px); }
      }
      @keyframes roastChainPullRight {
        0%, 100% { transform: rotate(-8deg) translateX(0); }
        50% { transform: rotate(-8deg) translateX(7px); }
      }
      @keyframes roastFreeJump {
        0% { transform: translateY(0) scale(1); }
        40% { transform: translateY(-26px) scale(1.06); }
        100% { transform: translateY(0) scale(1); }
      }
      .roast-stickman--free .roast-stickman-inner { animation: roastFreeJump 0.7s cubic-bezier(0.16,1,0.3,1) 2; }

      @keyframes roastCount {
        0% { transform: scale(1); }
        40% { transform: scale(1.4); color: #4ade80; }
        100% { transform: scale(1); }
      }
      .roast-count { display: inline-block; animation: roastCount 0.4s ease-out; }

      @media (prefers-reduced-motion: reduce) {
        .roast-panel, .roast-reveal-card, .roast-stickman-inner,
        .roast-timer, .roast-float, .roast-confetti, .roast-count,
        .roast-chain { animation: none !important; }
      }
    `}</style>
  );
}

export default RoastJailScreen;
