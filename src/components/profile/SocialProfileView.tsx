"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Camera,
  ChevronRight,
  Heart,
  Menu,
  Play,
  Search,
  Sparkles,
} from "lucide-react";
import styles from "./SocialProfileView.module.css";
import {
  DEFAULT_STICKMAN_CUSTOMIZATION,
  STICKMAN_ACCESSORY_OPTIONS,
  type StickmanCustomization,
} from "../../services/stickmanCustomizationService";
import {
  DefaultAvatarArtwork,
  DefaultStickmanHeadArtwork,
  isPlaceholderAvatarUrl,
} from "../ui/Avatar";

type ProfilePost = {
  id: string;
  content?: string;
  media?: { type?: string; url?: string; thumbnail?: string };
  likes?: number;
};

type ProfileTruth = {
  id: string;
  challengerId?: string;
  receiverId?: string;
  question?: string;
  answer?: string;
  state?: string;
  createdAt?: string;
  challenger?: { nickname?: string; avatar?: string };
  receiver?: { nickname?: string; avatar?: string };
};

type ProfileDare = {
  id: string;
  description?: string;
  proof?: { type?: string; url?: string; thumbnail?: string };
  challenger?: { nickname?: string; avatar?: string };
  receiver?: { nickname?: string; avatar?: string };
  createdAt?: string;
};

type FriendFace = {
  id?: string;
  name?: string;
  avatar?: string;
};

type LivingStatusKind =
  | "offline"
  | "online"
  | "prediction"
  | "dare"
  | "court"
  | "jail"
  | "celebrating";

type SocialProfileViewProps = {
  username: string;
  name: string;
  bio?: string | null;
  avatarUrl?: string | null;
  aura: number;
  friendsCount: number;
  profileUserId?: string;
  posts: ProfilePost[];
  truths: ProfileTruth[];
  dares: ProfileDare[];
  backedOutCount?: number;
  activeTab: "posts" | "drama";
  onTabChange: (tab: "posts" | "drama") => void;
  onOpenPost: (postId: string) => void;
  onOpenTruth: (truthId: string) => void;
  onOpenDare: (dareId: string) => void;
  onOpenFriends?: () => void;
  onOpenRelationships?: () => void;
  onOpenAura?: () => void;
  onOpenAvatar?: () => void;
  onChangeAvatar?: () => void;
  onOpenMenu?: () => void;
  onSearch?: () => void;
  onLogout?: () => void;
  topbarAccessory?: ReactNode;
  showTopbar?: boolean;
  isOwnProfile?: boolean;
  canSeeContent?: boolean;
  statusLabel?: string;
  statusKind?: LivingStatusKind;
  friendFaces?: FriendFace[];
  actions?: ReactNode;
  stickmanCustomization?: StickmanCustomization;
  onOpenStickmanCustomization?: () => void;
};

const formatCount = (value: number) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 10_000) return `${Math.round(value / 1_000)}k`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return Math.max(0, value).toLocaleString();
};

const cleanUsername = (value: string) => value.replace(/^@/, "");

