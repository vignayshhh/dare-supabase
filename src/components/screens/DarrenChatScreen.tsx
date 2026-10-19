"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  MessageCircleQuestion,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import {
  DARREN_CONVERSATION_ID,
  type DarrenChatMessage,
  type DarrenUserContext,
} from "@/lib/darren";
import { generateLocalDarrenReply } from "@/lib/darrenLocalBrain";
import { useAuthStore } from "@/stores/useAuthStore-v2";
import { useMessagingStore } from "@/stores/useMessagingStore";

function createMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function storageKey(userId: string): string {
  return `darren_chat:${userId}:${DARREN_CONVERSATION_ID}`;
}

function openedKey(userId: string): string {
  return `darren_opened:${userId}:${localDateKey()}`;
}

function sanitizeStoredMessages(value: string | null): DarrenChatMessage[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (message) =>
        message &&
        (message.from === "user" || message.from === "darren") &&
        typeof message.text === "string" &&
        typeof message.createdAt === "string",
    );
  } catch {
    return [];
  }
}

function getSamplePrompts(context: DarrenUserContext | null): string[] {
  const friend = context?.friend_most_interacted || context?.friends_list[0];
  const samples = [
    "I'm bored. Start something.",
    "Should I text them?",
    "Say something weird about tonight.",
    "Judge my energy right now.",
  ];

  if (context?.dark_hours_active) samples.unshift("Dark Hours report.");
  if (context?.daily_challenge_match) {
    samples.unshift(`What should I ask ${context.daily_challenge_match}?`);
  }
  if (friend) {
    samples.push(`What should I say to ${friend}?`);
    samples.push(`I think ${friend} is acting different.`);
  }
  if (!context?.darren_pardon_used_this_week)
    samples.push("Can you pardon me?");

  return [...new Set(samples)].slice(0, 8);
}

function getDarrenAvatarSrc(context: DarrenUserContext | null): string {
  return "/avatars/darren-soft-menace.svg";
}

