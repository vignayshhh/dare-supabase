"use client";

import { getChatSource } from "@/lib/chatContext";
import { ChatSourceQuote } from "../circles/CircleChatScreen";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  AtSign,
  CalendarClock,
  Check,
  CheckCircle2,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore-v2";
import {
  type Friend,
  friendsService,
} from "@/middleware/services/friends.service";
import { type UserProfile } from "@/middleware/services/user.service";
import {
  type PredictionSubject,
  usePredictionStore,
} from "@/stores/usePredictionStore";
import { useUserSearchStore } from "@/stores/useUserSearchStore";
import { Avatar } from "../ui/Avatar";

function getPersonId(person: Friend | UserProfile) {
  return person.user_id || person.id || "";
}

function getFriendName(friend: Friend | UserProfile) {
  return (
    friend.display_name ||
    friend.username ||
    "Friend"
  );
}

function getFriendAvatar(friend: Friend | UserProfile) {
  return friend.avatar_url || "";
}

function defaultDeadlineValue() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(21, 0, 0, 0);
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function getSafeDeadlineIso(value: string) {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
    return parsed.toISOString();
  }

  const fallback = new Date(Date.now() + 60 * 60 * 1000);
  return fallback.toISOString();
}

export function CreatePredictionScreen({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated?: () => void;
}) {
  const { user } = useAuthStore();
  const createPrediction = usePredictionStore((state) => state.createPrediction);
  const { searchUsers, searchResults, isSearching, clearSearch } =
    useUserSearchStore();
  const [text, setText] = useState(() => getChatSource()?.body.slice(0, 280) || "");
  const [selectedFriendId, setSelectedFriendId] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState<
    Friend | UserProfile | null
  >(null);
  const [recipientQuery, setRecipientQuery] = useState("");
  const [showRecipientDropdown, setShowRecipientDropdown] = useState(false);
  const [deadline, setDeadline] = useState(defaultDeadlineValue);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
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

  useEffect(() => {
    const query = recipientQuery.replace(/^@/, "").trim();

    if (!query) {
      clearSearch();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      searchUsers(query);
    }, 150);

    return () => window.clearTimeout(timeoutId);
  }, [clearSearch, recipientQuery, searchUsers]);

  const selectedFriend = useMemo(
    () =>
      selectedRecipient ||
      [...friends, ...searchResults].find(
        (person) => getPersonId(person) === selectedFriendId,
      ),
    [friends, searchResults, selectedFriendId, selectedRecipient],
  );

  const subject = useMemo<PredictionSubject | null>(() => {
    if (!selectedFriend) return null;
    return {
      type: "friend",
      id: getPersonId(selectedFriend),
      name: getFriendName(selectedFriend),
      username: selectedFriend.username,
      avatar: getFriendAvatar(selectedFriend),
    };
  }, [selectedFriend]);

  const [submitError, setSubmitError] = useState("");
  const canPost =
    status === "idle" &&
    Boolean(user?.id) &&
    text.trim().length > 0 &&
    Boolean(subject) &&
    deadline.trim().length > 0;

  const handleSubmit = async () => {
    if (!user?.id || !subject || !canPost) return;

    const deadlineIso = getSafeDeadlineIso(deadline);

    setStatus("sending");
    setSubmitError("");
    try {
    await createPrediction({
      text: text.trim(),
      subject,
      deadline: deadlineIso,
      poster: {
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

  const selectRecipient = (person: Friend | UserProfile) => {
    const personId = getPersonId(person);
    if (!personId) return;

    setSelectedFriendId(personId);
    setSelectedRecipient(person);
    setRecipientQuery("");
    setShowRecipientDropdown(false);
    clearSearch();
  };

  const clearRecipient = () => {
    setSelectedFriendId("");
    setSelectedRecipient(null);
    setRecipientQuery("");
    clearSearch();
    setShowRecipientDropdown(false);
  };

  const recipientSuggestions = recipientQuery.trim()
    ? searchResults
    : friends;

  return (
    <div className="screen-container prediction-create-screen relative flex flex-col overflow-hidden bg-[#050705] text-white">
      <style>{`
        .prediction-create-screen {
          background:
            radial-gradient(circle at 50% -12%, rgba(74,222,128,0.18), transparent 32%),
            radial-gradient(circle at 12% 18%, rgba(56,189,248,0.12), transparent 28%),
            radial-gradient(circle at 88% 4%, rgba(192,132,252,0.12), transparent 24%),
            linear-gradient(180deg, #060806 0%, #0a0f0a 48%, #030403 100%);
        }
      `}</style>

      <header className="shrink-0 px-4 pt-[calc(16px+var(--safe-area-top))]">
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
              Prediction
            </p>
            <h1 className="m-0 text-[27px] font-black leading-none tracking-[-0.03em]">
              Make the call
            </h1>
          </div>
        </div>
      </header>

      {submitError && <p role="alert" className="px-4 text-sm text-rose-300">{submitError}</p>}
      {getChatSource() && <ChatSourceQuote source={getChatSource()!} />}
      <main
        className="min-h-0 flex-1 overflow-y-auto px-4"
        style={{
          paddingBottom: "calc(132px + var(--safe-area-bottom))",
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorY: "contain",
        }}
      >
        <div className="space-y-4">
          <section className="relative z-20 overflow-visible rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,24,19,0.95),rgba(6,8,7,0.98))] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.06)]">
            <div className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] text-white/42">
              <AtSign size={15} className="text-[#86efac]" />
              Who is this about?
            </div>

            <div className="relative">
              <div className="flex min-h-[56px] items-center rounded-[20px] border border-white/8 bg-black/24 px-4 transition-colors focus-within:border-[#4ade80]/35">
                <Search size={18} className="mr-3 shrink-0 text-white/36" />
                <input
                  type="text"
                  value={recipientQuery}
                  onChange={(event) => {
                    setRecipientQuery(event.target.value);
                    setShowRecipientDropdown(true);
                  }}
                  onFocus={() => setShowRecipientDropdown(true)}
                  placeholder="Enter username"
                  className="min-w-0 flex-1 bg-transparent text-[16px] font-bold text-white outline-none placeholder:text-white/28"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                />
                {recipientQuery || selectedFriend ? (
                  <button
                    type="button"
                    onClick={clearRecipient}
                    className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/36 transition-colors hover:bg-white/8 hover:text-white"
                    aria-label="Clear recipient"
                  >
                    <X size={16} />
                  </button>
                ) : null}
              </div>

              {showRecipientDropdown && (
                <div className="absolute left-0 right-0 top-full z-50 mt-3 max-h-64 overflow-y-auto rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,22,18,0.99),rgba(9,11,9,0.99))] shadow-[0_24px_54px_rgba(0,0,0,0.42)]">
                  {isSearching ? (
                    <div className="p-4 text-center text-sm font-semibold text-white/42">
                      Searching users...
                    </div>
                  ) : recipientSuggestions.length > 0 ? (
                    <>
                      <div className="border-b border-white/8 px-4 py-3">
                        <p className="m-0 text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/36">
                          {recipientQuery.trim() ? "Search results" : "Friends"}
                        </p>
                      </div>
                      {recipientSuggestions.map((person) => {
                        const personId = getPersonId(person);
                        const isSelected = personId === selectedFriendId;
                        return (
                          <button
                            key={personId}
                            type="button"
                            onClick={() => selectRecipient(person)}
                            className="flex w-full items-center gap-3 border-b border-white/6 p-3 text-left transition-colors last:border-b-0 hover:bg-white/[0.045]"
                          >
                            <Avatar
                              src={getFriendAvatar(person)}
                              alt={getFriendName(person)}
                              size="sm"
                              userId={personId}
                              username={person.username}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="m-0 truncate text-sm font-bold text-white">
                                {getFriendName(person)}
                              </p>
                              <p className="m-0 mt-0.5 truncate text-xs font-semibold text-white/38">
                                @{person.username || "friend"}
                              </p>
                            </div>
                            {isSelected ? (
                              <CheckCircle2 size={17} className="text-[#86efac]" />
                            ) : null}
                          </button>
                        );
                      })}
                    </>
                  ) : recipientQuery.trim() ? (
                    <div className="p-4 text-center text-sm font-semibold text-white/42">
                      No users found for &quot;{recipientQuery.replace(/^@/, "")}&quot;
                    </div>
                  ) : (
                    <div className="p-4 text-center text-sm font-semibold text-white/42">
                      {loadingFriends
                        ? "Loading friends..."
                        : "Type a username to find someone."}
                    </div>
                  )}
                </div>
              )}
            </div>

            {selectedFriend && (
              <div className="mt-3 flex items-center gap-3 rounded-[20px] border border-[#4ade80]/18 bg-[#4ade80]/10 px-3 py-3">
                <Avatar
                  src={getFriendAvatar(selectedFriend)}
                  alt={getFriendName(selectedFriend)}
                  size="sm"
                  userId={getPersonId(selectedFriend)}
                  username={selectedFriend.username}
                />
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-sm font-black text-white">
                    {getFriendName(selectedFriend)}
                  </p>
                  <p className="m-0 truncate text-xs font-bold text-white/40">
                    @{selectedFriend.username || "friend"}
                  </p>
                </div>
                <Check size={18} className="text-[#86efac]" />
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,24,19,0.95),rgba(6,8,7,0.98))] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.06)]">
            <div className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] text-white/42">
              <Sparkles size={15} className="text-[#86efac]" />
              Prediction
            </div>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={
                selectedFriend
                  ? `Predict what @${selectedFriend.username || "they"} will do...`
                  : "Write the prediction after choosing someone..."
              }
              className="min-h-[170px] w-full resize-none rounded-[22px] border border-white/8 bg-black/24 px-4 py-4 text-[20px] font-black leading-[1.16] tracking-[-0.01em] text-white outline-none placeholder:text-white/24 focus:border-[#4ade80]/35"
              maxLength={180}
            />
            <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-white/32">
              <span>No template. No maybe.</span>
              <span>{text.trim().length}/180</span>
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,24,19,0.92),rgba(6,8,7,0.97))] p-4 shadow-[0_18px_54px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="mb-3 flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] text-white/42">
              <CalendarClock size={15} className="text-[#facc15]" />
              Deadline
            </div>
            <input
              type="datetime-local"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
              className="h-[52px] w-full rounded-[18px] border border-white/8 bg-black/24 px-4 text-[15px] font-black text-white outline-none [color-scheme:dark] focus:border-[#facc15]/36"
            />
          </section>
        </div>
      </main>

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
          {status === "posted" ? <Check size={19} /> : <Sparkles size={18} />}
          {status === "posted" ? "Posted" : "Post Prediction"}
        </button>
      </div>
    </div>
  );
}
