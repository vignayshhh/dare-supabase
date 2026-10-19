"use client";

import { useState } from "react";
import { Flame, ShieldCheck, Sparkles, Trophy, Users, X } from "lucide-react";
import { Avatar } from "../ui/Avatar";
import { useAuthStore } from "../../stores/useAuthStore-v2";
import type {
  CommunityChallenge,
  CommunityJoinPreviewUser,
} from "./communityChallengeData";

const FEED_SCREEN_SURFACE_BACKGROUND =
  "radial-gradient(circle at 50% -12%, rgba(74,222,128,0.16), transparent 34%), radial-gradient(circle at 12% 18%, rgba(14,165,233,0.10), transparent 28%), linear-gradient(180deg, #060806 0%, #0a0f0a 48%, #030403 100%)";

export function getCommunityChallengeIcon(challenge: CommunityChallenge) {
  if (challenge.icon === "spark") return <Sparkles size={17} />;
  if (challenge.icon === "shield") return <ShieldCheck size={17} />;
  if (challenge.icon === "trophy") return <Trophy size={17} />;
  return <Flame size={17} />;
}

function getJoinPreview(
  challenge: CommunityChallenge,
): CommunityJoinPreviewUser[] {
  if (challenge.joinedCount <= 0) return [];
  return (challenge.joinPreview || []).slice(0, 3);
}

function getJoinPreviewText(
  challenge: CommunityChallenge,
  previewUsers = getJoinPreview(challenge),
  joinedCount = challenge.joinedCount,
  currentUserId?: string,
) {
  if (previewUsers.length === 0 || joinedCount <= 0) {
    return "No one joined yet";
  }

  const names = previewUsers.map(
    (user) =>
      user.id === currentUserId
        ? "you"
        : (user.username || user.displayName).replace(/^@/, ""),
  );
  const otherCount =
    previewUsers.length >= 3
      ? Math.max(challenge.extraFriends, joinedCount - previewUsers.length, 0)
      : 0;
  const visibleNames =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

  return otherCount > 0
    ? `${visibleNames} and ${otherCount} others joined this recently`
    : `${visibleNames} joined this recently`;
}

function CommunityChallengeVisualStyles() {
  return (
    <style>{`
      @keyframes communityChallengeSweep {
        0% { opacity: 0; transform: translateX(-125%); }
        2% { opacity: 0.72; }
        8% { opacity: 0.72; transform: translateX(125%); }
        11%, 100% { opacity: 0; transform: translateX(125%); }
      }
      .community-challenge-sweep {
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.11), transparent);
        animation: communityChallengeSweep 24s ease-in-out infinite;
      }
      .community-crowd-lights {
        background:
          radial-gradient(circle at 14% 88%, rgba(255,255,255,0.22), transparent 8%),
          radial-gradient(circle at 27% 76%, rgba(74,222,128,0.24), transparent 10%),
          radial-gradient(circle at 43% 92%, rgba(255,255,255,0.16), transparent 9%),
          radial-gradient(circle at 58% 78%, rgba(14,165,233,0.2), transparent 10%),
          radial-gradient(circle at 72% 92%, rgba(255,255,255,0.16), transparent 9%),
          radial-gradient(circle at 88% 76%, rgba(74,222,128,0.2), transparent 10%);
      }
      .community-challenge-card {
        animation: communityChallengeFloat 0.48s cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      @keyframes communityChallengeFloat {
        from { opacity: 0; transform: translateY(14px) scale(0.985); filter: blur(6px); }
        to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
      }
    `}</style>
  );
}