function ResilientAvatarImage({
  src,
  alt,
  className = "",
  fallbackArtwork,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackArtwork?: ReactNode;
}) {
  const usableSrc = isPlaceholderAvatarUrl(src) ? "" : src?.trim() || "";
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [usableSrc]);

  if (!usableSrc || failed) {
    return fallbackArtwork || <DefaultAvatarArtwork className={className} label={`${alt} default avatar`} />;
  }

  return (
    <img
      src={usableSrc}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

function LivingStatus({
  label,
  kind,
  avatarUrl,
  name,
  customization = DEFAULT_STICKMAN_CUSTOMIZATION,
  onOpenCustomization,
}: {
  label: string;
  kind: LivingStatusKind;
  avatarUrl?: string | null;
  name: string;
  customization?: StickmanCustomization;
  onOpenCustomization?: () => void;
}) {
  return (
    <div
      className={`${styles.statusStage} ${onOpenCustomization ? styles.statusStageInteractive : ""}`}
      aria-label={onOpenCustomization ? "Customize your stickman" : `Current status: ${label}`}
      role={onOpenCustomization ? "button" : undefined}
      tabIndex={onOpenCustomization ? 0 : undefined}
      onClick={onOpenCustomization}
      onKeyDown={(event) => {
        if (onOpenCustomization && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onOpenCustomization();
        }
      }}
    >
      <div>
        <div className={styles.statusKicker}>living status</div>
        <div className={styles.statusLabel}>{label}</div>
      </div>
      <StatusCharacter kind={kind} avatarUrl={avatarUrl} name={name} customization={customization} />
      <svg
        className={styles.stickman}
        viewBox="0 0 170 112"
        fill="none"
        data-status-kind={kind}
        aria-hidden="true"
      >
        <path d="M18 92h136" stroke="rgba(244,240,232,.28)" strokeWidth="2" strokeLinecap="round" />
        {kind === "offline" ? (
          <>
            <path d="M127 12a15 15 0 1 0 14 21 17 17 0 1 1-14-21Z" fill="#facc15" />
            <path d="M50 74c7-17 23-23 38-15 12 6 16 19 24 24 8 6 22 5 29 9" stroke="#f8fafc" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="66" cy="61" r="18" stroke="#f8fafc" strokeWidth="3.2" />
            <path d="M58 59c2 2 4 2 6 0m5 2c2 2 4 2 6 0M60 68c4 3 8 3 12 0" stroke="#f8fafc" strokeWidth="2" strokeLinecap="round" />
            <path d="M88 77c-11 4-20 11-29 15m54-7 20 7" stroke="#f8fafc" strokeWidth="3.2" strokeLinecap="round" />
            <path d="M38 51l5-5 3 6m-6-12h8m-2-9h8" stroke="#facc15" strokeWidth="2" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="82" cy="35" r="15" stroke="#f8fafc" strokeWidth="3.2" />
            <path d="M82 50v29m0-18-22 13m22-13 22 13M82 79 67 94m15-15 17 15" stroke="#f8fafc" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
            {kind === "online" && <path d="M104 74c18-16 21-29 9-35m0 0-1 11m1-11-10 4" stroke="#facc15" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
            {kind === "prediction" && <><circle cx="113" cy="67" r="16" stroke="#facc15" strokeWidth="3" /><path d="m105 67 6 5 11-13" stroke="#facc15" strokeWidth="2" /></>}
            {kind === "dare" && <><path d="M46 80h22m-15 8h12M96 55l20-9" stroke="#facc15" strokeWidth="3" strokeLinecap="round" /><path d="m111 40 10 5-7 9" stroke="#facc15" strokeWidth="2.5" /></>}
            {kind === "court" && <><path d="m105 55 22 22m-28-29 12-12 10 10-12 12zM116 82h25" stroke="#facc15" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></>}
            {kind === "jail" && <><path d="M50 16v78m21-78v78m22-78v78m21-78v78" stroke="#facc15" strokeWidth="2.2" opacity=".8" /><path d="M44 18h78M44 91h78" stroke="#facc15" strokeWidth="3" /></>}
            {kind === "celebrating" && <><path d="M82 61 57 39m25 22 27-22M48 29l-5-9m16 12 3-11m57 8 6-8m-18 12-2-11" stroke="#facc15" strokeWidth="3" strokeLinecap="round" /><circle cx="44" cy="38" r="2" fill="#facc15" /><circle cx="122" cy="40" r="2" fill="#facc15" /></>}
          </>
        )}
        <circle cx="108" cy="27" r="1.8" fill="#f8fafc" />
        <circle cx="150" cy="48" r="1.4" fill="#f8fafc" />
        <circle cx="97" cy="40" r="1.2" fill="#f8fafc" />
      </svg>
    </div>
  );
}

function StatusCharacter({
  kind,
  avatarUrl,
  name,
  customization = DEFAULT_STICKMAN_CUSTOMIZATION,
}: {
  kind: LivingStatusKind;
  avatarUrl?: string | null;
  name: string;
  customization?: StickmanCustomization;
}) {
  const poseByKind: Record<LivingStatusKind, number> = {
    offline: 0,
    online: 1,
    prediction: 2,
    dare: 3,
    court: 4,
    jail: 4,
    celebrating: 4,
  };
  const colors = ["#4ade80", "#38bdf8", "#fb7185", "#facc15", "#c084fc"];
  const pose = poseByKind[kind];
  const color = colors[pose % colors.length];
  const accessory = STICKMAN_ACCESSORY_OPTIONS.find(
    (option) => option.id === customization.accessoryId,
  );

  return (
    <div
      className={`${styles.statusCharacter} ${styles.chatPresenceFigure} ${styles[`customAnimation${customization.animationId}`] || ""}`}
      data-status-kind={kind}
      data-pose={pose}
      aria-hidden="true"
    >
      <div className={styles.chatPresenceInner}>
        {accessory && accessory.id !== "none" && (
          <span className={`${styles.customAccessory} ${styles[`accessory${accessory.id}`]}`} aria-hidden="true">
            {accessory.glyph}
          </span>
        )}
        <div className={styles.chatPresenceHead} style={{ borderColor: color }}>
          <ResilientAvatarImage
            src={avatarUrl}
            alt={`${name}'s stickman head`}
            fallbackArtwork={<DefaultStickmanHeadArtwork label={`${name}'s default stickman head`} />}
          />
        </div>
        <div className={styles.chatPresenceBody}>
          <span className={styles.chatPresenceSpine} />
          <span className={`${styles.chatPresenceArm} ${styles.chatPresenceArmLeft}`} />
          <span className={`${styles.chatPresenceArm} ${styles.chatPresenceArmRight}`} />
          <span className={styles.chatPresenceLegLeft} />
          <span className={styles.chatPresenceLegRight} />
        </div>
      </div>
      <span className={styles.chatPresenceName}>{name}</span>
    </div>
  );
}

function Face({ face, fallback }: { face?: FriendFace; fallback: string }) {
  return (
    <span className={styles.miniAvatar} title={face?.name || fallback}>
      <ResilientAvatarImage
        src={face?.avatar}
        alt={face?.name || fallback || "Friend"}
      />
    </span>
  );
}

export function SocialProfileView({
  username,
  name,
  bio,
  avatarUrl,
  aura,
  friendsCount,
  profileUserId,
  posts,
  truths,
  dares,
  backedOutCount = 0,
  activeTab,
  onTabChange,
  onOpenPost,
  onOpenTruth,
  onOpenDare,
  onOpenFriends,
  onOpenRelationships,
  onOpenAura,
  onOpenAvatar,
  onChangeAvatar,
  onOpenMenu,
  onSearch,
  onLogout,
  topbarAccessory,
  showTopbar = true,
  isOwnProfile = false,
  canSeeContent = true,
  statusLabel = "laying low",
  statusKind = "offline",
  friendFaces = [],
  actions,
  stickmanCustomization = DEFAULT_STICKMAN_CUSTOMIZATION,
  onOpenStickmanCustomization,
}: SocialProfileViewProps) {
  const normalizedUsername = cleanUsername(username || "user");
  const approvedTruths = truths
    .filter((truth) => !truth.state || truth.state === "APPROVED")
    .slice()
    .sort((a, b) => {
      const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
      return bTime - aTime;
    });
  const authoredTruths = profileUserId
    ? approvedTruths.filter((truth) => truth.challengerId === profileUserId)
    : approvedTruths;
  const receivedTruths = profileUserId
    ? approvedTruths.filter((truth) => truth.receiverId === profileUserId)
    : [];
  const loreTruths = Array.from(
    new Map(
      [...receivedTruths, ...authoredTruths].map((truth) => [truth.id, truth]),
    ).values(),
  );
  const latestReceivedTruth = receivedTruths[0];
  const latestAuthoredTruth = authoredTruths[0];
  const verdictHeadings = authoredTruths
    .map((truth) => truth.question?.trim())
    .filter((question): question is string => Boolean(question));
  const latestDare = dares[0];
  const socialFaces = friendFaces.slice(0, 3);
  const resolvedStatusKind: LivingStatusKind =
    statusKind !== "offline"
      ? statusKind
      : latestDare
        ? "celebrating"
        : latestAuthoredTruth || latestReceivedTruth
          ? "prediction"
          : "offline";
  const resolvedStatusLabel =
    statusLabel !== "laying low"
      ? statusLabel
      : latestDare
        ? "just cleared a dare"
        : latestAuthoredTruth || latestReceivedTruth
          ? "making a call"
          : "laying low";

  return (
    <section
      className={`${styles.profile} ${showTopbar ? styles.withTopbar : styles.withoutTopbar}`}
      aria-label={`${name}'s profile`}
    >
      {showTopbar && (
        <header className={styles.topbar}>
          <span className={styles.handle}>@{normalizedUsername}</span>
          <div className={styles.topbarActions}>
            {topbarAccessory}
            {onSearch && (
              <button className={styles.iconButton} onClick={onSearch} aria-label="Find people">
                <Search size={19} strokeWidth={2.3} />
              </button>
            )}
            {onOpenMenu && (
              <button className={styles.iconButton} onClick={onOpenMenu} aria-label="Profile settings">
                <Menu size={21} strokeWidth={2.4} />
              </button>
            )}
          </div>
        </header>
      )}

      <div className={styles.identityShell}>
        <div className={styles.identityStage}>
        <div
          className={styles.portraitButton}
          onClick={onOpenAvatar}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpenAvatar?.();
            }
          }}
          role="button"
          tabIndex={0}
        >
          <ResilientAvatarImage
            src={avatarUrl}
            alt={`${name}'s profile`}
          />
          {isOwnProfile && onChangeAvatar && (
            <button
              className={styles.cameraBadge}
              type="button"
              aria-label="Change profile photo"
              onClick={(event) => {
                event.stopPropagation();
                onChangeAvatar();
              }}
            >
              <Camera size={14} strokeWidth={2.7} />
            </button>
          )}
        </div>
          <LivingStatus
          label={resolvedStatusLabel}
          kind={resolvedStatusKind}
          avatarUrl={avatarUrl}
          name={name}
            customization={stickmanCustomization}
            onOpenCustomization={isOwnProfile ? onOpenStickmanCustomization : undefined}
        />
        </div>

        <div className={styles.identityCopy}>
          <h1 className={styles.name}>{name}</h1>
          <p className={styles.username}>@{normalizedUsername}</p>
          <p className={styles.bio}>{bio?.trim() || "here for the plot"}</p>
          {actions && <div className={styles.inlineActions}>{actions}</div>}
        </div>
      </div>

      <div className={styles.stats} aria-label="Profile stats">
        <button
          className={styles.statButton}
          type="button"
          onClick={onOpenAura}
          disabled={!onOpenAura}
          aria-label={`Open Aura details. Aura ${Math.max(0, aura).toLocaleString()}`}
        >
          <span className={`${styles.statValue} ${styles.auraValue}`}>
            {Math.max(0, aura).toLocaleString()}
          </span>
          <span className={styles.statLabel}>Aura</span>
        </button>
        <button className={styles.statButton} type="button" onClick={() => onTabChange("posts")}>
          <span className={styles.statValue}>{formatCount(posts.length)}</span>
          <span className={styles.statLabel}>Posts</span>
        </button>
        <button className={styles.statButton} type="button" onClick={onOpenFriends} disabled={!onOpenFriends}>
          <span className={styles.statValue}>{formatCount(friendsCount)}</span>
          <span className={styles.statLabel}>Friends</span>
        </button>
      </div>

      <nav className={styles.tabs} aria-label="Profile content">
        <button
          className={`${styles.tab} ${activeTab === "posts" ? styles.tabActive : ""}`}
          onClick={() => onTabChange("posts")}
          aria-selected={activeTab === "posts"}
          role="tab"
        >
          Posts
        </button>
        <button
          className={`${styles.tab} ${activeTab === "drama" ? styles.tabActive : ""}`}
          onClick={() => onTabChange("drama")}
          aria-selected={activeTab === "drama"}
          role="tab"
        >
          Drama
        </button>
      </nav>

      {!canSeeContent ? (
        <div className={styles.locked}>
          <div>
            <Sparkles size={28} strokeWidth={1.7} />
            <p className={styles.emptyTitle}>Close friends only</p>
            <p className={styles.emptyCopy}>Become friends to see their posts, drama, and shared lore.</p>
          </div>
        </div>
      ) : activeTab === "posts" ? (
        posts.length ? (
          <div className={styles.gallery} role="tabpanel">
            {posts.map((post) => (
              <button
                key={post.id}
                className={styles.galleryItem}
                type="button"
                onClick={() => onOpenPost(post.id)}
                aria-label="Open post"
              >
                {post.media?.url ? (
                  <img src={post.media.url} alt={post.content || "Profile post"} />
                ) : (
                  <span className={styles.textPost}>{post.content || "A moment from the group"}</span>
                )}
                {post.media?.type === "video" && (
                  <span className={styles.mediaType}><Play size={13} fill="currentColor" /></span>
                )}
                <span className={styles.engagement}>
                  <Heart size={13} strokeWidth={2.3} /> {formatCount(post.likes || 0)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState} role="tabpanel">
            <div>
              <Camera size={31} strokeWidth={1.6} />
              <p className={styles.emptyTitle}>No posts yet</p>
              <p className={styles.emptyCopy}>{isOwnProfile ? "Your first real moment can start here." : "Their next moment will land here."}</p>
            </div>
          </div>
        )
      ) : (
        <div className={styles.drama} role="tabpanel">
          <button className={styles.storyBand} type="button" onClick={() => latestReceivedTruth && onOpenTruth(latestReceivedTruth.id)}>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionLabel}>Truths</span>
              <span className={styles.sectionCount}>{receivedTruths.length} received</span>
            </div>
            <div className={styles.verdictLayout}>
              <div>
                <h2 className={`${styles.storyTitle} ${styles.verdictHeadings}`}>
                  {receivedTruths.length
                    ? receivedTruths
                        .map((truth) => truth.question?.trim())
                        .filter((question): question is string => Boolean(question))
                        .slice(0, 3)
                        .join(", ") || "A question is waiting."
                    : "No questions received yet."}
                </h2>
                <p className={styles.verdictTapPrompt}>questions from your orbit · tap to open</p>
              </div>
            </div>
          </button>

          <button className={`${styles.storyBand} ${styles.dareBand}`} type="button" onClick={() => latestDare && onOpenDare(latestDare.id)}>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionLabel}>Dares</span>
              <span className={styles.sectionCount}>{dares.length} survived</span>
            </div>
            <div className={styles.dareLayout}>
              <div className={styles.dareCopy}>
                <h2 className={styles.storyTitle}>{latestDare?.description || "No proof on the wall"}</h2>
                <span className={styles.dareMeta}>tap into the full dare <ChevronRight size={12} /></span>
              </div>
              <div className={styles.dareMedia}>
                {latestDare?.proof?.url ? (
                  <img src={latestDare.proof.thumbnail || latestDare.proof.url} alt="Dare proof" />
                ) : (
                  <span className={styles.textPost}>The next dare could become the story.</span>
                )}
              </div>
            </div>
          </button>

          <div className={styles.storyBand}>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionLabel}>Lore</span>
              <span className={styles.sectionCount}>friend-group history</span>
            </div>
            <div className={styles.loreNotes}>
              {(loreTruths.length ? loreTruths : [{ id: "empty", question: "the lore is still being written" }]).map((truth) => (
                <button key={truth.id} className={styles.loreNote} type="button" onClick={() => truth.id !== "empty" && onOpenTruth(truth.id)}>
                  <span className={styles.loreNoteTitle}>{truth.question}</span>
                  <span className={styles.loreNoteCopy}>
                    {truth.answer
                      ? `Answer: ${truth.answer}`
                      : truth.id === "empty"
                        ? "Questions, answers, and friend-group history will collect here."
                        : `Waiting on ${truth.receiver?.nickname || "their friend"} to answer.`}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <button className={styles.storyBand} type="button" onClick={() => latestAuthoredTruth && onOpenTruth(latestAuthoredTruth.id)}>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionLabel}>Verdicts</span>
              <span className={styles.sectionCount}>{authoredTruths.length} posted</span>
            </div>
            <div className={styles.verdictLayout}>
              <div>
                <h2 className={`${styles.storyTitle} ${styles.verdictHeadings}`}>
                  {verdictHeadings.length ? verdictHeadings.join(", ") : "No verdicts. Yet."}
                </h2>
                <p className={styles.verdictTapPrompt}>your calls, at the end of the story</p>
              </div>
            </div>
          </button>
        </div>
      )}

      <section className={styles.socialSection}>
        <span className={styles.sectionLabel}>Social DNA</span>
        <button className={styles.socialRow} type="button" onClick={onOpenRelationships} disabled={!onOpenRelationships}>
          <span className={styles.socialFaces} aria-hidden="true">
            {(socialFaces.length ? socialFaces : [{ name: name }, { name: "?" }, { name: "?" }]).map((face, index) => (
              <Face key={face.id || `${face.name}-${index}`} face={face} fallback="?" />
            ))}
          </span>
          <span className={styles.socialCopy}>
            <span className={styles.socialTitle}>{friendsCount ? `${formatCount(friendsCount)} people in the orbit` : "No labels yet"}</span>
            <span className={styles.socialHint}>Besties, rivals, and everything in between</span>
          </span>
          <ChevronRight size={18} color="#fb7185" />
        </button>
        <p className={styles.historyLine}>{dares.length} dares survived · {authoredTruths.length} verdicts · {backedOutCount} backed out</p>
        {onLogout && (
          <div className={styles.utilityRow}>
            {onLogout && (
              <button type="button" onClick={onLogout}>Log out</button>
            )}
          </div>
        )}
      </section>
    </section>
  );
}

export const socialProfileActionClass = styles.actionButton;
export const socialProfilePrimaryActionClass = `${styles.actionButton} ${styles.actionButtonPrimary}`;
