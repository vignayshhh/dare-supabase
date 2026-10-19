"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Crown,
  Flame,
  Handshake,
  Heart,
  Loader2,
  Search,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useUserSearchStore } from "@/stores/useUserSearchStore";
import {
  relationshipsService,
  type RelationshipPersonSnapshot,
  type RelationshipRecord,
  type RelationshipType,
} from "@/middleware/services/relationships.service";

interface RelationshipsScreenProps {
  onBack: () => void;
  currentUser: RelationshipPersonSnapshot;
  profileUser: RelationshipPersonSnapshot;
  initialTarget?: RelationshipPersonSnapshot | null;
}

type RelationshipMode = {
  type: RelationshipType;
  title: string;
  kicker: string;
  accent: string;
  Icon: typeof Swords;
  reasons: string[];
};

const MODES: RelationshipMode[] = [
  {
    type: "conflict",
    title: "Conflict",
    kicker: "Declare the drama",
    accent: "#86efac",
    Icon: Swords,
    reasons: [
      "Left on read one too many times",
      "Said something they can't take back",
      "Crossed a line",
      "Disappeared when it mattered",
      "Fake with me",
      "Wasted my time",
      "Same pattern. Again.",
      "Knows what they did",
    ],
  },
  {
    type: "alliance",
    title: "Alliance",
    kicker: "Publicly on the same side",
    accent: "#22d3ee",
    Icon: Handshake,
    reasons: [
      "Always backs me",
      "Same side no matter what",
      "Built different together",
      "My chaos partner",
    ],
  },
  {
    type: "favorite",
    title: "Favorite",
    kicker: "Favorite person this month",
    accent: "#facc15",
    Icon: Crown,
    reasons: [
      "Made this month better",
      "Main character of my month",
      "Kept showing up",
      "Soft spot confirmed",
    ],
  },
  {
    type: "rival",
    title: "Rival",
    kicker: "Competitive social tension",
    accent: "#f472b6",
    Icon: Trophy,
    reasons: [
      "Always trying to beat me",
      "Secretly competitive",
      "Scoreboard energy",
      "Friendly enemy arc",
    ],
  },
];

function cleanAt(value: string) {
  return value.replace(/^@+/, "");
}

function toSnapshot(user: {
  id?: string;
  user_id?: string;
  displayName?: string | null;
  display_name?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  avatar_url?: string | null;
}): RelationshipPersonSnapshot {
  const id = user.user_id || user.id || "";
  const username = cleanAt(user.username || "user");
  return {
    id,
    display_name: user.displayName || user.display_name || username,
    username,
    avatar_url: user.avatarUrl || user.avatar_url || "",
  };
}

function dayCount(value: unknown) {
  let time = 0;
  if (typeof value === "string" || typeof value === "number") {
    time = new Date(value).getTime();
  } else if (value && typeof value === "object") {
    const timestamp = value as { toDate?: () => Date; seconds?: number };
    if (typeof timestamp.toDate === "function") time = timestamp.toDate().getTime();
    if (!time && typeof timestamp.seconds === "number") time = timestamp.seconds * 1000;
  }
  if (!time) return 1;
  return Math.max(1, Math.ceil((Date.now() - time) / 86400000));
}

