"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  BedDouble,
  Bell,
  BookOpen,
  Bus,
  Check,
  Clock3,
  Coffee,
  Dumbbell,
  Gamepad2,
  Laptop,
  MessageCircle,
  Moon,
  Music2,
  PartyPopper,
  Plus,
  Soup,
  Sparkles,
  Tv,
  X,
  User,
  Users,
} from "lucide-react";
import { useMessagingStore } from "../../stores/useMessagingStore";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { useAvatarStore } from "../../stores/avatarStore";
import { DARREN_CONVERSATION_ID, DARREN_USER_ID } from "@/lib/darren";
import { Avatar } from "../ui/Avatar";
import { useProfileDataStore } from "../../stores/profileDataStore";
import { friendsService } from "../../middleware/services/service-factory";
import { primeResolvedUserProfile } from "../../utils/profileResolver";
import { chatInviteService } from "../../middleware/services/chat-invite.service";
import { CantSleepRoomScreen } from "./CantSleepRoomScreen";
import {
  DEFAULT_STICKMAN_STATUS,
  STICKMAN_STATUS_OPTIONS,
  getStickmanStatus,
  stickmanStatusService,
  type StickmanStatusId,
  type StickmanStatusSnapshot,
} from "../../services/stickmanStatusService";

import { CircleChatEntry } from "../circles/CircleChatScreen";
import { StickmanBody } from "../circles/StickmanBody";

const CHAT_LIST_DEBUG = false;

function formatConversationTime(timestamp: unknown): string {
  if (!timestamp) return "";

  let date: Date | null = null;

  if (timestamp instanceof Date) {
    date = timestamp;
  } else if (typeof timestamp === "string" || typeof timestamp === "number") {
    date = new Date(timestamp);
  } else if (
    typeof timestamp === "object" &&
    timestamp !== null &&
    "toDate" in timestamp &&
    typeof (timestamp as { toDate?: () => Date }).toDate === "function"
  ) {
    date = (timestamp as { toDate: () => Date }).toDate();
  } else if (
    typeof timestamp === "object" &&
    timestamp !== null &&
    "seconds" in timestamp &&
    typeof (timestamp as { seconds?: number }).seconds === "number"
  ) {
    date = new Date((timestamp as { seconds: number }).seconds * 1000);
  }

  if (!date || Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).toLowerCase();
}

function DailyChallengeChatCard({ onClick }: { onClick: () => void }) {
  return (
    <>
      <style>{`
        @keyframes dailyChatSweep {
          0% { transform: translateX(-125%); }
          42% { transform: translateX(125%); }
          100% { transform: translateX(125%); }
        }
        @keyframes dailyChatHalo {
          0% { transform: rotate(0deg); opacity: 0.5; }
          50% { opacity: 0.95; }
          100% { transform: rotate(360deg); opacity: 0.5; }
        }
        @keyframes dailyChatPulse {
          0%, 100% { opacity: 0.58; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.08); }
        }
        .daily-chat-entry::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent);
          animation: dailyChatSweep 6.8s ease-in-out infinite;
          pointer-events: none;
        }
        .daily-chat-orb::before {
          content: "";
          position: absolute;
          inset: -2px;
          border-radius: 24px;
          background: conic-gradient(from 180deg, rgba(74,222,128,0), rgba(74,222,128,0.9), rgba(14,165,233,0.62), rgba(74,222,128,0));
          animation: dailyChatHalo 3.6s linear infinite;
        }
        .daily-chat-dot {
          animation: dailyChatPulse 2.2s ease-in-out infinite;
        }
      `}</style>
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick();
          }
        }}
        aria-label="Daily Challenge"
        className="daily-chat-entry chat-inbox-special-row group relative overflow-hidden"
        style={{
          background:
            "radial-gradient(circle at 18% -18%, rgba(74,222,128,0.18), transparent 34%), radial-gradient(circle at 92% 16%, rgba(14,165,233,0.12), transparent 32%), linear-gradient(180deg, rgba(22,28,23,0.98), rgba(8,12,9,0.98))",
          borderRadius: "28px",
          padding: "14px 16px",
          minHeight: "90px",
          width: "100%",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          cursor: "pointer",
          marginBottom: "2px",
          flexShrink: 0,
          border: "1px solid rgba(74,222,128,0.28)",
          boxShadow:
            "0 18px 44px rgba(0,0,0,0.34), 0 0 28px rgba(74,222,128,0.08), inset 0 1px 0 rgba(255,255,255,0.05)",
          transition:
            "background 0.15s ease, border-color 0.15s ease, transform 0.15s ease",
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.transform = "translateY(-1px)";
          event.currentTarget.style.borderColor = "rgba(74,222,128,0.42)";
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.transform = "translateY(0)";
          event.currentTarget.style.borderColor = "rgba(74,222,128,0.28)";
        }}
      >
        <div className="pointer-events-none absolute inset-x-8 top-0 z-[1] h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.82),rgba(74,222,128,0))]" />
        <div className="daily-chat-orb relative z-[1] flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-[24px] p-[2px] shadow-[0_14px_34px_rgba(74,222,128,0.12)]">
          <div className="relative z-[1] flex h-full w-full items-center justify-center overflow-hidden rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(18,24,18,0.98),rgba(7,10,8,0.98))] text-[#86efac] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-14px_28px_rgba(74,222,128,0.06)]">
            <span className="absolute left-3 right-3 top-1/2 h-px bg-[linear-gradient(90deg,transparent,rgba(134,239,172,0.72),rgba(14,165,233,0.52),transparent)] shadow-[0_0_14px_rgba(74,222,128,0.18)]" />
            <Sparkles size={24} strokeWidth={2.5} />
          </div>
        </div>
        <div className="relative z-[1] min-w-0 flex-1">
          <div className="mb-[3px] flex items-center justify-between gap-2">
            <span className="truncate text-[16px] font-extrabold text-white">
              Daily Challenge
            </span>
            <span className="shrink-0 text-[12px] font-semibold text-[#86efac]">
              Today
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#94a3b8]">
              Match Hour is waiting
            </p>
            <span className="daily-chat-dot h-2 w-2 shrink-0 rounded-full bg-[#4ade80] shadow-[0_0_14px_rgba(74,222,128,0.55)]" />
          </div>
        </div>
        <div className="relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-[16px] border border-white/8 bg-white/[0.055] text-[#cbd5e1] transition-colors group-hover:border-[#4ade80]/30 group-hover:text-white">
          <ArrowRight size={18} strokeWidth={2.6} />
        </div>
      </div>
    </>
  );
}

function DarrenChatCard({ onClick }: { onClick: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      aria-label="Darren AI"
      className="chat-inbox-special-row group relative overflow-hidden"
      style={{
        background:
          "radial-gradient(circle at 18% -18%, rgba(34,211,238,0.16), transparent 34%), radial-gradient(circle at 92% 18%, rgba(74,222,128,0.16), transparent 32%), linear-gradient(180deg, rgba(18,24,22,0.98), rgba(8,12,10,0.98))",
        borderRadius: "28px",
        padding: "14px 16px",
        minHeight: "90px",
        width: "100%",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        cursor: "pointer",
        marginBottom: "2px",
        flexShrink: 0,
        border: "1px solid rgba(34,211,238,0.2)",
        boxShadow:
          "0 18px 44px rgba(0,0,0,0.34), 0 0 28px rgba(34,211,238,0.06), inset 0 1px 0 rgba(255,255,255,0.05)",
        transition:
          "background 0.15s ease, border-color 0.15s ease, transform 0.15s ease",
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.transform = "translateY(-1px)";
        event.currentTarget.style.borderColor = "rgba(74,222,128,0.34)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.transform = "translateY(0)";
        event.currentTarget.style.borderColor = "rgba(34,211,238,0.2)";
      }}
    >
      <div className="relative z-[1] flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-[24px] border border-[#22d3ee]/20 bg-[#07100b] text-[#a7f3d0] shadow-[0_14px_34px_rgba(34,211,238,0.1)]">
        <img
          src="/avatars/darren-soft-menace.svg"
          alt="Darren"
          className="h-full w-full object-cover"
        />
        <span className="absolute bottom-3 right-3 h-2.5 w-2.5 rounded-full bg-[#4ade80] shadow-[0_0_14px_rgba(74,222,128,0.72)]" />
      </div>
      <div className="relative z-[1] min-w-0 flex-1">
        <div className="mb-[3px] flex items-center justify-between gap-2">
          <span className="truncate text-[16px] font-extrabold text-white">
            Darren
          </span>
          <span className="shrink-0 text-[12px] font-semibold text-[#67e8f9]">
            AI
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#94a3b8]">
            The app is watching with you
          </p>
          <span className="h-2 w-2 shrink-0 rounded-full bg-[#22d3ee] shadow-[0_0_14px_rgba(34,211,238,0.5)]" />
        </div>
      </div>
      <div className="relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-[16px] border border-white/8 bg-white/[0.055] text-[#cbd5e1] transition-colors group-hover:border-[#4ade80]/30 group-hover:text-white">
        <ArrowRight size={18} strokeWidth={2.6} />
      </div>
    </div>
  );
}

