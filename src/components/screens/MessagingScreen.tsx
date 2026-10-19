import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  useMessagingStore,
  type MessageEvent,
} from "../../stores/useMessagingStore";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import { Avatar } from "../ui/Avatar";
import { joinsChatGroup, chatSenderColor, type ChatGroupEntry } from '../chat/chatPresentation';
import '../chat/chat-presentation.css';
import { useChatViewport } from '../chat/useChatViewport';
import { useProfileDataStore } from "../../stores/profileDataStore";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  messagingService,
  type ChatSwitchSignal,
} from "../../middleware/services/messaging.service";
import {
  chatInviteService,
  type ChatInvite,
} from "../../middleware/services/chat-invite.service";
import { GamesRoomScreen } from "./GamesRoomScreen";
import { friendsService } from "../../middleware/services/service-factory";
import {
  isSharedStoryPreviewActive,
  parseSharedPostPayload,
  parseSharedStoryPayload,
  type SharedPostPayload,
  type SharedStoryPayload,
} from "../../utils/sharedPostMessage";
import { uploadOptimizedMedia } from "../../utils/mediaUpload";
import { signedUrlService } from "@/security/signedUrls";
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  MoreHorizontal,
  Reply,
  Search,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";

type From = "me" | "them";
type Status = "seen" | "delivered" | "screenshot";
type EvType =
  | "screenshot"
  | "chat_switch"
  | "opened_noreply"
  | "long_unsent"
  | "mention"
  | "ignored"
  | "invite";

interface Msg {
  id: string;
  kind: "msg";
  from: From;
  text: string;
  senderId: string;
  senderName: string;
  sharedPost: SharedPostPayload | null;
  sharedStory: SharedStoryPayload | null;
  mediaUrl: string | null;
  mediaType: string | null;
  photoUrls: string[];
  sourceIds: string[];
  replyTo: ReplyTarget | null;
  createdAt?: string | number;
  optimistic?: boolean;
  failed?: boolean;
  deliveryStatus?: Status;
}
interface Evt {
  id: string;
  kind: "evt";
  type: EvType;
  text: string;
  targetUserId?: string;
  data?: any;
  createdAt?: string | number;
}
type TimelineItem = Msg | Evt;
function groupEntry(item?: TimelineItem): ChatGroupEntry | undefined {
  return item?.kind === 'msg' ? {
    sender: item.senderId || item.from,
    time: item.createdAt,
    standalone: Boolean(item.replyTo || item.photoUrls.length || item.sharedPost || item.sharedStory || item.failed || item.optimistic),
  } : undefined;
}
interface ChatPhoto {
  key: string;
  url: string;
}

interface ReplyTarget {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  mediaType?: string | null;
}

interface OptimisticPhotoMessage {
  id: string;
  conversationId: string;
  localUrl: string;
  uploadedUrl?: string;
  file: File;
  createdAt: number;
  failed?: boolean;
}

interface OptimisticTextMessage {
  id: string;
  conversationId: string;
  text: string;
  replyTo: ReplyTarget | null;
  createdAt: number;
  failed?: boolean;
}


const FRIEND = {
  name: "Nina Creates",
  avatar: "https://picsum.photos/seed/nina/100/100",
};

const MESSAGING_SCREEN_DEBUG = false;
const LIVE_SCREEN_DEBUG = true;
const REDUNDANT_SCREEN_LOGS = false;

function redundantScreenLog(...args: unknown[]) {
  if (REDUNDANT_SCREEN_LOGS) console.info(...args);
}

function liveScreenDebug(label: string, details: Record<string, unknown> = {}) {
  if (!LIVE_SCREEN_DEBUG) return;
  console.info(`[DARE_LIVE_DEBUG][screen] ${label}`, {
    at: new Date().toISOString(),
    ...details,
  });
}

function summarizeMessageForReply(msg: Msg): string {
  const trimmed = msg.text.trim();
  if (
    trimmed &&
    !/^photo$/i.test(trimmed) &&
    !/^\d+\s+photos$/i.test(trimmed)
  ) {
    return trimmed.length > 96 ? `${trimmed.slice(0, 96)}...` : trimmed;
  }
  if (msg.photoUrls.length > 1) return `${msg.photoUrls.length} photos`;
  if (msg.photoUrls.length === 1 || msg.mediaType === "PHOTO") return "Photo";
  if (msg.sharedStory) return "Story reply";
  if (msg.sharedPost) return "Shared post";
  return "Message";
}

function replyPreviewLabel(replyTo: ReplyTarget): string {
  if (replyTo.mediaType === "PHOTO") return replyTo.content || "Photo";
  return replyTo.content || "Message";
}

function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function parsePresenceTimestamp(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === "number") {
    const time = value < 10_000_000_000 ? value * 1000 : value;
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === "string") {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === "object") {
    const timestamp = value as {
      seconds?: number;
      nanoseconds?: number;
      toDate?: () => Date;
    };
    if (typeof timestamp.toDate === "function") {
      const time = timestamp.toDate().getTime();
      return Number.isFinite(time) ? time : null;
    }
    if (typeof timestamp.seconds === "number") {
      const time =
        timestamp.seconds * 1000 +
        Math.floor((timestamp.nanoseconds ?? 0) / 1_000_000);
      return Number.isFinite(time) ? time : null;
    }
  }
  return null;
}

function getDateKey(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }
}

function formatLastSeenLabel(
  timestamp: number | null,
  timeZone: string,
): string {
  if (!timestamp) return "OFFLINE";
  const safeTimeZone = timeZone || getBrowserTimeZone();
  const lastSeenDate = new Date(timestamp);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const timeFormatterOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };
  const dateFormatterOptions: Intl.DateTimeFormatOptions = {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  };
  const time = (() => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        ...timeFormatterOptions,
        timeZone: safeTimeZone,
      }).format(lastSeenDate);
    } catch {
      return new Intl.DateTimeFormat("en-US", timeFormatterOptions).format(
        lastSeenDate,
      );
    }
  })();

  const seenKey = getDateKey(lastSeenDate, safeTimeZone);
  const todayKey = getDateKey(now, safeTimeZone);
  const yesterdayKey = getDateKey(yesterday, safeTimeZone);

  if (seenKey === todayKey) return `last seen today at ${time}`;
  if (seenKey === yesterdayKey) return `last seen yesterday at ${time}`;

  const date = (() => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        ...dateFormatterOptions,
        timeZone: safeTimeZone,
      }).format(lastSeenDate);
    } catch {
      return new Intl.DateTimeFormat("en-US", dateFormatterOptions).format(
        lastSeenDate,
      );
    }
  })();
  return `last seen ${date} at ${time}`;
}

// â”€â”€â”€ Event label helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const getScreenshotLabel = () => (
  <span>
    <span style={{ color: "#888" }}>You took a </span>
    <span style={{ color: "#d6dde8", fontWeight: 700 }}>screenshot</span>
    <span style={{ color: "#888" }}> of this chat</span>
  </span>
);

const getChatSwitchLabel = (text: string) => {
  const mine = text.match(/^You\s+went\s+to\s+chat\s+with\s+(.+)$/i);
  if (mine) {
    return (
      <span>
        <span style={{ color: "#888" }}>You went to chat with </span>
        <span style={{ color: "#d6dde8", fontWeight: 700 }}>{mine[1]}</span>
      </span>
    );
  }

  const m = text.match(
    /^(.+?)\s+is\s+(?:chatting|talking)\s+with\s+(.+?)(?:,\s*not\s+you|(?:\s+instead\s+of\s+you)!?)?$/i,
  );
  if (m) {
    return (
      <span>
        <span style={{ color: "#888" }}>Wait! </span>
        <span style={{ color: "#d6dde8", fontWeight: 700 }}>{m[1]}</span>
        <span style={{ color: "#888" }}> is now talking with </span>
        <span style={{ color: "#d6dde8", fontWeight: 700 }}>{m[2]}</span>
        <span style={{ color: "#888" }}> instead of you!</span>
      </span>
    );
  }
  return <span style={{ color: "#888" }}>{text}</span>;
};

const getOpenedNoReplyLabel = (text: string) => {
  const m = text.match(/^(.*?)\s+opened\s+(.*)$/i);
  return m ? (
    <span>
      <span style={{ color: "#d6dde8", fontWeight: 700 }}>{m[1]}</span>
      <span style={{ color: "#888" }}> opened the chat but </span>
      <span style={{ color: "#d6dde8", fontWeight: 700 }}>didn&apos;t reply</span>
    </span>
  ) : (
    <span style={{ color: "#888" }}>{text}</span>
  );
};

const getLongUnsentLabel = () => (
  <span>
    <span style={{ color: "#888" }}>You typed a </span>
    <span style={{ color: "#d6dde8", fontWeight: 700 }}>long message</span>
    <span style={{ color: "#888" }}> but </span>
    <span style={{ color: "#d6dde8", fontWeight: 700 }}>didn&apos;t send it</span>
  </span>
);

const getMentionLabel = (text: string) => {
  const m = text.match(
    /^(@\S+) was notified that you two are talking about them(.*)$/i,
  );
  return m ? (
    <span>
      <span style={{ color: "#d6dde8", fontWeight: 700 }}>{m[1]}</span>
      <span style={{ color: "#888" }}>
        {" "}
        was notified that you two are talking about them{m[2]}
      </span>
    </span>
  ) : (
    <span style={{ color: "#888" }}>{text}</span>
  );
};

const getIgnoredLabel = (text: string) => {
  const currentUserIgnored = text.match(/^You\s+ignored\s+(.+?)'s\s+message$/i);
  if (currentUserIgnored) {
    return (
      <span>
        <span style={{ color: "#888" }}>You ignored </span>
        <span style={{ color: "#ff6b6b", fontWeight: 700 }}>
          {currentUserIgnored[1]}
        </span>
        <span style={{ color: "#888" }}>&apos;s message</span>
      </span>
    );
  }

  const otherUserIgnored = text.match(/^(.+?)\s+ignored\s+your\s+message$/i);
  return otherUserIgnored ? (
    <span>
      <span style={{ color: "#ff6b6b", fontWeight: 700 }}>
        {otherUserIgnored[1]}
      </span>
      <span style={{ color: "#888" }}> ignored your message</span>
    </span>
  ) : (
    <span style={{ color: "#888" }}>{text}</span>
  );
};

const getInviteLabel = (text: string) => {
  const m = text.match(
    /^(.+?)\s+(was invited|has joined this conversation|was removed|left)$/i,
  );
  return m ? (
    <span>
      <span style={{ color: "#d6dde8", fontWeight: 700 }}>{m[1]}</span>
      <span style={{ color: "#888" }}> {m[2]}</span>
    </span>
  ) : (
    <span style={{ color: "#888" }}>{text}</span>
  );
};

const EV_CFG: Record<
  EvType,
  { icon: string; accent: string; label: (t: string) => React.ReactNode }
> = {
  screenshot: {
    icon: "ðŸ“¸",
    accent: "#d6dde8",
    label: () => getScreenshotLabel(),
  },
  chat_switch: { icon: "ðŸ’¬", accent: "#d6dde8", label: getChatSwitchLabel },
  opened_noreply: {
    icon: "ðŸ‘",
    accent: "#d6dde8",
    label: getOpenedNoReplyLabel,
  },
  long_unsent: {
    icon: "âœï¸",
    accent: "#d6dde8",
    label: () => getLongUnsentLabel(),
  },
  mention: { icon: "ðŸ””", accent: "#d6dde8", label: getMentionLabel },
  ignored: {
    icon: "ðŸ«¥",
    accent: "#ff6b6b",
    label: (text: string) => getIgnoredLabel(text),
  },
  invite: {
    icon: "+",
    accent: "#d6dde8",
    label: getInviteLabel,
  },
};

// â”€â”€â”€ SysLine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getMoodTheme(mood: string) {
  if (mood === "angry") {
    return {
      accent: "#ff6b5f",
      accentSoft: "rgba(255,107,95,0.24)",
      accentGlow: "rgba(255,107,95,0.42)",
      panel:
        "linear-gradient(180deg, rgba(58,18,18,0.96) 0%, rgba(18,10,10,0.98) 100%)",
      label: "Heat Rising",
    };
  }
  if (mood === "crying") {
    return {
      accent: "#69b7ff",
      accentSoft: "rgba(105,183,255,0.24)",
      accentGlow: "rgba(105,183,255,0.4)",
      panel:
        "linear-gradient(180deg, rgba(16,35,58,0.96) 0%, rgba(9,16,28,0.98) 100%)",
      label: "Soft Silence",
    };
  }
  if (mood === "irritated") {
    return {
      accent: "#ffb347",
      accentSoft: "rgba(255,179,71,0.24)",
      accentGlow: "rgba(255,179,71,0.4)",
      panel:
        "linear-gradient(180deg, rgba(56,34,10,0.96) 0%, rgba(22,15,9,0.98) 100%)",
      label: "Tension High",
    };
  }
  if (mood === "depressed") {
    return {
      accent: "#9aa4b8",
      accentSoft: "rgba(154,164,184,0.22)",
      accentGlow: "rgba(154,164,184,0.34)",
      panel:
        "linear-gradient(180deg, rgba(24,28,38,0.96) 0%, rgba(12,14,18,0.98) 100%)",
      label: "Low Tide",
    };
  }
  return {
    accent: "#d6dde8",
    accentSoft: "rgba(214,221,232,0.18)",
    accentGlow: "rgba(214,221,232,0.3)",
    panel:
      "linear-gradient(180deg, rgba(22,30,26,0.96) 0%, rgba(12,16,14,0.98) 100%)",
    label: "Mood Active",
  };
}

