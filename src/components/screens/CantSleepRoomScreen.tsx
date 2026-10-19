"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Clock3,
  Heart,
  Moon,
  Send,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { Avatar } from "../ui/Avatar";
import { useAuthStore } from "@/stores/useAuthStore-v2";
import { useMessagingStore } from "@/stores/useMessagingStore";
import {
  cantSleepRoomService,
  type CantSleepMessage,
  type CantSleepParticipant,
  type CantSleepReason,
} from "@/middleware/services/cant-sleep-room.service";

const REASONS: Array<{
  id: CantSleepReason;
  title: string;
  line: string;
  icon: typeof Moon;
}> = [
  {
    id: "overthinking",
    title: "Overthinking",
    line: "Brain will not shut up",
    icon: Sparkles,
  },
  {
    id: "miss_someone",
    title: "Missing someone",
    line: "Trying not to text first",
    icon: Heart,
  },
  {
    id: "bad_day",
    title: "Bad day",
    line: "Need a softer landing",
    icon: Moon,
  },
  {
    id: "random_awake",
    title: "Randomly awake",
    line: "No reason, somehow awake",
    icon: Clock3,
  },
  {
    id: "need_company",
    title: "Need company",
    line: "Just do not want silence",
    icon: Users,
  },
];

const DARREN_LINES = [
  "Darren is keeping this room quiet. No notifications. No pressure.",
  "If nobody knows what to say, Darren will hold the silence for a bit.",
  "The room disappears at 4:00 AM. Tonight stays tonight.",
];

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function displayUserName(user: {
  displayName?: string;
  username?: string;
} | null) {
  return user?.displayName || user?.username || "Someone";
}

function userAvatar(user: { avatar?: string } | null) {
  return user?.avatar || "";
}

function reasonLabel(reason: CantSleepReason) {
  return REASONS.find((item) => item.id === reason)?.title || "Awake";
}

function MessageBubble({
  message,
  isOwn,
}: {
  message: CantSleepMessage;
  isOwn: boolean;
}) {
  const isCapsule = message.kind === "capsule" || message.kind === "system";

  if (isCapsule) {
    return (
      <div className="mx-auto my-3 max-w-[86%] rounded-full border border-[#4ade80]/20 bg-[#07130f]/80 px-4 py-2 text-center text-[12px] font-bold text-[#a7f3d0] shadow-[0_12px_34px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)]">
        {message.content}
      </div>
    );
  }

  return (
    <div className={`flex gap-2 ${isOwn ? "justify-end" : "justify-start"}`}>
      {!isOwn ? (
        <Avatar
          src={message.avatarUrl}
          alt={message.displayName}
          userId={message.senderId}
          username={message.username}
          size={34}
          disableRealtime
        />
      ) : null}
      <div
        className={`max-w-[76%] rounded-[24px] px-4 py-3 shadow-[0_16px_34px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.05)] ${
          isOwn
            ? "rounded-br-[9px] bg-[linear-gradient(135deg,#4ade80,#14b8a6)] text-[#03120b]"
            : "rounded-bl-[9px] border border-white/8 bg-[linear-gradient(180deg,rgba(16,28,31,0.94),rgba(9,16,18,0.94))] text-white"
        }`}
      >
        {!isOwn ? (
          <div className="mb-1 text-[11px] font-black uppercase tracking-[0.08em] text-[#67e8f9]">
            {message.displayName}
          </div>
        ) : null}
        <div className="whitespace-pre-wrap text-[14px] font-semibold leading-relaxed">
          {message.content}
        </div>
      </div>
    </div>
  );
}

