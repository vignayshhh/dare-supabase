import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Unsubscribe } from "@/types/realtime";
import { scheduleRefresh } from "@/lib/realtime/scheduleRefresh";
import type {
  CommunityChallenge,
  CommunityJoinPreviewUser,
} from "@/components/screens/communityChallengeData";

export type CommunityChallengeSummary = {
  challengeId: string;
  joinedCount: number;
  waitingCount: number;
  activeCount: number;
  completedCount: number;
  eliminatedCount: number;
  joinPreview: CommunityJoinPreviewUser[];
  extraFriends: number;
  batchStatus: "open" | "waiting" | "started";
  minRequiredMembers: number;
  registrationStartedAtMs: number | null;
  registrationEndsAtMs: number | null;
  batchStartedAtMs: number | null;
};

export type CommunityChallengeJoinStatus =
  | "waiting"
  | "active"
  | "submitted"
  | "completed"
  | "eliminated";

export type CommunityChallengeJoin = {
  id: string;
  challengeId: string;
  challengeTitle: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  status: CommunityChallengeJoinStatus;
  currentDay: number;
  totalDays: number;
  proofDueAtMs: number | null;
  joinedAtMs: number;
  lastProofDay: number;
  lastProofAtMs: number | null;
  eliminatedAtMs: number | null;
  completedAtMs: number | null;
  eliminationReason: string;
  officialDare: boolean;
};

export type CommunityChallengeJoinedUser = CommunityJoinPreviewUser & {
  status: CommunityChallengeJoinStatus;
  joinedAtMs: number;
};

type CommunityJoinUser = {
  id: string;
  username?: string;
  displayName?: string;
  avatar?: string;
};

export type CustomCommunityChallengeDraft = {
  title: string;
  description: string;
  durationDays: number;
  thumbnailUrl?: string;
};

const getJoinDocId = (challengeId: string, userId: string) =>
  `${challengeId}_${userId}`;

const PROOF_WINDOW_HOURS = 24;
const MIN_REQUIRED_MEMBERS = 2;
const SUMMARY_FIELDS = "id,custom_dare,challenge_id,title_top,title_accent,description,duration_days,creator_id,creator_username,creator_display_name,creator_avatar_url,image_url,image_position,banner,proof_label,proof_files,joined_count,waiting_count,active_count,completed_count,eliminated_count,join_preview,extra_friends,batch_status,min_required_members,registration_started_at,registration_ends_at,batch_started_at,created_at,updated_at";
const JOIN_FIELDS = "id,challenge_id,challenge_title,user_id,username,display_name,avatar_url,status,current_day,total_days,proof_due_at,proof_window_hours,last_proof_day,last_proof_at,eliminated_at,completed_at,elimination_reason,official_dare,created_at,updated_at";
let realtimeChannelSequence = 0;
const uniqueRealtimeChannelName = (base: string) =>
  `${base}:${++realtimeChannelSequence}`;

const normalizeUsername = (username: string | undefined) =>
  (username || "dareuser").replace(/^@/, "").trim().slice(0, 40) ||
  "dareuser";

const toMillis = (value: any): number | null => {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") return new Date(value).getTime() || null;
  return null;
};

const parseDurationDays = (durationLabel: string | undefined) => {
  const match = String(durationLabel || "").match(/(\d+)/);
  return Math.min(365, Math.max(1, Number(match?.[1] || 7)));
};

