import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface CloseFriendProfile { id: string; userId: string; username: string; displayName: string | null; avatarUrl: string | null; }
const TTL = 5 * 60 * 1000;
class CloseFriendsService {
  private ownerCache = new Map<string, { ids: string[]; expiresAt: number }>();
  private watcherCache = new Map<string, { ids: string[]; expiresAt: number }>();
  private friendsCache = new Map<string, { ids: string[]; expiresAt: number }>();
  private invalidate(...ids: string[]) { ids.forEach((id) => { this.ownerCache.delete(id); this.watcherCache.delete(id); this.friendsCache.delete(id); }); }
  async addCloseFriend(ownerId: string, targetUserId: string) {
    if (!ownerId || !targetUserId) return { success: false, error: "Missing user ids" };
    if (ownerId === targetUserId) return { success: false, error: "You cannot add yourself as a close friend" };
    const client = getSupabaseBrowserClient();
    const { data: friendship } = await client.from("friendships").select("id").or(`and(requester_id.eq.${ownerId},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${ownerId})`).eq("status", "ACCEPTED").maybeSingle();
    if (!friendship) return { success: false, error: "You can only add accepted friends to close friends" };
    const { error } = await client.from("close_friends").upsert({ owner_id: ownerId, close_friend_id: targetUserId }, { onConflict: "owner_id,close_friend_id" });
    if (error) return { success: false, error: error.message }; this.invalidate(ownerId, targetUserId); return { success: true };
  }
  async removeCloseFriend(ownerId: string, targetUserId: string) { const { error } = await getSupabaseBrowserClient().from("close_friends").delete().eq("owner_id", ownerId).eq("close_friend_id", targetUserId); if (error) return { success: false, error: error.message }; this.invalidate(ownerId, targetUserId); return { success: true }; }
  async isCloseFriend(ownerId: string, targetUserId: string) { const { data, error } = await getSupabaseBrowserClient().from("close_friends").select("owner_id").eq("owner_id", ownerId).eq("close_friend_id", targetUserId).maybeSingle(); return error ? { success: false, isCloseFriend: false, error: error.message } : { success: true, isCloseFriend: Boolean(data) }; }
  async getCloseFriendIds(ownerId: string): Promise<string[]> { const cached = this.ownerCache.get(ownerId); if (cached && cached.expiresAt > Date.now()) return cached.ids; const { data } = await getSupabaseBrowserClient().from("close_friends").select("close_friend_id").eq("owner_id", ownerId); const ids = (data ?? []).map((row) => row.close_friend_id); this.ownerCache.set(ownerId, { ids, expiresAt: Date.now() + TTL }); return ids; }
  async getWatcherIdsForActor(actorId: string): Promise<string[]> { const cached = this.watcherCache.get(actorId); if (cached && cached.expiresAt > Date.now()) return cached.ids; const { data } = await getSupabaseBrowserClient().from("close_friends").select("owner_id").eq("close_friend_id", actorId); const ids = (data ?? []).map((row) => row.owner_id); this.watcherCache.set(actorId, { ids, expiresAt: Date.now() + TTL }); return ids; }
  async getCloseFriends(ownerId: string) { try { const ids = await this.getCloseFriendIds(ownerId); if (!ids.length) return { success: true, friends: [] as CloseFriendProfile[] }; const { data, error } = await getSupabaseBrowserClient().from("profiles").select("id,username,display_name,avatar_url").in("id", ids); if (error) throw error; type Profile = { id: string; username?: string | null; display_name?: string | null; avatar_url?: string | null }; const byId = new Map<string, Profile>(((data ?? []) as Profile[]).map((p) => [p.id, p])); return { success: true, friends: ids.map((id) => { const p = byId.get(id); return p ? { id, userId: id, username: p.username ?? "unknown", displayName: p.display_name ?? null, avatarUrl: p.avatar_url ?? null } : null; }).filter(Boolean) as CloseFriendProfile[] }; } catch (error) { return { success: false, friends: [] as CloseFriendProfile[], error: error instanceof Error ? error.message : "Unknown error" }; } }
}
export const closeFriendsService = new CloseFriendsService();
