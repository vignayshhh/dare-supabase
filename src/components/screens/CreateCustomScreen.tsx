"use client";

import { useState } from "react";
import { ArrowLeft, Check, Sparkles, Wand2 } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore-v2";
import {
  type CustomScope,
  useDramaStore,
} from "@/stores/useDramaStore";

const SIDE_PRESETS = [
  ["Obviously", "Delusional"],
  ["Survivor", "First To Die"],
  ["Chef's Kiss", "Call The Barber"],
  ["Built Different", "Immediate Chaos"],
] as const;

export function CreateCustomScreen({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated?: () => void;
}) {
  const { user } = useAuthStore();
  const createCustom = useDramaStore((state) => state.createCustom);
  const [statement, setStatement] = useState("");
  const [choiceOneText, setChoiceOneText] = useState("");
  const [choiceTwoText, setChoiceTwoText] = useState("");
  const [toneLabel, setToneLabel] = useState("inside joke");
  const [scope, setScope] = useState<CustomScope>("friends");
  const [status, setStatus] = useState<"idle" | "posted">("idle");

  const canPost =
    Boolean(user?.id) &&
    statement.trim().length > 0 &&
    choiceOneText.trim().length > 0 &&
    choiceTwoText.trim().length > 0;

  const handleSubmit = () => {
    if (!user?.id || !canPost) return;

    createCustom({
      statement,
      choiceOneText,
      choiceTwoText,
      toneLabel,
      scope,
      creator: {
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
  };

  return (
    <div className="custom-create-screen h-dvh overflow-y-auto overscroll-contain text-white">
      <style>{`
        .custom-create-screen {
          background:
            radial-gradient(circle at 50% -12%, rgba(45,212,191,0.2), transparent 32%),
            radial-gradient(circle at 10% 18%, rgba(250,204,21,0.11), transparent 28%),
            radial-gradient(circle at 92% 12%, rgba(251,113,133,0.12), transparent 26%),
            linear-gradient(180deg, #050806 0%, #071211 46%, #030403 100%);
          font-family: var(--font-ui);
        }
      `}</style>

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
            <p className="m-0 text-[11px] font-black uppercase tracking-[0.18em] text-[#5eead4]">
              Custom
            </p>
            <h1 className="m-0 text-[28px] font-black leading-none tracking-[-0.03em]">
              Make any card
            </h1>
          </div>
        </div>

        <div className="space-y-4">
          <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,24,22,0.94),rgba(5,8,8,0.98))] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.06)]">
            <div className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] text-white/42">
              <Wand2 size={15} className="text-[#5eead4]" />
              Statement
            </div>
            <textarea
              value={statement}
              onChange={(event) => setStatement(event.target.value)}
              placeholder="Revanth is secretly Batman."
              maxLength={150}
              className="min-h-[138px] w-full resize-none rounded-[22px] border border-white/8 bg-black/24 px-4 py-4 text-[22px] font-black leading-[1.12] tracking-[-0.01em] text-white outline-none placeholder:text-white/24 focus:border-[#2dd4bf]/36"
            />
            <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-white/32">
              <span>One sentence. Two sides. Instant room lore.</span>
              <span>{statement.trim().length}/150</span>
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,24,22,0.92),rgba(5,8,8,0.97))] p-4 shadow-[0_18px_54px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] text-white/42">
              <Sparkles size={15} className="text-[#facc15]" />
              Button sides
            </div>
            <div className="grid gap-3">
              <input
                value={choiceOneText}
                onChange={(event) => setChoiceOneText(event.target.value)}
                placeholder="Obviously"
                maxLength={32}
                className="h-[52px] w-full rounded-[18px] border border-[#2dd4bf]/18 bg-[#2dd4bf]/9 px-4 text-[15px] font-black text-white outline-none placeholder:text-white/25 focus:border-[#2dd4bf]/42"
              />
              <input
                value={choiceTwoText}
                onChange={(event) => setChoiceTwoText(event.target.value)}
                placeholder="Delusional"
                maxLength={32}
                className="h-[52px] w-full rounded-[18px] border border-[#fb7185]/18 bg-[#fb7185]/9 px-4 text-[15px] font-black text-white outline-none placeholder:text-white/25 focus:border-[#fb7185]/42"
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {SIDE_PRESETS.map(([left, right]) => (
                <button
                  key={`${left}-${right}`}
                  type="button"
                  onClick={() => {
                    setChoiceOneText(left);
                    setChoiceTwoText(right);
                  }}
                  className="rounded-[16px] border border-white/8 bg-white/[0.04] px-3 py-2 text-left text-[11px] font-black uppercase leading-tight tracking-[0.06em] text-white/56"
                >
                  {left} / {right}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,24,22,0.9),rgba(5,8,8,0.96))] p-4">
            <div className="mb-3 text-[12px] font-black uppercase tracking-[0.14em] text-white/42">
              Room type
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-[18px] border border-white/8 bg-black/20 p-1.5">
              {(["friends", "topics", "community"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setScope(item)}
                  className={`rounded-[14px] px-2 py-2.5 text-[11px] font-black capitalize transition-all ${
                    scope === item
                      ? "bg-[linear-gradient(135deg,#2dd4bf,#a3e635)] text-[#031014] shadow-[0_8px_22px_rgba(45,212,191,0.22)]"
                      : "text-white/45"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
            <input
              value={toneLabel}
              onChange={(event) => setToneLabel(event.target.value)}
              placeholder="inside joke"
              maxLength={28}
              className="mt-3 h-[50px] w-full rounded-[18px] border border-white/8 bg-black/24 px-4 text-[14px] font-black text-white outline-none placeholder:text-white/25 focus:border-[#facc15]/34"
            />
          </section>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/8 bg-[linear-gradient(180deg,rgba(5,7,5,0.82),rgba(5,7,5,0.98))] px-4 pb-[calc(16px+var(--safe-area-bottom))] pt-4 backdrop-blur-xl">
          <button
            type="button"
            disabled={!canPost || status === "posted"}
            onClick={handleSubmit}
            className={`flex h-14 w-full items-center justify-center gap-2 rounded-full text-[15px] font-black uppercase tracking-[0.08em] transition-all ${
              canPost
                ? "bg-[linear-gradient(135deg,#2dd4bf,#a3e635)] text-[#031014] shadow-[0_12px_30px_rgba(45,212,191,0.24)]"
                : "bg-white/[0.06] text-white/35"
            }`}
          >
            {status === "posted" ? <Check size={19} /> : <Wand2 size={18} />}
            {status === "posted" ? "Posted" : "Post Custom"}
          </button>
        </div>
      </div>
    </div>
  );
}
