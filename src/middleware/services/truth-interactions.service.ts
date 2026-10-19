import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { authService } from "@/middleware/services/auth-v2.service";
import type { Unsubscribe } from "@/types/realtime";
import { createRefreshController } from "@/lib/realtime/createRefreshController";

export interface TruthVoter { id: string; otruthId: string; ouserId: string; vote: "TRUTH" | "LIE"; displayName: string; username: string; avatarUrl: string; createdAt: string; }
export interface TruthComment { id: string; truthId: string; userId: string; username: string; displayName: string; avatarUrl: string; text: string; likes: number; parentId?: string | null; createdAt: string; }
export interface TruthVoteData { truthVoters: TruthVoter[]; lieVoters: TruthVoter[]; truthCount: number; lieCount: number; total: number; userVote: "TRUTH" | "LIE" | null; }
type VoteRow = { truth_id: string; voter_id: string; vote: "TRUTH" | "LIE"; created_at: string };
type ProfileRow = { id: string; username?: string | null; display_name?: string | null; avatar_url?: string | null };
type CommentRow = { id: string; truth_id: string; user_id: string; parent_id: string | null; text: string; likes_count: number; created_at: string };

const VOTE_PREVIEW_LIMIT = 100;
const COMMENT_PAGE_LIMIT = 100;
const profileFor = (profiles: Map<string, ProfileRow>, userId: string) => profiles.get(userId) || { id: userId };

class TruthInteractionsService {
  async recordVote(truthId: string, voterId: string, vote: "TRUTH" | "LIE"): Promise<void> {
    const { error } = await getSupabaseBrowserClient().rpc("set_truth_vote_native", { p_truth_id: truthId, p_vote: vote, p_actor_id: voterId });
    if (error) throw error;
  }