export function CommunityChallengeCard({
  challenge,
  isJoined = false,
  onPreview,
}: {
  challenge: CommunityChallenge;
  isJoined?: boolean;
  onPreview: () => void;
}) {
  const currentUser = useAuthStore((state) => state.user);
  const backendJoinPreview = getJoinPreview(challenge);
  const selfJoinPreview: CommunityJoinPreviewUser | null =
    isJoined && currentUser?.id && backendJoinPreview.length === 0
      ? {
          id: currentUser.id,
          username: currentUser.username || "you",
          displayName: currentUser.displayName || currentUser.username || "You",
          avatarUrl: currentUser.avatar || "",
        }
      : null;
  const joinPreview = selfJoinPreview
    ? [selfJoinPreview]
    : backendJoinPreview;
  const displayedJoinedCount =
    joinPreview.length < 3
      ? Math.max(joinPreview.length, isJoined ? 1 : 0)
      : Math.max(challenge.joinedCount, joinPreview.length);
  const joinPreviewText = getJoinPreviewText(
    challenge,
    joinPreview,
    displayedJoinedCount,
    currentUser?.id,
  );
  const hasJoinedUsers = displayedJoinedCount > 0 && joinPreview.length > 0;
  const [showJoinedModal, setShowJoinedModal] = useState(false);
  const creatorLabel = challenge.sponsoredByDare
    ? "Created by Dare Official"
    : `Created by @${(challenge.creatorUsername || "dareuser").replace(/^@/, "")}`;

  return (
    <>
      <CommunityChallengeVisualStyles />
      <article
        role="button"
        tabIndex={0}
        onClick={onPreview}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onPreview();
          }
        }}
        aria-label={`Preview ${challenge.titleTop} ${challenge.titleAccent}`}
        className="community-challenge-card group relative w-full cursor-pointer overflow-hidden rounded-[34px] border border-white/8 p-[2px] text-left shadow-[0_28px_80px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.06)] outline-none transition-transform active:scale-[0.992] focus-visible:ring-2 focus-visible:ring-[#4ade80]/60"
        style={{
          background: FEED_SCREEN_SURFACE_BACKGROUND,
        }}
      >
        <div className="community-challenge-sweep pointer-events-none absolute inset-0 z-[3]" />
        <div
          className="relative overflow-hidden rounded-[32px]"
          style={{ background: FEED_SCREEN_SURFACE_BACKGROUND }}
        >
          <div className="pointer-events-none absolute inset-x-8 top-0 z-[2] h-px bg-[linear-gradient(90deg,rgba(74,222,128,0),rgba(74,222,128,0.78),rgba(74,222,128,0))]" />
          <div
            className="relative min-h-[478px] overflow-hidden px-4 pb-4 pt-4"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full"
              style={{
                background: challenge.banner,
                backgroundPosition: challenge.imagePosition || "center",
              }}
            />
            {challenge.imageUrl && (
              <img
                src={challenge.imageUrl}
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                style={{ objectPosition: challenge.imagePosition || "center" }}
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
            )}
            {challenge.customDare && !challenge.imageUrl && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="flex h-32 w-32 items-center justify-center rounded-[38px] border border-[#4ade80]/20 bg-black/22 text-[58px] font-black text-[#86efac] shadow-[0_24px_70px_rgba(0,0,0,0.35),0_0_60px_rgba(74,222,128,0.16),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md">
                  D
                </div>
              </div>
            )}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.1),rgba(0,0,0,0.18)_34%,rgba(0,0,0,0.52)_64%,rgba(0,0,0,0.9)_100%)]" />
            <div className="community-crowd-lights pointer-events-none absolute inset-x-5 bottom-0 h-28 opacity-80" />
            <div className="relative z-[1] flex items-start justify-between gap-3">
              <div className="inline-flex min-w-0 items-center gap-2 rounded-full border border-white/12 bg-black/42 px-2.5 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-white/88 shadow-[0_16px_36px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md">
                {challenge.sponsoredByDare ? (
                  <ShieldCheck size={13} className="shrink-0 text-[#86efac]" />
                ) : (
                  <Avatar
                    src={challenge.creatorAvatar || ""}
                    alt={challenge.creatorName}
                    fallbackText={challenge.creatorName || "Dare User"}
                    size={22}
                    username={challenge.creatorUsername}
                    disableRealtime
                    style={{
                      border: "1px solid rgba(134,239,172,0.38)",
                      boxShadow: "0 8px 18px rgba(0,0,0,0.34)",
                    }}
                  />
                )}
                <span className="truncate">{creatorLabel}</span>
              </div>
              <div className="rounded-full border border-[#4ade80]/24 bg-[#4ade80]/14 px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#bbf7d0] shadow-[0_16px_36px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md">
                Open now
              </div>
            </div>

            <div className="absolute inset-x-5 bottom-5 z-[1]">
              {hasJoinedUsers ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowJoinedModal(true);
                  }}
                  className="mx-auto flex max-w-[360px] flex-col items-center text-center outline-none transition-transform active:scale-[0.985]"
                  aria-label="View joined users"
                >
                  <div className="mb-2.5 flex items-center gap-2.5 rounded-full border border-white/10 bg-black/30 px-2.5 py-2 shadow-[0_16px_34px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.055)] backdrop-blur-md">
                    <div className="flex -space-x-2.5">
                      {joinPreview.map((user, index) => (
                        <span
                          key={user.id || `${challenge.id}-join-${index}`}
                          className="relative rounded-full"
                          style={{
                            zIndex: joinPreview.length - index,
                            filter:
                              "drop-shadow(0 12px 22px rgba(0,0,0,0.72))",
                          }}
                        >
                          <Avatar
                            src={user.avatarUrl || ""}
                            alt={user.displayName || user.username}
                            fallbackText={
                              user.displayName || user.username || "Dare User"
                            }
                            size={34}
                            userId={user.id}
                            username={user.username}
                            disableRealtime
                            style={{
                              border: "2px solid rgba(5,8,6,0.96)",
                              boxShadow:
                                "0 0 0 1px rgba(134,239,172,0.34), 0 12px 24px rgba(0,0,0,0.34)",
                            }}
                          />
                        </span>
                      ))}
                    </div>
                    <span className="h-5 w-px bg-white/10" />
                    <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#86efac]">
                      Joined
                    </span>
                  </div>
                  <p className="mx-auto max-w-[335px] text-[13.5px] font-black leading-snug text-[#e8fff0] drop-shadow-[0_12px_24px_rgba(0,0,0,0.88)]">
                    {joinPreviewText}
                  </p>
                </button>
              ) : (
                <div className="mx-auto flex max-w-[315px] flex-col items-center text-center">
                  <span className="mb-2 h-px w-20 bg-[linear-gradient(90deg,transparent,rgba(134,239,172,0.62),transparent)]" />
                  <p className="text-[13.5px] font-black leading-snug text-[#d7ffe6] drop-shadow-[0_12px_24px_rgba(0,0,0,0.82)]">
                    {joinPreviewText}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div
            className="relative px-4 pb-7 pt-5"
            style={{ background: FEED_SCREEN_SURFACE_BACKGROUND }}
          >
            <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(74,222,128,0.32),rgba(14,165,233,0.22),rgba(255,255,255,0))]" />
            <div
              className="flex min-h-[158px] flex-col justify-between rounded-[24px] border border-white/8 px-5 py-5"
              style={{
                background: FEED_SCREEN_SURFACE_BACKGROUND,
                boxShadow:
                  "0 18px 52px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.055)",
              }}
            >
              <div className="min-w-0">
                <div className="text-[23px] font-black uppercase leading-tight text-white">
                  {challenge.titleTop}
                </div>
                <div
                  className="text-[23px] font-black uppercase leading-tight"
                  style={{ color: challenge.accent }}
                >
                  {challenge.titleAccent}
                </div>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onPreview();
                }}
                className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.028))] px-4 text-center text-[12px] font-black uppercase tracking-[0.08em] text-white/88 shadow-[0_14px_30px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md transition-all active:scale-[0.98] group-hover:border-[#4ade80]/24 group-hover:text-[#d7ffe6]"
              >
                {isJoined ? "Joined" : "View dare description"}
              </button>
            </div>

          </div>
        </div>
      </article>
      {showJoinedModal && (
        <div
          className="fixed inset-0 z-[40000] flex items-end bg-[radial-gradient(circle_at_50%_12%,rgba(74,222,128,0.12),transparent_32%),rgba(0,0,0,0.78)] px-3 pb-[calc(var(--safe-area-bottom)+54px)]"
          onClick={() => setShowJoinedModal(false)}
        >
          <div
            className="mx-auto w-full max-w-[430px] overflow-hidden rounded-[28px] border border-white/8 bg-[radial-gradient(circle_at_18%_-18%,rgba(74,222,128,0.13),transparent_38%),linear-gradient(180deg,rgba(12,18,14,0.99),rgba(4,6,5,0.995))] shadow-[0_-26px_80px_rgba(0,0,0,0.62),0_0_0_1px_rgba(74,222,128,0.05),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative border-b border-white/8 px-5 pb-4 pt-4">
              <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(74,222,128,0.62),rgba(56,189,248,0.26),transparent)]" />
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/18" />
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-[#4ade80]/20 bg-[#4ade80]/10 text-[#86efac] shadow-[0_14px_30px_rgba(74,222,128,0.08),inset_0_1px_0_rgba(255,255,255,0.055)]">
                      <Users size={19} />
                    </span>
                    <div className="min-w-0">
                      <p className="mb-0.5 truncate text-[10px] font-black uppercase tracking-[0.16em] text-[#86efac]">
                        Community run
                      </p>
                      <h3 className="truncate text-[18px] font-black leading-tight text-white">
                        Joined members
                      </h3>
                      <p className="mt-0.5 truncate text-xs font-bold text-[#94a3b8]">
                        {challenge.titleTop} {challenge.titleAccent}
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowJoinedModal(false)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/8 bg-white/[0.045] text-[#94a3b8] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors active:text-white"
                  aria-label="Close joined users"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="max-h-[58dvh] overflow-y-auto px-4 py-3.5">
              {joinPreview.length === 0 ? (
                <div className="rounded-[24px] border border-white/8 bg-white/[0.035] px-4 py-8 text-center">
                  <p className="text-sm font-black text-white">
                    No one joined yet
                  </p>
                  <p className="mt-1 text-xs font-bold text-[#94a3b8]">
                    The first join will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {challenge.joinedCount > joinPreview.length ? (
                    <p className="rounded-full border border-white/8 bg-white/[0.035] px-3 py-2 text-xs font-bold text-[#94a3b8]">
                      Showing the live preview from the room summary.{" "}
                      {challenge.joinedCount - joinPreview.length} more joined.
                    </p>
                  ) : null}
                  {joinPreview.map((user) => (
                    <article
                      key={user.id}
                      className="flex items-center gap-3 rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.026))] px-3 py-3 shadow-[0_14px_30px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.045)]"
                    >
                      <Avatar
                        src={user.avatarUrl || ""}
                        alt={user.displayName || user.username}
                        fallbackText={
                          user.displayName || user.username || "Dare User"
                        }
                        size={42}
                        userId={user.id}
                        username={user.username}
                        disableRealtime
                        style={{
                          border: "2px solid rgba(5,8,6,0.96)",
                          boxShadow:
                            "0 0 0 1px rgba(74,222,128,0.28), 0 12px 24px rgba(0,0,0,0.28)",
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-black leading-tight text-white">
                          {user.id === currentUser?.id
                            ? "You"
                            : user.displayName || user.username}
                        </p>
                        <p className="mt-0.5 truncate text-xs font-bold text-[#94a3b8]">
                          @{(user.username || "dareuser").replace(/^@/, "")}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-[#4ade80]/18 bg-[#4ade80]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-[#bbf7d0] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
                        Joined
                      </span>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
