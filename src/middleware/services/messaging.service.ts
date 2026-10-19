import { guardCircleResult } from "./guardCircleResult";
// Supabase-only messaging service.
type Unsubscribe = () => void;
import {
  getCachedResolvedUserProfile,
  primeResolvedUserProfile,
  resolveUserProfile,
} from "@/utils/profileResolver";
import { validateRequiredText, SECURITY_LIMITS } from "@/security/appSecurity";
import { logBackendError } from "@/utils/backendErrors";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { recordResourceMetric } from "@/lib/observability/resourceMetrics";
import { createUuid } from "@/utils/uuid";

const draftState = new Map<string, { userId: string; text: string }>();

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  sender_profile?: {
    id: string;
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  media_url?: string;
  media_type?: "TEXT" | "PHOTO" | "VIDEO";
  created_at: string;
  updated_at: string;
  is_delivered: boolean;
  is_seen: boolean;
  reply_to?: {
    id: string;
    sender_id: string;
    sender_name: string;
    content: string;
    media_type?: "TEXT" | "PHOTO" | "VIDEO" | string | null;
  } | null;
}

export interface Conversation {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at: string;
  updated_at: string;
  last_message_at?: string;
  last_message_content?: string;
  unread_count_by_user?: Record<string, number>;
  last_seen_by_user?: Record<string, unknown>;
  last_seen_message_id_by_user?: Record<string, string>;
  cleared_at?: string | null;
  cleared_at_by_user?: Record<string, string | null>;
  temporary_participant_ids?: string[];
}

export interface MessageEvent {
  id: string;
  conversation_id: string;
  user_id: string;
  event_type:
    | "message_sent"
    | "message_seen"
    | "message_delivered"
    | "typing_started"
    | "typing_stopped"
    | "screenshot"
    | "chat_switch"
    | "opened_noreply"
    | "long_unsent"
    | "mention"
    | "ignored"
    | "invite";
  data?: any;
  participants?: string[];
  created_at: string;
}

export interface TypingIndicator {
  id: string;
  conversation_id: string;
  user_id: string;
  is_typing: boolean;
  is_online?: boolean;
  typing_speed?: "slow" | "normal" | "fast" | "furious";
  last_seen: string;
}

export interface UserPresenceStatus {
  userId: string;
  isOnline: boolean;
  lastSeen: string | number | null;
  timezone: string;
  typingConversationId?: string | null;
  typingSpeed?: string;
}

function getClientTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export interface CreateMessageRequest {
  conversation_id: string;
  sender_id: string;
  content: string;
  media_url?: string;
  media_type?: string;
}

export interface MessageWithSender extends Omit<
  Message,
  "is_delivered" | "is_seen"
