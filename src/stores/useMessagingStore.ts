import { create } from "zustand";
import { messagingService } from "@/middleware/services/messaging.service";
import { useAuthStore } from "./useAuthStore-v2";
import type {
  Message,
  MessageEvent,
  MessageWithSender,
} from "@/middleware/services/messaging.service";
import { getCachedResolvedUserProfile } from "@/utils/profileResolver";

const MESSAGING_STORE_DEBUG = false;
const LIVE_STORE_DEBUG = true;
const REDUNDANT_STORE_LOGS = false;

function redundantStoreLog(...args: unknown[]) {
  if (REDUNDANT_STORE_LOGS) console.info(...args);
}

function liveStoreDebug(label: string, details: Record<string, unknown> = {}) {
  if (!LIVE_STORE_DEBUG) return;
  console.info(`[DARE_LIVE_DEBUG][store] ${label}`, {
    at: new Date().toISOString(),
    ...details,
  });
}

// Re-export MessageEvent for components
export { MessageEvent };

// Extended Message interface with legacy properties for UI compatibility
export interface ExtendedMessage extends Message {
  // Legacy properties for UI compatibility
  senderId: string;
  senderName: string;
  senderAvatar: string;
  timestamp: string;
  isOwn: boolean;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "audio" | null;
  reply_to?: Message["reply_to"];
}

// ConversationWithUser type for current conversation
interface ConversationWithUser {
  id: string;
  user1_id?: string;
  user2_id?: string;
  temporary_participant_ids?: string[];
  other_user: {
    user_id: string;
    id: string;
    display_name: string | null;
    username: string;
    avatar_url: string | null;
  };
  last_message_content?: string;
  last_message_at?: string;
  unread_count?: number;
  is_online: boolean;
  is_typing: boolean;
  typing_speed?: string;
  cleared_at?: string | null;
  last_seen_by_user?: Record<string, unknown>;
  last_seen_message_id_by_user?: Record<string, string>;
  created_at?: string;
  updated_at?: string;
}

// Track when messages are seen for ignored message logic
interface SeenMessage {
  messageId: string;
  conversationId: string;
  seenAt: number;
  senderId: string;
  senderName: string;
}

// Track which messages have already triggered ignored events to prevent spam
const ignoredMessages = new Set<string>();
const ignoredConversations = new Set<string>();
let inboxCursor: { updatedAt: string; id: string } | null = null;
const ignoredTimers = new Map<string, ReturnType<typeof setTimeout>>();
const IGNORED_MESSAGE_DELAY_MS = 30 * 60 * 1000;
const CHAT_LIST_LIVE_ROW_LIMIT = 30;
const LIVE_MESSAGE_PAGE_SIZE = 25;
const OLDER_MESSAGE_PAGE_SIZE = 50;
const LIVE_MESSAGE_EVENT_LIMIT = 20;
let conversationPresenceTargetKey = "";
let conversationTypingTargetKey = "";
let realtimeConversationUserId = "";

export interface CreateMessageRequest {
  conversation_id: string;
  sender_id: string;
  content: string;
  media_url?: string;
  media_type?: string;
}

export interface TypingUser {
  conversation_id: string;
  user_id: string;
  is_typing: boolean;
  speed?: string;
  started_at: string;
  source?: "local" | "broadcast" | "presence";
}

export interface DareRequest {
  id: string;
  conversation_id: string;
  requester_id: string;
  content: string;
  created_at: string;
}

export interface DareResponse {
  id: string;
  request_id: string;
  responder_id: string;
  response: string;
  created_at: string;
}

export interface MessagingStoreState {
  conversations: any[];
  messages: any[];
  loading: boolean;
  loadingMessages: boolean;
  error: string | null;
  sendingMessage: boolean;
  isTyping: boolean;
  isConversationFrozen: boolean;
}

export interface MessagingStore {
  // State
  conversations: any[];
  currentConversation: ConversationWithUser | null;
  messages: any[];
  events: MessageEvent[];
  loading: boolean;
  loadingMessages: boolean;
  loadingOlderMessages: boolean;
  hasMoreMessages: boolean;
  error: string | null;
  sendingMessage: boolean;
  typingUsers: TypingUser[];
  messageEvents: MessageEvent[];
  dareRequests: DareRequest[];
  dareResponses: DareResponse[];
  onlineFriends: string[];
  realTimeSubscriptions: Map<string, () => void>;
  clearingConversationIds: Set<string>;
  frozenBy: string | null;
  seenMessages: SeenMessage[]; // Track seen messages for ignored logic
  friendDraft: string | null; // Live draft text from the other user

  // Computed values
  unreadCount: number;
  hasActiveConversation: boolean;
  isTyping: boolean;
  isConversationFrozen: boolean;

  // Actions
  loadConversations: (userId: string) => Promise<void>;
  loadMoreConversations: (userId: string) => Promise<void>;
  getOrCreateConversation: (
    userId1: string,
    userId2: string,
  ) => Promise<string>;
  loadMessages: (conversationId: string, userId: string) => Promise<void>;
  sendMessage: (request: CreateMessageRequest) => Promise<void>;
  markMessagesAsSeen: (conversationId: string, userId: string) => Promise<void>;
  subscribeToConversation: (
    conversationId: string,
    callback: (payload: any) => void,
  ) => void;
  unsubscribeFromConversation: (conversationId: string) => void;
  clearCurrentConversation: () => void;
  setCurrentConversation: (conversation: ConversationWithUser | null) => void;
  clearError: () => void;

  trackSeenMessage: (
    messageId: string,
    conversationId: string,
    senderId: string,
    senderName: string,
  ) => void;
  checkIgnoredMessage: (
    messageId: string,
    conversationId: string,
    senderId: string,
    senderName: string,
  ) => void;
  clearIgnoredTracking: (conversationId: string) => void;

  // Legacy methods (keep for compatibility)
  trackScreenshotLegacy: (messageId: string, userId: string) => Promise<void>;
  startTyping: (
    conversationId: string,
    userId: string,
    speed: "slow" | "medium" | "fast",
  ) => Promise<void>;
  stopTyping: (conversationId: string, userId: string) => Promise<void>;
  freezeConversation: (conversationId: string, userId: string) => Promise<void>;
  unfreezeConversation: (
    conversationId: string,
    userId: string,
  ) => Promise<void>;
  deleteMessage: (messageId: string, userId: string) => Promise<void>;
  initiateRandomChatDare: (userId: string, friendId: string) => Promise<void>;
  respondToRandomChatDare: (
    conversationIdOrUserId: string,
    userIdOrDareId: string,
    acceptOrResponse: boolean | string,
  ) => Promise<void>;

  loadOlderMessages: () => Promise<void>;

  // REAL-TIME METHODS
  subscribeToRealTimeConversations: (userId: string) => void;
  unsubscribeFromRealTimeConversations: () => void;
  subscribeToRealTimeMessages: (conversationId: string) => void;
  unsubscribeFromRealTimeMessages: () => void;
  subscribeToRealTimeEvents: (conversationId: string) => void;
  unsubscribeFromRealTimeEvents: () => void;
  sendRealTimeMessage: (
    conversationId: string,
    content: string,
    mediaUrl?: string,
    mediaType?: "TEXT" | "PHOTO" | "VIDEO",
    replyTo?: Message["reply_to"],
  ) => Promise<MessageWithSender>;
  markMessageAsSeen: (messageId: string) => Promise<void>;
  setTypingIndicator: (
    conversationId: string,
    isTyping: boolean,
    speed?: "slow" | "normal" | "fast" | "furious",
  ) => void;
  subscribeToOnlineStatus: (userId: string) => void;
  unsubscribeFromOnlineStatus: () => void;
  setOnlineStatus: (isOnline: boolean) => void;

  // Typing subscription (listen for other users)
  subscribeToTypingIndicators: (conversationId: string) => void;
  unsubscribeFromTypingIndicators: () => void;