function SysLine({
  type,
  text,
  collapsed,
  targetUserId,
  data,
  currentUserId,
  onEnterGameInvite,
  onOpenUserProfile,
}: {
  type: EvType;
  text: string;
  collapsed: boolean;
  targetUserId?: string;
  data?: any;
  currentUserId?: string;
  onEnterGameInvite?: (sessionId: string) => void;
  onOpenUserProfile?: (userId: string) => void;
}) {
  const cfg = EV_CFG[type];
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [type, text, collapsed, targetUserId]);

  const openTargetProfile = () => {
    if (!targetUserId) return;
    onOpenUserProfile?.(targetUserId);
  };

  if (
    type === "invite" &&
    (data?.action === "game_invite" || data?.action === "game_played")
  ) {
    const inviterName = String(data.inviter_name || "Someone");
    const gameTitle = String(data.game_title || "This Or That");
    const sessionId = String(data.session_id || "");
    const mine = data.inviter_id === currentUserId;
    const played = data.action === "game_played";
    return (
      <div
        style={{
          padding: "8px 14px 10px",
          display: "flex",
          justifyContent: "center",
          opacity: entered ? 1 : 0,
          transform: entered
            ? "translateY(0) scale(1)"
            : "translateY(12px) scale(0.98)",
          transition:
            "opacity 0.32s ease, transform 0.34s cubic-bezier(0.2, 0.9, 0.2, 1)",
        }}
      >
        <div
          style={{
            width: "min(100%, 360px)",
            position: "relative",
            overflow: "hidden",
            borderRadius: 26,
            border: "1px solid rgba(214,221,232,0.22)",
            background:
              "linear-gradient(135deg, rgba(18,28,22,0.96), rgba(18,19,30,0.96) 50%, rgba(8,32,25,0.96))",
            boxShadow:
              "0 18px 46px rgba(0,0,0,0.34), 0 0 30px rgba(214,221,232,0.1)",
            padding: 16,
            color: "#fff",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: "0 auto auto 0",
              width: "100%",
              height: 2,
              background:
                "linear-gradient(90deg, transparent, rgba(214,221,232,0.9), rgba(103,232,249,0.7), transparent)",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background:
                  "linear-gradient(135deg, rgba(214,221,232,0.95), rgba(103,232,249,0.82))",
                color: "#07130c",
                fontSize: 24,
                boxShadow: "0 12px 30px rgba(214,221,232,0.22)",
              }}
            >
              <UserPlus size={23} strokeWidth={2.8} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  color: "#c8d0d8",
                  fontSize: 10,
                  fontWeight: 950,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                {played ? "Game receipt" : "Game invite"}
              </div>
              <div
                style={{
                  fontSize: 16,
                  lineHeight: 1.22,
                  fontWeight: 950,
                  letterSpacing: "0.01em",
                }}
              >
                {played
                  ? `You played ${gameTitle} together`
                  : mine
                    ? "You invited them"
                    : `${inviterName} invited you`}
              </div>
            </div>
          </div>
          <div
            style={{
              marginTop: 14,
              padding: "13px 14px",
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.055)",
            }}
          >
            <div
              style={{
                color: "#fff",
                fontSize: 22,
                lineHeight: 1,
                fontWeight: 1000,
              }}
            >
              {gameTitle}
            </div>
            <div
              style={{
                marginTop: 7,
                color: "rgba(255,255,255,0.55)",
                fontSize: 12,
                fontWeight: 750,
              }}
            >
              {played
                ? "Finished together. The receipt stays in the chat."
                : "Enter the waiting room. The round starts only when both people are in."}
            </div>
          </div>
          {!played && (
            <button
              type="button"
              data-game-session-id={sessionId || undefined}
              disabled={!sessionId}
              onClick={() => sessionId && onEnterGameInvite?.(sessionId)}
              style={{
                marginTop: 13,
                width: "100%",
                minHeight: 48,
                border: "none",
                borderRadius: 18,
                background:
                  "linear-gradient(135deg, #d6dde8 0%, #c8d0d8 48%, #67e8f9 100%)",
                color: "#06120b",
                fontSize: 14,
                fontWeight: 1000,
                cursor: sessionId ? "pointer" : "default",
                boxShadow: "0 12px 28px rgba(214,221,232,0.22)",
              }}
            >
              Enter waiting room
            </button>
          )}
        </div>
      </div>
    );
  }

  const renderTargetName = (label: string) =>
    targetUserId && onOpenUserProfile ? (
      <button
        onClick={openTargetProfile}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          margin: 0,
          color: "#d6dde8",
          fontWeight: 700,
          cursor: "pointer",
          font: "inherit",
        }}
      >
        {label}
      </button>
    ) : (
      <span style={{ color: "#d6dde8", fontWeight: 700 }}>{label}</span>
    );

  const shortNode = (() => {
    if (type === "chat_switch") {
      const mine = text.match(/^You\s+went\s+to\s+chat\s+with\s+(.+)$/i);
      if (mine) {
        return (
          <span>
            <span style={{ color: "#d6dde8", fontWeight: 700 }}>You</span>
            <span style={{ color: "#888" }}> â†’ </span>
            <span style={{ color: "#d6dde8", fontWeight: 700 }}>{mine[1]}</span>
          </span>
        );
      }
      const m = text.match(
        /(?:talking|chatting)\s+with\s+(.+?)(?:\s+instead\s+of\s+you!?|,\s*not\s+you)?$/i,
      );
      return (
        <span>
          <span style={{ color: "#888" }}>Was chatting with </span>
          {renderTargetName(m?.[1] ?? "someone")}
        </span>
      );
    }
    if (type === "opened_noreply") {
      const m = text.match(/^(.*?)\s+opened/i);
      return (
        <span>
          <span style={{ color: "#d6dde8", fontWeight: 700 }}>
            {m?.[1] ?? "User"}
          </span>
          <span style={{ color: "#888" }}> opened â€¢ no reply</span>
        </span>
      );
    }
    if (type === "mention") {
      const m = text.match(/^(@\S+)/);
      return m ? (
        <span>
          <span style={{ color: "#d6dde8", fontWeight: 700 }}>{m[1]}</span>
          <span style={{ color: "#888" }}> notified</span>
        </span>
      ) : (
        <span style={{ color: "#777" }}>{text}</span>
      );
    }
    if (type === "invite") return getInviteLabel(text);
    if (type === "screenshot")
      return (
        <span>
          <span style={{ color: "#888" }}>ðŸ“¸ </span>
          <span style={{ color: "#d6dde8", fontWeight: 700 }}>screenshot</span>
        </span>
      );
    if (type === "long_unsent")
      return (
        <span>
          <span style={{ color: "#d6dde8", fontWeight: 700 }}>Long msg</span>
          <span style={{ color: "#888" }}> unsent</span>
        </span>
      );
    if (type === "ignored") return getIgnoredLabel(text);
    return <span style={{ color: "#777" }}>{text}</span>;
  })();

  const contentNode =
    type === "chat_switch" && !collapsed
      ? (() => {
          const mine = text.match(/^You\s+went\s+to\s+chat\s+with\s+(.+)$/i);
          if (mine) {
            return (
              <span>
                <span style={{ color: "#888" }}>You went to chat with </span>
                {renderTargetName(mine[1])}
              </span>
            );
          }
          const active = text.match(
            /^(.+?)\s+is\s+now\s+(?:talking|chatting)\s+with\s+(.+?)(?:\s+instead\s+of\s+you!?|,\s*not\s+you)?$/i,
          );
          if (active) {
            return (
              <span>
                <span style={{ color: "#888" }}>Wait! - </span>
                <span style={{ color: "#d6dde8", fontWeight: 700 }}>
                  {active[1]}
                </span>
                <span style={{ color: "#888" }}> is now talking with </span>
                {renderTargetName(active[2])}
                <span style={{ color: "#888" }}> instead of you!</span>
              </span>
            );
          }
          const past = text.match(
            /^(.+?)\s+was\s+(?:talking|chatting)\s+with\s+(.+?)(?:\s+instead\s+of\s+you!?|,\s*not\s+you)?$/i,
          );
          if (past) {
            return (
              <span>
                <span style={{ color: "#888" }}>Wait! - </span>
                <span style={{ color: "#d6dde8", fontWeight: 700 }}>
                  {past[1]}
                </span>
                <span style={{ color: "#888" }}> was chatting with </span>
                {renderTargetName(past[2])}
                <span style={{ color: "#888" }}> instead of you!</span>
              </span>
            );
          }
          return cfg.label(text);
        })()
      : collapsed
        ? shortNode
        : cfg.label(text);

  if (!cfg)
    return (
      <div
        style={{
          padding: "4px 14px 5px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <span style={{ color: "#555", fontSize: 12 }}>{text}</span>
      </div>
    );
  return (
    <div
      className="pop-message-banner"
      style={{
        padding: collapsed ? "2px 14px 2px" : "5px 14px 8px",
        display: "flex",
        justifyContent: "center",
        transition:
          "padding 0.28s ease, opacity 0.24s ease, transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)",
        opacity: entered ? 1 : 0,
        transform: entered
          ? "translateY(0) scale(1)"
          : "translateY(8px) scale(0.985)",
        willChange: "transform, opacity",
      }}
    >
      <div
        className="pop-micro-pill"
        style={{
          background:
            "linear-gradient(180deg, rgba(24,24,24,0.98), rgba(13,13,13,0.98))",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: collapsed ? 50 : 20,
          padding: collapsed ? "5.5px 13px" : "16px 20px 15px",
          display: "flex",
          flexDirection: collapsed ? "row" : "column",
          alignItems: "center",
          justifyContent: "center",
          gap: collapsed ? 5 : 10,
          overflow: "hidden",
          width: collapsed ? "fit-content" : "100%",
          maxWidth: collapsed ? 220 : "100%",
          transition:
            "border-radius 0.28s ease, padding 0.28s ease, width 0.28s ease, max-width 0.28s ease, box-shadow 0.28s ease",
          boxShadow: entered
            ? collapsed
              ? "0 10px 24px rgba(0,0,0,0.18)"
              : "0 14px 30px rgba(0,0,0,0.22)"
            : "0 0 0 rgba(0,0,0,0)",
        }}
      >
        {collapsed ? (
          <span style={{ fontSize: 11, lineHeight: 1 }}>{cfg.icon}</span>
        ) : (
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.045)",
              border: `1.5px solid ${cfg.accent}55`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            {cfg.icon}
          </div>
        )}
        <div
          className="pop-message-banner"
          style={{
            fontSize: collapsed ? 11.5 : 14,
            lineHeight: collapsed ? 1.15 : 1.5,
            textAlign: collapsed ? "left" : "center",
            letterSpacing: "0.01em",
            whiteSpace: collapsed ? "nowrap" : "normal",
            overflow: "hidden",
            textOverflow: "ellipsis",
            transition: "font-size 0.3s ease",
          }}
        >
          {contentNode}
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Shared Post Card (Instagram-DM style) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SharedPostCard({
  msg,
  variant,
  onOpenSharedPost,
}: {
  msg: Msg;
  variant: "own" | "them";
  onOpenSharedPost?: (userId: string, postId: string) => void;
}) {
  if (!msg.sharedPost) return null;
  const sp = msg.sharedPost;
  const isOwn = variant === "own";

  const palette = isOwn
    ? {
        cardBg: "#0d0d0d",
        cardBorder: "rgba(214,221,232,0.18)",
        mediaBg: "#000",
        primaryText: "#ffffff",
        secondaryText: "rgba(255,255,255,0.55)",
        captionText: "#d7ffe6",
        avatarBg: "rgba(214,221,232,0.15)",
        avatarBorder: "rgba(214,221,232,0.35)",
        footerBorder: "rgba(255,255,255,0.06)",
        footerText: "#d6dde8",
      }
    : {
        cardBg: "#0d0d0d",
        cardBorder: "rgba(255,255,255,0.1)",
        mediaBg: "#000",
        primaryText: "#ffffff",
        secondaryText: "rgba(255,255,255,0.55)",
        captionText: "#e5e7eb",
        avatarBg: "rgba(255,255,255,0.08)",
        avatarBorder: "rgba(255,255,255,0.18)",
        footerBorder: "rgba(255,255,255,0.06)",
        footerText: "#ffffff",
      };

  const usernameClean = sp.authorUsername.replace(/^@/, "");
  const initial = (sp.authorName || usernameClean || "?")
    .charAt(0)
    .toUpperCase();

  return (
    <button
      onClick={() => onOpenSharedPost?.(sp.authorId, sp.postId)}
      style={{
        background: palette.cardBg,
        border: `1px solid ${palette.cardBorder}`,
        borderRadius: 20,
        padding: 0,
        margin: 0,
        width: 320,
        maxWidth: "100%",
        textAlign: "left",
        cursor: "pointer",
        color: palette.primaryText,
        overflow: "hidden",
        display: "block",
        boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
      }}
    >
      {/* Header: avatar + username */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
        }}
      >
        {sp.authorAvatar ? (
          <img
            src={sp.authorAvatar}
            alt=""
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              objectFit: "cover",
              border: `1px solid ${palette.avatarBorder}`,
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: palette.avatarBg,
              border: `1px solid ${palette.avatarBorder}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
              color: palette.primaryText,
              flexShrink: 0,
            }}
          >
            {initial}
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: palette.primaryText,
              lineHeight: 1.2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {usernameClean}
          </div>
        </div>
      </div>

      {/* Media (square, Instagram-like) */}
      {sp.media?.url ? (
        <div
          className="pop-message-banner"
          style={{
            width: "100%",
            aspectRatio: "1 / 1",
            background: palette.mediaBg,
            overflow: "hidden",
          }}
        >
          <img
            src={sp.media.thumbnail || sp.media.url}
            alt="Shared post"
            style={{
              display: "block",
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        </div>
      ) : null}

      {/* Caption */}
      {sp.content ? (
        <div style={{ padding: "12px 16px 6px" }}>
          <div
            style={{
              fontSize: 14,
              lineHeight: 1.45,
              color: palette.captionText,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            <span style={{ fontWeight: 600, color: palette.primaryText }}>
              {usernameClean}
            </span>{" "}
            {sp.content}
          </div>
        </div>
      ) : null}

      {/* Footer: View post */}
      <div
        style={{
          borderTop: `1px solid ${palette.footerBorder}`,
          marginTop: sp.content ? 8 : 0,
          padding: "12px 16px",
          fontSize: 14,
          fontWeight: 600,
          color: palette.footerText,
          letterSpacing: "0.01em",
        }}
      >
        View post
      </div>
    </button>
  );
}

// â”€â”€â”€ Bubble â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Story replies carry their preview payload in the message itself, so rendering
// the 24-hour card does not need an extra story document read.
function StoryReplyCard({
  msg,
  variant,
}: {
  msg: Msg;
  variant: "own" | "them";
}) {
  const story = msg.sharedStory;
  const isOwn = variant === "own";
  const [previewActive, setPreviewActive] = useState(() =>
    story ? isSharedStoryPreviewActive(story) : false,
  );
  const [storyDeleted, setStoryDeleted] = useState(false);
  const [liveStoryMedia, setLiveStoryMedia] = useState<{
    url?: string;
    thumbnail?: string;
  } | null>(null);
  const [sharpPreviewLoaded, setSharpPreviewLoaded] = useState(false);

  useEffect(() => {
    if (!story) return;
    const expiresAtMs = new Date(story.expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs)) {
      const timeout = window.setTimeout(() => setPreviewActive(false), 0);
      return () => window.clearTimeout(timeout);
    }

    const remainingMs = expiresAtMs - Date.now();
    if (remainingMs <= 0) {
      const timeout = window.setTimeout(() => setPreviewActive(false), 0);
      return () => window.clearTimeout(timeout);
    }

    const activateTimeout = window.setTimeout(() => setPreviewActive(true), 0);
    const timeout = window.setTimeout(
      () => setPreviewActive(false),
      Math.min(remainingMs, 2147483647),
    );
    return () => {
      window.clearTimeout(activateTimeout);
      window.clearTimeout(timeout);
    };
  }, [story?.expiresAt, story?.storyId]);

  useEffect(() => {
    const resetTimeout = window.setTimeout(() => {
      setStoryDeleted(false);
      setLiveStoryMedia(null);
    }, 0);
    if (!story || !previewActive) {
      return () => window.clearTimeout(resetTimeout);
    }

    const client = getSupabaseBrowserClient();
    let active = true;
    const applyStoryRow = (data: Record<string, unknown> | null) => {
      const exists = Boolean(data);
      setStoryDeleted(!exists);
      if (!exists) {
        setLiveStoryMedia(null);
        return;
      }
      const metadata = (data?.metadata ?? {}) as { media?: { url?: string; thumbnail?: string }; mediaUrl?: string; thumbnail?: string };
      setLiveStoryMedia({
        url: String(data?.media_url || (data?.media_urls as string[] | undefined)?.[0] || metadata.media?.url || metadata.mediaUrl || ""),
        thumbnail: String(metadata.media?.thumbnail || metadata.thumbnail || ""),
      });
    };
    const loadStory = async () => {
      const { data, error } = await client.from("stories").select("id,media_url,media_urls,metadata").eq("id", story.storyId).maybeSingle();
      if (!active) return;
      applyStoryRow(error ? null : (data as Record<string, unknown> | null));
    };
    void loadStory();
    // A conversation can contain several replies to the same Story. Supabase
    // reuses a channel by name, and registering another callback after that
    // shared channel has subscribed throws at runtime, so scope it per message.
    const channel = client.channel(`story-preview:${msg.id}`).on("postgres_changes", { event: "*", schema: "public", table: "stories", filter: `id=eq.${story.storyId}` }, (payload) => {
      if (!active) return;
      applyStoryRow(payload.eventType === "DELETE" ? null : (payload.new as Record<string, unknown>));
    }).subscribe();
    return () => {
      window.clearTimeout(resetTimeout);
      active = false;
      void client.removeChannel(channel);
    };
  }, [previewActive, story?.storyId]);

  const previewUrl =
    liveStoryMedia?.url || story?.media.url || story?.media.thumbnail || "";
  const previewPoster =
    liveStoryMedia?.thumbnail || story?.media.thumbnail || previewUrl;
  const hasSeparatePoster = Boolean(
    previewPoster && previewPoster !== previewUrl,
  );
  const hasPreview = previewActive && !storyDeleted && Boolean(previewUrl);
  const isVideo = story?.media.type === "video";
  const replyText = story?.replyText || msg.text;
  const collapsedStoryLabel = storyDeleted
    ? "Story deleted"
    : previewActive
      ? "Story unavailable"
      : "Story expired";
  const replyBubbleStyle: React.CSSProperties = isOwn
    ? {
        alignSelf: "flex-end",
        background: "rgba(214,221,232,0.08)",
        color: "#d6dde8",
        boxShadow: "0 2px 8px rgba(214,221,232,0.08)",
        borderTopRightRadius: 4,
      }
    : {
        alignSelf: "flex-start",
        background: "#191919",
        color: "#fff",
        borderTopLeftRadius: 4,
      };

  useEffect(() => {
    const timeout = window.setTimeout(() => setSharpPreviewLoaded(false), 0);
    return () => window.clearTimeout(timeout);
  }, [previewUrl]);

  if (!story) return null;

  return (
    <div
      className="pop-message-banner"
      style={{
        width: 224,
        maxWidth: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: isOwn ? "flex-end" : "flex-start",
        gap: 8,
      }}
    >
      <div
        className="pop-message-input-shell"
        style={{
          position: "relative",
          width: 190,
          height: hasPreview ? 304 : 64,
          borderRadius: hasPreview ? 20 : 18,
          overflow: "hidden",
          background: hasPreview
            ? "linear-gradient(180deg, #050505, #0c0c0c)"
            : "rgba(255,255,255,0.045)",
          border: isOwn
            ? "1px solid rgba(214,221,232,0.2)"
            : "1px solid rgba(255,255,255,0.1)",
          boxShadow: hasPreview
            ? "0 10px 26px rgba(0,0,0,0.34)"
            : "0 6px 16px rgba(0,0,0,0.22)",
        }}
      >
        {hasPreview ? (
          isVideo ? (
            <video
              src={previewUrl}
              poster={previewPoster}
              muted
              playsInline
              preload="metadata"
              style={{
                display: "block",
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            <>
              {hasSeparatePoster && (
                <img
                  src={previewPoster}
                  alt=""
                  aria-hidden="true"
                  loading="eager"
                  decoding="async"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    filter: "blur(14px)",
                    transform: "scale(1.08)",
                    opacity: sharpPreviewLoaded ? 0 : 0.72,
                    transition: "opacity 0.22s ease",
                  }}
                />
              )}
              <img
                src={previewUrl}
                alt="Story preview"
                loading="eager"
                decoding="async"
                fetchPriority="high"
                onLoad={() => setSharpPreviewLoaded(true)}
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "block",
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  opacity: sharpPreviewLoaded || !hasSeparatePoster ? 1 : 0,
                  transform: "translateZ(0)",
                  transition: "opacity 0.18s ease",
                  background: "#050505",
                }}
              />
            </>
          )
        ) : (
          <div
            style={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              color: storyDeleted
                ? "rgba(255,255,255,0.58)"
                : "rgba(255,255,255,0.46)",
              fontSize: 13,
              fontWeight: 800,
              textAlign: "center",
              padding: "10px 14px",
              lineHeight: 1.25,
            }}
          >
            {collapsedStoryLabel}
            <span
              style={{
                color: "rgba(255,255,255,0.28)",
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              Preview hidden
            </span>
          </div>
        )}

        {hasPreview && (
          <>
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.28), transparent 38%)",
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 9,
                bottom: 9,
                borderRadius: 999,
                background: "rgba(0,0,0,0.58)",
                color: "rgba(255,255,255,0.86)",
                border: "1px solid rgba(255,255,255,0.1)",
                fontSize: 10,
                fontWeight: 800,
                padding: "5px 8px",
                backdropFilter: "blur(8px)",
              }}
            >
              {isVideo ? "Video story" : "Story"}
            </div>
          </>
        )}
      </div>

      {replyText && (
        <div
          style={{
            maxWidth: "100%",
            padding: "12px 16px",
            fontSize: 17,
            lineHeight: 1.5,
            wordBreak: "break-word",
            borderRadius: 18,
            ...replyBubbleStyle,
          }}
        >
          {replyText}
        </div>
      )}
    </div>
  );
}

function parseDailyChallengeStarter(text: string): {
  askerName: string;
  question: string;
} | null {
  const marker = " asked you a question as part of their daily challenge.";
  const markerIndex = text.indexOf(marker);
  if (markerIndex <= 0) return null;

  const askerName = text.slice(0, markerIndex).trim();
  const question = text.slice(markerIndex + marker.length).trim();
  if (!askerName || !question) return null;

  return {
    askerName,
    question: question.replace(/^\n+/, "").trim(),
  };
}

function DailyChallengeStarterCard({
  starter,
  variant,
}: {
  starter: { askerName: string; question: string };
  variant: "own" | "them";
}) {
  const isOwn = variant === "own";

  return (
    <div
      style={{
        width: 326,
        maxWidth: "100%",
        overflow: "hidden",
        borderRadius: 26,
        border: isOwn
          ? "1px solid rgba(214,221,232,0.28)"
          : "1px solid rgba(255,255,255,0.1)",
        background:
          "linear-gradient(180deg, rgba(22,22,22,0.98), rgba(8,8,8,0.99))",
        boxShadow: isOwn
          ? "0 20px 52px rgba(0,0,0,0.42), 0 0 34px rgba(214,221,232,0.12), inset 0 1px 0 rgba(255,255,255,0.06)"
          : "0 18px 46px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      <div
        style={{
          position: "relative",
          padding: "16px 16px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "0 22px auto",
            height: 1,
            background:
              "linear-gradient(90deg, rgba(214,221,232,0), rgba(214,221,232,0.85), rgba(214,221,232,0))",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background:
                "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.28), rgba(214,221,232,0.18) 42%, rgba(6,8,7,0.9) 100%)",
              border: "1px solid rgba(214,221,232,0.3)",
              color: "#e5e7eb",
              fontSize: 22,
              fontWeight: 900,
              boxShadow: "0 14px 34px rgba(214,221,232,0.14)",
              flexShrink: 0,
            }}
          >
            ?
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 5,
                padding: "5px 8px",
                borderRadius: 999,
                border: "1px solid rgba(214,221,232,0.2)",
                background: "rgba(214,221,232,0.08)",
                color: "#c8d0d8",
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              Daily Challenge
            </div>
            <div
              style={{
                color: "#fff",
                fontSize: 15,
                fontWeight: 800,
                lineHeight: 1.25,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {isOwn
                ? "You started the challenge"
                : `${starter.askerName} picked you`}
            </div>
          </div>
        </div>
      </div>
      <div style={{ padding: "17px 17px 18px" }}>
        <p
          style={{
            margin: 0,
            color: "#f8fafc",
            fontSize: 17,
            lineHeight: 1.48,
            fontWeight: 750,
            letterSpacing: 0,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
          }}
        >
          {starter.question}
        </p>
        <div
          style={{
            marginTop: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <span
            style={{
              color: "rgba(255,255,255,0.42)",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Conversation starter
          </span>
          <span
            style={{
              borderRadius: 999,
              background: "rgba(214,221,232,0.12)",
              color: "#c8d0d8",
              border: "1px solid rgba(214,221,232,0.2)",
              padding: "6px 10px",
              fontSize: 11,
              fontWeight: 900,
            }}
          >
            Opened
          </span>
        </div>
      </div>
    </div>
  );
}

function ChatPhotoViewer({
  photos,
  index,
  onIndexChange,
  onClose,
}: {
  photos: ChatPhoto[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const safeIndex = Math.min(
    Math.max(index, 0),
    Math.max(photos.length - 1, 0),
  );
  const activePhoto = photos[safeIndex];
  const hasMultiple = photos.length > 1;

  const getWrappedIndex = useCallback(
    (nextIndex: number) => {
      if (photos.length === 0) return 0;
      return (nextIndex + photos.length) % photos.length;
    },
    [photos.length],
  );

  const finishAnimatedNavigation = useCallback(
    (direction: 1 | -1) => {
      const viewportWidth =
        viewportRef.current?.clientWidth ||
        (typeof window !== "undefined" ? window.innerWidth : 360);
      const nextIndex = getWrappedIndex(safeIndex + direction);

      if (animationTimerRef.current) {
        clearTimeout(animationTimerRef.current);
      }

      setIsDragging(false);
      setIsSettling(true);
      setDragOffset(direction === 1 ? -viewportWidth : viewportWidth);

      animationTimerRef.current = setTimeout(() => {
        onIndexChange(nextIndex);
        setIsSettling(false);
        setDragOffset(0);
        animationTimerRef.current = null;
      }, 280);
    },
    [getWrappedIndex, onIndexChange, safeIndex],
  );

  const goPrev = useCallback(() => {
    if (!hasMultiple || isSettling) return;
    finishAnimatedNavigation(-1);
  }, [finishAnimatedNavigation, hasMultiple, isSettling]);

  const goNext = useCallback(() => {
    if (!hasMultiple || isSettling) return;
    finishAnimatedNavigation(1);
  }, [finishAnimatedNavigation, hasMultiple, isSettling]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") goPrev();
      if (event.key === "ArrowRight") goNext();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (animationTimerRef.current) {
        clearTimeout(animationTimerRef.current);
      }
    };
  }, [goNext, goPrev, onClose]);

  if (!activePhoto) return null;

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (isSettling) return;
    const target = event.target;
    const touchedMedia =
      target instanceof HTMLElement
        ? target.closest('[data-photo-viewer-media="true"]')
        : null;
    if (!touchedMedia) {
      touchStartRef.current = null;
      setIsDragging(false);
      setDragOffset(0);
      return;
    }
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    setIsDragging(true);
    setDragOffset(0);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    if (!start) return;
    const touch = event.touches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      setDragOffset(dx * 0.72);
    }
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) {
      setDragOffset(0);
      setIsDragging(false);
      return;
    }

    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const viewportWidth =
      viewportRef.current?.clientWidth ||
      (typeof window !== "undefined" ? window.innerWidth : 360);
    const isSwipe =
      hasMultiple &&
      Math.abs(dx) > Math.min(118, viewportWidth * 0.28) &&
      Math.abs(dx) > Math.abs(dy) * 1.35;

    if (isSwipe) {
      finishAnimatedNavigation(dx < 0 ? 1 : -1);
      return;
    }

    setIsDragging(false);
    setDragOffset(0);
  };

  const iconButtonStyle: React.CSSProperties = {
    width: 42,
    height: 42,
    borderRadius: "50%",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(12,12,12,0.58)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backdropFilter: "blur(14px)",
    cursor: "pointer",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0,0,0,0.96)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        touchAction: "none",
      }}
    >
      <div
        ref={viewportRef}
        onClick={(event) => event.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => {
          touchStartRef.current = null;
          setIsDragging(false);
          setDragOffset(0);
        }}
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding:
            "calc(58px + var(--safe-area-top)) 14px calc(58px + var(--safe-area-bottom))",
        }}
      >
        {(hasMultiple ? [-1, 0, 1] : [0]).map((slot) => {
          const photoIndex = getWrappedIndex(safeIndex + slot);
          const photo = photos[photoIndex] ?? activePhoto;
          return (
            <img
              key={`${photo.key}-${slot}`}
              data-photo-viewer-media="true"
              src={photo.url}
              alt={`Chat photo ${photoIndex + 1} of ${photos.length}`}
              draggable={false}
              style={{
                position: "absolute",
                maxWidth: "calc(100% - 28px)",
                maxHeight:
                  "calc(100% - 116px - var(--safe-area-top) - var(--safe-area-bottom))",
                objectFit: "contain",
                borderRadius: 6,
                transform: `translate3d(calc(${slot * 100}% + ${dragOffset}px), 0, 0)`,
                transition:
                  isDragging || (!isSettling && dragOffset !== 0)
                    ? "none"
                    : "transform 0.28s cubic-bezier(0.22, 0.78, 0.18, 1)",
                userSelect: "none",
                touchAction: "pan-y",
                willChange: "transform",
              }}
            />
          );
        })}
      </div>

      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          position: "absolute",
          top: "calc(14px + var(--safe-area-top))",
          left: 14,
          right: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            minWidth: 72,
            borderRadius: 999,
            padding: "8px 12px",
            color: "rgba(255,255,255,0.86)",
            background: "rgba(12,12,12,0.58)",
            border: "1px solid rgba(255,255,255,0.12)",
            backdropFilter: "blur(14px)",
            fontSize: 13,
            fontWeight: 800,
            textAlign: "center",
          }}
        >
          {safeIndex + 1} / {photos.length}
        </div>
        <button
          type="button"
          aria-label="Close photo viewer"
          onClick={onClose}
          style={{ ...iconButtonStyle, pointerEvents: "auto" }}
        >
          <X size={20} />
        </button>
      </div>

      {hasMultiple && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={(event) => {
              event.stopPropagation();
              goPrev();
            }}
            style={{
              ...iconButtonStyle,
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
            }}
          >
            <ChevronLeft size={24} />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={(event) => {
              event.stopPropagation();
              goNext();
            }}
            style={{
              ...iconButtonStyle,
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
            }}
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}
    </div>
  );
}

function MessageGestureFrame({
  msg,
  onReply,
  onLongPress,
  children,
}: {
  msg: Msg;
  onReply?: (msg: Msg) => void;
  onLongPress?: (msg: Msg) => void;
  children: React.ReactNode;
}) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingDragRef = useRef(0);
  const [dragX, setDragX] = useState(0);
  const [isPulling, setIsPulling] = useState(false);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const setDragOnFrame = (nextDragX: number) => {
    pendingDragRef.current = nextDragX;
    if (dragFrameRef.current !== null) return;
    dragFrameRef.current = requestAnimationFrame(() => {
      setDragX(pendingDragRef.current);
      dragFrameRef.current = null;
    });
  };

  const resetDrag = () => {
    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
    pendingDragRef.current = 0;
    setIsPulling(false);
    setDragX(0);
  };

  useEffect(() => {
    return () => {
      clearLongPressTimer();
      if (dragFrameRef.current !== null) {
        cancelAnimationFrame(dragFrameRef.current);
      }
    };
  }, []);

  const replyProgress = Math.min(1, Math.abs(dragX) / 34);
  const showReplyCue = replyProgress > 0.04;
  const replyCueSide: React.CSSProperties =
    msg.from === "me" ? { right: 18 } : { left: 18 };

  return (
    <div
      onTouchStart={(event) => {
        const touch = event.touches[0];
        touchStartRef.current = { x: touch.clientX, y: touch.clientY };
        resetDrag();
        clearLongPressTimer();
        longPressTimerRef.current = setTimeout(() => {
          onLongPress?.(msg);
          longPressTimerRef.current = null;
          setDragX(0);
        }, 520);
      }}
      onTouchMove={(event) => {
        const start = touchStartRef.current;
        if (!start) return;
        const touch = event.touches[0];
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;

        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearLongPressTimer();
        if (Math.abs(dx) > Math.abs(dy) * 1.25) {
          const directionAllowed = msg.from === "me" ? dx < 0 : dx > 0;
          const sign = dx < 0 ? -1 : 1;
          const resistance = directionAllowed ? 0.46 : 0.14;
          const eased = Math.min(
            directionAllowed ? 84 : 20,
            Math.pow(Math.abs(dx), 0.92) * resistance,
          );
          setIsPulling(directionAllowed);
          setDragOnFrame(sign * eased);
        }
      }}
      onTouchEnd={(event) => {
        clearLongPressTimer();
        const start = touchStartRef.current;
        touchStartRef.current = null;
        if (!start) {
          resetDrag();
          return;
        }

        const touch = event.changedTouches[0];
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        const directionAllowed = msg.from === "me" ? dx < 0 : dx > 0;
        if (
          directionAllowed &&
          Math.abs(dx) > 64 &&
          Math.abs(dx) > Math.abs(dy) * 1.35
        ) {
          onReply?.(msg);
        }
        resetDrag();
      }}
      onTouchCancel={() => {
        clearLongPressTimer();
        touchStartRef.current = null;
        resetDrag();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onLongPress?.(msg);
      }}
      style={{
        position: "relative",
        touchAction: "pan-y",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "50%",
          ...replyCueSide,
          width: 34,
          height: 34,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#07130c",
          background:
            "linear-gradient(135deg, rgba(214,221,232,0.96), rgba(200,208,216,0.9))",
          boxShadow: "0 10px 28px rgba(214,221,232,0.22)",
          opacity: showReplyCue ? 0.35 + replyProgress * 0.65 : 0,
          transform: `translateY(-50%) scale(${0.72 + replyProgress * 0.28})`,
          transition: isPulling
            ? "none"
            : "opacity 0.16s ease, transform 0.2s ease",
          pointerEvents: "none",
        }}
      >
        <Reply
          size={17}
          strokeWidth={2.6}
          style={{
            transform: msg.from === "me" ? "scaleX(-1)" : "none",
          }}
        />
      </div>
      <div
        style={{
          transform: `translate3d(${dragX}px, 0, 0)`,
          transition:
            dragX === 0
              ? "transform 0.28s cubic-bezier(0.2, 0.84, 0.24, 1)"
              : "none",
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function InlineReplyPreview({
  replyTo,
  own,
}: {
  replyTo: ReplyTarget | null;
  own: boolean;
}) {
  if (!replyTo) return null;

  return (
    <div
      className="pop-message-reply-card chat-inline-reply"
      style={{
        position: "relative",
        margin: "0 0 7px",
        padding: "7px 9px 7px 11px",
        borderRadius: 10,
        background: own
          ? "linear-gradient(135deg, rgba(3,18,10,0.46), rgba(214,221,232,0.09))"
          : "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.035))",
        border: own
          ? "1px solid rgba(214,221,232,0.16)"
          : "1px solid rgba(255,255,255,0.08)",
        color: own ? "#d7ffe6" : "rgba(255,255,255,0.82)",
        maxWidth: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: own ? "#d6dde8" : "#8b9aaf",
          opacity: own ? 0.95 : 0.82,
        }}
      />
      <div
        style={{
          color: own ? "#c8d0d8" : "#d6dde8",
          fontSize: 12,
          fontWeight: 900,
          marginBottom: 3,
          letterSpacing: "0.02em",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {replyTo.senderName}
      </div>
      <div
        style={{
          fontSize: 14.5,
          lineHeight: 1.32,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          wordBreak: "break-word",
          overflowWrap: "anywhere",
          opacity: 0.86,
        }}
      >
        {replyPreviewLabel(replyTo)}
      </div>
    </div>
  );
}

function Bubble({
  msg,
  showStatus,
  status,
  onOpenSharedPost,
  onOpenPhoto,
  onReply,
  onLongPress,
  onRetryPhoto,
  onCancelPhoto,
  showSenderName,
  joinedBefore = false,
  joinedAfter = false,
}: {
  msg: Msg;
  showStatus: boolean;
  status: Status;
  onOpenSharedPost?: (userId: string, postId: string) => void;
  onOpenPhoto?: (msg: Msg, photoIndex: number) => void;
  onReply?: (msg: Msg) => void;
  onLongPress?: (msg: Msg) => void;
  onRetryPhoto?: (msg: Msg) => void;
  onCancelPhoto?: (msg: Msg) => void;
  showSenderName?: boolean;
  joinedBefore?: boolean;
  joinedAfter?: boolean;
}) {
  const own = msg.from === "me";
  const [entered, setEntered] = useState(false);
  const [mountedAt] = useState(() => Date.now());
  const dailyChallengeStarter = parseDailyChallengeStarter(msg.text);
  const senderLabel = (msg.senderName || (own ? "You" : "Guest")).trim();

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const createdMs = parsePresenceTimestamp(msg.createdAt);
  const shouldAnimateEntrance =
    !!msg.optimistic ||
    (createdMs !== null && mountedAt - createdMs < 4_000);
  const initialTranslate = "translateY(4px)";
  const messageEntranceStyle: React.CSSProperties = {
    opacity: shouldAnimateEntrance
      ? entered
        ? msg.optimistic
          ? 0.9
          : 1
        : 0
      : 1,
    transform: shouldAnimateEntrance
      ? entered
        ? "translateY(0) scale(1)"
        : initialTranslate
      : "none",
    transition: shouldAnimateEntrance
      ? "opacity 140ms ease-out, transform 160ms cubic-bezier(0.2, 0.86, 0.2, 1)"
      : undefined,
    willChange: shouldAnimateEntrance
      ? "opacity, transform"
      : undefined,
    transformOrigin: own ? "right bottom" : "left bottom",
  };

  const wrapMessage = (node: React.ReactNode) => (
    <MessageGestureFrame msg={msg} onReply={onReply} onLongPress={onLongPress}>
      <div data-message-id={msg.id} style={messageEntranceStyle}>
        {showSenderName && !own && !joinedBefore && senderLabel && (
          <div
            style={{
              display: "flex",
              justifyContent: own ? "flex-end" : "flex-start",
              padding: own ? "0 30px 2px 14px" : "0 14px 2px 30px",
              marginTop: 4,
              color: chatSenderColor(msg.senderId),
              fontSize: 11,
              fontWeight: 850,
              lineHeight: 1.2,
              letterSpacing: "0.02em",
              textTransform: "none",
            }}
          >
            {senderLabel}
          </div>
        )}
        {node}
      </div>
    </MessageGestureFrame>
  );

  if (msg.photoUrls.length > 0) {
    const visibleUrls = msg.photoUrls.slice(0, 4);
    const hiddenCount = Math.max(0, msg.photoUrls.length - visibleUrls.length);
    const isSinglePhoto = msg.photoUrls.length === 1;
    const isDisplayCaption =
      msg.text.trim().length > 0 &&
      !/^photo$/i.test(msg.text.trim()) &&
      !/^\d+\s+photos$/i.test(msg.text.trim());
    const showSendingOverlay = msg.optimistic && !msg.failed;
    const showFailedOverlay = msg.failed;
    const photoButtonStyle: React.CSSProperties = {
      display: "block",
      padding: 0,
      margin: 0,
      border: "none",
      background: "transparent",
      cursor: "pointer",
      lineHeight: 0,
    };

    return wrapMessage(
      <div style={{ padding: "4px 14px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: own ? "flex-end" : "flex-start",
            alignItems: "flex-start",
            gap: 0,
          }}
        >
          {own ? (
            <>
              <div
                style={{
                  maxWidth: "82%",
                  padding: msg.replyTo ? 7 : isDisplayCaption ? 4 : 3,
                  borderRadius: 17,
                  borderTopRightRadius: 4,
                  background:
                    "linear-gradient(180deg, rgba(31,34,37,0.78) 0%, rgba(18,19,20,0.86) 62%, rgba(10,10,10,0.92) 100%)",
                  border: "1px solid rgba(148,163,184,0.1)",
                  overflow: "hidden",
                  position: "relative",
                  boxShadow:
                    "0 10px 28px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.045)",
                }}
              >
                <InlineReplyPreview replyTo={msg.replyTo} own={own} />
                {isSinglePhoto ? (
                  <button
                    type="button"
                    aria-label="Open sent photo fullscreen"
                    onClick={() => onOpenPhoto?.(msg, 0)}
                    style={photoButtonStyle}
                  >
                    <img
                      src={msg.photoUrls[0]}
                      alt="Sent photo"
                      style={{
                        display: "block",
                        width: "min(72vw, 270px)",
                        maxHeight: 360,
                        objectFit: "cover",
                        borderRadius: 15,
                        background: "#080808",
                      }}
                    />
                  </button>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 3,
                      width: "min(72vw, 280px)",
                    }}
                  >
                    {visibleUrls.map((url, index) => (
                      <button
                        type="button"
                        aria-label={`Open sent photo ${index + 1} fullscreen`}
                        onClick={() => onOpenPhoto?.(msg, index)}
                        key={`${url}-${index}`}
                        style={{
                          ...photoButtonStyle,
                          position: "relative",
                          aspectRatio: "1 / 1",
                          overflow: "hidden",
                          borderRadius:
                            index === 0
                              ? "14px 3px 3px 3px"
                              : index === 1
                                ? "3px 14px 3px 3px"
                                : index === 2
                                  ? "3px 3px 3px 14px"
                                  : "3px 3px 14px 3px",
                          background: "#080808",
                        }}
                      >
                        <img
                          src={url}
                          alt="Sent photo"
                          style={{
                            display: "block",
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                        {index === 3 && hiddenCount > 0 && (
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "rgba(0,0,0,0.55)",
                              color: "#fff",
                              fontSize: 28,
                              fontWeight: 800,
                            }}
                          >
                            +{hiddenCount}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {(showSendingOverlay || showFailedOverlay) && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 3,
                      borderRadius: 15,
                      background: showFailedOverlay
                        ? "rgba(80,0,0,0.48)"
                        : "rgba(0,0,0,0.32)",
                      display: "flex",
                      alignItems: "flex-end",
                      justifyContent: "flex-end",
                      padding: 8,
                      pointerEvents: "auto",
                    }}
                  >
                    <button
                      type="button"
                      aria-label={showFailedOverlay ? "Retry photo upload" : "Cancel photo upload"}
                      onClick={() => (showFailedOverlay ? onRetryPhoto?.(msg) : onCancelPhoto?.(msg))}
                      disabled={showFailedOverlay ? !showFailedOverlay : false}
                      style={{
                        borderRadius: 999,
                        background: "rgba(0,0,0,0.58)",
                        color: showFailedOverlay ? "#fecaca" : "#fff",
                        fontSize: 11,
                        fontWeight: 800,
                        padding: "5px 8px",
                        border: "1px solid rgba(255,255,255,0.12)",
                        cursor: showFailedOverlay ? "pointer" : "default",
                      }}
                    >
                      {showFailedOverlay ? "Retry" : "Cancel"}
                    </button>
                  </div>
                )}
                {isDisplayCaption && (
                  <div
                    style={{
                      padding: "8px 9px 6px",
                      color: "#e5e7eb",
                      fontSize: 14,
                      lineHeight: 1.35,
                      wordBreak: "break-word",
                    }}
                  >
                    {msg.text}
                  </div>
                )}
              </div>
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                style={{ flexShrink: 0, marginTop: 4 }}
              >
                <path d="M 0 0 L 12 0 L 0 10 Z" fill="rgba(31,34,37,0.78)" />
              </svg>
            </>
          ) : (
            <>
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                style={{ flexShrink: 0, marginTop: 4 }}
              >
                <path d="M 12 0 L 0 0 L 12 10 Z" fill="rgba(20,20,20,0.82)" />
              </svg>
              <div
                style={{
                  maxWidth: "82%",
                  padding: msg.replyTo ? 7 : isDisplayCaption ? 4 : 3,
                  borderRadius: 17,
                  borderTopLeftRadius: 4,
                  background:
                    "linear-gradient(180deg, rgba(20,20,20,0.82) 0%, rgba(13,13,13,0.9) 66%, rgba(8,8,8,0.94) 100%)",
                  border: "1px solid rgba(200,208,216,0.075)",
                  overflow: "hidden",
                  position: "relative",
                  boxShadow:
                    "0 10px 28px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.035)",
                }}
              >
                <InlineReplyPreview replyTo={msg.replyTo} own={own} />
                {isSinglePhoto ? (
                  <button
                    type="button"
                    aria-label="Open received photo fullscreen"
                    onClick={() => onOpenPhoto?.(msg, 0)}
                    style={photoButtonStyle}
                  >
                    <img
                      src={msg.photoUrls[0]}
                      alt="Received photo"
                      style={{
                        display: "block",
                        width: "min(72vw, 270px)",
                        maxHeight: 360,
                        objectFit: "cover",
                        borderRadius: 15,
                        background: "#080808",
                      }}
                    />
                  </button>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 3,
                      width: "min(72vw, 280px)",
                    }}
                  >
                    {visibleUrls.map((url, index) => (
                      <button
                        type="button"
                        aria-label={`Open received photo ${index + 1} fullscreen`}
                        onClick={() => onOpenPhoto?.(msg, index)}
                        key={`${url}-${index}`}
                        style={{
                          ...photoButtonStyle,
                          position: "relative",
                          aspectRatio: "1 / 1",
                          overflow: "hidden",
                          borderRadius:
                            index === 0
                              ? "14px 3px 3px 3px"
                              : index === 1
                                ? "3px 14px 3px 3px"
                                : index === 2
                                  ? "3px 3px 3px 14px"
                                  : "3px 3px 14px 3px",
                          background: "#080808",
                        }}
                      >
                        <img
                          src={url}
                          alt="Received photo"
                          style={{
                            display: "block",
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                        {index === 3 && hiddenCount > 0 && (
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "rgba(0,0,0,0.55)",
                              color: "#fff",
                              fontSize: 28,
                              fontWeight: 800,
                            }}
                          >
                            +{hiddenCount}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {(showSendingOverlay || showFailedOverlay) && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 3,
                      borderRadius: 15,
                      background: showFailedOverlay
                        ? "rgba(80,0,0,0.48)"
                        : "rgba(0,0,0,0.32)",
                      display: "flex",
                      alignItems: "flex-end",
                      justifyContent: "flex-end",
                      padding: 8,
                      pointerEvents: "none",
                    }}
                  >
                    <span
                      style={{
                        borderRadius: 999,
                        background: "rgba(0,0,0,0.58)",
                        color: showFailedOverlay ? "#fecaca" : "#fff",
                        fontSize: 11,
                        fontWeight: 800,
                        padding: "5px 8px",
                        border: "1px solid rgba(255,255,255,0.12)",
                      }}
                    >
                      {showFailedOverlay ? "Failed" : "Sending..."}
                    </span>
                  </div>
                )}
                {isDisplayCaption && (
                  <div
                    style={{
                      padding: "8px 9px 6px",
                      color: "#fff",
                      fontSize: 14,
                      lineHeight: 1.35,
                      wordBreak: "break-word",
                    }}
                  >
                    {msg.text}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        {showStatus && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              padding: "4px 4px 2px",
            }}
          >
            {status === "screenshot" ? (
              <span style={{ fontSize: 12, color: "#facc15", fontWeight: 600 }}>
                Screenshot
              </span>
            ) : (
              <span style={{ fontSize: 12, color: "var(--chat-muted)", fontWeight: 500 }}>
                {status === "seen" ? "Seen" : "Delivered"}
              </span>
            )}
          </div>
        )}
      </div>,
    );
  }

  if (dailyChallengeStarter) {
    return wrapMessage(
      <div style={{ padding: "6px 14px 10px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: own ? "flex-end" : "flex-start",
            alignItems: "flex-start",
          }}
        >
          <div style={{ maxWidth: "90%" }}>
            <DailyChallengeStarterCard
              starter={dailyChallengeStarter}
              variant={own ? "own" : "them"}
            />
          </div>
        </div>
        {showStatus && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              padding: "4px 4px 2px",
            }}
          >
            {status === "screenshot" ? (
              <span style={{ fontSize: 12, color: "#facc15", fontWeight: 600 }}>
                Screenshot
              </span>
            ) : (
              <span style={{ fontSize: 12, color: "var(--chat-muted)", fontWeight: 500 }}>
                {status === "seen" ? "Seen" : "Delivered"}
              </span>
            )}
          </div>
        )}
      </div>,
    );
  }

  if (msg.sharedStory) {
    return wrapMessage(
      <div style={{ padding: "4px 14px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: own ? "flex-end" : "flex-start",
            alignItems: "flex-start",
          }}
        >
          <div style={{ maxWidth: "86%" }}>
            <StoryReplyCard msg={msg} variant={own ? "own" : "them"} />
          </div>
        </div>
        {showStatus && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              padding: "4px 4px 2px",
            }}
          >
            {status === "screenshot" ? (
              <span style={{ fontSize: 12, color: "#facc15", fontWeight: 600 }}>
                Ã°Å¸â€œÂ¸ Screenshot
              </span>
            ) : (
              <span style={{ fontSize: 12, color: "var(--chat-muted)", fontWeight: 500 }}>
                {status === "seen" ? "Seen" : "Delivered"}
              </span>
            )}
          </div>
        )}
      </div>,
    );
  }

  // Shared post messages render as standalone Instagram-style cards (no bubble).
  if (msg.sharedPost) {
    return wrapMessage(
      <div style={{ padding: "4px 14px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: own ? "flex-end" : "flex-start",
            alignItems: "flex-start",
          }}
        >
          <div style={{ maxWidth: "86%" }}>
            <SharedPostCard
              msg={msg}
              variant={own ? "own" : "them"}
              onOpenSharedPost={onOpenSharedPost}
            />
          </div>
        </div>
        {showStatus && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              padding: "4px 4px 2px",
            }}
          >
            {status === "screenshot" ? (
              <span style={{ fontSize: 12, color: "#facc15", fontWeight: 600 }}>
                ðŸ“¸ Screenshot
              </span>
            ) : (
              <span style={{ fontSize: 12, color: "var(--chat-muted)", fontWeight: 500 }}>
                {status === "seen" ? "Seen" : "Delivered"}
              </span>
            )}
          </div>
        )}
      </div>,
    );
  }

  return wrapMessage(
    <div className={`chat-message-row ${own ? "is-own" : ""} ${!joinedBefore ? "is-group-start" : ""}`}>
      <div
        style={{
          display: "flex",
          justifyContent: own ? "flex-end" : "flex-start",
          alignItems: "flex-start",
          gap: 0,
        }}
      >
        <div className={`chat-text-bubble ${own ? 'is-own' : ''} ${joinedBefore ? 'is-joined-before' : ''} ${joinedAfter ? 'is-joined-after' : ''}`}>
          <InlineReplyPreview replyTo={msg.replyTo} own={own} />
          {msg.text}
        </div>
      </div>
      {showStatus && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            padding: "4px 4px 2px",
          }}
        >
          {status === "screenshot" ? (
            <span style={{ fontSize: 12, color: "#facc15", fontWeight: 600 }}>
              ðŸ“¸ Screenshot
            </span>
          ) : (
            <span style={{ fontSize: 12, color: "var(--chat-muted)", fontWeight: 500 }}>
              {status === "seen" ? "Seen" : "Delivered"}
            </span>
          )}
        </div>
      )}
    </div>,
  );
}

// â”€â”€â”€ MoodBlockTimer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getMoodTimeLeft(endTime: number): number {
  return Math.max(0, Math.floor((endTime - Date.now()) / 1000));
}

function MoodBlockTimer({ endTime }: { endTime: number }) {
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    const initialTimer = setTimeout(() => {
      setTimeLeft(getMoodTimeLeft(endTime));
    }, 0);
    const timer = setInterval(() => {
      setTimeLeft(getMoodTimeLeft(endTime));
    }, 1000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(timer);
    };
  }, [endTime]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  return (
    <>{`${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`}</>
  );
}

// â”€â”€â”€ Main â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function MessagingScreen({
  onBack,
  conversationId,
  onConversationActiveChange,
  onOpenSharedPost,
  onOpenUserProfile,
}: {
  onBack?: () => void;
  conversationId?: string;
  onConversationActiveChange?: (
    conversationId: string,
    otherUserId?: string,
  ) => void;
  onOpenSharedPost?: (userId: string, postId: string) => void;
  onOpenUserProfile?: (userId: string) => void;
}) {
  const { user } = useAuthStore();
  const [supabaseAuthReady, setSupabaseAuthReady] = useState(() => !user?.id);
  const {
    conversations,
    currentConversation,
    messages,
    events,
    loadingMessages,
    sendingMessage,
    typingUsers,
    onlineFriends,
    frozenBy,
    subscribeToRealTimeMessages,
    subscribeToRealTimeEvents,
    unsubscribeFromRealTimeMessages,
    subscribeToTypingIndicators,
    unsubscribeFromTypingIndicators,
    subscribeToFreezeStatus,
    unsubscribeFromFreezeStatus,
    freezeChat,
    unfreezeChat,
    sendRealTimeMessage,
    setTypingIndicator,
    setCurrentConversation,
    trackSeenMessage,
    markMessageAsSeen,
    deleteMessage,
    clearError,
    clearMessages,
  } = useMessagingStore();

  useEffect(() => {
    if (!user?.id) {
      setSupabaseAuthReady(true);
      return;
    }

    setSupabaseAuthReady(false);
    const client = getSupabaseBrowserClient();
    void client.auth.getUser().then(({ data }) => setSupabaseAuthReady(data.user?.id === user.id));
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => setSupabaseAuthReady(session?.user.id === user.id));
    return () => listener.subscription.unsubscribe();
  }, [user?.id]);

  const [input, setInput] = useState("");
  const composerInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const field = composerInput.current;
    if (field) { field.style.height = 'auto'; field.style.height = `${Math.min(field.scrollHeight, 112)}px`; }
  }, [input]);
  const [status, setStatus] = useState<Status>("seen");
  const [menuOpen, setMenuOpen] = useState(false);
  const [gamesRoomOpen, setGamesRoomOpen] = useState(false);
  const [gamesRoomSessionId, setGamesRoomSessionId] = useState<string | null>(
    null,
  );
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteSearch, setInviteSearch] = useState("");
  const [inviteFriends, setInviteFriends] = useState<any[]>([]);
  const [loadingInviteFriends, setLoadingInviteFriends] = useState(false);
  const [sendingInviteId, setSendingInviteId] = useState<string | null>(null);
  const [conversationInvites, setConversationInvites] = useState<ChatInvite[]>(
    [],
  );
  const [conversationInvitesReady, setConversationInvitesReady] =
    useState(false);
  const [sendingMedia, setSendingMedia] = useState(false);
  const [optimisticPhotoMessages, setOptimisticPhotoMessages] = useState<
    OptimisticPhotoMessage[]
  >([]);
  const [optimisticTextMessages, setOptimisticTextMessages] = useState<
    OptimisticTextMessage[]
  >([]);
  const [refreshedMediaUrls, setRefreshedMediaUrls] = useState<Record<string, string>>({});
  const [photoViewer, setPhotoViewer] = useState<{
    photos: ChatPhoto[];
    index: number;
  } | null>(null);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [messageActionTarget, setMessageActionTarget] = useState<Msg | null>(
    null,
  );
  const [hiddenMessageIds, setHiddenMessageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [hasOpenedChat, setHasOpenedChat] = useState(false);
  const [optimisticSwitchEvents, setOptimisticSwitchEvents] = useState<
    MessageEvent[]
  >([]);
  const eventTimestampCacheRef = useRef<Map<string, number>>(new Map());
  const [livePresenceSwitchTarget, setLivePresenceSwitchTarget] = useState<{
    userId: string;
    userName: string;
    isActive: boolean;
  } | null>(null);
  const [moodBlockModalOpen, setMoodBlockModalOpen] = useState(false);
  const [moodBlockModalVisible, setMoodBlockModalVisible] = useState(false);
  const [currentMoodBlock, setCurrentMoodBlock] = useState<{
    mood: "angry" | "crying" | "irritated" | "depressed";
    initiatedBy: string;
    initiatedByName: string;
    startTime: number;
    endTime: number;
  } | null>(null);
  const [currentMoodBlockVisible, setCurrentMoodBlockVisible] = useState(false);
  const [progressBarWidth, setProgressBarWidth] = useState(100);
  const activeMoodTheme = getMoodTheme(currentMoodBlock?.mood ?? "");
  const activeConversationId = currentConversation?.id ?? null;
  const activeMessages = useMemo(
    () =>
      activeConversationId
        ? messages.filter((msg) => msg.conversation_id === activeConversationId)
        : [],
    [activeConversationId, messages],
  );
  useEffect(() => {
    const urls = activeMessages
      .map((message) => message.mediaUrl || message.media_url)
      .filter((value): value is string => typeof value === "string" && value.length > 0);
    if (!urls.length) return;
    let active = true;
    void Promise.all(urls.map(async (url) => [url, await signedUrlService.refreshStoredMediaUrl(url)] as const))
      .then((resolved) => {
        if (!active) return;
        setRefreshedMediaUrls((current) => {
          let changed = false;
          const next = { ...current };
          for (const [original, refreshed] of resolved) {
            if (refreshed !== original && next[original] !== refreshed) {
              next[original] = refreshed;
              changed = true;
            }
          }
          return changed ? next : current;
        });
      });
    return () => { active = false; };
  }, [activeMessages]);
  const originalParticipantIds = useMemo(
    () =>
      [currentConversation?.user1_id, currentConversation?.user2_id].filter(
        Boolean,
      ) as string[],
    [currentConversation?.user1_id, currentConversation?.user2_id],
  );
  const isCurrentUserTemporaryParticipant =
    !!user?.id && conversationInvites.some((invite) => invite.invitee_id === user.id);
  const isOriginalParticipant =
    !!user?.id && originalParticipantIds.includes(user.id) && !isCurrentUserTemporaryParticipant;
  const acceptedTemporaryInvites = useMemo(
    () => conversationInvites.filter((invite) => invite.status === "accepted"),
    [conversationInvites],
  );
  const enteredTemporaryInvites = useMemo(
    () => acceptedTemporaryInvites.filter((invite) => invite.entered_at),
    [acceptedTemporaryInvites],
  );
  const temporaryGroupModeActive = enteredTemporaryInvites.length > 0;
  const currentUserTemporaryInvite = useMemo(
    () =>
      user?.id
        ? acceptedTemporaryInvites.find(
            (invite) => invite.invitee_id === user.id,
          )
        : undefined,
    [acceptedTemporaryInvites, user?.id],
  );
  const temporaryAccessEnded =
    !!user?.id &&
    !!currentConversation &&
    conversationInvitesReady &&
    !isOriginalParticipant &&
    !currentUserTemporaryInvite;

  useEffect(() => {
    if (!user?.id || !currentConversation?.id || !currentUserTemporaryInvite) {
      return;
    }

    const key = `${currentConversation.id}:${currentUserTemporaryInvite.id}`;
    if (enteredInviteEventIdsRef.current.has(key)) return;
    enteredInviteEventIdsRef.current.add(key);

    void chatInviteService
      .markInviteEntered(currentUserTemporaryInvite.id, user.id)
      .catch((error) => {
        enteredInviteEventIdsRef.current.delete(key);
        console.error("Unable to mark chat invite entered:", error);
      });
  }, [currentConversation?.id, currentUserTemporaryInvite, user?.id]);

  const [friendPresenceOnline, setFriendPresenceOnline] = useState(false);
  const currentFriendId =
    currentConversation?.other_user?.user_id ||
    currentConversation?.other_user?.id ||
    "";
  const friendOnline =
    onlineFriends.includes(currentFriendId) || friendPresenceOnline;
  const [friendPostgresLastSeenAt, setFriendPostgresLastSeenAt] = useState<
    number | null
  >(null);
  const [friendPostgresTimeZone, setFriendPostgresTimeZone] =
    useState(getBrowserTimeZone);
  const friendLastSeenAt = friendPostgresLastSeenAt;
  const friendTimeZone = friendPostgresTimeZone;
  const [liveDraft, setLiveDraft] = useState<string | null>(null);

  const draftThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDraftRef = useRef<string>("");

  const frozen = !!frozenBy;
  const canUnfreeze = frozenBy === user?.id;

  const viewport = useChatViewport<HTMLDivElement>();

  const scrollRef = useRef<HTMLDivElement>(null);
  const longTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackedMentions = useRef(new Set<string>());
  const subscribedConvId = useRef<string | null>(null);
  const enteredInviteEventIdsRef = useRef(new Set<string>());
  const pendingSeenMarksRef = useRef(new Set<string>());
  const seenMarkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queuedSeenMarkRef = useRef<{ messageId: string; conversationId: string } | null>(null);
  const isTypingRef = useRef(false);
  const lastTypingHeartbeatRef = useRef(0);
  const temporaryAccessEndedRef = useRef(false);
  const lastPresenceSwitchRef = useRef<string>("");
  const mutualChatEstablishedRef = useRef(false);
  const previousChatSwitchConversationRef = useRef<{
    conversationId: string;
    otherUserId: string;
    otherUserName: string;
  } | null>(null);
  const frozenRef = useRef(frozen);
  const convRef = useRef(currentConversation);
  const userIdRef = useRef(user?.id);
  const optimisticPhotoMessagesRef = useRef<OptimisticPhotoMessage[]>([]);
  const cancelledPhotoIdsRef = useRef(new Set<string>());
  const menuActionPointerHandledRef = useRef(0);
  const previousFriendTypingVisibleRef = useRef(false);

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const target = scrollRef.current;
    if (!target) return;
    target.scrollTo({
      top: target.scrollHeight,
      behavior,
    });
  }, []);

  useEffect(() => {
    frozenRef.current = frozen;
  }, [frozen]);
  useEffect(() => {
    convRef.current = currentConversation;
  }, [currentConversation]);
  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user?.id]);
  useEffect(() => {
    temporaryAccessEndedRef.current = temporaryAccessEnded;
  }, [temporaryAccessEnded]);
  useEffect(() => {
    optimisticPhotoMessagesRef.current = optimisticPhotoMessages;
  }, [optimisticPhotoMessages]);
  useEffect(() => {
    if (!temporaryAccessEnded) return;
    if (draftThrottleRef.current) {
      clearTimeout(draftThrottleRef.current);
      draftThrottleRef.current = null;
    }
    if (longTimer.current) {
      clearTimeout(longTimer.current);
    }
    longTimer.current = null;
    lastDraftRef.current = "";
    isTypingRef.current = false;
    setInput("");
    setReplyTarget(null);
    setLiveDraft(null);
    setOptimisticSwitchEvents([]);
    unsubscribeFromRealTimeMessages();
    unsubscribeFromTypingIndicators();
    unsubscribeFromFreezeStatus();
  }, [
    temporaryAccessEnded,
    unsubscribeFromRealTimeMessages,
    unsubscribeFromTypingIndicators,
    unsubscribeFromFreezeStatus,
  ]);
  useEffect(() => {
    if (
      !currentConversation?.id ||
      !user?.id ||
      typeof window === "undefined"
    ) {
      setHiddenMessageIds(new Set());
      return;
    }
    try {
      const raw = localStorage.getItem(
        `chat_hidden_messages:${user.id}:${currentConversation.id}`,
      );
      setHiddenMessageIds(new Set(raw ? JSON.parse(raw) : []));
    } catch {
      setHiddenMessageIds(new Set());
    }
  }, [currentConversation?.id, user?.id]);
  useEffect(() => {
    return () => {
      optimisticPhotoMessagesRef.current.forEach((message) => {
        URL.revokeObjectURL(message.localUrl);
      });
    };
  }, []);
  useEffect(() => {
    const realPhotoUrls = new Set(
      activeMessages
        .filter((message) => {
          const mediaType = String(
            message.media_type || message.mediaType || "",
          ).toUpperCase();
          return mediaType === "PHOTO";
        })
        .map((message) => message.mediaUrl || message.media_url)
        .filter(Boolean),
    );

    if (realPhotoUrls.size === 0) return;

    setOptimisticPhotoMessages((current) => {
      let changed = false;
      const next = current.filter((message) => {
        const hasArrived =
          message.uploadedUrl && realPhotoUrls.has(message.uploadedUrl);
        if (hasArrived) {
          URL.revokeObjectURL(message.localUrl);
          changed = true;
          return false;
        }
        return true;
      });
      return changed ? next : current;
    });
  }, [activeMessages]);

  useEffect(() => {
    if (!currentConversation?.id) return;
    const otherUserId =
      currentConversation.other_user?.user_id ||
      currentConversation.other_user?.id ||
      "";
    const otherUserName =
      currentConversation.other_user?.display_name ||
      currentConversation.other_user?.username ||
      "someone";
    const previousChatSwitchConversation =
      previousChatSwitchConversationRef.current;

    if (
      user?.id &&
      otherUserId &&
      previousChatSwitchConversation &&
      previousChatSwitchConversation.conversationId !== currentConversation.id &&
      previousChatSwitchConversation.otherUserId &&
      previousChatSwitchConversation.otherUserId !== otherUserId
    ) {
      liveScreenDebug("chat_switch_screen_emit_started", {
        fromConversationId: previousChatSwitchConversation.conversationId,
        previousOtherUserId: previousChatSwitchConversation.otherUserId,
        nextConversationId: currentConversation.id,
        nextOtherUserId: otherUserId,
        nextOtherUserName: otherUserName,
      });
    }

    previousChatSwitchConversationRef.current = {
      conversationId: currentConversation.id,
      otherUserId,
      otherUserName,
    };
    liveScreenDebug("active_conversation_changed", {
      conversationId: currentConversation.id,
      currentUserId: user?.id ?? null,
      otherUserId,
      otherUsername: currentConversation.other_user?.username,
    });
    onConversationActiveChange?.(currentConversation.id, otherUserId);
  }, [
    currentConversation?.id,
    currentConversation?.other_user?.user_id,
    currentConversation?.other_user?.id,
    currentConversation?.other_user?.display_name,
    currentConversation?.other_user?.username,
    onConversationActiveChange,
    user?.id,
  ]);

  useEffect(() => {
    mutualChatEstablishedRef.current = false;
    lastPresenceSwitchRef.current = "";
    setLivePresenceSwitchTarget(null);
    setLiveDraft(null);
    setCurrentMoodBlock(null);
  }, [currentConversation?.id]);

  useEffect(() => {
    const uid = user?.id;
    const otherUserId =
      currentConversation?.other_user?.user_id ||
      currentConversation?.other_user?.id;
    const otherUserName =
      currentConversation?.other_user?.display_name ||
      currentConversation?.other_user?.username ||
      "";
    liveScreenDebug("current_chat_presence_effect", {
      uid,
      conversationId: currentConversation?.id ?? null,
      otherUserId: otherUserId || null,
      otherUserName,
    });
    if (!uid) return;
    if (!otherUserId) {
      messagingService.clearCurrentChatPresence(uid);
      return;
    }
    const publishPresence = () => {
      messagingService.setCurrentChatPresence(uid, otherUserId, otherUserName);
    };
    const publishPresenceWhenVisible = () => {
      if (document.visibilityState === "visible") publishPresence();
    };
    publishPresence();
    liveScreenDebug("current_chat_presence_published", {
      uid,
      conversationId: currentConversation?.id ?? null,
      otherUserId,
      otherUserName,
    });
    window.addEventListener("focus", publishPresence);
    document.addEventListener("visibilitychange", publishPresenceWhenVisible);
    return () => {
      window.removeEventListener("focus", publishPresence);
      document.removeEventListener(
        "visibilitychange",
        publishPresenceWhenVisible,
      );
      messagingService.clearCurrentChatPresence(uid);
    };
  }, [
    user?.id,
    currentConversation?.id,
    currentConversation?.other_user?.user_id,
    currentConversation?.other_user?.id,
    currentConversation?.other_user?.display_name,
    currentConversation?.other_user?.username,
  ]);

  useEffect(() => {
    setOptimisticSwitchEvents([]);
    liveScreenDebug("chat_switch_listener_effect", {
      conversationId: currentConversation?.id ?? null,
      userId: user?.id ?? null,
      temporaryAccessEnded,
    });
    if (!currentConversation?.id || !user?.id || temporaryAccessEnded) return;
    return messagingService.subscribeToOptimisticChatSwitchSignals(
      currentConversation.id,
      user.id,
      (signal: ChatSwitchSignal) => {
        liveScreenDebug("chat_switch_signal_received", {
          conversationId: currentConversation.id,
          userId: user.id,
          signal,
        });
        const optimisticEvent: MessageEvent = {
          id: `optimistic-switch-${signal.id}`,
          conversation_id: signal.conversation_id,
          user_id: signal.user_id,
          event_type: "chat_switch",
          data: {
            target_user_id: signal.target_user_id,
            target_user_name: signal.target_user_name,
            recipient_user_id: signal.recipient_user_id,
          },
          created_at: new Date(signal.created_at).toISOString(),
        };
        setOptimisticSwitchEvents((prev) => {
          if (prev.some((e) => e.id === optimisticEvent.id)) return prev;
          return [...prev, optimisticEvent];
        });
        setTimeout(() => {
          setOptimisticSwitchEvents((prev) =>
            prev.filter((e) => e.id !== optimisticEvent.id),
          );
        }, 12000);
      },
    );
  }, [currentConversation?.id, user?.id, temporaryAccessEnded]);

  function writeDraftHelper(text: string, convId?: string) {
    if (temporaryAccessEndedRef.current) {
      liveScreenDebug("draft_helper_skipped_temporary_access_ended", {
        requestedConversationId: convId ?? null,
        textLength: text.length,
      });
      return;
    }
    const id = convId ?? convRef.current?.id;
    const uid = userIdRef.current;
    if (!id || !uid) {
      liveScreenDebug("draft_helper_skipped_missing_context", {
        requestedConversationId: convId ?? null,
        resolvedConversationId: id ?? null,
        userId: uid ?? null,
        textLength: text.length,
      });
      return;
    }
    liveScreenDebug("draft_helper_write_requested", {
      conversationId: id,
      userId: uid,
      textLength: text.length,
      action: text.length > 0 ? "set" : "clear",
    });
    if (text.length > 0) {
      messagingService.setDraftText(id, uid, text);
    } else {
      messagingService.clearDraftText(id, uid);
    }
  }

  const stopTyping = useCallback(() => {
    const conv = convRef.current;
    if (!conv || !isTypingRef.current) return;
    isTypingRef.current = false;
    if (temporaryAccessEndedRef.current) return;
    setTypingIndicator(conv.id, false);
  }, [setTypingIndicator]);

  const getDraftStorageKey = useCallback((cId: string) => {
    const uid = userIdRef.current ?? "anon";
    return `chat_draft:${uid}:${cId}`;
  }, []);

  // SECURITY: Using sessionStorage instead of localStorage to reduce XSS exposure
  const saveLocalDraft = useCallback(
    (text: string, cId?: string) => {
      const convId = cId ?? convRef.current?.id;
      if (!convId || typeof window === "undefined") return;
      try {
        const key = getDraftStorageKey(convId);
        if (text.trim().length === 0) {
          sessionStorage.removeItem(key);
          return;
        }
        sessionStorage.setItem(key, text);
      } catch {
        /* ignore */
      }
    },
    [getDraftStorageKey],
  );

  const loadLocalDraft = useCallback(
    (cId: string): string => {
      if (typeof window === "undefined") return "";
      try {
        return sessionStorage.getItem(getDraftStorageKey(cId)) ?? "";
      } catch {
        return "";
      }
    },
    [getDraftStorageKey],
  );

  const clearLocalDraft = useCallback(
    (cId: string) => {
      if (typeof window === "undefined") return;
      try {
        sessionStorage.removeItem(getDraftStorageKey(cId));
      } catch {
        /* ignore */
      }
    },
    [getDraftStorageKey],
  );

  const clearRealtimeTypingSignals = useCallback(() => {
    const conv = convRef.current;
    if (!conv) return;
    if (draftThrottleRef.current) {
      clearTimeout(draftThrottleRef.current);
      draftThrottleRef.current = null;
    }
    lastDraftRef.current = "";
    isTypingRef.current = false;
    if (temporaryAccessEndedRef.current) return;
    writeDraftHelper("", conv.id);
    setTypingIndicator(conv.id, false);
  }, [setTypingIndicator]);

  function writeDraft(text: string, convId?: string) {
    if (temporaryAccessEndedRef.current) {
      liveScreenDebug("draft_write_skipped_temporary_access_ended", {
        requestedConversationId: convId ?? null,
        textLength: text.length,
      });
      return;
    }
    const id = convId ?? convRef.current?.id;
    const uid = userIdRef.current;
    if (!id || !uid) {
      liveScreenDebug("draft_write_skipped_missing_context", {
        requestedConversationId: convId ?? null,
        resolvedConversationId: id ?? null,
        userId: uid ?? null,
        textLength: text.length,
      });
      return;
    }
    liveScreenDebug("draft_write_requested", {
      conversationId: id,
      userId: uid,
      textLength: text.length,
      action: text.length > 0 ? "set" : "clear",
    });
    if (text.length > 0) {
      messagingService.setDraftText(id, uid, text);
    } else {
      messagingService.clearDraftText(id, uid);
    }
  }

  // â”€â”€ Own presence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // â”€â”€ Freeze listener â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // â”€â”€ Friend online listener â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    const friendId =
      currentConversation?.other_user?.user_id ||
      currentConversation?.other_user?.id;
    if (!friendId) {
      setFriendPresenceOnline(false);
      setFriendPostgresLastSeenAt(null);
      setFriendPostgresTimeZone(getBrowserTimeZone());
      setLivePresenceSwitchTarget(null);
      lastPresenceSwitchRef.current = "";
      return;
    }
    setFriendPresenceOnline(false);
    setFriendPostgresLastSeenAt(null);
    setFriendPostgresTimeZone(getBrowserTimeZone());
    const unsub = messagingService.subscribeToActiveUserChatStatus(
      friendId,
      (status) => {
        setFriendPresenceOnline(status.isOnline);
        setFriendPostgresLastSeenAt(parsePresenceTimestamp(status.lastSeen));
        setFriendPostgresTimeZone(status.timezone || getBrowserTimeZone());

        const targetUserId = status.currentChatUserId;
        const targetUserName = status.currentChatUserName;
        const currentUserId = String(user?.id || "");
        const friendIsActivelyInThisConversation =
          !!targetUserId && !!currentUserId && targetUserId === currentUserId;

        if (friendIsActivelyInThisConversation) {
          mutualChatEstablishedRef.current = true;
          lastPresenceSwitchRef.current = "";
          setLivePresenceSwitchTarget(null);
          return;
        }

        if (
          mutualChatEstablishedRef.current &&
          targetUserId &&
          currentUserId &&
          targetUserId !== currentUserId &&
          targetUserId !== friendId
        ) {
          const nextKey = `${friendId}:${targetUserId}:${targetUserName}`;
          if (lastPresenceSwitchRef.current !== nextKey) {
            lastPresenceSwitchRef.current = nextKey;
            setLivePresenceSwitchTarget({
              userId: targetUserId,
              userName: targetUserName || "someone",
              isActive: true,
            });
          }
        } else {
          lastPresenceSwitchRef.current = "";
          setLivePresenceSwitchTarget(null);
        }
      },
    );
    return () => unsub();
  }, [
    currentConversation?.other_user?.user_id,
    currentConversation?.other_user?.id,
    user?.id,
  ]);


  useEffect(() => {
    const convId = currentConversation?.id;
    const friendId =
      currentConversation?.other_user?.user_id ||
      currentConversation?.other_user?.id;
    const currentUserId = user?.id;
    if (
      !convId ||
      !friendId ||
      !currentUserId ||
      temporaryAccessEnded
    ) {
      setLiveDraft(null);
      return;
    }
    const unsub = messagingService.subscribeToUserDraftText(
      convId,
      friendId,
      (draft) => {
        setLiveDraft(
          draft?.userId === friendId && draft.text ? draft.text : null,
        );
      },
    );
    return () => unsub();
  }, [
    currentConversation?.id,
    currentConversation?.other_user?.user_id,
    currentConversation?.other_user?.id,
    user?.id,
    temporaryAccessEnded,
  ]);

  // â”€â”€ Boot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!user?.id) return;
    return () => {
      subscribedConvId.current = null;
      clearRealtimeTypingSignals();
      unsubscribeFromRealTimeMessages();
      unsubscribeFromTypingIndicators();
      unsubscribeFromFreezeStatus();
    };
  }, [user?.id, clearRealtimeTypingSignals]); // eslint-disable-line

  // â”€â”€ Subscribe to conversation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (temporaryAccessEnded) return;
    if (!user?.id || conversations.length === 0) return;
    const targetId =
      conversationId ??
      currentConversation?.id ??
      subscribedConvId.current ??
      null;
    if (!targetId) return;
    const conversation = conversations.find((c) => c.id === targetId);
    if (!conversation) return;
    if (subscribedConvId.current === conversation.id) return;
    if (subscribedConvId.current) clearRealtimeTypingSignals();
    subscribedConvId.current = conversation.id;
    setCurrentConversation(conversation);
    redundantScreenLog(
      "ðŸ” [MessagingScreen DEBUG] Subscribing to Realtime for conversation:",
      conversation.id,
    );
    subscribeToRealTimeMessages(conversation.id);
    subscribeToRealTimeEvents(conversation.id);
    subscribeToTypingIndicators(conversation.id);
    subscribeToFreezeStatus(conversation.id);
    trackedMentions.current.clear();
    setHasOpenedChat(false);
    setInput(loadLocalDraft(conversation.id));
    lastDraftRef.current = "";
  }, [user?.id, conversationId, conversations, temporaryAccessEnded]); // eslint-disable-line

  useEffect(() => {
    if (
      temporaryAccessEnded ||
      !user?.id ||
      !conversationId ||
      currentConversation?.id === conversationId
    ) {
      return;
    }
    if (
      conversations.some((conversation) => conversation.id === conversationId)
    ) {
      return;
    }

    let cancelled = false;
    void chatInviteService
      .getConversationForUser(conversationId, user.id)
      .then((conversation) => {
        if (cancelled || !conversation) return;
        subscribedConvId.current = conversation.id;
        setCurrentConversation(conversation);
        subscribeToRealTimeMessages(conversation.id);
        subscribeToRealTimeEvents(conversation.id);
        subscribeToTypingIndicators(conversation.id);
        subscribeToFreezeStatus(conversation.id);
        setInput(loadLocalDraft(conversation.id));
      })
      .catch((error) => console.error("Unable to open temporary chat:", error));

    return () => {
      cancelled = true;
    };
  }, [
    user?.id,
    conversationId,
    currentConversation?.id,
    conversations,
    setCurrentConversation,
    subscribeToRealTimeMessages,
    subscribeToTypingIndicators,
    subscribeToFreezeStatus,
    loadLocalDraft,
    temporaryAccessEnded,
  ]);

  useEffect(() => {
    if (!currentConversation?.id || !user?.id || !supabaseAuthReady) {
      setConversationInvites([]);
      setConversationInvitesReady(false);
      return;
    }
    const candidateInviteeIds = [
      ...(currentConversation.temporary_participant_ids || []),
      ...inviteFriends.map(
        (friend: any) => friend.userId || friend.user_id || friend.id,
      ),
    ].filter(
      (id, index, self): id is string =>
        !!id && id !== user.id && self.indexOf(id) === index,
    );
    return chatInviteService.subscribeConversationInvites(
      currentConversation.id,
      user.id,
      isOriginalParticipant,
      candidateInviteeIds,
      (invites) => {
        setConversationInvites(invites);
        setConversationInvitesReady(true);
      },
    );
  }, [
    currentConversation?.id,
    currentConversation?.temporary_participant_ids,
    inviteFriends,
    isOriginalParticipant,
    user?.id,
    supabaseAuthReady,
  ]);

  // â”€â”€ Viewport â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


  useEffect(() => {
    scrollChatToBottom();
  }, [
    activeMessages,
    optimisticSwitchEvents,
    livePresenceSwitchTarget,
    scrollChatToBottom,
  ]);

  // â”€â”€ Seen tracking (only the most recent incoming message) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!currentConversation || !user?.id) return;
    const otherUserId = currentConversation.other_user?.user_id;
    if (!otherUserId) return;
    const seenOwnMessages = activeMessages.filter(
      (msg) => msg.senderId === user.id && msg.isOwn && msg.is_seen,
    );
    if (seenOwnMessages.length === 0) return;
    const latest = seenOwnMessages[seenOwnMessages.length - 1];
    trackSeenMessage(
      latest.id,
      currentConversation.id,
      otherUserId,
      currentConversation.other_user?.display_name ||
        currentConversation.other_user?.username ||
        "Someone",
    );
  }, [activeMessages, currentConversation, user?.id, trackSeenMessage]);

  useEffect(() => {
    if (!currentConversation?.id || !user?.id) return;
    const unseenIncoming = activeMessages.filter(
      (msg) => msg.senderId !== user.id && !msg.is_seen,
    );
    const latestUnseen = unseenIncoming[unseenIncoming.length - 1];
    const unseenIds = new Set(latestUnseen ? [latestUnseen.id] : []);
    if (latestUnseen && !pendingSeenMarksRef.current.has(latestUnseen.id)) {
      pendingSeenMarksRef.current.add(latestUnseen.id);
      // mark_conversation_read advances every receipt through this message;
      // coalesce burst arrivals into one bounded write.
      queuedSeenMarkRef.current = { messageId: latestUnseen.id, conversationId: currentConversation.id };
      if (!seenMarkTimerRef.current) {
        seenMarkTimerRef.current = setTimeout(() => {
          seenMarkTimerRef.current = null;
          const queued = queuedSeenMarkRef.current;
          queuedSeenMarkRef.current = null;
          if (queued) markMessageAsSeen(queued.messageId).finally(() => {});
        }, 250);
      }
    }
    for (const pendingId of pendingSeenMarksRef.current) {
      if (!unseenIds.has(pendingId))
        pendingSeenMarksRef.current.delete(pendingId);
    }
  }, [activeMessages, currentConversation?.id, user?.id, markMessageAsSeen]);

  useEffect(() => {
    if (seenMarkTimerRef.current) clearTimeout(seenMarkTimerRef.current);
    seenMarkTimerRef.current = null;
    queuedSeenMarkRef.current = null;
    pendingSeenMarksRef.current.clear();
  }, [currentConversation?.id]);

  useEffect(() => () => {
    if (seenMarkTimerRef.current) clearTimeout(seenMarkTimerRef.current);
  }, []);

  // â”€â”€ Mood block â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleMoodBlock = async (
    mood: "angry" | "crying" | "irritated" | "depressed",
  ) => {
    if (!currentConversation || !user?.id) {
      liveScreenDebug("mood_block_skipped_missing_context", {
        conversationId: currentConversation?.id ?? null,
        userId: user?.id ?? null,
        mood,
      });
      return;
    }
    const now = Date.now();
    const endTime = now + 10 * 60 * 1000;
    const moodBlock = {
      mood,
      initiatedBy: user.id,
      initiatedByName: user.displayName || user.username || "You",
      startTime: now,
      endTime,
    };
    liveScreenDebug("mood_block_write_requested", {
      conversationId: currentConversation.id,
      userId: user.id,
      mood,
      endTime,
    });
    const wroteMoodBlock = await messagingService.setMoodBlock(
      currentConversation.id,
      moodBlock,
    );
    liveScreenDebug("mood_block_write_result", {
      conversationId: currentConversation.id,
      userId: user.id,
      mood,
      wroteMoodBlock,
    });
    if (wroteMoodBlock) {
      setCurrentMoodBlock(moodBlock);
    }
  };

  useEffect(() => {
    if (!currentConversation?.id || temporaryAccessEnded) {
      liveScreenDebug("mood_block_listener_skipped", {
        conversationId: currentConversation?.id ?? null,
        temporaryAccessEnded,
      });
      setCurrentMoodBlock(null);
      return;
    }
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    liveScreenDebug("mood_block_listener_start", {
      conversationId: currentConversation.id,
    });
    const unsub = messagingService.subscribeToMoodBlock(
      currentConversation.id,
      (moodBlock) => {
        liveScreenDebug("mood_block_listener_payload", {
          conversationId: currentConversation.id,
          hasMoodBlock: Boolean(moodBlock),
          moodBlock,
        });
        setCurrentMoodBlock(moodBlock);
        if (expiryTimer) {
          clearTimeout(expiryTimer);
          expiryTimer = null;
        }
        if (!moodBlock) return;

        const timeUntilExpiry = moodBlock.endTime - Date.now();
        expiryTimer = setTimeout(() => {
          setCurrentMoodBlock(null);
          messagingService.clearMoodBlock(currentConversation.id);
        }, Math.max(0, timeUntilExpiry));
      },
    );
    return () => {
      if (expiryTimer) clearTimeout(expiryTimer);
      unsub();
    };
  }, [currentConversation?.id, temporaryAccessEnded]);

  // â”€â”€ Progress bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!currentMoodBlock) {
      setCurrentMoodBlockVisible(false);
      setProgressBarWidth(100);
      return;
    }

    setCurrentMoodBlockVisible(false);
    const frame = requestAnimationFrame(() => {
      setCurrentMoodBlockVisible(true);
    });

    const updateProgress = () => {
      const elapsed = Date.now() - currentMoodBlock.startTime;
      const total = currentMoodBlock.endTime - currentMoodBlock.startTime;
      const remaining = Math.max(0, total - elapsed);
      setProgressBarWidth(
        Math.max(0, Math.min(100, (remaining / total) * 100)),
      );
    };
    updateProgress();
    const interval = setInterval(updateProgress, 1000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(interval);
    };
  }, [currentMoodBlock]);

  useEffect(() => {
    if (!moodBlockModalOpen) {
      setMoodBlockModalVisible(false);
      return;
    }

    setMoodBlockModalVisible(false);
    const frame = requestAnimationFrame(() => {
      setMoodBlockModalVisible(true);
    });

    return () => cancelAnimationFrame(frame);
  }, [moodBlockModalOpen]);

  // â”€â”€ Freeze actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const doFreeze = async () => {
    const conv = convRef.current;
    const uid = userIdRef.current;
    if (!conv || !uid) {
      liveScreenDebug("freeze_skipped_missing_context", {
        conversationId: conv?.id ?? null,
        userId: uid ?? null,
      });
      return;
    }
    try {
      liveScreenDebug("freeze_requested", {
        conversationId: conv.id,
        userId: uid,
      });
      const froze = await freezeChat(conv.id);
      if (!froze) throw new Error("Unable to freeze this conversation");
    } catch (error) {
      liveScreenDebug("freeze_threw", {
        conversationId: conv.id,
        userId: uid,
        error,
      });
    }
  };

  const doUnfreeze = async () => {
    const conv = convRef.current;
    const uid = userIdRef.current;
    if (!conv) {
      liveScreenDebug("unfreeze_skipped_missing_context", {
        conversationId: null,
        userId: uid ?? null,
      });
      return;
    }
    try {
      liveScreenDebug("unfreeze_requested", {
        conversationId: conv.id,
        userId: uid ?? null,
      });
      const unfroze = await unfreezeChat(conv.id);
      if (!unfroze) throw new Error("Unable to unfreeze this conversation");
    } catch (error) {
      liveScreenDebug("unfreeze_threw", {
        conversationId: conv.id,
        userId: uid ?? null,
        error,
      });
    }
  };

  // â”€â”€ Event helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const isValidEventType = (t: string): t is EvType =>
    [
      "screenshot",
      "chat_switch",
      "opened_noreply",
      "long_unsent",
      "mention",
      "ignored",
      "invite",
    ].includes(t);

  const getEventText = (event: MessageEvent): string => {
    switch (event.event_type) {
      case "screenshot":
        return "You took a screenshot of this chat";
      case "chat_switch":
        if (event.user_id === user?.id)
          return `You went to chat with ${event.data?.target_user_name || "someone"}`;
        return `${currentConversation?.other_user?.display_name || currentConversation?.other_user?.username || event.data?.user_name || "Someone"} is now talking with ${event.data?.target_user_name || "someone"} instead of you!`;
      case "opened_noreply":
        return `${event.data?.user_name || "Someone"} opened the chat but didn't reply`;
      case "long_unsent":
        return "You typed a long message but didn't send it";
      case "mention":
        return `@${event.data?.mentioned_username || "someone"} was notified that you two are talking about them`;
      case "ignored":
        if (event.data?.ignored_direction === "they_ignored_me") {
          const ignorerName =
            event.data?.user_name ||
            currentConversation?.other_user?.display_name ||
            currentConversation?.other_user?.username ||
            "Someone";
          const ignoredName =
            event.data?.ignored_user_name ||
            user?.displayName ||
            user?.username ||
            "your";
          return event.user_id === user?.id
            ? `${ignorerName} ignored your message`
            : `You ignored ${ignoredName}'s message`;
        }
        if (event.user_id === user?.id) {
          // Current user did the ignoring Ã¢ show whose message they ignored
          const ignoredName =
            event.data?.ignored_user_name ||
            event.data?.target_user_name ||
            currentConversation?.other_user?.display_name ||
            currentConversation?.other_user?.username ||
            "someone";
          return `You ignored ${ignoredName}'s message`;
        } else {
          // Someone else ignored the current user's message
          const ignorerName =
            event.data?.user_name ||
            event.data?.username ||
            currentConversation?.other_user?.display_name ||
            currentConversation?.other_user?.username ||
            "Someone";
          return `${ignorerName} ignored your message`;
        }
      case "invite": {
        const invitedName = event.data?.user_name || "Someone";
        if (event.data?.action === "game_invite") {
          const inviterName = event.data?.inviter_name || "Someone";
          const gameTitle = event.data?.game_title || "This Or That";
          return event.user_id === user?.id
            ? `You invited ${currentConversation?.other_user?.display_name || currentConversation?.other_user?.username || "them"} to play ${gameTitle}`
            : `${inviterName} invited you to play ${gameTitle}`;
        }
        switch (event.data?.action) {
          case "invited":
            return `${invitedName} was invited`;
          case "joined":
            return `${invitedName} has joined this conversation`;
          case "removed":
            return `${invitedName} was removed`;
          case "left":
            return `${invitedName} left`;
          default:
            return `${invitedName} was invited`;
        }
      }
      default:
        return "Unknown event";
    }
  };

  const timelineEvents: typeof optimisticSwitchEvents = [
    ...events.filter((event) => event.conversation_id === currentConversation?.id),
    ...optimisticSwitchEvents,
  ];
  const livePresenceSwitchTargetAlreadyInTimeline =
    !!livePresenceSwitchTarget &&
    timelineEvents.some((event) => {
      if (event.event_type !== "chat_switch") return false;
      const targetUserId = String(event.data?.target_user_id ?? "");
      const targetUserName = String(event.data?.target_user_name ?? "")
        .trim()
        .toLowerCase();
      return (
        (!!targetUserId && targetUserId === livePresenceSwitchTarget.userId) ||
        (!!targetUserName &&
          targetUserName ===
            livePresenceSwitchTarget.userName.trim().toLowerCase())
      );
    });

  const msgUserProfiles = useProfileDataStore((s) => s.userProfiles);
  const friendInfo = currentConversation?.other_user
    ? {
        name:
          (currentConversation.other_user.user_id &&
            msgUserProfiles[currentConversation.other_user.user_id]
              ?.displayName) ||
          currentConversation.other_user.display_name ||
          currentConversation.other_user.username ||
          "Unknown User",
        avatar:
          currentConversation.other_user.avatar_url ||
          "https://picsum.photos/seed/default/100/100",
      }
    : FRIEND;
  const friendTypingRaw = useMemo(() => {
    const convId = currentConversation?.id;
    const friendId =
      currentConversation?.other_user?.user_id ||
      currentConversation?.other_user?.id;
    return (
      !!convId &&
      !!friendId &&
      typingUsers.some(
        (typingUser) =>
          typingUser.conversation_id === convId &&
          typingUser.user_id === friendId &&
          typingUser.is_typing,
      )
    );
  }, [
    currentConversation?.id,
    currentConversation?.other_user?.user_id,
    currentConversation?.other_user?.id,
    typingUsers,
  ]);
  const [friendTypingVisible, setFriendTypingVisible] = useState(false);
  useEffect(() => {
    const delayMs = friendTypingRaw ? 120 : 850;
    const timer = window.setTimeout(() => {
      setFriendTypingVisible(friendTypingRaw);
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [friendTypingRaw]);
  const friendTyping = friendTypingVisible;
  useEffect(() => {
    if (!friendTyping) {
      previousFriendTypingVisibleRef.current = false;
      return;
    }
    if (previousFriendTypingVisibleRef.current) return;
    previousFriendTypingVisibleRef.current = true;

    let firstFrame = 0;
    let secondFrame = 0;
    const followUp = window.setTimeout(() => scrollChatToBottom("smooth"), 180);
    firstFrame = requestAnimationFrame(() => {
      scrollChatToBottom("smooth");
      secondFrame = requestAnimationFrame(() => scrollChatToBottom("smooth"));
    });

    return () => {
      window.clearTimeout(followUp);
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [friendTyping, scrollChatToBottom]);
  useEffect(() => {
    if (!friendTyping || !liveDraft) return;
    const timer = window.setTimeout(() => scrollChatToBottom("smooth"), 90);
    return () => window.clearTimeout(timer);
  }, [friendTyping, liveDraft, scrollChatToBottom]);
  const friendStatusLabel = useMemo(() => {
    if (friendTyping) return "TYPING...";
    if (friendOnline) return "ACTIVE NOW";
    return formatLastSeenLabel(friendLastSeenAt, friendTimeZone);
  }, [friendTyping, friendOnline, friendLastSeenAt, friendTimeZone]);
  const friendStatusIsLive = friendTyping || friendOnline;

  useEffect(() => {
    if (!MESSAGING_SCREEN_DEBUG) return;
    const convId = currentConversation?.id;
    const friendId =
      currentConversation?.other_user?.user_id ||
      currentConversation?.other_user?.id;
    redundantScreenLog("[MessagingScreen DEBUG] final header indicators:", {
      conversationId: convId,
      friendId,
      friendUsername: currentConversation?.other_user?.username,
      friendOnline,
      friendTyping,
      friendStatusLabel,
      friendStatusIsLive,
      friendLastSeenAt,
      friendTimeZone,
      onlineFriends,
      matchingTypingUsers: typingUsers.filter(
        (typingUser) =>
          typingUser.conversation_id === convId &&
          typingUser.user_id === friendId,
      ),
    });
  }, [
    currentConversation?.id,
    currentConversation?.other_user?.user_id,
    currentConversation?.other_user?.id,
    currentConversation?.other_user?.username,
    friendOnline,
    friendTyping,
    friendStatusLabel,
    friendStatusIsLive,
    friendLastSeenAt,
    friendTimeZone,
    onlineFriends,
    typingUsers,
  ]);

  const arrivedPhotoUrls = new Set(
    activeMessages
      .filter((msg) => {
        const mediaType = String(
          msg.media_type || msg.mediaType || "",
        ).toUpperCase();
        return mediaType === "PHOTO";
      })
      .map((msg) => msg.mediaUrl || msg.media_url)
      .filter(Boolean),
  );
  const arrivedOwnTextMessages = activeMessages
    .filter((msg) => {
      const mediaType = String(
        msg.media_type || msg.mediaType || "TEXT",
      ).toUpperCase();
      return (
        (msg.senderId || msg.sender_id) === user?.id &&
        mediaType !== "PHOTO" &&
        mediaType !== "VIDEO"
      );
    })
    .map((msg) => {
      const rawTime = msg.timestamp ?? msg.created_at;
      const time =
        typeof rawTime === "object" && rawTime && "toDate" in rawTime
          ? (rawTime as any).toDate().getTime()
          : rawTime
            ? new Date(String(rawTime)).getTime()
            : 0;
      return {
        content: String(msg.content || ""),
        time: Number.isFinite(time) ? time : 0,
      };
    });

  const rawTimeline: TimelineItem[] = [
    ...activeMessages
      .filter((msg) => !hiddenMessageIds.has(msg.id))
      .map((msg) => {
        const storedMediaUrl = msg.mediaUrl || msg.media_url || null;
        const mediaUrl = storedMediaUrl ? refreshedMediaUrls[storedMediaUrl] || storedMediaUrl : null;
        // Native messages persist the storage path, while the current table has
        // no separate media-type column. Treat a durable path as a photo unless
        // it is one of the structured shared-content payloads handled below.
        const persistedMediaType = String(
          msg.media_type || msg.mediaType || "",
        ).toUpperCase();
        const sharedPost = parseSharedPostPayload(mediaUrl);
        const sharedStory = parseSharedStoryPayload(mediaUrl);
        const mediaType =
          persistedMediaType ||
          (mediaUrl && !sharedPost && !sharedStory ? "PHOTO" : "");
        const replyToRaw = msg.reply_to || msg.replyTo || null;
        return {
          id: msg.id,
          kind: "msg" as const,
          from: (msg.senderId === user?.id ? "me" : "them") as From,
          text: msg.content,
          senderId: msg.senderId || msg.sender_id,
          senderName:
            msg.senderName ||
            ((msg.senderId || msg.sender_id) === user?.id
              ? user?.username || user?.displayName || "You"
              : friendInfo.name),
          sharedPost,
          sharedStory,
          mediaUrl,
          mediaType,
          sourceIds: [msg.id],
          replyTo: replyToRaw
            ? {
                id: String(replyToRaw.id || ""),
                senderId: String(
                  replyToRaw.sender_id || replyToRaw.senderId || "",
                ),
                senderName: String(
                  replyToRaw.sender_name || replyToRaw.senderName || "Message",
                ),
                content: String(replyToRaw.content || ""),
                mediaType:
                  replyToRaw.media_type || replyToRaw.mediaType || null,
              }
            : null,
          createdAt: msg.timestamp ?? msg.created_at,
          photoUrls:
            mediaUrl && mediaType === "PHOTO" && !sharedPost && !sharedStory
              ? [mediaUrl]
              : [],
          deliveryStatus: (msg.is_seen
            ? "seen"
            : msg.is_delivered
              ? "delivered"
              : undefined) as Status | undefined,
        };
      }),
    ...optimisticTextMessages
      .filter(
        (message) =>
          message.conversationId === currentConversation?.id &&
          !arrivedOwnTextMessages.some(
            (arrived) =>
              arrived.content === message.text &&
              arrived.time >= message.createdAt - 5_000 &&
              arrived.time <= message.createdAt + 60_000,
          ),
      )
      .map(
        (message): Msg => ({
          id: message.id,
          kind: "msg",
          from: "me",
          text: message.text,
          senderId: user?.id ?? "",
          senderName: "You",
          sharedPost: null,
          sharedStory: null,
          mediaUrl: null,
          mediaType: "TEXT",
          photoUrls: [],
          sourceIds: [message.id],
          replyTo: message.replyTo,
          createdAt: message.createdAt,
          optimistic: !message.failed,
          failed: !!message.failed,
        }),
      ),
    ...optimisticPhotoMessages
      .filter(
        (message) =>
          message.conversationId === currentConversation?.id &&
          (!message.uploadedUrl || !arrivedPhotoUrls.has(message.uploadedUrl)),
      )
      .map(
        (message): Msg => ({
          id: message.id,
          kind: "msg",
          from: "me",
          text: "Photo",
          senderId: user?.id ?? "",
          senderName: "You",
          sharedPost: null,
          sharedStory: null,
          mediaUrl: message.uploadedUrl || message.localUrl,
          mediaType: "PHOTO",
          photoUrls: [message.localUrl],
          sourceIds: [message.id],
          replyTo: null,
          createdAt: message.createdAt,
          optimistic: !message.failed,
          failed: !!message.failed,
        }),
      ),
    ...timelineEvents
      .filter((e) => {
        if (!e.event_type || !isValidEventType(e.event_type)) return false;
        if (e.event_type === "chat_switch") {
          if (e.user_id === user?.id) return false;
          const recipientUserId = String(e.data?.recipient_user_id ?? "");
          const currentUserId = String(user?.id ?? "");
          if (
            recipientUserId &&
            currentUserId &&
            recipientUserId !== currentUserId
          )
            return false;
          const destinationUserId = String(e.data?.target_user_id ?? "");
          const currentChatUserId = String(
            currentConversation?.other_user?.user_id ||
              currentConversation?.other_user?.id ||
              "",
          );
          if (
            destinationUserId &&
            currentChatUserId &&
            destinationUserId === currentChatUserId
          )
            return false;
          const destination = String(
            e.data?.target_user_name ?? "",
          ).toLowerCase();
          const currentChatUser = String(
            currentConversation?.other_user?.username ||
              currentConversation?.other_user?.display_name ||
              "",
          ).toLowerCase();
          if (destination && currentChatUser && destination === currentChatUser)
            return false;
        }
        if (e.event_type === "mention") {
          redundantScreenLog("[@mention] Filtering mention event:", e);
        }
        return true;
      })
      .map((event: MessageEvent) => ({
        id: event.id,
        kind: "evt" as const,
        type: event.event_type as EvType,
        text: getEventText(event),
        targetUserId: String(event.data?.target_user_id ?? "") || undefined,
        data: event.data,
        createdAt: (() => {
          const parsed = parsePresenceTimestamp(event.created_at);
          if (parsed !== null) {
            eventTimestampCacheRef.current.set(event.id, parsed);
            return parsed;
          }
          const cached = eventTimestampCacheRef.current.get(event.id);
          if (cached !== undefined) return cached;

          const fallback = Date.now();
          eventTimestampCacheRef.current.set(event.id, fallback);
          return fallback;
        })(),
      })),
  ].sort((a, b) => {
    const getMs = (item: TimelineItem): number => {
      const parsed = parsePresenceTimestamp(item.createdAt);
      return parsed ?? 0;
    };
    const tA = getMs(a),
      tB = getMs(b);
    if (tA === tB) return a.kind === "msg" ? -1 : 1;
    return tA - tB;
  });

  const timeline: TimelineItem[] = rawTimeline.reduce<TimelineItem[]>(
    (items, item) => {
      const prev = items[items.length - 1];
      if (
        item.kind === "msg" &&
        prev?.kind === "msg" &&
        item.photoUrls.length > 0 &&
        prev.photoUrls.length > 0 &&
        item.from === prev.from
      ) {
        items[items.length - 1] = {
          ...prev,
          id: item.id,
          text: prev.text,
          photoUrls: [...prev.photoUrls, ...item.photoUrls],
          sourceIds: [...prev.sourceIds, ...item.sourceIds],
          createdAt: item.createdAt,
          optimistic: prev.optimistic || item.optimistic,
          failed: prev.failed || item.failed,
        };
        return items;
      }
      items.push(item);
      return items;
    },
    [],
  );

  const getChatPhotos = (): ChatPhoto[] =>
    timeline.flatMap((item) =>
      item.kind === "msg"
        ? item.photoUrls.map((url, index) => ({
            key: `${item.id}:${index}`,
            url,
          }))
        : [],
    );

  const openPhotoViewer = (msg: Msg, photoIndex: number) => {
    const photos = getChatPhotos();
    const requestedKey = `${msg.id}:${photoIndex}`;
    const requestedIndex = photos.findIndex(
      (photo) => photo.key === requestedKey,
    );

    setPhotoViewer({
      photos,
      index: requestedIndex >= 0 ? requestedIndex : 0,
    });
  };

  const setReplyFromMessage = (msg: Msg) => {
    setReplyTarget({
      id: msg.id,
      senderId: msg.senderId,
      senderName: msg.from === "me" ? "You" : msg.senderName || friendInfo.name,
      content: summarizeMessageForReply(msg),
      mediaType: msg.mediaType,
    });
  };

  const persistHiddenMessageIds = (nextIds: Set<string>) => {
    if (!currentConversation?.id || !user?.id || typeof window === "undefined")
      return;
    localStorage.setItem(
      `chat_hidden_messages:${user.id}:${currentConversation.id}`,
      JSON.stringify([...nextIds]),
    );
  };

  const deleteMessageForMe = async (msg: Msg) => {
    try {
      await Promise.all(msg.sourceIds.map((id) => messagingService.hideMessageForMe(id)));
      setHiddenMessageIds((current) => {
        const next = new Set(current);
        msg.sourceIds.forEach((id) => next.add(id));
        persistHiddenMessageIds(next);
        return next;
      });
    } catch (error) {
      console.error("Unable to persist hidden message", error);
      return;
    }
    if (replyTarget && msg.sourceIds.includes(replyTarget.id)) {
      setReplyTarget(null);
    }
    setMessageActionTarget(null);
  };

  const deleteMessageForEveryone = async (msg: Msg) => {
    if (!user?.id || msg.from !== "me") return;
    setMessageActionTarget(null);
    try {
      await Promise.all(msg.sourceIds.map((id) => deleteMessage(id, user.id)));
      if (replyTarget && msg.sourceIds.includes(replyTarget.id)) {
        setReplyTarget(null);
      }
    } catch (error) {
      console.error("[MessagingScreen] Failed to delete message:", error);
      alert("Unable to delete this message for everyone.");
    }
  };

  const getCollapsed = (eventIndex: number): boolean => {
    let count = 0;
    for (let i = eventIndex + 1; i < timeline.length; i++) {
      if (timeline[i].kind === "msg") {
        count++;
        if (count >= 2) return true;
      }
    }
    return false;
  };

  // â”€â”€ Input handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function handleInput(val: string) {
    if (temporaryAccessEndedRef.current) {
      liveScreenDebug("input_skipped_temporary_access_ended", {
        attemptedLength: val.length,
        conversationId: convRef.current?.id ?? null,
        userId: userIdRef.current ?? null,
      });
      return;
    }
    const convAtInput = convRef.current;
    const uidAtInput = userIdRef.current;
    liveScreenDebug("input_changed", {
      conversationId: convAtInput?.id ?? null,
      userId: uidAtInput ?? null,
      textLength: val.length,
      hadDraftTimer: Boolean(draftThrottleRef.current),
      isTypingBefore: isTypingRef.current,
    });
    setInput(val);
    saveLocalDraft(val);
    const nowTyping = val.length > 0;
    if (nowTyping !== isTypingRef.current) {
      isTypingRef.current = nowTyping;
      lastTypingHeartbeatRef.current = nowTyping ? Date.now() : 0;
      const conv = convRef.current;
      liveScreenDebug("typing_state_transition", {
        conversationId: conv?.id ?? null,
        userId: uidAtInput ?? null,
        isTyping: nowTyping,
      });
      if (conv) setTypingIndicator(conv.id, nowTyping);
    } else if (
      nowTyping &&
      Date.now() - lastTypingHeartbeatRef.current >= 3_000
    ) {
      lastTypingHeartbeatRef.current = Date.now();
      const conv = convRef.current;
      if (conv) setTypingIndicator(conv.id, true);
    }
    const conv = convRef.current;
    if (conv) {
        if (val.length === 0) {
          if (draftThrottleRef.current) {
            clearTimeout(draftThrottleRef.current);
            draftThrottleRef.current = null;
          }
          lastDraftRef.current = "";
          liveScreenDebug("draft_clear_from_input", {
            conversationId: conv.id,
            userId: uidAtInput ?? null,
          });
          writeDraft("");
        } else if (val !== lastDraftRef.current) {
          if (draftThrottleRef.current) clearTimeout(draftThrottleRef.current);
          liveScreenDebug("draft_write_scheduled_from_input", {
            conversationId: conv.id,
            userId: uidAtInput ?? null,
            textLength: val.length,
            delayMs: 100,
          });
          draftThrottleRef.current = setTimeout(() => {
            lastDraftRef.current = val;
            liveScreenDebug("draft_write_timer_fired", {
              conversationId: conv.id,
              userId: uidAtInput ?? null,
              textLength: val.length,
            });
            writeDraft(val);
            draftThrottleRef.current = null;
          }, 100);
        }
    }
    if (longTimer.current) {
      clearTimeout(longTimer.current);
      longTimer.current = null;
    }
  }

  // â”€â”€ Send â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function send() {
    if (!currentConversation && conversations.length > 0) {
      liveScreenDebug("send_selected_first_conversation", {
        fallbackConversationId: conversations[0]?.id ?? null,
      });
      setCurrentConversation(conversations[0]);
      subscribeToRealTimeMessages(conversations[0].id);
      return;
    }
    if (
      !input.trim() ||
      frozenRef.current ||
      !currentConversation ||
      sendingMessage ||
      currentMoodBlock ||
      temporaryAccessEnded
    ) {
      liveScreenDebug("send_blocked", {
        hasInput: Boolean(input.trim()),
        frozen: frozenRef.current,
        conversationId: currentConversation?.id ?? null,
        sendingMessage,
        hasMoodBlock: Boolean(currentMoodBlock),
        temporaryAccessEnded,
      });
      return;
    }
    if (longTimer.current) {
      clearTimeout(longTimer.current);
      longTimer.current = null;
    }
    const text = input.trim();
    const optimisticMessage: OptimisticTextMessage = {
      id: `optimistic-text-${Date.now()}`,
      conversationId: currentConversation.id,
      text,
      replyTo: replyTarget,
      createdAt: Date.now(),
    };
    const replyPayload = replyTarget
      ? {
          id: replyTarget.id,
          sender_id: replyTarget.senderId,
          sender_name: replyTarget.senderName,
          content: replyTarget.content,
          media_type: replyTarget.mediaType || "TEXT",
        }
      : undefined;
    try {
      liveScreenDebug("send_started", {
        conversationId: currentConversation.id,
        userId: userIdRef.current ?? null,
        textLength: text.length,
        hasReply: Boolean(replyPayload),
      });
      redundantScreenLog("[MessagingScreen] Sending message:", {
        conversationId: currentConversation.id,
        text: text,
        conversation: currentConversation,
      });
      setInput("");
      clearLocalDraft(currentConversation.id);
      writeDraft("");
      lastDraftRef.current = "";
      if (draftThrottleRef.current) {
        clearTimeout(draftThrottleRef.current);
        draftThrottleRef.current = null;
      }
      setOptimisticTextMessages((current) => [...current, optimisticMessage]);
      setReplyTarget(null);
      if (isTypingRef.current) {
        isTypingRef.current = false;
        setTypingIndicator(currentConversation.id, false);
      }
      await sendRealTimeMessage(
        currentConversation.id,
        text,
        undefined,
        undefined,
        replyPayload,
      );
      liveScreenDebug("send_service_resolved", {
        conversationId: currentConversation.id,
        userId: userIdRef.current ?? null,
        optimisticMessageId: optimisticMessage.id,
      });
      setOptimisticTextMessages((current) =>
        current.filter((message) => message.id !== optimisticMessage.id),
      );
      setStatus("delivered");
      redundantScreenLog("[MessagingScreen] Message sent successfully");
    } catch (err) {
      liveScreenDebug("send_failed", {
        conversationId: currentConversation.id,
        userId: userIdRef.current ?? null,
        optimisticMessageId: optimisticMessage.id,
        error: err,
      });
      console.error("[MessagingScreen] Failed to send:", err);
      setOptimisticTextMessages((current) =>
        current.map((message) =>
          message.id === optimisticMessage.id
            ? { ...message, failed: true }
            : message,
        ),
      );
      setInput(text);
      saveLocalDraft(text, currentConversation.id);
    }
  }

  async function uploadAndSendPhoto(message: OptimisticPhotoMessage, conversation: any) {
    if (!user?.id) return;
    if (cancelledPhotoIdsRef.current.has(message.id)) return;
    try {
      const uploadedPhoto = await uploadOptimizedMedia({
        source: message.file,
        userId: user.id,
        context: "messages",
        fileName: message.file.name,
        mediaKind: "image",
      });
      if (cancelledPhotoIdsRef.current.has(message.id)) return;
      setOptimisticPhotoMessages((current) => current.map((item) =>
        item.id === message.id ? { ...item, uploadedUrl: uploadedPhoto.url, failed: false } : item,
      ));
      const sentMessage = await sendRealTimeMessage(conversation.id, "Photo", uploadedPhoto.url, "PHOTO");
      if (uploadedPhoto.assetId && sentMessage?.id) {
        await getSupabaseBrowserClient().rpc("attach_media_asset", {
          p_asset_id: uploadedPhoto.assetId,
          p_reference_type: "message",
          p_reference_id: sentMessage.id,
        });
      }
    } catch (err) {
      console.error("[MessagingScreen] Failed to send photo:", err);
      setOptimisticPhotoMessages((current) => current.map((item) =>
        item.id === message.id ? { ...item, failed: true, uploadedUrl: undefined } : item,
      ));
    }
  }

  function retryPhotoUpload(messageId: string) {
    const message = optimisticPhotoMessagesRef.current.find((item) => item.id === messageId);
    if (!message || !currentConversation || !user?.id) return;
    cancelledPhotoIdsRef.current.delete(messageId);
    setOptimisticPhotoMessages((current) => current.map((item) =>
      item.id === messageId ? { ...item, failed: false } : item,
    ));
    setSendingMedia(true);
    void uploadAndSendPhoto(message, currentConversation).finally(() => setSendingMedia(false));
  }

  function cancelPhotoUpload(messageId: string) {
    cancelledPhotoIdsRef.current.add(messageId);
    setOptimisticPhotoMessages((current) => {
      const target = current.find((item) => item.id === messageId);
      if (target) URL.revokeObjectURL(target.localUrl);
      return current.filter((item) => item.id !== messageId);
    });
  }

  async function sendPhotoFiles(files: FileList | null) {
    if (!files?.length) return;
    if (
      !currentConversation ||
      !user?.id ||
      frozenRef.current ||
      currentMoodBlock ||
      temporaryAccessEnded
    )
      return;

    const photoFiles = Array.from(files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (photoFiles.length === 0) return;

    const conversation = currentConversation;
    const optimisticMessages = photoFiles.map((file, index) => ({
      id: `optimistic-photo-${Date.now()}-${index}-${file.name}`,
      conversationId: conversation.id,
      localUrl: URL.createObjectURL(file),
      file,
      createdAt: Date.now() + index,
    }));

    setOptimisticPhotoMessages((current) => [
      ...current,
      ...optimisticMessages,
    ]);
    setSendingMedia(true);
    setStatus("delivered");

    void Promise.allSettled(
      optimisticMessages.map((message) => uploadAndSendPhoto(message, conversation)),
    ).then(() => setSendingMedia(false));
  }

  const loadInviteFriends = useCallback(async () => {
    if (!user?.id) return;
    setLoadingInviteFriends(true);
    try {
      const response = await friendsService.getFriends(user.id);
      const friends = Array.isArray(response)
        ? response
        : response.success
          ? response.friends || []
          : [];
      const unavailableIds = new Set([
        user.id,
        ...originalParticipantIds,
        ...acceptedTemporaryInvites.map((invite) => invite.invitee_id),
        ...conversationInvites
          .filter((invite) => invite.status === "pending")
          .map((invite) => invite.invitee_id),
      ]);
      setInviteFriends(
        friends.filter((friend: any) => {
          const friendId = friend.userId || friend.user_id || friend.id;
          return friendId && !unavailableIds.has(friendId);
        }),
      );
    } catch (error) {
      console.error("Unable to load friends for invite:", error);
      setInviteFriends([]);
    } finally {
      setLoadingInviteFriends(false);
    }
  }, [
    user?.id,
    originalParticipantIds,
    acceptedTemporaryInvites,
    conversationInvites,
  ]);

  const openInviteModal = () => {
    setMenuOpen(false);
    setInviteSearch("");
    window.setTimeout(() => {
      setInviteModalOpen(true);
      void loadInviteFriends();
    }, 0);
  };

  const filteredInviteFriends = inviteFriends.filter((friend: any) => {
    const q = inviteSearch.trim().toLowerCase();
    if (!q) return true;
    return [
      friend.displayName,
      friend.display_name,
      friend.nickname,
      friend.username,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q));
  });

  const sendInviteToFriend = async (friend: any) => {
    if (!currentConversation?.id || !user?.id || sendingInviteId) return;
    const friendId = friend.userId || friend.user_id || friend.id;
    if (!friendId) return;
    const friendName =
      friend.displayName ||
      friend.display_name ||
      friend.nickname ||
      friend.username ||
      "Someone";
    setSendingInviteId(friendId);
    try {
      await chatInviteService.sendInvite({
        conversationId: currentConversation.id,
        inviterId: user.id,
        inviterName: user.displayName || user.username || "Someone",
        inviteeId: friendId,
        inviteeName: friendName,
      });
      setInviteModalOpen(false);
    } catch (error) {
      console.error("Unable to send invite:", error);
      alert(error instanceof Error ? error.message : "Unable to send invite.");
    } finally {
      setSendingInviteId(null);
    }
  };

  const endTemporaryAccess = async (
    invite: ChatInvite,
    action: "removed" | "left",
  ) => {
    if (!user?.id) return;
    try {
      await chatInviteService.endTemporaryAccess({
        inviteId: invite.id,
        actorId: user.id,
        action,
      });
    } catch (error) {
      console.error("Unable to update temporary access:", error);
      alert("Unable to update temporary access.");
    }
  };

  const lastMineId = [...timeline]
    .reverse()
    .find((item): item is Msg => item.kind === "msg" && item.from === "me")?.id;

  const runMenuAction = (fn: () => void) => {
    try {
      fn();
    } catch (error) {
      console.error("Unable to run chat menu action:", error);
      alert("Unable to run this chat action.");
    }
  };

  const menuActions: [string, string, () => void, boolean][] = [
    [
      "Games",
      "",
      () => {
        setMenuOpen(false);
        setGamesRoomSessionId(null);
        setGamesRoomOpen(true);
      },
      false,
    ],
    ...(isOriginalParticipant
      ? ([
          [
            "Invite friend",
            "",
            () => {
              openInviteModal();
            },
            false,
          ],
        ] as [string, string, () => void, boolean][])
      : []),
    [
      "Mood Block",
      "",
      () => {
        setMenuOpen(false);
        window.setTimeout(() => setMoodBlockModalOpen(true), 0);
      },
      false,
    ],
    [
      frozen ? (canUnfreeze ? "Unfreeze" : "Frozen by them") : "Freeze chat",
      "",
      () => {
        setMenuOpen(false);
        if (frozen && canUnfreeze) {
          void doUnfreeze().catch((error) => {
            console.error("Unable to unfreeze chat:", error);
            alert("Unable to unfreeze this chat.");
          });
        } else if (!frozen) {
          void doFreeze().catch((error) => {
            console.error("Unable to freeze chat:", error);
            alert("Unable to freeze this chat.");
          });
        }
      },
      frozen && !canUnfreeze,
    ],
    [
      "Clear chat",
      "",
      () => {
        setMenuOpen(false);
        if (currentConversation?.id) {
          if (
            confirm("Are you sure you want to clear all messages in this chat?")
          ) {
            redundantScreenLog(
              "Clearing chat for conversation:",
              currentConversation.id,
            );
            clearMessages(currentConversation.id)
              .then(() => redundantScreenLog("Chat cleared successfully"))
              .catch((error) => console.error("Error clearing chat:", error));
          }
        }
      },
      false,
    ],
  ];

  const moodEmoji = (mood: string) => {
    if (mood === "angry") return "ðŸ˜ ";
    if (mood === "crying") return "ðŸ˜¢";
    if (mood === "irritated") return "ðŸ˜¤";
    if (mood === "depressed") return "ðŸ˜”";
    return "ðŸ˜¶";
  };

  // â”€â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div
      ref={viewport}
      className="pop-messaging-screen dare-chat chat-viewport"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        background:
          "radial-gradient(ellipse at 85% 0%, #4ade8009, transparent 40%), #08090d",
        fontFamily:
          "var(--font-ui)",
        color: "#fff",
        overflow: "hidden",
        height: "100%",
      }}
    >
      <style>{`
        @keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        @keyframes blink{50%{opacity:0}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        @keyframes typingDot{
          0%,80%,100%{transform:translateY(0);opacity:0.42}
          40%{transform:translateY(-3px);opacity:1}
        }
        @keyframes capsuleIn{from{opacity:0;transform:translateX(12px) scale(0.92)}to{opacity:1;transform:translateX(0) scale(1)}}
        @keyframes capsuleReveal{
          0%{opacity:0;transform:scaleX(0.4) scaleY(0.6);filter:blur(8px)}
          40%{opacity:1;filter:blur(0px)}
          70%{transform:scaleX(1.03) scaleY(1.02)}
          100%{transform:scaleX(1) scaleY(1)}
        }
        @keyframes fadeInCrying{
          0%{opacity:0;transform:scale(0.8) translateY(20px)}
          100%{opacity:1;transform:scale(1) translateY(0)}
        }
        @keyframes fadeInCard{
          0%{opacity:0;transform:translateY(20px)}
          100%{opacity:1;transform:translateY(0)}
        }
        @keyframes replyCardIn{
          0%{opacity:0;transform:translateY(10px) scale(0.985)}
          100%{opacity:1;transform:translateY(0) scale(1)}
        }
        @keyframes moodBackdropIn{
          0%{opacity:0}
          100%{opacity:1}
        }
        @keyframes moodOrbPulse{
          0%,100%{transform:scale(1);opacity:0.9}
          50%{transform:scale(1.08);opacity:1}
        }
        @keyframes moodSheen{
          0%{transform:translateX(-120%) skewX(-18deg);opacity:0}
          20%{opacity:0.22}
          100%{transform:translateX(180%) skewX(-18deg);opacity:0}
        }
        @keyframes moodProgressGlow{
          0%,100%{filter:brightness(1)}
          50%{filter:brightness(1.18)}
        }
        *{box-sizing:border-box}
        input,textarea{outline:none;}
        input::placeholder,textarea::placeholder{color:#64748b}
        ::-webkit-scrollbar{display:none}
        .messaging-header-action {
          border-color: transparent !important;
          background: transparent !important;
          box-shadow: none !important;
        }
        html[data-dare-theme="pop-social"] .pop-messaging-header,
        html[data-dare-theme="pop-social"] .pop-messaging-header .messaging-header-action {
          border-color: transparent !important;
          box-shadow: none !important;
        }
      `}</style>

      {/* â”€â”€ HEADER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div
        className="pop-messaging-header messaging-header-surface"
        style={{
          position: "relative",
          zIndex: 120,
          flexShrink: 0,
          background:
            "rgba(16,17,22,.94)",
          padding: "calc(10px + var(--safe-area-top)) 12px 10px",
          borderBottom: "none",
          boxShadow: "none",
          backdropFilter: "blur(20px)",
        }}
      >
        <div style={{ padding: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
              <button
                aria-label="Back to chats"
                className="messaging-back-action"
                onClick={() => {
                  clearRealtimeTypingSignals();
                  onBack?.();
                }}
                style={{
                  width: 44,
                  height: 44,
                  flexShrink: 0,
                  borderRadius: 18,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.045)",
                  color: "#94a3b8",
                  cursor: "pointer",
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  userSelect: "none",
                  boxShadow:
                    "0 10px 28px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.04)",
                }}
              >
                <ChevronLeft size={18} />
              </button>
              <div className="chat-header-avatar" style={{ position: "relative", flexShrink: 0 }}>
                <Avatar
                  src={friendInfo.avatar}
                  alt={friendInfo.name}
                  size={40}
                  userId={currentConversation?.other_user?.user_id}
                  username={currentConversation?.other_user?.username}
                  showStatus={false}
                />
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    right: 0,
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: friendOnline ? "#aeb7c2" : "#334155",
                    border: "2px solid #0d100d",
                    transition: "background 0.35s ease",
                    boxShadow: friendOnline
                      ? "0 0 6px rgba(214,221,232,0.6)"
                      : "none",
                  }}
                />
              </div>
              <div className="chat-header-identity" style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {friendInfo.name}
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: friendStatusIsLive ? 700 : 500,
                    letterSpacing: friendStatusIsLive ? "0.09em" : 0,
                    color: friendStatusIsLive ? "#c8d0d8" : "#94a3b8",
                    marginTop: 1,
                    transition:
                      "color 0.28s ease, letter-spacing 0.28s ease, opacity 0.28s ease",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: 170,
                    minHeight: 13,
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <span>{friendStatusLabel}</span>
                  {friendTyping && (
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 2.5,
                        transform: "translateY(1px)",
                      }}
                    >
                      {[0, 1, 2].map((dot) => (
                        <span
                          key={dot}
                          style={{
                            width: 3,
                            height: 3,
                            borderRadius: "50%",
                            background: "#c8d0d8",
                            animation: `typingDot 1.15s ${dot * 0.14}s ease-in-out infinite`,
                          }}
                        />
                      ))}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ position: "relative" }}>
              <button
                aria-label="Chat options"
                className="messaging-header-action"
                onClick={() => setMenuOpen(value => !value)}
                style={{ width: 44, height: 44, border: 0, background: 'transparent', color: '#e2e8f0', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
              >
                <MoreHorizontal size={22} />
              </button>
              {menuOpen && (
                <>
                  <div
                    style={{
                      position: "fixed",
                      top: "calc(68px + var(--safe-area-top))",
                      right: 12,
                      zIndex: 10000,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 8,
                      pointerEvents: "auto",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {menuActions.map(([label, icon, fn, active], i) => (
                      <button
                        key={i}
                        type="button"
                        onPointerUp={(e) => {
                          if (e.pointerType === "mouse") return;
                          e.preventDefault();
                          e.stopPropagation();
                          menuActionPointerHandledRef.current = Date.now();
                          runMenuAction(fn);
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            Date.now() - menuActionPointerHandledRef.current <
                            500
                          ) {
                            return;
                          }
                          runMenuAction(fn);
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.preventDefault();
                          e.stopPropagation();
                          runMenuAction(fn);
                        }}
                        disabled={label === "Frozen by them"}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 7,
                          padding: "8.5px 14px",
                          border: active
                            ? "1px solid rgba(214,221,232,0.5)"
                            : "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 50,
                          background: active
                            ? "rgba(214,221,232,0.14)"
                            : "rgba(12,16,12,0.97)",
                          backdropFilter: "blur(20px)",
                          color:
                            label === "Frozen by them"
                              ? "#444"
                              : active
                                ? "#c8d0d8"
                                : "#fff",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor:
                            label === "Frozen by them"
                              ? "not-allowed"
                              : "pointer",
                          touchAction: "manipulation",
                          fontFamily: "inherit",
                          letterSpacing: "0.01em",
                          whiteSpace: "nowrap",
                          boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
                          animation: `capsuleIn 0.18s ${i * 0.04}s ease both`,
                        }}
                      >
                        <span style={{ fontSize: 14 }}>{icon}</span>
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* â”€â”€ Status banners â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {false && (
        <div
          style={{
            flexShrink: 0,
            margin: "8px 14px 0",
            background:
              "linear-gradient(180deg, rgba(139,92,246,0.14), rgba(17,13,24,0.92))",
            border: "1px solid rgba(139,92,246,0.2)",
            borderRadius: 20,
            padding: "9px",
            textAlign: "center",
            color: "#c4b5fd",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
        </div>
      )}
      {frozen && (
        <div
          style={{
            flexShrink: 0,
            margin: "8px 14px 0",
            background:
              "linear-gradient(180deg, rgba(59,130,246,0.12), rgba(10,16,26,0.92))",
            border: "1px solid rgba(59,130,246,0.3)",
            borderRadius: 20,
            padding: "10px",
            textAlign: "center",
            color: "#93c5fd",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          â„ï¸{" "}
          {canUnfreeze
            ? "You froze this chat"
            : "Chat frozen by the other person"}
        </div>
      )}

      {/* â”€â”€ TIMELINE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {currentConversation && enteredTemporaryInvites.length > 0 && (
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            gap: 8,
            overflowX: "auto",
            padding: "8px 14px 0",
          }}
        >
          {enteredTemporaryInvites.map((invite) => {
            const isMe = invite.invitee_id === user?.id;
            return (
              <div
                className="pop-temporary-pill"
                key={invite.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px 8px 12px",
                  borderRadius: 999,
                  background:
                    "linear-gradient(180deg, rgba(214,221,232,0.14), rgba(18,18,18,0.92))",
                  border: "1px solid rgba(214,221,232,0.2)",
                  color: "#eef2f5",
                  fontSize: 12,
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                }}
              >
                <span>
                  {isMe
                    ? "You joined temporarily"
                    : `${invite.invitee_name} joined`}
                </span>
                {(isOriginalParticipant || isMe) && (
                  <button
                    type="button"
                    aria-label={isMe ? "Leave chat" : "Remove friend"}
                    onClick={() =>
                      void endTemporaryAccess(invite, isMe ? "left" : "removed")
                    }
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.06)",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {isMe ? <LogOut size={13} /> : <UserMinus size={13} />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {temporaryAccessEnded && (
        <div
          className="pop-message-banner"
          style={{
            flexShrink: 0,
            margin: "8px 14px 0",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.025))",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 20,
            padding: "10px",
            textAlign: "center",
            color: "rgba(255,255,255,0.55)",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          Temporary chat access ended
        </div>
      )}

      <div
        ref={scrollRef}
        className="chat-message-feed"
        style={{
          flex: 1,
          overflowY: "auto",
          minHeight: 0,
          paddingTop: 16,
          paddingBottom: currentMoodBlock ? 172 : 12,
        }}
        onClick={() => setMenuOpen(false)}
      >
        {!currentConversation && !loadingMessages && (
          <div
            className="app-modal-backdrop"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "#94a3b8",
              textAlign: "center",
              padding: "20px",
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 16 }}>ðŸ’¬</div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 850,
                color: "#fff",
                marginBottom: 8,
              }}
            >
              No conversation selected
            </div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>
              Select a conversation to start messaging
            </div>
          </div>
        )}

        {currentConversation && !temporaryAccessEnded && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 22,
                padding: "0 14px",
              }}
            >
              <span
                style={{
                  color: "#64748b",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.035)",
                  padding: "7px 12px",
                }}
              >
                TODAY
              </span>
            </div>

            {loadingMessages && timeline.length === 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  padding: "40px 0",
                  color: "#444",
                  fontSize: 13,
                }}
              >
                â³ Loading messages...
              </div>
            )}

            {timeline.map((item, index) => {
              if (item.kind === "evt") {
                return (
                  <SysLine
                    key={item.id}
                    type={item.type}
                    text={item.text}
                    collapsed={
                      item.type === "invite"
                        ? item.data?.action !== "game_invite"
                        : getCollapsed(index)
                    }
                    targetUserId={item.targetUserId}
                    data={item.data}
                    currentUserId={user?.id}
                    onEnterGameInvite={(sessionId) => {
                      setGamesRoomSessionId(sessionId);
                      setGamesRoomOpen(true);
                    }}
                    onOpenUserProfile={onOpenUserProfile}
                  />
                );
              }
              return (
                <Bubble
                  key={item.id}
                  msg={item}
                  showStatus={item.from === "me" && item.id === lastMineId}
                  status={item.deliveryStatus || status}
                  onOpenSharedPost={onOpenSharedPost}
                  onOpenPhoto={openPhotoViewer}
                  onReply={setReplyFromMessage}
                  onLongPress={setMessageActionTarget}
                  onRetryPhoto={(message) => retryPhotoUpload(message.id)}
                  onCancelPhoto={(message) => cancelPhotoUpload(message.id)}
                  showSenderName={temporaryGroupModeActive}
                  joinedBefore={joinsChatGroup(groupEntry(timeline[index - 1]), groupEntry(item))}
                  joinedAfter={joinsChatGroup(groupEntry(item), groupEntry(timeline[index + 1]))}
                />
              );
            })}

            {livePresenceSwitchTarget &&
              !livePresenceSwitchTargetAlreadyInTimeline && (
              <SysLine
                key={`live-switch-${livePresenceSwitchTarget.userId}-${livePresenceSwitchTarget.userName}-${livePresenceSwitchTarget.isActive ? "active" : "inactive"}`}
                type="chat_switch"
                text={
                  livePresenceSwitchTarget.isActive
                    ? `${friendInfo.name} is now talking with ${livePresenceSwitchTarget.userName} instead of you!`
                    : `${friendInfo.name} was chatting with ${livePresenceSwitchTarget.userName} instead of you!`
                }
                collapsed={!livePresenceSwitchTarget.isActive}
                targetUserId={livePresenceSwitchTarget.userId}
                currentUserId={user?.id}
                onOpenUserProfile={onOpenUserProfile}
              />
            )}

            {liveDraft && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-start",
                  padding: "4px 14px",
                  marginTop: 6,
                }}
              >
                <div
                  style={{
                    maxWidth: "78%",
                    minWidth: 80,
                    padding: "10px 14px",
                    borderRadius: "18px 18px 18px 4px",
                    background:
                      "linear-gradient(180deg, rgba(214,221,232,0.1), rgba(18,18,18,0.9))",
                    border: "1px solid rgba(214,221,232,0.18)",
                    color: "rgba(255,255,255,0.5)",
                    fontSize: 16,
                    lineHeight: 1.4,
                    fontStyle: "italic",
                    position: "relative",
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                    wordBreak: "break-word",
                    maxHeight: 170,
                    overflowY: "auto",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: -18,
                      left: 4,
                      fontSize: 10,
                      color: "#c8d0d8",
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      fontStyle: "normal",
                    }}
                  >
                    TYPING
                  </span>
                  {liveDraft}
                  <span
                    style={{
                      display: "inline-block",
                      width: 2,
                      height: 16,
                      background: "#d6dde8",
                      marginLeft: 1,
                      verticalAlign: "middle",
                      animation: "blink 1s step-end infinite",
                    }}
                  />
                </div>
              </div>
            )}
          </>
        )}
        {currentConversation && temporaryAccessEnded && (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "28px 18px",
              textAlign: "center",
              color: "rgba(255,255,255,0.42)",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            This temporary conversation is no longer available.
          </div>
        )}
      </div>

      {/* â”€â”€ INPUT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div
        className="pop-message-input-bar"
        style={{
          flexShrink: 0,
          padding: "8px 12px calc(8px + var(--safe-area-bottom))",
          background:
            "linear-gradient(180deg, rgba(8,8,8,0.82), rgba(8,8,8,0.98))",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "none",
          backdropFilter: "blur(20px)",
        }}
      >
        {replyTarget && !currentMoodBlock && !frozen && (
          <div
            className="pop-message-reply-card chat-reply-draft"
            style={{
              position: "relative",
              margin: "0 0 8px",
              padding: "9px 42px 9px 12px",
              borderRadius: 18,
              background:
                "linear-gradient(135deg, rgba(18,18,18,0.94), rgba(16,16,16,0.96))",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow:
                "0 14px 34px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.06)",
              overflow: "hidden",
              animation: "replyCardIn 0.2s cubic-bezier(0.2, 0.84, 0.24, 1)",
            }}
          >
            <div
              className="pop-message-input-shell"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 4,
                background:
                  "linear-gradient(180deg, #d6dde8, rgba(200,208,216,0.74))",
                boxShadow: "0 0 22px rgba(214,221,232,0.46)",
              }}
            />
            <div
              style={{
                color: "#d6dde8",
                fontSize: 12,
                fontWeight: 900,
                marginBottom: 3,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Replying to {replyTarget.senderName}
            </div>
            <div
              style={{
                color: "rgba(255,255,255,0.78)",
                fontSize: 15,
                lineHeight: 1.32,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                wordBreak: "break-word",
                overflowWrap: "anywhere",
              }}
            >
              {replyPreviewLabel(replyTarget)}
            </div>
            <button
              type="button"
              aria-label="Cancel reply"
              onClick={() => setReplyTarget(null)}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                width: 30,
                height: 30,
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.86)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backdropFilter: "blur(10px)",
              }}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {currentMoodBlock ? (
          <div style={{ height: 8 }} />
        ) : frozen ? (
          <div
            className="pop-modal-sheet"
            style={{
              textAlign: "center",
              fontSize: 15,
              padding: "14px 0",
              letterSpacing: "0.04em",
            }}
          >
            {canUnfreeze ? (
              <span
                style={{ color: "#3b82f6", cursor: "pointer", fontWeight: 600 }}
                onClick={doUnfreeze}
              >
                â„ï¸ Tap to unfreeze chat
              </span>
            ) : (
              <span style={{ color: "#2a4060" }}>Chat is frozen â„ï¸</span>
            )}
          </div>
        ) : temporaryAccessEnded ? (
          <div
            style={{
              textAlign: "center",
              fontSize: 15,
              padding: "14px 0",
              color: "rgba(255,255,255,0.35)",
              fontWeight: 700,
            }}
          >
            Temporary chat ended
          </div>
        ) : (
          <div className="chat-compose-row" style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <label
              style={{
                width: 44,
                height: 44,
                borderRadius: 20,
                border: "1px solid rgba(255,255,255,0.08)",
                background: sendingMedia
                  ? "rgba(255,255,255,0.035)"
                  : "rgba(255,255,255,0.055)",
                color: sendingMedia ? "#94a3b8" : "#c8d0d8",
                fontSize: sendingMedia ? 13 : 24,
                fontWeight: 300,
                cursor: sendingMedia ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginBottom: 2,
                boxShadow:
                  "0 14px 34px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.04)",
                lineHeight: 1,
                userSelect: "none",
                opacity: sendingMedia ? 0.75 : 1,
              }}
            >
              {sendingMedia ? "..." : "+"}
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={
                  sendingMedia ||
                  sendingMessage ||
                  !!currentMoodBlock ||
                  frozenRef.current
                }
                style={{ display: "none" }}
                onChange={async (e) => {
                  await sendPhotoFiles(e.target.files);
                  e.target.value = "";
                  /*
                  const file = e.target.files?.[0];
                  if (file && currentConversation) {
                    try {
                      await sendRealTimeMessage(
                        currentConversation.id,
                        `ðŸ“Ž ${file.name}`,
                      );
                      setStatus("delivered");
                      setTimeout(() => setStatus("seen"), 2200);
                    } catch (err) {
                      console.error(err);
                    }
                  }
                  */
                }}
              />
            </label>

            <div
              className="chat-compose-shell"
              style={{
                flex: 1,
                display: "flex",
                alignItems: "flex-end",
                background:
                  "linear-gradient(180deg, rgba(24,24,24,0.98), rgba(13,13,13,0.98))",
                borderRadius: 24,
                padding: "11px 14px",
                gap: 8,
                border: "1px solid rgba(255,255,255,0.08)",
                minHeight: 46,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
              }}
            >
              <textarea
                ref={composerInput}
                className="chat-compose-input"
                aria-label="Message"
                value={input}
                onChange={(e) => handleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                onBlur={() => {
                  stopTyping();
                  writeDraft("");
                }}
                disabled={!!currentMoodBlock}
                placeholder="Message..."
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  color: "#fff",
                  fontSize: 16,
                  lineHeight: 1.4,
                  caretColor: "#d6dde8",
                  resize: "none",
                  outline: "none",
                  fontFamily: "inherit",
                  minHeight: 24,
                  maxHeight: 112,
                  paddingTop: 1,
                  opacity: 1,
                  cursor: "text",
                }}
                rows={1}
              />
            </div>

            <button
              className="chat-send"
              aria-label="Send message"
              onClick={send}
              disabled={!input.trim()}
              style={{
                width: 44,
                height: 44,
                borderRadius: 20,
                border: input.trim()
                  ? "1px solid rgba(214,221,232,0.28)"
                  : "1px solid rgba(255,255,255,0.08)",
                flexShrink: 0,
                cursor: input.trim() ? "pointer" : "default",
                background: input.trim()
                  ? "var(--chat-accent)"
                  : "rgba(255,255,255,0.045)",
                boxShadow: input.trim()
                  ? "0 14px 34px rgba(214,221,232,0.22)"
                  : "inset 0 1px 0 rgba(255,255,255,0.04)",
                transition: "transform 140ms ease-out, opacity 140ms ease-out",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: input.trim() ? "#000" : "#64748b",
                marginBottom: 2,
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {inviteModalOpen && (
        <>
          <div
            className="app-modal-backdrop"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.72)",
              backdropFilter: "blur(14px)",
              zIndex: 210,
            }}
            onClick={() => setInviteModalOpen(false)}
          />
          <div
            style={{
              position: "fixed",
              left: 12,
              right: 12,
              bottom: "calc(12px + var(--safe-area-bottom))",
              zIndex: 211,
              maxHeight: "min(76vh, 620px)",
              background:
                "radial-gradient(circle at 50% -18%, rgba(214,221,232,0.16), transparent 42%), linear-gradient(180deg, rgba(19,23,19,0.98), rgba(9,11,9,0.99))",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 30,
              boxShadow:
                "0 -28px 80px rgba(0,0,0,0.68), inset 0 1px 0 rgba(255,255,255,0.05)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "16px 16px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                borderBottom: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div>
                <div style={{ color: "#fff", fontSize: 18, fontWeight: 900 }}>
                  Invite friend
                </div>
                <div
                  style={{
                    color: "rgba(255,255,255,0.42)",
                    fontSize: 12,
                    fontWeight: 800,
                    marginTop: 3,
                    textTransform: "uppercase",
                  }}
                >
                  Temporary access
                </div>
              </div>
              <button
                type="button"
                aria-label="Close invite friend"
                onClick={() => setInviteModalOpen(false)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.045)",
                  color: "#94a3b8",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: 14 }}>
              <div
                className="pop-message-input-shell"
                style={{
                  height: 46,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "0 14px",
                  borderRadius: 999,
                  background:
                    "linear-gradient(180deg, rgba(24,24,24,0.98), rgba(13,13,13,0.98))",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <Search size={17} color="#c8d0d8" />
                <input
                  value={inviteSearch}
                  onChange={(event) => setInviteSearch(event.target.value)}
                  placeholder="Search friends"
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    color: "#fff",
                    fontSize: 15,
                    fontFamily: "inherit",
                  }}
                />
              </div>
            </div>

            <div
              style={{
                padding: "0 14px 14px",
                overflowY: "auto",
                maxHeight: "calc(min(76vh, 620px) - 128px)",
              }}
            >
              {loadingInviteFriends ? (
                <div
                  style={{
                    padding: "34px 0",
                    textAlign: "center",
                    color: "rgba(255,255,255,0.42)",
                    fontSize: 14,
                  }}
                >
                  Loading friends...
                </div>
              ) : filteredInviteFriends.length === 0 ? (
                <div
                  style={{
                    padding: "34px 0",
                    textAlign: "center",
                    color: "rgba(255,255,255,0.42)",
                    fontSize: 14,
                  }}
                >
                  No friends available
                </div>
              ) : (
                filteredInviteFriends.map((friend: any) => {
                  const friendId = friend.userId || friend.user_id || friend.id;
                  const name =
                    friend.displayName ||
                    friend.display_name ||
                    friend.nickname ||
                    friend.username ||
                    "Someone";
                  return (
                    <button
                      key={friendId}
                      type="button"
                      onClick={() => void sendInviteToFriend(friend)}
                      disabled={sendingInviteId === friendId}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px",
                        border: "1px solid rgba(255,255,255,0.07)",
                        borderRadius: 22,
                        background:
                          "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.025))",
                        color: "#fff",
                        marginBottom: 6,
                        textAlign: "left",
                        fontFamily: "inherit",
                      }}
                    >
                      <Avatar
                        src={friend.avatarUrl || friend.avatar_url || ""}
                        alt={name}
                        size="md"
                        userId={friendId}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 15,
                            fontWeight: 800,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {name}
                        </div>
                        <div
                          style={{
                            color: "rgba(255,255,255,0.42)",
                            fontSize: 13,
                            marginTop: 2,
                          }}
                        >
                          @
                          {String(friend.username || "unknown").replace(
                            /^@/,
                            "",
                          )}
                        </div>
                      </div>
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: "50%",
                          background: "linear-gradient(135deg,#d6dde8,#aeb7c2)",
                          color: "#000",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <UserPlus size={17} />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      {/* â”€â”€ MOOD BLOCK MODAL â€” sibling of input, not nested inside it â”€â”€â”€â”€â”€â”€â”€ */}
      {moodBlockModalOpen && (
        <>
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.58)",
              backdropFilter: "blur(12px)",
              zIndex: 200,
              opacity: moodBlockModalVisible ? 1 : 0,
              transition: "opacity 0.2s ease-out",
            }}
            onClick={() => setMoodBlockModalOpen(false)}
          />
          <div
            style={{
              position: "fixed",
              left: 10,
              right: 10,
              bottom: "calc(10px + var(--safe-area-bottom))",
              background:
                "linear-gradient(180deg, rgba(22,22,22,0.98), rgba(5,5,5,0.99))",
              borderRadius: 28,
              padding: "10px 12px 12px",
              zIndex: 201,
              maxHeight: "min(78vh, 620px)",
              overflowY: "auto",
              boxShadow:
                "0 -24px 80px rgba(0,0,0,0.58), inset 0 1px 0 rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.09)",
              transformOrigin: "bottom center",
              opacity: moodBlockModalVisible ? 1 : 0,
              transform: moodBlockModalVisible
                ? "translateY(0) scale(1)"
                : "translateY(34px) scale(0.98)",
              transition:
                "opacity 0.2s ease-out, transform 0.34s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <div
              style={{
                width: 38,
                height: 4,
                borderRadius: 999,
                background: "rgba(255,255,255,0.24)",
                margin: "0 auto 12px",
              }}
            />
            <div
              style={{
                padding: "0 4px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 19,
                    fontWeight: 900,
                    color: "#fff",
                    letterSpacing: "-0.01em",
                  }}
                >
                  Mood Block
                </div>
                <div
                  style={{
                    marginTop: 3,
                    color: "rgba(255,255,255,0.42)",
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                  }}
                >
                  Pick a mood
                </div>
              </div>
              <button
                type="button"
                aria-label="Close mood block"
                onClick={() => setMoodBlockModalOpen(false)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.055)",
                  color: "rgba(255,255,255,0.86)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <X size={17} />
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
                marginBottom: 10,
              }}
            >
              {(
                [
                  {
                    mood: "angry" as const,
                    color: "255,59,48",
                    label: "Angry",
                  },
                  {
                    mood: "crying" as const,
                    color: "0,122,255",
                    label: "Crying",
                  },
                  {
                    mood: "irritated" as const,
                    color: "255,149,0",
                    label: "Irritated",
                  },
                  {
                    mood: "depressed" as const,
                    color: "142,142,147",
                    label: "Depressed",
                  },
                ] as const
              ).map(({ mood, color, label }) => {
                const theme = getMoodTheme(mood);
                return (
                  <button
                    key={mood}
                    onClick={() => {
                      handleMoodBlock(mood);
                      setMoodBlockModalOpen(false);
                    }}
                    style={{
                      position: "relative",
                      overflow: "hidden",
                      background: `linear-gradient(145deg, rgba(${color},0.12), rgba(255,255,255,0.035))`,
                      border: `1px solid rgba(${color},0.28)`,
                      borderRadius: 20,
                      padding: "14px 13px",
                      cursor: "pointer",
                      transition:
                        "transform 0.18s ease, background 0.18s ease, border-color 0.18s ease",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      minHeight: 82,
                      textAlign: "left",
                      WebkitTapHighlightColor: "transparent",
                      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), 0 12px 28px rgba(${color},0.08)`,
                    }}
                    onTouchStart={(e) => {
                      e.currentTarget.style.background = `linear-gradient(145deg, rgba(${color},0.18), rgba(255,255,255,0.055))`;
                      e.currentTarget.style.transform = "scale(0.975)";
                    }}
                    onTouchEnd={(e) => {
                      e.currentTarget.style.background = `linear-gradient(145deg, rgba(${color},0.12), rgba(255,255,255,0.035))`;
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        inset: "-22px -18px auto auto",
                        width: 72,
                        height: 72,
                        borderRadius: "50%",
                        background: `radial-gradient(circle, ${theme.accentGlow}, transparent 68%)`,
                        filter: "blur(5px)",
                        opacity: 0.55,
                        pointerEvents: "none",
                      }}
                    />
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 16,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 30,
                        lineHeight: 1,
                        background: `rgba(${color},0.16)`,
                        border: `1px solid rgba(${color},0.22)`,
                        flexShrink: 0,
                      }}
                    >
                      {moodEmoji(mood)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 15,
                          color: "#fff",
                          fontWeight: 850,
                          letterSpacing: 0,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {label}
                      </div>
                      <div
                        style={{
                          marginTop: 5,
                          color: `rgb(${color})`,
                          fontSize: 10,
                          fontWeight: 900,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {theme.label}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setMoodBlockModalOpen(false)}
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.055)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 18,
                padding: "15px",
                color: "rgba(255,255,255,0.78)",
                fontSize: 15,
                fontWeight: 800,
                cursor: "pointer",
                transition: "all 0.15s ease",
                minHeight: 50,
                WebkitTapHighlightColor: "transparent",
                letterSpacing: 0,
              }}
              onTouchStart={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.085)";
                e.currentTarget.style.transform = "scale(0.98)";
              }}
              onTouchEnd={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.055)";
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {/* â”€â”€ MOOD BLOCK ACTIVE CARD â€” fixed to bottom, always visible â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {currentMoodBlock && (
        <>
          <div
            style={{
              position: "absolute",
              bottom: 18,
              left: 12,
              right: 12,
              zIndex: 40,
              opacity: currentMoodBlockVisible ? 1 : 0,
              transform: currentMoodBlockVisible
                ? "translateY(0) scale(1)"
                : "translateY(36px) scale(0.96)",
              transition:
                "opacity 0.36s ease-out, transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: "-18px 10% 22px",
                borderRadius: 32,
                background: `radial-gradient(circle, ${activeMoodTheme.accentGlow} 0%, transparent 72%)`,
                filter: "blur(26px)",
                opacity: currentMoodBlockVisible ? 1 : 0,
                transition: "opacity 0.55s ease-out 0.08s",
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                position: "relative",
                overflow: "hidden",
                background: activeMoodTheme.panel,
                border: `1px solid ${activeMoodTheme.accentSoft}`,
                borderRadius: 28,
                padding: "18px 18px 16px",
                backdropFilter: "blur(22px)",
                boxShadow: `0 24px 60px rgba(0,0,0,0.46), 0 0 0 1px ${activeMoodTheme.accentSoft}, inset 0 1px 0 rgba(255,255,255,0.08)`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    fontSize: 36,
                    width: 68,
                    height: 68,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.24), ${activeMoodTheme.accentSoft} 45%, rgba(0,0,0,0.14) 100%)`,
                    borderRadius: 22,
                    flexShrink: 0,
                    color: "#fff",
                    boxShadow: `0 10px 30px ${activeMoodTheme.accentGlow}, inset 0 1px 0 rgba(255,255,255,0.18)`,
                    animation: "moodOrbPulse 2.8s ease-in-out infinite",
                  }}
                >
                  {moodEmoji(currentMoodBlock.mood)}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      marginBottom: 10,
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.05)",
                      border: `1px solid ${activeMoodTheme.accentSoft}`,
                      color: activeMoodTheme.accent,
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                    }}
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: activeMoodTheme.accent,
                        boxShadow: `0 0 12px ${activeMoodTheme.accentGlow}`,
                      }}
                    />
                    {activeMoodTheme.label}
                  </div>
                  <div
                    style={{
                      fontSize: 19,
                      fontWeight: 800,
                      color: "#fff",
                      marginBottom: 6,
                      textTransform: "capitalize",
                      letterSpacing: "-0.02em",
                      textShadow: "0 6px 22px rgba(0,0,0,0.34)",
                    }}
                  >
                    {currentMoodBlock.initiatedByName} is{" "}
                    {currentMoodBlock.mood}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "rgba(255,255,255,0.64)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span>â³ Please wait...</span>
                    <span style={{ color: "#666" }}>Â·</span>
                    <MoodBlockTimer endTime={currentMoodBlock.endTime} />
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (currentConversation?.id) {
                      messagingService.clearMoodBlock(currentConversation.id);
                    }
                    setCurrentMoodBlock(null);
                  }}
                  style={{
                    alignSelf: "flex-start",
                    background: "rgba(255,255,255,0.05)",
                    border: `1px solid ${activeMoodTheme.accentSoft}`,
                    borderRadius: 999,
                    padding: "10px 15px",
                    color: activeMoodTheme.accent,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    WebkitTapHighlightColor: "transparent",
                    flexShrink: 0,
                  }}
                  onTouchStart={(e) => {
                    e.currentTarget.style.background =
                      activeMoodTheme.accentSoft;
                    e.currentTarget.style.transform = "scale(0.96)";
                  }}
                  onTouchEnd={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  Skip
                </button>
              </div>

              <div
                style={{
                  height: 6,
                  background: "rgba(255,255,255,0.08)",
                  borderRadius: 999,
                  overflow: "hidden",
                  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.35)",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    background: `linear-gradient(90deg, ${activeMoodTheme.accent}, rgba(255,255,255,0.92))`,
                    borderRadius: 999,
                    transition: "width 1s linear",
                    width: `${progressBarWidth}%`,
                    animation: "moodProgressGlow 2.2s ease-in-out infinite",
                    boxShadow: `0 0 16px ${activeMoodTheme.accentGlow}`,
                  }}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {messageActionTarget && (
        <div
          onClick={() => setMessageActionTarget(null)}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 70,
            background: "rgba(0,0,0,0.42)",
            display: "flex",
            alignItems: "flex-end",
            padding: "0 12px calc(14px + var(--safe-area-bottom))",
            backdropFilter: "blur(8px)",
            animation: "moodBackdropIn 0.18s ease-out",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%",
              borderRadius: 26,
              border: "1px solid rgba(255,255,255,0.1)",
              background:
                "linear-gradient(180deg, rgba(24,24,24,0.96), rgba(8,8,8,0.98))",
              boxShadow:
                "0 24px 80px rgba(0,0,0,0.58), inset 0 1px 0 rgba(255,255,255,0.08)",
              overflow: "hidden",
              transform: "translateY(0)",
            }}
          >
            <div
              style={{
                width: 38,
                height: 4,
                borderRadius: 999,
                background: "rgba(255,255,255,0.22)",
                margin: "10px auto 8px",
              }}
            />
            <div
              style={{
                padding: "8px 18px 14px",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div
                style={{
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: 900,
                  marginBottom: 5,
                }}
              >
                Message options
              </div>
              <div
                style={{
                  color: "rgba(255,255,255,0.48)",
                  fontSize: 13,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {summarizeMessageForReply(messageActionTarget)}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setReplyFromMessage(messageActionTarget);
                setMessageActionTarget(null);
              }}
              style={{
                width: "100%",
                minHeight: 54,
                padding: "0 18px",
                border: "none",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                background: "transparent",
                color: "#e5e7eb",
                fontSize: 16,
                fontWeight: 750,
                textAlign: "left",
              }}
            >
              Reply
            </button>
            <button
              type="button"
              onClick={() => void deleteMessageForMe(messageActionTarget)}
              style={{
                width: "100%",
                minHeight: 54,
                padding: "0 18px",
                border: "none",
                borderBottom:
                  messageActionTarget.from === "me" &&
                  !messageActionTarget.optimistic
                    ? "1px solid rgba(255,255,255,0.06)"
                    : "none",
                background: "transparent",
                color: "#f8fafc",
                fontSize: 16,
                fontWeight: 750,
                textAlign: "left",
              }}
            >
              Delete for me
            </button>
            {messageActionTarget.from === "me" &&
              !messageActionTarget.optimistic && (
                <button
                  type="button"
                  onClick={() =>
                    void deleteMessageForEveryone(messageActionTarget)
                  }
                  style={{
                    width: "100%",
                    minHeight: 54,
                    padding: "0 18px",
                    border: "none",
                    background: "transparent",
                    color: "#ff8a8a",
                    fontSize: 16,
                    fontWeight: 800,
                    textAlign: "left",
                  }}
                >
                  Delete for everyone
                </button>
              )}
            <div style={{ padding: "8px" }}>
              <button
                type="button"
                onClick={() => setMessageActionTarget(null)}
                style={{
                  width: "100%",
                  minHeight: 50,
                  borderRadius: 18,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.82)",
                  fontSize: 15,
                  fontWeight: 800,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {gamesRoomOpen && currentConversation?.id && user?.id && (
        <GamesRoomScreen
          conversationId={currentConversation.id}
          currentUserId={user.id}
          initialSessionId={gamesRoomSessionId}
          participantIds={[
            currentConversation.user1_id,
            currentConversation.user2_id,
            ...(currentConversation.temporary_participant_ids || []),
          ].filter((id): id is string => Boolean(id))}
          otherUser={{
            id:
              currentConversation.other_user?.user_id ||
              currentConversation.other_user?.id ||
              "",
            name:
              currentConversation.other_user?.display_name ||
              currentConversation.other_user?.username ||
              "Someone",
            username: currentConversation.other_user?.username,
            avatarUrl: currentConversation.other_user?.avatar_url,
          }}
          currentUserName={user.displayName || user.username || "You"}
          onClose={() => {
            setGamesRoomOpen(false);
            setGamesRoomSessionId(null);
          }}
        />
      )}

      {photoViewer && (
        <ChatPhotoViewer
          photos={photoViewer.photos}
          index={photoViewer.index}
          onIndexChange={(index) =>
            setPhotoViewer((current) =>
              current ? { ...current, index } : current,
            )
          }
          onClose={() => setPhotoViewer(null)}
        />
      )}
    </div>
  );
}
