/**
 * Shared types, validation, and Postgres mapping for social drama cards
 * (predictions, deals, rumours, promises, custom polls) stored in the
 * `drama_posts` collection. Used by the /api/drama routes.
 */
import "server-only";
import { cleanText } from "./socialMutations";
import { getCachedProfiles, toIsoString } from "./socialCache";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { DramaRow } from "@/types/socialRows";
import type { DramaInteractionSummary } from "@/types/drama";

export type DramaKind =
  | "prediction"
  | "deal"
  | "rumour"
  | "promise"
  | "custom";

export const DRAMA_KINDS: DramaKind[] = [
  "prediction",
  "deal",
  "rumour",
  "promise",
  "custom",
];

export interface DramaParticipant {
  id: string;
  name: string;
  username?: string;
  avatar?: string;
}

export type DramaSubject =
  | { type: "friend"; id: string; name: string; username?: string; avatar?: string }
  | { type: "group"; name: string }
  | { type: "event"; name: string };

/** Allowed vote values per kind. */
export const VOTE_VALUES: Record<DramaKind, string[]> = {
  prediction: ["happens", "wont"],
  deal: ["happens", "wont"],
  rumour: ["believe", "cap"],
  promise: ["keep", "break"],
  custom: ["choiceOne", "choiceTwo"],
};

/** Allowed resolution values per kind (custom cards never resolve). */
export const RESOLUTION_VALUES: Record<DramaKind, string[]> = {
  prediction: ["happened", "didnt"],
  deal: ["won", "lost", "progress"],
  rumour: ["confirmed", "false"],
  promise: ["kept", "broken"],
  custom: [],
};

export const PREDICTION_REACTIONS = ["knows", "accurate", "wrong"];
export type { DramaInteractionSummary };

const DEAL_SCOPES = ["self", "friend", "group", "crew"];
const PROMISE_AUDIENCES = ["self", "friend", "crew"];
const CUSTOM_SCOPES = ["friends", "topics", "community"];

function cleanIsoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString();
}

export function sanitizeSubject(value: unknown): DramaSubject | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const name = cleanText(raw.name, 60);
  if (!name) return null;
  if (raw.type === "friend") {
    const id = cleanText(raw.id, 128);
    if (!id) return null;
    return {
      type: "friend",
      id,
      name,
      username: cleanText(raw.username, 40) || undefined,
      avatar: cleanText(raw.avatar, 500) || undefined,
    };
  }
  if (raw.type === "group") return { type: "group", name };
  if (raw.type === "event") return { type: "event", name };
  return null;
}

/**
 * Validates the kind-specific payload of a create request. Returns the
 * cleaned fields to store under the doc's `data` key, or null when invalid.
 */
export function sanitizeDramaPayload(
  kind: DramaKind,
  body: Record<string, unknown>,
): Record<string, unknown> | null {
  switch (kind) {
    case "prediction": {
      const text = cleanText(body.text, 280);
      const subject = sanitizeSubject(body.subject);
      const deadline = cleanIsoDate(body.deadline);
      if (!text || !subject || !deadline) return null;
      return { text, subject, deadline };
    }
    case "deal": {
      const scope = cleanText(body.scope, 12);
      const subject = sanitizeSubject(body.subject);
      const event = cleanText(body.event, 200);
      const winOutcome = cleanText(body.winOutcome, 200);
      const loseOutcome = cleanText(body.loseOutcome, 200);
      const resolutionDate = cleanIsoDate(body.resolutionDate);
      if (
        !DEAL_SCOPES.includes(scope) ||
        !subject ||
        !event ||
        !winOutcome ||
        !loseOutcome ||
        !resolutionDate
      ) {
        return null;
      }
      return { scope, subject, event, winOutcome, loseOutcome, resolutionDate };
    }
    case "rumour": {
      const statement = cleanText(body.statement, 280);
      const sourceLabel = cleanText(body.sourceLabel, 80);
      const heatLabel = cleanText(body.heatLabel, 80);
      const deadline = cleanIsoDate(body.deadline);
      if (!statement || !deadline) return null;
      const subject = body.subject ? sanitizeSubject(body.subject) : null;
      return {
        statement,
        sourceLabel: sourceLabel || "heard around",
        heatLabel: heatLabel || "unverified",
        deadline,
        ...(subject && subject.type === "friend" ? { subject } : {}),
      };
    }
    case "promise": {
      const promise = cleanText(body.promise, 280);
      const audience = cleanText(body.audience, 12);
      const dueAt = cleanIsoDate(body.dueAt);
      const targetLabel = cleanText(body.targetLabel, 80);
      if (!promise || !PROMISE_AUDIENCES.includes(audience) || !dueAt) {
        return null;
      }
      return { promise, audience, dueAt, targetLabel: targetLabel || "the crew", targetId: cleanText(body.targetId, 36) || undefined };
    }
    case "custom": {
      const statement = cleanText(body.statement, 280);
      const choiceOneText = cleanText(body.choiceOneText, 40);
      const choiceTwoText = cleanText(body.choiceTwoText, 40);
      const toneLabel = cleanText(body.toneLabel, 60);
      const scope = cleanText(body.scope, 12);
      if (
        !statement ||
        !choiceOneText ||
        !choiceTwoText ||
        !CUSTOM_SCOPES.includes(scope)
      ) {
        return null;
      }
      return {
        statement,
        choiceOneText,
        choiceTwoText,
        toneLabel: toneLabel || "anything",
        scope,
      };
    }
    default:
      return null;
  }
}