  subscribeToVotes(truthId: string, currentUserId: string, callback: (data: TruthVoteData) => void): Unsubscribe {
    const client = getSupabaseBrowserClient();
    const rows = new Map<string, VoteRow>();
    const profiles = new Map<string, ProfileRow>();
    let truthCount = 0;
    let lieCount = 0;
    let userVote: "TRUTH" | "LIE" | null = null;
    let disposed = false;
    let initialized = false;
    let revision = 0;
    const queued: any[] = [];

    const hydrateProfiles = async (userIds: string[]) => {
      const missing = [...new Set(userIds.filter((id) => id && !profiles.has(id)))];
      if (!missing.length) return;
      const result = await client.from("profiles").select("id,username,display_name,avatar_url").in("id", missing);
      for (const profile of (result.data ?? []) as ProfileRow[]) profiles.set(profile.id, profile);
      for (const id of missing) if (!profiles.has(id)) profiles.set(id, { id });
    };
    const emit = () => {
      if (disposed) return;
      const preview = [...rows.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.voter_id.localeCompare(a.voter_id)).slice(0, VOTE_PREVIEW_LIMIT);
      const mapped = preview.map((row) => {
        const profile = profileFor(profiles, row.voter_id);
        return { id: `${row.truth_id}_${row.voter_id}`, otruthId: row.truth_id, ouserId: row.voter_id, vote: row.vote, displayName: profile.display_name || profile.username || "User", username: profile.username || "", avatarUrl: profile.avatar_url || "", createdAt: row.created_at } satisfies TruthVoter;
      });
      callback({ truthVoters: mapped.filter((row) => row.vote === "TRUTH"), lieVoters: mapped.filter((row) => row.vote === "LIE"), truthCount, lieCount, total: truthCount + lieCount, userVote });
    };
    const refreshCounts = async () => {
      const [truths, lies] = await Promise.all([
        client.from("truth_votes").select("truth_id", { count: "exact", head: true }).eq("truth_id", truthId).eq("vote", "TRUTH"),
        client.from("truth_votes").select("truth_id", { count: "exact", head: true }).eq("truth_id", truthId).eq("vote", "LIE"),
      ]);
      if (!truths.error) truthCount = truths.count ?? 0;
      if (!lies.error) lieCount = lies.count ?? 0;
    };
    const apply = async (payload: any) => {
      if (disposed) return;
      if (!initialized) { queued.push(payload); return; }
      const oldRow = payload.old as Partial<VoteRow>;
      const newRow = payload.new as Partial<VoteRow>;
      const voterId = String(newRow?.voter_id || oldRow?.voter_id || "");
      const existing = rows.get(voterId);
      if (payload.eventType === "DELETE") {
        rows.delete(voterId);
        if (voterId === currentUserId) userVote = null;
        if (existing?.vote === "TRUTH") truthCount = Math.max(0, truthCount - 1);
        else if (existing?.vote === "LIE") lieCount = Math.max(0, lieCount - 1);
        else await refreshCounts();
        emit();
        return;
      }
      if (!voterId || !newRow.vote) return;
      const next = newRow as VoteRow;
      if (!existing) {
        if (next.vote === "TRUTH") truthCount += 1;
        else lieCount += 1;
      }
      else if (existing.vote !== next.vote) {
        if (existing.vote === "TRUTH") truthCount = Math.max(0, truthCount - 1);
        else lieCount = Math.max(0, lieCount - 1);
        if (next.vote === "TRUTH") truthCount += 1;
        else lieCount += 1;
      }
      rows.set(voterId, next);
      if (voterId === currentUserId) userVote = next.vote;
      await hydrateProfiles([voterId]);
      emit();
    };
    const load = async () => {
      const snapshot = await client.rpc("get_truth_interaction_snapshot", { p_truth_id: truthId });
      if (disposed) return;
      if (snapshot.error || !snapshot.data) {
        const [preview, myVote] = await Promise.all([
          client.from("truth_votes").select("truth_id,voter_id,vote,created_at").eq("truth_id", truthId).order("created_at", { ascending: false }).order("voter_id", { ascending: false }).limit(VOTE_PREVIEW_LIMIT),
          client.from("truth_votes").select("vote").eq("truth_id", truthId).eq("voter_id", currentUserId).maybeSingle(),
          refreshCounts(),
        ]);
        if (disposed || preview.error) return;
        rows.clear();
        for (const row of (preview.data ?? []) as VoteRow[]) rows.set(row.voter_id, row);
        userVote = myVote.data?.vote === "TRUTH" || myVote.data?.vote === "LIE" ? myVote.data.vote : null;
      } else {
        const data = snapshot.data as { truthCount?: number; lieCount?: number; userVote?: string | null; revision?: number; voters?: VoteRow[] };
        rows.clear();
        for (const row of (data.voters ?? []) as VoteRow[]) rows.set(row.voter_id, row);
        truthCount = Number(data.truthCount ?? 0);
        lieCount = Number(data.lieCount ?? 0);
        userVote = data.userVote === "TRUTH" || data.userVote === "LIE" ? data.userVote : null;
        revision = Number(data.revision || 0);
      }
      await hydrateProfiles([...rows.keys()]);
      initialized = true;
      for (const payload of queued.splice(0)) await apply(payload);
      emit();
    };
    const controller = createRefreshController(async () => { await load(); return true; }, () => undefined, 100);
    const channel = client.channel(`truth-interactions:${truthId}`)
      .on("broadcast", { event: "truth_interaction_changed" }, (message: any) => {
        const nextRevision = Number(message?.payload?.revision ?? message?.revision ?? 0);
        if (nextRevision > revision + 1) controller.requestRefresh("revision-gap");
        else controller.requestRefresh("interaction");
      })
      .subscribe((status) => { if (status === "SUBSCRIBED") controller.requestRefresh("connected"); else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") controller.requestRefresh("degraded"); });
    controller.requestRefresh("initial");
    const onVisible = () => controller.setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisible);
    return () => { disposed = true; controller.dispose(); document.removeEventListener("visibilitychange", onVisible); void client.removeChannel(channel); };
  }

  async addComment(truthId: string, userId: string, username: string, displayName: string, avatarUrl: string, text: string, parentId?: string | null): Promise<TruthComment | null> {
    const { data, error } = await getSupabaseBrowserClient().from("truth_comments").insert({ truth_id: truthId, user_id: userId, text, parent_id: parentId || null }).select("id,truth_id,user_id,parent_id,text,likes_count,created_at").single();
    if (error || !data) { console.error("addComment:", error); return null; }
    return { id: data.id, truthId, userId, username, displayName, avatarUrl, text, likes: data.likes_count ?? 0, parentId: parentId || null, createdAt: data.created_at };
  }

  subscribeToComments(truthId: string, callback: (comments: TruthComment[]) => void): Unsubscribe {
    const client = getSupabaseBrowserClient();
    const rows = new Map<string, CommentRow>();
    const profiles = new Map<string, ProfileRow>();
    let disposed = false;
    let initialized = false;
    const queued: any[] = [];
    const hydrateProfiles = async (ids: string[]) => {
      const missing = [...new Set(ids.filter((id) => id && !profiles.has(id)))];
      if (!missing.length) return;
      const result = await client.from("profiles").select("id,username,display_name,avatar_url").in("id", missing);
      for (const profile of (result.data ?? []) as ProfileRow[]) profiles.set(profile.id, profile);
      for (const id of missing) if (!profiles.has(id)) profiles.set(id, { id });
    };
    const emit = () => {
      if (disposed) return;
      callback([...rows.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id)).slice(0, COMMENT_PAGE_LIMIT).map((row) => {
        const profile = profileFor(profiles, row.user_id);
        return { id: row.id, truthId: row.truth_id, userId: row.user_id, username: profile.username || "", displayName: profile.display_name || profile.username || "User", avatarUrl: profile.avatar_url || "", text: row.text, likes: row.likes_count ?? 0, parentId: row.parent_id, createdAt: row.created_at };
      }));
    };
    const apply = async (payload: any) => {
      if (disposed) return;
      if (!initialized) { queued.push(payload); return; }
      const oldId = String(payload.old?.id || "");
      if (payload.eventType === "DELETE") rows.delete(oldId);
      else {
        const row = payload.new as CommentRow;
        if (!row?.id) return;
        rows.set(row.id, row);
        await hydrateProfiles([row.user_id]);
      }
      emit();
    };
    const load = async () => {
      const result = await client.from("truth_comments").select("id,truth_id,user_id,parent_id,text,likes_count,created_at").eq("truth_id", truthId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(COMMENT_PAGE_LIMIT);
      if (disposed || result.error) return;
      for (const row of (result.data ?? []) as CommentRow[]) rows.set(row.id, row);
      await hydrateProfiles([...rows.values()].map((row) => row.user_id));
      initialized = true;
      for (const payload of queued.splice(0)) await apply(payload);
      emit();
    };
    const controller = createRefreshController(async () => { await load(); return true; }, () => undefined, 100);
    const channel = client.channel(`truth-interactions:${truthId}`)
      .on("broadcast", { event: "truth_interaction_changed" }, () => controller.requestRefresh("interaction"))
      .subscribe((status) => { if (status === "SUBSCRIBED") controller.requestRefresh("connected"); else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") controller.requestRefresh("degraded"); });
    controller.requestRefresh("initial");
    const onVisible = () => controller.setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisible);
    return () => { disposed = true; controller.dispose(); document.removeEventListener("visibilitychange", onVisible); void client.removeChannel(channel); };
  }

  async likeComment(commentId: string): Promise<void> {
    const user = authService.getCurrentUser();
    if (!user?.id) return;
    const { error } = await getSupabaseBrowserClient().rpc("like_truth_comment_native", { p_comment_id: commentId, p_actor_id: user.id });
    if (error) throw error;
  }
}

export const truthInteractionsService = new TruthInteractionsService();