function CantSleepChatCard({ onClick }: { onClick: () => void }) {
  const now = new Date();
  const isOpen = now.getHours() >= 2 && now.getHours() < 4;

  return (
    <>
      <style>{`
        @keyframes cantSleepCardGlow {
          0%, 100% { opacity: 0.42; transform: scaleX(0.82); }
          50% { opacity: 1; transform: scaleX(1); }
        }
        .cant-sleep-card-line {
          animation: cantSleepCardGlow 3.2s ease-in-out infinite;
        }
      `}</style>
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick();
          }
        }}
        aria-label="Can't sleep room"
        className="chat-inbox-special-row group relative overflow-hidden"
        style={{
          background:
            "radial-gradient(circle at 22% -18%, rgba(34,211,238,0.18), transparent 34%), radial-gradient(circle at 90% 18%, rgba(74,222,128,0.14), transparent 32%), linear-gradient(180deg, rgba(8,23,27,0.98), rgba(4,10,13,0.98))",
          borderRadius: "28px",
          padding: "14px 16px",
          minHeight: "92px",
          width: "100%",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          cursor: "pointer",
          marginBottom: "2px",
          flexShrink: 0,
          border: isOpen
            ? "1px solid rgba(103,232,249,0.28)"
            : "1px solid rgba(255,255,255,0.08)",
          boxShadow: isOpen
            ? "0 20px 50px rgba(0,0,0,0.38), 0 0 30px rgba(34,211,238,0.08), inset 0 1px 0 rgba(255,255,255,0.05)"
            : "0 18px 44px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.04)",
          transition:
            "background 0.15s ease, border-color 0.15s ease, transform 0.15s ease",
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.transform = "translateY(-1px)";
          event.currentTarget.style.borderColor = isOpen
            ? "rgba(74,222,128,0.38)"
            : "rgba(103,232,249,0.18)";
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.transform = "translateY(0)";
          event.currentTarget.style.borderColor = isOpen
            ? "rgba(103,232,249,0.28)"
            : "rgba(255,255,255,0.08)";
        }}
      >
        <div className="cant-sleep-card-line pointer-events-none absolute inset-x-8 top-0 h-px origin-center bg-[linear-gradient(90deg,rgba(34,211,238,0),rgba(103,232,249,0.82),rgba(74,222,128,0))]" />
        <div className="relative z-[1] flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-[24px] border border-[#67e8f9]/18 bg-[#061317] text-[#a7f3d0] shadow-[0_14px_34px_rgba(34,211,238,0.1)]">
          <Moon size={25} strokeWidth={2.5} />
          <span
            className="absolute bottom-3 right-3 h-2.5 w-2.5 rounded-full"
            style={{
              background: isOpen ? "#4ade80" : "#64748b",
              boxShadow: isOpen
                ? "0 0 14px rgba(74,222,128,0.72)"
                : "none",
            }}
          />
        </div>
        <div className="relative z-[1] min-w-0 flex-1">
          <div className="mb-[3px] flex items-center justify-between gap-2">
            <span className="truncate text-[16px] font-extrabold text-white">
              Can&apos;t sleep? Room
            </span>
            <span
              className="shrink-0 text-[12px] font-semibold"
              style={{ color: isOpen ? "#86efac" : "#67e8f9" }}
            >
              {isOpen ? "Open" : "2-4 AM"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#94a3b8]">
              Quiet group room, vanishes after the slot
            </p>
            <Clock3 size={15} className="shrink-0 text-[#67e8f9]" />
          </div>
        </div>
        <div className="relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-[16px] border border-white/8 bg-white/[0.055] text-[#cbd5e1] transition-colors group-hover:border-[#4ade80]/30 group-hover:text-white">
          <ArrowRight size={18} strokeWidth={2.6} />
        </div>
      </div>
    </>
  );
}

interface RailFigure {
  id: string;
  label: string;
  avatar?: string;
  isOwn: boolean;
}

function statusUpdatedAtMs(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "object") {
    const timestamp = value as { toMillis?: () => number; seconds?: number };
    if (typeof timestamp.toMillis === "function") {
      const millis = timestamp.toMillis();
      return Number.isFinite(millis) ? millis : 0;
    }
    if (typeof timestamp.seconds === "number") return timestamp.seconds * 1000;
  }
  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function StatusGlyph({ statusId, size = 18 }: { statusId: StickmanStatusId; size?: number }) {
  const props = { size, strokeWidth: 2.1, "aria-hidden": true } as const;
  switch (statusId) {
    case "sleeping": return <BedDouble {...props} />;
    case "watching-tv": return <Tv {...props} />;
    case "studying": return <BookOpen {...props} />;
    case "gaming": return <Gamepad2 {...props} />;
    case "working": return <Laptop {...props} />;
    case "music": return <Music2 {...props} />;
    case "eating": return <Soup {...props} />;
    case "gym": return <Dumbbell {...props} />;
    case "commuting": return <Bus {...props} />;
    case "partying": return <PartyPopper {...props} />;
    case "coffee": return <Coffee {...props} />;
    case "chilling": return <Moon {...props} />;
    default: return <MessageCircle {...props} />;
  }
}

function ChatListStickFigure({
  figure,
  index,
  status,
  onActivate,
}: {
  figure: RailFigure;
  index: number;
  status: StickmanStatusSnapshot;
  onActivate: () => void;
}) {
  const colors = ["#4ade80", "#38bdf8", "#fb7185", "#facc15", "#c084fc"];
  const color = figure.isOwn ? "#f5f5f5" : colors[index % colors.length];

  return (
    <button
      type="button"
      className="chat-presence-figure flex w-[82px] shrink-0 select-none flex-col items-center"
      style={{ animationDelay: `${index * 55}ms` }}
      aria-label={figure.isOwn ? `Set your status. Current status: ${status.label}` : `View ${figure.label}'s status: ${status.label}`}
      onClick={onActivate}
    >
      <StickmanBody
        label={figure.label}
        avatar={figure.avatar}
        statusId={status.id}
        color={color}
      />
      <span className="mt-3 block w-full truncate text-center text-[11px] font-bold leading-none text-[#dbe3de]">
        {figure.label}
      </span>
      <span className="mt-1 block w-full truncate text-center text-[10px] font-semibold leading-none text-[#77817b]">
        {status.label}
      </span>
    </button>
  );
}