  // Freeze chat
  freezeChat: (conversationId: string) => Promise<boolean>;
  unfreezeChat: (conversationId: string) => Promise<boolean>;
  subscribeToFreezeStatus: (conversationId: string) => void;
  unsubscribeFromFreezeStatus: () => void;

  // Live draft text (letter-by-letter preview)
  setDraftText: (conversationId: string, text: string) => void;
  clearDraftText: (conversationId: string) => void;
  subscribeToDraftText: (conversationId: string, friendUserId: string) => void;
  unsubscribeFromDraftText: () => void;

  // Clear chat
  clearMessages: (conversationId: string) => Promise<void>;
}

// Normalize any raw message object (from REST or real-time) into the
// consistent shape the UI expects. Always pass the current userId so
// `senderId` can be compared correctly in MessagingScreen.
function normalizeMessage(msg: any, currentUserId: string): ExtendedMessage {
  // Support both shapes:
  //   • real-time: { sender: { user_id, display_name, avatar_url }, ... }
  //   • optimistic / already-normalized: { senderId, senderName, ... }
  const senderProfile = msg.sender || msg.sender_profile || {};
  return {
    id: msg.id,
    sender_id: msg.sender_id,
    conversation_id: msg.conversation_id,
    content: msg.content,
    media_url: msg.media_url,
    media_type: msg.media_type,
    created_at: msg.created_at,
    updated_at: msg.updated_at,
    is_delivered: msg.is_delivered,
    is_seen: msg.is_seen,
    // Legacy properties for compatibility
    senderId: msg.sender_id,
    senderName:
      msg.senderName ||
      senderProfile.display_name ||
      senderProfile.username ||
      "",
    senderAvatar: msg.senderAvatar || senderProfile.avatar_url || "",
    timestamp: msg.created_at,
    isOwn: msg.sender_id === currentUserId,
    mediaUrl: msg.media_url,
    mediaType: msg.media_type
      ? (msg.media_type.toLowerCase() as "image" | "video" | "audio")
      : undefined,
    reply_to: msg.reply_to ?? null,
  };
}