export function RelationshipsScreen({
  onBack,
  currentUser,
  profileUser,
  initialTarget = null,
}: RelationshipsScreenProps) {
  const [mode, setMode] = useState<RelationshipType>("conflict");
  const [selectedReason, setSelectedReason] = useState("");
  const [target, setTarget] = useState<RelationshipPersonSnapshot | null>(
    initialTarget,
  );
  const [queryText, setQueryText] = useState("");
  const [records, setRecords] = useState<RelationshipRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { searchUsers, searchResults, isSearching, clearSearch } =
    useUserSearchStore();

  const activeMode = MODES.find((item) => item.type === mode) || MODES[0];
  const canCreate = Boolean(target?.id && selectedReason && !busy);
  const isOwnBoard = currentUser.id === profileUser.id;

  useEffect(() => {
    setTarget(initialTarget);
  }, [initialTarget]);

  useEffect(() => {
    return relationshipsService.subscribeForProfile(
      profileUser.id,
      setRecords,
      (err) => setError(err.message || "Could not load relationships."),
    );
  }, [profileUser.id]);

  useEffect(() => {
    const trimmed = queryText.replace("@", "").trim();
    const timer = window.setTimeout(() => {
      if (trimmed) {
        void searchUsers(trimmed);
      } else {
        clearSearch();
      }
    }, 240);
    return () => window.clearTimeout(timer);
  }, [clearSearch, queryText, searchUsers]);

  const grouped = useMemo(() => {
    return MODES.map((item) => ({
      ...item,
      records: records.filter((record) => record.type === item.type),
    }));
  }, [records]);

  const createRelationship = async () => {
    if (!canCreate || !target) return;
    setBusy(true);
    setError(null);
    try {
      await relationshipsService.createRelationship({
        owner: currentUser,
        target,
        type: mode,
        reason: selectedReason,
      });
      setSelectedReason("");
      if (!initialTarget) setTarget(null);
      setQueryText("");
      clearSearch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create relationship.");
    } finally {
      setBusy(false);
    }
  };

  const respond = async (
    record: RelationshipRecord,
    action: "accept" | "counter" | "resolve",
  ) => {
    setBusy(true);
    setError(null);
    try {
      if (action === "accept") await relationshipsService.acceptConflict(record.id);
      if (action === "counter") {
        await relationshipsService.counterConflict(record.id, "Crossed a line");
      }
      if (action === "resolve") {
        await relationshipsService.markResolved(record.id, currentUser.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update relationship.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen-container relationships-screen text-white">
      <style>{`
        .relationships-screen {
          background: linear-gradient(180deg, #141414 0%, #0e0e0e 52%, #0a0a0a 100%);
          font-family: var(--font-ui);
        }
        @keyframes relationshipFloatIn {
          from { opacity: 0; transform: translateY(18px) scale(.98); filter: blur(8px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes relationshipSweep {
          0% { transform: translateX(-120%); }
          42% { transform: translateX(120%); }
          100% { transform: translateX(120%); }
        }
        @keyframes relationshipPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 rgba(74,222,128,0); }
          45% { transform: scale(1.015); box-shadow: 0 0 34px rgba(74,222,128,.12); }
        }
        .relationship-panel {
          animation: relationshipFloatIn .5s cubic-bezier(.2,.9,.2,1) both;
        }
        .relationship-shine::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.12), transparent);
          animation: relationshipSweep 7.2s ease-in-out infinite;
        }
      `}</style>

      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-16 h-56 w-56 -translate-x-1/2 rounded-full bg-[#4ade80]/10 blur-3xl" />
        <div className="absolute -right-24 top-36 h-64 w-64 rounded-full bg-cyan-400/[0.07] blur-3xl" />
      </div>

      <header className="relative z-20 border-b border-white/8 bg-[linear-gradient(180deg,rgba(5,7,5,.96),rgba(5,7,5,.78))] px-4 pb-4 pt-[calc(var(--safe-area-top)+12px)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="app-pressable flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] border border-white/8 bg-white/[0.04] text-[#94a3b8] shadow-[0_18px_44px_rgba(0,0,0,.32)]"
            aria-label="Back"
          >
            <ArrowLeft size={21} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[11px] font-black uppercase tracking-[0.22em] text-[#86efac]">
              Profile drama
            </p>
            <h1 className="m-0 mt-1 truncate text-[32px] font-black leading-none text-white">
              Relationships
            </h1>
          </div>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] border border-[#4ade80]/18 bg-[#4ade80]/10 text-[#86efac] shadow-[0_18px_44px_rgba(0,0,0,.32)]">
            <Users size={24} />
          </div>
        </div>
      </header>

      <main
        className="relative z-10 flex-1 overflow-y-auto px-4"
        style={{
          paddingTop: "18px",
          paddingBottom: "calc(var(--bottom-nav-total-height) + 28px)",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div className="mx-auto max-w-2xl">
          <section className="relationship-panel relationship-shine relative mb-5 overflow-hidden rounded-[34px] border border-white/8 bg-[radial-gradient(ellipse_at_24%_-45%,rgba(74,222,128,.13),transparent_64%),radial-gradient(ellipse_at_82%_-40%,rgba(14,165,233,.1),transparent_62%),linear-gradient(180deg,rgba(13,19,14,.96),rgba(8,13,9,.98))] p-5 shadow-[0_28px_78px_rgba(0,0,0,.44),inset_0_1px_0_rgba(255,255,255,.055)]">
            <div className="relative z-10 flex items-start gap-4">
              <div className="flex -space-x-3">
                <Avatar
                  src={profileUser.avatar_url}
                  alt={profileUser.display_name}
                  size="lg"
                  userId={profileUser.id}
                  username={profileUser.username}
                />
                <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#07100b] bg-[#4ade80] text-[#061006]">
                  <Zap size={22} />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[11px] font-black uppercase tracking-[0.2em] text-[#94a3b8]">
                  Living social map
                </p>
                <h2 className="m-0 mt-2 text-[27px] font-black leading-[1.02] text-white">
                  Who {profileUser.display_name.split(" ")[0]} is to people
                </h2>
                <p className="m-0 mt-2 text-sm font-semibold leading-6 text-[#6ee7b7]">
                  Conflicts, alliances, favorites, and rival arcs sit here like a
                  relationship portrait.
                </p>
              </div>
            </div>
          </section>

          {isOwnBoard && (
            <section className="relationship-panel relative z-30 mb-5 overflow-visible rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,22,18,.96),rgba(6,9,8,.99))] p-4 shadow-[0_26px_72px_rgba(0,0,0,.38),inset_0_1px_0_rgba(255,255,255,.055)]">
              <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(134,239,172,.7),rgba(103,232,249,.4),transparent)]" />
              <div className="mb-4 grid grid-cols-2 gap-2">
                {MODES.map((item) => {
                  const Icon = item.Icon;
                  const active = item.type === mode;
                  return (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => {
                        setMode(item.type);
                        setSelectedReason("");
                      }}
                      className="app-pressable relative overflow-hidden rounded-[24px] border px-3 py-3 text-left"
                      style={{
                        borderColor: active ? `${item.accent}66` : "rgba(255,255,255,.08)",
                        background: active
                          ? `linear-gradient(180deg,${item.accent}22,rgba(255,255,255,.035))`
                          : "rgba(255,255,255,.035)",
                        animation: active ? "relationshipPulse 2.8s ease-in-out infinite" : undefined,
                      }}
                    >
                      <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-[16px] border border-white/8 bg-black/18" style={{ color: item.accent }}>
                        <Icon size={18} />
                      </div>
                      <p className="m-0 text-[15px] font-black text-white">{item.title}</p>
                      <p className="m-0 mt-1 text-[11px] font-bold text-white/42">{item.kicker}</p>
                    </button>
                  );
                })}
              </div>

              <div className="relative mb-4">
                <div className="flex min-h-[56px] items-center rounded-[22px] border border-white/8 bg-white/[0.045] px-4">
                  <Search size={18} className="mr-3 text-white/36" />
                  <input
                    value={queryText}
                    onChange={(event) => setQueryText(event.target.value)}
                    placeholder={target ? target.display_name : "Tag someone by @username"}
                    className="min-w-0 flex-1 bg-transparent text-[16px] font-semibold text-white outline-none placeholder:text-white/28"
                  />
                  {target && (
                    <button
                      type="button"
                      onClick={() => {
                        setTarget(null);
                        setQueryText("");
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.05] text-white/48"
                      aria-label="Clear tagged user"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                {target ? (
                  <div className="mt-3 flex items-center gap-3 rounded-[22px] border border-[#4ade80]/18 bg-[#4ade80]/10 px-3 py-3">
                    <Avatar
                      src={target.avatar_url}
                      alt={target.display_name}
                      size="sm"
                      userId={target.id}
                      username={target.username}
                    />
                    <div className="min-w-0">
                      <p className="m-0 truncate text-sm font-black text-white">
                        {target.display_name}
                      </p>
                      <p className="m-0 text-xs font-bold text-[#86efac]">
                        @{target.username}
                      </p>
                    </div>
                  </div>
                ) : queryText.trim() ? (
                  <div className="absolute left-0 right-0 top-full z-50 mt-3 max-h-64 overflow-y-auto rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,22,18,.99),rgba(8,10,8,.99))] shadow-[0_24px_54px_rgba(0,0,0,.42)]">
                    {isSearching ? (
                      <div className="flex items-center justify-center gap-2 p-4 text-sm font-bold text-white/45">
                        <Loader2 size={16} className="animate-spin" />
                        Searching
                      </div>
                    ) : searchResults.length ? (
                      searchResults.map((user) => {
                        const person = toSnapshot(user);
                        return (
                          <button
                            key={person.id}
                            type="button"
                            onClick={() => {
                              setTarget(person);
                              setQueryText("");
                              clearSearch();
                            }}
                            className="flex w-full items-center gap-3 border-b border-white/6 p-3 text-left last:border-b-0 hover:bg-white/[0.045]"
                          >
                            <Avatar
                              src={person.avatar_url}
                              alt={person.display_name}
                              size="sm"
                              userId={person.id}
                              username={person.username}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="m-0 truncate text-sm font-bold text-white">
                                {person.display_name}
                              </p>
                              <p className="m-0 text-xs font-semibold text-white/38">
                                @{person.username}
                              </p>
                            </div>
                            <Check size={16} style={{ color: activeMode.accent }} />
                          </button>
                        );
                      })
                    ) : (
                      <div className="p-4 text-center text-sm font-semibold text-white/42">
                        No users found.
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              <p className="mb-3 text-[11px] font-black uppercase tracking-[0.18em] text-[#94a3b8]">
                Pick your reason
              </p>
              <div className="grid gap-2">
                {activeMode.reasons.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setSelectedReason(reason)}
                    className="app-pressable flex min-h-[48px] items-center justify-between gap-3 rounded-[20px] border px-4 text-left"
                    style={{
                      borderColor:
                        selectedReason === reason
                          ? `${activeMode.accent}66`
                          : "rgba(255,255,255,.08)",
                      background:
                        selectedReason === reason
                          ? `${activeMode.accent}18`
                          : "rgba(255,255,255,.035)",
                    }}
                  >
                    <span className="text-sm font-black text-white">{reason}</span>
                    {selectedReason === reason && (
                      <Check size={17} style={{ color: activeMode.accent }} />
                    )}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={createRelationship}
                disabled={!canCreate}
                className="app-pressable mt-4 flex min-h-[54px] w-full items-center justify-center gap-2 rounded-full text-[15px] font-black disabled:cursor-not-allowed disabled:opacity-45"
                style={{
                  background: canCreate
                    ? `linear-gradient(135deg,${activeMode.accent},#4ade80)`
                    : "rgba(255,255,255,.1)",
                  color: canCreate ? "#031008" : "rgba(255,255,255,.42)",
                  boxShadow: canCreate ? `0 18px 42px ${activeMode.accent}26` : "none",
                }}
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                Declare {activeMode.title}
              </button>
            </section>
          )}

          {error && (
            <div className="mb-4 rounded-[22px] border border-red-400/20 bg-red-500/12 px-4 py-3 text-sm font-bold text-red-100">
              {error}
            </div>
          )}

          <div className="space-y-5">
            {grouped.map((group, groupIndex) => {
              const Icon = group.Icon;
              return (
                <section key={group.type} className="relationship-panel" style={{ animationDelay: `${groupIndex * 45}ms` }}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-[16px] border border-white/8 bg-white/[0.04]" style={{ color: group.accent }}>
                        <Icon size={17} />
                      </div>
                      <div>
                        <p className="m-0 text-[12px] font-black uppercase tracking-[0.18em] text-[#94a3b8]">
                          {group.title}
                        </p>
                        <p className="m-0 text-xs font-bold text-white/35">
                          {group.records.length || "No"} active
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {group.records.length ? (
                      group.records.map((record) => {
                        const canRespond = currentUser.id === record.target_id;
                        return (
                          <div
                            key={record.id}
                            className="relative overflow-hidden rounded-[30px] border border-white/8 bg-[radial-gradient(circle_at_15%_-12%,rgba(74,222,128,.11),transparent_38%),radial-gradient(circle_at_96%_0%,rgba(34,211,238,.08),transparent_34%),linear-gradient(180deg,rgba(14,20,16,.98),rgba(5,9,7,.99))] p-4 shadow-[0_20px_54px_rgba(0,0,0,.36),inset_0_1px_0_rgba(255,255,255,.055)]"
                          >
                            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(134,239,172,.58),transparent)]" />
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center">
                                <Avatar
                                  src={record.owner_snapshot.avatar_url}
                                  alt={record.owner_snapshot.display_name}
                                  size="md"
                                  userId={record.owner_id}
                                  username={record.owner_snapshot.username}
                                />
                                <div className="-ml-2 rounded-full border-2 border-[#07100b]">
                                  <Avatar
                                    src={record.target_snapshot.avatar_url}
                                    alt={record.target_snapshot.display_name}
                                    size="md"
                                    userId={record.target_id}
                                    username={record.target_snapshot.username}
                                  />
                                </div>
                              </div>
                              <div className="rounded-full border border-white/8 bg-black/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/50">
                                Day {dayCount(record.created_at)}
                              </div>
                            </div>
                            <div className="mt-4">
                              <p className="m-0 text-[13px] font-bold text-white/52">
                                @{record.owner_snapshot.username} with @{record.target_snapshot.username}
                              </p>
                              <p className="m-0 mt-2 text-[22px] font-black leading-[1.08] text-white">
                                "{record.reason}"
                              </p>
                              {record.target_reason && (
                                <p className="m-0 mt-2 rounded-[18px] border border-white/8 bg-white/[0.04] px-3 py-2 text-sm font-black text-[#d7ffe6]">
                                  {record.target_snapshot.display_name}: "{record.target_reason}"
                                </p>
                              )}
                            </div>
                            <div className="mt-4 flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-[#4ade80]/18 bg-[#4ade80]/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-[#86efac]">
                                {record.status === "resolved" ? "Resolved" : record.status}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-white/42">
                                <Flame size={12} />
                                {record.watchers_count} watching
                              </span>
                            </div>

                            {record.type === "conflict" && canRespond && record.status !== "resolved" && (
                              <div className="mt-4 grid grid-cols-3 gap-2">
                                <button
                                  type="button"
                                  onClick={() => respond(record, "accept")}
                                  disabled={busy}
                                  className="app-pressable rounded-[18px] bg-[#4ade80] px-2 py-3 text-xs font-black text-[#031008]"
                                >
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  onClick={() => respond(record, "counter")}
                                  disabled={busy}
                                  className="app-pressable rounded-[18px] border border-[#22d3ee]/20 bg-[#22d3ee]/10 px-2 py-3 text-xs font-black text-[#a5f3fc]"
                                >
                                  Declare back
                                </button>
                                <button
                                  type="button"
                                  onClick={() => respond(record, "resolve")}
                                  disabled={busy}
                                  className="app-pressable rounded-[18px] border border-white/8 bg-white/[0.04] px-2 py-3 text-xs font-black text-white/60"
                                >
                                  Resolve
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-[26px] border border-white/8 bg-white/[0.035] px-4 py-5 text-sm font-bold text-[#64748b]">
                        Nothing declared here yet.
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
