"use client";

import { getChatSource } from "@/lib/chatContext";
import { ChatSourceQuote } from "../circles/CircleChatScreen";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronRight,
  Gift,
  Handshake,
  Laugh,
  Sparkles,
  Trophy,
  UserRound,
  Users,
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore-v2";
import {
  type Friend,
  friendsService,
} from "@/middleware/services/friends.service";
import { type PredictionSubject } from "@/stores/usePredictionStore";
import { type DealScope, useDealStore } from "@/stores/useDealStore";
import { Avatar } from "../ui/Avatar";

function getFriendId(friend: Friend) {
  return friend.user_id || friend.id || "";
}

function getFriendName(friend: Friend) {
  return friend.display_name || friend.username || "Friend";
}

function getFriendAvatar(friend: Friend) {
  return friend.avatar_url || "";
}

function defaultResolutionValue() {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  date.setHours(21, 0, 0, 0);
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function safeResolutionIso(value: string) {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
    return parsed.toISOString();
  }
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

export function CreateDealScreen({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated?: () => void;
}) {
  const { user } = useAuthStore();
  const createDeal = useDealStore((state) => state.createDeal);
  const [scope, setScope] = useState<DealScope>("self");
  const [selectedFriendId, setSelectedFriendId] = useState("");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [event, setEvent] = useState(() => getChatSource()?.body.slice(0, 280) || "");
  const [winOutcome, setWinOutcome] = useState("");
  const [loseOutcome, setLoseOutcome] = useState("");
  const [resolutionDate, setResolutionDate] = useState(defaultResolutionValue);
  const [status, setStatus] = useState<"idle" | "sending" | "posted">("idle");

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    friendsService
      .getFriends(user.id)
      .then((items) => {
        if (!cancelled) setFriends(items);
      })
      .catch(() => {
        if (!cancelled) setFriends([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingFriends(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const selectedFriend = useMemo(
    () => friends.find((friend) => getFriendId(friend) === selectedFriendId),
    [friends, selectedFriendId],
  );

  const subject = useMemo<PredictionSubject | null>(() => {
    if (scope === "self") return { type: "event", name: "myself" };
    if (scope === "group") return { type: "group", name: "The group" };
    if (scope === "crew") return { type: "group", name: "The crew" };
    if (!selectedFriend) return null;
    return {
      type: "friend",
      id: getFriendId(selectedFriend),
      name: getFriendName(selectedFriend),
      username: selectedFriend.username,
      avatar: getFriendAvatar(selectedFriend),
    };
  }, [scope, selectedFriend]);

  const [submitError, setSubmitError] = useState("");
  const canPost =
    status === "idle" &&
    Boolean(user?.id) &&
    Boolean(subject) &&
    event.trim().length > 0 &&
    winOutcome.trim().length > 0 &&
    loseOutcome.trim().length > 0 &&
    resolutionDate.trim().length > 0;

  const handleSubmit = async () => {
    if (!user?.id || !subject || !canPost) return;
    setStatus("sending");
    setSubmitError("");
    try {
    await createDeal({
      scope,
      subject,
      event,
      winOutcome,
      loseOutcome,
      resolutionDate: safeResolutionIso(resolutionDate),
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
    } catch (error) {
      setStatus("idle");
      setSubmitError(error instanceof Error ? error.message : "Could not save. Try again.");
    }
  };

  return (
    <div className="deal-create-screen h-dvh overflow-y-auto overscroll-contain text-white">
      <style>{`
        .deal-create-screen {
          background:
            radial-gradient(circle at 50% -14%, rgba(74,222,128,0.18), transparent 34%),
            radial-gradient(circle at 12% 16%, rgba(34,211,238,0.12), transparent 28%),
            radial-gradient(circle at 92% 8%, rgba(250,204,21,0.1), transparent 24%),
            linear-gradient(180deg, #050806 0%, #071411 48%, #030403 100%);
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
            <p className="m-0 text-[11px] font-black uppercase tracking-[0.18em] text-[#86efac]">
              Deal
            </p>
            <h1 className="m-0 text-[28px] font-black leading-none">
              Make it count
            </h1>
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,26,22,0.94),rgba(6,10,8,0.98))] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.06)]">
            <div className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] text-white/42">
              <Handshake size={15} className="text-[#86efac]" />
              Who is this for?
            </div>
            <div className="grid grid-cols-2 gap-2">
              {([
                ["self", UserRound, "Myself"],
                ["friend", Gift, "Friend"],
                ["group", Users, "Group"],
                ["crew", Sparkles, "Crew"],
              ] as const).map(([itemScope, Icon, label]) => (
                <button
                  key={itemScope}
                  type="button"
                  onClick={() => setScope(itemScope)}
                  className={`flex items-center gap-2 rounded-[18px] border px-3 py-3 text-left text-[13px] font-black transition-all ${
                    scope === itemScope
                      ? "border-[#4ade80]/36 bg-[#4ade80]/12 text-white"
                      : "border-white/8 bg-white/[0.035] text-white/52"
                  }`}
                >
                  <Icon size={17} className="text-[#86efac]" />
                  {label}
                </button>
              ))}
            </div>

            {scope === "friend" && (
              <div
                className="mt-3 max-h-[240px] space-y-2 overflow-y-auto pr-1"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                {loadingFriends ? (
                  <div className="rounded-[18px] border border-white/8 bg-white/[0.035] px-4 py-4 text-sm font-bold text-white/40">
                    Loading friends...
                  </div>
                ) : friends.length > 0 ? (
                  friends.map((friend) => {
                    const friendId = getFriendId(friend);
                    const selected = friendId === selectedFriendId;
                    return (
                      <button
                        key={friendId}
                        type="button"
                        onClick={() => setSelectedFriendId(friendId)}
                        className={`flex w-full items-center gap-3 rounded-[20px] border px-3 py-3 text-left transition-all ${
                          selected
                            ? "border-[#38bdf8]/36 bg-[#38bdf8]/12"
                            : "border-white/8 bg-white/[0.035]"
                        }`}
                      >
                        <Avatar
                          src={getFriendAvatar(friend)}
                          alt={getFriendName(friend)}
                          size={38}
                          fallbackText={getFriendName(friend).charAt(0)}
                          userId={friendId}
                          username={friend.username}
                          disableRealtime
                        />
                        <div className="min-w-0 flex-1">
                          <p className="m-0 truncate text-sm font-black text-white">
                            {getFriendName(friend)}
                          </p>
                          <p className="m-0 truncate text-xs font-bold text-white/35">
                            @{friend.username || "friend"}
                          </p>
                        </div>
                        {selected ? (
                          <Check size={18} className="text-[#38bdf8]" />
                        ) : (
                          <ChevronRight size={17} className="text-white/24" />
                        )}
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-[18px] border border-white/8 bg-white/[0.035] px-4 py-4 text-sm font-bold text-white/40">
                    No friends loaded yet.
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,26,22,0.94),rgba(6,10,8,0.98))] p-4 shadow-[0_18px_54px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="mb-3 text-[12px] font-black uppercase tracking-[0.14em] text-white/42">
              Future outcome
            </div>
            <textarea
              value={event}
              onChange={(e) => setEvent(e.target.value)}
              placeholder="If I pass this exam..."
              maxLength={160}
              className="min-h-[108px] w-full resize-none rounded-[22px] border border-white/8 bg-black/24 px-4 py-4 text-[20px] font-black leading-[1.16] text-white outline-none placeholder:text-white/24 focus:border-[#4ade80]/35"
            />
          </section>

          <section className="grid gap-3">
            <div className="rounded-[28px] border border-[#4ade80]/18 bg-[#4ade80]/8 p-4">
              <div className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] text-[#86efac]">
                <Trophy size={15} />
                If I win
              </div>
              <input
                value={winOutcome}
                onChange={(e) => setWinOutcome(e.target.value)}
                placeholder="Pizza for everyone"
                maxLength={120}
                className="h-13 w-full rounded-[18px] border border-white/8 bg-black/24 px-4 text-[15px] font-bold text-white outline-none placeholder:text-white/25"
              />
            </div>
            <div className="rounded-[28px] border border-[#fb7185]/18 bg-[#fb7185]/8 p-4">
              <div className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] text-[#fda4af]">
                <Laugh size={15} />
                If I lose
              </div>
              <input
                value={loseOutcome}
                onChange={(e) => setLoseOutcome(e.target.value)}
                placeholder="Post my old school photos"
                maxLength={120}
                className="h-13 w-full rounded-[18px] border border-white/8 bg-black/24 px-4 text-[15px] font-bold text-white outline-none placeholder:text-white/25"
              />
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,26,22,0.92),rgba(6,10,8,0.97))] p-4 shadow-[0_18px_54px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] text-white/42">
              <CalendarClock size={15} className="text-[#facc15]" />
              Resolution date
            </div>
            <input
              type="datetime-local"
              value={resolutionDate}
              onChange={(event) => setResolutionDate(event.target.value)}
              className="h-[52px] w-full rounded-[18px] border border-white/8 bg-black/24 px-4 text-[15px] font-black text-white outline-none [color-scheme:dark] focus:border-[#facc15]/36"
            />
          </section>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/8 bg-[linear-gradient(180deg,rgba(5,7,5,0.82),rgba(5,7,5,0.98))] px-4 pb-[calc(16px+var(--safe-area-bottom))] pt-4 backdrop-blur-xl">
          <button
            type="button"
            disabled={!canPost}
            onClick={handleSubmit}
            className={`flex h-14 w-full items-center justify-center gap-2 rounded-full text-[15px] font-black uppercase tracking-[0.08em] transition-all ${
              canPost
                ? "bg-[linear-gradient(135deg,#4ade80,#22c55e)] text-[#061006] shadow-[0_12px_30px_rgba(74,222,128,0.28)]"
                : "bg-white/[0.06] text-white/35"
            }`}
          >
            {status === "posted" ? <Check size={19} /> : <Handshake size={18} />}
            {status === "posted" ? "Posted" : "Post Deal"}
          </button>
        </div>
      </div>
    </div>
  );
}