function toMillis(raw: any): number {
  if (!raw) return 0;
  if (typeof raw === "object" && "toDate" in raw) {
    return raw.toDate().getTime();
  }
  const parsed = new Date(String(raw)).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function filterItemsAfterClearedAt<T>(
  items: T[],
  clearedAt: string | null | undefined,
  getCreatedAt: (item: T) => any,
): T[] {
  const clearedAtMs = toMillis(clearedAt);
  if (!clearedAtMs) return items;
  return items.filter((item) => toMillis(getCreatedAt(item)) > clearedAtMs);
}

function applyConversationReadReceipts(
  messages: ExtendedMessage[],
  conversation: any,
  currentUserId: string,
): ExtendedMessage[] {
  if (!conversation || !currentUserId) return messages;

  const lastSeenByUser = conversation.last_seen_by_user || {};
  const lastSeenMessageIds = conversation.last_seen_message_id_by_user || {};
  const otherUserId =
    conversation.other_user?.user_id || conversation.other_user?.id || "";
  const currentUserSeenAt = toMillis(lastSeenByUser[currentUserId]);
  const otherUserSeenAt = otherUserId ? toMillis(lastSeenByUser[otherUserId]) : 0;
  const currentUserLastSeenMessageId = lastSeenMessageIds[currentUserId];
  const otherUserLastSeenMessageId = otherUserId
    ? lastSeenMessageIds[otherUserId]
    : undefined;

  return messages.map((message) => {
    const messageTime = toMillis(message.created_at ?? message.timestamp);
    const senderId = message.senderId || message.sender_id;
    const ownMessage = senderId === currentUserId;
    const seenByCurrentUser =
      !ownMessage &&
      (message.id === currentUserLastSeenMessageId ||
        (!!currentUserSeenAt && !!messageTime && messageTime <= currentUserSeenAt));
    const seenByOtherUser =
      ownMessage &&
      (message.id === otherUserLastSeenMessageId ||
        (!!otherUserSeenAt && !!messageTime && messageTime <= otherUserSeenAt));

    if (!seenByCurrentUser && !seenByOtherUser) return message;
    return {
      ...message,
      is_seen: message.is_seen || seenByCurrentUser || seenByOtherUser,
      is_delivered: true,
    };
  });
}

export const useMessagingStore = create<MessagingStore>((set, get) => ({
  // Initial state
  conversations: [],
  currentConversation: null,
  messages: [],
  events: [], // Add missing events property
  loading: false,
  loadingMessages: false,
  loadingOlderMessages: false,
  hasMoreMessages: false,
  error: null,
  sendingMessage: false,
  typingUsers: [],
  messageEvents: [],
  dareRequests: [],
  dareResponses: [],
  onlineFriends: [],
  realTimeSubscriptions: new Map(),
  clearingConversationIds: new Set(),
  frozenBy: null,
  seenMessages: [], // Track seen messages for ignored logic
  friendDraft: null, // Live draft text from the other user

  // Computed values
  get unreadCount() {
    return get().conversations.reduce(
      (total, conv) => total + (conv.unread_count || 0),
      0,
    );
  },

  get hasActiveConversation() {
    return !!get().currentConversation;
  },

  get isTyping() {
    const { currentConversation, typingUsers } = get();
    return typingUsers.some(
      (user) => user.user_id !== currentConversation?.other_user?.user_id,
    );
  },

  get isConversationFrozen() {
    return !!get().frozenBy;
  },

  // Actions
  loadConversations: async (userId: string) => {
    set({ loading: true, error: null });
    try {
      const firstPage = await messagingService.getConversationsPage(userId, 30);
      const conversations = firstPage.items;
      inboxCursor = firstPage.nextCursor;

      // Remove duplicates based on other_user.user_id
      const uniqueConversations = conversations.filter(
        (conv, index, self) =>
          index ===
          self.findIndex(
            (c) => c.other_user?.user_id === conv.other_user?.user_id,
          ),
      );

      const { onlineFriends, typingUsers } = get();
      const existingById = new Map(
        get().conversations.map((conversation) => [
          conversation.id,
          conversation,
        ]),
      );
      const currentUserId = useAuthStore.getState().user?.id ?? "";

      const transformedConversations = uniqueConversations.map((conv: any) => {
        const otherUserId =
          conv.other_user?.user_id || conv.other_user?.id || "";
        const cachedProfile = otherUserId
          ? getCachedResolvedUserProfile(otherUserId)
          : null;
        const otherUser = cachedProfile
          ? {
              ...conv.other_user,
              id: cachedProfile.id,
              user_id: cachedProfile.userId,
              username: cachedProfile.username,
              display_name: cachedProfile.displayName,
              avatar_url: cachedProfile.avatarUrl,
            }
          : conv.other_user;
        const existing = existingById.get(conv.id);
        const isTyping = typingUsers.some(
          (typingUser) =>
            typingUser.conversation_id === conv.id &&
            typingUser.user_id !== currentUserId &&
            typingUser.is_typing,
        );
        return {
          id: conv.id,
          user1_id: conv.user1_id,
          user2_id: conv.user2_id,
          temporary_participant_ids: conv.temporary_participant_ids || [],
          other_user: otherUser,
          last_message_content:
            conv.last_message?.content || conv.last_message_content || "",
          last_message_at:
            conv.last_message?.created_at || conv.last_message_at || "",
          last_seen_by_user: conv.last_seen_by_user || {},
          last_seen_message_id_by_user: conv.last_seen_message_id_by_user || {},
          unread_count: conv.unread_count || 0,
          is_online: onlineFriends.includes(otherUserId),
          is_typing: isTyping || existing?.is_typing || conv.is_typing || false,
          typing_speed: conv.typing_speed,
          cleared_at: conv.cleared_at || null,
          created_at: conv.created_at,
          updated_at: conv.updated_at,
        };
      });

      set({ conversations: transformedConversations, loading: false });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load conversations";
      set({ loading: false, error: errorMessage });
    }
  },

  loadMoreConversations: async (userId: string) => {
    // Pagination state is kept privately so existing consumers remain source-compatible.
    const page = await messagingService.getConversationsPage(userId, 30, inboxCursor);
    if (!page.items.length) return;
    const existing = new Map(get().conversations.map((item: any) => [item.id, item]));
    page.items.forEach((item) => existing.set(item.id, item));
    set({ conversations: [...existing.values()].sort((a: any, b: any) => String(b.updated_at || "").localeCompare(String(a.updated_at || ""))) } as Partial<MessagingStore>);
    inboxCursor = page.nextCursor;
  },

  getOrCreateConversation: async (userId1: string, userId2: string) => {
    try {
      const conversation = await messagingService.getOrCreateConversation(
        userId1,
        userId2,
      );
      return conversation.id;
    } catch (error) {
      console.error("Error getting or creating conversation:", error);
      throw error;
    }
  },

  loadMessages: async (conversationId: string, userId: string) => {
    set({ loadingMessages: true, error: null });
    try {
      const messages = await messagingService.getMessages(conversationId);
      const activeConversation =
        get().currentConversation?.id === conversationId
          ? get().currentConversation
          : get().conversations.find(
              (conversation) => conversation.id === conversationId,
            );
      const transformedMessages = applyConversationReadReceipts(
        filterItemsAfterClearedAt(
        messages.map((msg: any) => normalizeMessage(msg, userId)),
        activeConversation?.cleared_at,
        (message) => message.created_at,
        ),
        activeConversation,
        userId,
      );
      set({ messages: transformedMessages, loadingMessages: false });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load messages";
      set({ loadingMessages: false, error: errorMessage });
    }
  },

  sendMessage: async (request: CreateMessageRequest) => {
    set({ sendingMessage: true, error: null });
    try {
      await messagingService.sendMessage({
        ...request,
        media_type: request.media_type as
          | "TEXT"
          | "PHOTO"
          | "VIDEO"
          | undefined,
      });
      set({ sendingMessage: false });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to send message";
      set({ sendingMessage: false, error: errorMessage });
    }
  },

  markMessagesAsSeen: async (conversationId: string) => {
    try {
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg.conversation_id === conversationId
            ? { ...msg, is_seen: true, is_delivered: true }
            : msg,
        ),
        conversations: state.conversations.map((conv) =>
          conv.id === conversationId ? { ...conv, unread_count: 0 } : conv,
        ),
      }));
    } catch (error) {
      console.error("Error marking messages as seen:", error);
    }
  },

  respondToRandomChatDare: async (
    conversationIdOrUserId: string,
    userIdOrDareId: string,
    acceptOrResponse: boolean | string,
  ) => {
    try {
      redundantStoreLog(
        `Random chat dare response: ${acceptOrResponse} — ${conversationIdOrUserId} / ${userIdOrDareId}`,
      );
    } catch (error) {
      console.error("Error responding to random chat dare:", error);
    }
  },

  subscribeToConversation: (conversationId: string) => {
    redundantStoreLog(`Subscribed to conversation ${conversationId}`);
  },

  unsubscribeFromConversation: (conversationId: string) => {
    redundantStoreLog(`Unsubscribed from conversation ${conversationId}`);
  },

  clearCurrentConversation: () => {
    set({ currentConversation: null, messages: [] });
  },

  setCurrentConversation: (conversation: ConversationWithUser | null) => {
    set((state) => {
      const previousConversationId = state.currentConversation?.id ?? null;
      const nextConversationId = conversation?.id ?? null;
      const conversationChanged = previousConversationId !== nextConversationId;

      return {
        currentConversation: conversation,
        messages: conversationChanged
          ? []
          : filterItemsAfterClearedAt(
              state.messages,
              conversation?.cleared_at,
              (message) => message.created_at,
            ),
        events: conversationChanged ? [] : state.events,
        messageEvents: conversationChanged ? [] : state.messageEvents,
        loadingMessages: conversationChanged && !!conversation,
        hasMoreMessages: conversationChanged ? false : state.hasMoreMessages,
        friendDraft: conversationChanged ? null : state.friendDraft,
      };
    });
  },

  clearError: () => {
    set({ error: null });
  },

  trackMention: async (conversationId: string, mentionedUsername: string) => {
    try {
      void conversationId;
      void mentionedUsername;

    } catch (error) {
      console.error("[@mention store] Error:", error);
    }
  },

  trackIgnoredMessage: async (
    conversationId: string,
    targetUserName: string,
  ) => {
    try {
      redundantStoreLog(
        "[@ignored store] Writing ignored to Postgres:",
        conversationId,
        targetUserName,
      );
      void conversationId;
      void targetUserName;
      redundantStoreLog("[@ignored store] Ignored write complete");
    } catch (error) {
      console.error("[@ignored store] Error:", error);
    }
  },

  trackSeenMessage: (
    messageId: string,
    conversationId: string,
    senderId: string,
    senderName: string,
  ) => {
    // Already fired ignored for this exact message
    if (ignoredMessages.has(messageId)) return;
    // Already fired the ignored event for this conversation
    if (ignoredConversations.has(conversationId)) return;

    ignoredMessages.add(messageId); // mark so re-renders don't re-arm

    const { seenMessages } = get();
    const now = Date.now();

    const seenMessage: SeenMessage = {
      messageId,
      conversationId,
      seenAt: now,
      senderId,
      senderName,
    };

    redundantStoreLog("[@ignored] Tracking seen message:", seenMessage);
    set({
      seenMessages: [
        ...seenMessages.filter((m) => m.conversationId !== conversationId),
        seenMessage,
      ],
    });

    // Cancel any existing timer so we re-arm from the latest seen message
    const existingTimer = ignoredTimers.get(conversationId);
    if (existingTimer) clearTimeout(existingTimer);

    // Start 30-minute timer to check if the receiver replies.
    const timer = setTimeout(() => {
      get().checkIgnoredMessage(
        messageId,
        conversationId,
        senderId,
        senderName,
      );
    }, IGNORED_MESSAGE_DELAY_MS);
    ignoredTimers.set(conversationId, timer);
  },

  checkIgnoredMessage: (
    messageId: string,
    conversationId: string,
    senderId: string,
    senderName: string,
  ) => {
    const { seenMessages, messages } = get();
    const seenMessage = seenMessages.find((m) => m.messageId === messageId);

    if (!seenMessage) return;

    const timer = ignoredTimers.get(conversationId);
    if (timer) {
      clearTimeout(timer);
      ignoredTimers.delete(conversationId);
    }

    // Check if we've already triggered an ignored event for this conversation
    if (ignoredConversations.has(conversationId)) {
      redundantStoreLog(
        "[@ignored] Already triggered ignored event for conversation:",
        conversationId,
      );
      return;
    }

    // Check if the person who saw the message replied after it was seen.
    const hasReply = messages.some((msg) => {
      const sentAt = toMillis(msg.timestamp ?? msg.created_at);
      return (
        msg.conversation_id === conversationId &&
        (msg.senderId || msg.sender_id) === senderId &&
        sentAt > seenMessage.seenAt
      );
    });

    if (!hasReply) {
      redundantStoreLog("[@ignored] Message ignored, triggering event:", senderName);
      // Mark this conversation as having triggered an ignored event
      ignoredConversations.add(conversationId);

      // Remove from seenMessages to prevent re-checking
      const updatedSeenMessages = seenMessages.filter(
        (m) => m.conversationId !== conversationId,
      );
      set({ seenMessages: updatedSeenMessages });
      return;
    }

    // Replied in time: clear pending seen-tracking for this conversation
    set((state) => ({
      seenMessages: state.seenMessages.filter(
        (m) => m.conversationId !== conversationId,
      ),
    }));
  },

  clearIgnoredTracking: (conversationId: string) => {
    const timer = ignoredTimers.get(conversationId);
    if (timer) {
      clearTimeout(timer);
      ignoredTimers.delete(conversationId);
    }

    // Clear message-level dedup for this conversation so a new
    // conversation session starts fresh (but DON'T touch ignoredConversations)
    const { seenMessages } = get();
    seenMessages
      .filter((m) => m.conversationId === conversationId)
      .forEach((m) => ignoredMessages.delete(m.messageId));

    ignoredConversations.delete(conversationId); // OK here â this is a full chat switch
    set((state) => ({
      seenMessages: state.seenMessages.filter(
        (m) => m.conversationId !== conversationId,
      ),
    }));
  },

  // Legacy methods (keep for compatibility)
  trackScreenshotLegacy: async (messageId: string, userId: string) => {
    try {
      set((state) => ({
        messageEvents: [
          ...state.messageEvents,
          {
            id: `event-${Date.now()}`,
            message_id: messageId,
            conversation_id: "", // Legacy events don't have conversation_id
            user_id: userId,
            event_type: "screenshot",
            created_at: new Date().toISOString(),
          },
        ],
      }));
    } catch (error) {
      console.error("Error tracking screenshot (legacy):", error);
    }
  },

  trackAlmostSent: async (
    conversationId: string,
    userId: string,
    content: string,
  ) => {
    try {
      void conversationId;
      void userId;
      void content;
    } catch (error) {
      console.error("Error tracking almost sent:", error);
    }
  },

  startTyping: async (
    conversationId: string,
    userId: string,
    speed: "slow" | "medium" | "fast",
  ) => {
    try {
      set((state) => ({
        typingUsers: [
          ...state.typingUsers.filter((u) => u.user_id !== userId),
          {
            conversation_id: conversationId,
            user_id: userId,
            is_typing: true,
            speed,
            started_at: new Date().toISOString(),
          },
        ],
      }));
    } catch (error) {
      console.error("Error starting typing:", error);
    }
  },

  stopTyping: async (conversationId: string, userId: string) => {
    try {
      set((state) => ({
        typingUsers: state.typingUsers.filter(
          (u) =>
            !(u.conversation_id === conversationId && u.user_id === userId),
        ),
      }));
    } catch (error) {
      console.error("Error stopping typing:", error);
    }
  },

  freezeConversation: async (conversationId: string, userId: string) => {
    try {
      messagingService.freezeChat(conversationId, userId);
    } catch (error) {
      console.error("Error freezing conversation:", error);
    }
  },

  unfreezeConversation: async (conversationId: string, userId: string) => {
    try {
      messagingService.unfreezeChat(conversationId, userId);
    } catch (error) {
      console.error("Error unfreezing conversation:", error);
    }
  },

  deleteMessage: async (messageId: string) => {
    try {
      await messagingService.deleteMessageForEveryone(messageId);
      set((state) => ({
        messages: state.messages.filter((msg) => msg.id !== messageId),
      }));
    } catch (error) {
      console.error("Error deleting message:", error);
    }
  },

  initiateRandomChatDare: async (userId: string, friendId: string) => {
    try {
      redundantStoreLog(`Random chat dare initiated by ${userId} to ${friendId}`);
    } catch (error) {
      console.error("Error initiating random chat dare:", error);
    }
  },

  loadOlderMessages: async () => {
    const { messages, currentConversation, loadingOlderMessages } = get();
    if (loadingOlderMessages || !currentConversation?.id || !messages.length)
      return;

    set({ loadingOlderMessages: true });
    try {
      const oldestCreatedAt = (messages[0] as any)?.created_at;
      if (!oldestCreatedAt) return;
      const currentUserId = useAuthStore.getState().user?.id ?? "";
      const isTemporaryParticipant =
        !!currentUserId &&
        currentConversation.user1_id !== currentUserId &&
        currentConversation.user2_id !== currentUserId;

      const older = await messagingService.getOlderMessages(
        currentConversation.id,
        oldestCreatedAt,
        OLDER_MESSAGE_PAGE_SIZE,
        isTemporaryParticipant ? currentUserId : undefined,
      );
      if (older.length === 0) {
        set({ hasMoreMessages: false });
        return;
      }

      const normalized = applyConversationReadReceipts(
        filterItemsAfterClearedAt(
          older.map((msg: any) => normalizeMessage(msg, currentUserId)),
          currentConversation.cleared_at,
          (message) => message.created_at,
        ),
        currentConversation,
        currentUserId,
      );
      set((state) => ({
        messages: [...normalized, ...state.messages],
        hasMoreMessages:
          older.length === OLDER_MESSAGE_PAGE_SIZE && normalized.length > 0,
      }));
    } catch (error) {
      console.error("❌ loadOlderMessages:", error);
    } finally {
      set({ loadingOlderMessages: false });
    }
  },

  // REAL-TIME METHODS
  subscribeToRealTimeConversations: (userId: string) => {
    redundantStoreLog(
      "🔍 [MessagingStore DEBUG] subscribeToRealTimeConversations called with userId:",
      userId,
    );

    // Cancel any existing subscription first so we never have two listeners
    const subscriptions = get().realTimeSubscriptions;
    const userChanged = realtimeConversationUserId !== userId;
    if (userChanged) {
      subscriptions.get("conversationOnlineStatus")?.();
      subscriptions.delete("conversationOnlineStatus");
      subscriptions.get("conversationTypingStatus")?.();
      subscriptions.delete("conversationTypingStatus");
      conversationPresenceTargetKey = "";
      conversationTypingTargetKey = "";
      realtimeConversationUserId = userId;
      set({ onlineFriends: [], typingUsers: [] });
    }

    const existingSub = subscriptions.get("conversations");
    if (existingSub) existingSub();

    const unsubscribe = messagingService.subscribeToConversations(
      userId,
      (incoming) => {
        // Deduplicate by conversation id at the store level as a safety net
        const seen = new Set<string>();
        const deduped = incoming.filter((c) => {
          if (seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        });

        // Use onlineFriends + typingUsers from store as the single source of
        // truth — avoids rebuilding the conversation list wiping those flags.
        const { onlineFriends, typingUsers } = get();
        const currentUserId = useAuthStore.getState().user?.id ?? "";
        const merged = deduped.map((conv) => {
          const otherUserId =
            conv.other_user?.user_id || conv.other_user?.id || "";
          const isTyping = typingUsers.some(
            (t) =>
              t.conversation_id === conv.id &&
              t.user_id !== currentUserId &&
              t.is_typing,
          );
          return {
            ...conv,
            is_online: onlineFriends.includes(otherUserId),
            is_typing: isTyping,
          };
        });

        const activeConversationId = get().currentConversation?.id;
        const liveConversations = deduped.slice(0, CHAT_LIST_LIVE_ROW_LIMIT);
        const activeConversationForLiveRows = activeConversationId
          ? deduped.find(
              (conversation) => conversation.id === activeConversationId,
            )
          : undefined;
        if (
          activeConversationForLiveRows &&
          !liveConversations.some(
            (conversation) => conversation.id === activeConversationId,
          )
        ) {
          liveConversations.push(activeConversationForLiveRows);
        }
        const nextCurrentConversation =
          activeConversationId != null
            ? (merged.find(
                (conversation) => conversation.id === activeConversationId,
              ) ?? get().currentConversation)
            : get().currentConversation;
        const nextMessages =
          nextCurrentConversation?.id === activeConversationId
            ? filterItemsAfterClearedAt(
                get().messages,
                nextCurrentConversation?.cleared_at,
                (message) => message.created_at,
              )
            : get().messages;

        set({
          conversations: merged,
          currentConversation: nextCurrentConversation,
          messages: nextMessages,
          loading: false,
        });

        const subscriptions = get().realTimeSubscriptions;
        // Presence is only needed for the open chat. Watching every inbox
        // peer grows channels with inbox size while inactive rows can render
        // their persisted last-seen state.
        const activePeerId =
          activeConversationForLiveRows?.other_user?.user_id ||
          activeConversationForLiveRows?.other_user?.id ||
          "";
        const participantIds = activePeerId ? [activePeerId] : [];
        const participantTargetKey = participantIds.join("|");

        if (participantTargetKey !== conversationPresenceTargetKey) {
          subscriptions.get("conversationOnlineStatus")?.();
          subscriptions.delete("conversationOnlineStatus");
          conversationPresenceTargetKey = participantTargetKey;

          if (participantIds.length === 0) {
            set({ onlineFriends: [] });
          } else {
            if (MESSAGING_STORE_DEBUG) {
              redundantStoreLog(
                "🔍 [MessagingStore DEBUG] Setting up presence subscription for participantIds:",
                participantIds,
              );
            }
            const unsubscribeOnline =
              messagingService.subscribeToUsersLivePresenceStatus(
                participantIds,
                (statuses) => {
                  if (MESSAGING_STORE_DEBUG) {
                    redundantStoreLog(
                      "🔍 [MessagingStore DEBUG] Presence subscription callback received statuses:",
                      statuses,
                    );
                  }
                  const onlineIds = statuses
                    .filter((status) => status.isOnline)
                    .map((status) => status.userId);
                  const onlineSet = new Set(onlineIds);
                  if (MESSAGING_STORE_DEBUG) {
                    redundantStoreLog(
                      "🔍 [MessagingStore DEBUG] Processed onlineIds:",
                      onlineIds,
                    );
                  }
                  if (MESSAGING_STORE_DEBUG) {
                    redundantStoreLog(
                      "[MessagingStore DEBUG] Presence online indicators:",
                      {
                        currentUserId,
                        participantIds,
                        onlineIds,
                      },
                    );
                  }
                  set((state) => {
                    if (MESSAGING_STORE_DEBUG) {
                      redundantStoreLog(
                        "[MessagingStore DEBUG] Applying presence indicators:",
                        {
                          previousOnlineFriends: state.onlineFriends,
                          nextOnlineFriends: onlineIds,
                        },
                      );
                    }
                    return {
                      onlineFriends: onlineIds,
                      conversations: state.conversations.map((conv) => ({
                        ...conv,
                        is_online: onlineSet.has(
                          conv.other_user?.user_id || conv.other_user?.id || "",
                        ),
                      })),
                      currentConversation: state.currentConversation
                        ? {
                            ...state.currentConversation,
                            is_online: onlineSet.has(
                              state.currentConversation.other_user?.user_id ||
                              state.currentConversation.other_user?.id ||
                                "",
                            ),
                          }
                        : state.currentConversation,
                    };
                  });
                },
              );
            subscriptions.set("conversationOnlineStatus", unsubscribeOnline);
          }
        }

        const conversationIds = liveConversations
          .map((conversation) => conversation.id)
          .filter(Boolean)
          .sort();
        const typingTargetKey = conversationIds.join("|");
        // Keep typing Realtime scoped to the open chat. Subscribing to every
        // inbox thread grows channel use linearly and duplicates its heartbeat.
        const subscribeInboxTyping = false;

        if (subscribeInboxTyping && typingTargetKey !== conversationTypingTargetKey) {
          subscriptions.get("conversationTypingStatus")?.();
          subscriptions.delete("conversationTypingStatus");
          conversationTypingTargetKey = typingTargetKey;

          if (conversationIds.length === 0 || !currentUserId) {
            set({ typingUsers: [] });
          } else {
            redundantStoreLog(
              "🔍 [MessagingStore DEBUG] Setting up typing subscription for conversationIds:",
              conversationIds,
            );
            const unsubscribeTyping =
              messagingService.subscribeToConversationsTyping(
                conversationIds,
                currentUserId,
                (typingByConvId) => {
                  redundantStoreLog(
                    "🔍 [MessagingStore DEBUG] Typing subscription callback received typingByConvId:",
                    typingByConvId,
                  );
                  redundantStoreLog(
                    "[MessagingStore DEBUG] Typing subscription callback details:",
                    {
                      currentUserId,
                      conversationIds,
                      typingByConvId: Object.fromEntries(typingByConvId),
                    },
                  );
                  const remoteTypingUsers = Array.from(
                    typingByConvId.entries(),
                  ).flatMap(([conversationId, userIds]) =>
                    userIds.map((typingUserId) => ({
                      conversation_id: conversationId,
                      user_id: typingUserId,
                      is_typing: true,
                      started_at: new Date().toISOString(),
                      source: "broadcast" as const,
                    })),
                  );
                  set((state) => {
                    const nextTypingUsers = [
                      ...state.typingUsers.filter(
                        (typingUser) =>
                          typingUser.source !== "broadcast" ||
                          !conversationIds.includes(typingUser.conversation_id),
                      ),
                      ...remoteTypingUsers,
                    ];
                    redundantStoreLog(
                      "[MessagingStore DEBUG] Applying Realtime typing users:",
                      {
                        currentUserId,
                        remoteTypingUsers,
                        previousTypingUsers: state.typingUsers,
                        nextTypingUsers,
                      },
                    );
                    return {
                      typingUsers: nextTypingUsers,
                      conversations: state.conversations.map((conv) => ({
                        ...conv,
                        is_typing: nextTypingUsers.some(
                          (typingUser) =>
                            typingUser.conversation_id === conv.id &&
                            typingUser.user_id !== currentUserId &&
                            typingUser.is_typing,
                        ),
                      })),
                      currentConversation: state.currentConversation
                        ? {
                            ...state.currentConversation,
                            is_typing: nextTypingUsers.some(
                              (typingUser) =>
                                typingUser.conversation_id ===
                                  state.currentConversation?.id &&
                                typingUser.user_id !== currentUserId &&
                                typingUser.is_typing,
                            ),
                          }
                        : state.currentConversation,
                    };
                  });
                },
              );
            subscriptions.set("conversationTypingStatus", unsubscribeTyping);
          }
        }

        set({ realTimeSubscriptions: subscriptions });

        // ── Presence: per-participant online status ───────────────────────
        // Covers conversation partners who aren't in the formal friends list.
        /*
        if (participantUnsub) participantUnsub();
        const participantIds = [
          ...new Set(
            deduped
              .map((c) => c.other_user?.user_id || c.other_user?.id)
              .filter(Boolean) as string[],
          ),
        ];
        participantUnsub = messagingService.subscribeToUsersOnlineStatus(
          participantIds,
          (onlineIds) => {
            set((state) => ({
              onlineFriends: onlineIds,
              conversations: state.conversations.map((conv) => ({
                ...conv,
                is_online: onlineIds.includes(
                  conv.other_user?.user_id || conv.other_user?.id || "",
                ),
              })),
            }));
          },
        );

        // ── Broadcast: per-conversation typing channels ───────────────────
        // Allows the chat list to show live typing indicators without the
        // user needing to have a conversation open.
        if (typingUnsub) typingUnsub();
        typingUnsub = messagingService.subscribeToConversationsTyping(
          deduped.map((c) => c.id),
          currentUserId,
          (typingByConvId) => {
            const remoteTypingUsers = Array.from(typingByConvId.entries()).flatMap(
              ([conversationId, userIds]) =>
                userIds.map((typingUserId) => ({
                  conversation_id: conversationId,
                  user_id: typingUserId,
                  is_typing: true,
                  started_at: new Date().toISOString(),
                })),
            );
            set((state) => ({
              typingUsers: [
                ...state.typingUsers.filter(
                  (typingUser) => typingUser.user_id === currentUserId,
                ),
                ...remoteTypingUsers,
              ],
              conversations: state.conversations.map((conv) => ({
                ...conv,
                is_typing: (typingByConvId.get(conv.id)?.length ?? 0) > 0,
              })),
            }));
          },
        );
        */
      },
    );

    const latestSubscriptions = get().realTimeSubscriptions;
    latestSubscriptions.set("conversations", unsubscribe);
    set({ realTimeSubscriptions: latestSubscriptions });
  },

  unsubscribeFromRealTimeConversations: () => {
    const subscriptions = get().realTimeSubscriptions;
    const unsubscribe = subscriptions.get("conversations");
    if (unsubscribe) {
      unsubscribe();
      subscriptions.delete("conversations");
    }
    subscriptions.get("conversationOnlineStatus")?.();
    subscriptions.delete("conversationOnlineStatus");
    subscriptions.get("conversationTypingStatus")?.();
    subscriptions.delete("conversationTypingStatus");
    conversationPresenceTargetKey = "";
    conversationTypingTargetKey = "";
    realtimeConversationUserId = "";
    set({
      onlineFriends: [],
      typingUsers: [],
      realTimeSubscriptions: subscriptions,
    });
  },

  subscribeToRealTimeMessages: (conversationId: string) => {
    redundantStoreLog(`📦 Store: subscribeToRealTimeMessages for ${conversationId}`);

    // Cancel any existing message subscription before creating a new one
    const existingSub = get().realTimeSubscriptions.get("messages");
    if (existingSub) {
      redundantStoreLog(`📦 Store: Cancelling existing message subscription`);
      existingSub();
    }
    get().realTimeSubscriptions.get("messageReadReceipts")?.();
    get().realTimeSubscriptions.delete("messageReadReceipts");

    set((state) => ({
      messages:
        state.currentConversation?.id === conversationId ? [] : state.messages,
      loadingMessages: state.currentConversation?.id === conversationId,
      hasMoreMessages:
        state.currentConversation?.id === conversationId
          ? false
          : state.hasMoreMessages,
    }));

    const currentUserIdForSubscription = useAuthStore.getState().user?.id ?? "";
    const activeConversationForSubscription =
      get().currentConversation?.id === conversationId
        ? get().currentConversation
        : get().conversations.find(
            (conversation) => conversation.id === conversationId,
          );
    const isTemporaryParticipant =
      !!currentUserIdForSubscription &&
      activeConversationForSubscription?.user1_id !==
        currentUserIdForSubscription &&
      activeConversationForSubscription?.user2_id !==
        currentUserIdForSubscription;

    const unsubscribe = messagingService.subscribeToMessages(
      conversationId,
      (messages) => {
        if (get().currentConversation?.id !== conversationId) {
          return;
        }
        redundantStoreLog(
          `📦 Store: Received ${messages.length} messages from service for ${conversationId}`,
        );
        const currentUserId = useAuthStore.getState().user?.id ?? "";
        const normalized = messages.map((msg: any) =>
          normalizeMessage(msg, currentUserId),
        );
        const activeConversation =
          get().currentConversation?.id === conversationId
            ? get().currentConversation
            : get().conversations.find(
                (conversation) => conversation.id === conversationId,
              );
        const filteredMessages = applyConversationReadReceipts(
          filterItemsAfterClearedAt(
            normalized,
            activeConversation?.cleared_at,
            (message) => message.created_at,
          ),
          activeConversation,
          currentUserId,
        );
        const clearingConversationIds = get().clearingConversationIds;
        const isClearingConversation =
          clearingConversationIds.has(conversationId);
        if (isClearingConversation && filteredMessages.length > 0) {
          redundantStoreLog(
            `[subscribeToRealTimeMessages] Ignoring ${filteredMessages.length} stale messages while clearing ${conversationId}`,
          );
          set({ loadingMessages: false });
          return;
        }
        if (isClearingConversation && filteredMessages.length === 0) {
          const nextClearingConversationIds = new Set(clearingConversationIds);
          nextClearingConversationIds.delete(conversationId);
          set({ clearingConversationIds: nextClearingConversationIds });
        }
        // Service fetches DESC + a small live window then reverses, so result is asc order.
        // Set directly — assume more history exists if we received a full page.
        redundantStoreLog(
          `📦 Store: Setting ${filteredMessages.length} messages in state`,
        );
        set({
          messages: filteredMessages,
          loadingMessages: false,
          hasMoreMessages: filteredMessages.length >= LIVE_MESSAGE_PAGE_SIZE,
        });
      },
      LIVE_MESSAGE_PAGE_SIZE,
      isTemporaryParticipant ? currentUserIdForSubscription : undefined,
    );

    const subscriptions = get().realTimeSubscriptions;
    subscriptions.set("messages", unsubscribe);
    subscriptions.set("messageReadReceipts", messagingService.subscribeToConversationRead(conversationId, ({ user_id, message_id }) => {
      const currentUserId = useAuthStore.getState().user?.id ?? "";
      if (!user_id || user_id === currentUserId || !message_id) return;
      set((state) => ({
        messages: state.messages.map((message) =>
          message.id === message_id && (message.senderId || message.sender_id) === currentUserId
            ? { ...message, is_seen: true, is_delivered: true }
            : message,
        ),
      }));
    }));
    set({ realTimeSubscriptions: subscriptions });
    redundantStoreLog(`📦 Store: Subscription stored for ${conversationId}`);
  },

  unsubscribeFromRealTimeMessages: () => {
    const subscriptions = get().realTimeSubscriptions;
    const unsubscribe = subscriptions.get("messages");
    if (unsubscribe) {
      unsubscribe();
      subscriptions.delete("messages");
      set({ realTimeSubscriptions: subscriptions });
    }
    subscriptions.get("messageReadReceipts")?.();
    subscriptions.delete("messageReadReceipts");
  },

  sendRealTimeMessage: async (
    conversationId: string,
    content: string,
    mediaUrl?: string,
    mediaType?: "TEXT" | "PHOTO" | "VIDEO",
    replyTo?: Message["reply_to"],
  ) => {
    const { user } = useAuthStore.getState();
    if (!user?.id) throw new Error("User not authenticated");

    set({ sendingMessage: true });

    try {
      // Pass recipientId from cached state to avoid rereading the conversation on every send.
      const recipientId =
        get().currentConversation?.other_user?.user_id ??
        get().currentConversation?.other_user?.id;
      const sentMessage = await messagingService.sendMessageWithDelivery(
        conversationId,
        user.id,
        content,
        mediaUrl,
        mediaType,
        recipientId,
        replyTo,
      );
      set((state) => {
        if (state.messages.some((message) => message.id === sentMessage.id)) {
          return state;
        }

        const normalized = normalizeMessage(sentMessage, user.id);
        return {
          messages: [...state.messages, normalized],
        };
      });
      return sentMessage;
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    } finally {
      set({ sendingMessage: false });
    }
  },

  markMessageAsSeen: async (messageId: string) => {
    try {
      const { user } = useAuthStore.getState();
      if (!user?.id) throw new Error("User not authenticated");

      // Pass conversationId from cached state to avoid rereading the message.
      const conversationId = get().currentConversation?.id;
      await messagingService.markMessageAsSeen(
        messageId,
        user.id,
        conversationId,
      );

      set((state) => {
        const targetMessage = state.messages.find((msg) => msg.id === messageId);
        const targetTime = toMillis(
          targetMessage?.created_at ?? targetMessage?.timestamp,
        );
        const nowIso = new Date().toISOString();
        const currentConversation = state.currentConversation;
        const nextCurrentConversation =
          currentConversation && currentConversation.id === conversationId
            ? {
                ...currentConversation,
                unread_count: 0,
                last_seen_by_user: {
                  ...(currentConversation.last_seen_by_user || {}),
                  [user.id]: nowIso,
                },
                last_seen_message_id_by_user: {
                  ...(currentConversation.last_seen_message_id_by_user || {}),
                  [user.id]: messageId,
                },
              }
            : currentConversation;
        const markSeen = (msg: any) => {
          if (!targetMessage || msg.conversation_id !== conversationId) return msg;
          if ((msg.senderId || msg.sender_id) === user.id) return msg;
          const messageTime = toMillis(msg.created_at ?? msg.timestamp);
          if (msg.id !== messageId && (!targetTime || messageTime > targetTime)) {
            return msg;
          }
          return { ...msg, is_seen: true, is_delivered: true };
        };

        return {
          messages: state.messages.map(markSeen),
          conversations: state.conversations.map((conversation) =>
            conversation.id === conversationId
              ? {
                  ...conversation,
                  unread_count: 0,
                  last_seen_by_user: {
                    ...(conversation.last_seen_by_user || {}),
                    [user.id]: nowIso,
                  },
                  last_seen_message_id_by_user: {
                    ...(conversation.last_seen_message_id_by_user || {}),
                    [user.id]: messageId,
                  },
                }
              : conversation,
          ),
          currentConversation: nextCurrentConversation,
        };
      });
    } catch (error) {
      console.error("❌ Error marking message as seen:", error);
    }
  },

  setTypingIndicator: (
    conversationId: string,
    isTyping: boolean,
    speed?: "slow" | "normal" | "fast" | "furious",
  ) => {
    try {
      const { user } = useAuthStore.getState();
      redundantStoreLog("[MessagingStore DEBUG] setTypingIndicator requested:", {
        conversationId,
        isTyping,
        speed: speed || "normal",
        userId: user?.id ?? null,
      });
      liveStoreDebug("typing_action_requested", {
        conversationId,
        isTyping,
        speed: speed || "normal",
        userId: user?.id ?? null,
      });
      if (!user?.id) return;

      void messagingService.setTypingIndicator(
        conversationId,
        user.id,
        isTyping,
        speed,
      ).catch((error) => console.error("Typing indicator failed:", error));
      redundantStoreLog("[MessagingStore DEBUG] setTypingIndicator sent to service:", {
        conversationId,
        isTyping,
        speed: speed || "normal",
        userId: user.id,
      });
      liveStoreDebug("typing_action_sent_to_service", {
        conversationId,
        isTyping,
        speed: speed || "normal",
        userId: user.id,
      });

      if (isTyping) {
        const typingUsers = get().typingUsers.filter(
          (u) =>
            !(u.conversation_id === conversationId && u.user_id === user.id),
        );
        typingUsers.push({
          conversation_id: conversationId,
          user_id: user.id,
          is_typing: true,
          speed: speed || "normal",
          started_at: new Date().toISOString(),
        });
        redundantStoreLog("[MessagingStore DEBUG] setTypingIndicator local add:", {
          conversationId,
          userId: user.id,
          typingUsers,
        });
        set({ typingUsers });
      } else {
        const typingUsers = get().typingUsers.filter(
          (u) =>
            !(u.conversation_id === conversationId && u.user_id === user.id),
        );
        redundantStoreLog("[MessagingStore DEBUG] setTypingIndicator local remove:", {
          conversationId,
          userId: user.id,
          typingUsers,
        });
        set({
          typingUsers,
        });
      }
    } catch (error) {
      console.error("❌ Error setting typing indicator:", error);
    }
  },

  subscribeToOnlineStatus: (userId: string) => {
    const unsubscribe = messagingService.subscribeToFriendsOnlineStatus(
      userId,
      (onlineFriends) => {
        redundantStoreLog(`🟢 Online status update:`, onlineFriends);

        // Update conversations with online status
        const { conversations } = get();
        const updatedConversations = conversations.map((conv) => {
          const isOnline = onlineFriends.includes(
            conv.other_user?.user_id || conv.other_user?.id || "",
          );
          if (conv.is_online !== isOnline) {
            redundantStoreLog(
              `🟢 ${conv.other_user?.username} is now ${isOnline ? "online" : "offline"}`,
            );
          }
          return {
            ...conv,
            is_online: isOnline,
          };
        });
        set({
          onlineFriends,
          conversations: updatedConversations,
        });
      },
    );

    const subscriptions = get().realTimeSubscriptions;
    subscriptions.set("onlineStatus", unsubscribe);
    set({ realTimeSubscriptions: subscriptions });
  },

  unsubscribeFromOnlineStatus: () => {
    const subscriptions = get().realTimeSubscriptions;
    const unsubscribe = subscriptions.get("onlineStatus");
    if (unsubscribe) {
      unsubscribe();
      subscriptions.delete("onlineStatus");
      set({ realTimeSubscriptions: subscriptions });
    }
  },

  setOnlineStatus: (isOnline: boolean) => {
    try {
      const { user } = useAuthStore.getState();
      redundantStoreLog("[MessagingStore DEBUG] setOnlineStatus requested:", {
        userId: user?.id ?? null,
        isOnline,
      });
      if (!user?.id) return;
      messagingService.setOnlineStatus(user.id, isOnline);
      redundantStoreLog("[MessagingStore DEBUG] setOnlineStatus sent to service:", {
        userId: user.id,
        isOnline,
      });
    } catch (error) {
      console.error("❌ Error setting online status:", error);
    }
  },

  subscribeToRealTimeEvents: (conversationId: string) => {
    // Cancel any existing event subscription first
    const existingSub = get().realTimeSubscriptions.get("events");
    if (existingSub) existingSub();

    set((state) => ({
      events:
        state.currentConversation?.id === conversationId ? [] : state.events,
      messageEvents:
        state.currentConversation?.id === conversationId
          ? []
          : state.messageEvents,
    }));

    const currentUserIdForSubscription = useAuthStore.getState().user?.id ?? "";

    const unsubscribe = messagingService.subscribeToEvents(
      conversationId,
      (events) => {
        if (get().currentConversation?.id !== conversationId) {
          return;
        }
        const activeConversation =
          get().currentConversation?.id === conversationId
            ? get().currentConversation
            : get().conversations.find(
                (conversation) => conversation.id === conversationId,
              );
        const filteredEvents = filterItemsAfterClearedAt(
          events,
          activeConversation?.cleared_at,
          (event) => event.created_at,
        );
        const clearingConversationIds = get().clearingConversationIds;
        const isClearingConversation =
          clearingConversationIds.has(conversationId);
        if (isClearingConversation && filteredEvents.length > 0) {
          return;
        }
        const mentionEvents = filteredEvents.filter(
          (e) => e.event_type === "mention",
        );
        if (mentionEvents.length > 0) {
          redundantStoreLog(
            "[@mention store] Received events, mentions:",
            mentionEvents.length,
            mentionEvents,
          );
          redundantStoreLog(
            "[@mention store] Total messageEvents now:",
            filteredEvents.length,
          );
        }
        if (isClearingConversation && filteredEvents.length === 0) {
          const nextClearingConversationIds = new Set(clearingConversationIds);
          nextClearingConversationIds.delete(conversationId);
          set({ clearingConversationIds: nextClearingConversationIds });
        }
        set({ events: filteredEvents, messageEvents: filteredEvents });
      },
      currentUserIdForSubscription || undefined,
      LIVE_MESSAGE_EVENT_LIMIT,
    );

    const subscriptions = get().realTimeSubscriptions;
    subscriptions.set("events", unsubscribe);
    set({ realTimeSubscriptions: subscriptions });
  },

  unsubscribeFromRealTimeEvents: () => {
    const subscriptions = get().realTimeSubscriptions;
    const unsubscribe = subscriptions.get("events");
    if (unsubscribe) {
      unsubscribe();
      subscriptions.delete("events");
      set({ realTimeSubscriptions: subscriptions });
    }
  },

  // ── Typing indicators subscription (listen for OTHER users typing) ──
  subscribeToTypingIndicators: (conversationId: string) => {
    const existingSub = get().realTimeSubscriptions.get("typingIndicators");
    if (existingSub) existingSub();

    const { user } = useAuthStore.getState();
    if (!user?.id) return;

    const unsubscribe = messagingService.subscribeToTypingIndicators(
      conversationId,
      user.id,
      (typingUsers) => {
        redundantStoreLog(`📝 Typing update for ${conversationId}:`, typingUsers);
        liveStoreDebug("typing_subscription_payload", {
          conversationId,
          currentUserId: user.id,
          typingUsers,
        });

        // Update the conversation's typing status
        const { conversations } = get();
        const updatedConversations = conversations.map((conv) => {
          if (conv.id === conversationId) {
            const otherUserTyping = typingUsers.some(
              (t) => t.user_id !== user.id && t.is_typing,
            );
            redundantStoreLog(
              `📝 Setting typing for ${conv.other_user?.username}: ${otherUserTyping}`,
            );
            return { ...conv, is_typing: otherUserTyping };
          }
          return conv;
        });

        // Merge remote typing users with conversation id
        const remoteTyping = typingUsers.map((t) => ({
          conversation_id: conversationId,
          user_id: t.user_id,
          is_typing: t.is_typing,
          speed: t.typing_speed,
          started_at: new Date().toISOString(),
        }));
        // Replace only this conversation's remote typing rows so chat-list
        // typing state for other conversations is preserved.
        const existingTyping = get().typingUsers.filter(
          (u) => u.user_id === user.id || u.conversation_id !== conversationId,
        );
        set({
          conversations: updatedConversations,
          typingUsers: [...existingTyping, ...remoteTyping],
        });
      },
    );

    const subscriptions = get().realTimeSubscriptions;
    subscriptions.set("typingIndicators", unsubscribe);
    set({ realTimeSubscriptions: subscriptions });
  },

  unsubscribeFromTypingIndicators: () => {
    const subscriptions = get().realTimeSubscriptions;
    const unsubscribe = subscriptions.get("typingIndicators");
    if (unsubscribe) {
      unsubscribe();
      subscriptions.delete("typingIndicators");
      set({ realTimeSubscriptions: subscriptions });
    }
  },

  // ── Freeze chat ──
  freezeChat: async (conversationId: string) => {
    const { user } = useAuthStore.getState();
    liveStoreDebug("freeze_action_requested", {
      conversationId,
      userId: user?.id ?? null,
    });
    if (!user?.id) return false;
    const froze = await messagingService.freezeChat(conversationId, user.id);
    if (froze) set({ frozenBy: user.id });
    return froze;
  },

  unfreezeChat: async (conversationId: string) => {
    const { user } = useAuthStore.getState();
    liveStoreDebug("unfreeze_action_requested", {
      conversationId,
      userId: user?.id ?? null,
    });
    if (!user?.id) return false;
    const unfroze = await messagingService.unfreezeChat(conversationId, user.id);
    if (unfroze) set({ frozenBy: null });
    return unfroze;
  },

  subscribeToFreezeStatus: (conversationId: string) => {
    const existingSub = get().realTimeSubscriptions.get("freezeStatus");
    if (existingSub) existingSub();
    set({ frozenBy: null });
    liveStoreDebug("freeze_subscription_start", { conversationId });

    const unsubscribe = messagingService.subscribeToFreezeStatus(
      conversationId,
      ({ is_frozen, frozen_by }) => {
        liveStoreDebug("freeze_subscription_payload", {
          conversationId,
          is_frozen,
          frozen_by,
        });
        set({ frozenBy: is_frozen ? frozen_by : null });
      },
    );

    const subscriptions = get().realTimeSubscriptions;
    subscriptions.set("freezeStatus", unsubscribe);
    set({ realTimeSubscriptions: subscriptions });
  },

  unsubscribeFromFreezeStatus: () => {
    const subscriptions = get().realTimeSubscriptions;
    const unsubscribe = subscriptions.get("freezeStatus");
    if (unsubscribe) {
      unsubscribe();
      subscriptions.delete("freezeStatus");
      set({ realTimeSubscriptions: subscriptions });
    }
  },

  // ── Live draft text (letter-by-letter preview) ──────────────────────────

  setDraftText: (conversationId: string, text: string) => {
    const { user } = useAuthStore.getState();
    liveStoreDebug("draft_action_requested", {
      conversationId,
      userId: user?.id ?? null,
      textLength: text.length,
      textPreview: text.slice(0, 32),
    });
    if (!user?.id) return;
    messagingService.setDraftText(conversationId, user.id, text);
  },

  clearDraftText: (conversationId: string) => {
    const { user } = useAuthStore.getState();
    liveStoreDebug("draft_clear_action_requested", {
      conversationId,
      userId: user?.id ?? null,
    });
    if (!user?.id) return;
    messagingService.clearDraftText(conversationId, user.id);
  },

  subscribeToDraftText: (conversationId: string, friendUserId: string) => {
    const existingSub = get().realTimeSubscriptions.get("draft");
    if (existingSub) existingSub();

    if (!friendUserId) return;
    liveStoreDebug("draft_subscription_start", {
      conversationId,
      friendUserId,
    });

    const unsubscribe = messagingService.subscribeToUserDraftText(
      conversationId,
      friendUserId,
      (draft) => {
        liveStoreDebug("draft_subscription_payload", {
          conversationId,
          friendUserId,
          draft,
        });
        set({ friendDraft: draft?.text ?? null });
      },
    );

    const subscriptions = get().realTimeSubscriptions;
    subscriptions.set("draft", unsubscribe);
    set({ realTimeSubscriptions: subscriptions });
  },

  unsubscribeFromDraftText: () => {
    const subscriptions = get().realTimeSubscriptions;
    const unsubscribe = subscriptions.get("draft");
    if (unsubscribe) {
      unsubscribe();
      subscriptions.delete("draft");
      set({ realTimeSubscriptions: subscriptions, friendDraft: null });
    }
  },

  // Clear chat
  clearMessages: async (conversationId: string) => {
    redundantStoreLog("[clearMessages] Called for conversation:", conversationId);
    const { user } = useAuthStore.getState();
    if (!user?.id) {
      throw new Error("User not authenticated");
    }
    const clearedAt = new Date().toISOString();
    const {
      messages: previousMessages,
      messageEvents: previousMessageEvents,
      events: previousEvents,
      conversations: previousConversations,
      currentConversation: previousCurrentConversation,
      hasMoreMessages: previousHasMoreMessages,
      clearingConversationIds,
    } = get();
    redundantStoreLog(
      "[clearMessages] Current messages count:",
      previousMessages.length,
    );

    const nextClearingConversationIds = new Set(clearingConversationIds);
    nextClearingConversationIds.add(conversationId);

    set({
      messages: previousMessages.filter(
        (message) => message.conversation_id !== conversationId,
      ),
      events: previousEvents.filter(
        (event) => event.conversation_id !== conversationId,
      ),
      messageEvents: previousMessageEvents.filter(
        (event) => event.conversation_id !== conversationId,
      ),
      hasMoreMessages: false,
      loadingOlderMessages: false,
      conversations: previousConversations.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              last_message_content: "",
              last_message_at: "",
              unread_count: 0,
              cleared_at: clearedAt,
            }
          : conversation,
      ),
      currentConversation:
        previousCurrentConversation?.id === conversationId
          ? {
              ...previousCurrentConversation,
              last_message_content: "",
              last_message_at: "",
              unread_count: 0,
              cleared_at: clearedAt,
            }
          : previousCurrentConversation,
      clearingConversationIds: nextClearingConversationIds,
    });
    redundantStoreLog("[clearMessages] Optimistic update - messages cleared");

    try {
      await messagingService.clearMessages(conversationId, user.id, clearedAt);
      setTimeout(() => {
        const activeClearingConversationIds = get().clearingConversationIds;
        if (!activeClearingConversationIds.has(conversationId)) return;

        const nextClearingConversationIds = new Set(
          activeClearingConversationIds,
        );
        nextClearingConversationIds.delete(conversationId);
        set({ clearingConversationIds: nextClearingConversationIds });
      }, 4000);
      redundantStoreLog("[clearMessages] Postgres deletion completed");
    } catch (error) {
      console.error("[clearMessages] Error clearing messages:", error);
      const rollbackClearingConversationIds = new Set(
        get().clearingConversationIds,
      );
      rollbackClearingConversationIds.delete(conversationId);
      set({
        messages: previousMessages,
        events: previousEvents,
        messageEvents: previousMessageEvents,
        hasMoreMessages: previousHasMoreMessages,
        conversations: previousConversations,
        currentConversation: previousCurrentConversation,
        clearingConversationIds: rollbackClearingConversationIds,
      });
      throw error;
    }
  },
}));
