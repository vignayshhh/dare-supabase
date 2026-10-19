import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { createUuid } from "@/utils/uuid";
import { scheduleRefresh } from "@/lib/realtime/scheduleRefresh";
import { uploadOptimizedMedia } from "@/utils/mediaUpload";
type DatabaseTimestamp = string | Date;

export interface ChallengeProofVote { id: string; proofId: string; challengeId?: string; userId: string; vote: "real" | "fake"; createdAt: DatabaseTimestamp; }
export interface ChallengeProofComment { id: string; proofId: string; challengeId?: string; userId: string; username: string; displayName: string; avatarUrl: string; content: string; createdAt: DatabaseTimestamp; likes: number; userLiked?: boolean; }
export interface ChallengeCommentLikeSummary { commentId: string; count: number; currentUserLiked: boolean; }
type Row = Record<string, unknown>;
const client = () => getSupabaseBrowserClient();
const mapVote = (r: Row): ChallengeProofVote => ({ id: String(r.id), proofId: String(r.proof_id), challengeId: r.challenge_id ? String(r.challenge_id) : undefined, userId: String(r.user_id), vote: r.vote === "fake" ? "fake" : "real", createdAt: r.created_at as DatabaseTimestamp });
const mapComment = (r: Row): ChallengeProofComment => ({ id: String(r.id), proofId: String(r.proof_id), challengeId: r.challenge_id ? String(r.challenge_id) : undefined, userId: String(r.user_id), username: String(r.username || "dareuser").replace(/^@/, ""), displayName: String(r.display_name || r.username || "Dare User"), avatarUrl: String(r.avatar_url || ""), content: String(r.content || ""), createdAt: r.created_at as DatabaseTimestamp, likes: Number(r.likes || 0) });
const uniq = (ids: string[]) => [...new Set(ids)].filter(Boolean);
const emptyUnsub = () => () => {};

export interface ChallengeRoomService {
  voteOnProof(proofId: string, userId: string, vote: "real" | "fake", challengeId?: string): Promise<{ success: boolean; error?: string }>;
  removeProofVote(proofId: string, userId: string, challengeId?: string): Promise<{ success: boolean; error?: string }>;
  getProofVotes(proofId: string): Promise<ChallengeProofVote[]>;
  subscribeToProofVotes(proofId: string, callback: (votes: ChallengeProofVote[]) => void): () => void;
  subscribeToProofVotesByProofIds(proofIds: string[], callback: (votes: ChallengeProofVote[]) => void): () => void;
  subscribeToCurrentUserProofVotesByProofIds(proofIds: string[], userId: string | undefined, callback: (votes: ChallengeProofVote[]) => void): () => void;
  addComment(proofId: string, userId: string, username: string, displayName: string, avatarUrl: string, content: string, challengeId?: string): Promise<{ success: boolean; comment?: ChallengeProofComment; error?: string }>;
  getProofComments(proofId: string): Promise<ChallengeProofComment[]>;
  subscribeToProofComments(proofId: string, callback: (comments: ChallengeProofComment[]) => void): () => void;
  subscribeToProofCommentsByProofIds(proofIds: string[], callback: (comments: ChallengeProofComment[]) => void): () => void;
  deleteComment(commentId: string, userId: string): Promise<{ success: boolean; error?: string }>;
  likeComment(commentId: string, userId: string, challengeId?: string): Promise<{ success: boolean; liked?: boolean; error?: string }>;
  subscribeToCommentLikesByCommentIds(commentIds: string[], currentUserId: string | undefined, callback: (summaries: ChallengeCommentLikeSummary[]) => void): () => void;
  subscribeToCurrentUserCommentLikesByCommentIds(commentIds: string[], currentUserId: string | undefined, callback: (likedCommentIds: Set<string>) => void): () => void;
  uploadProofMedia(file: File, userId: string, challengeId: string, proofDay: number): Promise<{ success: boolean; url?: string; thumbnail?: string; assetId?: string; error?: string }>;
}

