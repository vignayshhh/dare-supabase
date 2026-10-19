"use client";

import { Send, Sparkles } from "lucide-react";

interface DareSentCinematicScreenProps {
  recipientLabel?: string;
  isExiting?: boolean;
}

export function DareSentCinematicScreen({
  recipientLabel,
  isExiting = false,
}: DareSentCinematicScreenProps) {
  const subtitle = recipientLabel
    ? `Your dare is now live for ${recipientLabel}.`
    : "Your dare is now live for your friend.";

  return (
    <div className="screen-container relative h-[100dvh] max-h-[100dvh] items-center justify-center overflow-hidden bg-[#050805]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-12%,rgba(251,113,133,0.2),transparent_34%),radial-gradient(circle_at_12%_18%,rgba(14,165,233,0.15),transparent_30%),linear-gradient(180deg,#0b0608_0%,#11090d_46%,#030403_100%)]" />
      <div
        className="relative z-10 flex h-full min-h-0 w-full flex-col items-center justify-center px-8 text-center"
        style={{
          animation: isExiting
            ? "dareSubmittedScreenOut 0.65s ease forwards"
            : "dareSubmittedScreenIn 0.72s cubic-bezier(0.22,1,0.36,1) forwards",
        }}
      >
        <div className="relative mx-auto mb-12 flex h-56 w-56 items-center justify-center sm:h-64 sm:w-64">
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,_rgba(251,113,133,0.24),_rgba(251,113,133,0.02)_65%,_transparent_72%)]" />
          <div className="absolute inset-2 rounded-full border border-[#fb7185]/35" />
          <div className="relative flex h-40 w-40 items-center justify-center rounded-full border border-[#fb7185]/45 bg-[linear-gradient(180deg,rgba(251,113,133,0.24),rgba(244,63,94,0.08))] shadow-[0_0_60px_rgba(251,113,133,0.22)]">
            <Send size={78} className="translate-x-1 text-[#fecdd3] sm:h-20 sm:w-20" />
          </div>
          <Sparkles size={26} className="absolute right-4 top-5 text-[#ffe4e6]" />
          <Sparkles size={20} className="absolute bottom-6 left-3 text-[#7dd3fc]" />
        </div>

        <div className="max-w-md rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(48,17,26,0.62),rgba(4,14,16,0.42))] px-6 py-5 shadow-[0_24px_70px_rgba(0,0,0,0.32)] backdrop-blur-md">
          <div className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full border border-[#fb7185]/25 bg-[#fb7185]/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#fecdd3]">
            <Sparkles size={13} />
            Sent
          </div>
          <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
            Dare Sent
          </h1>
          <p className="mt-4 text-base font-semibold leading-7 text-[#f5d5da] sm:text-lg">
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}

export default DareSentCinematicScreen;
