"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronRight,
  Ear,
  Flame,
  Megaphone,
  UserRound,
  Users,
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore-v2";
import {
  type Friend,
  friendsService,
} from "@/middleware/services/friends.service";
import { type DramaParticipant, useDramaStore } from "@/stores/useDramaStore";
import { Avatar } from "../ui/Avatar";

type RumourTarget = "anyone" | "friend";

function getFriendId(friend: Friend) {
  return friend.user_id || friend.id || "";
}

function getFriendName(friend: Friend) {
  return friend.display_name || friend.username || "Friend";
}

function getFriendAvatar(friend: Friend) {
  return friend.avatar_url || "";
}

const HEAT_TAGS = ["unverified", "spicy", "confirmed vibes", "big if true"];

function defaultRumourDeadlineValue() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(21, 0, 0, 0);
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function safeRumourDeadlineIso(value: string) {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
    return parsed.toISOString();
  }
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

export function CreateRumourScreen({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated?: () => void;
}) {
  const { user } = useAuthStore();
  const createRumour = useDramaStore((state) => state.createRumour);
  const [target, setTarget] = useState<RumourTarget>("anyone");
  const [selectedFriendId, setSelectedFriendId] = useState("");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [statement, setStatement] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [heatLabel, setHeatLabel] = useState(HEAT_TAGS[0]);
  const [deadline, setDeadline] = useState(defaultRumourDeadlineValue);
  const [status, setStatus] = useState<"idle" | "posted">("idle");

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

  const subject = useMemo<DramaParticipant | undefined>(() => {
    if (target !== "friend" || !selectedFriend) return undefined;
    return {
      id: getFriendId(selectedFriend),
      name: getFriendName(selectedFriend),
      username: selectedFriend.username,
      avatar: getFriendAvatar(selectedFriend),
    };
  }, [target, selectedFriend]);

  const canPost =
    Boolean(user?.id) &&
    statement.trim().length > 0 &&
    deadline.trim().length > 0 &&
    (target === "anyone" || Boolean(subject));

  const handleSubmit = () => {
    if (!user?.id || !canPost) return;
    createRumour({
      statement,
      sourceLabel,
      heatLabel,
      deadline: safeRumourDeadlineIso(deadline),
      poster: {
        id: user.id,
        name: user.displayName || user.username || "You",
        username: user.username,
        avatar: user.avatar || "",
      },
      subject,
    });
    setStatus("posted");
    window.setTimeout(() => {
      onCreated?.();
    }, 520);
  };

  return (
    <div className="rumour-create-screen h-dvh overflow-y-auto overscroll-contain text-white">
      <style>{`
        .rumour-create-screen {
          background:
            radial-gradient(circle at 50% -14%, rgba(251,113,133,0.2), transparent 34%),
            radial-gradient(circle at 12% 16%, rgba(192,132,252,0.12), transparent 28%),
            radial-gradient(circle at 92% 8%, rgba(250,204,21,0.1), transparent 24%),
            linear-gradient(180deg, #080506 0%, #140710 48%, #040203 100%);
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
            <p className="m-0 text-[11px] font-black uppercase tracking-[0.18em] text-[#fda4af]">
              Rumour
            </p>
            <h1 className="m-0 text-[28px] font-black leading-none">
              Spill the tea
            </h1>
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(26,18,22,0.94),rgba(10,6,8,0.98))] p-4 shadow-[0_18px_54px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] text-white/42">
              <Megaphone size={15} className="text-[#fda4af]" />
              The rumour
            </div>
            <textarea
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder="Word is that..."
              maxLength={280}
              className="min-h-[120px] w-full resize-none rounded-[22px] border border-white/8 bg-black/24 px-4 py-4 text-[20px] font-black leading-[1.16] text-white outline-none placeholder:text-white/24 focus:border-[#fb7185]/35"
            />
          </section>

          <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(26,18,22,0.94),rgba(10,6,8,0.98))] p-4 shadow-[0_18px_54px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] text-white/42">
              <Users size={15} className="text-[#fda4af]" />
              Who is it about?
            </div>
            <div className="grid grid-cols-2 gap-2">
              {([
                ["anyone", UserRound, "No one specific"],
                ["friend", Users, "A friend"],
              ] as const).map(([itemTarget, Icon, label]) => (
                <button
                  key={itemTarget}
                  type="button"
                  onClick={() => setTarget(itemTarget)}
                  className={`flex items-center gap-2 rounded-[18px] border px-3 py-3 text-left text-[13px] font-black transition-all ${
                    target === itemTarget
                      ? "border-[#fb7185]/36 bg-[#fb7185]/12 text-white"
                      : "border-white/8 bg-white/[0.035] text-white/52"
                  }`}
                >
                  <Icon size={17} className="text-[#fda4af]" />
                  {label}
                </button>
              ))}
            </div>

            {target === "friend" && (
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
                            ? "border-[#fb7185]/36 bg-[#fb7185]/12"
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
                          <Check size={18} className="text-[#fb7185]" />
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

          <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(26,18,22,0.92),rgba(10,6,8,0.97))] p-4 shadow-[0_18px_54px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] text-white/42">
              <Ear size={15} className="text-[#c084fc]" />
              Where did you hear it?
            </div>
            <input
              value={sourceLabel}
              onChange={(e) => setSourceLabel(e.target.value)}
              placeholder="heard around"
              maxLength={80}
              className="h-13 w-full rounded-[18px] border border-white/8 bg-black/24 px-4 text-[15px] font-bold text-white outline-none placeholder:text-white/25 focus:border-[#c084fc]/35"
            />
          </section>

          <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(26,18,22,0.92),rgba(10,6,8,0.97))] p-4 shadow-[0_18px_54px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] text-white/42">
              <Flame size={15} className="text-[#facc15]" />
              Heat level
            </div>
            <div className="flex flex-wrap gap-2">
              {HEAT_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setHeatLabel(tag)}
                  className={`rounded-full border px-3 py-2 text-[12px] font-black transition-all ${
                    heatLabel === tag
                      ? "border-[#facc15]/40 bg-[#facc15]/14 text-white"
                      : "border-white/8 bg-white/[0.035] text-white/55"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(26,18,22,0.92),rgba(10,6,8,0.97))] p-4 shadow-[0_18px_54px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] text-white/42">
              <CalendarClock size={15} className="text-[#facc15]" />
              Settle by
            </div>
            <input
              type="datetime-local"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
              className="h-[52px] w-full rounded-[18px] border border-white/8 bg-black/24 px-4 text-[15px] font-black text-white outline-none [color-scheme:dark] focus:border-[#facc15]/36"
            />
          </section>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/8 bg-[linear-gradient(180deg,rgba(8,5,6,0.82),rgba(8,5,6,0.98))] px-4 pb-[calc(16px+var(--safe-area-bottom))] pt-4 backdrop-blur-xl">
          <button
            type="button"
            disabled={!canPost || status === "posted"}
            onClick={handleSubmit}
            className={`flex h-14 w-full items-center justify-center gap-2 rounded-full text-[15px] font-black uppercase tracking-[0.08em] transition-all ${
              canPost
                ? "bg-[linear-gradient(135deg,#fb7185,#e11d48)] text-[#1a060c] shadow-[0_12px_30px_rgba(251,113,133,0.28)]"
                : "bg-white/[0.06] text-white/35"
            }`}
          >
            {status === "posted" ? <Check size={19} /> : <Megaphone size={18} />}
            {status === "posted" ? "Posted" : "Post Rumour"}
          </button>
        </div>
      </div>
    </div>
  );
}
