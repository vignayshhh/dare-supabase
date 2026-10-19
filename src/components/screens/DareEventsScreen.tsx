"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  MessageSquare,
  Scale,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useJailStore } from "@/stores/useJailStore";

const DARE_EVENT_MOCKS = [
  {
    id: "friendship-court",
    title: "Friendship Court",
    eyebrow: "Live trial",
    body: "Put a friend on trial. Timed speaking rounds, live vote shifts, a judge verdict, and a jail sentence.",
    accent: "#c084fc",
    Icon: Scale,
    stats: ["20 min", "Judge + jury"],
  },
  {
    id: "roast-rooms",
    title: "Roast rooms",
    eyebrow: "Room battle",
    body: "Enter a live room where friends roast prompts, posts, and dares with timed rounds.",
    accent: "#38bdf8",
    Icon: MessageSquare,
    stats: ["Live room", "3 rounds"],
  },
  {
    id: "prank-friend",
    title: "Prank a friend",
    eyebrow: "Chaos event",
    body: "Send a harmless prank dare, collect proof, and let friends vote if the setup landed.",
    accent: "#5eead4",
    Icon: Sparkles,
    stats: ["2h window", "Proof vote"],
  },
  {
    id: "impersonate-friend",
    title: "Impersonate a friend",
    eyebrow: "Acting dare",
    body: "Copy a friend's texting style, pose, or signature habit and let the room guess who.",
    accent: "#86efac",
    Icon: UserRound,
    stats: ["Guessing", "Style points"],
  },
];

function fmtJailClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function JailHeaderButton({ onOpenJail }: { onOpenJail?: () => void }) {
  const session = useJailStore((s) => s.session);
  if (!session) return null;

  return (
    <button
      type="button"
      onClick={onOpenJail}
      aria-label={`${session.prisoner.name} is in jail`}
      className="app-pressable relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/[0.065] text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4ade80]"
    >
      <span className="text-[15px] font-black text-white/90">
        {session.prisoner.name.charAt(0)}
      </span>
      <span className="pointer-events-none absolute inset-x-2.5 inset-y-1.5 flex justify-between opacity-55">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-full w-px rounded-full bg-white"
          />
        ))}
      </span>
      <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#050705] bg-[#4ade80]" />
    </button>
  );
}

function LiveJailCard({ onOpenJail }: { onOpenJail?: () => void }) {
  const session = useJailStore((s) => s.session);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!session) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [session]);

  if (!session) return null;
  const remaining = Math.max(0, session.startedAt + session.sentenceMs - now);
  const expired = remaining <= 0 || session.released;

  return (
    <button
      type="button"
      onClick={onOpenJail}
      className="dare-events-item app-pressable relative mb-3 w-full overflow-hidden rounded-[24px] border border-[#4ade80]/18 bg-[#0e120f] p-4 text-left transition-[transform,border-color] duration-200 active:scale-[0.995] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4ade80]"
    >
      <div className="relative z-10 flex items-center gap-3">
        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[17px] bg-white/[0.055]">
          <span className="text-[22px]">{expired ? "🎉" : "😔"}</span>
          <div className="pointer-events-none absolute inset-x-2 inset-y-1.5 flex justify-between opacity-45">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="h-full w-px rounded-full bg-white"
              />
            ))}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#72e994]">
            {expired ? "Release pending" : "Live · Circle jail"}
          </p>
          <h2 className="mt-1 truncate text-[17px] font-black leading-tight tracking-[-0.015em] text-white">
            {session.prisoner.name} is {expired ? "walking free" : "in jail"}
          </h2>
          <p className="mt-1 truncate text-[11px] font-semibold text-white/38">
            {expired
              ? "Sentence complete — witness the release"
              : `${session.crime} · visit, leave a rose, tap the bars`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-[14px] font-black leading-none tabular-nums text-white">
            {expired ? "00:00:00" : fmtJailClock(remaining)}
          </p>
          <p className="mt-1.5 text-[8px] font-black uppercase tracking-[0.12em] text-white/28">
            {expired ? "served" : "remaining"}
          </p>
        </div>
      </div>
    </button>
  );
}

