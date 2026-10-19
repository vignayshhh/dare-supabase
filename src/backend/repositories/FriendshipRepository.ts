import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { IFriendshipRepository, Friendship, FriendshipStatus, CreateFriendshipRequest } from "@/backend/domain/interfaces/IFriendshipRepository";

const COLUMNS = "id,requester_id,addressee_id,status,created_at,updated_at";
type FriendshipRow = { id: string; requester_id: string; addressee_id: string; status: FriendshipStatus; created_at: string; updated_at: string };
const FRIENDSHIP_PAGE_SIZE = 200;

export class FriendshipRepository implements IFriendshipRepository {
  private map(row: FriendshipRow): Friendship { const status = row.status.toLowerCase() as FriendshipStatus; return { id: row.id, requesterId: row.requester_id, addresseeId: row.addressee_id, status, createdAt: row.created_at, acceptedAt: status === "accepted" ? row.updated_at : null }; }
  private canonical(a: string, b: string) { return [a, b].sort().join("_"); }

  async createFriendship(request: CreateFriendshipRequest): Promise<Friendship> {
    const client = getSupabaseBrowserClient();
    const id = this.canonical(request.requesterId, request.addresseeId);
    const { data: existing } = await client.from("friendships").select(COLUMNS).or(`and(requester_id.eq.${request.requesterId},addressee_id.eq.${request.addresseeId}),and(requester_id.eq.${request.addresseeId},addressee_id.eq.${request.requesterId})`).maybeSingle();
    if (existing) throw new Error("Friendship already exists");
    const { data, error } = await client.from("friendships").insert({ id, requester_id: request.requesterId, addressee_id: request.addresseeId, status: "PENDING" }).select(COLUMNS).single();
    if (error) throw error;
    return this.map(data as FriendshipRow);
  }

  async getFriendshipById(friendshipId: string): Promise<Friendship | null> {
    const { data, error } = await getSupabaseBrowserClient().from("friendships").select(COLUMNS).eq("id", friendshipId).maybeSingle();
    if (error) throw error;
    return data ? this.map(data as FriendshipRow) : null;
  }

  async getFriendshipBetweenUsers(user1Id: string, user2Id: string): Promise<Friendship | null> {
    const { data, error } = await getSupabaseBrowserClient().from("friendships").select(COLUMNS).or(`and(requester_id.eq.${user1Id},addressee_id.eq.${user2Id}),and(requester_id.eq.${user2Id},addressee_id.eq.${user1Id})`).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? this.map(data as FriendshipRow) : null;
  }

  async getFriendshipsForUser(userId: string): Promise<Friendship[]> {
    const client = getSupabaseBrowserClient(); const rows: FriendshipRow[] = [];
    for (let page = 0;; page += 1) { const { data, error } = await client.from("friendships").select(COLUMNS).or(`requester_id.eq.${userId},addressee_id.eq.${userId}`).order("created_at", { ascending: false }).order("id", { ascending: false }).range(page * FRIENDSHIP_PAGE_SIZE, (page + 1) * FRIENDSHIP_PAGE_SIZE - 1); if (error) throw error; const batch = (data ?? []) as FriendshipRow[]; rows.push(...batch); if (batch.length < FRIENDSHIP_PAGE_SIZE) break; }
    return rows.map((row) => this.map(row));
  }

  async getPendingFriendships(userId: string): Promise<Friendship[]> {
    const client = getSupabaseBrowserClient(); const rows: FriendshipRow[] = [];
    for (let page = 0;; page += 1) { const { data, error } = await client.from("friendships").select(COLUMNS).eq("addressee_id", userId).eq("status", "PENDING").order("created_at", { ascending: false }).order("id", { ascending: false }).range(page * FRIENDSHIP_PAGE_SIZE, (page + 1) * FRIENDSHIP_PAGE_SIZE - 1); if (error) throw error; const batch = (data ?? []) as FriendshipRow[]; rows.push(...batch); if (batch.length < FRIENDSHIP_PAGE_SIZE) break; }
    return rows.map((row) => this.map(row));
  }

  async getAcceptedFriends(userId: string): Promise<Friendship[]> {
    const client = getSupabaseBrowserClient(); const rows: FriendshipRow[] = [];
    for (let page = 0;; page += 1) { const { data, error } = await client.from("friendships").select(COLUMNS).eq("status", "ACCEPTED").or(`requester_id.eq.${userId},addressee_id.eq.${userId}`).order("updated_at", { ascending: false }).order("id", { ascending: false }).range(page * FRIENDSHIP_PAGE_SIZE, (page + 1) * FRIENDSHIP_PAGE_SIZE - 1); if (error) throw error; const batch = (data ?? []) as FriendshipRow[]; rows.push(...batch); if (batch.length < FRIENDSHIP_PAGE_SIZE) break; }
    return rows.map((row) => this.map(row));
  }

  async updateFriendshipStatus(friendshipId: string, status: FriendshipStatus): Promise<Friendship> {
    const updates: Record<string, unknown> = { status: status === "accepted" ? "ACCEPTED" : status === "pending" ? "PENDING" : "DECLINED" };
    if (status === "accepted") updates.updated_at = new Date().toISOString();
    const { data, error } = await getSupabaseBrowserClient().from("friendships").update(updates).eq("id", friendshipId).select(COLUMNS).single();
    if (error) throw error;
    return this.map(data as FriendshipRow);
  }

  async areUsersFriends(user1Id: string, user2Id: string): Promise<boolean> { return (await this.getFriendshipBetweenUsers(user1Id, user2Id))?.status === "accepted"; }
  async deleteFriendship(friendshipId: string): Promise<void> { const { error } = await getSupabaseBrowserClient().from("friendships").delete().eq("id", friendshipId); if (error) throw error; }
}
