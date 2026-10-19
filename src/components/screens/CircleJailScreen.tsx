"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Eye,
  Lock,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { CourtStickman } from "../court/CourtStickman";
import { useAuthStore } from "@/stores/useAuthStore-v2";
import { useJailStore, type JailNote } from "@/stores/useJailStore";
import { useImmersiveOverlayStore } from "../../stores/useImmersiveOverlayStore";

/* ────────────────────────────────────────────────────────────
   Circle Jail — the climax of Friendship Court.
   Full-screen animated jail: the sentenced friend sits behind
   bars in Observer Mode while the circle visits — notes pinned
   to the wall, roses on the table, paper balls, hugs, bar taps.
   Visual layer (client-side state), mirrors the court precedent.
   Design language: stickman-jail energy from Roast Jail, tokens
   from DailyChallenge / FriendshipCourt.
──────────────────────────────────────────────────────────── */

const NOTE_TINTS = [
  { bg: "#fef3c7", ink: "#713f12", pin: "#fb7185" },
  { bg: "#dcfce7", ink: "#14532d", pin: "#38bdf8" },
  { bg: "#fce7f3", ink: "#831843", pin: "#facc15" },
  { bg: "#e0f2fe", ink: "#0c4a6e", pin: "#4ade80" },
  { bg: "#f3e8ff", ink: "#581c87", pin: "#fb7185" },
] as const;

const REACTION_EMOJIS = ["😂", "💀", "😭", "🔥", "🙏", "😹"];
const PRISONER_EMOJIS = ["😔", "🥺", "😅", "😤", "🙃", "💚", "😂", "🫠"];

/* prisoner idle life — cycles so the cell never sits still */
const PRISONER_ACTIVITIES = ["pace", "read", "sit", "sleep", "pushup"] as const;
type PrisonerActivity = (typeof PRISONER_ACTIVITIES)[number];
const ACTIVITY_MOOD: Record<PrisonerActivity, string> = {
  pace: "😔",
  read: "🤓",
  sit: "🥱",
  sleep: "😴",
  pushup: "😤",
};

const AMBIENT_VISITORS = ["Priya", "Meera", "Sana", "Dev", "Kabir"];
const AMBIENT_NOTES = [
  "you deserve this ngl 💀",
  "we saved you a seat outside",
  "stay strong king 😂",
  "the trip was still fun tho",
  "6 hours is nothing, warrior",
  "I voted not guilty btw 🥺",
];

/* ── Darren's prison diary ─────────────────────────────────────
   The prisoner can't type, so the warden (Darren the AI) narrates.
   One entry per hour served, seeded off state so it feels observed.
──────────────────────────────────────────────────────────────── */
type DiaryEntry = { hour: number; label: string; body: string; mood: string };

// deterministic hash → keeps note positions / diary picks stable per session
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function buildDiary(
  prisonerName: string,
  startedAt: number,
  now: number,
  roses: number,
  notes: number,
  paperBalls: number,
  visitors: number,
): DiaryEntry[] {
  const name = prisonerName || "The prisoner";
  const hoursServed = Math.min(6, Math.floor((now - startedAt) / 3_600_000));
  const entries: DiaryEntry[] = [
    {
      hour: 0,
      label: "Intake",
      body: `${name} was booked, photographed, and given the good cell — the one with the moon window. Morale: suspiciously high.`,
      mood: "🚔",
    },
  ];

  const beats: ((n: string) => { body: string; mood: string })[] = [
    (n) => ({
      body: `${n} has stared at the same brick for 17 minutes. The brick stared back. Morale: low.`,
      mood: "🧱",
    }),
    (n) => ({
      body: `${n} attempted push-ups. Managed four. We are, technically, still counting the fourth.`,
      mood: "😤",
    }),
    (n) => ({
      body:
        roses > 0
          ? `${roses} roses on the table already. Perhaps society still loves ${n}. Perhaps society is bored.`
          : `The table is empty. ${n} keeps glancing at it. Nobody has left a rose. Brutal.`,
      mood: "🌹",
    }),
    (n) => ({
      body:
        paperBalls > 0
          ? `${n} took ${paperBalls} paper ball(s) to the head with tremendous dignity. A model inmate.`
          : `${n} paced the cell. Then paced it again. Then, ambitiously, paced it a third time.`,
      mood: "📄",
    }),
    (n) => ({
      body:
        notes > 0
          ? `Read the wall notes ${Math.max(1, Math.round(notes / 2))} times. Cried a little at "${"stay strong king"}". Denies it.`
          : `${n} has begun narrating their own life quietly. It is going poorly for the protagonist.`,
      mood: "📝",
    }),
    (n) => ({
      body:
        visitors > 0
          ? `${visitors} visitor(s) came by. ${n} pretended not to care and then waved for eleven straight seconds.`
          : `No visitors this hour. ${n} befriended the moon. It's a healthy relationship, we're told.`,
      mood: "🌙",
    }),
  ];

  for (let h = 1; h <= hoursServed; h++) {
    const pick = beats[(h - 1) % beats.length](name);
    entries.push({
      hour: h,
      label: `Hour ${h}`,
      body: pick.body,
      mood: pick.mood,
    });
  }
  return entries.reverse(); // newest first
}

type FlyEffect = {
  id: string;
  kind: "paper" | "rose" | "hug" | "reaction" | "clang";
  emoji?: string;
  /** horizontal start offset % for variety */
  x: number;
};