/** Server-trusted participant identity for a uid (ignores client claims). */
export async function participantForUid(
  uid: string,
): Promise<DramaParticipant> {
  const profiles = await getCachedProfiles([uid]).catch(
    () => new Map<string, never>(),
  );
  const profile = profiles.get(uid);
  return {
    id: uid,
    name:
      profile?.display_name || profile?.nickname || profile?.username || "Someone",
    username: profile?.username || undefined,
    avatar: profile?.avatar_url || "",
  };
}

function participantOrFallback(value: unknown, id: string): DramaParticipant {
  if (value && typeof value === "object") {
    const raw = value as Record<string, unknown>;
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : id,
      name: typeof raw.name === "string" && raw.name ? raw.name : "Someone",
      username: typeof raw.username === "string" ? raw.username : undefined,
      avatar: typeof raw.avatar === "string" ? raw.avatar : "",
    };
  }
  return { id, name: "Someone", avatar: "" };
}

/**
 * Maps a `drama_posts` doc to the exact client post shape for its kind
 * (PredictionPost / DealPost / RumourPost / PromisePost / CustomPost).
 */
export function toClientDramaPost(
  id: string,
  docData: DramaRow,
): { kind: DramaKind; post: Record<string, unknown> } | null {
  const kind = docData.kind as DramaKind;
  if (!DRAMA_KINDS.includes(kind)) return null;

  const data = (docData.data || {}) as Record<string, unknown>;
  const creator = participantOrFallback(
    docData.creator,
    String(docData.creator_id || ""),
  );
  const votes = (docData.votes || {}) as Record<string, string>;
  const votersRaw = (docData.voters || {}) as Record<string, unknown>;
  const voters = Object.fromEntries(
    Object.entries(votersRaw).map(([voterId, voter]) => [
      voterId,
      participantOrFallback(voter, voterId),
    ]),
  );
  const commentsRaw = Array.isArray(docData.comments) ? docData.comments : [];
  const comments = commentsRaw
    .map((comment, index) => {
      if (!comment || typeof comment !== "object") return null;
      const raw = comment as Record<string, unknown>;
      const text = typeof raw.text === "string" ? raw.text : "";
      if (!text) return null;
      const commenterId =
        typeof raw.commenter_id === "string" && raw.commenter_id
          ? raw.commenter_id
          : `commenter-${index}`;
      return {
        id:
          typeof raw.id === "string" && raw.id
            ? raw.id
            : `comment-${index}`,
        text,
        commenter: participantOrFallback(raw.commenter, commenterId),
        createdAt: toIsoString(raw.created_at || raw.createdAt),
      };
    })
    .filter(Boolean);
  const createdAt = toIsoString(docData.created_at);
  const storedResolution =
    typeof docData.resolution === "string" ? docData.resolution : null;
  // The typed database RPC preserves the long-standing `didnt_happen`
  // value. The client contract deliberately uses the shorter `didnt` value
  // everywhere (store type, card comparisons, and UI copy).
  const resolution =
    kind === "prediction" && storedResolution === "didnt_happen"
      ? "didnt"
      : storedResolution;
  const resolvedAt = docData.resolved_at
    ? toIsoString(docData.resolved_at)
    : undefined;
  const interactionSummary = (docData as any).interaction_summary;

  switch (kind) {
    case "prediction":
      return {
        kind,
        post: {
          id,
          text: data.text,
          subject: data.subject,
          deadline: data.deadline,
          createdAt,
          poster: creator,
          votes,
          voters,
          subjectReaction:
            typeof docData.subject_reaction === "string"
              ? docData.subject_reaction
              : undefined,
          subjectOutcome:
            typeof docData.subject_outcome === "string"
              ? docData.subject_outcome
              : undefined,
          subjectThought:
            typeof docData.subject_thought === "string"
              ? docData.subject_thought
              : undefined,
          comments,
          verdict: resolution || undefined,
          resolvedAt,
          interactionSummary,
        },
      };
    case "deal":
      return {
        kind,
        post: {
          id,
          confirmations: docData.confirmations || [],
          scope: data.scope,
          subject: data.subject,
          event: data.event,
          winOutcome: data.winOutcome,
          loseOutcome: data.loseOutcome,
          resolutionDate: data.resolutionDate,
          createdAt,
          creator,
          votes,
          voters,
          result: resolution || undefined,
          resolvedAt,
          interactionSummary,
          proofLabel:
            typeof docData.proof_label === "string"
              ? docData.proof_label
              : undefined,
          proofUrl:
            typeof docData.proof_url === "string" ? docData.proof_url : undefined,
        },
      };
    case "rumour":
      return {
        kind,
        post: {
          id,
          statement: data.statement,
          sourceLabel: data.sourceLabel,
          heatLabel: data.heatLabel,
          deadline: data.deadline,
          createdAt,
          poster: creator,
          subject: data.subject || undefined,
           votes,
           voters,
           comments,
           status: resolution || "open",
           interactionSummary,
        },
      };
    case "promise":
      return {
        kind,
        post: {
          id,
          confirmations: docData.confirmations || [],
          targetId: data.targetId,
          promise: data.promise,
          audience: data.audience,
          dueAt: data.dueAt,
          createdAt,
          maker: creator,
          targetLabel: data.targetLabel,
           votes,
           voters,
           comments,
           status: resolution || "open",
           interactionSummary,
        },
      };
    case "custom":
      return {
        kind,
        post: {
          id,
          statement: data.statement,
          choiceOneText: data.choiceOneText,
          choiceTwoText: data.choiceTwoText,
          toneLabel: data.toneLabel,
          createdAt,
          creator,
          scope: data.scope,
          votes,
          voters,
          interactionSummary,
        },
      };
    default:
      return null;
  }
}

