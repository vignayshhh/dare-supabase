"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  ArrowUpRight,
  ChevronRight,
  Gavel,
  Heart,
  Search,
  Sparkles,
  TrendingUp,
  UserPlus,
  UserRound,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Avatar } from "../ui/Avatar";
import { useAuthStore } from "@/stores/useAuthStore-v2";
import { useCirclesStore } from "@/stores/useCirclesStore";

/* -------------------------------------------------------------------------- */
/*  Mock data — the Friend Circle is a scrapbook of one group.                */
/*  Other members + media are seeded; the signed-in user slots in as "you".   */
/* -------------------------------------------------------------------------- */

type CircleMember = {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string;
  gradient: string;
  isYou?: boolean;
};

const PRAVATAR = (img: number) => `https://i.pravatar.cc/160?img=${img}`;

const SEED_MEMBERS: CircleMember[] = [
  {
    id: "m-rahul",
    name: "Rahul",
    username: "rahulx",
    gradient: "linear-gradient(135deg,#4ade80,#22c55e)",
    avatarUrl: PRAVATAR(12),
  },
  {
    id: "m-priya",
    name: "Priya",
    username: "priya.k",
    gradient: "linear-gradient(135deg,#fb7185,#f43f5e)",
    avatarUrl: PRAVATAR(45),
  },
  {
    id: "m-arjun",
    name: "Arjun",
    username: "arjun",
    gradient: "linear-gradient(135deg,#38bdf8,#0ea5e9)",
    avatarUrl: PRAVATAR(33),
  },
  {
    id: "m-neha",
    name: "Neha",
    username: "nehaa",
    gradient: "linear-gradient(135deg,#c084fc,#a855f7)",
    avatarUrl: PRAVATAR(47),
  },
  {
    id: "m-sam",
    name: "Sam",
    username: "samm",
    gradient: "linear-gradient(135deg,#facc15,#eab308)",
    avatarUrl: PRAVATAR(68),
  },
  {
    id: "m-isha",
    name: "Isha",
    username: "isha_",
    gradient: "linear-gradient(135deg,#34d399,#10b981)",
    avatarUrl: PRAVATAR(44),
  },
  {
    id: "m-dev",
    name: "Dev",
    username: "devv",
    gradient: "linear-gradient(135deg,#60a5fa,#3b82f6)",
    avatarUrl: PRAVATAR(60),
  },
  {
    id: "m-tara",
    name: "Tara",
    username: "tara.s",
    gradient: "linear-gradient(135deg,#f472b6,#ec4899)",
    avatarUrl: PRAVATAR(49),
  },
];

const CIRCLE = {
  emoji: "🎓",
  name: "College Circle",
  createdLabel: "Created 2 years ago",
  memberCount: 24,
};

const ACTIVITY_GLIMPSES = [
  { icon: Gavel, text: "Court starts in 1 hour", accent: "#38bdf8" },
  { icon: Sparkles, text: "Rahul completed a dare", accent: "#4ade80" },
  { icon: TrendingUp, text: "New prediction created", accent: "#facc15" },
  { icon: Heart, text: "Goa trip photos added", accent: "#fb7185" },
  { icon: Zap, text: "Roast Jail #4 went live", accent: "#c084fc" },
];

