import { circleRequestContext, getCircleMemberIds } from "@/lib/supabase/requestContext";
﻿import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { redisCache } from "@/services/redisCache.server";
import type { NativeRow } from "@/types/socialRows";
import { refreshStoredMediaUrl } from "./storedMediaUrl";

export interface CachedSocialProfile {
  id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
  verified: boolean;
}

const FRIEND_IDS_TTL_SECONDS = 300;
const EMPTY_FRIEND_IDS_TTL_SECONDS = 30;
const PROFILE_TTL_SECONDS = 30 * 60;
const VERSION_LOCAL_TTL_MS = 30_000;
export type FeedCacheKind = "feed" | "truth-feed" | "dare-feed";
const feedVersionLocalCache = new Map<string, { version: string; expiresAt: number }>();

export function toIsoString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();

  if (value && typeof value === "object") {
    const timestamp = value as {
      toDate?: () => Date;
      seconds?: number;
      nanoseconds?: number;
    };

    if (typeof timestamp.toDate === "function") {
      return timestamp.toDate().toISOString();
    }

    if (typeof timestamp.seconds === "number") {
      return new Date(
        timestamp.seconds * 1000 +
          Math.floor((timestamp.nanoseconds || 0) / 1_000_000),
      ).toISOString();
    }
  }

  return "1970-01-01T00:00:00.000Z";
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function uniqueStrings(values: Array<unknown>): string[] {
  return [
    ...new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      ),
    ),
  ];
}

function mapProfile(docId: string, data: NativeRow): CachedSocialProfile {
  const userId = typeof data.user_id === "string" ? data.user_id : docId;
  const username =
    typeof data.username === "string" && data.username.trim()
      ? data.username.trim()
      : `user_${userId.slice(-6)}`;
  const displayName =
    typeof data.display_name === "string"
      ? data.display_name
      : typeof data.displayName === "string"
        ? data.displayName
        : null;
  const nickname =
    typeof data.nickname === "string"
      ? data.nickname
      : displayName || username || userId;

  return {
    id: docId,
    user_id: userId,
    username,
    display_name: displayName,
    nickname,
    avatar_url:
      typeof data.avatar_url === "string"
        ? data.avatar_url
        : typeof data.avatarUrl === "string"
          ? data.avatarUrl
          : typeof data.avatar === "string"
            ? data.avatar
            : null,
    verified: data.verified === true,
  };
}

const refreshProfileMedia = async (profiles: Map<string, CachedSocialProfile>) => {
  const uniqueProfiles = [...new Set(profiles.values())];
  await Promise.all(uniqueProfiles.map(async (profile) => {
    profile.avatar_url = await refreshStoredMediaUrl(profile.avatar_url);
  }));
  return profiles;
};

export function cardUserFor(
  profiles: Map<string, CachedSocialProfile>,
  userId: string,
): { nickname: string; avatar: string; verified: boolean } {
  const profile = profiles.get(userId);
  return {
    nickname:
      profile?.display_name ||
      profile?.nickname ||
      profile?.username ||
      userId ||
      "Unknown",
    avatar: profile?.avatar_url || "/default-avatar.png",
    verified: profile?.verified === true,
  };
}

export async function getCachedFriendIds(
  uid: string,
  options: { fresh?: boolean } = {},
): Promise<string[]> {
  const circle = circleRequestContext.getStore();
  if (circle) {
    return (await getCircleMemberIds() ?? []).filter((id) => id !== uid);
  }
  const cacheKey = `friends:${uid}`;
  if (!options.fresh) {
    const cached = await redisCache.get<string[]>(cacheKey);
    if (Array.isArray(cached) && cached.length > 0) return uniqueStrings(cached);
  }

  const { data, error } = await (getSupabaseAdminClient() as any)
    .from("friendships")
    .select("requester_id,addressee_id")
    .eq("status", "ACCEPTED")
    .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
  if (error) throw error;

  const friendIds = uniqueStrings([
    ...(data ?? []).map((row) => row.requester_id === uid ? row.addressee_id : row.requester_id),
  ]);

  // An empty relationship set can become stale as soon as the user accepts a
  // request in a different server instance. Keep that negative lookup short;
  // accepted relationships remain cached at the normal TTL.
  await redisCache.set(
    cacheKey,
    friendIds,
    friendIds.length > 0
      ? FRIEND_IDS_TTL_SECONDS
      : EMPTY_FRIEND_IDS_TTL_SECONDS,
  );
  return friendIds;
}

export async function getFeedNetworkIds(uid: string): Promise<string[]> {
  // Feed audience must reflect an accepted/unfriended relationship immediately,
  // even when another server instance still has an older in-process cache.
  return [uid, ...(await getCachedFriendIds(uid, { fresh: true }))];
}

export async function getFeedCacheVersion(
  kind: FeedCacheKind,
  uid: string,
): Promise<string> {
  const circle = circleRequestContext.getStore();
  const cacheKey = circle ? `feed-generation:v2:${circle.circleId}:${kind}` : `${kind}-version:${uid}`;
  const cached = feedVersionLocalCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.version;
  }

  const version = await redisCache.get<number | string>(cacheKey);
  let normalized = "0";
  if (typeof version === "number" && Number.isFinite(version)) {
    normalized = String(version);
  } else if (typeof version === "string" && version.length > 0) {
    normalized = version;
  }

  feedVersionLocalCache.set(cacheKey, {
    version: normalized,
    expiresAt: Date.now() + VERSION_LOCAL_TTL_MS,
  });
  return normalized;
}