function ChatPresenceRail({
  conversations,
  currentUser,
  isActive,
}: {
  conversations: any[];
  currentUser: {
    id: string;
    displayName?: string;
    username?: string;
    avatar?: string;
  } | null;
  isActive: boolean;
}) {
  const userProfiles = useProfileDataStore((state) => state.userProfiles);
  const userAvatars = useAvatarStore((state) => state.userAvatars);

  const figures = useMemo(() => {
    const next: RailFigure[] = [];
    if (currentUser?.id) {
      const ownProfile = userProfiles[currentUser.id];
      next.push({
        id: currentUser.id,
        label: "You",
        avatar:
          userAvatars[currentUser.id] ||
          ownProfile?.avatarUrl ||
          currentUser.avatar,
        isOwn: true,
      });
    }

    const seen = new Set(next.map((figure) => figure.id));
    for (const conversation of conversations) {
      const id =
        conversation.other_user?.user_id || conversation.other_user?.id || "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const profile = userProfiles[id];
      next.push({
        id,
        label:
          conversation.other_user?.display_name ||
          conversation.other_user?.username ||
          "friend",
        avatar:
          userAvatars[id] ||
          profile?.avatarUrl ||
          conversation.other_user?.avatar_url ||
          conversation.other_user?.avatarUrl ||
          conversation.other_user?.avatar ||
          undefined,
        isOwn: false,
      });
      if (next.length >= 10) break;
    }
    return next;
  }, [conversations, currentUser?.avatar, currentUser?.id, userAvatars, userProfiles]);

  const [statuses, setStatuses] = useState<
    Record<string, StickmanStatusSnapshot>
  >({});
  const [activeFigure, setActiveFigure] = useState<RailFigure | null>(null);
  const [savingStatus, setSavingStatus] = useState<StickmanStatusId | null>(null);
  const [statusError, setStatusError] = useState("");
  const statusIdsKey = figures.map((figure) => figure.id).join("|");
  const orderedFigures = useMemo(() => {
    return [...figures].sort((a, b) => {
      if (a.isOwn !== b.isOwn) return a.isOwn ? -1 : 1;

      const updatedDifference =
        statusUpdatedAtMs(statuses[b.id]?.updatedAt) -
        statusUpdatedAtMs(statuses[a.id]?.updatedAt);
      if (updatedDifference !== 0) return updatedDifference;
      return a.id.localeCompare(b.id);
    });
  }, [figures, statuses]);

  useEffect(() => {
    const userIds = statusIdsKey.split("|").filter(Boolean);
    if (!isActive || userIds.length === 0) return;
    return stickmanStatusService.subscribe(
      userIds,
      setStatuses,
    );
  }, [isActive, statusIdsKey]);

  const selectStatus = async (statusId: StickmanStatusId) => {
    if (!currentUser?.id || savingStatus) return;
    const option = getStickmanStatus(statusId);
    const previousStatus = statuses[currentUser.id] ?? {
      ...DEFAULT_STICKMAN_STATUS,
      updatedAt: null,
    };
    setStatusError("");
    setSavingStatus(statusId);
    setStatuses((current) => ({
      ...current,
      [currentUser.id]: { ...option, updatedAt: Date.now() },
    }));
    try {
      await stickmanStatusService.update(currentUser.id, statusId);
    } catch (error) {
      console.error("Unable to update stickman status:", error);
      setStatuses((current) => ({
        ...current,
        [currentUser.id]: previousStatus,
      }));
      setStatusError("Could not update your status. Try again.");
    } finally {
      setSavingStatus(null);
    }
  };

  const activeStatus = activeFigure
    ? statuses[activeFigure.id] ?? {
        ...DEFAULT_STICKMAN_STATUS,
        updatedAt: null,
      }
    : null;

  return (
    <>
      <section className="chat-presence-rail" aria-label="Stickman statuses">
        <div className="chat-presence-scroll flex items-start gap-4 overflow-x-auto">
          {orderedFigures.map((figure, index) => (
            <ChatListStickFigure
              key={figure.id}
              figure={figure}
              index={index}
              status={
                statuses[figure.id] ?? {
                  ...DEFAULT_STICKMAN_STATUS,
                  updatedAt: null,
                }
              }
              onActivate={() => {
                setStatusError("");
                setActiveFigure(figure);
              }}
            />
          ))}
        </div>
      </section>

      {activeFigure && activeStatus && typeof document !== "undefined"
        ? createPortal(
          <>
          <button
            type="button"
            className="chat-status-backdrop fixed inset-0 z-[220] bg-black/75"
            aria-label="Close status"
            onClick={() => setActiveFigure(null)}
          />
          <section
            className="chat-status-sheet fixed inset-x-0 bottom-0 z-[221] mx-auto w-full max-w-[460px] rounded-t-[28px] border border-white/10 bg-[#0b0d0c] shadow-[0_-24px_70px_rgba(0,0,0,0.6)]"
            aria-label={activeFigure.isOwn ? "Choose your stickman status" : `${activeFigure.label}'s stickman status`}
            aria-modal="true"
            role="dialog"
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/15" />
            <div className="flex items-start justify-between px-5 pb-4 pt-4">
              <div>
                <h2 className="text-[21px] font-black text-white">
                  {activeFigure.isOwn ? "set your vibe" : activeFigure.label}
                </h2>
                <p className="mt-1 text-[13px] font-medium text-white/45">
                  {activeFigure.isOwn
                    ? "your stickman says it first"
                    : activeStatus.detail}
                </p>
              </div>
              <button
                type="button"
                className="chat-status-close grid h-10 w-10 place-items-center rounded-full text-white/55"
                aria-label="Close status"
                onClick={() => setActiveFigure(null)}
              >
                <X size={19} />
              </button>
            </div>

            {activeFigure.isOwn ? (
              <div className="max-h-[68dvh] overflow-y-auto px-4 pb-[calc(var(--safe-area-bottom)+18px)]">
                <div className="grid grid-cols-3 gap-2">
                  {STICKMAN_STATUS_OPTIONS.map((option) => {
                    const selected = activeStatus.id === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className="chat-status-option relative flex min-h-[112px] flex-col items-center justify-center rounded-[18px] border px-2 py-3 text-center"
                        data-selected={selected}
                        disabled={savingStatus !== null}
                        aria-pressed={selected}
                        onClick={() => void selectStatus(option.id)}
                      >
                        {selected ? (
                          <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-[#4ade80] text-black">
                            <Check size={12} strokeWidth={3} />
                          </span>
                        ) : null}
                        <StickmanBody
                          label={option.label}
                          statusId={option.id}
                          color={selected ? "#4ade80" : "#737d77"}
                          compact
                          animate={selected}
                        />
                        <span className="mt-2 text-[11px] font-bold leading-tight text-white/82">
                          {option.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {statusError ? (
                  <p className="px-2 pt-3 text-center text-[12px] font-semibold text-[#fb7185]">
                    {statusError}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col items-center px-6 pb-[calc(var(--safe-area-bottom)+28px)] pt-2 text-center">
                <div className="chat-status-friend-preview flex h-[160px] w-[160px] items-center justify-center rounded-full border border-white/8 bg-black/35">
                  <StickmanBody
                    label={activeFigure.label}
                    avatar={activeFigure.avatar}
                    statusId={activeStatus.id}
                    color="#4ade80"
                  />
                </div>
                <p className="mt-4 text-[19px] font-black text-white">
                  {activeStatus.label}
                </p>
                <p className="mt-1 text-[13px] font-medium text-white/45">
                  {activeStatus.detail}
                </p>
              </div>
            )}
          </section>
          </>,
          document.body,
        )
        : null}
    </>
  );
}

export function ChatListScreen({
  isActive = true,
  onBack,
  onChatSelect,
  onInviteAlertsClick,
  onDailyChallengeClick,
  onNavigateToCommunityDares,
  onCircleChatClick,
}: {
  isActive?: boolean;
  onBack: () => void;
  onChatSelect: (
    userId: string,
    username: string,
    conversationId?: string,
  ) => void;
  onInviteAlertsClick?: () => void;
  onDailyChallengeClick?: () => void;
  onNavigateToCommunityDares?: () => void;
  onCircleChatClick?: () => void;
}) {
  const searchQuery = "";
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [friendsList, setFriendsList] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [inviteAlertCount, setInviteAlertCount] = useState(0);
  const [showCantSleepRoom, setShowCantSleepRoom] = useState(false);
  const {
    conversations,
    loading,
    error,
    getOrCreateConversation,
    onlineFriends,
    typingUsers,
  } = useMessagingStore();

  const { user } = useAuthStore();

  const userProfiles = useProfileDataStore((s) => s.userProfiles);

  useEffect(() => {
    if (!isActive || !CHAT_LIST_DEBUG) return;
    console.log("[ChatList DEBUG] indicator inputs:", {
      userId: user?.id ?? null,
      conversationCount: conversations.length,
      onlineFriends,
      typingUsers,
      conversations: conversations.map((conversation) => {
        const otherUserId =
          conversation.other_user?.user_id || conversation.other_user?.id;
        return {
          conversationId: conversation.id,
          otherUserId,
          otherUsername: conversation.other_user?.username,
          conversationIsOnline: conversation.is_online,
          storeIncludesOnlineFriend:
            !!otherUserId && onlineFriends.includes(otherUserId),
          finalIsOnline:
            !!otherUserId && onlineFriends.includes(otherUserId),
          conversationIsTyping: conversation.is_typing,
          matchingTypingUsers: typingUsers.filter(
            (typingUser) =>
              typingUser.conversation_id === conversation.id &&
              typingUser.user_id !== user?.id,
          ),
          finalIsTyping:
            !!conversation.is_typing ||
            typingUsers.some(
              (typingUser) =>
                typingUser.conversation_id === conversation.id &&
                typingUser.user_id !== user?.id &&
                typingUser.is_typing,
            ),
        };
      }),
    });
  }, [isActive, user?.id, conversations, onlineFriends, typingUsers]);

  useEffect(() => {
    if (!isActive || !user?.id) {
      setInviteAlertCount(0);
      return;
    }
    return chatInviteService.subscribeReceivedInvites(user.id, (invites) => {
      setInviteAlertCount(
        invites.filter((invite) =>
          ["pending", "accepted"].includes(invite.status),
        ).length,
      );
    });
  }, [isActive, user?.id]);

  const filteredConversations = conversations
    .filter(
      (conv) =>
        conv.other_user?.display_name
          ?.toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        conv.other_user?.username
          ?.toLowerCase()
          .includes(searchQuery.toLowerCase()),
    )
    .sort((a, b) => {
      const getTimestamp = (conv: any) => {
        const timestamp =
          conv.last_message?.created_at ||
          conv.last_message_at ||
          conv.created_at;
        if (!timestamp) return 0;

        let date: Date | null = null;
        if (timestamp instanceof Date) {
          date = timestamp;
        } else if (
          typeof timestamp === "string" ||
          typeof timestamp === "number"
        ) {
          date = new Date(timestamp);
        } else if (
          typeof timestamp === "object" &&
          timestamp !== null &&
          "toDate" in timestamp &&
          typeof (timestamp as { toDate?: () => Date }).toDate === "function"
        ) {
          date = (timestamp as { toDate: () => Date }).toDate();
        } else if (
          typeof timestamp === "object" &&
          timestamp !== null &&
          "seconds" in timestamp &&
          typeof (timestamp as { seconds?: number }).seconds === "number"
        ) {
          date = new Date((timestamp as { seconds: number }).seconds * 1000);
        }

        return date ? date.getTime() : 0;
      };

      const timeA = getTimestamp(a);
      const timeB = getTimestamp(b);

      return timeB - timeA;
    });
  const handleChatSelect = async (conversation: any) => {
    if (!user?.id) return;

    const conversationId =
      conversation.id ||
      (await getOrCreateConversation(
        user.id,
        conversation.other_user.user_id || conversation.other_user.id,
      ));

    onChatSelect(
      conversation.other_user.user_id || conversation.other_user.id,
      conversation.other_user.display_name || conversation.other_user.username,
      conversationId,
    );
  };

  const handleNewChat = () => {
    setShowFriendsModal(true);
  };

  const loadFriends = async () => {
    if (!user?.id) return;
    setLoadingFriends(true);
    try {
      // A stalled membership/profile request must not strand the sheet in a
      // permanent spinner. The next open retries the authoritative read.
      const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("friends_load_timeout")), 6_000);
      });
      const response = await Promise.race([
        friendsService.getFriends(user.id),
        timeout,
      ]);
      console.log("[ChatList] Friends response:", response);
      if (response.success && response.friends) {
        console.log("[ChatList] Friends data:", response.friends);
        // Get existing conversation user IDs
        const existingConversationUserIds = new Set(
          conversations.map(
            (conv) => conv.other_user?.user_id || conv.other_user?.id,
          ),
        );

        // Filter friends who don't have existing conversations
        const availableFriends = response.friends.filter(
          (friend: any) =>
            !existingConversationUserIds.has(friend.userId || friend.id),
        );

        console.log("[ChatList] Available friends:", availableFriends);
        setFriendsList(availableFriends);
      } else {
        setFriendsList([]);
      }
    } catch (error) {
      console.error("Error loading friends:", error);
      setFriendsList([]);
    } finally {
      setLoadingFriends(false);
    }
  };

  const handleFriendSelect = async (friend: any) => {
    if (!user?.id) return;
    const friendUserId = friend.userId || friend.id;
    const friendName =
      friend.displayName ||
      friend.nickname ||
      friend.display_name ||
      friend.username;

    try {
      console.log("[ChatList] Friend selected:", friend);

      // Prime the friend's profile in the cache with ALL possible field names
      // This ensures the messaging service can find the correct username
      const profileData = {
        displayName:
          friend.displayName ||
          friend.display_name ||
          friend.nickname ||
          friend.username,
        username: friend.username,
        avatarUrl: friend.avatarUrl || friend.avatar_url || friend.avatar,
        display_name:
          friend.display_name ||
          friend.displayName ||
          friend.nickname ||
          friend.username,
        avatar_url: friend.avatarUrl || friend.avatar_url || friend.avatar,
        avatar: friend.avatar || friend.avatarUrl || friend.avatar_url,
        nickname:
          friend.nickname ||
          friend.displayName ||
          friend.display_name ||
          friend.username,
      };

      console.log("[ChatList] Priming profile for:", friendUserId, profileData);
      primeResolvedUserProfile(friendUserId, profileData);

      const conversationId = await getOrCreateConversation(
        user.id,
        friendUserId,
      );

      console.log("[ChatList] Conversation created/loaded:", conversationId);

      const updatedConversation = useMessagingStore
        .getState()
        .conversations.find((c) => c.id === conversationId);
      console.log("[ChatList] Updated conversation:", updatedConversation);

      const resolvedFriendName =
        updatedConversation?.other_user?.display_name ||
        updatedConversation?.other_user?.username ||
        friendName;

      onChatSelect(friendUserId, resolvedFriendName, conversationId);
      setShowFriendsModal(false);
    } catch (error) {
      console.error("Failed to create new chat:", error);
    }
  };

  // Load friends when modal opens
  useEffect(() => {
    if (showFriendsModal) {
      loadFriends();
    }
  }, [showFriendsModal, conversations]);

  // The global navigation sits above regular screen content. Hide it while this
  // modal is open so it cannot intercept a friend selection near the bottom of
  // the sheet (especially on short mobile viewports).
  useEffect(() => {
    if (!showFriendsModal) return;

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
  }, [showFriendsModal]);

  const showSpinner = loading && conversations.length === 0;

  if (showCantSleepRoom) {
    return (
      <CantSleepRoomScreen
        isActive={isActive}
        onBack={() => setShowCantSleepRoom(false)}
      />
    );
  }

  return (
    <div
      style={{
        fontFamily:
          "var(--font-ui)",
        height: "100dvh",
        paddingBottom: "var(--bottom-nav-total-height)",
        background:
          "linear-gradient(180deg, #141414 0%, #0e0e0e 52%, #0a0a0a 100%)",
      }}
      className="chat-inbox-screen flex flex-col"
    >
      <div
        className="chat-inbox-scroll mx-auto flex w-full max-w-[460px] flex-1 overflow-y-auto px-[18px] pb-10"
        style={{
          gap: "0px",
          display: "flex",
          flexDirection: "column",
          paddingTop: "calc(var(--safe-area-top) + 12px)",
        }}
      >
        <div
          className="chat-inbox-header relative z-10 shrink-0 pb-4 pt-1"
          style={{
              background: "transparent",
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div
                className="chat-inbox-title"
                style={{
                  fontSize: "34px",
                  fontWeight: 900,
                  color: "#ffffff",
                  letterSpacing: "-0.04em",
                  lineHeight: 1,
                }}
              >
                messages
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                onClick={onNavigateToCommunityDares}
                aria-label="Community dare hub"
                className="chat-header-action"
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  background: "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "none",
                  border: "none",
                  color: "#94a3b8",
                  cursor: onNavigateToCommunityDares ? "pointer" : "default",
                  flexShrink: 0,
                  position: "relative",
                }}
              >
                <Users size={23} color="#c8d2cc" strokeWidth={2.1} />
              </button>
              <button
                onClick={onInviteAlertsClick}
                aria-label="Invite alerts"
                className="chat-header-action"
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: "50%",
                  background: "transparent",
                  border: "none",
                  color: "#c8d2cc",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                  position: "relative",
                }}
              >
                <Bell size={22} strokeWidth={2.1} />
                {inviteAlertCount > 0 && (
                  <span
                    style={{
                    position: "absolute",
                    top: 1,
                    right: 0,
                    minWidth: 18,
                    height: 18,
                    padding: "0 4px",
                    borderRadius: 999,
                    background: "#f5f5f5",
                    color: "#061008",
                    border: "2px solid #080b09",
                    fontSize: 10,
                    fontWeight: 900,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    }}
                  >
                    {inviteAlertCount > 9 ? "9+" : inviteAlertCount}
                  </span>
                )}
              </button>
              <button
                onClick={handleNewChat}
                aria-label="Start new chat"
                className="chat-new-button"
              >
                <Plus size={26} color="#061008" strokeWidth={2.7} />
              </button>
            </div>
          </div>
        </div>

        <ChatPresenceRail
          conversations={filteredConversations}
          currentUser={user}
          isActive={isActive}
        />

        <div className="mt-5 flex items-center justify-between pb-2">
          <span className="chat-section-label">recent chats</span>
        </div>

        {onCircleChatClick && <CircleChatEntry onClick={onCircleChatClick} />}

        {onDailyChallengeClick ? (
          <DailyChallengeChatCard onClick={onDailyChallengeClick} />
        ) : null}

        <CantSleepChatCard onClick={() => setShowCantSleepRoom(true)} />

        <DarrenChatCard
          onClick={() =>
            onChatSelect(DARREN_USER_ID, "Darren", DARREN_CONVERSATION_ID)
          }
        />

        {showSpinner ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4ade80]" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-red-500">{error}</p>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="chat-inbox-empty flex min-h-[240px] flex-col items-center justify-center px-6 py-12 text-center">
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-[24px] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(74,222,128,0.12),rgba(255,255,255,0.03)_55%,transparent_75%)]">
              <MessageCircle size={28} className="text-[#86efac]" />
            </div>
            <p className="mb-2 text-lg font-bold text-white">
              No conversations yet
            </p>
            <p className="max-w-xs text-sm leading-relaxed text-[#94a3b8]">
              Start a new chat to get messaging!
            </p>
          </div>
        ) : (
          filteredConversations.map((conversation) => {
            const otherUserId =
              conversation.other_user?.user_id || conversation.other_user?.id;
            const unreadCount = conversation.unread_count ?? 0;
            const isRead = unreadCount === 0;
            const isOnline =
              !!otherUserId && onlineFriends.includes(otherUserId);
            const isTyping =
              !!conversation.is_typing ||
              typingUsers.some(
                (typingUser) =>
                  typingUser.conversation_id === conversation.id &&
                  typingUser.user_id !== user?.id &&
                  typingUser.is_typing,
              );

            const latestMessageContent =
              conversation.last_message_content ||
              conversation.last_message?.content ||
              "No messages yet";
            const latestMessageAt =
              conversation.last_message?.created_at ||
              conversation.last_message_at ||
              conversation.created_at;
            const latestMessageTime = formatConversationTime(latestMessageAt);

            return (
              <div
                key={conversation.id}
                className="chat-inbox-row"
                role="button"
                tabIndex={0}
                onClick={() => handleChatSelect(conversation)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    void handleChatSelect(conversation);
                  }
                }}
                style={{
                  background: "transparent",
                  borderRadius: "0px",
                  padding: "14px 2px",
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                  marginBottom: "0px",
                  border: "none",
                  boxShadow: "none",
                  transition:
                    "background 0.15s ease, border-color 0.15s ease, transform 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    "rgba(255,255,255,0.035)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background =
                    "transparent";
                }}
              >
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <Avatar
                    src={conversation.other_user.avatar_url || ""}
                    alt={
                      (conversation.other_user.user_id &&
                        userProfiles[conversation.other_user.user_id]
                          ?.displayName) ||
                      conversation.other_user.display_name ||
                      conversation.other_user.username
                    }
                    size="lg"
                    userId={otherUserId}
                    showStatus={false}
                  />
                  <div
                    style={{
                      position: "absolute",
                      right: "2px",
                      bottom: "2px",
                      width: "10px",
                      height: "10px",
                      borderRadius: "999px",
                      background: isOnline ? "#22c55e" : "#2a2a2a",
                      border: "2px solid #0d100d",
                      boxShadow: isOnline
                        ? "0 0 0 2px rgba(34,197,94,0.18)"
                        : "none",
                    }}
                    // DEBUG: Log when presence indicator is rendered
                    onClick={(e) => {
                      e.stopPropagation();
                      console.log(
                        "🔍 [ChatList DEBUG] Presence indicator clicked:",
                        {
                          conversationId: conversation.id,
                          otherUserId,
                          isOnline,
                          isTyping,
                          onlineFriends,
                          typingUsers,
                        },
                      );
                    }}
                  />
                </div>

                <div style={{ flex: 1, minWidth: 0, marginLeft: "14px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "5px",
                    }}
                  >
                    <span
                      style={{
                        color: "#f8fafc",
                        fontWeight: isRead ? 650 : 800,
                        fontSize: "16px",
                        letterSpacing: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "210px",
                      }}
                    >
                      {(conversation.other_user.user_id &&
                        userProfiles[conversation.other_user.user_id]
                          ?.displayName) ||
                        conversation.other_user.display_name ||
                        conversation.other_user.username}
                    </span>
                    <span
                      style={{
                        color: "rgba(226,232,240,0.5)",
                        fontSize: "12px",
                        flexShrink: 0,
                        marginLeft: "8px",
                        visibility:
                          isTyping || !latestMessageTime ? "hidden" : "visible",
                      }}
                    >
                      {latestMessageTime}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <p
                      style={{
                        color: isTyping ? "#86efac" : isRead ? "rgba(200,210,204,0.52)" : "#d8e1db",
                        fontSize: "13px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                        fontStyle: isTyping ? "normal" : "normal",
                        fontWeight: isTyping || !isRead ? 700 : 450,
                      }}
                    >
                      {isTyping ? "typing..." : latestMessageContent}
                    </p>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginLeft: "8px",
                      }}
                    >
                      {isTyping && (
                        <div
                          style={{
                            display: "flex",
                            gap: "2px",
                            alignItems: "center",
                          }}
                        >
                          {[0, 0.1, 0.2].map((delay, i) => (
                            <div
                              key={i}
                              style={{
                                width: "4px",
                                height: "4px",
                                background: "#4ade80",
                                borderRadius: "50%",
                                animation: "bounce 0.8s infinite",
                                animationDelay: `${delay}s`,
                              }}
                            />
                          ))}
                        </div>
                      )}
                      {!isTyping && unreadCount > 0 ? (
                        <span
                          style={{
                            background: "#22c55e",
                            color: "#000",
                            fontSize: "11px",
                            fontWeight: 700,
                            minWidth: "20px",
                            height: "20px",
                            borderRadius: "10px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "0 6px",
                          }}
                        >
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      ) : !isTyping ? (
                        <svg
                          width="20"
                          height="14"
                          viewBox="0 0 20 14"
                          fill="none"
                        >
                          <path
                            d="M1 7L5.5 11.5L14 3"
                            stroke="#b9c4bd"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M7 7L11.5 11.5L20 3"
                            stroke="#b9c4bd"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <style>{`
        .chat-inbox-special-row {
          min-height: 78px !important;
          margin: 0 !important;
          padding: 13px 2px !important;
          border: 0 !important;
          border-bottom: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
          transition: background-color 160ms ease-out, transform 160ms ease-out !important;
        }
        .chat-inbox-special-row::after {
          display: none !important;
        }
        .chat-inbox-special-row > div[class*="h-[60px]"] {
          width: 54px !important;
          height: 54px !important;
          border-radius: 18px !important;
          box-shadow: none !important;
        }
        .chat-inbox-special-row > div[class*="h-9"] {
          display: none !important;
        }
        .chat-inbox-special-row:active,
        .chat-inbox-row:active,
        .chat-header-action:active,
        .chat-new-button:active {
          transform: scale(0.97) !important;
        }
        .chat-inbox-row:focus-visible,
        .chat-inbox-special-row:focus-visible,
        .chat-header-action:focus-visible,
        .chat-new-button:focus-visible {
          outline: 2px solid #4ade80;
          outline-offset: 2px;
        }
        .chat-new-button {
          display: flex;
          width: 44px;
          height: 44px;
          flex-shrink: 0;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 15px;
          background: #f5f5f5;
          box-shadow: 0 8px 24px rgba(74,222,128,0.18);
          cursor: pointer;
          transition: transform 160ms ease-out, background-color 160ms ease-out;
        }
        .chat-presence-rail {
          margin-top: 10px;
          padding: 18px 0 20px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .chat-section-label {
          color: #d7e4da;
          font-size: 13px;
          font-weight: 750;
          letter-spacing: .01em;
          text-transform: lowercase;
        }
        .chat-presence-scroll {
          padding-top: 10px;
          margin-top: -10px;
          scrollbar-width: none;
        }
        .chat-presence-scroll::-webkit-scrollbar,
        .chat-inbox-scroll::-webkit-scrollbar {
          display: none;
        }
        .chat-presence-figure {
          appearance: none;
          border: 0;
          background: transparent;
          padding: 0;
          color: inherit;
          cursor: pointer;
          animation: chatFigureIn 420ms cubic-bezier(.22,.88,.28,1) both;
          transition: transform 150ms cubic-bezier(.23,1,.32,1);
        }
        .chat-presence-figure:active {
          transform: scale(.96);
        }
        .chat-stickman-motion {
          --stick-head: 48px;
          --stick-body: 56px;
          --stick-line: 3px;
          --stick-spine: 32px;
          --stick-limb: 23px;
          --stick-arm-x: 5px;
          --stick-arm-y: 11px;
          --stick-leg-x: 16px;
          --stick-leg-y: 35px;
          transform-origin: 50% 72%;
          will-change: transform;
        }
        .chat-stickman-motion.is-compact {
          --stick-head: 32px;
          --stick-body: 38px;
          --stick-line: 2px;
          --stick-spine: 22px;
          --stick-limb: 15px;
          --stick-arm-x: 4px;
          --stick-arm-y: 8px;
          --stick-leg-x: 11px;
          --stick-leg-y: 24px;
        }
        .chat-stickman-head {
          width: var(--stick-head);
          height: var(--stick-head);
          font-size: 13px;
        }
        .chat-stickman-body {
          width: var(--stick-body);
          height: var(--stick-body);
        }
        .chat-stickman-face {
          position: relative;
          width: 3px;
          height: 3px;
          margin-right: 9px;
          border-radius: 50%;
          background: #e8f1eb;
          box-shadow: 9px 0 #e8f1eb;
        }
        .chat-stickman-face::after {
          content: "";
          position: absolute;
          top: 5px;
          left: 3px;
          width: 7px;
          height: 4px;
          border-bottom: 1.5px solid #e8f1eb;
          border-radius: 50%;
        }
        .chat-stickman-prop {
          position: absolute;
          top: calc(var(--stick-head) + 6px);
          right: -9px;
          display: grid;
          width: 27px;
          height: 27px;
          place-items: center;
          border: 1px solid rgba(255,255,255,.22);
          border-radius: 8px;
          background: #18231c;
          color: #c5f6d3;
          box-shadow: 0 3px 10px rgba(0,0,0,.25);
        }
        .chat-stickman-motion.is-compact .chat-stickman-prop {
          top: calc(var(--stick-head) + 4px);
          right: -7px;
          width: 21px;
          height: 21px;
          border-radius: 6px;
        }
        .chat-stickman-cue {
          position: absolute;
          top: 5px;
          right: -13px;
          display: grid;
          width: 18px;
          height: 18px;
          place-items: center;
          color: #a7f3d0;
        }
        .chat-stickman-motion.is-compact .chat-stickman-cue {
          top: 0;
          right: -9px;
          width: 14px;
          height: 14px;
        }
        .chat-stickman-cue-sleep {
          font-size: 13px;
          font-weight: 900;
          line-height: 1;
        }
        .chat-stickman-motion.is-compact .chat-stickman-cue-sleep { font-size: 10px; }
        .chat-stickman-cue-dots::before,
        .chat-stickman-cue-dots::after {
          content: "";
          position: absolute;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: currentColor;
        }
        .chat-stickman-cue-dots::before { left: 3px; top: 5px; }
        .chat-stickman-cue-dots::after { right: 2px; top: 2px; opacity: .5; }
        .chat-stickman-motion[data-status="sleeping"] .chat-stickman-prop { transform: rotate(-12deg); }
        .chat-stickman-motion[data-status="watching-tv"] .chat-stickman-prop { color: #9bd7ff; background: #10202b; }
        .chat-stickman-motion[data-status="studying"] .chat-stickman-prop { color: #f8d48a; background: #292319; transform: rotate(8deg); }
        .chat-stickman-motion[data-status="gaming"] .chat-stickman-prop { color: #c6a5ff; background: #241b31; }
        .chat-stickman-motion[data-status="working"] .chat-stickman-prop { color: #9bd7ff; background: #15232c; }
        .chat-stickman-motion[data-status="music"] .chat-stickman-prop { color: #f4a5cb; background: #291b28; transform: rotate(-10deg); }
        .chat-stickman-motion[data-status="eating"] .chat-stickman-prop { color: #ffd49a; background: #2b2119; }
        .chat-stickman-motion[data-status="gym"] .chat-stickman-prop { color: #ffae9c; background: #2b1c1c; }
        .chat-stickman-motion[data-status="commuting"] .chat-stickman-prop { color: #9bd7ff; background: #15242c; }
        .chat-stickman-motion[data-status="partying"] .chat-stickman-prop { color: #f7b2d4; background: #2a1b29; }
        .chat-stickman-motion[data-status="chilling"] .chat-stickman-prop { color: #bdc3ff; background: #202135; }
        .chat-stickman-motion[data-status="coffee"] .chat-stickman-prop { color: #f7c39a; background: #2b211d; }
        .chat-stickman-motion[data-status="sleeping"] .chat-stickman-cue { color: #bdc3ff; animation: chatCueDrift 2.5s ease-in-out infinite; }
        .chat-stickman-motion[data-status="music"] .chat-stickman-cue { color: #f4a5cb; animation: chatCueDrift 1.9s ease-in-out infinite; }
        .chat-stickman-motion[data-status="partying"] .chat-stickman-cue { color: #f7b2d4; animation: chatCueTwinkle 1.35s ease-in-out infinite; }
        .chat-stickman-motion[data-status="watching-tv"] .chat-stickman-cue { color: #9bd7ff; animation: chatCueTwinkle 3.2s ease-in-out infinite; }
        .chat-stickman-motion[data-status="studying"] .chat-stickman-cue,
        .chat-stickman-motion[data-status="working"] .chat-stickman-cue { color: #f8d48a; animation: chatCueTick 1.5s ease-in-out infinite; }
        .chat-stickman-motion[data-status="gaming"] .chat-stickman-cue { color: #c6a5ff; animation: chatCueTwinkle 1.1s ease-in-out infinite; }
        .chat-stickman-motion[data-status="eating"] .chat-stickman-cue,
        .chat-stickman-motion[data-status="coffee"] .chat-stickman-cue { color: #ffd49a; animation: chatCueSteam 1.8s ease-in-out infinite; }
        .chat-stickman-motion[data-status="gym"] .chat-stickman-cue { color: #ffae9c; animation: chatCueDrift 1.8s ease-in-out infinite; }
        .chat-stickman-motion[data-status="commuting"] .chat-stickman-cue { color: #9bd7ff; animation: chatCueTravel 1.35s ease-in-out infinite; }
        .chat-stickman-motion[data-status="chilling"] .chat-stickman-cue { color: #bdc3ff; animation: chatCueBreathe 3.6s ease-in-out infinite; }
        .chat-stickman-motion[data-status="available"] .chat-stickman-cue { animation: chatCueBreathe 2.9s ease-in-out infinite; }
        .chat-stickman-motion[data-animated="false"],
        .chat-stickman-motion[data-animated="false"] .chat-presence-arm,
        .chat-stickman-motion[data-animated="false"] .chat-presence-leg,
        .chat-stickman-motion[data-animated="false"] .chat-stickman-cue {
          animation: none !important;
        }
        .chat-stickman-spine {
          width: var(--stick-line);
          height: var(--stick-spine);
        }
        .chat-presence-arm,
        .chat-presence-leg {
          width: var(--stick-limb);
          height: var(--stick-line);
        }
        .chat-presence-arm-left {
          left: var(--stick-arm-x);
          top: var(--stick-arm-y);
          transform: rotate(-8deg);
        }
        .chat-presence-arm-right {
          right: var(--stick-arm-x);
          top: var(--stick-arm-y);
          transform: rotate(30deg);
        }
        .chat-presence-leg-left {
          left: var(--stick-leg-x);
          top: var(--stick-leg-y);
          transform: rotate(55deg);
        }
        .chat-presence-leg-right {
          right: var(--stick-leg-x);
          top: var(--stick-leg-y);
          transform: rotate(-55deg);
        }
        .chat-stickman-motion[data-status="available"] { animation: chatPoseFloat 2.9s ease-in-out infinite; }
        .chat-stickman-motion[data-status="available"] .chat-presence-arm-right { animation: chatFirstWave 2.9s ease-in-out infinite; }
        .chat-stickman-motion[data-status="sleeping"] { animation: chatPoseSleep 3.8s ease-in-out infinite; }
        .chat-stickman-motion[data-status="sleeping"] .chat-presence-arm-left { transform: rotate(28deg); }
        .chat-stickman-motion[data-status="sleeping"] .chat-presence-arm-right { transform: rotate(-28deg); }
        .chat-stickman-motion[data-status="watching-tv"] { animation: chatPoseWatch 3.1s ease-in-out infinite; }
        .chat-stickman-motion[data-status="watching-tv"] .chat-presence-leg-left { transform: rotate(18deg); }
        .chat-stickman-motion[data-status="watching-tv"] .chat-presence-leg-right { transform: rotate(-18deg); }
        .chat-stickman-motion[data-status="studying"] { animation: chatPoseStudy 2.8s ease-in-out infinite; }
        .chat-stickman-motion[data-status="studying"] .chat-presence-arm-left { transform: rotate(20deg); }
        .chat-stickman-motion[data-status="studying"] .chat-presence-arm-right { transform: rotate(-20deg); }
        .chat-stickman-motion[data-status="gaming"] { animation: chatPoseGame 1.65s ease-in-out infinite; }
        .chat-stickman-motion[data-status="gaming"] .chat-presence-arm-left { animation: chatGameLeft 1.1s ease-in-out infinite; }
        .chat-stickman-motion[data-status="gaming"] .chat-presence-arm-right { animation: chatGameRight 1.1s ease-in-out infinite; }
        .chat-stickman-motion[data-status="working"] { animation: chatPoseStudy 3.2s ease-in-out infinite; }
        .chat-stickman-motion[data-status="music"] { animation: chatPoseGroove 1.9s ease-in-out infinite; }
        .chat-stickman-motion[data-status="music"] .chat-presence-arm-right { animation: chatArmWave 1.9s ease-in-out infinite reverse; }
        .chat-stickman-motion[data-status="eating"] { animation: chatPoseMunch 1.7s ease-in-out infinite; }
        .chat-stickman-motion[data-status="eating"] .chat-presence-arm-right,
        .chat-stickman-motion[data-status="coffee"] .chat-presence-arm-right { animation: chatSip 1.7s ease-in-out infinite; }
        .chat-stickman-motion[data-status="gym"] { animation: chatPoseSquat 1.8s ease-in-out infinite; }
        .chat-stickman-motion[data-status="gym"] .chat-presence-arm-left { transform: rotate(-48deg); }
        .chat-stickman-motion[data-status="gym"] .chat-presence-arm-right { transform: rotate(48deg); }
        .chat-stickman-motion[data-status="commuting"] { animation: chatPoseStep 1.35s ease-in-out infinite; }
        .chat-stickman-motion[data-status="partying"] { animation: chatPoseParty 1.35s ease-in-out infinite; }
        .chat-stickman-motion[data-status="partying"] .chat-presence-arm-left { animation: chatPartyLeft 1.35s ease-in-out infinite; }
        .chat-stickman-motion[data-status="partying"] .chat-presence-arm-right { animation: chatPartyRight 1.35s ease-in-out infinite; }
        .chat-stickman-motion[data-status="chilling"] { animation: chatPoseBreathe 3.6s ease-in-out infinite; }
        .chat-stickman-motion[data-status="coffee"] { animation: chatPoseFloat 2.5s ease-in-out infinite; }
        .chat-status-option {
          border-color: rgba(255,255,255,.08);
          background: rgba(255,255,255,.025);
          transition: transform 150ms cubic-bezier(.23,1,.32,1), border-color 150ms ease, background-color 150ms ease;
        }
        .chat-status-option[data-selected="true"] {
          border-color: rgba(74,222,128,.48);
          background: rgba(74,222,128,.075);
        }
        .chat-status-option:active,
        .chat-status-close:active {
          transform: scale(.96);
        }
        .chat-status-option:focus-visible,
        .chat-status-close:focus-visible,
        .chat-presence-figure:focus-visible {
          outline: 2px solid #4ade80;
          outline-offset: 2px;
        }
        .chat-status-sheet {
          animation: chatStatusSheetIn 220ms cubic-bezier(.32,.72,0,1) both;
        }
        @keyframes chatStatusSheetIn {
          from { opacity: 0; transform: translateY(22px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes chatPoseFloat {
          0%, 100% { transform: translateY(0) rotate(-2deg); }
          50% { transform: translateY(-5px) rotate(2deg); }
        }
        @keyframes chatPoseSleep {
          0%, 100% { transform: translateY(2px) rotate(8deg) scaleY(.96); }
          50% { transform: translateY(3px) rotate(10deg) scaleY(.93); }
        }
        @keyframes chatPoseWatch {
          0%, 100% { transform: translateY(2px) rotate(-3deg); }
          50% { transform: translateY(1px) rotate(1deg); }
        }
        @keyframes chatPoseStudy {
          0%, 100% { transform: translateY(0) rotate(0); }
          52% { transform: translateY(2px) rotate(2deg); }
        }
        @keyframes chatPoseGame {
          0%, 100% { transform: translateY(0) rotate(-1deg); }
          48% { transform: translateY(-3px) rotate(1deg); }
        }
        @keyframes chatPoseGroove {
          0%, 100% { transform: rotate(-5deg) translateX(-1px); }
          50% { transform: rotate(5deg) translateX(2px); }
        }
        @keyframes chatPoseMunch {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(1px) scale(.98); }
        }
        @keyframes chatPoseSquat {
          0%, 100% { transform: translateY(0) scaleY(1); }
          50% { transform: translateY(5px) scaleY(.92); }
        }
        @keyframes chatPoseStep {
          0%, 100% { transform: translateX(-2px) rotate(-3deg); }
          50% { transform: translateX(2px) rotate(3deg); }
        }
        @keyframes chatPoseParty {
          0%, 100% { transform: translateY(0) rotate(-6deg); }
          50% { transform: translateY(-5px) rotate(7deg); }
        }
        @keyframes chatPoseBreathe {
          0%, 100% { transform: translateY(1px) scale(1); }
          50% { transform: translateY(-1px) scale(1.015); }
        }
        @keyframes chatCueDrift {
          0%, 100% { transform: translateY(2px) rotate(-8deg); opacity: .45; }
          50% { transform: translateY(-4px) rotate(8deg); opacity: 1; }
        }
        @keyframes chatCueSteam {
          0%, 100% { transform: translateY(3px); opacity: .25; }
          50% { transform: translateY(-4px); opacity: .9; }
        }
        @keyframes chatCueTwinkle {
          0%, 100% { transform: scale(.75); opacity: .4; }
          50% { transform: scale(1.12); opacity: 1; }
        }
        @keyframes chatCueTick {
          0%, 100% { transform: translateX(0); opacity: .35; }
          50% { transform: translateX(3px); opacity: 1; }
        }
        @keyframes chatCueTravel {
          0%, 100% { transform: translateX(-3px); opacity: .3; }
          50% { transform: translateX(3px); opacity: 1; }
        }
        @keyframes chatCueBreathe {
          0%, 100% { transform: scale(.8); opacity: .35; }
          50% { transform: scale(1); opacity: .85; }
        }
        @keyframes chatFigureIn {
          from { opacity: 0; transform: translateY(7px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes chatArmWave {
          0%, 72%, 100% { transform: rotate(-30deg); }
          82% { transform: rotate(-52deg); }
          90% { transform: rotate(-18deg); }
        }
        @keyframes chatFirstWave {
          0%, 58%, 100% { transform: rotate(30deg); }
          70% { transform: rotate(-18deg); }
          80% { transform: rotate(56deg); }
          90% { transform: rotate(4deg); }
        }
        @keyframes chatGameLeft {
          0%, 100% { transform: rotate(15deg); }
          50% { transform: rotate(2deg); }
        }
        @keyframes chatGameRight {
          0%, 100% { transform: rotate(-15deg); }
          50% { transform: rotate(-2deg); }
        }
        @keyframes chatSip {
          0%, 60%, 100% { transform: rotate(30deg); }
          72%, 88% { transform: rotate(-38deg); }
        }
        @keyframes chatPartyLeft {
          0%, 100% { transform: rotate(-48deg); }
          50% { transform: rotate(12deg); }
        }
        @keyframes chatPartyRight {
          0%, 100% { transform: rotate(48deg); }
          50% { transform: rotate(-12deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .chat-presence-figure,
          .chat-stickman-motion,
          .chat-presence-arm,
          .chat-presence-leg,
          .chat-stickman-cue,
          .chat-status-sheet { animation: none !important; }
        }
        @media (max-width: 360px) {
          .chat-inbox-title { font-size: 30px !important; }
          .chat-header-action,
          .chat-new-button { width: 40px !important; height: 40px !important; }
          .chat-inbox-scroll { padding-inline: 14px !important; }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes chatDialogEnter {
          from {
            opacity: 0;
            transform: translate(-50%, 100%);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
      `}</style>

      {/* Friends Modal */}
      {showFriendsModal && (
        <>
          <div
            className="app-modal-backdrop"
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: "var(--bottom-nav-total-height)",
              background: "rgba(0,0,0,0.78)",
              backdropFilter: "blur(20px)",
              zIndex: 200,
            }}
            onClick={() => setShowFriendsModal(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Start New Chat"
            style={{
              position: "fixed",
              bottom: 0,
              left: "50%",
              transform: "translate(-50%, 0)",
              background:
                "radial-gradient(circle at 50% -18%, rgba(74,222,128,0.1), transparent 42%), #0c100d",
              borderRadius: "30px 30px 0 0",
              width: "100%",
              maxWidth: "460px",
              maxHeight: "78dvh",
              zIndex: 10000,
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow:
                "0 28px 80px rgba(0,0,0,0.68), inset 0 1px 0 rgba(255,255,255,0.05)",
              animation: "chatDialogEnter 240ms var(--motion-ease-out) both",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "22px 20px 18px",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h2
                style={{
                  color: "#fff",
                  fontSize: "22px",
                  fontWeight: 850,
                  margin: 0,
                  letterSpacing: 0,
                }}
              >
                Start New Chat
              </h2>
              <button
                aria-label="Close Start New Chat"
                onClick={() => setShowFriendsModal(false)}
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "50%",
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.045)",
                  color: "#94a3b8",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div
              style={{
                padding: "8px 20px calc(var(--safe-area-bottom) + 20px)",
                overflowY: "auto",
                maxHeight: "calc(78dvh - 84px)",
              }}
            >
              {loadingFriends ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "40px 20px",
                    color: "#94a3b8",
                    fontSize: 14,
                  }}
                >
                  Loading friends...
                </div>
              ) : friendsList.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "40px 20px",
                    color: "#94a3b8",
                    fontSize: 14,
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 22,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background:
                        "radial-gradient(circle at top, rgba(74,222,128,0.12), rgba(255,255,255,0.03) 60%, transparent 80%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 14,
                    }}
                  >
                    <User size={28} color="#86efac" />
                  </div>
                  <p style={{ color: "#fff", fontWeight: 750 }}>
                    No friends available
                  </p>
                  <p style={{ fontSize: 12, marginTop: "4px" }}>
                    All your friends already have conversations
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0px",
                  }}
                >
                  {friendsList.map((friend, i) => (
                    <div
                      key={`friend-${friend.id || friend.userId}-${i}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: "14px 2px",
                        borderRadius: "0",
                        background: "transparent",
                        border: "none",
                        borderBottom: "1px solid rgba(255,255,255,0.075)",
                        cursor: "pointer",
                        transition:
                          "background 0.15s ease, border-color 0.15s ease",
                      }}
                      onClick={() => handleFriendSelect(friend)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          "rgba(255,255,255,0.035)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background =
                          "transparent";
                      }}
                    >
                      <div style={{ flexShrink: 0 }}>
                        <Avatar
                          src={friend.avatarUrl || friend.avatar_url || ""}
                          alt={
                            friend.displayName ||
                            friend.nickname ||
                            friend.display_name ||
                            friend.username
                          }
                          size={56}
                          userId={friend.userId || friend.id}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            color: "#fff",
                            fontWeight: 600,
                            fontSize: 16,
                            margin: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {friend.displayName ||
                            friend.nickname ||
                            friend.display_name ||
                            friend.username}
                        </p>
                        <p
                          style={{
                            color: "rgba(255,255,255,0.4)",
                            fontSize: 13,
                            margin: "2px 0 0",
                          }}
                        >
                          @
                          {String(friend.username || "unknown").replace(
                            /^@/,
                            "",
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
