"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Gift,
  Heart,
  Lock,
  MessageCircle,
  Mic,
  Music2,
  PartyPopper,
  Play,
  Send,
  Shield,
  Sparkles,
  Trophy,
  Upload,
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore-v2";
import {
  birthdayRoomService,
  type BirthdayDrop,
  type BirthdayDropType,
  type BirthdayReactionKey,
  type BirthdayRoom,
} from "@/middleware/services/birthday-room.service";
import {
  buildLocalMediaPreview,
  uploadOptimizedMedia,
  type LocalMediaPreview,
  type MediaKind,
} from "@/utils/mediaUpload";
import { Avatar } from "../ui/Avatar";

type BirthdayRoomTab = "wishes" | "confessions" | "dares";

const birthdayTabs: Array<{
  id: BirthdayRoomTab;
  label: string;
  short: string;
  accent: string;
}> = [
  { id: "wishes", label: "Wishes", short: "Wish", accent: "#4ade80" },
  {
    id: "confessions",
    label: "Anonymous confessions",
    short: "Confessions",
    accent: "#c084fc",
  },
  {
    id: "dares",
    label: "Birthday dares",
    short: "Birthday dares",
    accent: "#38bdf8",
  },
];

const dropTypes: Array<{
  id: BirthdayDropType;
  label: string;
  short: string;
  tabs: BirthdayRoomTab[];
}> = [
  { id: "wish", label: "Wish", short: "Wish", tabs: ["wishes"] },
  { id: "memory", label: "Memory", short: "Memory", tabs: ["wishes"] },
  { id: "compliment", label: "Compliment", short: "Kind", tabs: ["wishes"] },
  { id: "joke", label: "Inside joke", short: "Joke", tabs: ["wishes"] },
  { id: "dare", label: "Birthday dare", short: "Dare", tabs: ["dares"] },
  {
    id: "confession",
    label: "Anonymous confession",
    short: "Secret",
    tabs: ["confessions"],
  },
];

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function getDropAccent(type: BirthdayDropType) {
  switch (type) {
    case "dare":
      return "#38bdf8";
    case "confession":
    case "anonymous":
      return "#c084fc";
    case "compliment":
      return "#86efac";
    case "joke":
      return "#facc15";
    case "photo":
    case "video":
    case "voice":
      return "#fb7185";
    case "memory":
      return "#4ade80";
    default:
      return "#4ade80";
  }
}

function getDropTab(drop: BirthdayDrop): BirthdayRoomTab {
  if (drop.type === "dare") return "dares";
  if (drop.anonymous || drop.type === "confession" || drop.type === "anonymous") {
    return "confessions";
  }
  return "wishes";
}

function getTabEmptyCopy(tab: BirthdayRoomTab) {
  switch (tab) {
    case "confessions":
      return {
        title: "No anonymous confessions yet",
        body: "Start with something sweet, funny, or secretly overdue. Names stay hidden here.",
        Icon: Lock,
      };
    case "dares":
      return {
        title: "No birthday dares yet",
        body: "Drop a playful challenge the birthday star can accept, prove, and let friends react to.",
        Icon: Trophy,
      };
    default:
      return {
        title: "No wishes yet",
        body: "Leave the first birthday wish, memory, compliment, or inside joke.",
        Icon: Gift,
      };
  }
}

function getComposerPlaceholder(tab: BirthdayRoomTab, lateMode: boolean) {
  if (lateMode) return "Leave a sealed late wish...";
  if (tab === "confessions") {
    return "Drop an anonymous birthday confession...";
  }
  if (tab === "dares") {
    return "Set a birthday dare they can actually complete...";
  }
  return "Drop a wish, memory, compliment, or inside joke...";
}

function BirthdayRoomStyles() {
  return (
    <style>{`
      .birthday-room-screen {
        background:
          radial-gradient(circle at 50% -12%, rgba(251,113,133,0.18), transparent 32%),
          radial-gradient(circle at 12% 18%, rgba(74,222,128,0.14), transparent 28%),
          radial-gradient(circle at 88% 8%, rgba(14,165,233,0.12), transparent 26%),
          linear-gradient(180deg, #060806 0%, #0a0f0a 48%, #030403 100%);
        font-family: var(--font-ui);
      }
      @keyframes birthdayFloatIn {
        from { opacity: 0; transform: translateY(16px) scale(0.985); filter: blur(6px); }
        to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
      }
      @keyframes birthdaySweep {
        0% { transform: translateX(-125%); }
        34% { transform: translateX(125%); }
        100% { transform: translateX(125%); }
      }
      @keyframes birthdayPulse {
        0%, 100% { opacity: 0.56; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.08); }
      }
      @keyframes birthdayConfetti {
        0% { transform: translateY(-8px) rotate(0deg); opacity: 0; }
        20% { opacity: 1; }
        100% { transform: translateY(96px) rotate(145deg); opacity: 0; }
      }
      .birthday-panel {
        animation: birthdayFloatIn 0.48s cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      .birthday-shine::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent);
        animation: birthdaySweep 7s ease-in-out infinite;
        pointer-events: none;
      }
      .birthday-live-dot {
        animation: birthdayPulse 2.2s ease-in-out infinite;
      }
      .birthday-confetti span {
        position: absolute;
        top: -12px;
        width: 5px;
        height: 12px;
        border-radius: 99px;
        animation: birthdayConfetti 4.4s ease-in-out infinite;
      }
    `}</style>
  );
}