const sanitizeText = (value: string | undefined, maxLength: number) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const formatStartedAt = (createdAtMs: number | null) => {
  const date = createdAtMs ? new Date(createdAtMs) : new Date();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const customChallengeBanner =
  "radial-gradient(circle at 18% 18%, rgba(74,222,128,0.34), transparent 24%), radial-gradient(circle at 82% 22%, rgba(56,189,248,0.24), transparent 25%), repeating-linear-gradient(120deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 17px), linear-gradient(145deg, rgba(8,22,13,0.98), rgba(4,8,5,1) 54%, rgba(10,34,42,0.94))";

const normalizeSummary = (
  challengeId: string,
  data: any,
): CommunityChallengeSummary => {
  const joinPreview = Array.isArray(data?.join_preview)
    ? data.join_preview
        .slice(0, 3)
        .map((entry: any): CommunityJoinPreviewUser => ({
          id: String(entry.user_id || entry.id || ""),
          username: normalizeUsername(entry.username),
          displayName:
            String(entry.display_name || entry.displayName || entry.username || "Dare User")
              .trim()
              .slice(0, 80) || "Dare User",
          avatarUrl: String(entry.avatar_url || entry.avatarUrl || ""),
        }))
        .filter((entry: CommunityJoinPreviewUser) => entry.id)
    : [];

  const rawJoinedCount = Math.max(0, Number(data?.joined_count || 0));
  const rawBatchStatus = String(data?.batch_status || "");
  const batchStatus =
    rawBatchStatus === "started"
      ? "started"
      : rawJoinedCount > 0
        ? "waiting"
        : "open";
  const waitingCount =
    batchStatus === "started"
      ? Math.max(0, Number(data?.waiting_count || 0))
      : rawJoinedCount;

  return {
    challengeId,
    joinedCount: waitingCount,
    waitingCount,
    activeCount: Math.max(
      0,
      batchStatus === "started"
        ? Number(data?.active_count ?? rawJoinedCount - Number(data?.eliminated_count || 0))
        : Number(data?.active_count ?? 0),
    ),
    completedCount: Math.max(0, Number(data?.completed_count || 0)),
    eliminatedCount: Math.max(0, Number(data?.eliminated_count || 0)),
    joinPreview,
    extraFriends: Math.max(
      0,
      Number(data?.extra_count ?? waitingCount - joinPreview.length),
    ),
    batchStatus,
    minRequiredMembers: MIN_REQUIRED_MEMBERS,
    registrationStartedAtMs: toMillis(data?.registration_started_at),
    registrationEndsAtMs: toMillis(data?.registration_ends_at),
    batchStartedAtMs: toMillis(data?.batch_started_at),
  };
};

const normalizeJoin = (id: string, data: any): CommunityChallengeJoin => {
  const status = [
    "waiting",
    "active",
    "submitted",
    "completed",
    "eliminated",
  ].includes(data?.status)
    ? (data.status as CommunityChallengeJoinStatus)
    : "active";
  const currentDay = Math.max(1, Number(data?.current_day || 1));
  const totalDays = Math.max(currentDay, Number(data?.total_days || 7));
  const displayName =
    String(data?.display_name || data?.username || "Dare User")
      .trim()
      .slice(0, 80) || "Dare User";
  const joinedAtMs = toMillis(data?.joined_at || data?.created_at) || Date.now();
  const proofDueAtMs =
    status === "waiting"
      ? null
      : toMillis(data?.proof_due_at) ||
        joinedAtMs + PROOF_WINDOW_HOURS * 60 * 60 * 1000;

  return {
    id,
    challengeId: String(data?.challenge_id || ""),
    challengeTitle: String(data?.challenge_title || "Community Dare"),
    userId: String(data?.user_id || ""),
    username: normalizeUsername(data?.username),
    displayName,
    avatarUrl: String(data?.avatar_url || ""),
    status,
    currentDay,
    totalDays,
    proofDueAtMs,
    joinedAtMs,
    lastProofDay: Math.max(0, Number(data?.last_proof_day || 0)),
    lastProofAtMs: toMillis(data?.last_proof_at),
    eliminatedAtMs: toMillis(data?.eliminated_at),
    completedAtMs: toMillis(data?.completed_at),
    eliminationReason: String(
      data?.elimination_reason || "Missed the 24-hour proof window.",
    ),
    officialDare: data?.official_dare !== false,
  };
};

const normalizeCustomChallenge = (
  id: string,
  data: any,
): CommunityChallenge | null => {
  if (data?.custom_dare !== true) return null;

  const summary = normalizeSummary(id, data);
  const title = sanitizeText(data?.title || data?.title_top, 90);
  if (!title) return null;

  const durationDays = Math.min(
    365,
    Math.max(1, Number(data?.duration_days || parseDurationDays(data?.duration_label))),
  );
  const creatorUsername = normalizeUsername(data?.creator_username);
  const creatorName =
    sanitizeText(data?.creator_display_name || data?.creator_name || creatorUsername, 80) ||
    "Dare User";
  const createdAtMs = toMillis(data?.created_at) || Number(data?.created_at_ms || 0) || null;

  return {
    id,
    customDare: true,
    typeLabel: `Created by @${creatorUsername}`,
    countdown: "48:00:00",
    batchStatus: summary.batchStatus,
    minRequiredMembers: summary.minRequiredMembers,
    registrationEndsAtMs: summary.registrationEndsAtMs,
    batchStartedAtMs: summary.batchStartedAtMs,
    titleTop: title,
    titleAccent: `for ${durationDays} ${durationDays === 1 ? "day" : "days"}`,
    joinedCount: summary.joinedCount,
    friendNames: summary.joinPreview.map((entry) => entry.displayName),
    joinPreview: summary.joinPreview,
    extraFriends: summary.extraFriends,
    survivors: summary.activeCount,
    eliminated: summary.eliminatedCount,
    accent: sanitizeText(data?.accent, 24) || "#4ade80",
    secondaryAccent: sanitizeText(data?.secondary_accent, 24) || "#38bdf8",
    imageUrl: sanitizeText(data?.image_url, 2000),
    imagePosition: sanitizeText(data?.image_position, 80) || "center",
    banner: sanitizeText(data?.banner, 1600) || customChallengeBanner,
    description:
      sanitizeText(data?.description, 700) ||
      "Join this community dare and submit proof before the daily window closes.",
    startedAt: formatStartedAt(createdAtMs),
    durationLabel: `${durationDays} ${durationDays === 1 ? "day" : "days"}`,
    creatorName,
    creatorUsername,
    creatorAvatar: sanitizeText(data?.creator_avatar_url, 2000),
    sponsoredByDare: false,
    proofLabel: sanitizeText(data?.proof_label, 80) || "Challenge proof",
    proofFiles: Array.isArray(data?.proof_files)
      ? data.proof_files
          .map((file: any) => sanitizeText(file, 80))
          .filter(Boolean)
          .slice(0, 4)
      : ["Daily photo or video proof"],
    icon: "spark",
  };
};

class CommunityChallengeService {
  subscribeToCustomChallenges(
    callback: (challenges: CommunityChallenge[]) => void,
  ): Unsubscribe {
    const client = getSupabaseBrowserClient(); let active = true;
    const load = async () => {
      const { data, error } = await client.from("community_challenge_summaries").select(SUMMARY_FIELDS).eq("custom_dare", true).order("updated_at", { ascending: false }).limit(40);
      if (!active) return;
      if (error) { callback([]); return; }
      const challenges = (data ?? [])
          .map((summary) => normalizeCustomChallenge(summary.id, summary))
          .filter((challenge): challenge is CommunityChallenge => Boolean(challenge))
          .sort((a, b) => {
            const aMs = a.registrationStartedAtMs || 0;
            const bMs = b.registrationStartedAtMs || 0;
            return bMs - aMs;
          });
      callback(challenges);
    };
    void load();
    const refresh = scheduleRefresh(() => void load());
    const channel = client.channel(uniqueRealtimeChannelName("community-challenge-summaries")).on("postgres_changes", { event: "*", schema: "public", table: "community_challenge_summaries", filter: "custom_dare=eq.true" }, () => { refresh.schedule(); }).subscribe();
    return () => { active = false; refresh.cancel(); void client.removeChannel(channel); };
  }

  async createCustomChallenge(
    draft: CustomCommunityChallengeDraft,
    user: CommunityJoinUser,
  ): Promise<{ success: true; challenge: CommunityChallenge } | { success: false; error: string }> {
    if (!user.id) {
      return { success: false, error: "You must be signed in to start a community dare." };
    }

    const title = sanitizeText(draft.title, 90);
    const description = sanitizeText(draft.description, 700);
    const durationDays = Math.min(365, Math.max(1, Number(draft.durationDays || 7)));

    if (title.length < 4) {
      return { success: false, error: "Add a clearer dare title." };
    }
    if (description.length < 12) {
      return { success: false, error: "Add a short dare description." };
    }

    try {
      const { data: sessionData } = await getSupabaseBrowserClient().auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        return { success: false, error: "You must be signed in to start a community dare." };
      }

      const response = await fetch("/api/community/dares", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          description,
          durationDays,
          thumbnailUrl: draft.thumbnailUrl || "",
          creatorUsername: user.username || "",
          creatorDisplayName: user.displayName || user.username || "Dare User",
          creatorAvatarUrl: user.avatar || "",
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success || !payload?.challenge) {
        const serverError =
          typeof payload?.error === "string"
            ? payload.error
            : typeof payload?.message === "string"
              ? payload.message
              : "";
        return {
          success: false,
          error: serverError || "Unable to start this community dare.",
        };
      }

      return { success: true, challenge: payload.challenge as CommunityChallenge };
    } catch (error) {
      console.warn("Failed to create custom community challenge:", error);
      return { success: false, error: "Unable to start this community dare." };
    }
  }

  subscribeToSummaries(
    challengeIds: string[],
    callback: (summaries: Record<string, CommunityChallengeSummary>) => void,
  ): Unsubscribe {
    const uniqueIds = Array.from(new Set(challengeIds)).filter(Boolean);
    if (uniqueIds.length === 0) {
      callback({});
      return () => {};
    }

    const client = getSupabaseBrowserClient(); let active = true;
    let summaries: Record<string, CommunityChallengeSummary> = {};
    const emit = () => { if (active) callback({ ...summaries }); };
    const load = async () => { const { data, error } = await client.from("community_challenge_summaries").select(SUMMARY_FIELDS).in("id", uniqueIds).limit(120); if (!active || error) return; summaries = Object.fromEntries((data ?? []).map((row) => [row.id, normalizeSummary(row.id, row)])); emit(); };
    void load();
    const channel = client.channel(uniqueRealtimeChannelName(`community-challenge-summaries:${uniqueIds.join(",")}`)).on("postgres_changes", { event: "*", schema: "public", table: "community_challenge_summaries", filter: `id=in.(${uniqueIds.join(",")})` }, (payload) => {
      if (!active) return;
      const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as Record<string, unknown> | null;
      const id = typeof row?.id === "string" ? row.id : "";
      if (!id || !uniqueIds.includes(id)) return;
      if (payload.eventType === "DELETE") {
        const next = { ...summaries };
        delete next[id];
        summaries = next;
        emit();
        return;
      }
      if (row && typeof row.joined_count !== "undefined") {
        summaries = { ...summaries, [id]: normalizeSummary(id, row) };
        emit();
      } else {
        void load();
      }
    }).subscribe();
    return () => { active = false; void client.removeChannel(channel); };
  }

  subscribeToJoinedChallengeIds(
    userId: string | undefined,
    callback: (joinedChallengeIds: Set<string>) => void,
  ): Unsubscribe {
    if (!userId) {
      callback(new Set());
      return () => {};
    }

    const client = getSupabaseBrowserClient(); let active = true;
    let joined = new Set<string>();
    const emit = () => { if (active) callback(new Set(joined)); };
    const load = async () => { const { data, error } = await client.from("community_challenge_joins").select("challenge_id,status").eq("user_id", userId).limit(100); if (!active || error) return; joined = new Set((data ?? []).filter((row) => ["waiting", "active", "submitted"].includes(String(row.status))).map((row) => String(row.challenge_id))); emit(); };
    void load(); const channel = client.channel(uniqueRealtimeChannelName(`community-challenge-joins:${userId}`)).on("postgres_changes", { event: "*", schema: "public", table: "community_challenge_joins", filter: `user_id=eq.${userId}` }, (payload) => {
      if (!active) return;
      const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as { challenge_id?: unknown; status?: unknown } | null;
      const challengeId = typeof row?.challenge_id === "string" ? row.challenge_id : "";
      if (!challengeId) { void load(); return; }
      const next = new Set(joined);
      if (payload.eventType === "DELETE" || !["waiting", "active", "submitted"].includes(String(row?.status))) next.delete(challengeId);
      else next.add(challengeId);
      joined = next;
      emit();
    }).subscribe(); return () => { active = false; void client.removeChannel(channel); };
  }

  subscribeToJoinedChallenges(
    userId: string | undefined,
    callback: (joins: CommunityChallengeJoin[]) => void,
  ): Unsubscribe {
    if (!userId) {
      callback([]);
      return () => {};
    }

    const client = getSupabaseBrowserClient(); let active = true;
    const load = async () => { const { data, error } = await client.from("community_challenge_joins").select(JOIN_FIELDS).eq("user_id", userId).order("created_at", { ascending: false }).limit(100); if (!active || error) return; callback((data ?? []).map((row) => normalizeJoin(row.id, row)).filter((join) => join.challengeId && join.status !== "waiting").sort((a,b) => b.joinedAtMs-a.joinedAtMs)); };
    const refresh = scheduleRefresh(() => void load());
    void load(); const channel = client.channel(uniqueRealtimeChannelName(`community-challenge-user:${userId}`)).on("postgres_changes", { event: "*", schema: "public", table: "community_challenge_joins", filter: `user_id=eq.${userId}` }, () => { refresh.schedule(); }).subscribe(); return () => { active = false; refresh.cancel(); void client.removeChannel(channel); };
  }

  subscribeToChallengeJoin(
    userId: string | undefined,
    challengeId: string | undefined,
    callback: (join: CommunityChallengeJoin | null) => void,
  ): Unsubscribe {
    if (!userId || !challengeId) {
      callback(null);
      return () => {};
    }

    const client = getSupabaseBrowserClient(); let active = true;
    const load = async () => {
      const { data, error } = await client.from("community_challenge_joins").select(JOIN_FIELDS).eq("challenge_id", challengeId).eq("user_id", userId).maybeSingle();
      if (!active || error) return;
      const join = data ? normalizeJoin(data.id, data) : null;
      // A finished run is history, not current membership. Treating it as joined
      // stranded a member outside every future batch for that challenge.
      callback(join && !["completed", "eliminated"].includes(join.status) ? join : null);
    };
    void load(); const channel = client.channel(uniqueRealtimeChannelName(`community-challenge-join:${challengeId}:${userId}`)).on("postgres_changes", { event: "*", schema: "public", table: "community_challenge_joins", filter: `challenge_id=eq.${challengeId}` }, () => { void load(); }).subscribe(); return () => { active = false; void client.removeChannel(channel); };
  }

  subscribeToChallengeJoinedUsers(
    challengeId: string | undefined,
    callback: (users: CommunityChallengeJoinedUser[]) => void,
  ): Unsubscribe {
    if (!challengeId) {
      callback([]);
      return () => {};
    }

    const client = getSupabaseBrowserClient(); let active = true;
    const load = async () => { const { data, error } = await client.from("community_challenge_joins").select(JOIN_FIELDS).eq("challenge_id", challengeId).order("created_at", { ascending: false }).limit(120); if (!active) return; if (error) { callback([]); return; } callback((data ?? []).map((row) => normalizeJoin(row.id, row))
            .filter((join) =>
              ["waiting", "active", "submitted"].includes(join.status),
            )
            .sort((a, b) => b.joinedAtMs - a.joinedAtMs)
            .map((join) => ({
              id: join.userId,
              username: join.username,
              displayName: join.displayName,
              avatarUrl: join.avatarUrl,
              status: join.status,
              joinedAtMs: join.joinedAtMs,
            })),
        ); };
    const refresh = scheduleRefresh(() => void load());
    void load(); const channel = client.channel(uniqueRealtimeChannelName(`community-challenge-joined:${challengeId}`)).on("postgres_changes", { event: "*", schema: "public", table: "community_challenge_joins", filter: `challenge_id=eq.${challengeId}` }, () => { refresh.schedule(); }).subscribe(); return () => { active = false; refresh.cancel(); void client.removeChannel(channel); };
  }

  async joinChallenge(
    challenge: Pick<
      CommunityChallenge,
      | "id"
      | "titleTop"
      | "titleAccent"
      | "durationLabel"
      | "creatorUsername"
      | "sponsoredByDare"
      | "batchStatus"
    >,
    user: CommunityJoinUser,
  ) {
    if (!user.id) {
      return { success: false, error: "You must be signed in to join." };
    }
    try {
      const client = getSupabaseBrowserClient();
      const joinId = getJoinDocId(challenge.id, user.id);
      const { error: joinError } = await client.rpc("join_community_challenge", {
        p_join_id: joinId,
        p_challenge_id: challenge.id,
        p_challenge_title: `${challenge.titleTop} ${challenge.titleAccent}`.trim(),
        p_user_id: user.id,
        p_username: normalizeUsername(user.username),
        p_display_name:
          (user.displayName || user.username || "Dare User").trim().slice(0, 80) ||
          "Dare User",
        p_avatar_url: user.avatar || "",
        p_total_days: parseDurationDays(challenge.durationLabel),
        p_official_dare:
          challenge.creatorUsername === "dare" &&
          challenge.sponsoredByDare === true,
      });
      if (joinError) throw joinError;

      return { success: true };
    } catch (error) {
      console.warn("Failed to join community challenge:", error);
      return { success: false, error: "Unable to join this community dare." };
    }
  }

  hydrateChallenges(
    challenges: CommunityChallenge[],
    summaries: Record<string, CommunityChallengeSummary>,
  ): CommunityChallenge[] {
    return challenges.map((challenge) => {
      const summary = summaries[challenge.id];
      if (!summary) return challenge;

      return {
        ...challenge,
        joinedCount: summary.joinedCount,
        joinPreview: summary.joinPreview,
        friendNames: summary.joinPreview.map((entry) => entry.displayName),
        extraFriends: summary.extraFriends,
        survivors: summary.activeCount,
        eliminated: summary.eliminatedCount,
        batchStatus: summary.batchStatus,
        minRequiredMembers: summary.minRequiredMembers,
        registrationEndsAtMs: summary.registrationEndsAtMs,
        batchStartedAtMs: summary.batchStartedAtMs,
      };
    });
  }
}

export const communityChallengeService = new CommunityChallengeService();