const subscribeNativeRows = <T>(table: string, fields: string, realtimeFilter: string, filter: (q: any) => any, channelName: string, map: (rows: Row[]) => T[], callback: (rows: T[]) => void) => {
  let active = true;
  const load = async () => { const base = client().from(table).select(fields); const { data, error } = await filter(base); if (!active || error) return; callback(map((data || []) as Row[])); };
  const scheduled = scheduleRefresh(() => { void load(); });
  void load();
  const channel = client().channel(channelName).on("postgres_changes", { event: "*", schema: "public", table, filter: realtimeFilter }, () => { scheduled.schedule(); }).subscribe();
  return () => { active = false; scheduled.cancel(); void client().removeChannel(channel); };
};

class ChallengeRoomServiceImpl implements ChallengeRoomService {
  async voteOnProof(proofId: string, userId: string, vote: "real" | "fake", challengeId?: string) {
    const { error } = await client().from("challenge_proof_votes").upsert({ proof_id: proofId, user_id: userId, challenge_id: challengeId || null, vote }, { onConflict: "proof_id,user_id" });
    return error ? { success: false, error: "Failed to vote on proof" } : { success: true };
  }
  async removeProofVote(proofId: string, userId: string) { const { error } = await client().from("challenge_proof_votes").delete().eq("proof_id", proofId).eq("user_id", userId); return error ? { success: false, error: "Failed to remove vote" } : { success: true }; }
  async getProofVotes(proofId: string) { const { data } = await client().from("challenge_proof_votes").select("id,proof_id,challenge_id,user_id,vote,created_at").eq("proof_id", proofId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100); return (data || []).map(mapVote); }
  subscribeToProofVotes(proofId: string, callback: (votes: ChallengeProofVote[]) => void) { return subscribeNativeRows("challenge_proof_votes", "id,proof_id,challenge_id,user_id,vote,created_at", `proof_id=eq.${proofId}`, (q) => q.eq("proof_id", proofId).order("created_at", { ascending: false }), "challenge-proof-votes:" + proofId, (rows) => rows.map(mapVote), callback); }
  subscribeToProofVotesByProofIds(proofIds: string[], callback: (votes: ChallengeProofVote[]) => void) { const ids = uniq(proofIds); if (!ids.length) { callback([]); return emptyUnsub(); } return subscribeNativeRows("challenge_proof_votes", "id,proof_id,challenge_id,user_id,vote,created_at", `proof_id=in.(${ids.join(",")})`, (q) => q.in("proof_id", ids).order("created_at", { ascending: false }), "challenge-proof-votes:" + ids.sort().join(","), (rows) => rows.map(mapVote), callback); }
  subscribeToCurrentUserProofVotesByProofIds(proofIds: string[], userId: string | undefined, callback: (votes: ChallengeProofVote[]) => void) { const ids = uniq(proofIds); if (!userId || !ids.length) { callback([]); return emptyUnsub(); } return subscribeNativeRows("challenge_proof_votes", "id,proof_id,challenge_id,user_id,vote,created_at", `user_id=eq.${userId}`, (q) => q.in("proof_id", ids).eq("user_id", userId).limit(ids.length), "challenge-proof-votes-user:" + userId, (rows) => rows.map(mapVote), callback); }
  async addComment(proofId: string, userId: string, username: string, displayName: string, avatarUrl: string, content: string, challengeId?: string) {
    const text = content.trim(); if (!text) return { success: false, error: "Comment cannot be empty" }; if (text.length > 500) return { success: false, error: "Comment too long" };
    const { data, error } = await client().from("challenge_proof_comments").insert({ proof_id: proofId, challenge_id: challengeId || null, user_id: userId, username, display_name: displayName, avatar_url: avatarUrl, content: text }).select("id,proof_id,challenge_id,user_id,username,display_name,avatar_url,content,likes,created_at").single();
    return error ? { success: false, error: "Failed to add comment" } : { success: true, comment: mapComment(data as Row) };
  }
  async getProofComments(proofId: string) { const { data } = await client().from("challenge_proof_comments").select("id,proof_id,challenge_id,user_id,username,display_name,avatar_url,content,likes,created_at").eq("proof_id", proofId).order("created_at", { ascending: false }).limit(50); return (data || []).map(mapComment); }
  subscribeToProofComments(proofId: string, callback: (comments: ChallengeProofComment[]) => void) { return subscribeNativeRows("challenge_proof_comments", "id,proof_id,challenge_id,user_id,username,display_name,avatar_url,content,likes,created_at", `proof_id=eq.${proofId}`, (q) => q.eq("proof_id", proofId).order("created_at", { ascending: false }).limit(50), "challenge-proof-comments:" + proofId, (rows) => rows.map(mapComment), callback); }
  subscribeToProofCommentsByProofIds(proofIds: string[], callback: (comments: ChallengeProofComment[]) => void) { const ids = uniq(proofIds); if (!ids.length) { callback([]); return emptyUnsub(); } return subscribeNativeRows("challenge_proof_comments", "id,proof_id,challenge_id,user_id,username,display_name,avatar_url,content,likes,created_at", `proof_id=in.(${ids.join(",")})`, (q) => q.in("proof_id", ids).order("created_at", { ascending: false }).limit(200), "challenge-proof-comments:" + ids.sort().join(","), (rows) => rows.map(mapComment), callback); }
  async deleteComment(commentId: string, userId: string) { const { error } = await client().from("challenge_proof_comments").delete().eq("id", commentId).eq("user_id", userId); return error ? { success: false, error: "Failed to delete comment" } : { success: true }; }
  async likeComment(commentId: string, userId: string, challengeId?: string) {
    const { data, error } = await client().rpc("toggle_challenge_comment_like", { p_comment_id: commentId, p_user_id: userId, p_challenge_id: challengeId || null });
    return error ? { success: false, error: "Failed to like comment" } : { success: true, liked: Boolean(data) };
  }
  subscribeToCommentLikesByCommentIds(commentIds: string[], currentUserId: string | undefined, callback: (summaries: ChallengeCommentLikeSummary[]) => void) {
    const ids = uniq(commentIds); if (!ids.length) { callback([]); return emptyUnsub(); }
    return subscribeNativeRows("challenge_comment_likes", "id,comment_id,user_id,created_at", `comment_id=in.(${ids.join(",")})`, (q) => q.in("comment_id", ids), "challenge-comment-likes:" + ids.sort().join(","), (rows) => ids.map((id) => ({ commentId: id, count: rows.filter((r) => r.comment_id === id).length, currentUserLiked: !!currentUserId && rows.some((r) => r.comment_id === id && r.user_id === currentUserId) })), callback);
  }
  subscribeToCurrentUserCommentLikesByCommentIds(commentIds: string[], currentUserId: string | undefined, callback: (likedCommentIds: Set<string>) => void) {
    const ids = uniq(commentIds); if (!currentUserId || !ids.length) { callback(new Set()); return emptyUnsub(); }
    let active = true; const load = async () => { const { data } = await client().from("challenge_comment_likes").select("comment_id").in("comment_id", ids).eq("user_id", currentUserId).limit(ids.length); if (active) callback(new Set((data || []).map((r) => String(r.comment_id)))); };
    const scheduled = scheduleRefresh(() => { void load(); });
    void load(); const channel = client().channel("challenge-comment-likes-user:" + currentUserId).on("postgres_changes", { event: "*", schema: "public", table: "challenge_comment_likes", filter: "user_id=eq." + currentUserId }, () => { scheduled.schedule(); }).subscribe();
    return () => { active = false; scheduled.cancel(); void client().removeChannel(channel); };
  }
  async uploadProofMedia(file: File, userId: string, challengeId: string, proofDay: number) {
    if (!file) return { success: false, error: "No file provided" }; if (file.size > 100 * 1024 * 1024) return { success: false, error: "File too large (max 100MB)" };
    const allowed = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime"]; if (!allowed.includes(file.type)) return { success: false, error: "Invalid file type" };
    try {
      const uploaded = await uploadOptimizedMedia({ source: file, userId, context: "challenge-room-proof", fileName: `${challengeId}-day-${proofDay}-${createUuid()}.${file.name.split(".").pop() || "bin"}`, mediaKind: file.type.startsWith("video/") ? "video" : "image" });
      return { success: true, url: uploaded.url, thumbnail: uploaded.mediaKind === "image" ? uploaded.url : undefined, assetId: uploaded.assetId };
    } catch { return { success: false, error: "Failed to upload media" }; }
  }
}
export const challengeRoomService: ChallengeRoomService = new ChallengeRoomServiceImpl();
