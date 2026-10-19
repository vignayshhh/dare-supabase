import { circleRequestContext } from "@/lib/supabase/requestContext";
﻿import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { toIsoString } from "./socialCache";
import { enqueueFeedFanout } from "./feedFanout";
import { invalidateSocialCachesForUsers } from "./socialCache";
import type { DareActionRow, TruthActionRow } from "@/types/socialRows";

export type TruthState =
  | "SENT"
  | "ANSWERED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED";

export type DareState =
  | "SENT"
  | "ACCEPTED"
  | "CHICKEN_OUT"
  | "PROOF_SUBMITTED"
  | "UNDER_REVIEW"
  | "FRIENDS_VALIDATION"
  | "ACCEPTED_REAL"
  | "REJECTED_FAKE";

export function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function canonicalFriendshipId(a: string, b: string): string {
  return [a, b].sort().join("_");
}

export async function getDisplayProfile(userId: string): Promise<{
  name: string;
  username: string;
  avatar: string;
}> {
  const { data, error } = await (getSupabaseAdminClient() as any)
    .from("profiles").select("username,display_name,avatar_url").eq("id",userId).maybeSingle();
  if (error) throw error;
  const username =
    typeof data.username === "string" && data.username
      ? data.username
      : userId;
  const name =
    typeof data.display_name === "string" && data.display_name
      ? data.display_name
      : typeof data.displayName === "string" && data.displayName
        ? data.displayName
        : username;
  const avatar =
    typeof data.avatar_url === "string"
      ? data.avatar_url
      : typeof data.avatar === "string"
        ? data.avatar
        : "";
  return { name, username, avatar };
}

export async function createAlert(input: {
  userId: string;
  type: string;
  entityId: string;
  actorId: string;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await (getSupabaseAdminClient() as any).from("alerts").insert({
    recipient_id: input.userId,
    type: input.type,
    actor_id: input.actorId,
    payload: { entityId: input.entityId, message: input.message, ...(input.metadata || {}) },
  });
  if (error) throw error;
}

export async function createFeedEvent(input: {
  userId: string;
  eventType: string;
  relatedPostId?: string;
  relatedTruthId?: string;
  relatedDareId?: string;
  eventData?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await (getSupabaseAdminClient() as any).from("feed_events").insert({
    actor_id: input.userId, event_type: input.eventType, related_post_id: input.relatedPostId || null,
    related_truth_id: input.relatedTruthId || null, related_dare_id: input.relatedDareId || null, event_data: input.eventData || {},
  }); if (error) throw error;
}

export async function areUsersFriends(a: string, b: string): Promise<boolean> {
  if (!a || !b || a === b) return false;
  const circle=circleRequestContext.getStore();
  if(circle){const {data,error}=await circle.client.from('circle_members').select('user_id').eq('circle_id',circle.circleId).in('user_id',[a,b]);if(error)throw error;return data?.length===2;}
  const { data, error } = await (getSupabaseAdminClient() as any).from("friendships").select("id")
    .eq("status", "ACCEPTED").or(`and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`).limit(1);
  if (error) throw error; return (data || []).length > 0;
}

export function truthResponse(docId: string, data: TruthActionRow) {
  return {
    id: docId,
    challengerId: String(data.challenger_id || ""),
    receiverId: String(data.receiver_id || ""),
    question: String(data.question || ""),
    state: (data.state || "SENT") as TruthState,
    createdAt: toIsoString(data.created_at),
    updatedAt: toIsoString(data.updated_at),
    answer: typeof data.answer === "string" ? data.answer : undefined,
    votes: data.votes || { truth: 0, lie: 0, total: 0 },
    answeredAt: data.answered_at ? toIsoString(data.answered_at) : undefined,
    reviewedAt: data.reviewed_at ? toIsoString(data.reviewed_at) : undefined,
  };
}

export function dareResponse(docId: string, data: DareActionRow) {
  return {
    id: docId,
    challengerId: String(data.challenger_id || ""),
    receiverId: String(data.receiver_id || ""),
    description: String(data.description || ""),
    state: (data.state || "SENT") as DareState,
    proofMediaUrl:
      typeof data.proof_media_url === "string" ? data.proof_media_url : null,
    proofMediaType:
      data.proof_media_type === "TEXT" ||
      data.proof_media_type === "PHOTO" ||
      data.proof_media_type === "VIDEO"
        ? data.proof_media_type
        : null,
    proofThumbnailUrl:
      typeof data.proof_thumbnail_url === "string"
        ? data.proof_thumbnail_url
        : null,
    challengerVote:
      data.challenger_vote === "REAL" || data.challenger_vote === "FAKE"
        ? data.challenger_vote
        : null,
    validationThresholdMet: data.validation_threshold_met === true,
    createdAt: toIsoString(data.created_at),
    updatedAt: toIsoString(data.updated_at),
    acceptedAt: data.accepted_at ? toIsoString(data.accepted_at) : null,
    proofSubmittedAt: data.proof_submitted_at
      ? toIsoString(data.proof_submitted_at)
      : null,
    completedAt: data.completed_at ? toIsoString(data.completed_at) : null,
  };
}

export async function publishChallengeFanout(input: {
  kind: "truth" | "dare";
  sourceId: string;
  actorId: string;
  participantIds: string[];
  createdAt?: string;
}): Promise<void> {
  await enqueueFeedFanout(input);
  if (circleRequestContext.getStore()) return;
  await invalidateSocialCachesForUsers([input.actorId, ...input.participantIds]);
}