// Mock media uses the same hosts the Verdicts screen pulls from
// (images.unsplash.com / i.pravatar.cc) so it passes the app CSP.
// Gradients stay as the base layer = graceful fallback if an image fails.
const UNSPLASH = (id: string, w = 900) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=82`;

type Tile = {
  id: string;
  kind: string; // chip label
  title: string;
  subtitle?: string;
  gradient: string;
  image: string;
  emoji: string;
  accent: string;
  reactions?: number;
};

/* Streaming-style "Dare Highlights of the Week" cards (swipeable).            */
type HighlightCard = {
  id: string;
  kind: string; // chip / genre label
  title: string; // big stylized title
  tagline: string; // small line under the title
  meta: string[]; // dot-separated meta row (year • tag • tag)
  score: string; // badge score, e.g. "8.3"
  gradient: string;
  image: string;
  accent: string;
};

const DARE_HIGHLIGHTS: HighlightCard[] = [
  {
    id: "dh-court-27",
    kind: "Friendship Court",
    title: "Court #27",
    tagline: "Who ruined the Goa trip?",
    meta: ["This week", "Court", "8 jurors"],
    score: "8.3",
    gradient:
      "radial-gradient(circle at 25% 15%,rgba(56,189,248,0.5),transparent 55%),radial-gradient(circle at 85% 80%,rgba(14,165,233,0.4),transparent 50%),linear-gradient(150deg,#0c2433,#08151f)",
    image: UNSPLASH("1521737604893-d14cc237f11d", 1100),
    accent: "#38bdf8",
  },
  {
    id: "dh-roast-4",
    kind: "Roast Jail",
    title: "Roast Jail #4",
    tagline: "Dev got absolutely cooked",
    meta: ["This week", "Roast", "live"],
    score: "9.1",
    gradient:
      "radial-gradient(circle at 30% 20%,rgba(251,113,133,0.5),transparent 55%),linear-gradient(150deg,#260f15,#150a0d)",
    image: UNSPLASH("1514525253161-7a46d19cd819", 1100),
    accent: "#fb7185",
  },
  {
    id: "dh-prediction",
    kind: "Prediction",
    title: "Called It",
    tagline: "Neha's breakup prediction landed",
    meta: ["This week", "Prediction", "67 votes"],
    score: "7.8",
    gradient:
      "radial-gradient(circle at 30% 20%,rgba(250,204,21,0.45),transparent 55%),linear-gradient(150deg,#241f06,#14110a)",
    image: UNSPLASH("1518709268805-4e9042af9f23", 1100),
    accent: "#facc15",
  },
  {
    id: "dh-truth",
    kind: "Truth Night",
    title: "Brutal Truths",
    tagline: "Nobody was safe this round",
    meta: ["This week", "Truth", "12 answers"],
    score: "8.6",
    gradient:
      "radial-gradient(circle at 30% 20%,rgba(192,132,252,0.45),transparent 55%),linear-gradient(150deg,#1c1029,#110a15)",
    image: UNSPLASH("1493225457124-a3eb161ffa5f", 1100),
    accent: "#c084fc",
  },
];

const MEMORY_WEEK: Tile = {
  id: "mem-goa",
  kind: "Trip",
  title: "Goa Trip 2024",
  subtitle: "3 days, 9 of us, zero regrets",
  gradient:
    "radial-gradient(circle at 20% 10%,rgba(251,191,36,0.5),transparent 50%),radial-gradient(circle at 80% 30%,rgba(251,113,133,0.45),transparent 50%),radial-gradient(circle at 50% 95%,rgba(56,189,248,0.42),transparent 55%),linear-gradient(160deg,#241405,#160a14)",
  image: UNSPLASH("1507525428034-b723cf961d3e", 1200),
  emoji: "🏖️",
  accent: "#fb7185",
  reactions: 128,
};

const HIGHLIGHT_MONTH: Tile = {
  id: "hlm-prediction",
  kind: "Prediction",
  title: "Called it",
  subtitle: "Neha's breakup prediction landed",
  gradient:
    "radial-gradient(circle at 30% 20%,rgba(250,204,21,0.45),transparent 55%),linear-gradient(150deg,#241f06,#14110a)",
  image: UNSPLASH("1518709268805-4e9042af9f23", 700),
  emoji: "🔮",
  accent: "#facc15",
  reactions: 67,
};

const MEMORY_MONTH: Tile = {
  id: "memm-bday",
  kind: "Birthday",
  title: "Sam turned 21",
  subtitle: "Surprise cake at midnight",
  gradient:
    "radial-gradient(circle at 70% 20%,rgba(192,132,252,0.5),transparent 55%),linear-gradient(150deg,#1e0f29,#120a16)",
  image: UNSPLASH("1530103862676-de8c9debad1d", 700),
  emoji: "🎂",
  accent: "#c084fc",
  reactions: 94,
};

const RECENT_HIGHLIGHTS: Tile[] = [
  {
    id: "rh-roast",
    kind: "Roast Jail",
    title: "Roast Jail #3",
    gradient:
      "radial-gradient(circle at 30% 20%,rgba(251,113,133,0.5),transparent 55%),linear-gradient(150deg,#260f15,#150a0d)",
    image: UNSPLASH("1514525253161-7a46d19cd819", 500),
    emoji: "🚔",
    accent: "#fb7185",
  },
  {
    id: "rh-truth",
    kind: "Truth",
    title: "Brutal truth night",
    gradient:
      "radial-gradient(circle at 30% 20%,rgba(192,132,252,0.45),transparent 55%),linear-gradient(150deg,#1c1029,#110a15)",
    image: UNSPLASH("1493225457124-a3eb161ffa5f", 500),
    emoji: "🎯",
    accent: "#c084fc",
  },
  {
    id: "rh-darren",
    kind: "Darren",
    title: "Darren roasted Dev",
    gradient:
      "radial-gradient(circle at 30% 20%,rgba(74,222,128,0.45),transparent 55%),linear-gradient(150deg,#0c2417,#0a150e)",
    image: UNSPLASH("1535378917042-10a22c95931a", 500),
    emoji: "🤖",
    accent: "#4ade80",
  },
  {
    id: "rh-court",
    kind: "Court",
    title: "Court #26",
    gradient:
      "radial-gradient(circle at 30% 20%,rgba(56,189,248,0.45),transparent 55%),linear-gradient(150deg,#0c2030,#0a1620)",
    image: UNSPLASH("1503951914875-452162b0f3f1", 500),
    emoji: "⚖️",
    accent: "#38bdf8",
  },
];

const RECENT_MEMORIES: Tile[] = [
  {
    id: "rm-cricket",
    kind: "Match",
    title: "Sunday cricket",
    gradient:
      "radial-gradient(circle at 30% 20%,rgba(74,222,128,0.5),transparent 55%),linear-gradient(150deg,#0e2410,#0b160c)",
    image: UNSPLASH("1531415074968-036ba1b575da", 500),
    emoji: "🏏",
    accent: "#4ade80",
  },
  {
    id: "rm-farewell",
    kind: "Event",
    title: "Farewell night",
    gradient:
      "radial-gradient(circle at 30% 20%,rgba(251,191,36,0.5),transparent 55%),linear-gradient(150deg,#241c05,#15110a)",
    image: UNSPLASH("1489599849927-2ee91cede3ba", 500),
    emoji: "🎓",
    accent: "#facc15",
  },
  {
    id: "rm-roadtrip",
    kind: "Trip",
    title: "Highway road trip",
    gradient:
      "radial-gradient(circle at 30% 20%,rgba(56,189,248,0.5),transparent 55%),linear-gradient(150deg,#0c1e2e,#0a141d)",
    image: UNSPLASH("1502920917128-1aa500764cbd", 500),
    emoji: "🚗",
    accent: "#38bdf8",
  },
  {
    id: "rm-night",
    kind: "Album",
    title: "Night out",
    gradient:
      "radial-gradient(circle at 30% 20%,rgba(251,113,133,0.5),transparent 55%),linear-gradient(150deg,#260f1a,#150a0f)",
    image: UNSPLASH("1492684223066-81342ee5ff30", 500),
    emoji: "🌃",
    accent: "#fb7185",
  },
];

// Memory-of-the-week auto-carousel reuses the existing memory imagery.
const MEMORY_CAROUSEL: Tile[] = [MEMORY_WEEK, ...RECENT_MEMORIES, MEMORY_MONTH];

/* -------------------------------------------------------------------------- */
/*  Small building blocks                                                     */
/* -------------------------------------------------------------------------- */

function MemberBubble({
  member,
  size = 38,
  ring = "#10160f",
}: {
  member: CircleMember;
  size?: number;
  ring?: string;
}) {
  if (member.isYou || member.avatarUrl) {
    return (
      <div
        className="rounded-full"
        style={{ border: `2px solid ${ring}`, background: ring }}
      >
        <Avatar
          src={member.avatarUrl || ""}
          alt={member.name}
          size={size}
          // Real user uses live id; seeded mock members are decorative, so we
          userId={member.isYou ? member.id : undefined}
          username={member.username}
          fallbackText={member.name.charAt(0)}
          disableRealtime={!member.isYou}
        />
      </div>
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-full font-black text-black"
      style={{
        width: size,
        height: size,
        background: member.gradient,
        border: `2px solid ${ring}`,
        fontSize: Math.round(size * 0.4),
      }}
    >
      {member.name.charAt(0)}
    </div>
  );
}

function KindChip({ label, accent }: { label: string; accent: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-1 text-[9.5px] font-black uppercase tracking-[0.14em]"
      style={{
        borderColor: `${accent}45`,
        background: `${accent}1f`,
        color: accent,
      }}
    >
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Members modal                                                             */
/* -------------------------------------------------------------------------- */

function MembersModal({
  members,
  onClose,
}: {
  members: CircleMember[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.username.toLowerCase().includes(q),
    );
  }, [members, query]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      style={{ animation: "circleFade 0.22s ease both" }}
    >
      <div
        className="relative w-full overflow-hidden rounded-t-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,24,20,0.99),rgba(5,8,6,1))] pb-[calc(var(--safe-area-bottom)+16px)] pt-3 shadow-[0_-24px_70px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
        style={{
          animation: "circleSheetUp 0.34s cubic-bezier(0.2,0.9,0.2,1) both",
        }}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/18" />
        <div className="px-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#86efac]">
                {CIRCLE.memberCount} members
              </p>
              <h2 className="mt-0.5 text-[22px] font-black leading-none text-white">
                {CIRCLE.emoji} {CIRCLE.name}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="app-pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/[0.05] text-[#94a3b8]"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mb-3 flex items-center gap-2 rounded-[20px] border border-white/8 bg-black/30 px-3.5 py-2.5">
            <Search size={16} className="shrink-0 text-[#64748b]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search usernames"
              className="w-full bg-transparent text-[14px] font-semibold text-white outline-none placeholder:text-[#64748b]"
            />
          </div>

          <button
            type="button"
            className="app-pressable mb-3 flex w-full items-center gap-3 rounded-[22px] border border-[#4ade80]/22 bg-[#4ade80]/10 px-3.5 py-3 text-left"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-[#4ade80] text-black">
              <UserPlus size={20} />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-black text-white">
                Add members
              </span>
              <span className="block text-[12px] font-semibold text-[#94a3b8]">
                Invite friends into {CIRCLE.name}
              </span>
            </span>
          </button>

          <div className="max-h-[46vh] overflow-y-auto pr-1">
            {filtered.map((m) => (
              <button
                key={m.id}
                type="button"
                className="app-pressable flex w-full items-center gap-3 rounded-[20px] px-2 py-2.5 text-left hover:bg-white/[0.03]"
              >
                <MemberBubble member={m} size={44} ring="#0c120c" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-black text-white">
                    {m.name}{" "}
                    {m.isYou && (
                      <span className="text-[11px] font-bold text-[#86efac]">
                        (You)
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[12px] font-semibold text-[#64748b]">
                    @{m.username}
                  </p>
                </div>
                <ChevronRight size={18} className="shrink-0 text-[#475569]" />
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="py-8 text-center text-[13px] font-semibold text-[#64748b]">
                No members match "{query}"
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main screen                                                               */
/* -------------------------------------------------------------------------- */

export function FriendCircleScreen({
  isActive = true,
  onNavigateToOwnProfile,
}: {
  isActive?: boolean;
  onNavigateToOwnProfile?: () => void;
}) {
  const { user } = useAuthStore();
  const showCirclePicker = useCirclesStore((state) => state.showPicker);
  const [glimpseIndex, setGlimpseIndex] = useState(0);
  const [membersOpen, setMembersOpen] = useState(false);
  const glimpseTimer = useRef<number | null>(null);

  const members = useMemo<CircleMember[]>(() => {
    const you: CircleMember = {
      id: user?.id || "you",
      name: user?.displayName || user?.username || "You",
      username: user?.username || "you",
      avatarUrl: user?.avatar,
      gradient: "linear-gradient(135deg,#4ade80,#22c55e)",
      isYou: true,
    };
    return [you, ...SEED_MEMBERS];
  }, [user]);

  // Rotate the activity glimpse line — only while the tab is visible.
  useEffect(() => {
    if (!isActive) return;
    glimpseTimer.current = window.setInterval(() => {
      setGlimpseIndex((i) => (i + 1) % ACTIVITY_GLIMPSES.length);
    }, 2800);
    return () => {
      if (glimpseTimer.current) window.clearInterval(glimpseTimer.current);
    };
  }, [isActive]);

  const glimpse = ACTIVITY_GLIMPSES[glimpseIndex];
  const GlimpseIcon = glimpse.icon;
  const extraMembers = Math.max(0, CIRCLE.memberCount - members.length);
  const collageMembers = members.slice(0, 6);

  return (
    <div
      className="circle-screen relative min-h-full w-full text-white"
      style={{
        background:
          "linear-gradient(180deg, #141414 0%, #0e0e0e 52%, #0a0a0a 100%)",
        fontFamily:
          "var(--font-ui)",
      }}
    >
      <style>{`
        @keyframes circleFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes circleSheetUp {
          from { opacity: 0; transform: translate3d(0,28px,0) scale(0.99); }
          to { opacity: 1; transform: translate3d(0,0,0) scale(1); }
        }
        @keyframes circleFloatIn {
          from { opacity: 0; transform: translateY(16px) scale(0.985); filter: blur(6px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes circleGlimpseIn {
          0% { opacity: 0; transform: translateY(8px); filter: blur(4px); }
          18% { opacity: 1; transform: translateY(0); filter: blur(0); }
          82% { opacity: 1; transform: translateY(0); filter: blur(0); }
          100% { opacity: 0; transform: translateY(-8px); filter: blur(4px); }
        }
        @keyframes circleSweep {
          0% { transform: translateX(-130%); }
          40% { transform: translateX(130%); }
          100% { transform: translateX(130%); }
        }
        @keyframes circleCollageDrift {
          0%, 100% { transform: scale(1.05) translate(0, 0); }
          50% { transform: scale(1.08) translate(-1.5%, -1.5%); }
        }
        @keyframes circleLiveDot {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.25); }
        }
        .circle-panel { animation: circleFloatIn 0.5s cubic-bezier(0.22,1,0.36,1) both; }
        .circle-shine::after {
          content: ""; position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
          animation: circleSweep 7.5s ease-in-out infinite;
        }
        .circle-collage-bg { animation: circleCollageDrift 16s ease-in-out infinite; }
        .circle-hide-scrollbar::-webkit-scrollbar { display: none; }
        .circle-hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        @media (prefers-reduced-motion: reduce) {
          .circle-panel, .circle-shine::after, .circle-collage-bg { animation: none !important; }
        }
      `}</style>

      <div
        className="relative z-10"
        style={{
          paddingBottom: "calc(var(--safe-area-bottom) + 96px)",
        }}
      >
        {/* ============================ HEADER ============================ */}
        <header className="relative">
          {/* Collage hero */}
          <div className="relative h-[260px] w-full overflow-hidden">
            <div
              className="circle-collage-bg absolute inset-0 grid grid-cols-3 grid-rows-2 gap-[3px] opacity-95"
              aria-hidden="true"
            >
              {[
                {
                  id: "1507525428034-b723cf961d3e",
                  g: "linear-gradient(150deg,#241405,#160a14)",
                },
                {
                  id: "1529156069898-49953e39b3ac",
                  g: "linear-gradient(150deg,#0c2030,#0a1620)",
                },
                {
                  id: "1492684223066-81342ee5ff30",
                  g: "linear-gradient(150deg,#260f15,#150a0d)",
                },
                {
                  id: "1531415074968-036ba1b575da",
                  g: "linear-gradient(150deg,#0e2410,#0b160c)",
                },
                {
                  id: "1530103862676-de8c9debad1d",
                  g: "linear-gradient(150deg,#1e0f29,#120a16)",
                },
                {
                  id: "1504674900247-0877df9cc836",
                  g: "linear-gradient(150deg,#241c05,#15110a)",
                },
              ].map((cell, i) => (
                <div
                  key={i}
                  className="relative overflow-hidden"
                  style={{ background: cell.g }}
                >
                  <img
                    src={UNSPLASH(cell.id, 400)}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
            {/* darken + fade to page */}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,8,8,0.35)_0%,rgba(8,8,8,0.1)_30%,rgba(16,16,16,0.78)_78%,#141414_100%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.05),transparent_55%)]" />

            {/* top actions */}
            <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[calc(var(--safe-area-top)+12px)]">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#bbf7d0] backdrop-blur-xl">
                <span
                  className="h-2 w-2 rounded-full bg-[#4ade80]"
                  style={{ animation: "circleLiveDot 2s ease-in-out infinite" }}
                />
                Circle
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Switch Circle"
                  onClick={() => showCirclePicker(true)}
                  className="app-pressable flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white/85 backdrop-blur-xl shadow-[0_10px_26px_rgba(0,0,0,0.34)]"
                >
                  <ArrowLeftRight size={18} />
                </button>
                <button
                  type="button"
                  aria-label="Open your profile"
                  onClick={onNavigateToOwnProfile}
                  className="app-pressable flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white/85 backdrop-blur-xl shadow-[0_10px_26px_rgba(0,0,0,0.34)]"
                >
                  <UserRound size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Title block overlapping the collage */}
          <div className="relative -mt-14 px-4">
            <div className="circle-panel">
              <h1 className="text-[34px] font-black leading-[1.02] tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
                <span className="mr-1.5">{CIRCLE.emoji}</span>
                {CIRCLE.name}
              </h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] font-bold text-[#94a3b8]">
                <span>{CIRCLE.createdLabel}</span>
                <span className="text-[#475569]">•</span>
                <span className="text-[#cbd5e1]">
                  {CIRCLE.memberCount} members
                </span>
              </p>

              {/* Member avatars row */}
              <button
                type="button"
                onClick={() => setMembersOpen(true)}
                className="app-pressable mt-3.5 flex items-center gap-3"
                aria-label="View members"
              >
                <div className="flex -space-x-2.5">
                  {collageMembers.map((m) => (
                    <MemberBubble key={m.id} member={m} size={38} />
                  ))}
                  {extraMembers > 0 && (
                    <div
                      className="flex items-center justify-center rounded-full border-2 border-[#10160f] bg-[#141a14] text-[12px] font-black text-[#cbd5e1]"
                      style={{ width: 38, height: 38 }}
                    >
                      +{extraMembers}
                    </div>
                  )}
                </div>
              </button>
            </div>
          </div>
        </header>

        {/* ====================== ACTIVITY GLIMPSE ====================== */}
        <div className="px-4 pt-5">
          <div className="circle-panel relative flex h-11 items-center overflow-hidden rounded-full border border-white/8 bg-[linear-gradient(180deg,rgba(16,22,17,0.9),rgba(8,12,9,0.96))] px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div
              key={glimpseIndex}
              className="flex items-center gap-2.5"
              style={{ animation: "circleGlimpseIn 2.8s ease-in-out both" }}
            >
              <GlimpseIcon size={15} style={{ color: glimpse.accent }} />
              <span className="text-[13px] font-bold text-[#e2e8f0]">
                {glimpse.text}
              </span>
            </div>
            {/* progress dots */}
            <div className="ml-auto flex items-center gap-1">
              {ACTIVITY_GLIMPSES.map((_, i) => (
                <span
                  key={i}
                  className="h-1 rounded-full transition-all duration-300"
                  style={{
                    width: i === glimpseIndex ? 14 : 4,
                    background:
                      i === glimpseIndex
                        ? glimpse.accent
                        : "rgba(255,255,255,0.18)",
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ===================== HIGHLIGHT OF THE WEEK ================== */}
        <section className="px-4 pt-6">
          <SectionLabel
            eyebrow="Inside Dare"
            title="Highlights of the Week"
            accent="#38bdf8"
          />
          <HighlightSwiper cards={DARE_HIGHLIGHTS} />
        </section>

        {/* ====================== MEMORY OF THE WEEK =================== */}
        <section className="px-4 pt-1">
          <SectionLabel
            eyebrow="Real life"
            title="Memory of the Week"
            accent="#fb7185"
          />
          <MemoryCarousel tiles={MEMORY_CAROUSEL} height={300} />
        </section>

        {/* ========================= MONTHLY ========================== */}
        <section className="px-4 pt-7">
          <SectionLabel
            eyebrow="The archive"
            title="This Month"
            accent="#facc15"
          />
          <div className="grid grid-cols-2 gap-3">
            <SmallTile
              tile={HIGHLIGHT_MONTH}
              caption="Highlight of the Month"
            />
            <SmallTile tile={MEMORY_MONTH} caption="Memory of the Month" />
          </div>
        </section>

        {/* ======================= EXPLORE MORE ======================= */}
        <section className="pt-7">
          <div className="px-4">
            <SectionLabel
              eyebrow="Relive it"
              title="Recent Highlights"
              accent="#4ade80"
              hint="Courts, predictions, truths, Darren, Roast Jail"
            />
          </div>
          <Carousel tiles={RECENT_HIGHLIGHTS} />
        </section>

        <section className="pt-6">
          <div className="px-4">
            <SectionLabel
              eyebrow="Relive it"
              title="Recent Memories"
              accent="#fb7185"
              hint="Albums, trips, birthdays, events"
            />
          </div>
          <Carousel tiles={RECENT_MEMORIES} />
        </section>

        {/* footer breathing room handled by paddingBottom */}
      </div>

      {membersOpen && (
        <MembersModal members={members} onClose={() => setMembersOpen(false)} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Section + tile primitives                                                 */
/* -------------------------------------------------------------------------- */

function SectionLabel({
  eyebrow,
  title,
  accent,
  hint,
}: {
  eyebrow: string;
  title: string;
  accent: string;
  hint?: string;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <p
          className="text-[10px] font-black uppercase tracking-[0.18em]"
          style={{ color: accent }}
        >
          {eyebrow}
        </p>
        <h2 className="mt-1 text-[21px] font-black leading-none text-white">
          {title}
        </h2>
        {hint && (
          <p className="mt-1.5 text-[11.5px] font-semibold text-[#64748b]">
            {hint}
          </p>
        )}
      </div>
      <button
        type="button"
        className="app-pressable flex shrink-0 items-center gap-1 rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-[11px] font-black text-[#cbd5e1]"
      >
        See all
        <ChevronRight size={13} />
      </button>
    </div>
  );
}

function HighlightSwiper({ cards }: { cards: HighlightCard[] }) {
  const [active, setActive] = useState(0);
  const [drag, setDrag] = useState(0); // live horizontal drag offset (px)
  const startX = useRef<number | null>(null);
  const dragging = useRef(false);
  const n = cards.length;

  const SPREAD = 62; // % of card width each neighbour is shifted = peek size

  const onDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging.current || startX.current === null) return;
    let dx = e.clientX - startX.current;
    // rubber-band at the ends so it never drags into empty space
    if ((active === 0 && dx > 0) || (active === n - 1 && dx < 0)) dx *= 0.35;
    setDrag(dx);
  };
  const onUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const threshold = 50;
    if (drag <= -threshold && active < n - 1) setActive((i) => i + 1);
    else if (drag >= threshold && active > 0) setActive((i) => i - 1);
    setDrag(0);
    startX.current = null;
  };

  return (
    <div className="mt-5 mb-4">
      <div
        className="relative mx-auto w-[90%] max-w-[380px] touch-pan-y select-none"
        style={{ aspectRatio: "5 / 6" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {cards.map((card, i) => {
          const pos = i - active; // 0 = centre, negative = left, positive = right
          const dist = Math.abs(pos);
          const isFront = pos === 0;
          // symmetric peek: neighbours sit to the left AND right of the centre card
          const translateX = `calc(${pos * SPREAD}% + ${drag}px)`;
          const scale = Math.max(1 - dist * 0.1, 0.74);
          const translateY = dist * 14; // slight drop for depth
          const opacity = dist > 2 ? 0 : 1;
          return (
            <div
              key={card.id}
              className="absolute inset-0 overflow-hidden rounded-[30px] border border-white/8 shadow-[0_28px_70px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)]"
              style={{
                transform: `translate3d(${translateX}, ${translateY}px, 0) scale(${scale})`,
                opacity,
                zIndex: n - dist,
                transition: dragging.current
                  ? "none"
                  : "transform 0.45s cubic-bezier(0.22,1,0.36,1), opacity 0.45s ease",
                pointerEvents: isFront ? "auto" : "none",
              }}
            >
              {/* gradient base = fallback if photo fails */}
              <div
                className="absolute inset-0"
                style={{ background: card.gradient }}
              />
              <img
                src={card.image}
                alt={card.title}
                loading="lazy"
                draggable={false}
                className="absolute inset-0 h-full w-full object-cover"
              />
              {/* vignette for text legibility */}
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.18)_0%,transparent_30%,rgba(0,0,0,0.55)_64%,rgba(0,0,0,0.9)_100%)]" />
              <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.5),transparent)]" />
              {/* dim the side cards so the centre one pops */}
              <div
                className="absolute inset-0 bg-black transition-opacity duration-300"
                style={{ opacity: isFront ? 0 : 0.34 }}
              />

              {/* bottom content */}
              <div className="absolute inset-x-0 bottom-0 p-5">
                <span
                  className="text-[10px] font-black uppercase tracking-[0.16em]"
                  style={{ color: card.accent }}
                >
                  {card.kind}
                </span>
                <h3 className="mt-0.5 text-[32px] font-black uppercase leading-[0.92] tracking-tight text-white drop-shadow-[0_3px_16px_rgba(0,0,0,0.8)]">
                  {card.title}
                </h3>
                <p className="mt-1.5 truncate text-[12.5px] font-semibold text-white/80">
                  {card.tagline}
                </p>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[11px] font-bold text-white/60">
                  {card.meta.map((m, idx) => (
                    <span key={m} className="flex items-center gap-x-1.5">
                      {idx > 0 && <span className="text-white/30">•</span>}
                      {m}
                    </span>
                  ))}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* progress dots */}
      <div className="mt-7 flex items-center justify-center gap-1.5">
        {cards.map((c, i) => (
          <button
            key={c.id}
            type="button"
            aria-label={`Go to ${c.title}`}
            onClick={() => setActive(i)}
            className="app-pressable h-1.5 rounded-full transition-all duration-300"
            style={{
              width: i === active ? 18 : 6,
              background: i === active ? "#fff" : "rgba(255,255,255,0.28)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function MemoryCarousel({
  tiles,
  height = 300,
}: {
  tiles: Tile[];
  height?: number;
}) {
  const [index, setIndex] = useState(0);
  const [drag, setDrag] = useState(0); // live drag offset (px)
  const startX = useRef<number | null>(null);
  const dragging = useRef(false);
  const paused = useRef(false);
  const resumeTimer = useRef<number | null>(null);
  const n = tiles.length;

  // auto-advance, pausing while the user interacts
  useEffect(() => {
    const id = window.setInterval(() => {
      if (paused.current) return;
      setIndex((i) => (i + 1) % n);
    }, 3800);
    return () => window.clearInterval(id);
  }, [n]);

  const resumeSoon = () => {
    if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => {
      paused.current = false;
    }, 5000);
  };

  const onDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    dragging.current = true;
    paused.current = true;
    if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging.current || startX.current === null) return;
    let dx = e.clientX - startX.current;
    if ((index === 0 && dx > 0) || (index === n - 1 && dx < 0)) dx *= 0.4;
    setDrag(dx);
  };
  const onUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    const w = (e.currentTarget as HTMLElement).offsetWidth || 1;
    const threshold = w * 0.16;
    if (drag <= -threshold && index < n - 1) setIndex((i) => i + 1);
    else if (drag >= threshold && index > 0) setIndex((i) => i - 1);
    setDrag(0);
    startX.current = null;
    resumeSoon();
  };

  return (
    <div className="circle-panel">
      <div
        className="relative w-full touch-pan-y select-none overflow-hidden rounded-[30px] border border-white/8 shadow-[0_24px_64px_rgba(0,0,0,0.46),inset_0_1px_0_rgba(255,255,255,0.06)]"
        style={{ height }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {tiles.map((tile, i) => (
          <div
            key={tile.id}
            className="absolute inset-0"
            style={{
              transform: `translateX(calc(${(i - index) * 100}% + ${drag}px))`,
              transition: dragging.current
                ? "none"
                : "transform 0.55s cubic-bezier(0.22,1,0.36,1)",
            }}
          >
            <div
              className="absolute inset-0"
              style={{ background: tile.gradient }}
            />
            <img
              src={tile.image}
              alt={tile.title}
              loading="lazy"
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(255,255,255,0.08),transparent_42%),linear-gradient(180deg,rgba(0,0,0,0.12)_0%,transparent_34%,rgba(0,0,0,0.66)_100%)]" />
            <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.5),transparent)]" />

            <div className="absolute inset-0 flex flex-col justify-between p-4">
              <div className="flex items-center justify-between">
                <KindChip label={tile.kind} accent={tile.accent} />
                {tile.reactions != null && (
                  <span className="flex items-center gap-1 rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-black text-white backdrop-blur-md">
                    <Heart size={12} className="fill-current text-[#fb7185]" />
                    {tile.reactions}
                  </span>
                )}
              </div>
              <div>
                <h3 className="text-[30px] font-black leading-[1.04] text-white drop-shadow-[0_3px_16px_rgba(0,0,0,0.7)]">
                  {tile.title}
                </h3>
                {tile.subtitle && (
                  <p className="mt-1.5 max-w-[88%] text-[13.5px] font-semibold leading-snug text-white/80">
                    {tile.subtitle}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* progress dots */}
      <div className="mt-3 flex items-center justify-center gap-1.5">
        {tiles.map((t, i) => (
          <button
            key={t.id}
            type="button"
            aria-label={`Go to ${t.title}`}
            onClick={() => {
              setIndex(i);
              paused.current = true;
              resumeSoon();
            }}
            className="app-pressable h-1.5 rounded-full transition-all duration-300"
            style={{
              width: i === index ? 18 : 6,
              background: i === index ? "#fff" : "rgba(255,255,255,0.26)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SmallTile({ tile, caption }: { tile: Tile; caption: string }) {
  return (
    <div className="circle-panel">
      <p className="mb-2 text-[11px] font-black uppercase tracking-[0.12em] text-[#94a3b8]">
        {caption}
      </p>
      <button
        type="button"
        className="app-pressable relative block aspect-[4/5] w-full overflow-hidden rounded-[26px] border border-white/8 text-left shadow-[0_18px_48px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.06)]"
      >
        <div
          className="absolute inset-0"
          style={{ background: tile.gradient }}
        />
        <img
          src={tile.image}
          alt={tile.title}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.1)_0%,transparent_40%,rgba(0,0,0,0.7)_100%)]" />
        <div className="absolute left-3 top-3">
          <KindChip label={tile.kind} accent={tile.accent} />
        </div>
        <div className="absolute inset-x-3 bottom-3">
          <h3 className="text-[16px] font-black leading-[1.08] text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)]">
            {tile.title}
          </h3>
          {tile.subtitle && (
            <p className="mt-1 line-clamp-2 text-[11.5px] font-semibold leading-snug text-white/72">
              {tile.subtitle}
            </p>
          )}
        </div>
      </button>
    </div>
  );
}

function Carousel({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="circle-hide-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 pt-1">
      {tiles.map((tile) => (
        <button
          key={tile.id}
          type="button"
          className="app-pressable relative block aspect-[3/4] w-[150px] shrink-0 snap-start overflow-hidden rounded-[24px] border border-white/8 text-left shadow-[0_16px_42px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.06)]"
        >
          <div
            className="absolute inset-0"
            style={{ background: tile.gradient }}
          />
          <img
            src={tile.image}
            alt={tile.title}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.1)_0%,transparent_42%,rgba(0,0,0,0.66)_100%)]" />
          <div className="absolute left-2.5 top-2.5">
            <KindChip label={tile.kind} accent={tile.accent} />
          </div>
          <div className="absolute inset-x-2.5 bottom-2.5 flex items-end justify-between gap-1">
            <h3 className="text-[13.5px] font-black leading-[1.1] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)]">
              {tile.title}
            </h3>
            <ArrowUpRight size={15} className="shrink-0 text-white/70" />
          </div>
        </button>
      ))}
      <div className="w-1 shrink-0" aria-hidden="true" />
    </div>
  );
}
