import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export interface Presence {
  id: string;
  user_id: string;
  is_online: boolean;
  last_seen: string;
  current_activity?: "active" | "away" | "busy";
}

/** Ephemeral, friend-authorized Supabase Presence. No database writes. */
class PresenceService {
  private channels = new Map<string, any>();
  private joined = new Map<string, Promise<any>>();

  private room(userId: string, tracking = false) {
    const key = `${userId}:${tracking ? "track" : "watch"}`;
    let channel = this.channels.get(key);
    if (!channel) {
      channel = (getSupabaseBrowserClient() as any).channel(
        `presence:user:${userId}`,
        tracking
          ? { config: { private: true, presence: { key: userId } } }
          : { config: { private: true } },
      );
      this.channels.set(key, channel);
    }
    return channel;
  }

  private async ensureJoined(userId: string, tracking = false) {
    const key = `${userId}:${tracking ? "track" : "watch"}`;
    let pending = this.joined.get(key);
    if (!pending) {
      const channel = this.room(userId, tracking);
      pending = Promise.resolve(channel.subscribe()).then(() => channel);
      this.joined.set(key, pending);
    }
    return pending;
  }

  private read(userId: string, tracking = false): Presence | null {
    const state = this.room(userId, tracking).presenceState?.() ?? {};
    const entry = Object.values(state).flatMap((items: any) =>
      Array.isArray(items) ? items : [],
    )[0] as any;
    return entry
      ? {
          id: userId,
          user_id: userId,
          is_online: entry.is_online === true,
          last_seen: String(entry.last_seen || new Date().toISOString()),
          current_activity: entry.current_activity,
        }
      : null;
  }

  async updatePresence(
    userId: string,
    isOnline: boolean,
    activity: Presence["current_activity"] = "active",
  ) {
    try {
      const channel = await this.ensureJoined(userId, true);
      await channel.track({
        user_id: userId,
        is_online: isOnline,
        current_activity: activity,
        last_seen: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error updating presence:", error);
    }
  }

  async getPresence(userId: string): Promise<Presence | null> {
    await this.ensureJoined(userId);
    return this.read(userId);
  }

  async getFriendsPresence(userId: string): Promise<Presence[]> {
    const { data, error } = await (getSupabaseBrowserClient() as any)
      .from("friendships")
      .select("requester_id,addressee_id")
      .eq("status", "ACCEPTED")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    if (error) throw error;
    const friendIds = (data ?? []).map((item: any) =>
      item.requester_id === userId ? item.addressee_id : item.requester_id,
    );
    await Promise.all(friendIds.map((friendId: string) => this.ensureJoined(friendId)));
    return friendIds
      .map((friendId: string) => this.read(friendId))
      .filter((item: Presence | null): item is Presence => item?.is_online === true);
  }

  subscribeToPresence(userId: string, callback: (presence: Presence) => void) {
    const channel = this.room(userId);
    const emit = () => {
      const presence = this.read(userId);
      if (presence) callback(presence);
    };
    channel.on("presence", { event: "sync" }, emit);
    void this.ensureJoined(userId).then(emit);
    return () => channel.off("presence", { event: "sync" }, emit);
  }

  subscribeToFriendsPresence(userId: string, callback: (presence: Presence[]) => void) {
    let active = true;
    const unsubscribes: Array<() => void> = [];
    void (getSupabaseBrowserClient() as any)
      .from("friendships")
      .select("requester_id,addressee_id")
      .eq("status", "ACCEPTED")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .then(({ data }: any) => {
        if (!active) return;
        const ids = (data ?? []).map((item: any) =>
          item.requester_id === userId ? item.addressee_id : item.requester_id,
        );
        const emit = () => callback(
          ids.map((id: string) => this.read(id)).filter(
            (item: Presence | null): item is Presence => item?.is_online === true,
          ),
        );
        ids.forEach((id: string) => {
          const channel = this.room(id);
          channel.on("presence", { event: "sync" }, emit);
          unsubscribes.push(() => channel.off("presence", { event: "sync" }, emit));
          void this.ensureJoined(id).then(emit);
        });
      });
    return () => {
      active = false;
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }

  async cleanupOfflinePresence(): Promise<void> {}

  async setUserActivity(
    userId: string,
    activity: NonNullable<Presence["current_activity"]>,
  ) {
    await this.updatePresence(userId, true, activity);
  }
}

export const presenceService = new PresenceService();
