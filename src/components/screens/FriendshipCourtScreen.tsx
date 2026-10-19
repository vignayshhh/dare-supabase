"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Gavel, Paperclip, Send } from "lucide-react";
import { CourtStickman } from "../court/CourtStickman";
import { useImmersiveOverlayStore } from "../../stores/useImmersiveOverlayStore";
import { useJailStore } from "@/stores/useJailStore";

/* ────────────────────────────────────────────────────────────
   Friendship Court — live circle trial (visual layer).
   Client-side state for now (mirrors RoastJailScreen precedent).
   Theme tokens mirror DailyChallengeScreen / RoastJailScreen.
──────────────────────────────────────────────────────────── */

type Side = "guilty" | "notGuilty";

type Phase =
  | "opening"
  | "defense"
  | "witness"
  | "closing"
  | "verdict"
  | "override"
  | "done";

type Participant = {
  id: string;
  name: string;
  avatarUrl?: string;
  colorSeed: number;
};

const PROSECUTION: Participant[] = [
  { id: "aakash", name: "Aakash", colorSeed: 2 },
  { id: "meera", name: "Meera", colorSeed: 2 },
  { id: "kabir", name: "Kabir", colorSeed: 2 },
];

const DEFENSE: Participant[] = [
  { id: "rahul", name: "Vignesh", colorSeed: 1 },
  { id: "sana", name: "Sana", colorSeed: 1 },
  { id: "dev", name: "Dev", colorSeed: 1 },
];

const JUDGE: Participant = { id: "priya", name: "Priya", colorSeed: 3 };

const PHASE_FLOW: Phase[] = [
  "opening",
  "defense",
  "witness",
  "closing",
  "verdict",
  "override",
  "done",
];

const PHASE_META: Record<
  Phase,
  { label: string; speakerId: string | null; hint: string }
> = {
  opening: {
    label: "Opening",
    speakerId: "aakash",
    hint: "Prosecution opens the case",
  },
  defense: {
    label: "Defense",
    speakerId: "rahul",
    hint: "The accused responds",
  },
  witness: { label: "Witness", speakerId: "meera", hint: "Witness testimony" },
  closing: { label: "Closing", speakerId: "aakash", hint: "Final statements" },
  verdict: {
    label: "Verdict",
    speakerId: "priya",
    hint: "Judge delivers the verdict",
  },
  override: {
    label: "Override",
    speakerId: null,
    hint: "The court can overrule the judge",
  },
  done: { label: "Done", speakerId: null, hint: "Court adjourned" },
};

/* ── side podium (party-room venue vibe) ──────────────────── */
function Podium({
  side,
  label,
  children,
}: {
  side: "left" | "right";
  label: string;
  children: React.ReactNode;
}) {
  const tint =
    side === "left"
      ? {
          glow: "rgba(251,113,133,0.16)",
          bar: "#fb7185",
          text: "text-[#fda4af]",
        }
      : {
          glow: "rgba(56,189,248,0.16)",
          bar: "#38bdf8",
          text: "text-[#7dd3fc]",
        };
  return (
    <div className="relative flex flex-1 flex-col items-center">
      {/* spotlight */}
      <span
        className="pointer-events-none absolute -top-4 h-40 w-40 rounded-full blur-3xl"
        style={{ background: tint.glow }}
      />
      <div className="relative z-10 flex min-h-[120px] flex-wrap items-end justify-center gap-2">
        {children}
      </div>
      {/* podium block */}
      <div
        className="relative z-10 mt-[-4px] h-[40px] w-[120px] rounded-t-[14px] border-t border-white/10 shadow-[0_-2px_18px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)]"
        style={{
          background: `linear-gradient(180deg, ${tint.bar}22, rgba(10,12,8,0.96))`,
          borderColor: `${tint.bar}33`,
        }}
      >
        <p
          className={`pt-2.5 text-center text-[10px] font-black uppercase tracking-[0.16em] ${tint.text}`}
        >
          {label}
        </p>
      </div>
    </div>
  );
}

