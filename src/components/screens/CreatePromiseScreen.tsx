"use client";

import { useCirclesStore } from "@/stores/useCirclesStore";
import { getChatSource } from "@/lib/chatContext";
import { ChatSourceQuote } from "../circles/CircleChatScreen";

import { useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  HeartHandshake,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore-v2";
import {
  type PromiseAudience,
  useDramaStore,
} from "@/stores/useDramaStore";

function defaultDueValue() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(21, 0, 0, 0);
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function safeDueIso(value: string) {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
    return parsed.toISOString();
  }
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

export function CreatePromiseScreen({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated?: () => void;
}) {
  const { user } = useAuthStore();
  const circle = useCirclesStore(state => state.circles.find(c => c.id === state.activeId));
  const [targetId, setTargetId] = useState("");
  const createPromise = useDramaStore((state) => state.createPromise);
  const [audience, setAudience] = useState<PromiseAudience>("self");
  const [promiseText, setPromiseText] = useState(() => getChatSource()?.body.slice(0, 280) || "");
  const [targetLabel, setTargetLabel] = useState("");
  const [dueAt, setDueAt] = useState(defaultDueValue);
  const [status, setStatus] = useState<"idle" | "sending" | "posted">("idle");

  const [submitError, setSubmitError] = useState("");
  const canPost =
    status === "idle" &&
    Boolean(user?.id) &&
    promiseText.trim().length > 0 &&
    dueAt.trim().length > 0 && (audience !== "friend" || Boolean(targetId));

  const handleSubmit = async () => {
    if (!user?.id || !canPost) return;
    setStatus("sending");
    setSubmitError("");
    try {
    await createPromise({
      promise: promiseText,
      audience,
      dueAt: safeDueIso(dueAt),
      targetLabel: audience === "friend" ? circle?.members.find(m => m.id === targetId)?.name || targetLabel : targetLabel,
      targetId: audience === "friend" ? targetId : undefined,
      maker: {
        id: user.id,
        name: user.displayName || user.username || "You",
        username: user.username,
        avatar: user.avatar || "",
      },
    });
    setStatus("posted");
    window.setTimeout(() => {
      onCreated?.();
    }, 520);
    } catch (error) {
      setStatus("idle");
      setSubmitError(error instanceof Error ? error.message : "Could not save. Try again.");
    }
  };

  return (
    <div className="promise-create-screen h-dvh overflow-y-auto overscroll-contain text-white">
      <style>{`
        .promise-create-screen {
          background:
            radial-gradient(circle at 50% -14%, rgba(56,189,248,0.2), transparent 34%),
            radial-gradient(circle at 12% 16%, rgba(74,222,128,0.12), transparent 28%),
            radial-gradient(circle at 92% 8%, rgba(192,132,252,0.1), transparent 24%),
            linear-gradient(180deg, #050708 0%, #061014 48%, #030304 100%);
          font-family: var(--font-ui);
        }
      `}</style>

      {submitError && <p role="alert" className="px-4 text-sm text-rose-300">{submitError}</p>}
      {getChatSource() && <ChatSourceQuote source={getChatSource()!} />}
      <div className="px-4 pb-[calc(124px+var(--safe-area-bottom))] pt-[calc(16px+var(--safe-area-top))]">
        <div className="mb-5 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/80 shadow-[0_12px_30px_rgba(0,0,0,0.28)]"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <p className="m-0 text-[11px] font-black uppercase tracking-[0.18em] text-[#7dd3fc]">
              Promise
            </p>
            <h1 className="m-0 text-[28px] font-black leading-none">
              Put it on record
            </h1>
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,24,28,0.94),rgba(6,9,11,0.98))] p-4 shadow-[0_18px_54px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] text-white/42">
              <HeartHandshake size={15} className="text-[#7dd3fc]" />
              The promise
            </div>
            <textarea
              value={promiseText}
              onChange={(e) => setPromiseText(e.target.value)}
              placeholder="I promise to..."
              maxLength={280}
              className="min-h-[120px] w-full resize-none rounded-[22px] border border-white/8 bg-black/24 px-4 py-4 text-[20px] font-black leading-[1.16] text-white outline-none placeholder:text-white/24 focus:border-[#38bdf8]/35"
            />
          </section>

          <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,24,28,0.94),rgba(6,9,11,0.98))] p-4 shadow-[0_18px_54px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] text-white/42">
              <Users size={15} className="text-[#7dd3fc]" />
              Who is it to?
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([
                ["self", UserRound, "Myself"],
                ["friend", HeartHandshake, "A friend"],
                ["crew", Sparkles, "The crew"],
              ] as const).map(([itemAudience, Icon, label]) => (
                <button
                  key={itemAudience}
                  type="button"
                  onClick={() => setAudience(itemAudience)}
                  className={`flex flex-col items-center gap-1.5 rounded-[18px] border px-2 py-3 text-[12px] font-black transition-all ${
                    audience === itemAudience
                      ? "border-[#38bdf8]/36 bg-[#38bdf8]/12 text-white"
                      : "border-white/8 bg-white/[0.035] text-white/52"
                  }`}
                >
                  <Icon size={18} className="text-[#7dd3fc]" />
                  {label}
                </button>
              ))}
            </div>

            {audience === "friend" && <select aria-label="Promise recipient" className="mt-3 w-full rounded-xl bg-zinc-900 p-3 text-white" value={targetId} onChange={e => setTargetId(e.target.value)}><option value="">Choose a Circle member</option>{circle?.members.filter(m => m.id !== user?.id).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
            {audience === "crew" && (
              <input
                value={targetLabel}
                onChange={(e) => setTargetLabel(e.target.value)}
                placeholder={audience === "crew" ? "the crew" : "who is it to?"}
                maxLength={80}
                className="mt-3 h-13 w-full rounded-[18px] border border-white/8 bg-black/24 px-4 text-[15px] font-bold text-white outline-none placeholder:text-white/25 focus:border-[#38bdf8]/35"
              />
            )}
          </section>

          <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,24,28,0.92),rgba(6,9,11,0.97))] p-4 shadow-[0_18px_54px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] text-white/42">
              <CalendarClock size={15} className="text-[#facc15]" />
              Due by
            </div>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="h-[52px] w-full rounded-[18px] border border-white/8 bg-black/24 px-4 text-[15px] font-black text-white outline-none [color-scheme:dark] focus:border-[#facc15]/36"
            />
          </section>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/8 bg-[linear-gradient(180deg,rgba(5,7,8,0.82),rgba(5,7,8,0.98))] px-4 pb-[calc(16px+var(--safe-area-bottom))] pt-4 backdrop-blur-xl">
          <button
            type="button"
            disabled={!canPost}
            onClick={handleSubmit}
            className={`flex h-14 w-full items-center justify-center gap-2 rounded-full text-[15px] font-black uppercase tracking-[0.08em] transition-all ${
              canPost
                ? "bg-[linear-gradient(135deg,#38bdf8,#0ea5e9)] text-[#04121a] shadow-[0_12px_30px_rgba(56,189,248,0.28)]"
                : "bg-white/[0.06] text-white/35"
            }`}
          >
            {status === "posted" ? <Check size={19} /> : <HeartHandshake size={18} />}
            {status === "posted" ? "Posted" : "Post Promise"}
          </button>
        </div>
      </div>
    </div>
  );
}