export function CantSleepRoomScreen({
  isActive = true,
  onBack,
}: {
  isActive?: boolean;
  onBack: () => void;
}) {
  const { user } = useAuthStore();
  const { conversations, getOrCreateConversation, sendMessage } =
    useMessagingStore();
  const [now, setNow] = useState(() => Date.now());
  const [selectedReason, setSelectedReason] =
    useState<CantSleepReason>("overthinking");
  const [enteredRoomId, setEnteredRoomId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<CantSleepParticipant[]>([]);
  const [messages, setMessages] = useState<CantSleepMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [joining, setJoining] = useState(false);
  const [sending, setSending] = useState(false);
  const [roomError, setRoomError] = useState("");
  const [showThanks, setShowThanks] = useState(false);
  const [selectedThanks, setSelectedThanks] = useState<Set<string>>(new Set());
  const [goodbyeLine, setGoodbyeLine] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const slot = useMemo(
    () => cantSleepRoomService.getSlot(new Date(now)),
    [now],
  );
  const isInRoom = Boolean(enteredRoomId && slot.isOpen);
  const otherParticipants = participants.filter(
    (participant) => participant.userId !== user?.id,
  );
  const darrenLine = DARREN_LINES[messages.length % DARREN_LINES.length];

  useEffect(() => {
    const bottomNavElements = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".app-bottom-nav, .app-bottom-nav-motion",
      ),
    );
    const previousDisplay = bottomNavElements.map((element) => ({
      element,
      display: element.style.display,
    }));

    bottomNavElements.forEach((element) => {
      element.style.display = "none";
    });

    return () => {
      previousDisplay.forEach(({ element, display }) => {
        element.style.display = display;
      });
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!slot.isOpen) {
      setEnteredRoomId(null);
      setMessages([]);
      setParticipants([]);
      setShowThanks(false);
    }
  }, [slot.isOpen]);

  useEffect(() => {
    if (!isActive || !isInRoom || !enteredRoomId) return;
    const unsubscribeParticipants = cantSleepRoomService.subscribeToParticipants(
      enteredRoomId,
      setParticipants,
      setRoomError,
    );
    const unsubscribeMessages = cantSleepRoomService.subscribeToMessages(
      enteredRoomId,
      setMessages,
      setRoomError,
    );
    return () => {
      unsubscribeParticipants();
      unsubscribeMessages();
    };
  }, [enteredRoomId, isActive, isInRoom]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  const enterRoom = async () => {
    if (!user?.id || joining) return;
    setJoining(true);
    setRoomError("");
    const result = await cantSleepRoomService.joinRoom({
      userId: user.id,
      username: user.username,
      displayName: displayUserName(user),
      avatarUrl: userAvatar(user),
      reason: selectedReason,
    });
    setJoining(false);
    if (!result.success || !result.roomId) {
      setRoomError(result.error || "Could not enter the room.");
      return;
    }
    setEnteredRoomId(result.roomId);
    await cantSleepRoomService.sendMessage({
      roomId: result.roomId,
      senderId: user.id,
      username: user.username,
      displayName: displayUserName(user),
      avatarUrl: userAvatar(user),
      kind: "system",
      content: `${displayUserName(user)} entered because: ${reasonLabel(
        selectedReason,
      )}.`,
    });
  };

  const sendRoomMessage = async () => {
    if (!user?.id || !enteredRoomId || sending) return;
    const content = draft.trim();
    if (!content) return;
    setSending(true);
    setDraft("");
    const result = await cantSleepRoomService.sendMessage({
      roomId: enteredRoomId,
      senderId: user.id,
      username: user.username,
      displayName: displayUserName(user),
      avatarUrl: userAvatar(user),
      content,
    });
    setSending(false);
    if (!result.success) {
      setRoomError(result.error || "Could not send message.");
      setDraft(content);
    }
  };

  const toggleThanks = (participantId: string) => {
    setSelectedThanks((previous) => {
      const next = new Set(previous);
      if (next.has(participantId)) {
        next.delete(participantId);
      } else {
        next.add(participantId);
      }
      return next;
    });
  };

  const finishNight = async () => {
    if (!user?.id || !enteredRoomId) {
      onBack();
      return;
    }

    const thanked = otherParticipants.filter((participant) =>
      selectedThanks.has(participant.userId),
    );

    if (thanked.length > 0) {
      await cantSleepRoomService.sendMessage({
        roomId: enteredRoomId,
        senderId: user.id,
        username: user.username,
        displayName: displayUserName(user),
        avatarUrl: userAvatar(user),
        kind: "capsule",
        content: `Before sleeping, ${displayUserName(user)} thanked ${thanked
          .map((participant) => participant.displayName)
          .join(", ")} for staying tonight.`,
      });

      await Promise.allSettled(
        thanked.map(async (participant) => {
          const existingConversation = conversations.find((conversation) => {
            const otherUserId =
              conversation.other_user?.user_id || conversation.other_user?.id;
            return otherUserId === participant.userId;
          });
          const conversationId =
            existingConversation?.id ||
            (await getOrCreateConversation(user.id, participant.userId));
          await sendMessage({
            conversation_id: conversationId,
            sender_id: user.id,
            content: `${displayUserName(
              user,
            )} thanked you for staying with them in the Can't Sleep Room tonight.`,
          });
        }),
      );
    }

    setGoodbyeLine(
      thanked.length > 0
        ? "Darren saved the thank-you quietly. Sleep easier."
        : "Darren closed the door softly. No receipts tonight.",
    );
    window.setTimeout(onBack, 1300);
  };

  return (
    <div
      className="relative flex h-[100dvh] flex-col overflow-hidden text-white"
      style={{
        fontFamily:
          "var(--font-ui)",
        background:
          "radial-gradient(circle at 50% -18%, rgba(34,211,238,0.2), transparent 34%), radial-gradient(circle at 12% 10%, rgba(74,222,128,0.14), transparent 30%), radial-gradient(circle at 90% 78%, rgba(20,184,166,0.16), transparent 34%), linear-gradient(180deg, #020711 0%, #03130f 48%, #020403 100%)",
      }}
    >
      <style>{`
        @keyframes cantSleepPulse {
          0%, 100% { transform: scale(1); opacity: 0.68; }
          50% { transform: scale(1.06); opacity: 1; }
        }
        @keyframes cantSleepFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .cant-sleep-pulse { animation: cantSleepPulse 2.4s ease-in-out infinite; }
        .cant-sleep-float { animation: cantSleepFloat 3.4s ease-in-out infinite; }
      `}</style>

      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,rgba(34,211,238,0),rgba(34,211,238,0.74),rgba(74,222,128,0))]" />

      <header className="relative z-10 flex items-center gap-3 px-4 pb-3 pt-[calc(var(--safe-area-top)+14px)]">
        <button
          onClick={onBack}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-white/8 bg-white/[0.055] text-[#d1fae5]"
          aria-label="Back"
        >
          <ArrowLeft size={20} strokeWidth={2.7} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Moon size={18} className="text-[#67e8f9]" />
            <h1 className="truncate text-[25px] font-black leading-none">
              Can't sleep? Room
            </h1>
          </div>
          <p className="mt-1 truncate text-[12px] font-bold text-[#8aa3a7]">
            2:00 AM - 4:00 AM. No notifications. No morning archive.
          </p>
        </div>
        <div className="rounded-full border border-[#4ade80]/20 bg-[#06150f]/80 px-3 py-2 text-[12px] font-black text-[#86efac]">
          {slot.isOpen
            ? `${formatCountdown(slot.closeAt.getTime() - now)} left`
            : `opens ${slot.nextOpenAt.toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}`}
        </div>
      </header>

      {!slot.isOpen ? (
        <main className="flex flex-1 items-center justify-center px-5 pb-10">
          <div className="relative w-full max-w-[420px] overflow-hidden rounded-[38px] border border-[#22d3ee]/18 bg-[linear-gradient(180deg,rgba(8,24,28,0.82),rgba(4,10,14,0.92))] p-6 text-center shadow-[0_28px_80px_rgba(0,0,0,0.46),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl">
            <div className="cant-sleep-float mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-[32px] border border-[#67e8f9]/20 bg-[radial-gradient(circle_at_top,#22d3ee2b,transparent_64%),#061410] text-[#a7f3d0] shadow-[0_18px_50px_rgba(34,211,238,0.12)]">
              <Moon size={38} strokeWidth={2.4} />
            </div>
            <h2 className="text-[28px] font-black leading-tight">
              The room has vanished.
            </h2>
            <p className="mx-auto mt-3 max-w-[300px] text-[14px] font-semibold leading-relaxed text-[#9fb3b6]">
              It only exists from 2:00 AM to 4:00 AM. When the slot ends,
              messages stop showing and the room resets for the next night.
            </p>
          </div>
        </main>
      ) : !isInRoom ? (
        <main className="flex-1 overflow-y-auto px-4 pb-8">
          <section className="relative overflow-hidden rounded-[38px] border border-white/8 bg-[linear-gradient(180deg,rgba(9,27,30,0.88),rgba(4,12,14,0.96))] p-5 shadow-[0_28px_82px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.06)]">
            <div className="absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(74,222,128,0.8),transparent)]" />
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#67e8f9]">
                  Before entering
                </p>
                <h2 className="mt-2 text-[30px] font-black leading-none">
                  Why are you awake?
                </h2>
              </div>
              <div className="cant-sleep-pulse flex h-12 w-12 items-center justify-center rounded-[20px] border border-[#4ade80]/22 bg-[#07160f] text-[#86efac]">
                <Moon size={22} />
              </div>
            </div>
            <div className="grid gap-3">
              {REASONS.map((reason) => {
                const Icon = reason.icon;
                const selected = selectedReason === reason.id;
                return (
                  <button
                    key={reason.id}
                    onClick={() => setSelectedReason(reason.id)}
                    className={`flex items-center gap-3 rounded-[24px] border p-4 text-left transition active:scale-[0.985] ${
                      selected
                        ? "border-[#4ade80]/45 bg-[#4ade80]/12 shadow-[0_0_28px_rgba(74,222,128,0.08)]"
                        : "border-white/8 bg-white/[0.045]"
                    }`}
                  >
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] ${
                        selected
                          ? "bg-[#4ade80] text-[#03110a]"
                          : "bg-[#071a1b] text-[#67e8f9]"
                      }`}
                    >
                      <Icon size={21} strokeWidth={2.6} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[16px] font-black text-white">
                        {reason.title}
                      </div>
                      <div className="mt-1 text-[12px] font-bold text-[#91a7aa]">
                        {reason.line}
                      </div>
                    </div>
                    {selected ? (
                      <Check size={20} className="text-[#86efac]" />
                    ) : null}
                  </button>
                );
              })}
            </div>
            <button
              onClick={enterRoom}
              disabled={joining}
              className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-[24px] bg-[linear-gradient(135deg,#4ade80,#14b8a6)] text-[16px] font-black text-[#03110a] shadow-[0_20px_48px_rgba(20,184,166,0.2)] transition active:scale-[0.985] disabled:opacity-60"
            >
              {joining ? "Opening room..." : "Enter quietly"}
              <ArrowLeft className="rotate-180" size={18} strokeWidth={3} />
            </button>
            {roomError ? (
              <p className="mt-3 text-center text-[12px] font-bold text-[#fda4af]">
                {roomError}
              </p>
            ) : null}
          </section>
        </main>
      ) : (
        <>
          <div className="px-4 pb-3">
            <div className="rounded-[28px] border border-[#22d3ee]/14 bg-[linear-gradient(180deg,rgba(8,22,25,0.76),rgba(4,11,13,0.86))] px-4 py-3 shadow-[0_18px_44px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <img
                    src="/avatars/darren-soft-menace.svg"
                    alt="Darren"
                    className="h-9 w-9 shrink-0 rounded-full border border-[#67e8f9]/20 object-cover"
                  />
                  <p className="truncate text-[12px] font-bold text-[#9fb3b6]">
                    {darrenLine}
                  </p>
                </div>
                <div className="flex -space-x-2">
                  {participants.slice(0, 4).map((participant) => (
                    <Avatar
                      key={participant.userId}
                      src={participant.avatarUrl}
                      alt={participant.displayName}
                      userId={participant.userId}
                      username={participant.username}
                      size={30}
                      disableRealtime
                      className="border-2 border-[#06100f]"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto px-4 pb-3"
          >
            {messages.length === 0 ? (
              <div className="flex min-h-full items-center justify-center text-center">
                <div className="max-w-[300px]">
                  <Moon className="mx-auto mb-4 text-[#67e8f9]" size={34} />
                  <p className="text-[18px] font-black">No one has said it yet.</p>
                  <p className="mt-2 text-[13px] font-semibold leading-relaxed text-[#8fa4a8]">
                    Start soft. The room will not remember this after the slot.
                  </p>
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isOwn={message.senderId === user?.id}
                />
              ))
            )}
          </div>

          <footer className="border-t border-white/6 bg-[#020807]/92 px-4 pb-[calc(var(--safe-area-bottom)+12px)] pt-3 backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <button
                onClick={() => setShowThanks(true)}
                className="rounded-full border border-[#4ade80]/20 bg-[#07140f] px-4 py-2 text-[12px] font-black text-[#86efac] transition active:scale-[0.98]"
              >
                Sleep now
              </button>
              <span className="text-[11px] font-bold text-[#647b80]">
                {otherParticipants.length} awake with you
              </span>
            </div>
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendRoomMessage();
                  }
                }}
                placeholder="Say the thing you cannot sleep with..."
                rows={1}
                className="max-h-28 min-h-[48px] flex-1 resize-none rounded-[22px] border border-white/8 bg-white/[0.055] px-4 py-3 text-[14px] font-semibold text-white outline-none placeholder:text-[#5f7478]"
              />
              <button
                onClick={sendRoomMessage}
                disabled={sending || !draft.trim()}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] bg-[#4ade80] text-[#03110a] shadow-[0_12px_30px_rgba(74,222,128,0.2)] transition active:scale-[0.94] disabled:opacity-45"
                aria-label="Send"
              >
                <Send size={19} strokeWidth={3} />
              </button>
            </div>
            {roomError ? (
              <p className="mt-2 text-center text-[12px] font-bold text-[#fda4af]">
                {roomError}
              </p>
            ) : null}
          </footer>
        </>
      )}

      {showThanks ? (
        <div className="absolute inset-0 z-30 flex items-end bg-black/62 p-4 backdrop-blur-sm">
          <div className="w-full overflow-hidden rounded-[34px] border border-white/8 bg-[linear-gradient(180deg,rgba(8,24,27,0.98),rgba(4,10,12,0.98))] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-[12px] font-black uppercase tracking-[0.14em] text-[#67e8f9]">
                  Before you go
                </p>
                <h3 className="mt-2 text-[24px] font-black">
                  Thank someone privately?
                </h3>
              </div>
              <button
                onClick={() => setShowThanks(false)}
                className="flex h-10 w-10 items-center justify-center rounded-[16px] border border-white/8 bg-white/[0.055]"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[280px] space-y-2 overflow-y-auto">
              {otherParticipants.length === 0 ? (
                <p className="rounded-[22px] border border-white/8 bg-white/[0.045] p-4 text-center text-[13px] font-bold text-[#9fb3b6]">
                  Nobody else is in the room right now. Darren will close it
                  quietly.
                </p>
              ) : (
                otherParticipants.map((participant) => {
                  const selected = selectedThanks.has(participant.userId);
                  return (
                    <button
                      key={participant.userId}
                      onClick={() => toggleThanks(participant.userId)}
                      className={`flex w-full items-center gap-3 rounded-[22px] border p-3 text-left transition active:scale-[0.985] ${
                        selected
                          ? "border-[#4ade80]/42 bg-[#4ade80]/12"
                          : "border-white/8 bg-white/[0.045]"
                      }`}
                    >
                      <Avatar
                        src={participant.avatarUrl}
                        alt={participant.displayName}
                        userId={participant.userId}
                        username={participant.username}
                        size={42}
                        disableRealtime
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-black text-white">
                          {participant.displayName}
                        </div>
                        <div className="truncate text-[12px] font-bold text-[#8fa4a8]">
                          Awake for {reasonLabel(participant.reason)}
                        </div>
                      </div>
                      {selected ? (
                        <Check size={19} className="text-[#86efac]" />
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
            <button
              onClick={finishNight}
              className="mt-4 flex h-14 w-full items-center justify-center rounded-[24px] bg-[linear-gradient(135deg,#4ade80,#14b8a6)] text-[15px] font-black text-[#03110a] shadow-[0_18px_44px_rgba(20,184,166,0.18)] transition active:scale-[0.985]"
            >
              Good night
            </button>
          </div>
        </div>
      ) : null}

      {goodbyeLine ? (
        <div className="absolute inset-x-5 top-[42%] z-40 rounded-[30px] border border-[#67e8f9]/20 bg-[#041416]/92 p-5 text-center shadow-[0_24px_80px_rgba(0,0,0,0.5)] backdrop-blur-xl">
          <Sparkles className="mx-auto mb-3 text-[#86efac]" size={26} />
          <p className="text-[18px] font-black">{goodbyeLine}</p>
        </div>
      ) : null}
    </div>
  );
}