> {
  sender: {
    id: string;
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export interface ConversationWithUser extends Conversation {
  other_user: {
    id: string;
    user_id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  last_message?: MessageWithSender | undefined;
  unread_count?: number;
  is_online?: boolean;
  is_typing?: boolean;
  typing_speed?: "slow" | "normal" | "fast" | "furious";
  events?: MessageEvent[];
}

export interface MessageEventDetail {
  conversation_id: string;
  event: MessageEvent;
  message?: MessageWithSender;
}

export interface ChatSwitchSignal {
  id: string;
  conversation_id: string;
  user_id: string;
  target_user_id: string;
  target_user_name: string;
  recipient_user_id?: string;
  created_at: number;
}

export interface ActiveUserChatStatus {
  isOnline: boolean;
  lastSeen: string | number | null;
  timezone: string;
  currentChatUserId: string;
  currentChatUserName: string;
}

export interface MoodBlockState {
  mood: "angry" | "crying" | "irritated" | "depressed";
  initiatedBy: string;
  initiatedByName: string;
  startTime: number;
  endTime: number;
}

// Minimal sender stub â€” ensures a message is never dropped due to a failed
// or slow profile fetch.
function fallbackSender(userId: string) {
  return {
    id: userId,
    user_id: userId,
    username: `user_${userId.slice(-6)}`,
    display_name: null,
    avatar_url: null,
  };
}

function normalizeUserProfileSnapshot(userId: string, profile: any) {
  return {
    id: profile?.id || userId,
    user_id: profile?.user_id || profile?.userId || profile?.id || userId,
    username: profile?.username || (userId ? `user_${userId.slice(-6)}` : ""),
    display_name:
      profile?.display_name || profile?.displayName || profile?.username || null,
    avatar_url: profile?.avatar_url || profile?.avatarUrl || profile?.photoURL || null,
  };
}

class MessagingService {
  // In-memory profile cache to avoid repeated Postgres reads for the same
  // user. Entries expire after 5 minutes.
  private profileCache = new Map<string, any>();
  private conversationMetaCache = new Map<string, string>();
  private typingChannels = new Map<
    string,
    {
      channel: any;
      listeners: Set<(payload: any) => void>;
      refs: number;
      ready: Promise<void>;
    }
  >();
  private broadcastDraftChannels = new Map<string, any>();
  private conversationStateChannels = new Map<
    string,
    {
      channel: any;
      listeners: Map<string, Set<(payload: any) => void>>;
      refs: number;
      ready: Promise<void>;
      initialState: Promise<{
        freeze: { is_frozen: boolean; frozen_by: string | null };
        mood: MoodBlockState | null;
      }>;
      state: {
        freeze: { is_frozen: boolean; frozen_by: string | null };
        mood: MoodBlockState | null;
      };
      stateVersion: number;
      connected: boolean;
      recoveryAttempt: number;
      recoveryTimer: ReturnType<typeof setTimeout> | null;
    }
  >();
  private onlinePresenceChannel: any = null;
  private onlinePresenceReady: Promise<void> | null = null;
  private onlinePresenceUserId: string | null = null;
  private onlinePresencePayload: Record<string, unknown> | null = null;
  private onlinePresenceTrackInFlight: Promise<void> | null = null;
  private presenceWatchers = new Map<
    string,
    { channel: any; listeners: Set<() => void>; references: number }
  >();

  private subscribeToUserPresence(userId: string, listener: () => void): Unsubscribe {
    if (!userId) return () => {};

    // The Realtime client returns an existing channel for an existing topic.
    // Register its presence callback exactly once, before subscribing, and fan
    // updates out to all consumers of that topic.
    if (this.onlinePresenceUserId === userId && this.onlinePresenceChannel) {
      listener();
      return () => {};
    }

    let entry = this.presenceWatchers.get(userId);
    if (!entry) {
      const channel = getSupabaseBrowserClient().channel(`presence:user:${userId}`, {
        config: { private: true },
      });
      const listeners = new Set<() => void>();
      entry = { channel, listeners, references: 0 };
      const emit = () => entry?.listeners.forEach((callback) => callback());
      channel.on("presence", { event: "sync" }, emit);
      channel.subscribe((status: string) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`Presence watcher ${status.toLowerCase()} for ${userId}`);
        }
        if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") emit();
      });
      this.presenceWatchers.set(userId, entry);
    }

    entry.references += 1;
    entry.listeners.add(listener);
    listener();
    return () => {
      const current = this.presenceWatchers.get(userId);
      if (!current) return;
      current.listeners.delete(listener);
      current.references = Math.max(0, current.references - 1);
      if (current.references === 0) {
        this.presenceWatchers.delete(userId);
        void getSupabaseBrowserClient().removeChannel(current.channel);
      }
    };
  }

  private isUserPresent(userId: string): boolean {
    const channel = this.presenceWatchers.get(userId)?.channel ||
      (this.onlinePresenceUserId === userId ? this.onlinePresenceChannel : null);
    if (!channel) return false;
    return Object.values(channel.presenceState() as Record<string, unknown[]>)
      .flat()
      .some((entry) => String((entry as any)?.user_id || "") === userId);
  }

  private getTypingChannel(conversationId: string) {
    const existing = this.typingChannels.get(conversationId);
    if (existing) return existing;
    const client = getSupabaseBrowserClient();
    const listeners = new Set<(payload: any) => void>();
    const channel = client.channel(`typing:${conversationId}`, {
      config: { private: true },
    });
    channel.on("broadcast", { event: "typing" }, (message: any) => {
      recordResourceMetric("realtime_messages");
      const payload = message?.payload ?? {};
      listeners.forEach((listener) => listener(payload));
    });
    const ready = new Promise<void>((resolve, reject) => {
      recordResourceMetric("realtime_joins");
      channel.subscribe((status: string) => {
        if (status === "SUBSCRIBED") resolve();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          reject(new Error(`Typing channel ${status.toLowerCase()}`));
        }
      });
    });
    const entry = {
      channel,
      listeners,
      refs: 0,
      ready,
    };
    this.typingChannels.set(conversationId, entry);
    return entry;
  }

  private subscribeToTypingPayload(
    conversationId: string,
    listener: (payload: any) => void,
  ): Unsubscribe {
    const entry = this.getTypingChannel(conversationId);
    entry.refs += 1;
    entry.listeners.add(listener);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      entry.listeners.delete(listener);
      entry.refs = Math.max(0, entry.refs - 1);
      if (entry.refs === 0) {
        this.typingChannels.delete(conversationId);
        void getSupabaseBrowserClient().removeChannel(entry.channel);
      }
    };
  }

  private async trackOnlinePresence(
    userId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const client = getSupabaseBrowserClient();
    if (!this.onlinePresenceChannel) {
      this.onlinePresenceUserId = userId;
      this.onlinePresenceChannel = client.channel(`presence:user:${userId}`, {
        config: { private: true, presence: { key: userId } },
      });
      const createdChannel = this.onlinePresenceChannel;
      this.onlinePresenceReady = new Promise<void>((resolve, reject) => {
        recordResourceMetric("realtime_joins");
        createdChannel.subscribe((status: string) => {
          if (status === "SUBSCRIBED") resolve();
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            reject(new Error(`Presence channel ${status.toLowerCase()}`));
          }
        });
      });
    }
    try {
      await this.onlinePresenceReady;
    } catch (error) {
      const failedChannel = this.onlinePresenceChannel;
      this.onlinePresenceChannel = null;
      this.onlinePresenceReady = null;
      this.onlinePresenceUserId = null;
      if (failedChannel) void client.removeChannel(failedChannel);
      throw error;
    }
    this.onlinePresencePayload = {
      user_id: userId,
      is_online: true,
      last_seen: new Date().toISOString(),
      timezone: getClientTimeZone(),
      ...(this.onlinePresencePayload || {}),
      ...patch,
    };
    if (!this.onlinePresenceTrackInFlight) {
      this.onlinePresenceTrackInFlight = (async () => {
        let sentPayload: Record<string, unknown> | null = null;
        while (this.onlinePresencePayload && sentPayload !== this.onlinePresencePayload) {
          sentPayload = this.onlinePresencePayload;
          const trackResult = await this.onlinePresenceChannel.track(sentPayload);
          if (trackResult !== "ok") {
            throw new Error(`Presence track ${String(trackResult)}`);
          }
        }
      })().finally(() => {
        this.onlinePresenceTrackInFlight = null;
      });
    }
    await this.onlinePresenceTrackInFlight;
  }

  private async sendConversationSignal(
    conversationId: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const entry = this.getConversationStateChannel(conversationId);
    await entry.ready;
    await entry.channel.send({ type: "broadcast", event, payload });
    if (entry.refs === 0 && this.conversationStateChannels.get(conversationId) === entry) {
      this.conversationStateChannels.delete(conversationId);
      void getSupabaseBrowserClient().removeChannel(entry.channel);
    }
  }

  private applyConversationStatePayload(
    conversationId: string,
    event: "freeze" | "mood",
    payload: any,
  ): void {
    const current = this.conversationStateChannels.get(conversationId);
    if (!current) return;
    current.stateVersion += 1;
    if (event === "freeze") {
      current.state.freeze = {
        is_frozen: payload.is_frozen === true,
        frozen_by: payload.frozen_by ? String(payload.frozen_by) : null,
      };
    } else {
      current.state.mood = payload.cleared === true || Number(payload.endTime || 0) <= Date.now()
        ? null
        : {
            mood: payload.mood,
            initiatedBy: String(payload.initiatedBy || ""),
            initiatedByName: String(payload.initiatedByName || "Someone"),
            startTime: Number(payload.startTime || 0),
            endTime: Number(payload.endTime || 0),
          } as MoodBlockState;
    }
    current.listeners.get(event)?.forEach((listener) => listener(payload));
  }

  private getConversationStateChannel(conversationId: string) {
    const existing = this.conversationStateChannels.get(conversationId);
    if (existing) return existing;

    const client = getSupabaseBrowserClient();
    const listeners = new Map<string, Set<(payload: any) => void>>();
    const channel = client.channel(`conversation-state:${conversationId}`, {
      config: { private: true },
    });
    for (const event of ["freeze", "mood", "chat-switch", "read"]) {
      channel.on("broadcast", { event }, (message: any) => {
        recordResourceMetric("realtime_messages");
        const payload = message?.payload ?? {};
        if (event === "freeze" || event === "mood") {
          this.applyConversationStatePayload(conversationId, event, payload);
        } else {
          listeners.get(event)?.forEach((listener) => listener(payload));
        }
      });
    }
    const loadState = () => client
        .from("conversations")
        .select("legacy_payload")
        .eq("id", conversationId)
        .single()
      .then(({ data, error }: any) => {
        if (error) throw error;
        const legacy = data?.legacy_payload ?? {};
        const rawMood = legacy.mood_block;
        const mood = rawMood && Number(rawMood.endTime || 0) > Date.now()
          ? {
              mood: rawMood.mood,
              initiatedBy: String(rawMood.initiatedBy || ""),
              initiatedByName: String(rawMood.initiatedByName || "Someone"),
              startTime: Number(rawMood.startTime || 0),
              endTime: Number(rawMood.endTime || 0),
            } as MoodBlockState
          : null;
        return {
          freeze: {
            is_frozen: legacy.is_frozen === true,
            frozen_by: legacy.frozen_by ? String(legacy.frozen_by) : null,
          },
          mood,
        };
      });
    const defaultState = {
      freeze: { is_frozen: false, frozen_by: null as string | null },
      mood: null as MoodBlockState | null,
    };
    let resolveReady: () => void = () => {};
    let rejectReady: (error: Error) => void = () => {};
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const entry = {
      channel,
      listeners,
      refs: 0,
      ready,
      initialState: Promise.resolve(defaultState),
      state: defaultState,
      stateVersion: 0,
      connected: false,
      recoveryAttempt: 0,
      recoveryTimer: null as ReturnType<typeof setTimeout> | null,
    };
    let loadedBeforeJoin = false;
    const emitLoadedState = (loadedState: typeof defaultState) => {
      entry.state = loadedState;
      entry.stateVersion += 1;
      listeners.get("freeze")?.forEach((listener) => listener(loadedState.freeze));
      listeners.get("mood")?.forEach((listener) => listener(
        loadedState.mood ?? { cleared: true },
      ));
    };
    const scheduleRecovery = () => {
      if (entry.connected || entry.recoveryTimer || entry.refs === 0) return;
      const delay = Math.min(1_000 * 2 ** entry.recoveryAttempt, 15_000);
      entry.recoveryAttempt += 1;
      entry.recoveryTimer = setTimeout(() => {
        entry.recoveryTimer = null;
        void loadState()
          .then(emitLoadedState)
          .catch((error) => console.warn("Conversation state recovery read failed:", error))
          .finally(scheduleRecovery);
      }, delay);
    };
    recordResourceMetric("realtime_joins");
    channel.subscribe((status: string) => {
      if (status === "SUBSCRIBED") {
        const shouldReconcile = entry.recoveryAttempt > 0 || loadedBeforeJoin;
        entry.connected = true;
        loadedBeforeJoin = false;
        if (entry.recoveryTimer) clearTimeout(entry.recoveryTimer);
        entry.recoveryTimer = null;
        resolveReady();
        if (shouldReconcile) void loadState().then(emitLoadedState).catch((error) =>
          console.warn("Conversation state reconnect read failed:", error));
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        entry.connected = false;
        rejectReady(new Error(`Conversation state channel ${status.toLowerCase()}`));
        scheduleRecovery();
      }
    });
    const initialState = Promise.race([
      ready.catch((error) => {
        console.warn("Conversation state realtime unavailable; using durable state:", error);
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 750)),
    ]).then(loadState).then((loadedState) => {
      if (!entry.connected) loadedBeforeJoin = true;
      return loadedState;
    });
    entry.initialState = initialState.then((loadedState) => {
      if (entry.stateVersion === 0) entry.state = loadedState;
      return entry.state;
    });
    this.conversationStateChannels.set(conversationId, entry);
    return entry;
  }

  private subscribeToConversationSignal(
    conversationId: string,
    event: string,
    listener: (payload: any) => void,
  ): Unsubscribe {
    const entry = this.getConversationStateChannel(conversationId);
    const eventListeners = entry.listeners.get(event) ?? new Set<(payload: any) => void>();
    eventListeners.add(listener);
    entry.listeners.set(event, eventListeners);
    entry.refs += 1;
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      eventListeners.delete(listener);
      entry.refs = Math.max(0, entry.refs - 1);
      if (entry.refs === 0 && this.conversationStateChannels.get(conversationId) === entry) {
        if (entry.recoveryTimer) clearTimeout(entry.recoveryTimer);
        this.conversationStateChannels.delete(conversationId);
        void getSupabaseBrowserClient().removeChannel(entry.channel);
      }
    };
  }

  private async persistConversationState(
    conversationId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await getSupabaseBrowserClient().rpc("update_conversation_state", {
      p_conversation_id: conversationId,
      p_patch: patch,
    });
    if (error) throw error;
  }

  private async getCachedUserProfile(userId: string): Promise<any> {
    const sharedCachedProfile = getCachedResolvedUserProfile(userId);
    if (sharedCachedProfile) {
      this.profileCache.set(userId, sharedCachedProfile);
      return sharedCachedProfile;
    }

    if (this.profileCache.has(userId)) {
      return this.profileCache.get(userId);
    }
    const profile = await resolveUserProfile(userId);
    if (profile) {
      this.profileCache.set(userId, profile);
      setTimeout(() => this.profileCache.delete(userId), 5 * 60 * 1000);
    }
    return profile;
  }

  setCurrentChatPresence(
    userId: string,
    currentChatUserId: string,
    currentChatUserName: string,
  ): void {
    void this.trackOnlinePresence(userId, {
      current_chat_user_id: currentChatUserId,
      current_chat_user_name: currentChatUserName || "someone",
      is_active: true,
    }).catch((error) => console.error("setCurrentChatPresence:", error));
  }

  clearCurrentChatPresence(userId: string): void {
    void this.trackOnlinePresence(userId, {
      current_chat_user_id: "",
      current_chat_user_name: "",
      is_active: false,
    }).catch((error) => console.error("clearCurrentChatPresence:", error));
  }

  async getCurrentChatPresence(userId: string): Promise<{
    currentChatUserId: string;
    currentChatUserName: string;
    isActive: boolean;
  } | null> {
    const client = getSupabaseBrowserClient();
    const channel = client.channel(`presence:user:${userId}`, { config: { private: true } });
    await channel.subscribe();
    const entry = Object.values(channel.presenceState() as Record<string, any[]>)
      .flat()
      .find((value: any) => String(value?.user_id || "") === userId) as any;
    await client.removeChannel(channel);
    return entry
      ? {
          currentChatUserId: String(entry.current_chat_user_id || ""),
          currentChatUserName: String(entry.current_chat_user_name || ""),
          isActive: entry.is_active === true,
        }
      : null;
  }

  subscribeToActiveUserChatStatus(
    userId: string,
    callback: (status: ActiveUserChatStatus) => void,
  ): () => void {
    const emit = () => {
      const channel = this.presenceWatchers.get(userId)?.channel ||
        (this.onlinePresenceUserId === userId ? this.onlinePresenceChannel : null);
      const entry = Object.values(channel.presenceState() as Record<string, any[]>)
        .flat()
        .find((value: any) => String(value?.user_id || "") === userId) as any;
      callback({
        isOnline: entry?.is_online === true,
        lastSeen: entry?.last_seen ?? null,
        timezone: String(entry?.timezone || getClientTimeZone()),
        currentChatUserId: String(entry?.current_chat_user_id || ""),
        currentChatUserName: String(entry?.current_chat_user_name || ""),
      });
    };
    return this.subscribeToUserPresence(userId, emit);
  }

  async setTypingIndicator(conversationId: string, userId: string, isTyping: boolean, speed: "slow" | "normal" | "fast" | "furious" = "normal") {
    const entry = this.getTypingChannel(conversationId);
    await entry.ready;
    await entry.channel.send({ type: "broadcast", event: "typing", payload: { userId, isTyping, typingSpeed: speed, sentAt: Date.now() } });
    if (entry.refs === 0 && this.typingChannels.get(conversationId) === entry) {
      this.typingChannels.delete(conversationId);
      void getSupabaseBrowserClient().removeChannel(entry.channel);
    }
  }

  subscribeToUsersLivePresenceStatus(userIds: string[], callback: (statuses: Array<{ userId: string; isOnline: boolean }>) => void): Unsubscribe {
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    const emit = () => callback(uniqueUserIds.map((userId) => ({
      userId,
      isOnline: this.isUserPresent(userId),
    })));
    const unsubscribers = uniqueUserIds.map((userId) =>
      this.subscribeToUserPresence(userId, emit),
    );
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }

  subscribeToFriendsOnlineStatus(userId: string, callback: (ids: string[]) => void): Unsubscribe {
    return this.subscribeToUsersLivePresenceStatus([userId], (statuses) => callback(statuses.filter((s) => s.isOnline).map((s) => s.userId)));
  }

  setDraftText(conversationId: string, userId: string, text: string) { draftState.set(conversationId + ":" + userId, { userId, text }); }
  clearDraftText(conversationId: string, userId: string) { draftState.delete(conversationId + ":" + userId); }
  subscribeToUserDraftText(conversationId: string, userId: string, callback: (draft: { userId: string; text: string } | null) => void): Unsubscribe {
    const key = conversationId + ":" + userId; callback(draftState.get(key) || null); return () => {};
  }

  private buildSenderProfileSnapshot(userId: string) {
    const cachedProfile = userId ? getCachedResolvedUserProfile(userId) : null;
    const authProfile = null;
    return normalizeUserProfileSnapshot(
      userId,
      cachedProfile || authProfile || fallbackSender(userId),
    );
  }

  private getOriginalParticipantIds(
    conversationData: Partial<Conversation> | null,
  ): string[] {
    if (!conversationData) return [];
    return [conversationData.user1_id, conversationData.user2_id].filter(
      (id): id is string => !!id,
    );
  }

  private getAllConversationParticipantIds(
    conversationData: Partial<Conversation> | null,
  ): string[] {
    return [
      ...this.getOriginalParticipantIds(conversationData),
      ...(conversationData?.temporary_participant_ids || []).filter(Boolean),
    ].filter((id, index, self) => self.indexOf(id) === index);
  }

  private timestampToIso(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (value instanceof Date) return value.toISOString();
    if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: () => Date }).toDate === "function") return (value as { toDate: () => Date }).toDate().toISOString();
    return String(value);
  }

  private buildInboxOtherUserSnapshot(userId: string) {
    const cached = userId ? getCachedResolvedUserProfile(userId) : null;
    return { id: cached?.id || userId, user_id: cached?.userId || cached?.user_id || userId, username: cached?.username || "", display_name: cached?.displayName || cached?.display_name || null, avatar_url: cached?.avatarUrl || cached?.avatar_url || null };
  }

  private buildConversationFromInboxRow(
    conversationId: string,
    row: any,
    userId: string,
  ): ConversationWithUser {
    const otherUserId =
      row.other_user_id ||
      (row.user1_id === userId ? row.user2_id : row.user1_id) ||
      "";
    const otherUser =
      row.other_user || this.buildInboxOtherUserSnapshot(otherUserId);
    const clearedAt = this.timestampToIso(row.cleared_at) || null;
    const lastMessageAt = this.timestampToIso(row.last_message_at);
    const lastMessageVisible =
      !clearedAt || this.toMillis(lastMessageAt) > this.toMillis(clearedAt);

    return {
      id: row.conversation_id || conversationId,
      user1_id: row.user1_id,
      user2_id: row.user2_id,
      temporary_participant_ids: Array.isArray(row.temporary_participant_ids)
        ? row.temporary_participant_ids
        : [],
      created_at: this.timestampToIso(row.created_at),
      updated_at: this.timestampToIso(row.updated_at),
      last_message_at: lastMessageVisible ? lastMessageAt : "",
      last_message_content: lastMessageVisible
        ? (row.last_message_content || "")
        : "",
      last_seen_by_user: row.last_seen_by_user || {},
      last_seen_message_id_by_user: row.last_seen_message_id_by_user || {},
      cleared_at: clearedAt,
      other_user: {
        id: otherUser.id || otherUserId,
        user_id: otherUser.user_id || otherUser.userId || otherUserId,
        username: otherUser.username || "",
        display_name: otherUser.display_name || otherUser.displayName || null,
        avatar_url: otherUser.avatar_url || otherUser.avatarUrl || null,
      },
      unread_count: lastMessageVisible ? row.unread_count || 0 : 0,
      is_online: false,
      is_typing: false,
    };
  }

  private ensureConversationRealtimeMeta(
    conversationId: string,
    conversationData: {
      user1_id?: string;
      user2_id?: string;
      temporary_participant_ids?: string[];
    } | null,
  ): Promise<void> {
    if (conversationId && conversationData) {
      this.conversationMetaCache.set(conversationId, "native-membership");
    }
    return Promise.resolve();
  }

  private async ensureConversationRealtimeMetaById(
    conversationId: string,
  ): Promise<void> {
    if (!conversationId || this.conversationMetaCache.has(conversationId)) {
      return;
    }
    const { data: members, error } = await getSupabaseBrowserClient().from("conversation_members").select("user_id").eq("conversation_id", conversationId);
    if (error || !members?.length) return;
    await this.ensureConversationRealtimeMeta(
      conversationId,
      { user1_id: members[0].user_id, user2_id: members[1]?.user_id } as Conversation,
    );
  }

  private async getActiveParticipantIdsForConversation(
    conversationId: string,
  ): Promise<string[]> {
    const { data: members } = await getSupabaseBrowserClient().from("conversation_members").select("user_id").eq("conversation_id", conversationId);
    const ids = (members ?? []).map((member) => member.user_id as string);
    await this.ensureConversationRealtimeMeta(conversationId, { user1_id: ids[0], user2_id: ids[1], temporary_participant_ids: ids.slice(2) });
    return ids;
  }

  // â”€â”€ Conversations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async getOrCreateConversation(
    user1Id: string,
    user2Id: string,
  ): Promise<Conversation> {
    try {
      const existing = await this.getConversationBetweenUsers(user1Id, user2Id);
      if (existing) return existing;
      return await this.createConversation(user1Id, user2Id);
    } catch (error) {
      console.error("âŒ getOrCreateConversation:", error);
      throw error;
    }
  }

  async getConversationBetweenUsers(
    user1Id: string,
    user2Id: string,
  ): Promise<Conversation | null> {
    try {
      const currentUser = (await getSupabaseBrowserClient().auth.getUser()).data.user?.id;
      const otherUser = currentUser === user1Id ? user2Id : user1Id;
      if (currentUser && (currentUser === user1Id || currentUser === user2Id)) {
        const { data, error } = await (getSupabaseBrowserClient() as any).rpc(
          "get_direct_conversation",
          { p_other_user_id: otherUser },
        );
        if (!error && data?.id) return data as Conversation;
      }
      return null;
    } catch (error) {
      logBackendError("getConversationBetweenUsers failed:", error);
      return null;
    }
  }

  async createConversation(
    user1Id: string,
    user2Id: string,
  ): Promise<Conversation> {
    try {
      const currentUser = (await getSupabaseBrowserClient().auth.getUser()).data.user?.id;
      const otherUser = currentUser === user1Id ? user2Id : user1Id;
      if (currentUser && (currentUser === user1Id || currentUser === user2Id)) {
        const { data, error } = await (getSupabaseBrowserClient() as any).rpc(
          "get_or_create_direct_conversation",
          { p_other_user_id: otherUser },
        );
        if (!error && data?.id) return data as Conversation;
        if (error) throw error;
      }
      throw new Error("The native conversation RPC did not return a conversation.");
    } catch (error) {
      console.error("âŒ createConversation:", error);
      throw error;
    }
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    try {
      const { data, error } = await getSupabaseBrowserClient().from("conversations")
        .select("id,created_at,updated_at,last_message_at,title")
        .eq("id", conversationId).maybeSingle();
      if (error || !data) return null;
      const conversation = { id: data.id, user1_id: "", user2_id: "", created_at: data.created_at, updated_at: data.updated_at, last_message_at: data.last_message_at } as Conversation;
      this.ensureConversationRealtimeMeta(conversationId, conversation);
      return conversation;
    } catch (error) {
      logBackendError("getConversation failed:", error);
      return null;
    }
  }

  async getConversationWithUser(
    conversationId: string,
    userId: string,
  ): Promise<ConversationWithUser | null> {
    try {
      const conversation = await this.getConversation(conversationId);
      if (!conversation) return null;

      const otherUserId =
        conversation.user1_id === userId
          ? conversation.user2_id
          : conversation.user1_id;

      const otherUser =
        (await this.getCachedUserProfile(otherUserId)) ??
        fallbackSender(otherUserId);

      const [lastMessage, unreadCount] = await Promise.all([
        this.getLastMessage(conversationId),
        this.getConversationUnreadCount(conversation, userId),
      ]);
      const effectiveClearedAt =
        conversation.cleared_at_by_user?.[userId] ??
        conversation.cleared_at ??
        null;
      const lastMessageVisible =
        !effectiveClearedAt ||
        !lastMessage ||
        this.toMillis(lastMessage.created_at) >
          this.toMillis(effectiveClearedAt);

      let typingStatus: any = null;
      try {
        typingStatus = await this.getTypingStatus(conversationId, otherUserId);
      } catch {
        // non-fatal
      }

      return {
        ...conversation,
        cleared_at: effectiveClearedAt,
        temporary_participant_ids: conversation.temporary_participant_ids || [],
        other_user: {
          id: otherUser.id,
          user_id: otherUser.user_id || otherUser.id,
          username: otherUser.username,
          display_name: otherUser.display_name,
          avatar_url: otherUser.avatar_url,
        },
        last_message: lastMessageVisible ? lastMessage : undefined,
        unread_count: lastMessageVisible ? unreadCount : 0,
        is_online: false,
        is_typing: typingStatus?.is_typing || false,
        typing_speed: typingStatus?.typing_speed,
      };
    } catch (error) {
      logBackendError("getConversationWithUser failed:", error);
      return null;
    }
  }

  async getConversationsForUser(
    userId: string,
  ): Promise<ConversationWithUser[]> {
    const page = await this.getConversationsPage(userId, 30);
    return page.items;
  }

  async getConversationsPage(
    _userId: string,
    limit = 30,
    cursor?: { updatedAt: string; id: string } | null,
  ): Promise<{ items: ConversationWithUser[]; nextCursor: { updatedAt: string; id: string } | null; hasMore: boolean }> {
    try {
      const client = getSupabaseBrowserClient() as any;
      const { data, error } = await client.rpc("get_inbox_page_v2", {
        p_limit: Math.min(Math.max(limit, 1), 100),
        p_before_updated_at: cursor?.updatedAt ?? null,
        p_before_id: cursor?.id ?? null,
      });
      // Keep older deployments usable while the additive v2 migration rolls out.
      // Legacy RPC has no cursor, so fallback is only safe for the first page.
      if (error || !data || typeof data !== "object") {
        if (cursor) return { items: [], nextCursor: null, hasMore: false };
        const legacy = await client.rpc("get_inbox_page", {
          p_user_id: _userId,
          p_limit: Math.min(Math.max(limit, 1), 100),
        });
        if (legacy.error || !Array.isArray(legacy.data)) {
          logBackendError("getConversationsPage v2 and legacy fallback failed:", error || legacy.error);
          return { items: [], nextCursor: null, hasMore: false };
        }
        const legacyItems = await Promise.all(
          legacy.data.map((row: any) => this.buildConversationFromInboxRow(row.conversation_id, row, _userId)),
        );
        return { items: legacyItems, nextCursor: null, hasMore: false };
      }
      const payload = data as { items?: any[]; nextCursor?: { updatedAt?: string; id?: string } | null; hasMore?: boolean };
      const items = await Promise.all((Array.isArray(payload.items) ? payload.items : []).map((row: any) =>
        this.buildConversationFromInboxRow(row.conversation_id, row, _userId),
      ));
      const nextCursor = payload.nextCursor?.updatedAt && payload.nextCursor?.id
        ? { updatedAt: payload.nextCursor.updatedAt, id: payload.nextCursor.id }
        : null;
      return { items, nextCursor, hasMore: Boolean(payload.hasMore) };
    } catch (error) {
      logBackendError("getConversationsForUser failed:", error);
      return { items: [], nextCursor: null, hasMore: false };
    }
  }

  /** Fetch only the inbox rows whose durable event identified a change. */
  async getConversationsForIds(
    conversationIds: string[],
    userId: string,
  ): Promise<ConversationWithUser[]> {
    const ids = [...new Set(conversationIds.filter(Boolean))];
    if (!ids.length) return [];
    try {
      const { data, error } = await (getSupabaseBrowserClient() as any).rpc(
        "get_inbox_rows",
        { p_conversation_ids: ids },
      );
      if (error || !Array.isArray(data)) {
        const legacy = await (getSupabaseBrowserClient() as any).rpc("get_inbox_page", {
          p_user_id: userId,
          p_limit: 100,
        });
        if (legacy.error || !Array.isArray(legacy.data)) return [];
        const wanted = new Set(ids);
        return Promise.all(
          legacy.data
            .filter((row: any) => wanted.has(String(row.conversation_id)))
            .map((row: any) => this.buildConversationFromInboxRow(row.conversation_id, row, userId)),
        );
      }
      return await Promise.all(
        data.map((row: any) =>
          this.buildConversationFromInboxRow(row.conversation_id, row, userId),
        ),
      );
    } catch (error) {
      logBackendError("getConversationsForIds failed:", error);
      return [];
    }
  }

  // â”€â”€ Messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async sendMessage(request: CreateMessageRequest): Promise<Message> {
    try {
      return await this.sendMessageWithDelivery(
        request.conversation_id,
        request.sender_id,
        request.content,
        request.media_url,
        request.media_type as "TEXT" | "PHOTO" | "VIDEO" | undefined,
      ) as unknown as Message;
    } catch (error) {
      console.error("âŒ sendMessage:", error);
      throw error;
    }
  }

  async sendMessageWithDelivery(
    conversationId: string,
    senderId: string,
    content: string,
    mediaUrl?: string,
    mediaType?: "TEXT" | "PHOTO" | "VIDEO",
    _recipientId?: string,
    replyTo?: Message["reply_to"],
  ): Promise<MessageWithSender> {
    try {
      // SECURITY: Validate message content client-side before sending to Postgres
      const validatedContent = validateRequiredText(
        content,
        "message content",
        SECURITY_LIMITS.postContent,
      );

      if (true) {
        const { data: nativeMessage, error: nativeError } = await (getSupabaseBrowserClient() as any).rpc("send_message", {
          p_conversation_id: conversationId,
          p_body: validatedContent,
          p_media_path: mediaUrl || null,
          p_reply_to_id: replyTo?.id || null,
        });
        if (nativeError) throw nativeError;
        const senderProfile = this.buildSenderProfileSnapshot(senderId);
        return {
          id: nativeMessage.id,
          conversation_id: nativeMessage.conversation_id,
          sender_id: nativeMessage.sender_id,
          content: nativeMessage.body || validatedContent,
          media_url: nativeMessage.media_path || undefined,
          media_type: mediaType || "TEXT",
          created_at: nativeMessage.created_at,
          updated_at: nativeMessage.updated_at || nativeMessage.created_at,
          sender: {
            id: senderProfile.id,
            user_id: senderProfile.user_id || senderProfile.id,
            username: senderProfile.username,
            display_name: senderProfile.display_name,
            avatar_url: senderProfile.avatar_url,
          },
          reply_to: replyTo || null,
        } as MessageWithSender;
      }

    } catch (error) {
      console.error("âŒ sendMessageWithDelivery:", error);
      throw error;
    }
  }

  async deleteMessageForEveryone(messageId: string): Promise<void> {
    try {
      const { error } = await getSupabaseBrowserClient().from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", messageId);
      if (error) throw error;
    } catch (error) {
      console.error("âŒ deleteMessageForEveryone:", error);
      throw error;
    }
  }

  async getOlderMessages(
    conversationId: string,
    beforeCreatedAt: any,
    messageLimit = 50,
    visibleToUserId?: string,
  ): Promise<MessageWithSender[]> {
    try {
      void visibleToUserId;
      const { data, error } = await (getSupabaseBrowserClient() as any)
        .from("messages")
        .select("id,conversation_id,sender_id,body,media_path,created_at,updated_at,deleted_at")
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .lt("created_at", new Date(beforeCreatedAt).toISOString())
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(Math.max(1, Math.min(100, messageLimit)));
      if (error) throw error;
      const rawMessages: Message[] = (data ?? []).reverse().map((row: any) => ({
        id: row.id,
        conversation_id: row.conversation_id,
        sender_id: row.sender_id,
        content: row.body || "",
        media_url: row.media_path || undefined,
        created_at: row.created_at,
        updated_at: row.updated_at || row.created_at,
        is_delivered: false,
        is_seen: false,
      } as Message));

      const uniqueSenderIds = [
        ...new Set(
          rawMessages
            .filter((message) => !message.sender_profile)
            .map((message) => message.sender_id),
        ),
      ];
      const profileResults = await Promise.allSettled(
        uniqueSenderIds.map((id) => this.getCachedUserProfile(id)),
      );
      const profileMap = new Map<string, any>();
      uniqueSenderIds.forEach((id, i) => {
        const r = profileResults[i];
        profileMap.set(
          id,
          r.status === "fulfilled" && r.value ? r.value : fallbackSender(id),
        );
      });

      return rawMessages.map((msg) => {
        const p =
          msg.sender_profile ||
          profileMap.get(msg.sender_id) ||
          fallbackSender(msg.sender_id);
        return {
          ...msg,
          sender: {
            id: p.id,
            user_id: p.user_id || p.id,
            username: p.username,
            display_name: p.display_name,
            avatar_url: p.avatar_url,
          },
        };
      });
    } catch (error) {
      logBackendError("getOlderMessages failed:", error);
      return [];
    }
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    try {
      const { data, error } = await (getSupabaseBrowserClient() as any)
        .from("messages")
        .select("id,conversation_id,sender_id,body,media_path,created_at,updated_at,deleted_at")
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).reverse().map((row: any) => ({
        id: row.id,
        conversation_id: row.conversation_id,
        sender_id: row.sender_id,
        content: row.body || "",
        media_url: row.media_path || undefined,
        created_at: row.created_at,
        updated_at: row.updated_at || row.created_at,
        is_delivered: false,
        is_seen: false,
      } as Message));
    } catch (error) {
      logBackendError("getMessages failed:", error);
      return [];
    }
  }

  async markMessageAsSeen(
    messageId: string,
    userId: string,
    conversationId?: string,
  ): Promise<void> {
    try {
      let resolvedConvId = conversationId;
      if (!resolvedConvId) {
        const { data } = await (getSupabaseBrowserClient() as any)
          .from("messages").select("conversation_id").eq("id", messageId).maybeSingle();
        resolvedConvId = data?.conversation_id;
      }

      if (resolvedConvId) {
        const { error } = await (getSupabaseBrowserClient() as any).rpc("mark_conversation_read", {
          p_conversation_id: resolvedConvId,
          p_message_id: messageId,
        });
        if (error) throw error;
        void this.sendConversationSignal(resolvedConvId, "read", {
          user_id: userId,
          message_id: messageId,
        }).catch(() => {});
      }
    } catch (error) {
      console.error("âŒ markMessageAsSeen:", error);
      throw error;
    }
  }

  // â”€â”€ Real-time subscriptions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  subscribeToMessages(
    conversationId: string,
    callback: (messages: MessageWithSender[]) => void,
    messageLimit = 50,
    visibleToUserId?: string,
  ): Unsubscribe {
    void visibleToUserId;
    // Durable messages come from Postgres. Presence/typing remain separate
    // ephemeral channels; this channel only watches the open conversation.
    const client = getSupabaseBrowserClient() as any;
    const profileMap = new Map<string, any>();
    const messageMap = new Map<string, Message>();
    const queuedPayloads: any[] = [];
    let initialLoadPending = true;
    let active = true;
    let connected = false;
    let recoveryAttempt = 0;
    let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
    let loadInFlight: Promise<void> | null = null;
    const enrichAndEmit = async () => {
      if (!active) return;
      const rawMessages = [...messageMap.values()]
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id))
        .slice(-Math.max(1, messageLimit));

        // Fetch all unique sender profiles in parallel â€” never skip a message
        const uniqueSenderIds = [
          ...new Set(
            rawMessages
              .filter((message) => !message.sender_profile)
              .map((message) => message.sender_id),
          ),
        ].filter((id) => !profileMap.has(id));
        if (uniqueSenderIds.length) {
          const { data: profiles } = await client.from("profiles")
            .select("id,username,display_name,avatar_url")
            .in("id", uniqueSenderIds);
          const byId = new Map((profiles ?? []).map((profile: any) => [String(profile.id), profile]));
          for (const id of uniqueSenderIds) profileMap.set(id, byId.get(id) || fallbackSender(id));
        }

        const messages: MessageWithSender[] = rawMessages.map((msg) => {
          const p =
            msg.sender_profile ||
            profileMap.get(msg.sender_id) ||
            fallbackSender(msg.sender_id);
          return {
            ...msg,
            sender: {
              id: p.id,
              user_id: p.user_id || p.id,
              username: p.username,
              display_name: p.display_name,
              avatar_url: p.avatar_url,
            },
          };
        });

      if (active) callback(messages);
    };
    const load = async (): Promise<void> => {
      if (loadInFlight) return loadInFlight;
      loadInFlight = (async () => {
        const rows = await this.getMessages(conversationId);
        if (!active) return;
        messageMap.clear();
        for (const message of rows) messageMap.set(message.id, message);
        initialLoadPending = false;
        for (const payload of queuedPayloads.splice(0)) await applyPayload(payload);
        await enrichAndEmit();
      })().finally(() => { loadInFlight = null; });
      return loadInFlight;
    };
    const applyPayload = async (payload: any) => {
      if (!active) return;
      if (initialLoadPending) {
        queuedPayloads.push(payload);
        return;
      }
      const oldId = String(payload.old?.id || "");
      if (payload.eventType === "DELETE") {
        messageMap.delete(oldId);
        await enrichAndEmit();
        return;
      }
      const row = payload.new;
      if (!row?.id || row.conversation_id !== conversationId) return;
      if (row.deleted_at) {
        messageMap.delete(String(row.id));
        await enrichAndEmit();
        return;
      }
      const previous = messageMap.get(String(row.id));
      messageMap.set(String(row.id), {
        ...previous,
        id: String(row.id),
        conversation_id: String(row.conversation_id),
        sender_id: String(row.sender_id),
        content: String(row.body || ""),
        media_url: row.media_path || undefined,
        created_at: String(row.created_at),
        updated_at: String(row.updated_at || row.created_at),
        is_delivered: previous?.is_delivered ?? false,
        is_seen: previous?.is_seen ?? false,
      });
      await enrichAndEmit();
    };
    const channel = client
      .channel(`conversation-messages:${conversationId}`, { config: { private: true } })
      // A database-originated private Broadcast is both cheaper than a
      // Postgres Changes subscription and independent of HTTP-only Circle
      // request headers during Realtime authorization.
      .on("broadcast", { event: "message" }, ({ payload }: any) => { void applyPayload(payload); });
    const scheduleRecovery = () => {
      if (!active || connected || recoveryTimer) return;
      const delay = Math.min(1_000 * 2 ** recoveryAttempt, 15_000);
      recoveryAttempt += 1;
      recoveryTimer = setTimeout(() => {
        recoveryTimer = null;
        void load().finally(scheduleRecovery);
      }, delay);
    };
    recordResourceMetric("realtime_joins");
    void channel.subscribe((status: string) => {
      if (status === "SUBSCRIBED") {
        const needsReconciliation = !connected && !initialLoadPending;
        connected = true;
        recoveryAttempt = 0;
        if (recoveryTimer) clearTimeout(recoveryTimer);
        recoveryTimer = null;
        if (needsReconciliation) void load();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        connected = false;
        scheduleRecovery();
      }
    });
    void load();
    return () => {
      active = false;
      if (recoveryTimer) clearTimeout(recoveryTimer);
      void client.removeChannel(channel);
    };
  }

  subscribeToConversations(userId: string, callback: (conversations: ConversationWithUser[]) => void): Unsubscribe {
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const dirtyConversationIds = new Set<string>();
    const latest = new Map<string, ConversationWithUser>();
    // Coalesce bursty events, then read only the affected conversation rows.
    const refreshWindowMs = 100;
    const load = async () => {
      const ids = [...dirtyConversationIds];
      dirtyConversationIds.clear();
      if (!ids.length) {
        const initial = await this.getConversationsForUser(userId);
        if (!active) return;
        initial.forEach((row) => latest.set(row.id, row));
      } else {
        const changed = await this.getConversationsForIds(ids, userId);
        if (!active) return;
        const returned = new Set(changed.map((row) => row.id));
        ids.forEach((id) => { if (!returned.has(id)) latest.delete(id); });
        changed.forEach((row) => latest.set(row.id, row));
      }
      if (active) callback([...latest.values()].sort((a, b) => this.toMillis(b.updated_at) - this.toMillis(a.updated_at)));
    };
    void load();
    const scheduleLoad = (payload?: any) => {
      if (!active || refreshTimer) return;
      const conversationId = payload?.payload?.conversationId ?? payload?.conversationId;
      if (conversationId) dirtyConversationIds.add(conversationId);
      refreshTimer = setTimeout(() => { refreshTimer = null; void load(); }, refreshWindowMs);
    };
    const channel = getSupabaseBrowserClient().channel("inbox:" + userId, { config: { private: true } })
      .on("broadcast", { event: "inbox_changed" }, scheduleLoad)
      .subscribe();
    return () => { active = false; if (refreshTimer) clearTimeout(refreshTimer); dirtyConversationIds.clear(); latest.clear(); void getSupabaseBrowserClient().removeChannel(channel); };
  }
  subscribeToConversationsTyping(
    conversationIds: string[],
    currentUserId: string,
    callback: (typingByConvId: Map<string, string[]>) => void,
  ): Unsubscribe {
    const uniqueIds = [...new Set(conversationIds.filter(Boolean))];
    if (!uniqueIds.length) return () => {};
    const typingByConversation = new Map<string, string[]>();
    const staleTimers = new Map<string, ReturnType<typeof setTimeout>>();
    let disposed = false;
    const unsubscribers: Unsubscribe[] = [];
    const emit = () => { if (!disposed) callback(new Map([...typingByConversation].map(([id, users]) => [id, [...users]]))); };
    for (const conversationId of uniqueIds) {
      const handler = (payload: any) => {
        if (!payload.userId || payload.userId === currentUserId) return;
        const timerKey = `${conversationId}:${payload.userId}`;
        const existingTimer = staleTimers.get(timerKey);
        if (existingTimer) clearTimeout(existingTimer);
        const current = new Set(typingByConversation.get(conversationId) ?? []);
        if (payload.isTyping === true) {
          current.add(payload.userId);
          staleTimers.set(timerKey, setTimeout(() => {
            staleTimers.delete(timerKey);
            const staleCurrent = new Set(typingByConversation.get(conversationId) ?? []);
            staleCurrent.delete(payload.userId);
            typingByConversation.set(conversationId, [...staleCurrent]);
            emit();
          }, 7_000));
        } else {
          staleTimers.delete(timerKey);
          current.delete(payload.userId);
        }
        typingByConversation.set(conversationId, [...current]); emit();
      };
      unsubscribers.push(this.subscribeToTypingPayload(conversationId, handler));
    }
    return () => {
      disposed = true;
      staleTimers.forEach((timer) => clearTimeout(timer));
      staleTimers.clear();
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }

  setOnlineStatus(userId: string, isOnline: boolean): void {
    void this.trackOnlinePresence(userId, {
      is_online: isOnline,
      current_activity: isOnline ? "active" : "away",
      last_seen: new Date().toISOString(),
    }).catch((error) => console.error("Presence update failed:", error));
  }

  // â”€â”€ Typing subscription (listen for other user typing in a conversation) â”€â”€

  subscribeToTypingIndicators(
    conversationId: string,
    currentUserId: string,
    callback: (typingUsers: Array<{ user_id: string; is_typing: boolean; typing_speed?: string }>) => void,
  ): Unsubscribe {
    let staleTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = this.subscribeToTypingPayload(conversationId, (payload) => {
      if (!payload.userId || payload.userId === currentUserId) return;
      if (staleTimer) clearTimeout(staleTimer);
      callback([{ user_id: payload.userId, is_typing: payload.isTyping === true, typing_speed: payload.typingSpeed || "normal" }]);
      if (payload.isTyping === true) {
        staleTimer = setTimeout(() => {
          staleTimer = null;
          callback([{ user_id: payload.userId, is_typing: false, typing_speed: payload.typingSpeed || "normal" }]);
        }, 7_000);
      } else {
        staleTimer = null;
      }
    });
    return () => {
      if (staleTimer) clearTimeout(staleTimer);
      unsubscribe();
    };
  }

  // â”€â”€ Freeze / Unfreeze chat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async freezeChat(conversationId: string, userId: string): Promise<boolean> {
    const payload = {
      is_frozen: true,
      frozen_by: userId,
      frozen_at: new Date().toISOString(),
    };
    try {
      await this.persistConversationState(conversationId, payload);
      this.applyConversationStatePayload(conversationId, "freeze", payload);
      return true;
    } catch (error) {
      console.error("Unable to freeze conversation:", error);
      return false;
    }
  }

  async unfreezeChat(conversationId: string, userId: string): Promise<boolean> {
    const payload = {
      is_frozen: false,
      frozen_by: null,
      unfrozen_by: userId,
    };
    try {
      await this.persistConversationState(conversationId, payload);
      this.applyConversationStatePayload(conversationId, "freeze", payload);
      return true;
    } catch (error) {
      console.error("Unable to unfreeze conversation:", error);
      return false;
    }
  }

  subscribeToFreezeStatus(
    conversationId: string,
    callback: (data: { is_frozen: boolean; frozen_by: string | null }) => void,
  ): () => void {
    let active = true;
    const handler = (message: any) => {
      callback({
        is_frozen: message.is_frozen === true,
        frozen_by: message.frozen_by ? String(message.frozen_by) : null,
      });
    };
    const entry = this.getConversationStateChannel(conversationId);
    void entry.initialState.then((state) => {
      if (active) callback(state.freeze);
    }).catch((error) => console.error("Unable to load freeze state:", error));
    const unsubscribe = this.subscribeToConversationSignal(conversationId, "freeze", handler);
    return () => { active = false; unsubscribe(); };
  }

  async setMoodBlock(
    conversationId: string,
    moodBlock: MoodBlockState,
  ): Promise<boolean> {
    try {
      await this.persistConversationState(conversationId, { mood_block: moodBlock });
      this.applyConversationStatePayload(conversationId, "mood", moodBlock);
      return true;
    } catch (error) {
      console.error("Unable to set mood block:", error);
      return false;
    }
  }

  clearMoodBlock(conversationId: string): void {
    void (async () => {
      try {
        await this.persistConversationState(conversationId, { mood_block: null });
        this.applyConversationStatePayload(conversationId, "mood", { cleared: true });
      } catch (error) {
        console.error("Unable to clear mood block:", error);
      }
    })();
  }

  subscribeToMoodBlock(
    conversationId: string,
    callback: (moodBlock: MoodBlockState | null) => void,
  ): () => void {
    let active = true;
    const handler = (payload: any) => {
      if (payload.cleared === true || Number(payload.endTime || 0) <= Date.now()) {
        callback(null);
        return;
      }
      callback({
        mood: payload.mood,
        initiatedBy: String(payload.initiatedBy || ""),
        initiatedByName: String(payload.initiatedByName || "Someone"),
        startTime: Number(payload.startTime || 0),
        endTime: Number(payload.endTime || 0),
      });
    };
    const entry = this.getConversationStateChannel(conversationId);
    void entry.initialState.then((state) => {
      if (active) callback(state.mood);
    }).catch((error) => console.error("Unable to load mood block state:", error));
    const unsubscribe = this.subscribeToConversationSignal(conversationId, "mood", handler);
    return () => { active = false; unsubscribe(); };
  }

  subscribeToConversationRead(
    conversationId: string,
    callback: (payload: { user_id: string; message_id: string }) => void,
  ): () => void {
    return this.subscribeToConversationSignal(conversationId, "read", (payload: any) => {
      callback({ user_id: String(payload.user_id || ""), message_id: String(payload.message_id || "") });
    });
  }

  async emitOptimisticChatSwitchSignal(
    conversationId: string,
    userId: string,
    targetUserName: string,
    targetUserId: string,
    recipientUserId?: string,
  ): Promise<void> {
    await this.sendConversationSignal(conversationId, "chat-switch", {
      id: createUuid(),
      conversation_id: conversationId,
      user_id: userId,
      target_user_id: targetUserId,
      target_user_name: targetUserName,
      recipient_user_id: recipientUserId || "",
      created_at: Date.now(),
    });
  }

  subscribeToOptimisticChatSwitchSignals(
    conversationId: string,
    currentUserId: string,
    callback: (signal: ChatSwitchSignal) => void,
  ): () => void {
    const handler = (payload: any) => {
      const recipientUserId = String(payload.recipient_user_id || "");
      const createdAt = Number(payload.created_at || 0);
      if (recipientUserId && recipientUserId !== currentUserId) return;
      if (!createdAt || Date.now() - createdAt > 30_000) return;
      callback({
        id: String(payload.id || createUuid()),
        conversation_id: conversationId,
        user_id: String(payload.user_id || ""),
        target_user_id: String(payload.target_user_id || ""),
        target_user_name: String(payload.target_user_name || "someone"),
        recipient_user_id: recipientUserId || undefined,
        created_at: createdAt,
      });
    };
    return this.subscribeToConversationSignal(conversationId, "chat-switch", handler);
  }

  subscribeToEvents(
    conversationId: string,
    callback: (events: MessageEvent[]) => void,
    visibleToUserId?: string,
    eventLimit = 20,
  ): Unsubscribe {
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      const query = getSupabaseBrowserClient().from("message_events").select("id,conversation_id,message_id,actor_id,event_type,payload,created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false }).limit(eventLimit);
      // message_events has no participants column. Conversation RLS already
      // scopes rows to members; filtering on a nonexistent legacy field made
      // live game invites disappear from the peer's open chat.
      const { data, error } = await query;
      if (!active || error) { if (error) console.error("subscribeToEvents error:", error); return; }
      callback((data || []).map((row: any) => ({
        ...row,
        user_id: row.actor_id,
        data: row.payload ?? {},
      })) as MessageEvent[]);
    };
    void load();
    const scheduleLoad = () => {
      if (!active || refreshTimer) return;
      refreshTimer = setTimeout(() => { refreshTimer = null; void load(); }, 150);
    };
    const channel = getSupabaseBrowserClient().channel("message-events:" + conversationId)
      .on("postgres_changes", { event: "*", schema: "public", table: "message_events", filter: "conversation_id=eq." + conversationId }, scheduleLoad)
      .subscribe();
    return () => { active = false; if (refreshTimer) clearTimeout(refreshTimer); void getSupabaseBrowserClient().removeChannel(channel); };
  }

  // â”€â”€ Private helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private async getLastMessage(
    conversationId: string,
  ): Promise<MessageWithSender | undefined> {
    try {
      const { data } = await getSupabaseBrowserClient().from("messages").select("id,conversation_id,sender_id,body,media_bucket,media_path,reply_to_id,deleted_at,created_at,updated_at").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!data) return undefined;
      const msg = data as Message;
      const p =
        (await this.getCachedUserProfile(msg.sender_id)) ??
        fallbackSender(msg.sender_id);

      return {
        ...msg,
        sender: {
          id: p.id,
          user_id: p.user_id || p.id,
          username: p.username,
          display_name: p.display_name,
          avatar_url: p.avatar_url,
        },
      };
    } catch (error) {
      logBackendError("getLastMessage failed:", error);
      return undefined;
    }
  }

  private async getUnreadCount(
    conversationId: string,
    userId: string,
  ): Promise<number> {
    try {
      const { count, error } = await getSupabaseBrowserClient().from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", conversationId).neq("sender_id", userId).eq("is_seen", false);
      if (error) throw error;
      return count ?? 0;
    } catch (error) {
      logBackendError("getUnreadCount failed:", error);
      return 0;
    }
  }

  private async getConversationUnreadCount(
    conversation: Conversation,
    userId: string,
  ): Promise<number> {
    const mappedCount = conversation.unread_count_by_user?.[userId];
    if (typeof mappedCount === "number") {
      return mappedCount;
    }
    return 0;
  }

  private async getUnreadCountsForConversationEntries(
    entries: Array<[string, any]>,
    userId: string,
  ): Promise<Map<string, number>> {
    const unreadCounts = new Map<string, number>();

    entries.forEach(([conversationId, data]) => {
      const mappedCount = data?.unread_count_by_user?.[userId];
      if (typeof mappedCount === "number") {
        unreadCounts.set(conversationId, mappedCount);
      } else {
        unreadCounts.set(conversationId, 0);
      }
    });

    return unreadCounts;
  }

  private getConversationSnapshotCacheKey(data: any, userId: string): string {
    const otherUserId =
      data.user1_id === userId ? data.user2_id : data.user1_id;
    const mappedUnreadCount = data?.unread_count_by_user?.[userId];
    const unreadCount =
      typeof mappedUnreadCount === "number" ? mappedUnreadCount : 0;
    const effectiveClearedAt =
      data?.cleared_at_by_user?.[userId] ?? data?.cleared_at;
    const sharedProfile = getCachedResolvedUserProfile(otherUserId);
    const profileFingerprint = [
      sharedProfile?.username || "",
      sharedProfile?.display_name || "",
      sharedProfile?.avatar_url || "",
    ].join("~");

    return [
      otherUserId || "",
      profileFingerprint,
      this.normalizeCacheTimestamp(data.updated_at),
      this.normalizeCacheTimestamp(data.last_message_at),
      data.last_message_content || "",
      this.normalizeCacheTimestamp(effectiveClearedAt),
      Array.isArray(data.temporary_participant_ids)
        ? data.temporary_participant_ids.join(",")
        : "",
      unreadCount,
    ].join("|");
  }

  private toMillis(raw: any): number {
    if (!raw) return 0;
    if (typeof raw === "object" && "toDate" in raw) {
      return raw.toDate().getTime();
    }
    const parsed = new Date(String(raw)).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private normalizeCacheTimestamp(value: any): string {
    if (value?.toDate) {
      return value.toDate().getTime().toString();
    }

    return String(value || "");
  }

  private async getTypingStatus(
    conversationId: string,
    userId: string,
  ): Promise<TypingIndicator | null> {
    void conversationId;
    void userId;
    return null;
  }

  private async createMessageEvent(
    eventData: Omit<MessageEvent, "id" | "created_at">,
  ): Promise<MessageEvent> {
    try {
      const providedParticipants = Array.isArray(eventData.data?.participants)
        ? eventData.data.participants
        : [];
      const participants =
        providedParticipants.length > 0
          ? providedParticipants
          : await this.getActiveParticipantIdsForConversation(
              eventData.conversation_id,
            );
      const eventPayload = {
        ...eventData,
        participants: participants.filter(
          (id: string, index: number, self: string[]) =>
            !!id && self.indexOf(id) === index,
        ),
        data: eventData.data
          ? Object.fromEntries(
              Object.entries(eventData.data).filter(
                ([key]) => key !== "participants",
              ),
            )
          : eventData.data,
      };
      const { data, error } = await getSupabaseBrowserClient().from("message_events").insert(eventPayload).select("id,conversation_id,message_id,actor_id,event_type,payload,created_at").single();
      if (error || !data) throw error || new Error("Could not create message event");
      return data as MessageEvent;
    } catch (error) {
      console.error("âŒ createMessageEvent:", error);
      throw error;
    }
  }

  private async getUserProfile(userId: string): Promise<any> {
    try {
      const { data } = await getSupabaseBrowserClient().from("profiles").select("id,user_id,username,display_name,avatar_url").eq("id", userId).maybeSingle();
      return data ? primeResolvedUserProfile(userId, data) : null;
    } catch (error) {
      logBackendError("getUserProfile failed:", error);
      return null;
    }
  }

  async clearMessages(
    conversationId: string,
    userId: string,
    clearedAt: string,
  ): Promise<void> {
    try {
      void userId;
      void clearedAt;
      const { error } = await (getSupabaseBrowserClient() as any).rpc(
        "clear_conversation_for_me",
        { p_conversation_id: conversationId },
      );
      if (error) throw error;
      return;
      /* legacy clear metadata retired
      redundantMessagingLog(
        `âœ… Cleared ${messagesToDelete.length} messages from conversation ${conversationId}`,
      );
      */
    } catch (error) {
      console.error("âŒ clearMessages:", error);
      throw error;
    }
  }

  async hideMessageForMe(messageId: string): Promise<void> {
    const { error } = await (getSupabaseBrowserClient() as any).rpc("hide_message_for_me", { p_message_id: messageId });
    if (error) throw error;
  }
}

export const messagingService = guardCircleResult(new MessagingService());
