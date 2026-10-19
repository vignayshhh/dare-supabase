import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/backend/types/database";
import { IFeedRepository, FeedEvent, EventType, CreateFeedEventRequest } from "@/backend/domain/interfaces/IFeedRepository";

type FeedEventRow = Database["public"]["Tables"]["feed_events"]["Row"];
const EVENT_COLUMNS = "id,user_id,event_type,related_post_id,related_dare_id,event_data,created_at";

export class FeedRepository implements IFeedRepository {
  private map(row: FeedEventRow): FeedEvent {
    return { id: row.id, userId: row.user_id, eventType: row.event_type, relatedPostId: row.related_post_id, relatedDareId: row.related_dare_id, relatedTruthId: null, eventData: row.event_data, createdAt: row.created_at };
  }

  async createFeedEvent(request: CreateFeedEventRequest): Promise<FeedEvent> {
    const { data, error } = await getSupabaseBrowserClient().from("feed_events").insert({ user_id: request.userId, event_type: request.eventType, related_post_id: request.relatedPostId ?? null, related_dare_id: request.relatedDareId ?? null, event_data: request.eventData ?? null }).select(EVENT_COLUMNS).single();
    if (error) throw error;
    return this.map(data as FeedEventRow);
  }

  async getFeedEventsForUser(userId: string, limitCount = 50): Promise<FeedEvent[]> {
    const { data, error } = await getSupabaseBrowserClient().from("feed_events").select(EVENT_COLUMNS).eq("user_id", userId).order("created_at", { ascending: false }).limit(Math.max(1, Math.min(limitCount, 100)));
    if (error) throw error;
    return ((data ?? []) as FeedEventRow[]).map((row) => this.map(row));
  }

  async getFeedEventsByType(eventType: EventType, limitCount = 50): Promise<FeedEvent[]> {
    const { data, error } = await getSupabaseBrowserClient().from("feed_events").select(EVENT_COLUMNS).eq("event_type", eventType).order("created_at", { ascending: false }).limit(Math.max(1, Math.min(limitCount, 100)));
    if (error) throw error;
    return ((data ?? []) as FeedEventRow[]).map((row) => this.map(row));
  }

  async deleteFeedEvent(eventId: string): Promise<void> {
    const { error } = await getSupabaseBrowserClient().from("feed_events").delete().eq("id", eventId);
    if (error) throw error;
  }

  async getFeedEventsForUserFriends(userId: string, limitCount = 50): Promise<FeedEvent[]> {
    const client = getSupabaseBrowserClient();
    const { data: friendships, error: friendshipError } = await client.from("friendships").select("requester_id,addressee_id").eq("status", "accepted").or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    if (friendshipError) throw friendshipError;
    const friendIds = [...new Set((friendships ?? []).map((row) => row.requester_id === userId ? row.addressee_id : row.requester_id))];
    if (friendIds.length === 0) return [];
    const { data, error } = await client.from("feed_events").select(EVENT_COLUMNS).in("user_id", friendIds).order("created_at", { ascending: false }).limit(Math.max(1, Math.min(limitCount, 100)));
    if (error) throw error;
    return ((data ?? []) as FeedEventRow[]).map((row) => this.map(row));
  }

  async getFeedEventById(eventId: string): Promise<FeedEvent | null> {
    const { data, error } = await getSupabaseBrowserClient().from("feed_events").select(EVENT_COLUMNS).eq("id", eventId).maybeSingle();
    if (error) throw error;
    return data ? this.map(data as FeedEventRow) : null;
  }

  async getPostById(postId: string): Promise<any> {
    const { data, error } = await getSupabaseBrowserClient().from("posts").select("id,author_id,content,media_url,media_type,view_count,created_at,updated_at").eq("id", postId).maybeSingle();
    if (error) throw error;
    return data;
  }

  async getDareById(dareId: string): Promise<any> {
    const { data, error } = await getSupabaseBrowserClient().from("dares").select("id,challenger_id,receiver_id,description,state,proof_media_url,proof_media_type,proof_thumbnail_url,created_at,updated_at").eq("id", dareId).maybeSingle();
    if (error) throw error;
    return data;
  }

  async getUserById(userId: string): Promise<any> {
    const { data, error } = await getSupabaseBrowserClient().from("profiles").select("id,username,display_name,bio,avatar_url,visibility").eq("id", userId).maybeSingle();
    if (error) throw error;
    return data;
  }
}