const newId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function fmtCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function timeAgo(at: number) {
  const mins = Math.max(0, Math.floor((Date.now() - at) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

/* ── crumpled paper ball (CSS, no emoji) ─────────────────── */
function PaperBall({ seed }: { seed: number }) {
  const size = 14 + (seed % 3) * 3;
  return (
    <span
      className="jail-paper-ball inline-block rounded-full"
      style={{
        width: size,
        height: size,
        background:
          "radial-gradient(circle at 32% 28%, #f8fafc, #cbd5e1 58%, #64748b)",
        boxShadow: "0 3px 6px rgba(0,0,0,0.45)",
        transform: `rotate(${(seed * 47) % 360}deg)`,
      }}
    />
  );
}

export function CircleJailScreen({ onClose }: { onClose: () => void }) {
  const { user } = useAuthStore();
  const session = useJailStore((s) => s.session);
  const {
    addNote,
    addRose,
    throwPaper,
    hug,
    tapBars,
    react,
    prisonerEmote,
    shortenSentence,
    markReleased,
    clear,
  } = useJailStore.getState();

  const myName =
    (user as { displayName?: string; username?: string } | null)?.displayName ||
    (user as { username?: string } | null)?.username ||
    "You";
  const isPrisoner = Boolean(user?.id && session?.prisoner.id === user.id);

  const [now, setNow] = useState(() => Date.now());
  const [showSentencing, setShowSentencing] = useState(
    () =>
      !!session && !session.released && Date.now() - session.startedAt < 8000,
  );
  const [releasing, setReleasing] = useState(false);
  const [showReleaseCard, setShowReleaseCard] = useState(false);
  const [effects, setEffects] = useState<FlyEffect[]>([]);
  const [barShakeKey, setBarShakeKey] = useState(0);
  const [prisonerHitKey, setPrisonerHitKey] = useState(0);
  const [hugActive, setHugActive] = useState(false);
  const [hugRunning, setHugRunning] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [openSheet, setOpenSheet] = useState<
    null | "note" | "wall" | "roses" | "observer" | "diary"
  >(null);
  const [showReactions, setShowReactions] = useState(false);
  const [activity, setActivity] = useState<PrisonerActivity>("pace");
  const [bubbleEmote, setBubbleEmote] = useState<string | null>(null);
  const [zoomNote, setZoomNote] = useState<JailNote | null>(null);
  const clockTaps = useRef<number[]>([]);
  const ambientCount = useRef(0);

  // hide bottom nav while the jail is open
  useEffect(() => {
    useImmersiveOverlayStore.getState().setActive(true);
    return () => useImmersiveOverlayStore.getState().setActive(false);
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!showSentencing) return;
    const t = window.setTimeout(() => setShowSentencing(false), 3000);
    return () => window.clearTimeout(t);
  }, [showSentencing]);

  // prisoner drifts between idle activities so the cell stays alive
  useEffect(() => {
    if (releasing) return;
    const pick = () =>
      setActivity((prev) => {
        let next = prev;
        while (next === prev)
          next =
            PRISONER_ACTIVITIES[
              Math.floor(Math.random() * PRISONER_ACTIVITIES.length)
            ];
        return next;
      });
    const t = window.setInterval(pick, 9000 + Math.random() * 4000);
    return () => window.clearInterval(t);
  }, [releasing]);

  const remaining = session
    ? Math.max(0, session.startedAt + session.sentenceMs - now)
    : 0;

  const pushEffect = useCallback((kind: FlyEffect["kind"], emoji?: string) => {
    const effect: FlyEffect = {
      id: newId(),
      kind,
      emoji,
      x: 24 + Math.random() * 52,
    };
    setEffects((prev) => [...prev.slice(-9), effect]);
    window.setTimeout(() => {
      setEffects((prev) => prev.filter((e) => e.id !== effect.id));
    }, 1500);
  }, []);

  const showPrisonerBubble = useCallback((emoji: string) => {
    setBubbleEmote(emoji);
    window.setTimeout(
      () => setBubbleEmote((cur) => (cur === emoji ? null : cur)),
      2600,
    );
  }, []);

  /* ── visitor actions ─────────────────────────────────────── */
  const doRose = useCallback(() => {
    addRose(myName);
    pushEffect("rose", "🌹");
  }, [addRose, myName, pushEffect]);

  const doPaper = useCallback(() => {
    throwPaper();
    pushEffect("paper");
    // prisoner flinches the moment the ball connects
    window.setTimeout(() => setPrisonerHitKey((k) => k + 1), 520);
  }, [throwPaper, pushEffect]);

  // Hug is a little scene: your stickman walks up, the bars lift,
  // you hug, and you walk back out while the bars drop back down.
  const doHug = useCallback(() => {
    if (hugRunning || releasing) return;
    hug();
    setHugRunning(true);
    window.setTimeout(() => {
      setHugActive(true);
      pushEffect("hug", "💚");
    }, 950);
    window.setTimeout(() => setHugActive(false), 2250);
    window.setTimeout(() => setHugRunning(false), 3200);
  }, [hug, pushEffect, hugRunning, releasing]);

  const doTapBars = useCallback(() => {
    tapBars();
    setBarShakeKey((k) => k + 1);
    pushEffect("clang");
    try {
      navigator.vibrate?.(30);
    } catch {
      /* no haptics */
    }
  }, [tapBars, pushEffect]);

  const doReact = useCallback(
    (emoji: string) => {
      react(emoji, myName);
      pushEffect("reaction", emoji);
    },
    [react, myName, pushEffect],
  );

  const doEmote = useCallback(
    (emoji: string) => {
      prisonerEmote(emoji);
      showPrisonerBubble(emoji);
    },
    [prisonerEmote, showPrisonerBubble],
  );

  const submitNote = useCallback(() => {
    const text = noteDraft.trim();
    if (!text) return;
    addNote(text, myName);
    setNoteDraft("");
    setOpenSheet(null);
    pushEffect("reaction", "📝");
  }, [noteDraft, addNote, myName, pushEffect]);

  /* ── ambient life: friends drop by ───────────────────────── */
  useEffect(() => {
    if (!session || session.released || remaining <= 0) return;
    const timer = window.setInterval(() => {
      if (ambientCount.current >= 10) return;
      ambientCount.current += 1;
      const who =
        AMBIENT_VISITORS[Math.floor(Math.random() * AMBIENT_VISITORS.length)];
      const roll = Math.random();
      if (roll < 0.34) {
        addRose(who);
        pushEffect("rose", "🌹");
      } else if (roll < 0.62) {
        const emoji =
          REACTION_EMOJIS[Math.floor(Math.random() * REACTION_EMOJIS.length)];
        react(emoji, who);
        pushEffect("reaction", emoji);
      } else if (roll < 0.82) {
        addNote(
          AMBIENT_NOTES[Math.floor(Math.random() * AMBIENT_NOTES.length)],
          who,
        );
        pushEffect("reaction", "📌");
      } else {
        const emoji =
          PRISONER_EMOJIS[Math.floor(Math.random() * PRISONER_EMOJIS.length)];
        prisonerEmote(emoji);
        showPrisonerBubble(emoji);
      }
    }, 16000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.released, remaining <= 0]);

  /* ── release ─────────────────────────────────────────────── */
  useEffect(() => {
    if (!session || showSentencing) return;
    if (
      (remaining <= 0 || session.released) &&
      !releasing &&
      !showReleaseCard
    ) {
      setReleasing(true);
      window.setTimeout(() => setShowReleaseCard(true), 1100);
    }
  }, [remaining, session, releasing, showReleaseCard, showSentencing]);

  const finishRelease = useCallback(() => {
    markReleased();
    clear();
    onClose();
  }, [markReleased, clear, onClose]);

  /* ── hidden dev skip: tap the clock 7× ───────────────────── */
  const onClockTap = useCallback(() => {
    const t = Date.now();
    clockTaps.current = [...clockTaps.current.filter((x) => t - x < 4000), t];
    if (clockTaps.current.length >= 7) {
      clockTaps.current = [];
      shortenSentence(4000);
    }
  }, [shortenSentence]);

  if (!session) {
    return (
      <div className="app-overlay-screen fixed inset-0 z-[12050] flex flex-col items-center justify-center bg-[#050705] text-white">
        <Lock size={28} className="mb-3 text-[#4ade80]" />
        <p className="text-[16px] font-black">The jail is empty</p>
        <p className="mt-1 text-[12px] font-semibold text-[#7c8a80]">
          No one is serving a sentence right now.
        </p>
        <button
          onClick={onClose}
          className="mt-5 rounded-full bg-[linear-gradient(135deg,#4ade80,#22c55e)] px-6 py-3 text-[13px] font-black text-black"
        >
          Back to events
        </button>
      </div>
    );
  }

  const wallNotes = session.notes.slice(-8);
  const shownRoses = Math.min(session.roses.length, 5);
  const visitors = [
    ...new Set([
      ...session.roses.map((r) => r.by),
      ...session.notes.map((n) => n.by),
      ...session.reactions.map((r) => r.by),
    ]),
  ].slice(-6);

  // Darren's Diary — temporarily disabled (kept for easy re-enable)
  const diary = buildDiary(
    session.prisoner.name,
    session.startedAt,
    now,
    session.roses.length,
    session.notes.length,
    session.paperBalls,
    visitors.length,
  );

  return (
    <div
      className="app-overlay-screen fixed inset-0 z-[12050] flex flex-col overflow-hidden text-white"
      style={{
        background:
          "radial-gradient(circle at 50% -6%, rgba(251,113,133,0.10), transparent 30%)," +
          "radial-gradient(circle at 10% 30%, rgba(56,189,248,0.08), transparent 30%)," +
          "radial-gradient(circle at 90% 60%, rgba(74,222,128,0.06), transparent 30%)," +
          "linear-gradient(180deg, #0a0d0b 0%, #070908 50%, #040504 100%)",
      }}
    >
      {/* rotating police beacon wash */}
      <div className="jail-beacon pointer-events-none absolute inset-x-0 top-0 h-40" />

      {/* ── header: back + compact sentence timer pinned to the top ── */}
      <div className="relative z-20 flex items-center gap-3 px-4 pt-[calc(var(--safe-area-top)+10px)]">
        <button
          onClick={onClose}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border border-white/8 bg-white/[0.04] text-[#94a3b8] backdrop-blur transition-colors hover:text-white"
          aria-label="Leave jail"
        >
          <ArrowLeft size={18} />
        </button>
        <button
          onClick={onClockTap}
          className="flex flex-1 items-center justify-center gap-2 rounded-[16px] border border-white/8 bg-[linear-gradient(180deg,rgba(20,25,21,0.85),rgba(8,10,9,0.92))] px-4 py-2 backdrop-blur"
        >
          <span className="text-[8.5px] font-black uppercase tracking-[0.2em] text-[#fda4af]">
            Time left
          </span>
          <span className="text-[17px] font-black leading-none tabular-nums tracking-tight text-white">
            {fmtCountdown(remaining)}
          </span>
        </button>
        <div className="h-10 w-10 shrink-0" aria-hidden />
      </div>

      {/* ── THE CELL ───────────────────────────────────────── */}
      <div className="relative z-10 mt-3 flex min-h-0 flex-1 flex-col px-4">
        <div
          className="relative mx-auto w-full max-w-[420px] flex-1 overflow-hidden rounded-[32px] border-2 border-[#64748b]/35 shadow-[0_30px_80px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)]"
          style={{
            minHeight: 380,
            maxHeight: 560,
            background:
              // brick wall
              "repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 2px, transparent 2px 34px)," +
              "repeating-linear-gradient(90deg, rgba(255,255,255,0.028) 0 2px, transparent 2px 56px)," +
              "linear-gradient(180deg, #1a211c 0%, #10150f 62%, #0a0d0a 100%)",
          }}
        >
          {/* barred window — a little living night sky outside */}
          <div className="absolute left-5 top-5 h-[60px] w-[80px] overflow-hidden rounded-[10px] border border-[#64748b]/40 bg-[linear-gradient(180deg,#0a1424,#131f33_70%,#182a44)]">
            {/* drifting moon */}
            <span className="jail-moon absolute left-2 top-2 h-4 w-4 rounded-full bg-[#fef9c3] shadow-[0_0_10px_rgba(254,249,195,0.7)]" />
            {/* stars */}
            <span className="jail-star absolute left-2 top-3 h-[3px] w-[3px] rounded-full bg-white/80" />
            <span
              className="jail-star absolute left-7 top-6 h-[2px] w-[2px] rounded-full bg-white/60"
              style={{ animationDelay: "0.8s" }}
            />
            <span
              className="jail-star absolute right-3 top-9 h-[2px] w-[2px] rounded-full bg-white/50"
              style={{ animationDelay: "1.6s" }}
            />
            {/* a bird crosses now and then */}
            <span className="jail-bird absolute top-4 text-[8px] leading-none">
              🐦
            </span>
            {/* rain */}
            <div className="pointer-events-none absolute inset-0">
              {[10, 26, 42, 58, 70].map((left, i) => (
                <span
                  key={left}
                  className="jail-rain absolute top-0 h-3 w-px bg-[linear-gradient(180deg,transparent,rgba(148,197,255,0.55))]"
                  style={{ left: `${left}%`, animationDelay: `${i * 0.28}s` }}
                />
              ))}
            </div>
            {/* window bars */}
            <div className="absolute inset-0 flex justify-around px-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-full w-[3px] rounded-full bg-[#475569]/80"
                />
              ))}
            </div>
          </div>

          {/* hanging cell light — flickers, casts a warm pool on the floor */}
          <div className="pointer-events-none absolute left-1/2 top-0 z-[5] -translate-x-1/2">
            <span className="mx-auto block h-16 w-px bg-white/15" />
            <span className="jail-lamp -mt-1 block h-3 w-3 rounded-full bg-[#fde68a] shadow-[0_0_22px_10px_rgba(253,230,138,0.28)]" />
          </div>

          {/* wall notes — scattered + overlapping, like a real cell wall */}
          <div className="pointer-events-none absolute inset-0 z-10">
            {wallNotes.map((note, i) => {
              const tint = NOTE_TINTS[note.tint % NOTE_TINTS.length];
              // deterministic scatter, kept clear of the window (top-left)
              const rx = hashStr(note.id + "x");
              const ry = hashStr(note.id + "y");
              const left = 27 + rx * 46; // 27%–73%
              const top = 6 + ry * 42; // 6%–48%
              const rot = (hashStr(note.id + "r") - 0.5) * 14; // ±7deg
              return (
                <button
                  key={note.id}
                  onClick={() => setZoomNote(note)}
                  className="jail-note-pin pointer-events-auto absolute w-[96px] rounded-[8px] px-2.5 pb-2 pt-3 text-left shadow-[0_8px_18px_rgba(0,0,0,0.5)]"
                  style={{
                    left: `${left}%`,
                    top: `${top}%`,
                    zIndex: 10 + i,
                    background: tint.bg,
                    transform: `rotate(${rot}deg)`,
                  }}
                >
                  <span
                    className="absolute left-1/2 top-1 h-[9px] w-[9px] -translate-x-1/2 rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.4)]"
                    style={{ background: tint.pin }}
                  />
                  <span
                    className="block text-[10px] font-black leading-tight"
                    style={{
                      color: tint.ink,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {note.text}
                  </span>
                  <span
                    className="mt-0.5 block truncate text-[8.5px] font-bold opacity-60"
                    style={{ color: tint.ink }}
                  >
                    — {note.by}
                  </span>
                </button>
              );
            })}
            {session.notes.length > 8 && (
              <button
                onClick={() => setOpenSheet("wall")}
                className="pointer-events-auto absolute right-3 top-2 z-[60] rounded-full border border-white/15 bg-black/60 px-2 py-0.5 text-[8px] font-black text-white/80"
              >
                +{session.notes.length - 8} notes
              </button>
            )}
          </div>

          {/* prisoner (nudges right to make room during a hug) */}
          <div className="absolute inset-x-0 bottom-[52px] z-10 flex flex-col items-center">
            {bubbleEmote && (
              <div className="jail-bubble mb-1 rounded-[14px] rounded-bl-[4px] border border-white/12 bg-white px-3 py-1.5 text-[18px] shadow-[0_10px_24px_rgba(0,0,0,0.4)]">
                {bubbleEmote}
              </div>
            )}
            <div
              key={`prisoner-${prisonerHitKey}`}
              className={`jail-prisoner relative jail-act-${activity} ${prisonerHitKey > 0 ? "jail-prisoner-flinch" : ""} ${releasing ? "jail-prisoner-free" : ""} ${hugActive ? "jail-prisoner-lean" : ""}`}
            >
              <CourtStickman
                name={isPrisoner ? "You" : session.prisoner.name}
                role="prisoner"
                avatarUrl={session.prisoner.avatarUrl}
                username={session.prisoner.username}
                colorSeed={session.prisoner.colorSeed}
                size={68}
                defeated={
                  !hugActive &&
                  !releasing &&
                  activity !== "read" &&
                  activity !== "pushup"
                }
                mood={
                  hugActive ? "💚" : releasing ? "🎉" : ACTIVITY_MOOD[activity]
                }
              />
              {/* activity props — a book to read, Zzz while dozing */}
              {!hugRunning && !releasing && activity === "read" && (
                <span className="jail-prop-book absolute bottom-5 left-1/2 -translate-x-1/2 text-[18px] leading-none">
                  📖
                </span>
              )}
              {!hugRunning && !releasing && activity === "sleep" && (
                <span className="jail-prop-zzz absolute -top-1 right-0 text-[15px] leading-none text-white/80">
                  💤
                </span>
              )}
            </div>
            {/* contact shadow so the prisoner sits in the room */}
            <span className="jail-prisoner-shadow mt-[-6px] h-2 w-16 rounded-[50%] bg-black/45 blur-[3px]" />
          </div>

          {/* hug visitor — walks in through the lifted bars and back out */}
          {hugRunning && (
            <div className="pointer-events-none absolute inset-x-0 bottom-[52px] z-10 flex justify-center">
              <div className="jail-hugger">
                <CourtStickman
                  name={myName}
                  colorSeed={4}
                  size={52}
                  mood="🤗"
                />
              </div>
            </div>
          )}

          {/* floor */}
          <div className="absolute inset-x-0 bottom-0 h-[46px] border-t border-white/6 bg-[linear-gradient(180deg,rgba(30,36,30,0.9),rgba(10,12,10,0.98))]" />

          {/* BARS (front layer) */}
          <div
            key={`bars-${barShakeKey}`}
            className={`pointer-events-none absolute inset-x-3 inset-y-2 z-20 flex justify-between ${
              barShakeKey > 0 ? "jail-bars-clang" : ""
            } ${releasing ? "jail-bars-open" : ""} ${
              hugRunning && !releasing ? "jail-bars-hug" : ""
            }`}
          >
            {Array.from({ length: 7 }).map((_, i) => (
              <span
                key={i}
                className="jail-bar h-full w-[5px] rounded-full bg-[linear-gradient(180deg,rgba(226,232,240,0.85),rgba(100,116,139,0.5)_50%,rgba(148,163,184,0.7))] shadow-[0_0_10px_rgba(0,0,0,0.5),inset_0_0_2px_rgba(255,255,255,0.5)]"
                style={{ ["--bar" as string]: i }}
              />
            ))}
            {/* crossbar */}
            <span className="absolute inset-x-0 top-[18%] h-[4px] rounded-full bg-[linear-gradient(90deg,rgba(148,163,184,0.55),rgba(226,232,240,0.7),rgba(148,163,184,0.55))]" />
          </div>

          {/* tap-bars hit area */}
          {!isPrisoner && !releasing && (
            <button
              aria-label="Tap the bars"
              onClick={doTapBars}
              className="absolute inset-0 z-30 bg-transparent"
            />
          )}

          {/* fly effects layer */}
          <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
            {effects.map((e) =>
              e.kind === "paper" ? (
                <span
                  key={e.id}
                  className="jail-fly-paper absolute bottom-2"
                  style={{
                    left: `calc(50% + ${Math.round((e.x - 50) / 3)}px)`,
                    ["--drift" as string]: `${Math.round((e.x - 50) / 5)}px`,
                  }}
                >
                  <PaperBall seed={3} />
                </span>
              ) : e.kind === "rose" ? (
                <span
                  key={e.id}
                  className="jail-fly-rose absolute bottom-2 text-[20px]"
                  style={{ left: `${e.x}%` }}
                >
                  🌹
                </span>
              ) : e.kind === "hug" ? (
                <span
                  key={e.id}
                  className="jail-fly-hug absolute bottom-[36%] left-1/2 text-[42px]"
                >
                  🤗
                </span>
              ) : e.kind === "clang" ? (
                <span
                  key={e.id}
                  className="jail-fly-clang absolute top-[26%] text-[15px] font-black tracking-[0.2em] text-[#facc15] drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
                  style={{ left: `${e.x}%` }}
                >
                  CLANG
                </span>
              ) : (
                <span
                  key={e.id}
                  className="jail-fly-up absolute bottom-8 text-[24px]"
                  style={{ left: `${e.x}%` }}
                >
                  {e.emoji}
                </span>
              ),
            )}
          </div>
        </div>

        {/* Darren's Diary — temporarily removed */}

        {/* visitor table — outside the jail, for roses + fun stuff */}
        <button
          onClick={() => setOpenSheet("roses")}
          className="app-pressable mx-auto mt-2 flex w-full max-w-[420px] flex-col items-center"
        >
          {/* stuff on the table */}
          <div className="flex h-8 items-end gap-1 px-3 text-[17px] leading-none">
            {Array.from({ length: shownRoses }).map((_, i) => (
              <span
                key={`rose-${i}`}
                className="jail-rose"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                🌹
              </span>
            ))}
            {session.hugs > 0 && <span className="jail-rose">🧸</span>}
            {session.notes.length > 2 && <span className="jail-rose">💌</span>}
            {session.roses.length === 0 &&
              session.hugs === 0 &&
              session.notes.length <= 2 && (
                <span className="pb-1 text-[9px] font-black uppercase tracking-[0.14em] text-[#5b6b60]">
                  leave something…
                </span>
              )}
          </div>
          {/* table top + legs */}
          <div className="h-[10px] w-[62%] rounded-[5px] border-t border-white/15 bg-[linear-gradient(180deg,#4a3a28,#2a2014)] shadow-[0_6px_16px_rgba(0,0,0,0.5)]" />
          <div className="flex w-[52%] justify-between px-3">
            <span className="h-[14px] w-[5px] rounded-b-[2px] bg-[linear-gradient(180deg,#3a2d1e,#1c150d)]" />
            <span className="h-[14px] w-[5px] rounded-b-[2px] bg-[linear-gradient(180deg,#3a2d1e,#1c150d)]" />
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="rounded-full border border-[#fb7185]/25 bg-black/50 px-2.5 py-0.5 text-[9px] font-black text-[#fda4af]">
              {session.roses.length} 🌹
            </span>
            <span className="rounded-full border border-white/10 bg-black/50 px-2.5 py-0.5 text-[9px] font-black text-white/60">
              visitor table · tap to see
            </span>
          </div>
        </button>
      </div>

      {/* ── dock ───────────────────────────────────────────── */}
      <footer className="relative z-20 px-4 pb-[calc(var(--safe-area-bottom)+12px)] pt-3">
        {isPrisoner ? (
          <div>
            <p className="mb-2 text-center text-[10px] font-semibold text-[#7c8a80]">
              🔒 Observer Mode — you can only answer with emojis
            </p>
            <div className="flex justify-center gap-1.5 overflow-x-auto rounded-[24px] border border-white/8 bg-white/[0.04] p-2">
              {PRISONER_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => doEmote(emoji)}
                  className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-white/8 bg-black/30 text-[20px] transition-transform active:scale-90"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {showReactions && (
              <div className="jail-sheet-pop mx-auto mb-2 flex max-w-[340px] justify-center gap-1.5 rounded-[20px] border border-white/8 bg-black/60 p-2 backdrop-blur">
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => doReact(emoji)}
                    className="flex h-10 w-10 items-center justify-center rounded-[14px] text-[20px] transition-transform active:scale-90"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            {/* the visitor's table — pick something up and give it to them */}
            <div className="relative mx-auto max-w-[420px]">
              <div className="grid grid-cols-6 gap-2">
                {[
                  {
                    key: "note",
                    obj: "📝",
                    tint: "#facc15",
                    onTap: () => setOpenSheet("note"),
                  },
                  { key: "rose", obj: "🌹", tint: "#fb7185", onTap: doRose },
                  { key: "paper", obj: "🧻", tint: "#cbd5e1", onTap: doPaper },
                  { key: "hug", obj: "🧸", tint: "#4ade80", onTap: doHug },
                  { key: "bars", obj: "🔔", tint: "#38bdf8", onTap: doTapBars },
                  {
                    key: "react",
                    obj: "🎭",
                    tint: "#c084fc",
                    onTap: () => setShowReactions((v) => !v),
                  },
                ].map((action) => (
                  <button
                    key={action.key}
                    onClick={action.onTap}
                    aria-label={action.key}
                    className="jail-object app-pressable group flex items-center justify-center"
                  >
                    <span
                      className="jail-object-token flex h-12 w-12 items-center justify-center rounded-[16px] border text-[22px] leading-none shadow-[0_10px_20px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.12)] transition-transform group-active:translate-y-[3px] group-active:shadow-[0_4px_10px_rgba(0,0,0,0.4)]"
                      style={{
                        borderColor: `${action.tint}30`,
                        background:
                          "radial-gradient(circle at 34% 26%, rgba(255,255,255,0.14), transparent 55%)," +
                          `linear-gradient(180deg,${action.tint}18,rgba(14,17,13,0.95))`,
                      }}
                    >
                      {action.obj}
                    </span>
                  </button>
                ))}
              </div>
              {/* wooden table edge the objects rest on */}
              <div className="mt-2 h-[7px] w-full rounded-[4px] border-t border-white/12 bg-[linear-gradient(180deg,#4a3a28,#241a10)] shadow-[0_6px_14px_rgba(0,0,0,0.5)]" />
            </div>
          </>
        )}
      </footer>

      {/* ── SENTENCED takeover ─────────────────────────────── */}
      {showSentencing && (
        <div className="fixed inset-0 z-[12070] flex flex-col items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="jail-stamp flex flex-col items-center">
            <div className="rounded-[18px] border-[3px] border-[#fb7185] px-8 py-3 text-[30px] font-black tracking-[0.14em] text-[#fb7185] shadow-[0_0_60px_rgba(251,113,133,0.35)]">
              🚔 SENTENCED
            </div>
            <p className="mt-4 text-[40px] font-black leading-none text-white">
              6 Hours
            </p>
            <p className="mt-3 flex items-center gap-1.5 rounded-full border border-[#38bdf8]/30 bg-[#38bdf8]/10 px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#7dd3fc]">
              <Eye size={13} /> Observer Mode
            </p>
            <p className="mt-4 max-w-[260px] text-center text-[12px] font-semibold text-[#94a3b8]">
              {session.prisoner.name} can watch everything — but can’t post,
              vote, or speak until release.
            </p>
          </div>
        </div>
      )}

      {/* ── RELEASED ceremony ──────────────────────────────── */}
      {showReleaseCard && (
        <div className="fixed inset-0 z-[12070] flex flex-col items-center justify-center bg-black/85 px-6 backdrop-blur-md">
          {/* confetti */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {Array.from({ length: 18 }).map((_, i) => (
              <span
                key={i}
                className="jail-confetti absolute top-[-24px] h-2.5 w-1.5 rounded-sm"
                style={{
                  left: `${(i * 137) % 100}%`,
                  background: [
                    "#4ade80",
                    "#facc15",
                    "#fb7185",
                    "#38bdf8",
                    "#c084fc",
                  ][i % 5],
                  animationDelay: `${(i % 6) * 0.24}s`,
                }}
              />
            ))}
          </div>
          <div className="jail-stamp flex w-full max-w-[340px] flex-col items-center rounded-[32px] border border-[#4ade80]/25 bg-[linear-gradient(180deg,rgba(18,26,20,0.98),rgba(8,11,9,0.99))] px-6 py-8 text-center shadow-[0_36px_90px_rgba(0,0,0,0.6),0_0_60px_rgba(74,222,128,0.14)]">
            <div className="rounded-[16px] border-[3px] border-[#4ade80] px-6 py-2.5 text-[24px] font-black tracking-[0.14em] text-[#4ade80]">
              🚔 RELEASED
            </div>
            <p className="mt-4 text-[17px] font-black leading-snug text-white">
              {session.prisoner.name} has completed{"\n"}
              {isPrisoner ? "your" : "their"} sentence.
            </p>
            <p className="mt-3 text-[12px] font-semibold leading-relaxed text-[#9bb1a6]">
              The jail opens. Observer Mode ends.
              <br />
              Normal participation returns.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-1.5 text-[10px] font-black text-white/70">
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1">
                🌹 {session.roses.length}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1">
                📝 {session.notes.length}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1">
                🤗 {session.hugs}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1">
                📄 {session.paperBalls}
              </span>
            </div>
            <button
              onClick={finishRelease}
              className="app-pressable mt-6 w-full rounded-full bg-[linear-gradient(135deg,#4ade80,#22c55e)] py-3.5 text-[14px] font-black text-black shadow-[0_16px_40px_rgba(74,222,128,0.3)]"
            >
              <Sparkles size={15} className="mr-1 inline" /> Welcome back
            </button>
          </div>
        </div>
      )}

      {/* ── enlarged note ──────────────────────────────────── */}
      {zoomNote && (
        <div
          className="fixed inset-0 z-[12065] flex items-center justify-center bg-black/70 px-8 backdrop-blur-sm"
          onClick={() => setZoomNote(null)}
        >
          {(() => {
            const tint = NOTE_TINTS[zoomNote.tint % NOTE_TINTS.length];
            return (
              <div
                className="jail-note-zoom relative w-full max-w-[320px] rounded-[18px] px-6 pb-6 pt-8 text-left shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
                style={{ background: tint.bg }}
                onClick={(e) => e.stopPropagation()}
              >
                <span
                  className="absolute left-1/2 top-3 h-[16px] w-[16px] -translate-x-1/2 rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.4)]"
                  style={{ background: tint.pin }}
                />
                <p
                  className="text-[22px] font-black leading-snug"
                  style={{ color: tint.ink }}
                >
                  {zoomNote.text}
                </p>
                <p
                  className="mt-4 text-[13px] font-bold opacity-60"
                  style={{ color: tint.ink }}
                >
                  — {zoomNote.by} · {timeAgo(zoomNote.at)}
                </p>
              </div>
            );
          })()}
        </div>
      )}

      {/* ── sheets ─────────────────────────────────────────── */}
      {openSheet && (
        <div
          className="fixed inset-0 z-[12060] flex flex-col justify-end bg-black/60 backdrop-blur-sm"
          onClick={() => setOpenSheet(null)}
        >
          <div
            className="jail-sheet-pop mx-auto w-full max-w-[480px] rounded-t-[28px] border border-b-0 border-white/10 bg-[linear-gradient(180deg,rgba(18,22,19,0.99),rgba(8,10,9,1))] px-5 pb-[calc(var(--safe-area-bottom)+18px)] pt-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />

            {openSheet === "note" && (
              <div>
                <p className="text-[14px] font-black text-white">
                  📝 Pin a note to the wall
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-[#7c8a80]">
                  It stays pinned for the whole sentence.
                </p>
                <div className="mt-3 flex items-end gap-2">
                  <input
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitNote()}
                    maxLength={140}
                    autoFocus
                    placeholder="say something to the prisoner…"
                    className="min-w-0 flex-1 rounded-[18px] border border-[#facc15]/30 bg-white/[0.04] px-4 py-3 text-[14px] font-semibold text-white outline-none placeholder:text-[#5b6b60]"
                  />
                  <button
                    onClick={submitNote}
                    disabled={!noteDraft.trim()}
                    className="flex h-[46px] items-center gap-1 rounded-full bg-[linear-gradient(135deg,#facc15,#eab308)] px-4 text-[13px] font-black text-black disabled:opacity-40"
                  >
                    <Send size={14} /> Pin
                  </button>
                </div>
              </div>
            )}

            {openSheet === "wall" && (
              <div>
                <p className="text-[14px] font-black text-white">
                  📌 The jail wall · {session.notes.length} notes
                </p>
                <div className="mt-3 grid max-h-[46vh] grid-cols-2 gap-2 overflow-y-auto pb-1">
                  {[...session.notes].reverse().map((note) => {
                    const tint = NOTE_TINTS[note.tint % NOTE_TINTS.length];
                    return (
                      <div
                        key={note.id}
                        className="rounded-[10px] p-3 shadow-[0_8px_18px_rgba(0,0,0,0.35)]"
                        style={{ background: tint.bg }}
                      >
                        <p
                          className="text-[12px] font-black leading-snug"
                          style={{ color: tint.ink }}
                        >
                          {note.text}
                        </p>
                        <p
                          className="mt-1.5 text-[10px] font-bold opacity-60"
                          style={{ color: tint.ink }}
                        >
                          — {note.by} · {timeAgo(note.at)}
                        </p>
                      </div>
                    );
                  })}
                  {session.notes.length === 0 && (
                    <p className="col-span-2 py-6 text-center text-[12px] font-semibold text-[#5b6b60]">
                      No notes yet — be the first visitor.
                    </p>
                  )}
                </div>
              </div>
            )}

            {openSheet === "roses" && (
              <div>
                <p className="text-[14px] font-black text-white">
                  🌹 Roses on the table · {session.roses.length}
                </p>
                <div className="mt-3 max-h-[42vh] space-y-1.5 overflow-y-auto pb-1">
                  {[...session.roses].reverse().map((rose) => (
                    <div
                      key={rose.id}
                      className="flex items-center justify-between rounded-[14px] border border-[#fb7185]/15 bg-[#fb7185]/[0.06] px-3.5 py-2.5"
                    >
                      <span className="text-[13px] font-black text-white">
                        🌹 Left by {rose.by}
                      </span>
                      <span className="text-[10px] font-bold text-[#7c8a80]">
                        {timeAgo(rose.at)}
                      </span>
                    </div>
                  ))}
                  {session.roses.length === 0 && (
                    <p className="py-6 text-center text-[12px] font-semibold text-[#5b6b60]">
                      The table is empty. Leave the first rose.
                    </p>
                  )}
                </div>
              </div>
            )}

            {openSheet === "observer" && (
              <div>
                <p className="flex items-center gap-1.5 text-[14px] font-black text-white">
                  <Eye size={15} className="text-[#7dd3fc]" /> Observer Mode
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-[#7c8a80]">
                  Active for {session.prisoner.name} until release.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-[18px] border border-[#4ade80]/20 bg-[#4ade80]/[0.06] p-3">
                    <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#86efac]">
                      Can
                    </p>
                    {[
                      "Read posts",
                      "Read comments",
                      "Watch events",
                      "Watch courts",
                      "View stories",
                      "View memories",
                      "View highlights",
                      "Private messages",
                    ].map((item) => (
                      <p
                        key={item}
                        className="text-[11px] font-bold leading-relaxed text-white/80"
                      >
                        ✓ {item}
                      </p>
                    ))}
                  </div>
                  <div className="rounded-[18px] border border-[#fb7185]/20 bg-[#fb7185]/[0.06] p-3">
                    <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#fda4af]">
                      Cannot
                    </p>
                    {[
                      "Post",
                      "Comment",
                      "Vote",
                      "Start events",
                      "Join courts",
                      "Speak in circle",
                    ].map((item) => (
                      <p
                        key={item}
                        className="text-[11px] font-bold leading-relaxed text-white/80"
                      >
                        ✗ {item}
                      </p>
                    ))}
                  </div>
                </div>
                <p className="mt-3 text-center text-[10px] font-semibold text-[#5b6b60]">
                  The prisoner can only respond with emojis — keeps it playful.
                </p>
              </div>
            )}

            {openSheet === "diary" && (
              <div>
                <p className="flex items-center gap-1.5 text-[14px] font-black text-white">
                  <BookOpen size={15} className="text-[#fbbf24]" />{" "}
                  Darren&apos;s Diary
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-[#7c8a80]">
                  The warden keeps notes. One entry per hour served.
                </p>
                <div className="mt-3 max-h-[46vh] space-y-2 overflow-y-auto pb-1">
                  {diary.map((entry) => (
                    <div
                      key={`${entry.hour}-${entry.label}`}
                      className="rounded-[16px] border border-[#fbbf24]/15 bg-[linear-gradient(180deg,rgba(41,32,16,0.6),rgba(14,11,6,0.85))] p-3.5"
                    >
                      <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#fbbf24]">
                        <span className="text-[13px]">{entry.mood}</span>
                        {entry.label}
                      </p>
                      <p className="mt-1.5 text-[12.5px] font-semibold leading-relaxed text-white/85">
                        {entry.body}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-center text-[10px] font-semibold text-[#5b6b60]">
                  Next entry writes itself at the top of the hour.
                </p>
              </div>
            )}

            <button
              onClick={() => setOpenSheet(null)}
              className="mt-4 flex w-full items-center justify-center gap-1 rounded-full border border-white/10 bg-white/[0.04] py-2.5 text-[12px] font-black text-white/60"
            >
              <X size={13} /> Close
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes jailBeacon {
          0%, 100% { background: linear-gradient(90deg, rgba(251,113,133,0.10), transparent 40%, transparent 60%, rgba(56,189,248,0.10)); }
          50% { background: linear-gradient(90deg, rgba(56,189,248,0.10), transparent 40%, transparent 60%, rgba(251,113,133,0.10)); }
        }
        .jail-beacon { animation: jailBeacon 3.2s ease-in-out infinite; }

        @keyframes jailMoon {
          0% { transform: translateX(0) translateY(0); opacity: .9; }
          50% { transform: translateX(46px) translateY(3px); opacity: 1; box-shadow: 0 0 14px rgba(254,249,195,0.9); }
          100% { transform: translateX(0) translateY(0); opacity: .9; }
        }
        .jail-moon { animation: jailMoon 34s ease-in-out infinite; }
        @keyframes jailStar { 0%,100%{opacity:.4} 50%{opacity:1} }
        .jail-star { animation: jailStar 2.2s ease-in-out infinite; }

        /* rain outside the window */
        @keyframes jailRain {
          0% { transform: translateY(-12px); opacity: 0; }
          30% { opacity: 1; }
          100% { transform: translateY(60px); opacity: 0; }
        }
        .jail-rain { animation: jailRain 1.1s linear infinite; }

        /* a bird crosses the sky every so often */
        @keyframes jailBird {
          0%, 62% { transform: translateX(-16px) translateY(0); opacity: 0; }
          66% { opacity: 0.85; }
          80% { transform: translateX(40px) translateY(-4px); opacity: 0.85; }
          84%, 100% { transform: translateX(90px) translateY(-6px); opacity: 0; }
        }
        .jail-bird { animation: jailBird 13s ease-in-out infinite; }

        /* hanging bulb flickers */
        @keyframes jailLamp {
          0%, 100% { opacity: 1; box-shadow: 0 0 22px 10px rgba(253,230,138,0.28); }
          47% { opacity: 1; }
          49% { opacity: 0.55; box-shadow: 0 0 14px 6px rgba(253,230,138,0.18); }
          51% { opacity: 1; }
          92% { opacity: 1; }
          94% { opacity: 0.7; }
          96% { opacity: 1; }
        }
        .jail-lamp { animation: jailLamp 6.5s ease-in-out infinite; }

        @keyframes jailPrisonerShadow {
          0%, 100% { transform: scaleX(1); opacity: .45; }
          50% { transform: scaleX(1.18); opacity: .3; }
        }
        .jail-prisoner-shadow { animation: jailPrisonerShadow 6.5s ease-in-out infinite; }

        @keyframes jailNotePin {
          0% { opacity: 0; transform: translateY(-10px) rotate(0deg) scale(0.8); }
          100% { opacity: 1; }
        }
        .jail-note-pin { animation: jailNotePin 0.4s cubic-bezier(0.16,1,0.3,1) both; }

        /* base holds no animation — activity classes drive the motion */
        .jail-prisoner { will-change: transform; }

        /* pace: drift across the cell, pause, turn back */
        @keyframes jailPace {
          0% { transform: translateX(-18px) translateY(0) rotate(-1deg); }
          8% { transform: translateX(-18px) translateY(-2px) rotate(-1deg); }
          46% { transform: translateX(18px) translateY(-2px) rotate(1deg); }
          54% { transform: translateX(18px) translateY(0) rotate(1deg); }
          92% { transform: translateX(-18px) translateY(-2px) rotate(-1deg); }
          100% { transform: translateX(-18px) translateY(0) rotate(-1deg); }
        }
        .jail-act-pace { animation: jailPace 9s ease-in-out infinite; }

        /* sit: sink to the floor, slow breathing */
        @keyframes jailSit {
          0%, 100% { transform: translateY(11px) scaleY(0.9); }
          50% { transform: translateY(10px) scaleY(0.915); }
        }
        .jail-act-sit { transform-origin: 50% 100%; animation: jailSit 4.2s ease-in-out infinite; }

        /* read: seated, gentle head bob like turning pages */
        @keyframes jailRead {
          0%, 100% { transform: translateY(9px) rotate(-1.6deg); }
          50% { transform: translateY(9px) rotate(1.6deg); }
        }
        .jail-act-read { transform-origin: 50% 92%; animation: jailRead 3.4s ease-in-out infinite; }

        /* sleep: slump against the wall, deep slow breaths */
        @keyframes jailSleep {
          0%, 100% { transform: translateY(12px) rotate(-13deg) scaleY(0.93); }
          50% { transform: translateY(13px) rotate(-13deg) scaleY(0.9); }
        }
        .jail-act-sleep { transform-origin: 62% 100%; animation: jailSleep 5.4s ease-in-out infinite; }

        /* pushup: quick squat-dips, working off the sentence */
        @keyframes jailPushup {
          0%, 100% { transform: translateY(4px) scaleY(1); }
          42% { transform: translateY(15px) scaleY(0.84); }
          80% { transform: translateY(4px) scaleY(1); }
        }
        .jail-act-pushup { transform-origin: 50% 100%; animation: jailPushup 0.95s ease-in-out infinite; }

        /* props */
        @keyframes jailBookTurn { 0%,100%{transform:translateX(-50%) rotate(-4deg)} 50%{transform:translateX(-50%) rotate(4deg)} }
        .jail-prop-book { animation: jailBookTurn 3.4s ease-in-out infinite; }
        @keyframes jailZzz { 0%{opacity:0;transform:translateY(4px) scale(.7)} 40%{opacity:.9} 100%{opacity:0;transform:translateY(-14px) scale(1.05)} }
        .jail-prop-zzz { animation: jailZzz 3s ease-in-out infinite; }

        @keyframes jailFlinch {
          0% { transform: translateX(0); }
          25% { transform: translateX(-5px) rotate(-2deg); }
          55% { transform: translateX(4px) rotate(1.6deg); }
          100% { transform: translateX(0); }
        }
        .jail-prisoner-flinch { animation: jailFlinch 0.42s ease-out, jailPace 9s ease-in-out 0.42s infinite; }
        @keyframes jailWalkOut {
          0% { transform: translateY(0); }
          30% { transform: translateY(-8px) scale(1.05); }
          100% { transform: translateY(-4px) scale(1.08); }
        }
        .jail-prisoner-free { animation: jailWalkOut 1s cubic-bezier(0.16,1,0.3,1) both; }

        @keyframes jailBubble {
          0% { opacity: 0; transform: translateY(6px) scale(0.7); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .jail-bubble { animation: jailBubble 0.3s cubic-bezier(0.16,1,0.3,1) both; }

        @keyframes jailClang {
          0% { transform: translateX(0); }
          20% { transform: translateX(-3px); }
          45% { transform: translateX(3px); }
          70% { transform: translateX(-2px); }
          100% { transform: translateX(0); }
        }
        .jail-bars-clang { animation: jailClang 0.4s ease-out; }

        @keyframes jailBarLift {
          to { transform: translateY(-115%); opacity: 0.15; }
        }
        .jail-bars-open .jail-bar {
          animation: jailBarLift 0.9s cubic-bezier(0.16,1,0.3,1) forwards;
          animation-delay: calc(var(--bar) * 70ms);
        }

        /* hug scene: bars lift, hold open while the hug happens, drop back */
        @keyframes jailBarHugLift {
          0% { transform: translateY(0); }
          16% { transform: translateY(-108%); }
          78% { transform: translateY(-108%); }
          100% { transform: translateY(0); }
        }
        .jail-bars-hug .jail-bar {
          animation: jailBarHugLift 3.2s cubic-bezier(0.45,0,0.2,1) both;
          animation-delay: calc(var(--bar) * 34ms);
        }

        /* hug visitor: walk in from the left, lean into the hug, walk out */
        @keyframes jailHugWalk {
          0% { transform: translateX(-185px) translateY(0); opacity: 0; }
          10% { opacity: 1; }
          28% { transform: translateX(-40px) translateY(0) rotate(0); }
          36% { transform: translateX(-32px) translateY(-2px) rotate(7deg); }
          62% { transform: translateX(-32px) translateY(-2px) rotate(7deg); }
          70% { transform: translateX(-40px) translateY(0) rotate(0); }
          92% { opacity: 1; }
          100% { transform: translateX(-185px) translateY(0); opacity: 0; }
        }
        .jail-hugger { animation: jailHugWalk 3.2s cubic-bezier(0.45,0,0.2,1) both; }

        /* prisoner leans into the hug */
        @keyframes jailPrisonerLean {
          0% { transform: translateX(0) rotate(0); }
          40% { transform: translateX(-7px) rotate(-6deg); }
          100% { transform: translateX(-7px) rotate(-6deg); }
        }
        .jail-prisoner-lean { animation: jailPrisonerLean 0.5s cubic-bezier(0.16,1,0.3,1) both; }

        @keyframes jailRosePop {
          0% { opacity: 0; transform: translateY(6px) scale(0.5); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .jail-rose { display:inline-block; animation: jailRosePop 0.5s cubic-bezier(0.16,1,0.3,1) both; }

        /* paper ball: flies straight into the prisoner, bonks, fades out */
        @keyframes jailFlyPaper {
          0% { transform: translate(0, 0) rotate(0) scale(1); opacity: 1; }
          58% { transform: translate(var(--drift, 0px), -148px) rotate(300deg) scale(1); opacity: 1; }
          70% { transform: translate(var(--drift, 0px), -144px) rotate(320deg) scale(1.3, 0.65); opacity: 1; }
          100% { transform: translate(var(--drift, 0px), -138px) rotate(330deg) scale(0.4); opacity: 0; }
        }
        .jail-fly-paper { animation: jailFlyPaper 0.85s cubic-bezier(0.34,0.9,0.45,1) both; }

        @keyframes jailFlyRose {
          0% { transform: translateY(0) rotate(-20deg) scale(0.8); opacity: 1; }
          70% { transform: translateY(-160px) rotate(14deg) scale(1.1); opacity: 1; }
          100% { transform: translateY(-140px) rotate(6deg) scale(0.9); opacity: 0; }
        }
        .jail-fly-rose { animation: jailFlyRose 1.15s cubic-bezier(0.3,0.6,0.4,1) both; }

        @keyframes jailFlyHug {
          0% { transform: translate(-50%, 12px) scale(0.4); opacity: 0; }
          35% { transform: translate(-50%, -6px) scale(1.25); opacity: 1; }
          100% { transform: translate(-50%, -34px) scale(1); opacity: 0; }
        }
        .jail-fly-hug { animation: jailFlyHug 1.3s cubic-bezier(0.16,1,0.3,1) both; }

        @keyframes jailFlyClang {
          0% { opacity: 0; transform: scale(0.5); }
          25% { opacity: 1; transform: scale(1.15); }
          100% { opacity: 0; transform: translateY(-18px) scale(0.9); }
        }
        .jail-fly-clang { animation: jailFlyClang 0.8s ease-out both; }

        @keyframes jailFlyUp {
          0% { opacity: 0; transform: translateY(0) scale(0.6); }
          20% { opacity: 1; transform: translateY(-30px) scale(1.1); }
          100% { opacity: 0; transform: translateY(-150px) scale(1); }
        }
        .jail-fly-up { animation: jailFlyUp 1.4s ease-out both; }

        @keyframes jailStampIn {
          0% { opacity: 0; transform: scale(1.6) rotate(-6deg); }
          55% { opacity: 1; transform: scale(0.95) rotate(1.5deg); }
          100% { opacity: 1; transform: scale(1) rotate(0); }
        }
        .jail-stamp { animation: jailStampIn 0.55s cubic-bezier(0.16,1,0.3,1) both; }

        @keyframes jailSheetPop {
          0% { opacity: 0; transform: translateY(24px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .jail-sheet-pop { animation: jailSheetPop 0.32s cubic-bezier(0.16,1,0.3,1) both; }

        @keyframes jailNoteZoom {
          0% { opacity: 0; transform: scale(0.6) rotate(-3deg); }
          60% { opacity: 1; transform: scale(1.04) rotate(1deg); }
          100% { opacity: 1; transform: scale(1) rotate(0); }
        }
        .jail-note-zoom { animation: jailNoteZoom 0.34s cubic-bezier(0.16,1,0.3,1) both; }

        @keyframes jailConfetti {
          0% { transform: translateY(0) rotate(0); opacity: 1; }
          100% { transform: translateY(110vh) rotate(680deg); opacity: 0.6; }
        }
        .jail-confetti { animation: jailConfetti 2.8s linear infinite; }

        @media (prefers-reduced-motion: reduce) {
          .jail-beacon, .jail-prisoner, .jail-prisoner-flinch, .jail-fly-paper,
          .jail-fly-rose, .jail-fly-hug, .jail-fly-up, .jail-fly-clang,
          .jail-confetti, .jail-stamp, .jail-moon, .jail-star,
          .jail-hugger, .jail-prisoner-lean, .jail-rain, .jail-bird,
          .jail-lamp, .jail-prisoner-shadow,
          .jail-act-pace, .jail-act-sit, .jail-act-read, .jail-act-sleep,
          .jail-act-pushup, .jail-prop-book, .jail-prop-zzz,
          .jail-bars-hug .jail-bar { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

export default CircleJailScreen;