export function DareEventsScreen({
  onClose,
  onOpenDareCenter,
  onOpenRoastRoom,
  onOpenFriendshipCourt,
  onOpenJail,
}: {
  onClose: () => void;
  onOpenDareCenter: () => void;
  onOpenRoastRoom?: () => void;
  onOpenFriendshipCourt?: () => void;
  onOpenJail?: () => void;
}) {
  return (
    <div className="dare-events-screen fixed inset-0 z-[145] overflow-hidden bg-[#050705] text-white">
      <style>{`
        @keyframes dareEventsEnter {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .dare-events-screen::before {
          content: "";
          position: absolute;
          inset: 0;
          opacity: 0.14;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.95' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.12'/%3E%3C/svg%3E");
          pointer-events: none;
        }
        .dare-events-item {
          animation: dareEventsEnter 0.38s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .dare-events-item { animation: none; }
        }
      `}</style>

      <div className="relative z-10 h-full overflow-y-auto overflow-x-hidden">
        <header className="px-5 pb-5 pt-[calc(var(--safe-area-top)+14px)]">
          <div className="mx-auto max-w-2xl">
            <div className="mb-7 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                aria-label="Back"
                className="app-pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.055] text-white/64 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4ade80]"
              >
                <ChevronLeft size={21} strokeWidth={2.3} />
              </button>

              <div className="flex items-center gap-2">
                <JailHeaderButton onOpenJail={onOpenJail} />
                <button
                  type="button"
                  onClick={onOpenDareCenter}
                  className="app-pressable flex min-h-11 items-center gap-2 rounded-full bg-white/[0.055] px-4 text-[12px] font-black text-white/68 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4ade80]"
                  aria-label="Open Dare Center"
                >
                  Dare center
                  <ArrowRight size={15} strokeWidth={2.5} />
                </button>
              </div>
            </div>

            <div className="flex items-end justify-between gap-5">
              <div className="min-w-0">
                <p className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#72e994]">
                  Mock season
                </p>
                <h1 className="text-[38px] font-black leading-[0.95] tracking-[-0.045em] text-white">
                  Event rooms
                </h1>
                <p className="mt-3 max-w-[280px] text-[13px] font-semibold leading-5 text-white/38">
                  Pick a social dare format before it goes live.
                </p>
              </div>
              <div className="shrink-0 pb-0.5 text-right">
                <p className="font-mono text-[22px] font-black leading-none tabular-nums text-white">
                  {String(DARE_EVENT_MOCKS.length).padStart(2, "0")}
                </p>
                <p className="mt-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-white/28">
                  rooms
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 pb-[calc(var(--safe-area-bottom)+24px)]">
          <div className="mx-auto max-w-2xl">
            <LiveJailCard onOpenJail={onOpenJail} />

            <section className="space-y-3" aria-label="Available event rooms">
              {DARE_EVENT_MOCKS.map((event, index) => {
                const EventIcon = event.Icon;
                const canOpen =
                  event.id === "friendship-court" || event.id === "roast-rooms";
                const openHandler =
                  event.id === "friendship-court"
                    ? onOpenFriendshipCourt
                    : event.id === "roast-rooms"
                      ? onOpenRoastRoom
                      : undefined;

                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={openHandler}
                    aria-disabled={!canOpen}
                    className={`dare-events-item app-pressable group relative w-full overflow-hidden rounded-[24px] border p-4 text-left transition-[transform,border-color,background-color] duration-200 active:scale-[0.995] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4ade80] ${
                      canOpen
                        ? "border-white/9 bg-[#0e110e] hover:border-[#4ade80]/24 hover:bg-[#101510]"
                        : "border-white/7 bg-[#0b0e0b]"
                    }`}
                    style={{ animationDelay: `${Math.min(index, 5) * 35}ms` }}
                  >
                    {canOpen && (
                      <span className="absolute bottom-0 left-5 right-5 h-px bg-[#4ade80]/55" />
                    )}

                    <div className="flex items-start gap-3.5">
                      <span
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] ${
                          canOpen
                            ? "bg-[#4ade80]/11 text-[#72e994]"
                            : "bg-white/[0.045] text-white/36"
                        }`}
                      >
                        <EventIcon size={21} strokeWidth={2.15} />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className={`text-[10px] font-black uppercase tracking-[0.15em] ${
                              canOpen ? "text-[#72e994]" : "text-white/28"
                            }`}>
                              {event.eyebrow}
                            </p>
                            <h2 className="mt-1 text-[21px] font-black leading-tight tracking-[-0.025em] text-white">
                              {event.title}
                            </h2>
                          </div>
                          <span className="font-mono text-[11px] font-bold tabular-nums text-white/20">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                        </div>

                        <p className="mt-2 max-w-[34rem] text-[13px] font-medium leading-[1.55] text-white/42">
                          {event.body}
                        </p>

                        <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/7 pt-3.5">
                          <p className="truncate text-[11px] font-bold text-white/34">
                            {event.stats.join(" · ")}
                          </p>
                          <span className={`inline-flex shrink-0 items-center gap-1.5 text-[11px] font-black ${
                            canOpen ? "text-[#72e994]" : "text-white/26"
                          }`}>
                            {canOpen ? "Open room" : "Coming soon"}
                            {canOpen && (
                              <ArrowRight
                                size={14}
                                strokeWidth={2.5}
                                className="transition-transform duration-200 group-hover:translate-x-0.5"
                              />
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