export async function getFeedCacheKey(
  kind: FeedCacheKind,
  uid: string,
  limitCount: number,
  cursor = "",
): Promise<string> {
  const version = await getFeedCacheVersion(kind, uid);
  const circle = circleRequestContext.getStore();
  return circle ? `${kind}:v2:${circle.circleId}:${uid}:${version}:${limitCount}:${cursor || "first"}` : `${kind}:circle:none:${uid}:${version}:${limitCount}:${cursor || "first"}`;
}

export async function bumpFeedCacheVersions(
  userIds: string[],
  kinds: FeedCacheKind[] = ["feed", "truth-feed", "dare-feed"],
): Promise<void> {
  const circle = circleRequestContext.getStore();
  const keys = circle ? kinds.map((kind) => `feed-generation:v2:${circle.circleId}:${kind}`) : uniqueStrings(userIds).flatMap((uid) => kinds.map((kind) => `${kind}-version:${uid}`));
  if (keys.length === 0) return;
  const values = await redisCache.incrementMany(keys);
  keys.forEach((key) => feedVersionLocalCache.set(key, { version: String(values.get(key) ?? Date.now()), expiresAt: Date.now() + VERSION_LOCAL_TTL_MS }));
}

export async function bumpFeedCacheVersionsForNetwork(
  uid: string,
  kinds?: FeedCacheKind[],
): Promise<void> {
  const userIds = await getFeedNetworkIds(uid);
  await bumpFeedCacheVersions(userIds, kinds);
}

export async function bumpPostAudienceFeedCache(
  postId: string,
  fallbackUid: string,
): Promise<void> {
  if (circleRequestContext.getStore()) { await bumpFeedCacheVersions([], ["feed"]); return; }
  const { data: post, error } = await (getSupabaseAdminClient() as any)
    .from("posts").select("author_id").eq("id", postId).maybeSingle();
  if (error) throw error;
  const authorId = post?.author_id;
  const ownerId =
    typeof authorId === "string" && authorId.length > 0
      ? authorId
      : fallbackUid;
  const audienceIds = new Set(await getFeedNetworkIds(ownerId));
  audienceIds.add(fallbackUid);
  await bumpFeedCacheVersions(Array.from(audienceIds), ["feed"]);
}

export async function getCachedProfiles(
  requestedUserIds: string[],
): Promise<Map<string, CachedSocialProfile>> {
  const userIds = uniqueStrings(requestedUserIds);
  const profiles = new Map<string, CachedSocialProfile>();
  if (userIds.length === 0) return profiles;

  const cacheKeys = userIds.map((id) => `profile:${id}`);
  const cachedProfiles =
    await redisCache.getMany<CachedSocialProfile>(cacheKeys);

  const missingIds: string[] = [];
  cachedProfiles.forEach((profile, index) => {
    const requestedId = userIds[index];
    if (profile && requestedId) {
      profiles.set(requestedId, profile);
      profiles.set(profile.user_id, profile);
      profiles.set(profile.id, profile);
    } else if (requestedId) {
      missingIds.push(requestedId);
    }
  });

  if (missingIds.length === 0) return refreshProfileMedia(profiles);

  const stillMissing = new Set(missingIds);
  for (const chunk of chunkArray(Array.from(stillMissing), 100)) {
    if (chunk.length === 0) continue;
    const { data, error } = await (getSupabaseAdminClient() as any)
      .from("profiles")
      .select("id,username,display_name,avatar_url,bio,visibility")
      .in("id", chunk);
    if (error) throw error;
    (data ?? []).forEach((row) => {
      const profile = mapProfile(row.id, row);
      profiles.set(row.id, profile);
      profiles.set(profile.user_id, profile);
      stillMissing.delete(row.id);
      stillMissing.delete(profile.user_id);
    });
  }

  const profilesToCache = new Map<string, CachedSocialProfile>();
  missingIds.forEach((requestedId) => {
    const profile = profiles.get(requestedId);
    if (profile) {
      profilesToCache.set(requestedId, profile);
      profilesToCache.set(profile.user_id, profile);
      profilesToCache.set(profile.id, profile);
    }
  });

  await redisCache.setMany(Array.from(profilesToCache.entries()).map(([id, profile]) => ({ key: `profile:${id}`, value: profile, ttlSeconds: PROFILE_TTL_SECONDS })));

  return refreshProfileMedia(profiles);
}

export async function getProfilesByDocumentId(
  ids: string[],
): Promise<Map<string, CachedSocialProfile>> {
  const profiles = await getCachedProfiles(ids);
  return new Map(ids.map((id) => [id, profiles.get(id)]).filter((entry): entry is [string, CachedSocialProfile] => Boolean(entry[1])));
}

export async function invalidateSocialCachesForUsers(
  userIds: string[],
): Promise<void> {
  const ids = uniqueStrings(userIds);
  const networkIds = new Set<string>(ids);
  const friendGroups = await Promise.all(
    ids.map((id) => getCachedFriendIds(id).catch(() => [])),
  );
  friendGroups.flat().forEach((id) => networkIds.add(id));

  await redisCache.deleteMany(ids.flatMap((id) => [`friends:${id}`, `profile:${id}`, `author:${id}`]));
  await bumpFeedCacheVersions(Array.from(networkIds));
}