function DropCard({
  drop,
  onReact,
  onComment,
  canManageDare,
  onAcceptDare,
  onCompleteDare,
}: {
  drop: BirthdayDrop;
  onReact: (dropId: string, reaction: BirthdayReactionKey) => void;
  onComment: (dropId: string, roomId: string, text: string) => Promise<boolean>;
  canManageDare: boolean;
  onAcceptDare: (dropId: string) => void;
  onCompleteDare: (dropId: string, file: File) => Promise<boolean>;
}) {
  const accentColor = getDropAccent(drop.type);
  const displayName = drop.anonymous ? "Anonymous" : drop.authorDisplayName;
  const username = drop.anonymous ? "birthday secret" : `@${drop.authorUsername}`;
  const showTimeline = getDropTab(drop) === "wishes";
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [proofBusy, setProofBusy] = useState(false);
  const proofInputRef = useRef<HTMLInputElement>(null);

  const submitComment = async () => {
    const nextComment = commentText.trim();
    if (!nextComment || commentBusy) return;

    setCommentBusy(true);
    const saved = await onComment(drop.id, drop.roomId, nextComment);
    if (saved) {
      setCommentText("");
      setCommentOpen(false);
    }
    setCommentBusy(false);
  };

  const handleProofFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || proofBusy) return;

    setProofBusy(true);
    await onCompleteDare(drop.id, file);
    setProofBusy(false);
  };

  return (
    <article
      className={`birthday-panel relative mb-4 ${
        showTimeline ? "flex gap-3" : ""
      }`}
    >
      {showTimeline && (
        <div className="flex w-12 shrink-0 flex-col items-center">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-[18px] border shadow-[0_14px_34px_rgba(0,0,0,0.28)]"
            style={{
              borderColor: `${accentColor}2f`,
              background: `${accentColor}18`,
              color: accentColor,
            }}
          >
            {drop.anonymous ? (
              <span className="text-[15px] font-black">A</span>
            ) : (
              <Avatar
                src={drop.authorAvatarUrl}
                alt={displayName}
                fallbackText={displayName.charAt(0)}
                size={40}
              />
            )}
          </div>
          <div className="mt-2 w-px flex-1 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),transparent)]" />
        </div>
      )}

      <div className="relative min-w-0 flex-1 overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,22,18,0.97),rgba(6,9,8,0.99))] p-3.5 shadow-[0_20px_52px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.68),rgba(14,165,233,0.44),rgba(74,222,128,0))]" />
        <div className="relative z-10">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {!showTimeline && (
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[17px] border"
                  style={{
                    borderColor: `${accentColor}2f`,
                    background: `${accentColor}18`,
                    color: accentColor,
                  }}
                >
                  {drop.anonymous ? (
                    <span className="text-[14px] font-black">A</span>
                  ) : (
                    <Avatar
                      src={drop.authorAvatarUrl}
                      alt={displayName}
                      fallbackText={displayName.charAt(0)}
                      size={36}
                    />
                  )}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-[14px] font-black text-white">
                  {displayName}
                </p>
                <p className="truncate text-[11px] font-semibold text-[#64748b]">
                  {showTimeline
                    ? `${username} - ${formatTime(drop.createdAtMs)}`
                    : username}
                </p>
              </div>
            </div>
          </div>

          {drop.mediaUrl && (
            <div className="mb-3 overflow-hidden rounded-[22px] border border-white/8 bg-black/25">
              {drop.mediaType === "video" ? (
                <div className="relative aspect-[4/3]">
                  <video
                    src={drop.mediaUrl}
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/18 bg-black/42 text-white backdrop-blur-md">
                      <Play size={20} fill="currentColor" />
                    </div>
                  </div>
                </div>
              ) : drop.mediaType === "audio" ? (
                <div className="flex min-h-[96px] items-center gap-3 p-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#4ade80] text-black">
                    <Mic size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-white">Voice note</p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full w-[64%] rounded-full bg-[#4ade80]" />
                    </div>
                  </div>
                </div>
              ) : (
                <img
                  src={drop.mediaUrl}
                  alt="Birthday memory"
                  className="aspect-[4/3] w-full object-cover"
                  loading="lazy"
                />
              )}
            </div>
          )}

          <p className="whitespace-pre-wrap text-[14px] font-semibold leading-relaxed text-[#e2e8f0]">
            {drop.text}
          </p>

          {drop.type === "dare" && (
            <div className="mt-3 rounded-[20px] border border-[#38bdf8]/18 bg-[#38bdf8]/10 p-3">
              <div className="mb-2 text-[#a5f3fc]">
                <span className="text-[11px] font-black uppercase">
                  Birthday dare flow
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-center">
                {[
                  drop.dareStatus === "accepted" || drop.dareStatus === "completed"
                    ? "Accepted"
                    : "Accept",
                  drop.dareStatus === "completed" ? "Proof in" : "Proof",
                  "Vote",
                ].map((step) => (
                  <span
                    key={step}
                    className="rounded-full border border-white/8 bg-black/18 px-2 py-1.5 text-[10px] font-black uppercase text-[#cbd5e1]"
                  >
                    {step}
                  </span>
                ))}
              </div>
              {canManageDare && (drop.dareStatus || "sent") === "sent" && (
                <button
                  type="button"
                  onClick={() => onAcceptDare(drop.id)}
                  className="mt-3 min-h-[38px] w-full rounded-full bg-[#38bdf8] px-4 text-[12px] font-black text-black shadow-[0_12px_26px_rgba(56,189,248,0.22)]"
                >
                  Accept birthday dare
                </button>
              )}
              {canManageDare && drop.dareStatus === "accepted" && (
                <>
                  <input
                    ref={proofInputRef}
                    type="file"
                    accept="image/*,video/*,audio/*"
                    className="hidden"
                    onChange={handleProofFileChange}
                  />
                  <button
                    type="button"
                    onClick={() => proofInputRef.current?.click()}
                    disabled={proofBusy}
                    className="mt-3 min-h-[38px] w-full rounded-full bg-[linear-gradient(135deg,#38bdf8,#4ade80)] px-4 text-[12px] font-black text-black shadow-[0_12px_26px_rgba(56,189,248,0.22)] disabled:opacity-60"
                  >
                    {proofBusy ? "Uploading proof..." : "Upload birthday dare proof"}
                  </button>
                </>
              )}
              {drop.dareStatus === "completed" && drop.proofMediaUrl && (
                <div className="mt-3 overflow-hidden rounded-[18px] border border-[#38bdf8]/18 bg-black/24">
                  {drop.proofMediaType === "video" ? (
                    <video
                      src={drop.proofMediaUrl}
                      className="aspect-[4/3] w-full object-cover"
                      controls
                      playsInline
                      preload="metadata"
                    />
                  ) : drop.proofMediaType === "audio" ? (
                    <audio src={drop.proofMediaUrl} controls className="w-full p-3" />
                  ) : (
                    <img
                      src={drop.proofMediaUrl}
                      alt="Birthday dare proof"
                      className="aspect-[4/3] w-full object-cover"
                      loading="lazy"
                    />
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onReact(drop.id, "heart")}
              className="flex min-h-[34px] items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.04] px-3 text-[11px] font-black text-[#cbd5e1]"
              aria-label="Like"
            >
              <Heart size={13} />
              {drop.reactions.heart || 0}
            </button>
            <button
              type="button"
              onClick={() => setCommentOpen((value) => !value)}
              className="flex min-h-[34px] items-center gap-1.5 rounded-full border border-white/8 bg-white/[0.04] px-3 text-[11px] font-black text-[#cbd5e1]"
              aria-label="Comments"
            >
              <MessageCircle size={13} />
              {drop.replyCount}
            </button>
          </div>

          {commentOpen && (
            <div className="mt-3 flex items-end gap-2 rounded-[20px] border border-white/8 bg-black/24 p-2">
              <textarea
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                placeholder="Add a comment..."
                maxLength={360}
                className="max-h-20 min-h-[38px] flex-1 resize-none bg-transparent text-[13px] font-semibold leading-snug text-white outline-none placeholder:text-[#64748b]"
              />
              <button
                type="button"
                onClick={submitComment}
                disabled={commentBusy || !commentText.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#4ade80] text-black disabled:bg-[#161a16] disabled:text-[#64748b]"
                aria-label="Send comment"
              >
                {commentBusy ? <Sparkles size={16} /> : <Send size={16} />}
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function BirthdayRoomScreen({
  onBack,
  onOpenPartyRoom,
}: {
  onBack: () => void;
  onOpenPartyRoom: (room: BirthdayRoom, drops: BirthdayDrop[]) => void;
}) {
  const { user } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [room, setRoom] = useState<BirthdayRoom | null>(null);
  const [drops, setDrops] = useState<BirthdayDrop[]>([]);
  const [activeTab, setActiveTab] = useState<BirthdayRoomTab>("wishes");
  const [dropType, setDropType] = useState<BirthdayDropType>("wish");
  const [text, setText] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPreview, setSelectedPreview] =
    useState<LocalMediaPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [composerOpen, setComposerOpen] = useState(false);
  const composerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const nextRoom = birthdayRoomService.buildRoomForUser(user as any);
    setRoom(nextRoom);

    birthdayRoomService.ensureRoom(nextRoom).catch((roomError) => {
      console.warn("Birthday room will run in local preview mode:", roomError);
    });

    const unsubscribe = birthdayRoomService.subscribeToDrops(
      nextRoom.id,
      (remoteDrops) => {
        setDrops(remoteDrops);
      },
      () => undefined,
    );

    return unsubscribe;
  }, [user]);

  const roomActive = room?.status === "active" || room?.status === "preview";
  const lateMode = room ? now >= room.endsAtMs && room.status !== "preview" : false;
  const timeLeft = room ? formatCountdown(room.endsAtMs - now) : "24h";

  const dropsByTab = useMemo(
    () =>
      drops.reduce<Record<BirthdayRoomTab, BirthdayDrop[]>>(
        (groups, drop) => {
          groups[getDropTab(drop)].push(drop);
          return groups;
        },
        { wishes: [], confessions: [], dares: [] },
      ),
    [drops],
  );

  const sortedDrops = useMemo(
    () =>
      [...dropsByTab[activeTab]].sort(
        (a, b) =>
          b.reactionCount + b.replyCount - (a.reactionCount + a.replyCount) ||
          a.createdAtMs - b.createdAtMs,
      ),
    [activeTab, dropsByTab],
  );

  const firstWish = useMemo(
    () =>
      dropsByTab.wishes.reduce<BirthdayDrop | null>(
        (earliest, drop) =>
          !earliest || drop.createdAtMs < earliest.createdAtMs ? drop : earliest,
        null,
      ),
    [dropsByTab],
  );

  const activeFriendPreview = useMemo(() => {
    const friends = new Map<
      string,
      {
        id: string;
        name: string;
        username: string;
        avatarUrl: string;
      }
    >();

    drops.forEach((drop) => {
      if (drop.anonymous || drop.authorId === user?.id || friends.has(drop.authorId)) {
        return;
      }

      friends.set(drop.authorId, {
        id: drop.authorId,
        name: drop.authorDisplayName || drop.authorUsername || "Friend",
        username: drop.authorUsername,
        avatarUrl: drop.authorAvatarUrl,
      });
    });

    return Array.from(friends.values());
  }, [drops, user?.id]);

  const joinedFriendCount = Math.max(
    room?.participantCount || 0,
    activeFriendPreview.length,
  );
  const friendActivityLabel =
    joinedFriendCount > 0
      ? `${joinedFriendCount} friend${joinedFriendCount === 1 ? "" : "s"} joined today`
      : "Friends are arriving today";

  const availableDropTypes = useMemo(
    () => dropTypes.filter((item) => item.tabs.includes(activeTab)),
    [activeTab],
  );

  const tabEmptyCopy = getTabEmptyCopy(activeTab);
  const EmptyIcon = tabEmptyCopy.Icon;
  const composerCtaLabel =
    activeTab === "confessions"
      ? "Drop a secret"
      : activeTab === "dares"
        ? "Add birthday dare"
        : lateMode
          ? "Leave sealed wish"
          : "Drop a wish";
  const composerCtaHint =
    activeTab === "confessions"
      ? "Open the anonymous input and send it safely."
      : activeTab === "dares"
        ? "Challenge them with something birthday-worthy."
        : lateMode
          ? "Send a private late wish for the memory capsule."
          : "Write, attach media, or send it anonymously.";

  const handleOpenComposer = () => {
    setComposerOpen(true);
    setError(null);
    window.setTimeout(() => {
      composerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
  };

  useEffect(() => {
    if (activeTab === "confessions") {
      setDropType("confession");
      setAnonymous(true);
      return;
    }

    if (activeTab === "dares") {
      setDropType("dare");
      setAnonymous(false);
      return;
    }

    setAnonymous(false);
    setDropType((current) =>
      dropTypes.some((item) => item.id === current && item.tabs.includes("wishes"))
        ? current
        : "wish",
    );
  }, [activeTab]);

  const handlePickMedia = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const preview = await buildLocalMediaPreview(file, "birthday-room");
      setSelectedFile(file);
      setSelectedPreview(preview);
      if (activeTab === "wishes") {
        if (preview.type === "image") setDropType("photo");
        if (preview.type === "video") setDropType("video");
        if (preview.type === "audio") setDropType("voice");
      }
    } catch (fileError) {
      setError(
        fileError instanceof Error
          ? fileError.message
          : "Could not read that file.",
      );
    } finally {
      event.target.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!user?.id || !room || busy) return;

    setBusy(true);
    setError(null);

    const createdAtMs = Date.now();
    const effectiveAnonymous = activeTab === "confessions" ? true : anonymous;
    const effectiveDropType =
      activeTab === "confessions"
        ? "confession"
        : activeTab === "dares"
          ? "dare"
          : dropType;
    const optimisticDrop: BirthdayDrop = {
      id: `local-${createdAtMs}`,
      roomId: room.id,
      birthdayUserId: room.birthdayUserId,
      authorId: user.id,
      authorUsername: user.username || "you",
      authorDisplayName: user.displayName || user.username || "You",
      authorAvatarUrl: user.avatar || "",
      type: effectiveDropType,
      text: text.trim(),
      mediaUrl: selectedPreview?.url,
      mediaType: selectedPreview?.type,
      anonymous: effectiveAnonymous,
      sealed: lateMode,
      reactions: { heart: 0, laugh: 0, cry: 0, fire: 0 },
      reactionCount: 0,
      replyCount: 0,
      createdAtMs,
      clientOnly: true,
    };

    setDrops((current) => [...current, optimisticDrop]);
    setText("");
    setSelectedFile(null);
    setSelectedPreview(null);
    setDropType(
      activeTab === "confessions"
        ? "confession"
        : activeTab === "dares"
          ? "dare"
          : "wish",
    );

    try {
      let mediaUrl: string | undefined;
      let mediaType: MediaKind | undefined;

      if (selectedFile) {
        const uploaded = await uploadOptimizedMedia({
          source: selectedFile,
          userId: user.id,
          context: "birthday-room",
        });
        mediaUrl = uploaded.url;
        mediaType = uploaded.mediaKind;
      }

      const result = await birthdayRoomService.addDrop(room, {
        authorId: user.id,
        authorUsername: user.username || "you",
        authorDisplayName: user.displayName || user.username || "You",
        authorAvatarUrl: user.avatar || "",
        type:
          activeTab === "wishes" && mediaType === "image"
            ? "photo"
            : activeTab === "wishes" && mediaType === "video"
              ? "video"
              : activeTab === "wishes" && mediaType === "audio"
                ? "voice"
                : effectiveDropType,
        text: optimisticDrop.text,
        anonymous: effectiveAnonymous,
        sealed: lateMode,
        mediaUrl,
        mediaType,
      });

      if (!result.success || !result.drop) {
        throw new Error(result.error || "Could not drop this birthday moment.");
      }

      setDrops((current) =>
        current.map((drop) =>
          drop.id === optimisticDrop.id ? result.drop! : drop,
        ),
      );
      setComposerOpen(false);
    } catch (submitError) {
      setDrops((current) =>
        current.filter((drop) => drop.id !== optimisticDrop.id),
      );
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not drop this birthday moment.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleReact = (dropId: string, reaction: BirthdayReactionKey) => {
    const previousDrops = drops;
    setDrops((current) =>
      current.map((drop) =>
        drop.id === dropId
          ? {
              ...drop,
              reactions: {
                ...drop.reactions,
                [reaction]: (drop.reactions[reaction] || 0) + 1,
              },
              reactionCount: drop.reactionCount + 1,
            }
          : drop,
      ),
    );

    if (!dropId.startsWith("seed") && !dropId.startsWith("local")) {
      const reactedDrop = drops.find((drop) => drop.id === dropId);
      if (reactedDrop) {
        void birthdayRoomService
          .reactToDrop(dropId, reactedDrop.roomId, reaction)
          .then((result) => {
            if (!result.success) {
              setDrops(previousDrops);
              setError(result.error || "Could not react right now.");
            }
          });
      }
    }
  };

  const handleComment = async (dropId: string, roomId: string, text: string) => {
    if (dropId.startsWith("seed") || dropId.startsWith("local")) {
      setDrops((current) =>
        current.map((drop) =>
          drop.id === dropId ? { ...drop, replyCount: drop.replyCount + 1 } : drop,
        ),
      );
      return true;
    }

    const result = await birthdayRoomService.commentOnDrop(dropId, roomId, text);
    if (result.success) {
      setDrops((current) =>
        current.map((drop) =>
          drop.id === dropId ? { ...drop, replyCount: drop.replyCount + 1 } : drop,
        ),
      );
      return true;
    }

    setError(result.error || "Could not comment right now.");
    return false;
  };

  const handleAcceptBirthdayDare = (dropId: string) => {
    const previousDrops = drops;
    setDrops((current) =>
      current.map((drop) =>
        drop.id === dropId ? { ...drop, dareStatus: "accepted" } : drop,
      ),
    );

    if (!dropId.startsWith("seed") && !dropId.startsWith("local")) {
      void birthdayRoomService.acceptBirthdayDare(dropId).then((result) => {
        if (!result.success) {
          setDrops(previousDrops);
          setError(result.error || "Could not accept this birthday dare.");
        }
      });
    }
  };

  const handleCompleteBirthdayDare = async (dropId: string, file: File) => {
    if (!user?.id) return false;
    const previousDrops = drops;

    try {
      const preview = await buildLocalMediaPreview(file, "birthday-room");
      if (!["image", "video", "audio"].includes(preview.type)) {
        throw new Error("Use a photo, video, or voice proof.");
      }

      const uploaded = await uploadOptimizedMedia({
        source: file,
        userId: user.id,
        context: "birthday-room",
      });

      setDrops((current) =>
        current.map((drop) =>
          drop.id === dropId
            ? {
                ...drop,
                dareStatus: "completed",
                proofMediaUrl: uploaded.url,
                proofMediaType: uploaded.mediaKind,
              }
            : drop,
        ),
      );

      const result = await birthdayRoomService.completeBirthdayDare(dropId, {
        mediaUrl: uploaded.url,
        mediaType: uploaded.mediaKind,
      });

      if (!result.success) {
        throw new Error(result.error || "Could not complete this birthday dare.");
      }

      return true;
    } catch (completeError) {
      setDrops(previousDrops);
      setError(
        completeError instanceof Error
          ? completeError.message
          : "Could not complete this birthday dare.",
      );
      return false;
    }
  };

  return (
    <div className="screen-container birthday-room-screen flex flex-col">
      <BirthdayRoomStyles />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <div
        className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4"
        style={{
          paddingTop: "calc(var(--safe-area-top) + 12px)",
          paddingBottom: "calc(var(--safe-area-bottom) + 28px)",
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorY: "contain",
        }}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] border border-white/8 bg-white/[0.04] text-[#94a3b8] shadow-[0_18px_44px_rgba(0,0,0,0.32)]"
              aria-label="Back"
            >
              <ArrowLeft size={21} />
            </button>
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[#fb7185]/20 bg-[#fb7185]/10 px-3 py-1 text-[10px] font-black uppercase text-[#fecdd3]">
                <span className="birthday-live-dot h-2 w-2 rounded-full bg-[#fb7185]" />
                Birthday room
              </div>
              <h1 className="truncate text-[31px] font-black leading-none text-white">
                {room?.birthdayDisplayName || "Birthday"} Live
              </h1>
            </div>
          </div>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] border border-white/8 bg-white/[0.04] text-[#fb7185] shadow-[0_18px_44px_rgba(0,0,0,0.32)]">
            <Gift size={24} />
          </div>
        </div>

        <section className="birthday-panel relative mb-4 overflow-hidden rounded-[32px] border border-white/8 bg-[radial-gradient(circle_at_22%_-22%,rgba(251,113,133,0.2),transparent_36%),radial-gradient(circle_at_92%_10%,rgba(74,222,128,0.12),transparent_34%),linear-gradient(180deg,rgba(18,24,18,0.97),rgba(7,10,8,0.99))] p-4 shadow-[0_28px_78px_rgba(0,0,0,0.46),inset_0_1px_0_rgba(255,255,255,0.055)]">
          <div className="birthday-confetti pointer-events-none absolute inset-0 overflow-hidden">
            {[12, 28, 45, 63, 78, 91].map((left, index) => (
              <span
                key={left}
                style={{
                  left: `${left}%`,
                  background: ["#4ade80", "#38bdf8", "#fb7185", "#facc15"][
                    index % 4
                  ],
                  animationDelay: `${index * 0.52}s`,
                }}
              />
            ))}
          </div>
          <div className="relative z-10 flex items-center gap-4">
            <div className="rounded-full bg-[linear-gradient(135deg,#fb7185,#4ade80,#38bdf8)] p-[3px]">
              <Avatar
                src={room?.birthdayAvatarUrl || user?.avatar || ""}
                alt={room?.birthdayDisplayName || "Birthday user"}
                size={82}
                userId={room?.birthdayUserId || user?.id}
                username={room?.birthdayUsername || user?.username}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase text-[#94a3b8]">
                {lateMode ? "Private capsule" : "24-hour live room"}
              </p>
              <p className="mt-1 text-[24px] font-black leading-tight text-white">
                {lateMode ? "Room locked" : `${timeLeft} left`}
              </p>
            </div>
          </div>

          <div className="relative z-10 mt-4 flex items-center gap-3 rounded-[22px] border border-white/8 bg-black/22 px-3 py-2.5">
            <div className="flex shrink-0 -space-x-2">
              {activeFriendPreview.length > 0
                ? activeFriendPreview.slice(0, 4).map((friend) => (
                    <div
                      key={friend.id}
                      className="rounded-full border-2 border-[#10160f] bg-[#10160f]"
                    >
                      <Avatar
                        src={friend.avatarUrl}
                        alt={friend.name}
                        fallbackText={friend.name.charAt(0)}
                        size={30}
                        username={friend.username}
                        userId={friend.id}
                      />
                    </div>
                  ))
                : [0, 1, 2].map((index) => (
                    <div
                      key={index}
                      className="flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-[#10160f] bg-[linear-gradient(135deg,#4ade80,#38bdf8,#fb7185)] text-[10px] font-black text-black"
                    >
                      {index + 1}
                    </div>
                  ))}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-black text-white">
                {friendActivityLabel}
              </p>
              <p className="truncate text-[11px] font-semibold text-[#94a3b8]">
                Live wishes, secrets, and dares will stack here all day
              </p>
            </div>
          </div>
        </section>

        <section className="birthday-panel birthday-shine relative mb-4 overflow-hidden rounded-[30px] border border-[#facc15]/18 bg-[radial-gradient(circle_at_18%_0%,rgba(250,204,21,0.2),transparent_34%),radial-gradient(circle_at_92%_12%,rgba(251,113,133,0.16),transparent_28%),linear-gradient(180deg,rgba(18,20,14,0.97),rgba(6,9,8,0.99))] p-4 shadow-[0_24px_64px_rgba(0,0,0,0.42)]">
          <div className="pointer-events-none absolute inset-0 opacity-60">
            {[9, 24, 39, 56, 73, 88].map((left, index) => (
              <span
                key={left}
                className="absolute top-[-12px] h-12 w-1.5 rounded-full"
                style={{
                  left: `${left}%`,
                  background: ["#4ade80", "#38bdf8", "#fb7185", "#facc15"][
                    index % 4
                  ],
                  transform: `rotate(${index % 2 ? 22 : -18}deg)`,
                }}
              />
            ))}
          </div>
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] bg-[#facc15] text-black shadow-[0_16px_40px_rgba(250,204,21,0.26)]">
              <PartyPopper size={25} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase text-[#fde68a]">
                Separate live room
              </p>
              <h2 className="mt-1 truncate text-[20px] font-black text-white">
                Open Party Room
              </h2>
              <p className="mt-1 line-clamp-2 text-[12px] font-semibold leading-snug text-[#94a3b8]">
                Jump into the live floor with stickman friends, party music,
                confetti, cake, hearts, and screenshot moments.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (room) {
                onOpenPartyRoom(room, drops);
              }
            }}
            disabled={!roomActive}
            className="relative z-10 mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#facc15,#fb7185)] px-4 text-[13px] font-black uppercase text-black shadow-[0_16px_38px_rgba(251,113,133,0.22)] disabled:bg-none disabled:bg-white/[0.06] disabled:text-[#64748b] disabled:shadow-none"
          >
            <Music2 size={16} />
            Enter party
          </button>
        </section>

        <section className="birthday-panel mb-4 grid grid-cols-3 gap-2">
          <div className="rounded-[24px] border border-[#4ade80]/18 bg-[#4ade80]/10 p-3">
            <div className="mb-2 flex items-center gap-2 text-[#86efac]">
              <Gift size={15} />
              <span className="text-[11px] font-black uppercase">
                Wishes
              </span>
            </div>
            <p className="truncate text-[14px] font-black text-white">
              {dropsByTab.wishes.length}
            </p>
          </div>
          <div className="rounded-[24px] border border-[#c084fc]/18 bg-[#c084fc]/10 p-3">
            <div className="mb-2 flex items-center gap-2 text-[#e9d5ff]">
              <Lock size={15} />
              <span className="text-[11px] font-black uppercase">
                Secrets
              </span>
            </div>
            <p className="truncate text-[14px] font-black text-white">
              {dropsByTab.confessions.length}
            </p>
          </div>
          <div className="rounded-[24px] border border-[#38bdf8]/18 bg-[#38bdf8]/10 p-3">
            <div className="mb-2 flex items-center gap-2 text-[#a5f3fc]">
              <Trophy size={15} />
              <span className="text-[11px] font-black uppercase">
                Dares
              </span>
            </div>
            <p className="truncate text-[14px] font-black text-white">
              {dropsByTab.dares.length}
            </p>
          </div>
        </section>

        <div className="birthday-panel sticky top-2 z-20 mb-4 rounded-full border border-white/8 bg-[linear-gradient(180deg,rgba(21,27,21,0.94),rgba(10,14,10,0.98))] p-1.5 shadow-[0_18px_46px_rgba(0,0,0,0.32)] backdrop-blur-xl">
          <div className="grid grid-cols-3 gap-1">
            {birthdayTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[36px] rounded-full px-1.5 text-[10.5px] font-black transition-all ${
                  activeTab === tab.id
                    ? "text-black shadow-[0_10px_26px_rgba(74,222,128,0.22)]"
                    : "text-[#94a3b8]"
                }`}
                style={{
                  background: activeTab === tab.id ? tab.accent : "transparent",
                }}
              >
                {tab.short}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "wishes" && firstWish && (
          <section className="birthday-panel relative mb-4 overflow-hidden rounded-[24px] bg-[linear-gradient(135deg,#facc15,#fb7185_48%,#38bdf8)] p-[1px] shadow-[0_18px_44px_rgba(251,113,133,0.16),0_16px_40px_rgba(0,0,0,0.3)]">
            <div className="relative overflow-hidden rounded-[23px] bg-[linear-gradient(180deg,rgba(18,20,14,0.98),rgba(6,9,8,0.99))] px-4 py-3">
              <div className="pointer-events-none absolute left-[-14px] top-1/2 h-7 w-7 -translate-y-1/2 rounded-full bg-[#060906]" />
              <div className="pointer-events-none absolute right-[-14px] top-1/2 h-7 w-7 -translate-y-1/2 rounded-full bg-[#060906]" />
              <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(250,204,21,0.75),rgba(251,113,133,0.65),transparent)]" />
              <p className="relative z-10 truncate text-center text-[13px] font-black uppercase text-[#fff7ed]">
                First wish by {firstWish.authorDisplayName || "a friend"}
              </p>
            </div>
          </section>
        )}

        {sortedDrops.length === 0 ? (
          <section className="birthday-panel mb-4 rounded-[28px] border border-white/8 bg-white/[0.035] px-5 py-8 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-[22px] border border-white/8 bg-black/24 text-[#94a3b8]">
              <EmptyIcon size={22} />
            </div>
            <p className="text-[16px] font-black text-white">
              {tabEmptyCopy.title}
            </p>
            <p className="mx-auto mt-2 max-w-xs text-[13px] font-semibold leading-relaxed text-[#94a3b8]">
              {tabEmptyCopy.body}
            </p>
          </section>
        ) : (
        <section>
          {sortedDrops.map((drop) => (
            <DropCard
              key={drop.id}
              drop={drop}
              onReact={handleReact}
              onComment={handleComment}
              canManageDare={drop.birthdayUserId === user?.id}
              onAcceptDare={handleAcceptBirthdayDare}
              onCompleteDare={handleCompleteBirthdayDare}
            />
          ))}
        </section>
        )}

        <section
          ref={composerRef}
          className="birthday-panel mb-6 rounded-[30px] bg-[linear-gradient(180deg,rgba(15,22,18,0.96),rgba(7,10,8,0.98))] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.34)]"
        >
          {!composerOpen ? (
            <button
              type="button"
              onClick={handleOpenComposer}
              disabled={!roomActive}
              className="flex min-h-[72px] w-full items-center gap-3 rounded-[24px] border border-[#4ade80]/18 bg-[radial-gradient(circle_at_18%_0%,rgba(74,222,128,0.14),transparent_32%),rgba(255,255,255,0.04)] px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] disabled:border-white/8 disabled:bg-white/[0.035] disabled:text-[#64748b]"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[19px] bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-black shadow-[0_12px_30px_rgba(74,222,128,0.22)]">
                <Send size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-black text-white">
                  {composerCtaLabel}
                </span>
                <span className="mt-1 block text-[12px] font-semibold leading-snug text-[#94a3b8]">
                  {composerCtaHint}
                </span>
              </span>
            </button>
          ) : (
            <>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase text-[#86efac]">
                    Birthday drop
                  </p>
                  <h3 className="mt-1 text-[17px] font-black text-white">
                    {composerCtaLabel}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setComposerOpen(false)}
                  className="shrink-0 rounded-full border border-white/8 bg-white/[0.04] px-3 py-2 text-[11px] font-black uppercase text-[#94a3b8]"
                >
                  Close
                </button>
              </div>

              {error && (
                <div className="mb-2 rounded-[18px] border border-red-400/20 bg-red-500/10 px-3 py-2 text-[12px] font-bold text-red-200">
                  {error}
                </div>
              )}

              <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
                {availableDropTypes.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setDropType(item.id)}
                    className={`shrink-0 rounded-full border px-3 py-2 text-[11px] font-black uppercase ${
                      dropType === item.id
                        ? "border-[#4ade80]/30 bg-[#4ade80] text-black"
                        : "border-white/8 bg-white/[0.04] text-[#94a3b8]"
                    }`}
                  >
                    {item.short}
                  </button>
                ))}
              </div>

              {selectedPreview && (
                <div className="mb-2 flex items-center gap-3 rounded-[20px] border border-white/8 bg-white/[0.04] p-2">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[16px] bg-black/30 text-[#86efac]">
                    {selectedPreview.type === "image" ? (
                      <img
                        src={selectedPreview.url}
                        alt="Selected media"
                        className="h-full w-full object-cover"
                      />
                    ) : selectedPreview.type === "video" ? (
                      <Play size={19} />
                    ) : (
                      <Mic size={19} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-black capitalize text-white">
                      {selectedPreview.type} attached
                    </p>
                    <p className="text-[11px] font-bold text-[#64748b]">
                      {selectedPreview.sizeLabel}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setSelectedPreview(null);
                    }}
                    className="rounded-full border border-white/8 px-3 py-1.5 text-[11px] font-black text-[#94a3b8]"
                  >
                    Remove
                  </button>
                </div>
              )}

              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={handlePickMedia}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[19px] border border-white/8 bg-white/[0.045] text-[#86efac]"
                  aria-label="Add media"
                >
                  <Upload size={20} />
                </button>

                <div className="min-w-0 flex-1 rounded-[22px] border border-white/8 bg-black/26 px-3.5 py-2">
                  <textarea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder={getComposerPlaceholder(activeTab, lateMode)}
                    maxLength={900}
                    className="max-h-24 min-h-[40px] w-full resize-none bg-transparent text-[14px] font-semibold leading-snug text-white outline-none placeholder:text-[#64748b]"
                  />
                  <div className="mt-1 flex items-center justify-between">
                    {activeTab !== "wishes" ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (activeTab !== "confessions") {
                            setAnonymous((value) => !value);
                          }
                        }}
                        disabled={activeTab === "confessions"}
                        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                          activeTab === "confessions" || anonymous
                            ? "bg-[#c084fc]/16 text-[#e9d5ff]"
                            : "bg-white/[0.045] text-[#94a3b8]"
                        }`}
                      >
                        <Shield size={11} />
                        {activeTab === "confessions"
                          ? "Always anonymous"
                          : "Anonymous"}
                      </button>
                    ) : (
                      <span />
                    )}
                    <span className="text-[10px] font-bold text-[#64748b]">
                      {text.length}/900
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={busy || (!text.trim() && !selectedFile) || !roomActive}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-black shadow-[0_12px_34px_rgba(74,222,128,0.3)] disabled:bg-none disabled:bg-[#161a16] disabled:text-[#64748b] disabled:shadow-none"
                  aria-label="Send birthday drop"
                >
                  {busy ? <Sparkles size={19} /> : <Send size={19} />}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
