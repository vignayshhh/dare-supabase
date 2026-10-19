"use client";

import { X, Target, MessageSquare, Share2, ArrowRight, Users, Sparkles, Scale, Handshake, Wand2, Layers, Megaphone, HeartHandshake } from "lucide-react";
import { useState, useEffect } from "react";

type CreateAction = "truth" | "prediction" | "deal" | "custom" | "rumour" | "promise" | "dare" | "community-dare" | "feed" | "verdict";
type StepTrigger = "text-verdicts";
type ActionId = CreateAction | StepTrigger;

interface ActionPickerScreenProps {
  onClose: () => void;
  onSelectAction: (action: CreateAction) => void;
}

export function ActionPickerScreen({
  onClose,
  onSelectAction,
}: ActionPickerScreenProps) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<"root" | "dare" | "verdicts">("root");

  useEffect(() => {
    setMounted(true);
    requestAnimationFrame(() => setVisible(true));
    return () => setMounted(false);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const handleActionSelect = (action: CreateAction) => {
    setVisible(false);
    setTimeout(() => onSelectAction(action), 200);
  };

  if (!mounted) return null;
  const actions: Array<{
    id: ActionId;
    title: string;
    description: string;
    icon: typeof Layers;
    accent: string;
    background: string;
  }> = [
    {
      id: "text-verdicts",
      title: "Text Based Verdicts",
      description: "Truths, predictions, deals & custom cards",
      icon: Layers,
      accent: "#c084fc",
      background:
        "linear-gradient(135deg, rgba(192,132,252,0.16), rgba(96,165,250,0.06))",
    },
    {
      id: "dare",
      title: "Give a Dare",
      description: "Send or start a challenge",
      icon: Target,
      accent: "#fb7185",
      background:
        "linear-gradient(135deg, rgba(251,113,133,0.18), rgba(255,255,255,0.035))",
    },
    {
      id: "feed",
      title: "Post to Feed",
      description: "Share a moment",
      icon: Share2,
      accent: "#facc15",
      background:
        "linear-gradient(135deg, rgba(250,204,21,0.15), rgba(255,255,255,0.035))",
    },
    {
      id: "verdict",
      title: "Create Verdict",
      description: "Post a photo and make people choose",
      icon: Scale,
      accent: "#facc15",
      background:
        "linear-gradient(135deg, rgba(250,204,21,0.15), rgba(251,113,133,0.055))",
    },
  ];
  const verdictActions: Array<{
    id: ActionId;
    title: string;
    description: string;
    icon: typeof Layers;
    accent: string;
    background: string;
  }> = [
    {
      id: "truth",
      title: "Ask a Truth",
      description: "Start with a question",
      icon: MessageSquare,
      accent: "#60a5fa",
      background:
        "linear-gradient(135deg, rgba(96,165,250,0.16), rgba(255,255,255,0.035))",
    },
    {
      id: "prediction",
      title: "Make Prediction",
      description: "Call what happens next",
      icon: Sparkles,
      accent: "#c084fc",
      background:
        "linear-gradient(135deg, rgba(192,132,252,0.16), rgba(255,107,107,0.055))",
    },
    {
      id: "deal",
      title: "Make Deal",
      description: "Attach stakes to a future outcome",
      icon: Handshake,
      accent: "#facc15",
      background:
        "linear-gradient(135deg, rgba(255,179,71,0.18), rgba(255,107,107,0.07))",
    },
    {
      id: "rumour",
      title: "Drop a Rumour",
      description: "Spill it, friends vote believe or cap",
      icon: Megaphone,
      accent: "#fb7185",
      background:
        "linear-gradient(135deg, rgba(251,113,133,0.16), rgba(192,132,252,0.06))",
    },
    {
      id: "promise",
      title: "Make a Promise",
      description: "Put it on record, friends vote keep or break",
      icon: HeartHandshake,
      accent: "#38bdf8",
      background:
        "linear-gradient(135deg, rgba(56,189,248,0.16), rgba(255,107,107,0.06))",
    },
    {
      id: "custom",
      title: "Custom Card",
      description: "Write any prompt with any two sides",
      icon: Wand2,
      accent: "#38bdf8",
      background:
        "linear-gradient(135deg, rgba(56,189,248,0.16), rgba(192,132,252,0.065))",
    },
  ];
  const dareActions: Array<{
    id: ActionId;
    title: string;
    description: string;
    icon: typeof Layers;
    accent: string;
    background: string;
  }> = [
    {
      id: "dare" as const,
      title: "Dare a Friend",
      description: "Send a direct dare",
      icon: Target,
      accent: "#fb7185",
      background:
        "linear-gradient(135deg, rgba(251,113,133,0.18), rgba(255,255,255,0.035))",
    },
    {
      id: "community-dare" as const,
      title: "Start Community Dare",
      description: "Create a public run friends can join",
      icon: Users,
      accent: "#facc15",
      background:
        "linear-gradient(135deg, rgba(250,204,21,0.15), rgba(251,113,133,0.06))",
    },
  ];
  const visibleActions =
    step === "root" ? actions : step === "dare" ? dareActions : verdictActions;
  const stepTitle =
    step === "root"
      ? "Choose interaction"
      : step === "dare"
        ? "Give a dare"
        : "Text based verdicts";

  return (
    <div className="action-picker-screen fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes slideDown { from { transform: translateY(0); opacity: 1; } to { transform: translateY(100%); opacity: 0; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
        .modal-backdrop { animation: ${visible ? "fadeIn 0.3s ease-out" : "fadeOut 0.3s ease-in"} forwards; }
        .modal-content { animation: ${visible ? "slideUp 0.35s cubic-bezier(0.32,0.72,0,1)" : "slideDown 0.3s cubic-bezier(0.32,0.72,0,1)"} forwards; }
        .action-card { 
          opacity: 0; 
          transform: translateY(20px); 
          animation: ${visible ? "slideUp 0.4s ease-out forwards" : ""}; 
        }
        .action-card:nth-child(1) { animation-delay: 0.1s; }
        .action-card:nth-child(2) { animation-delay: 0.15s; }
        .action-card:nth-child(3) { animation-delay: 0.2s; }
        .action-card:nth-child(4) { animation-delay: 0.25s; }
        .action-card:nth-child(5) { animation-delay: 0.3s; }
        .action-card:nth-child(6) { animation-delay: 0.35s; }
        .action-picker-modal {
          width: min(100%, 460px) !important;
          margin: 0 !important;
          border-radius: 30px 30px 0 0 !important;
          max-height: min(82dvh, 720px);
        }
        .action-picker-modal > .relative {
          border: 1px solid rgba(255,255,255,.1) !important;
          border-radius: 30px 30px 0 0 !important;
          max-height: min(82dvh, 720px);
          overflow: hidden auto !important;
          overscroll-behavior: contain;
          background: linear-gradient(180deg, #181818 0%, #101010 54%, #0a0a0a 100%) !important;
          box-shadow: 0 -24px 72px rgba(0,0,0,.52), inset 0 1px 0 rgba(255,255,255,.06) !important;
        }
        .action-picker-grid { grid-template-columns: minmax(0, 1fr) !important; gap: 0 !important; }
        .action-picker-modal .action-picker-card {
          min-height: 76px;
          padding: 14px 2px !important;
          border: 0 !important;
          border-bottom: 1px solid rgba(255,255,255,.08) !important;
          border-radius: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
        }
        .action-picker-modal .action-picker-card:hover {
          background: rgba(255,255,255,.035) !important;
          border-color: rgba(255,255,255,.08) !important;
          transform: none !important;
        }
        .action-picker-modal .action-picker-card:active {
          transform: scale(.985) !important;
        }
        .action-picker-modal .action-picker-card h3 {
          font-size: 15px !important;
          letter-spacing: -.015em !important;
        }
        .action-picker-modal .action-picker-card p {
          color: rgba(255,229,223,.58) !important;
          font-size: 12px !important;
        }
        .action-picker-modal .action-picker-card > div {
          align-items: flex-start !important;
        }
        .action-picker-modal .action-picker-card > div > div:first-child {
          width: 44px !important;
          height: 44px !important;
          border-radius: 16px !important;
        }
        .action-picker-modal .action-picker-card > div > div:last-child {
          width: 28px !important;
          height: 28px !important;
          margin-left: auto;
          border: 0 !important;
          color: rgba(255,255,255,.42) !important;
          background: transparent !important;
        }
        @media (max-width: 420px) {
          .action-picker-modal .action-picker-card { min-height: 74px; }
          .action-picker-modal .action-picker-card > div > div:first-child { width: 36px !important; height: 36px !important; }
        }
        .action-picker-screen button:focus-visible {
          outline: 2px solid rgba(251,113,133,.92);
          outline-offset: 3px;
        }
      `}</style>

      <div
        className="app-modal-backdrop modal-backdrop absolute inset-0 bg-black/85 backdrop-blur-xl"
        onClick={handleClose}
        style={{
          background: "rgba(0,0,0,0.76)",
        }}
      />

      <div className="app-modal-sheet action-picker-modal modal-content relative w-full max-w-md">
        <button
          onClick={handleClose}
          className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/70 shadow-[0_12px_30px_rgba(0,0,0,0.28)] transition-colors hover:text-white"
          aria-label="Close"
        >
          <X size={19} />
        </button>

        <div className="relative overflow-x-hidden rounded-t-[30px] border border-white/10 bg-[#101010] p-5 shadow-[0_-24px_72px_rgba(0,0,0,0.52),inset_0_1px_0_rgba(255,255,255,0.06)]">
          <div className="action-picker-grabber mx-auto mb-5 h-1 w-10 rounded-full bg-white/20" />

          <div className="relative mb-5 pr-12">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#fb7185]">Start a moment</p>
            <h1 className="m-0 text-[30px] font-black leading-[0.94] tracking-[-0.055em] text-white">
              {stepTitle}
            </h1>
            <p className="mt-3 max-w-[30ch] text-[13px] font-semibold leading-5 text-white/42">
              {step === "root"
                ? "Pick a lane. Your friends see what happens next."
                : step === "dare"
                  ? "Choose who gets the challenge."
                  : "Turn one thought into a room people can react to."}
            </p>
            {step !== "root" && (
              <button
                type="button"
                onClick={() => setStep("root")}
                className="mt-3 text-[12px] font-black uppercase tracking-[0.14em] text-[#facc15]"
              >
                Back to options
              </button>
            )}
          </div>

          <div className="action-picker-grid relative grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visibleActions.map((action, index) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={() => {
                  if (step === "root" && action.id === "dare") {
                    setStep("dare");
                    return;
                  }
                  if (step === "root" && action.id === "text-verdicts") {
                    setStep("verdicts");
                    return;
                  }
                  handleActionSelect(action.id as CreateAction);
                }}
                className="action-card action-picker-card group w-full overflow-hidden rounded-[22px] border border-white/8 p-4 text-left shadow-[0_14px_34px_rgba(18,4,10,0.26),inset_0_1px_0_rgba(255,255,255,0.045)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#fb7185]/40"
                style={{
                  animationDelay: `${0.1 + index * 0.05}s`,
                  background: action.background,
                  borderLeft: `3px solid ${action.accent}`,
                }}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border transition-transform duration-200 group-hover:scale-105"
                    style={{
                      color: action.accent,
                      background: `${action.accent}14`,
                      borderColor: `${action.accent}28`,
                      boxShadow: `0 0 24px ${action.accent}18`,
                    }}
                  >
                    <Icon size={22} strokeWidth={2.4} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="mb-1 text-[17px] font-extrabold tracking-[-0.02em] text-white">
                      {action.title}
                    </h3>
                    <p className="text-sm font-medium text-white/42">
                      {action.description}
                    </p>
                  </div>
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/[0.035] text-white/42 transition-colors group-hover:text-white"
                    style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}
                  >
                    <ArrowRight size={17} />
                  </div>
                </div>
              </button>
            );
          })}
          </div>
        </div>
      </div>
    </div>
  );
}