export async function hydrateDramaRows(rows: Array<Record<string, any>>) {
  const ids = rows.map((row) => row.id).filter((id): id is string => typeof id === "string");
  if (!ids.length) return [] as Array<{ id: string; data: Record<string, any> }>;
  const client = getSupabaseAdminClient() as any;
  const [{ data: summaries, error: summaryError }, { data: confirmations, error: confirmationError }] = await Promise.all([
    client.rpc("get_drama_interaction_summaries", { p_post_ids: ids }),
    client.from("drama_confirmations").select("post_id,user_id,status").in("post_id", ids),
  ]);
  if (summaryError) throw summaryError;
  if (confirmationError) throw confirmationError;
  const summaryById = new Map<string, any>((summaries ?? []).map((summary: any) => [summary.post_id as string, summary]));
  const profileIds = Array.from(new Set([
    ...rows.map((row) => row.creator_id),
    ...(summaries ?? []).flatMap((summary: any) => [
      ...(Array.isArray(summary.voters) ? summary.voters : []).map((vote: any) => vote.user_id),
      ...(Array.isArray(summary.comments) ? summary.comments : []).map((comment: any) => comment.user_id),
    ]),
  ].filter((id): id is string => typeof id === "string")));
  const profiles = await getCachedProfiles(profileIds);
  return rows.map((row) => {
    const creator = profiles.get(row.creator_id);
    const summary = summaryById.get(row.id) || { voters: [], comments: [], vote_counts: {}, total_votes: 0, comment_count: 0, user_vote: null, revision: 0 };
    const rowVotes = Array.isArray(summary.voters) ? summary.voters : [];
    const rowComments = Array.isArray(summary.comments) ? summary.comments : [];
    return {
      id: row.id,
      data: row.payload || {},
      confirmations: (confirmations || []).filter((item: any) => item.post_id === row.id),
      kind: row.kind,
      creator_id: row.creator_id,
      creator: creator ? { id: row.creator_id, name: creator.display_name || creator.username, username: creator.username, avatar: creator.avatar_url || "" } : { id: row.creator_id, name: "Someone", avatar: "" },
      votes: Object.fromEntries(rowVotes.map((vote: any) => [vote.user_id, vote.vote])),
      voters: Object.fromEntries(rowVotes.map((vote: any) => { const profile = profiles.get(vote.user_id); return [vote.user_id, { id: vote.user_id, name: profile?.display_name || profile?.username || "Someone", username: profile?.username, avatar: profile?.avatar_url || "" }]; })),
      comments: rowComments.map((comment: any) => { const profile = profiles.get(comment.user_id); return { id: comment.id, text: comment.body, commenter_id: comment.user_id, commenter: { id: comment.user_id, name: profile?.display_name || profile?.username || "Someone", username: profile?.username, avatar: profile?.avatar_url || "" }, created_at: comment.created_at }; }),
      interaction_summary: { voteCounts: summary.vote_counts || {}, totalVotes: Number(summary.total_votes || 0), userVote: summary.user_vote || null, commentCount: Number(summary.comment_count || 0), revision: Number(summary.revision || 0) } satisfies DramaInteractionSummary,
      resolution: row.resolution,
      resolved_at: row.resolved_at,
      subject_reaction: row.subject_reaction,
      subject_outcome: row.subject_outcome,
      subject_thought: row.subject_thought,
      proof_label: row.proof_label,
      proof_url: row.proof_url,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });
}