export function FriendshipCourtScreen({
  onClose,
  onSentenced,
}: {
  onClose: () => void;
  /** called after a guilty verdict — the jail takes over from here */
  onSentenced?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("opening");
  const [showGuiltyTakeover, setShowGuiltyTakeover] = useState(false);
  const [tally, setTally] = useState<{ guilty: number; notGuilty: number }>({
    guilty: 8,
    notGuilty: 6,
  });
  const [mySide, setMySide] = useState<Side>("guilty");
  const [draft, setDraft] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [showTurnTakeover, setShowTurnTakeover] = useState(false);

  // "me" = prosecution accuser so compose / SLAM is reachable.
  const myId = "aakash";
  const meta = PHASE_META[phase];
  const isMyTurn = meta.speakerId === myId && phase !== "done";
  const isSpectatorWatching =
    meta.speakerId !== null && meta.speakerId !== myId;

  const activeSpeaker = useMemo<Participant | null>(() => {
    if (!meta.speakerId) return null;
    if (meta.speakerId === JUDGE.id) return JUDGE;
    return (
      [...PROSECUTION, ...DEFENSE].find((p) => p.id === meta.speakerId) ?? null
    );
  }, [meta.speakerId]);

  // hide bottom nav while court is open (screen layers use CSS `contain`,
  // so z-index alone can't cover the sibling nav layer).
  useEffect(() => {
    useImmersiveOverlayStore.getState().setActive(true);
    return () => useImmersiveOverlayStore.getState().setActive(false);
  }, []);

  useEffect(() => {
    setRevealed(null);
    setDraft("");
  }, [phase]);

  useEffect(() => {
    if (!isMyTurn) return;
    setShowTurnTakeover(true);
    const t = window.setTimeout(() => setShowTurnTakeover(false), 1700);
    return () => window.clearTimeout(t);
  }, [isMyTurn, phase]);

  const advance = useCallback(() => {
    setPhase((p) => {
      const i = PHASE_FLOW.indexOf(p);
      return PHASE_FLOW[Math.min(i + 1, PHASE_FLOW.length - 1)];
    });
  }, []);

  const slam = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setRevealed(text);
    setDraft("");
    window.setTimeout(advance, 1400);
  }, [draft, advance]);

  // ── verdict climax: guilty → jail sentence ────────────────
  const judgeSaysGuilty = tally.guilty >= tally.notGuilty;
  const finalizeVerdict = useCallback(
    (guilty: boolean) => {
      if (!guilty) {
        advance();
        return;
      }
      setShowGuiltyTakeover(true);
      window.setTimeout(() => {
        useJailStore.getState().sentence(
          {
            id: DEFENSE[0].id,
            name: DEFENSE[0].name,
            colorSeed: DEFENSE[0].colorSeed,
          },
          "Ruined the Goa trip",
          "Court #42",
        );
        onSentenced?.();
      }, 2000);
    },
    [advance, onSentenced],
  );

  const switchSide = useCallback(() => {
    setMySide((prev) => {
      const next: Side = prev === "guilty" ? "notGuilty" : "guilty";
      setTally((t) => ({
        guilty: t.guilty + (next === "guilty" ? 1 : -1),
        notGuilty: t.notGuilty + (next === "notGuilty" ? 1 : -1),
      }));
      return next;
    });
  }, []);

  return (
    <div
      className="app-overlay-screen fixed inset-0 z-[12000] flex flex-col text-white"
      style={{
        background:
          "radial-gradient(circle at 50% 4%, rgba(250,204,21,0.10), transparent 30%)," +
          "radial-gradient(circle at 12% 40%, rgba(251,113,133,0.08), transparent 32%)," +
          "radial-gradient(circle at 88% 40%, rgba(56,189,248,0.08), transparent 32%)," +
          "linear-gradient(180deg, #0b0f0a 0%, #0a0d0b 46%, #050705 100%)",
      }}
    >
      {/* floating back + case title (no capsule, no timer) */}
      <div className="flex items-center gap-3 px-4 pt-[calc(var(--safe-area-top)+10px)]">
        <button
          onClick={onClose}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border border-white/8 bg-white/[0.04] text-[#94a3b8] backdrop-blur transition-colors hover:text-white"
          aria-label="Leave court"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-black leading-tight text-white">
            Who ruined the Goa trip?
          </h1>
          <p className="truncate text-[10px] font-semibold text-[#7c8a80]">
            Court #42 · accused Vignesh · {PHASE_META[phase].label}
          </p>
        </div>
      </div>

      {/* ── COURTROOM STAGE (most of the screen) ─────────────── */}
      <div className="relative flex flex-1 min-h-0 flex-col overflow-hidden px-4">
        {/* venue glows + floor (party-room vibe) */}
        <div className="pointer-events-none absolute left-1/2 top-2 h-52 w-[130%] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(250,204,21,0.10),transparent_62%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[46%] bg-[linear-gradient(180deg,rgba(40,33,18,0.12),rgba(0,0,0,0)_70%)]" />

        {/* JUDGE — separate round table, top center */}
        <div className="relative z-10 mt-2 flex flex-col items-center">
          <CourtStickman
            {...JUDGE}
            role="judge"
            active={meta.speakerId === JUDGE.id}
            size={36}
          />
          <div className="mt-[-2px] flex flex-col items-center">
            <div className="h-[14px] w-[150px] rounded-t-[44px] border border-[#facc15]/30 bg-[linear-gradient(180deg,rgba(250,204,21,0.16),rgba(28,24,8,0.92))]" />
            <div className="flex h-[28px] w-[168px] items-center justify-center gap-1.5 rounded-b-[16px] rounded-t-[6px] border border-white/8 bg-[linear-gradient(180deg,rgba(34,40,26,0.96),rgba(10,12,8,0.98))] shadow-[0_14px_28px_rgba(0,0,0,0.5)]">
              <Gavel size={13} className="text-[#facc15]" />
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#facc15]">
                The Bench
              </span>
            </div>
          </div>
        </div>

        {/* two podiums side by side: accuser LEFT, accused RIGHT */}
        <div className="relative z-10 mt-auto flex items-end gap-3 pb-4">
          <Podium side="left" label="Accuser">
            <CourtStickman
              {...PROSECUTION[0]}
              role="accuser"
              active={meta.speakerId === PROSECUTION[0].id}
              size={34}
            />
            <CourtStickman
              {...PROSECUTION[1]}
              role={phase === "witness" ? "witness" : undefined}
              active={meta.speakerId === PROSECUTION[1].id}
              size={24}
            />
            <CourtStickman {...PROSECUTION[2]} size={22} />
          </Podium>

          <Podium side="right" label="Accused">
            <CourtStickman {...DEFENSE[2]} size={22} />
            <CourtStickman {...DEFENSE[1]} size={24} />
            <CourtStickman
              {...DEFENSE[0]}
              role="accused"
              active={meta.speakerId === DEFENSE[0].id}
              size={34}
            />
          </Podium>
        </div>
      </div>

      {/* ── speaker strip (compact) ──────────────────────────── */}
      <div className="px-4">
        {revealed ? (
          <div className="court-reveal relative overflow-hidden rounded-[16px] border border-[#4ade80]/30 bg-[linear-gradient(145deg,rgba(74,222,128,0.12),rgba(16,20,17,0.96))] p-3">
            <p className="mb-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-[#86efac]">
              Statement dropped
            </p>
            <p className="text-[13px] font-semibold leading-snug text-white">
              {revealed}
            </p>
          </div>
        ) : isSpectatorWatching ? (
          <div className="flex items-center gap-2 rounded-[16px] border border-[#fb7185]/25 bg-black/40 p-3">
            <span className="text-[10px] font-black text-[#fda4af]">
              {activeSpeaker?.name} is sealing their statement
              <span className="court-dots" />
            </span>
            <span className="text-[10px] font-semibold text-[#7c8a80]">
              drops all at once
            </span>
          </div>
        ) : phase === "override" ? (
          <div className="rounded-[16px] border border-[#facc15]/30 bg-black/40 p-3 text-center">
            <p className="text-[11px] font-black text-white">
              ⚖️ Judge finds {DEFENSE[0].name}{" "}
              <span
                className={judgeSaysGuilty ? "text-[#fda4af]" : "text-[#bbf7d0]"}
              >
                {judgeSaysGuilty ? "GUILTY" : "NOT GUILTY"}
              </span>
            </p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#facc15]">
              Public override — agree with the judge?
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                onClick={() => finalizeVerdict(judgeSaysGuilty)}
                className="min-h-[40px] rounded-full border border-[#4ade80]/30 bg-[#4ade80]/10 text-[12px] font-black text-[#bbf7d0]"
              >
                Agree
              </button>
              <button
                onClick={() => finalizeVerdict(!judgeSaysGuilty)}
                className="min-h-[40px] rounded-full border border-[#fb7185]/30 bg-[#fb7185]/10 text-[12px] font-black text-[#fda4af]"
              >
                Overrule
              </button>
            </div>
          </div>
        ) : phase === "done" ? (
          <div className="rounded-[16px] border border-white/8 bg-black/40 p-4 text-center">
            <Gavel size={22} className="mx-auto mb-1 text-[#4ade80]" />
            <p className="text-[14px] font-black text-white">Court adjourned</p>
            <p className="text-[11px] font-semibold text-[#7c8a80]">
              Archived to circle history.
            </p>
          </div>
        ) : null}
      </div>

      {/* ── footer: compose / locked + switch side ───────────── */}
      <footer className="px-4 pb-[calc(var(--safe-area-bottom)+10px)] pt-3">
        {isMyTurn ? (
          <div>
            <p className="mb-2 text-center text-[10px] font-semibold text-[#7c8a80]">
              Nobody sees it until you SLAM — then it hits the whole court
            </p>
            <div className="flex items-end gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-[22px] border border-[#4ade80]/40 bg-white/[0.04] px-3 py-2 shadow-[0_0_22px_rgba(74,222,128,0.16)]">
                <button
                  className="text-[#94a3b8] hover:text-white"
                  aria-label="Evidence"
                >
                  <Paperclip size={18} />
                </button>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && slam()}
                  placeholder="Type your argument…"
                  className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-white outline-none placeholder:text-[#5b6b60]"
                />
              </div>
              <button
                onClick={slam}
                disabled={!draft.trim()}
                className="flex h-[46px] shrink-0 items-center gap-1.5 rounded-full bg-[linear-gradient(135deg,#4ade80,#22c55e)] px-5 text-[14px] font-black text-black shadow-[0_16px_36px_rgba(74,222,128,0.28)] transition-all disabled:bg-none disabled:bg-[#161a16] disabled:text-[#64748b] disabled:shadow-none"
              >
                <Send size={16} /> SLAM
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-[22px] border border-white/8 bg-white/[0.04] px-4 py-3 text-[12px] font-semibold text-[#5b6b60]">
              🔒{" "}
              {phase === "done"
                ? "The trial has ended"
                : `Only ${activeSpeaker?.name ?? "the speaker"} can speak`}
            </div>
            {phase === "done" ? null : (
              <>
                <button
                  onClick={switchSide}
                  className="flex h-[46px] shrink-0 flex-col items-center justify-center rounded-full border border-white/10 bg-white/[0.05] px-4 text-[9px] font-black leading-tight text-white"
                >
                  <span>SWITCH</span>
                  <span>SIDE ⇄</span>
                </button>
                <button
                  onClick={advance}
                  className="flex h-[46px] shrink-0 items-center rounded-full bg-[linear-gradient(135deg,#4ade80,#22c55e)] px-4 text-[11px] font-black text-black"
                >
                  Next
                </button>
              </>
            )}
          </div>
        )}
      </footer>

      {/* cinematic GUILTY verdict takeover → hands off to the jail */}
      {showGuiltyTakeover && (
        <div className="pointer-events-none fixed inset-0 z-[12020] flex flex-col items-center justify-center bg-black/75 backdrop-blur-md">
          <div className="court-takeover flex flex-col items-center">
            <Gavel size={40} className="court-gavel-slam mb-3 text-[#facc15]" />
            <div className="rounded-[16px] border-[3px] border-[#fb7185] px-8 py-3 text-[28px] font-black tracking-[0.16em] text-[#fb7185] shadow-[0_0_50px_rgba(251,113,133,0.45)]">
              GUILTY
            </div>
            <p className="mt-3 text-[13px] font-black text-white">
              {DEFENSE[0].name} is sentenced to jail
            </p>
            <p className="mt-1 text-[11px] font-semibold text-[#94a3b8]">
              🚔 Taking {DEFENSE[0].name} into custody…
            </p>
          </div>
        </div>
      )}

      {/* cinematic "your turn" takeover */}
      {showTurnTakeover && (
        <div className="pointer-events-none fixed inset-0 z-[12010] flex flex-col items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="court-takeover flex flex-col items-center">
            <div className="mb-3 rounded-full bg-[#fb7185] px-6 py-3 text-[18px] font-black tracking-wide text-white shadow-[0_0_40px_rgba(251,113,133,0.6)]">
              IT'S YOUR TURN
            </div>
            <p className="text-[12px] font-semibold text-[#bbf7d0]">
              Make your case.
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes courtDots { 0%{opacity:.2} 50%{opacity:1} 100%{opacity:.2} }
        .court-dots::after { content: "…"; animation: courtDots 1.1s ease-in-out infinite; }
        @keyframes courtRevealIn {
          0% { opacity: 0; transform: translateY(8px) scale(0.97); }
          60% { opacity: 1; transform: translateY(-2px) scale(1.02); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .court-reveal { animation: courtRevealIn 0.4s cubic-bezier(0.16,1,0.3,1) both; }
        @keyframes courtTakeover {
          0% { opacity: 0; transform: scale(0.82); }
          50% { opacity: 1; transform: scale(1.06); }
          100% { opacity: 1; transform: scale(1); }
        }
        .court-takeover { animation: courtTakeover 0.5s cubic-bezier(0.16,1,0.3,1) both; }
        @keyframes courtGavelSlam {
          0% { transform: translateY(-26px) rotate(-42deg); }
          55% { transform: translateY(2px) rotate(8deg); }
          75% { transform: translateY(-4px) rotate(-4deg); }
          100% { transform: translateY(0) rotate(0); }
        }
        .court-gavel-slam { animation: courtGavelSlam 0.6s cubic-bezier(0.16,1,0.3,1) both; }
        @media (prefers-reduced-motion: reduce) {
          .court-reveal, .court-takeover { animation: none; }
        }
      `}</style>
    </div>
  );
}

export default FriendshipCourtScreen;
