import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  IPresenceRepository,
  Presence,
  UpdatePresenceRequest,
} from "@/backend/domain/interfaces/IPresenceRepository";

/** Friend-authorized Supabase Realtime Presence repository. */
export class PresenceRepository implements IPresenceRepository {
  private cache = new Map<string, Presence>();
  private channels = new Map<string, any>();

  private channel(userId: string, tracking = false) {
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

  private async ready(userId: string, tracking = false) {
    const channel = this.channel(userId, tracking);
    if (channel.state !== "joined") await channel.subscribe();
    return channel;
  }

  private map(userId: string, value: any): Presence {
    const timestamp = String(value?.last_seen || new Date().toISOString());
    return {
      id: userId,
      userId,
      isOnline: value?.is_online === true,
      lastSeen: timestamp,
      typingInChatWith: value?.typing_in_chat_with ?? null,
      updatedAt: timestamp,
    };
  }

  async getPresenceByUserId(userId: string) {
    const channel = await this.ready(userId);
    const entry = Object.values(channel.presenceState?.() ?? {}).flatMap(
      (items: any) => Array.isArray(items) ? items : [],
    )[0];
    if (entry) this.cache.set(userId, this.map(userId, entry));
    return this.cache.get(userId) ?? null;
  }

  async updatePresence(userId: string, updates: UpdatePresenceRequest) {
    const channel = await this.ready(userId, true);
    const previous = this.cache.get(userId) ?? this.map(userId, {});
    const next = this.map(userId, {
      is_online: updates.isOnline ?? previous.isOnline,
      typing_in_chat_with:
        updates.typingInChatWith === undefined
          ? previous.typingInChatWith
          : updates.typingInChatWith,
      last_seen: new Date().toISOString(),
    });
    this.cache.set(userId, next);
    await channel.track({
      user_id: userId,
      is_online: next.isOnline,
      typing_in_chat_with: next.typingInChatWith,
      current_activity: next.typingInChatWith ? "busy" : "active",
      last_seen: next.lastSeen,
    });
    return next;
  }

  setOnlineStatus(userId: string, isOnline: boolean) {
    return this.updatePresence(userId, { isOnline });
  }

  setTypingInChat(userId: string, chatUserId: string) {
    return this.updatePresence(userId, {
      isOnline: true,
      typingInChatWith: chatUserId,
    });
  }

  clearTypingInChat(userId: string) {
    return this.updatePresence(userId, { typingInChatWith: undefined });
  }

  async getOnlineUsers() {
    return [...this.cache.values()].filter((presence) => presence.isOnline);
  }

  async ensurePresenceExists(userId: string) {
    const existing = await this.getPresenceByUserId(userId);
    if (existing) return existing;
    const created = this.map(userId, {});
    this.cache.set(userId, created);
    return created;
  }
}
