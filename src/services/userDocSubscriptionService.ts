import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { signedUrlService } from "@/security/signedUrls";

export interface UserDocSnapshotData {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string;
  raw: Record<string, unknown>;
}

type Subscriber = (data: UserDocSnapshotData | null) => void;
type ProfileRow = { id: string; display_name: string | null; username: string; avatar_url: string | null } & Record<string, unknown>;
type SubscriptionEntry = { channel: RealtimeChannel; subscribers: Set<Subscriber>; lastData: UserDocSnapshotData | null; disposed: boolean };

const PROFILE_COLUMNS = "id,display_name,username,avatar_url,stickman_status_id,stickman_status_updated_at,stickman_accessory_id,stickman_animation_id,stickman_customization_updated_at";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const normalizeProfile = (row: ProfileRow | null): UserDocSnapshotData | null => row ? {
  userId: row.id,
  displayName: row.display_name || row.username || "",
  username: row.username || "",
  avatarUrl: row.avatar_url || "",
  raw: row,
} : null;

class UserDocSubscriptionService {
  private subscriptions = new Map<string, SubscriptionEntry>();
  private readonly loadCache = new Map<string, { data: UserDocSnapshotData | null; expiresAt: number }>();
  private readonly loadCacheTtlMs = 5 * 60_000;

  async load(userId: string): Promise<UserDocSnapshotData | null> {
    if (!UUID.test(userId)) return null;
    const cached = this.loadCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    const { data, error } = await getSupabaseBrowserClient()
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      console.error(`Error loading profile ${userId}:`, error.message);
      return cached?.data ?? null;
    }
    const next = normalizeProfile((data as ProfileRow | null) || null);
    if (!next) {
      this.loadCache.set(userId, { data: null, expiresAt: Date.now() + this.loadCacheTtlMs });
      return null;
    }
    const avatarUrl = await signedUrlService.refreshStoredMediaUrl(next.avatarUrl);
    const resolved = { ...next, avatarUrl, raw: { ...next.raw, avatar_url: avatarUrl } };
    this.loadCache.set(userId, { data: resolved, expiresAt: Date.now() + this.loadCacheTtlMs });
    return resolved;
  }

  subscribe(userId: string, callback: Subscriber): () => void {
    // Profile IDs are UUIDs. Placeholder/feed IDs must never become REST
    // filters, which otherwise yields noisy 400s and needless subscriptions.
    if (!UUID.test(userId)) { callback(null); return () => {}; }
    let entry = this.subscriptions.get(userId);
    if (!entry) {
      const client = getSupabaseBrowserClient();
      const subscribers = new Set<Subscriber>();
      const channel = client.channel(`profile:${userId}`).on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}`,
      }, (payload) => {
        const current = this.subscriptions.get(userId);
        if (!current || current.disposed) return;
        const next = normalizeProfile(payload.new as ProfileRow);
        void signedUrlService.refreshStoredMediaUrl(next?.avatarUrl || "").then((avatarUrl) => {
          const latest = this.subscriptions.get(userId);
          if (!latest || latest.disposed) return;
          latest.lastData = next ? { ...next, avatarUrl, raw: { ...next.raw, avatar_url: avatarUrl } } : null;
          this.loadCache.set(userId, { data: latest.lastData, expiresAt: Date.now() + this.loadCacheTtlMs });
          latest.subscribers.forEach((subscriber) => subscriber(latest.lastData));
        });
      });
      entry = { channel, subscribers, lastData: null, disposed: false };
      this.subscriptions.set(userId, entry);
      channel.subscribe();
      void client.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle().then(async ({ data, error }) => {
        const current = this.subscriptions.get(userId);
        if (!current || current.disposed) return;
        if (error) console.error(`Error loading shared profile ${userId}:`, error.message);
        const next = normalizeProfile((data as ProfileRow | null) || null);
        const avatarUrl = await signedUrlService.refreshStoredMediaUrl(next?.avatarUrl || "");
        current.lastData = next ? { ...next, avatarUrl, raw: { ...next.raw, avatar_url: avatarUrl } } : null;
        this.loadCache.set(userId, { data: current.lastData, expiresAt: Date.now() + this.loadCacheTtlMs });
        current.subscribers.forEach((subscriber) => subscriber(current.lastData));
      });
    }
    entry.subscribers.add(callback);
    if (entry.lastData) callback(entry.lastData);
    return () => {
      const current = this.subscriptions.get(userId);
      if (!current) return;
      current.subscribers.delete(callback);
      if (current.subscribers.size === 0) {
        current.disposed = true;
        this.subscriptions.delete(userId);
        void getSupabaseBrowserClient().removeChannel(current.channel);
      }
    };
  }
}

export const userDocSubscriptionService = new UserDocSubscriptionService();