export function DarrenChatScreen({ onBack }: { onBack?: () => void }) {
  const { user } = useAuthStore();
  const conversations = useMessagingStore((state) => state.conversations);
  const [messages, setMessages] = useState<DarrenChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [context, setContext] = useState<DarrenUserContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vpHeight, setVpHeight] = useState(
    typeof window !== "undefined"
      ? (window.visualViewport?.height ?? window.innerHeight)
      : 800,
  );
  const [vpOffsetTop, setVpOffsetTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bootedRef = useRef(false);

  const userId = user?.id || "";
  const contextLine = useMemo(() => {
    if (!context) return "Watching the room";
    if (context.dark_hours_active) return "Dark Hours active";
    if (context.daily_challenge_match) {
      return `Match: ${context.daily_challenge_match}`;
    }
    if (context.dare_streak > 0) return `${context.dare_streak} day streak`;
    return "No streak on record";
  }, [context]);
  const samplePrompts = useMemo(() => getSamplePrompts(context), [context]);
  const darrenAvatarSrc = useMemo(() => getDarrenAvatarSrc(context), [context]);
  const localBrainContext = useMemo(() => {
    const friendNames = conversations
      .map((conversation: any) =>
        String(
          conversation.other_user?.display_name ||
            conversation.other_user?.displayName ||
            conversation.other_user?.username ||
            "",
        ).replace(/^@/, ""),
      )
      .filter(Boolean)
      .slice(0, 12);
    const now = new Date();
    const darkHoursActive = now.getHours() >= 21 || now.getHours() < 5;

    return {
      username: user?.displayName || user?.username || "",
      dark_hours_active: darkHoursActive,
      exposed_tonight: darkHoursActive,
      friends_list: friendNames,
      friend_most_interacted: friendNames[0] || "",
      friend_least_interacted: friendNames[friendNames.length - 1] || "",
      messages_sent_today: messages.filter((message) => message.from === "user")
        .length,
    };
  }, [
    conversations,
    messages,
    user?.displayName,
    user?.username,
  ]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    setMessages(
      sanitizeStoredMessages(localStorage.getItem(storageKey(userId))),
    );
  }, [userId]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    localStorage.setItem(
      storageKey(userId),
      JSON.stringify(messages.slice(-80)),
    );
  }, [messages, userId]);

  const scrollChatToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior,
      });
    },
    [],
  );

  useEffect(() => {
    scrollChatToBottom("smooth");
  }, [messages, sending, scrollChatToBottom]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const viewport = window.visualViewport;
    const updateViewport = () => {
      setVpHeight(viewport ? viewport.height : window.innerHeight);
      setVpOffsetTop(viewport ? viewport.offsetTop : 0);
      requestAnimationFrame(() => scrollChatToBottom("auto"));
    };

    if (viewport) {
      viewport.addEventListener("resize", updateViewport);
      viewport.addEventListener("scroll", updateViewport);
    } else {
      window.addEventListener("resize", updateViewport);
      window.addEventListener("orientationchange", updateViewport);
    }

    updateViewport();
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      if (viewport) {
        viewport.removeEventListener("resize", updateViewport);
        viewport.removeEventListener("scroll", updateViewport);
      } else {
        window.removeEventListener("resize", updateViewport);
        window.removeEventListener("orientationchange", updateViewport);
      }
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [scrollChatToBottom]);

  const requestDarrenReply = useCallback(
    async (messageText: string, nextHistory: DarrenChatMessage[]) => {
      if (!userId) return;
      setSending(true);
      setError(null);
      try {
        const wordCount = messageText.trim()
          ? messageText.trim().split(/\s+/).length
          : 1;
        const readingDelay = wordCount * 120 + messageText.length * 14;
        const thinkingDelay = 1150 + Math.random() * 850;
        const delayMs = Math.min(4200, thinkingDelay + readingDelay);
        window.setTimeout(() => {
          const response = generateLocalDarrenReply({
            context: localBrainContext,
            userMessage: messageText,
            history: nextHistory.slice(-16),
          });
          const reply: DarrenChatMessage = {
            id: createMessageId("darren"),
            from: "darren",
            text: response.reply,
            createdAt: new Date().toISOString(),
          };
          setContext(response.context);
          setMessages((current) => [...current, reply]);
          setSending(false);
        }, delayMs);
      } catch (requestError) {
        console.error("[DarrenChat] reply failed:", requestError);
        setError("Darren went quiet. Try again.");
        setSending(false);
      }
    },
    [localBrainContext, userId],
  );

  useEffect(() => {
    if (!userId || bootedRef.current || typeof window === "undefined") return;
    bootedRef.current = true;
    const key = openedKey(userId);
    if (localStorage.getItem(key) === "1") return;
    localStorage.setItem(key, "1");
    void requestDarrenReply(
      "",
      sanitizeStoredMessages(localStorage.getItem(storageKey(userId))),
    );
  }, [requestDarrenReply, userId]);

  const sendText = async (rawText: string) => {
    const text = rawText.trim();
    if (!text || sending || !userId) return;
    const userMessage: DarrenChatMessage = {
      id: createMessageId("user"),
      from: "user",
      text,
      createdAt: new Date().toISOString(),
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    await requestDarrenReply(text, nextMessages);
  };

  const sendMessage = async () => {
    await sendText(input);
  };

  const quickActions = [
    {
      label: "Pardon",
      prompt: "Can you pardon me tonight?",
      icon: <ShieldCheck size={17} />,
    },
    {
      label: "Dare",
      prompt: "Give me a dare.",
      icon: <Zap size={17} />,
    },
    {
      label: "Truth",
      prompt: "Give me a truth question.",
      icon: <MessageCircleQuestion size={17} />,
    },
    {
      label: "Sus",
      prompt: "Tell me the sus activity around me.",
      icon: <Search size={17} />,
    },
    {
      label: "Vibe",
      prompt: "What is the vibe around me right now?",
      icon: <Users size={17} />,
    },
  ];

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden"
      style={{
        position: "relative",
        top: vpOffsetTop,
        height: `${vpHeight}px`,
        fontFamily:
          "var(--font-ui)",
        background:
          "radial-gradient(circle at 50% -12%, rgba(74,222,128,0.18), transparent 34%), radial-gradient(circle at 18% 22%, rgba(14,165,233,0.12), transparent 30%), linear-gradient(180deg, #060806 0%, #0a0f0a 50%, #030403 100%)",
      }}
    >
      <style>{`
        @keyframes darrenTypingDot {
          0%, 76%, 100% { transform: translateY(0) scale(0.82); opacity: 0.28; }
          38% { transform: translateY(-2px) scale(1); opacity: 0.92; }
        }
      `}</style>
      <div
        className="shrink-0 px-4"
        style={{ paddingTop: "calc(var(--safe-area-top) + 12px)" }}
      >
        <div className="relative overflow-hidden rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,rgba(16,22,17,0.96),rgba(8,12,9,0.98))] p-3 shadow-[0_22px_64px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.78),rgba(74,222,128,0))]" />
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              aria-label="Back"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] border border-white/8 bg-white/[0.045] text-[#94a3b8] transition-colors hover:border-[#4ade80]/35 hover:text-white"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[22px] border border-[#4ade80]/30 bg-[#07100b] text-[#86efac] shadow-[0_0_28px_rgba(74,222,128,0.16)]">
              <img
                src={darrenAvatarSrc}
                alt="Darren"
                className="h-full w-full object-cover"
              />
              <span className="absolute bottom-2 right-2 h-2.5 w-2.5 rounded-full bg-[#4ade80] shadow-[0_0_12px_rgba(74,222,128,0.7)]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-[23px] font-black leading-none text-white">
                  Darren
                </h1>
                <Shield size={15} className="shrink-0 text-[#86efac]" />
              </div>
              <p className="mt-1 truncate text-[12px] font-bold uppercase tracking-[0.14em] text-[#64748b]">
                {contextLine}
              </p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border border-white/8 bg-white/[0.045] text-[#86efac]">
              <Sparkles size={18} />
            </div>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4"
        data-darren-scroll
        style={{ scrollbarWidth: "none" }}
      >
        <div className="flex min-h-full flex-col justify-end gap-3">
          {messages.length <= 1 ? (
            <>
              <div className="mb-1 grid grid-cols-2 gap-2">
                {samplePrompts.slice(0, 4).map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={sending}
                    onClick={() => void sendText(prompt)}
                    className="min-h-[58px] rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.032))] px-3 text-left text-[13px] font-extrabold leading-snug text-[#e5e7eb] shadow-[0_12px_28px_rgba(0,0,0,0.2)] transition-transform active:scale-[0.98] disabled:opacity-45"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <div
                className="mb-1 flex gap-2 overflow-x-auto pb-1"
                style={{ scrollbarWidth: "none" }}
              >
                {quickActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    disabled={sending}
                    onClick={() => void sendText(action.prompt)}
                    className="flex h-10 shrink-0 items-center gap-2 rounded-[18px] border border-white/8 bg-white/[0.055] px-3 text-[13px] font-black text-[#e5e7eb] shadow-[0_10px_24px_rgba(0,0,0,0.18)] transition-colors hover:border-[#4ade80]/30 disabled:opacity-45"
                  >
                    <span className="text-[#86efac]">{action.icon}</span>
                    {action.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {messages.map((message) => {
            const fromDarren = message.from === "darren";
            return (
              <div
                key={message.id}
                className={`flex ${fromDarren ? "justify-start" : "justify-end"}`}
              >
                <div
                  className="max-w-[82%] whitespace-pre-wrap break-words px-4 py-3 text-[15px] font-semibold leading-relaxed shadow-[0_12px_30px_rgba(0,0,0,0.22)]"
                  style={{
                    borderRadius: fromDarren
                      ? "22px 22px 22px 8px"
                      : "22px 22px 8px 22px",
                    background: fromDarren
                      ? "linear-gradient(180deg, rgba(19,25,20,0.98), rgba(10,14,11,0.98))"
                      : "linear-gradient(135deg, #4ade80, #22c55e)",
                    border: fromDarren
                      ? "1px solid rgba(255,255,255,0.08)"
                      : "1px solid rgba(134,239,172,0.36)",
                    color: fromDarren ? "#e5e7eb" : "#031006",
                  }}
                >
                  {message.text}
                </div>
              </div>
            );
          })}

          {sending ? (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 rounded-[16px] rounded-bl-[6px] border border-white/8 bg-white/[0.035] px-3 py-2 text-[11px] font-bold text-[#86efac]">
                <span className="text-[#64748b]">Darren</span>
                <span className="flex items-center gap-[3px]">
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      className="h-1 w-1 rounded-full bg-[#86efac]"
                      style={{
                        animation: `darrenTypingDot 1.35s ${dot * 0.17}s ease-in-out infinite`,
                      }}
                    />
                  ))}
                </span>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-[18px] border border-red-400/20 bg-red-500/10 px-4 py-3 text-center text-sm font-bold text-red-200">
              {error}
            </div>
          ) : null}
        </div>
      </div>

      <div
        className="relative z-10 shrink-0 border-t border-white/8 bg-[rgba(4,7,5,0.94)] px-4 pt-2 backdrop-blur-xl"
        style={{ paddingBottom: "calc(var(--safe-area-bottom) + 12px)" }}
      >
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage();
          }}
        >
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Message Darren..."
            rows={1}
            className="max-h-28 min-h-[48px] flex-1 resize-none overflow-y-auto rounded-[22px] border border-white/8 bg-white/[0.06] px-4 py-[13px] text-[15px] font-semibold leading-5 text-white outline-none placeholder:text-[#64748b] focus:border-[#4ade80]/35"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            aria-label="Send"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] bg-[#4ade80] text-black shadow-[0_12px_28px_rgba(74,222,128,0.22)] transition-opacity disabled:opacity-40"
          >
            <Send size={20} strokeWidth={2.8} />
          </button>
        </form>
      </div>
    </div>
  );
}
